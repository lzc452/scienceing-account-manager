import { timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
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
import { accountAad, decryptSecret, parsePayload } from '../../crypto/secret-box';
import { loadMasterKey } from '../../crypto/master-key';
import { isPasswordProvisioned } from '../../crypto/account-password-state';
import { nowIso } from '../../db/config';
import { isVersionAtLeast } from '../../lib/version';
import { ResetService } from '../reset/reset.service';
import { DEFAULT_PURGE_GATE_VERSION, resolveRecycleMode, type RecycleMode } from './recycle-policy';
import type { AccountCredentialsView, AccountRow, LeaseRow, LeaseView } from './leases.types';

/** 无操作超时默认 24 小时（配置单位为小时，见 system_settings.inactivity_timeout_hours） */
const DEFAULT_INACTIVITY_TIMEOUT_HOURS = 24;
const DEFAULT_MIN_EXTENSION_VERSION = '1.0.0';
/** 等客户端回执「本机已清理」的超时（秒），与 DEFAULT_SYSTEM_SETTINGS.purge_ack_timeout_seconds 一致。 */
const DEFAULT_PURGE_ACK_TIMEOUT_SECONDS = 120;

/**
 * 恒定时间比较两个十六进制哈希串。
 *
 * 用 `!==` 比较会在第一个不同字符处提前返回，比较耗时随「匹配前缀长度」变化，
 * 理论上可被计时侧信道逐位逼近 token。timingSafeEqual 的耗时与内容无关。
 * 长度不等时直接判否（长度本身不是机密，且 timingSafeEqual 要求等长入参）。
 */
function hashEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * 归一化清理通道标识。
 *
 * leases.purge_method 有 CHECK 约束，只允许 PAGE / BROWSING_DATA / FAILED，
 * 所以这里必须收敛到这三个值（否则整条 UPDATE 会被约束拒绝）。
 * 扩展没报具体通道时返回 null（允许为空）——记一个猜的值比记空更糟，
 * 事后排查会以为「确定是页面清理」。
 */
function normalizePurgeMethod(raw: string | undefined, ok: boolean): string | null {
  if (!ok) return 'FAILED';
  const value = (raw ?? '').trim().toUpperCase();
  if (value === 'PAGE' || value === 'BROWSING_DATA') return value;
  return null;
}

@Injectable()
export class LeasesService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly audit: AuditService,
    private readonly resetService: ResetService,
  ) {}

  private getMinimumExtensionVersion(): string {
    const row = this.dbService.db
      .prepare('SELECT value FROM system_settings WHERE key = ?')
      .get('extension_min_version') as { value: string } | undefined;
    return row?.value ?? DEFAULT_MIN_EXTENSION_VERSION;
  }

  /** 读取单项设置（缺失返回 fallback）。 */
  private readSetting(key: string, fallback: string): string {
    const row = this.dbService.db
      .prepare('SELECT value FROM system_settings WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? fallback;
  }

  /**
   * 原子领取（PRD §12 / §13 / R1 / R2）：
   *   BEGIN IMMEDIATE → 检查既有租约/目标账号 → UPDATE IN_USE → INSERT lease → COMMIT。
   * 只有事务成功才返回 leaseToken + 账号 + 明文密码（R10）。
   */
  claim(userId: number, extensionVersion?: string, accountId?: number): { leaseToken: string; lease: LeaseView; account: AccountCredentialsView } {
    const db = this.dbService.db;

    if (accountId !== undefined && (!Number.isSafeInteger(accountId) || accountId <= 0)) {
      throw new BadRequestException('accountId 必须为正整数');
    }

    // R3/R4：插件未装 / 版本过旧 → 禁止领取（PRD §57，先于 R2 判断，PRD §12.1）
    const configuredMinimum = this.getMinimumExtensionVersion();
    const minimumVersion = accountId !== undefined && !isVersionAtLeast(configuredMinimum, '1.4.0')
      ? '1.4.0' : configuredMinimum;
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

    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db
        .prepare('SELECT * FROM leases WHERE user_id = ? AND status = ?')
        .get(userId, LEASE_STATUS.ACTIVE) as unknown as LeaseRow | undefined;
      if (existing) {
        if (accountId !== undefined && existing.account_id !== accountId) {
          throw new ConflictException({ code: 'ACTIVE_LEASE_CONFLICT', message: '您已持有其他账号，请先归还后再领取指定账号' });
        }
        const token = this.rotateToken(existing.id);
        db.exec('COMMIT');
        return this.buildClaimResponse(existing.id, token);
      }

      let target: AccountRow | undefined;
      if (accountId !== undefined) {
        target = db.prepare('SELECT * FROM scienceing_accounts WHERE id = ?').get(accountId) as unknown as AccountRow | undefined;
        if (!target) throw new NotFoundException('指定账号不存在');
        if (!target.enabled || target.status !== ACCOUNT_STATUS.AVAILABLE) {
          const reason = !target.enabled ? '已停用' : target.status === ACCOUNT_STATUS.IN_USE
            ? '正在使用中' : target.status === ACCOUNT_STATUS.RECYCLING ? '正在回收中' : '状态异常';
          throw new ConflictException({ code: 'TARGET_ACCOUNT_UNAVAILABLE', message: `指定账号${reason}，请刷新状态后重试` });
        }
        if (!isPasswordProvisioned(target.id, target.current_password_ciphertext)) {
          throw new ConflictException({ code: 'ACCOUNT_NOT_PROVISIONED', message: '指定账号尚未配置密码，请联系管理员重置密码' });
        }
      }
      // 占位密码（seed / CSV 导入）的账号不可发放：密文未对应科应平台上的真实口令，
      // 下发后扩展登录必然失败（此前直接 LIMIT 1 会把这类账号发给用户，导致「一用就废」）。
      // 池内逐个解密挑选第一个真实配置的可用账号；账号量小（默认 10 级），开销可忽略。
      const candidates = target ? [target] : db
        .prepare('SELECT * FROM scienceing_accounts WHERE status = ? AND enabled = 1 ORDER BY id')
        .all(ACCOUNT_STATUS.AVAILABLE) as unknown as AccountRow[];
      const account = target ?? candidates.find((c) => isPasswordProvisioned(c.id, c.current_password_ciphertext));
      if (!account) {
        db.exec('ROLLBACK');
        this.audit.record({
          action: AUDIT_ACTION.CLAIM_ACCOUNT,
          result: AUDIT_RESULT.FAILED,
          userId,
          metadata: {
            reason: candidates.length === 0 ? 'no_available_account' : 'no_provisioned_account',
          },
        });
        throw new ConflictException(
          candidates.length === 0
            ? '暂无可用账号'
            : { message: '可用账号均未完成初始改密，请联系管理员在账号管理中执行「重置密码」', code: 'ACCOUNT_NOT_PROVISIONED' },
        );
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
      return this.buildClaimResponse(leaseId, token);
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

  /**
   * 主动归还（PRD §32）—— 按客户端能力分流：
   *
   *  - **PURGE**（扩展版本 >= purge_gate_min_version）：lease → RECYCLING、
   *    账号 IN_USE → DIRTY，**不建 reset_job**。零改密，等扩展回执「本机已清理」。
   *  - **ROTATE**（旧扩展 / 显式配置 / 版本未知）：lease → RECYCLING、
   *    账号 → RECYCLING + reset_job，即原有行为。
   *
   * 为什么必须先落 DIRTY 再等回执，而不是「先清理后归还」：
   * 归还一发生，账号就必须立刻从可领取队列里消失，否则清理期间（最长 120s）
   * 这个账号会被别人领走，两个人同时持有有效令牌。所以顺序只能是
   * 归还（关闸）→ 清理 → 回执 → 放回池子。
   */
  release(
    leaseId: number,
    userId: number,
    reason: string,
  ): { leaseId: number; status: string; releaseReason: string; recycleMode: RecycleMode; accountStatus: string } {
    const db = this.dbService.db;
    const lease = db.prepare('SELECT * FROM leases WHERE id = ?').get(leaseId) as unknown as LeaseRow | undefined;
    if (!lease) {
      throw new NotFoundException('租约不存在');
    }
    if (lease.user_id !== userId) {
      throw new ForbiddenException('无权操作他人租约');
    }

    const decision = resolveRecycleMode({
      configuredMode: this.readSetting('recycle_mode', 'PURGE'),
      extensionVersion: lease.extension_version,
      gateVersion: this.readSetting('purge_gate_min_version', DEFAULT_PURGE_GATE_VERSION),
    });

    const now = nowIso();
    const targetAccountStatus = decision.mode === 'PURGE' ? ACCOUNT_STATUS.DIRTY : ACCOUNT_STATUS.RECYCLING;

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

      const accountUpdate = db
        .prepare('UPDATE scienceing_accounts SET status = ?, dirty_since = ?, purge_attempts = 0, updated_at = ? WHERE id = ? AND status = ?')
        .run(targetAccountStatus, decision.mode === 'PURGE' ? now : null, now, lease.account_id, ACCOUNT_STATUS.IN_USE);
      if (Number(accountUpdate.changes) !== 1) {
        // 账号已不在 IN_USE（被管理员改过 / 另一条路径已回收）：
        // 此时强行置 DIRTY 会把一个不该改的账号锁住，宁可报错让前端刷新重试。
        db.exec('ROLLBACK');
        throw new ConflictException('账号状态已变化，请刷新后重试');
      }

      // PURGE 不建 reset_job：这一轮的目标就是「不改密」。
      // job 只在 ack 失败 / ack 超时时由兜底路径创建。
      if (decision.mode === 'ROTATE') {
        db.prepare(
          `INSERT INTO reset_jobs (account_id, lease_id, status, attempt_count, created_at) VALUES (?, ?, ?, 0, ?)`,
        ).run(lease.account_id, leaseId, 'PENDING', now);
      }

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
      metadata: { reason, recycleMode: decision.mode, modeReason: decision.reason },
    });

    return {
      leaseId,
      status: LEASE_STATUS.RECYCLING,
      releaseReason: reason,
      recycleMode: decision.mode,
      accountStatus: targetAccountStatus,
    };
  }

  /**
   * 客户端清理回执（PURGE 链路的收尾）。
   *
   * 认证用 leaseToken 而不是用户 JWT：归还后用户已经跳走，可能连页面都没了，
   * 而扩展手里始终有这条租约的 token。
   *
   * 幂等：重复回执返回当前结果，不报错——扩展可能在收到响应前重试。
   */
  ackRecycle(
    leaseId: number,
    token: string | null,
    input: { ok: boolean; method?: string; detail?: string },
  ): {
    ok: boolean;
    alreadyDone: boolean;
    accountStatus: string;
    /** ok=false 且已被超时任务转走时，告诉扩展「不用再重试了」 */
    reason?: 'ALREADY_ROTATING' | 'LEASE_NOT_RECYCLING' | 'PURGE_FAILED';
  } {
    const db = this.dbService.db;
    const lease = this.resolveLeaseByToken(leaseId, token);
    const account = db
      .prepare('SELECT * FROM scienceing_accounts WHERE id = ?')
      .get(lease.account_id) as unknown as AccountRow | undefined;
    if (!account) {
      throw new NotFoundException('账号不存在');
    }

    const now = nowIso();
    const method = normalizePurgeMethod(input.method, input.ok);
    const detail = (input.detail ?? '').slice(0, 500);

    // 已经收尾过（重复回执 / 超时任务已改密完成）
    if (lease.status === LEASE_STATUS.RELEASED) {
      return { ok: true, alreadyDone: true, accountStatus: account.status };
    }
    if (lease.status !== LEASE_STATUS.RECYCLING) {
      return { ok: false, alreadyDone: false, accountStatus: account.status, reason: 'LEASE_NOT_RECYCLING' };
    }

    if (!input.ok) {
      // 扩展自报清理失败 → 立刻转改密兜底，不等 ack 超时
      this.beginRotation(account, leaseId, 'PURGE_FAILED', {
        purgeMethod: method,
        purgeDetail: detail,
        auditAction: AUDIT_ACTION.PURGE_FAILED,
      });
      return { ok: false, alreadyDone: false, accountStatus: ACCOUNT_STATUS.RECYCLING, reason: 'PURGE_FAILED' };
    }

    // 成功回执：账号可能已被超时任务转成 RECYCLING，此时不能把它拉回 AVAILABLE
    // （那会把一个正在排队改密的账号放回池子，密码即将变化）
    if (account.status !== ACCOUNT_STATUS.DIRTY) {
      db.prepare(
        'UPDATE leases SET purge_ack_at = ?, purge_method = ?, purge_detail = ?, updated_at = ? WHERE id = ? AND status = ?',
      ).run(now, method, detail, now, leaseId, LEASE_STATUS.RECYCLING);
      return { ok: false, alreadyDone: false, accountStatus: account.status, reason: 'ALREADY_ROTATING' };
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const leaseUpdate = db
        .prepare(
          `UPDATE leases SET status = ?, released_at = ?, purge_ack_at = ?, purge_method = ?, purge_detail = ?, updated_at = ?
           WHERE id = ? AND status = ?`,
        )
        .run(LEASE_STATUS.RELEASED, now, now, method, detail, now, leaseId, LEASE_STATUS.RECYCLING);
      if (Number(leaseUpdate.changes) !== 1) {
        db.exec('ROLLBACK');
        return { ok: false, alreadyDone: false, accountStatus: account.status, reason: 'LEASE_NOT_RECYCLING' };
      }

      const accountUpdate = db
        .prepare(
          `UPDATE scienceing_accounts
              SET status = ?, dirty_since = NULL, last_purge_ack_at = ?, purge_attempts = 0, updated_at = ?
            WHERE id = ? AND status = ?`,
        )
        .run(ACCOUNT_STATUS.AVAILABLE, now, now, account.id, ACCOUNT_STATUS.DIRTY);
      if (Number(accountUpdate.changes) !== 1) {
        // 极端竞态：判断时还是 DIRTY，写入时已被超时任务抢走。
        // 回滚整个事务，让超时任务的结果生效。
        db.exec('ROLLBACK');
        return { ok: false, alreadyDone: false, accountStatus: ACCOUNT_STATUS.RECYCLING, reason: 'ALREADY_ROTATING' };
      }

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
      action: AUDIT_ACTION.SESSION_PURGED,
      result: AUDIT_RESULT.SUCCESS,
      leaseId,
      accountId: account.id,
      metadata: { accountCode: account.code, purgeMethod: method },
    });

    return { ok: true, alreadyDone: false, accountStatus: ACCOUNT_STATUS.AVAILABLE };
  }

  /**
   * DIRTY 的 ack 超时兜底：超过 purge_ack_timeout_seconds 仍未收到回执，
   * 说明那台机器可能已经关掉浏览器 / 扩展被禁用 → 无法再清，只能改密。
   *
   * 这是「客户端不可达」的唯一出路：V2/V3/V4 已实测证明改密、注销、单点互踢
   * 都不会吊销已签发的令牌，所以对那台够不着的机器，改密只能降低后续风险，
   * 不能宣称「踢掉旧会话」——文档与界面文案都必须与之保持一致。
   */
  sweepDirtyAckTimeouts(now: Date = new Date()): number {
    const db = this.dbService.db;
    const timeoutSeconds = Number(this.readSetting('purge_ack_timeout_seconds', String(DEFAULT_PURGE_ACK_TIMEOUT_SECONDS)));
    const effectiveTimeout = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
      ? timeoutSeconds : DEFAULT_PURGE_ACK_TIMEOUT_SECONDS;
    const threshold = new Date(now.getTime() - effectiveTimeout * 1000).toISOString();

    const rows = db
      .prepare(
        `SELECT id, code FROM scienceing_accounts
          WHERE status = ? AND dirty_since IS NOT NULL AND dirty_since <= ?`,
      )
      .all(ACCOUNT_STATUS.DIRTY, threshold) as unknown as Array<{ id: number; code: string }>;

    let converted = 0;
    for (const row of rows) {
      // 找该账号仍在回收中的租约：改密成功后 completeSuccess 会把它置 RELEASED，
      // 找得到就把 leaseId 带进 job，让报告能追溯到是哪次归还。
      const lease = db
        .prepare('SELECT id FROM leases WHERE account_id = ? AND status = ? ORDER BY id DESC LIMIT 1')
        .get(row.id, LEASE_STATUS.RECYCLING) as unknown as { id: number } | undefined;

      const account = db
        .prepare('SELECT * FROM scienceing_accounts WHERE id = ?')
        .get(row.id) as unknown as AccountRow | undefined;
      if (!account) continue;

      try {
        this.beginRotation(account, lease?.id ?? null, 'ACK_TIMEOUT', {
          auditAction: AUDIT_ACTION.PURGE_TIMEOUT,
        });
        converted += 1;
      } catch (err) {
        // 单个账号失败不能中断整轮：下一轮还会再扫到它
        console.error(`[leases] DIRTY 超时转改密失败 account=${row.code}:`, err instanceof Error ? err.message : err);
      }
    }
    return converted;
  }

  /**
   * 把 DIRTY 账号转成「排队改密」。
   *
   * 复用 ResetService.enqueueReset（它自带事务：account → RECYCLING + 生成 pending 密文 + 建 job），
   * 所以这里不能在外层再开 BEGIN IMMEDIATE —— node:sqlite 不支持嵌套事务。
   * dueReason 必须落在 008 的 CHECK 白名单内，否则会整条 UPDATE 失败。
   */
  private beginRotation(
    account: AccountRow,
    leaseId: number | null,
    dueReason: 'PURGE_FAILED' | 'ACK_TIMEOUT',
    extra: { purgeMethod?: string | null; purgeDetail?: string | null; auditAction: string },
  ): number {
    const jobId = this.resetService.enqueueReset(account.id, leaseId);

    this.dbService.db
      .prepare('UPDATE scienceing_accounts SET rotation_due_reason = ?, dirty_since = NULL, updated_at = ? WHERE id = ?')
      .run(dueReason, nowIso(), account.id);

    if (leaseId !== null && (extra.purgeMethod || extra.purgeDetail)) {
      // 通道与细节记在租约上；失败次数记在账号上（008 里 purge_attempts 属于 accounts，
      // leases 只有 purge_ack_at/purge_method/purge_detail —— 写错列会整条 UPDATE 报错）
      this.dbService.db
        .prepare('UPDATE leases SET purge_method = ?, purge_detail = ?, updated_at = ? WHERE id = ?')
        .run(extra.purgeMethod ?? null, extra.purgeDetail ?? null, nowIso(), leaseId);
      this.dbService.db
        .prepare('UPDATE scienceing_accounts SET purge_attempts = purge_attempts + 1 WHERE id = ?')
        .run(account.id);
    }

    this.audit.record({
      action: extra.auditAction,
      result: AUDIT_RESULT.SUCCESS,
      accountId: account.id,
      leaseId,
      metadata: { accountCode: account.code, jobId, dueReason, purgeMethod: extra.purgeMethod ?? null },
    });

    return jobId;
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
    /** 本次回收走的链路：PURGE 时扩展应在离开前清理本机会话并回执 */
    recycleMode: RecycleMode;
    /** 清理回执的超时（秒）：扩展据此决定重试节奏 */
    purgeAckTimeoutSeconds: number;
  } {
    const db = this.dbService.db;
    const lease = this.resolveLeaseByToken(leaseId, token);
    const account = db.prepare('SELECT * FROM scienceing_accounts WHERE id = ?').get(lease.account_id) as unknown as AccountRow;
    const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(lease.user_id) as unknown as
      | { display_name: string }
      | undefined;
    const view = this.toLeaseView(lease, account);
    const decision = resolveRecycleMode({
      configuredMode: this.readSetting('recycle_mode', 'PURGE'),
      extensionVersion: lease.extension_version,
      gateVersion: this.readSetting('purge_gate_min_version', DEFAULT_PURGE_GATE_VERSION),
    });
    const ackTimeout = Number(this.readSetting('purge_ack_timeout_seconds', String(DEFAULT_PURGE_ACK_TIMEOUT_SECONDS)));
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
      recycleMode: decision.mode,
      purgeAckTimeoutSeconds: Number.isFinite(ackTimeout) && ackTimeout > 0 ? ackTimeout : DEFAULT_PURGE_ACK_TIMEOUT_SECONDS,
    };
  }

  /**
   * 超时回收（R6，PRD §25/§33）：条件原子 UPDATE，`last_activity_at <= threshold` 兜底，
   * 保证「23:59:59.9 刚操作」不会被 24:00:00 的回收误踢。返回本次回收数。
   *
   * 与主动归还走同一套分流：**超时恰恰是最可能有标签页开着的场景**（人离开了但没关浏览器），
   * 所以只要客户端有能力清理，就先试 PURGE 而不是直接改密——V2 已实测改密踢不掉旧标签页，
   * 直接改密既费一次密码又留一个仍可用的会话。
   */
  recycleTimedOutLeases(): number {
    const db = this.dbService.db;
    const timeoutSeconds = this.inactivityTimeoutSeconds();
    const threshold = new Date(Date.now() - timeoutSeconds * 1000).toISOString();
    const now = nowIso();
    const configuredMode = this.readSetting('recycle_mode', 'PURGE');
    const gateVersion = this.readSetting('purge_gate_min_version', DEFAULT_PURGE_GATE_VERSION);

    const candidates = db
      .prepare('SELECT id, account_id, extension_version FROM leases WHERE status = ? AND last_activity_at <= ?')
      .all(LEASE_STATUS.ACTIVE, threshold) as unknown as Array<{
      id: number;
      account_id: number;
      extension_version: string | null;
    }>;

    let recycled = 0;
    for (const candidate of candidates) {
      const decision = resolveRecycleMode({
        configuredMode,
        extensionVersion: candidate.extension_version,
        gateVersion,
      });
      const targetAccountStatus = decision.mode === 'PURGE' ? ACCOUNT_STATUS.DIRTY : ACCOUNT_STATUS.RECYCLING;

      // 三次写必须原子（对齐 release() 的事务模板）：
      // 中途异常会让账号停在 RECYCLING 却没有对应的 reset_job —— 既不会被 Worker 消费，
      // 也不会被任何重试逻辑捡回，只能人工修库。
      db.exec('BEGIN IMMEDIATE');
      try {
        const updated = db
          .prepare(
            `UPDATE leases SET status = ?, release_reason = ?, release_requested_at = ?, updated_at = ?
             WHERE id = ? AND status = ? AND last_activity_at <= ?`,
          )
          .run(LEASE_STATUS.RECYCLING, RELEASE_REASON.INACTIVITY_TIMEOUT, now, now, candidate.id, LEASE_STATUS.ACTIVE, threshold);
        if (Number(updated.changes) !== 1) {
          db.exec('ROLLBACK');
          continue; // 回收前刚有 Activity 续期，跳过（避免误踢）
        }

        db.prepare('UPDATE scienceing_accounts SET status = ?, dirty_since = ?, purge_attempts = 0, updated_at = ? WHERE id = ? AND status = ?').run(
          targetAccountStatus,
          decision.mode === 'PURGE' ? now : null,
          now,
          candidate.account_id,
          ACCOUNT_STATUS.IN_USE,
        );
        // PURGE 不建 job：等扩展回执；收不到回执由 sweepDirtyAckTimeouts 兜底转改密
        if (decision.mode === 'ROTATE') {
          db.prepare(
            `INSERT INTO reset_jobs (account_id, lease_id, status, attempt_count, created_at) VALUES (?, ?, ?, 0, ?)`,
          ).run(candidate.account_id, candidate.id, 'PENDING', now);
        }

        db.exec('COMMIT');
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // 已回滚或未开启
        }
        throw err;
      }

      // 审计写在事务之外（与 release() 一致）：避免把 audit_logs 的写入
      // 一起绑进租约事务、拉长持锁时间。
      this.audit.record({
        action: AUDIT_ACTION.TIMEOUT,
        result: AUDIT_RESULT.SUCCESS,
        accountId: candidate.account_id,
        leaseId: candidate.id,
        metadata: { reason: RELEASE_REASON.INACTIVITY_TIMEOUT, recycleMode: decision.mode, modeReason: decision.reason },
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
    if (!lease || !hashEquals(lease.lease_token_hash, hashLeaseToken(token))) {
      throw new UnauthorizedException('无效的 leaseToken');
    }
    return lease;
  }

  private buildClaimResponse(
    leaseId: number,
    token: string,
  ): { leaseToken: string; lease: LeaseView; account: AccountCredentialsView } {
    const db = this.dbService.db;
    const lease = db.prepare('SELECT * FROM leases WHERE id = ?').get(leaseId) as unknown as LeaseRow;
    const account = db.prepare('SELECT * FROM scienceing_accounts WHERE id = ?').get(lease.account_id) as unknown as AccountRow;
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
      timeoutSeconds: timeoutSeconds,
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

  /**
   * 解密账号密码。密文损坏或主密钥不匹配（如换了 SCIENCEING_MASTER_KEY）时
   * decipher.final() 会抛错——不能让整个 claim 500：降级返回空密码并记审计，
   * 由管理员通过「重置密码」流程重新生成可解密的密码。
   */
  private decryptAccountPassword(account: AccountRow): string {
    if (!account.current_password_ciphertext) {
      return '';
    }
    try {
      const payload = parsePayload(account.current_password_ciphertext);
      return decryptSecret(payload, loadMasterKey(), accountAad(account.id));
    } catch (err) {
      console.error(
        `[leases] 账号 ${account.code} 密码解密失败（密文损坏或主密钥不匹配）:`,
        err instanceof Error ? err.message : err,
      );
      this.audit.record({
        action: AUDIT_ACTION.PASSWORD_DECRYPT_FAILED,
        result: AUDIT_RESULT.FAILED,
        accountId: account.id,
        metadata: { accountCode: account.code, reason: 'decrypt_failed' },
      });
      return '';
    }
  }

  /**
   * 无操作超时（秒）：配置按「小时」存于 inactivity_timeout_hours，
   * 此处换算成秒供超时判定/expiresAt 使用。
   */
  private inactivityTimeoutSeconds(): number {
    const row = this.dbService.db
      .prepare('SELECT value FROM system_settings WHERE key = ?')
      .get('inactivity_timeout_hours') as unknown as { value: string } | undefined;
    if (row) {
      const hours = Number(row.value);
      if (Number.isFinite(hours) && hours > 0) {
        return Math.round(hours * 60 * 60);
      }
    }
    return DEFAULT_INACTIVITY_TIMEOUT_HOURS * 60 * 60;
  }
}
