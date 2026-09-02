import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defaultStorageStatePath, loadConfigFromEnv } from '../config';
import { runQueueSerial, runWithRetry, sleep } from '../pipeline';
import { AccountNotFoundError, ResetVerificationError } from '../reset-flow';

/** 从当前文件向上查找包含 pnpm-workspace.yaml 的仓库根目录。 */
function repoRoot(): string {
  let dir = __dirname;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('未找到仓库根目录');
    dir = parent;
  }
}

function gitignorePath(): string {
  return path.join(repoRoot(), '.gitignore');
}

function mockHtmlPath(): string {
  return path.join(repoRoot(), 'playwright', 'worker', 'mock', 'scienceing-admin.html');
}

test('storageState 默认路径位于 playwright/.auth/admin.json（PRD §29）', () => {
  const p = defaultStorageStatePath('/repo');
  assert.equal(p, path.join('/repo', 'playwright', '.auth', 'admin.json'));
});

test('.gitignore 已排除 playwright/.auth/（PRD §29 高敏感文件不入库）', () => {
  const content = fs.readFileSync(gitignorePath(), 'utf8');
  assert.match(content, /playwright\/\.auth\//);
});

test('loadConfigFromEnv 缺管理员凭据时报错（PRD §42 凭据只走环境变量）', () => {
  delete process.env.SCIENCING_ADMIN_USERNAME;
  delete process.env.SCIENCING_ADMIN_PASSWORD;
  assert.throws(() => loadConfigFromEnv(), /SCIENCING_ADMIN_USERNAME/);
});

test('loadConfigFromEnv 从环境变量读取配置与重试参数', () => {
  process.env.SCIENCING_ADMIN_USERNAME = 'admin';
  process.env.SCIENCING_ADMIN_PASSWORD = 'secret';
  process.env.SCIENCING_ADMIN_URL = 'http://example.test/admin';
  process.env.SCIENCING_MAX_ATTEMPTS = '3';
  process.env.SCIENCING_RETRY_DELAY_MS = '10';
  try {
    const cfg = loadConfigFromEnv();
    assert.equal(cfg.adminUsername, 'admin');
    assert.equal(cfg.adminPassword, 'secret');
    assert.equal(cfg.adminUrl, 'http://example.test/admin');
    assert.equal(cfg.maxAttempts, 3);
    assert.equal(cfg.retryDelayMs, 10);
  } finally {
    delete process.env.SCIENCING_ADMIN_USERNAME;
    delete process.env.SCIENCING_ADMIN_PASSWORD;
    delete process.env.SCIENCING_ADMIN_URL;
    delete process.env.SCIENCING_MAX_ATTEMPTS;
    delete process.env.SCIENCING_RETRY_DELAY_MS;
  }
});

test('runWithRetry 首次成功 → SUCCESS attempts=1', async () => {
  const r = await runWithRetry(async () => ({ ok: true as const }), { maxAttempts: 3, retryDelayMs: 1 });
  assert.equal(r.status, 'SUCCESS');
  assert.equal(r.attempts, 1);
});

test('runWithRetry 前两次失败第三次成功 → attempts=3（PRD §48 重试 2～3 次）', async () => {
  let calls = 0;
  const r = await runWithRetry(
    async () => {
      calls += 1;
      if (calls < 3) return { ok: false as const, error: '临时失败' };
      return { ok: true as const };
    },
    { maxAttempts: 3, retryDelayMs: 1 },
  );
  assert.equal(r.status, 'SUCCESS');
  assert.equal(r.attempts, 3);
  assert.equal(calls, 3);
});

test('runWithRetry 一直失败 → FAILED 且不无限重试（PRD §47/§48）', async () => {
  const r = await runWithRetry(
    async () => {
      throw new Error('未找到“重置密码”按钮');
    },
    { maxAttempts: 3, retryDelayMs: 1 },
  );
  assert.equal(r.status, 'FAILED');
  assert.equal(r.attempts, 3);
  assert.ok(r.error?.includes('重置密码'));
});

test('runQueueSerial 串行消费：任意时刻仅一个任务在执行（PRD §28 不并行登录管理员）', async () => {
  let active = 0;
  let maxActive = 0;
  const results = await runQueueSerial([1, 2, 3, 4, 5], async (n) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await sleep(5);
    active -= 1;
    return n * 2;
  });
  assert.deepEqual(results, [2, 4, 6, 8, 10]);
  assert.equal(maxActive, 1);
});

test('错误消息清晰可读（PRD §47 示例：未找到「重置密码」按钮 / 账号找不到）', () => {
  assert.match(new AccountNotFoundError('ky03@highpowertech.com').message, /未找到账号「ky03@highpowertech.com」/);
  assert.match(new ResetVerificationError('ky03@highpowertech.com', '重置成功').message, /未出现成功文案「重置成功」/);
});

test('mock 科应后台包含真实页面定位所需的稳定锚点（id/placeholder/iconfont/antd class/toast）', () => {
  const html = fs.readFileSync(mockHtmlPath(), 'utf8');
  // 登录页：form id + 用户名/密码输入框容器 id + placeholder + 协议
  assert.match(html, /id="login-form"/);
  assert.match(html, /id="login-form_username"/);
  assert.match(html, /id="login-form_password"/);
  assert.match(html, /placeholder="请输入用户名"/);
  assert.match(html, /placeholder="输入密码"/);
  assert.match(html, /type="submit"/);
  assert.match(html, /我已阅读并同意/);
  // 账号管理：CSS Modules 前缀（生产随机后缀） + td[title=账号] + iconfont 重置图标
  assert.match(html, /account_userlist_filters__/);
  assert.match(html, /account_userlist_buttons__/);
  assert.match(html, /account_userlist_table__/);
  assert.match(html, /account_userlist_action__/);
  assert.match(html, /account_userlist_notificationItem__/);
  assert.match(html, /td title="ky01@highpowertech.com"/);
  assert.match(html, /icon-zhongzhimima/);
  // AntD 弹窗：title / radio 指定密码 / 新密码 placeholder / 通知设置（真实文案：指定密码/邮箱通知）
  assert.match(html, /ant-modal-title/);
  assert.match(html, /指定密码/);
  assert.match(html, /placeholder="请输入指定密码"/);
  assert.match(html, /邮箱通知/);
  assert.match(html, /短信通知/);
  // PRD §31 成功/失败 toast 文案（真实科应：重置成功）
  assert.match(html, /重置成功/);
  assert.match(html, /重置失败/);
});
