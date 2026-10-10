import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, type Migration } from './migrations';

type SchemaObject = { type: string; name: string; tbl_name: string; sql: string };

/** 忽略排版及标识符引号；保留字符串常量、约束、部分索引和触发器内容。 */
export function sqlTokens(sql: string): string[] {
  const tokens = sql.match(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|[A-Za-z_][A-Za-z_0-9]*|[^\s]/g) ?? [];
  return tokens.filter((token) => !token.startsWith('--') && !token.startsWith('/*'));
}

function canonicalSql(sql: string): string {
  const normalized = sqlTokens(sql).filter((token) => token !== ';')
    .map((token) => token.startsWith("'") ? token
      : /^["`[]/.test(token) ? token.slice(1, -1).toLowerCase() : token.toLowerCase());
  for (let i = normalized.length - 3; i >= 0; i -= 1) {
    if (normalized.slice(i, i + 3).join(' ') === 'if not exists') normalized.splice(i, 3);
  }
  return normalized.join(' ');
}

export function readSchema(db: DatabaseSync): SchemaObject[] {
  return db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master
    WHERE name NOT GLOB 'sqlite_*' AND tbl_name != 'schema_migrations' AND sql IS NOT NULL
    ORDER BY type, name`).all() as SchemaObject[];
}

function canonicalSchema(db: DatabaseSync): SchemaObject[] {
  return readSchema(db).map((row) => ({ ...row, sql: canonicalSql(row.sql) }));
}

export function schemaFingerprint(db: DatabaseSync): string {
  return createHash('sha256').update(JSON.stringify(canonicalSchema(db))).digest('hex');
}

export function schemaDifferences(db: DatabaseSync, migrations: readonly Migration[], version: number): string[] {
  if (version !== 0 && !migrations.some((migration) => migration.version === version)) {
    throw new Error(`未知基线版本：${version}`);
  }
  const expected = new DatabaseSync(':memory:');
  try {
    expected.exec('PRAGMA foreign_keys=OFF');
    for (const migration of migrations) {
      if (migration.version <= version) expected.exec(migration.sql);
    }
    const actualRows = canonicalSchema(db);
    const expectedRows = canonicalSchema(expected);
    const actualMap = new Map(actualRows.map((row) => [`${row.type}:${row.name}`, JSON.stringify(row)]));
    const expectedMap = new Map(expectedRows.map((row) => [`${row.type}:${row.name}`, JSON.stringify(row)]));
    return [...new Set([...expectedMap.keys(), ...actualMap.keys()])]
      .filter((key) => actualMap.get(key) !== expectedMap.get(key));
  } finally {
    expected.close();
  }
}

export function assertSchemaMatches(db: DatabaseSync, migrations: readonly Migration[], version: number): void {
  const differences = schemaDifferences(db, migrations, version);
  if (differences.length) {
    throw new Error(`实际结构与迁移版本 ${version} 不匹配：${differences.join(', ')}。禁止自动补结构或建立基线。`);
  }
}

export function assertDatabaseIntegrity(db: DatabaseSync): void {
  const rows = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
  if (rows.length !== 1 || rows[0]?.integrity_check !== 'ok') {
    throw new Error(`SQLite integrity_check 失败：${rows.map((row) => row.integrity_check).join('; ')}`);
  }
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  if (violations.length) throw new Error(`SQLite foreign_key_check 失败：${violations.length} 个外键违规`);
}

/** 只输出结构、版本登记和指纹，不输出任何业务行。 */
export function inspectDatabase(path: string): Record<string, unknown> {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON; BEGIN');
    assertDatabaseIntegrity(db);
    const hasHistory = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
    const columns = hasHistory ? db.prepare('PRAGMA table_info(schema_migrations)').all() as Array<{ name: string }> : [];
    const checksumColumn = columns.some((column) => column.name === 'checksum') ? 'checksum' : 'NULL AS checksum';
    const history = hasHistory
      ? db.prepare(`SELECT version, name, applied_at, ${checksumColumn} FROM schema_migrations ORDER BY version`).all()
      : [];
    return {
      database: resolve(path), integrity_check: 'ok', foreign_key_check: 'ok',
      schemaFingerprint: schemaFingerprint(db), schema: readSchema(db), history,
      matchingVersions: [0, ...MIGRATIONS.map((migration) => migration.version)]
        .filter((version) => schemaDifferences(db, MIGRATIONS, version).length === 0),
    };
  } finally {
    db.close();
  }
}

if (require.main === module) {
  try {
    const index = process.argv.indexOf('--database');
    const path = index >= 0 ? process.argv[index + 1] : undefined;
    if (!path) throw new Error('用法：node schema.js --database <现有数据库绝对路径>（只读）');
    console.log(JSON.stringify(inspectDatabase(path), null, 2));
  } catch (error) {
    console.error(`[db:inspect] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
