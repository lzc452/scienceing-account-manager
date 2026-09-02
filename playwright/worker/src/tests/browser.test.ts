import { after, before, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { chromium, type Browser } from 'playwright';
import type { WorkerConfig } from '../config';
import { isAuthenticated, loginAdmin, openAuthenticatedSession, saveStorageState } from '../auth';
import { performReset, ResetVerificationError } from '../reset-flow';
import { ResetWorker } from '../worker';

/**
 * 浏览器流程测试（依赖系统 Chrome，channel: 'chrome'）。
 *
 * 在具备浏览器二进制、且允许浏览器子进程 IPC（named pipe）的环境中运行：
 *   node --test dist/tests/browser.test.js
 *
 * 在 DSH 受限沙箱中 Chromium 因 named pipe 被禁（mojo platform_channel 拒绝访问）无法启动，
 * 这里会捕获 EPERM 并把所有用例标记为 skip，同时保留纯逻辑单测（logic.test.ts）作为可运行证据。
 */

function repoRoot(): string {
  let dir = __dirname;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('未找到仓库根目录');
    dir = parent;
  }
}

let server: http.Server | null = null;
let baseUrl = '';
let browser: Browser | null = null;
let skipReason: string | null = null;
let tempDir = '';

before(async () => {
  const html = fs.readFileSync(path.join(repoRoot(), 'playwright', 'worker', 'mock', 'scienceing-admin.html'));
  server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address && typeof address === 'object') {
    baseUrl = `http://127.0.0.1:${address.port}/admin`;
  }

  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-worker-'));

  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (err) {
    skipReason = err instanceof Error ? err.message : String(err);
  }
});

after(async () => {
  if (browser) await browser.close().catch(() => undefined);
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

function config(overrides?: Partial<WorkerConfig>): WorkerConfig {
  return {
    adminUrl: baseUrl,
    adminUsername: 'admin',
    adminPassword: 'admin123',
    storageStatePath: path.join(tempDir, 'admin.json'),
    browserChannel: 'chrome',
    headless: true,
    defaultTimeoutMs: 5000,
    resetSuccessText: '修改成功',
    retryDelayMs: 10,
    maxAttempts: 3,
    ...overrides,
  };
}

function requireBrowser(t: TestContext): Browser | null {
  if (!browser) {
    t.skip(skipReason ?? '浏览器不可用');
    return null;
  }
  return browser;
}

test('管理员登录后生成 storageState（PRD §29）', async (t) => {
  const b = requireBrowser(t);
  if (!b) return;
  const cfg = config();
  const context = await b.newContext();
  const page = await context.newPage();
  await page.setDefaultTimeout(cfg.defaultTimeoutMs);
  await loginAdmin(page, cfg);
  await saveStorageState(context, cfg);
  await context.close();

  assert.ok(fs.existsSync(cfg.storageStatePath), '应生成 storageState 文件');
  const state = JSON.parse(fs.readFileSync(cfg.storageStatePath, 'utf8')) as {
    origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
  };
  const hasSession = state.origins?.some((o) =>
    o.localStorage?.some((e) => e.name === 'mock_admin_session' && e.value === '1'),
  );
  assert.ok(hasSession, 'storageState 应包含管理员会话标记');
});

test('改密成功路径：出现“修改成功”才判定成功（PRD §31）', async (t) => {
  const b = requireBrowser(t);
  if (!b) return;
  const cfg = config();
  const { context, page } = await openAuthenticatedSession(b, cfg);
  try {
    const outcome = await performReset(page, cfg, 'KY-01', 'NewPass!123');
    assert.equal(outcome.ok, true);
    assert.equal(await page.getByText('修改成功', { exact: true }).isVisible(), true);
  } finally {
    await context.close();
  }
});

test('改密失败路径：点击“确定”但无“修改成功” → 判定失败（PRD §31/§47）', async (t) => {
  const b = requireBrowser(t);
  if (!b) return;
  const cfg = config();
  const { context, page } = await openAuthenticatedSession(b, cfg);
  try {
    await assert.rejects(() => performReset(page, cfg, 'KY-04', 'NewPass!123'), ResetVerificationError);
    assert.equal(await page.getByText('修改失败：该账号已被锁定', { exact: true }).isVisible(), true);
  } finally {
    await context.close();
  }
});

test('ResetWorker 失败重试 2～3 次后返回 FAILED（PRD §48）', async (t) => {
  const b = requireBrowser(t);
  if (!b) return;
  const worker = new ResetWorker(config());
  try {
    const result = await worker.processJob({ jobId: 1, accountCode: 'KY-04', newPassword: 'NewPass!123' });
    assert.equal(result.status, 'FAILED');
    assert.equal(result.attempts, 3);
    assert.match(result.error ?? '', /修改成功/);
  } finally {
    await worker.close();
  }
});

test('账号不存在 → FAILED 未找到账号（PRD §47）', async (t) => {
  const b = requireBrowser(t);
  if (!b) return;
  const worker = new ResetWorker(config());
  try {
    const result = await worker.processJob({ jobId: 2, accountCode: 'KY-99', newPassword: 'NewPass!123' });
    assert.equal(result.status, 'FAILED');
    assert.match(result.error ?? '', /未找到账号「KY-99」/);
  } finally {
    await worker.close();
  }
});

test('ResetWorker.run 串行消费队列（PRD §28）', async (t) => {
  const b = requireBrowser(t);
  if (!b) return;
  const worker = new ResetWorker(config());
  try {
    const results = await worker.run([
      { jobId: 1, accountCode: 'KY-01', newPassword: 'NewPass!111' },
      { jobId: 2, accountCode: 'KY-02', newPassword: 'NewPass!222' },
    ]);
    assert.equal(results.length, 2);
    assert.equal(results[0]?.status, 'SUCCESS');
    assert.equal(results[1]?.status, 'SUCCESS');
  } finally {
    await worker.close();
  }
});

test('storageState 过期自动重登并回写（PRD §29）', async (t) => {
  const b = requireBrowser(t);
  if (!b) return;
  const cfg = config();

  // 1. 首次登录并保存
  const first = await openAuthenticatedSession(b, cfg);
  await first.context.close();

  // 2. 模拟会话过期：把 localStorage 中的会话标记清空（相当于 cookie 过期）
  const state = JSON.parse(fs.readFileSync(cfg.storageStatePath, 'utf8')) as {
    origins?: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
  };
  state.origins?.forEach((o) => {
    o.localStorage = o.localStorage.filter((e) => e.name !== 'mock_admin_session');
  });
  fs.writeFileSync(cfg.storageStatePath, JSON.stringify(state, null, 2), 'utf8');

  // 3. 重新打开会话：应检测到未登录并自动重登
  const second = await openAuthenticatedSession(b, cfg);
  try {
    assert.equal(await isAuthenticated(second.page), true);
  } finally {
    await second.context.close();
  }

  // 4. storageState 已被回写（重新包含会话标记）
  const rewritten = JSON.parse(fs.readFileSync(cfg.storageStatePath, 'utf8')) as {
    origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
  };
  const hasSession = rewritten.origins?.some((o) =>
    o.localStorage?.some((e) => e.name === 'mock_admin_session' && e.value === '1'),
  );
  assert.ok(hasSession, '自动重登后应回写 storageState');
});
