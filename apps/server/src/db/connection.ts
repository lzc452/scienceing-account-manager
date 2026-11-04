import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite 日志模式白名单。
 *
 * 默认 WAL（本地盘：读不阻塞写，写入更快）。但云托管测试环境把数据目录挂在 CFS
 * （NFS 协议）上，WAL 依赖 -shm 共享内存映射，SQLite 官方明确不支持网络文件系统；
 * 此时必须显式切成 delete/truncate，并在打开后校验实际生效值——
 * SQLite 对无法切换的模式是「静默保持原值」，不校验就会以为自己在跑 WAL。
 */
export const JOURNAL_MODES = ['wal', 'delete', 'truncate', 'persist'] as const;
export type JournalMode = (typeof JOURNAL_MODES)[number];

export function resolveJournalMode(env: NodeJS.ProcessEnv = process.env): JournalMode {
  const raw = (env.SCIENCEING_SQLITE_JOURNAL ?? 'wal').trim().toLowerCase();
  if (!(JOURNAL_MODES as readonly string[]).includes(raw)) {
    throw new Error(`SCIENCEING_SQLITE_JOURNAL 只能是 ${JOURNAL_MODES.join('/')}，当前：${raw}`);
  }
  return raw as JournalMode;
}

/**
 * 打开 SQLite 数据库：默认启用 WAL + 外键 + busy_timeout（PRD §7.3 SQLite + WAL）。
 *
 * 网络文件系统（CloudBase CFS）请设置 SCIENCEING_SQLITE_JOURNAL=delete；
 * 该模式下同步级别固定为 FULL，保证提交落盘后再返回（代价是写入变慢）。
 */
export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);

  // 内存库无法切换日志模式（PRAGMA 返回 memory），测试与一次性校验都用它，直接跳过。
  if (path !== ':memory:') {
    const mode = resolveJournalMode();
    const actual = (db.prepare(`PRAGMA journal_mode = ${mode}`).get() as { journal_mode?: string })
      .journal_mode?.toLowerCase();
    if (actual !== mode) {
      db.close();
      throw new Error(
        `SQLite journal_mode 期望 ${mode}，实际 ${actual ?? 'unknown'}（数据目录可能不支持该模式，`
        + '例如 WAL 在 NFS/CFS 上不可用；请改用 SCIENCEING_SQLITE_JOURNAL=delete）',
      );
    }
    if (mode !== 'wal') db.exec('PRAGMA synchronous = FULL;');
  }

  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  return db;
}
