import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { AuditService } from '../../db/audit.service';
import { ACCOUNT_STATUS, AUDIT_ACTION, AUDIT_RESULT, LEASE_STATUS } from '../../db/constants';
import { decryptSecret, encryptSecret, parsePayload, serializePayload } from '../../crypto/secret-box';
import { loadMasterKey } from '../../crypto/master-key';
import { generateAccountPassword } from '../../crypto/account-password';
import { nowIso } from '../../db/config';
import { RESET_EXECUTOR, type ResetExecutor } from '../automation/automation.types';
import type { AccountRow } from '../leases/leases.types';

const MAX_ATTEMPTS = 3;

export interface ResetJobRow {
  id: number;
  account_id: number;
  lease_id: number | null;
  status: string;
  attempt_count: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

@Injectable()
export class ResetService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly audit: AuditService,
    @Inject(RESET_EXECUTOR) private readonly executor: ResetExecutor,
  ) {}

  /**
   * Phase 1（PRD §30）：生成 newPassword → pending=NEW、account RECYCLING → 创建 reset_job(PENDING)。
   * 返回 job id。
   */
  enqueueReset(accountId: number, leaseId: number | null): number {
    const db = this.dbService.db;
    this.getAccount(accountId); // 校验账号存在
    const newPassword = generateAccountPassword(); // 规则见 crypto/account-password.ts（集中定义）
    const pendingCiphertext = serializePayload(encryptSecret(newPassword, loadMasterKey()));
    const now = nowIso();

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE scienceing_accounts SET pending_password_ciphertext = ?, status = ?, updated_at = ? WHERE id = ?").run(
        pendingCiphertext,
        ACCOUNT_STATUS.RECYCLING,
        now,
        accountId,
      );
      const result = db
        .prepare("INSERT INTO reset_jobs (account_id, lease_id, status, attempt_count, created_at) VALUES (?, ?, 'PENDING', 0, ?)")
        .run(accountId, leaseId, now);
      db.exec('COMMIT');
      return Number(result.lastInsertRowid);
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* 已回滚 */
      }
      throw err;
    }
  }

  /** ERROR 账号重试：重建 reset_job（PRD §23 ERROR→RECYCLING 管理员重试）。 */
  retry(accountId: number): number {
    const account = this.getAccount(accountId);
    if (account.status !== ACCOUNT_STATUS.ERROR) {
      throw new ConflictException('仅 ERROR 账号可重试');
    }
    return this.enqueueReset(accountId, null);
  }

  /**
   * 消费 PENDING 队列（单 Worker 串行）：claim PENDING→RUNNING（attempt_count+1）→ 执行 → Phase 2。
   * 失败且 attempt_count < MAX_ATTEMPTS 则回到 PENDING 重试，否则 FAILED + account ERROR（R8/R9）。
   */
  async processPendingJobs(executor?: ResetExecutor): Promise<{ processed: number; succeeded: number; failed: number }> {
    const exec = executor ?? this.executor;
    const db = this.dbService.db;
    const jobs = db.prepare("SELECT * FROM reset_jobs WHERE status = 'PENDING' ORDER BY id LIMIT 20").all() as unknown as ResetJobRow[];

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const job of jobs) {
      const claimed = db
        .prepare("UPDATE reset_jobs SET status = 'RUNNING', started_at = ?, attempt_count = attempt_count + 1 WHERE id = ? AND status = 'PENDING'")
        .run(nowIso(), job.id);
      if (Number(claimed.changes) !== 1) continue;
      processed += 1;

      const freshJob = db.prepare('SELECT * FROM reset_jobs WHERE id = ?').get(job.id) as unknown as ResetJobRow;
      const account = this.getAccount(job.account_id);
      const newPassword = this.ensurePhase1(account);

      try {
        const result = await exec.execute({ jobId: job.id, accountUsername: account.username, newPassword });
        if (result.success) {
          this.completeSuccess(job.id, account.id, job.lease_id);
          succeeded += 1;
        } else {
          this.handleFailure(freshJob, account, result.error ?? '改密失败');
          failed += 1;
        }
      } catch (err) {
        this.handleFailure(freshJob, account, err instanceof Error ? err.message : String(err));
        failed += 1;
      }
    }

    return { processed, succeeded, failed };
  }

  /** Phase 2 成功（PRD §30）：current=NEW、pending=null、account AVAILABLE、lease RELEASED。 */
  private completeSuccess(jobId: number, accountId: number, leaseId: number | null): void {
    const db = this.dbService.db;
    const now = nowIso();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        "UPDATE scienceing_accounts SET current_password_ciphertext = pending_password_ciphertext, pending_password_ciphertext = NULL, status = ?, last_password_changed_at = ?, updated_at = ? WHERE id = ?",
      ).run(ACCOUNT_STATUS.AVAILABLE, now, now, accountId);
      if (leaseId) {
        db.prepare("UPDATE leases SET status = ?, released_at = ?, updated_at = ? WHERE id = ? AND status = ?").run(
          LEASE_STATUS.RELEASED,
          now,
          now,
          leaseId,
          LEASE_STATUS.RECYCLING,
        );
      }
      db.prepare("UPDATE reset_jobs SET status = 'SUCCESS', finished_at = ? WHERE id = ?").run(now, jobId);
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* 已回滚 */
      }
      throw err;
    }

    const account = db.prepare('SELECT code FROM scienceing_accounts WHERE id = ?').get(accountId) as unknown as { code: string };
    this.audit.record({
      action: AUDIT_ACTION.RESET_SUCCESS,
      result: AUDIT_RESULT.SUCCESS,
      accountId,
      leaseId,
      metadata: { accountCode: account.code },
    });
  }

  /** Phase 2 最终失败（PRD §30/R9）：current=OLD（不动）、pending=null、account ERROR、lease FAILED。 */
  private completeFailure(jobId: number, accountId: number, leaseId: number | null, error: string): void {
    const db = this.dbService.db;
    const now = nowIso();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE scienceing_accounts SET pending_password_ciphertext = NULL, status = ?, updated_at = ? WHERE id = ?").run(
        ACCOUNT_STATUS.ERROR,
        now,
        accountId,
      );
      if (leaseId) {
        db.prepare("UPDATE leases SET status = ?, released_at = ?, updated_at = ? WHERE id = ? AND status = ?").run(
          LEASE_STATUS.FAILED,
          now,
          now,
          leaseId,
          LEASE_STATUS.RECYCLING,
        );
      }
      db.prepare("UPDATE reset_jobs SET status = 'FAILED', error_message = ?, finished_at = ? WHERE id = ?").run(error.slice(0, 500), now, jobId);
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* 已回滚 */
      }
      throw err;
    }

    const account = db.prepare('SELECT code FROM scienceing_accounts WHERE id = ?').get(accountId) as unknown as { code: string };
    this.audit.record({
      action: AUDIT_ACTION.RESET_FAILED,
      result: AUDIT_RESULT.FAILED,
      accountId,
      leaseId,
      metadata: { accountCode: account.code, error: error.slice(0, 200) },
    });
  }

  private handleFailure(job: ResetJobRow, account: AccountRow, error: string): void {
    if (job.attempt_count < MAX_ATTEMPTS) {
      this.dbService.db.prepare("UPDATE reset_jobs SET status = 'PENDING', error_message = ? WHERE id = ?").run(error.slice(0, 500), job.id);
    } else {
      this.completeFailure(job.id, account.id, job.lease_id, error);
    }
  }

  /** 确保 Phase 1 已执行（兼容 t5 release/timeout 未生成 pending 的 job），返回明文新密码。 */
  private ensurePhase1(account: AccountRow): string {
    if (account.pending_password_ciphertext) {
      return decryptSecret(parsePayload(account.pending_password_ciphertext), loadMasterKey());
    }
    const newPassword = generateAccountPassword(); // 规则见 crypto/account-password.ts（集中定义）
    const pendingCiphertext = serializePayload(encryptSecret(newPassword, loadMasterKey()));
    this.dbService.db
      .prepare("UPDATE scienceing_accounts SET pending_password_ciphertext = ?, status = ?, updated_at = ? WHERE id = ?")
      .run(pendingCiphertext, ACCOUNT_STATUS.RECYCLING, nowIso(), account.id);
    return newPassword;
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
}
