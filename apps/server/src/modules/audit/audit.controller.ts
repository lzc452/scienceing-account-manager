import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { AuthGuard } from '../../guards/auth.guard';
import { AdminGuard } from '../../guards/admin.guard';
import { AUDIT_ACTION_LABEL } from '../../db/constants';

interface AuditLogRow {
  id: number;
  user_id: number | null;
  account_id: number | null;
  lease_id: number | null;
  action: string;
  result: string;
  ip: string | null;
  user_agent: string | null;
  metadata: string | null;
  created_at: string;
  user_username?: string | null;
  user_display_name?: string | null;
}

@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AuditController {
  constructor(private readonly dbService: DatabaseService) {}

  @Get('logs')
  list(
    @Query('action') action?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('hideActivity') hideActivity?: string,
  ) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));

    // 服务端过滤：action 精确匹配；hideActivity=1 时排除 ACTIVITY 明细（与前端「显示 Activity 明细」开关对应）。
    const conditions: string[] = [];
    const params: string[] = [];
    if (action) {
      conditions.push('action = ?');
      params.push(action);
    }
    if (hideActivity && hideActivity !== '0' && hideActivity !== 'false') {
      conditions.push("action != 'ACTIVITY'");
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    // JOIN users 取 display_name/username：audit_logs 只存 user_id，用户列须由用户表解析
    const base = `FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ${where}`;

    const total = this.dbService.db
      .prepare(`SELECT COUNT(*) AS c ${base}`)
      .get(...params) as unknown as { c: number };
    const rows = this.dbService.db
      .prepare(
        `SELECT a.*, u.username AS user_username, u.display_name AS user_display_name ${base} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, ps, (p - 1) * ps) as unknown as AuditLogRow[];

    return {
      items: rows.map((row) => this.toView(row)),
      total: total.c,
      page: p,
      pageSize: ps,
    };
  }

  private toView(row: AuditLogRow) {
    return {
      id: row.id,
      userId: row.user_id,
      userDisplayName: row.user_display_name ?? null,
      userUsername: row.user_username ?? null,
      accountId: row.account_id,
      leaseId: row.lease_id,
      action: row.action,
      /** 动作中文名（AUDIT_ACTION_LABEL）；未收录的新动作返回 null，前端兜底显示英文。 */
      actionLabel: AUDIT_ACTION_LABEL[row.action] ?? null,
      result: row.result,
      ip: row.ip,
      userAgent: row.user_agent,
      metadata: this.parseMetadata(row.metadata),
      createdAt: row.created_at,
    };
  }

  private parseMetadata(json: string | null): Record<string, unknown> | null {
    if (!json) return null;
    try {
      const parsed: unknown = JSON.parse(json);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}
