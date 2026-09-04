import { BadRequestException, Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AuditService } from '../../db/audit.service';
import { AUDIT_ACTION, AUDIT_RESULT } from '../../db/constants';
import { AuthGuard } from '../../guards/auth.guard';
import { AdminGuard } from '../../guards/admin.guard';
import { CurrentUser } from '../../guards/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { ManualPayload, ManualService, UpdateManualDto } from './manual.service';

/** 管理后台使用手册维护（t13）：GET / PUT /api/admin/manual，仅管理员。 */
@Controller('admin/manual')
@UseGuards(AuthGuard, AdminGuard)
export class AdminManualController {
  constructor(
    private readonly manualService: ManualService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  read(): ManualPayload {
    return this.manualService.read();
  }

  @Put()
  update(@Body() dto: UpdateManualDto, @CurrentUser() admin: AuthUser): ManualPayload {
    let updated: ManualPayload;
    try {
      updated = this.manualService.update(dto, admin.id);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : '保存失败');
    }

    this.audit.record({
      action: AUDIT_ACTION.MANUAL_UPDATE,
      result: AUDIT_RESULT.SUCCESS,
      userId: admin.id,
      metadata: { slug: updated.slug, length: updated.content.length },
    });

    return updated;
  }
}
