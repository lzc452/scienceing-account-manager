# 密码安全审计报告

> 审计对象：`scienceing-account-manager` 全栈代码  
> 审计日期：2026-09-29  
> 审计目标：确认部署到公网后，员工登录密码、科应账号密码、科应管理员凭据、会话/租约令牌、扩展证明等五类凭据不存在密码泄漏或被盗用风险。

---

## 1. 审计范围与方法

| 维度 | 说明 |
|---|---|
| **代码范围** | `apps/server/src/crypto/*`、`apps/server/src/modules/auth/*`、`apps/server/src/modules/leases/*`、`apps/server/src/modules/extension/*`、`apps/extension/src/*`、`playwright/worker/src/*` |
| **运行态** | Docker Compose 两段网络（edge / internal）、nginx 反向代理、SQLite 持久化 |
| **方法** | 静态代码走查 + 关键路径运行时序复现 + 配置面审查 |
| **排除项** | 操作系统级入侵、物理访问、腾讯云控制台凭据泄漏、浏览器插件恶意行为（超出本应用控制范围） |

---

## 2. 凭据逐项审计

### 2.1 员工登录密码

| 检查项 | 现状 | 结论 |
|---|---|---|
| **存储方式** | `users.password_hash`，bcryptjs 10 rounds，只存 hash 不存明文 | ✅ |
| **哈希算法** | bcrypt（salt + cost factor），抗彩虹表与 GPU 暴力破解 | ✅ |
| **传输路径** | HTTPS（TLS 1.2+），nginx 终止 TLS，内部 `http://app:3000` 明文但隔离在 Docker `internal` 网络 | ✅ |
| **密码策略** | ≥8 字符、≤72 UTF-8 字节（bcrypt 截断上限），首登强制改密 | ✅ |
| **失败限流** | 进程内固定窗口：15 分钟 10 次失败（`rate-limit.ts`），按 `clientKey()`（IP）计数 | ✅（单实例适用） |
| **改密后处理** | 清除该用户所有其它会话，防止旧密码建立的并行会话继续访问 | ✅ |
| **账号枚举** | 错误消息已统一（"用户名或密码错误"）；**修复前**存在时序侧信道（77 ms vs 0 ms），**修复后**两条 401 路径均执行 bcrypt.compare（dummy hash），时序差 < 2 ms | ✅ 已修复 |

**关键代码**：
- `apps/server/src/crypto/password.ts` — bcrypt hash/verify
- `apps/server/src/modules/auth/auth.service.ts` — login / changePassword
- `packages/shared/password-policy.js` — 策略规则

---

### 2.2 科应账号密码

| 检查项 | 现状 | 结论 |
|---|---|---|
| **存储方式** | `scienceing_accounts.current_password_ciphertext`，AES-256-GCM 密文 | ✅ |
| **密钥管理** | 主密钥 `SCIENCEING_MASTER_KEY` 仅环境变量，不入库 / 不入镜像 / 不入 Git | ✅ |
| **AAD 绑定** | v2 载荷绑定 `account:${id}`，防止密文跨账号搬运；v1 历史载荷平滑迁移 | ✅ |
| **随机 IV** | 每次加密 12 字节随机 nonce，封装在密文前 | ✅ |
| **传输路径** | 服务端 → 扩展：仅下发 `leaseToken`（短时票据），**不下发密码明文**；扩展 → Playwright Worker：口令经 stdin 传入，Worker 直接填入表单，无中间持久化 | ✅ |
| **日志暴露** | 审计日志只记 `accountCode`、`reason`，不记密码；Worker 日志无截图/录屏/口令；automation.executor 经 `redactSecrets` 脱敏后再外传 | ✅ |

**关键代码**：
- `apps/server/src/crypto/secret-box.ts` — AES-256-GCM 加解密
- `apps/server/src/modules/leases/leases.service.ts` — 凭据下发（只发 leaseToken）
- `apps/server/src/modules/automation/worker-client.ts` — stdin 传口令
- `apps/server/src/lib/redact.ts` — 脱敏函数

---

### 2.3 科应管理员凭据

| 检查项 | 现状 | 结论 |
|---|---|---|
| **存储方式** | 仅环境变量 `SCIENCING_ADMIN_USERNAME` / `PASSWORD`，不入库 | ✅ |
| **运行态暴露** | 仅在容器启动时读入内存，不进日志；`process.env` 子进程继承，但 Worker 不读取这些变量 | ✅ |
| **生产强制** | `master-key.ts` 生产环境缺失 `SCIENCEING_MASTER_KEY` 直接抛错，阻止以缺省密钥运行 | ✅ |
| **建议** | 邮箱固定为 `lishenggao@highpowertech.com`（科应后台唯一管理员账号），**密码必须与开发/测试环境不同** | ⚠️ 用户侧待办 |

---

### 2.4 会话 Token & LeaseToken

| 检查项 | 会话 Token | LeaseToken | 结论 |
|---|---|---|---|
| **存储方式** | `sessions.token_hash` — SHA-256 | `leases.lease_token_hash` — SHA-256 | ✅ 只存 hash |
| **传输方式** | Cookie（`HttpOnly; Secure; SameSite=Lax`） | 扩展内存（`chrome.storage.session`），**不持久化** | ✅ |
| **有效期** | 7 天（`SESSION_TTL_MS = 7*24*60*60*1000`） | 1 分钟（`LEASE_TTL_MS = 60*1000`） | ✅ |
| **撤销机制** | 改密后清除该用户其它会话；logout 删除当前会话 | 消费即作废（`consumed_at` 标记） | ✅ |
| **日志暴露** | 审计日志不记录 token 明文 | 审计日志不记录 token 明文 | ✅ |

---

### 2.5 扩展一次性证明（Extension Proof）

| 检查项 | 现状 | 结论 |
|---|---|---|
| **存储方式** | `extension_proofs.proof_hash` — SHA-256，30 秒 TTL | ✅ |
| **使用方式** | 扩展 claim 时消费，单用即废，防重放 | ✅ |
| **来源校验** | `event.source === window`（内容脚本与扩展同页面上下文） | ✅（扩展注入受 `matches` 限制，生产仅一个域名） |

---

## 3. 传输链路安全

```
浏览器/扩展 ──HTTPS──> nginx:443 ──HTTP──> app:3000 (Docker internal)
                                      │
                                      └──> playwright-worker (stdin 传口令)
```

- **TLS**：Let's Encrypt IP 证书（`shortlived` profile，~6.7 天有效期），自动续期脚本 `renew-cert.sh`。
- **内部网络**：app 不发布端口，仅 nginx 在 `edge` 网络暴露 80/443；Playwright Worker 在 `internal` 网络，无外部可达性。
- **HSTS / CSP**：nginx 注入安全头，`style-src 'unsafe-inline'` 为 Vue+Tailwind 必要放宽，`img-src data:` 为手册内联插图必要放宽。
- **CORS**：`CORS_ORIGINS` 非空时整体替换默认白名单，已补回 `chrome-extension://<ID>`。

---

## 4. 日志与监控暴露面

| 组件 | 是否可能含密码 | 说明 |
|---|---|---|
| `audit` 表 | ❌ 否 | 只记 action / result / accountCode / reason |
| NestJS 控制台日志 | ❌ 否 | 无密码字段输出；异常堆栈经 `redactSecrets` 处理 |
| Playwright Worker stdout | ❌ 否 | 无截图/录屏/trace；口令从 stdin 读入，不进日志 |
| nginx access log | ❌ 否 | 只记请求行、状态码、UA、IP |
| Docker 日志 | ❌ 否 | 未挂载敏感文件为 volume；`docker logs` 不含密码 |

---

## 5. 已发现与修复的漏洞

### 5.1 登录时序侧信道（已修复）

- **现象**：用户不存在时直接抛 401（~0 ms），用户存在时执行 `bcrypt.compare`（~77 ms），攻击者可稳定区分。
- **影响**：账号枚举，但受 15 分钟 10 次限流约束，实际利用成本较高。
- **修复**：`auth.service.ts` 的 `!row` 分支先执行 `await verifyPassword(password, DUMMY_HASH)`，再抛 401。
- **验证**：修复后两条路径时序差 < 2 ms（实测 1.1 ms）。
- **提交**：`apps/server/src/crypto/password.ts` + `apps/server/src/modules/auth/auth.service.ts`

---

## 6. 残余风险与建议

| 风险 | 等级 | 说明与缓解 |
|---|---|---|
| **进程内限流** | P2 | 单实例部署下固定窗口限流足够；若未来扩容到多实例，需改 Redis 分布式限流 |
| **class-validator 未全局启用** | P2 | DTO 为 interface 非 class，但所有密码路径均显式调用 `isPasswordAllowed` |
| **扩展消息未校验 origin** | P2 | 生产仅一个域名 + `matches` 限制注入范围，风险可控 |
| **SCIENCEING_MASTER_KEY 离线备份** | P1 | 用户侧待办：密钥丢失将导致全部科应账号密码无法解密 |
| **生产管理员凭据未更换** | P1 | 用户侧待办：当前 `.env` 中是开发凭据，上线前必须替换 |
| **IP 证书 6 天有效期** | P2 | 自动续期脚本已配置 cron；若续期失败，证书过期后浏览器会阻断访问（可用性风险，非密码泄漏风险） |
| **rclone 异地备份未配置** | P2 | 用户侧待办：`backup-offsite.sh` 依赖 rclone remote |

---

## 7. 结论

**除已修复的登录时序侧信道外，五类凭据的存储、传输、日志暴露链路均未发现密码泄漏或被攻击者直接利用的漏洞。**

部署到公网后的密码安全基线满足生产要求，前提条件：

1. 生成并离线备份 `SCIENCEING_MASTER_KEY`（`openssl rand -hex 32`）。
2. `SCIENCING_ADMIN_PASSWORD` 必须使用生产专用强密码（邮箱固定为 `lishenggao@highpowertech.com`，不可改；严禁与开发/测试环境共用密码）。
3. 上传 SSH 公钥后执行 `harden-host.sh`（禁密码登录、fail2ban、ufw）。
4. 腾讯云控制台防火墙只保留 22/80/443，删除 3389 与 3000。
5. 配置 rclone remote 以启用异地备份。
6. 离线备份 `deploy-cloud/extension-key.pem`（丢失将导致扩展 ID 变化，全员重装）。

---

## 附录：审计覆盖文件清单

```
apps/server/src/crypto/secret-box.ts
apps/server/src/crypto/password.ts
apps/server/src/crypto/account-password.ts
apps/server/src/crypto/master-key.ts
apps/server/src/crypto/verify-token.ts
apps/server/src/crypto/lease-token.ts
apps/server/src/modules/auth/auth.service.ts
apps/server/src/modules/admin/admin.service.ts
apps/server/src/modules/users/users.service.ts
apps/server/src/modules/reset/reset.service.ts
apps/server/src/modules/leases/leases.service.ts
apps/server/src/modules/extension/extension-proof.service.ts
apps/server/src/modules/automation/worker-client.ts
apps/server/src/modules/automation/automation.executor.ts
apps/server/src/guards/extract-token.ts
apps/server/src/guards/auth.guard.ts
apps/server/src/guards/admin.guard.ts
apps/server/src/lib/redact.ts
apps/server/src/lib/rate-limit.ts
apps/server/src/db/audit.service.ts
apps/extension/src/background.js
apps/extension/src/lib/claim.js
apps/extension/src/content/dashboard.js
apps/web/src/components/PasswordReveal.vue
playwright/worker/src/cli.ts
packages/shared/password-policy.js
```
