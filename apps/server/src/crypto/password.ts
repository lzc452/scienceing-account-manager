import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

/**
 * 恒定时间比较用的 dummy hash。
 * 登录时若用户不存在，仍以该 hash 执行一次 bcrypt.compare，消除
 * 「用户存在 vs 不存在」的时序侧信道，防止账号枚举（PRODUCT-DESIGN §5.2）。
 */
export const DUMMY_HASH = '$2b$10$4UVtaAD19ZJnMr1vhKoNBuLTiZ2dq8S3smQi.FDRBRO3q8LJ6zR4K';

/**
 * 员工看板登录密码：仅保存 bcrypt hash，绝不保存明文（PRD §41 / §5.1）。
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
