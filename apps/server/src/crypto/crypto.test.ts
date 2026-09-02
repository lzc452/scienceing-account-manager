import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hashPassword, verifyPassword } from './password';
import { generateMasterKey } from './master-key';
import { encryptSecret, decryptSecret, serializePayload, parsePayload } from './secret-box';
import { generateLeaseToken, hashLeaseToken } from './lease-token';

test('AES-256-GCM：加密→解密 roundtrip', () => {
  const { key } = generateMasterKey();
  const secret = 'K-y_P@ssw0rd 中文 #1';
  const payload = encryptSecret(secret, key);
  assert.equal(decryptSecret(payload, key), secret);
});

test('AES-256-GCM：序列化到 DB 单列后 roundtrip', () => {
  const { key } = generateMasterKey();
  const json = serializePayload(encryptSecret('s3cret-value', key));
  const parsed = parsePayload(json);
  assert.equal(decryptSecret(parsed, key), 's3cret-value');
});

test('AES-256-GCM：篡改密文后解密抛错（authTag 校验）', () => {
  const { key } = generateMasterKey();
  const payload = encryptSecret('abc123', key);
  const tampered = { ...payload, ciphertext: 'AAAA' };
  assert.throws(() => decryptSecret(tampered, key));
});

test('bcrypt：hash + verify', async () => {
  const hash = await hashPassword('correct horse battery');
  assert.equal(await verifyPassword('correct horse battery', hash), true);
  assert.equal(await verifyPassword('wrong password', hash), false);
});

test('lease token：SHA-256 哈希稳定且为 64 hex', () => {
  const token = generateLeaseToken();
  const hash = hashLeaseToken(token);
  assert.equal(hash.length, 64);
  assert.equal(hash, hashLeaseToken(token));
});
