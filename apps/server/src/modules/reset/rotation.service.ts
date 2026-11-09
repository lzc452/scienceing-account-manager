import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { AuditService } from '../../db/audit.service';
import { AUDIT_ACTION, AUDIT_RESULT } from '../../db/constants';
import { nowIso } from '../../db/config';
import { isPasswordProvisioned } from '../../crypto/account-password-state';
import { ResetService } from './reset.service';
import { decideRotation, type RotationReason } from './rotation-policy';

/** 密码最长有效期（天）：与 DEFAULT_SYSTEM_SETTINGS.password_max_age_days 一致。 */
const DEFAULT_MAX_AGE_DAYS = 30;
/** 两次改密的最小间隔（小时）：防 DIRTY 抖动在短时间内反复改密。 */
const DEFAULT_MIN_INTERVAL_HOURS = 24;
/** 每轮最多扫描的候选数（未托管的账号会占用名额，故比配额大得多）。 */
const CANDIDATE_LIMIT = 20;
/** 每轮最多排入的改密数：单 Worker 串行，一次塞太多只会把队列拖长。 */
const MAX_ENQUEUE_PER_SWEEP = 5;

/**
 * 判定原因 → scienceing_accounts.rotation_due_reason。
 *
 * 表上有 CHECK 约束（008 迁移），取值只能是
 * ACK_TIMEOUT / PURGE_FAILED / PASSWORD_EXPIRED / ADMIN_REQUEST / INACTIVITY_TIMEOUT。
 * 这里用 Record<RotationReason, …> 而非字符串拼接：新增原因时编译器会强制补映射，
 * 否则就是运行时「CHECK constraint failed」，且要到真机上才会暴露。
 */
const DB_DUE_REASON: Record<RotationReason, string> = {
  AGE_EXCEEDED: 'PASSWORD_EXPIRED',
  NEVER_ROTATED: 'PASSWORD_EXPIRED',
};

interface RotationCandidateRow {
  id: number;
  code: string;
  status: string;
  current_password_ciphertext: string | null;
  last_password_changed_at: string | null;
  rotation_not_before: string | null;
}

export interface RotationSweepResult {
  /** 本轮取到的候选数 */
  scanned: number;
  /** 成功排入改密队列的数量 */
  enqueued: number;
  /** 被频次护栏推迟的数量 */
  deferred: number;
  /** 各类跳过原因的计数，便于在调度日志里一眼看出「为什么没动」 */
  skipped: Record<string, number>;
  /** 队列忙（有 PENDING/RUNNING）时整轮让路 */
  queueBusy: boolean;
}

/**
 * 30 天超期轮换清扫。
 *
 * 定位：只做「定时兜底」，不参与回收主链路。回收主链路（DIRTY + 客户端清理）
 * 由 S1 负责；这里解决的是「账号长期没人领用、密码一直不变」的孤独账号。
 *
 * 两条硬约束：
 *  1. **只碰 AVAILABLE**：正在被使用的账号绝不打断；DIRTY/RECYCLING/ERROR 各有主流程。
 *  2. **队列忙就让路**：改密是单 Worker 串行，清扫往队列里塞任务会拉长真实回收的等待时间。
 */
@Injectable()
export class RotationService {
  private readonly logger = new Logger('RotationService');

  constructor(
    private readonly dbService: DatabaseService,
    private readonly audit: AuditService,
    private readonly resetService: ResetService,
  ) {}

  /**
   * 执行一轮清扫。`now` 可注入，便于测试构造「30 天前改过」的场景。
   */
  sweepOverdueRotations(now: Date = new Date()): RotationSweepResult {
    const result: RotationSweepResult = { scanned: 0, enqueued: 0, deferred: 0, skipped: {}, queueBusy: false };

    const maxAgeDays = this.readNumberSetting('password_max_age_days', DEFAULT_MAX_AGE_DAYS);
    if (maxAgeDays <= 0) {
      // 关闭状态下不查库：管理员关掉开关就该完全没有开销
      result.skipped.DISABLED = 1;
      return result;
    }

    // 队列忙就让路：本轮什么都不做，下一轮再看
    const pending = this.dbService.db
      .prepare("SELECT COUNT(*) AS count FROM reset_jobs WHERE status IN ('PENDING', 'RUNNING')")
      .get() as unknown as { count: number };
    if (pending.count > 0) {
      result.queueBusy = true;
      return result;
    }

    const minIntervalHours = this.readNumberSetting(
      'password_rotation_min_interval_hours',
      DEFAULT_MIN_INTERVAL_HOURS,
    );

    // 最久没改的排前面；NULL 时间戳（可能是脏数据）优先——它们最需要被处理
    const candidates = this.dbService.db
      .prepare(
        `SELECT id, code, status, current_password_ciphertext, last_password_changed_at, rotation_not_before
           FROM scienceing_accounts
          WHERE enabled = 1 AND status = 'AVAILABLE'
          ORDER BY COALESCE(last_password_changed_at, '') ASC, id ASC
          LIMIT ?`,
      )
      .all(CANDIDATE_LIMIT) as unknown as RotationCandidateRow[];

    for (const row of candidates) {
      // 达到本轮配额后仍继续扫描计数，但不再排入——避免一次清扫把队列压满
      if (result.enqueued >= MAX_ENQUEUE_PER_SWEEP) break;
      result.scanned += 1;

      const decision = decideRotation({
        status: row.status,
        provisioned: isPasswordProvisioned(row.id, row.current_password_ciphertext),
        lastChangedAt: row.last_password_changed_at,
        notBefore: row.rotation_not_before,
        now,
        maxAgeDays,
        minIntervalHours,
      });

      if (decision.kind === 'skip') {
        result.skipped[decision.reason] = (result.skipped[decision.reason] ?? 0) + 1;
        continue;
      }

      if (decision.kind === 'defer') {
        this.recordDeferral(row, decision.until);
        result.deferred += 1;
        continue;
      }

      this.enqueueRotation(row, decision.reason, now);
      result.enqueued += 1;
    }

    return result;
  }

  /** 排入改密队列；成功后补写 due_reason 并记审计。 */
  private enqueueRotation(row: RotationCandidateRow, reason: RotationReason, now: Date): void {
    let jobId: number;
    try {
      // enqueueReset 自带事务（account → RECYCLING + 生成 pending 密文 + 建 job）。
      // 这里不能在外层再包 BEGIN IMMEDIATE：node:sqlite 不支持嵌套事务，会直接抛错。
      jobId = this.resetService.enqueueReset(row.id, null);
    } catch (err) {
      // 单个账号排入失败不能中断整轮清扫：余下账号仍应继续
      this.logger.error(
        `排入改密失败 account=${row.code}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    const ageDays = this.ageInDays(row.last_password_changed_at, now);
    try {
      this.dbService.db
        .prepare('UPDATE scienceing_accounts SET rotation_due_reason = ?, updated_at = ? WHERE id = ?')
        .run(DB_DUE_REASON[reason], nowIso(), row.id);
    } catch (err) {
      // 只是少一条原因标记，账号已经进了队列，不回滚
      this.logger.warn(
        `写入 rotation_due_reason 失败 account=${row.code}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.audit.record({
      action: AUDIT_ACTION.AUTO_ROTATION_ENQUEUED,
      result: AUDIT_RESULT.SUCCESS,
      accountId: row.id,
      metadata: {
        accountCode: row.code,
        reason,
        ageDays,
        jobId,
        trigger: 'OVERDUE_SWEEP',
      },
    });
    this.logger.log(`已排入改密 account=${row.code} reason=${reason} ageDays=${ageDays ?? '未知'}`);
  }

  /**
   * 记录频次护栏导致的推迟。
   *
   * 只在解禁时间发生变化时写库 + 记审计：否则每 5 分钟一轮会把审计表刷满同一条记录，
   * 真正的异常反而被淹没。
   */
  private recordDeferral(row: RotationCandidateRow, until: string): void {
    if (row.rotation_not_before === until) return;

    try {
      this.dbService.db
        .prepare('UPDATE scienceing_accounts SET rotation_not_before = ?, updated_at = ? WHERE id = ?')
        .run(until, nowIso(), row.id);
    } catch (err) {
      this.logger.warn(
        `写入 rotation_not_before 失败 account=${row.code}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    this.audit.record({
      action: AUDIT_ACTION.ROTATION_DEFERRED,
      result: AUDIT_RESULT.SUCCESS,
      accountId: row.id,
      metadata: { accountCode: row.code, until, trigger: 'OVERDUE_SWEEP' },
    });
  }

  /** 距上次改密的天数；时间戳缺失或不可解析时返回 null（审计里显示为「未知」）。 */
  private ageInDays(lastChangedAt: string | null, now: Date): number | null {
    if (!lastChangedAt) return null;
    const ms = Date.parse(lastChangedAt);
    if (!Number.isFinite(ms)) return null;
    return Math.floor((now.getTime() - ms) / (24 * 60 * 60 * 1000));
  }

  /** 读取数值型设置；缺失或非法时回落到默认值。 */
  private readNumberSetting(key: string, fallback: number): number {
    const row = this.dbService.db
      .prepare('SELECT value FROM system_settings WHERE key = ?')
      .get(key) as unknown as { value: string } | undefined;
    if (!row) return fallback;
    const parsed = Number(row.value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
