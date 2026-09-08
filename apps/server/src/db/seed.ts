import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { defaultDatabasePath, nowIso } from './config';
import { openDatabase } from './connection';
import { migrate } from './migrate';
import { ACCOUNT_STATUS, DEFAULT_SYSTEM_SETTINGS, PLACEHOLDER_ACCOUNT_PASSWORD, USER_ROLE } from './constants';
import {
  MANUAL_DEFAULT_CONTENT,
  MANUAL_DEFAULT_SLUG,
  MANUAL_DEFAULT_TITLE,
} from '../modules/manual/manual-default';
import { hashPassword } from '../crypto/password';
import { loadMasterKey } from '../crypto/master-key';
import { encryptSecret, parsePayload, decryptSecret, serializePayload } from '../crypto/secret-box';

export const SEED_ACCOUNT_CODES = Array.from({ length: 10 }, (_, i) => `KY-${String(i + 1).padStart(2, '0')}`);
/** @deprecated 统一使用 db/constants 的 PLACEHOLDER_ACCOUNT_PASSWORD，此处仅保留兼容别名。 */
export const SEED_PLACEHOLDER_PASSWORD = PLACEHOLDER_ACCOUNT_PASSWORD;
export const DEFAULT_ADMIN_USERNAME = 'admin';

export interface SeedOptions {
  adminPassword?: string;
  masterKey?: Buffer;
}

export interface SeedSummary {
  adminUsername: string;
  adminCreated: boolean;
  accountsInserted: number;
  settingsInserted: number;
  manualsInserted: number;
}

/** 未显式提供管理员口令时生成强随机口令并打印一次（不落码/不落 Git，PRD §42）。 */
function generateAdminPassword(): string {
  const password = randomBytes(18).toString('base64url');
  console.warn('[seed] 未设置 ADMIN_INITIAL_PASSWORD，已生成随机管理员口令（请立即记录，首登后修改）:');
  console.warn(`[seed]   admin 初始口令 = ${password}`);
  return password;
}

/**
 * 启动前验证已有账号密文与当前主密钥匹配。
 *
 * 密文不可读通常意味着 SCIENCEING_MASTER_KEY 配置错误。此时必须失败退出并保留原始
 * 密文，不能用占位密码“修复”，否则恢复正确密钥后也无法找回真实密码。
 */
function assertPasswordsReadable(db: DatabaseSync, masterKey: Buffer): void {
  const rows = db
    .prepare('SELECT id, code, current_password_ciphertext FROM scienceing_accounts')
    .all() as Array<{ id: number; code: string; current_password_ciphertext: string | null }>;
  const unreadableCodes: string[] = [];
  for (const row of rows) {
    if (!row.current_password_ciphertext) continue;
    try {
      decryptSecret(parsePayload(row.current_password_ciphertext), masterKey);
    } catch {
      unreadableCodes.push(row.code);
    }
  }
  if (unreadableCodes.length > 0) {
    throw new Error(
      `[seed] ${unreadableCodes.length} 个账号密文无法用当前主密钥解密（${unreadableCodes.join(', ')}）。`
      + '已保留原始密文，请恢复创建这些密文时使用的 SCIENCEING_MASTER_KEY。',
    );
  }
}

/** 种子数据：admin 用户 + 10 个 KY-01~KY-10 账号（密码占位，pending=null）+ system_settings 默认值。 */
export async function seedDatabase(db: DatabaseSync, options: SeedOptions = {}): Promise<SeedSummary> {
  const masterKey = options.masterKey ?? loadMasterKey();
  const now = nowIso();

  // 必须先于任何种子写入执行，密钥错误时保证数据库零改动。
  assertPasswordsReadable(db, masterKey);

  db.exec('BEGIN');
  try {
    let adminCreated = false;
    const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get(DEFAULT_ADMIN_USERNAME);
    if (!existingAdmin) {
      const adminPassword = options.adminPassword ?? process.env.ADMIN_INITIAL_PASSWORD ?? generateAdminPassword();
      const passwordHash = await hashPassword(adminPassword);
      db.prepare(`
        INSERT INTO users
          (username, display_name, department, password_hash, role, enabled, must_change_password, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)
      `).run(DEFAULT_ADMIN_USERNAME, '管理员', 'IT', passwordHash, USER_ROLE.ADMIN, now, now);
      adminCreated = true;
    }

    let accountsInserted = 0;
    for (const code of SEED_ACCOUNT_CODES) {
      const existing = db.prepare('SELECT id FROM scienceing_accounts WHERE code = ?').get(code);
      if (existing) continue;
      const ciphertext = serializePayload(encryptSecret(SEED_PLACEHOLDER_PASSWORD, masterKey));
      db.prepare(`
        INSERT INTO scienceing_accounts
          (code, username, current_password_ciphertext, pending_password_ciphertext, status, last_password_changed_at, enabled, created_at, updated_at)
        VALUES (?, ?, ?, NULL, ?, ?, 1, ?, ?)
      `).run(code, code.toLowerCase(), ciphertext, ACCOUNT_STATUS.AVAILABLE, now, now, now);
      accountsInserted += 1;
    }

    let settingsInserted = 0;
    for (const [key, value] of Object.entries(DEFAULT_SYSTEM_SETTINGS)) {
      const result = db.prepare('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)').run(key, value);
      settingsInserted += Number(result.changes);
    }

    // 使用手册默认内容（t13）：已存在时不覆盖，管理员的修改优先
    let manualsInserted = 0;
    {
      const result = db
        .prepare(
          `INSERT OR IGNORE INTO manuals (slug, title, content, updated_by, updated_at)
           VALUES (?, ?, ?, NULL, ?)`,
        )
        .run(MANUAL_DEFAULT_SLUG, MANUAL_DEFAULT_TITLE, MANUAL_DEFAULT_CONTENT, now);
      manualsInserted = Number(result.changes);
    }

    db.exec('COMMIT');
    return {
      adminUsername: DEFAULT_ADMIN_USERNAME,
      adminCreated,
      accountsInserted,
      settingsInserted,
      manualsInserted,
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

async function main(): Promise<void> {
  const dbPath = defaultDatabasePath();
  const db = openDatabase(dbPath);
  try {
    migrate(db);
    const summary = await seedDatabase(db);
    const adminCount = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
    const accountCount = (db.prepare('SELECT COUNT(*) AS c FROM scienceing_accounts').get() as { c: number }).c;
    const accounts = db.prepare('SELECT code, status FROM scienceing_accounts ORDER BY code').all() as Array<{
      code: string;
      status: string;
    }>;
    console.log('[seed] 完成:');
    console.log(`  admin 用户: ${adminCount}（${summary.adminUsername}，新建=${summary.adminCreated}）`);
    console.log(`  科应账号: ${accountCount}（本次插入 ${summary.accountsInserted}）`);
    console.log(`  system_settings: ${summary.settingsInserted} 条`);
    console.log(`  manuals: ${summary.manualsInserted} 条`);
    console.log(`  账号样本: ${accounts.map((a) => `${a.code}:${a.status}`).join(' ')}`);
    console.log(`  密码占位: ${SEED_PLACEHOLDER_PASSWORD}（pending=null）`);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('[seed] 失败:', err);
    process.exit(1);
  });
}
