import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { URL } from 'node:url';

const require = createRequire(import.meta.url);
const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);

async function importBrowserEntry() {
  const importTarget = packageJson.exports['./password-policy'].import;
  const entryUrl = new URL(`../${importTarget.replace(/^\.\//, '')}`, import.meta.url);
  const source = await readFile(entryUrl, 'utf8');
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

  return import(dataUrl);
}

test('浏览器 import 条件提供原生 ESM 命名导出', async () => {
  const policy = await importBrowserEntry();

  assert.equal(typeof policy.isPasswordAllowed, 'function');
  assert.equal(typeof policy.passwordPolicyMessage, 'function');
});

test('ESM 与 CommonJS 入口保持相同的密码策略行为', async () => {
  const esmPolicy = await importBrowserEntry();
  const cjsPolicy = require('../password-policy.cjs');
  const samples = [
    '',
    'a'.repeat(7),
    'a'.repeat(8),
    'a'.repeat(72),
    'a'.repeat(73),
    '😀'.repeat(8),
    '密'.repeat(24),
    '密'.repeat(25),
  ];

  for (const sample of samples) {
    assert.equal(
      esmPolicy.isPasswordAllowed(sample),
      cjsPolicy.isPasswordAllowed(sample),
      `策略入口对 ${JSON.stringify(sample)} 的判断不一致`,
    );
  }
  assert.equal(
    esmPolicy.passwordPolicyMessage('管理员密码'),
    cjsPolicy.passwordPolicyMessage('管理员密码'),
  );
});
