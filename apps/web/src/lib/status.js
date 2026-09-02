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
 * 后端约定：AVAILABLE/IN_USE/RECYCLING/ERROR、ACTIVE→in_use、RELEASED→released 等。
 */
export function toStatusKind(raw) {
  const v = (raw ?? '').toUpperCase()
  if (v === 'AVAILABLE') return 'available'
  if (v === 'IN_USE' || v === 'ACTIVE') return 'in_use'
  if (v === 'RECYCLING' || v === 'RELEASE_REQUESTED' || v === 'TIMEOUT') return 'recycling'
  if (v === 'ERROR' || v === 'FAILED' || v === 'RESET_ERROR') return 'error'
  return 'released'
}
