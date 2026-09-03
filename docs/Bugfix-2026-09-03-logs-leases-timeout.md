# Bug 修复记录（2026-09-03）：日志/租约/超时三组问题

> 状态：✅ 全部修复并验证（后端 e2e 20/20、运行时冒烟通过）

## 1. 系统日志：动作中文名 + 真实 IP

**动作列恒为英文大写**
- 后端 `audit.controller.ts` 每条日志新增 `actionLabel`（中文，`db/constants.ts` 新增 `AUDIT_ACTION_LABEL` 23 项映射）。
- 前端 `LogsPage.vue` 筛选项改为全量动作 + 中文 label（原仅 13 项、全英文）；展示列中文、hover title 显示英文原文。
- 共享映射 `apps/web/src/lib/audit-labels.js`（LogsPage 与 admin-mock 复用）。

**IP 列恒为 `—`（两层原因）**
1. 采集缺失：全后端只有 auth.login/logout 两处传 `req.ip`，其余几十处 audit 记录都没带 IP。
2. 配置缺失：`main.ts` 未开 `trust proxy`，经反代时拿到的也不是客户端 IP。
- 修复：新建 `server/src/lib/request-context.ts`（AsyncLocalStorage 中间件统一捕获 IP/User-Agent），`main.ts` 设 `trust proxy 'loopback'`（仅信任回环反代，防伪造），`audit.service.record` 未显式传时从请求上下文兜底。后台任务（scheduler 等）无上下文仍为空。
- 效果：所有 HTTP 动作的审计自动带 IP/UA，日志页立即有值；本地直连显示回环地址，生产反代显示 X-Forwarded-For 解析出的客户端 IP。

## 2. 租约记录：全量加载 → 后端分页

- **API 破坏性变更**：`GET /admin/leases` 返回从数组改为 `{ items, total, page, pageSize }`，新增 `status` 过滤（`admin.service.listLeases(query)`）。
- 前端 `getAdminLeases(params)`、`LeasesPage.vue` 改为后端分页（状态筛选变化回到第 1 页，交互与日志页一致，PAGE_SIZE=10）。
- mock（admin-mock.js）返回同形数据（自动补足 24 条以便演示翻页）。

## 3. 无操作超时：单位 秒 → 分钟（全链路）+ 进度条 bug

**先回答你的疑问**：把超时设成 172800（秒）不会影响"整个服务器的计时"——调度器每 15s 独立运行（RECYCLE_INTERVAL_MS），超时值只决定每条租约"无操作多久回收"。真正的副作用是**一切按 30 分钟硬刻度的进度条/悬浮环会失真**（172800s 让进度条瞬间打满）——这正是第 3 项进度条 bug 的根源。所以改为分钟语义并让"满刻度 = 实际租期"。

**单位改造**
| 层 | 变更 |
|---|---|
| DB | `system_settings` 键 `inactivity_timeout_seconds` → `inactivity_timeout_minutes`（默认 `'30'`）；迁移 v3 自动把旧值换算成分钟（<1min 置 1、非法值清除走默认） |
| 后端 | leases/accounts service 读分钟 ×60 用于超时判定；`extension config` 对扩展协议**仍下发秒**（`inactivityTimeoutSeconds = 分钟×60`），**已安装扩展无需升级** |
| 前端 | 系统参数页 label 改为「无操作超时（分钟）」，输入即分钟 |
| 类型 | shared `settings.ts` / `api.ts`（ExtensionConfigDto 补 inactivityTimeoutSeconds；LeaseDto 补 timeoutSeconds）+ 已构建 |
| mock | admin-mock settings / mock lease 同步 |

**进度条 bug（设 10 分钟进度条却停在 2/3 处）**
- 根因：`MyAccountPage.vue` 把满刻度硬编码成 30 分钟（1800s），`进度=(1800-剩余)/1800`；设 10 分钟时剩余仅 600s → 起步即 66.7%。
- 修复：后端 `LeaseView` 新增 `timeoutSeconds`（=实际租期），前端改为 `进度=(timeoutSeconds-剩余)/timeoutSeconds`，满刻度跟随配置动态化 → 10 分钟配置下从 0% 开始跑。扩展悬浮窗（v1.3.0）此前已按后端 config 动态满刻度，无需改动。
- 验证：配置 10 分钟 → `/extension/config` 下发 600s、领取后 lease `timeoutSeconds=600`、`remainingSeconds≈599`（进度 ≈0% 从头起）。

## 关键文件

- 后端：`db/constants.ts`、`db/migrations.ts`（v3）、`db/audit.service.ts`、`lib/request-context.ts`（新）、`main.ts`、`modules/audit/*`、`modules/admin/*`（分页）、`modules/leases/*`、`modules/accounts/*`、`modules/extension/*`、`e2e/admin.e2e.ts`
- shared：`settings.ts`、`api.ts`
- 前端：`lib/audit-labels.js`（新）、`pages/admin/{LogsPage,LeasesPage,SettingsPage}.vue`、`pages/MyAccountPage.vue`、`api/{admin.js,admin-mock.js,mock.js}`

## 回归

- 后端 e2e 20/20 PASS（含新断言：minutes 默认 30、更新 20min → config 1200s、leases 分页形状、actionLabel 下发）
- 运行时冒烟：日志 `action=LOGIN label=登录 ip=::1 user=管理员`；`/admin/leases` 分页 total/page 正确；恢复默认后 config `inactivityTimeoutSeconds=1800`
- 注意：release 归还在无自动化 worker 的机器上会把账号留在 RECYCLING（测试后已手动复位 KY-01 → AVAILABLE）
