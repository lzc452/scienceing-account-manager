import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { backupIsStale, createDatabaseBackup } from './backup';
import { openDatabase } from './connection';
import { defaultBackupDirectory, defaultDatabasePath } from './config';
import { assertMigrationState, migrate } from './migrate';
import { isDeploymentVerification } from '../lib/deploy-verification';

/**
 * 单例 SQLite 连接（WAL）。生产启动只验证；迁移必须在停服备份后的部署步骤执行。
 * 通过 @Global() DatabaseModule 全应用注入。
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy, OnModuleInit {
  readonly db: DatabaseSync;

  constructor() {
    const databasePath = defaultDatabasePath();
    if (isDeploymentVerification() && process.env.NODE_ENV !== 'production') {
      throw new Error('发布验证模式只允许使用显式迁移后的生产数据库');
    }
    if (process.env.NODE_ENV === 'production') {
      if (!existsSync(databasePath)) throw new Error('生产数据库不存在，禁止启动时创建');
      const check = new DatabaseSync(databasePath, { readOnly: true });
      try { assertMigrationState(check); } finally { check.close(); }
    }
    this.db = isDeploymentVerification() ? new DatabaseSync(databasePath, { readOnly: true }) : openDatabase(databasePath);
    if (isDeploymentVerification()) this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (process.env.NODE_ENV !== 'production') migrate(this.db);
  }

  async onModuleInit(): Promise<void> {
    if (!isDeploymentVerification() && process.env.NODE_ENV === 'production' && backupIsStale(defaultBackupDirectory())) {
      const result = await createDatabaseBackup(this.db, defaultBackupDirectory(), 'startup-catchup');
      console.log(`[backup] 启动补备份完成：${result.path}`);
    }
  }

  onModuleDestroy(): void {
    this.db.close();
  }
}
