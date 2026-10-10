# Windows 安全发布与 SQLite 版本迁移

先阅读 [审计报告](docs/sqlite-windows-audit.md)。本次改造没有连接部署机，也没有迁移真实生产库；生产结构比较和真实旧库副本验收需要在部署机完成。

## 1. 运行要求与目录

开发、部署均支持普通 Windows 用户，无需 Windows 服务、任务计划、管理员权限或防火墙改动。使用 Node 24 免安装版，或支持 `sqlite.backup` 的 Node 22.16+。[Node 官方 Backup API 文档](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html)。Python 可用于初次只读检查；正式迁移和备份复用项目原生 `node:sqlite`，没有增加 Python 迁移框架或第三方依赖。

默认生产目录是 `%LOCALAPPDATA%\scienceing-account-manager\production`。可通过 `-InstallRoot` 指定其它可写位置，但必须在代码/发布目录之外，后续部署始终使用同一个目录。

```text
production\
  .env                       原生产配置，保留原 SCIENCEING_MASTER_KEY
  config.env                 网关端口等非敏感配置
  current.json               仅全部验证成功后更新的版本指针
  releases\vX.Y.Z\           只放程序和依赖
  data\scienceing.prod.db    唯一生产库，发布包不包含此文件
  backups\                   Backup API 快照，保留 30 天
  run\                       PID、部署锁和日志
  playwright\.auth\          原部署机的登录态，禁止传回开发机
```

默认开发库是 `%LOCALAPPDATA%\scienceing-account-manager\development\data\scienceing.dev.db`；`SCIENCEING_DEV_DIR` 可覆盖开发数据根目录。`pnpm dev` 只会从仓库中旧的 `data/scienceing.dev.db` 通过 Backup API 导入开发库，不会导入 `scienceing.db` 或生产库。旧开发库保留原位。开发和生产数据库后缀与目录分离。

## 2. 部署机先只读检查

已确认旧生产库路径：`D:\Applications\scienceing-account-manager\data\scienceing.db`。源码中的原启动、停止入口为该项目的 `deploy-lan\start.bat`、`stop.bat`，分别调用 `deploy.mjs start/stop`。不要先把新源码覆盖到正在运行的旧目录。

部署机尚未取得新制品时，可以执行以下命令。输出只含结构及迁移登记，没有业务记录；检查不会迁移、补列或创建数据库。

```powershell
python -c "import sqlite3,pathlib,json,sys; p=pathlib.Path(sys.argv[1]).resolve(strict=True); d=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True); d.execute('PRAGMA query_only=ON'); s=d.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').fetchall(); h=d.execute('SELECT version,name,applied_at FROM schema_migrations ORDER BY version').fetchall() if any(r[1]=='schema_migrations' for r in s) else []; print(json.dumps({'schema':s,'migrations':h},ensure_ascii=False,indent=2)); d.close()" "D:\Applications\scienceing-account-manager\data\scienceing.db" > prod-schema.json
```

收到新 ZIP 后，将其解压到任意临时工具目录，例如 `D:\scienceing-incoming\tools`，在里面执行：

```powershell
node .\apps\server\dist\db\schema.js --database "D:\Applications\scienceing-account-manager\data\scienceing.db" > prod-schema.json
if ($LASTEXITCODE -ne 0) { throw '只读检查失败，禁止部署' }
Get-Content .\prod-schema.json
```

检查输出包括 `integrity_check`、`foreign_key_check`、结构指纹、`history` 及 `matchingVersions`。迁移器会在事务中再次比较实际结构与对应版本的迁移定义，检查全部表、字段、约束、索引、视图和触发器，差异不会自动修复。

- 有旧迁移登记但没有 `checksum`：实际结构必须匹配原登记的连续版本后，才补 SHA256，并保留原 `applied_at`。这是对当前发布定义建立校验值基线，不是对过去 SQL 的追溯证明。
- 没有登记且有业务表：必须根据原发布版本/部署记录明确选择基线，才可传 `-BaselineVersion N`。即使 `matchingVersions` 只包含一个版本，也不会自动登记。
- 多个版本结构可能相同（当前 v6 与 v7 仅数据规则不同）。不能根据表结构判断数据迁移是否已执行，也不能照抄开发库的版本号。
- 缺表、缺列、未知索引、约束差异、登记缺口、未知版本、校验值变化或外键违规：先停止本次发布，基于部署机本地副本查明原因，追加明确的新迁移；禁止 `db-doctor --fix`、模型同步或手工伪造版本记录。

结构报告保留在部署机即可。若需要诊断，只分享结构报告；绝不上传 `.db`、WAL/SHM、备份、`.env` 或登录态。

## 3. 开发机打包及热点传输

先审阅并提交本次改造，确保新 Tag 包含迁移工具、部署脚本和测试。`create-release.ps1` 只从指定 Tag 的干净快照构建，不会把工作区未提交文件打包。以下版本号仅为示例，必须换成未发布的新版本。

```powershell
node node_modules/typescript/bin/tsc -p apps/server/tsconfig.json
pnpm --filter @scienceing/server test
pnpm test:deploy-sqlite
pnpm test:release-scripts

$tag = 'v1.2.3' # 替换为未发布的版本
# 审阅、提交改造后再创建 Tag
git tag -a $tag -m "release $tag"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\create-release.ps1 -Tag $tag -OutputDirectory "$env:USERPROFILE\Downloads\scienceing-releases"
```

无需 LAN bare Git。已有 LAN Git 的工作流仍可运行 `make-release.ps1`，或给 `create-release.ps1` 显式传 `-LanGitPath` 核对远端 Tag。

只单向传输 `scienceing-vX.Y.Z.zip` 与同名 `.zip.sha256` 到部署机，例如 `D:\scienceing-incoming`。手机热点只负责传输文件；SMB 不可用时可使用已有文件传输工具，无需在部署机新建共享或开放端口。SHA256 校验必须保留。

制品包含 server/web/worker 的生产依赖、迁移文件、部署入口和说明；部署机无需 pnpm，也不在线安装依赖。打包拒绝数据库、SQLite sidecar、备份、日志、密钥、`.env`、认证状态及符号链接；已发布的同名制品禁止覆盖。

## 4. 在部署机使用真实旧库副本验收

副本必须留在部署机。以下命令用新工具读取原库并生成包含已提交 WAL 的一致副本，原库保持原位。`$candidate` 指向新 ZIP 解压目录；`$testRoot` 必须在此目录之外。

```powershell
$candidate = 'D:\scienceing-incoming\tools'
$testRoot = Join-Path $env:LOCALAPPDATA 'scienceing-account-manager\rehearsal'
$testDb = Join-Path $testRoot 'data\scienceing.prod.db'
# 目标必须不存在；重复演练时换一个新的 testRoot，不能覆盖旧副本。
node "$candidate\apps\server\dist\db\maintenance.js" import --source "D:\Applications\scienceing-account-manager\data\scienceing.db" --target $testDb
if ($LASTEXITCODE -ne 0) { throw '生成演练副本失败' }
Copy-Item -LiteralPath 'D:\Applications\scienceing-account-manager\.env' -Destination "$testRoot\.env"
Set-Content -LiteralPath "$testRoot\config.env" -Encoding ASCII -Value "LAN_IP=127.0.0.1`nGATEWAY_MODE=node"
node "$candidate\apps\server\dist\db\schema.js" --database $testDb > "$testRoot\before-schema.json"

$env:NODE_ENV = 'production'
$env:SCIENCEING_RUNTIME_DIR = $testRoot
$env:DATABASE_PATH = $testDb
$env:SCIENCEING_BACKUP_DIR = Join-Path $testRoot 'backups'
# db:verify 将从演练目录 .env 加载部署机原密钥，不打印或同步。
node "$candidate\apps\server\dist\db\migrate.js"
# 只有没有版本记录且明确确认基线时，上面这一行加 --baseline N。
if ($LASTEXITCODE -ne 0) { throw '演练迁移失败，禁止正式部署' }
node "$candidate\deploy-lan\scripts\deploy.mjs" db:verify
if ($LASTEXITCODE -ne 0) { throw '完整性、版本或密钥验证失败' }
node "$candidate\apps\server\dist\db\migrate.js"
# 应输出已应用 0 个迁移。
```

副本验收完成后，关闭演练进程，清除本次临时环境变量或在新的 PowerShell 窗口正式部署：

```powershell
Remove-Item Env:NODE_ENV, Env:SCIENCEING_RUNTIME_DIR, Env:DATABASE_PATH, Env:SCIENCEING_BACKUP_DIR -ErrorAction SilentlyContinue
```

在部署机本地比较用户、账号、租约、审计、回收任务、会话等关键业务记录的数量、主键、字段和密文；只有系统设置的历史单位转换是 003/007 已定义的预期变化。验证账号密码仍能用原密钥解密。真实业务样本和比较结果不得传回开发机。

开发机自动测试已使用合成旧 v1–v7 的 WAL 库副本，逐表比较原字段和记录，另覆盖基线拒绝、重复迁移、历史篡改、事务失败、换表、类型转换、非空约束及外键错误。`pnpm test:deploy-sqlite` 用真实数据库工具和应用进程替身验证 Windows 编排的成功及故障路径，并启动临时网关验证实际停止命令及错误 PID 拒绝。真实生产副本的业务验收仍以上述部署机结果为准。

## 5. 正式部署命令

在新 ZIP 解压工具目录打开新 PowerShell 窗口。首次切换必须显式指定已确认的原库，原库的 `-wal/-shm` 保持同目录，不手工只复制主文件。

```powershell
$install = Join-Path $env:LOCALAPPDATA 'scienceing-account-manager\production'
.\deploy.cmd -Tag v1.2.3 -ReleaseDirectory "D:\scienceing-incoming" -InstallRoot $install -LegacyDatabasePath "D:\Applications\scienceing-account-manager\data\scienceing.db"
if ($LASTEXITCODE -ne 0) { throw '部署未成功，请查看 run 中的部署日志' }
```

若原库没有迁移记录，只有在只读检查及发布记录确认基线后，才给上述命令增加 `-BaselineVersion N`。有旧登记且缺少校验值时不传此参数。

后续升级：

```powershell
.\deploy.cmd -Tag v1.2.4 -ReleaseDirectory "D:\scienceing-incoming" -InstallRoot $install
# 或自动选择本地 incoming 目录中 semver 最大的制品：
.\deploy.cmd -ReleaseDirectory "D:\scienceing-incoming" -InstallRoot $install
```

保留 SMB 工作流时省略 `-ReleaseDirectory`，使用既有 `-DevHost/-ShareName`。部署机不需要 Git；显式本地制品模式跳过 Git/网络同步，但始终核对 ZIP SHA256、制品版本与编译迁移版本。

执行顺序：校验制品 → 停止旧应用并确认端口释放 → Backup API 备份 → 结构/历史检查及整批事务迁移 → `integrity_check`、`foreign_key_check`、校验值和密钥校验 → 打包扩展 → 启动 → 后端和网关 HTTP 验证、状态检查 → 更新 `current.json`。

任何迁移或验证失败都不会启动新版本。迁移整批回滚；如果数据库可能已变化，先确认新进程完全停止，再恢复发布前快照，并尝试启动保留的旧版本。停止或恢复失败时停止自动操作，保留所有原文件和备份，等待人工处理。首次导入的原库始终保留在原路径。

生产应用启动只验证迁移状态，禁止创建缺失数据库、迁移、补字段、同步模型或重建表。空环境专用 `-Initialize` 不得用于已有业务数据库。

## 6. 运行、验证与人工恢复

日常启动/停止使用当前 Release 中的 CLI，显式绑定稳定运行目录：

```powershell
$install = Join-Path $env:LOCALAPPDATA 'scienceing-account-manager\production'
$current = Get-Content "$install\current.json" -Raw | ConvertFrom-Json
$release = Join-Path $install "releases\$($current.version)"
$env:SCIENCEING_RUNTIME_DIR = $install
node "$release\deploy-lan\scripts\deploy.mjs" status
node "$release\deploy-lan\scripts\deploy.mjs" stop
node "$release\deploy-lan\scripts\deploy.mjs" start
```

部署成功后再次确认日志、`current.json` 和 `status` 均指向目标版本；看板可以访问，并在 `/api/extension/config` 返回正常配置，原账号、租约及审计记录可见。保留旧 Release，才能在失败时启动匹配旧结构的程序。

自动恢复失败时，先处理未停止的应用。确认停止后使用失败 Release 的恢复工具；备份路径取本次部署日志的“发布前备份”，不能随意选择最近的每日备份。

```powershell
$failed = Join-Path $install 'releases\v1.2.4' # 替换成失败版本
$backup = 'C:\替换为本次发布前备份的完整路径.db'
node "$failed\deploy-lan\scripts\deploy.mjs" stop
if ($LASTEXITCODE -ne 0) { throw '应用未停止，禁止恢复' }
node "$failed\deploy-lan\scripts\deploy.mjs" db:restore --source $backup
if ($LASTEXITCODE -ne 0) { throw '恢复未完成，保留所有文件并排查' }
node "$release\deploy-lan\scripts\deploy.mjs" start
if ($LASTEXITCODE -ne 0) { throw '原版本启动失败，不得改用不兼容的新版本' }
```

恢复会通过 Backup API 验证快照，保留原主库及 WAL/SHM 为 `.failed-*` 文件，保护原始内容。不要用文件复制覆盖正在运行的数据库，不要删除 WAL/SHM，不要修改密钥，不要执行 seed、dev:reset 或任何 DROP/重建“修复”。`.partial-*` 或空的备份占位文件表示备份/导入被中断，不作为成功快照；空生产文件也禁止自动建库。

## 7. 后续迁移编写约定

只新增 `apps/server/src/db/migrations/008_name.ts` 等新文件，并在 `migrations.ts` 末尾登记连续版本。已发布的 version、name、SQL、检查条件和外键选项不改写；SHA256 和历史定义锁定测试会阻止变更。

- 新表、字段和索引使用 SQL；无须 ORM 同步。
- 复杂变更用“新表 → 显式列映射搬数据 → 校验 → 换表 → 恢复索引/触发器/视图”。需要关闭外键时设置 `foreignKeysOff: true`；执行器在事务前关闭，在提交前检查，结束后恢复。
- 删除字段前在归档表保留原字段及主键；修改类型前验证 NULL、格式、范围、转换可逆性；添加非空约束必须先回填有效值或拒绝脏数据，不能静默丢行。
- `preconditions` 是搬迁前的只读违规查询，`checks` 是搬迁后的只读违规查询。返回任何行则整批回滚。例如 `SELECT id FROM source EXCEPT SELECT id FROM target` 检查遗漏主键；`SELECT 1 WHERE (SELECT COUNT(*) FROM source) != (SELECT COUNT(*) FROM target)` 检查数量。不能直接使用无条件 `SELECT COUNT(*)`，它永远返回一行。
- 迁移 SQL 禁止事务控制、PRAGMA、ATTACH 和修改 `schema_migrations`。执行器管理整批事务，结构变更、数据变更、版本、UTC 执行时间与校验值在同一事务提交。
- 先跑旧库副本测试及失败恢复测试，再发新 Tag。回滚程序时必须同时恢复匹配的数据库快照；不执行自动 down migration。
