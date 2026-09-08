import { ConflictException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { DatabaseService } from '../../db/database.service';

const PROOF_TTL_MS = 30_000;
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;

export interface ExtensionIdentity {
  id: string;
  version: string;
}

function headerValue(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function hashProof(proof: string): string {
  return createHash('sha256').update(proof, 'utf8').digest('hex');
}

function extensionRequired(message = '未检测到可信的科应账号助手，请确认扩展已安装并刷新页面'): never {
  throw new ConflictException({ message, code: 'EXTENSION_REQUIRED' });
}

/**
 * 扩展领取证明：只有从 chrome-extension:// Origin 发出的请求才能申领短时一次性证明。
 * 看板页面不能自行设置浏览器管理的 Origin；领取接口消费证明后即作废，不能重放。
 *
 * 这是一条浏览器边界，不是对已控制客户端的硬件级远程证明。企业部署可通过
 * SCIENCEING_EXTENSION_IDS（逗号分隔）固定允许的扩展 ID，避免其它扩展代领。
 */
@Injectable()
export class ExtensionProofService {
  constructor(private readonly dbService: DatabaseService) {}

  requireIdentity(headers: IncomingHttpHeaders): ExtensionIdentity {
    const origin = headerValue(headers, 'origin').replace(/\/$/, '');
    const extensionId = headerValue(headers, 'x-scienceing-extension-id').trim();
    const version = headerValue(headers, 'x-scienceing-extension-version').trim();

    let originId = '';
    try {
      const parsed = new URL(origin);
      if (
        parsed.protocol === 'chrome-extension:'
        && !parsed.port
        && !parsed.username
        && !parsed.password
        && !parsed.pathname
        && !parsed.search
        && !parsed.hash
      ) {
        originId = parsed.hostname;
      }
    } catch {
      extensionRequired();
    }

    if (!EXTENSION_ID_PATTERN.test(originId) || extensionId !== originId || !version) {
      extensionRequired();
    }

    const allowedIds = (process.env.SCIENCEING_EXTENSION_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (allowedIds.length > 0 && !allowedIds.includes(extensionId)) {
      extensionRequired('当前科应账号助手未获此服务授权');
    }

    return { id: extensionId, version };
  }

  issue(userId: number, identity: ExtensionIdentity): { proof: string; expiresAt: string } {
    const proof = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PROOF_TTL_MS);
    const db = this.dbService.db;

    db.prepare('DELETE FROM extension_claim_proofs WHERE expires_at <= ? OR consumed_at IS NOT NULL').run(now.toISOString());
    db.prepare(
      `INSERT INTO extension_claim_proofs
        (token_hash, user_id, extension_id, extension_version, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(hashProof(proof), userId, identity.id, identity.version, now.toISOString(), expiresAt.toISOString());

    return { proof, expiresAt: expiresAt.toISOString() };
  }

  consume(userId: number, proof: string | undefined, identity: ExtensionIdentity): string {
    if (!proof) {
      throw new ConflictException({ message: '扩展领取证明缺失，请刷新页面后重试', code: 'EXTENSION_PROOF_INVALID' });
    }

    const now = new Date().toISOString();
    const result = this.dbService.db
      .prepare(
        `UPDATE extension_claim_proofs
         SET consumed_at = ?
         WHERE token_hash = ? AND user_id = ? AND extension_id = ? AND extension_version = ?
           AND consumed_at IS NULL AND expires_at > ?`,
      )
      .run(now, hashProof(proof), userId, identity.id, identity.version, now);

    if (Number(result.changes) !== 1) {
      throw new ConflictException({ message: '扩展领取证明无效或已过期，请重试', code: 'EXTENSION_PROOF_INVALID' });
    }
    return identity.version;
  }
}
