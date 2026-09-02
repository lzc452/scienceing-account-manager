import { randomInt } from 'node:crypto';

/**
 * 科应共享账号的「系统生成密码」策略（集中定义，唯一来源）。
 *
 * 背景：管理员在账号池 / 账号管理页点「重置密码」后，系统生成新密码并加密暂存（Phase 1），
 * 由 Playwright Worker 以「指定密码」方式填入真实科应后台完成静默改密。生成规则此前在
 * reset.service（×2）与 admin.service（×1）三处重复且都依赖 randomBytes().base64url ——
 * 不保证满足复杂度（大小写/数字/符号齐全）。现收敛到本模块，一处定义、处处生效。
 *
 * 规则（R-2026-09-02 与真实科应联调定稿，真实页面 placeholder「请输入指定密码」，已用小写+数字+@
 * 实测通过；为确保强度与避免歧义，默认采用「必须含大小写+数字+符号、排除相似字符」）：
 *   1) 长度固定 16；
 *   2) 必须至少包含 1 个大写字母、1 个小写字母、1 个数字、1 个符号；
 *   3) 排除易混淆字符（0/O/1/I/l），便于人工抄录与口头传达；
 *   4) 生成后做 Fisher-Yates 洗牌，避免「先保证类型再补随机」带来的可预测前缀。
 *
 * 若科应平台后续暴露更严格的密码策略（如不允许某类符号 / 要求更短），只需调整下方常量。
 * 生成密码由系统解密下发（领取后展示/复制），不要求用户记忆，故 16 位长密码无可用性负担。
 */

export const ACCOUNT_PASSWORD_LENGTH = 16;

/** 各类字符池（已剔除易混淆字符）。 */
const UPPERCASE = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // 去掉 I、O
const LOWERCASE = 'abcdefghjkmnpqrstuvwxyz'; // 去掉 i、l、o
const DIGITS = '23456789'; // 去掉 0、1
const SYMBOLS = '!@#$%^&*-_=+?';
const ALL = UPPERCASE + LOWERCASE + DIGITS + SYMBOLS;

/** 洗牌（Fisher-Yates），消除「先逐类取 1 再补齐」的顺序痕迹。 */
function shuffle(chars: string[]): string {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = chars[i] as string;
    chars[i] = chars[j] as string;
    chars[j] = tmp;
  }
  return chars.join('');
}

/** 从给定字符池取一个随机字符。 */
function pick(chars: string): string {
  return chars.charAt(randomInt(chars.length));
}

/**
 * 生成一个符合策略的科应账号密码。
 * 保证：长度 = ACCOUNT_PASSWORD_LENGTH 且大小写字母/数字/符号各至少出现 1 次。
 */
export function generateAccountPassword(): string {
  // 1) 每类至少 1 个，保证复杂度下限
  const parts = [pick(UPPERCASE), pick(LOWERCASE), pick(DIGITS), pick(SYMBOLS)];
  // 2) 补齐到目标长度
  for (let i = parts.length; i < ACCOUNT_PASSWORD_LENGTH; i++) {
    parts.push(pick(ALL));
  }
  // 3) 洗牌消除顺序痕迹
  return shuffle(parts);
}

/** 校验一个密码是否符合本策略（自检/测试用）。 */
export function isValidAccountPassword(password: string): boolean {
  if (typeof password !== 'string' || password.length !== ACCOUNT_PASSWORD_LENGTH) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[!@#$%^&*\-_=+?]/.test(password)) return false;
  if (/[0O1Il]/.test(password)) return false; // 不应出现易混淆字符
  return true;
}
