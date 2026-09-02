import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { AuditService } from '../../db/audit.service';
import { AUDIT_ACTION, AUDIT_RESULT } from '../../db/constants';
import { AuthGuard } from '../../guards/auth.guard';
import { AdminGuard } from '../../guards/admin.guard';
import { CurrentUser } from '../../guards/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';

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
    for (const [key, value] of Object.entries(dto)) {
      if (typeof value !== 'string') continue;
      this.dbService.db
        .prepare('INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .run(key, value);
    }
    this.audit.record({
      action: AUDIT_ACTION.SETTING_UPDATE,
      result: AUDIT_RESULT.SUCCESS,
      userId: admin.id,
      metadata: { keys: Object.keys(dto) },
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
