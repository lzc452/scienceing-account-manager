# 内网部署（LAN）运行手册 —— scienceing-account-manager

> 目标：在**无管理员权限**的 Windows 电脑上，把本项目（Web 前端 + NestJS 后端 + SQLite + 定时调度 + Playwright Worker + 浏览器扩展 zip）一键部署为**生产模式**，让**同一 WiFi 局域网**下的同事通过浏览器访问。
> 本方案**不依赖 Docker、不依赖管理员权限、不依赖 pnpm**，全程使用 Node.js 自带能力（构建用本地 `node_modules` 里的 tsc / vite；网关优先用 nginx、失败自动回退内置 Node 网关）。

---

## 0. 一图看懂架构

```text
同一 WiFi 下的同事浏览器
        │  http://10.3.124.100:18080
        ▼
┌─ 网关（Gateway）──────────────────────────────┐
│  nginx 隔离实例(端口 18080, 项目内 prefix)       │
│    └ 失败自动回退：内置 Node 网关 gateway.mjs    │
│  · 托管前端构建产物 apps/web/dist（SPA 回退）    │
│  · 反代 /api/* → 127.0.0.1:3000（同源，免CORS）  │
└───────────────┬──────────────────────────────┘
                ▼
┌─ 后端 NestJS（0.0.0.0:3000/api，进程常驻）───────┐
│  · SQLite  data/scienceing.db（WAL）            │
│  · 内置 TimeoutScheduler / ResetQueueScheduler │
│  · 经子进程调用 Playwright Worker 做真实改密      │
└───────────────────────────────┬──────────────┘
                                ▼
                    Playwright Worker（系统 Chrome，headless）
```

- **后端已绑定全接口**（`app.listen(port)` 等价 `0.0.0.0`），同事也可直接访问 `http://<IP>:3000/api`。
- 前端代码 `API_BASE = '/api'`（同源相对路径），因此**必须**经网关访问，刷新 `/admin/...` 才不 404。

## 1. 交付物与目录结构

```text
deploy-lan/
├── deploy-first.bat        双击：首次全量部署（构建→建库→起服务→打扩展zip）
├── deploy-update.bat       双击：更新部署（可加 --pull 先 git pull）
├── start.bat               双击：快速启动（跳过构建）
├── stop.bat                双击：停止后端+网关
├── status.bat              双击：状态自检并打印同事访问地址
├── config.env              部署配置（首次运行自动生成）：网关端口/LAN IP/nginx路径等
├── README.md               本手册
├── scripts/
│   ├── deploy.mjs          主 CLI（deploy|update|start|stop|status|build|
│   │                       nginx:test|extension:pack|db:reset-admin|env:init|env:print）
│   ├── lib.mjs             共享工具：Node探测/.env解析/端口进程(经PowerShell)/
│   │                       局域网IP探测/最小ZIP写入器
│   ├── gateway.mjs         内置 Node 网关（零依赖静态托管+反代，nginx 兜底）
│   ├── nginx-ctl.mjs       隔离 nginx 实例管理（项目内 prefix）
│   └── nginx-...           运行时生成 nginx-prefix/{conf,logs,temp}
├── nginx-prefix/           隔离 nginx 前缀（conf/nginx.conf 自动生成，日志在此）
├── extension-lan/          浏览器扩展 LAN 版（已把域名替换为 http://<IP>:<网关端口>，
│                           可直接“加载已解压的扩展程序”，也可用 dist 里的 zip 分发）
├── dist/
│   └── scienceing-extension-lan-v1.0.0.zip   可分发/右键安装的扩展压缩包（版本化归档）
│
└── （构建/部署时同步生成，位于前端静态目录，由网关托管）
    apps/web/dist/downloads/
    ├── scienceing-extension.zip    固定文件名：看板「下载助手」入口始终指向它
    └── extension.json              包元信息（版本/大小/更新时间/看板域）
└── run/                    运行状态：backend.pid/backend.log/gateway*.pid/*.log/
                            state.json/deploy.log（排查一律看这里）
```

依赖关系：`scripts/lib.mjs` ← `nginx-ctl.mjs` / `gateway.mjs` / `deploy.mjs`；`.bat` 只是 `deploy.mjs` 的薄壳（自动找 Node 并 `chcp 65001`）。

## 2. 前提条件（已在本机验证）

| 项 | 要求 | 本机状态 |
|---|---|---|
| Windows | 10/11，无需管理员 | ✅ |
| Node.js | ≥ 22.5（内置 `node:sqlite`），推荐 24 | ✅ `D:\Applications\nodejs\node.exe` v24.18 |
| 项目依赖 | `node_modules` 已装（仓库根部 + apps/*、playwright/worker） | ✅ 已就绪 |
| nginx | 可选；找不到或起不来会**自动回退内置网关** | ✅ `D:\Applications\nginx-1.30.4\nginx.exe` v1.30.4 |
| 浏览器 | Chrome 或 Edge（Playwright Worker 改密用，channel 自动检测） | ✅ Chrome 已装 |
| 防火墙 | 内网入站不被拦（见 6.2 若被拦的变通） | ✅ 当前三个配置文件均 Disabled |
| WiFi | 同事与本机同网段（本机 WLAN IP 由脚本自动探测） | ✅ 10.3.124.100 |

> 若 `node_modules` 缺失：无需 pnpm，可用
> `node D:\Applications\nodejs\node_modules\corepack\dist\pnpm.js install`（或任意可用 pnpm）安装一次即可。

## 3. 快速开始（首次部署）

1. 双击 **`deploy-lan\deploy-first.bat`**（或命令行 `node deploy-lan/scripts/deploy.mjs deploy`）。
2. 脚本自动执行：
   1. 停止本机旧的后端实例（:3000，仅限本项目进程）；
   2. 编译后端 `apps/server`（tsc）→ `apps/server/dist`；
   3. 编译 Worker `playwright/worker`（tsc）→ `dist/cli.js`；
   4. 数据库迁移 + 种子（幂等）`data/scienceing.db`；
   5. 构建前端 `vite build` → `apps/web/dist`（内置 `VITE_USE_MOCK=false`）；
   6. 启动**生产后端**（守护进程，日志 `deploy-lan/run/backend.log`）；
   7. 启动**网关**：nginx 隔离实例（18080）优先，失败自动回退内置 Node 网关；
   8. 健康自检：网关 `/`、`/api/extension/config` 必须 200；
   9. 生成**浏览器扩展 LAN 版 zip**（域名已替换为本机 `http://<IP>:18080`）。
3. 看到 `✔ 部署完成` 即成功。把屏幕上的地址发给同事即可。

> 默认端口：网关 **18080**、后端 **3000**。被占用时改 `deploy-lan/config.env` 的 `GATEWAY_PORT`、
> 仓库根 `.env` 的 `PORT`，重新执行 deploy。

## 4. 同事访问地址（本机当前值）

| 用途 | 地址 |
|---|---|
| 账号池看板（公开） | **http://10.3.124.100:18080/** |
| 管理后台 | http://10.3.124.100:18080/admin |
| 我的账号 | http://10.3.124.100:18080/my |
| 后端 API（直连） | http://10.3.124.100:3000/api |

管理员：`admin / <仓库 .env 的 ADMIN_INITIAL_PASSWORD>`（首次登录后请修改；忘记可用 `deploy.mjs db:reset-admin` 重置为 .env 值）。

### 4.1 同事测试步骤（验收清单）

1. 同事电脑连接同一 WiFi，浏览器打开 `http://10.3.124.100:18080/` → 应看到账号池看板，可用账号数正常。
2. 直接访问 `http://10.3.124.100:18080/admin/accounts` **并刷新** → 不应 404（SPA 回退生效）。
3. 用 admin 登录管理后台 → 五页（账号/用户/租约/日志/设置）可访问。
4. 要使用“领取/归还 + 科应页悬浮窗”，同事需装扩展，二选一：
   - **看板自助下载（推荐）**：同事打开看板，点顶栏助手状态旁的下载图标；管理员也可在
     「管理后台 → 系统参数 → 扩展配置」点「下载最新版 ZIP」（显示版本/大小/更新时间）。
     入口即 `http://<本机IP>:18080/downloads/scienceing-extension.zip`，内容就是下面的 LAN 版包。
   - 手动分发：把 `deploy-lan\dist\scienceing-extension-lan-v1.0.0.zip` 发给同事解压。
   解压后 Chrome/Edge 打开 `chrome://extensions`（Edge 为 `edge://extensions`）→ 开启“开发者模式”→“加载已解压的扩展程序”→ 选择解压目录（内含 manifest.json 的目录）。
5. （可选）把 `deploy-lan/extension-lan` 目录整体拷给同事直接加载亦可（无需解压）。
6. 若同事打不开：先自查（status.bat）网关/后端是否运行；再按 6.2 排查（AP 隔离、网段、防火墙）。

## 5. 日常运维

| 操作 | 方式 |
|---|---|
| 查状态与地址 | 双击 `status.bat`（自检进程/端口/健康/URL） |
| 快速重启服务 | 双击 `start.bat`（跳过构建，用现有产物） |
| 停止 | 双击 `stop.bat` |
| 更新代码后重新部署 | 双击 `deploy-update.bat`；需要先拉代码就运行 `deploy-update.bat --pull`（自动 `git pull --ff-only`） |
| 只打包扩展 | `node deploy-lan/scripts/deploy.mjs extension:pack` |
| 换管理员密码 | 改 `.env` 的 `ADMIN_INITIAL_PASSWORD` → `node deploy-lan/scripts/deploy.mjs db:reset-admin` |
| 日志 | 后端 `deploy-lan/run/backend.log`；网关（nginx）`deploy-lan/nginx-prefix/logs/{error,access}.log`；内置网关 `deploy-lan/run/gateway.log`；全流程 `deploy-lan/run/deploy.log` |

**重要约定（本项目历史坑）：**
- Windows 终端跑 Chrome 会吞 Worker 的 stdout/stderr，Worker 所有进度写在
  `playwright/.worker-logs/worker.log`，排查一律看该文件（不要只看终端）。
- 不要用 `Ctrl+C` 之外的“关窗口”停 dev.mjs——残留 server 会占 3000。本部署脚本用 PID/端口双保险回收。
- 数据备份 = 复制 `data/scienceing.db`（停服后复制最稳）。

## 6. 两个高频问题速查

### 6.1 nginx“起不来”？

→ 完整排查报告见 **`deploy-lan/docs/nginx-troubleshooting.md`**。摘要：
- 本机事实：`nginx -t` 语法通过；已有一个实例在 **80 端口**跑**默认欢迎页**（很可能就是你以为“起不来”时早已起来的那个，双击启动无窗口反馈）。
- 常见根因：端口被占（`Get-NetTCPConnection` 查）、二次实例冲突、双击无控制台无感知、
  改错配置（如路径含中文/空格、`include` 缺文件）、日志目录不可写。
- 本方案**绕开**这些问题：用**隔离 prefix + 高端口 18080** 另起一个实例，
  与 80 端口实例互不影响；配置全部在项目内自动生成；再不行自动切内置 Node 网关。

### 6.2 同事访问不到 / 无管理员如何放行防火墙端口？

→ 完整方案见 **`deploy-lan/docs/no-admin-firewall.md`**。摘要：
- 本机现状：Windows 防火墙三个配置文件 **Disabled**（已验证），入站不受拦，无需任何放行。
- 若哪天防火墙被启用且拦入站：优先用**高端口 + 一次性提权加规则**（UAC 弹窗一次，
  需要知道任一管理员账号密码，不依赖 IT）：`Start-Process powershell -Verb RunAs` 后执行
  `netsh advfirewall firewall add rule name="scienceing-lan" dir=in action=allow protocol=TCP localport=18080,3000`。
- 完全没有管理员：netsh/端口代理都需要 admin，**无法**直接开入站；此时两条变通——
  ① 用已放行的 Rancher Desktop（其进程有 Allow 规则）做端口映射跑容器（见 no-admin-firewall.md §4 的 docker-compose）；
  ② 让同事反向连接不可行，则退回内网穿透/让 IT 加一条（唯一需要 IT 的场景）。

## 7. Playwright Worker（改密）与 headless 验证

Worker 凭据**只走环境变量**（已配在仓库根 `.env`）：
`SCIENCING_ADMIN_URL / USERNAME / PASSWORD / STORAGE_STATE / WORKER_CLI / BROWSER_CHANNEL`。
- 浏览器用**系统 Chrome**（channel: chrome），无需下载浏览器二进制；无 Chrome 时改 `SCIENCING_BROWSER_CHANNEL=msedge`。
- headless 功能验证（不弹窗，跑真实科应站，输出 JSON）：
  ```bash
  set SCIENCING_BROWSER_HEADLESS=1
  node playwright/worker/dist/cli.js check        # 健康检查三项（adminLogin/accountPage/resetEntry）
  node playwright/worker/dist/cli.js login        # 刷新登录态（生成 .auth/admin.json）
  node playwright/worker/dist/cli.js run --jobs <file.json>   # 消费改密队列
  ```
  Windows 终端可能吞输出 → 看 `playwright/.worker-logs/worker.log`。
- 后端 `ResetQueueScheduler` 会在后台自动调用 CLI；单次超时 180s，可用 `SCIENCING_WORKER_TIMEOUT_MS` 覆盖。

## 8. 常见问题（FAQ）

| 现象 | 处理 |
|---|---|
| 部署机**没有 Chrome**、只有 Edge | 不用装 Chrome：`.env` 加 `SCIENCING_BROWSER_CHANNEL=msedge`（Worker 走系统 Edge）→ `deploy.mjs stop` → `deploy.mjs start` 生效；仅改 env 无需重新构建 |
| 用 **GitHub Download ZIP** 部署到新电脑 | zip 不含 `.env`（无 `.git` 也 pull 不了）。首次跑 deploy 是在“空 env”状态：master key 每次重启漂移、admin 密码随机、Worker 凭据为空 → **能访问≠健康**，建议收敛一次：`stop` → 生成 `.env`（`env:init` 或手写模板）→ `del data\scienceing.db*` → `deploy`。以后更新=重新下载 zip 覆盖同目录（zip 不含 `.env`/`data`/`run`，不会覆盖它们；覆盖前建议备份 `data`）→ 跑 `deploy-update.bat` 或 `deploy.mjs deploy`（无 .git 时 `--pull` 会失败但会继续） |
| 换新电脑/git clone 后没有 `.env` | `.env` 被 gitignore 不会同步。先 `node deploy-lan/scripts/deploy.mjs env:init` 生成模板（自动随机 master key、自动填 storage 路径）→ 用编辑器填 `SCIENCING_ADMIN_USERNAME/PASSWORD` → 若此前已 seed 过数据库，按下一行删库重建 |
| 补/改了 `.env` 后要重新部署 | ① `deploy.mjs stop`；② 编辑 `.env`（**UTF-8 无 BOM**，别用记事本默认格式）；③ 若 `SCIENCEING_MASTER_KEY` 变了 → 删 `data\scienceing.db*`（否则旧密文解不开）；④ `deploy.mjs deploy`（migrate/seed 幂等 + 重启）；⑤ 若只改了 `ADMIN_INITIAL_PASSWORD`：seed 不覆盖已有 admin，补跑 `deploy.mjs db:reset-admin` |
| 新电脑重部署后 admin 登不进 | 用 `env:init` 前那次跑过 seed 的话 admin 密码是当时**随机生成**的（看当时 seed 日志）；直接 `db:reset-admin` 重置为 `.env` 当前值 |
| `deploy` 提示端口被“其它程序”占用 | 非本项目进程不会强杀，改端口或 `--force`（谨慎） |
| 局域网 IP 变了（DHCP） | 改 `config.env` 的 `LAN_IP` 后重启；或把路由 DHCP 保留给本机 MAC |
| 刷新 `/admin/...` 404 | 一定走了 80 端口那个旧 nginx 欢迎页——请访问 18080 网关 |
| 前端能开但接口报错 | 看网关日志；确认后端 3000 存活（`status.bat`） |
| 扩展装了没反应 | 确认同事装的是 `extension-lan` 版（域名已含本机 IP:18080），
|  | 且访问的正是该地址；`chrome://extensions` 里点“重新加载” |
| 点「下载最新版 ZIP」是灰的 / 下载 404 | 包未生成：`node deploy-lan/scripts/deploy.mjs extension:pack`（或重新 deploy）。
|  | LAN IP 变更后**必须重新打包**，否则包里的看板域还是旧 IP |
| 构建报 `EPERM ... .woff` | 已规避：前端先构建到 `apps/web/dist-build` 再同步进 `dist`。
|  | 若仍出现，停掉网关后重跑；产物以 `dist/index.html` 引用的 hash 名为准 |
| 想换回 dev 模式 | dev 与生产互不冲突：dev 用 5173/3000，生产网关 18080（若 dev 也要 3000，先 `stop.bat`） |

## 9. 一键脚本与 CLI 速查

```text
node deploy-lan/scripts/deploy.mjs
  deploy             全量首次/重部署（构建+建库+启动+扩展zip）
  update [--pull]    更新部署（可选先 git pull）
  start              快速启动已构建产物
  stop [--force]     停止后端与网关
  status             状态与访问地址
  build              只构建（server/web/worker/扩展zip）
  nginx:test         仅测试隔离 nginx 配置
  extension:pack     仅打包 LAN 扩展 zip
  db:reset-admin     重置 admin 口令为 .env 配置值
  env:print          打印关键配置（脱敏）
  env:init           生成/补全 .env 模板（新电脑首选；不覆盖已有值）
```

版本记录：v1.0.0 —— 2026-09-02 首发（真机验证通过：构建/nginx18080网关/Node兜底网关/健康自检/LAN URL/扩展zip）。
