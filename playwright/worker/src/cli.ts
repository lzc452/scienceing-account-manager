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
  jobsFile?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? 'help';
  const parsed: ParsedArgs = { command: command as ParsedArgs['command'] };
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--username' || arg === '-u') parsed.username = argv[++i];
    else if (arg === '--password' || arg === '-p') parsed.password = argv[++i];
    else if (arg === '--jobs' || arg === '-j') parsed.jobsFile = argv[++i];
  }
  return parsed;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
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

async function cmdReset(username: string | undefined, password: string | undefined): Promise<number> {
  if (!username || !password) {
    process.stderr.write('用法: reset --username <科应账号username> --password <新密码>\n');
    return 2;
  }
  const config = loadConfigFromEnv();
  printEnvSummary(config);
  log(`开始改密: username=${username}`);
  const worker = new ResetWorker(config);
  try {
    const result = await worker.processJob({ accountUsername: username, newPassword: password });
    logJson('改密结果', result);
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
  log(`命令: ${process.argv.slice(2).join(' ') || '(空)'}`);
  log(`日志文件: ${logFile}`);
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case 'login':
      await cmdLogin();
      return 0;
    case 'reset':
      return cmdReset(args.username, args.password);
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
          '  node dist/cli.js reset --username <科应账号username> --password <新密码>',
          '  node dist/cli.js run --jobs <队列JSON文件>   串行消费队列（PRD §28）',
          '  node dist/cli.js check                      健康检查三项：登录/账号管理页/改密入口（PRD §49）',
          '',
          '环境变量:',
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
