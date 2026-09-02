import { Module } from '@nestjs/common';
import { ResetService } from './reset.service';
import { ResetQueueScheduler } from './reset.scheduler';

@Module({
  providers: [ResetService, ResetQueueScheduler],
  exports: [ResetService],
})
export class ResetModule {}
