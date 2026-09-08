import { Module } from '@nestjs/common';
import { LeasesController } from './leases.controller';
import { LeasesService } from './leases.service';
import { AuthModule } from '../auth/auth.module';
import { ExtensionModule } from '../extension/extension.module';

@Module({
  imports: [AuthModule, ExtensionModule],
  controllers: [LeasesController],
  providers: [LeasesService],
  exports: [LeasesService],
})
export class LeaseModule {}
