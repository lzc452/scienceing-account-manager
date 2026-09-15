/**
 * 账号密码密文格式迁移：v1（未绑定 AAD）→ v2（以 account.id 作 AAD）。
 *
 * 为什么需要单独一步：
 *   v2 把 account.id 算进了 GCM 认证标签，因此**存量 v1 密文在 v2 路径下解密必然失败**。
 *   为支持平滑升级，decryptSecret 保留了对 v1 的读取（迁移期间两种格式都能读），
 *   本脚本负责把存量 v1 密文「读旧 → 用 v2 重加密 → 写回」。
 *   跑完之后 v1 兼容分支即可移除。
 *
 * 安全前提：本脚本会**修改生产库**，因此默认先做一次备份（--no-backup 可跳过，不推荐）。
 * 幂等：已经是 v2 的载荷会被跳过，重复执行安全。
 *
 * 用法：
 *   node dist/db/reencrypt-account-passwords.js --dry-run     # 只统计，不写库
 *   node dist/db/reencrypt-account-passwords.js               # 备份后执行
 *   node dist/db/reencrypt-account-passwords.js --database <abs> --no-backup
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { createDatabaseBackup } from './backup';
import { defaultBackupDirectory, defaultDatabasePath } from './config';
import { openDatabase } from './connection';
import { loadMasterKey } from '../crypto/master-key';
import {
  accountAad,
  decryptSecret,
  encryptSecret,
  needsAadMigration,
  parsePayload,
  serializePayload,
  type EncryptedPayload,
} from '../crypto/secret-box';

/**
 * 需要迁移的列。**白名单常量**——列名会被拼进 SQL，只允许来自这里，
 * 不接受任何外部输入，避免 SQL 注入面。
 */
const TARGET_COLUMNS = ['current_password_ciphertext', 'pending_password_ciphertext'] as const;
type TargetColumn = (typeof TARGET_COLUMNS)[number];

interface AccountRow {
  id: number;
  code: string;
  current_password_ciphertext: string | null;
  pending_password_ciphertext: string | null;
}

export interface ReencryptSummary {
  /** 扫描到的账号数 */
  scanned: number;
  /** 本次迁移的密文条数 */
  migrated: number;
  /** 已是 v2、无需处理的条数 */
  alreadyCurrent: number;
  /** 无法处理（解析失败 / 解不开），必须人工介入 */
  failed: Array<{ code: string; column: string; reason: string }>;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 执行迁移。`dryRun = true` 时只统计、不写库。
 *
 * 解不开的密文**只记录不覆盖**：那通常意味着主密钥不对，静默用新格式覆盖会把
 * 唯一还能恢复的原始密文毁掉。
 */
export function reencryptAccountPasswords(
  db: DatabaseSync,
  masterKey: Buffer,
  dryRun = false,
): ReencryptSummary {
  const rows = db
    .prepare(
      `SELECT id, code, current_password_ciphertext, pending_password_ciphertext
       FROM scienceing_accounts ORDER BY id`,
    )
    .all() as unknown as AccountRow[];

  const summary: ReencryptSummary = {
    scanned: rows.length,
    migrated: 0,
    alreadyCurrent: 0,
    failed: [],
  };
  const updates: Array<{ column: TargetColumn; value: string; id: number }> = [];

  for (const row of rows) {
    for (const column of TARGET_COLUMNS) {
      const stored = row[column];
      if (!stored) continue;

      let payload: EncryptedPayload;
      try {
        payload = parsePayload(stored);
      } catch (err) {
        summary.failed.push({ code: row.code, column, reason: `载荷无法解析：${message(err)}` });
        continue;
      }

      if (!needsAadMigration(payload)) {
        summary.alreadyCurrent += 1;
        continue;
      }

      try {
        // 历史格式解密（不带 AAD）→ 以 account.id 作 AAD 重加密
        const plaintext = decryptSecret(payload, masterKey);
        updates.push({
          column,
          value: serializePayload(encryptSecret(plaintext, masterKey, accountAad(row.id))),
          id: row.id,
        });
        summary.migrated += 1;
      } catch (err) {
        summary.failed.push({ code: row.code, column, reason: `解密失败：${message(err)}` });
      }
    }
  }

  if (!dryRun && updates.length > 0) {
    const now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const update of updates) {
        db.prepare(`UPDATE scienceing_accounts SET ${update.column} = ?, updated_at = ? WHERE id = ?`)
          .run(update.value, now, update.id);
      }
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* 已回滚 */
      }
      throw err;
    }
  }

  return summary;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  const withBackup = !process.argv.includes('--no-backup');
  const database = resolve(argument('database') ?? defaultDatabasePath());
  if (!existsSync(database)) throw new Error(`数据库不存在：${database}`);

  const db = openDatabase(database);
  try {
    if (!dryRun && withBackup) {
      const directory = resolve(argument('directory') ?? defaultBackupDirectory());
      const backup = createDatabaseBackup(db, directory, 'pre-aad-migration');
      console.log(`[reencrypt] 迁移前备份：${backup.path}`);
    }
    const summary = reencryptAccountPasswords(db, loadMasterKey(), dryRun);
    console.log(JSON.stringify({ ok: summary.failed.length === 0, dryRun, database, ...summary }, null, 2));
    if (summary.failed.length > 0) {
      console.error('[reencrypt] 存在无法迁移的密文，请先确认 SCIENCEING_MASTER_KEY 是否正确（原始密文未被改动）。');
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[reencrypt] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
