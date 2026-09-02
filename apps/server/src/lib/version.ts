/**
 * 语义化版本比较（与 apps/extension/src/lib/version.js 等价，PRD §11 版本检测）。
 *
 * 按点号拆分、逐段数值比较（1.10.0 > 1.2.0）；缺失段视为 0；
 * 忽略前导 "v" 与 `-` 之后的预发布后缀（本平台版本均为 X.Y.Z）。
 */

export function normalizeVersion(value: string): string {
  const base = String(value ?? '')
    .trim()
    .replace(/^v/i, '');
  return base.split('-')[0] ?? '';
}

function segment(parts: number[], index: number): number {
  const value = parts[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** 比较 a、b 两个版本：a<b 返回 -1，相等返回 0，a>b 返回 1。 */
export function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a).split('.').map(Number);
  const pb = normalizeVersion(b).split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = segment(pa, i);
    const y = segment(pb, i);
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/** 版本是否满足最低要求（>= minimum）。 */
export function isVersionAtLeast(version: string, minimum: string): boolean {
  return compareVersions(version, minimum) >= 0;
}
