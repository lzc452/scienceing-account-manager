# 科应共享账号管理平台 — 代码审查报告（Standards + Spec 两轴）

> 审查人：reviewer（审查与验收工程师）
> 日期：2026-09-01
> 范围：apps/server、apps/web、apps/extension、playwright/worker（t1–t12 交付）
> 依据：PRD §40 API 契约 / §57 R1–R10 / §58 审计；PRODUCT-DESIGN §4.1 语义色边界 / §9 可访问性 / §10 验收清单；ESLint / TS 严格 / 命名 / 敏感信息不入码。
> 方法：只读代码审查（read/grep/glob）+ 复用 t13 已跑的自动化证据（后端 e2e 19/19、crypto 5/5、扩展 validate+5、Playwright 逻辑 10/10、真实 server+web 冒烟）。

---

## 0. 结论

- **阻塞级：1 项**（R3/R4 未在服务端强制）。
- **严重：2 项**（前端默认未接真实后端；默认管理员口令入源码与前端）。
- **一般：2 项**（前端 `getPool()` 注释过期误导；演示口令随包发布）。
- **建议：2 项**（扩展 console.log 噪声；`ComponentShowcase` 演示数据入库产物）。
- 其余 Standards/Spec 检查项**通过**（详见 §3 通过清单）。

> 核心租约状态机（R1/R2/R5/R6/R7/R8/R9/R10）、加密与审计、语义色边界、可访问性均达标；阻塞与严重项集中在「插件版本门槛的服务端强制」与「前端与真实后端的接线」两处。

---

## 1. 阻塞级（必须修复后才能交付）

### B-1：R3/R4 未在服务端强制 —— 插件未装/版本过旧仍可领取
- **位置**：`apps/server/src/modules/leases/leases.service.ts` `claim(userId, extensionVersion?)`（L32–92）
- **问题**：`POST /api/leases` 接受 `extensionVersion` 但**从不校验**其是否低于 `system_settings.extension_min_version`，也没有任何「插件已安装」的判定。前端 CTA 禁用只是 UI 层（且 mock 模式恒就绪），服务端可被直接调用绕过。
- **违反**：PRD §57 **R3（插件未正常安装禁止领取）**、**R4（插件版本低于 minimum 禁止领取）**；直接导致 PRD §60 场景 3（插件检测）无法端到端通过。
- **修复建议**：在 `claim()` 事务前校验 `extensionVersion`（低于 `extension_min_version` 或缺省时抛 `ForbiddenException`/`ConflictException`，返回可读文案「插件未安装/版本过旧，请升级后再领取」）；在 `leases.e2e.ts` 增补「缺 extensionVersion → 拒绝」「低版本 → 拒绝」两例。

---

## 2. 严重（应尽快修复）

### S-1：前端默认未接真实后端（`USE_MOCK=true` 恒真 + `getPool()` 真实模式返回空）
- **位置**：`apps/web/src/api/index.js` L10（`export const USE_MOCK = true`）、L171–174（`getPool()` 真实模式 `return Promise.resolve([])`）
- **问题**：① 前端默认走内存 mock，构建产物不联调真实 NestJS；② `getPool()` 注释称「后端暂无公开池列表端点」已**过期**——`GET /api/accounts/pool` 实际已实现（t6，且 e2e + t13 冒烟已验证返回 10 行匿名数据）。真实模式下看板账号池恒为空态，违反 PRD §35 看板「账号池行」需求。
- **修复建议**：`getPool()` 改为 `USE_MOCK ? mockApi.pool() : http('GET','/accounts/pool')`；`USE_MOCK` 改为由 `import.meta.env` 决定（默认生产联调 false、演示 true），并在 README 说明切换方式。

### S-2：默认管理员口令硬编码入源码与前端（敏感信息入码/前端）
- **位置**：`apps/server/src/db/seed.ts` L14（`DEFAULT_ADMIN_PASSWORD = 'admin123456'`）；`apps/web/src/api/mock.js` L31–32（`admin/admin123456`、`zhangsan/user123456`，且被打进 `apps/web/dist/assets/index-*.js`）
- **问题**：PRD §42 明确「管理员凭据不能存在 Git / 前端」。seed 默认口令虽可被 `ADMIN_INITIAL_PASSWORD` 覆盖，但默认值仍入码；mock 的 admin 口令与 seed 默认一致，若按文档用默认口令启动即存在弱口令风险。
- **修复建议**：seed 在未设 `ADMIN_INITIAL_PASSWORD` 时**不设弱口令**（改生成随机口令并打印一次，或直接要求显式提供）；mock 演示口令改为与任何真实默认无关的占位值（如 `mock-admin`）。

---

## 3. 一般 / 建议

- **G-1（一般）**：`apps/web/src/api/index.js` L171–173 注释「后端暂无公开池列表端点」误导后续维护者（实际已存在）。随 S-1 一并更正。
- **G-2（一般）**：`apps/web/src/views/ComponentShowcase.vue` L142 演示口令 `Ky-2026#A7x` 随构建产物发布（`dist` 可见）。演示数据建议统一走 mock 或明显占位。
- **A-1（建议）**：`apps/extension/src/background.js` 多处 `console.log`（BIND_AND_OPEN / inherit / unbind / lease ended / service worker ready / activity report failed）。经核查均只打印 `{tabId, leaseId, accountCode}` 或 `String(error)`，**不含 leaseToken / 密码**，无泄密风险；但从 Karpathy 简洁与生产日志噪声角度，建议收敛为仅在失败路径 `console.warn/error`。
- **A-2（建议）**：后端 `scheduler/timeout.service.ts`、`reset/reset.scheduler.ts` 的定时器错误仅 `console.error`，未计数/告警聚合；对 10 账号规模可接受，规模化前可考虑简单指标。

---

## 4. 通过清单（两轴抽查证据）

### Standards 轴
- **TS 严格 / ESLint**：根 `tsconfig.base.json` 开启 strict 系列（t1 交付）；后端与扩展 `eslint` exit 0（t5/t10/t12 证据）。
- **敏感信息不入日志/审计**：登录不落口令；`audit.service.ts` metadata 仅存 `{accountCode}` 等非敏感字段；e2e `admin.e2e.ts` 显式断言「审计 metadata 不得含占位密码 / 不含敏感值」。会话 token / leaseToken 均 **SHA-256 后落库**（`auth.service.ts`、`leases.service.ts`）；科应密码 **AES-256-GCM**（`secret-box.ts`，crypto 5/5 含篡改 authTag 抛错）。
- **Playwright 管理员凭据**：`loadConfigFromEnv` 缺凭据即报错、仅走环境变量（PRD §42），`playwright/.auth/` 已入 `.gitignore`（logic.test 10/10 覆盖）。
- **命名**：领域对象 camelCase DTO 对齐 `packages/shared`；状态/原因/动作字符串常量集中在 `db/constants.ts`，可读性良好。

### Spec 轴
- **§40 API 契约**：auth（login/logout/me）、accounts（availability + pool）、leases（POST/current/activity/release/status）、admin（accounts/leases/logs/users/settings）、extension/config、automation/health 均存在（t13 冒烟 + e2e 全命中）。
- **§57 R1–R10**：R1 事务领取 + 条件 UPDATE + 唯一索引兜底；R2 同用户单租约；R5/R7 Activity 条件续期与 RECYCLING 拒续；R6 超时条件回收（29:59 不被 30:00 误踢）；R8/R9 两阶段改密成功→AVAILABLE / 失败 3 次重试→ERROR；R10 仅本人租约见明文、游客匿名池——**全部 e2e 通过（19/19）**。**仅 R3/R4 缺口（见 B-1）**。
- **PRODUCT-DESIGN §4.1 语义色边界**：语义色仅出现在状态圆点/徽章（`StatusDot.vue`、`Badge.vue` tone、`PluginChip.vue`、`ErrorCard.vue`）；按钮/导航/正文无彩色，ember 仅限破坏性/错误（`Button.vue` destructive、ErrorCard）。`STATUS_META` 色值与 §4.1 表逐项一致。✅
- **§9 可访问性**：`StatusDot` 用 `role="status"` + `aria-label`（文本主通道，灰度可读）；`:focus-visible` 2px ink 环；`prefers-reduced-motion` 关闭旋转/脉冲/过渡。✅
- **§10 验收清单**：10 场景结论见 `docs/acceptance-report.md`（7 PASS / 3 阻塞，阻塞项与本报告 B-1/S-1/S-2 对应）。

---

## 5. 附：与 t13 验收阻塞项的对应关系

| t13 阻塞 | 本报告编号 | 说明 |
|---|---|---|
| B1 后端未强制 R3/R4 | **B-1（阻塞）** | 同一问题，代码审查定位到 `leases.service.ts claim()` |
| B2 前端 USE_MOCK + getPool 空 | **S-1（严重）** | 同一问题，另发现 `getPool()` 注释过期 |
| —（新发现） | **S-2（严重）** | 默认口令入源码+前端，敏感信息规范问题 |
| B3/B4 沙箱环境限制 | — | 环境限制非代码缺陷，不在审查缺陷清单 |
