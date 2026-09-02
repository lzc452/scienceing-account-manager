import * as fs from 'node:fs';
import { chromium } from 'playwright';
import { loadConfigFromEnv } from './config';
import { loginAdmin, saveStorageState } from './auth';
import { checkHealth } from './health';
import { ResetWorker, type ResetJobInput } from './worker';

interface ParsedArgs {
  command: 'login' | 'reset' | 'run' | 'check' | 'help';
  account?: string;
  password?: string;
  jobsFile?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? 'help';
  const parsed: ParsedArgs = { command: command as ParsedArgs['command'] };
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--account' || arg === '-a') parsed.account = argv[++i];
    else if (arg === '--password' || arg === '-p') parsed.password = argv[++i];
    else if (arg === '--jobs' || arg === '-j') parsed.jobsFile = argv[++i];
  }
  return parsed;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function cmdLogin(): Promise<void> {
  const config = loadConfigFromEnv();
  const browser = await chromium.launch({
    channel: config.browserChannel,
    headless: config.headless,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setDefaultTimeout(config.defaultTimeoutMs);
    await loginAdmin(page, config);
    await saveStorageState(context, config);
    printJson({ ok: true, storageStatePath: config.storageStatePath });
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function cmdReset(account: string | undefined, password: string | undefined): Promise<number> {
  if (!account || !password) {
    process.stderr.write('用法: reset --account <账号编号> --password <新密码>\n');
    return 2;
  }
  const config = loadConfigFromEnv();
  const worker = new ResetWorker(config);
  try {
    const result = await worker.processJob({ accountCode: account, newPassword: password });
    printJson(result);
    return result.status === 'SUCCESS' ? 0 : 1;
  } finally {
    await worker.close();
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
    await worker.close();
  }
}

/** 健康检查（PRD §49）：登录 / 账号管理页 / 改密入口三项，供后端 HEALTH_EXECUTOR 子进程调用。 */
async function cmdCheck(): Promise<number> {
  const config = loadConfigFromEnv();
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
    await browser.close().catch(() => undefined);
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case 'login':
      await cmdLogin();
      return 0;
    case 'reset':
      return cmdReset(args.account, args.password);
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
          '  node dist/cli.js reset --account KY-01 --password <新密码>',
          '  node dist/cli.js run --jobs <队列JSON文件>   串行消费队列（PRD §28）',
          '  node dist/cli.js check                      健康检查三项：登录/账号管理页/改密入口（PRD §49）',
          '',
          '环境变量:',
          '  SCIENCING_ADMIN_URL        科应管理后台地址',
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
    process.exitCode = code;
  })
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    printJson({ ok: false, error: message });
    process.exitCode = 1;
  });
