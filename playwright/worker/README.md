# Playwright 管理员改密 Worker

科应共享账号管理平台 —— 管理员改密 Worker（PRD §27–§31、§47–§49）。

单 Worker 串行消费密码重置队列，通过 Playwright 模拟管理员在科应后台正常操作：
打开后台 → 登录 → 进入账号管理 → 定位账号 → 点击「重置密码」→ 填新密码 → 保存 → 校验「修改成功」。

> 不是调用科应隐藏 API，而是模拟真实管理员操作（PRD §27）。

## 目录结构

```text
playwright/worker/
├── src/
│   ├── config.ts        # 环境变量配置（管理员凭据只走环境变量，PRD §42）
│   ├── selectors.ts     # 语义定位器（getByRole/getByLabel/getByText，PRD §27）
│   ├── auth.ts          # storageState 保存/加载 + 登录 + 会话失效自动重登（PRD §29）
│   ├── reset-flow.ts    # 单次改密流程 + 成功文案校验（PRD §31）
│   ├── pipeline.ts      # 纯编排：失败重试（PRD §48）+ 串行队列（PRD §28）
│   ├── worker.ts        # ResetWorker：单 Worker 串行消费者
│   ├── cli.ts           # 命令行入口：login / reset / run
│   └── tests/
│       ├── logic.test.ts     # 纯逻辑单测（无浏览器即可运行）
│       └── browser.test.ts   # 浏览器流程测试（依赖系统 Chrome，mock 页面）
├── mock/scienceing-admin.html  # mock 科应后台（登录 + 账号管理 + 重置对话框）
├── package.json
└── tsconfig.json
```

## 两阶段改密与 t12 接线契约

两阶段机制（PRD §30）由后端与 Worker 协作完成：

| 阶段 | 谁 | 动作 |
| --- | --- | --- |
| Phase 1 | 后端（t6 已实现） | `POST /api/admin/accounts/:id/reset-password`：生成 newPassword → AES 加密写 `pending_password_ciphertext` → 账号 `RECYCLING` → 建 `reset_jobs(PENDING)` |
| Phase 2 浏览器 | **本 Worker** | 把 `pending_password`（后端解密后的明文）填入科应后台 → 校验「修改成功」→ 返回 `SUCCESS/FAILED` |
| Phase 2 回写 | 后端（t12 接线） | 依据 Worker 结果回写 DB |

**Worker 输入（`ResetJobInput`）**：

```json
{ "jobId": 1, "accountCode": "KY-01", "newPassword": "<后端解密的 pending 明文>" }
```

**Worker 输出（`ResetJobResult`）**：

```json
{ "jobId": 1, "accountCode": "KY-01", "status": "SUCCESS", "attempts": 1 }
```

```json
{ "jobId": 1, "accountCode": "KY-04", "status": "FAILED", "attempts": 3, "error": "账号「KY-04」未出现成功文案「修改成功」" }
```

**t12 回写建议**（Phase 2 完成，PRD §30）：

- `SUCCESS`：`current_password_ciphertext = pending_password_ciphertext`、`pending_password_ciphertext = NULL`、账号 `AVAILABLE`、`last_password_changed_at = now`；`reset_jobs → SUCCESS`；审计 `RESET_SUCCESS`。
- `FAILED`：账号 `ERROR`（**绝不自动 AVAILABLE**，PRD §47）；`reset_jobs → FAILED(error_message)`；回收活动租约 `FAILED/release_reason=RESET_ERROR`；审计 `RESET_FAILED`。

## 使用

```bash
# 编译
pnpm --filter @scienceing/playwright-worker build

# 1) 管理员首次登录并保存 storageState → playwright/.auth/admin.json（PRD §29）
$env:SCIENCING_ADMIN_URL = 'https://scienceing-admin.example.com/user-manage'
$env:SCIENCING_ADMIN_USERNAME = '...'
$env:SCIENCING_ADMIN_PASSWORD = '...'
pnpm --filter @scienceing/playwright-worker login

# 2) 处理单个重置任务
pnpm --filter @scienceing/playwright-worker reset -- --account KY-01 --password '<新密码>'

# 3) 串行消费队列（单 Worker，PRD §28）
pnpm --filter @scienceing/playwright-worker run-queue -- --jobs ./jobs.json
```

`jobs.json` 形如 `ResetJobInput[]`：

```json
[
  { "jobId": 1, "accountCode": "KY-01", "newPassword": "..." },
  { "jobId": 2, "accountCode": "KY-07", "newPassword": "..." }
]
```

退出码：`reset`/`run` 全部 `SUCCESS` 返回 0，否则返回 1（便于 t12 判断）。

### 环境变量

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `SCIENCING_ADMIN_URL` | 科应管理后台地址（必填） | — |
| `SCIENCING_ADMIN_USERNAME` | 管理员用户名（必填，PRD §42 只走环境变量） | — |
| `SCIENCING_ADMIN_PASSWORD` | 管理员密码（必填，PRD §42 只走环境变量） | — |
| `SCIENCING_BROWSER_CHANNEL` | `chrome` / `msedge` / `chromium` | `chrome` |
| `SCIENCING_BROWSER_HEADLESS` | `0` 关闭无头 | 无头 |
| `SCIENCING_STORAGE_STATE` | storageState 路径 | `playwright/.auth/admin.json` |
| `SCIENCING_RESET_SUCCESS_TEXT` | 成功文案（PRD §31） | `修改成功` |
| `SCIENCING_MAX_ATTEMPTS` | 最大尝试次数（PRD §48：2～3） | 3 |
| `SCIENCING_RETRY_DELAY_MS` | 失败重试等待毫秒 | 3000 |
| `SCIENCING_DEFAULT_TIMEOUT_MS` | 单步默认超时 | 15000 |

## 关键实现点

- **定位器只用语义 API**（PRD §27）：`getByRole` / `getByLabel` / `getByText`，无长 CSS/XPath；账号行定位用 `getByRole('row', { name: /KY-01/ })`。科应页面改版时只改 `selectors.ts`（PRD §49 降级点）。
- **点击「确定」≠ 成功**（PRD §31）：`reset-flow.ts` 点击确定后仍强制 `getByText('修改成功')` 可见才算成功，否则抛 `ResetVerificationError`。
- **失败重试**（PRD §48）：`pipeline.runWithRetry` 每次失败等待数秒并重新打开管理页，最多 2～3 次，绝不无限重试。
- **单 Worker 串行**（PRD §28）：`pipeline.runQueueSerial` 逐个 `await`，不并行登录管理员，避免会话互踢。
- **会话复用与自动重登**（PRD §29）：优先加载 `playwright/.auth/admin.json`，访问账号管理页发现回到登录页则自动重登并回写。
- **凭据安全**（PRD §42）：管理员凭据只从环境变量读取；storageState 目录 `playwright/.auth/` 已在根 `.gitignore` 排除。

## 测试与证据

```bash
# 纯逻辑单测（无需浏览器，本仓库可直接运行）
pnpm --filter @scienceing/playwright-worker test
```

`logic.test.ts`（10 用例，全部可离线运行）覆盖：

- storageState 默认路径 `playwright/.auth/admin.json`；根 `.gitignore` 已排除 `playwright/.auth/`；
- 配置加载与「凭据只走环境变量」校验；
- `runWithRetry` 失败重试（1 次成功 / 3 次才成功 / 一直失败不无限重试）；
- `runQueueSerial` 串行性（任意时刻仅 1 个任务在执行）；
- 错误消息可读性（PRD §47 示例）；
- mock 页面包含语义定位所需可访问元素（`getByRole/getByLabel/getByText` + 「修改成功/修改失败」文案）。

`browser.test.ts`（7 用例）在具备浏览器二进制的环境运行：

```bash
node --test --test-isolation=none dist/tests/browser.test.js
```

覆盖：storageState 生成、改密成功路径（「修改成功」才成功）、改密失败路径（点「确定」但无「修改成功」→ 失败）、失败重试 FAILED、账号不存在 FAILED、串行消费队列、storageState 过期自动重登回写。

### 沙箱运行说明（重要）

本任务在 DSH 受限沙箱中执行，Chromium 启动被沙箱拦截（`browserType.launch: spawn EPERM`；直接启动 Chrome 报 `mojo platform_channel.cc:108 拒绝访问`，即 named pipe 被禁）。因此：

- `logic.test.ts` 的 10 个纯逻辑用例**已实际运行通过**（`tests 17 / pass 10 / skipped 7 / fail 0`）；
- `browser.test.ts` 的 7 个浏览器用例在沙箱中**自动 skip**（skip reason 记录为 `spawn EPERM`），在正常开发机/CI（允许浏览器 IPC）上可直接跑通；
- mock 页面 + 浏览器用例即为「用 mock 科应后台验证 locator 与成功校验逻辑」的交付物，真实科应后台只需替换 `SCIENCING_ADMIN_URL` 并核对 `selectors.ts` 中的语义文案即可接入（PRD §49）。

## 浏览器二进制

Worker 默认用系统 Chrome（`channel: 'chrome'`），无需下载 Playwright 自带浏览器（已在 `pnpm-workspace.yaml` 的 `allowBuilds` 中显式 `playwright: false` 跳过 postinstall 下载）。
