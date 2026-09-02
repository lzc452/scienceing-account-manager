import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
import type { WorkerConfig } from './config';
import { buildSelectors } from './selectors';

/** 复用 BrowserContext.storageState() 的返回类型（playwright 未单独导出 StorageState 类型）。 */
export type AuthStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/**
 * 管理员认证状态（PRD §29）。
 *
 * 第一次正常登录后把 storageState 保存到 playwright/.auth/admin.json（已 gitignore）。
 * Worker 启动后加载该状态复用会话；若已过期（访问账号管理页回到登录页），自动重新登录。
 */
export interface AuthSession {
  context: BrowserContext;
  page: Page;
}

export function hasStorageState(config: WorkerConfig): boolean {
  return fs.existsSync(config.storageStatePath);
}

export async function saveStorageState(context: BrowserContext, config: WorkerConfig): Promise<void> {
  const state = await context.storageState();
  fs.mkdirSync(path.dirname(config.storageStatePath), { recursive: true });
  fs.writeFileSync(config.storageStatePath, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export async function loadStorageState(config: WorkerConfig): Promise<AuthStorageState | null> {
  if (!hasStorageState(config)) return null;
  try {
    const raw = fs.readFileSync(config.storageStatePath, 'utf8');
    return JSON.parse(raw) as AuthStorageState;
  } catch {
    // 认证文件损坏时视为不存在，走重新登录路径。
    return null;
  }
}

/**
 * 判断当前页面是否已登录（进入账号管理页）。
 * 账号管理页展示标题；登录页展示登录按钮 + 用户名/密码输入框。
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const s = buildSelectors(page);
  return s.accountManagementHeading.isVisible().catch(() => false);
}

/**
 * 管理员正常登录：打开后台 → 填用户名/密码 → 登录 → 等待账号管理页。
 * 返回已登录的 page（context 由调用方负责关闭）。
 */
export async function loginAdmin(page: Page, config: WorkerConfig): Promise<void> {
  await page.goto(config.adminUrl);
  const s = buildSelectors(page);
  await s.loginUsername.fill(config.adminUsername);
  await s.loginPassword.fill(config.adminPassword);
  await s.loginButton.click();
  await s.accountManagementHeading.waitFor({ state: 'visible', timeout: config.defaultTimeoutMs });
}

/**
 * 打开浏览器并建立已认证会话（优先复用 storageState，失效则自动重登，PRD §29）。
 */
export async function openAuthenticatedSession(
  browser: Browser,
  config: WorkerConfig,
): Promise<AuthSession> {
  const stored = await loadStorageState(config);
  const context = stored ? await browser.newContext({ storageState: stored }) : await browser.newContext();
  const page = await context.newPage();
  await page.setDefaultTimeout(config.defaultTimeoutMs);
  await page.goto(config.adminUrl);

  if (await isAuthenticated(page)) {
    return { context, page };
  }

  // 会话失效：自动重新登录（PRD §29）并更新 storageState。
  await loginAdmin(page, config);
  await saveStorageState(context, config);
  return { context, page };
}
