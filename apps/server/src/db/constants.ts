/**
 * 数据库层字符串常量，与 @scienceing/shared 枚举值保持一致。
 * （t3 的 DB 层保持自包含，不依赖 shared 运行时代码；t4/t5/t6 在领域层做枚举↔字符串映射。）
 */

/**
 * 科应账号状态（AccountStatus，PRD §23）
 *
 * DIRTY（回收隔离态）与 RECYCLING（改密中）的边界必须分清，否则会写出两套并行状态：
 *  - DIRTY    = 服务端**没有**改密任务，账号隔离，等客户端确认清理（或等超时转改密）。
 *               不创建 reset_jobs；由扩展 ack 或 RecycleScheduler 推进。
 *  - RECYCLING = 服务端正在/已排队改密（存在 reset_jobs）。
 * 两者都不允许被 claim，选号 SQL 只看 AVAILABLE，因此天然排除。
 */
export const ACCOUNT_STATUS = {
  AVAILABLE: 'AVAILABLE',
  IN_USE: 'IN_USE',
  DIRTY: 'DIRTY',
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

/** 用户角色（UserRole，PRD §4） */
export const USER_ROLE = {
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const;

/** 系统设置默认值（与 @scienceing/shared DEFAULT_SYSTEM_SETTINGS 一致，PRD §39/§40） */
export const DEFAULT_SYSTEM_SETTINGS: Record<string, string> = {
  // 三条租约规则统一按「小时」配置；后端内部换算成秒做超时判定与扩展协议下发。
  inactivity_timeout_hours: '24',
  warning_hours: '2',
  critical_warning_hours: '1',
  activity_throttle_seconds: '5',
  extension_min_version: '1.0.0',
  extension_latest_version: '1.4.0',
  /** 回收时等客户端「清理完成」确认的时长；超时即转改密兜底。 */
  purge_ack_timeout_seconds: '120',
  /** 密码最长有效期（天）；0 表示关闭定时轮换。 */
  password_max_age_days: '30',
  /** 同一账号两次改密的最小间隔（小时），防 DIRTY 抖动把风控惹毛。 */
  password_rotation_min_interval_hours: '24',
  /** 回收模式：PURGE=清本机会话（默认）；ROTATE=退回旧「归还即改密」，用于紧急止血。 */
  recycle_mode: 'PURGE',
  /** 支持清理确认的最低扩展版本；低于此版本的客户端归还时自动走 ROTATE。 */
  purge_gate_min_version: '1.5.0',
};

/** 审计动作（与 @scienceing/shared AuditAction 一致；用户管理动作扩展） */
export const AUDIT_ACTION = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
  /** 删除用户（仅限无租用/审计记录的干净用户，避免破坏审计链） */
  USER_DELETE: 'USER_DELETE',
  /** 用户本人修改自己的登录密码（含首次登录强制改密） */
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
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
  MANUAL_UPDATE: 'MANUAL_UPDATE',
  /** 管理员执行敏感操作前自证当前密码（USER_PASSWORD_RESET 的前置验证） */
  ADMIN_PASSWORD_VERIFY: 'ADMIN_PASSWORD_VERIFY',
  ADMIN_PASSWORD_REVEAL: 'ADMIN_PASSWORD_REVEAL',
  /** 客户端确认已清理本机会话（回收零改密路径的收尾动作） */
  SESSION_PURGED: 'SESSION_PURGED',
  /** 客户端上报清理失败 */
  PURGE_FAILED: 'PURGE_FAILED',
  /** DIRTY 超过 ack 时限仍未确认，转入改密兜底 */
  PURGE_TIMEOUT: 'PURGE_TIMEOUT',
  /** 自动（非人工）把账号排入改密队列：超时转改密 / 30 天超期 / 到期补改密 */
  AUTO_ROTATION_ENQUEUED: 'AUTO_ROTATION_ENQUEUED',
  /** 因 24h 频次护栏暂缓改密，推迟到 rotation_not_before */
  ROTATION_DEFERRED: 'ROTATION_DEFERRED',
  /** 管理员对 DIRTY 账号手动发起改密 */
  ACCOUNT_ROTATE: 'ACCOUNT_ROTATE',
  /** 向扩展下发账号凭据（阶段 B 代填用；用于追溯“密码被下发过几次”） */
  CREDENTIAL_ISSUED: 'CREDENTIAL_ISSUED',
  AUTOFILL_SUCCEEDED: 'AUTOFILL_SUCCEEDED',
  AUTOFILL_FAILED: 'AUTOFILL_FAILED',
} as const;

/** 审计结果 */
export const AUDIT_RESULT = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

/**
 * 账号密码占位值：仅表示「账号已登记」，不代表科应平台上的真实口令。
 * seed 与 CSV 批量导入写入的都是它——此时账号不可领用，
 * 必须经「重置密码」流程在科应后台改密成功后才能下发真实口令。
 */
export const PLACEHOLDER_ACCOUNT_PASSWORD = '__PLACEHOLDER__';

/**
 * 审计动作中文名（展示层映射，供 GET /admin/logs 输出 actionLabel）。
 *
 * 类型刻意写成 `Record<keyof typeof AUDIT_ACTION, string>` 而非 `Record<string, string>`：
 * 前者会在**新增 AUDIT_ACTION 却忘了补标签**时直接编译失败，后者只会静默漏译、
 * 让前端兜底显示英文 —— 那正是此前需要靠人工同步、容易漏的地方。
 */
export const AUDIT_ACTION_LABEL: Record<keyof typeof AUDIT_ACTION, string> = {
  LOGIN: '登录',
  LOGOUT: '退出登录',
  USER_CREATE: '新增用户',
  USER_UPDATE: '修改用户',
  USER_PASSWORD_RESET: '重置用户密码',
  USER_DELETE: '删除用户',
  PASSWORD_CHANGE: '修改登录密码',
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
  MANUAL_UPDATE: '更新使用手册',
  PASSWORD_DECRYPT_FAILED: '密码解密失败',
  ADMIN_PASSWORD_VERIFY: '验证管理员密码',
  ADMIN_PASSWORD_REVEAL: '查看科应账号密码',
  SESSION_PURGED: '清空本机会话',
  PURGE_FAILED: '清空会话失败',
  PURGE_TIMEOUT: '清理确认超时',
  AUTO_ROTATION_ENQUEUED: '自动排入改密',
  ROTATION_DEFERRED: '改密延后（频次限制）',
  ACCOUNT_ROTATE: '手动发起改密',
  CREDENTIAL_ISSUED: '下发账号凭据',
  AUTOFILL_SUCCEEDED: '自动登录成功',
  AUTOFILL_FAILED: '自动登录失败',
};
