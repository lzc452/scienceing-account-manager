import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from './connection';
import { migrate } from './migrate';
import { CURRENT_SCHEMA_VERSION, type Migration } from './migrations';

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
    const count = db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as { count: number };
    assert.equal(count.count, 0);
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
