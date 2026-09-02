import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { LeasesService } from './leases.service';
import { AuthGuard } from '../../guards/auth.guard';
import { CurrentUser } from '../../guards/current-user.decorator';
import { extractBearerToken } from '../../guards/extract-token';
import { RELEASE_REASON } from '../../db/constants';
import type { AuthUser } from '../auth/auth.types';
import type { CreateLeaseDto } from './dto/create-lease.dto';

@Controller('leases')
export class LeasesController {
  constructor(private readonly leasesService: LeasesService) {}

  @Post()
  @UseGuards(AuthGuard)
  create(@Body() dto: CreateLeaseDto, @CurrentUser() user: AuthUser) {
    return this.leasesService.claim(user.id, dto.extensionVersion);
  }

  @Get('current')
  @UseGuards(AuthGuard)
  current(@CurrentUser() user: AuthUser) {
    return this.leasesService.current(user.id);
  }

  @Post(':id/release')
  @UseGuards(AuthGuard)
  release(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.leasesService.release(id, user.id, RELEASE_REASON.USER_RETURN);
  }

  @Get(':id/status')
  status(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.leasesService.status(id, extractBearerToken(req.headers as unknown as Record<string, unknown>));
  }
}
