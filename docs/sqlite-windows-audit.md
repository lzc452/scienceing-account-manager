# SQLite / Windows 改造审计（2026-10-08）

本报告先于实现编写。审计只读检查了开发数据库的结构与迁移记录，没有读取业务行，没有连接或操作部署机数据库。

## 当前情况

- 根目录 `package.json` 使用 pnpm workspace；后端是 NestJS / TypeScript，数据库驱动为 Node 内置 `node:sqlite`，没有 Prisma、TypeORM、Sequelize、Alembic，也没有 `requirements.txt`。数据库定义在 SQL 迁移中，业务服务直接执行 SQL。
- `apps/server/src/db/migrations/001–007` 是现有且唯一的迁移系统。登记表包含 `version/name/applied_at`，每条 SQL 与登记使用一个事务；目前只验证名称，没有 SQL 校验值。
- `data/scienceing.dev.db` 只读检查显示 9 个业务表和迁移登记表，已登记版本 1–7。当前开发入口强制指向这个仓库内的开发库。
- 生产 Release 布局已把 `data/scienceing.prod.db` 和 `backups` 放在版本目录之外；但配置默认值及旧 LAN 入口仍允许仓库内的运行目录。
- 根目录 `deploy-release.ps1` 已实现制品 SHA256、停服、快照、迁移、启动、失败恢复。`deploy-prod.bat` 是现有入口。发布包包含生产依赖，部署机不必安装 pnpm，也不需要管理员权限。
- 备份目前用 `VACUUM INTO`；校验只用 `quick_check`。`DatabaseService` 构造函数自动迁移，`deploy-release.ps1`、LAN 部署和启动会调用 `db-doctor --fix`，存在绕过版本登记补结构的路径。
- `.gitignore` 已忽略常见 `.db`、WAL、备份和密钥；需要补充其它 SQLite 扩展名及结构报告等运行产物。制品使用白名单目录组装，需要继续检查禁止文件。

## 尚未确认

审计开始时部署机真实数据库路径、启动方式、实际结构和迁移记录未提供。开发库版本 7 不能证明生产库也是版本 7。部署机必须先执行只读结构检查；仅同步代码与制品，不把真实业务数据传给开发机。

用户随后确认旧库路径为 `D:\Applications\scienceing-account-manager\data\scienceing.db`。源码现有启动/停止入口是 `deploy-lan/start.bat` / `stop.bat`，底层调用 `deploy.mjs start/stop`。新只读工具确认开发库实际结构匹配 v6/v7（两者只有数据迁移差异），`integrity_check`、`foreign_key_check` 均通过；生产结构仍未取得，不能推定一致。

部署机可先运行（输出仅结构及迁移登记）：

```powershell
python -c "import sqlite3,pathlib,json,sys; p=pathlib.Path(sys.argv[1]).resolve(strict=True); d=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True); d.execute('PRAGMA query_only=ON'); s=d.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').fetchall(); h=d.execute('SELECT version,name,applied_at FROM schema_migrations ORDER BY version').fetchall() if any(r[1]=='schema_migrations' for r in s) else []; print(json.dumps({'schema':s,'migrations':h},ensure_ascii=False,indent=2)); d.close()" "D:\Applications\scienceing-account-manager\data\scienceing.db" > prod-schema.json
```

## 实施方案及拟修改文件

复用原生迁移系统，不引入第二套框架。保留历史 SQL，用迁移执行器维护 SHA256 登记；迁移前以在内存重放同版本 SQL 得到的结构核对实际结构。无历史登记的非空库必须显式选择基线，结构不匹配时禁止登记。老登记补校验值只发生在结构匹配以后，这代表对当前发布迁移定义建立可信起点，不能证明过去执行过的 SQL 从未被改写。

- 数据库：`config.ts`、`migrate.ts`、`migrations/migration.ts`、`database.service.ts`、`backup.ts`、`backup-scheduler.service.ts`、`maintenance.ts`、`verify.ts`、`reencrypt-account-passwords.ts`；新增 `schema.ts`；调整数据库测试及后端命令。
- Windows：新增 `deploy.cmd`；修改 `deploy-release.ps1`、`create-release.ps1`、`deploy-lan/scripts/{deploy.mjs,lib.mjs,release-common.ps1,db-doctor.mjs}`、开发入口 `scripts/dev.mjs`、根 `package.json`、`.gitignore` 和部署测试。
- 文档：`DEPLOYMENT.md`、`deployment/{deploy.md,backup-rollback.md}`、`deploy-lan/docs/db-schema-doctor.md` 和本报告。
- 历史 `001–007` 的 version、name、SQL 均不修改。

备份改用 Node 的 SQLite Backup API（Node 22.16+ 或包含此 API 的更新版本），校验同时执行完整 `integrity_check` 和 `foreign_key_check`。生产启动只验证版本、结构、校验值，不同步模型或补结构。发布失败必须确认新服务完全停止后才恢复数据库；停止失败时留在停服/人工处理状态，禁止冒险恢复或启动新版本。

## 验收与边界

在临时旧版数据库副本中测试 1–7 的全部升级，断言业务行、主键和外键保留、重复迁移为零、历史 SQL 变更被拒绝、失败事务无半成品、备份可恢复、复杂表调整及约束失败不损失数据。Windows 测试使用临时安装目录和受控服务，不操作现有业务库。

部署机真实旧库副本验收只能留在部署机完成；未取得真实结构/验收结果以前不能声称生产库已核对或上线成功。

## 实施后验证结果

已完成以上代码与文档改造，复用原迁移系统，没有新增数据库框架或运行依赖。历史 001–007 文件无差异，原工作区的其它改动保留。

| 验证 | 结果 |
| --- | --- |
| `pnpm --filter @scienceing/server build` | 通过 |
| `pnpm --filter @scienceing/server test` | 35 项通过，含旧 v1–v7 副本升级、原字段/记录保留及失败恢复 |
| `node --test scripts/test/powershell-encoding.test.mjs scripts/test/db-doctor-target.test.mjs scripts/test/deploy-utils.test.mjs scripts/test/gateway-resilience.test.mjs` | 16 项通过，含 Windows PowerShell 5.1 解析、只读目标选择及进程归属 |
| `pnpm test:deploy-sqlite` | 2 项通过，覆盖首次导入、重复部署、迁移失败、启动失败、旧/新服务停止失败；另实际启动并停止临时网关，拒绝错误 PID |
| 改动的数据库及部署 JavaScript/TypeScript 文件 ESLint | 通过 |
| Git 差异空白检查、历史 SQL 差异、数据库/密钥跟踪文件检查 | 通过；历史 SQL 无变更，没有跟踪数据库或密钥文件 |

共 53 项自动测试通过。Windows 编排测试使用临时合成业务库和应用进程替身，备份、迁移、完整性/外键/密钥校验及恢复运行真实工具；停止命令另用自己的临时进程验证。没有把这些结果当作真实生产库验收。正式命令、只读检查、部署机副本演练及恢复流程见根目录 `DEPLOYMENT.md`。
