import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminService, type AdminAccountView, type AdminLeaseView } from './admin.service';
import { AuthGuard } from '../../guards/auth.guard';
import { AdminGuard } from '../../guards/admin.guard';
import { CurrentUser } from '../../guards/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';

@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('accounts')
  accounts(): AdminAccountView[] {
    return this.adminService.listAccounts();
  }

  @Get('leases')
  leases(): AdminLeaseView[] {
    return this.adminService.listLeases();
  }

  /** 修改账号名称（对应科应平台账号） */
  @Patch('accounts/:id')
  renameAccount(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { username?: string; code?: string },
    @CurrentUser() admin: AuthUser,
  ): AdminAccountView {
    return this.adminService.rename(id, dto, admin);
  }

  /** 自动化健康检查（管理员登录 / 账号管理页 / 改密入口） */
  @Post('health-check')
  healthCheck(@CurrentUser() admin: AuthUser): Promise<{
    lastCheckedAt: string | null;
    items: Array<{ key: string; label: string; ok: boolean }>;
  }> {
    void admin;
    return this.adminService.healthCheck();
  }

  @Post('accounts/:id/force-release')
  forceRelease(@Param('id', ParseIntPipe) id: number, @CurrentUser() admin: AuthUser) {
    return this.adminService.forceRelease(id, admin);
  }

  @Post('accounts/:id/reset-password')
  resetPassword(@Param('id', ParseIntPipe) id: number, @CurrentUser() admin: AuthUser) {
    return this.adminService.resetPassword(id, admin);
  }

  @Post('accounts/:id/mark-available')
  markAvailable(@Param('id', ParseIntPipe) id: number, @CurrentUser() admin: AuthUser) {
    return this.adminService.markAvailable(id, admin);
  }

  @Post('accounts/:id/disable')
  disable(@Param('id', ParseIntPipe) id: number, @CurrentUser() admin: AuthUser) {
    return this.adminService.disable(id, admin);
  }

  @Post('accounts/:id/enable')
  enable(@Param('id', ParseIntPipe) id: number, @CurrentUser() admin: AuthUser) {
    return this.adminService.enable(id, admin);
  }
}
