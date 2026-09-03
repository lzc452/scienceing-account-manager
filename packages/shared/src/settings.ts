/**
 * system_settings 键（PRD §39 / §40，PRODUCT-DESIGN §5.9）。
 *
 * 数据库以 key/value 字符串存储（PRD §39），数值类设置序列化为字符串；
 * 读取时按需解析为数字。
 */
export const SYSTEM_SETTING_KEYS = [
  'inactivity_timeout_seconds',
  'warning_seconds',
  'critical_warning_seconds',
  'activity_throttle_seconds',
  'extension_min_version',
  'extension_latest_version',
] as const;

export type SystemSettingKey = (typeof SYSTEM_SETTING_KEYS)[number];

/**
 * 数值类设置键（读取时解析为 number）。
 */
export const NUMERIC_SETTING_KEYS: readonly SystemSettingKey[] = [
  'inactivity_timeout_seconds',
  'warning_seconds',
  'critical_warning_seconds',
  'activity_throttle_seconds',
];

/**
 * 系统设置默认值（与 PRD §39 / §40 / §11，PRODUCT-DESIGN §5.9 一致）。
 *
 * - inactivity_timeout_seconds = 1800（30 分钟无操作回收）
 * - warning_seconds = 300（25 分钟即将释放提醒）
 * - critical_warning_seconds = 60（29 分钟临界弹窗）
 * - activity_throttle_seconds = 5（插件 Activity 上报节流，5~10 秒）
 * - extension_min_version = 1.0.0（低于此版本禁止领取，PRD R4）
 * - extension_latest_version = 1.3.0（悬浮窗超时参数改为后端下发，需新版本支持）
 */
export const DEFAULT_SYSTEM_SETTINGS: Record<SystemSettingKey, string> = {
  inactivity_timeout_seconds: '1800',
  warning_seconds: '300',
  critical_warning_seconds: '60',
  activity_throttle_seconds: '5',
  extension_min_version: '1.0.0',
  extension_latest_version: '1.3.0',
};
