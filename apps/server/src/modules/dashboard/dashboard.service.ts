import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';

/** 可选统计范围（天）：前端下拉与后端白名单共用。 */
export const DASHBOARD_RANGE_OPTIONS = [7, 30, 90] as const;
export const DASHBOARD_DEFAULT_RANGE = 30;

export interface NamedCount {
  name: string;
  label: string;
  value: number;
}

export interface AccountLoadRow {
  accountId: number;
  code: string;
  username: string;
  status: string;
  claimCount: number;
  totalMinutes: number;
}

export interface TopUserRow {
  userId: number;
  displayName: string;
  department: string;
  claimCount: number;
  totalMinutes: number;
}

export interface AbnormalAccountRow {
  accountId: number;
  code: string;
  username: string;
  status: string;
  enabled: boolean;
  lastPasswordChangedAt: string | null;
  passwordAgeDays: number | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export interface PasswordBucket {
  label: string;
  count: number;
}

export interface DashboardStats {
  range: { days: number; from: string; to: string };
  overview: {
    accountTotal: number;
    accountEnabled: number;
    accountDisabled: number;
    available: number;
    inUse: number;
    recycling: number;
    error: number;
    activeLeases: number;
    activeUsers: number;
    avgLeaseMinutes: number;
    totalClaims: number;
  };
  /** 账号状态分布（环形图） */
  accountStatus: NamedCount[];
  /** 账号负载 TOP10（横向柱状） */
  accountLoad: AccountLoadRow[];
  /** 密码健康度：按「距上次改密天数」分桶 + 需关注账号清单 */
  passwordHealth: {
    buckets: PasswordBucket[];
    neverChanged: number;
    abnormal: AbnormalAccountRow[];
  };
  /** 改密任务成功率 + 每日趋势 */
  resetJobs: {
    success: number;
    failed: number;
    pending: number;
    running: number;
    total: number;
    trend: Array<{ day: string; success: number; failed: number }>;
  };
  /** 每日领用次数趋势（缺天补 0） */
  claimTrend: Array<{ day: string; count: number }>;
  /** 用户活跃排行 TOP10 */
  topUsers: TopUserRow[];
  /** 释放原因构成（饼图） */
  releaseReasons: NamedCount[];
}

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: '可用',
  IN_USE: '使用中',
  RECYCLING: '回收中',
  ERROR: '异常',
};

const RELEASE_REASON_LABEL: Record<string, string> = {
  USER_RETURN: '主动归还',
  INACTIVITY_TIMEOUT: '无操作超时',
  ADMIN_FORCE: '管理员强制回收',
  RESET_ERROR: '改密失败回收',
};

/**
 * 数据看板聚合（t13）：GET /api/admin/dashboard?days=30
 *
 * 全部走单条 SQL 聚合，不新增表；时间字段为 ISO(UTC) 字符串，统一用
 * datetime()/date() 归一化后比较，避免 'T'/'Z' 与 SQLite 默认格式的字典序差异。
 */
@Injectable()
export class DashboardService {
  constructor(private readonly dbService: DatabaseService) {}

  stats(daysInput?: number): DashboardStats {
    const days = this.normalizeRange(daysInput);
    const since = `-${days} days`;

    const overview = this.readOverview(since);
    return {
      range: { days, from: this.sinceIso(days), to: new Date().toISOString() },
      overview,
      accountStatus: this.readAccountStatus(),
      accountLoad: this.readAccountLoad(since),
      passwordHealth: this.readPasswordHealth(),
      resetJobs: this.readResetJobs(days, since),
      claimTrend: this.readClaimTrend(days, since),
      topUsers: this.readTopUsers(since),
      releaseReasons: this.readReleaseReasons(since),
    };
  }

  private normalizeRange(daysInput?: number): number {
    const value = Number(daysInput);
    if (!Number.isFinite(value)) return DASHBOARD_DEFAULT_RANGE;
    return (DASHBOARD_RANGE_OPTIONS as readonly number[]).includes(value)
      ? value
      : DASHBOARD_DEFAULT_RANGE;
  }

  private sinceIso(days: number): string {
    const row = this.dbService.db
      .prepare(`SELECT datetime('now', ?) AS d`)
      .get(`-${days} days`) as { d: string };
    return `${row.d.replace(' ', 'T')}.000Z`;
  }

  private readOverview(since: string): DashboardStats['overview'] {
    const statusRow = this.dbService.db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE enabled = 1) AS enabled_count,
           COUNT(*) FILTER (WHERE enabled = 0) AS disabled_count,
           COUNT(*) FILTER (WHERE status = 'AVAILABLE' AND enabled = 1) AS available,
           COUNT(*) FILTER (WHERE status = 'IN_USE' AND enabled = 1)     AS in_use,
           COUNT(*) FILTER (WHERE status = 'RECYCLING' AND enabled = 1)  AS recycling,
           COUNT(*) FILTER (WHERE status = 'ERROR' AND enabled = 1)      AS error
         FROM scienceing_accounts`,
      )
      .get() as {
      total: number;
      enabled_count: number;
      disabled_count: number;
      available: number;
      in_use: number;
      recycling: number;
      error: number;
    };

    const leaseRow = this.dbService.db
      .prepare(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active_leases,
           COUNT(DISTINCT user_id) FILTER (WHERE status = 'ACTIVE') AS active_users
         FROM leases`,
      )
      .get() as { active_leases: number; active_users: number };

    const usageRow = this.dbService.db
      .prepare(
        `SELECT
           COUNT(*) AS claims,
           COALESCE(AVG(
             CASE WHEN released_at IS NOT NULL
                  THEN (julianday(released_at) - julianday(started_at)) * 1440.0
                  ELSE NULL END
           ), 0) AS avg_minutes
         FROM leases
         WHERE datetime(started_at) >= datetime('now', ?)`,
      )
      .get(since) as { claims: number; avg_minutes: number };

    return {
      accountTotal: statusRow.total,
      accountEnabled: statusRow.enabled_count,
      accountDisabled: statusRow.disabled_count,
      available: statusRow.available,
      inUse: statusRow.in_use,
      recycling: statusRow.recycling,
      error: statusRow.error,
      activeLeases: leaseRow.active_leases,
      activeUsers: leaseRow.active_users,
      avgLeaseMinutes: Math.round(usageRow.avg_minutes ?? 0),
      totalClaims: usageRow.claims ?? 0,
    };
  }

  private readAccountStatus(): NamedCount[] {
    const rows = this.dbService.db
      .prepare(
        `SELECT status AS name, COUNT(*) AS value
         FROM scienceing_accounts WHERE enabled = 1 GROUP BY status`,
      )
      .all() as Array<{ name: string; value: number }>;
    return rows.map((row) => ({ ...row, label: STATUS_LABEL[row.name] ?? row.name }));
  }

  private readAccountLoad(since: string): AccountLoadRow[] {
    return this.dbService.db
      .prepare(
        `SELECT
           a.id AS accountId,
           a.code AS code,
           a.username AS username,
           a.status AS status,
           COUNT(l.id) AS claimCount,
           COALESCE(SUM(
             CASE
               WHEN l.id IS NULL THEN 0
               WHEN l.released_at IS NOT NULL
                    THEN (julianday(l.released_at) - julianday(l.started_at)) * 1440.0
               ELSE (julianday('now') - julianday(l.started_at)) * 1440.0
             END
           ), 0) AS totalMinutes
         FROM scienceing_accounts a
         LEFT JOIN leases l
           ON l.account_id = a.id AND datetime(l.started_at) >= datetime('now', ?)
         GROUP BY a.id
         ORDER BY claimCount DESC, totalMinutes DESC
         LIMIT 10`,
      )
      .all(since)
      .map((row) => {
        const typed = row as unknown as AccountLoadRow;
        return { ...typed, totalMinutes: Math.round(typed.totalMinutes) };
      });
  }

  private readPasswordHealth(): DashboardStats['passwordHealth'] {
    const rows = this.dbService.db
      .prepare(
        `SELECT id, code, username, status, enabled, last_password_changed_at AS lastPasswordChangedAt
         FROM scienceing_accounts`,
      )
      .all() as Array<{
      id: number;
      code: string;
      username: string;
      status: string;
      enabled: number;
      lastPasswordChangedAt: string | null;
    }>;

    // 计数用命名对象，避免数组下标访问（tsconfig 开了 noUncheckedIndexedAccess）
    const counter = { d7: 0, d30: 0, d90: 0, older: 0, never: 0 };

    let neverChanged = 0;
    const now = Date.now();
    const scored = rows.map((row) => {
      const ageDays = row.lastPasswordChangedAt
        ? Math.floor((now - new Date(row.lastPasswordChangedAt).getTime()) / 86_400_000)
        : null;
      if (ageDays === null) {
        neverChanged += 1;
        counter.never += 1;
      } else if (ageDays <= 7) counter.d7 += 1;
      else if (ageDays <= 30) counter.d30 += 1;
      else if (ageDays <= 90) counter.d90 += 1;
      else counter.older += 1;
      return { ...row, passwordAgeDays: ageDays };
    });

    const buckets: PasswordBucket[] = [
      { label: '7 天内', count: counter.d7 },
      { label: '8-30 天', count: counter.d30 },
      { label: '31-90 天', count: counter.d90 },
      { label: '90 天以上', count: counter.older },
      { label: '从未改密', count: counter.never },
    ];

    // 需关注：异常状态 / 已禁用 / 密码超过 90 天未换 / 从未改密
    const abnormal = scored
      .filter(
        (row) =>
          row.status === 'ERROR' ||
          row.enabled === 0 ||
          row.passwordAgeDays === null ||
          (row.passwordAgeDays !== null && row.passwordAgeDays > 90),
      )
      .slice(0, 50);

    const abnormalWithError: AbnormalAccountRow[] = abnormal.map((row) => {
      const lastFailed = this.dbService.db
        .prepare(
          `SELECT error_message AS message, created_at AS at
           FROM reset_jobs
           WHERE account_id = ? AND status = 'FAILED'
           ORDER BY id DESC LIMIT 1`,
        )
        .get(row.id) as { message: string | null; at: string } | undefined;
      return {
        accountId: row.id,
        code: row.code,
        username: row.username,
        status: row.status,
        enabled: row.enabled === 1,
        lastPasswordChangedAt: row.lastPasswordChangedAt,
        passwordAgeDays: row.passwordAgeDays,
        lastError: lastFailed?.message ?? null,
        lastErrorAt: lastFailed?.at ?? null,
      };
    });

    return { buckets, neverChanged, abnormal: abnormalWithError };
  }

  private readResetJobs(days: number, since: string): DashboardStats['resetJobs'] {
    const row = this.dbService.db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'SUCCESS') AS success,
           COUNT(*) FILTER (WHERE status = 'FAILED')  AS failed,
           COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
           COUNT(*) FILTER (WHERE status = 'RUNNING') AS running
         FROM reset_jobs
         WHERE datetime(created_at) >= datetime('now', ?)`,
      )
      .get(since) as {
      total: number;
      success: number;
      failed: number;
      pending: number;
      running: number;
    };

    const daily = this.dbService.db
      .prepare(
        `SELECT date(created_at) AS day,
                COUNT(*) FILTER (WHERE status = 'SUCCESS') AS success,
                COUNT(*) FILTER (WHERE status = 'FAILED')  AS failed
         FROM reset_jobs
         WHERE datetime(created_at) >= datetime('now', ?)
         GROUP BY day`,
      )
      .all(since) as Array<{ day: string; success: number; failed: number }>;

    const byDay = new Map(daily.map((item) => [item.day, item]));
    const trend = this.daySeries(days).map((day) => ({
      day,
      success: byDay.get(day)?.success ?? 0,
      failed: byDay.get(day)?.failed ?? 0,
    }));

    return { ...row, trend };
  }

  private readClaimTrend(days: number, since: string): Array<{ day: string; count: number }> {
    const rows = this.dbService.db
      .prepare(
        `SELECT date(started_at) AS day, COUNT(*) AS count
         FROM leases
         WHERE datetime(started_at) >= datetime('now', ?)
         GROUP BY day`,
      )
      .all(since) as Array<{ day: string; count: number }>;
    const byDay = new Map(rows.map((row) => [row.day, row.count]));
    return this.daySeries(days).map((day) => ({ day, count: byDay.get(day) ?? 0 }));
  }

  private readTopUsers(since: string): TopUserRow[] {
    return this.dbService.db
      .prepare(
        `SELECT
           u.id AS userId,
           u.display_name AS displayName,
           u.department AS department,
           COUNT(l.id) AS claimCount,
           COALESCE(SUM(
             CASE
               WHEN l.id IS NULL THEN 0
               WHEN l.released_at IS NOT NULL
                    THEN (julianday(l.released_at) - julianday(l.started_at)) * 1440.0
               ELSE (julianday('now') - julianday(l.started_at)) * 1440.0
             END
           ), 0) AS totalMinutes
         FROM users u
         LEFT JOIN leases l
           ON l.user_id = u.id AND datetime(l.started_at) >= datetime('now', ?)
         GROUP BY u.id
         ORDER BY claimCount DESC, totalMinutes DESC
         LIMIT 10`,
      )
      .all(since)
      .map((row) => {
        const typed = row as unknown as TopUserRow;
        return { ...typed, totalMinutes: Math.round(typed.totalMinutes) };
      });
  }

  private readReleaseReasons(since: string): NamedCount[] {
    const rows = this.dbService.db
      .prepare(
        `SELECT release_reason AS name, COUNT(*) AS value
         FROM leases
         WHERE release_reason IS NOT NULL
           AND datetime(released_at) >= datetime('now', ?)
         GROUP BY release_reason`,
      )
      .all(since) as Array<{ name: string; value: number }>;
    return rows.map((row) => ({
      name: row.name,
      label: RELEASE_REASON_LABEL[row.name] ?? row.name,
      value: row.value,
    }));
  }

  /** 生成最近 days 天的 UTC 日期序列（含今天），用于给趋势图补零。 */
  private daySeries(days: number): string[] {
    const out: string[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }
}
