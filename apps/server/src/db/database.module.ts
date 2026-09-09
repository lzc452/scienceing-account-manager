import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { AuditService } from './audit.service';
import { BackupScheduler } from './backup-scheduler.service';

/** 全局模块：提供 SQLite 连接与审计写入器，供所有业务模块注入。 */
@Global()
@Module({
  providers: [DatabaseService, AuditService, BackupScheduler],
  exports: [DatabaseService, AuditService],
})
export class DatabaseModule {}
