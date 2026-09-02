import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { AuditService } from '../../db/audit.service';
import { AUDIT_ACTION, AUDIT_RESULT, USER_ROLE } from '../../db/constants';
import { hashPassword } from '../../crypto/password';
import { nowIso } from '../../db/config';
import { toAuthUser, type AuthUser, type UserRow } from '../auth/auth.types';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

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

    const fields: string[] = [];
    const values: Array<string | number> = [];
    let passwordChanged = false;

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
    if (dto.password !== undefined && dto.password !== '') {
      fields.push('password_hash = ?');
      values.push(await hashPassword(dto.password));
      passwordChanged = true;
    }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(nowIso());
      this.dbService.db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
    }

    // 重置密码或禁用 → 使该用户所有旧会话立即失效
    if (passwordChanged || dto.enabled === false) {
      this.dbService.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }

    this.audit.record({
      action: passwordChanged ? AUDIT_ACTION.USER_PASSWORD_RESET : AUDIT_ACTION.USER_UPDATE,
      result: AUDIT_RESULT.SUCCESS,
      userId: admin.id,
      metadata: { targetUserId: id, passwordChanged },
    });

    const row = this.dbService.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow;
    return toAuthUser(row);
  }
}
