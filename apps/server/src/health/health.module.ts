import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AuthModule } from '../modules/auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [HealthController],
})
export class HealthModule {}
