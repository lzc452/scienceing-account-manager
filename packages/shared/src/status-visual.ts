import { AccountStatus, LeaseStatus } from './enums';

/**
 * 状态视觉语义映射表（PRODUCT-DESIGN §4.1，v1.1 已确认）。
 *
 * 设计边界：
 * - 语义色仅出现在「状态圆点 + 状态徽章」这一种元素上；
 *   按钮 / 卡片 / 导航 / 正文保持 DESIGN.md 无彩色规范。
 * - 文本标签是语义主通道（色盲安全、灰度滤镜可读），颜色是强化通道。
 * - 「使用中 = 蓝」定案（弃 PRD 示意图红色，避免与 ember 错误色冲突）。
 * - 「琥珀 = 回收中 / 插件警告」两类语义共用。
 * - ember 仅用于 ERROR / FAILED / 破坏性操作。
 */
export interface StatusVisual {
  /** 语义键 */
  key: string;
  /** 中文文本标签 */
  label: string;
  /** 圆点颜色 */
  dot: string;
  /** 徽章背景色（soft 变体） */
  badgeBg: string;
  /** 徽章文本色 */
  badgeText: string;
  /** 圆点是否空心 */
  hollow: boolean;
  /** 圆点是否旋转（回收中琥珀 ¾ 弧，2s/圈；reduced-motion 时静止） */
  spinning: boolean;
}

/**
 * 五类状态视觉语义（§4.1 表格）。
 */
export const STATUS_VISUALS: Record<string, StatusVisual> = {
  AVAILABLE: {
    key: 'AVAILABLE',
    label: '可用',
    dot: '#16a34a',
    badgeBg: '#f0fdf4',
    badgeText: '#15803d',
    hollow: false,
    spinning: false,
  },
  IN_USE: {
    key: 'IN_USE',
    label: '使用中',
    dot: '#2563eb',
    badgeBg: '#eff6ff',
    badgeText: '#1d4ed8',
    hollow: false,
    spinning: false,
  },
  RECYCLING: {
    key: 'RECYCLING',
    label: '回收中',
    dot: '#d97706',
    badgeBg: '#fffbeb',
    badgeText: '#b45309',
    hollow: true,
    spinning: true,
  },
  ERROR: {
    key: 'ERROR',
    label: '异常',
    dot: '#e7000b',
    badgeBg: '#fdecec',
    badgeText: '#e7000b',
    hollow: false,
    spinning: false,
  },
  RELEASED: {
    key: 'RELEASED',
    label: '已释放',
    dot: '#737373',
    badgeBg: 'transparent',
    badgeText: '#737373',
    hollow: true,
    spinning: false,
  },
};

/** Account 状态 → 视觉语义（§4.1） */
export const ACCOUNT_STATUS_VISUAL: Record<AccountStatus, StatusVisual> = {
  [AccountStatus.AVAILABLE]: STATUS_VISUALS.AVAILABLE!,
  [AccountStatus.IN_USE]: STATUS_VISUALS.IN_USE!,
  [AccountStatus.RECYCLING]: STATUS_VISUALS.RECYCLING!,
  [AccountStatus.ERROR]: STATUS_VISUALS.ERROR!,
};

/**
 * Lease 状态 → 视觉语义（§4.1）。
 *
 * Lease 与 Account 状态分离（PRD §24），但视觉语义复用同一套：
 *   ACTIVE → 使用中（蓝）；RELEASE_REQUESTED / RECYCLING → 回收中（琥珀）；
 *   RELEASED → 已释放（灰 outline）；FAILED → 异常（红）。
 */
export const LEASE_STATUS_VISUAL: Record<LeaseStatus, StatusVisual> = {
  [LeaseStatus.ACTIVE]: STATUS_VISUALS.IN_USE!,
  [LeaseStatus.RELEASE_REQUESTED]: STATUS_VISUALS.RECYCLING!,
  [LeaseStatus.RECYCLING]: STATUS_VISUALS.RECYCLING!,
  [LeaseStatus.RELEASED]: STATUS_VISUALS.RELEASED!,
  [LeaseStatus.FAILED]: STATUS_VISUALS.ERROR!,
};

export function accountStatusVisual(status: AccountStatus): StatusVisual {
  return ACCOUNT_STATUS_VISUAL[status];
}

export function leaseStatusVisual(status: LeaseStatus): StatusVisual {
  return LEASE_STATUS_VISUAL[status];
}
