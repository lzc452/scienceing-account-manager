/**
 * V1 验证：清除浏览器端状态能否真正让科应登出（COOKIE-PRD §8 V1 / P0-2）
 *
 * 为什么需要这一步
 *   账号回收方案要把「改密」从每次回收的必经环节降级为异常兜底，前提是
 *   「清 cookie / localStorage + 重新打开页面 = 已登出」。这个前提从未被验证过，
 *   COOKIE-PRD 把 V1 列为地基：不通过则「DIRTY 门禁 + 清理确认」整套不成立。
 *
 * 本脚本做四件事
 *   1. 用真实账号登录一次，摸清科应把会话放在哪里（Cookie / Web Storage / SW+IndexedDB / CacheStorage）；
 *   2. 按「最小充分集」做消融实验：清 Cookie → 清 Web Storage → 注销 SW + 删 IDB；
 *      每步都重新打开受保护页面，判断是否仍处登录态；
 *   3. 用对照组（不清任何东西、只重开页面）排除「仅仅是重开就掉登录」的误判；
 *   4. 输出结论矩阵与对回收方案的直接影响。
 *
 * 2026-11-09 首轮实测结论（写在代码里，避免后人重复踩坑）
 *   - 科应**没有会话 Cookie**：9 个 cookie 全是埋点/设备标识（accessId 长度 36，与 uuid 同类）；
 *     会话令牌在 localStorage：`Authorization`（约 10.6KB）、`NONCE`、`LK`。
 *   - 只清 Cookie 不掉线（符合上一条）；清 localStorage 后页面**停在原 URL、不跳登录页、
 *     登录表单也不出现**，只渲染空壳 —— 因此「看 URL / 看密码框」这种判定方式会把
 *     「已失去登录态」误判成 unknown。本版改为**以同源 XHR/Fetch 的 401/403 为准**。
 *   - IndexedDB `global-db` 的删除会被打开中的连接阻塞（首轮 `idb delete=false`，
 *     那一步实际什么都没清到，结论无效）。本版删除前先导航到同源静默页卸载 SPA。
 *
 * 设计约束（改动前请先读）
 *   - **只登录一次**：反复登录本身就是本方案要规避的风控行为。变体之间用快照/回填恢复，
 *     而不是每次重新登录。
 *   - **绝不打印凭据/令牌值**：Cookie 与 storage 只输出键名与长度，报告可安全归档。
 *   - **不写 storageState**：不得覆盖改密 Worker 复用的 playwright/.auth/admin.json。
 *   - **破坏性步骤排最后**：删 IndexedDB 不可回填，必须放在 Cookie / Web Storage 判定之后。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium, type BrowserContext, type Page, type Response } from 'playwright';
import { loadConfigFromEnv, type WorkerConfig } from './config';
import { loginAdmin } from './auth';
import { installCdnMirrorRouting } from './cdn-mirror';
import { buildSelectors } from './selectors';
import { initLogger, log, findRepoRoot } from './logger';

/** 科应域名后缀：清 Cookie 只针对这些域（与扩展 chrome.cookies 的作用范围一致）。 */
const DOMAIN_SUFFIXES = ['scienceing.com'];

/** 会话相关 Cookie 名候选（仅用于提示后续「定向删除」是否可行，不做任何过滤）。 */
const SESSION_COOKIE_PATTERN = /sess|token|auth|sid|jwt|ticket|login|csrf|xsrf/i;

type Verdict = 'logged-in' | 'logged-out' | 'unknown';

/** 导航期间观测到的一条同源响应。 */
interface NetEntry {
  url: string;
  status: number;
  method: string;
  type: string;
}

interface AuthProbe {
  verdict: Verdict;
  url: string;
  loginFormVisible: boolean;
  accountReadyVisible: boolean;
  logoutEntryVisible: boolean;
  /** localStorage 里是否还留着形似令牌的键（键名可查，值绝不输出）。 */
  authKeyPresent: boolean;
  /** 同源 XHR/Fetch 中被服务端拒绝（401/403）的请求数。 */
  rejectedCalls: number;
  /** 同源 XHR/Fetch 中成功（2xx）的请求数。注意：含公开接口，不能单独作为「已登录」依据。 */
  authorizedCalls: number;
  /** 观测到的同源 API 路径与状态（只记 pathname，不含查询串与令牌）。 */
  apiPaths: Array<{ path: string; status: number; method: string }>;
  /** 主动重放鉴权接口的结果（仅在给出 ReplayPlan 时存在）。 */
  replay?: Array<{ path: string; status: number }>;
  /** 重放中被 401/403 拒绝的次数——判定「会话是否已死」的硬证据。 */
  rejectedReplay: number;
  /** 判定为 unknown 时的现场摘要（截断，仅用于排查）。 */
  evidence?: string;
}

/** 重放计划：用「当前页面自己的 localStorage 状态」去请求对照阶段成功过的接口。 */
interface ReplayPlan {
  /** 对照阶段成功过的业务接口 pathname（同源，可直接 fetch）。 */
  urls: string[];
  /** 存放令牌的 localStorage 键名。 */
  tokenKey: string;
  /** 已校准的请求头格式：裸 token 还是 Bearer。 */
  mode: 'raw' | 'bearer';
}

interface CookieInfo {
  name: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
  /** 只在报告里给长度：值是凭据，不落盘。 */
  valueLength: number;
}

interface StorageInventory {
  cookies: CookieInfo[];
  /** 名称看起来像会话载体的 Cookie（供后续定向删除参考）。 */
  sessionCookieCandidates: string[];
  /** 键名 → 值长度。 */
  localStorage: Record<string, number>;
  sessionStorage: Record<string, number>;
  indexedDb: Array<{ name: string | null; version: number | null }>;
  cacheStorage: string[];
  serviceWorkerScopes: string[];
  /** 页面上是否存在「退出登录」类入口（后续实现主动登出时可用）。 */
  logoutEntries: Array<{ text: string; tag: string; href: string | null }>;
}

interface VariantResult {
  id: string;
  label: string;
  cleared: string[];
  probe: AuthProbe;
  /** 回填后再次判定（仅可回填的变体有）。 */
  restoredTo?: Verdict;
  notes: string[];
}

interface Decision {
  code: string;
  minSufficientSet: string[];
  implication: string;
  /** 回收方案（DIRTY + 清理确认）是否成立。 */
  dirtyGateFeasible: boolean;
  /** 清理是否必须在科应页面上下文执行（决定「标签页已关闭」能否清）。 */
  requiresPageContext: boolean;
}

interface ParsedArgs {
  username?: string;
  password?: string;
  passwordStdin: boolean;
  probeUrl?: string;
  headed: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { passwordStdin: false, headed: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--username' || arg === '-u') args.username = argv[++i];
    else if (arg === '--password' || arg === '-p') args.password = argv[++i];
    else if (arg === '--password-stdin') args.passwordStdin = true;
    else if (arg === '--probe-url') args.probeUrl = argv[++i];
    else if (arg === '--headed') args.headed = true;
  }
  return args;
}

async function readPasswordFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

/**
 * 判定当前页面是否处于登录态。
 *
 * 判定顺序（先命中者定性）：
 *  1. URL 落在 /user/login 或登录表单可见 → 未登录（硬信号）；
 *  2. 重放的鉴权接口被 401/403 → 服务端已不认这个会话 → 未登录（最硬的证据）；
 *  3. 导航期间观测到 401/403 且没有任何 2xx → 未登录；
 *  4. 账号列表筛选容器 / 「退出登录」入口可见 → 已登录；
 *  5. 重放的鉴权接口全部 2xx → 已登录。
 * 其余报 unknown 并附现场摘要。
 *
 * 为什么不能只看「有没有 2xx」：清空 localStorage 后科应 SPA 不跳登录页、只渲染空壳，
 * 但公开接口（配置/搜索建议）照样返回 2xx，把它当「已登录」会得到假阳性（首轮踩过）。
 * 只有「同一个接口在对照阶段成功、现在 401」才是真凭据。
 */
async function probeAuth(
  page: Page,
  timeoutMs: number,
  entries: NetEntry[],
  plan: ReplayPlan | null,
): Promise<AuthProbe> {
  const url = page.url();
  const s = buildSelectors(page);
  const loginFormVisible = await s.loginForm.isVisible().catch(() => false);
  const accountReadyVisible = await s.accountPageReady
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
  const logoutEntryVisible = await page
    .getByText(/退出登录|退出帐号|退出账号|注销/)
    .first()
    .isVisible()
    .catch(() => false);

  const authKeyPresent = await page
    .evaluate(() => Object.keys(window.localStorage).some((key) => /authorization|token|jwt|session/i.test(key)))
    .catch(() => false);

  const apiCalls = entries.filter((entry) => entry.type === 'xhr' || entry.type === 'fetch');
  const rejectedCalls = apiCalls.filter((entry) => entry.status === 401 || entry.status === 403).length;
  const authorizedCalls = apiCalls.filter((entry) => entry.status >= 200 && entry.status < 300).length;
  const apiPaths = apiCalls.map((entry) => {
    let path = entry.url;
    try {
      path = new URL(entry.url).pathname;
    } catch {
      // 保留原值
    }
    return { path, status: entry.status, method: entry.method };
  });

  const replay = plan ? await runReplay(page, plan) : null;
  const rejectedReplay = (replay ?? []).filter((item) => item.status === 401 || item.status === 403).length;
  const replayAllOk = (replay ?? []).length > 0 && (replay ?? []).every((item) => item.status >= 200 && item.status < 300);

  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // about:blank 等非标准 URL：保持原样，交给下面的硬信号判断
  }

  let verdict: Verdict = 'unknown';
  if (/\/user\/login/i.test(pathname) || loginFormVisible) {
    verdict = 'logged-out';
  } else if (rejectedReplay > 0) {
    verdict = 'logged-out';
  } else if (rejectedCalls > 0 && authorizedCalls === 0) {
    verdict = 'logged-out';
  } else if (accountReadyVisible || logoutEntryVisible) {
    verdict = 'logged-in';
  } else if (replayAllOk) {
    verdict = 'logged-in';
  }

  const probe: AuthProbe = {
    verdict,
    url,
    loginFormVisible,
    accountReadyVisible,
    logoutEntryVisible,
    authKeyPresent,
    rejectedCalls,
    authorizedCalls,
    apiPaths,
    rejectedReplay,
  };
  if (replay) probe.replay = replay;

  if (verdict === 'unknown') {
    probe.evidence = await page
      .evaluate(() => {
        const title = document.title || '';
        const text = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
        return `title=${title} | body=${text}`;
      })
      .catch(() => 'evaluate 失败（页面可能正在跳转）');
  }

  return probe;
}

/**
 * 重放对照阶段成功过的业务接口。
 *
 * 关键点：请求头用的是**当前页面自己的 localStorage**——清空后自然没有令牌，
 * 于是请求不带 Authorization，服务端返回 401 即证明会话真的死了。
 * 令牌值全程不离开页面上下文，Node 侧只拿到状态码。
 */
async function runReplay(page: Page, plan: ReplayPlan): Promise<Array<{ path: string; status: number }> | null> {
  return page
    .evaluate(async (input) => {
      const headers: Record<string, string> = {};
      const raw = window.localStorage.getItem(input.tokenKey);
      if (raw) headers.Authorization = input.mode === 'bearer' ? `Bearer ${raw}` : raw;
      const out: Array<{ path: string; status: number }> = [];
      for (const target of input.urls) {
        try {
          const res = await fetch(target, { method: 'GET', headers, credentials: 'same-origin' });
          out.push({ path: target, status: res.status });
        } catch {
          out.push({ path: target, status: -1 });
        }
      }
      return out;
    }, plan)
    .catch(() => null);
}

/**
 * 校准重放计划：确认「登录态下」这些接口确实返回 2xx，并试出 Authorization 的格式
 * （裸 token 还是 `Bearer <token>`）。校准不出来就返回 null，后续只靠 DOM 信号判定，
 * 并在报告里标注——宁可报 unknown，也不要拿一个没校准的探针当结论。
 */
async function calibrateReplay(page: Page, urls: string[], tokenKey: string): Promise<ReplayPlan | null> {
  if (urls.length === 0) return null;
  const calibrated = await page
    .evaluate(async (input) => {
      const raw = window.localStorage.getItem(input.tokenKey);
      if (!raw) return null;
      for (const mode of ['raw', 'bearer'] as const) {
        const headers: Record<string, string> = { Authorization: mode === 'bearer' ? `Bearer ${raw}` : raw };
        for (const target of input.urls) {
          try {
            const res = await fetch(target, { method: 'GET', headers, credentials: 'same-origin' });
            if (res.status >= 200 && res.status < 300) return { mode };
          } catch {
            // 换下一个候选
          }
        }
      }
      return null;
    }, { urls, tokenKey })
    .catch(() => null);
  if (!calibrated) return null;
  log(`      重放探针已校准: mode=${calibrated.mode}，接口 ${urls.length} 个`);
  return { urls, tokenKey, mode: calibrated.mode };
}

/** 从对照阶段的观测结果里挑出可重放的业务接口（只取 GET、排除危险动词）。 */
function buildReplayBaseline(probe: AuthProbe): string[] {
  const ok = probe.apiPaths.filter((item) => item.status >= 200 && item.status < 300);
  const preferred = ok.filter((item) => /account|user|info|me|list|query|search/i.test(item.path));
  const picked: string[] = [];
  for (const item of [...preferred, ...ok]) {
    if (!item.path.startsWith('/')) continue;
    if (/logout|reset|delete|remove|update|save|create/i.test(item.path)) continue;
    if (picked.includes(item.path)) continue;
    picked.push(item.path);
    if (picked.length >= 4) break;
  }
  return picked;
}

/**
 * 重新打开受保护页面并判定（模拟「用户收回标签页/重新访问」）。
 * 导航期间挂载同源响应监听，收集 401/403 与 2xx 证据。
 */
async function reopen(page: Page, url: string, timeoutMs: number, plan: ReplayPlan | null = null): Promise<AuthProbe> {
  const entries: NetEntry[] = [];
  let origin = '';
  try {
    origin = new URL(url).origin;
  } catch {
    origin = '';
  }

  const onResponse = (response: Response): void => {
    try {
      const request = response.request();
      const type = request.resourceType();
      if (type !== 'xhr' && type !== 'fetch' && type !== 'document') return;
      const target = response.url();
      if (origin && !target.startsWith(origin)) return;
      entries.push({ url: target, status: response.status(), method: request.method(), type });
    } catch {
      // 响应在页面跳转中被丢弃，忽略
    }
  };

  page.on('response', onResponse);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    // 给 SPA 路由、鉴权重定向与业务请求留时间，避免在跳转中途判定
    await page.waitForTimeout(2500);
    return await probeAuth(page, Math.min(timeoutMs, 8000), entries, plan);
  } finally {
    page.off('response', onResponse);
  }
}

/** 单行描述一次探测：判定 + 关键计数 + 重放结果 + unknown 时的现场摘要。 */
function describeProbe(probe: AuthProbe): string {
  const base = `${probe.verdict} (令牌键=${probe.authKeyPresent ? '有' : '无'} 401/403=${probe.rejectedCalls} 2xx=${probe.authorizedCalls}`;
  const replay = probe.replay
    ? ` 重放=${probe.replay.map((item) => `${item.status}`).join('/')}`
    : ' 重放=未启用';
  const suffix = `${replay})`;
  return probe.evidence ? `${base}${suffix} 现场=${probe.evidence}` : `${base}${suffix}`;
}

async function collectInventory(context: BrowserContext, page: Page): Promise<StorageInventory> {
  const rawCookies = await context.cookies();
  const cookies: CookieInfo[] = rawCookies.map((cookie) => ({
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: String(cookie.sameSite),
    valueLength: cookie.value.length,
  }));

  const webStorage = await page
    .evaluate(() => {
      const dump = (store: Storage): Record<string, number> => {
        const out: Record<string, number> = {};
        for (let i = 0; i < store.length; i += 1) {
          const key = store.key(i);
          if (key === null) continue;
          out[key] = (store.getItem(key) ?? '').length;
        }
        return out;
      };
      return { localStorage: dump(window.localStorage), sessionStorage: dump(window.sessionStorage) };
    })
    .catch(() => ({ localStorage: {}, sessionStorage: {} }));

  const idb = await page
    .evaluate(async () => {
      const factory = indexedDB as IDBFactory & { databases?: () => Promise<IDBDatabaseInfo[]> };
      if (typeof factory.databases !== 'function') return [];
      const dbs = await factory.databases();
      return dbs.map((db) => ({ name: db.name ?? null, version: db.version ?? null }));
    })
    .catch(() => [] as Array<{ name: string | null; version: number | null }>);

  const swAndCache = await page
    .evaluate(async () => {
      const regs = typeof navigator.serviceWorker?.getRegistrations === 'function'
        ? await navigator.serviceWorker.getRegistrations()
        : [];
      const cacheNames = typeof caches?.keys === 'function' ? await caches.keys() : [];
      return { scopes: regs.map((reg) => reg.scope), cacheNames };
    })
    .catch(() => ({ scopes: [] as string[], cacheNames: [] as string[] }));

  const logoutEntries = await page
    .evaluate(() => {
      const out: Array<{ text: string; tag: string; href: string | null }> = [];
      const nodes = Array.from(document.querySelectorAll('a,button,div,span,li'));
      for (const node of nodes) {
        const text = (node.textContent ?? '').trim();
        if (!text || text.length > 12) continue;
        if (!/退出登录|退出帐号|退出账号/.test(text)) continue;
        out.push({
          text,
          tag: node.tagName.toLowerCase(),
          href: node instanceof HTMLAnchorElement ? node.getAttribute('href') : null,
        });
        if (out.length >= 5) break;
      }
      return out;
    })
    .catch(() => [] as Array<{ text: string; tag: string; href: string | null }>);

  return {
    cookies,
    sessionCookieCandidates: cookies.map((cookie) => cookie.name).filter((name) => SESSION_COOKIE_PATTERN.test(name)),
    localStorage: webStorage.localStorage,
    sessionStorage: webStorage.sessionStorage,
    indexedDb: idb,
    cacheStorage: swAndCache.cacheNames,
    serviceWorkerScopes: swAndCache.scopes,
    logoutEntries,
  };
}

interface SavedState {
  cookies: Awaited<ReturnType<BrowserContext['cookies']>>;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

async function saveState(context: BrowserContext, page: Page): Promise<SavedState> {
  const cookies = await context.cookies();
  const storage = await page
    .evaluate(() => {
      const dump = (store: Storage): Record<string, string> => {
        const out: Record<string, string> = {};
        for (let i = 0; i < store.length; i += 1) {
          const key = store.key(i);
          if (key === null) continue;
          out[key] = store.getItem(key) ?? '';
        }
        return out;
      };
      return { localStorage: dump(window.localStorage), sessionStorage: dump(window.sessionStorage) };
    })
    .catch(() => ({ localStorage: {} as Record<string, string>, sessionStorage: {} as Record<string, string> }));
  return { cookies, localStorage: storage.localStorage, sessionStorage: storage.sessionStorage };
}

/**
 * 回填客户端状态，让后续变体从同一基线出发。
 * 必须在同源页面上执行（登录页也行）；Cookie 走 context 级 API，页面无关。
 */
async function restoreState(context: BrowserContext, page: Page, saved: SavedState): Promise<void> {
  await context.clearCookies();
  if (saved.cookies.length > 0) await context.addCookies(saved.cookies);
  await page
    .evaluate((state) => {
      window.localStorage.clear();
      for (const [key, value] of Object.entries(state.localStorage)) window.localStorage.setItem(key, value);
      window.sessionStorage.clear();
      for (const [key, value] of Object.entries(state.sessionStorage)) window.sessionStorage.setItem(key, value);
    }, { localStorage: saved.localStorage, sessionStorage: saved.sessionStorage })
    .catch(() => undefined);
}

/** 按域名清 Cookie（等价于扩展里 chrome.cookies.remove 的作用范围）。 */
async function clearScienceingCookies(context: BrowserContext): Promise<string[]> {
  const all = await context.cookies();
  const removed: string[] = [];
  for (const cookie of all) {
    const host = cookie.domain.replace(/^\./, '');
    const matched = DOMAIN_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
    if (!matched) continue;
    await context.clearCookies({ name: cookie.name, domain: cookie.domain, path: cookie.path });
    removed.push(`${cookie.name}@${cookie.domain}`);
  }
  return removed;
}

async function clearWebStorage(page: Page): Promise<string[]> {
  const cleared = await page
    .evaluate(() => {
      const ls = window.localStorage.length;
      const ss = window.sessionStorage.length;
      window.localStorage.clear();
      window.sessionStorage.clear();
      return { ls, ss };
    })
    .catch(() => ({ ls: 0, ss: 0 }));
  return [`localStorage(${cleared.ls} 项)`, `sessionStorage(${cleared.ss} 项)`];
}

/**
 * 注销 Service Worker、清 CacheStorage、删 IndexedDB。不可回填，必须最后执行。
 *
 * 先导航到同源的「静默页」（默认 /robots.txt，非 SPA）：
 * IndexedDB 的打开连接会让 deleteDatabase 永远停在 onblocked（首轮实测 idb delete=false，
 * 那一步实际什么都没清，结论因此无效）。必须让应用页先卸载、连接释放，删除才可能成功。
 * 删除后再枚举一次做复核，避免把「假成功」写进结论。
 */
async function clearServiceWorkerAndIdb(page: Page, origin: string): Promise<string[]> {
  const quiescentUrl = `${origin}/robots.txt`;
  await page.goto(quiescentUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.waitForTimeout(400);

  const notes = await page
    .evaluate(async () => {
      const out: string[] = [];
      if (typeof navigator.serviceWorker?.getRegistrations === 'function') {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          const ok = await reg.unregister().catch(() => false);
          out.push(`SW unregister(${reg.scope})=${ok}`);
        }
      }
      if (typeof caches?.keys === 'function') {
        const names = await caches.keys();
        for (const name of names) {
          const ok = await caches.delete(name).catch(() => false);
          out.push(`cache delete(${name})=${ok}`);
        }
      }
      const factory = indexedDB as IDBFactory & { databases?: () => Promise<IDBDatabaseInfo[]> };
      if (typeof factory.databases === 'function') {
        const dbs = await factory.databases();
        for (const db of dbs) {
          if (!db.name) continue;
          const ok = await new Promise<boolean>((resolve) => {
            const req = indexedDB.deleteDatabase(db.name as string);
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
            req.onblocked = () => resolve(false);
            setTimeout(() => resolve(false), 3000);
          });
          out.push(`idb delete(${db.name})=${ok}`);
        }
        const remaining = await factory.databases();
        out.push(`remaining idb=[${remaining.map((db) => db.name ?? '(anonymous)').join(',')}]`);
      }
      return out;
    })
    .catch(() => ['evaluate 失败：可能页面正在跳转']);

  return notes;
}

/**
 * 归因结论：找出「最小充分清除集」。
 * 顺序即判定优先级——先命中者即最小集，后续步骤不再作为结论依据。
 */
function decide(results: VariantResult[]): Decision {
  const byId = new Map(results.map((result) => [result.id, result]));
  const loggedOut = (id: string): boolean => byId.get(id)?.probe.verdict === 'logged-out';

  if (loggedOut('cookies')) {
    return {
      code: 'COOKIE_ONLY',
      minSufficientSet: ['清除 scienceing 域 Cookie'],
      implication:
        '会话仅靠 Cookie 承载：扩展用 chrome.cookies.remove 即可让旧标签失效，'
        + '不需要页面上下文、不需要标签页仍开着 → DIRTY 门禁可行，清理确认可由后台 Service Worker 独立完成。',
      dirtyGateFeasible: true,
      requiresPageContext: false,
    };
  }
  if (loggedOut('web-storage')) {
    return {
      code: 'WEB_STORAGE_REQUIRED',
      minSufficientSet: ['清 localStorage/sessionStorage（Cookie 不足以登出）'],
      implication:
        '会话不在 Cookie 里，必须清 Web Storage。清理必须发生在科应页面上下文（content script / chrome.scripting），'
        + '「标签页已关闭」时无法用这种方式清理 → DIRTY 门禁需要「下次打开补清理」、'
        + '或改用不需要页面的清除通道（如扩展 browsingData API，需另行验证）。'
        + '另注意：清空后科应不跳登录页、只渲染空壳，登出判定必须靠鉴权请求结果，不能看 URL。',
      dirtyGateFeasible: true,
      requiresPageContext: true,
    };
  }
  if (loggedOut('sw-idb')) {
    return {
      code: 'SW_OR_IDB_REQUIRED',
      minSufficientSet: ['注销 Service Worker / 清 CacheStorage / 删 IndexedDB'],
      implication:
        '会话寄存在 SW 或 IndexedDB 中：仅清 Cookie 与 Web Storage 不够，必须删 IDB 并重载。'
        + '删除 IDB 会被打开中的连接阻塞，成功率与时机都不可控 → 不建议作为回收主路径，'
        + '应优先确认科应是否有服务端强制下线手段。',
      dirtyGateFeasible: false,
      requiresPageContext: true,
    };
  }
  if (loggedOut('all')) {
    return {
      code: 'COMBINED_REQUIRED',
      minSufficientSet: ['Cookie', 'Web Storage', 'Service Worker / IndexedDB 全部清除'],
      implication:
        '必须成套清除全部客户端状态才能登出：扩展清理需多步全成功，任一步失败即视为未清理。'
        + 'DIRTY 门禁可做但可用性风险高，建议同时保留改密兜底。',
      dirtyGateFeasible: true,
      requiresPageContext: true,
    };
  }
  return {
    code: 'UNKILLABLE',
    minSufficientSet: ['无（客户端清除后仍为登录态）'],
    implication:
      '清除全部客户端状态后仍处登录态：COOKIE-PRD 的 P0-2 前提不成立，「DIRTY + 清理确认」方案不可用。'
      + '必须改用服务端手段（改密 / 强制下线接口），或退回「超时即改密」的保守策略。',
    dirtyGateFeasible: false,
    requiresPageContext: false,
  };
}

function writeReport(report: unknown): string {
  const dir = path.join(findRepoRoot(), 'playwright', '.worker-logs');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `v1-session-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
  return file;
}

function boundedClose(promise: Promise<unknown>, ms = 3000): Promise<void> {
  return Promise.race([
    promise.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]) as Promise<void>;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  initLogger(process.env.SCIENCING_LOG_FILE);
  log('========== V1 会话失效验证 启动 ==========');

  const base = loadConfigFromEnv();
  const password = args.passwordStdin ? await readPasswordFromStdin() : args.password;
  const config: WorkerConfig = {
    ...base,
    adminUsername: args.username ?? base.adminUsername,
    adminPassword: password ?? base.adminPassword,
    headless: args.headed ? false : base.headless,
  };
  const probeUrl = args.probeUrl ?? config.adminUrl;
  let origin = '';
  try {
    origin = new URL(probeUrl).origin;
  } catch {
    throw new Error(`无法解析探测页面地址：${probeUrl}`);
  }

  log(`登录账号: ${config.adminUsername}`);
  log(`探测页面: ${probeUrl}`);
  log(`浏览器: channel=${config.browserChannel} headless=${config.headless}`);
  log('注意：本次登录可能触发科应单点冲突，从而踢掉同一账号在其他位置的会话。');

  const browser = await chromium.launch({
    channel: config.browserChannel,
    headless: config.headless,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const context = await browser.newContext();
    await installCdnMirrorRouting(context);
    const page = await context.newPage();
    page.setDefaultTimeout(config.defaultTimeoutMs);

    log('步骤 1/4：登录（仅此一次，后续变体靠快照回填，避免反复登录触发风控）');
    await loginAdmin(page, config);
    log('登录完成');

    log('步骤 2/4：采集会话存储清单（只记录键名与长度，不记录值）');
    const inventory = await collectInventory(context, page);
    log(`  Cookie ${inventory.cookies.length} 个；localStorage ${Object.keys(inventory.localStorage).length} 项；`
      + `sessionStorage ${Object.keys(inventory.sessionStorage).length} 项；`
      + `IndexedDB ${inventory.indexedDb.length} 个；SW ${inventory.serviceWorkerScopes.length} 个；`
      + `CacheStorage ${inventory.cacheStorage.length} 个`);

    const results: VariantResult[] = [];

    log('步骤 3/4：对照组（不清除任何状态，仅重新打开页面）');
    const controlProbe = await reopen(page, probeUrl, config.defaultTimeoutMs);
    results.push({ id: 'control', label: '不清除，仅重开页面', cleared: [], probe: controlProbe, notes: [] });
    log(`  对照结果: ${describeProbe(controlProbe)} @${controlProbe.url}`);
    if (controlProbe.verdict !== 'logged-in') {
      throw new Error('对照组未判定为登录态：本次消融无效（登录未生效或探测页无权限），请检查账号与 --probe-url');
    }

    const saved = await saveState(context, page);

    // 校准重放探针：用对照阶段成功过的接口 + 当前令牌，试出 Authorization 头格式。
    // 校准失败（例如接口其实不需要鉴权）时退回纯 DOM 判定，并在报告里标注，不硬编结论。
    const tokenKey = Object.keys(inventory.localStorage).find((key) => /authorization/i.test(key))
      ?? Object.keys(inventory.localStorage).find((key) => /token|jwt|session/i.test(key))
      ?? '';
    const baseline = buildReplayBaseline(controlProbe);
    const replayPlan = tokenKey ? await calibrateReplay(page, baseline, tokenKey) : null;
    if (!replayPlan) {
      log('  [warn] 重放探针未校准成功：后续判定退回 DOM 信号，结论可信度较低');
    }

    log('步骤 4/4：变体消融');

    // 变体 A：只清 Cookie
    log('  [A] 清 scienceing 域 Cookie');
    const removedCookies = await clearScienceingCookies(context);
    const aProbe = await reopen(page, probeUrl, config.defaultTimeoutMs, replayPlan);
    const aResult: VariantResult = {
      id: 'cookies',
      label: '清 scienceing 域 Cookie',
      cleared: removedCookies,
      probe: aProbe,
      notes: [],
    };
    log(`      ${removedCookies.length} 个 cookie，结果=${describeProbe(aProbe)}`);
    if (aProbe.verdict !== 'logged-out') {
      await restoreState(context, page, saved);
      const restored = await reopen(page, probeUrl, config.defaultTimeoutMs, replayPlan);
      aResult.restoredTo = restored.verdict;
      log(`      回填后=${describeProbe(restored)}`);
      if (restored.verdict !== 'logged-in') {
        results.push(aResult);
        throw new Error('回填 Cookie 后仍未恢复登录态，无法继续后续变体；请重跑（会产生一次登录）');
      }
    }
    results.push(aResult);

    // 变体 B：只清 Web Storage（A 已登出时跳过，结论已定为 COOKIE_ONLY）
    if (aProbe.verdict !== 'logged-out') {
      log('  [B] 清 localStorage + sessionStorage');
      const cleared = await clearWebStorage(page);
      const bProbe = await reopen(page, probeUrl, config.defaultTimeoutMs, replayPlan);
      const bResult: VariantResult = {
        id: 'web-storage',
        label: '清 localStorage + sessionStorage',
        cleared,
        probe: bProbe,
        notes: [],
      };
      log(`      结果=${describeProbe(bProbe)}`);
      if (bProbe.verdict !== 'logged-out') {
        await restoreState(context, page, saved);
        const restored = await reopen(page, probeUrl, config.defaultTimeoutMs, replayPlan);
        bResult.restoredTo = restored.verdict;
        log(`      回填后=${describeProbe(restored)}`);
        if (restored.verdict !== 'logged-in') {
          results.push(bResult);
          throw new Error('回填 Web Storage 后仍未恢复登录态，无法继续后续变体；请重跑');
        }
      }
      results.push(bResult);

      // 变体 C：注销 SW + 清 CacheStorage + 删 IndexedDB（破坏性，不回填）
      if (bProbe.verdict !== 'logged-out') {
        log('  [C] 注销 SW + 清 CacheStorage + 删 IndexedDB（不可回填）');
        const notes = await clearServiceWorkerAndIdb(page, origin);
        for (const note of notes) log(`      ${note}`);
        const cProbe = await reopen(page, probeUrl, config.defaultTimeoutMs, replayPlan);
        results.push({
          id: 'sw-idb',
          label: '注销 SW + 清 CacheStorage + 删 IndexedDB',
          cleared: notes,
          probe: cProbe,
          notes: [],
        });
        log(`      结果=${describeProbe(cProbe)}`);

        // 变体 D：全部一起清（再清一遍 Cookie/Storage，排除 C 的删除被阻塞）
        if (cProbe.verdict !== 'logged-out') {
          log('  [D] 全部一起清（Cookie + Web Storage + SW/IDB）');
          const allCleared: string[] = [];
          allCleared.push(...(await clearScienceingCookies(context)));
          allCleared.push(...(await clearWebStorage(page)));
          allCleared.push(...(await clearServiceWorkerAndIdb(page, origin)));
          const dProbe = await reopen(page, probeUrl, config.defaultTimeoutMs, replayPlan);
          results.push({
            id: 'all',
            label: '全部清除',
            cleared: allCleared,
            probe: dProbe,
            notes: [],
          });
          log(`      结果=${describeProbe(dProbe)}`);
        }
      }
    }

    const decision = decide(results);

    /**
     * 会话载体的旁证：与消融结论交叉验证。
     * 只看「名字像令牌的 localStorage 键」和「是否有长值 Cookie」，不读取任何值。
     */
    const tokenStorageHint = {
      localStorageAuthKeys: Object.keys(inventory.localStorage).filter((key) => /authorization|token|jwt|session/i.test(key)),
      longValueCookies: inventory.cookies.filter((cookie) => cookie.valueLength > 40).map((cookie) => cookie.name),
      indexedDbNames: inventory.indexedDb.map((db) => db.name),
      serviceWorkerScopes: inventory.serviceWorkerScopes,
    };

    log('========== 结论 ==========');
    log(`判定: ${decision.code}`);
    log(`最小充分清除集: ${decision.minSufficientSet.join(' / ')}`);
    log(`DIRTY 门禁可行: ${decision.dirtyGateFeasible ? '是' : '否'}`);
    log(`需页面上下文清理: ${decision.requiresPageContext ? '是' : '否'}`);
    log(`影响: ${decision.implication}`);
    log(`旁证: localStorage 令牌键=[${tokenStorageHint.localStorageAuthKeys.join(',')}]；`
      + `长值 Cookie=[${tokenStorageHint.longValueCookies.join(',')}]；`
      + `IndexedDB=[${tokenStorageHint.indexedDbNames.join(',')}]`);

    const report = {
      generatedAt: new Date().toISOString(),
      target: {
        loginUser: config.adminUsername,
        probeUrl,
        loginUrl: config.loginUrl,
        browserChannel: config.browserChannel,
        headless: config.headless,
      },
      inventory,
      tokenStorageHint,
      replayProbe: replayPlan ? { urls: replayPlan.urls, mode: replayPlan.mode } : null,
      results,
      decision,
    };
    const reportPath = writeReport(report);
    log(`报告已写入: ${reportPath}`);
    process.stdout.write(`${JSON.stringify({ decision, tokenStorageHint, reportPath }, null, 2)}\n`);
    return 0;
  } finally {
    log('关闭浏览器（限时 3s）');
    await boundedClose(browser.close());
  }
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
