import { Module } from '@nestjs/common';
import { ExtensionController } from './extension.controller';
import { ExtensionProofService } from './extension-proof.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ExtensionController],
  providers: [ExtensionProofService],
  exports: [ExtensionProofService],
})
export class ExtensionModule {}
