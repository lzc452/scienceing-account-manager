/**
 * 数据库层字符串常量，与 @scienceing/shared 枚举值保持一致。
 * （t3 的 DB 层保持自包含，不依赖 shared 运行时代码；t4/t5/t6 在领域层做枚举↔字符串映射。）
 */

/** 科应账号状态（AccountStatus，PRD §23） */
export const ACCOUNT_STATUS = {
  AVAILABLE: 'AVAILABLE',
  IN_USE: 'IN_USE',
  RECYCLING: 'RECYCLING',
  ERROR: 'ERROR',
} as const;

/** 租约状态（LeaseStatus，PRD §24） */
export const LEASE_STATUS = {
  ACTIVE: 'ACTIVE',
  RELEASE_REQUESTED: 'RELEASE_REQUESTED',
  RECYCLING: 'RECYCLING',
  RELEASED: 'RELEASED',
  FAILED: 'FAILED',
} as const;

/** 释放原因（ReleaseReason，PRD §39） */
export const RELEASE_REASON = {
  USER_RETURN: 'USER_RETURN',
  INACTIVITY_TIMEOUT: 'INACTIVITY_TIMEOUT',
  ADMIN_FORCE: 'ADMIN_FORCE',
  RESET_ERROR: 'RESET_ERROR',
} as const;

/** 密码重置任务状态（ResetJobStatus，PRD §39） */
export const RESET_JOB_STATUS = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

/** 用户角色（UserRole，PRD §4） */
export const USER_ROLE = {
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const;

/** 系统设置默认值（与 @scienceing/shared DEFAULT_SYSTEM_SETTINGS 一致，PRD §39/§40） */
export const DEFAULT_SYSTEM_SETTINGS: Record<string, string> = {
  inactivity_timeout_seconds: '1800',
  warning_seconds: '300',
  critical_warning_seconds: '60',
  activity_throttle_seconds: '5',
  extension_min_version: '1.0.0',
  extension_latest_version: '1.2.0',
};

/** 审计动作（与 @scienceing/shared AuditAction 一致；用户管理动作扩展） */
export const AUDIT_ACTION = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
  CLAIM_ACCOUNT: 'CLAIM_ACCOUNT',
  ACTIVITY: 'ACTIVITY',
  RELEASE: 'RELEASE',
  TIMEOUT: 'TIMEOUT',
  RESET_PASSWORD: 'RESET_PASSWORD',
  RESET_SUCCESS: 'RESET_SUCCESS',
  RESET_FAILED: 'RESET_FAILED',
  ADMIN_FORCE_RELEASE: 'ADMIN_FORCE_RELEASE',
  ADMIN_MANUAL_FIX: 'ADMIN_MANUAL_FIX',
  ACCOUNT_DISABLE: 'ACCOUNT_DISABLE',
  ACCOUNT_ENABLE: 'ACCOUNT_ENABLE',
  SETTING_UPDATE: 'SETTING_UPDATE',
  PASSWORD_DECRYPT_FAILED: 'PASSWORD_DECRYPT_FAILED',
  USER_BULK_CREATE: 'USER_BULK_CREATE',
  ACCOUNT_RENAME: 'ACCOUNT_RENAME',
} as const;

/** 审计结果 */
export const AUDIT_RESULT = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;
