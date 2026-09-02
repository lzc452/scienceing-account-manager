import { Global, Module } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { PlaywrightHealthExecutor, PlaywrightResetExecutor } from './automation.executor';
import { HEALTH_EXECUTOR, RESET_EXECUTOR } from './automation.types';

@Global()
@Module({
  providers: [
    AutomationService,
    PlaywrightResetExecutor,
    PlaywrightHealthExecutor,
    { provide: RESET_EXECUTOR, useExisting: PlaywrightResetExecutor },
    { provide: HEALTH_EXECUTOR, useExisting: PlaywrightHealthExecutor },
  ],
  exports: [AutomationService, RESET_EXECUTOR, HEALTH_EXECUTOR],
})
export class AutomationModule {}
