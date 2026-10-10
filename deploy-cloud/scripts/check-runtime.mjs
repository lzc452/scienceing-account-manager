/* global console */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

const root = resolve(import.meta.dirname, '../..');
const require = createRequire(join(root, 'playwright/worker/package.json'));
assert.equal(require('playwright/package.json').version, '1.62.1', '镜像与 Playwright 包版本必须一致');
assert.equal(typeof backup, 'function', '需要 SQLite Backup API');
const directory = mkdtempSync(join(tmpdir(), 'scienceing-runtime-'));
const db = new DatabaseSync(':memory:');
let browser;
try {
  db.exec('CREATE TABLE probe(id INTEGER); INSERT INTO probe VALUES(1)');
  const path = join(directory, 'probe.db');
  await backup(db, path);
  const snapshot = new DatabaseSync(path, { readOnly: true });
  try { assert.equal(snapshot.prepare('SELECT id FROM probe').get().id, 1); } finally { snapshot.close(); }
  browser = await require('playwright').chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.goto('about:blank');
  console.log('SQLite Backup API 与 Chromium 验证通过');
} finally {
  await browser?.close();
  db.close();
  rmSync(directory, { recursive: true, force: true });
}
