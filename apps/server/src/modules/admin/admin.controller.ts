import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminService, type AdminAccountView } from './admin.service';
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

  /** 新增科应账号：POST /admin/accounts { code, username } */
  @Post('accounts')
  createAccount(@Body() dto: { code?: string; username?: string }, @CurrentUser() admin: AuthUser): AdminAccountView {
    return this.adminService.createAccount(dto, admin);
  }

  /** CSV 批量导入：POST /admin/accounts/bulk { accounts: [{ code, username }] } */
  @Post('accounts/bulk')
  bulkCreateAccounts(@Body() dto: { accounts?: Array<{ code?: string; username?: string }> }, @CurrentUser() admin: AuthUser) {
    return this.adminService.bulkCreateAccounts(dto.accounts ?? [], admin);
  }

  /** 删除科应账号：DELETE /admin/accounts/:id */
  @Delete('accounts/:id')
  deleteAccount(@Param('id', ParseIntPipe) id: number, @CurrentUser() admin: AuthUser) {
    return this.adminService.deleteAccount(id, admin);
  }

  @Get('leases')
  leases(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminService.listLeases({
      status: status && status !== 'all' ? status : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
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

  /** 自动化健康检查（管理员登录 / 账号管理页 / 改密入口）；error 携带失败原因（如缺少 Worker 环境变量 / 页面改版）。 */
  @Post('health-check')
  healthCheck(@CurrentUser() admin: AuthUser): Promise<{
    lastCheckedAt: string | null;
    error?: string | null;
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
