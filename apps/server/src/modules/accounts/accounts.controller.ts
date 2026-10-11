import { Controller, Get, UseGuards } from '@nestjs/common';
import { AccountsService, type AccountAvailability, type AccountPoolItem, type AccountContinuityItem } from './accounts.service';
import { AuthGuard } from '../../guards/auth.guard';
import { CurrentUser } from '../../guards/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';

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

  @Get('mine')
  @UseGuards(AuthGuard)
  mine(@CurrentUser() user: AuthUser): AccountContinuityItem[] {
    return this.accountsService.mine(user.id);
  }
}
