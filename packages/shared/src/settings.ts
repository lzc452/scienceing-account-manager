/**
 * system_settings 键（PRD §39 / §40，PRODUCT-DESIGN §5.9）。
 *
 * 数据库以 key/value 字符串存储（PRD §39），数值类设置序列化为字符串；
 * 读取时按需解析为数字。
 */
export const SYSTEM_SETTING_KEYS = [
  'inactivity_timeout_hours',
  'warning_hours',
  'critical_warning_hours',
  'activity_throttle_seconds',
  'extension_min_version',
  'extension_latest_version',
  'purge_ack_timeout_seconds',
  'password_max_age_days',
  'password_rotation_min_interval_hours',
  'recycle_mode',
  'purge_gate_min_version',
] as const;

export type SystemSettingKey = (typeof SYSTEM_SETTING_KEYS)[number];

/**
 * 数值类设置键（读取时解析为 number）。
 */
export const NUMERIC_SETTING_KEYS: readonly SystemSettingKey[] = [
  'inactivity_timeout_hours',
  'warning_hours',
  'critical_warning_hours',
  'activity_throttle_seconds',
  'purge_ack_timeout_seconds',
  'password_max_age_days',
  'password_rotation_min_interval_hours',
];

/**
 * 系统设置默认值（与 PRD §39 / §40 / §11，PRODUCT-DESIGN §5.9 一致）。
 *
 * - inactivity_timeout_hours = 24（24 小时无操作回收）
 * - warning_hours = 2（距自动释放剩 2 小时提醒）
 * - critical_warning_hours = 1（距自动释放剩 1 小时进入临界提醒）
 * - activity_throttle_seconds = 5（插件 Activity 上报节流，5~10 秒）
 * - extension_min_version = 1.0.0（低于此版本禁止领取，PRD R4）
 * - extension_latest_version = 1.4.0（指定领取与多标签页绑定修复）
 * - purge_ack_timeout_seconds = 120（等扩展确认清理的时长，超时转改密）
 * - password_max_age_days = 30（密码最长有效期；0 关闭定时轮换）
 * - password_rotation_min_interval_hours = 24（同账号两次改密最小间隔）
 * - recycle_mode = PURGE（PURGE=清会话；ROTATE=退回旧改密链路，紧急止血用）
 * - purge_gate_min_version = 1.5.0（低于此版本的扩展归还时自动走 ROTATE）
 */
export const DEFAULT_SYSTEM_SETTINGS: Record<SystemSettingKey, string> = {
  inactivity_timeout_hours: '24',
  warning_hours: '2',
  critical_warning_hours: '1',
  activity_throttle_seconds: '5',
  extension_min_version: '1.0.0',
  extension_latest_version: '1.4.0',
  purge_ack_timeout_seconds: '120',
  password_max_age_days: '30',
  password_rotation_min_interval_hours: '24',
  recycle_mode: 'PURGE',
  purge_gate_min_version: '1.5.0',
};
