import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AutomationService, type HealthCheckResult } from '../modules/automation/automation.service';
import { AuthGuard } from '../guards/auth.guard';
import { AdminGuard } from '../guards/admin.guard';

/** 自动化健康检查（PRD §49）：三项 + 最后检测时间 + 立即检测。 */
@Controller('admin/automation')
@UseGuards(AuthGuard, AdminGuard)
export class HealthController {
  constructor(private readonly automationService: AutomationService) {}

  @Get('health')
  last(): HealthCheckResult | null {
    return this.automationService.getLastHealth();
  }

  @Post('health/check')
  async check(): Promise<HealthCheckResult> {
    return this.automationService.checkHealth();
  }
}
