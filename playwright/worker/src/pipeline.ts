/**
 * 纯编排逻辑（不依赖浏览器），便于在无浏览器环境做单测：
 *   - runWithRetry：失败重试策略（PRD §48，最多 2～3 次）
 *   - runQueueSerial：单 Worker 串行消费队列（PRD §28，不并行登录管理员）
 */

export interface SuccessResult {
  ok: true;
}

export interface FailureResult {
  ok: false;
  error: string;
}

export type AttemptOutcome = SuccessResult | FailureResult;

export interface RetryOptions {
  /** 最大尝试次数（含首次）。PRD §48 要求 2～3 次。 */
  maxAttempts: number;
  /** 每次失败后等待毫秒数（PRD §48：等待数秒）。 */
  retryDelayMs: number;
}

export interface RetryResult {
  status: 'SUCCESS' | 'FAILED';
  attempts: number;
  error?: string;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * 失败重试：每次尝试失败后等待 retryDelayMs 再重试，直到成功或达到 maxAttempts。
 * 返回最终状态与已消耗的尝试次数（PRD §48：不要无限重试）。
 */
export async function runWithRetry(
  action: () => Promise<AttemptOutcome>,
  opts: RetryOptions,
): Promise<RetryResult> {
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const outcome = await action();
      if (outcome.ok) {
        return { status: 'SUCCESS', attempts: attempt };
      }
      lastError = outcome.error;
    } catch (err) {
      lastError = toErrorMessage(err);
    }
    if (attempt < opts.maxAttempts) {
      await sleep(opts.retryDelayMs);
    }
  }
  return { status: 'FAILED', attempts: opts.maxAttempts, error: lastError };
}

/**
 * 串行消费队列：逐个 await，绝不并行（PRD §28 单 Worker，避免管理员会话互踢）。
 */
export async function runQueueSerial<T, R>(items: T[], process: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (const item of items) {
    results.push(await process(item));
  }
  return results;
}
