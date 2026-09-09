# 数据库结构不更新？——db-doctor 体检与自愈

## 1. 现象

新功能（使用手册 v4、首次登录强制改密 v5、扩展认领 v6、小时级超时参数 v7）在开发机正常，
但代码通过 **git（bare repo / clone / pull）同步到生产机** 后功能不生效，典型如：

- 新建用户 / CSV 导入用户后，登录不会被要求修改初始密码；
- 使用手册、数据看板页面 404 或空白；
- 后端日志出现 `no such column: must_change_password` 之类报错。

## 2. 根因

`.gitignore` 忽略了 `dist/`、`node_modules/`、`*.db` 等，因此 git 同步**只带源码**：

| 内容 | 是否随 git 同步 | 说明 |
| --- | --- | --- |
| `apps/server/src/**`（源码、迁移 TS） | ✅ | 一定是最新 |
| `apps/server/dist/**`（后端编译产物） | ❌ | 仍是旧版本，`migrate()` 只跑到旧 schema |
| `apps/web/dist/**`（前端产物） | ❌ | 新页面不存在 |
| `data/*.db`（数据库） | ❌ | 生产机自己的库 |

后端启动时 `DatabaseService` 会执行 `migrate()`，但它跑的是 **dist 里那份 MIGRATIONS 列表**。
dist 没重新编译 → 迁移 004~007 从未执行 → 表/列不创建 → 新功能不生效。

## 3. 一键体检（生产机，无需管理员权限）

在 PowerShell 中进入项目目录后执行：

```powershell
node deploy-lan\scripts\db-doctor.mjs
```

输出示例（结构落后时）：

```
  数据库       : D:\...\data\scienceing.prod.db（200 KB）
  迁移来源     : 源码 src/db/migrations（最新）
  期望版本     : v7
  已应用版本   : 1, 2, 3
  待应用迁移   : v4(add_manuals), v5(add_first_login_flag), ...
  缺失列       : users.first_login_at, users.must_change_password
  结论         : ✘ 结构落后
```

- 自动探测顺序：`DATABASE_PATH` 环境变量 → `data\scienceing.prod.db` → `data\scienceing.dev.db` → `data\scienceing.db`
- 指定库：`node deploy-lan\scripts\db-doctor.mjs --database D:\xxx\scienceing.prod.db`
- 结构落后时退出码为 `1`，可直接用于脚本判断

> db-doctor 直接解析 `apps/server/src/db/migrations/*.ts` 的 SQL，**不依赖编译产物**；
> 若生产机只有 release 包（无 src），会自动回退到 `dist/db/migrations.js`。

## 4. 修复

### 4.1 只补数据库结构（救急，5 秒完成）

```powershell
node deploy-lan\scripts\db-doctor.mjs --fix
```

- 修改前自动备份为 `<库名>.doctor-backup-<时间戳>`（不需要可加 `--no-backup`）
- 幂等：表/列/索引已存在则跳过，重复执行无副作用
- 同时登记 `schema_migrations`，后续 `db:verify` 也能通过
- 已登记过迁移但列实际缺失的情况（人工改过表）也会补列

### 4.2 让代码也变成新的（必须做，否则功能仍是旧逻辑）

补完结构后**必须重新编译并重启**，否则运行的还是旧 dist：

```powershell
# 有 node_modules（能编译）的机器
node node_modules\typescript\bin\tsc -p apps\server\tsconfig.json
node deploy-lan\scripts\deploy.mjs stop
node deploy-lan\scripts\deploy.mjs db:doctor --fix
node deploy-lan\scripts\deploy.mjs start          # start 内部已自动跑一次 db-doctor --fix
```

前端新页面（/manual、/admin/dashboard）同样需要重新构建：

```powershell
node deploy-lan\scripts\deploy.mjs build          # server + worker + web + 扩展打包
```

若生产机没有 `node_modules`（git 不同步），请在开发机生成 release 包后走正式发布：

```powershell
# 开发机
git tag v1.4.0 && git push lan v1.4.0
.\create-release.ps1 -Tag v1.4.0
# 生产机
.\deploy-release.ps1 -Tag v1.4.0
```

### 4.3 让存量用户下次登录强制改密（可选）

补齐字段**不会**把老用户标记为"需要改密"（存量默认 0，是刻意设计）。若要让存量账号也走一次强制改密：

```powershell
node deploy-lan\scripts\db-doctor.mjs --fix --set-must-change all              # 所有启用账号（含 admin）
node deploy-lan\scripts\db-doctor.mjs --fix --set-must-change zhangsan,lisi    # 只置位指定账号
```

不带 `--fix` 时只试算、不写入（输出"仅试算未写入"）。

## 5. 防复发

- `deploy.mjs start` / `deploy` / `update` 在启动后端前会自动执行 `db-doctor --fix`，
  即使 dist 是旧的也能把库结构补齐；
- 若检测到「源码迁移数 > dist 迁移数」会在部署日志里打印告警，提示重新编译；
- 新增子命令：`node deploy-lan\scripts\deploy.mjs db:doctor [--fix] [--database <path>]`。

## 6. 排查清单

| 检查项 | 命令 |
| --- | --- |
| 生产库实际路径 | `node deploy-lan\scripts\deploy.mjs env:print` 看 DATABASE_PATH；或看 `deploy-lan\run\backend.log` |
| 当前结构版本 | `node deploy-lan\scripts\db-doctor.mjs` |
| 代码 schema 期望版本 | `node apps\server\dist\db\schema-version.js`（应与上一条一致） |
| 后端是否最新代码 | 对比 `apps\server\src\db\migrations` 与 `apps\server\dist\db\migrations` 文件数 |
| 后端健康 | `node deploy-lan\scripts\deploy.mjs status` |
