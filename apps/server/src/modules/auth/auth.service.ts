import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../../db/database.service';
import { AuditService } from '../../db/audit.service';
import { AUDIT_ACTION, AUDIT_RESULT } from '../../db/constants';
import { verifyPassword } from '../../crypto/password';
import { SESSION_TTL_MS, type AuthUser, type LoginResult, toAuthUser, type UserRow } from './auth.types';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export interface LoginMeta {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async login(username: string, password: string, meta: LoginMeta = {}): Promise<LoginResult> {
    const row = this.dbService.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as unknown as
      | UserRow
      | undefined;

    // 统一错误：不区分「用户不存在」与「密码错误」，避免账号枚举（PRODUCT-DESIGN §5.2）
    if (!row) {
      this.audit.record({
        action: AUDIT_ACTION.LOGIN,
        result: AUDIT_RESULT.FAILED,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: 'user_not_found' },
      });
      throw new UnauthorizedException('用户名或密码错误');
    }

    const passwordOk = await verifyPassword(password, row.password_hash);
    if (!passwordOk) {
      this.audit.record({
        action: AUDIT_ACTION.LOGIN,
        result: AUDIT_RESULT.FAILED,
        userId: row.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: 'wrong_password' },
      });
      throw new UnauthorizedException('用户名或密码错误');
    }

    if (row.enabled !== 1) {
      throw new ForbiddenException('账号已禁用');
    }

    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    this.dbService.db
      .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(sha256Hex(token), row.id, now.toISOString(), expiresAt.toISOString());

    this.audit.record({
      action: AUDIT_ACTION.LOGIN,
      result: AUDIT_RESULT.SUCCESS,
      userId: row.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { token, user: toAuthUser(row) };
  }

  logout(token: string, user: AuthUser, meta: LoginMeta = {}): void {
    this.dbService.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256Hex(token));
    this.audit.record({
      action: AUDIT_ACTION.LOGOUT,
      result: AUDIT_RESULT.SUCCESS,
      userId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  /** 依据 token 解析用户；会话不存在 / 过期 / 用户被禁用均返回 null。 */
  resolveUserByToken(token: string): AuthUser | null {
    const row = this.dbService.db
      .prepare(
        `SELECT u.*, s.expires_at AS session_expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`,
      )
      .get(sha256Hex(token)) as unknown as (UserRow & { session_expires_at: string }) | undefined;

    if (!row) return null;
    if (new Date(row.session_expires_at).getTime() <= Date.now()) return null;
    if (row.enabled !== 1) return null;
    return toAuthUser(row);
  }
}
