import { Module } from '@nestjs/common';
import { LeasesController } from './leases.controller';
import { LeasesService } from './leases.service';
import { AuthModule } from '../auth/auth.module';
import { ExtensionModule } from '../extension/extension.module';
import { ResetModule } from '../reset/reset.module';

// 归还时若走 ROTATE 分支（旧扩展 / recycle_mode=ROTATE），需要复用改密队列；
// ResetModule 不反向依赖 LeaseModule，因此不构成循环依赖。
@Module({
  imports: [AuthModule, ExtensionModule, ResetModule],
  controllers: [LeasesController],
  providers: [LeasesService],
  exports: [LeasesService],
})
export class LeaseModule {}
