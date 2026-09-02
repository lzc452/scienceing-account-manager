import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
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

  @Get()
  list(): AuthUser[] {
    return this.usersService.list();
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
}
