import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { AuditService } from '../../db/audit.service';
import { AUDIT_ACTION, AUDIT_RESULT } from '../../db/constants';
import { AuthGuard } from '../../guards/auth.guard';
import { AdminGuard } from '../../guards/admin.guard';
import { CurrentUser } from '../../guards/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';

/**
 * 设置项白名单与校验规则。
 *
 * 之前是「逐键 upsert 任意字符串」：管理员（或写错的请求）可以把
 * `password_max_age_days` 写成负数、把 `recycle_mode` 写成 `FOO`，
 * 而回收逻辑会静默按非法值运行 —— 这类错误只能靠事后看行为异常才发现。
 * 现在：未知键直接 400，越界/非法值 400，且整批写入放在一个事务里。
 */
type SettingRule =
  | { kind: 'int'; min: number; max: number }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'semver' };

const SETTING_RULES: Record<string, SettingRule> = {
  // 租约规则（小时）
  inactivity_timeout_hours: { kind: 'int', min: 1, max: 168 },
  warning_hours: { kind: 'int', min: 1, max: 168 },
  critical_warning_hours: { kind: 'int', min: 1, max: 168 },
  // Activity 上报节流（扩展侧会再夹紧到 5~10，这里保持一致）
  activity_throttle_seconds: { kind: 'int', min: 5, max: 10 },
  // 回收链路
  purge_ack_timeout_seconds: { kind: 'int', min: 30, max: 600 },
  password_max_age_days: { kind: 'int', min: 0, max: 365 },
  password_rotation_min_interval_hours: { kind: 'int', min: 0, max: 720 },
  recycle_mode: { kind: 'enum', values: ['PURGE', 'ROTATE'] },
  // 扩展版本门槛
  extension_min_version: { kind: 'semver' },
  extension_latest_version: { kind: 'semver' },
  purge_gate_min_version: { kind: 'semver' },
};

const SEMVER = /^\d+\.\d+\.\d+$/;

function normalizeSetting(key: string, raw: unknown): string {
  const rule = SETTING_RULES[key];
  if (!rule) throw new BadRequestException(`未知设置项：${key}`);
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new BadRequestException(`设置项 ${key} 必须是字符串或数字`);
  }
  const value = String(raw).trim();
  if (value === '') throw new BadRequestException(`设置项 ${key} 不能为空`);

  if (rule.kind === 'semver') {
    if (!SEMVER.test(value)) throw new BadRequestException(`设置项 ${key} 必须是 x.y.z 形式的版本号`);
    return value;
  }
  if (rule.kind === 'enum') {
    if (!rule.values.includes(value)) {
      throw new BadRequestException(`设置项 ${key} 只允许：${rule.values.join(' / ')}`);
    }
    return value;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < rule.min || parsed > rule.max) {
    throw new BadRequestException(`设置项 ${key} 必须是 ${rule.min}~${rule.max} 之间的整数`);
  }
  return String(parsed);
}

@Controller('admin/settings')
@UseGuards(AuthGuard, AdminGuard)
export class SettingsController {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(): Record<string, string> {
    return this.readSettings();
  }

  @Post()
  update(@Body() dto: Record<string, string>, @CurrentUser() admin: AuthUser): Record<string, string> {
    const entries = Object.entries(dto ?? {}).filter(([, value]) => value !== undefined && value !== null);
    if (entries.length === 0) throw new BadRequestException('没有可更新的设置项');

    // 先全量校验再写库：避免"前几个键写成功、后面报错"留下半套配置
    const normalized = entries.map(([key, value]) => [key, normalizeSetting(key, value)] as const);

    // 临界提醒必须早于普通提醒，否则面板的黄/红环永远不会按预期出现
    const merged = { ...this.readSettings(), ...Object.fromEntries(normalized) };
    const warning = Number(merged.warning_hours);
    const critical = Number(merged.critical_warning_hours);
    if (Number.isFinite(warning) && Number.isFinite(critical) && critical > warning) {
      throw new BadRequestException('critical_warning_hours 不能大于 warning_hours');
    }

    const db = this.dbService.db;
    db.exec('BEGIN IMMEDIATE');
    try {
      const upsert = db.prepare(
        'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      );
      for (const [key, value] of normalized) upsert.run(key, value);
      db.exec('COMMIT');
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // 已回滚或未开启
      }
      throw error;
    }

    this.audit.record({
      action: AUDIT_ACTION.SETTING_UPDATE,
      result: AUDIT_RESULT.SUCCESS,
      userId: admin.id,
      metadata: { keys: normalized.map(([key]) => key) },
    });
    return this.readSettings();
  }

  private readSettings(): Record<string, string> {
    const rows = this.dbService.db
      .prepare('SELECT key, value FROM system_settings')
      .all() as unknown as Array<{ key: string; value: string }>;
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  }
}
