import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { LeaseModule } from '../leases/leases.module';

@Module({
  imports: [LeaseModule],
  controllers: [ActivityController],
})
export class ActivityModule {}
