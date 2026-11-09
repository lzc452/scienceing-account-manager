import { Module } from '@nestjs/common';
import { ResetService } from './reset.service';
import { ResetQueueScheduler } from './reset.scheduler';
import { RotationService } from './rotation.service';
import { RotationScheduler } from './rotation.scheduler';

@Module({
  providers: [ResetService, ResetQueueScheduler, RotationService, RotationScheduler],
  exports: [ResetService, RotationService],
})
export class ResetModule {}
