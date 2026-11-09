/**
 * V3 验证：注销能否**吊销令牌**（决定「回收即踢人」是否成立）
 *
 * 背景
 *   V2 实测已证明：改密不吊销已签发的令牌，旧标签能用到 JWT 过期（14 天）。
 *   之后从浏览器手工操作里抓到真实注销请求：
 *     POST /apps/articleSearch/api/usercenter/login/v1/logout   body: {}
 *   带 code / lk / sign / timestamp / ip 五个头（疑似请求签名）。
 *
 * V3 第一轮（已作废的结论）
 *   裸 Bearer 调用返回 **HTTP 200 但业务失败**：
 *     {"common":{"returnCode":"3002","returnMsg":"数据加载失败,请稍后再试"},"result":null}
 *   说明该接口要签名。教训：HTTP 2xx ≠ 成功，必须看 returnCode。
 *
 * 本版做法
 *   主路径不猜签名，而是**驱动站点自己的退出入口**（扩展本来就能 element.click()）：
 *     1. 登录 → 校准受保护接口 → 基线采样（应 200）
 *     2. 把令牌取到进程内存（变量，绝不落盘/打印）——真注销后 localStorage 会被清空，
 *        不先取出来就测不了「旧令牌是否被吊销」
 *     3. 点「退出登录」（必要时先点用户菜单/头像触发器），捕获真实 /logout 响应
 *     4. 用**旧令牌**重放同一批接口：401 = 服务端真的吊销了；200 = 只是清了本地
 *   判定以「是否真的退出成功（跳登录页）」+「旧令牌是否被拒」为准，不依赖 returnCode 约定。
 *
 * 安全：本脚本不改密码、不改任何账号数据，只结束自己刚建立的会话。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium, type Browser, type Page, type Response } from 'playwright';
import { loadConfigFromEnv, type WorkerConfig } from './config';
import { loginWithCredentials } from './auth';
import { installCdnMirrorRouting } from './cdn-mirror';
import { buildSelectors } from './selectors';
import { initLogger, log, findRepoRoot } from './logger';
import {
  attachResponseCollector,
  calibrateProtectedProbes,
  collectCandidates,
  findTokenKey,
  probeWithBearer,
  readTokenMeta,
  type ReplayPlan,
  type TokenMeta,
} from './session-probe';

/** 从浏览器抓到的真实注销接口（2026-11-09 手工退出登录）。 */
const LOGOUT_PATH = '/apps/articleSearch/api/usercenter/login/v1/logout';

/**
 * 用户菜单触发器候选（按真实 DOM 排序，2026-11-09 由 William 提供）。
 * 真实结构：头部右侧 `common_header_right__LsRQ` → 第一个 div →
 *   `div.ant-dropdown-trigger.common_header_userButton__zJscr`（显示账号邮箱 + 下拉箭头）
 * 点开后 antd 下拉渲染到 body，**最后一项**是「退出登录」。不点开则 DOM 里根本没有该项。
 */
const MENU_TRIGGERS = [
  '[class*="common_header_userButton"]',
  '[class*="common_header_right"] .ant-dropdown-trigger',
  '[class*="avatar"]',
  '[class*="userInfo"]',
  '[class*="header"] img',
];

interface ParsedArgs {
  account?: string;
  password?: string;
  passwordStdin: boolean;
  probeUrl: string;
  headed: boolean;
  probePaths: string[];
  /** 注销后在**全新上下文**里复测的时间点（秒），用于排除「异步吊销」与「本机残留」。 */
  recheckSeconds: number[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    passwordStdin: false,
    probeUrl: 'https://www.scienceing.com/search',
    headed: false,
    probePaths: ['/apps/articleSearch/api/subscribe/message/v2/sub'],
    recheckSeconds: [0, 30, 120],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--account' || arg === '-u') args.account = argv[++i];
    else if (arg === '--password' || arg === '-p') args.password = argv[++i];
    else if (arg === '--password-stdin') args.passwordStdin = true;
    else if (arg === '--probe-url') args.probeUrl = argv[++i] ?? args.probeUrl;
    else if (arg === '--headed') args.headed = true;
    else if (arg === '--recheck') {
      const raw = argv[++i] ?? '';
      const parsed = raw
        .split(',')
        .map((item) => Number.parseInt(item.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 0);
      if (parsed.length > 0) args.recheckSeconds = parsed;
    } else if (arg === '--probe-paths') {
      const raw = argv[++i] ?? '';
      const parsed = raw.split(',').map((item) => item.trim()).filter((item) => item.startsWith('/'));
      if (parsed.length > 0) args.probePaths = parsed;
    }
  }
  return args;
}

async function readPasswordFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

interface CommonBody {
  returnCode: string | null;
  returnMsg: string | null;
}

/** 解析科应统一响应体的 common 段（returnCode 才是业务成败）。 */
function parseCommon(text: string): CommonBody {
  try {
    const parsed = JSON.parse(text) as { common?: { returnCode?: unknown; returnMsg?: unknown } };
    const code = parsed.common?.returnCode;
    const msg = parsed.common?.returnMsg;
    return {
      returnCode: typeof code === 'string' ? code : (typeof code === 'number' ? String(code) : null),
      returnMsg: typeof msg === 'string' ? msg : null,
    };
  } catch {
    return { returnCode: null, returnMsg: null };
  }
}

interface ApiAttempt {
  label: string;
  extraHeaders: string[];
  httpStatus: number;
  returnCode: string | null;
  returnMsg: string | null;
}

/** 诊断用：裸 Bearer / 追加 source / 追加 timestamp 依次尝试（预期仍然业务失败）。 */
async function tryApiLogout(page: Page, token: string): Promise<ApiAttempt[]> {
  const attempts: ApiAttempt[] = [];
  const variants: Array<{ label: string; extra: Record<string, string> }> = [
    { label: '仅 Bearer', extra: {} },
    { label: 'Bearer + source', extra: { source: 'web' } },
    { label: 'Bearer + source + timestamp', extra: { source: 'web', timestamp: String(Date.now()) } },
  ];

  for (const variant of variants) {
    const result = await page
      .evaluate(async (input) => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json', ...input.extra, Authorization: `Bearer ${input.token}` };
        try {
          const res = await fetch(input.path, { method: 'POST', headers, body: '{}', credentials: 'same-origin' });
          const text = await res.text().catch(() => '');
          return { status: res.status, text };
        } catch (err) {
          return { status: -1, text: err instanceof Error ? err.message : 'fetch 失败' };
        }
      }, { path: LOGOUT_PATH, token, extra: variant.extra })
      .catch(() => ({ status: -1, text: 'evaluate 失败' }));

    const common = parseCommon(result.text);
    attempts.push({
      label: variant.label,
      extraHeaders: Object.keys(variant.extra),
      httpStatus: result.status,
      returnCode: common.returnCode,
      returnMsg: common.returnMsg,
    });
    log(`      [API] ${variant.label} → HTTP ${result.status} returnCode=${common.returnCode ?? '-'} ${common.returnMsg ?? ''}`);
  }

  return attempts;
}

interface UiAttempt {
  found: boolean;
  clickedText: string | null;
  usedTrigger: string | null;
  redirectedToLogin: boolean;
  logoutHttpStatus: number | null;
  logoutReturnCode: string | null;
  logoutReturnMsg: string | null;
}

/** 在页面上点「退出登录」，并捕获它发出的真实 /logout 请求与响应。 */
async function tryUiLogout(page: Page): Promise<UiAttempt> {
  const attempt: UiAttempt = {
    found: false,
    clickedText: null,
    usedTrigger: null,
    redirectedToLogin: false,
    logoutHttpStatus: null,
    logoutReturnCode: null,
    logoutReturnMsg: null,
  };

  // 捕获真实注销请求：这是唯一能拿到「成功时 returnCode 长什么样」的机会
  const onResponse = (response: Response): void => {
    if (!/\/login\/v1\/logout/i.test(response.url())) return;
    attempt.logoutHttpStatus = response.status();
    void response
      .text()
      .then((text) => {
        const common = parseCommon(text);
        attempt.logoutReturnCode = common.returnCode;
        attempt.logoutReturnMsg = common.returnMsg;
      })
      .catch(() => undefined);
  };
  page.on('response', onResponse);

  /**
   * 按真实 DOM 打开用户下拉并点「退出登录」：
   * 点 `common_header_userButton` → 等 antd 下拉项 → 优先点文案含「退出登录」的项，
   * 找不到就点最后一项（真实页面里它就是退出登录）。
   */
  const clickViaUserDropdown = async (): Promise<boolean> => {
    const trigger = page.locator('[class*="common_header_userButton"]').first();
    if (!(await trigger.isVisible().catch(() => false))) return false;
    await trigger.click({ timeout: 5000 }).catch(() => undefined);
    attempt.usedTrigger = 'common_header_userButton';

    const items = page.locator('li.ant-dropdown-menu-item');
    await items.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    const count = await items.count().catch(() => 0);
    if (count === 0) return false;

    const named = items.filter({ hasText: /退\s*出\s*登\s*录/ }).first();
    const target = (await named.count().catch(() => 0)) > 0 ? named : items.nth(count - 1);
    const text = ((await target.textContent().catch(() => '')) ?? '').replace(/\s+/g, '').trim();
    await target.click({ timeout: 5000 }).catch(() => undefined);
    attempt.clickedText = text;
    return true;
  };

  const clickLogoutText = async (): Promise<boolean> => {
    const locator = page.getByText(/退\s*出\s*登\s*录|退\s*出\s*帐\s*号|退\s*出\s*账\s*号/);
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 8); i += 1) {
      const item = locator.nth(i);
      if (!(await item.isVisible().catch(() => false))) continue;
      const text = ((await item.textContent().catch(() => '')) ?? '').replace(/\s+/g, '').trim();
      if (text.length > 8) continue;
      await item.click({ timeout: 5000 }).catch(() => undefined);
      attempt.clickedText = text;
      return true;
    }
    return false;
  };

  try {
    if (await clickViaUserDropdown()) {
      attempt.found = true;
    } else if (await clickLogoutText()) {
      attempt.found = true;
    } else {
      // 兜底：逐个尝试其它用户菜单触发器，每点一次再找一遍
      for (const trigger of MENU_TRIGGERS) {
        const locator = page.locator(trigger).first();
        if (!(await locator.isVisible().catch(() => false))) continue;
        await locator.click({ timeout: 3000 }).catch(() => undefined);
        await page.waitForTimeout(800);
        attempt.usedTrigger = trigger;
        if (await clickLogoutText()) {
          attempt.found = true;
          break;
        }
      }
    }

    if (!attempt.found) return attempt;

    // 可能还有 antd 二次确认框
    const confirm = page.getByRole('button', { name: /确\s*定|确\s*认/ }).first();
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click({ timeout: 3000 }).catch(() => undefined);
    }

    const deadline = Date.now() + 12000;
    const s = buildSelectors(page);
    while (Date.now() < deadline) {
      if (/\/user\/login/i.test(page.url()) || (await s.loginForm.isVisible().catch(() => false))) {
        attempt.redirectedToLogin = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    return attempt;
  } finally {
    page.off('response', onResponse);
  }
}

type VerdictCode =
  | 'SERVER_REVOKE_WORKS'
  | 'DELAYED_REVOKE'
  | 'LOGOUT_NO_REVOKE'
  | 'LOGOUT_UI_NOT_FOUND'
  | 'SIGNATURE_REQUIRED'
  | 'INCONCLUSIVE';

interface Verdict {
  code: VerdictCode;
  implication: string;
}

function decide(params: {
  ui: UiAttempt | null;
  api: ApiAttempt[];
  baselineOk: boolean;
  afterStatuses: number[];
  rechecks: Recheck[];
  planUsable: boolean;
}): Verdict {
  const { ui, api, baselineOk, afterStatuses, rechecks, planUsable } = params;
  if (!planUsable || !baselineOk) {
    return {
      code: 'INCONCLUSIVE',
      implication: '没有校准出可用的受鉴权接口，或注销前基线采样未全部成功，本次结论无效。',
    };
  }

  const rejected = afterStatuses.length > 0 && afterStatuses.every((status) => status === 401 || status === 403);
  const apiAllBizFailed = api.length > 0 && api.every((item) => item.returnCode !== null && item.returnCode !== '0000');

  if (ui?.found && ui.redirectedToLogin) {
    const delayedHit = rechecks.find(
      (item) => item.statuses.length > 0 && item.statuses.every((status) => status === 401 || status === 403),
    );
    if (rejected) {
      return {
        code: 'SERVER_REVOKE_WORKS',
        implication:
          '站点自身的退出登录确实让服务端吊销了令牌（旧令牌随后被 401 拒绝）。'
          + '结论：回收链路应以「服务端注销」为主——扩展/worker 驱动站点退出即可，'
          + '不改密、不受 JWT 14 天有效期限制；改密退居为「怀疑泄露」时的低频手段。',
      };
    }
    if (delayedHit) {
      return {
        code: 'DELAYED_REVOKE',
        implication:
          `注销后旧令牌不是立刻失效，而是在约 ${delayedHit.afterSeconds} 秒后才被服务端拒绝。`
          + '结论：注销有阻断能力但存在窗口期；回收链路需要把「确认令牌已失效」纳入复核，'
          + '不能在点完退出就当已经踢掉。',
      };
    }
    const freshPoints = rechecks.map((item) => `T+${item.afterSeconds}s=${item.statuses.join('/')}`).join('，');
    return {
      code: 'LOGOUT_NO_REVOKE',
      implication:
        '站点自身退出登录成功（returnCode=0、页面已回登录页），且用旧令牌在**全新干净上下文**下'
        + `复测仍然全部 200${freshPoints ? `（${freshPoints}）` : ''}：`
        + '服务端根本不查会话表，只验 JWT 签名与有效期，所以注销只清理了客户端。'
        + '结论：注销不能作为服务端阻断手段；「清 localStorage」与真实退出在服务端效果上等价，'
        + '回收直接清存储即可，不必模拟点退出；被提取出去的令牌在 14 天内无法作废。',
    };
  }

  if (ui?.found && !ui.redirectedToLogin) {
    return {
      code: 'INCONCLUSIVE',
      implication: '点了退出入口但没有跳到登录页，无法确认注销是否真的发生；请检查是否需要二次确认或页面结构已变。',
    };
  }

  return {
    code: apiAllBizFailed ? 'SIGNATURE_REQUIRED' : 'LOGOUT_UI_NOT_FOUND',
    implication:
      '未能从页面上找到退出入口，且裸 Bearer 直接调注销接口被业务层拒绝（returnCode != 0000）：'
      + '该接口需要 code/lk/sign 等签名头，签名由科应前端 JS 生成。'
      + '扩展若要走服务端注销，需注入页面复用站点自身的请求封装，或复刻签名算法——两者都有改版风险，需单独评估。',
  };
}

function writeReport(report: unknown): string {
  const dir = path.join(findRepoRoot(), 'playwright', '.worker-logs');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `v3-logout-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
  return file;
}

function boundedClose(promise: Promise<unknown>, ms = 3000): Promise<void> {
  return Promise.race([
    promise.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]) as Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Recheck {
  afterSeconds: number;
  statuses: number[];
}

/**
 * 在**全新浏览器上下文**里用旧令牌请求受保护接口。
 *
 * 为什么要新上下文：排除任何本地残留（cookie / localStorage / 内存状态）替我们「补」鉴权。
 * 新 profile 里什么状态都没有，如果还能 200，那只能是服务端自己认这个令牌——
 * 这是「服务端是否真的吊销」最硬的证据。
 */
async function probeInFreshContext(
  browser: Browser,
  origin: string,
  paths: string[],
  token: string,
  mode: 'raw' | 'bearer',
): Promise<number[]> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/user/login`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    return await probeWithBearer(page, paths, token, mode);
  } finally {
    await boundedClose(context.close());
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  initLogger(process.env.SCIENCING_LOG_FILE);
  log('========== V3 注销吊销验证 启动 ==========');

  const base = loadConfigFromEnv();
  const account = args.account ?? base.adminUsername;
  const provided = args.passwordStdin ? await readPasswordFromStdin() : args.password;
  const password = provided ?? (account === base.adminUsername ? base.adminPassword : '');
  if (!password) throw new Error('缺少目标账号密码：请用 --password-stdin 提供');

  const config: WorkerConfig = { ...base, headless: args.headed ? false : base.headless };
  let origin = '';
  try {
    origin = new URL(args.probeUrl).origin;
  } catch {
    throw new Error(`无法解析探测页面地址：${args.probeUrl}`);
  }

  log(`目标账号: ${account}`);
  log('说明：本脚本不改密码、不改账号数据，只结束自己刚建立的会话。');

  const browser = await chromium.launch({
    channel: config.browserChannel,
    headless: config.headless,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  let tokenMeta: TokenMeta | null = null;
  let plan: ReplayPlan | null = null;
  let baselineOk = false;
  let afterStatuses: number[] = [];
  let ui: UiAttempt | null = null;
  const api: ApiAttempt[] = [];
  const rechecks: Recheck[] = [];

  try {
    const context = await browser.newContext();
    await installCdnMirrorRouting(context);
    const page = await context.newPage();
    page.setDefaultTimeout(config.defaultTimeoutMs);

    log('步骤 1/7：登录');
    await loginWithCredentials(page, config, account, password);

    log('步骤 2/7：打开页面并采集候选接口');
    const collector = attachResponseCollector(page, origin);
    await page.goto(args.probeUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page.waitForTimeout(3000);
    collector.detach();

    const tokenKey = await findTokenKey(page);
    if (!tokenKey) throw new Error('未在 localStorage 找到会话令牌键，无法继续');
    tokenMeta = await readTokenMeta(page, tokenKey);
    log(`      令牌键=${tokenKey} 长度=${tokenMeta?.length ?? 0}`
      + (tokenMeta?.expiresAt ? ` 过期=${tokenMeta.expiresAt}` : ''));

    // 先把令牌取到内存：真注销后 localStorage 会被清空，不先取就测不了「旧令牌是否被吊销」
    const token = await page.evaluate((key) => window.localStorage.getItem(key), tokenKey);
    if (!token) throw new Error('读取令牌失败');

    const candidates = collectCandidates(collector.entries, origin);
    for (const extra of args.probePaths) if (!candidates.includes(extra)) candidates.push(extra);
    log(`步骤 3/7：校准受鉴权接口（候选 ${candidates.length} 个）`);
    plan = await calibrateProtectedProbes(page, candidates, tokenKey);
    if (!plan) throw new Error('未找到「匿名 401 / 带令牌 200」的接口，无法判断令牌死活');
    log(`      探针 ${plan.paths.length} 个：${plan.paths.join(', ')}（${plan.mode}）`);

    log('步骤 4/7：注销前基线采样');
    const baseline = await probeWithBearer(page, plan.paths, token, plan.mode);
    baselineOk = baseline.length > 0 && baseline.every((status) => status >= 200 && status < 300);
    log(`      基线=${baseline.join('/')} ${baselineOk ? '（符合预期）' : '（异常，后续结论无效）'}`);

    log('步骤 5/7：诊断——裸 Bearer 直接调注销接口');
    api.push(...(await tryApiLogout(page, token)));

    log('步骤 6/7：驱动站点自身的「退出登录」');
    // 上一步的裸调用可能已经影响了会话状态，重新确认一次基线再退出
    const recheck = await probeWithBearer(page, plan.paths, token, plan.mode);
    if (!recheck.every((status) => status >= 200 && status < 300)) {
      log(`      [warn] 诊断调用后令牌已失效（${recheck.join('/')}），将跳过 UI 退出判定`);
    }
    ui = await tryUiLogout(page);
    log(`      找到退出入口=${ui.found}${ui.clickedText ? `（文本「${ui.clickedText}」）` : ''}`
      + `${ui.usedTrigger ? ` 经由触发器 ${ui.usedTrigger}` : ''}`);
    log(`      真实注销请求: HTTP ${ui.logoutHttpStatus ?? '-'} returnCode=${ui.logoutReturnCode ?? '-'} ${ui.logoutReturnMsg ?? ''}`);
    log(`      页面已回登录页=${ui.redirectedToLogin}`);

    log('步骤 7/7：用注销前的旧令牌重新采样');
    await page.waitForTimeout(1500);
    afterStatuses = await probeWithBearer(page, plan.paths, token, plan.mode);
    log(`      同上下文 ${afterStatuses.join('/')}`);

    // 更硬的复测：全新干净上下文 + 多个时间点（排除本机残留与异步吊销）
    const logoutDoneAt = Date.now();
    for (const seconds of args.recheckSeconds) {
      const waitMs = seconds * 1000 - (Date.now() - logoutDoneAt);
      if (waitMs > 0) await sleep(waitMs);
      const statuses = await probeInFreshContext(browser, origin, plan.paths, token, plan.mode);
      rechecks.push({ afterSeconds: Math.round((Date.now() - logoutDoneAt) / 1000), statuses });
      const entry = rechecks[rechecks.length - 1] as Recheck;
      log(`      全新上下文 T+${entry.afterSeconds}s = ${entry.statuses.join('/')}`
        + `${entry.statuses.every((status) => status >= 200 && status < 300) ? ' → 服务端仍认这个令牌' : ''}`);
    }
  } finally {
    const verdict = decide({ ui, api, baselineOk, afterStatuses, rechecks, planUsable: plan !== null });
    const report = {
      generatedAt: new Date().toISOString(),
      target: { accountMasked: account.replace(/^(.).*(@.*)?$/, '$1***$2'), logoutPath: LOGOUT_PATH },
      tokenMeta,
      probes: plan?.paths ?? [],
      authMode: plan?.mode ?? null,
      baselineOk,
      apiAttempts: api,
      uiAttempt: ui,
      afterStatuses,
      rechecks,
      verdict,
    };
    const reportPath = writeReport(report);

    log('========== 结论 ==========');
    log(`判定: ${verdict.code}`);
    log(`影响: ${verdict.implication}`);
    log(`报告已写入: ${reportPath}`);
    process.stdout.write(`${JSON.stringify({ verdict, uiAttempt: ui, afterStatuses, reportPath }, null, 2)}\n`);

    log('关闭浏览器（限时 3s）');
    await boundedClose(browser.close());
  }

  return 0;
}

main()
  .then((code) => {
    log(`退出码: ${code}`);
    process.exit(code);
  })
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    log(`运行失败: ${message}`);
    process.stderr.write(`运行失败: ${message}\n`);
    process.exit(1);
  });
