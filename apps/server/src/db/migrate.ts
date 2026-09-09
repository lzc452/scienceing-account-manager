import { DatabaseSync } from 'node:sqlite';
import { defaultDatabasePath, nowIso } from './config';
import { openDatabase } from './connection';
import { MIGRATIONS, type Migration } from './migrations';

/** 应用所有未执行的 migration，返回本次新应用的迁移数。 */
export function migrate(db: DatabaseSync, migrations: readonly Migration[] = MIGRATIONS): number {
  const seen = new Set<number>();
  let previous = 0;
  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.version) || migration.version <= previous || seen.has(migration.version)) {
      throw new Error(`migration version 必须为严格递增的正整数：${migration.version}`);
    }
    if (!migration.name.trim()) throw new Error(`migration ${migration.version} 缺少 name`);
    seen.add(migration.version);
    previous = migration.version;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const rows = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all() as Array<{
    version: number;
    name: string;
  }>;
  const registry = new Map(migrations.map((migration) => [migration.version, migration]));
  for (const row of rows) {
    const registered = registry.get(row.version);
    if (!registered) throw new Error(`数据库含未知 migration version：${row.version}`);
    if (registered.name !== row.name) {
      throw new Error(`migration ${row.version} 名称不一致：数据库=${row.name}，代码=${registered.name}`);
    }
  }
  const applied = new Set(rows.map((row) => row.version));
  let count = 0;
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, nowIso());
      db.exec('COMMIT');
      count += 1;
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* SQLite 已结束事务时无需再次回滚 */ }
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
