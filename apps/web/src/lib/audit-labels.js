/**
 * 审计动作中文名（与后端 AUDIT_ACTION_LABEL 一致）。
 * 系统日志页展示/筛选用；后端 /admin/logs 已下发 actionLabel 时优先用后端值，
 * 此处作为筛选 options 与兜底（旧缓存/mock 缺字段时）。
 */
export const ACTION_LABELS = {
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
}

/** 取动作中文名：后端 actionLabel 优先，本地表兜底，未知动作显示英文原文。 */
export function actionLabelOf(action, fallback) {
  return fallback || ACTION_LABELS[action] || action
}
