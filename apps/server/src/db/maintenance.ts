import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDatabaseBackup, importDatabase, restoreDatabase } from './backup';
import { defaultBackupDirectory, defaultDatabasePath } from './config';
import { DatabaseSync } from 'node:sqlite';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArgument(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`缺少参数 --${name}`);
  return resolve(value);
}

function emit(result: Record<string, unknown>): void {
  console.log(JSON.stringify(result));
}

async function backup(): Promise<void> {
  const database = resolve(argument('database') ?? defaultDatabasePath());
  if (!existsSync(database)) throw new Error(`数据库不存在：${database}`);
  const directory = resolve(argument('directory') ?? defaultBackupDirectory());
  const reason = argument('reason') ?? 'manual';
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const result = await createDatabaseBackup(db, directory, reason);
    emit({ ok: true, operation: 'backup', database, ...result });
  } finally {
    db.close();
  }
}

async function importLegacy(): Promise<void> {
  const source = requiredArgument('source');
  const target = resolve(argument('target') ?? defaultDatabasePath());
  await importDatabase(source, target);
  emit({ ok: true, operation: 'import', source, target });
}

async function restore(): Promise<void> {
  const source = requiredArgument('source');
  const target = resolve(argument('target') ?? defaultDatabasePath());
  const preserved = await restoreDatabase(source, target);
  emit({ ok: true, operation: 'restore', source, target, preserved });
}

async function main(): Promise<void> {
  const operation = process.argv[2];
  if (operation === 'backup') await backup();
  else if (operation === 'import') await importLegacy();
  else if (operation === 'restore') await restore();
  else throw new Error('用法：maintenance <backup|import|restore> [--source PATH] [--target PATH]');
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(`[db:maintenance] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
