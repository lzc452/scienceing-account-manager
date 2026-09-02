import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { AuditService } from '../../db/audit.service';
import { ACCOUNT_STATUS, AUDIT_ACTION, AUDIT_RESULT, LEASE_STATUS, RELEASE_REASON } from '../../db/constants';
import { generateLeaseToken, hashLeaseToken } from '../../crypto/lease-token';
import { decryptSecret, parsePayload } from '../../crypto/secret-box';
import { loadMasterKey } from '../../crypto/master-key';
import { nowIso } from '../../db/config';
import { isVersionAtLeast } from '../../lib/version';
import type { AccountCredentialsView, AccountRow, LeaseRow, LeaseView } from './leases.types';

const DEFAULT_INACTIVITY_TIMEOUT_SECONDS = 1800;
const DEFAULT_MIN_EXTENSION_VERSION = '1.0.0';

@Injectable()
export class LeasesService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  private getMinimumExtensionVersion(): string {
    const row = this.dbService.db
      .prepare('SELECT value FROM system_settings WHERE key = ?')
      .get('extension_min_version') as { value: string } | undefined;
    return row?.value ?? DEFAULT_MIN_EXTENSION_VERSION;
  }

  /**
   * 原子领取（PRD §12 / §13 / R1 / R2）：
   *   已存在 ACTIVE lease → 返回既有 lease（轮换 token）；
   *   否则 BEGIN IMMEDIATE → 选 AVAILABLE → UPDATE IN_USE（条件更新）→ INSERT lease → COMMIT。
   * 只有事务成功才返回 leaseToken + 账号 + 明文密码（R10）。
   */
  claim(userId: number, extensionVersion?: string): { leaseToken: string; lease: LeaseView; account: AccountCredentialsView } {
    const db = this.dbService.db;

    // R3/R4：插件未装 / 版本过旧 → 禁止领取（PRD §57，先于 R2 判断，PRD §12.1）
    const minimumVersion = this.getMinimumExtensionVersion();
    if (!extensionVersion || !extensionVersion.trim()) {
      this.audit.record({ action: AUDIT_ACTION.CLAIM_ACCOUNT, result: AUDIT_RESULT.FAILED, userId, metadata: { reason: 'extension_missing' } });
      throw new ConflictException({ message: '未检测到科应账号助手，请先安装插件', code: 'EXTENSION_REQUIRED' });
    }
    if (!isVersionAtLeast(extensionVersion, minimumVersion)) {
      this.audit.record({ action: AUDIT_ACTION.CLAIM_ACCOUNT, result: AUDIT_RESULT.FAILED, userId, metadata: { reason: 'extension_outdated' } });
      throw new ConflictException({
        message: `科应账号助手版本过旧（当前 ${extensionVersion}，最低 ${minimumVersion}）`,
        code: 'EXTENSION_OUTDATED',
      });
    }

    // R2：同一普通用户最多一个 ACTIVE lease
    const existing = db
      .prepare('SELECT * FROM leases WHERE user_id = ? AND status = ?')
      .get(userId, LEASE_STATUS.ACTIVE) as unknown as LeaseRow | undefined;
    if (existing) {
      const token = this.rotateToken(existing.id);
      return this.buildClaimResponse(existing.id, token, userId);
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const account = db
        .prepare('SELECT * FROM scienceing_accounts WHERE status = ? AND enabled = 1 ORDER BY id LIMIT 1')
        .get(ACCOUNT_STATUS.AVAILABLE) as unknown as AccountRow | undefined;
      if (!account) {
        db.exec('ROLLBACK');
        this.audit.record({ action: AUDIT_ACTION.CLAIM_ACCOUNT, result: AUDIT_RESULT.FAILED, userId, metadata: { reason: 'no_available_account' } });
        throw new ConflictException('暂无可用账号');
      }

      const now = nowIso();
      const updated = db
        .prepare('UPDATE scienceing_accounts SET status = ?, updated_at = ? WHERE id = ? AND status = ?')
        .run(ACCOUNT_STATUS.IN_USE, now, account.id, ACCOUNT_STATUS.AVAILABLE);
      if (Number(updated.changes) !== 1) {
        db.exec('ROLLBACK');
        this.audit.record({ action: AUDIT_ACTION.CLAIM_ACCOUNT, result: AUDIT_RESULT.FAILED, userId, metadata: { reason: 'account_claimed_concurrently' } });
        throw new ConflictException('账号刚刚被领取，请重试');
      }

      const token = generateLeaseToken();
      const result = db
        .prepare(
          `INSERT INTO leases (lease_token_hash, account_id, user_id, status, started_at, last_activity_at, extension_version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(hashLeaseToken(token), account.id, userId, LEASE_STATUS.ACTIVE, now, now, extensionVersion ?? null, now, now);
      const leaseId = Number(result.lastInsertRowid);

      db.exec('COMMIT');
      this.audit.record({
        action: AUDIT_ACTION.CLAIM_ACCOUNT,
        result: AUDIT_RESULT.SUCCESS,
        userId,
        accountId: account.id,
        leaseId,
        metadata: { accountCode: account.code },
      });
      return this.buildClaimResponse(leaseId, token, userId);
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // 事务已回滚或未开启
      }
      throw err;
    }
  }

  /** 当前用户活动租约（R10：仅返回本人租约对应的密码）。 */
  current(userId: number): { lease: LeaseView | null; account: AccountCredentialsView | null } {
    const db = this.dbService.db;
    const lease = db
      .prepare('SELECT * FROM leases WHERE user_id = ? AND status = ?')
      .get(userId, LEASE_STATUS.ACTIVE) as unknown as LeaseRow | undefined;
    if (!lease) {
      return { lease: null, account: null };
    }
    const account = db.prepare('SELECT * FROM scienceing_accounts WHERE id = ?').get(lease.account_id) as unknown as AccountRow;
    return { lease: this.toLeaseView(lease, account), account: this.toCredentials(account) };
  }

  /**
   * Activity 续期（R5 / R7）：仅 status=ACTIVE 才更新 last_activity_at，用条件 UPDATE 防竞态。
   * 进入 RECYCLING 后不再接受续期（返回 LEASE_EXPIRED）。
   */
  renewActivity(leaseId: number, token: string | null): { result: 'ACTIVE' | 'LEASE_EXPIRED'; expiresAt: string | null } {
    const db = this.dbService.db;
    const lease = this.resolveLeaseByToken(leaseId, token);
    const now = nowIso();
    const updated = db
      .prepare('UPDATE leases SET last_activity_at = ?, updated_at = ? WHERE id = ? AND status = ?')
      .run(now, now, leaseId, LEASE_STATUS.ACTIVE);
    if (Number(updated.changes) !== 1) {
      return { result: 'LEASE_EXPIRED', expiresAt: null };
    }
    const expiresAt = new Date(Date.now() + this.inactivityTimeoutSeconds() * 1000).toISOString();
    this.audit.record({ action: AUDIT_ACTION.ACTIVITY, result: AUDIT_RESULT.SUCCESS, userId: lease.user_id, leaseId, accountId: lease.account_id });
    return { result: 'ACTIVE', expiresAt };
  }

  /** 主动归还（PRD §32）：ACTIVE → RECYCLING + 账号 RECYCLING + 创建 reset_job。 */
  release(leaseId: number, userId: number, reason: string): { leaseId: number; status: string; releaseReason: string } {
    const db = this.dbService.db;
    const lease = db.prepare('SELECT * FROM leases WHERE id = ?').get(leaseId) as unknown as LeaseRow | undefined;
    if (!lease) {
      throw new NotFoundException('租约不存在');
    }
    if (lease.user_id !== userId) {
      throw new ForbiddenException('无权操作他人租约');
    }

    const now = nowIso();
    db.exec('BEGIN IMMEDIATE');
    try {
      const updated = db
        .prepare(
          `UPDATE leases SET status = ?, release_reason = ?, release_requested_at = ?, updated_at = ? WHERE id = ? AND status = ?`,
        )
        .run(LEASE_STATUS.RECYCLING, reason, now, now, leaseId, LEASE_STATUS.ACTIVE);
      if (Number(updated.changes) !== 1) {
        db.exec('ROLLBACK');
        throw new ConflictException('租约已不在使用中');
      }

      db.prepare('UPDATE scienceing_accounts SET status = ?, updated_at = ? WHERE id = ? AND status = ?').run(
        ACCOUNT_STATUS.RECYCLING,
        now,
        lease.account_id,
        ACCOUNT_STATUS.IN_USE,
      );
      db.prepare(
        `INSERT INTO reset_jobs (account_id, lease_id, status, attempt_count, created_at) VALUES (?, ?, ?, 0, ?)`,
      ).run(lease.account_id, leaseId, 'PENDING', now);

      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // 已回滚
      }
      throw err;
    }

    this.audit.record({
      action: reason === RELEASE_REASON.INACTIVITY_TIMEOUT ? AUDIT_ACTION.TIMEOUT : AUDIT_ACTION.RELEASE,
      result: AUDIT_RESULT.SUCCESS,
      userId,
      accountId: lease.account_id,
      leaseId,
      metadata: { reason },
    });

    return { leaseId, status: LEASE_STATUS.RECYCLING, releaseReason: reason };
  }

  /** 供扩展轮询（PRD §15/§22）；用 leaseToken 认证。 */
  status(leaseId: number, token: string | null): {
    leaseId: number;
    status: string;
    accountCode: string;
    displayName: string | null;
    lastActivityAt: string;
    expiresAt: string;
    remainingSeconds: number;
    releasedAt: string | null;
    releaseReason: string | null;
  } {
    const db = this.dbService.db;
    const lease = this.resolveLeaseByToken(leaseId, token);
    const account = db.prepare('SELECT * FROM scienceing_accounts WHERE id = ?').get(lease.account_id) as unknown as AccountRow;
    const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(lease.user_id) as unknown as
      | { display_name: string }
      | undefined;
    const view = this.toLeaseView(lease, account);
    return {
      leaseId: view.id,
      status: view.status,
      accountCode: view.accountCode,
      displayName: user?.display_name ?? null,
      lastActivityAt: view.lastActivityAt,
      expiresAt: view.expiresAt,
      remainingSeconds: view.remainingSeconds,
      releasedAt: view.releasedAt,
      releaseReason: view.releaseReason,
    };
  }

  /**
   * 超时回收（R6，PRD §25/§33）：条件原子 UPDATE，`last_activity_at <= threshold` 兜底，
   * 保证「29:59.9 刚操作」不会被 30:00 的回收误踢。返回本次回收数。
   */
  recycleTimedOutLeases(): number {
    const db = this.dbService.db;
    const timeoutSeconds = this.inactivityTimeoutSeconds();
    const threshold = new Date(Date.now() - timeoutSeconds * 1000).toISOString();
    const now = nowIso();

    const candidates = db
      .prepare('SELECT id, account_id FROM leases WHERE status = ? AND last_activity_at <= ?')
      .all(LEASE_STATUS.ACTIVE, threshold) as unknown as Array<{ id: number; account_id: number }>;

    let recycled = 0;
    for (const candidate of candidates) {
      const updated = db
        .prepare(
          `UPDATE leases SET status = ?, release_reason = ?, release_requested_at = ?, updated_at = ?
           WHERE id = ? AND status = ? AND last_activity_at <= ?`,
        )
        .run(LEASE_STATUS.RECYCLING, RELEASE_REASON.INACTIVITY_TIMEOUT, now, now, candidate.id, LEASE_STATUS.ACTIVE, threshold);
      if (Number(updated.changes) !== 1) {
        continue; // 回收前刚有 Activity 续期，跳过（避免误踢）
      }

      db.prepare('UPDATE scienceing_accounts SET status = ?, updated_at = ? WHERE id = ? AND status = ?').run(
        ACCOUNT_STATUS.RECYCLING,
        now,
        candidate.account_id,
        ACCOUNT_STATUS.IN_USE,
      );
      db.prepare(
        `INSERT INTO reset_jobs (account_id, lease_id, status, attempt_count, created_at) VALUES (?, ?, ?, 0, ?)`,
      ).run(candidate.account_id, candidate.id, 'PENDING', now);

      this.audit.record({
        action: AUDIT_ACTION.TIMEOUT,
        result: AUDIT_RESULT.SUCCESS,
        accountId: candidate.account_id,
        leaseId: candidate.id,
        metadata: { reason: RELEASE_REASON.INACTIVITY_TIMEOUT },
      });
      recycled += 1;
    }
    return recycled;
  }

  private rotateToken(leaseId: number): string {
    const token = generateLeaseToken();
    this.dbService.db
      .prepare('UPDATE leases SET lease_token_hash = ?, updated_at = ? WHERE id = ?')
      .run(hashLeaseToken(token), nowIso(), leaseId);
    return token;
  }

  private resolveLeaseByToken(leaseId: number, token: string | null): LeaseRow {
    if (!token) {
      throw new UnauthorizedException('缺少 leaseToken');
    }
    const lease = this.dbService.db.prepare('SELECT * FROM leases WHERE id = ?').get(leaseId) as unknown as LeaseRow | undefined;
    if (!lease || lease.lease_token_hash !== hashLeaseToken(token)) {
      throw new UnauthorizedException('无效的 leaseToken');
    }
    return lease;
  }

  private buildClaimResponse(
    leaseId: number,
    token: string,
    userId: number,
  ): { leaseToken: string; lease: LeaseView; account: AccountCredentialsView } {
    const db = this.dbService.db;
    const lease = db.prepare('SELECT * FROM leases WHERE id = ?').get(leaseId) as unknown as LeaseRow;
    const account = db.prepare('SELECT * FROM scienceing_accounts WHERE id = ?').get(lease.account_id) as unknown as AccountRow;
    void userId;
    return {
      leaseToken: token,
      lease: this.toLeaseView(lease, account),
      account: this.toCredentials(account),
    };
  }

  private toLeaseView(lease: LeaseRow, account: AccountRow): LeaseView {
    const timeoutSeconds = this.inactivityTimeoutSeconds();
    const lastActivityMs = new Date(lease.last_activity_at).getTime();
    const expiresAtMs = lastActivityMs + timeoutSeconds * 1000;
    return {
      id: lease.id,
      accountId: lease.account_id,
      accountCode: account.code,
      accountUsername: account.username,
      userId: lease.user_id,
      status: lease.status,
      startedAt: lease.started_at,
      lastActivityAt: lease.last_activity_at,
      releaseRequestedAt: lease.release_requested_at,
      releasedAt: lease.released_at,
      releaseReason: lease.release_reason,
      expiresAt: new Date(expiresAtMs).toISOString(),
      remainingSeconds: Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000)),
    };
  }

  private toCredentials(account: AccountRow): AccountCredentialsView {
    return {
      accountId: account.id,
      code: account.code,
      username: account.username,
      password: this.decryptAccountPassword(account),
    };
  }

  private decryptAccountPassword(account: AccountRow): string {
    if (!account.current_password_ciphertext) {
      return '';
    }
    const payload = parsePayload(account.current_password_ciphertext);
    return decryptSecret(payload, loadMasterKey());
  }

  private inactivityTimeoutSeconds(): number {
    const row = this.dbService.db
      .prepare('SELECT value FROM system_settings WHERE key = ?')
      .get('inactivity_timeout_seconds') as unknown as { value: string } | undefined;
    if (row) {
      const seconds = Number(row.value);
      if (Number.isFinite(seconds) && seconds > 0) {
        return seconds;
      }
    }
    return DEFAULT_INACTIVITY_TIMEOUT_SECONDS;
  }
}
