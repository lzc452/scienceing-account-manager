import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * 载荷版本：
 *  - 1（或缺省）= 历史格式，未绑定 AAD；
 *  - 2 = 以账号标识作 AAD 绑定（见 encryptSecret 的 aad 参数）。
 *
 * 保留版本号是为了**平滑升级**：v2 的认证标签把账号标识算进去了，
 * 存量 v1 密文在 v2 路径下解密必然失败。因此 decryptSecret 仍能读 v1，
 * 由 db:reencrypt-account-passwords 把存量密文「读旧 → 重加密」迁移到 v2。
 */
export const PAYLOAD_VERSION_LEGACY = 1;
export const PAYLOAD_VERSION_WITH_AAD = 2;

/**
 * AES-256-GCM 加密载荷（PRD §41：数据库只保存 ciphertext / iv / authTag）。
 */
export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  /** 载荷版本；缺省视为 1（历史格式）。 */
  v?: number;
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new Error(`AES-256-GCM 需要 ${KEY_BYTES} 字节 key，实际 ${key.length} 字节`);
  }
}

/**
 * 加密。
 *
 * @param aad 附加认证数据。账号密码必须传账号标识（如 `account:12`）：
 *   它不参与加密，但会被算进 GCM 认证标签，于是**密文与账号绑定**。
 *   没有它时，两个账号的密文可以互相搬运（把 A 的密文复制到 B 的行里，
 *   解密照样成功），数据库被改动也无法察觉。
 */
export function encryptSecret(plaintext: string, key: Buffer, aad?: string): EncryptedPayload {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  if (aad !== undefined) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ...(aad !== undefined ? { v: PAYLOAD_VERSION_WITH_AAD } : {}),
  };
}

/**
 * 解密。v2 载荷必须提供与加密时一致的 aad，否则认证失败（这是预期行为）。
 * v1 载荷按历史格式解密（无 AAD），以便迁移期间继续服务。
 */
export function decryptSecret(payload: EncryptedPayload, key: Buffer, aad?: string): string {
  assertKey(key);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

  if (payloadVersion(payload) >= PAYLOAD_VERSION_WITH_AAD) {
    if (aad === undefined) {
      throw new Error('该密文为 v2 格式（已绑定账号 AAD），解密时必须提供账号标识');
    }
    // setAAD 必须在 update 之前调用，否则 GCM 认证会失败
    decipher.setAAD(Buffer.from(aad, 'utf8'));
  }

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/** 载荷版本（缺省 = 1）。 */
export function payloadVersion(payload: EncryptedPayload): number {
  return payload.v ?? PAYLOAD_VERSION_LEGACY;
}

/** 是否为待迁移的历史格式（未绑定 AAD）。 */
export function needsAadMigration(payload: EncryptedPayload): boolean {
  return payloadVersion(payload) < PAYLOAD_VERSION_WITH_AAD;
}

/** 账号密码 AAD 的统一构造：集中在一处，避免各调用点拼法不一致导致解密失败。 */
export function accountAad(accountId: number): string {
  return `account:${accountId}`;
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
  const v = record['v'];
  return {
    ciphertext,
    iv,
    authTag,
    // v 必须原样带出：丢掉它会让 v2 密文被当成 v1 解密（AAD 不参与认证）
    ...(typeof v === 'number' ? { v } : {}),
  };
}
