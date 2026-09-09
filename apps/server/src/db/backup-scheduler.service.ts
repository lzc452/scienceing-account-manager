import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createDatabaseBackup } from './backup';
import { defaultBackupDirectory } from './config';
import { DatabaseService } from './database.service';

const RETRY_MS = 60 * 60 * 1000;

export function millisecondsUntilNextTwoAm(now = new Date()): number {
  const next = new Date(now);
  next.setHours(2, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

@Injectable()
export class BackupScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private readonly database: DatabaseService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'production') this.schedule(millisecondsUntilNextTwoAm());
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(delayMs: number): void {
    this.timer = setTimeout(() => this.run(), delayMs);
    this.timer.unref();
  }

  private run(): void {
    try {
      const result = createDatabaseBackup(this.database.db, defaultBackupDirectory(), 'daily');
      console.log(`[backup] 每日备份完成：${result.path}（清理 ${result.removed.length} 个过期备份）`);
      this.schedule(millisecondsUntilNextTwoAm());
    } catch (error) {
      console.error(`[backup] 每日备份失败，1 小时后重试：${error instanceof Error ? error.message : String(error)}`);
      this.schedule(RETRY_MS);
    }
  }
}
