# 开发机 → 生产机发布

生产机只从开发机 LAN Git/SMB 获取 Tag 与 Release，不访问 GitHub，也不需要 pnpm/npm。开发库固定为 `data/scienceing.dev.db`；生产库固定为 `D:\Applications\scienceing-account-manager-app\data\scienceing.prod.db`，两者禁止复制或复用。

## 1. 开发机发版

开发机 `1399-IT-100158` 上先提交全部改动，再创建正式 Tag：

```powershell
git tag -a v1.2.3 -m "v1.2.3"
git push lan main
git push lan v1.2.3
.\create-release.ps1 -Tag v1.2.3
```

脚本从 Tag 的干净快照构建并测试，输出：

```text
E:\git-local-share\releases\scienceing-v1.2.3.zip
E:\git-local-share\releases\scienceing-v1.2.3.zip.sha256
```

ZIP 自带 server/web/worker 的生产运行依赖，包含 `release.json`（`version`、`commit`、`schemaVersion`），并拒绝打包数据库、`.env`、日志、备份、密钥或符号链接。已发布的同名版本不能覆盖。

## 2. 生产机同步与部署

首次切换已有生产库时，传入旧主库路径；同目录下的 `scienceing.db-wal`、`scienceing.db-shm` 必须保持原位：

```powershell
.\sync-from-dev.ps1
.\deploy-release.ps1 -Tag v1.2.3 `
  -LegacyDatabasePath "D:\旧项目\data\scienceing.db"
```

脚本会从 `1399-IT-100158` 解析可用 IPv4，将 remote 动态改为 `//<IP>/git-local-share/scienceing.git` 并执行 `git fetch lan --tags`。SMB 同样使用 IP，规避主机名认证失败。

首次导入通过 SQLite `VACUUM INTO` 生成一致快照，能包含 WAL 中已提交的数据；旧 `scienceing.db`、`-wal`、`-shm` 不会被改写。必须沿用旧项目 `.env` 中的 `SCIENCEING_MASTER_KEY`，否则密文校验失败并终止部署。

后续升级只需：

```powershell
.\deploy-release.ps1 -Tag v1.2.4
```

生产目录：

```text
D:\Applications\scienceing-account-manager-app\
  .env                    # 稳定生产配置，不进 Release
  config.env              # LAN/网关配置
  current.json            # 当前版本指针
  packages\               # 下载的 ZIP/SHA256
  releases\vX.Y.Z\        # 每个版本独立目录
  data\scienceing.prod.db # 唯一生产主库
  backups\                # SQLite 一致性快照
  run\                    # PID 与日志
  nginx-prefix\
  extension-lan\
```

部署顺序固定为：校验制品 → 停旧版 → 强制备份 → 逐个 migration → 数据与密钥校验 → 打包 LAN 扩展 → 启动并健康检查 → 更新 `current.json`。任一步失败都不会更新当前版本指针；若数据库可能已变化，会自动恢复发布前快照并重启上一版本。失败版本目录保留供排查，同一 Tag 仍可重试，但正式制品不可重写。

## 3. Migration 约定

迁移位于 `apps/server/src/db/migrations/`，按 `NNN_name.ts` 递增，并在 `apps/server/src/db/migrations.ts` 末尾登记。

- 已发布 migration 的 `version`、`name`、SQL 永不修改，只追加新版本。
- 每个 migration 使用独立 `BEGIN IMMEDIATE` 事务；失败自动 rollback。
- `schema_migrations` 只登记成功项，启动或部署时只执行未登记项。
- 表/字段删除等不可逆操作应采用“新表 → 搬数据 → 校验 → 换表”的 SQLite 迁移方式。

新增迁移后运行：

```powershell
node node_modules/typescript/bin/tsc -p apps/server/tsconfig.json
node --test --test-isolation=none apps/server/dist/db/migrate.test.js apps/server/dist/db/backup.test.js
```

## 4. 备份策略

- 每次发布前强制生成 SQLite 一致性快照；失败即停止发布。
- Node 服务每天本地时间 `02:00` 自动备份，自动删除超过 30 天的备份。
- 应用启动时若最近备份已超过 24 小时，会在迁移和监听端口前立即补备份；失败则拒绝启动。
- 定时器属于当前 NestJS 服务，不依赖 Windows 任务计划程序；每日任务失败后每小时重试。

不要手工复制正在运行的 `.db` 文件，也不要把开发库放入 Release。恢复应由 `deploy-release.ps1` 自动完成；人工排障可在停服后使用版本目录中的 `deploy.mjs db:backup|db:restore|db:verify`。
