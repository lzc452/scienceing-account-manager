import { Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
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
