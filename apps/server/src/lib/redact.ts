/**
 * 敏感信息脱敏（PRD §42：凭据绝不进日志 / 绝不入库）。
 *
 * 用于所有「把外部文本写进持久化介质」的位置：reset_jobs.error_message、
 * audit_logs.metadata、以及子进程 stdout/stderr 的转述。
 *
 * 两道防线：
 *  1. 显式机密值精确替换（调用方知道本次用到的口令时传进来，命中率最高）；
 *  2. 常见键名模式匹配（password / newPassword / token / secret 等）。
 *
 * 注意：这是兜底，不是许可——正确的做法是敏感值根本不进入这些文本。
 */

/** 键名模式：`--password xxx`、`"newPassword": "xxx"`、`password=xxx` 等。 */
const KEY_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // 命令行形式：--password secret / --password=secret（--password-stdin 无值，不受影响）
  [/(--password(?:=|\s+))(?:"[^"]*"|'[^']*'|\S+)/gi, '$1<redacted>'],
  // Authorization 头：键名是 Authorization 而非 token，需单独匹配
  [/(authorization\s*[:=]\s*bearer\s+)(\S+)/gi, '$1<redacted>'],
  // JSON / kv 形式："newPassword": "xxx" 或 password=xxx
  [
    /(["']?(?:new[_-]?password|password|passwd|pwd|secret|api[_-]?key|access[_-]?token)["']?\s*[:=]\s*)(["'])([^"']*)\2/gi,
    '$1$2<redacted>$2',
  ],
  [
    /(["']?(?:new[_-]?password|password|passwd|pwd|secret|api[_-]?key|access[_-]?token)["']?\s*[:=]\s*)([^\s"',}]+)/gi,
    '$1<redacted>',
  ],
];

/** 脱敏占位符。 */
export const REDACTED = '<redacted>';

/**
 * 对文本脱敏。
 *
 * @param text 待处理的原始文本
 * @param extraSecrets 本次已知的机密明文（如刚生成的新口令）；长度 < 4 的短串不处理，
 *                     避免把常见短词误伤成占位符
 */
export function redactSecrets(text: string, extraSecrets: readonly string[] = []): string {
  if (!text) return text;
  let out = text;

  for (const secret of extraSecrets) {
    if (!secret || secret.length < 4) continue;
    out = out.split(secret).join(REDACTED);
  }

  for (const [pattern, replacement] of KEY_PATTERNS) {
    out = out.replace(pattern, replacement);
  }

  return out;
}
