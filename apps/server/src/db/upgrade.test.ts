import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { backupSnapshot, createDatabaseBackup, restoreDatabase } from './backup';
import { openDatabase } from './connection';
import { assertMigrationState, migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { inspectDatabase, readSchema, schemaFingerprint } from './schema';
import { DatabaseService } from './database.service';

function oldDatabase(path: string, version: number): DatabaseSync {
  const db = openDatabase(path);
  db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)');
  for (const migration of MIGRATIONS.slice(0, version)) {
    db.exec(migration.sql);
    db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(migration.version, migration.name, '2026-01-01T00:00:00Z');
  }
  db.exec(`
    INSERT INTO users(id,username,display_name,password_hash,created_at,updated_at)
      VALUES(41,'old-user','Old user','synthetic-private-value','2026-01-01','2026-01-01');
    INSERT INTO scienceing_accounts(id,code,username,current_password_ciphertext,created_at,updated_at)
      VALUES(57,'OLD-57','account-user','synthetic-ciphertext','2026-01-01','2026-01-01');
    INSERT INTO leases(id,lease_token_hash,account_id,user_id,started_at,last_activity_at,created_at,updated_at)
      VALUES(81,'synthetic-token',57,41,'2026-01-01','2026-01-01','2026-01-01','2026-01-01');
    INSERT INTO reset_jobs(id,account_id,lease_id,created_at) VALUES(91,57,81,'2026-01-01');
    INSERT INTO audit_logs(id,user_id,account_id,lease_id,action,result,metadata,created_at)
      VALUES(101,41,57,81,'test','ok','synthetic-metadata','2026-01-01');
    INSERT INTO system_settings(key,value) VALUES('custom_setting','preserve-this');
  `);
  if (version >= 2) db.exec("INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES('test-session',41,'2026-01-01','2099-01-01')");
  if (version >= 4) db.exec("INSERT INTO manuals VALUES('test','Old title','Old content',41,'2026-01-01')");
  if (version >= 6) db.exec("INSERT INTO extension_claim_proofs VALUES('proof',41,'extension','1.0','2026-01-01','2099-01-01',NULL)");
  return db;
}

function businessSnapshots(db: DatabaseSync): Array<{ query: string; rows: unknown }> {
  return readSchema(db).filter((row) => row.type === 'table' && row.name !== 'system_settings').map((table) => {
    const columns = db.prepare(`PRAGMA table_info("${table.name}")`).all() as Array<{ name: string }>;
    const query = `SELECT ${columns.map((column) => `"${column.name}"`).join(',')} FROM "${table.name}" ORDER BY 1`;
    return { query, rows: db.prepare(query).all() };
  });
}

for (let version = 1; version <= MIGRATIONS.length; version += 1) {
  test(`旧 v${version} WAL 库副本升级，所有原业务字段与记录保留，原库不变`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'scienceing-upgrade-'));
    const source = oldDatabase(join(root, 'old.db'), version);
    const copyPath = join(root, 'copy.prod.db');
    try {
      const before = businessSnapshots(source);
      await backupSnapshot(source, copyPath);
      const copy = openDatabase(copyPath);
      try {
        assert.equal(migrate(copy), MIGRATIONS.length - version);
        assertMigrationState(copy);
        for (const snapshot of before) assert.deepEqual(copy.prepare(snapshot.query).all(), snapshot.rows);
        assert.equal((copy.prepare("SELECT value FROM system_settings WHERE key='custom_setting'").get() as { value: string }).value, 'preserve-this');
        const history = copy.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
        assert.equal(migrate(copy), 0);
        assert.deepEqual(copy.prepare('SELECT * FROM schema_migrations ORDER BY version').all(), history);
        assert.equal((copy.prepare('SELECT applied_at FROM schema_migrations WHERE version=1').get() as { applied_at: string }).applied_at, '2026-01-01T00:00:00Z');
      } finally {
        copy.close();
      }
      assert.equal((source.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v, version);
      for (const snapshot of before) assert.deepEqual(source.prepare(snapshot.query).all(), snapshot.rows);
      assert.ok(!(source.prepare('PRAGMA table_info(schema_migrations)').all() as Array<{ name: string }>).some((column) => column.name === 'checksum'));
    } finally {
      source.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('旧登记缺列时拒绝补校验值；生产启动不执行迁移或建库', () => {
  const root = mkdtempSync(join(tmpdir(), 'scienceing-start-'));
  const path = join(root, 'test.prod.db');
  const db = oldDatabase(path, 7);
  const saved = { NODE_ENV: process.env.NODE_ENV, DATABASE_PATH: process.env.DATABASE_PATH };
  try {
    db.exec('DROP INDEX idx_sessions_user');
    assert.throws(() => migrate(db), /实际结构/);
    const fingerprint = schemaFingerprint(db);
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_PATH = path;
    assert.throws(() => new DatabaseService(), /校验值基线/);
    assert.equal(schemaFingerprint(db), fingerprint);
    process.env.DATABASE_PATH = join(root, 'missing.prod.db');
    assert.throws(() => new DatabaseService(), /禁止启动时创建/);
    assert.equal(db.prepare('PRAGMA table_info(schema_migrations)').all().length, 3);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('只读结构报告没有业务行，且不同默认常量不得被当作匹配结构', () => {
  const root = mkdtempSync(join(tmpdir(), 'scienceing-inspect-'));
  const path = join(root, 'old.db');
  const db = oldDatabase(path, 7);
  try {
    const before = schemaFingerprint(db);
    const report = inspectDatabase(path);
    assert.equal(report.schemaFingerprint, before);
    assert.ok((report.matchingVersions as number[]).includes(7));
    assert.ok(!JSON.stringify(report).includes('synthetic-private-value'));
    assert.equal(schemaFingerprint(db), before);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
  const literal = openDatabase(':memory:');
  try {
    literal.exec("CREATE TABLE sample(value TEXT DEFAULT 'a  b')");
    assert.throws(() => migrate(literal, [{ version: 1, name: 'default', sql: "CREATE TABLE sample(value TEXT DEFAULT 'a b')" }], { baselineVersion: 1 }), /实际结构/);
  } finally {
    literal.close();
  }
});

test('迁移失败后从 Backup API 快照恢复旧结构、记录与版本', async () => {
  const root = mkdtempSync(join(tmpdir(), 'scienceing-recover-'));
  const path = join(root, 'test.prod.db');
  const old = oldDatabase(path, 4);
  try {
    const before = businessSnapshots(old);
    const fingerprint = schemaFingerprint(old);
    const snapshot = await createDatabaseBackup(old, join(root, 'backups'), 'predeploy');
    const broken = [...MIGRATIONS, { version: 8, name: 'broken', sql: 'ALTER TABLE users ADD COLUMN temporary TEXT; INSERT INTO missing_table VALUES(1)' }];
    assert.throws(() => migrate(old, broken), /missing_table/);
    assert.equal(schemaFingerprint(old), fingerprint);
    assert.equal(old.prepare('PRAGMA table_info(schema_migrations)').all().length, 3);
    old.close();
    const preserved = await restoreDatabase(snapshot.path, path);
    assert.ok(preserved.length > 0);
    const restored = new DatabaseSync(path, { readOnly: true });
    try {
      assert.equal(schemaFingerprint(restored), fingerprint);
      for (const table of before) assert.deepEqual(restored.prepare(table.query).all(), table.rows);
      assert.equal((restored.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v, 4);
    } finally {
      restored.close();
    }
  } finally {
    try { old.close(); } catch { /* 测试恢复前已经关闭 */ }
    rmSync(root, { recursive: true, force: true });
  }
});
