import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from '../../db/database.service';
import { AuditService } from '../../db/audit.service';
import { ACCOUNT_STATUS, AUDIT_ACTION, AUDIT_RESULT, LEASE_STATUS, RELEASE_REASON } from '../../db/constants';
import { AutomationService } from '../automation/automation.service';
import { encryptSecret, serializePayload } from '../../crypto/secret-box';
import { loadMasterKey } from '../../crypto/master-key';
import { nowIso } from '../../db/config';
import { SEED_PLACEHOLDER_PASSWORD } from '../../db/seed';
import type { AccountRow } from '../leases/leases.types';
import type { AuthUser } from '../auth/auth.types';

export interface AdminAccountView {
  id: number;
  code: string;
  username: string;
  status: string;
  currentUser: string | null;
  lastPasswordChangedAt: string | null;
  enabled: boolean;
  createdAt: string;
}

export interface AdminLeaseView {
  id: number;
  userDisplayName: string | null;
  accountCode: string;
  status: string;
  startedAt: string;
  lastActivityAt: string;
  releasedAt: string | null;
  releaseReason: string | null;
}

interface AccountListRow {
  id: number;
  code: string;
  username: string;
  status: string;
  last_password_changed_at: string | null;
  enabled: number;
  created_at: string;
  current_user: string | null;
}

interface LeaseListRow {
  id: number;
  status: string;
  started_at: string;
  last_activity_at: string;
  released_at: string | null;
  release_reason: string | null;
  user_display: string | null;
  account_code: string;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly audit: AuditService,
    private readonly automation: AutomationService,
  ) {}

  /**
   * 自动化健康检查（PRD §49）：委托 AutomationService 执行 Playwright Worker
   * 三项检查（管理员登录 / 账号管理页 / 改密入口），映射为前端渲染结构。
   */
  async healthCheck(): Promise<{ lastCheckedAt: string | null; items: Array<{ key: string; label: string; ok: boolean }> }> {
    const result = await this.automation.checkHealth();
    return {
      lastCheckedAt: result.checkedAt,
      items: [
        { key: 'admin-login', label: '管理员登录正常', ok: result.adminLoginOk },
        { key: 'accounts-page', label: '账号管理页可访问', ok: result.accountPageOk },
        { key: 'reset-entry', label: '改密入口正常', ok: result.resetEntryOk },
      ],
    };
  }

  listAccounts(): AdminAccountView[] {
    const rows = this.dbService.db
      .prepare(
        `SELECT a.id, a.code, a.username, a.status, a.last_password_changed_at, a.enabled, a.created_at,
                u.display_name AS current_user
         FROM scienceing_accounts a
         LEFT JOIN leases l ON l.account_id = a.id AND l.status = ?
         LEFT JOIN users u ON u.id = l.user_id
         ORDER BY a.code`,
      )
      .all(LEASE_STATUS.ACTIVE) as unknown as AccountListRow[];

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      username: row.username,
      status: row.status,
      currentUser: row.current_user,
      lastPasswordChangedAt: row.last_password_changed_at,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
    }));
  }

  listLeases(): AdminLeaseView[] {
    const rows = this.dbService.db
      .prepare(
        `SELECT l.id, l.status, l.started_at, l.last_activity_at, l.released_at, l.release_reason,
                u.display_name AS user_display, a.code AS account_code
         FROM leases l
         JOIN users u ON u.id = l.user_id
         JOIN scienceing_accounts a ON a.id = l.account_id
         ORDER BY l.id DESC`,
      )
      .all() as unknown as LeaseListRow[];

    return rows.map((row) => ({
      id: row.id,
      userDisplayName: row.user_display,
      accountCode: row.account_code,
      status: row.status,
      startedAt: row.started_at,
      lastActivityAt: row.last_activity_at,
      releasedAt: row.released_at,
      releaseReason: row.release_reason,
    }));
  }

  /** 强制回收（幂等）：有 ACTIVE lease 才回收；否则返回当前状态（PRD §52）。 */
  forceRelease(accountId: number, adminUser: AuthUser): { accountId: number; status: string; recycled: boolean } {
    const account = this.getAccount(accountId);
    const lease = this.dbService.db
      .prepare('SELECT id FROM leases WHERE account_id = ? AND status = ?')
      .get(accountId, LEASE_STATUS.ACTIVE) as unknown as { id: number } | undefined;
    if (!lease) {
      return { accountId, status: account.status, recycled: false };
    }
    this.enqueueReset(account, adminUser, AUDIT_ACTION.ADMIN_FORCE_RELEASE);
    return { accountId, status: ACCOUNT_STATUS.RECYCLING, recycled: true };
  }

  /** 手动重置密码（两阶段 Phase 1）：生成 pending 密码 → RECYCLING + reset_job（PRD §30）。 */
  resetPassword(accountId: number, adminUser: AuthUser): { accountId: number; status: string } {
    const account = this.getAccount(accountId);
    if (account.status === ACCOUNT_STATUS.RECYCLING) {
      throw new ConflictException('账号正在回收中');
    }
    this.enqueueReset(account, adminUser, AUDIT_ACTION.RESET_PASSWORD);
    return { accountId, status: ACCOUNT_STATUS.RECYCLING };
  }

  /** ERROR → AVAILABLE（管理员确认人工处理完成，PRD §23/§47）。 */
  markAvailable(accountId: number, adminUser: AuthUser): { accountId: number; status: string } {
    const account = this.getAccount(accountId);
    if (account.status !== ACCOUNT_STATUS.ERROR) {
      throw new ConflictException('仅 ERROR 账号可标记为可用');
    }
    this.dbService.db
      .prepare('UPDATE scienceing_accounts SET status = ?, pending_password_ciphertext = NULL, updated_at = ? WHERE id = ?')
      .run(ACCOUNT_STATUS.AVAILABLE, nowIso(), accountId);
    this.audit.record({
      action: AUDIT_ACTION.ADMIN_MANUAL_FIX,
      result: AUDIT_RESULT.SUCCESS,
      userId: adminUser.id,
      accountId,
      metadata: { accountCode: account.code },
    });
    return { accountId, status: ACCOUNT_STATUS.AVAILABLE };
  }

  /** 禁用账号：enabled=0；若有活动租约则一并回收（PRD §37）。 */
  disable(accountId: number, adminUser: AuthUser): { accountId: number; enabled: boolean } {
    const account = this.getAccount(accountId);
    this.dbService.db.prepare('UPDATE scienceing_accounts SET enabled = 0, updated_at = ? WHERE id = ?').run(nowIso(), accountId);

    const lease = this.dbService.db
      .prepare('SELECT id FROM leases WHERE account_id = ? AND status = ?')
      .get(accountId, LEASE_STATUS.ACTIVE) as unknown as { id: number } | undefined;
    if (lease) {
      this.enqueueReset(account, adminUser, AUDIT_ACTION.ADMIN_FORCE_RELEASE);
    }

    this.audit.record({
      action: AUDIT_ACTION.ACCOUNT_DISABLE,
      result: AUDIT_RESULT.SUCCESS,
      userId: adminUser.id,
      accountId,
      metadata: { accountCode: account.code },
    });
    return { accountId, enabled: false };
  }

  /** 启用账号：enabled=1（PRD §37 对称操作）。 */
  enable(accountId: number, adminUser: AuthUser): { accountId: number; enabled: boolean } {
    const account = this.getAccount(accountId);
    this.dbService.db.prepare('UPDATE scienceing_accounts SET enabled = 1, updated_at = ? WHERE id = ?').run(nowIso(), accountId);
    this.audit.record({
      action: AUDIT_ACTION.ACCOUNT_ENABLE,
      result: AUDIT_RESULT.SUCCESS,
      userId: adminUser.id,
      accountId,
      metadata: { accountCode: account.code },
    });
    return { accountId, enabled: true };
  }

  /**
   * 修改账号名称（对应科应平台账号 username）。
   * 重置密码等自动化流程依据该名称定位科应平台上的账号，故必须保证唯一。
   */
  rename(accountId: number, dto: { username?: string; code?: string }, adminUser: AuthUser): AdminAccountView {
    const account = this.getAccount(accountId);
    const db = this.dbService.db;

    const username = dto.username?.trim();
    const code = dto.code?.trim();
    if (username !== undefined && username !== null && !username) {
      throw new BadRequestException('账号名称不能为空');
    }
    if (code !== undefined && code !== null && !code) {
      throw new BadRequestException('账号编号不能为空');
    }

    if (username && username !== account.username) {
      const dup = db.prepare('SELECT id FROM scienceing_accounts WHERE username = ? AND id != ?').get(username, accountId);
      if (dup) {
        throw new ConflictException(`账号名称「${username}」已被其他账号使用`);
      }
    }
    if (code && code !== account.code) {
      const dup = db.prepare('SELECT id FROM scienceing_accounts WHERE code = ? AND id != ?').get(code, accountId);
      if (dup) {
        throw new ConflictException(`账号编号「${code}」已被其他账号使用`);
      }
    }

    const fields: string[] = [];
    const values: Array<string | number> = [];
    if (username) {
      fields.push('username = ?');
      values.push(username);
    }
    if (code) {
      fields.push('code = ?');
      values.push(code);
    }
    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(nowIso());
      db.prepare(`UPDATE scienceing_accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values, accountId);
    }

    this.audit.record({
      action: AUDIT_ACTION.ACCOUNT_RENAME,
      result: AUDIT_RESULT.SUCCESS,
      userId: adminUser.id,
      accountId,
      metadata: { from: account.username, to: username ?? account.username },
    });

    const updated = this.getAccount(accountId);
    return {
      id: updated.id,
      code: updated.code,
      username: updated.username,
      status: updated.status,
      currentUser: null,
      lastPasswordChangedAt: updated.last_password_changed_at,
      enabled: updated.enabled === 1,
      createdAt: updated.created_at,
    };
  }

  private getAccount(accountId: number): AccountRow {
    const account = this.dbService.db
      .prepare('SELECT * FROM scienceing_accounts WHERE id = ?')
      .get(accountId) as unknown as AccountRow | undefined;
    if (!account) {
      throw new NotFoundException('账号不存在');
    }
    return account;
  }

  /** 单账号视图（含当前使用人，PRD §35）：复用于新增/删除后返回。 */
  private accountView(id: number): AdminAccountView {
    const row = this.dbService.db
      .prepare(
        `SELECT a.id, a.code, a.username, a.status, a.last_password_changed_at, a.enabled, a.created_at,
                u.display_name AS current_user
         FROM scienceing_accounts a
         LEFT JOIN leases l ON l.account_id = a.id AND l.status = ?
         LEFT JOIN users u ON u.id = l.user_id
         WHERE a.id = ?`,
      )
      .get(LEASE_STATUS.ACTIVE, id) as unknown as AccountListRow;
    return {
      id: row.id,
      code: row.code,
      username: row.username,
      status: row.status,
      currentUser: row.current_user,
      lastPasswordChangedAt: row.last_password_changed_at,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
    };
  }

  /**
   * 新增科应账号（管理员手工录入）。
   * 密码由系统以占位密文托管（与 seed 一致），默认 AVAILABLE / 启用，
   * 真实可用密码经后续「重置密码」自动化流程生成。
   */
  createAccount(dto: { code?: string; username?: string }, adminUser: AuthUser): AdminAccountView {
    const code = dto.code?.trim();
    const username = dto.username?.trim();
    if (!code) throw new BadRequestException('账号编号不能为空');
    if (!username) throw new BadRequestException('科应账号不能为空');
    if (!/^[A-Za-z0-9_-]+$/.test(code)) {
      throw new BadRequestException('账号编号仅允许字母、数字、- 和 _');
    }

    const db = this.dbService.db;
    if (db.prepare('SELECT id FROM scienceing_accounts WHERE code = ?').get(code)) {
      throw new ConflictException(`账号编号「${code}」已存在`);
    }
    if (db.prepare('SELECT id FROM scienceing_accounts WHERE username = ?').get(username)) {
      throw new ConflictException(`科应账号「${username}」已存在`);
    }

    const ciphertext = serializePayload(encryptSecret(SEED_PLACEHOLDER_PASSWORD, loadMasterKey()));
    const now = nowIso();
    const info = db
      .prepare(
        `INSERT INTO scienceing_accounts
          (code, username, current_password_ciphertext, pending_password_ciphertext, status, last_password_changed_at, enabled, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, 1, ?, ?)`,
      )
      .run(code, username, ciphertext, ACCOUNT_STATUS.AVAILABLE, now, now, now);
    const id = Number(info.lastInsertRowid);

    this.audit.record({
      action: AUDIT_ACTION.ACCOUNT_CREATE,
      result: AUDIT_RESULT.SUCCESS,
      userId: adminUser.id,
      accountId: id,
      metadata: { accountCode: code, username },
    });
    return this.accountView(id);
  }

  /**
   * 删除科应账号（PRD §37 管理动作，不可逆）。
   * 有活动租约时禁止删除（应先回收）；否则级联删除其 leases / reset_jobs / audit_logs
   * 后删除账号行（account_id 为 NOT NULL，无法置空保留，故整体清除）。
   */
  deleteAccount(accountId: number, adminUser: AuthUser): { accountId: number } {
    const account = this.getAccount(accountId);
    const db = this.dbService.db;

    const activeLease = db
      .prepare('SELECT id FROM leases WHERE account_id = ? AND status = ?')
      .get(accountId, LEASE_STATUS.ACTIVE) as unknown as { id: number } | undefined;
    if (activeLease) {
      throw new ConflictException('账号使用中，请先强制回收再删除');
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM leases WHERE account_id = ?').run(accountId);
      db.prepare('DELETE FROM reset_jobs WHERE account_id = ?').run(accountId);
      db.prepare('DELETE FROM audit_logs WHERE account_id = ?').run(accountId);
      db.prepare('DELETE FROM scienceing_accounts WHERE id = ?').run(accountId);
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* 已回滚 */
      }
      throw err;
    }

    this.audit.record({
      action: AUDIT_ACTION.ACCOUNT_DELETE,
      result: AUDIT_RESULT.SUCCESS,
      userId: adminUser.id,
      accountId,
      metadata: { accountCode: account.code, username: account.username },
    });
    return { accountId };
  }

  /** CSV 批量导入（前端解析、二次确认后整批提交）：逐条插入，冲突/非法行归入 failed。 */
  bulkCreateAccounts(rows: Array<{ code?: string; username?: string }>, adminUser: AuthUser): {
    created: number;
    failed: Array<{ code: string; reason: string }>;
  } {
    let created = 0;
    const failed: Array<{ code: string; reason: string }> = [];
    for (const row of rows) {
      try {
        this.createAccount(row, adminUser);
        created += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : '导入失败';
        failed.push({ code: row.code?.trim() || '(空)', reason: message });
      }
    }
    this.audit.record({
      action: AUDIT_ACTION.ACCOUNT_BULK_CREATE,
      result: AUDIT_RESULT.SUCCESS,
      userId: adminUser.id,
      metadata: { created, failedCount: failed.length },
    });
    return { created, failed };
  }

  /** 生成 pending 密码（AES 加密）→ account RECYCLING → 回收活动租约 → 创建 reset_job。 */
  private enqueueReset(account: AccountRow, adminUser: AuthUser, auditAction: string): void {
    const db = this.dbService.db;
    const newPassword = randomBytes(16).toString('base64url');
    const pendingCiphertext = serializePayload(encryptSecret(newPassword, loadMasterKey()));
    const now = nowIso();
    let leaseId: number | null = null;

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE scienceing_accounts SET pending_password_ciphertext = ?, status = ?, updated_at = ? WHERE id = ?').run(
        pendingCiphertext,
        ACCOUNT_STATUS.RECYCLING,
        now,
        account.id,
      );

      const lease = db
        .prepare('SELECT id FROM leases WHERE account_id = ? AND status = ?')
        .get(account.id, LEASE_STATUS.ACTIVE) as unknown as { id: number } | undefined;
      if (lease) {
        db.prepare(
          'UPDATE leases SET status = ?, release_reason = ?, release_requested_at = ?, updated_at = ? WHERE id = ? AND status = ?',
        ).run(LEASE_STATUS.RECYCLING, RELEASE_REASON.ADMIN_FORCE, now, now, lease.id, LEASE_STATUS.ACTIVE);
        leaseId = lease.id;
      }

      db.prepare("INSERT INTO reset_jobs (account_id, lease_id, status, attempt_count, created_at) VALUES (?, ?, 'PENDING', 0, ?)").run(
        account.id,
        leaseId,
        now,
      );

      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* 已回滚 */
      }
      throw err;
    }

    this.audit.record({
      action: auditAction,
      result: AUDIT_RESULT.SUCCESS,
      userId: adminUser.id,
      accountId: account.id,
      leaseId,
      metadata: { accountCode: account.code },
    });
  }
}
