import { Body, Controller, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { LeasesService } from '../leases/leases.service';
import { extractBearerToken } from '../../guards/extract-token';
import type { ActivityDto } from '../leases/dto/activity.dto';

@Controller('leases')
export class ActivityController {
  constructor(private readonly leasesService: LeasesService) {}

  @Post(':id/activity')
  activity(@Param('id', ParseIntPipe) id: number, @Req() req: Request, @Body() body: ActivityDto) {
    const token = extractBearerToken(req.headers as unknown as Record<string, unknown>) ?? body.leaseToken ?? null;
    return this.leasesService.renewActivity(id, token);
  }
}
