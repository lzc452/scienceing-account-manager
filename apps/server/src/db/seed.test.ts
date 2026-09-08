import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from './connection';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { seedDatabase } from './seed';
import { decryptSecret, encryptSecret, parsePayload, serializePayload } from '../crypto/secret-box';

function readLeaseRuleSettings(db: ReturnType<typeof openDatabase>): Record<string, string> {
  const rows = db
    .prepare("SELECT key, value FROM system_settings WHERE key LIKE '%_hours' ORDER BY key")
    .all() as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

test('新数据库使用 24/2/1 小时租约规则默认值', () => {
  const db = openDatabase(':memory:');

  try {
    migrate(db);
    assert.deepEqual(readLeaseRuleSettings(db), {
      critical_warning_hours: '1',
      inactivity_timeout_hours: '24',
      warning_hours: '2',
    });
  } finally {
    db.close();
  }
});

test('租约规则小时迁移保留自定义时长并清理旧单位键', () => {
  const db = openDatabase(':memory:');
  const migration = MIGRATIONS.find((item) => item.name === 'settings_lease_rule_hours');
  assert.ok(migration);

  try {
    db.exec(`
      CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO system_settings (key, value) VALUES
        ('inactivity_timeout_minutes', '90'),
        ('warning_seconds', '7201'),
        ('critical_warning_seconds', '1');
    `);

    db.exec(migration.sql);

    assert.deepEqual(readLeaseRuleSettings(db), {
      critical_warning_hours: '1',
      inactivity_timeout_hours: '2',
      warning_hours: '3',
    });
    const legacyCount = db
      .prepare(
        "SELECT COUNT(*) AS count FROM system_settings WHERE key IN ('inactivity_timeout_minutes','warning_seconds','critical_warning_seconds')",
      )
      .get() as { count: number };
    assert.equal(legacyCount.count, 0);
  } finally {
    db.close();
  }
});

test('租约规则小时迁移将旧默认值升级为新的 24/2/1 默认值', () => {
  const db = openDatabase(':memory:');
  const migration = MIGRATIONS.find((item) => item.name === 'settings_lease_rule_hours');
  assert.ok(migration);

  try {
    db.exec(`
      CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO system_settings (key, value) VALUES
        ('inactivity_timeout_minutes', '30'),
        ('warning_seconds', '300'),
        ('critical_warning_seconds', '60');
    `);

    db.exec(migration.sql);

    assert.deepEqual(readLeaseRuleSettings(db), {
      critical_warning_hours: '1',
      inactivity_timeout_hours: '24',
      warning_hours: '2',
    });
  } finally {
    db.close();
  }
});

test('seed 遇到无法解密的账号密码时保留原密文并失败退出', async () => {
  const db = openDatabase(':memory:');
  const originalKey = Buffer.alloc(32, 1);
  const wrongKey = Buffer.alloc(32, 2);

  try {
    migrate(db);
    await seedDatabase(db, { adminPassword: 'admin-test-password', masterKey: originalKey });

    const originalCiphertext = serializePayload(encryptSecret('real-account-password', originalKey));
    db.prepare("UPDATE scienceing_accounts SET current_password_ciphertext = ? WHERE code = 'KY-01'").run(
      originalCiphertext,
    );

    await assert.rejects(
      seedDatabase(db, { adminPassword: 'admin-test-password', masterKey: wrongKey }),
      /密文无法用当前主密钥解密/,
    );

    const row = db
      .prepare("SELECT current_password_ciphertext FROM scienceing_accounts WHERE code = 'KY-01'")
      .get() as { current_password_ciphertext: string };
    assert.equal(row.current_password_ciphertext, originalCiphertext);
    assert.equal(decryptSecret(parsePayload(row.current_password_ciphertext), originalKey), 'real-account-password');
  } finally {
    db.close();
  }
});

test('新建种子管理员必须在首次登录后修改初始密码', async () => {
  const db = openDatabase(':memory:');

  try {
    migrate(db);
    await seedDatabase(db, { adminPassword: 'admin-test-password', masterKey: Buffer.alloc(32, 3) });

    const admin = db
      .prepare("SELECT first_login_at, must_change_password FROM users WHERE username = 'admin'")
      .get() as { first_login_at: string | null; must_change_password: number };
    assert.equal(admin.first_login_at, null);
    assert.equal(admin.must_change_password, 1);
  } finally {
    db.close();
  }
});
