import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { isPasswordAllowed, passwordPolicyMessage } from '@scienceing/shared/password-policy';
import { DatabaseService } from '../../db/database.service';
import { AuditService } from '../../db/audit.service';
import { AUDIT_ACTION, AUDIT_RESULT, USER_ROLE } from '../../db/constants';
import { hashPassword } from '../../crypto/password';
import { verifyVerifyToken, VERIFY_PURPOSE } from '../../crypto/verify-token';
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

  /**
   * 用户列表（分页 + 关键词过滤）。返回结构与 `/admin/leases`、`/admin/logs` 一致：
   * `{ items, total, page, pageSize }`。
   *
   * 为什么要分页：账号池可达数百条（实测 450），一次性全量返回会让前端渲染卡顿、
   * 响应体过大，且表格无法定位。pageSize 上限 100，防止前端传超大值绕过。
   *
   * keyword 同时匹配用户名 / 姓名 / 部门；`%` `_` `\` 做转义，避免用户输入被当成通配符。
   */
  list(query: { page?: number; pageSize?: number; keyword?: string } = {}): {
    items: AuthUser[];
    total: number;
    page: number;
    pageSize: number;
  } {
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(query.pageSize ?? 20)));
    const keyword = (query.keyword ?? '').trim();

    let where = '';
    const params: Array<string | number> = [];
    if (keyword) {
      // ESCAPE '\' 让用户输入的 % 和 _ 按字面量处理
      const like = `%${keyword.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      where = "WHERE username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\' OR department LIKE ? ESCAPE '\\'";
      params.push(like, like, like);
    }

    const total = this.dbService.db
      .prepare(`SELECT COUNT(*) AS c FROM users ${where}`)
      .get(...params) as unknown as { c: number };

    const rows = this.dbService.db
      .prepare(`SELECT * FROM users ${where} ORDER BY id LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize) as unknown as UserRow[];

    return { items: rows.map(toAuthUser), total: total.c, page, pageSize };
  }

  /**
   * 删除用户（仅允许删除「干净用户」）。
   *
   * 约束按顺序校验，命中即拒绝：
   *   1. 用户不存在 → 404
   *   2. 删除自己 → 400（否则当前管理会话失去主体，无从恢复）
   *   3. 删除系统最后一个管理员 → 400（防止系统再无管理入口）
   *   4. 存在租约记录 → 409（用户是操作主体，物理删除会破坏审计链）
   *   5. 存在审计记录 → 409（同上）
   *
   * 设计取舍：不做级联删除。`leases` / `audit_logs` 都是 `REFERENCES users(id)` 且无
   * ON DELETE 子句，硬删要么违反外键、要么得先删历史记录——那等于销毁审计证据。
   * 因此「有历史」一律提示改用停用（enabled=0），只允许清理「创建后从未使用」的用户，
   * 这正好覆盖批量导入纠错的场景。
   */
  async deleteUser(id: number, admin: AuthUser): Promise<{ id: number }> {
    const db = this.dbService.db;

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined;
    if (!row) throw new NotFoundException('用户不存在');

    if (row.id === admin.id) {
      throw new BadRequestException('不能删除当前登录的管理员账号');
    }
    if (row.role === USER_ROLE.ADMIN) {
      const admins = db.prepare('SELECT COUNT(*) AS c FROM users WHERE role = ?').get(USER_ROLE.ADMIN) as unknown as {
        c: number;
      };
      if (admins.c <= 1) throw new BadRequestException('系统至少要保留一个管理员账号');
    }
    if (db.prepare('SELECT 1 FROM leases WHERE user_id = ? LIMIT 1').get(id)) {
      throw new ConflictException({
        code: 'USER_HAS_HISTORY',
        message: '该用户已有租用记录，不能删除；请改为停用以保留审计链',
      });
    }
    if (db.prepare('SELECT 1 FROM audit_logs WHERE user_id = ? LIMIT 1').get(id)) {
      throw new ConflictException({
        code: 'USER_HAS_HISTORY',
        message: '该用户已有操作记录，不能删除；请改为停用以保留审计链',
      });
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      // sessions.user_id 是 NOT NULL 外键，必须先清会话再删用户
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* 已回滚 */
      }
      throw err;
    }

    // 用户行已删除，audit_logs.user_id 若再引用会违反外键，故不传 targetUserId 之外的引用，
    // 原 ID/用户名保留在 metadata 中供追溯。
    this.audit.record({
      action: AUDIT_ACTION.USER_DELETE,
      result: AUDIT_RESULT.SUCCESS,
      userId: admin.id,
      metadata: { targetUserId: id, targetUsername: row.username, targetDisplayName: row.display_name },
    });

    return { id };
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
    if (!isPasswordAllowed(password)) {
      throw new BadRequestException(passwordPolicyMessage());
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
    // 初始密码由管理员代为设置（t14）：置 must_change_password=1，用户首次登录须先修改。
    const result = this.dbService.db
      .prepare(`
        INSERT INTO users (username, display_name, department, password_hash, role, enabled, must_change_password, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)
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
        if (!isPasswordAllowed(dto.password)) {
          throw new BadRequestException(passwordPolicyMessage());
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
        // 导入的初始密码同样为首登强制改（t14）
        this.dbService.db
          .prepare(`
            INSERT INTO users (username, display_name, department, password_hash, role, enabled, must_change_password, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)
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
    if (!isPasswordAllowed(newPassword)) {
      throw new BadRequestException(passwordPolicyMessage('新密码'));
    }

    const passwordHash = await hashPassword(newPassword);
    const now = nowIso();
    // 管理员重置的临时密码（t14）：置 must_change_password=1，用户下次登录须先修改。
    this.dbService.db
      .prepare('UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?')
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
