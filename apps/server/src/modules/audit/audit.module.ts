import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AuditController],
})
export class AuditModule {}
