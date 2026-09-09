import { basename, resolve } from 'node:path';

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

/**
 * 默认数据库路径严格按环境隔离：开发使用 scienceing.dev.db，生产使用 scienceing.prod.db。
 * 编译产物位于 apps/server/dist/db，`__dirname` 上溯 4 级即仓库根。
 * 可用 DATABASE_PATH 环境变量覆盖（测试用临时库）。
 */
export function defaultDatabasePath(): string {
  const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const expectedSuffix = environment === 'production' ? '.prod.db' : '.dev.db';
  const configured = process.env.DATABASE_PATH;
  const path = configured
    ?? resolve(__dirname, '..', '..', '..', '..', 'data', `scienceing${expectedSuffix}`);

  if (process.env.NODE_ENV !== 'test') assertDatabasePathForEnvironment(path, environment);
  return path;
}

export function defaultBackupDirectory(): string {
  return process.env.SCIENCEING_BACKUP_DIR
    ?? resolve(__dirname, '..', '..', '..', '..', 'backups');
}
