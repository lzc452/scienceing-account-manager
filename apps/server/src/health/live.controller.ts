import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { DatabaseService } from '../db/database.service';
import { backupFiles } from '../db/backup';
import { defaultBackupDirectory, defaultDatabasePath } from '../db/config';
import { CURRENT_SCHEMA_VERSION } from '../db/migrations';

/**
 * 公开健康检查（云托管健康检查 / 自检脚本用）。
 *
 * 与 `GET /api/admin/automation/health` 的区别：那个是业务层的「科应自动化体检」，
 * 需要管理员会话；本端点只看进程与数据面，不能带鉴权——平台探活拿不到 cookie。
 *
 * 返回内容刻意保持精简：数据库只暴露文件名与 journal 模式，不暴露绝对路径、
 * 主密钥、凭据等。数据库不可读或迁移版本不一致时返回 503，让平台不要把流量切过来。
 */
@Controller('health')
export class LiveHealthController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
  check(@Res({ passthrough: true }) res: Response): Record<string, unknown> {
    const databasePath = defaultDatabasePath();
    const backupDirectory = defaultBackupDirectory();

    let schemaVersion = -1;
    let databaseError: string | null = null;
    try {
      this.databaseService.db.prepare('SELECT 1').get();
      const row = this.databaseService.db
        .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
        .get() as { version: number };
      schemaVersion = Number(row.version);
    } catch (error) {
      databaseError = error instanceof Error ? error.message : String(error);
    }

    const schemaOk = schemaVersion === CURRENT_SCHEMA_VERSION;
    const databaseOk = databaseError === null;
    const writable = isWritable(databasePath) && isWritable(backupDirectory);
    const backups = backupFiles(backupDirectory);
    const lastBackup = backups
      .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];

    const healthy = databaseOk && schemaOk;
    if (!healthy) res.status(503);

    return {
      status: healthy ? (writable ? 'ok' : 'degraded') : 'error',
      version: process.env.APP_VERSION ?? '0.1.0',
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      checks: {
        database: databaseOk ? 'ok' : 'fail',
        schema: schemaOk ? 'ok' : 'fail',
        // 只读校验：挂载点不可写时服务能跑但备份会失败，因此降级而不是判死。
        storage: writable ? 'ok' : 'fail',
      },
      schemaVersion,
      expectedSchemaVersion: CURRENT_SCHEMA_VERSION,
      database: {
        file: basename(databasePath),
        exists: existsSync(databasePath),
        journalMode: journalMode(this.databaseService),
      },
      backup: {
        directory: basename(backupDirectory),
        count: backups.length,
        lastBackupAt: lastBackup ? new Date(lastBackup.mtimeMs).toISOString() : null,
      },
      ...(databaseError ? { error: databaseError } : {}),
    };
  }
}

function isWritable(path: string): boolean {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function journalMode(database: DatabaseService): string {
  try {
    const row = database.db.prepare('PRAGMA journal_mode').get() as { journal_mode?: string };
    return row.journal_mode ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
