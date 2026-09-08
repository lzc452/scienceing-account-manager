import type { INestApplication } from '@nestjs/common';
import type { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { encryptSecret, serializePayload } from '../crypto/secret-box';

export const TEST_EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
export const TEST_ACCOUNT_PASSWORD = 'managed-account-password';

export function extensionHeaders(version = '1.0.0'): Record<string, string> {
  return {
    Origin: `chrome-extension://${TEST_EXTENSION_ID}`,
    'X-Scienceing-Extension-Id': TEST_EXTENSION_ID,
    'X-Scienceing-Extension-Version': version,
  };
}

export async function issueExtensionProof(
  app: INestApplication,
  userToken: string,
  version = '1.0.0',
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/extension/claim-proof')
    .set('Authorization', `Bearer ${userToken}`)
    .set(extensionHeaders(version))
    .send({});
  if (response.status !== 201 || !response.body.proof) {
    throw new Error(`领取证明申请失败：HTTP ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.proof as string;
}

export async function claimAsExtension(app: INestApplication, userToken: string, version = '1.0.0') {
  const proof = await issueExtensionProof(app, userToken, version);
  return request(app.getHttpServer())
    .post('/api/leases')
    .set('Authorization', `Bearer ${userToken}`)
    .set(extensionHeaders(version))
    .send({ extensionProof: proof });
}

/** 按真实流程完成种子管理员首登改密，并返回仍有效的当前会话。 */
export async function completeSeedAdminFirstLogin(
  app: INestApplication,
  initialPassword: string,
  newPassword: string,
): Promise<string> {
  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: 'admin', password: initialPassword });
  if (login.status !== 200 || !login.body.token || login.body.user?.mustChangePassword !== true) {
    throw new Error(`种子管理员首次登录失败：HTTP ${login.status} ${JSON.stringify(login.body)}`);
  }
  const changed = await request(app.getHttpServer())
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ currentPassword: initialPassword, newPassword });
  if (changed.status !== 200 || changed.body.mustChangePassword !== false) {
    throw new Error(`种子管理员首次改密失败：HTTP ${changed.status} ${JSON.stringify(changed.body)}`);
  }
  return login.body.token as string;
}

/** seed 账号的占位密码不可领取；E2E 显式换成可解密的真实测试密码。 */
export function provisionSeedAccounts(db: DatabaseSync, masterKey: Buffer): void {
  const ciphertext = serializePayload(encryptSecret(TEST_ACCOUNT_PASSWORD, masterKey));
  db.prepare('UPDATE scienceing_accounts SET current_password_ciphertext = ?, last_password_changed_at = ?')
    .run(ciphertext, new Date().toISOString());
}
