import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { isPasswordAllowed, passwordPolicyMessage } from '@scienceing/shared/password-policy';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../../db/database.service';
import { AuditService } from '../../db/audit.service';
import { AUDIT_ACTION, AUDIT_RESULT } from '../../db/constants';
import { hashPassword, verifyPassword } from '../../crypto/password';
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

    // 首次成功登录（t14）：记录 first_login_at，随登录响应一并返回（含 mustChangePassword）。
    if (!row.first_login_at) {
      this.dbService.db.prepare('UPDATE users SET first_login_at = ? WHERE id = ?').run(now.toISOString(), row.id);
      row.first_login_at = now.toISOString();
    }

    this.audit.record({
      action: AUDIT_ACTION.LOGIN,
      result: AUDIT_RESULT.SUCCESS,
      userId: row.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { token, user: toAuthUser(row) };
  }

  /**
   * 用户本人修改自己的登录密码（t14：首次登录强制改密 / 个人改密共用入口）。
   * 登录态下校验当前密码 → 写入新密码 → 清除 must_change_password（首次登录改密成功后即放行全部业务）。
   * 成功后保留当前会话、撤销该用户的其它会话，防止旧密码建立的并行会话继续访问。
   */
  async changePassword(
    user: AuthUser,
    currentPassword: string,
    newPassword: string,
    currentSessionToken: string,
    meta: LoginMeta = {},
  ): Promise<AuthUser> {
    const row = this.dbService.db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as unknown as
      | UserRow
      | undefined;
    if (!row || row.enabled !== 1) {
      throw new UnauthorizedException('账号不可用');
    }

    const currentOk = await verifyPassword(currentPassword, row.password_hash);
    if (!currentOk) {
      this.audit.record({
        action: AUDIT_ACTION.PASSWORD_CHANGE,
        result: AUDIT_RESULT.FAILED,
        userId: row.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: 'wrong_current_password' },
      });
      throw new BadRequestException('当前密码不正确');
    }

    const pwd = newPassword ?? '';
    if (!isPasswordAllowed(pwd)) {
      throw new BadRequestException(passwordPolicyMessage('新密码'));
    }
    if (await verifyPassword(pwd, row.password_hash)) {
      throw new BadRequestException('新密码不能与当前密码相同');
    }

    const passwordHash = await hashPassword(pwd);
    const now = new Date().toISOString();
    const db = this.dbService.db;
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?')
        .run(passwordHash, now, row.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?')
        .run(row.id, sha256Hex(currentSessionToken));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    row.password_hash = passwordHash;
    row.must_change_password = 0;
    row.updated_at = now;

    this.audit.record({
      action: AUDIT_ACTION.PASSWORD_CHANGE,
      result: AUDIT_RESULT.SUCCESS,
      userId: row.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return toAuthUser(row);
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
