/**
 * 归还时的「本机会话清理」判定（纯函数，便于单测）。
 *
 * 背景（已实测的结论，不要在实现里推翻）：
 *  - 科应的登录态是 `localStorage.Authorization`（RSA 签名 JWT，14 天），不在 Cookie 里；
 *  - 改密、真实退出登录、单点互踢**都不会吊销已签发的令牌**，服务端没有任何 kill switch；
 *  - 因此「让那台机器停下来」的唯一手段就是**把它本地的令牌删掉**。
 *
 * 所以这个模块只回答一个问题：这条租约的收尾需不需要清理本机会话。
 */

/** 与后端 DEFAULT_SYSTEM_SETTINGS.purge_gate_min_version 保持一致。 */
export const PURGE_GATE_VERSION = '1.5.0';

/**
 * 是否需要清理本机会话。
 *
 * 三个条件缺一不可：
 *  1. 租约已经不在使用中（`ACTIVE` 之外的 `RECYCLING`）；
 *  2. 服务端明确要求走清理链路（`recycleMode === 'PURGE'`）；
 *  3. 不是「已释放」这种终态（那时账号早已回到池子，再清也来不及，还可能误伤下一个用户）。
 *
 * 注意第 3 点：`RELEASED` 意味着服务端已经收尾（可能已经改密），此时页面若还开着，
 * 清掉本地存储仍然有意义，但**不能**再发回执——那会把一条已归档的租约重新拉回流程。
 */
export function needsSessionPurge(status) {
  if (!status || typeof status !== 'object') return false;
  if (status.status !== 'RECYCLING') return false;
  return status.recycleMode === 'PURGE';
}

/**
 * 组装回执的 detail 文本。
 *
 * 服务端会截断到 500 字符，这里主动截断并压成单行：detail 会进数据库与审计，
 * 多行文本在日志里几乎不可读。
 */
export function buildPurgeDetail(parts, limit = 400) {
  const text = (Array.isArray(parts) ? parts : [parts])
    .filter((item) => item !== null && item !== undefined && item !== '')
    .map((item) => String(item))
    .join(' | ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
