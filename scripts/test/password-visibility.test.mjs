/* global window, localStorage, navigator, history, PopStateEvent */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve, extname } from 'node:path';
import { URL } from 'node:url';
import process from 'node:process';

const root = resolve(import.meta.dirname, '../..');
const require = createRequire(resolve(root, 'playwright/worker/package.json'));
const { chromium } = require('playwright');
const secret = 'Synthetic-Password#42';
let browser, server, origin;

before(async () => {
  const directory = resolve(root, 'apps/web/dist');
  server = createServer(async (req, res) => {
    const path = resolve(directory, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(directory + '/') && !path.startsWith(directory + '\\') && path !== directory) { res.writeHead(404).end(); return; }
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.html': 'text/html' };
    try { res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
    catch { res.setHeader('Content-Type', 'text/html'); res.end(await readFile(resolve(directory, 'index.html'))); }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
});
after(async () => { await browser?.close(); await new Promise((done) => server?.close(done)); });

async function fixture(role) {
  const context = await browser.newContext();
  const user = { id: 1, username: 'synthetic', displayName: '测试', role, mustChangePassword: false };
  await context.addInitScript((user) => {
    localStorage.setItem('scienceing_user', JSON.stringify(user));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (value) => { window.__copied = value; } } });
  }, user);
  const state = { requests: 0, delay: null };
  await context.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path.endsWith('/auth/me')) data = user;
    if (path.endsWith('/leases/current')) data = {
      lease: { id: 1, status: 'ACTIVE', remainingSeconds: 3600, timeoutSeconds: 86400 },
      account: { accountId: 1, code: 'KY-01', username: 'ky-01', password: secret },
    };
    if (path.endsWith('/admin/accounts')) data = [1, 2].map((id) => ({ id, code: `KY-0${id}`, username: `ky-0${id}`, status: 'AVAILABLE', passwordProvisioned: true }));
    if (path.endsWith('/password')) {
      state.requests++;
      if (state.delay) await state.delay;
      data = { accountId: Number(path.split('/').at(-2)), password: secret };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const page = await context.newPage();
  await page.clock.install();
  return { context, page, state };
}

test('普通用户保持遮蔽，无查看入口，复制可用', async () => {
  const { context, page } = await fixture('USER');
  try {
    await page.goto(origin + '/my');
    await page.getByRole('button', { name: '复制密码', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '显示密码', exact: true }).count(), 0);
    assert.equal((await page.locator('code').allTextContents()).includes(secret), false);
    await page.getByRole('button', { name: '复制密码', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__copied), secret);
  } finally { await context.close(); }
});

test('管理员我的账号可查看，30 秒后遮蔽', async () => {
  const { context, page } = await fixture('ADMIN');
  try {
    await page.goto(origin + '/my');
    await page.getByRole('button', { name: '显示密码', exact: true }).click();
    assert.ok((await page.locator('code').allTextContents()).includes(secret));
    await page.clock.fastForward(30_001);
    await page.getByRole('button', { name: '显示密码', exact: true }).waitFor();
    assert.equal((await page.locator('code').allTextContents()).includes(secret), false);
  } finally { await context.close(); }
});

test('管理员列表按需弹窗、超时、关闭和迟到响应清理', async () => {
  const { context, page, state } = await fixture('ADMIN');
  let release;
  try {
    await page.goto(origin + '/admin/accounts');
    const view = page.getByRole('button', { name: '查看密码', exact: true });
    await view.first().waitFor();
    assert.equal(state.requests, 0);
    await view.first().click();
    const dialog = page.getByRole('dialog', { name: '查看密码 KY-01', exact: true });
    await dialog.getByRole('button', { name: '隐藏密码', exact: true }).waitFor();
    assert.equal(await dialog.locator('code').innerText(), secret);
    await page.clock.fastForward(30_001);
    await dialog.getByRole('button', { name: '显示密码', exact: true }).waitFor();
    assert.notEqual(await dialog.locator('code').innerText(), secret);
    await dialog.getByRole('button', { name: '关闭', exact: true }).first().click();
    state.delay = new Promise((done) => { release = done; });
    const pending = page.waitForRequest('**/api/admin/accounts/2/password');
    await view.nth(1).click();
    await pending;
    await page.getByRole('dialog', { name: '查看密码 KY-02' }).getByRole('button', { name: '关闭', exact: true }).first().click();
    release(); state.delay = null;
    await page.waitForLoadState('networkidle');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal((await page.locator('code').allTextContents()).includes(secret), false);
    await view.nth(1).click();
    await page.getByRole('button', { name: '隐藏密码', exact: true }).waitFor();
    await page.evaluate(() => { history.pushState({}, '', '/my'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await page.getByRole('button', { name: '显示密码', exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.goto(origin + '/admin/accounts');
    await page.getByRole('button', { name: '查看密码', exact: true }).first().click();
    await page.getByRole('button', { name: '隐藏密码', exact: true }).waitFor();
    // 关闭查看框后通过真实登出入口清空角色与页面。
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).first().click();
    await page.getByRole('button', { name: '退出', exact: true }).click();
    await page.getByRole('button', { name: '确认退出' }).click();
    await page.waitForURL('**/login');
    assert.equal((await page.locator('code').allTextContents()).includes(secret), false);
  } finally { release?.(); await context.close(); }
});
