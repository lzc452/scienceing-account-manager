import * as fs from 'node:fs';
import { chromium } from 'playwright';
import { loadConfigFromEnv, type WorkerConfig } from './config';
import { initLogger, log, logJson } from './logger';
import { loginAdmin, saveStorageState } from './auth';
import { checkHealth } from './health';
import { ResetWorker, type ResetJobInput } from './worker';

interface ParsedArgs {
  command: 'login' | 'reset' | 'run' | 'check' | 'help';
  username?: string;
  password?: string;
  passwordStdin?: boolean;
  jobId?: string;
  jobsFile?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? 'help';
  const parsed: ParsedArgs = { command: command as ParsedArgs['command'] };
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--username' || arg === '-u') parsed.username = argv[++i];
    else if (arg === '--password' || arg === '-p') parsed.password = argv[++i];
    else if (arg === '--password-stdin') parsed.passwordStdin = true;
    else if (arg === '--job-id') parsed.jobId = argv[++i];
    else if (arg === '--jobs' || arg === '-j') parsed.jobsFile = argv[++i];
  }
  return parsed;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/**
 * 从 stdin 读取口令（读到 EOF 后返回，去掉末尾换行）。
 *
 * 为什么不用 --password：argv 对同机任何进程可见（进程列表 / WMI / 审计日志），
 * 且极易被「回显 argv」的日志与异常信息带走。stdin 是私有管道，不落盘、不进日志。
 */
async function readPasswordFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

/**
 * 把本次结论原子落盘（临时文件 + rename），供后端在子进程被超时强杀后仍能读到。
 *
 * 背景：后端按超时 kill 子进程时，stdout 可能尚未送达或被截断，
 * 于是「已经改密成功」会被误判为失败，最终账号标 ERROR 而平台口令已变。
 * 结果文件是该场景的唯一补偿通道；未设置 SCIENCING_RESULT_FILE 时静默跳过。
 */
function persistResult(result: unknown): void {
  const target = process.env.SCIENCING_RESULT_FILE;
  if (!target || target.trim() === '') return;
  try {
    const tmp = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(result), 'utf8');
    fs.renameSync(tmp, target);
  } catch (err) {
    // 结果文件写失败不能影响主流程（stdout 仍是主通道）
    log(`结果文件写入失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

/** 口令来源标签（仅用于日志，不包含口令本身）。 */
function passwordSource(args: ParsedArgs): 'stdin' | 'argv' | 'none' {
  if (args.passwordStdin) return 'stdin';
  if (args.password) return 'argv';
  return 'none';
}

/** 打印本次运行的环境摘要（stderr，绝不打印密码），便于排查「卡住/无输出」时确认配置。 */
function printEnvSummary(config: WorkerConfig): void {
  log('环境摘要:');
  log(`  adminUrl        = ${config.adminUrl}`);
  log(`  loginUrl        = ${config.loginUrl}`);
  log(`  browserChannel  = ${config.browserChannel}`);
  log(`  headless        = ${config.headless}`);
  log(`  timeoutMs       = ${config.defaultTimeoutMs}`);
  log(`  successText     = ${config.resetSuccessText}`);
  log(`  storageState    = ${config.storageStatePath}`);
  log(`  loginUser       = ${config.adminUsername}`);
}

async function cmdLogin(): Promise<void> {
  const config = loadConfigFromEnv();
  printEnvSummary(config);
  log('正在启动浏览器...');
  const browser = await chromium.launch({
    channel: config.browserChannel,
    headless: config.headless,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  log('浏览器已启动');
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setDefaultTimeout(config.defaultTimeoutMs);
    await loginAdmin(page, config);
    await saveStorageState(context, config);
    log('storageState 已保存');
    printJson({ ok: true, storageStatePath: config.storageStatePath });
  } finally {
    log('关闭浏览器（限时 3s，不阻塞进程退出）');
    await boundedClose(browser.close());
  }
}

async function cmdReset(username: string | undefined, password: string | undefined, jobId?: string): Promise<number> {
  if (!username || !password) {
    process.stderr.write('用法: reset --username <科应账号username> --password-stdin  （或 --password <新密码>）\n');
    return 2;
  }
  const config = loadConfigFromEnv();
  printEnvSummary(config);
  log(`开始改密: username=${username} jobId=${jobId ?? '(无)'}`);
  const worker = new ResetWorker(config);
  try {
    const result = await worker.processJob({ jobId, accountUsername: username, newPassword: password });
    logJson('改密结果', result);
    persistResult(result);
    printJson(result);
    return result.status === 'SUCCESS' ? 0 : 1;
  } finally {
    // 真实站点 Chrome 偶发无法优雅退出 → 限时后由 main 的 process.exit 兜底，避免被 executor 判超时
    await boundedClose(worker.close());
  }
}

async function cmdRun(jobsFile: string | undefined): Promise<number> {
  if (!jobsFile) {
    process.stderr.write('用法: run --jobs <队列JSON文件（ResetJobInput[]）>\n');
    return 2;
  }
  const raw = fs.readFileSync(jobsFile, 'utf8');
  const jobs = JSON.parse(raw) as ResetJobInput[];
  const config = loadConfigFromEnv();
  const worker = new ResetWorker(config);
  try {
    const results = await worker.run(jobs);
    persistResult(results);
    printJson(results);
    return results.every((r) => r.status === 'SUCCESS') ? 0 : 1;
  } finally {
    await boundedClose(worker.close());
  }
}

/** 健康检查（PRD §49）：登录 / 账号管理页 / 改密入口三项，供后端 HEALTH_EXECUTOR 子进程调用。 */
async function cmdCheck(): Promise<number> {
  const config = loadConfigFromEnv();
  printEnvSummary(config);
  const browser = await chromium.launch({
    channel: config.browserChannel,
    headless: config.headless,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const detail = await checkHealth(browser, config);
    const ok = detail.adminLoginOk && detail.accountPageOk && detail.resetEntryOk;
    printJson({ ok, ...detail });
    return ok ? 0 : 1;
  } finally {
    await boundedClose(browser.close());
  }
}

/**
 * 限时关闭：真实科应 Chrome 偶发在 browser.close()/worker.close() 上挂起
 * （子进程句柄不释放），导致 CLI 不退出、被 executor 120s 超时误判失败。
 * 这里最多等 3s，随后由 main() 的 process.exit 强制退出（JSON 结果早已落盘/写 stdout）。
 */
function boundedClose(promise: Promise<unknown>, ms = 3000): Promise<void> {
  return Promise.race([
    promise.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]) as Promise<void>;
}

async function main(): Promise<number> {
  // 先落盘日志：即使终端输出被 Chrome 子进程“带走”，也能在这里看到完整进度与结果。
  const logFile = initLogger(process.env.SCIENCING_LOG_FILE);
  log('========== Worker 启动 ==========');
  const args = parseArgs(process.argv.slice(2));
  // 只回显「命令 + 非敏感参数」。绝不能回显 argv 整体——口令可能就在其中，
  // 一旦写进 worker.log 就绕过了整个静态加密设计（PRD §42）。
  log(`命令: ${args.command}`);
  log(`参数: username=${args.username ?? '(无)'} jobId=${args.jobId ?? '(无)'} 口令来源=${passwordSource(args)}`);
  if (args.password) {
    log('[warn] 口令经命令行参数传入，对同机进程可见；建议改用 --password-stdin');
  }
  log(`日志文件: ${logFile}`);
  switch (args.command) {
    case 'login':
      await cmdLogin();
      return 0;
    case 'reset': {
      const password = args.passwordStdin ? await readPasswordFromStdin() : args.password;
      return cmdReset(args.username, password, args.jobId);
    }
    case 'run':
      return cmdRun(args.jobsFile);
    case 'check':
      return cmdCheck();
    case 'help':
    default:
      process.stdout.write(
        [
          '科应管理员改密 Worker（Playwright 单 Worker 串行，两阶段改密 Phase 2）',
          '',
          '用法:',
          '  node dist/cli.js login                      管理员首次登录并保存 storageState（PRD §29）',
          '  node dist/cli.js reset --username <科应账号username> --password-stdin [--job-id <id>]',
          '                                              从 stdin 读取新密码（推荐，口令不进 argv）',
          '  node dist/cli.js reset --username <用户名> --password <新密码>',
          '                                              兼容用法；口令会出现在进程列表中，不推荐',
          '  node dist/cli.js run --jobs <队列JSON文件>   串行消费队列（PRD §28）',
          '  node dist/cli.js check                      健康检查三项：登录/账号管理页/改密入口（PRD §49）',
          '',
          '环境变量:',
          '  SCIENCING_RESULT_FILE      结果文件路径；设置后 CLI 会把结论原子落盘，',
          '                             供后端在超时强杀子进程后仍能读到（避免成功被误判失败）',
          '  SCIENCING_ADMIN_URL        科应账号管理页地址（真实科应：/account/management/list）',
          '  SCIENCING_LOGIN_URL        科应登录页地址（默认由 ADMIN_URL 同源推导 /user/login）',
          '  SCIENCING_ADMIN_USERNAME   管理员用户名（PRD §42，只走环境变量）',
          '  SCIENCING_ADMIN_PASSWORD   管理员密码（PRD §42，只走环境变量）',
          '  SCIENCING_BROWSER_CHANNEL  浏览器渠道（默认 chrome，可选 msedge）',
          '  SCIENCING_STORAGE_STATE    storageState 路径（默认 playwright/.auth/admin.json）',
          '',
        ].join('\n'),
      );
      return 0;
  }
}

main()
  .then((code) => {
    log(`退出码: ${code}`);
    // 显式退出，避免真实站点 Chrome 子进程残留句柄导致进程挂起、日志不刷新
    process.exit(code);
  })
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    logJson('运行失败', { ok: false, error: message });
    printJson({ ok: false, error: message });
    process.exit(1);
  });
