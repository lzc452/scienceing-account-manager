import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * AES-256-GCM 加密载荷（PRD §41：数据库只保存 ciphertext / iv / authTag）。
 */
export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new Error(`AES-256-GCM 需要 ${KEY_BYTES} 字节 key，实际 ${key.length} 字节`);
  }
}

export function encryptSecret(plaintext: string, key: Buffer): EncryptedPayload {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptSecret(payload: EncryptedPayload, key: Buffer): string {
  assertKey(key);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/**
 * 将加密载荷序列化为可存入 DB 单列的 JSON 字符串（ciphertext/iv/authTag 一并落库）。
 * 对应 scienceing_accounts.current_password_ciphertext / pending_password_ciphertext 列。
 */
export function serializePayload(payload: EncryptedPayload): string {
  return JSON.stringify(payload);
}

export function parsePayload(json: string): EncryptedPayload {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('无效的加密载荷：不是对象');
  }
  const record = parsed as Record<string, unknown>;
  const ciphertext = record['ciphertext'];
  const iv = record['iv'];
  const authTag = record['authTag'];
  if (typeof ciphertext !== 'string' || typeof iv !== 'string' || typeof authTag !== 'string') {
    throw new Error('无效的加密载荷：缺少 ciphertext/iv/authTag');
  }
  return { ciphertext, iv, authTag };
}
