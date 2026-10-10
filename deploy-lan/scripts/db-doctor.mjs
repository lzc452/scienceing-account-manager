/* global console, process */
/** db-doctor 是只读检查入口；结构修改统一通过版本迁移执行器。 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

try {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('db-doctor [--database PATH] [--json] [--quiet] (read-only); use deploy.cmd for migrations');
  } else {
    let database;
    let how;
    for (let i = 0; i < argv.length; i += 1) {
      if (argv[i] === '--database' || argv[i] === '--db') {
        database = argv[++i];
        if (!database) throw new Error('--database 缺少路径');
        how = '--database 显式指定';
      } else if (!['--json', '--quiet', '-q'].includes(argv[i])) {
        throw new Error(`参数 ${argv[i]} 不可用；db-doctor 只读，修改结构必须停服备份后执行版本迁移`);
      }
    }
    if (!database && process.env.DATABASE_PATH) {
      database = process.env.DATABASE_PATH;
      how = 'DATABASE_PATH 环境变量';
    }
    if (!database) {
      const { defaultDatabasePath } = require(resolve(root, 'apps/server/dist/db/config.js'));
      database = defaultDatabasePath();
      how = `NODE_ENV=${process.env.NODE_ENV ?? 'development'}`;
    }
    if (!existsSync(database)) {
      throw new Error(`${how === '--database 显式指定' ? '指定的数据库不存在' : how === 'DATABASE_PATH 环境变量' ? 'DATABASE_PATH 指向的数据库不存在' : how + ' 的数据库不存在'}：${database}。不会自动改用其它库。`);
    }
    const { inspectDatabase } = require(resolve(root, 'apps/server/dist/db/schema.js'));
    const { assertMigrationState } = require(resolve(root, 'apps/server/dist/db/migrate.js'));
    const report = inspectDatabase(database);
    const db = new DatabaseSync(database, { readOnly: true });
    let failure;
    try { assertMigrationState(db); } catch (error) { failure = error.message; } finally { db.close(); }
    report.databaseSource = how;
    report.ok = !failure;
    report.error = failure;
    if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`[db-doctor] 数据库: ${report.database}\n  目标来源 : ${how}`);
      console.log(failure ? `结构/迁移未就绪：${failure}` : '结构已是最新，校验值及完整性通过');
    }
    process.exitCode = failure ? 1 : 0;
  }
} catch (error) {
  console.error(`[db-doctor] ${error.message}`);
  process.exitCode = 2;
}
