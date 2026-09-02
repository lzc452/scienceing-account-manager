import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Worker 日志（强制落盘）。
 *
 * 背景：Windows 终端（含 Git Bash/MSYS、部分集成终端）在 node 拉起 Chrome 子进程后，
 * stdout/stderr 的管道输出经常整段丢失（甚至父 shell 被一起带走），导致 CLI“看起来没输出”。
 * 因此所有进度与结果**同步写文件**（appendFileSync），即使进程随后被杀也已落盘；
 * 同时尽力写 stderr（终端正常时可以直接看到）。
 *
 * 日志默认路径：<repoRoot>/playwright/.worker-logs/worker.log（追加）。
 * 可用环境变量 SCIENCING_LOG_FILE 覆盖为绝对路径。
 */

let currentLogPath: string | null = null;

function findRepoRoot(): string {
  let dir = __dirname;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

export function defaultLogPath(): string {
  return path.join(findRepoRoot(), 'playwright', '.worker-logs', 'worker.log');
}

/** 初始化日志文件（创建目录），返回最终日志路径。 */
export function initLogger(explicitPath?: string): string {
  const raw = explicitPath && explicitPath.trim() !== '' ? explicitPath : defaultLogPath();
  currentLogPath = path.resolve(raw);
  fs.mkdirSync(path.dirname(currentLogPath), { recursive: true });
  return currentLogPath;
}

export function logPath(): string | null {
  return currentLogPath;
}

/** 时间戳前缀（本地字符串，便于人读）。 */
function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/** 写一行日志：同步落盘 + 尽力输出 stderr。 */
export function log(message: string): void {
  const line = `[${stamp()}] ${message}\n`;
  if (currentLogPath) {
    try {
      fs.appendFileSync(currentLogPath, line, 'utf8');
    } catch {
      // 日志写失败不能影响主流程
    }
  }
  try {
    process.stderr.write(line);
  } catch {
    // 终端不可用（管道被子进程带走）时忽略
  }
}

/** 记录一个结构化结果（JSON 序列化后写日志）。 */
export function logJson(label: string, value: unknown): void {
  try {
    log(`${label}: ${JSON.stringify(value)}`);
  } catch {
    log(`${label}: <无法序列化>`);
  }
}
