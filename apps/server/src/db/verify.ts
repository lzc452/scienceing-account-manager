import { DatabaseSync } from 'node:sqlite';
import { loadMasterKey } from '../crypto/master-key';
import { defaultDatabasePath } from './config';
import { CURRENT_SCHEMA_VERSION } from './migrations';
import { assertPasswordsReadable } from './seed';

export function verifyProductionDatabase(path = defaultDatabasePath()): number {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const check = db.prepare('PRAGMA quick_check').get() as { quick_check: string } | undefined;
    if (check?.quick_check !== 'ok') throw new Error(`SQLite quick_check 失败：${check?.quick_check ?? '无结果'}`);
    const row = db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as {
      version: number;
    };
    if (row.version !== CURRENT_SCHEMA_VERSION) {
      throw new Error(`schemaVersion 不一致：数据库=${row.version}，程序=${CURRENT_SCHEMA_VERSION}`);
    }
    assertPasswordsReadable(db, loadMasterKey());
    return row.version;
  } finally {
    db.close();
  }
}

if (require.main === module) {
  try {
    const version = verifyProductionDatabase();
    console.log(JSON.stringify({ ok: true, schemaVersion: version, database: defaultDatabasePath() }));
  } catch (error) {
    console.error(`[db:verify] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
