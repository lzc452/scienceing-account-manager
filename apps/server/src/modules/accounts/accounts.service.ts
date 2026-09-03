import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';

export interface AccountAvailability {
  total: number;
  available: number;
  inUse: number;
  recycling: number;
  error: number;
}

/** 账号池行（游客可见）：只暴露 code + status + 预计释放时间，绝不泄露使用人/密码/密文（PRD §35 / R10）。 */
export interface AccountPoolItem {
  code: string;
  status: string;
  estimatedReleaseAt: string | null;
}

/** 无操作超时默认 30 分钟（配置单位为分钟，见 system_settings.inactivity_timeout_minutes） */
const DEFAULT_INACTIVITY_TIMEOUT_MINUTES = 30;

@Injectable()
export class AccountsService {
  constructor(private readonly dbService: DatabaseService) {}

  /** 账号池可用性统计（游客可访问；不泄露密码与使用人，PRD §40 / §2.1）。 */
  availability(): AccountAvailability {
    const row = this.dbService.db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'AVAILABLE') AS available,
           COUNT(*) FILTER (WHERE status = 'IN_USE') AS in_use,
           COUNT(*) FILTER (WHERE status = 'RECYCLING') AS recycling,
           COUNT(*) FILTER (WHERE status = 'ERROR') AS error
         FROM scienceing_accounts
         WHERE enabled = 1`,
      )
      .get() as { total: number; available: number; in_use: number; recycling: number; error: number };

    return {
      total: row.total,
      available: row.available,
      inUse: row.in_use,
      recycling: row.recycling,
      error: row.error,
    };
  }

  /**
   * 账号池列表（游客可访问，PRD §35 / PRODUCT-DESIGN §3.2/§5.1）。
   * 仅返回 code/status/estimatedReleaseAt；IN_USE 的 estimatedReleaseAt = last_activity_at + 超时秒数。
   * 匿名：不含使用人姓名、密码、密文字段（R10）。
   */
  pool(): AccountPoolItem[] {
    const timeoutSeconds = this.inactivityTimeoutSeconds();
    const rows = this.dbService.db
      .prepare(
        `SELECT a.code, a.status, l.last_activity_at
         FROM scienceing_accounts a
         LEFT JOIN leases l ON l.account_id = a.id AND l.status = 'ACTIVE'
         WHERE a.enabled = 1
         ORDER BY a.code`,
      )
      .all() as unknown as Array<{ code: string; status: string; last_activity_at: string | null }>;

    return rows.map((row) => {
      let estimatedReleaseAt: string | null = null;
      if (row.status === 'IN_USE' && row.last_activity_at) {
        estimatedReleaseAt = new Date(new Date(row.last_activity_at).getTime() + timeoutSeconds * 1000).toISOString();
      }
      return { code: row.code, status: row.status, estimatedReleaseAt };
    });
  }

  /** 无操作超时（秒）：配置按分钟存（inactivity_timeout_minutes），此处换算成秒。 */
  private inactivityTimeoutSeconds(): number {
    const row = this.dbService.db
      .prepare('SELECT value FROM system_settings WHERE key = ?')
      .get('inactivity_timeout_minutes') as unknown as { value: string } | undefined;
    if (row) {
      const minutes = Number(row.value);
      if (Number.isFinite(minutes) && minutes > 0) {
        return Math.round(minutes * 60);
      }
    }
    return DEFAULT_INACTIVITY_TIMEOUT_MINUTES * 60;
  }
}
