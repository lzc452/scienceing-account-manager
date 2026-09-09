import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const BACKUP_RETENTION_DAYS = 30;
export const BACKUP_STALE_HOURS = 24;

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'manual';
}

function timestamp(date = new Date()): string {
  return date.toISOString().replace(/[-:.]/g, '');
}

export function assertHealthyDatabase(path: string): void {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const row = db.prepare('PRAGMA quick_check').get() as { quick_check: string } | undefined;
    if (row?.quick_check !== 'ok') throw new Error(`SQLite quick_check 失败：${row?.quick_check ?? '无结果'}`);
  } finally {
    db.close();
  }
}

/** 使用 SQLite 自身生成一致性快照；源库处于 WAL 模式且在线写入时也不会漏掉 WAL 内容。 */
export function vacuumSnapshot(db: DatabaseSync, targetPath: string): void {
  const target = resolve(targetPath);
  if (existsSync(target)) throw new Error(`拒绝覆盖已有数据库文件：${target}`);
  mkdirSync(dirname(target), { recursive: true });
  db.prepare('VACUUM INTO ?').run(target);
  assertHealthyDatabase(target);
}

export function backupFiles(backupDirectory: string): string[] {
  if (!existsSync(backupDirectory)) return [];
  return readdirSync(backupDirectory)
    .filter((name) => /^scienceing\.prod\..+\.db$/i.test(name))
    .map((name) => join(backupDirectory, name));
}

export function newestBackupTime(backupDirectory: string): number | null {
  const times = backupFiles(backupDirectory).map((path) => statSync(path).mtimeMs);
  return times.length > 0 ? Math.max(...times) : null;
}

export function backupIsStale(
  backupDirectory: string,
  now = Date.now(),
  staleHours = BACKUP_STALE_HOURS,
): boolean {
  const latest = newestBackupTime(backupDirectory);
  return latest === null || now - latest > staleHours * 60 * 60 * 1000;
}

export function pruneBackups(
  backupDirectory: string,
  now = Date.now(),
  retentionDays = BACKUP_RETENTION_DAYS,
): string[] {
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  const removed: string[] = [];
  for (const path of backupFiles(backupDirectory)) {
    if (statSync(path).mtimeMs >= cutoff) continue;
    unlinkSync(path);
    removed.push(path);
  }
  return removed;
}

export interface BackupResult {
  path: string;
  removed: string[];
}

export function createDatabaseBackup(
  db: DatabaseSync,
  backupDirectory: string,
  reason = 'manual',
  now = new Date(),
): BackupResult {
  mkdirSync(backupDirectory, { recursive: true });
  const file = `scienceing.prod.${timestamp(now)}.${safeSegment(reason)}.db`;
  const path = join(backupDirectory, file);
  vacuumSnapshot(db, path);
  return { path, removed: pruneBackups(backupDirectory, now.getTime()) };
}

/** 首次上线导入旧库；源库的 -wal/-shm 必须与主文件保持在同一目录。 */
export function importDatabase(sourcePath: string, targetPath: string): void {
  if (!existsSync(sourcePath)) throw new Error(`旧数据库不存在：${sourcePath}`);
  if (existsSync(targetPath)) throw new Error(`生产数据库已存在，拒绝导入覆盖：${targetPath}`);
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    source.exec('PRAGMA busy_timeout = 5000');
    vacuumSnapshot(source, targetPath);
  } finally {
    source.close();
  }
}

/** 停服后从完整快照恢复。旧主库及 WAL/SHM 会改名留存，不直接删除。 */
export function restoreDatabase(snapshotPath: string, targetPath: string, now = new Date()): string[] {
  assertHealthyDatabase(snapshotPath);
  mkdirSync(dirname(targetPath), { recursive: true });
  const token = `.failed-${timestamp(now)}`;
  const preserved: string[] = [];
  const temp = `${targetPath}.restore-${process.pid}-${Date.now()}.tmp`;
  copyFileSync(snapshotPath, temp);
  assertHealthyDatabase(temp);

  for (const suffix of ['-wal', '-shm', '']) {
    const current = `${targetPath}${suffix}`;
    if (!existsSync(current)) continue;
    const failed = `${targetPath}${token}${suffix || '.db'}`;
    renameSync(current, failed);
    preserved.push(failed);
  }
  renameSync(temp, targetPath);
  assertHealthyDatabase(targetPath);
  return preserved;
}

export function backupReasonFromPath(path: string): string {
  return basename(path).split('.').at(-2) ?? 'unknown';
}
