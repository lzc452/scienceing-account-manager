/**
 * V2 验证：改密之后，旧会话（旧令牌）是否立即失效（COOKIE-PRD §8 V2）
 *
 * 为什么必须验证
 *   「超时回收 = 直接改密」这条决策的全部价值在于：改密能在**秒级**把用户已打开的
 *   旧标签页踢掉。如果科应只是改了密码、而旧令牌在过期前依然有效，那么改密对
 *   「用户失联后继续占用」几乎无效——P0-1 的兜底就断了，方案要重新设计。
 *
 * 测试方法（自校准，不依赖任何接口文档）
 *   1. 上下文 A：用目标账号登录，收集页面自己发起、且**不带令牌就返回 401** 的接口——
 *      这类接口才是受鉴权保护的探针（公开接口会被剔除）；
 *   2. 上下文 B：管理员登录 → 走平台同一条「指定密码」重置流程，把目标账号改成临时密码；
 *   3. 在 A 中不刷新页面，只按时间点用**旧令牌**重放探针：T+0 / +30s / +90s；
 *   4. 用旧密码尝试登录（对照组：证明改密真的生效了，否则「旧令牌仍有效」的结论不成立）；
 *   5. 无论成功失败，finally 中把密码改回原值。
 *
 * 安全性设计（改动前必读）
 *   - 这是对真实平台的**写操作**：会真实修改目标账号密码。默认目标是环境变量里的管理员账号
 *     （保证空闲、且原密码已知可回滚）；也支持 --account 指定其它账号。
 *   - 回滚在 finally 中执行；若回滚失败，临时密码会保留在
 *     playwright/.worker-logs/v2-recovery-<时间戳>.txt（gitignored），供人工恢复。
 *   - 绝不把**原密码**写入磁盘，也不打印任何密码/令牌值。
 *   - 改密后管理员会话可能被自己改掉的密码顶掉，因此恢复前会探测会话，失效则用临时密码重登。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomInt } from 'node:crypto';
import { chromium, type BrowserContext, type Page, type Response } from 'playwright';
import { loadConfigFromEnv, type WorkerConfig } from './config';
import { loginAdmin, loginWithCredentials } from './auth';
import { installCdnMirrorRouting } from './cdn-mirror';
import { buildSelectors } from './selectors';
import { performReset } from './reset-flow';
import { initLogger, log, findRepoRoot } from './logger';

/**
 * 临时密码生成策略：与 apps/server/src/crypto/account-password.ts 保持一致
 * （16 位、必含大小写+数字+符号、排除易混淆字符）。
 * 那边是服务端唯一来源；此处重复一份是因为 worker 是独立 tsconfig/rootDir，
 * 跨包 import 会破坏编译输出结构。规则变更时**两处一起改**。
 */
const UPPERCASE = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+?';
const ALL = UPPERCASE + LOWERCASE + DIGITS + SYMBOLS;

function pick(chars: string): string {
  return chars.charAt(randomInt(chars.length));
}

function generateTempPassword(): string {
  const parts = [pick(UPPERCASE), pick(LOWERCASE), pick(DIGITS), pick(SYMBOLS)];
  while (parts.length < 16) parts.push(pick(ALL));
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = parts[i] as string;
    parts[i] = parts[j] as string;
    parts[j] = tmp;
  }
  return parts.join('');
}

interface NetEntry {
  url: string;
  status: number;
  method: string;
  type: string;
}

interface SampleResult {
  elapsedSeconds: number;
  statuses: number[];
  /** 全部 401/403 → 旧令牌已被服务端拒绝。 */
  rejected: boolean;
}

interface TokenMeta {
  /** 是否形如 JWT（三段式）。 */
  isJwt: boolean;
  /** 令牌长度（值本身绝不输出）。 */
  length: number;
  issuedAt?: string;
  expiresAt?: string;
  /** JWT 载荷的键数量（不输出键名与值，仅用于判断形态）。 */
  claimCount?: number;
}

interface ParsedArgs {
  account?: string;
  password?: string;
  passwordStdin: boolean;
  probeUrl?: string;
  headed: boolean;
  samples: number[];
  /** 只做「把密码改回给定值」，不做验证。用于上一次运行中断后的补救。 */
  restoreOnly: boolean;
  /** 手工补充的探针接口（逗号分隔）。池账号可能打不开管理页，自动发现的接口不够用。 */
  probePaths: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { passwordStdin: false, headed: false, samples: [0, 30, 90], restoreOnly: false, probePaths: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--account' || arg === '-u') args.account = argv[++i];
    else if (arg === '--password' || arg === '-p') args.password = argv[++i];
    else if (arg === '--password-stdin') args.passwordStdin = true;
    else if (arg === '--probe-url') args.probeUrl = argv[++i];
    else if (arg === '--headed') args.headed = true;
    else if (arg === '--restore-only') args.restoreOnly = true;
    else if (arg === '--probe-paths') {
      const raw = argv[++i] ?? '';
      args.probePaths = raw.split(',').map((item) => item.trim()).filter((item) => item.startsWith('/'));
    } else if (arg === '--samples') {
      const raw = argv[++i] ?? '';
      const parsed = raw.split(',').map((item) => Number.parseInt(item.trim(), 10)).filter((n) => Number.isFinite(n) && n >= 0);
      if (parsed.length > 0) args.samples = parsed;
    }
  }
  return args;
}

async function readPasswordFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

/** 只在进程内使用的存储：原密码 / 临时密码绝不落盘（临时密码例外，见恢复文件说明）。 */
const secrets = {
  original: '',
  temp: '',
  /** 目标账号当前生效的密码（改密后切换为临时密码，恢复后切回原密码）。 */
  current: '',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 收集一次导航期间的响应（只保留同源）。 */
function attachResponseCollector(page: Page, origin: string): { entries: NetEntry[]; detach: () => void } {
  const entries: NetEntry[] = [];
  const onResponse = (response: Response): void => {
    try {
      const request = response.request();
      const type = request.resourceType();
      if (type !== 'xhr' && type !== 'fetch') return;
      const target = response.url();
      if (origin && !target.startsWith(origin)) return;
      entries.push({ url: target, status: response.status(), method: request.method(), type });
    } catch {
      // 跳转中的响应，忽略
    }
  };
  page.on('response', onResponse);
  return { entries, detach: () => page.off('response', onResponse) };
}

/** 从候选里挑出「不带令牌就 401、带令牌就 2xx」的接口作为探针。 */
async function calibrateProtection(
  page: Page,
  candidates: string[],
  tokenKey: string,
): Promise<{ paths: string[]; mode: 'raw' | 'bearer' } | null> {
  if (candidates.length === 0) return null;
  const result = await page
    .evaluate(async (input) => {
      const raw = window.localStorage.getItem(input.tokenKey);
      if (!raw) return null;
      const detail: Array<{ path: string; anonymous: number; authed: number; mode: string }> = [];
      let authedMode: 'raw' | 'bearer' | null = null;

      for (const target of input.candidates) {
        let anonymous = -1;
        try {
          const res = await fetch(target, { method: 'GET', credentials: 'same-origin' });
          anonymous = res.status;
        } catch {
          anonymous = -1;
        }
        // 只要「匿名被拒」的接口：公开接口（200）无法用来判断会话死活
        if (anonymous !== 401 && anonymous !== 403) continue;

        for (const mode of ['raw', 'bearer'] as const) {
          try {
            const headers = { Authorization: mode === 'bearer' ? `Bearer ${raw}` : raw };
            const res = await fetch(target, { method: 'GET', headers, credentials: 'same-origin' });
            if (res.status >= 200 && res.status < 300) {
              authedMode = authedMode ?? mode;
              if (authedMode === mode) {
                detail.push({ path: target, anonymous, authed: res.status, mode });
              }
              break;
            }
          } catch {
            // 试下一种格式
          }
        }
      }

      const paths = [] as string[];
      for (const item of detail) {
        if (!paths.includes(item.path) && paths.length < 4) paths.push(item.path);
      }
      return { paths, mode: authedMode, detail } as
        | { paths: string[]; mode: 'raw' | 'bearer' | null; detail: Array<{ path: string; anonymous: number; authed: number; mode: string }> }
        | null;
    }, { candidates, tokenKey })
    .catch(() => null);

  if (!result || !result.mode || result.paths.length === 0) return null;
  for (const item of result.detail) log(`      探针 ${item.path} 匿名=${item.anonymous} 带令牌=${item.authed} (${item.mode})`);
  return { paths: result.paths, mode: result.mode };
}

/** 用「当前 localStorage 里的令牌」重放探针：令牌已消失就等于不带鉴权头。 */
async function sampleProbes(page: Page, paths: string[], tokenKey: string, mode: 'raw' | 'bearer'): Promise<number[]> {
  const statuses = await page
    .evaluate(async (input) => {
      const headers: Record<string, string> = {};
      const raw = window.localStorage.getItem(input.tokenKey);
      if (raw) headers.Authorization = input.mode === 'bearer' ? `Bearer ${raw}` : raw;
      const out: number[] = [];
      for (const target of input.paths) {
        try {
          const res = await fetch(target, { method: 'GET', headers, credentials: 'same-origin' });
          out.push(res.status);
        } catch {
          out.push(-1);
        }
      }
      return out;
    }, { paths, tokenKey, mode })
    .catch(() => [] as number[]);
  return statuses;
}

/** 解码令牌元信息（只取 exp/iat 与载荷键数量，绝不输出载荷内容）。 */
function readTokenMeta(page: Page, tokenKey: string): Promise<TokenMeta | null> {
  return page
    .evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return { isJwt: false, length: 0 } as { isJwt: boolean; length: number };
      const parts = raw.split('.');
      const meta: { isJwt: boolean; length: number; issuedAt?: string; expiresAt?: string; claimCount?: number } = {
        isJwt: parts.length === 3,
        length: raw.length,
      };
      if (parts.length === 3) {
        try {
          const normalized = (parts[1] as string).replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(atob(normalized)) as Record<string, unknown>;
          meta.claimCount = Object.keys(payload).length;
          if (typeof payload.exp === 'number') meta.expiresAt = new Date(payload.exp * 1000).toISOString();
          if (typeof payload.iat === 'number') meta.issuedAt = new Date(payload.iat * 1000).toISOString();
        } catch {
          // 不是标准 JWT 载荷，忽略
        }
      }
      return meta;
    }, tokenKey)
    .catch(() => null);
}

/** 从候选接口里挑可重放的 GET（排除危险动词与静态资源）。 */
function buildCandidates(entries: NetEntry[], origin: string): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.method !== 'GET') continue;
    if (entry.status < 200 || entry.status >= 300) continue;
    let path = entry.url;
    try {
      const url = new URL(entry.url);
      if (origin && url.origin !== origin) continue;
      path = url.pathname;
    } catch {
      continue;
    }
    if (!path.startsWith('/')) continue;
    if (/logout|reset|delete|remove|update|save|create|export|download/i.test(path)) continue;
    if (/\.(js|css|png|jpe?g|svg|woff2?|ico|map)$/i.test(path)) continue;
    if (out.includes(path)) continue;
    out.push(path);
    if (out.length >= 12) break;
  }
  return out;
}

/** 确保复用中的管理员上下文仍然有效；失效则清掉客户端状态后用给定凭据重登。 */
async function ensureAdminReady(page: Page, config: WorkerConfig, username: string, password: string): Promise<void> {
  await page.goto(config.adminUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  // 必须 waitFor 而不是 isVisible：管理页是 SPA，goto 之后要 5s 左右筛选容器才渲染。
  // 用 isVisible 会立刻拿到 false，把「还在渲染」误判成「会话失效」（首轮就栽在这）。
  const ready = await buildSelectors(page)
    .accountPageReady.waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (ready) return;

  log('      [warn] 管理员会话已失效，清理客户端状态后重新登录');
  // 先清 Cookie + Web Storage：若直接 goto 登录页，已登录用户会被重定向走，
  // #login-form 永远不会出现 → 重登必然超时（首轮踩过）。
  const context = page.context();
  await context.clearCookies().catch(() => undefined);
  await page
    .evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    })
    .catch(() => undefined);
  await loginAdmin(page, { ...config, adminUsername: username, adminPassword: password });
}

function writeRecoveryFile(account: string, tempPassword: string): string {
  const dir = path.join(findRepoRoot(), 'playwright', '.worker-logs');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `v2-recovery-${stamp}.txt`);
  fs.writeFileSync(
    file,
    [
      'V2 改密验证未能自动回滚，目标账号当前密码为下方临时密码：',
      `account=${account}`,
      `tempPassword=${tempPassword}`,
      '',
      '处理方式二选一：',
      '  1) 在科应账号管理页用「指定密码」把该账号改回原密码；',
      '  2) 若该账号是平台管理员，把 .env 的 SCIENCING_ADMIN_PASSWORD 临时改成上面的临时密码。',
      '',
    ].join('\n'),
    { encoding: 'utf8', mode: 0o600 },
  );
  return file;
}

function removeQuietly(file: string): void {
  try {
    fs.unlinkSync(file);
  } catch {
    // 删除失败不影响主流程
  }
}

function writeReport(report: unknown): string {
  const dir = path.join(findRepoRoot(), 'playwright', '.worker-logs');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `v2-password-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
  return file;
}

function boundedClose(promise: Promise<unknown>, ms = 3000): Promise<void> {
  return Promise.race([
    promise.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]) as Promise<void>;
}

interface Verdict {
  code: 'KILLS_IMMEDIATELY' | 'DELAYED_KILL' | 'INEFFECTIVE' | 'INCONCLUSIVE';
  implication: string;
}

function decide(params: {
  samples: SampleResult[];
  resetOk: boolean;
  probeCount: number;
  oldPasswordStillWorks: boolean | null;
}): Verdict {
  const { samples, resetOk, probeCount, oldPasswordStillWorks } = params;

  if (!resetOk || probeCount === 0 || samples.length === 0) {
    return {
      code: 'INCONCLUSIVE',
      implication:
        '本次验证未能得出有效结论（改密未成功、或没有可用的受鉴权接口探针）。'
        + '常见原因：目标账号不在管理员账号列表里、探针接口全部是公开接口。请检查日志后重跑。',
    };
  }

  const first = samples[0] as SampleResult;
  if (first.rejected) {
    return {
      code: 'KILLS_IMMEDIATELY',
      implication:
        '改密后旧令牌立刻失效（同一秒内被服务端拒绝）。结论：改密可以作为会话阻断手段，'
        + '「超时回收 = 直接改密」成立；且因为不依赖客户端配合，这条路径对「用户已关浏览器」同样有效。',
    };
  }

  const later = samples.find((sample) => sample.rejected);
  if (later) {
    return {
      code: 'DELAYED_KILL',
      implication:
        `改密后旧令牌不是立即失效，而是在约 ${later.elapsedSeconds} 秒后才被服务端拒绝。`
        + '结论：改密有阻断能力但存在窗口期；超时回收路径需要接受这个窗口，'
        + '或在窗口内叠加「下次登录必然互踢」作为补充。',
    };
  }

  return {
    code: 'INEFFECTIVE',
    implication:
      '改密后旧令牌在所有采样点仍然可用（服务端不因改密而吊销令牌）。'
      + (oldPasswordStillWorks === true
        ? '注意：旧密码仍然能登录，说明本次改密可能并未真正生效，需先排查改密流程。'
        : '结论：改密**不能**作为会话阻断手段——旧标签页会一直用到令牌自然过期。'
          + '这直接推翻「超时回收 = 直接改密」的兜底假设，回收方案必须改用服务端下线 / 单点互踢，'
          + '或接受「失联用户的会话在令牌过期前持续有效」这一风险。'),
  };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  initLogger(process.env.SCIENCING_LOG_FILE);
  log('========== V2 改密会话失效验证 启动 ==========');

  const base = loadConfigFromEnv();
  const account = args.account ?? base.adminUsername;
  const provided = args.passwordStdin ? await readPasswordFromStdin() : args.password;
  const originalPassword = provided ?? (account === base.adminUsername ? base.adminPassword : '');
  if (!originalPassword) {
    throw new Error('缺少目标账号当前密码：请用 --password-stdin 提供（或对管理员账号使用 .env 中的凭据）');
  }

  const config: WorkerConfig = {
    ...base,
    headless: args.headed ? false : base.headless,
  };
  const probeUrl = args.probeUrl ?? config.adminUrl;
  let origin = '';
  try {
    origin = new URL(probeUrl).origin;
  } catch {
    throw new Error(`无法解析探测页面地址：${probeUrl}`);
  }

  secrets.original = originalPassword;
  secrets.temp = generateTempPassword();
  secrets.current = originalPassword;

  log(`目标账号: ${account}`);
  log(`探测页面: ${probeUrl}`);
  log(`采样时间点(秒): ${args.samples.join(', ')}`);
  log('警告：本脚本会真实修改该账号密码，并在 finally 中改回原值。');

  const browser = await chromium.launch({
    channel: config.browserChannel,
    headless: config.headless,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // 补救模式：只把密码改回给定值。上一次运行若在「改密后、回滚前」中断，用它收尾。
  if (args.restoreOnly) {
    try {
      const ctx = await browser.newContext();
      await installCdnMirrorRouting(ctx);
      const page = await ctx.newPage();
      page.setDefaultTimeout(config.defaultTimeoutMs);
      log(`补救模式：把账号 ${account} 的密码改为给定值`);
      await loginAdmin(page, config);
      await performReset(page, config, account, secrets.original);
      log('补救完成：密码已改回给定值');
      await boundedClose(ctx.close());
      return 0;
    } finally {
      await boundedClose(browser.close());
    }
  }

  let recoveryFile: string | null = null;
  let resetOk = false;
  let restoredOk = false;
  let tokenKey = 'Authorization';
  let replayMode: 'raw' | 'bearer' = 'bearer';
  let probes: string[] = [];
  let tokenMeta: TokenMeta | null = null;
  let oldPasswordStillWorks: boolean | null = null;
  const samples: SampleResult[] = [];

  let contextA: BrowserContext | null = null;
  let pageB: Page | null = null;
  /** 执行期异常先存起来，等回滚与报告都完成后再决定退出码（不能在 finally 里 return）。 */
  let runError: Error | null = null;

  try {
    // 上下文 A：目标账号的真实会话
    contextA = await browser.newContext();
    await installCdnMirrorRouting(contextA);
    const pageA = await contextA.newPage();
    pageA.setDefaultTimeout(config.defaultTimeoutMs);

    log('步骤 1/6：以目标账号登录（上下文 A）');
    await loginWithCredentials(pageA, config, account, secrets.original);

    log('步骤 2/6：打开受保护页面并采集候选接口');
    const collector = attachResponseCollector(pageA, origin);
    await pageA.goto(probeUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await pageA.waitForTimeout(3000);
    collector.detach();

    const keys = await pageA.evaluate(() => Object.keys(window.localStorage)).catch(() => [] as string[]);
    const foundKey = keys.find((key) => /authorization/i.test(key)) ?? keys.find((key) => /token|jwt|session/i.test(key));
    if (!foundKey) throw new Error('目标账号登录后未在 localStorage 找到会话令牌键，无法继续');
    tokenKey = foundKey;
    tokenMeta = await readTokenMeta(pageA, tokenKey);
    log(`      令牌键=${tokenKey} 长度=${tokenMeta?.length ?? 0} JWT=${tokenMeta?.isJwt ? '是' : '否'}`
      + (tokenMeta?.expiresAt ? ` 过期时间=${tokenMeta.expiresAt}` : ''));

    const candidates = buildCandidates(collector.entries, origin);
    for (const extra of args.probePaths) {
      if (!candidates.includes(extra)) candidates.push(extra);
    }
    log(`      候选接口 ${candidates.length} 个（含手工指定 ${args.probePaths.length} 个），开始校准鉴权保护`);
    const calibrated = await calibrateProtection(pageA, candidates, tokenKey);
    if (!calibrated) {
      throw new Error('未找到任何「匿名 401 且带令牌 2xx」的接口，无法验证会话是否失效；请改用 --probe-url 指定需要登录的页面');
    }
    probes = calibrated.paths;
    replayMode = calibrated.mode;
    log(`      可用探针 ${probes.length} 个，鉴权头格式=${replayMode}`);

    log('步骤 3/6：改密前基线采样（此时应全部成功）');
    const baselineStatuses = await sampleProbes(pageA, probes, tokenKey, replayMode);
    log(`      基线=${baselineStatuses.join('/')}`);
    if (!baselineStatuses.every((status) => status >= 200 && status < 300)) {
      throw new Error(`改密前基线采样未全部成功（${baselineStatuses.join('/')}），会话状态不可信，已中止`);
    }

    // 上下文 B：管理员执行改密（与平台 worker 同一条路径）
    log('步骤 4/6：管理员登录并改密');
    const contextB = await browser.newContext();
    await installCdnMirrorRouting(contextB);
    pageB = await contextB.newPage();
    pageB.setDefaultTimeout(config.defaultTimeoutMs);
    await loginAdmin(pageB, config);

    recoveryFile = writeRecoveryFile(account, secrets.temp);
    log(`      临时密码已写入恢复文件（仅在回滚失败时需要）：${recoveryFile}`);

    const resetStart = Date.now();
    await performReset(pageB, config, account, secrets.temp);
    resetOk = true;
    secrets.current = secrets.temp;
    const resetDoneAt = Date.now();
    log(`      改密成功，耗时 ${((resetDoneAt - resetStart) / 1000).toFixed(1)}s`);

    log('步骤 5/6：在上下文 A 中用旧令牌按时间点重放探针（不刷新页面）');
    for (const target of args.samples) {
      const waitMs = target * 1000 - (Date.now() - resetDoneAt);
      if (waitMs > 0) await sleep(waitMs);
      const elapsed = Math.round((Date.now() - resetDoneAt) / 1000);
      const statuses = await sampleProbes(pageA, probes, tokenKey, replayMode);
      const rejected = statuses.length > 0 && statuses.every((status) => status === 401 || status === 403);
      samples.push({ elapsedSeconds: elapsed, statuses, rejected });
      log(`      T+${elapsed}s 状态=${statuses.join('/')} ${rejected ? '→ 已失效' : statuses.every((s) => s >= 200 && s < 300) ? '→ 仍有效' : '→ 混合'}`);
    }

    log('步骤 6/6：对照组——旧密码是否还能登录（证明改密真的生效）');
    const contextC = await browser.newContext();
    try {
      await installCdnMirrorRouting(contextC);
      const pageC = await contextC.newPage();
      pageC.setDefaultTimeout(config.defaultTimeoutMs);
      await loginWithCredentials(pageC, config, account, secrets.original);
      oldPasswordStillWorks = true;
      log('      [warn] 旧密码仍可登录：本次改密可能未真正生效，结论需谨慎');
    } catch (err) {
      oldPasswordStillWorks = false;
      log(`      旧密码登录失败（预期）：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await boundedClose(contextC.close());
    }
  } catch (err) {
    runError = err instanceof Error ? err : new Error(String(err));
    log(`[error] 执行中断：${runError.message}`);
  } finally {
    // 无论前面发生什么，都要尝试把密码改回原值。
    // 注意：finally 里只做清理，绝不 return —— 在 finally 中 return 会吞掉异常（no-unsafe-finally）。
    if (resetOk && pageB) {
      log('回滚：将目标账号密码改回原值');
      try {
        // 重登必须用**管理员**凭据：这里动的始终是目标账号，管理员账号不在改动范围内。
        await ensureAdminReady(pageB, config, config.adminUsername, config.adminPassword);
        await performReset(pageB, { ...config }, account, secrets.original);
        secrets.current = secrets.original;
        restoredOk = true;
        log('      回滚成功');
        if (recoveryFile) removeQuietly(recoveryFile);
      } catch (err) {
        log(`      [error] 回滚失败：${err instanceof Error ? err.message : String(err)}`);
        log(`      [error] 请按恢复文件处理：${recoveryFile ?? '(未生成)'}`);
      }
    }
  }

  const verdict = decide({ samples, resetOk, probeCount: probes.length, oldPasswordStillWorks });
  const report = {
    generatedAt: new Date().toISOString(),
    target: { accountMasked: account.replace(/^(.).*(@.*)?$/, '$1***$2'), probeUrl, resetOk, restoredOk },
    tokenMeta,
    probes,
    replayMode,
    samples,
    oldPasswordStillWorks,
    verdict,
    recoveryFile: restoredOk ? null : recoveryFile,
    runError: runError ? runError.message : null,
  };
  const reportPath = writeReport(report);

  log('========== 结论 ==========');
  log(`判定: ${verdict.code}`);
  log(`改密: ${resetOk ? '成功' : '未执行'} / 回滚: ${resetOk ? (restoredOk ? '成功' : '失败') : '不适用（未改密）'}`);
  log(`影响: ${verdict.implication}`);
  log(`报告已写入: ${reportPath}`);
  process.stdout.write(`${JSON.stringify({ verdict, resetOk, restoredOk, samples, reportPath }, null, 2)}\n`);

  if (contextA) await boundedClose(contextA.close());
  log('关闭浏览器（限时 3s）');
  await boundedClose(browser.close());

  // 退出码语义：2 只代表「改过密但没回滚成功」这种必须人工介入的状态；
  // 没改密就中止属于普通失败（1），不能报成回滚失败。
  if (resetOk && !restoredOk) return 2;
  if (runError) return 1;
  return resetOk ? 0 : 1;
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
