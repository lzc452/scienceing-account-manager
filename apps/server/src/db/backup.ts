import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { backup as sqliteBackup, DatabaseSync } from 'node:sqlite';
import { assertDatabaseIntegrity } from './schema';

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
    assertDatabaseIntegrity(db);
  } finally {
    db.close();
  }
}

/** SQLite Backup API 包含已提交的 WAL 数据；wx 原子保留目标，禁止覆盖已有文件。 */
export async function backupSnapshot(db: DatabaseSync, targetPath: string): Promise<void> {
  const target = resolve(targetPath);
  if (existsSync(target)) throw new Error(`拒绝覆盖已有数据库文件：${target}`);
  mkdirSync(dirname(target), { recursive: true });
  closeSync(openSync(target, 'wx'));
  const partial = `${target}.partial-${process.pid}-${Date.now()}.tmp`;
  try {
    await sqliteBackup(db, partial);
    assertHealthyDatabase(partial);
    renameSync(partial, target);
  } catch (error) {
    if (existsSync(partial)) unlinkSync(partial);
    unlinkSync(target);
    throw error;
  }
}

export function backupFiles(backupDirectory: string): string[] {
  if (!existsSync(backupDirectory)) return [];
  return readdirSync(backupDirectory)
    .filter((name) => /^scienceing\.prod\..+\.db$/i.test(name))
    .map((name) => join(backupDirectory, name))
    .filter((path) => statSync(path).size >= 100);
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

export async function createDatabaseBackup(
  db: DatabaseSync,
  backupDirectory: string,
  reason = 'manual',
  now = new Date(),
): Promise<BackupResult> {
  mkdirSync(backupDirectory, { recursive: true });
  const file = `scienceing.prod.${timestamp(now)}.${safeSegment(reason)}.db`;
  const path = join(backupDirectory, file);
  await backupSnapshot(db, path);
  return { path, removed: pruneBackups(backupDirectory, now.getTime()) };
}

/** 首次上线导入旧库；源库的 -wal/-shm 必须与主文件保持在同一目录。 */
export async function importDatabase(sourcePath: string, targetPath: string): Promise<void> {
  if (!existsSync(sourcePath)) throw new Error(`旧数据库不存在：${sourcePath}`);
  if (existsSync(targetPath)) throw new Error(`生产数据库已存在，拒绝导入覆盖：${targetPath}`);
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    source.exec('PRAGMA busy_timeout = 5000');
    await backupSnapshot(source, targetPath);
  } finally {
    source.close();
  }
}

/** 停服后从完整快照恢复。旧主库及 WAL/SHM 会改名留存，不直接删除。 */
export async function restoreDatabase(snapshotPath: string, targetPath: string, now = new Date()): Promise<string[]> {
  if (resolve(snapshotPath) === resolve(targetPath)) throw new Error('恢复来源不能是目标数据库本身');
  assertHealthyDatabase(snapshotPath);
  mkdirSync(dirname(targetPath), { recursive: true });
  const token = `.failed-${timestamp(now)}`;
  const preserved: string[] = [];
  const temp = `${targetPath}.restore-${process.pid}-${Date.now()}.tmp`;
  const source = new DatabaseSync(snapshotPath, { readOnly: true });
  try {
    await backupSnapshot(source, temp);
  } finally {
    source.close();
  }

  const moves = ['-wal', '-shm', ''].map((suffix) => ({
    current: `${targetPath}${suffix}`, failed: `${targetPath}${token}${suffix || '.db'}`,
  })).filter((move) => existsSync(move.current));
  if (moves.some((move) => existsSync(move.failed))) throw new Error('恢复留存文件已存在，拒绝覆盖；请改用新的恢复时间');
  try {
    for (const move of moves) {
      renameSync(move.current, move.failed);
      preserved.push(move.failed);
    }
    renameSync(temp, targetPath);
  } catch (error) {
    for (const move of moves.slice(0, preserved.length).reverse()) renameSync(move.failed, move.current);
    throw error;
  }
  assertHealthyDatabase(targetPath);
  return preserved;
}

export function backupReasonFromPath(path: string): string {
  return basename(path).split('.').at(-2) ?? 'unknown';
}
