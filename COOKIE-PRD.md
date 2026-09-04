# COOKIE-PRD：基于「凭据自动填充 + 浏览器登录态清除」的账号回收方案

| 项 | 内容 |
| --- | --- |
| 文档编号 | COOKIE-PRD |
| 分支 | `feature/cookie-account-recycle` |
| 版本 | v1.0（设计稿） |
| 日期 | 2026-09-03 |
| 状态 | 待评审 |
| 影响面 | `apps/server`、`apps/web`、`apps/extension`、`packages/shared`、`deploy-lan` |

---

## 1. 背景与问题

### 1.1 现状链路

当前每一次账号回收（用户主动归还 / 无操作超时 / 管理员强制回收）都会触发一次**后台 Playwright 自动化改密**：

```
归还/超时/强制回收
  → lease: ACTIVE → RECYCLING
  → account: IN_USE → RECYCLING
  → INSERT reset_jobs(PENDING)
  → ResetQueueScheduler(10s) → processPendingJobs
  → spawn playwright CLI ['reset','--username',u,'--password',p]（超时 180s）
  → 成功：current=pending，account AVAILABLE，lease RELEASED
```

### 1.2 痛点

| # | 问题 | 影响 |
| --- | --- | --- |
| P1 | 改密是**串行且慢**的单账号任务（约 15–40s/账号，失败重试 3 次） | 高频回收时队列积压；账号在改密窗口内不可用 |
| P2 | 密码要展示给员工（复制 + 明文可见） | 密码泄漏面大：可复制、可截图、可外传、可被浏览器密码管理器保存 |
| P3 | 依赖 Playwright 自动化，站点改版即断 | 运维负担重，健康检查失败需人工介入 |
| P4 | 一次回收 = 一次自动化任务，**回收频率直接等于自动化压力** | 用量一大就打满 worker |

### 1.3 目标

| 目标 | 描述 |
| --- | --- |
| G1 | **员工全程看不到、复制不到密码**（username 仍可展示/复制） |
| G2 | 回收动作从「后台改密」改为「客户端清除浏览器登录态」，**零自动化开销** |
| G3 | 密码重置退化为**低频运维动作**：管理员手动触发 或 按策略自动（默认月度/超期惰性） |
| G4 | 员工侧体验不变甚至更好：点「打开科应」→ 自动填充 → 点登录 → 使用 |
| G5 | 具备兜底：客户端清理失败时，仍能通过低频重置保证账号不被长期占用 |

### 1.4 非目标

- 不改动科应站点本身（无 SSO / 无 API 对接）。
- 不做「多设备同时使用同一账号」的支持（仍为独占租约）。
- 一期不引入非对称加密（见 §7.4 P2 增强项）。

---

## 2. 方案总览

### 2.1 一句话

> **密码只在扩展的 Service Worker 内存里存活，填充完即焚；回收不清密码，清 Cookie。**

### 2.2 三条链路的改造对比

| 环节 | 现状 | 新方案 |
| --- | --- | --- |
| 领取账号 | 看板返回 username + **明文密码** | 看板返回 username + 密码占位；密码仅经扩展专用接口下发到 SW 内存 |
| 登录科应 | 员工手动复制密码粘贴 | 扩展自动填充 username/password，**隐藏密码可见切换图标**，用户手动勾选协议并点击登录 |
| 账号回收 | 服务端 Playwright 改密（15–40s） | 扩展清除科应域 Cookie/Storage → 强制登出（<1s），**不触发改密** |
| 密码重置 | 每次回收都改 | 仅管理员手动 / 超期惰性 / 月度全量 |

### 2.3 全链路时序

```
员工                 看板(apps/web)            后端(apps/server)          扩展(SW)              科应站点
 │  登录领号                                                                                      
 ├─────────────────► POST /api/leases ───────►  选号 + 建 lease                                    
 │                                              lease.status=ACTIVE                               
 │  ◄─────────── {leaseId, leaseToken, username, password:""} ◄──┘                                
 │  （页面只展示 username，密码卡片显示"由助手自动填充"）                                            
 │                                                                                                
 │  点击「打开科应」                                                                               
 ├─────────────────► postMessage BIND_AND_OPEN {leaseId, leaseToken} ──►                          
 │                                                                tabs.create(scienceing.com) ──►
 │                                                                                                
 │                                              GET /api/leases/:id/credentials                   
 │                                              Authorization: Bearer <leaseToken>                
 │                                              X-Extension-Id: <随机实例ID>                      
 │                                          ◄───────────────────────────────────────────────────┤
 │                                              {username, password}（仅此一次，SW 内存）          
 │                                                                                                
 │                                                                onUpdated(complete)            
 │                                                                executeScript(autofill)  ────►
 │                                                                  填充 + 隐藏眼睛图标           
 │                                                                                                
 │  手动勾选协议 + 点击「登录」                                                                    
 ├─────────────────────────────────────────────────────────────────────────────────────────────►
 │  ◄───────────────────────────────── 登录成功（若失败：扩展重新拉凭据并重新填充）◄──────────────┤
 │                                                                                                
 │  ─────────── 使用期：Activity 每 5~10s 上报续期；SW 每 10s 轮询 LEASE_STATUS ───────────────►  
 │                                                                                                
 │  归还 / 超时 / 管理员强制回收                                                                   
 ├─────────────────► POST /leases/:id/release ─► lease ACTIVE→RECYCLING                           
 │                                              account IN_USE→RECYCLING                         
 │                                              cleanup_required=1                               
 │                                              （★ 不再 INSERT reset_jobs）                      
 │                                                                                                
 │                                              轮询返回 status=RECYCLING ─────────────────────► 
 │                                                                  purgeSession():              
 │                                                                   1. cookies.remove(全域名)    
 │                                                                   2. clear localStorage/session
 │                                                                   3. tabs.reload()  ─────────►
 │                                                                                       强制登出 
 │                                              POST /leases/:id/recycle-ack ◄───────────────────┤
 │                                              lease RELEASED + account AVAILABLE               
```

---

## 3. 详细设计

### 3.1 后端：密码不再下发到看板

**改造点**

| 文件 | 改动 |
| --- | --- |
| `apps/server/src/modules/leases/leases.service.ts` `toCredentials()` | 拆分为两个出口（见下） |
| 同文件 `current()` | 返回的 `account` 不再含 `password` 字段 |
| `leases.controller.ts` | 新增 `GET /api/leases/:id/credentials`（扩展专用） |
| `admin.service.ts` | 新增批量重置 `resetAllAccounts()`；`release()` 不再建 reset_job（按 `recycle_mode` 开关） |

**凭据出口拆分**

```ts
// 看板出口（员工可见）：永不携带密码
private toAccountView(account: AccountRow): AccountView {
  return { accountId: account.id, code: account.code, username: account.username };
}

// 扩展出口（仅持 leaseToken + X-Extension-Id 的 SW 可调用）
private toCredentials(account: AccountRow): AccountCredentialsView {
  return { accountId: account.id, code: account.code,
           username: account.username, password: this.decryptAccountPassword(account) };
}
```

**接口契约：`GET /api/leases/:id/credentials`**

| 项 | 值 |
| --- | --- |
| 认证 | `Authorization: Bearer <leaseToken>`（复用现有 `resolveLeaseByToken`） |
| 附加校验 | Header `X-Extension-Id` 必须存在且已在该 lease 上注册过（见 §3.2） |
| 前置条件 | `lease.status === 'ACTIVE'`，否则 409 `LEASE_NOT_ACTIVE` |
| 响应 | `{ accountId, code, username, password }` |
| 频控 | 单 lease 60s 内最多下发 3 次（防刷）；超限 429 |
| 审计 | 每次下发记 `CREDENTIAL_ISSUED`（metadata 仅含 accountCode，**绝不记录密码**） |
| 失败 | 403（缺 X-Extension-Id）/ 404（未知 lease）/ 409（非 ACTIVE）/ 429（频控） |

> **为什么看板拿不到？** `X-Extension-Id` 是扩展首次握手时**自行随机生成**的 UUID，只存在扩展的 `chrome.storage.session` 里。看板与扩展之间的 postMessage 只传 `{leaseId, leaseToken, accountCode}`，**不传 extensionId**。看板页面 JS 即使持有 leaseToken，也无法构造出合法的 extensionId。

### 3.2 扩展：凭据获取与内存态

**握手注册**（`dashboard.js` `EXTENSION_INFO` 流程扩展）

```
看板 --EXTENSION_INFO--> SW
SW   --{version, status, extensionId}--> 看板    // 仅用于展示/排障，不参与凭据校验
SW   --POST /api/extension/register {extensionId}--> 后端（可选，用于审计与频控白名单）
```

**存储红线**（写入代码注释与单元测试）

| 位置 | 密码 |
| --- | --- |
| `chrome.storage.session` / `local` | ❌ 禁止写入 |
| SW 全局变量 `credentials: Map<leaseId, {u,p}>` | ✅ 唯一合法位置，进程回收即失效 |
| 任何 `chrome.runtime.sendMessage` / `postMessage` | ❌ 禁止携带密码 |
| 填充注入脚本 | ✅ 作为参数传入，闭包内使用，填充后立即置空 |
| `console.log` | ❌ 禁止打印 |

`persist()` 必须保持只写 `{tabLease, leases}`（后者仅含 `leaseId/leaseToken/accountCode`），**不得加入凭据**。

### 3.3 扩展：自动填充

**新增文件 `apps/extension/src/content/scienceing/autofill.js`**（由 SW 通过 `chrome.scripting.executeScript({func, args})` 注入，不常驻）

**填充流程**

1. 等待目标元素：`waitForSelector(usernameSelector, 8000ms)`，配合 `MutationObserver`（SPA 异步渲染）。
2. **React 受控组件兼容**：必须走原生 setter + 事件派发，否则 React 收不到变更。

   ```js
   const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
   setter.call(input, value);
   input.dispatchEvent(new Event('input', { bubbles: true }));
   input.dispatchEvent(new Event('change', { bubbles: true }));
   ```

3. 用户名填充后派发 `blur`（触发 antd Form 校验，避免"请先输入用户名"红字残留）。
4. **不自动勾选协议 checkbox**（`#login-form input[type=checkbox]`）——保留给员工手动勾选，既是合规要求，也是"用户手动登录"的一部分。
5. **不自动提交**（见 §3.4）。

**隐藏密码可见切换图标**

科应登录页为 antd 技术栈，密码框是 `Input.Password`，其右侧渲染 `.ant-input-suffix > .ant-input-password-icon`（`anticon-eye` / `anticon-eye-invisible`）。三重防护：

| 层 | 手段 | 说明 |
| --- | --- | --- |
| 1. CSS 注入 | `#login-form_password .ant-input-password-icon, #login-form_password [class*="anticon-eye"] { display:none !important; }` | 立即生效 |
| 2. MutationObserver | 观察 `#login-form` 子树，图标重新出现即移除节点 | 覆盖 SPA 重渲染 / 校验失败重绘 |
| 3. 兜底改写 | 把 `input.type` 强制锁定为 `password`（`Object.defineProperty` 或 observe `type` 属性变更） | 防御其它途径把输入框切成 text |

**密码框加固**（同批次执行）

```js
const p = document.querySelector(passwordSelector);
p.setAttribute('autocomplete', 'off');
p.setAttribute('data-lpignore', 'true');      // LastPass 等第三方管理器忽略
['copy','cut','paste','dragstart','drop','contextmenu'].forEach(
  (e) => p.addEventListener(e, (ev) => ev.preventDefault(), true));
p.style.userSelect = 'none';
p.style.webkitUserSelect = 'none';
```

**选择器配置化**：所有选择器由 `GET /api/extension/config` 下发（见 §3.6），避免科应改版就需发版。注入脚本用 `document.querySelector(selector)` 消费字符串参数，**不使用 `eval` / `new Function`**（安全与 CSP 考量）。

**失败兜底**

| 场景 | 处理 |
| --- | --- |
| 8s 内未找到元素 | 悬浮窗显示"自动填充失败"，提供「重试填充」按钮；重试 3 次仍失败 → 上报 `AUTOFILL_FAILED` + 提示联系管理员 |
| 提交后仍停在登录页（密码错误/单点登录确认框） | 检测到 URL 未跳转 → 重新拉凭据（§3.1 接口，频控内）→ 重新填充 → 提示"已重新填充，请再次点击登录"；若页面出现「账号已经在其他地方登录」确认框 → 提示用户点「确定」（该确认框需人工决策，扩展不代点） |
| 扩展版本过低 / 未安装 | 看板侧硬拦截（§3.5），不给「打开科应」按钮 |

### 3.4 为什么「用户手动点击登录」

1. **合规**：协议勾选必须是用户主动行为，自动登录等于平台代替用户接受条款。
2. **科应单点登录确认框**：账号在别处登录时会弹「账号已经在其他地方登录」确认框，需要人工点「确定」强制下线；自动提交会卡死在这一步。
3. **可审计**：登录动作由用户触发，审计链路清晰。

### 3.5 前端：员工端改造

| 文件 | 改动 |
| --- | --- |
| `pages/MyAccountPage.vue` | ① 删除 `<PasswordReveal>`（第 211 行）与密码复制能力；② 替换为「凭据安全卡」：`密码由助手自动填充 · 全程不可见`，附 password 占位 `••••••••••••`；③ username 复制按钮**保留** |
| `pages/HomePage.vue` | claim 成功后的结果卡同步移除密码展示 |
| `components/PasswordReveal.vue` | 保留组件但**仅限管理员端**使用（见 §3.7），员工端路由下不再渲染；组件内增加 `emit('reveal')` 审计（已有） |
| 助手状态硬门槛 | 未检测到助手 / 版本 < min → 「打开科应」按钮 `disabled`，提示"需安装科应账号助手 v1.4.0+ 才能自动登录"（当前仅是弱提示，需升级为硬拦截） |
| 归还确认弹窗 | 文案改为"归还后助手将自动退出科应登录，账号立即释放给其他同事" |

### 3.6 扩展：登录态清除（回收核心）

**Manifest 权限变更**

```jsonc
"permissions": ["tabs", "storage", "cookies", "scripting"],   // 新增 cookies / scripting
"version": "1.4.0"
```

`host_permissions` 已包含 `https://www.scienceing.com/*` 与 `https://scienceing.com/*`，满足 `chrome.cookies` API 的域要求，无需新增。

**清除流程 `purgeSession(leaseId)`**（新增 `apps/extension/src/lib/session-purge.js`，由 SW 调用）

```
1. 收集目标域：config.autofill.cookieDomains = ["scienceing.com", "www.scienceing.com", ".scienceing.com"]
2. chrome.cookies.getAll({domain}) → for each → chrome.cookies.remove({url, name, storeId})
   ★ 关键优势：cookies API 可删除 HttpOnly Cookie（页面 JS 无法触碰）
3. chrome.scripting.executeScript → localStorage.clear() / sessionStorage.clear()
   （可选：indexedDB.deleteDatabase，按 config.purge.indexedDb 开关，默认关，避免误删用户数据）
4. 清理 SW 内存中的凭据：credentials.delete(leaseId)
5. 对所有绑定该 lease 的 tab 执行 tabs.reload()（多 Tab 继承场景，现有 tabLease 映射已支持）
6. 上报 POST /api/leases/:id/recycle-ack { purgedCookies: n, purgedKeys: n }
7. 推送 LEASE_RELEASED → 悬浮窗显示"已退出登录，账号已释放"
```

**为什么清除 Cookie 足够？**

科应登录态由 Cookie 维持（Playwright 的 `storageState` 正是靠 Cookie 复现会话，反向清除即可登出）。扩展侧额外清 localStorage/sessionStorage 覆盖 token 型会话。

**回收触发路径（全部改为"通知扩展清理"而非"后台改密"）**

| 触发方 | 服务端动作 | 扩展动作 |
| --- | --- | --- |
| 员工主动归还 | `POST /leases/:id/release` → lease RECYCLING（等待清理确认） | **扩展立即主动清理**（不等轮询，见下方"预清理"） |
| 无操作超时 | `TimeoutService` 扫到超时 → 同上 | 下次轮询（≤10s）发现 status≠ACTIVE → purge |
| 管理员强制回收 | `admin.service.forceRelease()` → 同上 | 同上（该员工的扩展执行清理） |
| 扩展离线 / 浏览器已关 / 崩溃 | 等待 `cleanup_timeout_seconds`（默认 120s）后仍无 ack → **账号置 `DIRTY` 并 enqueue reset_job**（见下） | — |

**预清理（主动归还路径）**：员工点「归还」时，看板先 postMessage 通知扩展**立即**执行 `purgeSession()` 并等待 ack，成功后才调用 `POST /leases/:id/release`。这样主动归还路径的清理确认率接近 100%，只有超时/强制回收路径存在不确定性。

> ### ⚠️ 设计修正（2026-09-03 二轮评审）
>
> 初稿此处写的是「清理超时不阻塞分配，风险可控」——**该判断错误，已推翻**，原因见 §6.2 P0-1。
>
> **正确设计：清理确认是分配的硬前提。**
>
> | 释放时的 cleanup 结果 | 账号去向 | 是否可分配 |
> | --- | --- | --- |
> | `CONFIRMED`（扩展已 ack） | `AVAILABLE` | ✅ 立即可分配 |
> | `TIMEOUT` / `SKIPPED` / 未确认 | **`DIRTY`（脏账号）** + 立即 `enqueue reset_job` | ❌ 不进分配池 |
> | 改密成功 | `AVAILABLE` | ✅ 恢复可分配 |
>
> `claim()` 的选号条件本就要求 `status='AVAILABLE'`，脏账号自动被排除，无需额外改造。
>
> **闭环成立的不变式**：*任何处于 `AVAILABLE` 的账号，要么其上一个使用者的浏览器已被确认清理，要么刚被改过密码。*
>
> 代价：清理失败的账号需 15–40s 才回到池子。这远优于「A、B 两人共用一个账号互相踢下线」（§6.2 P0-1）。

### 3.7 后端：低频密码重置（管理员手动 + 自动兜底）

这是本方案的安全底线。改密频率从"每次回收"降到"每月/超期"，但**必须保留且必须能自动执行**。

**三条重置触发路径**

| 路径 | 说明 |
| --- | --- |
| **A. 管理员手动单账号** | 已存在：`POST /api/admin/accounts/:id/reset-password`（保持不变） |
| **B. 管理员手动全量** | **新增** `POST /api/admin/accounts/reset-all` |
| **C. 超期惰性自动** ★ 推荐主力 | **新增**：claim 选号时跳过"密码已超龄"的账号并为其排队重置；或由调度器错峰扫描 |

**B. 全量重置接口**

```http
POST /api/admin/accounts/reset-all
{ "scope": "EXPIRED" | "AVAILABLE" | "ALL", "maxAgeDays": 30, "batchSize": 20 }
→ 202 { enqueued: 42, skippedInUse: 3, estimatedSeconds: 1260 }
```

- 只处理 `status='AVAILABLE'` 的账号（`AVAILABLE` / `EXPIRED` scope）；`ALL` 会先 force-release 再用账号，需二次确认。
- 分批 enqueue，避免一次性灌满 reset_jobs 队列影响在线用户。
- 复用现有 `enqueueReset()` + `ResetService` 串行消费，无需改造 Worker。
- 审计：`BATCH_RESET_ENQUEUED`（metadata: `{scope, count, operator}`）。

**C. 超期惰性重置（推荐）**

> 相比"每月某天集中跑几百个账号"，惰性重置把压力摊平到日常空闲时段，且天然跳过正在使用的账号。

- 新增设置 `password_max_age_days`（默认 30）。
- **分配期拦截**：`leases.service.claim()` 选号 SQL 增加条件
  `AND (last_password_changed_at IS NULL OR julianday('now') - julianday(last_password_changed_at) < :maxAgeDays)`
  → 超龄账号临时不可分配。
- **调度器补齐**：新增 `PasswordAgeScheduler`（默认每小时扫一次，可用 `PASSWORD_AGE_SCAN_INTERVAL_MS` 覆盖）：
  ```sql
  SELECT id FROM scienceing_accounts
  WHERE enabled = 1 AND status = 'AVAILABLE'
    AND (last_password_changed_at IS NULL
         OR julianday('now') - julianday(last_password_changed_at) >= :maxAgeDays)
  LIMIT :batchSize
  ```
  命中即 `enqueueReset()`（每轮上限 `batchSize`，默认 10，避免长时间占用 worker）。
- 管理员在 `SettingsPage` 可调 `password_max_age_days`（设 0 = 关闭自动，纯手动）。

**回收模式开关**（灰度与回退用）

新增设置 `recycle_mode`：

| 值 | 行为 |
| --- | --- |
| `COOKIE_ONLY`（默认） | 回收只清 Cookie，**不建 reset_job** |
| `COOKIE_PLUS_RESET` | 回收清 Cookie **且**建 reset_job（等价现状，用于灰度回退 / 高敏场景） |

### 3.8 数据模型变更（Migration v4）

```sql
-- v4: cookie_recycle
ALTER TABLE leases ADD COLUMN cleanup_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leases ADD COLUMN cleanup_state TEXT;      -- PENDING | CONFIRMED | TIMEOUT | SKIPPED
ALTER TABLE leases ADD COLUMN cleanup_at TEXT;
ALTER TABLE leases ADD COLUMN cleanup_detail TEXT;     -- JSON: {purgedCookies, purgedKeys, error}
CREATE INDEX idx_leases_cleanup_pending ON leases(cleanup_state) WHERE cleanup_state = 'PENDING';

ALTER TABLE scienceing_accounts ADD COLUMN credential_issued_count INTEGER NOT NULL DEFAULT 0;
```

**账号状态机新增 `DIRTY`**（P0-1 修补的核心）：

```
AVAILABLE ──claim──► IN_USE ──归还/超时──► RECYCLING ──┬── 清理已确认 ──► AVAILABLE
                                                       └── 清理未确认 ──► DIRTY ──enqueue reset──► (改密) ──► AVAILABLE
                                                                                                        └──► ERROR
```

`DIRTY` 账号不在 `claim()` 的选号条件内（选号要求 `status='AVAILABLE'`），因此**不可被分配**，直到改密成功。`ACCOUNT_STATUS` 常量需同步增加 `DIRTY`（SQLite `status` 列为 `TEXT` 无 CHECK 约束，无需 DDL 变更）。

新增系统设置（同步写入 `packages/shared/src/settings.ts` 与 `apps/server/src/db/constants.ts`）：

| Key | 默认 | 说明 |
| --- | --- | --- |
| `recycle_mode` | `COOKIE_ONLY` | 回收模式（§3.7） |
| `password_max_age_days` | `30` | 密码最长存活天数，0 = 关闭自动重置 |
| `cleanup_timeout_seconds` | `120` | 等待扩展清理确认的超时 |
| `autofill_enabled` | `1` | 自动填充总开关（故障时可一键关闭，回退到管理员线下告知） |

新增审计动作（`AUDIT_ACTION`）：`CREDENTIAL_ISSUED`、`AUTOFILL_SUCCEEDED`、`AUTOFILL_FAILED`、`SESSION_PURGED`、`CLEANUP_TIMEOUT`、`BATCH_RESET_ENQUEUED`。

### 3.9 Lease 状态机调整

```
                 ┌──────────── cleanup_state=CONFIRMED（扩展 ack）──────────┐
                 │                                                          ▼
ACTIVE ──(归还/超时/强制)──► RECYCLING ───────────────────────────────► RELEASED
                 │                                                          ▲
                 └── cleanup_state=TIMEOUT（cleanup_timeout_seconds 无 ack）─┘
                      或 cleanup_required=0（COOKIE_PLUS_RESET 模式走 reset_job）

ACTIVE ──(清理异常)──► FAILED（保留）
```

- `RECYCLING` 语义更新为「**已下达回收指令，等待客户端清理确认 / 超时**」，执行者从 Playwright 变为扩展。
- `RELEASE_REQUESTED` 仍是历史遗留态，本次**不动**（避免与在途数据冲突）。
- 账号状态机 `AVAILABLE → IN_USE → RECYCLING → AVAILABLE` **保持不变**，仅 `RECYCLING` 的持续时间从"改密 15–40s"变为"清理确认 ≤10s 或超时 120s"。

### 3.10 扩展配置下发（`GET /api/extension/config` 扩展字段）

```jsonc
{
  // ...现有字段不变
  "autofill": {
    "enabled": true,
    "loginUrl": "https://www.scienceing.com/user/login",
    "usernameSelector": "#login-form_username input[type=\"text\"]",
    "passwordSelector": "#login-form_password input[type=\"password\"]",
    "agreementSelector": "#login-form input[type=\"checkbox\"]",
    "submitSelector": "#login-form button[type=\"submit\"]",
    "hidePasswordToggle": true,
    "waitTimeoutMs": 8000
  },
  "purge": {
    "cookieDomains": ["scienceing.com", "www.scienceing.com", ".scienceing.com"],
    "cookieNames": [],              // 空 = 按域全清（推荐，避免硬编码 cookie 名）
    "localStorage": true,
    "sessionStorage": true,
    "indexedDb": false,
    "reloadAfterPurge": true
  }
}
```

全部可后端热配，科应改版时改配置即可，无需发版扩���。

---

## 4. 分期实施计划

| 阶段 | 内容 | 涉及文件 | 验收 |
| --- | --- | --- | --- |
| **P0-1 后端凭据隔离** | `toCredentials` 拆分；`current()` 去除密码；新增 `GET /api/leases/:id/credentials`（含 X-Extension-Id 校验 + 频控 + 审计） | `leases.service.ts`、`leases.controller.ts`、`db/constants.ts` | 看板接口响应无 password；无 header 请求 403 |
| **P0-2 扩展填充** | `autofill.js`；SW 凭据内存管理；隐藏眼睛图标三重防护；失败重试 | `apps/extension/src/**`、`manifest.json` | 科应登录页自动填充成功，密码框无可见切换图标、无法复制 |
| **P0-3 前端去密码** | `MyAccountPage`/`HomePage` 移除密码展示与复制；助手未就绪硬拦截 | `pages/MyAccountPage.vue`、`pages/HomePage.vue` | 员工端全站检索不到明文密码 |
| **P1-1 回收改清理 ★含闭环关键修补** | `release/timeout/forceRelease` 按 `recycle_mode` 跳过 reset_job；新增 `recycle-ack`；**清理未确认 → 账号置 `DIRTY` + enqueue reset_job（P0-1 修补，不做则方案不成立）**；主动归还走「预清理」；migration v4 | `leases.service.ts`、`admin.service.ts`、`timeout.service.ts`、`migrations.ts` | 归还后 ≤10s 科应自动登出；reset_jobs 正常路径新增 0 行；**人为制造清理失败时账号转 `DIRTY` 且自动排队改密** |
| **P1-2 低频重置** | `POST /admin/accounts/reset-all`；`PasswordAgeScheduler`；`password_max_age_days`；AccountsPage 批量按钮与进度 | `admin.service.ts`、`admin.controller.ts`、新建 `scheduler/password-age.service.ts`、`pages/admin/AccountsPage.vue`、`SettingsPage.vue` | 手动全量可跑通；超期账号被自动排队且不在分配池 |
| **P2 加固（可选）** | 扩展 WebCrypto RSA-OAEP 密钥对，后端用公钥加密密码下发；`chrome.browsingData` 深度清理；清理失败的浏览器端重试队列 | `apps/extension`、`crypto/*` | 即使接口被伪造也只能拿到密文 |

扩展版本：`1.3.0 → 1.4.0`；`extension_min_version` 提升至 `1.4.0`（自动填充是硬依赖，旧版本禁止领取）；`extension_latest_version` 同步更新。**注意**：`system_settings` 中已存在的旧行是 `INSERT OR IGNORE`，需手动 `UPDATE` 或提供一次性迁移。

LAN 分发：`node deploy-lan/scripts/deploy.mjs extension:pack` 重新打包（会写入当前 `LAN_IP`）。

---

## 5. 验收标准

| # | 验收项 | 判定 |
| --- | --- | --- |
| A1 | 员工端全链路无明文密码 | 全仓检索 `MyAccountPage`/`HomePage` 响应，password 字段缺失；页面 DOM 无真实密码 |
| A2 | 自动填充成功 | 点「打开科应」→ 登录页 username/password 已填，React 校验通过（无"请输入"红字） |
| A3 | 密码不可见 | 密码框无眼睛图标；SPA 重渲染后仍无；`type` 恒为 `password` |
| A4 | 密码不可复制 | 密码框 copy/cut/drag/右键全部失效，无法选中 |
| A5 | 用户手动登录 | 扩展不自动勾选协议、不自动提交；单点登录确认框由用户处理 |
| A6 | 回收清理生效 | 归还后 ≤10s 科应 Tab 自动刷新为未登录态；`chrome://settings/cookies` 中科应域 Cookie 清空 |
| A7 | 不触发改密 | 10 次完整借还，`reset_jobs` 表新增 0 行 |
| A8 | **清理未确认时的闭环修补**（P0-1）★ | 人为制造清理失败（关掉扩展再归还）→ 账号转 `DIRTY`、**不出现在分配池**、自动 enqueue reset_job；改密成功后恢复 `AVAILABLE`；期间该账号不可被领取 |
| A9 | 管理员全量重置 | `reset-all` 只对 AVAILABLE 账号排队，进度可见，不影响在线用户 |
| A10 | 超期惰性重置 | 手动把某账号 `last_password_changed_at` 改为 40 天前 → 下一轮扫描进入 reset_jobs 且从分配池移除 |
| A11 | 灰度回退 | `recycle_mode=COOKIE_PLUS_RESET` 时行为与现状完全一致 |
| A12 | 无扩展拦截 | 未安装/版本 <1.4.0 时「打开科应」按钮禁用且有明确提示 |

---

## 6. 风险分析与缓解

| # | 风险 | 等级 | 缓解措施 |
| --- | --- | --- | --- |
| R1 | **浏览器自带密码管理器保存密码**（用户点登录后 Chrome 弹"保存密码"）—— 最主要的残留泄漏路径 | 中 | **扩展层面无法可靠禁用**（结论已核实，见 §6.1）。可行手段：① 内网推 **`PasswordManagerBlocklist`** 企业策略（按域名禁用 Save+Fill，Per Profile / 动态刷新，注册表 `HKLM\Software\Policies\Google\Chrome\PasswordManagerBlocklist`）—— 这是唯一按站点的正解，但**只能由 IT 通过组策略下发，扩展无法设置**；② `autocomplete=off` + `data-lpignore` 仅对部分第三方管理器有效，Chrome 自带管理器会忽略；③ 依靠 `password_max_age_days=30` 兜底，即使被保存也 30 天内失效；④ 员工手册明令禁止保存。 |
| R2 | 扩展被禁用/卸载/浏览器崩溃 → 清理未执行，账号"带会话"回到池子 | 中 | ① `password_max_age_days` 惰性重置兜底；② `cleanup_timeout_seconds` 超时不阻塞分配；③ 高敏场景切 `COOKIE_PLUS_RESET` |
| R3 | 员工在**无扩展环境**（如手机、其它浏览器）手动用密码登录 | 中 | 员工从未见过密码，无法手动登录；管理员全量重置会立刻踢掉这类会话 |
| R4 | 科应改用非 Cookie 的会话机制（如纯 localStorage token） | 低 | `purge` 配置已覆盖 localStorage/sessionStorage/IndexedDB；极端情况切 `COOKIE_PLUS_RESET` |
| R5 | 科应登录页改版 → 填充选择器失效 | 中 | 选择器后端可配，热修无需发版；填充失败有重试 + 管理员告警（`AUTOFILL_FAILED` 审计） |
| R6 | 员工在科应站内自行修改密码 → 平台密码失配 | 低 | 现状即有此风险；全量重置会覆盖。可后续增加"改密后自检" |
| R7 | `X-Extension-Id` 被逆向伪造（员工打开 SW DevTools 读取） | 低 | 一期接受（属主动攻击且需本地物理访问）；P2 升级为非对称加密后即使伪造也只能拿到密文 |
| R8 | 单点登录确认框（账号在别处登录）导致自动流程中断 | 低 | 需人工点「确定」，扩展检测并提示；不自动代点（安全考虑） |
| R9 | 引入 `cookies` 权限后扩展权限面变大，上架/合规审核更严 | 低 | 当前为内网自分发（加载已解压目录），不走 Chrome 商店审核；权限说明写入安装文档 |

---

## 6.1 专题：扩展能否禁用浏览器的「保存密码」提醒？

**结论：扩展层面做不到可靠禁用。按站点管控只有企业策略能办到。**

| 手段 | 可行性 | 说明 |
| --- | --- | --- |
| `chrome.privacy.services.passwordSavingEnabled` | ❌ 不可用 | API 确实存在（`ChromeSetting<boolean>`，默认 `true`，需 `privacy` 权限）。但它是**浏览器级全局开关，不是按站点**——一关就是员工**所有网站**的密码都不保存，属越权修改用户浏览器，副作用远超本场景。且：企业策略锁定或其他扩展占用时 `levelOfControl` 非 `controllable_by_this_extension`，`set()` 会静默失效；用户可随时在设置里改回；**扩展卸载/禁用后设置自动恢复**。 |
| `PasswordManagerBlocklist`（企业策略） | ✅ 正解，但扩展无法设置 | 按域名禁用密码管理器的 **Save + Fill**，Per Profile、支持动态刷新。只能由 IT 通过组策略 / 注册表（`HKLM\Software\Policies\Google\Chrome\PasswordManagerBlocklist`）/ MDM 下发。 |
| `autocomplete="off"` | ⚠️ 基本无效 | Chrome 有意忽略该属性（推动用户使用密码管理器）。 |
| `data-lpignore` / `data-1p-ignore` / `data-bwignore` | ⚠️ 部分有效 | 各家第三方管理器自定义属性，管不了 Chrome 自带的。 |

**因此**：R1 无法在扩展侧关闭，只能靠企业策略 + 30 天失效兜底，并在需求表述上明确——**"员工看不到密码"是"平台不展示并主动阻断常规获取途径"，不是"保证看不到"**（见 P0-3）。

---

## 6.2 P0：会导致账号治理闭环断裂的风险

> **治理闭环的定义**：平台在任何时刻都能回答「谁在用这个账号」，且账号要么被某个已知员工独占持有，要么处于无人可用的安全状态。以下任一风险成立，闭环即断裂。

### P0-1 客户端清理失败 ≠ 延迟回收，而是账号泄漏 + 多人互踢 ★最致命

**推演**：

1. A 领取账号使用 → 归还（或超时）
2. 服务端把账号置回 `AVAILABLE`，分配给 B
3. **A 的浏览器 cookie 还在** —— 清理失败的诱因全是日常事件而非异常：扩展被禁用/卸载、浏览器崩溃、合盖休眠、网络断开未收到 ack、A 在第二个浏览器登录过
4. B 登录 → 科应单点登录机制触发 → 弹「账号已经在其他地方登录」→ B 点「确定」→ 把 A 踢下线
5. A 正在使用 → 被踢 → 重新打开 → 又把 B 踢了 → **两人无限互踢**

**断裂点**：① 平台「独占租约」语义失效；② 审计失真（A 的操作可能记在 B 名下）；③ 体验崩坏 + 工单激增；④ 见 P0-4 责任认定。

**为什么现状没有这个问题**：现状每次回收都改密，A 的会话凭证立即失效。新方案把重置频率从**分钟级降到 30 天**，泄漏窗口放大约 3 个数量级——量变引发质变。

**必须做的修补**：清理确认作为分配的硬前提（§3.6 已修正为 `DIRTY` 脏账号机制）。**不做这个修补，方案不成立。**

### P0-2 「清 Cookie = 登出」是未经验证的前提假设

整个回收机制建立在"清除客户端状态即可强制登出"之上，但从未验证过科应的会话实现。可能的断点：

| 科应可能的机制 | 我们的清除是否奏效 |
| --- | --- |
| HttpOnly Cookie | ✅ `chrome.cookies.remove` 可删（这是页面 JS 做不到的） |
| localStorage refresh token + 内存 access token | ✅ 清 storage + reload |
| **Service Worker + IndexedDB 存 token** | ❌ reload 后 SW 可从 IDB 恢复 → **登出失败**（而我们默认关闭 IndexedDB 清理） |
| 「记住我」长期 token 存在其它位置 | ❌ 清不干净 |

**必须在写第一行代码前验证**（成本极低，现有 Playwright worker 基础设施即可）：
`登录 → 保存 storageState → 清 cookie/localStorage → reload → 断言是否仍处于登录态`。
若验证不通过，整个回收机制需重新设计。

### P0-3 客户端防护只是门槛，不是墙

对拥有本机权限的人，以下全部可行（浏览器安全的公理，非危言耸听）：

- DevTools 里把 password 的 `type` 改成 `text`（我们的 MutationObserver 是页面脚本，用户可在 Sources 面板删除该脚本节点）
- `chrome://extensions` → Service Worker inspector → 在 SW 上下文直接读取内存凭据
- 卸载扩展 / 禁用 JS / 录屏 / 截图

**因此不能把"员工看不到密码"当作安全控制点来依赖**。真正的安全控制点只能是服务端：脏账号机制（P0-1）+ 密码超期重置（§3.7）。客户端防护的定位是"抬高门槛、防误操作和随手外传"，不是"防恶意员工"。

**需求表述需修正**：原需求"账号平台的用户是全程看不到密码的" → 应表述为"平台不向用户展示密码，并主动阻断常规获取途径；不承诺对恶意本地用户保密"。

### P0-4 责任认定断裂：存在「无 lease 覆盖」的使用窗口

治理的核心是"任何时刻都能回答谁在用这个账号"。P0-1 的泄漏窗口意味着：A 归还后继续操作的那段时间，**没有任何 lease 覆盖**，audit_logs 要么空白、要么错误归给 B。

一旦发生数据泄漏 / 违规批量下载 / 滥用，科应侧只能定位到账号，平台侧认不到人。对科研文献平台可能触发：下载量滥用告警、版权方追责、**科应机构级封号**（账号是稀缺资源，封一个少一个）。

### P0-5 扩展从「辅助」变成「唯一路径」，但内网分发没有自动更新

| 现状 | 新方案 |
| --- | --- |
| 不装扩展也能复制密码使用（功能降级） | **看不到密码 = 没有扩展就完全无法使用**（硬阻断） |

内网是"加载已解压目录"安装，**没有自动更新机制**。`extension_min_version` 一提到 1.4.0，所有未手动更新的员工**立即完全无法工作**——发版当天就是停工事件，需要 IT 逐个处理。

**必须先解决分发**（三选一）：
1. Chrome 企业策略 `ExtensionSettings` 强制安装 + 自托管 update manifest 实现托管更新（最彻底）
2. 保留「管理员查看明文密码」应急通道，扩展未更新时由管理员线下告知（破坏"看不到密码"，仅限应急）
3. 双模式灰度：`autofill_enabled` 开关 + 新旧模式并行运行一段时间

### P0-6 MV3 Service Worker 被回收导致凭据丢失

MV3 的 SW 在几十秒无活动后被 Chrome 回收。而凭据**只存在 SW 内存中**（这是我们定的安全红线），SW 一回收密码就没了，必须重新拉取——消耗频控额度，且要求 lease 仍为 `ACTIVE`。填充失败率会高于预期，需要：填充时若发现凭据缺失则静默重新拉取后重试（对员工无感）。

---

## 6.3 次级风险（侵蚀闭环但不立即断裂）

| # | 风险 | 说明与建议 |
| --- | --- | --- |
| P1-1 | **池子隐性缩水** | `password_max_age_days` 惰性重置会把超龄账号移出分配池。若重置连续失败（科应改版/网络/风控），账号静默消失，池子一天天变小，直到某天"无可用账号"才被发现。**需配套**：ERROR 账号告警 + 池子水位监控 + 重置成功率看板。 |
| P1-2 | **全量重置窗口与 worker 吞吐** | 100 账号 × 15–40s 串行 ≈ 25–67 分钟。叠加 P0-1 的脏账号机制，高峰期脏账号排队会拖慢领取。需评估 worker 并发能力（现状串行）。 |
| P1-3 | **科应风控封号** | 多人交替登录 + 异地/IP 频繁切换可能被判定异常。需摸清科应风控阈值。 |
| P1-4 | **内网 HTTP 明文传输** | LAN 部署为 `http://IP:18080`，凭据接口走 HTTP，同网段抓包可得密码（现状同样存在，非新增风险）。建议内网推 HTTPS 或至少隔离 VLAN。 |
| P1-5 | **科应强制改密策略** | 若科应要求首次登录改密 / 定期改密，员工看不见密码将无法完成 → 账号卡死。**需确认科应有无此策略**。 |
| P1-6 | **B 登录时看到「账号在别处登录」** | 即使清理成功，若 A 的会话因服务端延迟未完全失效，B 会看到该确认框。频率高了造成困惑，且暴露共享账号事实。 |
| P1-7 | **扩展单点故障 = 全平台停工** | 扩展从辅助组件变为关键路径唯一组件。需明确降级预案（扩展不可用时员工如何工作？当前方案无答案）。 |

---

## 7. 待确认问题

| # | 问题 | 建议 |
| --- | --- | --- |
| Q1 | 密码最长存活天数默认 30 天是否可接受？更短（7/14 天）安全性更高，但重置任务更频繁 | 建议 30 天起步，上线观察一个月后按实际调整 |
| Q2 | 是否保留管理员查看单账号明文密码的能力？（现状 `PasswordReveal` 在管理端可用） | 建议保留，用于故障排查；但增加二次确认 + 审计 |
| Q3 | 清理时是否清 IndexedDB？可能误删科应站点的业务数据（如草稿） | 建议默认关闭，仅清 Cookie + Storage |
| Q4 | 是否需要"回收前 N 秒提醒用户尽快保存"？现状 warning/critical 阈值已有 | 建议复用现有阈值，仅把文案改为"即将自动退出登录" |
| Q5 | P2 非对称加密是否要做？ | 一期不做；若员工规模 >100 人或涉及外部合作方，建议做 |
| **Q6** | **扩展如何强制安装与自动更新？（P0-5，决定方案能否落地）** | 首选 Chrome 企业策略 `ExtensionSettings` + 自托管 update manifest（V5 验证）；若不可行，需接受"发版=全员手动重装"的运维成本 |
| **Q7** | **是否接受"客户端防护只是门槛、不能防恶意员工"这一定位？（P0-3）** | 建议接受，并据此修正需求表述：平台承诺"不展示 + 阻断常规途径"，不承诺"对本地恶意用户保密"；真正的安全控制点是服务端重置 |
| **Q8** | **扩展不可用时的降级预案是什么？（P1-7）** | 新方案下扩展是唯一路径，无扩展即无法工作。需明确：是接受"停工等待修复"，还是保留管理员线下告知密码的应急通道（后者会破坏"看不到密码"） |

---

## 8. 开发前必须验证的前提假设

> **在下列 V1–V4 验证完成并出具结论之前，不得进入编码阶段。** 这些是方案的地基，地基不成立则设计再精细也无意义。V1/V2 可直接复用现有 Playwright worker 基础设施，成本以小时计。

| # | 待验证假设 | 验证方法 | 不通过则 |
| --- | --- | --- | --- |
| **V1** | **清除 cookie + localStorage + reload 能真正让科应登出？** | Playwright：登录 → 存 storageState → 清 cookie/localStorage → reload → 断言是否仍在登录态。**必须验证至少 3 种形态**：HttpOnly cookie、localStorage token、科应 SW/IndexedDB | 回收机制需重新设计（P0-2 致命） |
| **V2** | **改密后，旧会话是否立即失效？** | Playwright：登录 → 存 storageState A → 后台改密 → 用 A 恢复上下文 → 访问需登录页 → 断言是否被踢 | 现状的"改密即踢"假设也不成立，脏账号机制（P0-1）需加强 |
| **V3** | **科应登录页是否真有「密码可见切换图标」？选择器是什么？** | 打开 `/user/login` 抓 DOM，确认 `Input.Password` 的 `.ant-input-password-icon` 是否存在 | "隐藏图标"需求不存在，可简化；或需换实现方式 |
| **V4** | **科应是否有强制改密 / 首次登录改密 / 定期改密策略？** | 查科应账号设置页 + 咨询科应方 | 若有，员工看不见密码将无法完成 → P1-5 变致命 |
| **V5** | **扩展能否在内网强制安装 + 自动更新？** | 验证 Chrome 企业策略 `ExtensionSettings` + 自托管 update manifest 是否可推 | 发版即停工（P0-5），需先确定分发方案 |
| **V6** | **科应对异常登录（异地/IP 切换/频繁互踢）的风控阈值？** | 咨询科应方 / 小范围实测 | 可能触发封号（P1-3），需降低互踢频率 |
| **V7** | **worker 吞吐能否支撑全量重置 + 脏账号排队？** | 实测单账号改密耗时 × 账号数，评估串行队列积压 | 需提升并发或改为错峰 |

---

## 9. 附录：关键代码落点速查

| 需求 | 文件 | 位置 |
| --- | --- | --- |
| 看板密码出口 | `apps/server/src/modules/leases/leases.service.ts` | `toCredentials()` L343、`current()` L119 |
| 回收建改密任务 | 同上 | `release()` L151 |
| 管理员强制回收/重置 | `apps/server/src/modules/admin/admin.service.ts` | `forceRelease()` L162、`resetPassword()` L175、`enqueueReset()` L456 |
| 超时回收 | `apps/server/src/scheduler/timeout.service.ts` | 全文件 |
| 重置任务消费 | `apps/server/src/modules/reset/reset.service.ts` | `processPendingJobs()` L81 |
| 迁移 | `apps/server/src/db/migrations.ts` | 新增 v4 |
| 常量/枚举 | `apps/server/src/db/constants.ts` | `DEFAULT_SYSTEM_SETTINGS` L46、`AUDIT_ACTION` |
| 扩展配置下发 | `apps/server/src/modules/extension/extension.controller.ts` | `config()` |
| 员工端密码展示 | `apps/web/src/pages/MyAccountPage.vue` | L211 `<PasswordReveal>` |
| 密码组件 | `apps/web/src/components/PasswordReveal.vue` | 全文件（改由管理端独占） |
| 扩展 SW | `apps/extension/src/background.js` | `BIND_AND_OPEN` L155、`markLeaseEnded` L230、`pollLease` L203 |
| 扩展权限 | `apps/extension/manifest.json` | `permissions`、版本 `1.3.0` |
| 科应登录选择器 | `playwright/worker/src/selectors.ts` | L66–L83（可复用到 autofill 配置） |
