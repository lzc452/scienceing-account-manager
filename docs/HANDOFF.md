# 会话交接文档 (Handoff)

> 生成时间：2026-09-30  
> 会话范围：从「腾讯云轻量服务器部署评估」到「开发/部署文档生成与端到端验证」

---

## 1. 已完成的工作

### 1.1 部署可行性评估

- 评估了腾讯云轻量服务器（134.175.156.233，2C2G/50GB/4Mbps，广州）
- 识别出 4 个 P0 安全阻断项，产出 `docs/cloud-deploy-readiness.md`

### 1.2 云部署方案设计

- 发现 ICP 备案约束（实例购买时长 <90 天无法备案），推翻域名方案
- 确定**路线 B**：公网 IP + Let's Encrypt IP 证书（shortlived profile，6 天有效期）
- 产出 `docs/cloud-deploy-design.md` + `deploy-cloud/` 全套制品（15 个文件）

### 1.3 源码改动

- `apps/server/src/main.ts`：`trust proxy` 改为读 `TRUST_PROXY` 环境变量（默认 `loopback`），已通过 `tsc --noEmit`

### 1.4 运维脚本（`deploy-cloud/scripts/`）

| 脚本 | 状态 | 说明 |
|---|---|---|
| `patch-extension.mjs` | 已实测 | 固定扩展 ID + 地址替换 + 打包 |
| `harden-host.sh` | 已review | SSH/ufw/swap/Docker日志/自动补丁 |
| `issue-cert.sh` | 已review | 首次签发（standalone），IP/域名自适应 |
| `renew-cert.sh` | 已review | 续期，阈值前置判断（IP 3天/域名30天） |
| `install-cron.sh` | 已review | 幂等装两条 cron（续期+备份） |
| `verify-deploy.sh` | 已review | 9组验收自检 |
| `backup-offsite.sh` | 已review | VACUUM INTO → rclone → COS |
| `deploy.sh` | **已修复bug** | 迁移/种子步骤加了 `RELEASE_TAG` |

### 1.5 安全审计

- 审查了 5 类凭据（员工密码/科应密码/管理员凭据/会话token/扩展证明）
- **发现并修复登录时序侧信道**：`auth.service.ts` + `password.ts`（新增 `DUMMY_HASH`）
- 产出 `docs/security-audit-report.md`

### 1.6 开发文档与部署文档

- `docs/DEVELOPMENT.md`：本地开发全流程（分支策略/数据库/新增API/前端/测试/发版）
- `docs/DEPLOYMENT.md`：生产部署全流程（初始化/发布/备份/证书/监控/回滚/故障排查）

### 1.7 端到端验证

交叉验证文档 ↔ 源码 ↔ Release 产物，发现 8 项问题并全部修复：

| # | 问题 | 文件 | 状态 |
|---|---|---|---|
| 1 | 迁移注册路径错误 | DEVELOPMENT.md | 已修复 |
| 2 | Controller 示例双重 api/ 前缀 | DEVELOPMENT.md | 已修复 |
| 3 | db:doctor 路径错误 | DEPLOYMENT.md | 已修复 |
| 4 | 自动回滚描述不完整 | DEPLOYMENT.md | 已修复（补充限制说明） |
| 5 | verify-deploy 检查项数量矛盾 | DEPLOYMENT.md | 已修复 |
| 6 | VERIFY_USERNAME/PASSWORD 缺失 | .env.example + DEPLOYMENT.md | 已修复 |
| 7 | **deploy.sh 迁移缺 RELEASE_TAG** | deploy.sh | **已修复（关键bug）** |
| 8 | sqlite3 CLI 在 Playwright 镜像中不可用 | DEPLOYMENT.md | 已修复 |

---

## 2. 关键设计决策（必须保留）

### 2.1 访问方式：路线 B（IP 证书）

- **原因**：ICP 备案要求实例购买时长 ≥90 天，当前仅 1 个月，无法备案
- **证书**：Let's Encrypt IP 证书，shortlived profile，**6 天有效期**
- **代价**：cron 必须每天运行续期，停摆 6 天内服务会断
- **切换成本**：将来切域名只需改 `DASHBOARD_HOST` + 重签证书 + 重打扩展，扩展 ID 不变

### 2.2 管理员凭据

- 科应后台只有一个管理员账号，邮箱固定为 `lishenggao@highpowertech.com`，不可改
- 生产环境的 `SCIENCING_ADMIN_PASSWORD` **必须与开发环境不同**
- 已写入 `.env.example` 和审计报告

### 2.3 容器网络

- 两段网络：`edge`（仅 gateway，暴露 80/443）+ `internal`（172.28.0.0/16）
- app **不发布任何端口**，物理隔离后端直连
- `TRUST_PROXY=172.28.0.0/16` 必须配置，否则限流失效

### 2.4 扩展 ID 固定

- 通过 `deploy-cloud/extension-key.pem`（RSA 私钥）固定
- 丢失后重新生成 = 新 ID，全员重装扩展
- 已写入 `.gitignore`，不会入库

---

## 3. 待用户完成的前置事项（6 项）

这些无法由脚本代劳，必须在部署前完成：

| # | 事项 | 操作 |
|---|---|---|
| 1 | **续费服务器** | 当前 2026-10-04 到期，到期后数据进入回收期 |
| 2 | **上传 SSH 公钥** | `ssh-copy-id -i ~/.ssh/id_ed25519.pub root@134.175.156.233` |
| 3 | **控制台防火墙收口** | 只保留 22/80/443，显式删除 3389 与 3000 |
| 4 | **生成并离线备份主密钥** | `openssl rand -hex 32` → 保存到密码管理器 |
| 5 | **提供生产管理员密码** | 邮箱固定 `lishenggao@highpowertech.com`，密码与开发环境不同 |
| 6 | **离线备份 extension-key.pem** | 丢失会导致扩展 ID 变化 |
| 7 | **配置 rclone remote** | `rclone config` → S3 remote，endpoint 用腾讯云 COS |

---

## 4. 已知风险与缓解

| 风险 | 等级 | 缓解措施 |
|---|---|---|
| IP 证书 6 天有效期 | P1 | `install-cron.sh` 已配置每天 03:17 续期；`verify-deploy.sh` 检查证书剩余天数 |
| 实例 5 天后到期 | P0 | **必须先续费**，否则部署后数据可能丢失 |
| 数据库与备份同盘 | P1 | `backup-offsite.sh` 每天 03:30 异地同步到 COS |
| 主密钥丢失 | P1 | 已提醒离线备份；丢失后已存密码永久无法解密 |
| 进程内限流（单实例） | P2 | 当前单实例可接受；未来多实例需改 Redis |

---

## 5. 核心文件索引

```text
docs/
  DEVELOPMENT.md          ← 开发文档（本地开发全流程）
  DEPLOYMENT.md           ← 部署文档（生产环境全流程）
  cloud-deploy-design.md  ← 方案设计 + 7阶段实施规划
  security-audit-report.md ← 密码安全审计报告
  HANDOFF.md              ← 本文档

deploy-cloud/
  .env.example            ← 生产配置模板（已含 VERIFY_USERNAME/PASSWORD）
  docker-compose.yml       ← 容器编排（两段网络）
  Dockerfile               ← 生产镜像（Playwright基础镜像）
  scripts/
    deploy.sh              ← 发布脚本（已修复 RELEASE_TAG bug）
    issue-cert.sh          ← 首次签发证书
    renew-cert.sh          ← 证书续期（cron驱动）
    install-cron.sh        ← 一键装cron
    verify-deploy.sh       ← 部署验收自检
    backup-offsite.sh      ← 异地备份
    harden-host.sh         ← 主机加固
    patch-extension.mjs    ← 扩展打包（开发机执行）
```

---

## 6. 如需继续的方向

### 6.1 高优先级

1. **用户完成 6 项前置事项**（续费/SSH公钥/防火墙/主密钥/管理员密码/扩展密钥备份）
2. **实际部署到服务器**：按 `DEPLOYMENT.md` §3~§4 执行
3. **验证部署**：`bash scripts/verify-deploy.sh` 9 组检查全部通过

### 6.2 中优先级

4. 配置外部监控（Uptime Kuma / 腾讯云监控）轮询 `/api/extension/config`
5. 配置告警渠道（钉钉/企业微信/邮件）用于证书过期和备份失败

### 6.3 低优先级

6. 切换域名（路线 A）：需先续费到 ≥90 天 → ICP 备案 → 注册域名 → 切换

---

## 7. 技术栈速查

| 层级 | 技术 |
|---|---|
| 后端 | NestJS + TypeScript + SQLite (`node:sqlite`) |
| 前端 | Vue 3 + Vite + Tailwind CSS 4 |
| 扩展 | Chrome MV3 (content script + service worker) |
| Worker | Playwright + Chromium（子进程 spawn） |
| 部署 | Docker Compose + nginx + Let's Encrypt |
| 包管理 | pnpm workspace |
| Node | >= 22.5（需内置 `node:sqlite`） |
