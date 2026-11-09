/**
 * 密码轮换判定（纯函数，无 IO，可单独单测）。
 *
 * 为什么要把判定抽出来：轮换策略一旦写进 service，就只能靠起库、造数据、跑调度器
 * 来验证，边界条件（时钟回拨、时间戳损坏、频次与超期交叉）几乎测不全。
 * 这里只做「给定输入 → 该不该改」，所有时间比较集中在一处，便于审查。
 *
 * 三条护栏，顺序有讲究：
 *  1. 关闭开关（maxAgeDays <= 0）优先——管理员关掉定时轮换就什么都不该发生；
 *  2. **先判超期，再对超期者做频次护栏**——顺序颠倒会让「刚改过、远未到期」的账号
 *     也被判成「推迟」。那本身无害，但每次部署后都会给整池账号各写一条
 *     ROTATION_DEFERRED 审计，把真正的异常淹没；而正常配置（30 天 > 24 小时）下
 *     超期必然已过最小间隔，频次护栏只在「配置冲突」时才该生效；
 *  3. 时间戳异常按「从未改过」处理——不知道多久没改，比「假设它很新」安全。
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** 触发改密的原因，写入 scienceing_accounts.rotation_due_reason 与审计 metadata。 */
export type RotationReason = 'AGE_EXCEEDED' | 'NEVER_ROTATED';

export type RotationDecision =
  /** 应当排入改密队列。 */
  | { kind: 'rotate'; reason: RotationReason }
  /** 距上次改密不足最小间隔，推迟到 until（ISO 字符串，保证晚于 now）。 */
  | { kind: 'defer'; until: string; reason: 'MIN_INTERVAL' }
  | {
      kind: 'skip';
      reason: 'DISABLED' | 'NOT_AVAILABLE' | 'NOT_PROVISIONED' | 'NOT_BEFORE' | 'NOT_DUE';
    };

export interface RotationInput {
  /** scienceing_accounts.status */
  status: string;
  /** 密码是否已真实托管（占位值/解密失败都算未托管） */
  provisioned: boolean;
  /** scienceing_accounts.last_password_changed_at（ISO） */
  lastChangedAt: string | null;
  /** scienceing_accounts.rotation_not_before（ISO）：上一次被判推迟时的到期时间 */
  notBefore: string | null;
  now: Date;
  /** 0 表示关闭定时轮换 */
  maxAgeDays: number;
  /** 0 表示不做频次限制 */
  minIntervalHours: number;
}

/**
 * 解析时间戳。返回 null 表示「不可用」——调用方应按「从未改过」处理，
 * 而不是当成 now（那会让所有时间戳损坏的账号永远不轮换）。
 */
function parseTime(raw: string | null): number | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function decideRotation(input: RotationInput): RotationDecision {
  // 1) 全局开关：关闭时不产生任何副作用
  if (!Number.isFinite(input.maxAgeDays) || input.maxAgeDays <= 0) {
    return { kind: 'skip', reason: 'DISABLED' };
  }

  // 2) 只轮换空闲账号：IN_USE 会打断正在用的人，DIRTY/RECYCLING/ERROR 各自有主流程
  if (input.status !== 'AVAILABLE') {
    return { kind: 'skip', reason: 'NOT_AVAILABLE' };
  }

  // 3) 未托管密码（占位值 / 解密失败）不能排入：
  //    这类账号在科应上很可能连用户名都不对，改密必然失败，
  //    而失败即 ERROR（MAX_ATTEMPTS=1）——一批占位账号会被一次清扫集体烧成异常。
  if (!input.provisioned) {
    return { kind: 'skip', reason: 'NOT_PROVISIONED' };
  }

  const nowMs = input.now.getTime();

  // 4) 已被推迟且还没到期：直接跳过，不重复评估、不重复写审计
  const notBeforeMs = parseTime(input.notBefore);
  if (notBeforeMs !== null && nowMs < notBeforeMs) {
    return { kind: 'skip', reason: 'NOT_BEFORE' };
  }

  // 5) 时间戳缺失或损坏 → 按「从未改过」立即轮换
  const changedMs = parseTime(input.lastChangedAt);
  if (changedMs === null) {
    return { kind: 'rotate', reason: 'NEVER_ROTATED' };
  }

  const ageMs = nowMs - changedMs;

  // 6) 时钟回拨 / 时间戳在未来：不猜，跳过等下一轮。
  //    若在这里按「超期」处理，一次误配置的系统时间会让整池账号被轮换一遍。
  if (ageMs < 0) {
    return { kind: 'skip', reason: 'NOT_DUE' };
  }

  // 7) 超期判定：没到有效期就什么都不做（含「刚改过」这种最常见的情况）
  if (ageMs <= input.maxAgeDays * DAY_MS) {
    return { kind: 'skip', reason: 'NOT_DUE' };
  }

  // 8) 确实超期了，才看频次护栏。
  //    正常配置（maxAge 30 天 > minInterval 24 小时）下这里必然已放过；
  //    只有管理员把 minInterval 配得比 maxAge 还大（配置冲突）才会推迟——
  //    此时宁可晚改，也不要在短时间内对同一账号反复改密。
  const minIntervalMs = Math.max(0, input.minIntervalHours) * HOUR_MS;
  if (minIntervalMs > 0 && ageMs < minIntervalMs) {
    return {
      kind: 'defer',
      until: new Date(changedMs + minIntervalMs).toISOString(),
      reason: 'MIN_INTERVAL',
    };
  }

  return { kind: 'rotate', reason: 'AGE_EXCEEDED' };
}
