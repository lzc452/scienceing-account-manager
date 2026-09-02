/**
 * 科应共享账号管理平台 —— 领域枚举。
 *
 * 全部状态机与业务规则以 PRD 为准：
 * - 账号状态机 PRD §23
 * - Lease 状态 PRD §24
 * - release_reason PRD §39
 * - reset_jobs 状态 PRD §39
 */

/**
 * 科应账号状态机（PRD §23）。
 *
 * 只使用四个核心状态：
 *
 *   AVAILABLE ──领取──▶ IN_USE ──Activity──▶ IN_USE
 *   IN_USE ──30分钟无操作/主动归还/管理员强制──▶ RECYCLING
 *   RECYCLING ──密码重置成功──▶ AVAILABLE
 *   RECYCLING ──重置失败──▶ ERROR
 *   ERROR ──管理员重试──▶ RECYCLING
 *   ERROR ──管理员确认人工处理完成──▶ AVAILABLE
 */
export enum AccountStatus {
  AVAILABLE = 'AVAILABLE',
  IN_USE = 'IN_USE',
  RECYCLING = 'RECYCLING',
  ERROR = 'ERROR',
}

/**
 * 租约状态（PRD §24），与 Account 状态分离。
 *
 *   ACTIVE → RELEASE_REQUESTED / RECYCLING → RELEASED
 *   RECYCLING → FAILED（重置失败）
 */
export enum LeaseStatus {
  ACTIVE = 'ACTIVE',
  RELEASE_REQUESTED = 'RELEASE_REQUESTED',
  RECYCLING = 'RECYCLING',
  RELEASED = 'RELEASED',
  FAILED = 'FAILED',
}

/**
 * 释放原因（PRD §39 leases.release_reason）。
 */
export enum ReleaseReason {
  /** 用户主动归还（PRD §32） */
  USER_RETURN = 'USER_RETURN',
  /** 30 分钟无操作超时（PRD §25） */
  INACTIVITY_TIMEOUT = 'INACTIVITY_TIMEOUT',
  /** 管理员强制回收（PRD §52） */
  ADMIN_FORCE = 'ADMIN_FORCE',
  /** 重置失败导致的释放（PRD §47） */
  RESET_ERROR = 'RESET_ERROR',
}

/**
 * 密码重置任务状态（PRD §39 reset_jobs.status）。
 */
export enum ResetJobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

/**
 * 用户角色（PRD §4）。
 */
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

/**
 * 审计日志动作（PRD §37 / §58，PRODUCT-DESIGN §5.8）。
 */
export enum AuditAction {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  CLAIM_ACCOUNT = 'CLAIM_ACCOUNT',
  ACTIVITY = 'ACTIVITY',
  RELEASE = 'RELEASE',
  TIMEOUT = 'TIMEOUT',
  RESET_PASSWORD = 'RESET_PASSWORD',
  RESET_SUCCESS = 'RESET_SUCCESS',
  RESET_FAILED = 'RESET_FAILED',
  ADMIN_FORCE_RELEASE = 'ADMIN_FORCE_RELEASE',
  ADMIN_MANUAL_FIX = 'ADMIN_MANUAL_FIX',
  SCIENCING_OPEN = 'SCIENCING_OPEN',
  EXTENSION_BIND = 'EXTENSION_BIND',
}

/**
 * 审计结果（PRODUCT-DESIGN §5.8 结果列）。
 */
export enum AuditResult {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  IN_PROGRESS = 'IN_PROGRESS',
}
