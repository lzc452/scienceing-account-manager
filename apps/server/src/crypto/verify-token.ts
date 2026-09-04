import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadMasterKey } from './master-key';

/**
 * 管理员「敏感操作前自证密码」的 HMAC 短时票据（无状态，不落库）。
 *
 * 动机（需求：重置用户密码前须先验证当前管理员密码）：验证通过后若直接放行，
 * 第二步提交与验证之间没有关联，任意带管理员会话的请求仍可绕过验证直接重置。
 * 本模块给验证结果签发一份绑定 { 管理员 id + 用途 } 的短时效签名票据，
 * 后续敏感操作必须携带票据，后端校验签名与过期后才执行。
 *
 * 安全属性：
 *  - 签名 key 来自 master key（HMAC-SHA256），不可伪造；
 *  - 绑定 userId 与 purpose：A 管理员验证的票据不能由 B 管理员使用，也不能复用于其他操作；
 *  - 5 分钟短时效，过期即拒；
 *  - 无服务端状态：进程重启 / 多实例下依然有效（代价是票据在有效期内可重放，
 *    但使用者本身已具备完整管理员会话，重放不提升其权限）。
 */

const TTL_MS = 5 * 60 * 1000;

/** 票据用途白名单。新用途在此登记，sign/verify 共用同一字符串防止错配。 */
export const VERIFY_PURPOSE = {
  /** 重置普通用户登录密码前，管理员自证当前密码 */
  USER_PASSWORD_RESET: 'user-password-reset',
} as const;

export interface VerifyTokenResult {
  token: string;
  expiresAt: string;
}

function sign(body: string, key: Buffer): Buffer {
  return createHmac('sha256', key).update(body).digest();
}

/** 签发票据：payload 形如 `<purpose>:<userId>:<expMs>`，签名以 '.' 拼接在后。 */
export function signVerifyToken(
  userId: number,
  purpose: string = VERIFY_PURPOSE.USER_PASSWORD_RESET,
): VerifyTokenResult {
  const exp = Date.now() + TTL_MS;
  const body = `${purpose}:${userId}:${exp}`;
  const sig = sign(body, loadMasterKey()).toString('base64url');
  return { token: `${body}.${sig}`, expiresAt: new Date(exp).toISOString() };
}

/** 校验票据：格式 / purpose / userId 绑定 / 过期 / 签名（恒定时间比较）。任一不满足即拒绝。 */
export function verifyVerifyToken(
  token: string | null | undefined,
  userId: number,
  purpose: string = VERIFY_PURPOSE.USER_PASSWORD_RESET,
): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const parts = body.split(':');
  if (parts.length !== 3) return false;
  const [p, uid, expStr] = parts;
  if (p !== purpose) return false;
  if (uid !== String(userId)) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;

  const expected = sign(body, loadMasterKey());
  let actual: Buffer;
  try {
    actual = Buffer.from(sig, 'base64url');
  } catch {
    return false;
  }
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
