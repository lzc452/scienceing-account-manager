/**
 * 极简固定窗口限流（零依赖）。
 *
 * 用途：给 `login` / `admin/verify-password` 这类可被在线爆破的端点抬高成本。
 * 项目未引入 @nestjs/throttler，而这两个端点需要的不是精确配额而是「挡住脚本爆破」，
 * 一个进程内计数器足够，也就不必为此新增依赖。
 *
 * **只统计失败**：配额按失败次数计，登录成功会清零。否则一个正常用户
 * 反复登录/登出十几次就会被自己锁在门外。
 *
 * 已知局限（有意接受，不掩盖）：
 *  - 进程内状态：多实例部署时不共享，重启即清零；
 *  - 固定窗口而非滑动窗口：窗口边界处最多可通过 2×max 次。
 * 两者都不影响目标（抬高爆破成本），但不应被误读为强防护。
 */

export interface RateLimitOptions {
  /** 窗口长度（毫秒） */
  windowMs: number;
  /** 窗口内允许的最大失败次数 */
  max: number;
  /** 触发惰性清理的桶数量阈值（防止 Map 无限增长） */
  sweepThreshold?: number;
}

interface Bucket {
  failures: number;
  resetAt: number;
}

export interface RateLimiter {
  /** 该 key 是否已超限（只读，不计数）。 */
  isBlocked(key: string): boolean;
  /** 记一次失败。 */
  recordFailure(key: string): void;
  /** 清零（认证成功后调用）。 */
  reset(key: string): void;
  /** 窗口内剩余可失败次数，用于测试与可观测性。 */
  remaining(key: string): number;
}

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { windowMs, max } = options;
  const sweepThreshold = options.sweepThreshold ?? 1000;
  const buckets = new Map<string, Bucket>();

  /** 惰性清理：桶数超阈值时顺带清掉过期项，避免长期运行下 Map 只增不减。 */
  function sweep(now: number): void {
    if (buckets.size < sweepThreshold) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  /** 取当前有效桶；已过期或不存在则返回 null。 */
  function active(key: string, now: number): Bucket | null {
    const bucket = buckets.get(key);
    if (!bucket) return null;
    if (bucket.resetAt <= now) {
      buckets.delete(key);
      return null;
    }
    return bucket;
  }

  return {
    isBlocked(key: string): boolean {
      const now = Date.now();
      sweep(now);
      const bucket = active(key, now);
      return bucket !== null && bucket.failures >= max;
    },

    recordFailure(key: string): void {
      const now = Date.now();
      sweep(now);
      const bucket = active(key, now);
      if (!bucket) {
        buckets.set(key, { failures: 1, resetAt: now + windowMs });
        return;
      }
      bucket.failures += 1;
    },

    reset(key: string): void {
      buckets.delete(key);
    },

    remaining(key: string): number {
      const bucket = active(key, Date.now());
      return bucket ? Math.max(0, max - bucket.failures) : max;
    },
  };
}
