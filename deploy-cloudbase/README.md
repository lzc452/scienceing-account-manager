# CloudBase 云托管部署方案（测试阶段）

目标：不买云服务器、不买域名，前端与后端跑在**同一个容器**里，所有业务接口与登录行为不变，
SQLite 数据落到持久化存储上，并且**在持久化验证通过之前不宣称具备生产运行能力**。

---

## 1. 项目识别结果（自动分析）

| 项 | 识别结果 |
|---|---|
| 仓库形态 | pnpm workspace（`apps/*`、`packages/*`、`playwright/*`），`packageManager: pnpm@11.20.0`，Node `>=22.16` |
| 前端 | `apps/web`：Vue 3 + Vite 6 + Tailwind 4，`type=module`，构建 `vite build --configLoader native` → `apps/web/dist` |
| 后端 | `apps/server`：NestJS 11（Express），tsc 编译 CommonJS → `apps/server/dist/main.js`，全局前缀 `/api`，监听 `process.env.PORT`（默认 3000） |
| 共享包 | `packages/shared`：后端只引用 `@scienceing/shared/password-policy`（纯 JS 子路径），前端同样只用该子路径 |
| Worker | `playwright/worker`：Playwright 驱动 Chromium/Chrome 登录科应后台改密，由后端以子进程 `node cli.js` 调用 |
| 数据库 | **`node:sqlite`（内置 `DatabaseSync`）**，启用 WAL、外键、`busy_timeout=5000`；路径由 `DATABASE_PATH` 决定，生产库必须命名为 `*.prod.db` 且**位于应用目录之外**；生产启动只校验、不自动建表 |
| 备份 | `db/backup.ts`：SQLite Backup API 生成一致性快照到 `SCIENCEING_BACKUP_DIR`；每日 02:00 自动备份，保留 30 天 |
| 迁移 | `apps/server/src/db/migrations/00N_*.ts` + `schema_migrations`（含 checksum）；`db:migrate` 增量、单事务、失败整批回滚 |
| 登录 | 后端 httpOnly cookie 会话（`sameSite=lax`，HTTPS 下 `secure=true`），前端只把 token 放在内存 |
| 前端请求路径 | `apps/web/src/api/index.js` 已是 `const API_BASE = '/api'`，全仓库前端源码**没有** `localhost:3000` 之类硬编码，天然满足"统一 /api"要求 |
| 现有部署 | `deploy-lan`（Windows 内网，nginx/零依赖网关）、`deploy-cloud`（轻量服务器 Docker Compose + nginx TLS），都不适用于云托管 |

结论：技术栈不需要改动，需要解决的是**单端口、单容器、持久化、停机迁移**四件事。

---

## 2. 平台约束与选型

云托管（CloudBase Run）的硬约束（已核对官方文档）：

- 只支持 HTTP，**不支持通过公网 IP 访问**，一个服务只能有一个监听端口（1–61000，不能 9100）；
- **不支持 Docker Compose**，不面向"数据库/Redis 等有状态服务"；
- 服务创建后分配的系统默认域名**仅用于测试**，不承诺 SLA，生产必须绑定已备案自有域名；
- 实例数可 0–50 自动伸缩；关闭自动伸缩（最小=最大=1）可锁定单实例以保住异步任务。

三个候选方案：

| 方案 | 改动量 | 数据风险 | 结论 |
|---|---|---|---|
| **A. 单容器（前端静态 + NestJS）+ CFS 挂载 SQLite + 单实例** | 小（新增静态托管与健康检查，入口脚本编排迁移） | 中（SQLite over NFS，必须用 delete journal 且禁止多实例写） | **采用（测试阶段）** |
| B. 前端上静态托管、后端单独云托管服务 | 中（跨域、cookie、CORS、扩展域名全部要改） | 低 | 不采用：违背"前后端同容器"，且收紧的 CORS 与 cookie 策略要重做 |
| C. 换 PostgreSQL / CloudBase 数据库 | 大（迁移层、SQL 方言、备份逻辑全部重写） | 低 | 不作为本次范围；是后续"生产化"的正解 |

方案 A 的本质是：把原来 nginx 网关做的三件事（托管静态、SPA 回退、`/api` 同源）合并进 Node 进程，
把原来部署机的 `db:migrate` 搬进容器入口脚本，把原来本地卷的 `/data` 换成 CFS 挂载点。

---

## 3. 目标架构

```
浏览器 / 扩展
   │  HTTPS（平台分配的默认域名，测试期）
   ▼
CloudBase 云托管（单服务、单实例、单端口 8080）
   │
   ├── /api/*  → NestJS 路由（鉴权/账号池/租约/审计/看板/手册/扩展）
   └── 其它 GET → 内置静态托管（apps/web/dist，SPA 回退，/downloads 404 语义，CSP 安全头）
        │
        ▼
   /data/scienceing.prod.db  ← CFS 挂载（NFS）：唯一数据源
   /backup/*.db               ← CFS 挂载：预发布快照 + 每日 02:00 备份（保留 30 天）
   /data/state/admin.json     ← 科应后台登录态（Worker 用）
```

镜像内不含任何密钥与业务数据；`/app` 只读代码与编译产物。

---

## 4. 本次改动的文件

| 文件 | 作用 |
|---|---|
| `Dockerfile`（仓库根） | 多阶段构建：pnpm install → tsc/vite/worker 编译 → 精简运行层（含 Chromium）；单端口 8080 |
| `.dockerignore` | 排除 `node_modules`、`dist`、`data/*.db`、`.env`、`*.pem`、日志与开发资产 |
| `deploy-cloudbase/entrypoint.sh` | 写权限探测 → 扩展包覆盖 → 可选维护模式 → 降权 → 备份 → 迁移 → 校验 → 启动并转发信号 |
| `deploy-cloudbase/.env.example` | 环境变量清单与取值理由（真实值只填控制台） |
| `deploy-cloudbase/cloudbaserc.json` | CLI 部署入口（服务名、构建目录、Dockerfile） |
| `deploy-cloudbase/scripts/smoke.mjs` | 核心接口冒烟：健康、首页、SPA 回退、404 语义、安全头、扩展配置、登录会话 |
| `deploy-cloudbase/scripts/verify-persistence.mjs` | 重启前后会话复用验证（持久化门禁） |
| `apps/server/src/lib/web-static.ts` | 仅在 `WEB_DIST_DIR` 存在时启用的静态托管（不影响开发与 nginx 部署） |
| `apps/server/src/health/live.controller.ts` | 公开 `GET /api/health`（DB/迁移/存储/备份/uptime） |
| `apps/server/src/db/connection.ts` | journal 模式可通过 `SCIENCEING_SQLITE_JOURNAL` 指定，并**校验实际生效值** |
| `apps/server/src/main.ts` | 接线静态托管（`WEB_DIST_DIR` 未设置则完全不注册） |

前端源码**未改动**：`API_BASE` 本来就是 `/api`，无需替换 localhost。

---

## 5. 关键设计说明

### 5.1 单进程同时提供前端与 API

- 中间件只处理 `GET/HEAD`，且**显式放行 `/api` 与 `/api/*`**，Nest 路由不受影响；
- 未知路由回落 `index.html`（`createWebHistory` 刷新不 404）；
- `/downloads/*` 缺失返回 **404 文本**，绝不回落 HTML（否则用户"下载"到一个网页）；
- `/assets/*` 一年强缓存（文件名含 hash），其它 `no-cache`；
- 响应头与 `deploy-lan/scripts/gateway.mjs` 完全一致：CSP `script-src 'self'`、`style-src 'self' 'unsafe-inline'`、`img-src 'self' data:`、`frame-ancestors 'none'`。

### 5.2 SQLite 持久化（本方案最关键的一处）

- 数据目录 = CFS 挂载点 `/data`，库文件 `/data/scienceing.prod.db`（满足 `db/config.ts` 对 `*.prod.db` 与"在应用目录之外"的断言）；
- **CFS 是 NFS 协议，SQLite 的 WAL 依赖 `-shm` 共享内存映射，官方明确不支持网络文件系统**。因此容器默认 `SCIENCEING_SQLITE_JOURNAL=delete`，并在非 WAL 模式下把 `synchronous` 固定为 `FULL`；
- `openDatabase()` 打开后会读取 `PRAGMA journal_mode` 并与期望值比对，不一致**直接抛错退出**（SQLite 对无法切换的模式是静默保持原值，不校验就会误以为在跑 WAL）；
- **单实例是硬要求**：最小实例数 = 最大实例数 = 1。多实例共享同一个 SQLite 文件会出现写锁竞争与数据风险，云托管也不会替你做文件锁仲裁；
- 启动时若备份目录超过 24 小时没有新快照，会自动补一次 `startup-catchup` 备份。

### 5.3 迁移与"更新不覆盖历史数据"

`entrypoint.sh` 的顺序是固定的：

1. 数据目录**写探测**（不可写立即失败，避免静默写到容器临时盘）；
2. 库不存在 → 需显式 `ALLOW_DB_INIT=1` 才建库；建库后按 `SEED_ON_INIT` 写种子（管理员/账号池/设置/手册）；
3. 库已存在 → **先做 `predeploy` 快照**，备份失败直接中止发布（不允许"没有回滚点的迁移"）；
4. `db:migrate`（增量、单事务、checksum 校验；重复执行返回 0）；
5. `db:verify`（迁移连续性、结构一致、外键完整性、用当前主密钥能解密存量密文）；
6. 全部通过才 `exec` 启动应用；
7. 迁移过程用 `/data/.deploy.lock` + `flock` 串行化（平台滚动发布时避免两个实例同时迁移）。

`DatabaseService` 在 `NODE_ENV=production` 下仍然"只校验不建表"，所以**没有迁移就没有启动**——这一点被入口脚本的显式步骤接住了。

### 5.4 健康检查

`GET /api/health`（匿名）：

```json
{"status":"ok","version":"0.1.0","uptimeSeconds":8,"node":"v22.22.2",
 "checks":{"database":"ok","schema":"ok","storage":"ok"},
 "schemaVersion":7,"expectedSchemaVersion":7,
 "database":{"file":"scienceing.prod.db","exists":true,"journalMode":"delete"},
 "backup":{"directory":"backup","count":1,"lastBackupAt":"..."}}
```

- 数据库不可读或迁移版本不一致 → **503**（平台不会切流量过来）；
- 存储不可写（CFS 掉挂/只读）→ 200 但 `status=degraded`（能读服务，但备份会失败，需要告警）；
- 不暴露绝对路径、密钥、凭据。

### 5.5 环境变量与密钥

详见 `deploy-cloudbase/.env.example`。必须人工填写的有：

| 变量 | 说明 |
|---|---|
| `SCIENCEING_MASTER_KEY` | 32 字节 hex（**两个 E**）；丢失 = 已入库的科应密码永久不可解 |
| `ADMIN_INITIAL_PASSWORD` | 仅首次初始化使用；建议首登后立即改密并清空该变量 |
| `SCIENCING_ADMIN_URL/USERNAME/PASSWORD` | 科应后台凭据，只走环境变量（PRD §42） |
| `TRUST_PROXY=1` | 平台网关一跳；**不要设 true**，否则客户端可伪造 XFF 绕过登录限流 |
| `SCIENCEING_SQLITE_JOURNAL=delete` | CFS 场景必需 |

镜像里没有任何 `.env`（`.dockerignore` 已排除），密钥只能在控制台注入。

---

## 6. 首次部署

### 6.1 前置（控制台，需人工完成）

1. 开通按量计费的云开发环境（建议与后续 CFS 同地域）；
2. 准备 VPC + 子网，创建 **CFS 文件系统与挂载点**（与云托管同地域、同子网）；
3. 云托管 → 新建服务，选择「本地代码 / 代码包」，构建目录 = 仓库根（`Dockerfile` 在根），监听端口 `8080`；
4. 服务详情 → 启用「私有网络」（选上一步 VPC/子网）→ 启用「存储挂载」：
   - 文件系统 / 挂载点：上一步创建的资源
   - 远程目录 `/` → **实例挂载路径 `/data`**（数据库、状态文件）
   - 再挂一个目录到 **`/backup`**（建议同一文件系统的不同远程目录，如 `/backup`）
5. 实例数：**最小 1、最大 1**（关闭自动伸缩，这是 SQLite 的前提）；
6. 健康检查：路径 `/api/health`，端口 8080，初始延迟 ≥ 45s（镜像较大 + 首次迁移），超时 5s，间隔 30s，失败阈值 3；
7. 日志：默认采集 stdout 即可（应用与入口脚本都写 stdout）。

### 6.2 环境变量

按 `.env.example` 逐项填写。**首次部署**额外设：

```
ALLOW_DB_INIT=1
SEED_ON_INIT=1
ADMIN_INITIAL_PASSWORD=<至少12位>
```

首次启动成功、管理员登录成功后，把 `ALLOW_DB_INIT` 改回 `0`、清空 `ADMIN_INITIAL_PASSWORD`（修改环境变量会生成新版本，可先创建版本再切流量）。

### 6.3 上传源码包（本机没有 Docker 也能部署，测试期首选）

```bash
node deploy-cloudbase/scripts/make-source-zip.mjs
# → dist/scienceing-cloudbase-src-<时间戳>.zip（约 1.8 MB / 267 个文件，含 Dockerfile 与 .dockerignore）
```

控制台：**云托管 → 新建服务（或「发布新版本」）→ 本地代码 → 上传该 zip → 构建目录留空 → 监听端口 8080**。
镜像由平台在云端构建，**本机不需要装 Docker**。

构建阶段的典型失败与处理（改 `Dockerfile` 顶部的 `ARG` 默认值后重新打包上传即可）：

| 现象 | 处理 |
|---|---|
| `FROM` 拉取超时（docker.io 不可达） | 把 `ARG NODE_IMAGE` 默认值改为可达镜像源，如 `docker.m.daocloud.io/library/node:22-bookworm-slim` |
| `pnpm install` 超时 | 把 `ARG NPM_REGISTRY` 默认值改为 `https://registry.npmmirror.com` |
| Chromium 下载慢 | 把 `ARG PLAYWRIGHT_DOWNLOAD_HOST` 默认值改为 `https://cdn.npmmirror.com/binaries/playwright` |
| 只想先跑通业务、暂时不要改密功能 | 构建时把 `ARG INSTALL_CHROMIUM` 改成 `false`（镜像小一半，代价是「重置科应密码」不可用） |

### 6.4 本地构建与自测（可选，需要本机 Docker）

```powershell
# PowerShell
docker build -t scienceing-cloudbase:dev .
docker run --rm -p 8080:8080 `
  -e PORT=8080 `
  -e SCIENCEING_MASTER_KEY=<64位hex> `
  -e ADMIN_INITIAL_PASSWORD='<至少12位>' `
  -e ALLOW_DB_INIT=1 -e SEED_ON_INIT=1 `
  -v ${PWD}\.local-data:/data -v ${PWD}\.local-backup:/backup `
  scienceing-cloudbase:dev
```

```bash
# Git Bash
docker build -t scienceing-cloudbase:dev .
MSYS_NO_PATHCONV=1 docker run --rm -p 8080:8080 -e PORT=8080 \
  -e SCIENCEING_MASTER_KEY=<64位hex> -e ADMIN_INITIAL_PASSWORD='<至少12位>' \
  -e ALLOW_DB_INIT=1 -e SEED_ON_INIT=1 \
  -v "$(pwd -W)/.local-data:/data" -v "$(pwd -W)/.local-backup:/backup" \
  scienceing-cloudbase:dev
```

> 镜像构建需要访问 npm registry 与 Playwright 浏览器 CDN。国内构建慢时可用
> `--build-arg NPM_REGISTRY=https://registry.npmmirror.com --build-arg PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright`。

### 6.5 CLI 部署（可选）

```bash
npm i -g @cloudbase/cli
tcb login
# 把 deploy-cloudbase/cloudbaserc.json 的 envId 改成真实环境 ID 后，在仓库根执行
tcb framework deploy
```

CLI 只负责构建与发布镜像；**实例数、CFS 挂载、环境变量、健康检查仍需在控制台配置**。

### 6.6 上线验收（缺一不可）

```bash
node deploy-cloudbase/scripts/smoke.mjs --base https://<默认域名> --username admin --password '<口令>'
# 期望：8/8 通过；health 的 journalMode 必须是 delete

# 持久化门禁：写 → 控制台重启实例 / 实例数 0→1 → 验
node deploy-cloudbase/scripts/verify-persistence.mjs --base https://<默认域名> --username admin --password '<口令>' --phase write
node deploy-cloudbase/scripts/verify-persistence.mjs --base https://<默认域名> --phase verify
# 期望：PASS（重启后同一会话仍有效）
```

**`verify-persistence` 不通过，不许对外说"可生产运行"** ——那说明数据目录没挂上持久卷。

---

## 7. 存量数据迁移（不覆盖、不删除）

原则：**用 SQLite Backup API 生成一致性快照，绝不直接复制 `.db` 文件**（WAL 模式下直接拷贝主文件会丢掉未 checkpoint 的事务）。

1. 停掉现有 LAN 服务；
2. 在旧环境生成快照（快照文件一定不含未提交 WAL 数据）：

   ```powershell
   node deploy-lan/scripts/deploy.mjs db:backup   # 或
   node apps/server/dist/db/maintenance.js backup --reason migrate-to-cloud
   ```

3. 把快照文件改名为 `scienceing.prod.db`，上传到 **CFS 的挂载目录**（通过临时 CVM 挂载 CFS，或用控制台提供的文件上传能力），目标路径 `/data/scienceing.prod.db`；
4. 部署时设 `ALLOW_DB_INIT=0`、`RUN_MIGRATIONS=1`：入口脚本会先做一次 `predeploy` 快照，再增量迁移到当前版本；
5. 用 `smoke.mjs` + 业务抽查（账号池、租约、审计、看板）确认；
6. 旧库保持原样留存，不删除、不改名。

---

## 8. 日常发布与回滚

### 8.1 发布（不含新迁移）

1. 本地 `docker build` 自测 → 推送/上传代码包创建新版本；
2. 新版本健康检查通过后，灰度 10% → 观察日志与 `/api/health` → 100%；
3. 旧版本保留，随时可切回。

迁移是增量且向后兼容的（只追加 `00N`），**不含新迁移的发布可以只切流量回滚**。

### 8.2 发布（含新迁移）—— 必须停机

SQLite 单文件 + 结构变更，不允许"新旧两版同时写"：

1. 控制台把实例数临时设为 **0**（停写）；
2. 发布新版本，实例数 1；入口脚本自动 `predeploy` 快照 → 迁移 → 校验；
3. `smoke.mjs` 通过后再放流量。

### 8.3 回滚

**A. 本次发布没有新增迁移**：控制台「版本管理」把 100% 流量切回上一版本即可（数据不动）。

**B. 本次发布新增了迁移**：切回旧镜像会因"迁移数 ≠ 程序迁移数"**拒绝启动**（这是项目的安全设计），必须先恢复数据库：
1. 确认 `/backup` 里有本次发布前的 `*.predeploy.db`（日志会打印路径）；
2. 创建一个**不分配流量**的维护版本：同一镜像，环境变量加
   `MAINTENANCE_MODE=restore`、`RESTORE_FROM=/backup/scienceing.prod.<时间戳>.predeploy.db`；
3. 该版本日志出现「恢复完成」即成功（旧主库与 WAL 会改名留存，不删除）；健康检查失败是预期（它不监听端口）；
4. 把流量切回旧版本 → 删除维护版本 → 恢复实例数 1 → 跑 `smoke.mjs`。

---

## 9. 备份与恢复

- 每日 02:00 自动快照，保留 30 天（`db/backup.ts`）；启动时若超过 24 小时无快照会补一次；
- 每次发布前强制 `predeploy` 快照，失败即中止发布；
- 手工备份（webshell，容器内）：

  ```bash
  cd /app && node apps/server/dist/db/maintenance.js backup --reason manual
  ```

- 恢复（停机后）：用 8.3 的维护模式，或

  ```bash
  node apps/server/dist/db/maintenance.js restore \
    --source /backup/scienceing.prod.<ts>.manual.db --target /data/scienceing.prod.db
  ```

- 异地容灾：CFS 快照仍在腾讯云内。建议后续把 `/backup` 定期同步到 COS（生命周期归档），
  或至少每周人工下载一次到本地——**当前方案没有做异地副本**，这一点必须在验收记录里写明。

---

## 10. 已验证 / 未验证（诚实边界）

**已在本地用与容器完全相同的代码路径验证（Windows Node 22.22.2，journal=delete，独立数据目录）：**

| 项 | 结果 |
|---|---|
| `tsc` 编译（server / worker）与 `vite build` | 通过 |
| 首次初始化：`migrate --initialize` + `seed`（admin + 10 账号 + 设置 + 手册） | 通过 |
| `db:verify`（结构/外键/主密钥解密） | 通过；**错误主密钥时失败退出**（exit=1） |
| 重复迁移 | `已应用 0 个迁移`（幂等，不覆盖数据） |
| `predeploy`/`startup-catchup` 备份 | 生成快照成功，未覆盖已有文件 |
| 生产模式启动（`NODE_ENV=production` + `WEB_DIST_DIR`） | 启动成功，前端静态托管启用 |
| 冒烟 8 项（health/首页/SPA/下载 404/API 404/安全头/扩展配置/登录会话） | 8/8 通过，`journalMode=delete` |
| 重启后持久化 | 同一 cookie 会话仍有效（`verify-persistence` PASS） |
| 后端单测（crypto/config/migrate/backup/upgrade/seed） | 35/35 通过 |
| 后端不变量 + 安全头检查 | 12/12 通过 |

**未验证（上线前必须补做）：**

1. **镜像构建与容器运行**：本机 Docker 无法启动（Rancher Desktop shim 拒绝访问），`docker build` / `docker run` 未实际执行。请在装有 Docker 的机器上按 6.3 跑通；
2. **CFS 上的 SQLite 实测**：NFS 的锁语义、`delete` 模式下的并发写入、断网重连后的 `quick_check`，都必须在真实 CFS 上验证（本机是本地盘，不能代表）；
3. **后台调度器在云托管上的 CPU 行为**：`TimeoutScheduler` 每 15s 回收超时租约、每日 02:00 备份。平台文档明确"响应返回后实例可能拿不到 CPU"，锁死单实例通常没问题，但需实测——设置一个很短的 `inactivity_timeout_hours`，观察租约是否按预期回收；若被限流，需要改为外部定时任务触发；
4. **Chromium 在容器内的工作流**：Worker 从容器访问 `www.scienceing.com` 改密的完整链路；
5. **扩展下载包**：现有 `deploy-lan` 打包器只支持 `http://<LAN IP>`，云托管是 HTTPS 域名，包内的 `DASHBOARD_ORIGINS/API_BASE` 与 `manifest` 白名单需要按新域名重打包（可放到 `/data/extension`，入口脚本会自动覆盖静态目录）。**未重打包前，扩展无法指向新环境**——这是功能缺口，不是部署问题。
   另外 `apps/web/public/downloads/` 已被 `.dockerignore` 排除（那是开发机打的 `localhost:5173` 包），所以镜像里 `/downloads` 初始为空、`/api/extension/config` 返回 `available:false`，这是**预期行为**，不是打包失败。

---

## 11. 已知限制与风险

| 风险 | 影响 | 处置 |
|---|---|---|
| 平台默认域名仅测试用，不承诺 SLA | 不能对外承诺可用性 | 验收记录写"测试环境"；生产必须绑已备案域名 |
| SQLite + NFS（CFS） | 写放大、锁延迟、极端情况下 I/O 错误 | 单实例 + delete journal + FULL sync；每日备份 + 发布前快照；长期建议换 PostgreSQL（方案 C） |
| 单实例 | 无水平扩容，重启有短暂不可用 | 测试阶段可接受；发布走"缩容 0 → 部署 → 扩容 1" |
| 后台定时任务 | 平台空闲限流可能延迟回收/备份 | 实测；必要时加外部定时触发 |
| 镜像含 Chromium | 镜像 ~1GB，首次拉取/冷启动慢 | `min=1` 保持常驻；健康检查初始延迟 ≥45s |
| 运行期 root | 容器内权限较大 | 无构建工具、`/app` 不含密钥；CFS 权限允许时开 `RUN_AS_NONROOT=1` |

---

## 12. 命令速查

| 目的 | 命令 |
|---|---|
| 看健康 | `curl https://<域名>/api/health` |
| 冒烟 | `node deploy-cloudbase/scripts/smoke.mjs --base https://<域名> --username admin --password '***'` |
| 持久化验证 | `node deploy-cloudbase/scripts/verify-persistence.mjs --base ... --phase write` → 重启 → `--phase verify` |
| 手工备份（webshell） | `cd /app && node apps/server/dist/db/maintenance.js backup --reason manual` |
| 迁移 | `cd /app && node apps/server/dist/db/migrate.js` |
| 校验 | `cd /app && node apps/server/dist/db/verify.js` |
| 恢复到快照 | 设 `MAINTENANCE_MODE=restore` + `RESTORE_FROM`，创建无流量版本 |
