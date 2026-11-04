import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { LiveHealthController } from './live.controller';
import { AuthModule } from '../modules/auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [HealthController, LiveHealthController],
})
export class HealthModule {}
