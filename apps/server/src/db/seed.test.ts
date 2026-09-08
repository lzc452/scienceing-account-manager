import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from './connection';
import { migrate } from './migrate';
import { seedDatabase } from './seed';
import { decryptSecret, encryptSecret, parsePayload, serializePayload } from '../crypto/secret-box';

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
