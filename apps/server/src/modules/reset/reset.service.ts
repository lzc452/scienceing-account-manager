import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { AuditService } from '../../db/audit.service';
import { ACCOUNT_STATUS, AUDIT_ACTION, AUDIT_RESULT, LEASE_STATUS } from '../../db/constants';
import { accountAad, decryptSecret, encryptSecret, parsePayload, serializePayload } from '../../crypto/secret-box';
import { loadMasterKey } from '../../crypto/master-key';
import { generateAccountPassword } from '../../crypto/account-password';
import { nowIso } from '../../db/config';
import { redactSecrets } from '../../lib/redact';
import { RESET_EXECUTOR, type ResetExecutor } from '../automation/automation.types';
import type { AccountRow } from '../leases/leases.types';

/**
 * 单次改密的最大尝试次数。
 *
 * 从 3 降到 1 的理由：
 *  - 科应改密是「浏览器自动化」而非幂等接口，失败原因绝大多数是**环境/账号层面**的
 *    （账号在科应上不存在、被风控、扩展页面结构改版），重试不会让它们变好，
 *    只会让队列在同一个账号上空转三次，把真实回收的等待时间拉长到原来的三倍。
 *  - 连续三次自动改密天生带有「密码暴力尝试」的外观，容易触发科应风控。
 *  - 失败即 ERROR + 一条审计，由管理员看见并决定是重试还是修数据；
 *    自动重试的收益远小于它掩盖问题的代价。
 *
 * 注意 `requeueFatal` 不受此影响：配置类致命错误仍会把 job 原样退回 PENDING
 * 并**回退**尝试次数，因为那不是「这个账号改不了」，而是「整个 Worker 现在不可用」。
 */
const MAX_ATTEMPTS = 1;

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
    // AAD 绑定 account.id：密文无法在账号之间搬运（换行即认证失败）
    const pendingCiphertext = serializePayload(encryptSecret(newPassword, loadMasterKey(), accountAad(accountId)));
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
    /** 本轮遇到的致命配置错误（Worker 环境不可用）；非空即暂停队列并上抛。 */
    let fatalError: string | null = null;

    for (const job of jobs) {
      const claimed = db
        .prepare("UPDATE reset_jobs SET status = 'RUNNING', started_at = ?, attempt_count = attempt_count + 1 WHERE id = ? AND status = 'PENDING'")
        .run(nowIso(), job.id);
      if (Number(claimed.changes) !== 1) continue;
      processed += 1;

      const freshJob = db.prepare('SELECT * FROM reset_jobs WHERE id = ?').get(job.id) as unknown as ResetJobRow;

      // getAccount / ensurePhase1 必须留在 try 内：job 此刻已被翻成 RUNNING，
      // 这两步一旦抛错（账号被删、pending 密文损坏），job 就永久停在 RUNNING——
      // 既不重试也不失败，调度器再也捡不到它，只能人工改库。
      let newPassword: string | null = null;
      try {
        const account = this.getAccount(job.account_id);
        newPassword = this.ensurePhase1(account);

        const result = await exec.execute({ jobId: job.id, accountUsername: account.username, newPassword });
        if (result.success) {
          this.completeSuccess(job.id, account.id, job.lease_id);
          succeeded += 1;
        } else if (result.fatal) {
          // 配置层面的问题：重试无意义，且继续跑会把后续账号逐个烧成 ERROR。
          // 原样退回 PENDING（不消耗尝试次数），并中断本轮。
          fatalError = redactSecrets(result.error ?? 'Worker 环境不可用', [newPassword]);
          this.requeueFatal(job.id, fatalError);
          break;
        } else {
          // 失败文案会写入 reset_jobs.error_message 与 audit_logs.metadata：
          // 先脱敏再落库，避免口令经错误信息回流到持久化介质（PRD §42）。
          this.handleFailure(freshJob, account.id, redactSecrets(result.error ?? '改密失败', [newPassword]));
          failed += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const secrets = newPassword ? [newPassword] : [];
        this.handleFailure(freshJob, job.account_id, redactSecrets(message, secrets));
        failed += 1;
      }
    }

    if (fatalError) {
      // 上抛让调度器记录、让操作者看见：队列已暂停，配置修好前不再消耗账号。
      throw new Error(
        `改密队列已暂停（Worker 环境不可用）：${fatalError}。`
          + `本轮已处理 ${processed} 个（成功 ${succeeded} / 失败 ${failed}），未完成任务已退回 PENDING。`,
      );
    }

    return { processed, succeeded, failed };
  }

  /** Phase 2 成功（PRD §30）：current=NEW、pending=null、account AVAILABLE、lease RELEASED。 */
  private completeSuccess(jobId: number, accountId: number, leaseId: number | null): void {
    const db = this.dbService.db;
    const now = nowIso();
    db.exec('BEGIN IMMEDIATE');
    try {
      // rotation_due_reason / rotation_not_before 一并清空：改密成功即「还清」，
      // 留着会让账号永久显示「欠一次改密」，也会让下一轮清扫误判为未处理。
      db.prepare(
        "UPDATE scienceing_accounts SET current_password_ciphertext = pending_password_ciphertext, pending_password_ciphertext = NULL, status = ?, last_password_changed_at = ?, rotation_due_reason = NULL, rotation_not_before = NULL, updated_at = ? WHERE id = ?",
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

    const account = this.lookupAccountCode(accountId);
    this.audit.record({
      action: AUDIT_ACTION.RESET_SUCCESS,
      result: AUDIT_RESULT.SUCCESS,
      accountId,
      leaseId,
      metadata: { accountCode: account },
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

    const account = this.lookupAccountCode(accountId);
    this.audit.record({
      action: AUDIT_ACTION.RESET_FAILED,
      result: AUDIT_RESULT.FAILED,
      accountId,
      leaseId,
      metadata: { accountCode: account, error: error.slice(0, 200) },
    });
  }

  /**
   * 取账号 code 用于审计。
   *
   * 账号可能已被删除（管理员删号 / 库被清理），此时**不能直接读 .code**：
   * 那会在 completeFailure 里抛 TypeError，把本该落定的 job 留在 RUNNING，
   * 而调度器只捡 PENDING —— 于是一条「失败任务」变成永久卡死，
   * 正好违反了 L1-3 要守的不变量。查不到就退化成 `#<id>`。
   */
  private lookupAccountCode(accountId: number): string {
    const row = this.dbService.db
      .prepare('SELECT code FROM scienceing_accounts WHERE id = ?')
      .get(accountId) as unknown as { code: string } | undefined;
    return row?.code ?? `#${accountId}`;
  }

  /**
   * 失败处理。只依赖 accountId 而非完整 account 行——
   * 这样「连账号都读不出来」的异常也能走到同一条失败路径，而不是把 job 丢在 RUNNING。
   */
  private handleFailure(job: ResetJobRow, accountId: number, error: string): void {
    if (job.attempt_count < MAX_ATTEMPTS) {
      this.dbService.db.prepare("UPDATE reset_jobs SET status = 'PENDING', error_message = ? WHERE id = ?").run(error.slice(0, 500), job.id);
    } else {
      this.completeFailure(job.id, accountId, job.lease_id, error);
    }
  }

  /**
   * 致命错误退回：把已 claim 的 job 原样放回 PENDING，并**回退** claim 时加上的尝试次数。
   *
   * 配置类错误（缺环境变量、CLI 未构建）与业务失败有本质区别：重试不会让它变好，
   * 计入 attempt_count 只会让账号在几次无意义的空转后被判 ERROR。
   */
  private requeueFatal(jobId: number, error: string): void {
    this.dbService.db
      .prepare(
        "UPDATE reset_jobs SET status = 'PENDING', started_at = NULL, attempt_count = MAX(attempt_count - 1, 0), error_message = ? WHERE id = ?",
      )
      .run(error.slice(0, 500), jobId);
  }

  /**
   * 启动期清扫：把上一次进程遗留的 RUNNING job 退回 PENDING。
   *
   * 本服务为单进程、单 Worker 串行（PRD §28），因此进程启动时任何 RUNNING job
   * 都必然是「上个进程没跑完就退出」的孤儿——不回收就永远不会再被调度。
   * 注意保留 attempt_count：进程崩溃本身应当计入一次尝试，否则会无限重试。
   */
  sweepStaleRunningJobs(): number {
    const result = this.dbService.db
      .prepare("UPDATE reset_jobs SET status = 'PENDING', started_at = NULL WHERE status = 'RUNNING'")
      .run();
    return Number(result.changes);
  }

  /** 确保 Phase 1 已执行（兼容 t5 release/timeout 未生成 pending 的 job），返回明文新密码。 */
  private ensurePhase1(account: AccountRow): string {
    if (account.pending_password_ciphertext) {
      return decryptSecret(parsePayload(account.pending_password_ciphertext), loadMasterKey(), accountAad(account.id));
    }
    const newPassword = generateAccountPassword(); // 规则见 crypto/account-password.ts（集中定义）
    const pendingCiphertext = serializePayload(encryptSecret(newPassword, loadMasterKey(), accountAad(account.id)));
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
