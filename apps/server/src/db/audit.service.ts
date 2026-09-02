import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { nowIso } from './config';

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
        entry.ip ?? null,
        entry.userAgent ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        nowIso(),
      );
  }
}
