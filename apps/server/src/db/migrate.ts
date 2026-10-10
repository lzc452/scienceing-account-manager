import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { defaultDatabasePath, nowIso } from './config';
import { openDatabase } from './connection';
import { MIGRATIONS, type Migration } from './migrations';
import { assertDatabaseIntegrity, assertSchemaMatches, readSchema, sqlTokens } from './schema';

type HistoryRow = { version: number; name: string; applied_at: string; checksum: string | null };

export function migrationChecksum(migration: Migration): string {
  return createHash('sha256').update(JSON.stringify({
    version: migration.version, name: migration.name, sql: migration.sql,
    foreignKeysOff: migration.foreignKeysOff ?? false,
    preconditions: migration.preconditions ?? [], checks: migration.checks ?? [],
  })).digest('hex');
}

function history(db: DatabaseSync): { exists: boolean; legacy: boolean; rows: HistoryRow[] } {
  const exists = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
  if (!exists) return { exists: false, legacy: false, rows: [] };
  const columns = db.prepare('PRAGMA table_info(schema_migrations)').all() as Array<{ name: string }>;
  const legacy = !columns.some((column) => column.name === 'checksum');
  const rows = db.prepare(`SELECT version, name, applied_at, ${legacy ? 'NULL AS checksum' : 'checksum'}
    FROM schema_migrations ORDER BY version`).all() as HistoryRow[];
  return { exists, legacy, rows };
}

function assertHistory(rows: HistoryRow[], migrations: readonly Migration[], legacy: boolean): void {
  for (const [index, row] of rows.entries()) {
    const registered = migrations[index];
    if (!registered || registered.version !== row.version) throw new Error(`数据库迁移版本未知或登记不连续：${row.version}`);
    if (registered.name !== row.name) throw new Error(`migration ${row.version} 名称不一致`);
    if (!row.applied_at) throw new Error(`migration ${row.version} 缺少执行时间`);
    if (!legacy && migrationChecksum(registered) !== row.checksum) {
      throw new Error(`migration ${row.version} 校验值不一致，禁止修改历史迁移`);
    }
  }
}

/** 生产启动的只读关卡：绝不迁移、补登记或修复结构。 */
export function assertMigrationState(db: DatabaseSync, migrations: readonly Migration[] = MIGRATIONS): void {
  const state = history(db);
  if (!state.exists || state.legacy) throw new Error('数据库尚未完成校验值基线升级，请先停服备份并执行 db:migrate');
  assertHistory(state.rows, migrations, false);
  if (state.rows.length !== migrations.length) throw new Error('存在未应用迁移，请先运行部署流程');
  assertSchemaMatches(db, migrations, migrations.at(-1)?.version ?? 0);
  assertDatabaseIntegrity(db);
}

function assertQueries(db: DatabaseSync, queries: readonly string[] = []): void {
  if (!queries.length) return;
  db.exec('PRAGMA query_only=ON');
  try {
    for (const query of queries) {
      if (!['select', 'with'].includes(sqlTokens(query)[0]?.toLowerCase() ?? '')) throw new Error('迁移检查必须是只读 SELECT 查询');
      if (db.prepare(query).all().length) throw new Error('迁移数据保护检查失败，已中止且保留原数据');
    }
  } finally {
    db.exec('PRAGMA query_only=OFF');
  }
}

/** 事务和登记由执行器独占；识别触发器 BEGIN/END，不能误拒绝其语句块。 */
function assertMigrationSql(migration: Migration): void {
  const tokens = sqlTokens(migration.sql).map((token) => token.toLowerCase());
  let boundary = true;
  let trigger = false;
  let depth = 0;
  for (const [index, token] of tokens.entries()) {
    if (token.replace(/^["`[]|["`\]]$/g, '') === 'schema_migrations') throw new Error('迁移 SQL 禁止改写迁移登记表');
    if (boundary && depth === 0) {
      trigger = token === 'create' && tokens.slice(index + 1, index + 4).includes('trigger');
      if (['begin', 'commit', 'end', 'rollback', 'savepoint', 'release', 'attach', 'detach', 'vacuum', 'pragma'].includes(token)) {
        throw new Error('迁移 SQL 禁止事务控制或 PRAGMA；由执行器保证原子提交');
      }
    }
    if (trigger && ['begin', 'case'].includes(token)) depth += 1;
    if (trigger && token === 'end') depth -= 1;
    boundary = token === ';';
    if (boundary && depth === 0) trigger = false;
  }
}

/** 整批未执行的迁移及登记在同一事务内提交；失败整批回滚。 */
export function migrate(
  db: DatabaseSync,
  migrations: readonly Migration[] = MIGRATIONS,
  options: { baselineVersion?: number } = {},
): number {
  for (const [index, migration] of migrations.entries()) {
    if (migration.version !== index + 1 || !migration.name.trim()) throw new Error('migration 必须从 1 连续递增且具有名称');
    assertMigrationSql(migration);
  }
  const foreignKeys = (db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys;
  if (migrations.some((migration) => migration.foreignKeysOff)) db.exec('PRAGMA foreign_keys=OFF');
  let started = false;
  try {
    db.exec('BEGIN IMMEDIATE');
    started = true;
    const state = history(db);
    assertHistory(state.rows, migrations, state.legacy);
    let version = state.rows.at(-1)?.version ?? 0;
    if (options.baselineVersion !== undefined) {
      if (state.rows.length) throw new Error('已存在迁移登记，禁止重新建立基线');
      version = options.baselineVersion;
      if (!Number.isSafeInteger(version) || version < 1) throw new Error('现有库基线必须明确指定正整数版本');
    } else if (!state.rows.length && readSchema(db).length) {
      throw new Error('现有数据库没有迁移登记，必须先只读检查，再显式 --baseline <版本>；禁止猜测基线');
    }
    assertDatabaseIntegrity(db);
    assertSchemaMatches(db, migrations, version);
    if (!state.exists) {
      db.exec(`CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL, checksum TEXT NOT NULL
      )`);
    } else if (state.legacy) {
      // 只有实际结构匹配原登记版本后，才对当前迁移定义建立校验值基线。
      db.exec('ALTER TABLE schema_migrations ADD COLUMN checksum TEXT');
      for (const row of state.rows) {
        db.prepare('UPDATE schema_migrations SET checksum=? WHERE version=?')
          .run(migrationChecksum(migrations[row.version - 1]!), row.version);
      }
    }
    const record = db.prepare('INSERT INTO schema_migrations(version,name,applied_at,checksum) VALUES (?,?,?,?)');
    if (options.baselineVersion !== undefined) {
      for (const migration of migrations.filter((item) => item.version <= version)) {
        record.run(migration.version, migration.name, nowIso(), migrationChecksum(migration));
      }
    }
    let count = 0;
    for (const migration of migrations.filter((item) => item.version > version)) {
      assertQueries(db, migration.preconditions);
      db.exec(migration.sql);
      assertQueries(db, migration.checks);
      assertSchemaMatches(db, migrations, migration.version);
      record.run(migration.version, migration.name, nowIso(), migrationChecksum(migration));
      count += 1;
    }
    assertDatabaseIntegrity(db);
    db.exec('COMMIT');
    started = false;
    return count;
  } catch (error) {
    if (started) db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec(`PRAGMA foreign_keys=${foreignKeys ? 'ON' : 'OFF'}`);
  }
}

if (require.main === module) {
  try {
    const path = defaultDatabasePath();
    if (process.env.NODE_ENV === 'production' && !existsSync(path) && !process.argv.includes('--initialize')) {
      throw new Error('生产数据库不存在，禁止自动创建；全新空环境须显式 --initialize');
    }
    if (process.env.NODE_ENV === 'production' && existsSync(path) && statSync(path).size < 100 && !process.argv.includes('--initialize')) {
      throw new Error('生产数据库为空或首次导入未完成，禁止自动建库；请保留原旧库并核对导入过程');
    }
    const index = process.argv.indexOf('--baseline');
    const baselineVersion = index >= 0 ? Number(process.argv[index + 1]) : undefined;
    const db = openDatabase(path);
    try {
      console.log(`[migrate] 已应用 ${migrate(db, MIGRATIONS, { baselineVersion })} 个迁移 → ${path}`);
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(`[migrate] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
