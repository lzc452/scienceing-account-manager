/**
 * 纯函数版本比较（无浏览器依赖，可被 node:test 直接导入）。
 *
 * 语义：按点号拆分、逐段数值比较（1.10.0 > 1.2.0），缺失段视为 0，
 * 忽略前导 "v" 与 `-` 之后的预发布后缀（本平台版本均为 X.Y.Z）。
 */

/** 归一化版本号：去前导 v、去预发布后缀、去空白。 */
export function normalizeVersion(value) {
  return String(value ?? '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0];
}

/** 比较 a、b 两个版本：a<b 返回 -1，相等返回 0，a>b 返回 1。 */
export function compareVersions(a, b) {
  const pa = normalizeVersion(a).split('.').map(Number);
  const pb = normalizeVersion(b).split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/** 版本是否满足最低要求（>= minimum）。 */
export function isVersionAtLeast(version, minimum) {
  return compareVersions(version, minimum) >= 0;
}
