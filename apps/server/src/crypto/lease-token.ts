import { createHash, randomBytes } from 'node:crypto';

/** 生成高强度随机 lease token（PRD §43），base64url 无 padding。 */
export function generateLeaseToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 数据库只保存 SHA-256(leaseToken)（PRD §43），类似 API Token 管理。 */
export function hashLeaseToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
