import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { URL } from 'node:url';

const extensionRoot = new URL('../', import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL('manifest.json', extensionRoot), 'utf8'),
);

test('科应域注入密码可见性保护样式', async () => {
  const scienceingContentScript = manifest.content_scripts.find((entry) =>
    entry.js?.includes('src/content/scienceing/scienceing.js'));

  assert.ok(scienceingContentScript, '缺少科应域 content script');
  assert.deepEqual(scienceingContentScript.css, [
    'src/content/scienceing/password-protection.css',
  ]);

  const css = await readFile(
    new URL('src/content/scienceing/password-protection.css', extensionRoot),
    'utf8',
  );

  assert.match(
    css,
    /\.ant-input-affix-wrapper\.ant-input-password\s*>\s*\.ant-input-suffix\s*\{[^}]*display:\s*none\s*!important;/s,
  );
  assert.match(
    css,
    /\.ant-input-affix-wrapper\.ant-input-password\s+input\.ant-input\s*\{[^}]*-webkit-text-security:\s*disc\s*!important;/s,
  );
});
