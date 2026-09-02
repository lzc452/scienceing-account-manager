# 科应共享账号管理平台 — 端到端验收报告（PRD §60 十场景）

> 验收人：reviewer（审查与验收工程师）
> 日期：2026-09-01
> 依据：PRD.md §60、PRODUCT-DESIGN.md §10/§11（v1.1）
> 方法：真实运行 server + web（+ 扩展 / Playwright 可用部分），逐场景采集「命令 + 退出码 + 输出 / API 响应」。

---

## 0. 验收结论（TL;DR）

| 场景 | 结论 |
|---|---|
| 1 正常领取 | ✅ PASS |
| 2 一人一租约 | ✅ PASS |
| 3 插件检测 | ⛔ BLOCKED（后端未强制 R3/R4 + 扩展需人工加载浏览器） |
| 4 正常 Activity | ✅ PASS |
| 5 页面挂机（30 分钟回收） | ✅ PASS（状态机，时间操纵验证） |
| 6 浏览器关闭（30 分钟回收） | ✅ PASS（状态机，时间操纵验证） |
| 7 主动归还 | 🟡 PARTIAL（归还→回收✅；改密→AVAILABLE 被沙箱阻塞） |
| 8 自动回收（改密→他人可领） | 🟡 PARTIAL（超时回收✅；改密→AVAILABLE 被沙箱阻塞） |
| 9 改密失败→ERROR | ✅ PASS |
| 10 并发领取 | ✅ PASS |

**7 个场景端到端通过；3 个场景（3/7/8）存在明确的沙箱/实现阻塞，已在 §4 逐条列明原因与复现/解除步骤。**

---

## 1. 环境与构建证据

所有命令均在本会话工作区 `D:\studyspace\scienceing-account-manager` 实跑。

| 步骤 | 命令 | 退出码 | 结果 |
|---|---|---|---|
| 后端编译 | `node_modules\.bin\tsc.cmd -p apps/server/tsconfig.json` | 0 | ✅ |
| 前端构建 | `node_modules\.bin\vite.cmd build --configLoader native`（apps/web） | 0 | ✅ built 1634 modules / 5.25s |
| 后端 e2e | `node --test --test-isolation=none dist/e2e/auth.e2e.js dist/e2e/leases.e2e.js dist/e2e/admin.e2e.js dist/e2e/reset.e2e.js` | 0 | ✅ 19 pass / 0 fail |
| 加密单测 | `node --test --test-isolation=none dist/crypto/crypto.test.js` | 0 | ✅ 5 pass / 0 fail |
| 扩展校验 | `node scripts/validate.mjs` | 0 | ✅ MV3 + 最小权限审计通过 |
| 扩展版本单测 | `node test/version.test.mjs` | 0 | ✅ 5 pass / 0 fail |
| Playwright 逻辑单测 | `node --test --test-isolation=none dist/tests/logic.test.js` | 0 | ✅ 10 pass / 0 fail |
| Web 预览 | `vite preview --port 4173` + `Invoke-WebRequest http://localhost:4173/` | — | ✅ HTTP 200，`<div id="app">` 挂载点存在 |

---

## 2. 真实 server 冒烟（HTTP 侧证据）

以全新库 `data/acceptance.db`（migrate + seed，10 账号全 AVAILABLE）启动 `node dist/main.js`（PORT=3100，`SCIENCEING_MASTER_KEY` 注入），再以 `apps/server/test/acceptance-smoke.ps1` 逐场景打真实 HTTP 请求。关键响应摘录：

- 初始可用性：`{"total":10,"available":10,"inUse":0,"recycling":0,"error":0}`（HTTP 200）
- **S1**：u1 领取 → `KY-01`（201）；u2 领取 → `KY-02`（201），`different=true`
- **S2**：u1 再次领取 → 仍 `KY-01`，`same=true`
- **S4**：`POST /leases/1/activity` → `result=ACTIVE`；`GET /leases/1/status` → HTTP 200，`remainingSeconds=1799`（≈ 30:00）
- **S7**：`POST /leases/1/release` → 201，`status=RECYCLING`，`releaseReason=USER_RETURN`；账号池行 `KY-01` → `RECYCLING`
- **S9**：等待约 8s（`RESET_INTERVAL_MS=1500`，3 次重试）→ 账号池行 `KY-01` → `ERROR`；可用性 `{"available":8,"inUse":1,"error":1}`；新用户 u3 领取 → `KY-03`（`notErrorAccount=true`，ERROR 账号不可领）
- 扩展配置：`{"minimumVersion":"1.0.0","latestVersion":"1.2.0","activityThrottleSeconds":5,"warningSeconds":300,"criticalWarningSeconds":60}`

完整输出见 `apps/server/test/acceptance-smoke.ps1`（可重复执行的验收脚本）。

---

## 3. 逐场景验收

### 场景 1：正常领取（A 领 KY-01 后 B 不能领同一账号）— ✅ PASS
- **HTTP 证据**：u1 → KY-01，u2 → KY-02（different=true，均 201）。
- **e2e 证据**：`leases.e2e.ts`「并发领取：两用户抢最后一个账号，仅一人成功」+ 事务后 KY-01 仅 1 条 ACTIVE lease（R1 兜底）。
- 满足：领取自动选账号、同账号仅一个 ACTIVE 租约。

### 场景 2：一个人不能多占（再次领取返回同一账号）— ✅ PASS
- **HTTP 证据**：u1 二次领取返回 KY-01，`same=true`。
- **e2e 证据**：`leases.e2e.ts`「R2：同用户重复领取返回同一账号，不新增租约」（ACTIVE 租约计数 = 1）。
- 满足 R2。

### 场景 3：插件检测（插件关闭 → 无法领取）— ⛔ BLOCKED
- **发现（实现缺口）**：后端 `POST /api/leases` 接受 `extensionVersion` 但**从不校验**（`leases.service.ts claim()` 未比对 `extension_min_version`），即 **R3/R4 未在服务端强制**。当前“禁止领取”仅靠前端 CTA 禁用，且前端 `USE_MOCK=true` 时 `pluginState.status` 恒为 `ready`。
- **阻塞原因**：① 扩展握手（EXTENSION_PING→EXTENSION_READY，3s 超时）需在真实 Chrome/Edge 加载已解压扩展，沙箱无法加载 unpacked extension；② 服务端未实现 R3/R4 校验。
- **复现步骤**：沙箱内无法复现；需在带浏览器的机器上 `USE_MOCK=false` + 加载 `apps/extension` 后观察握手。
- **解除建议**：后端在 `claim()` 增加 `extensionVersion` 低于 `extension_min_version` 时 403/409（R4），并让前端在 `pluginState.status !== 'ready'` 时禁用领取。

### 场景 4：正常 Activity（第 29 分钟滚动 → 倒计时恢复约 30 分钟）— ✅ PASS
- **HTTP 证据**：`POST /leases/1/activity` → `result=ACTIVE`；`GET /leases/1/status` → `remainingSeconds=1799`（≈30:00）。
- **e2e 证据**：`leases.e2e.ts`「竞态：29:59 刚操作不被 30:00 回收误踢」——把 `last_activity_at` 拨到 29 分钟前 → 续期成功；30:00 定时回收不误踢（条件 UPDATE R6）；拨到 31 分钟前 → 回收 1 条。
- 满足 R5/R6/R7（RECYCLING 后 Activity 返回 `LEASE_EXPIRED` 亦由 e2e 覆盖）。

### 场景 5：页面挂机（30 分钟完全无操作 → 自动回收）— ✅ PASS
- **证据**：`leases.e2e.ts` 把 `last_activity_at` 拨到 31 分钟前 → `recycleTimedOutLeases()`=1 → lease `RECYCLING`(reason=`INACTIVITY_TIMEOUT`) + account `RECYCLING` + 创建 `reset_job`。
- `TimeoutScheduler` 每 15s（`RECYCLE_INTERVAL_MS` 可配）调用该原子条件更新（PRD §25）。
- 说明：真实墙钟 30 分钟不等待，采用时间操纵直测回收状态机（等价于 e2e 标准做法）。

### 场景 6：浏览器关闭（最后 Activity 后 30 分钟回收）— ✅ PASS
- **证据**：回收判定完全依赖 `leases.last_activity_at`（与浏览器是否在线无关），与场景 5 同一 `recycleTimedOutLeases()` 路径；e2e 覆盖。
- 满足 PRD §46「浏览器关闭 → 后台不再收到 Activity → 30 分钟后自动释放」。

### 场景 7：主动归还（改密 → 旧 Session 失效 → AVAILABLE）— 🟡 PARTIAL
- **已通过部分**：`POST /leases/1/release` → 201 → lease `RECYCLING` + account `RECYCLING` + 创建 `reset_job(PENDING)`（HTTP + e2e）。
- **阻塞部分**：`改密成功 → AVAILABLE` 依赖 Playwright Worker 真实改密；沙箱无 Chromium，运行时 `PlaywrightResetExecutor` 是「恒失败」桩，无法在本环境演示成功闭环。
- **状态机侧证据**：`reset.e2e.ts`「端到端成功：超时→RECYCLING→job→SUCCESS→AVAILABLE→Lease RELEASED」（注入 success executor），验证 Phase 2 成功后 `current←pending`、`pending=NULL`、account `AVAILABLE`、lease `RELEASED`（R8）。
- **“旧 Session 立即失效”** 属科应平台自身行为，需真实科应环境验证。

### 场景 8：自动回收（30 分钟 → 改密 → 踢出 → 他人可领）— 🟡 PARTIAL
- **已通过部分**：超时 → `RECYCLING` + `reset_job`（e2e，同场景 5）。
- **阻塞部分**：`改密成功 → AVAILABLE → 他人可领` 依赖真实 Playwright；沙箱内运行时桩恒失败。
- **状态机侧证据**：`reset.e2e.ts`「端到端成功」验证超时→SUCCESS→AVAILABLE→RELEASED 后账号回到池内可再领（R8）。
- **真实运行时现状**：沙箱内超时/归还后账号最终会落到 `ERROR`（见场景 9），而非 `AVAILABLE`——这是「无 Chromium」的环境限制，非后端状态机缺陷。

### 场景 9：改密失败（Playwright 失败 → ERROR，不能重新分配）— ✅ PASS
- **HTTP 证据（真实运行时）**：归还 KY-01 → `RECYCLING` →（stub executor 3 次失败）→ `ERROR`；`availability.error=1`；新用户 u3 领取得到 KY-03，**不会**领到 ERROR 的 KY-01（`notErrorAccount=true`）。
- **e2e 证据**：`reset.e2e.ts`「端到端失败：3 次重试后 →ERROR + lease FAILED」——`attempt_count=3`、account `ERROR`、`pending=NULL`、lease `FAILED`，且**永不自动转 AVAILABLE**（R9）。
- 满足 R9 + PRD §47/§48（重试 ≤3 次，失败即 ERROR）。

### 场景 10：并发领取（双用户抢最后账号，只一人成功）— ✅ PASS
- **e2e 证据**：`leases.e2e.ts`「并发领取」用 `Promise.all` 同时领取最后一个 AVAILABLE 账号，`ok.length===1`、`fail.length===1`，胜者拿 KY-01，败者非 201；事务后 KY-01 仅 1 条 ACTIVE lease。
- 满足 R1 + PRD §13（`BEGIN IMMEDIATE` + 条件 UPDATE 原子领取）。

---

## 4. 阻塞项与实现缺口清单（供 t14 评审与船长决策）

| # | 级别 | 问题 | 证据/位置 | 解除 |
|---|---|---|---|---|
| B1 | 阻塞 | **R3/R4 未在服务端强制**：`POST /api/leases` 不校验 `extensionVersion` 是否低于 `extension_min_version`，插件关闭/过旧仍可领取（场景 3 无法端到端通过） | `apps/server/src/modules/leases/leases.service.ts` `claim()` | 后端加版本门槛校验（低版本 403/409）；前端在 `pluginState.status!=='ready'` 时禁用 CTA |
| B2 | 阻塞 | **前端默认未接真实后端**：`USE_MOCK=true` 恒真；`getPool()` 在真实模式直接 `return []`（注释称“后端无池列表端点”已过期——`GET /api/accounts/pool` 实际存在） | `apps/web/src/api/index.js` L10/L171-174 | `USE_MOCK` 改为按环境配置；`getPool()` 接 `/accounts/pool` |
| B3 | 阻塞 | **Playwright 真实改密不可在本沙箱运行**（无 Chromium，`chromium.launch` 报 spawn EPERM；运行时 `PlaywrightResetExecutor` 恒失败）→ 场景 7/8 的「改密成功→AVAILABLE」无法实跑 | `apps/server/src/modules/automation/automation.executor.ts`；t11/t12 已记录 | 在带浏览器/CI 环境将 executor 替换为真实 `ResetWorker` 调用后复验 |
| B4 | 阻塞 | **扩展插件检测（场景 3）需人工加载 unpacked extension**，沙箱无法执行 `chrome://extensions` 加载 | `apps/extension/README.md` 已附 4 步手动验证 | 人工/带浏览器 CI 验证握手 |

> 结论：后端核心状态机（领取/续期/归还/超时回收/回收队列/两阶段改密/并发）全部通过自动化与真实 HTTP 冒烟；**剩余阻塞均为「真实浏览器/Chromium/扩展加载」的环境限制与「R3/R4 服务端校验 + 前端联调」的实现缺口**，非核心租约逻辑缺陷。

---

## 5. 附：证据文件

- `docs/acceptance-report.md`（本报告）
- `apps/server/test/acceptance-smoke.ps1`（可重复执行的真实 server 十场景冒烟脚本）
- e2e 源码：`apps/server/src/e2e/{auth,leases,admin,reset}.e2e.ts`
- 运行时数据库（本次验收临时库）：`data/acceptance.db`（已 seed，验收后可删除）
