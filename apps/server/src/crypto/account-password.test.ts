import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_PASSWORD_LENGTH, generateAccountPassword, isValidAccountPassword } from './account-password';

test('generateAccountPassword 生成结果满足策略（长度/四类齐全/无易混淆字符）', () => {
  for (let i = 0; i < 200; i++) {
    const pw = generateAccountPassword();
    assert.equal(pw.length, ACCOUNT_PASSWORD_LENGTH, `长度应为 ${ACCOUNT_PASSWORD_LENGTH}`);
    assert.equal(isValidAccountPassword(pw), true, `应通过策略校验: ${pw}`);
  }
});

test('generateAccountPassword 高随机性：200 个样本无重复', () => {
  const set = new Set<string>();
  for (let i = 0; i < 200; i++) set.add(generateAccountPassword());
  assert.ok(set.size >= 199, `200 样本应几乎全唯一，实际唯一 ${set.size}`);
});

test('isValidAccountPassword 拒绝不合规密码', () => {
  // 太短
  assert.equal(isValidAccountPassword('Ab1!Ab1!Ab1!'), false);
  // 缺大写
  assert.equal(isValidAccountPassword('abcdefgh1234!@#$'), false);
  // 缺小写
  assert.equal(isValidAccountPassword('ABCDEFGH1234!@#$'), false);
  // 缺数字
  assert.equal(isValidAccountPassword('Abcdefghij!@#$abcd'), false);
  // 缺符号
  assert.equal(isValidAccountPassword('Abcdefghij1234abcd'), false);
  // 含易混淆字符（0 / O / 1 / I / l）
  assert.equal(isValidAccountPassword('Abcdefgh0O1IlXYZ!@#$'), false);
});
