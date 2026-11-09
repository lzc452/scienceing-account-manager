/**
 * V4 验证：单点互踢能否真正吊销旧令牌（决定「下次登录互踢」这个兜底能不能写进设计）
 *
 * 背景（已有结论）
 *   - V1：令牌在 localStorage，清掉即本地失效；服务端令牌仍在。
 *   - V2：改密**不吊销**已签发令牌。
 *   - V3：**真实退出登录**（returnCode=0、页面回登录页）也不吊销——
 *         全新干净上下文用旧令牌请求业务接口，T+2s/32s/122s 全部 200。
 *   于是只剩最后一个可能的「踢人」机制：单点互踢（新登录时弹「账号已在其他地方登录」→ 点确定）。
 *
 * 本脚本回答两个问题（顺序经过设计，互不污染）
 *   Q1（William 提出）点真实「退出登录」之后再登录，是否还会弹「账号已在其他地方登录」？
 *      → 弹出 = 注销没有清掉服务端的会话记录；不弹 = 清了。
 *   Q2（决定设计）在新会话登录并确认「强制下线」之后，**旧会话的令牌**还能不能用？
 *      → 401 = 互踢是真服务端阻断，存在可用的 kill switch；
 *        200 = 互踢只是客户端层面（旧令牌照样能调接口），兜底不能写成「必然踢掉」。
 *
 * 步骤
 *   ① 登录 → 记录是否弹窗 → 点真实退出
 *   ② 再登录 → 记录是否弹窗（回答 Q1）
 *   ③ 用②的令牌校准受保护接口并做基线采样
 *   ④ 再登录一次（会触发互踢，点确定）→ 记录是否弹窗
 *   ⑤ 用②的旧令牌在**全新上下文**请求业务接口（回答 Q2）
 *   ⑥ 顺手退出，保持环境干净
 *
 * 安全：不改密码、不改账号数据；全程只结束自己建立的会话。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium, type BrowserContext } from 'playwright';
import { loadConfigFromEnv, type WorkerConfig } from './config';
import { loginWithCredentials } from './auth';
import { installCdnMirrorRouting } from './cdn-mirror';
import { buildSelectors } from './selectors';
import { initLogger, log, findRepoRoot } from './logger';
import { tryUiLogout } from './ui-logout';
import {
  attachResponseCollector,
  calibrateProtectedProbes,
  collectCandidates,
  findTokenKey,
  probeInFreshContext,
  probeWithBearer,
  readTokenMeta,
  type ReplayPlan,
  type TokenMeta,
} from './session-probe';

interface ParsedArgs {
  account?: string;
  password?: string;
  passwordStdin: boolean;
  probeUrl: string;
  headed: boolean;
  probePaths: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    passwordStdin: false,
    probeUrl: 'https://www.scienceing.com/search',
    headed: false,
    probePaths: ['/apps/articleSearch/api/subscribe/message/v2/sub'],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--account' || arg === '-u') args.account = argv[++i];
    else if (arg === '--password' || arg === '-p') args.password = argv[++i];
    else if (arg === '--password-stdin') args.passwordStdin = true;
    else if (arg === '--probe-url') args.probeUrl = argv[++i] ?? args.probeUrl;
    else if (arg === '--headed') args.headed = true;
    else if (arg === '--probe-paths') {
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

function boundedClose(promise: Promise<unknown>, ms = 3000): Promise<void> {
  return Promise.race([
    promise.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]) as Promise<void>;
}

function writeReport(report: unknown): string {
  const dir = path.join(findRepoRoot(), 'playwright', '.worker-logs');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `v4-kick-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
  return file;
}

interface Verdict {
  code: 'KICK_REVOKES_TOKEN' | 'KICK_CLIENT_ONLY' | 'INCONCLUSIVE';
  implication: string;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  initLogger(process.env.SCIENCING_LOG_FILE);
  log('========== V4 单点互踢验证 启动 ==========');

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
  log('说明：不改密码、不改账号数据；只结束自己建立的会话。');

  const browser = await chromium.launch({
    channel: config.browserChannel,
    headless: config.headless,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const contexts: BrowserContext[] = [];
  let tokenMeta: TokenMeta | null = null;
  let plan: ReplayPlan | null = null;
  let baselineOk = false;
  let afterStatuses: number[] = [];
  let prompt1: boolean | null = null;
  let prompt2: boolean | null = null;
  let prompt3: boolean | null = null;
  let logoutInfo: Awaited<ReturnType<typeof tryUiLogout>> | null = null;
  let clientKicked = false;
  /** Q1 只有在「退出确实发生」时才可信（否则登录② 的弹窗只是登录① 还活着的副作用）。 */
  let q1Usable = false;

  try {
    // ---------- ① 登录 → 退出（为 Q1 制造「干净前提」） ----------
    log('步骤 1/6：登录①（预期无单点冲突提示）');
    const ctx1 = await browser.newContext();
    contexts.push(ctx1);
    await installCdnMirrorRouting(ctx1);
    const page1 = await ctx1.newPage();
    page1.setDefaultTimeout(config.defaultTimeoutMs);
    prompt1 = (await loginWithCredentials(page1, config, account, password)).singleSessionPrompt;
    log(`      登录① 单点冲突提示=${prompt1 ? '有' : '无'}`);

    // 刚登录完**不要**额外 goto：SPA 可能还在二次渲染，goto 会把页面打回半成品状态，
    // 头部用户菜单根本不存在（前两轮 found=false 就是这个原因）。直接等头部元素出现。
    const headerReady = page1.locator('[class*="common_header_userButton"]').first();
    await headerReady.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
    await page1.waitForTimeout(800);
    log('步骤 2/6：点真实「退出登录」，然后关闭该上下文');
    logoutInfo = await tryUiLogout(page1);
    if (!logoutInfo.redirectedToLogin) {
      log('      退出未成功，重试一次（重新加载页面后再点）');
      await page1.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await headerReady.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      await page1.waitForTimeout(1000);
      logoutInfo = await tryUiLogout(page1);
    }
    log(`      退出：找到入口=${logoutInfo.found} 请求=${logoutInfo.logoutHttpStatus ?? '-'}`
      + ` returnCode=${logoutInfo.logoutReturnCode ?? '-'} 回登录页=${logoutInfo.redirectedToLogin}`);
    // Q1 只有在「退出确实发生」时才可信；否则登录② 的弹窗只是登录① 还活着的副作用
    q1Usable = logoutInfo.redirectedToLogin;
    if (!q1Usable) log('      [warn] 退出未生效：Q1 结果不可信，将标记为 null');
    await boundedClose(ctx1.close());

    // ---------- ② 再登录 → 回答 Q1 ----------
    log('步骤 3/6：登录②（Q1：退出后重新登录是否还弹「账号已在其他地方登录」）');
    const ctx2 = await browser.newContext();
    contexts.push(ctx2);
    await installCdnMirrorRouting(ctx2);
    const page2 = await ctx2.newPage();
    page2.setDefaultTimeout(config.defaultTimeoutMs);
    prompt2 = (await loginWithCredentials(page2, config, account, password)).singleSessionPrompt;
    log(`      登录② 单点冲突提示=${prompt2 ? '有' : '无'}`);

    // ---------- ③ 用②的令牌校准探针 ----------
    log('步骤 4/6：用登录②的令牌校准受保护接口');
    const collector = attachResponseCollector(page2, origin);
    await page2.goto(args.probeUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page2.waitForTimeout(3000);
    collector.detach();

    const tokenKey = await findTokenKey(page2);
    if (!tokenKey) throw new Error('未在 localStorage 找到会话令牌键');
    tokenMeta = await readTokenMeta(page2, tokenKey);
    const token2 = await page2.evaluate((key) => window.localStorage.getItem(key), tokenKey);
    if (!token2) throw new Error('读取登录②的令牌失败');

    const candidates = collectCandidates(collector.entries, origin);
    for (const extra of args.probePaths) if (!candidates.includes(extra)) candidates.push(extra);
    plan = await calibrateProtectedProbes(page2, candidates, tokenKey);
    if (!plan) throw new Error('未找到「匿名 401 / 带令牌 200」的接口，无法判断令牌死活');
    log(`      探针 ${plan.paths.length} 个：${plan.paths.join(', ')}（${plan.mode}）`);

    const baseline = await probeWithBearer(page2, plan.paths, token2, plan.mode);
    baselineOk = baseline.length > 0 && baseline.every((status) => status >= 200 && status < 300);
    log(`      基线=${baseline.join('/')} ${baselineOk ? '（符合预期）' : '（异常，结论无效）'}`);

    // ---------- ④ 再登录一次，触发互踢 ----------
    log('步骤 5/6：登录③（应触发互踢，点「确定」强制下线其他设备）');
    const ctx3 = await browser.newContext();
    contexts.push(ctx3);
    await installCdnMirrorRouting(ctx3);
    const page3 = await ctx3.newPage();
    page3.setDefaultTimeout(config.defaultTimeoutMs);
    prompt3 = (await loginWithCredentials(page3, config, account, password)).singleSessionPrompt;
    log(`      登录③ 单点冲突提示=${prompt3 ? '有' : '无'}`);

    // ---------- ⑤ 用②的旧令牌验证互踢效果 ----------
    log('步骤 6/6：用登录②的旧令牌在全新上下文请求业务接口（Q2）');
    afterStatuses = await probeInFreshContext(browser, origin, plan.paths, token2, plan.mode);
    log(`      全新上下文 = ${afterStatuses.join('/')}`
      + `${afterStatuses.every((status) => status >= 200 && status < 300) ? ' → 旧令牌仍有效' : ''}`);

    // 顺带看客户端是否被踢（页面是否被强制跳登录页）
    await page2.goto(args.probeUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page2.waitForTimeout(2500);
    const s = buildSelectors(page2);
    clientKicked = /\/user\/login/i.test(page2.url()) || (await s.loginForm.isVisible().catch(() => false));
    log(`      登录②的页面状态=${clientKicked ? '已被踢回登录页' : `仍停留在 ${page2.url()}`}`);

    // 收尾：把登录③的会话退掉
    log('收尾：退出登录③');
    const cleanup = await tryUiLogout(page3);
    log(`      收尾退出：returnCode=${cleanup.logoutReturnCode ?? '-'} 回登录页=${cleanup.redirectedToLogin}`);
  } finally {
    const revoked = afterStatuses.length > 0 && afterStatuses.every((status) => status === 401 || status === 403);
    let verdict: Verdict;
    if (!baselineOk || !plan) {
      verdict = {
        code: 'INCONCLUSIVE',
        implication: '没有校准出可用的受鉴权接口，或基线采样未全部成功，本次结论无效。',
      };
    } else if (revoked) {
      verdict = {
        code: 'KICK_REVOKES_TOKEN',
        implication:
          '互踢是**真服务端阻断**：新会话登录并确认强制下线后，旧会话的令牌立刻被 401 拒绝。'
          + '结论：可以把它做成回收的 kill switch——回收时不改密、不清存储，用该账号登录一次并确认互踢即可；'
          + '这比清 localStorage 覆盖更广（连用户自己另开的浏览器也能踢）。',
      };
    } else {
      verdict = {
        code: 'KICK_CLIENT_ONLY',
        implication:
          '互踢只在客户端层面：新会话登录后，旧令牌在全新上下文里仍能访问业务接口。'
          + '结论：不能把「下次登录必然踢掉」写成保证，它只能减少「旧标签继续被操作」的概率，'
          + '真正的阻断手段是清 localStorage；14 天令牌窗口无法消除。',
      };
    }

    const report = {
      generatedAt: new Date().toISOString(),
      target: { accountMasked: account.replace(/^(.).*(@.*)?$/, '$1***$2') },
      tokenMeta,
      probes: plan?.paths ?? [],
      authMode: plan?.mode ?? null,
      baselineOk,
      prompts: {
        firstLogin: prompt1,
        /** Q1 答案：退出登录后重新登录是否仍弹单点冲突提示（仅 logoutSucceeded=true 时可信）。 */
        afterLogout: q1Usable ? prompt2 : null,
        afterLogoutRaw: prompt2,
        logoutSucceeded: q1Usable,
        thirdLogin: prompt3,
      },
      logoutInfo,
      afterKickStatuses: afterStatuses,
      clientKicked,
      verdict,
    };
    const reportPath = writeReport(report);

    log('========== 结论 ==========');
    log(`判定: ${verdict.code}`);
    log(`Q1 退出后重登是否弹窗: ${!q1Usable ? '退出未生效，本次不可判定'
      : prompt2 ? '弹（注销未清服务端会话记录）' : '不弹（注销已清服务端会话记录）'}`);
    log(`Q2 互踢后旧令牌: ${afterStatuses.join('/') || '未采样'}（旧页面被踢=${clientKicked ? '是' : '否'}）`);
    log(`影响: ${verdict.implication}`);
    log(`报告已写入: ${reportPath}`);
    process.stdout.write(`${JSON.stringify({ verdict, prompts: { firstLogin: prompt1, afterLogout: prompt2, thirdLogin: prompt3 }, afterKickStatuses: afterStatuses, clientKicked, reportPath }, null, 2)}\n`);

    for (const context of contexts) await boundedClose(context.close());
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
