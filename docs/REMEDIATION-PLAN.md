# 科应共享账号管理平台 — 全量问题修复计划

> **依据**：四轮审查合并问题清单（5 × L0 / 27 × L1 / 18 × L2，共 50 项）
> **编制日期**：2026-09-15
> **覆盖范围**：`apps/server` · `apps/web` · `apps/extension` · `playwright/worker` · `deploy-lan/scripts` · 根部署脚本
> **验证基线**：`pnpm lint` · `pnpm typecheck` · `node --test`（worker 逻辑/浏览器测试）· 后端 e2e · `deploy-lan` 部署自检

---

## 0. 摘要与总体判断

| 维度 | 结论 |
|---|---|
| 修复总量 | 50 项：L0 5 · L1 27 · L2 18 |
| 建议批次 | **P0 热修**（L0 全部）→ **P1 稳定与安全**（高风险 L1）→ **P2 一致性**（其余 L1）→ **P3 加固清理**（L2） |
| 关键路径 | `L0-4 → L0-1 → L1-13`（同一处「后端 ↔ Worker 子进程」IPC 通道，必须合并改造，不可分次上线） |
| 最高杠杆 | **L0-2、L0-4**：改动各在 10 行内，一个消除「单请求打挂网关」，一个消除「改密成功却记失败 + 密码与平台发散」 |
| 唯一凭证外泄项 | **L0-1**：明文口令落盘（`worker.log` + DB），跨进程边界，工作量中等 |
| 统一根因 | **L0-1 / L1-20 / L1-21 / L1-22 / L2-18 同源**——「密钥与信任决策跨进程 / 跨网络边界时未重新校验」。建议按**模式**修复（统一 IPC 契约 + 统一来源可信判定），而非逐 bug 打补丁 |

**整体判断**：L0 全部为「小改动、大后果」类型，可在 1 个发布窗口内清空；L1 中真正带数据/安全后果的集中在**后端事务与状态机（L1-1~L1-4）**、**部署脚本的破坏性动作（L1-21~L1-24）**、**前端会话与 mock 默认值（L1-14/L1-15）** 三处，应在 P1 优先收敛；其余 L1/L2 属可维护性与卫生问题，可排入常规迭代。

---

## 1. 修复优先级总排序

工作量口径：**S** ≤ 0.5 人日 · **M** ≈ 1 人日 · **L** ≈ 2–3 人日。

### P0 — 热修（必须立即，同一发布窗口）

| 序 | 编号 | 标题 | 工作量 | 依赖 |
|---|---|---|---|---|
| 1 | **L0-2** | `GET /%` 打挂 node 网关 | S | — |
| 2 | **L0-4** | 超时丢弃已打印的 `SUCCESS` | S | — |
| 3 | **L0-5** | `db:reset-admin` 未传 env，改的是 dev 库 | S | — |
| 4 | **L0-3** | 生产默认 `admin/admin12345` | S | 与 L0-5 同文件，合并提交 |
| 5 | **L0-1** | 明文口令写入 `worker.log` 与 DB | M | **依赖 L0-4**（共用 IPC 通道改造） |

#### P0 执行状态（2026-09-15：已完成）

| 编号 | 状态 | 改动文件 | 验证证据 |
|---|---|---|---|
| L0-2 | ✅ 完成 | `deploy-lan/scripts/gateway.mjs` | 新增 `scripts/test/gateway-resilience.test.mjs`（`pnpm test:deploy-gateway`）：`/%` 等畸形编码返回 400、编码穿越返回 403、异常后进程存活、`/api/*` 502 不拖垮进程。对修复前版本运行同一测试以 `ECONNRESET` 失败，证明测试有判别力 |
| L0-4 | ✅ 完成 | `worker-client.ts` · `automation.executor.ts` · `cli.ts` | 去掉 `result.ok &&` 守卫；新增 `SCIENCING_RESULT_FILE` 原子结果文件（含 jobId 归属校验、一次性消费）。5 项行为测试全绿：超时后 SUCCESS 不丢失、stdout 丢失可从文件恢复、jobId 不匹配被拒、结果文件无残留 |
| L0-5 | ✅ 完成 | `deploy-lan/scripts/deploy.mjs` | `spawnSync` 传入 `productionEnv()` 并回显目标库。实测输出 `目标数据库: …\data\scienceing.prod.db`，dev 库 admin 行前后完全未变 |
| L0-3 | ✅ 完成 | `deploy-lan/scripts/deploy.mjs` | `env:init` 改为 `randomBytes(18).base64url` 随机生成并只显示一次；`db:reset-admin` 缺省时 `die()`。实测：随机口令非弱口令、二次运行幂等不覆盖、缺省时显式失败 |
| L0-1 | ✅ 完成 | `cli.ts` · `worker-client.ts` · `automation.executor.ts` · `reset.service.ts` · 新增 `apps/server/src/lib/redact.ts` | 口令改走 stdin（`--password-stdin`）；删除 `process.argv` 整体回显；新增 `redactSecrets()` 覆盖 `--password`/JSON/kv/`Authorization: Bearer` 四种形态。实测 `worker.log` 无明文口令，错误信息中 argv 口令被替换为 `<redacted>` |

> 说明：本次改动同时引入了 `--job-id` 参数（后端 → Worker），供结果文件归属校验使用；`--password` 保留为兼容用法但会记录告警。Worker 与后端**必须同窗口部署**（IPC 契约变更）。

### P1 — 稳定与安全（第 1 周）

| 序 | 编号 | 标题 | 工作量 | 依赖 |
|---|---|---|---|---|
| 6 | **L1-1** | Master Key 未设置时每次返回新随机 key | S | 与 L2-14 同模块 |
| 7 | **L1-21** ✓ | `X-Forwarded-For` 可伪造，`audit_logs.ip` 失真 | S | — |
| 8 | **L1-22** | `/scienceing/` 过宽 kill 匹配（两份副本） | S | 与 L1-25/L1-26 共用部署 helper |
| 9 | **L1-24** | `ensureNginxPrefix` 清空 `logs/`（含 `nginx.pid`） | S | — |
| 10 | **L1-2** | `recycleTimedOutLeases` 三次写无事务 | M | 参照 `release()` L178 模板 |
| 11 | **L1-3** | Job 永久卡 `RUNNING` | M | 与 L0-4 / L1-13 同链路 |
| 12 | **L1-4** | Worker 配置错误被当瞬时失败重试 → 账号批量 `ERROR` | S | — |
| 13 | **L1-7** | CORS 反射任意 Origin + 登录接口无限流 | M | **L1-14 的前置** |
| 14 | **L1-14** | 会话 token 存 `localStorage`，架空 httpOnly cookie | M | **依赖 L1-7 + L2-15** |
| 15 | **L1-15** | `USE_MOCK` 默认 mock | S | 与 L1-14 同文件 |
| 16 | **L1-20** | `deploy --force` 为空操作 | S | — |
| 17 | **L1-23** | `db-doctor --fix` 重放非 DDL 语句 | M | — |
| 18 | **L1-25** | 生产机跑 `npm install` + 硬编码版本 | M | 依赖 L1-26 的清理边界 |
| 19 | **L1-26** | `dist` / `dist-build` 陈旧 chunk 累积 | S | — |
| 20 | **L1-27** | 发布测试门禁可被 `skip` 架空 | S | — |

#### P1 执行状态（2026-09-15 核实：已全部完成）

> **重要**：核实发现 P1 的绝大多数条目**已由另一个并发进程在同一工作树中实施**（09:29–09:57 期间，`master-key.ts` / `main.ts` / `auth.*` / `api/index.js` / `leases.service.ts` / `db-doctor.mjs` / `nginx-ctl.mjs` / `lib.mjs` / `deploy-release.ps1` 等出现非本次会话的改动，并新增 `lib/rate-limit.ts`、`auth/session-sweep.scheduler.ts`、`scripts/test/{backend-invariants,deploy-utils}.test.mjs`）。本节为**逐项核实后的实际状态**，而非计划原文。

| 编号 | 状态 | 实现要点 |
|---|---|---|
| L1-1 | ✅ 已修（并发方） | `master-key.ts`：模块级 `fallbackKey` memoize + 生产缺失时 `throw` |
| L1-2 | ✅ 已修（并发方） | `recycleTimedOutLeases` 内 `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` |
| L1-3 | ✅ 已修（并发方） | `getAccount`/`ensurePhase1` 移入 `try`，新增 `requeueFatal` 原样退回 PENDING |
| L1-4 | ✅ 已修（并发方） | `ResetJobResult` 增 `fatal` 字段；executor 返回 `fatal: true`，队列中断并上报 |
| L1-7 | ✅ 已修（并发方） | `main.ts` `corsOrigins()` 白名单 + 自研 `lib/rate-limit.ts`（未引入 @nestjs/throttler） |
| L1-14 | ✅ 已修（并发方） | 前端不再存 token、改用 `credentials: 'include'`；新增 `POST /auth/extension-token` 供扩展按需取令牌 |
| L1-15 | ✅ 已修（并发方） | `USE_MOCK = VITE_USE_MOCK === 'true'`；`buildWeb` 显式注入 `VITE_USE_MOCK: 'false'` |
| L1-20 | ✅ 已修（并发方） | `fullDeploy({ ..., force = false, ... })` 并透传 |
| L1-21 | ✅ 已修（并发方） | 网关将 `x-forwarded-for` 覆写为 socket 远端地址 |
| L1-22 | ✅ 已修（并发方） | `lib.mjs` 新增 `isOurServiceCmd()`，按 `APP_SERVER/dist`、`DEPLOY_DIR/scripts`、`NGINX_PREFIX` 匹配 + 窄化兜底 |
| L1-23 | ✅ 已修（并发方） | `db-doctor.mjs` 新增非 DDL 迁移白名单（按迁移版本登记，附人工复核理由） |
| L1-24 | ✅ 已修（并发方） | `LOG_KEEP = Set(['nginx.pid'])` + `rotateNginxLogs()` 轮转替代清空 |
| L1-25 | ✅ 已修（并发方） | `npmInstallAllowed()` 显式开关（默认拒绝联网补装）+ `lockedVersion()` 从 `pnpm-lock.yaml` 解析 |
| L1-26 | ✅ 已修（并发方） | `clearDirectoryExcept(WEB_DIST, [...WEB_DIST_KEEP])` + 先构建到 `dist-build` 暂存目录再同步 |
| L1-27 | ✅ **本次完成** | `browser.test.ts`：`requireBrowser()` 内计数 + `after` 钩子断言 `MIN_EXECUTED_TESTS = 7` |
| L2-15 | ✅ 已修（并发方） | `isSecureRequest()` 条件 `secure`；新增 `session-sweep.scheduler.ts` 周期清扫过期会话 |

**L1-27 验证证据**：本机 Chrome 可用时 7/7 执行、`skipped 0`、退出码 0（不误伤）；把 `channel` 改为不存在的值模拟无浏览器时，7 个用例全部 SKIP，`after` 钩子抛出「仅实际执行 0/7 个，发布门禁不成立」并使退出码变为 **1**；将阈值临时改为 0（等价修复前）后同样 7 个 SKIP 却退出码 **0**。前后对比确认门禁已恢复判别力。

> 注意：`pnpm --filter @scienceing/playwright-worker test` 中的 `--test-isolation=none` 在本机 Node 22.22.2 上报 `bad option`，需去掉该参数方可运行（与 L1-27 无关，属既有环境问题）。

#### P1 交叉验证（2026-09-15：已完成，结论为「有判别力」）

由于 P1 的实现方与测试方都是同一个并发进程，存在「自证」风险。为此做了独立复核：用 `git archive HEAD` 导出**修复前**源码树并编译，再把**同一份测试**跑在 pre-fix 代码上 —— 测试若在 pre-fix 下通过，即为空转。

| 用例 | pre-fix 下的表现 | 判定 |
|---|---|---|
| L1-1 复用同一把 key | FAIL：`两次调用必须返回同一把 key` | ✅ 有判别力 |
| L1-2 回收事务原子性 | FAIL：租约未回滚 | ✅ |
| L1-3 启动清扫 | FAIL：`svc.sweepStaleRunningJobs is not a function` | ✅ |
| L1-3 账号缺失不卡 RUNNING | FAIL：`账号不存在` 异常逃逸出 `processPendingJobs` | ✅ |
| L1-4 致命错误暂停队列 | FAIL | ✅ |
| L1-7 限流 | FAIL：`Cannot find module rate-limit.js` | ✅ |
| L2-15 会话清扫 | FAIL：`svc.sweepExpiredSessions is not a function` | ✅ |
| L1-2 正常回收一致性 / 不误踢 / L1-4 普通失败计数 | PASS | 有意的回归护栏，非判别用例 —— 合理 |
| L1-22 进程归属 | FAIL：旧 `/scienceing/i` 命中 VS Code / bash / explorer 命令行 | ✅ |
| L1-24 nginx 日志轮转 | FAIL：`nginx.pid` 被删空 | ✅ |
| L1-21 XFF 透传 | FAIL：`客户端声称的 X-Forwarded-For 不得透传，实际 1.2.3.4` | ✅ |
| L1-23 DML 重放守卫 | 清空白名单后中止：`应用迁移 v3 失败：迁移 v3 含非 DDL 语句，但未登记为「可安全重放」`（退出码 1） | ✅ |

**一处更正**：`auth.service.ts` 的 `sweepExpiredSessions()` 起初被误判为 HEAD 既有代码，pre-fix 测试证明它是本次新增的（`is not a function`）。教训：看起来像「早就有」的实现，也要跑一遍才算数。

**无自动化测试的项改以结构性核实**：

| 编号 | 核实方式 | 结论 |
|---|---|---|
| L1-14 | 对照 HEAD：`localStorage.getItem('scienceing_token')`（旧）→ 仅剩 `removeItem` 迁移清理；请求改 `credentials:'include'`；新增 `POST /auth/extension-token` | ✅ |
| L1-15 | HEAD `VITE_USE_MOCK !== 'false'`（默认 mock）→ 现 `=== 'true'`；且 `deploy.mjs` 构建注入 `VITE_USE_MOCK:'false'`、`dev.mjs` 写 `.env.local` 双向兜底 | ✅ |
| L1-20 | `fullDeploy` 解构 `force` 并一路传至 `stopBackend` / `stopGateway`（两者均已接受并使用该参数） | ✅ |
| L1-25 | `lockedVersion()` 实测解析 markdown-it `14.3.1` / dompurify `3.4.14` / echarts `5.6.0`，与 lockfile 一致；HEAD 硬编码为 `14.1.0` / `3.2.4`，漂移属实 | ✅ |

**结论：P1 全部 15 项 + L2-15 均已落地且经独立验证。** 剩余未覆盖项为 L2（18 项），其中 L2-14 涉及 AAD 变更，须先备份生产库并配套数据迁移。

#### 补充修复：db-doctor 静默切换目标库（L2-18 ⑤，验证过程中发现并已修复）

**问题**：`detectDatabase()` 原实现是「从候选列表里挑第一个**存在**的库」。当 `DATABASE_PATH` 指向一个尚不存在的文件时，它会静默改用其它库。

**实测对照**（同一个输入：`DATABASE_PATH=<不存在的路径>`）：

| 版本 | 行为 |
|---|---|
| 修复前（HEAD） | 静默改用 `data/scienceing.dev.db`，并输出 `结论 : ✔ 结构已是最新` |
| 修复后 | `[db-doctor] DATABASE_PATH 指向的数据库不存在：<路径>`，退出码 **2** |

由于 `db-doctor --fix` 会写库，这个行为在生产机上的后果是：**把修复打到错误的数据库，而输出还在告诉你「已是最新」**。它比直接报错危险得多——报错会被看见，静默换库不会。

**修复后的契约**（`deploy-lan/scripts/db-doctor.mjs`）：

1. `--database <绝对路径>` —— 必须存在；
2. `DATABASE_PATH` 环境变量 —— 必须存在，**不得顺延到其它库**；
3. 按 `NODE_ENV` 推导（`production` → `scienceing.prod.db`，否则 `scienceing.dev.db`）—— 必须存在；
4. 三者都确定不了 → 退出码 2，并列出「本来可能被误选的现存库」，让操作者一眼看到风险；
5. 历史库 `scienceing.db` 退出自动选择，仅可经 `--database` 显式使用。

输出新增 `目标来源` 一行，说明「为什么是这个库」；`--json` 输出新增 `databaseSource` 字段。

**部署流程不受影响**（已逐点核实）：`deploy.mjs` 的 `ensureSchema` / `cmdDbDoctor` 都传 `productionEnv()`（含 `DATABASE_PATH` + `NODE_ENV=production`），且 `ensureSchema` 先判断 `existsSync(DB_FILE)`；`deploy-release.ps1` 在 `Set-ProductionEnvironment` 中设置两者，且 `db:migrate` 先于 `db:doctor` 执行（建库在前）。

**回归测试**：新增 `scripts/test/db-doctor-target.test.mjs`（`pnpm test:db-doctor`），5 条用例。
判别力已验证：对修复前版本运行同一测试 —— **5 条全部失败**；修复后 5/5 通过。

### P2 — 一致性与可维护性（第 2 周）

| 序 | 编号 | 标题 | 工作量 | 依赖 |
|---|---|---|---|---|
| 20 | **L1-8** | 健康检查与改密共用单会话 admin，互相踢下线 | M | 与 L1-9 / L1-10 同模块 |
| 21 | **L1-9** | `isAuthenticated` 5s 窗口过紧 | S | — |
| 22 | **L1-10** | 重试嵌套（最多 9 次）+ 重复 `goto` | M | 依赖 L0-4 的重试归属决策 |
| 23 | **L1-11** | `username` 拼进 CSS 选择器 / `rename` 不校验字符集 | S | — |
| 24 | **L1-12** | `0o600` 在 Windows 失效，会话文件继承 ACL | S | — |
| 25 | **L1-13** | 超时先 resolve，孤儿 Chrome 残留 | M | **依赖 L0-4**（同文件 `worker-client.ts`） |
| 26 | **L1-5** | `?page=abc` → 500 | S | — |
| 27 | **L1-6** | 「必须装扩展」规则信任 `Origin` 头 | S | 文档化为主 |
| 28 | **L1-16** | lease token 存 `sessionStorage` + `postMessage('*')` | S | — |
| 29 | **L1-17** | `.vue` 完全未被 lint | S | 与 L2-1 / L2-12 同批（暴露死代码） |
| 30 | **L1-19** | 「确认归还」按钮实际不归还 | M | **前置 L1-18** |
| 31 | **L1-18** | `deploy-lan/extension-lan/` 陈旧分叉，同版本号冒充 | S | **依赖 L1-19**（协议变更后重新打包） |

### P3 — 加固与清理（第 3–4 周）

L2 全 18 项，见 §5。其中 **L2-14 / L2-15 / L2-16** 属安全加固，建议随 P1 的 L1-14 一并做（见 §2 依赖链）。

---

## 2. 依赖关系与先后顺序

### 2.1 关键依赖链（必须串行）

```
链路 A ── 后端 ↔ Worker IPC 契约改造（不可拆分上线）
  L0-4 (结果落盘 + SUCCESS 判定)
      └─► L0-1 (口令改走 stdin / 0600 临时文件，删除 argv 回显)
      └─► L1-13 (等待子进程 close，避免孤儿 Chrome)
      └─► L1-10 (收敛重试归属，去掉重复 goto)
      └─► L1-3  (卡 RUNNING 的兜底 sweep 依赖超时语义确定)

链路 B ── 前端会话安全（有严格顺序）
  L1-7 (CORS 白名单 + 登录限流)
      └─► L1-14 (去掉 localStorage token，改用 cookie)
      └─► L2-15 (cookie secure / __Host- 前缀 + 会话清扫)
      └─► L2-16 (CSP —— L1-14 的最廉价补偿)
      └─► L1-15 (USE_MOCK 默认反转，需在真实鉴权可用后)

链路 C ── 部署脚本（共用 helper，合并改造）
  L1-22 (按解析路径匹配 kill，抽取共享 helper)
      └─► L1-25 (npm install 门禁 + 版本读 lockfile)
      └─► L1-26 (构建目录清理边界)
      └─► L2-18 (pnpm 版本对齐、deny-list 改 allowlist)

链路 D ── 扩展协议（先改协议再打包）
  L1-19 (新增 RELEASE_LEASE 消息)
      └─► L1-18 (extension:pack + 版本单一来源，杜绝陈旧分叉)

链路 E ── 加密模块（同文件，合并改造）
  L1-1 (memoize + 生产缺 key 拒绝启动)
      └─► L2-14 (AAD 绑定 account.id / HMAC 子密钥 / timingSafeEqual)

链路 F ── 部署密钥与运维
  L0-3 (随机 ADMIN_INITIAL_PASSWORD)
      └─► L2-18 (发布密钥 deny-list 扩展)
```

### 2.2 可并行（无依赖）

- **L0-2**（网关）与链路 A 完全独立，可最先合入。
- **L0-5 / L0-3** 同在 `deploy.mjs`，与其它链路无关。
- **L1-21**（XFF）、**L1-24**（nginx 日志）、**L1-1**（master key）、**L1-5 / L1-6 / L1-11 / L1-12 / L1-16 / L1-17** 均可独立并行。
- **L1-23**（db-doctor）与 **L1-27**（测试门禁）互不相关。

### 2.3 冲突提示（同文件，避免并行提交）

| 文件 | 涉及编号 | 建议 |
|---|---|---|
| `apps/server/src/modules/automation/worker-client.ts` | L0-4 · L0-1 · L1-13 | 一次改完 |
| `deploy-lan/scripts/deploy.mjs` | L0-5 · L0-3 · L1-20 · L1-22 · L1-25 · L1-26 | 分 2 次提交（L0 一次 / L1 一次） |
| `apps/web/src/api/index.js` | L1-14 · L1-15 | 一次改完 |
| `apps/server/src/crypto/master-key.ts` | L1-1 · L2-14 | 一次改完 |
| `playwright/worker/src/cli.ts` | L0-1 · L0-4 | 一次改完 |
| `apps/server/src/modules/reset/reset.service.ts` | L0-1 · L1-3 · L1-10 | 与链路 A 同批 |

---

## 3. L0 逐项修复方案（详）

### L0-1 — 生成的口令明文写入 `worker.log` 与数据库

| 项 | 内容 |
|---|---|
| **修复目标** | 让改密口令在「后端 → Worker 子进程」全程不进入 argv、不进入日志、不进入 DB 的错误/审计字段，恢复 AES-256-GCM 静态加密的设计意图，兑现「凭据绝不进日志」的自我承诺 |
| **影响范围** | `apps/server/src/modules/automation/automation.executor.ts:33` · `apps/server/src/modules/automation/worker-client.ts` · `playwright/worker/src/cli.ts:142` · `apps/server/src/modules/reset/reset.service.ts:178,195` |
| **修复方案** | ① 新增 `runWorkerCli(args, { stdin })`，口令经 `child.stdin` 写入而非 `--password` argv；`cli.ts` 增加 `--password-stdin`（或 `readStdin()`）读取，`parseArgs` 不再接受 `--password`。② 删除 `cli.ts:142` 的 `process.argv.slice(2).join(' ')` 回显，改为只回显命令名与 `username`（username 非敏感）。③ 兜底清理：`reset.service.ts` 写入 `error_message` 与审计 `metadata.error` 前，统一过一层 `redactSecrets(text)`（掩掉形如口令的片段与含 `--password` 的行）；`worker-client.ts` 在 `finish()` 前对 `stdout/stderr` 同样脱敏。④ 过渡期若需兼容旧 CLI，可先同时支持 argv 与 stdin，但后端立即切到 stdin。 |
| **影响评估** | **收益**：消除唯一的凭证落盘路径（日志文件、`reset_jobs.error_message`、`audit_logs.metadata` 三处）。**回归风险**：中等——跨进程契约变更，需同步升级 Worker 与后端，**版本不同步会导致改密全部失败**；必须在同一发布窗口内同时部署，且部署脚本需校验 Worker CLI 版本。**回滚**：保留 argv 兼容分支即可单侧回滚。**运维影响**：`worker.log` 历史文件已含历史明文口令，需在修复同时提供一次性清理（删除/归档旧日志）。 |

### L0-2 ✓ — `GET /%` 打挂 node 网关

| 项 | 内容 |
|---|---|
| **修复目标** | 任意畸形 URL 不再导致网关进程退出，杜绝「一个请求 = 整站下线直到人工重跑 `start.bat`」 |
| **影响范围** | `deploy-lan/scripts/gateway.mjs:63,71,131` |
| **修复方案** | ① `safePath()` 内 `decodeURIComponent` 包 try/catch，失败返回 `null` → 上层回 400（区别于路径穿越的 403）。② 请求分发处：`proxyApi(req, res)` 与 `serveStatic(req, res)` 均改为 `Promise.resolve(...).catch(err => { if (!res.headersSent) res.writeHead(500); res.end('Internal Server Error'); })`，或直接 `void serveStatic(...).catch(...)`。③ 兜底 `server.on('clientError', (err, socket) => socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'))`。④ 顶层加 `process.on('unhandledRejection')` / `uncaughtException` 记录并**不退出**（网关是单点，宁降级不宕机）。 |
| **影响评估** | **收益**：可用性硬提升，改动 < 20 行。**回归风险**：低——仅新增错误分支，正常路径不变；需确认 400/403 语义与 `/downloads/*` 的 404 回退不被误伤。**验证**：`curl -i 'http://host:18080/%'` 应返回 400 且进程存活；`curl` 合法路径与 `/api/*` 回归。**回滚**：单文件，直接回退。 |

### L0-3 — 生产默认弱口令 `admin/admin12345`

| 项 | 内容 |
|---|---|
| **修复目标** | 全新生产部署不再以已知字面口令启动；`db:reset-admin` 在缺少显式口令时**失败而非兜底**，让「静默不安全」变成「显式报错」 |
| **影响范围** | `deploy-lan/scripts/deploy.mjs:815`（`env:init` 默认值）· `deploy-lan/scripts/deploy.mjs:779`（`db:reset-admin` 兜底） |
| **修复方案** | ① `env:init` 中 `ADMIN_INITIAL_PASSWORD` 改为 `randomBytes(...)` 生成强随机口令（与已实现的 `SCIENCEING_MASTER_KEY` 同一写法），并在生成后**打印一次**提示操作者记录（写入 `.env` 已有、状态输出不显示）。② `db:reset-admin` 去掉 `|| 'admin12345'`，改为：`ADMIN_INITIAL_PASSWORD` 缺失时 `die()` 并提示「请在 .env 显式设置或执行 env:init」。③ README 与 `env:init` 头部注释同步（README 承诺的强随机口令至此才成立）。 |
| **影响评估** | **收益**：消除可被扫描的默认凭证。**回归风险**：中低——既有已部署环境 `.env` 已有该键，不受影响；**新部署流程若依赖「默认口令即可登录」的文档/脚本需同步更新**（属破坏性变更，需在 DEPLOYMENT.md 标注）。**回滚**：恢复默认值即可，但会重新引入弱口令，不建议。 |

### L0-4 ✓ — 超时丢弃已打印的 `SUCCESS`

| 项 | 内容 |
|---|---|
| **修复目标** | 只要 Worker 已明确输出 `status:'SUCCESS'`，后端就判定成功，不因进程退出码/超时而反转结论；避免「平台已改密、库里仍是旧密码」的静默发散 |
| **影响范围** | `apps/server/src/modules/automation/automation.executor.ts:35` · `apps/server/src/modules/automation/worker-client.ts:98-102` · `playwright/worker/src/cli.ts` |
| **修复方案** | ① `automation.executor.ts:35` 去掉 `result.ok &&`，改为 `if (output?.status === 'SUCCESS') return { success: true }`。② `cli.ts` 在打印 JSON 的同时把结果**同步落盘**到约定文件（如 `SCIENCING_RESULT_FILE` 或 `<logDir>/last-result.json`，原子写：临时文件 + rename）。③ `worker-client.ts` 在 kill 后读取该结果文件回填 `raw`，使「已成功但被杀」仍可解析。④ 结果文件在读取后删除，避免陈旧结果串到下一次。 |
| **影响评估** | **收益**：消除最难排查的一类数据发散（需人工比对平台与 DB 才能发现）。**回归风险**：中——放宽成功判定需防止「上一次的陈旧 SUCCESS 被本次误读」，因此**必须**配合结果文件的一次性消费与 jobId 校验（建议结果文件内含 jobId，后端比对一致才采纳）。**回滚**：恢复 `result.ok &&`。 |

### L0-5 — `db:reset-admin` 实际改的是 dev 库

| 项 | 内容 |
|---|---|
| **修复目标** | 恢复口令重置这一灾难恢复路径的真实性，不再「打印成功但生产 admin 口令未变」 |
| **影响范围** | `deploy-lan/scripts/deploy.mjs:778,795` |
| **修复方案** | 将 `productionEnv()` 的返回值传入 `spawnSync` 的 `env`（当前仅传了 `cwd`），确保 `DATABASE_PATH` 到达内联脚本；同时在脚本内**回显实际使用的数据库路径**（`console.log('目标库: ' + dbPath)`），让「改了哪个库」可被肉眼确认。 |
| **影响评估** | **收益**：恢复一条关键恢复路径，并让它自带可验证输出。**回归风险**：低——纯补参数；需确认 `productionEnv()` 不覆盖 `PATH`/`SystemRoot` 等必需变量（Windows 上 `spawnSync` 需完整 env，建议 `{ ...process.env, ...productionEnv() }`）。**验证**：故意用错误口令重置 → 登录失败；用正确口令 → 登录成功且提示改密。**回滚**：单行。 |

---

## 4. L1 修复方案（按模块）

### 4.1 后端 `apps/server`

| # | 修复目标 | 影响范围 | 修复方案 | 影响评估 | 依赖 |
|---|---|---|---|---|---|
| **L1-1** | Master Key 在未设置时行为可预测，生产拒绝启动 | `crypto/master-key.ts:31` | 模块级变量 memoize 兜底 key（一次随机、进程内复用）；`NODE_ENV === 'production'` 且缺 key 时 `throw`，让进程启动即失败 | 收益：消除「重启后全部密文不可解」的隐性数据丢失；风险：低，但**需确认 CI/e2e 不依赖隐式兜底**（测试环境应显式注入 key） | 与 L2-14 同文件 |
| **L1-2** | 超时回收具备原子性 | `leases.service.ts:258-300` | 循环体内以 `BEGIN IMMEDIATE` / `COMMIT` 包裹 lease + account + `reset_jobs` 三次写，异常 `ROLLBACK`，模板对齐 `release()` L178 | 收益：消除「账号卡 RECYCLING 且无 reset_job」的孤儿态；风险：低，但循环内开事务会拉长持锁时间，**需评估候选集规模**（当前为 ACTIVE 且超时租约，量小） | 参照 `release()` |
| **L1-3** | Job 不会永久停留 `RUNNING` | `reset.service.ts:98-101` | 把 `getAccount()` 与 `ensurePhase1()` 移入 `try`，异常走 `handleFailure`；另加启动期 sweep：`UPDATE reset_jobs SET status='PENDING' WHERE status='RUNNING'`（进程重启即认为 RUNNING 已失效） | 收益：消除需人工介入的卡死态；风险：中——sweep 需确认多实例部署下不会互相抢占（本项目为单 Worker 串行，风险可控，但需在文档写明前提） | 与 L0-4 同链路 |
| **L1-4** | Worker 配置错误不再被当作瞬时失败 | `automation.executor.ts:30` | `checkWorkerEnv()` 失败时返回**致命错误标记**（如 `{ success:false, fatal:true }`），`processPendingJobs` 收到 fatal 即暂停队列并上抛可读配置错误，不再消耗 `attempt_count` | 收益：避免「一次配置错误 → 30s 内整池账号烧到 ERROR」；风险：低，但需前端/管理端有呈现 fatal 状态的入口 | — |
| **L1-5** | 非法分页参数返回 400 而非 500 | `admin.controller.ts:53` · `admin.service.ts:176` | 用 `ParseIntPipe`（或 `DefaultValuePipe` + 校验）替换 `Number(page)`；`admin.service` 侧对非有限值回落默认 | 收益：消除一处 500；风险：低 | — |
| **L1-6** | 明确「扩展必须安装」的效力边界 | `extension-proof.service.ts:38-74` | 文档化：这是**策略性提示**而非安全控制；若确需强制，改为服务端下发 nonce、由扩展签名回传 | 收益：避免虚假安全感；风险：低（文档为主） | — |
| **L1-7** | 收敛跨域与会话攻击面 | `main.ts:17` | `enableCors({ origin: [dashboardOrigin], credentials: true })` 白名单；对 `login` / `verify-password` 加限流（如 `@nestjs/throttler`） | 收益：阻断「任意 Origin 反射 + 无限次爆破」组合；风险：中——**白名单需覆盖 dev(5173)/生产(18080)/局域网 IP 三种来源**，漏配会直接导致登录失败，需在 `.env` 提供 `CORS_ORIGINS` | **前置 L1-14** |

### 4.2 Playwright Worker `playwright/worker`

| # | 修复目标 | 影响范围 | 修复方案 | 影响评估 | 依赖 |
|---|---|---|---|---|---|
| **L1-8** | 健康检查不再踢掉在途改密 | `health.ts:24-26` · `admin.controller.ts:69` | 方案 A：健康检查排入改密队列之后串行执行；方案 B：复用已落盘的 `storageState`，检查过程绝不重新登录 | 收益：消除「自检导致改密失败」的隐蔽干扰；风险：中——方案 B 下 storageState 过期时健康检查会误报，需与 L1-9 的「未知 ≠ 登出」配合 | 与 L1-9/L1-10 同批 |
| **L1-9** | 慢页面不被误判为未登录 | `auth.ts:70` | 硬编码 5s 改为 `config.defaultTimeoutMs`；判定语义由二值改为三值（已登录 / 未登录 / **未知**），未知不触发重登 | 收益：减少无谓重登及其副作用（踢下线）；风险：低 | — |
| **L1-10** | 重试次数与导航次数收敛到合理值 | `reset.service.ts:12` · `worker.ts:66,80` · `reset-flow.ts:63` | 明确**单一重试归属**（建议保留 Worker 内重试，后端对同一 job 不重复投递）；删除 `ensureAuthenticated` 中冗余的 `page.goto` | 收益：最坏 9 次浏览器尝试降至 3 次，耗时与资源大幅下降；风险：中——重试归属变更会影响失败语义与 `attempt_count` 统计，需同步 L1-3/L0-4 | 依赖 L0-4 |
| **L1-11** | 账号名不再能破坏选择器 / 注入 | `selectors.ts:108` · `admin.service.ts:297` | `username` 与 `code` 同等做字符集白名单校验（创建/重命名/导入三处统一）；Worker 侧改用 `getByTitle` 等结构化定位替代裸选择器拼接 | 收益：消除「含换行用户名 → 该账号永久不可重置」；风险：低 | — |
| **L1-12** | 会话文件在 Windows 上真正受限 | `auth.ts:42` | 落盘后用 `icacls` / `Set-Acl` 显式收紧 ACL（仅当前用户）；若不做，则在文档明确「Windows 上仅继承保护」 | 收益：保护平台管理员实时会话；风险：低——`icacls` 调用失败需降级为告警而非中断 | — |
| **L1-13** | 超时路径等待子进程真正结束 | `worker-client.ts:98-102` | `finish()` 前 `await` 子进程 `close` 事件（附 1–2s 宽限期），宽限后仍存活则升级为强杀（`taskkill /T /F`）并记录 | 收益：消除孤儿 Chrome 及其在重试下的累积；风险：低-中——宽限期过短仍会残留，过长则拖慢 job；需与 `workerTimeoutMs` 一并调参 | **依赖 L0-4**（同文件） |

### 4.3 Vue 前端 `apps/web`

| # | 修复目标 | 影响范围 | 修复方案 | 影响评估 | 依赖 |
|---|---|---|---|---|---|
| **L1-14** | 会话凭证回归 httpOnly cookie，XSS 不再等于会话失窃 | `api/index.js:17,151` | 从 `localStorage` 移除 token（及 `scienceing_token` 键的读取），仅保留非敏感展示字段（用户名/角色）；请求依赖已开启的 `credentials: 'include'` | 收益：把「XSS → 完全接管会话」降级为「XSS → 当次页面内操作」；风险：中-高——**需确认后端登录已下发 httpOnly cookie 且所有请求带 credentials**，否则直接导致全员掉线 | **依赖 L1-7 + L2-15** |
| **L1-15** | 未配置即接真实后端，杜绝「假数据 + mock 登录」上线 | `api/index.js:13` | `USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'`（默认 false）；`.env.example` 与 README 标注演示模式开启方式 | 收益：消除最危险的部署态（看似正常、实则全是编造数据）；风险：中——**开发本地若不设该变量将直连后端**，需在 `dev.mjs` 显式注入 `VITE_USE_MOCK=true` | 与 L1-14 同文件 |
| **L1-16** | 跨窗口消息不再广播给任意源 | `HomePage.vue:137` · `MyAccountPage.vue:115` | `postMessage(..., '*')` 统一改 `window.location.origin`（与同文件另一处已正确的调用对齐）；lease token 不再持久化到 `sessionStorage` | 收益：消除向未知源泄露 lease token；风险：低 | — |
| **L1-17** | `.vue` 文件纳入 lint | `eslint.config.mjs` | 引入 `eslint-plugin-vue` 与 `vue-eslint-parser`，新增 `files: ['**/*.vue']` 配置块；清理指向未加载规则的 `vue/no-v-html` 禁用注释 | 收益：让 50 个 `.vue` 首次进入静态检查，并顺带暴露 L2-1 / L2-12 等死代码；风险：低-中——**首次接入会产生一批既有告警**，需先以 warn 级别接入再收紧 | 与 L2-1/L2-12 同批 |

### 4.4 扩展 `apps/extension`

| # | 修复目标 | 影响范围 | 修复方案 | 影响评估 | 依赖 |
|---|---|---|---|---|---|
| **L1-18** | 发布物不再用旧代码冒充新版本 | `deploy-lan/extension-lan/` | 重跑 `extension:pack`；manifest 版本从**单一来源**（`package.json`）派生，打包脚本写入，杜绝手改版本号；发布流程增加「分叉目录指纹比对」校验 | 收益：消除「用户按部署日志加载到缺少 `claim.js`、无密码遮罩的旧扩展」；风险：低，但**需确认 LAN 分支是否真为必需**（若仅为历史遗留，建议直接删除并让部署日志指向标准产物） | **依赖 L1-19** |
| **L1-19** | 「确认归还」名副其实 | `panel.js:343-345`（现 311 行按钮） | 二选一：① 实现 `RELEASE_LEASE` 消息（扩展 → 内容脚本 → 后端 `POST /leases/:id/release`），真正触发归还；② 若暂不实现，把按钮改为「前往看板归还」并同步弹窗文案 | 收益：消除「点了没反应」的信任损耗；风险：中（方案①）——需扩展后端契约与 worker `known` 消息列表同步更新，且必须与 L1-18 的重新打包同批 | **前置 L1-18** |

### 4.5 部署 `deploy-lan` / 根脚本

| # | 修复目标 | 影响范围 | 修复方案 | 影响评估 | 依赖 |
|---|---|---|---|---|---|
| **L1-20** | `--force` 真正生效 | `deploy.mjs:606,613-614` | `fullDeploy` 解构 `force`，并透传给 `stopBackend` / `stopGateway` | 收益：恢复「文件占用/端口冲突时强制停服」的能力，与提示文案一致；风险：低 | — |
| **L1-21** ✓ | 审计 IP 不可伪造 | `gateway.mjs:107-108` | 代理前将 `x-forwarded-for` 覆写为 socket 远端地址（`req.socket.remoteAddress`），不再透传客户端头 | 收益：恢复 `audit_logs.ip` 的取证价值；风险：低-中——**若前面还有一层 nginx/反代，需改为信任链式解析**，否则真实 IP 会被覆盖为上一跳地址；nginx 模式本身正确，仅改 node 网关 | — |
| **L1-22** | kill 只命中本项目的进程 | `deploy-release.ps1:78` · `deploy.mjs:98` | 匹配「解析后的安装/发布路径」而非裸子串 `/scienceing/`；抽取**唯一共享 helper**（PS 与 mjs 各调同一逻辑定义），消除两份副本 | 收益：避免误杀任何命令行提到该路径的进程（含用户自己的编辑器/终端）；风险：低-中——匹配过严会漏杀残留实例，需同时保留端口占用作为二次判据 | 与 L1-25/L1-26 共用 |
| **L1-23** | `db-doctor --fix` 不再重放非 DDL | `db-doctor.mjs:94-96,168-188` | 对非 DDL 语句（`UPDATE`/`INSERT`/`DELETE`）**拒绝执行**或执行前加 `SELECT` 存在性守卫；每次 deploy 都跑的场景下尤其必要 | 收益：防止「下一次无守卫的 UPDATE 每次部署重放一次」的隐性数据漂移；风险：低，但可能使当前「靠重放兜底」的迁移失败，需逐条核对现有迁移 | — |
| **L1-24** | 清理日志不再破坏运行中实例 | `nginx-ctl.mjs:31-33` | 保留 `nginx.pid`（以及 `logs/` 下被占用的文件）；改为**轮转**（重命名带时间戳）而非清空目录，保证失败路径指引的 `error.log` 仍可读 | 收益：恢复优雅停止，保住排障依据；风险：低 | — |
| **L1-25** | 生产机不再联网装依赖、版本与 lockfile 一致 | `deploy.mjs:285-321` | 置入显式开关（默认关闭）后置于发布流程；三个版本号改从 `pnpm-lock.yaml` 解析，禁止脚本内硬编码 | 收益：消除「生产机构建结果与 CI 不一致」及离线环境失败；风险：中——**若生产机确需现场安装，关闭后会导致构建失败**，需在 DEPLOYMENT.md 明确前置条件（离线缓存/预置 node_modules） | 依赖 L1-26 |
| **L1-26** | 构建产物不再累积陈旧 chunk | `deploy.mjs:267-277,340` | 「不删除」规则收窄到 `downloads/`；同步前清空 `dist` / `dist-build` | 收益：避免磁盘长期增长与「旧 chunk 被缓存命中」的诡异问题；风险：低——注意不要误删 `downloads/` 下的扩展 zip | — |
| **L1-27** | 「测试通过」不再与「全部跳过」等价 | `browser.test.ts:96` | 断言**最小非跳过用例数**（如 ≥ 7），低于阈值即 `exit 1`；在 CI 输出中区分 passed / skipped | 收益：让发布门禁恢复判别力；风险：低——无 Chrome 的环境将**开始失败**，需在流水线显式提供 Chrome 或标记为「降级通过」并告警 | — |

---

## 5. L2 修复方案（按类别，18 项）

### 5.1 死代码与清理（4 项）

| # | 修复目标 | 影响范围 | 方案 | 影响评估 |
|---|---|---|---|---|
| 1 | 消除 `PasswordReveal.vue` 的不可达分支 | `PasswordReveal.vue:88-97` | 二选一：恢复显示切换按钮，或删除 `visible`/`scheduleMask`/`REVEAL_TIMEOUT_MS`/`reveal` emit 与 `Eye`/`EyeOff` 导入 | 低。若恢复按钮，需同步 L1-14 的「不落盘」原则（仅内存可见） |
| 2 | 删除未使用的导出 | `selectors.ts`（`singleSessionConfirmButton`/`accountResetFilterButton`）· `nginx-ctl.mjs`（`nginxStop`/`nginxIsRunning`）· `constants.ts`（`RESET_JOB_STATUS`） | 直接删除；删除前用 grep 确认无动态引用 | 低 |
| 3 | 去掉为绕过 `noUnusedParameters` 的占位 | `leases.service.ts:329` · `admin.controller.ts:75` | 删除 `void userId;` / `void admin;` 及对应参数（调用方同步调整） | 低-中。`buildClaimResponse` 签名变更会影响调用点，需一并改 |
| 4 | 审计标签映射不再靠手工同步 | `constants.ts` | `AUDIT_ACTION_LABEL: Record<keyof typeof AUDIT_ACTION, string>`，漏项直接编译失败 | 低。可能立即暴露若干缺失标签，需补齐 |

### 5.2 正确性瑕疵（9 项，当前无用户可见影响）

| # | 修复目标 | 影响范围 | 方案 | 影响评估 |
|---|---|---|---|---|
| 5 | CSV 解析正确处理引号内换行 | `lib/csv.js:11` | 改为逐行状态机（跟踪引号开关），或至少修正与实现相反的注释 | 低。涉及前端 CSV 导入边界 |
| 6 | 带尾注释的引号值正确解析 | `lib.mjs:110-116` | 去引号判断前先剥离行尾注释 | 低。影响 LAN_IP 等解析，误判会导致网关地址错误 |
| 7 | 端口探测超时不再等同于「空闲」 | `lib.mjs:86` | 700ms 超时归类为「未知/占用」，避免 DROP 型防火墙下误判可用 | 低-中。改为保守判断可能让部署在慢环境多等，需保留可覆盖参数 |
| 8 | 路由前缀判定严格化 | `auth.guard.ts:24` | 改为 `raw.startsWith('/api/')`，消除 `/apifoo → foo` 的归一化歧义 | 低。属纵深防御，与 L1-7 同向 |
| 9 | 布尔环境变量语义符合直觉 | `config.ts:95` | `SCIENCING_BROWSER_HEADLESS` 接受 `0`/`false`/`no` 为「非无头」 | 低。命名歧义修正后需同步文档 |
| 10 | storageState 路径不依赖 cwd | `config.ts:53` | 复用 `logger.ts` 的 `findRepoRoot()` 解析 | 低。消除「从不同 cwd 启动读到不同会话文件」 |
| 11 | 拒绝明文 HTTP 的科应地址 | `auth.ts` | `adminUrl`/`loginUrl` 非 `https:` 时告警或拒绝 | 低-中。若内网自建为 http 会被拦，需留显式覆盖开关 |
| 12 | 面板位置读取与定时器清理 | `panel.js:377,407,471` | `pos` 使用前判空；组件卸载时 `clearInterval(tickTimer)` | 低。消除偶发 `undefined.x` 与后台持续 tick |
| 13 | 改密提交前校验输入值 | `selectors.ts` / `performReset` | 断言 `inputValue() === newPassword` 后才提交，避免「标题对但字段错」 | 低-中。可能暴露此前被掩盖的填值失败 |

### 5.3 安全加固（5 项）

| # | 修复目标 | 影响范围 | 方案 | 影响评估 |
|---|---|---|---|---|
| 14 | 密文不可跨账号互换、HMAC 域分离、比较恒时 | `secret-box.ts` · `verify-token.ts:44` · `leases.service.ts:315` | 以 `account.id` 作 AAD 绑定密文；HMAC 用派生**子密钥**而非主密钥直接；哈希比较改 `timingSafeEqual` | **中-高**。AAD 变更会使**既有密文全部无法解密**，必须配套一次性数据迁移（读旧 → 重加密写入），否则等同删库。建议与 L1-1 同批并预先备份 |
| 15 | Cookie 具备 `secure`/`__Host-` 并清理过期会话 | 会话模块 | `secure` 依 HTTPS 条件开启；`__Host-` 前缀；新增周期任务 `DELETE FROM sessions WHERE expires_at <= ?` | 中。`__Host-` 前缀要求 Path=/、无 Domain，需核对现有 Cookie 属性；清扫任务需防多实例重复执行（幂等 DELETE 即可） |
| 16 | 两个网关补齐安全响应头 | `nginx.conf` · `gateway.mjs` | 增加 CSP、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy` | 低-中。CSP 需先以 `Report-Only` 观察，避免直接拦掉现有内联脚本；**这是 L1-14 的最廉价补偿** |
| 17 | 发布密钥 deny-list 补齐 | 发布校验脚本 | 增加 `.npmrc`、`playwright/.auth/**`、`id_rsa*`、`*.p12` | 低。作为最后一道防线，建议后续改为 **allowlist** 思路 |
| 18 | 发布链路一致性 | `release-common.ps1:184` · SMB 共享 · `gateway.mjs:53-59` · `deploy.mjs:848` · `db-doctor.mjs:100-108` | ① pnpm 兜底版本 `9.15.9` 对齐仓库声明的 `11.20.0`；② 共享来源（zip+hash+git remote）需文档化或签名；③ `fs` 提到模块顶层 import 一次；④ 脱敏由「名称 deny-list」改 **allowlist**；⑤ `db-doctor` 拒绝自动选中 `.dev.db` | 中。①④⑤ 为独立小改；② 涉及供应链信任，需与运维确认共享来源 |

#### L2 执行状态（2026-09-15：已完成 17 项；L2-18② 待运维确认）

| 编号 | 状态 | 实现要点 |
|---|---|---|
| L2-1 | ✅ | 恢复被注释掉的「显示/隐藏」按钮。依据 `PRODUCT-DESIGN §4.3`（229/231/628 行）该按钮属规范要求，禁用属回归（提交 `b91a21f` 顺带注释掉），**不是**产品决策 |
| L2-2 | ✅ | 删除死导出：`accountResetFilterButton`、`singleSessionConfirmButton`、**`singleSessionConfirmModal`**（第 3 个是清单外发现——与前者互为依赖，一并失效）；`nginxStop`、`nginxIsRunning`；`RESET_JOB_STATUS`。单会话确认框已由 `auth.ts` 按**正文文本**识别（刻意不依赖 antd 类名），故这些类名选择器确属冗余 |
| L2-3 | ✅ | 去掉 `leases.service.buildClaimResponse` 的 `userId` 占位参数（含 2 处调用点）与 `admin.controller.healthCheck` 的 `@CurrentUser() admin` |
| L2-4 | ✅ | `AUDIT_ACTION_LABEL` 改为 `Record<keyof typeof AUDIT_ACTION, string>`。**该改动立刻暴露出** `audit.controller.ts:78` 用裸 `string` 索引的问题，已改为显式判存在性的 `actionLabel()` |
| L2-5 | ✅ | `csv.js` 的 `splitRows` 改为**引号感知**切分（原注释声称「引号内换行已在上一步处理」，实际无任何一步处理） |
| L2-6 | ✅ | `parseEnvFile` 改为**先剥行尾注释、再判引号**；新增 `stripTrailingComment()`（引号内的 `#` 不算注释） |
| L2-7 | ✅ | `probePortInUse` 超时由「空闲」改为「占用/未知」（DROP 型防火墙会让端口被误判为空闲） |
| L2-8 | ✅ | `auth.guard` 前缀判定改 `startsWith('/api/')`（原 `/apifoo` 会被切成 `foo`） |
| L2-9 | ✅ | 新增 `envBool()`；`SCIENCING_BROWSER_HEADLESS=false/no/off` 现在正确解析为无头关闭 |
| L2-10 | ✅ | `defaultStorageStatePath()` 基准改为 `findRepoRoot()`（`logger.ts` 导出），不再随 `process.cwd()` 漂移 |
| L2-11 | ✅ | `auth.ts` 新增 `warnIfInsecureTarget()`：非本机的 http 目标告警一次（**只告警不拒绝**——内网 http 部署是合法的；本机 mock 不告警） |
| L2-12 | ✅ | `panel.js`：`onPointerDown` 增加 `pos` 判空；新增 `unmount()` 清理 `tickTimer` 与全部监听，并挂到 `pagehide` |
| L2-13 | ✅ | `performReset` 提交前回读校验 `inputValue() === newPassword`，不一致即中止；`modalNewPasswordInput` 兜底收紧为「弹窗内**唯一**可见 password 输入框」，多个则拒绝猜测 |
| L2-14 | ✅ | **AAD 绑定**（`accountAad(account.id)`）+ **HMAC 域分离**（HKDF 子密钥）+ **恒时比较**（`timingSafeEqual`）；配套迁移脚本 `db:reencrypt`。详见下方专节 |
| L2-15 | ✅（并发方） | `isSecureRequest()` 条件 `secure` + `session-sweep.scheduler.ts` 周期清扫 |
| L2-16 | ✅ | `gateway.mjs` 与 `nginx.conf` 均补齐 CSP / `X-Content-Type-Options` / `X-Frame-Options` / `Referrer-Policy`。**未用 Report-Only**：已核对构建产物 `index.html` 无内联脚本，`script-src 'self'` 安全；`style-src` 保留 `'unsafe-inline'`（11 处行内 style 属性）。nginx 侧特别注意 `add_header` **不继承**，已在每个自带 `add_header` 的 location 重复声明 |
| L2-17 | ✅ | deny-list 增补 `^\.npmrc$`、`^id_(rsa\|dsa\|ecdsa\|ed25519)`、`p12`、以及 `\.auth` 路径（`playwright/.auth` 里是**已登录的管理员会话**） |
| L2-18 | ✅ ①③④⑤ / ⏳ ② | ① pnpm 版本改从 `package.json#packageManager` 解析（兜底 `11.20.0`）；③ `gateway.mjs` 顶层 import `appendFileSync`；④ `env:print` 改 **allowlist**（默认脱敏，仅显式列出的键明文）；⑤ `db-doctor` 目标库解析重写。② SMB 共享来源签名需运维决策，**未实施** |

**测试**：`scripts/test/` 下新增 4 个测试文件（`db-doctor-target`、`security-headers`、`account-password-crypto`，以及并发方留下的 `backend-invariants` / `deploy-utils`）。
全量结果：脚本测试 **35/35**、Worker 逻辑 **10/10**、Worker 浏览器 **7/7**、后端单测 **17/17**。

**顺带修掉的测试隔离缺陷**：`deploy-utils.test.mjs` 与新增的 `security-headers.test.mjs` 原本共用 `.workbuddy-ai/tmp-test` 且各自 `rmSync` 整个父目录 —— `node --test` 并行跑多个文件时会互相删掉对方的中间状态（表现为「单独跑都过、一起跑就挂」）。已改为各自独立目录、只清理自己那一份。

#### L2-14 专节：密文格式迁移（AAD 绑定）

这是本次唯一会**改变已落库数据格式**的改动，方案如下。

**问题**：`secret-box` 未使用 AAD，密文与账号之间没有绑定 —— 把 A 账号的密文复制到 B 账号行，解密照样成功；`verify-token` 直接把 master key 当 HMAC key（加密与签名密钥复用、无域分离）；`leases` 用 `!==` 比较哈希（计时侧信道）。

**设计**：载荷新增版本号 `v`。`v=1`（缺省）为历史格式，`v=2` 表示以 `account:${id}` 作 AAD。`decryptSecret` **同时支持两种格式**，因此升级过程可平滑进行：

| 步骤 | 操作 | 状态 |
|---|---|---|
| 1 | 备份生产库 | 必做 |
| 2 | 部署新代码（可读 v1、新写入 v2） | — |
| 3 | `node dist/db/reencrypt-account-passwords.js --dry-run` 核对数量 | 建议 |
| 4 | `node dist/db/reencrypt-account-passwords.js` 执行迁移（默认先自动备份） | — |

**安全性**：
- 迁移**幂等**，重复执行安全；
- **解不开的密文只记录、绝不覆盖** —— 那通常意味着 master key 不对，静默覆盖会毁掉唯一可恢复的原件，此时退出码 1 并列出账号；
- AAD 用不可变的 `account.id` 而**不是** `code`：`code` 可被改名，改名后密文将永久解不开。为此 `createAccount` / `seed` 改为**两段式插入**（先插入拿自增 id，再用该 id 作 AAD 加密回写），整体置于同一事务内。

**验证**（`pnpm test:account-crypto`，12 条）：AAD 跨账号解密失败、v1 兼容读取、迁移后明文不变、迁移后不可跨账号搬运、幂等、dry-run 不写库、解不开不覆盖、HMAC 子密钥域分离。

---

## 6. 阶段划分与时间节点

以下以 **D0 = 启动日** 计；若需锚定真实日期，将 D0 替换为实际开工日即可。

### 阶段总览

| 阶段 | 时间窗 | 目标 | 范围 | 准入 | 准出（DoD） |
|---|---|---|---|---|---|
| **P0 热修** | **D0（1 个发布窗口）** | 清空全部 L0，止血 | L0-1 ~ L0-5 | 分支已切、回滚方案已备 | 5 项全部合入；`curl '%'` 不宕机；超时用例返回成功；`reset-admin` 指向生产库；新部署无弱口令；`worker.log` 无明文口令 |
| **P1 稳定与安全** | **D1 – D5（第 1 周）** | 消除数据/安全后果最大的 L1 | 15 项：L1-1 · L1-2 · L1-3 · L1-4 · L1-7 · L1-14 · L1-15 · L1-20 ~ L1-27 | P0 已上线并稳定观察 1 天 | 15 项完成（L1-14 若受 L2-15 阻塞可顺延至 P2 首日）；`lint`+`typecheck`+e2e 全绿 |
| **P2 一致性与可维护性** | **D6 – D10（第 2 周）** | 收敛 Worker/扩展/前端一致性问题 | 12 项：L1-5 · L1-6 · L1-8 ~ L1-13 · L1-16 · L1-17 · L1-18 · L1-19 ＋ L2-14/15/16 | P1 已上线 | 重试次数降至 3；扩展协议含 `RELEASE_LEASE`；`.vue` 进入 lint；CSP 以 Report-Only 上线 |
| **P3 加固与清理** | **D11 – D20（第 3–4 周）** | 清理死代码、修正确性瑕疵、完成加固 | L2 全部 18 项 | P2 已上线 | 50/50 全部关闭；发布门禁可判别 passed/skipped；文档同步更新 |

### 关键里程碑

| 节点 | 时点 | 交付物 | 判定标准 |
|---|---|---|---|
| **M1 止血完成** | D0 收盘 | P0 补丁 + 部署 | 生产可连续运行 24h 无宕机；无新增明文口令落盘 |
| **M2 安全基线达成** | D5 | P1 补丁 | 审计 IP 不可伪造；生产无默认口令；前端不再持有可窃取 token（或已明确顺延） |
| **M3 一致性达成** | D10 | P2 补丁 | 重试/会话/扩展协议三方一致；`.vue` 纳入 lint 且无 error 级告警 |
| **M4 全量关闭** | D20 | P3 补丁 + 复盘报告 | 50 项全部关闭并留证据；根因模式（跨边界未复校）已沉淀为规范 |

### 阶段依赖提示

- **P0 不可拆**：L0-4 与 L0-1 共用同一 IPC 通道，**必须同一窗口上线**；L0-3 与 L0-5 同在 `deploy.mjs`，合并提交。
- **P1 中的 L1-14 是软依赖点**：若 L2-15（cookie `secure`）未同步，L1-14 可顺延至 P2 首日，但不得晚于 P2 结束——否则前端长期处于「既存 token 又不依赖 token」的中间态。
- **P2 的 L1-18 必须晚于 L1-19**：协议变更后再打包，否则会再产出一个「版本号新、功能缺」的产物。
- **P3 的 L2-14 若涉及 AAD，必须与数据迁移同批**，且提前备份生产库。

---

## 7. 验收与回归验证清单

| 层级 | 验证手段 | 覆盖编号 |
|---|---|---|
| 静态 | `pnpm lint` · `pnpm typecheck` | L1-17 · L2-1~4 · L2-12 |
| 单元/逻辑 | `node --test`（worker logic + browser） | L1-9 · L1-10 · L1-27 |
| 后端 e2e | 现有 e2e 套件 + 新增用例 | L1-2 · L1-3 · L1-5 · L1-7 · L2-15 |
| 网关/部署 | `curl '%'`；`curl -H 'X-Forwarded-For: 1.2.3.4'` 校验审计 IP；`deploy --force`；`db:reset-admin` 双库对照 | L0-2 · L0-5 · L1-20 · L1-21 · L1-23 · L1-24 |
| 端到端 | 扩展加载 → 领取 → 改密 → 归还 全链路 | L0-1 · L0-4 · L1-8 · L1-13 · L1-18 · L1-19 |
| 安全 | 生产首启无默认口令；`worker.log` / `reset_jobs.error_message` / `audit_logs.metadata` 无口令片段；响应头齐全 | L0-1 · L0-3 · L2-16 · L2-17 |

---

## 8. 风险与回滚

| 风险 | 触发场景 | 缓解 | 回滚 |
|---|---|---|---|
| **IPC 契约不同步** | P0 中 Worker 与后端分次部署 | 同窗口部署 + 部署脚本校验 Worker CLI 版本 | 保留 argv 兼容分支，单侧回退 |
| **AAD 变更导致密文不可解** | L2-14 引入 AAD | 先备份生产库；写迁移脚本「读旧 → 重加密」 | 恢复备份 |
| **CORS 白名单漏配** | L1-7 上线后登录失败 | `.env` 提供 `CORS_ORIGINS`；先以日志观察再拒绝 | 临时回落 `origin: true` |
| **前端去 token 导致掉线** | L1-14 后端 cookie 未就绪 | 灰度：先确认 cookie 下发成功再移除本地存储 | 恢复 `localStorage` 读取 |
| **`--force` 语义变更** | L1-20 后误杀 | 与 L1-22 的精确匹配同批上线 | 单行回退 |
| **测试门禁变严导致流水线红** | L1-27 断言最小用例数 | 流水线预置 Chrome；无 Chrome 环境标为「降级告警」 | 调低阈值 |
| **历史日志已含明文口令** | L0-1 修复前产生的 `worker.log` | 修复同时清理/归档历史日志 | 不适用（不可逆，需主动清理） |

---

## 9. 建议的根因治理（超出单点修复）

**统一根因**：`L0-1`、`L1-20`、`L1-21`、`L1-22`、`L2-18` 属同一模式——**密钥与信任决策跨进程/网络边界时未重新校验**。建议在 P3 阶段沉淀两条规范：

1. **进程边界契约规范**：凡跨进程传递敏感值，一律走 stdin / 受限权限临时文件，禁止 argv 与日志回显；子进程结果以带 `jobId` 的一次性文件回传。
2. **来源可信判定规范**：凡来自网络的标识（`Origin`、`X-Forwarded-For`、扩展 ID、进程命令行），必须由服务端**重新推导或白名单校验**，不得直接采信。

落实方式：在 `docs/` 下新增规范文档，并在 PR 模板中加入两条检查项，避免同类问题在后续迭代中复发。
