import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 子进程调用 playwright/worker CLI（t12 接线核心，PRD §30 Phase 2）。
 *
 * 选择子进程而非同进程 import ResetWorker 的原因（README「经 HTTP/子进程」建议）：
 *  - 浏览器在独立进程运行，崩溃/无头 Chrome 异常不会拖垮 NestJS API；
 *  - Worker 与 API 的解耦：各自独立升级、独立验证；
 *  - 复用 Worker 已实现的 CLI（login / reset / run / check），不在后端重复造轮子。
 *
 * 环境变量全部继承自 API 进程（SCIENCING_ADMIN_URL / USERNAME / PASSWORD / STORAGE_STATE 等），
 * 凭据只走环境变量（PRD §42），绝不落盘、绝不进日志。
 */

export interface WorkerCliResult {
  /** 子进程退出码为 0（Worker 内部 SUCCESS 或正常输出）。 */
  ok: boolean;
  /** Worker CLI stdout（JSON 输出，可能带前缀日志，解析时从首个 { 取）。 */
  raw: string;
  error?: string;
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

/** 调用 Worker CLI：继承当前环境变量，超时自动 kill，stdout/stderr 完整收集。 */
export function runWorkerCli(args: string[]): Promise<WorkerCliResult> {
  return new Promise((resolve) => {
    const cli = workerCliPath();
    const timeoutMs = workerTimeoutMs();
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill();
      finish(new Error(`Worker CLI 超时（${timeoutMs}ms）：${cli} ${args.join(' ')}`));
    }, timeoutMs);

    function finish(error?: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(error ? { ok: false, raw: stdout, error: error.message } : { ok: true, raw: stdout });
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
