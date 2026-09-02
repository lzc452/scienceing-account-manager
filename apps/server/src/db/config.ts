import { resolve } from 'node:path';

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 默认数据库路径：仓库根 data/scienceing.db（PRD §55）。
 * 编译产物位于 apps/server/dist/db，`__dirname` 上溯 4 级即仓库根。
 * 可用 DATABASE_PATH 环境变量覆盖（测试用临时库）。
 */
export function defaultDatabasePath(): string {
  return process.env.DATABASE_PATH ?? resolve(__dirname, '..', '..', '..', '..', 'data', 'scienceing.db');
}
