import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './connection';
import { defaultDatabasePath } from './config';
import { migrate } from './migrate';

/**
 * 单例 SQLite 连接（WAL），构造时自动应用未执行的 migration。
 * 通过 @Global() DatabaseModule 全应用注入。
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly db: DatabaseSync;

  constructor() {
    this.db = openDatabase(defaultDatabasePath());
    migrate(this.db);
  }

  onModuleDestroy(): void {
    this.db.close();
  }
}
