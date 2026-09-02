# 科应共享账号管理平台

> Scienceing Shared Account Manager — 基于租约管理与自动回收的共享账号基础设施（PRD §62）。
>
> 核心逻辑一句话：**插件负责看（真实操作），后台负责算（租约/超时），Playwright 负责干（改密回收）。**

科应（Scienceing）账号「同一账号异地登录即互踢、管理员改密即会话失效」的特性，决定了共享账号必须由系统统一分配、无操作自动释放、自动改密轮换。本平台实现：

- **账号池看板**：游客/员工一眼看懂「总数/可用/使用中/回收中/异常」。
- **租约管理**：事务原子领取，同一账号同一时间仅一个有效租约（R1/R2）。
- **Activity 续期**：浏览器扩展只在科应页面监听真实操作（`isTrusted`），节流上报，30 分钟无操作自动回收。
- **自动改密回收**：超时/归还/强制回收 → 生成新密码 → Playwright 改密 → 旧 Session 失效 → 账号回到池内。
- **无彩色系统 + 语义色状态标签**（PRODUCT-DESIGN v1.1 §4.1）：彩色仅出现在状态圆点/徽章，正文/按钮/导航保持黑白灰。

---

## 技术栈

| 模块 | 技术 |
|---|---|
| 后端 | NestJS 11 + SQLite（Node 24 内置 `node:sqlite`，WAL 模式）+ bcryptjs + AES-256-GCM |
| 前端 | Vue 3 + Vite + Tailwind CSS v4 + shadcn-vue（`apps/web`） |
| 扩展 | Chrome/Edge Manifest V3，纯 JS 无打包（`apps/extension`） |
| 自动化 | Playwright 单 Worker 串行改密（`playwright/worker`） |
| 共享契约 | `packages/shared`（枚举 / 系统设置键 / API DTO / 状态语义色映射） |

---

## 目录结构

```text
scienceing-account-manager/
├── apps/
│   ├── web/                 # Vue3 看板 + 管理后台（/、/login、/my、/admin/*）
│   ├── server/              # NestJS 后端（认证/账号池/租约/Activity/回收队列/审计/健康检查）
│   └── extension/           # 科应共享账号助手（MV3：握手/绑定/Activity 监听/Shadow DOM 悬浮窗）
├── packages/
│   └── shared/              # 共享契约（AccountStatus/LeaseStatus/ReleaseReason/API DTO/§4.1 语义色）
├── playwright/
│   ├── worker/              # Playwright 管理员改密 Worker（storageState + 两阶段改密）
│   └── .auth/               # 管理员认证状态（gitignored，最高敏感）
├── data/                    # SQLite 数据库（gitignored）
├── deployment/              # 部署/备份回滚/监控文档
└── docs/                    # 验收报告 / 扩展安装说明
```

---

## 快速启动

### 前置要求

- Node.js **≥ 20**（本项目在 Node 24 上开发/验证）
- pnpm **11**（`package.json` 已声明 `packageManager: pnpm@11.20.0`）

### 1. 安装依赖

```bash
pnpm install
```

> pnpm 11 的 store 已本地化到 `.pnpm-store/`（`.npmrc`），不写全局目录；`pnpm-workspace.yaml` 的 `allowBuilds` 已显式跳过 esbuild postinstall（其二进制由 optionalDependencies 提供，前端不受影响）。

### 2. 配置环境变量（至少设置 Master Key）

```bash
# PowerShell
$env:SCIENCEING_MASTER_KEY = "<64 位 hex>"
```

生成 Master Key：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> 完整环境变量清单见下文「环境变量」。

### 3. 构建 + 迁移 + 种子

```bash
# 编译后端
pnpm --filter @scienceing/server build

# 建库迁移（SQLite 六表 + sessions + schema_migrations）
pnpm --filter @scienceing/server db:migrate

# 种子数据（admin 用户 + KY-01~KY-10 账号 + system_settings 默认值）
pnpm --filter @scienceing/server db:seed
```

> 种子 admin 初始口令由 `ADMIN_INITIAL_PASSWORD` 提供；未设置时会在终端**生成强随机口令并打印一次**（请立即记录），**首次登录后必须修改**。

### 4. 启动

```bash
# 终端 1：后端（默认 http://localhost:3000/api）
pnpm --filter @scienceing/server start

# 终端 2：前端（默认 http://localhost:5173，已配 /api → 3000 代理）
pnpm --filter @scienceing/web dev
```

打开 `http://localhost:5173` 即可看到账号池看板；`/admin` 为管理后台（admin 登录）。

---

## 环境变量清单

### 后端（apps/server）

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `SCIENCEING_MASTER_KEY` | 生产必填 | 无（临时随机+告警） | AES-256-GCM Master Key，hex 64 字符 = 32 字节（PRD §41/§42） |
| `DATABASE_PATH` | 否 | `data/scienceing.db` | SQLite 数据库路径 |
| `PORT` | 否 | `3000` | 后端监听端口 |
| `ADMIN_INITIAL_PASSWORD` | 否 | 无（缺失生成随机并打印） | 种子 admin 初始口令（首登须改） |
| `RECYCLE_INTERVAL_MS` | 否 | `15000` | 超时回收检查间隔（PRD §25，10~30s） |
| `RESET_INTERVAL_MS` | 否 | `10000` | 回收队列消费间隔 |

> 说明：本系统会话采用**不透明 token + sessions 表**（非 JWT），因此**无需 JWT secret**；`lease_token` 只存 SHA-256（PRD §43）。登录密码只存 bcrypt hash，科应账号密码只存 AES-256-GCM 密文。

### Playwright Worker（playwright/worker）

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `SCIENCING_ADMIN_URL` | 是 | 无 | 科应管理后台地址（登录页/账号管理页） |
| `SCIENCING_ADMIN_USERNAME` | 是 | 无 | 科应管理员用户名（PRD §42，仅环境变量） |
| `SCIENCING_ADMIN_PASSWORD` | 是 | 无 | 科应管理员密码（PRD §42，仅环境变量） |
| `SCIENCING_BROWSER_CHANNEL` | 否 | `chrome` | 浏览器渠道：`chrome`/`msedge`/`chromium` |
| `SCIENCING_BROWSER_HEADLESS` | 否 | `1` | 无头模式；`0` 有头（调试） |
| `SCIENCING_STORAGE_STATE` | 否 | `playwright/.auth/admin.json` | 管理员认证状态路径（gitignored） |
| `SCIENCING_RESET_SUCCESS_TEXT` | 否 | `修改成功` | 改密成功校验文案（PRD §31） |
| `SCIENCING_MAX_ATTEMPTS` | 否 | `3` | 改密失败重试次数（PRD §48，2~3） |

---

## 构建与测试

```bash
# 构建
pnpm --filter @scienceing/shared build              # 共享契约（产出 dist 声明）
pnpm --filter @scienceing/server build              # 后端 tsc 编译
pnpm --filter @scienceing/web build                 # 前端 Vite 构建
pnpm --filter @scienceing/extension build           # 扩展结构 + 最小权限审计
pnpm --filter @scienceing/playwright-worker build   # Worker tsc 编译

# 测试
pnpm --filter @scienceing/server test               # 后端加密单测（node:test）
pnpm --filter @scienceing/server test:e2e           # 后端 e2e（auth/leases/admin/reset，19 例）
pnpm --filter @scienceing/extension test            # 扩展版本比较单测
pnpm --filter @scienceing/playwright-worker test    # Worker 逻辑单测

# 根级
pnpm typecheck   # tsc --noEmit（packages/shared）
pnpm lint        # eslint .
```

> 受限沙箱说明：`node --test <目录>` 会 spawn 子进程被 EPERM 拦截，故测试脚本统一使用 `node --test --test-isolation=none <文件>` 在进程内运行。

---

## 已知限制

| 限制 | 说明 | PRD |
|---|---|---|
| 科应改密通知 | 每次改密会通知账号绑定邮箱/手机号，自动回收可能产生大量通知，需与科应供应方确认可否关闭/统一绑定管理员邮箱 | §50 |
| 30 分钟误差 | 插件 Activity 采用 5~10s 节流，释放时间误差通常数秒，不承诺与科应自身 30 分钟定时器毫秒级同步 | §34 |
| 不自动填登录密码 | 第一版仍由用户手动复制账号/密码登录科应，不自动填写 | §3 |
| 扩展需人工加载 | 第一阶段 ZIP 分发 + 手动「加载已解压扩展」，不支持商店/企业策略托管 | §7.5/§53 |
| Playwright 需 Chromium | 真实改密需可运行 Chromium 的环境（受限沙箱无 Chromium，`automation.executor` 为接线桩） | t11/t12 |

---

## 文档索引

- `docs/install-extension.md` — 扩展 ZIP 打包 + Edge/Chrome 加载已解压扩展教程
- `docs/acceptance-report.md` — PRD §60 十场景端到端验收报告
- `deployment/deploy.md` — 单机部署说明
- `deployment/backup-rollback.md` — 数据库备份/回滚 SQL
- `deployment/monitoring.md` — 监控告警与巡检项
- `playwright/worker/README.md` — Worker 接线契约（ResetJobInput/ResetJobResult）
- `apps/extension/README.md` — 扩展握手/运行时消息契约
