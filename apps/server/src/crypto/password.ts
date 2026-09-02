import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

/**
 * 员工看板登录密码：仅保存 bcrypt hash，绝不保存明文（PRD §41 / §5.1）。
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
