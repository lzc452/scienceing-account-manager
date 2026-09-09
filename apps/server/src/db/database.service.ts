import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { backupIsStale, createDatabaseBackup } from './backup';
import { openDatabase } from './connection';
import { defaultBackupDirectory, defaultDatabasePath } from './config';
import { migrate } from './migrate';

/**
 * 单例 SQLite 连接（WAL），构造时自动应用未执行的 migration。
 * 通过 @Global() DatabaseModule 全应用注入。
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly db: DatabaseSync;

  constructor() {
    const databasePath = defaultDatabasePath();
    const existed = existsSync(databasePath);
    this.db = openDatabase(databasePath);
    if (process.env.NODE_ENV === 'production' && existed && backupIsStale(defaultBackupDirectory())) {
      const result = createDatabaseBackup(this.db, defaultBackupDirectory(), 'startup-catchup');
      console.log(`[backup] 启动补备份完成：${result.path}`);
    }
    migrate(this.db);
  }

  onModuleDestroy(): void {
    this.db.close();
  }
}
