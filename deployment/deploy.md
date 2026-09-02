# 单机部署说明

> 第一阶段单机部署（PRD §55）：Web 前端 + Node 后端 + SQLite + 超时调度器 + Playwright Worker 全部跑在一台服务器上。不拆微服务，不上 Redis/Kafka（PRD §3）。

## 1. 架构

```text
┌────────────────────────── 单机 Host ──────────────────────────┐
│  Web 前端（静态资源，Nginx 或 Vite preview 托管）              │
│  Node 后端（NestJS :3000/api）  ──  SQLite（data/scienceing.db）│
│  TimeoutScheduler（内置，每 15s）  ──  超时→RECYCLING          │
│  ResetQueueScheduler（内置，每 10s） ──  消费 PENDING 改密任务  │
│  Playwright Worker（独立进程）  ──  真实改密（需 Chromium）     │
└───────────────────────────────────────────────────────────────┘
```

- 后端内置两个定时器：`TimeoutScheduler`（超时回收，PRD §25）、`ResetQueueScheduler`（回收队列消费）。
- Playwright Worker 是独立进程，通过 `ResetExecutor` 接口与后端接线（生产需在可运行 Chromium 的环境替换 `automation.executor.ts` 的桩实现）。

## 2. 系统要求

- Linux / Windows 均可；内存 ≥ 1GB；磁盘 ≥ 2GB。
- Node.js ≥ 20（建议 24）；pnpm 11。
- Playwright 改密需 Chrome/Edge 及系统依赖（`npx playwright install chrome`，或使用系统已装 Chrome/Edge）。

## 3. 部署步骤

```bash
# 1. 拉取代码 + 安装
git clone <repo-url> && cd scienceing-account-manager
pnpm install

# 2. 配置环境变量（写进 systemd/进程管理器或 .env 加载器）
export SCIENCEING_MASTER_KEY="<64位hex，勿入库>"        # 必填，且必须与首次 seed 时一致
export DATABASE_PATH="/var/lib/scienceing/scienceing.db"  # 可选
export PORT=3000
export ADMIN_INITIAL_PASSWORD="<强密码>"

# 3. 构建
pnpm --filter @scienceing/server build
pnpm --filter @scienceing/web build
pnpm --filter @scienceing/playwright-worker build

# 4. 建库 + 种子
pnpm --filter @scienceing/server db:migrate
pnpm --filter @scienceing/server db:seed

# 5. 启动后端（进程管理器，如 pm2 / systemd / NSSM）
pnpm --filter @scienceing/server start

# 6. 启动前端（生产建议 Nginx 托管 apps/web/dist + 反向代理 /api → 127.0.0.1:3000）
#    或临时 vite preview：
pnpm --filter @scienceing/web preview -- --host
```

## 4. 关键环境变量（生产必读）

| 变量 | 说明 |
|---|---|
| `SCIENCEING_MASTER_KEY` | AES-256-GCM Master Key（hex 64 字符）。**必须持久保存且与 seed 时一致**，否则重启后无法解密已存科应密码。 |
| `SCIENCING_ADMIN_USERNAME` / `SCIENCING_ADMIN_PASSWORD` / `SCIENCING_ADMIN_URL` | Playwright 改密的科应管理员凭据（仅环境变量，PRD §42，绝不可写库/代码/Git）。 |
| `DATABASE_PATH` | 数据库路径；建议放独立数据盘并纳入备份。 |

## 5. 反向代理（Nginx 示例）

```nginx
server {
  listen 80;
  server_name your-dashboard.example.com;

  root /path/to/apps/web/dist;
  index index.html;

  # 前端 SPA 路由回退
  location / {
    try_files $uri $uri/ /index.html;
  }

  # API 代理到后端
  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

> 注意：生产部署需同步替换扩展 `apps/extension/src/lib/config.js` 与 `manifest.json` 中的看板域/科应域/后端域（见 `docs/install-extension.md` 与 `apps/extension/README.md`「域名配置」）。

## 6. 首次使用检查清单

1. `GET /api/accounts/availability` 返回 `{"total":10,"available":10,...}`。
2. `GET /api/extension/config` 返回 `minimumVersion/latestVersion/...`。
3. 用 admin 登录 `/admin`，确认五页（账号/用户/租约/日志/设置）可访问。
4. 在 `/admin/settings` → Scienceing 自动化「立即检测」，确认健康检查三项返回。
5. 确认 `playwright/.auth/admin.json` 已由 `pnpm --filter @scienceing/playwright-worker login` 生成（可选，Worker 也会自动登录）。
