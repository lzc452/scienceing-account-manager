/**
 * 状态语义元数据（PRODUCT-DESIGN §4.1）。
 *
 * 语义色唯一合法边界：状态圆点 / 状态徽章。
 * 圆点颜色 = 主题令牌；soft 徽章使用「色 50 级底 + 色 700 级文本」。
 */
export const STATUS_META = {
  available: {
    label: '可用',
    dot: '#16a34a',
    softBg: '#f0fdf4',
    softText: '#15803d',
  },
  in_use: {
    label: '使用中',
    dot: '#2563eb',
    softBg: '#eff6ff',
    softText: '#1d4ed8',
  },
  // DIRTY（回收隔离态）：等扩展确认已清空本机会话，通常几秒。
  // 与「回收中」同色但**不旋转**——旋转代表服务端正在跑改密任务，两者含义不同。
  dirty: {
    label: '清理中',
    dot: '#d97706',
    softBg: '#fffbeb',
    softText: '#b45309',
    hollow: true,
  },
  recycling: {
    label: '回收中',
    dot: '#d97706',
    softBg: '#fffbeb',
    softText: '#b45309',
    hollow: true,
    spin: true,
  },
  error: {
    label: '异常',
    dot: '#e7000b',
    softBg: '#fdecec',
    softText: '#e7000b',
  },
  released: {
    label: '已释放',
    dot: '#737373',
    softBg: 'transparent',
    softText: '#737373',
    hollow: true,
  },
}

/**
 * 将任意后端状态字符串（Account / Lease）归一为 StatusKind。
 * 后端约定：AVAILABLE/IN_USE/DIRTY/RECYCLING/ERROR、ACTIVE→in_use、RELEASED→released 等。
 *
 * 注意 DIRTY 必须显式匹配：漏掉会落到最后的 'released'，
 * 首页就会把「正在清理、暂不可领」的账号显示成「已释放」，诱导用户去点领取。
 */
export function toStatusKind(raw) {
  const v = (raw ?? '').toUpperCase()
  if (v === 'AVAILABLE') return 'available'
  if (v === 'IN_USE' || v === 'ACTIVE') return 'in_use'
  if (v === 'DIRTY') return 'dirty'
  if (v === 'RECYCLING' || v === 'RELEASE_REQUESTED' || v === 'TIMEOUT') return 'recycling'
  if (v === 'ERROR' || v === 'FAILED' || v === 'RESET_ERROR') return 'error'
  return 'released'
}
