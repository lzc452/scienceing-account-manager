import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { AuditService } from '../../db/audit.service';
import { AUDIT_ACTION, AUDIT_RESULT, USER_ROLE } from '../../db/constants';
import { hashPassword } from '../../crypto/password';
import { verifyVerifyToken, VERIFY_PURPOSE } from '../../crypto/verify-token';
import { nowIso } from '../../db/config';
import { toAuthUser, type AuthUser, type UserRow } from '../auth/auth.types';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

/** 登录密码长度约束（bcrypt 有效上限 72 字节，超出部分会被静默截断，故此处显式拒绝）。 */
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;

@Injectable()
export class UsersService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  list(): AuthUser[] {
    const rows = this.dbService.db.prepare('SELECT * FROM users ORDER BY id').all() as unknown as UserRow[];
    return rows.map(toAuthUser);
  }

  async create(dto: CreateUserDto, admin: AuthUser): Promise<AuthUser> {
    const username = (dto.username ?? '').trim();
    const displayName = (dto.displayName ?? '').trim();
    const department = dto.department ?? '';
    const role = dto.role ?? USER_ROLE.USER;
    const password = dto.password ?? '';

    if (!username || !displayName || !password) {
      throw new BadRequestException('username / displayName / password 必填');
    }
    if (role !== USER_ROLE.USER && role !== USER_ROLE.ADMIN) {
      throw new BadRequestException('role 必须是 USER 或 ADMIN');
    }

    const existing = this.dbService.db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      throw new ConflictException('用户名已存在');
    }

    const passwordHash = await hashPassword(password);
    const now = nowIso();
    const result = this.dbService.db
      .prepare(`
        INSERT INTO users (username, display_name, department, password_hash, role, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `)
      .run(username, displayName, department, passwordHash, role, now, now);
    const id = Number(result.lastInsertRowid);

    this.audit.record({
      action: AUDIT_ACTION.USER_CREATE,
      result: AUDIT_RESULT.SUCCESS,
      userId: admin.id,
      metadata: { targetUserId: id, targetUsername: username },
    });

    const row = this.dbService.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow;
    return toAuthUser(row);
  }

  /** 批量导入（CSV 二次确认后调用）：逐行校验入库，重复/非法行不阻断整体，返回逐行结果。 */
  async createMany(
    rows: CreateUserDto[],
    admin: AuthUser,
  ): Promise<{ created: number; failed: Array<{ username: string; reason: string }> }> {
    const failed: Array<{ username: string; reason: string }> = [];
    let created = 0;
    const seen = new Set<string>();

    for (const dto of rows) {
      const username = (dto.username ?? '').trim();
      try {
        if (!username || !(dto.displayName ?? '').trim() || !(dto.password ?? '')) {
          throw new BadRequestException('username / displayName / password 必填');
        }
        const role = dto.role ?? USER_ROLE.USER;
        if (role !== USER_ROLE.USER && role !== USER_ROLE.ADMIN) {
          throw new BadRequestException('role 必须是 USER 或 ADMIN');
        }
        // 同批次内查重 + 库内查重（username 列有 UNIQUE 约束，需先行判断以免整批失败）
        if (seen.has(username)) {
          throw new ConflictException('批内用户名重复');
        }
        if (this.dbService.db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
          throw new ConflictException('用户名已存在');
        }
        seen.add(username);

        const passwordHash = await hashPassword(dto.password ?? '');
        const now = nowIso();
        this.dbService.db
          .prepare(`
            INSERT INTO users (username, display_name, department, password_hash, role, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
          `)
          .run(username, (dto.displayName ?? '').trim(), dto.department ?? '', passwordHash, role, now, now);
        created += 1;
      } catch (err) {
        failed.push({
          username: username || '(空)',
          reason: err instanceof Error ? err.message : '未知错误',
        });
      }
    }

    if (created > 0 || failed.length > 0) {
      this.audit.record({
        action: AUDIT_ACTION.USER_BULK_CREATE,
        result: AUDIT_RESULT.SUCCESS,
        userId: admin.id,
        metadata: { created, failed: failed.length },
      });
    }

    return { created, failed };
  }

  async update(id: number, dto: UpdateUserDto, admin: AuthUser): Promise<AuthUser> {
    const existing = this.dbService.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined;
    if (!existing) {
      throw new NotFoundException('用户不存在');
    }

    // 不允许管理员禁用 / 降级自己（PRODUCT-DESIGN §5.6）
    if (existing.id === admin.id) {
      if (dto.role !== undefined && dto.role !== USER_ROLE.ADMIN) {
        throw new ForbiddenException('不允许降级自己');
      }
      if (dto.enabled === false) {
        throw new ForbiddenException('不允许禁用自己');
      }
    }

    // 堵住绕过：PATCH 直改密码会跳过「验证当前管理员密码」的安全步骤，
    // 一律要求走 POST /admin/users/:id/reset-password（携带 verifyToken）。
    if (dto.password !== undefined) {
      throw new BadRequestException('重置密码需先验证当前管理员密码，请使用「重置密码」操作');
    }

    const fields: string[] = [];
    const values: Array<string | number> = [];

    if (dto.displayName !== undefined) {
      fields.push('display_name = ?');
      values.push(dto.displayName);
    }
    if (dto.department !== undefined) {
      fields.push('department = ?');
      values.push(dto.department);
    }
    if (dto.role !== undefined) {
      if (dto.role !== USER_ROLE.USER && dto.role !== USER_ROLE.ADMIN) {
        throw new BadRequestException('role 必须是 USER 或 ADMIN');
      }
      fields.push('role = ?');
      values.push(dto.role);
    }
    if (dto.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(dto.enabled ? 1 : 0);
    }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(nowIso());
      this.dbService.db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
    }

    // 禁用 → 使该用户所有旧会话立即失效
    if (dto.enabled === false) {
      this.dbService.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }

    this.audit.record({
      action: AUDIT_ACTION.USER_UPDATE,
      result: AUDIT_RESULT.SUCCESS,
      userId: admin.id,
      metadata: { targetUserId: id },
    });

    const row = this.dbService.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow;
    return toAuthUser(row);
  }

  /**
   * 重置用户登录密码（需求：须先验证当前管理员密码）。
   * 调用方必须携带 POST /admin/verify-password 签发的 verifyToken（HMAC 短时票据，
   * 绑定管理员 id + purpose），校验通过才重置；重置后该用户所有旧会话立即失效。
   * 不开放重置自己的密码：管理员自己的口令走个人修改/ db:reset-admin 流程，避免「验证自己改自己」的闭环漏洞。
   */
  async resetUserPassword(
    id: number,
    dto: { newPassword?: string; verifyToken?: string },
    admin: AuthUser,
  ): Promise<AuthUser> {
    if (!dto.verifyToken || !verifyVerifyToken(dto.verifyToken, admin.id, VERIFY_PURPOSE.USER_PASSWORD_RESET)) {
      throw new UnauthorizedException('安全验证已失效，请重新验证当前管理员密码');
    }

    const existing = this.dbService.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined;
    if (!existing) {
      throw new NotFoundException('用户不存在');
    }
    if (existing.id === admin.id) {
      throw new ForbiddenException('不能通过「重置用户密码」修改自己的密码');
    }

    const newPassword = dto.newPassword ?? '';
    if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) {
      throw new BadRequestException(`新密码长度需在 ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} 个字符之间`);
    }

    const passwordHash = await hashPassword(newPassword);
    const now = nowIso();
    this.dbService.db
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(passwordHash, now, id);
    // 使该用户所有旧会话立即失效
    this.dbService.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);

    this.audit.record({
      action: AUDIT_ACTION.USER_PASSWORD_RESET,
      result: AUDIT_RESULT.SUCCESS,
      userId: admin.id,
      metadata: { targetUserId: id, targetUsername: existing.username },
    });

    const row = this.dbService.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow;
    return toAuthUser(row);
  }
}
