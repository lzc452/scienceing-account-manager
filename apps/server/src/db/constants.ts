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
  // 无操作超时以「分钟」为单位配置（2026-09-03 起，原先为秒）；后端内部换算成秒做超时判定。
  inactivity_timeout_minutes: '30',
  warning_seconds: '300',
  critical_warning_seconds: '60',
  activity_throttle_seconds: '5',
  extension_min_version: '1.0.0',
  extension_latest_version: '1.3.0',
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
  ACCOUNT_CREATE: 'ACCOUNT_CREATE',
  ACCOUNT_DELETE: 'ACCOUNT_DELETE',
  ACCOUNT_BULK_CREATE: 'ACCOUNT_BULK_CREATE',
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

/**
 * 审计动作中文名（展示层映射，供 GET /admin/logs 输出 actionLabel）。
 * 与 AUDIT_ACTION 键一一对应；新增动作须在此补全，否则前端兜底显示英文。
 */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  LOGIN: '登录',
  LOGOUT: '退出登录',
  USER_CREATE: '新增用户',
  USER_UPDATE: '修改用户',
  USER_PASSWORD_RESET: '重置用户密码',
  USER_BULK_CREATE: '批量导入用户',
  CLAIM_ACCOUNT: '领取账号',
  ACTIVITY: '活跃上报',
  RELEASE: '归还账号',
  TIMEOUT: '超时回收',
  RESET_PASSWORD: '发起改密',
  RESET_SUCCESS: '改密成功',
  RESET_FAILED: '改密失败',
  ADMIN_FORCE_RELEASE: '强制回收',
  ADMIN_MANUAL_FIX: '人工修复完成',
  ACCOUNT_DISABLE: '停用账号',
  ACCOUNT_ENABLE: '启用账号',
  ACCOUNT_CREATE: '新增科应账号',
  ACCOUNT_DELETE: '删除科应账号',
  ACCOUNT_BULK_CREATE: '批量导入科应账号',
  ACCOUNT_RENAME: '修改科应账号',
  SETTING_UPDATE: '参数更新',
  PASSWORD_DECRYPT_FAILED: '密码解密失败',
};
