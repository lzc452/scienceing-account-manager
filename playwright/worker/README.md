# Playwright 管理员改密 Worker

科应共享账号管理平台 —— 管理员改密 Worker（PRD §27–§31、§47–§49）。

单 Worker 串行消费密码重置队列，通过 Playwright 模拟管理员在**真实科应平台**（www.scienceing.com）正常操作：
登录（勾选协议；遇单点登录弹窗自动强制下线其他设备）→ 跳 /search 后显式进入账号管理
→ 按科应账号 username 搜索 → 点「查 询」→ 定位目标行 → 点行内重置 icon
→ AntD 弹窗选「自定义密码」→ 填系统生成的新密码 → 取消「邮件/短信通知」（静默重置）
→ 点「确 定」→ 校验 toast「重置成功」。

> 不是调用科应隐藏 API，而是模拟真实管理员操作（PRD §27）。
> 定位器依据 **2026-09-02 核对的真实科应 DOM**：登录表单 form#login-form（div-id 输入框 + 协议 checkbox）、
> CSS Modules 前缀 class（account_userlist_*）、行内 `td[title="username"]` + iconfont icon-zhongzhimima、AntD modal。
> 页面改版时只需调整 `selectors.ts`（PRD §49 降级点）。

## 目录结构

```text
playwright/worker/
├── src/
│   ├── config.ts        # 环境变量配置（管理员凭据只走环境变量，PRD §42；loginUrl 可配置）
│   ├── selectors.ts     # 真实科应 DOM 定位器（id/placeholder/CSS Modules 前缀/iconfont/AntD class，PRD §27/§49）
│   ├── auth.ts          # storageState 保存/加载 + 登录(勾协议) + 会话失效自动重登（PRD §29）
│   ├── reset-flow.ts    # 单次改密序列（搜索→icon→自定义密码→取消通知→确定→toast「重置成功」）
│   ├── health.ts        # 健康检查三项：登录/账号管理页/重置入口（PRD §49）
│   ├── pipeline.ts      # 纯编排：失败重试（PRD §48）+ 串行队列（PRD §28）
│   ├── worker.ts        # ResetWorker：单 Worker 串行消费者（复用 storageState）
│   ├── cli.ts           # 命令行入口：login / reset / run / check
│   └── tests/
│       ├── logic.test.ts     # 纯逻辑单测（无浏览器即可运行）
│       └── browser.test.ts   # 浏览器流程测试（依赖系统 Chrome，mock 页面）
├── mock/scienceing-admin.html  # mock 科应后台（贴近真实 DOM：登录+协议、CSS Modules 列表、AntD 弹窗）
├── package.json
└── tsconfig.json
```

## 两阶段改密与 t12 接线契约

两阶段机制（PRD §30）由后端与 Worker 协作完成：

| 阶段 | 谁 | 动作 |
| --- | --- | --- |
| Phase 1 | 后端（t6 已实现） | `POST /api/admin/accounts/:id/reset-password`：生成 newPassword → AES 加密写 `pending_password_ciphertext` → 账号 `RECYCLING` → 建 `reset_jobs(PENDING)` |
| Phase 2 浏览器 | **本 Worker** | 真实科应弹窗选「自定义密码」→ 填入 `pending_password`（后端解密明文）→ 取消邮件/短信通知（静默）→ 校验 toast「重置成功」→ 返回 `SUCCESS/FAILED` |
| Phase 2 回写 | 后端（t12 接线） | 依据 Worker 结果回写 DB |

> **关键概念**（与后端约定）：`scienceing_accounts` 表有 `code`（科应内部编号，如 KY-01）和 `username`（科应账号登录名）两个字段。Worker 的 `accountUsername` 入参是 **username**（不是 code），因为后台 `/account/management/list` 的行用 `td[title="username"]` 定位。后端 `reset.service` 必须把 `account.username` 传给 Worker，不能传 `account.code`。

**Worker 输入（`ResetJobInput`）**：

```json
{ "jobId": 1, "accountUsername": "ky01@highpowertech.com", "newPassword": "<后端解密的 pending 明文>" }
```

**Worker 输出（`ResetJobResult`）**：

```json
{ "jobId": 1, "accountUsername": "ky01@highpowertech.com", "status": "SUCCESS", "attempts": 1 }
```

```json
{ "jobId": 1, "accountUsername": "ky04@highpowertech.com", "status": "FAILED", "attempts": 3, "error": "账号「ky04@highpowertech.com」未出现成功文案「重置成功」" }
```

**t12 回写建议**（Phase 2 完成，PRD §30）：

- `SUCCESS`：`current_password_ciphertext = pending_password_ciphertext`、`pending_password_ciphertext = NULL`、账号 `AVAILABLE`、`last_password_changed_at = now`；`reset_jobs → SUCCESS`；审计 `RESET_SUCCESS`。
- `FAILED`：账号 `ERROR`（**绝不自动 AVAILABLE**，PRD §47）；`reset_jobs → FAILED(error_message)`；回收活动租约 `FAILED/release_reason=RESET_ERROR`；审计 `RESET_FAILED`。

### t12 接线（已完成）

后端 `apps/server/src/modules/automation/` 通过**子进程**调用本 Worker CLI（`dist/cli.js`）：

- `PlaywrightResetExecutor`（RESET_EXECUTOR）→ `reset --username X --password Y`，解析 stdout JSON 的 `status/error`（X 是 `account.username`，**不是 code**）；
- `PlaywrightHealthExecutor`（HEALTH_EXECUTOR）→ `check`，解析三项布尔结果（PRD §49）。

选择子进程而非同进程 import 的原因：浏览器崩溃/超时在独立进程内隔离，不拖垮 NestJS API；Worker 与 API 各自独立升级验证。

**接线所需环境变量**（Server 进程侧提供，Worker 子进程自动继承）：

| 变量 | 说明 |
| --- | --- |
| `SCIENCING_ADMIN_URL` / `USERNAME` / `PASSWORD` | 科应账号管理页地址与管理员凭据（PRD §42，必填） |
| `SCIENCING_LOGIN_URL` | 登录页地址（默认由 `ADMIN_URL` 同源推导 `/user/login`） |
| `SCIENCING_WORKER_CLI` | Worker CLI 路径（默认 `<仓库根>/playwright/worker/dist/cli.js`，需先 build） |
| `SCIENCING_WORKER_TIMEOUT_MS` | 单次子进程超时（默认 120000ms） |
| `SCIENCING_STORAGE_STATE` | storageState 绝对路径（默认按 cwd 解析为 `playwright/.auth/admin.json`，**生产建议显式指定绝对路径**，避免受 Server 启动目录影响） |

## 使用

```bash
# 编译
pnpm --filter @scienceing/playwright-worker build

# 1) 管理员首次登录并保存 storageState → playwright/.auth/admin.json（PRD §29）
$env:SCIENCING_ADMIN_URL = 'https://www.scienceing.com/account/management/list'
# $env:SCIENCING_LOGIN_URL = 'https://www.scienceing.com/user/login'   # 可选：默认由 ADMIN_URL 同源推导
$env:SCIENCING_ADMIN_USERNAME = '...'
$env:SCIENCING_ADMIN_PASSWORD = '...'
pnpm --filter @scienceing/playwright-worker login

# 2) 处理单个重置任务
pnpm --filter @scienceing/playwright-worker reset -- --username ky01@highpowertech.com --password '<新密码>'

# 3) 串行消费队列（单 Worker，PRD §28）
pnpm --filter @scienceing/playwright-worker run-queue -- --jobs ./jobs.json

# 4) 健康检查三项（PRD §49，后端 HEALTH_EXECUTOR 子进程调用）
pnpm --filter @scienceing/playwright-worker check
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
| `SCIENCING_ADMIN_URL` | 科应账号管理页地址（真实科应 `/account/management/list`，必填） | — |
| `SCIENCING_LOGIN_URL` | 科应登录页地址（真实科应 `/user/login`） | 同源推导 `/user/login` |
| `SCIENCING_ADMIN_USERNAME` | 管理员用户名（必填，PRD §42 只走环境变量） | — |
| `SCIENCING_ADMIN_PASSWORD` | 管理员密码（必填，PRD §42 只走环境变量） | — |
| `SCIENCING_BROWSER_CHANNEL` | `chrome` / `msedge` / `chromium` | `chrome` |
| `SCIENCING_BROWSER_HEADLESS` | `0` 关闭无头 | 无头 |
| `SCIENCING_STORAGE_STATE` | storageState 路径 | `playwright/.auth/admin.json` |
| `SCIENCING_RESET_SUCCESS_TEXT` | 成功 toast 文案（PRD §31，真实科应「重置成功」） | `重置成功` |
| `SCIENCING_MAX_ATTEMPTS` | 最大尝试次数（PRD §48：2～3） | 3 |
| `SCIENCING_RETRY_DELAY_MS` | 失败重试等待毫秒 | 3000 |
| `SCIENCING_DEFAULT_TIMEOUT_MS` | 单步默认超时 | 15000 |
| `SCIENCING_LOG_FILE` | 运行日志文件路径（覆盖默认） | `playwright/.worker-logs/worker.log` |

### 运行日志（排查「终端无输出」）

Windows 终端（Git Bash/MSYS、部分集成终端）在 node 拉起 Chrome 子进程后，**stdout/stderr 经常整段丢失**
（甚至父 shell 被一起“带走”），表现为：浏览器开了又关、命令行一直没输出——**这不代表失败**（Chrome 关闭往往是
流程正常收尾 `browser.close()`）。

因此所有进度与结果**同步落盘**，终端有没有输出都无所谓：

- 日志文件：`playwright/.worker-logs/worker.log`（追加，已入 .gitignore；可用 `SCIENCING_LOG_FILE` 覆盖）；
- 内容含：命令、环境摘要（不打印密码）、登录/改密各步骤进度、最终 JSON 结果与退出码；
- 排查时跑完直接看文件：

```bash
tail -n 50 playwright/.worker-logs/worker.log
```

若看到 `账号管理页已就绪 / storageState 已保存 / {"ok":true,...}` 即成功；停在某一步即该步超时/失败，据此报错定位。

## 关键实现点

- **定位集中且贴近真实 DOM**（PRD §27/§49）：登录用稳定 id（`#login-form_username/_password`）与 placeholder；账号管理页 CSS Modules class 带随机后缀，统一 `[class*="account_userlist_xxx"]` 前缀匹配；账号行用 `tr:has(td[title="<username>"])`（title = 科应账号 username）；重置入口是行内 iconfont `icon-zhongzhimima`；弹窗用 AntD 稳定类（`.ant-modal-*`）。改版时只改 `selectors.ts`。
- **按钮文本带空格**：真实科应按钮文案形如「查 询」「重 置」「确 定」，统一用 `/查\s*询/` 等正则匹配可访问名。
- **登录需勾选协议、成功后跳 /search**：`auth.ts` 先勾选「我已阅读并同意」再提交；登录成功（URL 离开 `/user/login`）后显式二次导航进账号管理页。
- **单点登录强制确认**：真实科应同账号在别处已登录时，提交后会弹「由于您的账号已经在其他地方登录...」确认框（不依赖 antd 类名，通过页面正文文本检测，提交后轮询最多 10s 等待），自动点「确 定」强制下线其他设备再继续；最多处理两轮。
- **会话就绪判定抗首屏竞态**：`isAuthenticated` 在 `goto(adminUrl)` 后**先 waitFor 筛选区可见 5s**，命中即已登录，避免冷启动慢导致误判为未登录。
- **成功 = toast「重置成功」**（PRD §31）：`reset-flow.ts` 点「确 定」后强制 `getByText('重置成功', { exact: true })` 可见才算成功，否则抛 `ResetVerificationError`（成功文案可用 `SCIENCING_RESET_SUCCESS_TEXT` 覆盖）。
- **静默重置**：弹窗中「邮件通知/短信通知」默认勾选（会向账号发通知），Worker 一律取消勾选后再提交；取消失败直接失败，绝不泄露通知。
- **先搜索再定位**：账号列表可能分页，流程先在筛选区按用户名搜索 → 点「查 询」→ 等目标行出现，规避目标行不在 DOM 的问题。
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
- mock 页面包含真实科应定位所需稳定锚点（`#login-form`、`login-form_username/_password`、CSS Modules 前缀、`td[title]`、`icon-zhongzhimima`、`.ant-modal-title`、radio「自定义密码」、「重置成功/重置失败」toast）。

`browser.test.ts`（7 用例）在具备浏览器二进制的环境运行：

```bash
node --test --test-isolation=none dist/tests/browser.test.js
```

覆盖：storageState 生成、改密成功路径（搜索→自定义密码→取消通知→toast「重置成功」）、改密失败路径（点「确 定」但无成功 toast → 失败）、失败重试 FAILED、账号不存在 FAILED、串行消费队列、storageState 过期自动重登回写。

### 运行环境说明（重要）

- **Windows + node:test 已知限制**：测试文件内若出现第二个 Chrome 实例（`ResetWorker` 自行 launch），node test runner 可能因孙子进程继承 stdout 管道句柄而挂起（本机 Node 22.22.2 复现，非业务缺陷）。因此：
  - `browser.test.ts` 中**不涉及 ResetWorker 的用例**（登录生成 storageState、成功/失败路径）在 runner 内可直接通过；
  - 涉及 `ResetWorker` 的用例（失败重试 / 账号不存在 / 串行队列 / 会话过期回写）建议用独立脚本跑（与仓库既往 `pw-verify` 做法一致），本机已分别验证：KY-04 → `FAILED attempts=3`、KY-99 → `FAILED 未找到账号「KY-99」`、KY-01/KY-02 串行队列全部 `SUCCESS`、会话过期自动重登并回写 `authed=true`。
- mock 页面 + 浏览器用例即为「用 mock 科应后台验证 locator 与改密序列」的交付物；真实科应只需替换 `SCIENCING_ADMIN_URL` 并核对 `selectors.ts` 中两处**待核对的文案候选**即可接入（PRD §49）：
  1. 「密码重置方式」里「自定义密码」radio 的精确文案（候选：自定义密码 / 指定密码 / 手动设置）；
  2. 选自定义后新密码输入框的 placeholder（候选：请输入新密码 / 输入新密码 / 设置新密码）。
  二者位于 `selectors.ts` 顶部常量数组，Worker 会依次尝试并给出可读报错。

## 浏览器二进制

Worker 默认用系统 Chrome（`channel: 'chrome'`），无需下载 Playwright 自带浏览器（已在 `pnpm-workspace.yaml` 的 `allowBuilds` 中显式 `playwright: false` 跳过 postinstall 下载）。
