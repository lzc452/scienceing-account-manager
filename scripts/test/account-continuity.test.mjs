/* global window, localStorage, document, sessionStorage */
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { resolve, extname } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '../..');
const { chromium } = createRequire(resolve(root, 'playwright/worker/package.json'))('playwright');
let browser, server, origin;

before(async () => {
  const directory = resolve(root, 'apps/web/dist');
  server = createServer(async (req, res) => {
    const path = resolve(directory, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(directory + '/') && !path.startsWith(directory + '\\') && path !== directory) {
      res.writeHead(404).end(); return;
    }
    try {
      const mime = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.html': 'text/html' };
      res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
      res.end(await readFile(path));
    } catch {
      res.setHeader('Content-Type', 'text/html');
      res.end(await readFile(resolve(directory, 'index.html')));
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((done) => server.close(done));
});

async function fixture({ role = 'USER', version = '1.4.0', selection = true } = {}) {
  const context = await browser.newContext();
  const user = { id: 7, username: 'continuity-test', displayName: '测试用户', role, mustChangePassword: false };
  const state = {
    rows: [
      { accountId: 1, code: 'KY-01', status: 'AVAILABLE', enabled: true, lastUsedAt: null },
      { accountId: 3, code: 'KY-03', status: 'IN_USE', enabled: true, lastUsedAt: '2026-10-10T02:00:00.000Z' },
      { accountId: 4, code: 'KY-04', status: 'AVAILABLE', enabled: false, lastUsedAt: '2026-10-09T02:00:00.000Z' },
    ],
    current: { lease: null, account: null }, claims: [], failNext: false, edits: [],
  };
  await context.exposeBinding('__continuityClaim', (_source, accountId) => {
    state.claims.push(accountId);
    if (state.failNext) {
      state.failNext = false;
      state.rows.find((a) => a.accountId === accountId).status = 'IN_USE';
      return { ok: false, status: 409, code: 'TARGET_ACCOUNT_UNAVAILABLE', error: '指定账号正在使用中，请刷新状态后重试' };
    }
    const account = accountId === undefined ? state.rows.find((a) => a.status === 'AVAILABLE' && a.enabled)
      : state.rows.find((a) => a.accountId === accountId);
    account.status = 'IN_USE';
    state.current = {
      lease: { id: 33, accountId: account.accountId, accountCode: account.code, status: 'ACTIVE', remainingSeconds: 86400, timeoutSeconds: 86400 },
      account: { accountId: account.accountId, code: account.code, username: `scienceing-${account.accountId}`, password: 'synthetic-test-password' },
    };
    return { ok: true, data: { ...state.current, leaseToken: 'synthetic-lease-token' } };
  });
  await context.addInitScript(({ user, version, selection }) => {
    localStorage.setItem('scienceing_user', JSON.stringify(user));
    window.addEventListener('message', async (event) => {
      if (event.source !== window || event.data?.source !== 'scienceing-dashboard') return;
      if (event.data.type === 'EXTENSION_PING') {
        window.postMessage({ source: 'scienceing-extension', type: 'EXTENSION_READY', status: 'ready', version,
          minimumVersion: '1.0.0', latestVersion: '1.4.0', supportsAccountSelection: selection }, window.location.origin);
      } else if (event.data.type === 'CLAIM_LEASE') {
        const result = await window.__continuityClaim(event.data.accountId);
        window.postMessage({ source: 'scienceing-extension', type: 'CLAIM_LEASE_RESULT', requestId: event.data.requestId, ...result }, window.location.origin);
      }
    });
  }, { user, version, selection });
  await context.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path.endsWith('/auth/me')) data = user;
    else if (path.endsWith('/auth/extension-token')) data = { token: 'synthetic-user-token' };
    else if (path.endsWith('/accounts/mine')) data = state.rows;
    else if (path.endsWith('/accounts/availability')) data = { total: 2, available: 1, inUse: 1, recycling: 0, error: 0 };
    else if (path.endsWith('/leases/current')) data = state.current;
    else if (path.endsWith('/admin/accounts')) data = state.rows.map((a) => ({
      ...a, id: a.accountId, username: `scienceing-${a.accountId}`, passwordProvisioned: true,
      hasUsageHistory: Boolean(a.lastUsedAt), currentUser: null,
    }));
    else if (/\/admin\/accounts\/\d+$/.test(path) && route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      state.edits.push(body);
      const account = state.rows.find((a) => a.accountId === Number(path.split('/').at(-1)));
      account.code = body.code;
      data = { ...account, id: account.accountId, username: body.username, hasUsageHistory: true };
    } else if (path.endsWith('/admin/health-check')) data = { items: [], lastCheckedAt: null };
    else if (path.endsWith('/extension/config')) data = { minimumVersion: '1.0.0', latestVersion: '1.4.0', package: { available: false } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const page = await context.newPage();
  return { context, page, state };
}

test('历史自动显示、停用与忙碌禁领，定向失败不换号，手动重试回到原账号', async () => {
  const { context, page, state } = await fixture();
  try {
    await page.goto(origin);
    const recent = page.locator('li').filter({ hasText: 'KY-03' });
    const disabled = page.locator('li').filter({ hasText: 'KY-04' });
    await recent.getByRole('button').waitFor();
    assert.equal(await recent.getByRole('button').isDisabled(), true);
    assert.equal(await disabled.getByRole('button').isDisabled(), true);
    state.rows[1].status = 'AVAILABLE';
    state.failNext = true;
    await page.getByRole('button', { name: '刷新状态', exact: true }).click();
    await recent.getByRole('button').click();
    await page.getByText('指定账号正在使用中，请刷新状态后重试', { exact: true }).waitFor();
    assert.deepEqual(state.claims, [3]);
    assert.equal(new URL(page.url()).pathname, '/');
    await page.waitForFunction(() => [...document.querySelectorAll('li')].find((n) => n.textContent.includes('KY-03'))?.querySelector('button').disabled === true);
    state.rows[1].status = 'AVAILABLE';
    await page.getByRole('button', { name: '刷新状态', exact: true }).click();
    await recent.getByRole('button').click();
    await page.waitForURL(origin + '/my');
    assert.deepEqual(state.claims, [3, 3]);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('scienceing_lease_token')), 'synthetic-lease-token');
    await page.goto(origin);
    await page.getByRole('button', { name: '查看我的账号 →' }).waitFor();
    assert.equal(await page.locator('li').filter({ hasText: 'KY-03' }).getByRole('button').isEnabled(), true);
    assert.equal(await page.getByRole('button', { name: '指定领取此账号', exact: true }).first().isDisabled(), true);
    await mkdir(resolve(root, '.tmp-build-check'), { recursive: true });
    await page.screenshot({ path: resolve(root, '.tmp-build-check/account-continuity-home.png'), fullPage: true });
  } finally { await context.close(); }
});

test('旧扩展禁用定向入口并提示升级，普通领取保持兼容；窄屏没有横向溢出', async () => {
  const { context, page, state } = await fixture({ version: '1.3.0', selection: false });
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    state.rows[1].status = 'AVAILABLE';
    await page.goto(origin);
    await page.getByText('继续使用及指定领取需要助手 1.4.0 及以上，请通过顶部入口安装或升级扩展。', { exact: true }).waitFor();
    assert.equal(await page.locator('li').filter({ hasText: 'KY-03' }).getByRole('button').isDisabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByRole('button', { name: '我要使用科应', exact: true }).click();
    await page.waitForURL(origin + '/my');
    assert.equal(state.claims.length, 1);
    assert.equal(state.claims[0], undefined);
    assert.equal(state.current.account.code, 'KY-01');
  } finally { await context.close(); }
});

test('管理员历史账号删除禁用、登录名不可替换、展示编号可修改', async () => {
  const { context, page, state } = await fixture({ role: 'ADMIN' });
  try {
    await page.goto(origin + '/admin/accounts');
    const row = page.getByRole('row').filter({ hasText: 'KY-03' });
    await row.getByRole('button', { name: '编辑', exact: true }).waitFor();
    assert.equal(await row.getByRole('button', { name: '删除', exact: true }).isDisabled(), true);
    await row.getByRole('button', { name: '编辑', exact: true }).click();
    const dialog = page.getByRole('dialog');
    assert.equal(await dialog.getByLabel('账号名称', { exact: true }).isDisabled(), true);
    await dialog.getByLabel('展示编号', { exact: true }).fill('DISPLAY-03');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('row').filter({ hasText: 'DISPLAY-03' }).waitFor();
    assert.deepEqual(state.edits, [{ username: 'scienceing-3', code: 'DISPLAY-03' }]);
  } finally { await context.close(); }
});
