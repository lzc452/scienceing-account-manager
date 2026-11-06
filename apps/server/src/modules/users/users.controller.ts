import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from '../../guards/auth.guard';
import { AdminGuard } from '../../guards/admin.guard';
import { CurrentUser } from '../../guards/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

@Controller('admin/users')
@UseGuards(AuthGuard, AdminGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** 用户列表（分页 + 关键词）：GET /admin/users?page=1&pageSize=20&keyword=张 */
  @Get()
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('keyword') keyword?: string,
  ) {
    return this.usersService.list({ page, pageSize, keyword });
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() admin: AuthUser): Promise<AuthUser> {
    return this.usersService.create(dto, admin);
  }

  /** CSV 批量导入（前端解析后二次确认，整批提交） */
  @Post('bulk')
  createMany(
    @Body() dto: { users?: CreateUserDto[] },
    @CurrentUser() admin: AuthUser,
  ): Promise<{ created: number; failed: Array<{ username: string; reason: string }> }> {
    return this.usersService.createMany(dto.users ?? [], admin);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AuthUser> {
    return this.usersService.update(id, dto, admin);
  }

  /**
   * 重置用户密码（须携带 POST /admin/verify-password 签发的 verifyToken）：
   * POST /admin/users/:id/reset-password { newPassword, verifyToken }
   */
  @Post(':id/reset-password')
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { newPassword?: string; verifyToken?: string },
    @CurrentUser() admin: AuthUser,
  ): Promise<AuthUser> {
    return this.usersService.resetUserPassword(id, dto, admin);
  }
}
