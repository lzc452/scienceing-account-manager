import { DatabaseSync } from 'node:sqlite';
import { defaultDatabasePath, nowIso } from './config';
import { openDatabase } from './connection';
import { MIGRATIONS } from './migrations';

/** 应用所有未执行的 migration，返回本次新应用的迁移数。 */
export function migrate(db: DatabaseSync): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const rows = db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>;
  const applied = new Set(rows.map((row) => row.version));
  let count = 0;
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, nowIso());
      db.exec('COMMIT');
      count += 1;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return count;
}

if (require.main === module) {
  const dbPath = defaultDatabasePath();
  const db = openDatabase(dbPath);
  try {
    const applied = migrate(db);
    console.log(`[migrate] 已应用 ${applied} 个迁移 → ${dbPath}`);
  } finally {
    db.close();
  }
}
