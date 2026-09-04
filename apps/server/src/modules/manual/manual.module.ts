import { Module } from '@nestjs/common';
import { ManualController } from './manual.controller';
import { AdminManualController } from './admin-manual.controller';
import { ManualService } from './manual.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  // 管理员侧控制器需要 AuthGuard / AdminGuard，故依赖 AuthModule
  imports: [AuthModule],
  controllers: [ManualController, AdminManualController],
  providers: [ManualService],
  exports: [ManualService],
})
export class ManualModule {}
