import { homedir } from 'node:os';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';

export function nowIso(): string {
  return new Date().toISOString();
}

export type DatabaseEnvironment = 'development' | 'production';

export function assertDatabasePathForEnvironment(path: string, environment: DatabaseEnvironment): void {
  const expectedSuffix = environment === 'production' ? '.prod.db' : '.dev.db';
  if (path !== ':memory:' && !basename(path).endsWith(expectedSuffix)) {
    throw new Error(
      `${environment} 数据库必须使用 ${expectedSuffix} 后缀，当前：${path}。`
      + '开发库与生产库禁止复用。',
    );
  }
}

export function assertExternalDatabasePath(path: string): void {
  const applicationRoot = resolve(__dirname, '..', '..', '..', '..');
  const local = relative(applicationRoot, path);
  if (!isAbsolute(path) || (local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local))) {
    throw new Error('DATABASE_PATH 必须是应用发布目录之外的绝对路径');
  }
}

function runtimeDirectory(): string {
  const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  return resolve((environment === 'production' ? process.env.SCIENCEING_RUNTIME_DIR : process.env.SCIENCEING_DEV_DIR)
    ?? resolve(process.env.LOCALAPPDATA ?? homedir(), 'scienceing-account-manager', environment));
}

/** 数据目录独立于代码，按环境隔离；测试可以使用临时库。 */
export function defaultDatabasePath(): string {
  const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const expectedSuffix = environment === 'production' ? '.prod.db' : '.dev.db';
  const configured = process.env.DATABASE_PATH;
  const path = configured ?? resolve(runtimeDirectory(), 'data', `scienceing${expectedSuffix}`);

  if (process.env.NODE_ENV !== 'test') {
    assertDatabasePathForEnvironment(path, environment);
    assertExternalDatabasePath(path);
  }
  return path;
}

export function defaultBackupDirectory(): string {
  return process.env.SCIENCEING_BACKUP_DIR
    ?? resolve(runtimeDirectory(), 'backups');
}
