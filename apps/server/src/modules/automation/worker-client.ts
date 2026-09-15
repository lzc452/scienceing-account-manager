import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

/**
 * 子进程调用 playwright/worker CLI（t12 接线核心，PRD §30 Phase 2）。
 *
 * 选择子进程而非同进程 import ResetWorker 的原因（README「经 HTTP/子进程」建议）：
 *  - 浏览器在独立进程运行，崩溃/无头 Chrome 异常不会拖垮 NestJS API；
 *  - Worker 与 API 的解耦：各自独立升级、独立验证；
 *  - 复用 Worker 已实现的 CLI（login / reset / run / check），不在后端重复造轮子。
 *
 * 环境变量全部继承自 API 进程（SCIENCING_ADMIN_URL / USERNAME / PASSWORD / STORAGE_STATE 等）。
 * 凭据只走环境变量与 stdin（PRD §42），绝不进 argv、绝不落盘、绝不进日志。
 */

export interface WorkerCliResult {
  /** 子进程退出码为 0（Worker 内部 SUCCESS 或正常输出）。 */
  ok: boolean;
  /** Worker CLI stdout（JSON 输出，可能带前缀日志，解析时从首个 { 取）。 */
  raw: string;
  error?: string;
}

export interface WorkerCliOptions {
  /**
   * 需要写入子进程 stdin 的敏感负载（如改密口令）。
   * 走 stdin 而非 argv：argv 对同机任何进程可见，且极易被日志/异常信息带走。
   */
  stdin?: string;
  /**
   * 本次调用期望的 jobId。用于校验结果文件确实属于本次调用，
   * 避免超时/重试场景下读到上一次的陈旧结论。
   */
  expectJobId?: number | string;
}

/** 结果文件名序号：与 pid、时间戳组合，保证每次调用互不碰撞。 */
let resultFileSeq = 0;

function nextResultFilePath(): string {
  resultFileSeq += 1;
  return path.join(tmpdir(), `scienceing-worker-result-${process.pid}-${Date.now()}-${resultFileSeq}.json`);
}

/**
 * 读取并**一次性消费**结果文件。
 *
 * Worker CLI 在打印 JSON 的同时把同一份结果原子写入该文件；当子进程因超时被杀、
 * stdout 未送达或被截断时，这里是「结论已经产生但没传回来」的唯一补偿通道。
 * 读完即删，杜绝陈旧结果串到下一次调用。
 */
function consumeResultFile(file: string, expectJobId?: number | string): string | null {
  try {
    if (!fs.existsSync(file)) return null;
    const text = fs.readFileSync(file, 'utf8');
    fs.rmSync(file, { force: true });
    if (expectJobId === undefined) return text;

    const parsed = JSON.parse(text) as { jobId?: number | string };
    // 结果里带 jobId 时必须匹配；不带则接受（文件路径本身已保证唯一性）。
    if (parsed?.jobId !== undefined && String(parsed.jobId) !== String(expectJobId)) return null;
    return text;
  } catch {
    return null;
  }
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Worker CLI 路径：
 *  - 环境变量 SCIENCING_WORKER_CLI 可显式指定（绝对路径或相对仓库根路径）；
 *  - 默认 <仓库根>/playwright/worker/dist/cli.js（需先 build）。
 */
export function workerCliPath(): string {
  // 本文件编译后位于 <repo>/apps/server/dist/modules/automation，向上 5 级即仓库根。
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const raw = process.env.SCIENCING_WORKER_CLI;
  return raw ? path.resolve(repoRoot, raw) : path.join(repoRoot, 'playwright', 'worker', 'dist', 'cli.js');
}

/**
 * 单次 Worker CLI 超时（毫秒，默认 180s）。
 * 覆盖最坏路径：storageState 失效自动重登（单点确认 ~10s + 跳转 + 二次导航）+
 * Worker 内部最多 3 次尝试（每次 15~40s）+ 失败重试间隔。120s 对「重登 + 多次重试」偏紧，
 * 会导致改密其实成功但 CLI 未退出被误判失败；可用 SCIENCING_WORKER_TIMEOUT_MS 覆盖。
 */
export function workerTimeoutMs(): number {
  return envInt('SCIENCING_WORKER_TIMEOUT_MS', 180_000);
}

/**
 * 启动子进程前的预检：
 *  - 科应后台三件套环境变量齐备（缺则子进程必然失败，直接给出可读错误）；
 *  - Worker CLI 已编译存在（未 build 时给出修复命令）。
 * 返回 null 表示通过，否则返回错误文案。
 */
export function checkWorkerEnv(): string | null {
  const missing = ['SCIENCING_ADMIN_URL', 'SCIENCING_ADMIN_USERNAME', 'SCIENCING_ADMIN_PASSWORD'].filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    return `缺少科应后台环境变量：${missing.join(', ')}（Worker 凭据只走环境变量，PRD §42）`;
  }
  if (!fs.existsSync(workerCliPath())) {
    return `Worker CLI 不存在：${workerCliPath()}。请先执行 pnpm --filter @scienceing/playwright-worker build`;
  }
  return null;
}

/** 从 Worker CLI stdout 提取首个 JSON 对象（容忍日志前缀，JSON 解析失败返回 null）。 */
export function parseWorkerJson<T>(raw: string): T | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  try {
    return JSON.parse(raw.slice(start)) as T;
  } catch {
    return null;
  }
}

/**
 * 调用 Worker CLI：继承当前环境变量，超时自动 kill，stdout/stderr 完整收集。
 *
 * 结果回传有两条通道，互为补偿：
 *  1. stdout 的 JSON（正常路径）；
 *  2. SCIENCING_RESULT_FILE 指向的原子结果文件（超时/被杀/stdout 丢失时的兜底）。
 * 两者取先解析成功者，且结果文件读取后即删除、并按 jobId 校验归属。
 */
export function runWorkerCli(args: string[], options: WorkerCliOptions = {}): Promise<WorkerCliResult> {
  return new Promise((resolve) => {
    const cli = workerCliPath();
    const timeoutMs = workerTimeoutMs();
    const resultFile = nextResultFilePath();
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, SCIENCING_RESULT_FILE: resultFile },
      windowsHide: true,
      // stdin 需要可写（口令经 stdin 传入）；即使本次无 stdin 也要保持管道形态一致。
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill();
      finish(new Error(`Worker CLI 超时（${timeoutMs}ms）：${cli} ${describeArgs(args)}`));
    }, timeoutMs);

    function finish(error?: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      // 子进程可能已经得出结论（stdout 已打印，或结果文件已落盘）却因超时被误判失败。
      // 优先采信任何一处可解析的结论，避免「平台已改密、库里记失败」的发散。
      const fromFile = consumeResultFile(resultFile, options.expectJobId);
      const raw = parseWorkerJson(stdout) ? stdout : (fromFile ?? stdout);

      resolve(error ? { ok: false, raw, error: error.message } : { ok: true, raw });
    }

    // 敏感负载（口令）经 stdin 写入后立即关闭，不进入 argv。
    if (child.stdin) {
      child.stdin.on('error', () => undefined); // 子进程提前退出时忽略 EPIPE
      if (options.stdin !== undefined) child.stdin.write(options.stdin);
      child.stdin.end();
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => finish(err));
    child.on('close', (code) => {
      if (code === 0) {
        finish();
        return;
      }
      // Worker 业务错误以 JSON 打到 stdout（cli.ts catch 分支）；stderr 仅作兜底。
      const detail = stderr.trim() || `Worker CLI 退出码 ${code}`;
      finish(new Error(detail));
    });
  });
}

/** 携带独立取值的敏感开关：`--password xxx`。 */
const SECRET_FLAG = /^--(password|passwd|pwd|token|secret)$/i;
/** 取值内联的敏感开关：`--password=xxx`。 */
const SECRET_FLAG_INLINE = /^--(password|passwd|pwd|token|secret)=/i;

/**
 * 生成可安全写进日志/错误信息的参数摘要。
 * 绝不能直接 join(argv)：口令等敏感值可能出现在参数里。
 * 注意 `--password-stdin` 只是开关、不含取值，不应触发对下一个参数的脱敏。
 */
function describeArgs(args: string[]): string {
  return args
    .map((arg, i) => {
      if (SECRET_FLAG_INLINE.test(arg)) return `${arg.slice(0, arg.indexOf('=') + 1)}<已脱敏>`;
      const prev = i > 0 ? args[i - 1] : undefined;
      if (prev !== undefined && SECRET_FLAG.test(prev)) return '<已脱敏>';
      return arg;
    })
    .join(' ');
}
