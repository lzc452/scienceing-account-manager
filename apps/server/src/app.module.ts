import { Module } from '@nestjs/common';
import { DatabaseModule } from './db/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { LeaseModule } from './modules/leases/leases.module';
import { ActivityModule } from './modules/activity/activity.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { ExtensionModule } from './modules/extension/extension.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ManualModule } from './modules/manual/manual.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AutomationModule } from './modules/automation/automation.module';
import { ResetModule } from './modules/reset/reset.module';
import { HealthModule } from './health/health.module';
import { TimeoutScheduler } from './scheduler/timeout.service';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    AccountsModule,
    LeaseModule,
    ActivityModule,
    AdminModule,
    AuditModule,
    ExtensionModule,
    SettingsModule,
    ManualModule,
    DashboardModule,
    AutomationModule,
    ResetModule,
    HealthModule,
  ],
  providers: [TimeoutScheduler],
})
export class AppModule {}
