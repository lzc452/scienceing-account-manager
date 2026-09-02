import { Controller, Get } from '@nestjs/common';
import { AccountsService, type AccountAvailability, type AccountPoolItem } from './accounts.service';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get('availability')
  availability(): AccountAvailability {
    return this.accountsService.availability();
  }

  @Get('pool')
  pool(): AccountPoolItem[] {
    return this.accountsService.pool();
  }
}
