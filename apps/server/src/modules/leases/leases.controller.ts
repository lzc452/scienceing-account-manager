import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { LeasesService } from './leases.service';
import { AuthGuard } from '../../guards/auth.guard';
import { CurrentUser } from '../../guards/current-user.decorator';
import { extractBearerToken } from '../../guards/extract-token';
import { RELEASE_REASON } from '../../db/constants';
import type { AuthUser } from '../auth/auth.types';
import type { CreateLeaseDto } from './dto/create-lease.dto';
import type { RecycleAckDto } from './dto/recycle-ack.dto';
import { ExtensionProofService } from '../extension/extension-proof.service';

@Controller('leases')
export class LeasesController {
  constructor(
    private readonly leasesService: LeasesService,
    private readonly extensionProofs: ExtensionProofService,
  ) {}

  @Post()
  @UseGuards(AuthGuard)
  create(@Body() dto: CreateLeaseDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const identity = this.extensionProofs.requireIdentity(req.headers);
    const extensionVersion = this.extensionProofs.consume(user.id, dto.extensionProof, identity);
    return this.leasesService.claim(user.id, extensionVersion, dto.accountId);
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

  /**
   * 清理回执。用 leaseToken 认证（与 GET :id/status 一致）：
   * 归还后用户侧可能已经离开页面，但扩展始终持有这条租约的 token。
   */
  @Post(':id/recycle-ack')
  ackRecycle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecycleAckDto,
    @Req() req: Request,
  ) {
    if (typeof dto?.ok !== 'boolean') {
      // 不把「没说」当成功：一次误判会让那台机器上的令牌仍然有效，账号却已放回池子
      throw new BadRequestException('ok 必须是布尔值');
    }
    return this.leasesService.ackRecycle(
      id,
      extractBearerToken(req.headers as unknown as Record<string, unknown>),
      { ok: dto.ok, method: dto.method, detail: dto.detail },
    );
  }

  @Get(':id/status')
  status(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.leasesService.status(id, extractBearerToken(req.headers as unknown as Record<string, unknown>));
  }
}
