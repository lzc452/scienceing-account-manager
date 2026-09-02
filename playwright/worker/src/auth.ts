import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
import type { WorkerConfig } from './config';
import { buildSelectors } from './selectors';
import { log } from './logger';

/**
 * 进度日志：走 logger（同步落盘 + stderr），
 * 排查「卡住/无输出」时看 playwright/.worker-logs/worker.log 即可定位停在哪一步。
 */
function step(message: string): void {
  log(message);
}

/** 复用 BrowserContext.storageState() 的返回类型（playwright 未单独导出 StorageState 类型）。 */
export type AuthStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/**
 * 管理员认证会话（PRD §29）。
 *
 * 真实科应（www.scienceing.com）会话特征：
 *  - 登录页路由 /user/login，登录成功后默认跳 /search —— 因此登录后必须显式二次导航进账号管理页；
 *  - 登录表单 form#login-form，且登录前需勾选「我已阅读并同意」协议 checkbox。
 *
 * 流程：
 *  - openAuthenticatedSession 优先复用 playwright/.auth/admin.json；
 *  - 判定未登录（页面落在 /user/login 或登录表单可见）→ loginAdmin 自动重登并回写 storageState。
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
 * 判断当前 page 是否已登录并处于账号管理页。
 * 判定依据（真实科应）：
 *  1. URL 落在 /user/login → 未登录；
 *  2. 登录表单 #login-form 可见 → 未登录（覆盖 SPA 内联登录/未跳转场景）；
 *  3. 否则**等账号管理页筛选组件容器在 5s 内可见**（避免 goto 后立即判定为 false 导致误触发重登），
 *     命中即已登录；超时则按未登录处理。
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const url = page.url();
  if (/\/user\/login/i.test(url)) return false;
  const s = buildSelectors(page);
  if (await s.loginForm.isVisible().catch(() => false)) return false;
  try {
    await s.accountPageReady.waitFor({ state: 'visible', timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 管理员登录（真实科应）：
 *  打开登录页 → 填用户名/密码 → 勾选协议 → 提交 → 等离开登录页 → 显式进入账号管理页。
 * 返回时 page 已停在账号管理页且筛选组件可见（context 由调用方负责关闭）。
 */
export async function loginAdmin(page: Page, config: WorkerConfig): Promise<void> {
  step('login: 打开登录页 ' + config.loginUrl);
  await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded' });
  const s = buildSelectors(page);
  await s.loginForm.waitFor({ state: 'visible', timeout: config.defaultTimeoutMs });
  step('login: 登录表单已就绪，填写用户名/密码');

  await s.loginUsernameInput.fill(config.adminUsername);
  await s.loginPasswordInput.fill(config.adminPassword);

  // 协议勾选：真实科应登录前必须同意（checkbox 视觉可用，正常 check；失败时 force 兜底）。
  if ((await s.loginAgreeCheckbox.count()) > 0 && !(await s.loginAgreeCheckbox.isChecked().catch(() => false))) {
    await s.loginAgreeCheckbox
      .check({ timeout: config.defaultTimeoutMs })
      .catch(() => s.loginAgreeCheckbox.setChecked(true, { force: true }));
  }
  step('login: 已勾选协议，提交登录');

  await s.loginSubmitButton.click();

  // 真实科应单点登录强制确认（如果该账号已在别处登录，会弹「由于您的账号已经在其他地方登录...」确认框，
  // 必须点「确 定」强制下线其他设备才能继续）。弹窗在提交后不一定立即出现（需等后端响应），
  // 因此轮询页面正文检测标记文本（最多 10s）。最多处理两轮（防御性，应对嵌套确认）。
  await handleSingleSessionConfirm(page, config);
  step('login: 已提交，当前 URL=' + page.url());

  // 真实科应登录成功后跳 /search（可能为 SPA 路由变化，URL 也可能保留在 /user/login）。
  // 等待离开 /user/login 或登录表单不可见（超时不阻塞，后续导航兜底）。
  await page
    .waitForURL((u) => !/\/user\/login/i.test(u.pathname), { timeout: config.defaultTimeoutMs })
    .catch(() => undefined);
  step('login: 等待跳转结束，URL=' + page.url());

  if (await s.loginForm.isVisible().catch(() => false)) {
    throw new Error('科应登录失败：提交后仍停留在登录页（请检查 SCIENCING_ADMIN_USERNAME/PASSWORD 与协议勾选）');
  }

  // 显式二次导航进账号管理页并等待就绪。
  step('login: 进入账号管理页 ' + config.adminUrl);
  await page.goto(config.adminUrl);
  await s.accountPageReady.waitFor({ state: 'visible', timeout: config.defaultTimeoutMs });
  step('login: 账号管理页已就绪');
}

/**
 * 处理真实科应的单点登录强制确认弹窗（如有）。
 * - 通过页面正文文本「账号已经在其他地方登录」识别（不依赖具体 antd 类名，避免改版时漂移）；
 * - 提交后弹窗不一定立即出现，因此轮询正文文本（最多 10s）等待标记出现；
 * - 找到任意可见的「确 定」按钮并点击强制下线其他设备；
 * - 最多处理两轮（防御性，应对嵌套确认）。
 */
async function handleSingleSessionConfirm(page: Page, config: WorkerConfig): Promise<void> {
  for (let i = 0; i < 2; i++) {
    // 1) 等 URL 离开 /user/login（说明后端已认证成功，无须再处理确认框）
    if (!/\/user\/login/i.test(page.url())) return;

    // 2) 轮询页面正文，等待单点确认标记出现（提交后可能 1~3s 才渲染）
    let hasMarker = false;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (!/\/user\/login/i.test(page.url())) return;
      let txt = '';
      try {
        txt = (await page.evaluate(() => (document.body && document.body.innerText) || '')) || '';
      } catch {
        // 页面可能正在跳转，忽略本次
      }
      if (/账号已经在其他地方登录/.test(txt)) {
        hasMarker = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    if (!hasMarker) return;

    // 3) 在登录上下文内点击任意可见的「确 定」按钮（覆盖 antd 普通 modal 与 Modal.confirm）。
    const okBtn = page.getByRole('button', { name: /确\s*定/ }).first();
    try {
      await okBtn.waitFor({ state: 'visible', timeout: 3000 });
      await okBtn.click({ timeout: config.defaultTimeoutMs });
      // 给后端一点时间推进
      await page.waitForTimeout(800);
    } catch {
      return;
    }
  }
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
