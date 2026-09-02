# 一键开发环境启动

`scripts/dev.mjs` 是一个**零第三方依赖**的 Node 编排脚本，一条命令即可拉起整套本地开发环境：

```
依赖安装 → 生成 .env → 编译后端 → 数据库迁移 → 种子数据 → 启动后端 + 前端
```

## 用法

```bash
pnpm dev                 # 全量：装依赖 → 建库 → 种子 → 后端(:3000) + 前端(:5173)
pnpm dev --only=server   # 只启动后端（数据库/编译一并完成）
pnpm dev --only=web      # 只启动前端（需后端已在运行）
pnpm dev --reset         # 删除 data/scienceing.db 后重建（迁移 + 种子）
pnpm dev --rebuild       # 强制重新编译后端
pnpm dev --reset-admin  # 把 admin 口令强制重置为 .env 中的 ADMIN_INITIAL_PASSWORD
pnpm dev --no-install    # 跳过依赖安装（node_modules 已就绪时更快）
```

> 若你的终端里 `pnpm` 本身不可用（如某些沙箱 corepack 垫片异常），可直接用 Node 跑脚本本体，效果完全一致：
> ```bash
> node scripts/dev.mjs            # 等价于 pnpm dev
> node scripts/dev.mjs --only=server
> ```

## 启动后访问

| 入口 | 地址 |
| --- | --- |
| 账号池看板（公开页） | http://localhost:5173 |
| 管理后台 | http://localhost:5173/admin |
| 后端 API | http://localhost:3000/api |

默认管理员账号：`admin` / `admin12345`（本地开发默认值，首次登录后请修改）。

## 设计要点

- **密钥可复现**：`SCIENCEING_MASTER_KEY` 首次运行写入仓库根 `.env` 并**持久复用**——换值会导致已入库的科应账号密码（AES-256-GCM）无法解密。
- **前端必须关 mock**：脚本自动把 `apps/web/.env.local` 的 `VITE_USE_MOCK` 设为 `false`，否则前端跑的是内存 mock、看起来能登录却连不上后端。
- **端口避让**：默认 3000/5173；若被占用，脚本打印提示并跳过该项（不强制抢占）。临时改用其它端口：
  ```bash
  PORT=3100 WEB_PORT=5199 pnpm dev
  ```
  `WEB_PORT` 由 Vite 配置直接读取，`PORT` 同时用于后端监听与前端 `/api` 反向代理目标。
- **种子幂等 + 口令兜底**：种子不会改写既有 `admin` 的口令。若登录报「用户名或密码错误」（库内是历史口令），用 `pnpm dev --reset-admin` 一键重置。
- **就绪判定**：后端/前端均以**端口 TCP 连通性轮询**判定就绪，不解析 colored 日志，跨版本稳定。
- **优雅停机**：`Ctrl+C` 会连带终止后端与 vite 子进程树，不留端口占用。
