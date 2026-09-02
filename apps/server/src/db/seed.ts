import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { defaultDatabasePath, nowIso } from './config';
import { openDatabase } from './connection';
import { migrate } from './migrate';
import { ACCOUNT_STATUS, DEFAULT_SYSTEM_SETTINGS, USER_ROLE } from './constants';
import { hashPassword } from '../crypto/password';
import { loadMasterKey } from '../crypto/master-key';
import { encryptSecret, serializePayload } from '../crypto/secret-box';

export const SEED_ACCOUNT_CODES = Array.from({ length: 10 }, (_, i) => `KY-${String(i + 1).padStart(2, '0')}`);
export const SEED_PLACEHOLDER_PASSWORD = '__PLACEHOLDER__';
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
}

/** 未显式提供管理员口令时生成强随机口令并打印一次（不落码/不落 Git，PRD §42）。 */
function generateAdminPassword(): string {
  const password = randomBytes(18).toString('base64url');
  console.warn('[seed] 未设置 ADMIN_INITIAL_PASSWORD，已生成随机管理员口令（请立即记录，首登后修改）:');
  console.warn(`[seed]   admin 初始口令 = ${password}`);
  return password;
}

/** 种子数据：admin 用户 + 10 个 KY-01~KY-10 账号（密码占位，pending=null）+ system_settings 默认值。 */
export async function seedDatabase(db: DatabaseSync, options: SeedOptions = {}): Promise<SeedSummary> {
  const masterKey = options.masterKey ?? loadMasterKey();
  const now = nowIso();

  db.exec('BEGIN');
  try {
    let adminCreated = false;
    const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get(DEFAULT_ADMIN_USERNAME);
    if (!existingAdmin) {
      const adminPassword = options.adminPassword ?? process.env.ADMIN_INITIAL_PASSWORD ?? generateAdminPassword();
      const passwordHash = await hashPassword(adminPassword);
      db.prepare(`
        INSERT INTO users (username, display_name, department, password_hash, role, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
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

    db.exec('COMMIT');
    return { adminUsername: DEFAULT_ADMIN_USERNAME, adminCreated, accountsInserted, settingsInserted };
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
