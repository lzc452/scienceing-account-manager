import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { nowIso } from './config';
import { currentRequestMeta } from '../lib/request-context';

export interface AuditEntry {
  action: string;
  result: string;
  userId?: number | null;
  accountId?: number | null;
  leaseId?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  /** 禁止保存科应密码 / 管理员凭据 / 搜索词 / 页面内容 / 用户输入内容（PRD §58） */
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly dbService: DatabaseService) {}

  record(entry: AuditEntry): void {
    // 显式传入的 ip/userAgent 优先；未传时从请求上下文兜底采集（绝大多数 controller 不传，
    // 由这里统一补上，日志页 IP 列才有值）。后台任务无请求上下文 → 置 null。
    const meta = currentRequestMeta();
    this.dbService.db
      .prepare(`
        INSERT INTO audit_logs (user_id, account_id, lease_id, action, result, ip, user_agent, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        entry.userId ?? null,
        entry.accountId ?? null,
        entry.leaseId ?? null,
        entry.action,
        entry.result,
        entry.ip ?? meta?.ip ?? null,
        entry.userAgent ?? meta?.userAgent ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        nowIso(),
      );
  }
}
