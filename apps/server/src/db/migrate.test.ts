import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from './connection';
import { assertMigrationState, migrate, migrationChecksum } from './migrate';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, type Migration } from './migrations';

test('已发布 001–007 迁移定义保持不变，只能追加新版本', () => {
  assert.deepEqual(MIGRATIONS.slice(0, 7).map(migrationChecksum), [
    '7a29fad0ec40702a5749ee0ea2e733eba80000a2e6cb9cd3e54e620972704874',
    '75b560f87b42a5e0ca5414f9c4130b1849dd2e1fd39676c24802782dc571296d',
    '0e6804e21ee64823e96cf8044ab7c5968147b3718008f32e4dc82bd5bc299ab6',
    'cfd637aee8de57a60d6c6fcadc7df4c4ff46a348d4a30435b86a7aa1cafac0a4',
    'e4264d5cfb743f48f48780d6e3a9a616d54882e53ce4929d14d23438d2a7d6f7',
    '37dbaf7df1fb6e234bfc9e3131cc4549f4cfddf9253fb78c0648f386590af62e',
    '2c9ed19d35a3dba0461188ddc89f00b846e45341e7d35f19d440e8b8ee4696fd',
  ]);
});

test('SQL 不能绕过事务，检查只能读；触发器语句块可以正常迁移', () => {
  const db = openDatabase(':memory:');
  try {
    for (const sql of ['CREATE TABLE sample(id); COMMIT;', 'END;', 'PRAGMA foreign_keys=OFF;', 'CREATE TABLE schema_migrations(id);']) {
      assert.throws(() => migrate(db, [{ version: 1, name: 'escape', sql }]), /禁止/);
      assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='sample'").get(), undefined);
    }
    const migration: Migration = { version: 1, name: 'trigger', sql: `CREATE TABLE sample(id INTEGER);
      CREATE TRIGGER validate_sample BEFORE INSERT ON sample BEGIN
        SELECT CASE WHEN NEW.id<1 THEN RAISE(ABORT,'id must be positive') END;
      END;` };
    migrate(db, [migration]);
    assert.throws(() => db.exec('INSERT INTO sample VALUES(0)'), /positive/);
    const badCheck = { version: 2, name: 'bad-check', sql: 'ALTER TABLE sample ADD COLUMN value TEXT;', checks: ['DELETE FROM sample'] };
    assert.throws(() => migrate(db, [migration, badCheck]), /只读 SELECT/);
    assertMigrationState(db, [migration]);
  } finally { db.close(); }
});

test('migration 只执行一次并记录当前 schemaVersion', () => {
  const db = openDatabase(':memory:');
  try {
    assert.equal(migrate(db), CURRENT_SCHEMA_VERSION);
    assert.equal(migrate(db), 0);
    const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number };
    assert.equal(row.version, CURRENT_SCHEMA_VERSION);
  } finally {
    db.close();
  }
});

test('单个 migration 失败时回滚 SQL 和登记记录', () => {
  const db = openDatabase(':memory:');
  const broken: Migration[] = [{
    version: 1,
    name: 'broken',
    sql: 'CREATE TABLE should_rollback(id INTEGER); INSERT INTO missing_table VALUES (1);',
  }];
  try {
    assert.throws(() => migrate(db, broken), /missing_table/);
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='should_rollback'").get();
    assert.equal(table, undefined);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='schema_migrations'").get(), undefined);
  } finally {
    db.close();
  }
});

test('历史 SQL 校验值变更、登记缺口和结构漂移均阻断迁移', () => {
  const db = openDatabase(':memory:');
  const original: Migration[] = [{ version: 1, name: 'original', sql: 'CREATE TABLE sample(id INTEGER);' }];
  try {
    migrate(db, original);
    const row = db.prepare('SELECT checksum,applied_at FROM schema_migrations').get() as { checksum: string; applied_at: string };
    assert.equal(row.checksum, migrationChecksum(original[0]!));
    assert.ok(row.applied_at);
    assert.throws(() => migrate(db, [{ ...original[0]!, sql: 'CREATE TABLE sample(id TEXT);' }]), /校验值/);
    db.exec('ALTER TABLE sample ADD COLUMN unexpected TEXT');
    assert.throws(() => migrate(db, original), /实际结构/);
    assert.throws(() => assertMigrationState(db, original), /实际结构/);
    db.exec('UPDATE schema_migrations SET version=2');
    assert.throws(() => migrate(db, original), /未知或登记不连续/);
  } finally {
    db.close();
  }
});

test('无登记的现有库必须显式指定匹配的基线', () => {
  const db = openDatabase(':memory:');
  const migrations: Migration[] = [{ version: 1, name: 'original', sql: 'CREATE TABLE sample(id INTEGER);' }];
  try {
    db.exec('CREATE TABLE sample(id INTEGER); INSERT INTO sample VALUES(42);');
    assert.throws(() => migrate(db, migrations), /显式 --baseline/);
    assert.throws(() => migrate(db, migrations, { baselineVersion: 2 }), /未知基线/);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='schema_migrations'").get(), undefined);
    assert.equal(migrate(db, migrations, { baselineVersion: 1 }), 0);
    assert.equal((db.prepare('SELECT id FROM sample').get() as { id: number }).id, 42);
    assertMigrationState(db, migrations);
    assert.equal(migrate(db, migrations), 0);
    assert.throws(() => migrate(db, migrations, { baselineVersion: 1 }), /禁止重新建立基线/);
  } finally {
    db.close();
  }
});

test('整批迁移失败回滚前面成功的 SQL、数据与登记', () => {
  const db = openDatabase(':memory:');
  const first: Migration = { version: 1, name: 'original', sql: 'CREATE TABLE sample(id INTEGER);' };
  try {
    migrate(db, [first]);
    db.exec('INSERT INTO sample VALUES(42)');
    const next = [first,
      { version: 2, name: 'good', sql: 'CREATE TABLE new_table(id INTEGER); UPDATE sample SET id=99;' },
      { version: 3, name: 'broken', sql: 'INSERT INTO missing_table VALUES(1);' },
    ];
    assert.throws(() => migrate(db, next), /missing_table/);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='new_table'").get(), undefined);
    assert.equal((db.prepare('SELECT id FROM sample').get() as { id: number }).id, 42);
    assert.equal((db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v, 1);
  } finally {
    db.close();
  }
});

test('换表保护删除字段、类型转换、非空约束、主键及关联数据', () => {
  const first: Migration = { version: 1, name: 'old', sql: `
    CREATE TABLE items(id INTEGER PRIMARY KEY, amount TEXT, note TEXT);
    CREATE TABLE links(id INTEGER PRIMARY KEY, item_id INTEGER REFERENCES items(id));
  ` };
  const rebuild: Migration = { version: 2, name: 'rebuild', foreignKeysOff: true,
    preconditions: ["SELECT id FROM items WHERE amount IS NULL OR amount='' OR amount GLOB '*[^0-9]*'"],
    sql: `CREATE TABLE items_archive AS SELECT * FROM items;
      CREATE TABLE items_new(id INTEGER PRIMARY KEY, amount INTEGER NOT NULL CHECK(amount>0));
      INSERT INTO items_new(id,amount) SELECT id,CAST(amount AS INTEGER) FROM items;
      DROP TABLE items; ALTER TABLE items_new RENAME TO items;
      CREATE INDEX idx_items_amount ON items(amount);`,
    checks: ['SELECT id FROM items_archive EXCEPT SELECT id FROM items'],
  };
  for (const amount of ['12', 'invalid', null, '0']) {
    const db = openDatabase(':memory:');
    try {
      migrate(db, [first]);
      db.prepare('INSERT INTO items VALUES(42,?,?)').run(amount, 'archived note');
      db.exec('INSERT INTO links VALUES(1,42)');
      if (amount === '12') {
        assert.equal(migrate(db, [first, rebuild]), 1);
        assert.equal((db.prepare('SELECT amount FROM items').get() as { amount: number }).amount, 12);
        assert.equal((db.prepare('SELECT note FROM items_archive').get() as { note: string }).note, 'archived note');
        assertMigrationState(db, [first, rebuild]);
      } else {
        assert.throws(() => migrate(db, [first, rebuild]), /数据保护|CHECK constraint/);
        assert.equal((db.prepare('SELECT amount FROM items').get() as { amount: string | null }).amount, amount);
        assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='items_archive'").get(), undefined);
      }
      assert.equal((db.prepare('SELECT item_id FROM links').get() as { item_id: number }).item_id, 42);
      assert.equal((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys, 1);
    } finally {
      db.close();
    }
  }
});

test('关闭外键换表也必须在提交前检查违规并回滚', () => {
  const db = openDatabase(':memory:');
  const first: Migration = { version: 1, name: 'old', sql: `
    CREATE TABLE parent(id INTEGER PRIMARY KEY);
    CREATE TABLE child(id INTEGER REFERENCES parent(id));` };
  try {
    migrate(db, [first]);
    db.exec('INSERT INTO parent VALUES(1); INSERT INTO child VALUES(1)');
    assert.throws(() => migrate(db, [first,
      { version: 2, name: 'bad-delete', sql: 'DELETE FROM parent;', foreignKeysOff: true },
    ]), /foreign_key_check/);
    assert.equal((db.prepare('SELECT id FROM parent').get() as { id: number }).id, 1);
    assertMigrationState(db, [first]);
  } finally {
    db.close();
  }
});

test('已登记 migration 名称被改写时拒绝继续', () => {
  const db = openDatabase(':memory:');
  const original: Migration[] = [{ version: 1, name: 'original', sql: 'CREATE TABLE sample(id INTEGER);' }];
  try {
    migrate(db, original);
    assert.throws(() => migrate(db, [{ version: 1, name: 'renamed', sql: original[0]!.sql }]), /名称不一致/);
  } finally {
    db.close();
  }
});
