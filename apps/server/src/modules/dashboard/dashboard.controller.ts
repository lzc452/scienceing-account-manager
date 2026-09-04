import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../guards/auth.guard';
import { AdminGuard } from '../../guards/admin.guard';
import { DashboardService, DashboardStats } from './dashboard.service';

/** 数据看板（t13）：GET /api/admin/dashboard?days=7|30|90，仅管理员。 */
@Controller('admin/dashboard')
@UseGuards(AuthGuard, AdminGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  stats(@Query('days') days?: string): DashboardStats {
    return this.dashboardService.stats(Number(days));
  }
}
