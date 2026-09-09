import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  backupIsStale,
  createDatabaseBackup,
  importDatabase,
  pruneBackups,
  restoreDatabase,
} from './backup';
import { openDatabase } from './connection';
import { millisecondsUntilNextTwoAm } from './backup-scheduler.service';

test('在线 WAL 数据库快照包含尚未 checkpoint 的数据', () => {
  const root = mkdtempSync(join(tmpdir(), 'scienceing-backup-'));
  const source = join(root, 'legacy.db');
  const target = join(root, 'scienceing.prod.db');
  const db = openDatabase(source);
  try {
    db.exec('PRAGMA wal_autocheckpoint=0; CREATE TABLE values_table(value TEXT);');
    db.prepare('INSERT INTO values_table(value) VALUES (?)').run('from-wal');
    importDatabase(source, target);
    const imported = new DatabaseSync(target, { readOnly: true });
    try {
      assert.equal((imported.prepare('SELECT value FROM values_table').get() as { value: string }).value, 'from-wal');
    } finally {
      imported.close();
    }
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('备份保留 30 天且可恢复为一致数据库', () => {
  const root = mkdtempSync(join(tmpdir(), 'scienceing-restore-'));
  const backups = join(root, 'backups');
  const target = join(root, 'scienceing.prod.db');
  const db = openDatabase(target);
  try {
    db.exec('CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES (\'before\');');
    const backup = createDatabaseBackup(db, backups, 'predeploy', new Date('2026-09-08T01:00:00Z'));
    db.exec("UPDATE sample SET value='after'");
    db.close();
    restoreDatabase(backup.path, target, new Date('2026-09-08T02:00:00Z'));
    const restored = new DatabaseSync(target, { readOnly: true });
    try {
      assert.equal((restored.prepare('SELECT value FROM sample').get() as { value: string }).value, 'before');
    } finally {
      restored.close();
    }

    const reopened = openDatabase(target);
    const old = createDatabaseBackup(reopened, backups, 'daily', new Date('2026-08-01T00:00:00Z')).path;
    reopened.close();
    const oldTime = new Date('2026-08-01T00:00:00Z');
    utimesSync(old, oldTime, oldTime);
    assert.deepEqual(pruneBackups(backups, new Date('2026-09-08T00:00:00Z').getTime()), [old]);
    assert.ok(statSync(backup.path).isFile());
    assert.equal(backupIsStale(backups, new Date('2026-09-08T02:00:00Z').getTime()), false);
  } finally {
    try { db.close(); } catch { /* 已在测试中关闭 */ }
    rmSync(root, { recursive: true, force: true });
  }
});

test('每日 02:00 调度跨越当天边界', () => {
  assert.equal(millisecondsUntilNextTwoAm(new Date(2026, 8, 8, 1, 30)), 30 * 60 * 1000);
  assert.equal(millisecondsUntilNextTwoAm(new Date(2026, 8, 8, 2, 0)), 24 * 60 * 60 * 1000);
});
