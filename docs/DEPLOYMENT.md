# 科应共享账号管理平台 —— 部署文档

> 版本：v1.0  
> 适用范围：生产环境部署与运维

---

## 1. 部署形态总览

本项目支持**两种**生产部署形态：

| 维度 | 形态 A：Windows LAN | 形态 B：Linux 云服务器（Docker） |
|---|---|---|
| **适用场景** | 公司内网，Windows 服务器 | 公网访问，腾讯云轻量服务器 |
| **网络** | 内网 IP 或主机名 | 公网 IP + TLS |
| **进程管理** | PowerShell + 裸进程 | Docker Compose |
| **反向代理** | nginx 二进制（18080 端口） | nginx 容器（80/443） |
| **数据库** | SQLite 本地文件 | SQLite Docker volume |
| **TLS** | 无（内网） | Let's Encrypt IP/域名证书 |
| **发布脚本** | `deploy-release.ps1` | `deploy.sh` + `scp` |
| **文档位置** | `deploy-lan/README.md` | `deploy-cloud/README.md` |

**当前推荐形态 B**（公网 IP + Let's Encrypt IP 证书），本文后续以形态 B 为主展开，形态 A 作为对比参考。

---

## 2. 前置条件

### 2.1 服务器资源

| 规格 | 最低要求 |
|---|---|
| CPU | 2 核 |
| 内存 | 2 GB |
| 磁盘 | 50 GB SSD |
| 带宽 | 4 Mbps |
| 操作系统 | Ubuntu 22.04 LTS（推荐） |
| 公网 IP | 固定 IPv4 |

### 2.2 必须人工准备（脚本无法代劳）

| # | 事项 | 命令/操作 |
|---|---|---|
| 1 | **上传 SSH 公钥** | `ssh-copy-id -i ~/.ssh/id_ed25519.pub root@<IP>` |
| 2 | **生成并离线备份主密钥** | `openssl rand -hex 32` → 保存到密码管理器 |
| 3 | **设置生产管理员密码** | 在服务器 `.env` 中填写 `SCIENCING_ADMIN_PASSWORD`（邮箱固定 `lishenggao@highpowertech.com`） |
| 4 | **备份扩展签名私钥** | 将 `deploy-cloud/extension-key.pem` 离线保存 |
| 5 | **配置 rclone remote** | `rclone config` → 新建 S3 remote，endpoint 用腾讯云 COS |
| 6 | **防火墙收口** | 腾讯云控制台只保留 **22 / 80 / 443**，删除 3389 与 3000 |

---

## 3. 服务器初始化（首次部署）

### 3.1 登录服务器

```bash
ssh root@134.175.156.233
```

### 3.2 主机加固

```bash
# 上传 deploy-cloud/scripts/harden-host.sh 到服务器后执行
sudo bash scripts/harden-host.sh --ssh-port 22022 --admin-ip <你的固定出口IP>
```

执行内容：

- 禁用 root 密码登录，仅允许公钥
- 安装并配置 fail2ban（防暴力破解）
- 配置 ufw：只放行 22/80/443
- 创建 2GB swap
- Docker 日志轮转（10MB × 3 文件）
- 启用自动安全更新

**⚠️ 警告**：若未上传 SSH 公钥，脚本会直接中止——防止关闭密码登录后把自己锁在门外。

### 3.3 安装 Docker

```bash
# 若服务器镜像未预装 Docker
curl -fsSL https://get.docker.com | bash
sudo usermod -aG docker $USER
newgrp docker
```

### 3.4 创建部署目录

```bash
sudo mkdir -p /opt/scienceing
sudo chown $USER:$USER /opt/scienceing
cd /opt/scienceing
```

### 3.5 上传部署制品

**开发机执行**：

```bash
# 假设 deploy-cloud/ 目录在当前目录下
scp -r deploy-cloud/* root@134.175.156.233:/opt/scienceing/
```

上传后服务器侧目录结构：

```text
/opt/scienceing/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── nginx/
│   ├── templates/dashboard.conf.template
│   └── snippets/security-headers.conf
├── scripts/
│   ├── patch-extension.mjs
│   ├── harden-host.sh
│   ├── issue-cert.sh
│   ├── renew-cert.sh
│   ├── install-cron.sh
│   ├── verify-deploy.sh
│   ├── backup-offsite.sh
│   └── deploy.sh
└── extension-key.pem          ← 由 patch-extension.mjs 生成，已存在则复用
```

### 3.6 配置环境变量

```bash
cd /opt/scienceing
cp .env.example .env
chmod 600 .env
vi .env
```

必须填写的关键项：

```env
DASHBOARD_HOST=134.175.156.233
CERTBOT_EMAIL=your-email@example.com
SCIENCEING_MASTER_KEY=<64位hex，openssl rand -hex 32生成>
SCIENCING_ADMIN_USERNAME=lishenggao@highpowertech.com
SCIENCING_ADMIN_PASSWORD=<生产专用强密码>
CORS_ORIGINS=https://134.175.156.233,chrome-extension://opockgnmgpgocghdfanhlfcpkaahodga
SCIENCEING_EXTENSION_IDS=opockgnmgpgocghdfanhlfcpkaahodga
```

**校验 compose 配置**：

```bash
cd /opt/scienceing
docker compose config
```

应输出完整解析后的配置且无报错。

### 3.7 签发 TLS 证书

```bash
cd /opt/scienceing
bash scripts/issue-cert.sh
```

执行流程：

1. 读取 `.env` 的 `DASHBOARD_HOST` 判定 IP/域名形态
2. 校验 certbot 镜像版本（IP 证书需 ≥ 5.4）
3. 停 gateway 让出 80 端口
4. certbot `--standalone` 签发
5. 拉起 gateway
6. 轮询 `https://<IP>/api/extension/config` 确认 HTTPS 可用

**首次签发预计耗时**：1–3 分钟（取决于 Let's Encrypt 响应速度）。

**Staging 演练**（避免触发速率限制）：

```bash
bash scripts/issue-cert.sh --staging
```

Staging 签出的证书不被浏览器信任，仅用于验证流程。

---

## 4. 应用发布

### 4.1 开发机：打包 Release

```powershell
# Windows 开发机，PowerShell
.\make-release.ps1 -CloudHost 134.175.156.233 -ExtensionKeyPath D:\scienceing-secrets\extension-key.pem

# 输出：E:\git-local-share\releases\scienceing-v1.2.3.zip
```

### 4.2 上传 Release 到服务器

```bash
# 开发机
scp E:/git-local-share/releases/scienceing-v1.2.3.zip E:/git-local-share/releases/scienceing-v1.2.3.zip.sha256 root@134.175.156.233:/tmp/
```

### 4.3 服务器：执行发布

```bash
ssh root@134.175.156.233
cd /opt/scienceing
bash scripts/deploy.sh /tmp/scienceing-v1.2.3.zip
```

`deploy.sh` 执行流程：

1. 核验 ZIP 与同名 `.sha256`、扩展 ID、白名单和下载 ZIP；用同一 Tag 的包内 Dockerfile 构建候选镜像，实际验证 SQLite Backup API 和 Chromium。
2. 阻断业务，停止旧 app 并确认退出；已有库必须成功完成本地 Backup API 快照，不支持跳过备份。
3. 切换同一 Tag 的制品、Compose、脚本与 Nginx 配置；迁移并检查版本/校验值、`integrity_check`、`foreign_key_check` 与密钥解密。
4. 以 `SCIENCEING_DEPLOY_VERIFY_ONLY=1` 启动：数据库只读，暂停改密、超时回收、会话清扫和自动备份；业务 API 返回维护状态。
5. 配置的 HTTPS 地址必须返回 200 和合法 JSON，实际 ZIP、元信息与 SHA256 匹配。重定向、HTML 回退页和证书错误均失败。
6. 启用业务写入后更新 `current.json`，保留 `rollback.json` 配对记录、旧代码/镜像/配置和 `/backups/deployments/` 快照。

首次全新空卷：`bash scripts/deploy.sh /tmp/scienceing-vX.Y.Z.zip --initialize`。只有整个数据卷为空、DB 及 WAL/SHM 不存在才允许 seed。普通升级缺库立即失败，已有库禁止 seed。未登记旧库先在部署机只读核对实际结构，确认匹配版本后显式 `--baseline N`，不向开发机传真实业务库（检查命令见第 5 节）。必须沿用原 `SCIENCEING_MASTER_KEY`。

部署机需 Docker Compose、Python 3、curl、unzip、flock。DB、备份、密钥、证书和运行指针不进入代码同步/Git。

### 4.4 验证发布

```bash
bash scripts/verify-deploy.sh
```

覆盖 9 组检查（含 10 个细项）：

1. HTTP 80 端口 301 跳转 HTTPS + ACME 挑战路径未被拦截
2. 五个安全头（HSTS / CSP / X-Content-Type-Options / X-Frame-Options / Referrer-Policy）
3. 证书有效期与剩余天数 + 证书文件存在性
4. 3000 端口不暴露（仅内部网络可达）
5. `/api/extension/config` 接口可用 + SPA 路由回退
6. 扩展 ZIP 可下载 + Content-Type 正确
7. Cookie 含 Secure 标记（需配置 VERIFY_USERNAME/VERIFY_PASSWORD）
8. 容器状态（app + gateway 均 healthy）
9. 证书续期 cron + 异地备份 cron 已配置

失败项逐条列出，退出码 1 可直接接监控告警。

---

## 5. 数据库运维

### 5.1 迁移

发布时 `deploy.sh` 自动执行，禁止在运行中的 app 上直接迁移或修改结构。

### 5.2 只读检查旧库结构

```bash
cd /opt/scienceing
source scripts/operations.sh
export RELEASE_TAG=$(current_tag)
# 指针不存在时须显式指定实际已构建的镜像 Tag，不允许猜测。
compose run --rm --no-deps -T app node /app/apps/server/dist/db/schema.js inspect --output /backups/prod-schema.json
# 只传递结构报告。确认匹配版本 N 后发布，迁移器仍会核对实际结构：
bash scripts/deploy.sh /tmp/scienceing-vX.Y.Z.zip --baseline N
```

不使用模型强制同步或 doctor --fix 修生产结构，不重建、不清库。

### 5.3 备份

#### 本地备份（发布前自动）

```bash
# deploy.sh 内部自动调用
# 备份文件位于 backup-data volume（/backups）
```

#### 异地备份（COS / S3）

```bash
bash scripts/backup-offsite.sh
```

执行流程：

1. 用当前 Tag 的 `maintenance.js backup` 调用 SQLite Backup API
2. 校验完整性与外键，允许真实空表
3. rclone 同步到对象存储
4. offsite 快照本地保留 7 天，异地保留 30 天；配对发布快照不自动清理

**Dry Run 模式**（只打印不执行）：

```bash
DRY_RUN=1 bash scripts/backup-offsite.sh
```

### 5.4 恢复

使用第 9 节配对恢复命令。任何恢复都遵循“停服并确认退出 → 恢复 → 校验 → 启动匹配版本 → HTTPS 验证”。禁止运行中替换 DB 或只回退代码。人工恢复前确认快照之后的业务数据回退影响。

### 5.5 查看数据库

```bash
# 用容器内 Node.js 查看表列表（Playwright 镜像不含 sqlite3 CLI）
docker compose exec app node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/data/scienceing.prod.db');
const rows = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all();
rows.forEach(r => console.log(r.name));
db.close();
"

# 或导出到本地查看
docker compose cp app:/data/scienceing.prod.db /tmp/
# 用 DB Browser for SQLite 打开
```

---

## 6. 证书管理

### 6.1 自动续期（cron）

```bash
sudo bash scripts/install-cron.sh
```

安装两条 cron（幂等，重复执行不会重复添加）：

```text
17 3 * * * /opt/scienceing/scripts/renew-cert.sh >> /var/log/scienceing-cert.log 2>&1   # scienceing-managed
30 3 * * * /opt/scienceing/scripts/backup-offsite.sh >> /var/log/scienceing-backup.log 2>&1 # scienceing-managed
```

- **续期**：每天 03:17 检查，IP 证书阈值 3 天，域名证书阈值 30 天
- **备份**：每天 03:30 异地同步

装完后立刻跑一次验证：

```bash
bash scripts/renew-cert.sh
```

未到阈值时会输出「剩余有效期超过 X 天，无需续期」并正常退出。

### 6.2 手动续期

```bash
cd /opt/scienceing
bash scripts/renew-cert.sh
```

### 6.3 查看证书状态

```bash
openssl x509 -in certs/live/134.175.156.233/fullchain.pem -noout -subject -dates
```

### 6.4 证书路径

| 文件 | 用途 |
|---|---|
| `certs/live/<HOST>/fullchain.pem` | 证书链（nginx `ssl_certificate`） |
| `certs/live/<HOST>/privkey.pem` | 私钥（nginx `ssl_certificate_key`） |
| `certs/renewal/` | certbot 续期配置 |

---

## 7. 进程管理

### 7.1 查看容器状态

```bash
cd /opt/scienceing
docker compose ps
```

### 7.2 查看日志

```bash
# 全部服务
docker compose logs -f

# 只看后端（最近 100 行）
docker compose logs --tail 100 -f app

# 只看网关
docker compose logs --tail 100 -f gateway
```

### 7.3 重启服务

```bash
# 平滑重启（不停数据卷）
source scripts/operations.sh
export RELEASE_TAG=$(current_tag)
compose restart app

# 新版本必须经过备份、迁移和验收，统一使用发布入口：
bash scripts/deploy.sh /tmp/scienceing-vX.Y.Z.zip
```

### 7.4 停止服务

```bash
# 停止全部
docker compose down

# 只停应用，保留数据卷
docker compose stop
```

### 7.5 进入容器调试

```bash
# 后端容器 shell
docker compose exec app sh

# 查看进程
docker compose exec app ps aux

# 查看资源占用
docker stats scienceing-app scienceing-gateway
```

---

## 8. 监控与告警

### 8.1 健康检查端点

```bash
# 公开端点，无需认证
curl -fsS https://134.175.156.233/api/extension/config
```

返回 HTTP 200 + JSON 即表示服务正常。

### 8.2 外部监控建议

用 Uptime Kuma / 腾讯云监控 / 自定义脚本轮询：

```bash
#!/bin/bash
# /usr/local/bin/scienceing-health-check.sh
if ! curl -fsS -m 10 -o /dev/null "https://134.175.156.233/api/extension/config"; then
  echo "[ALERT] $(date) 服务不可达" | tee -a /var/log/scienceing-alert.log
  # 发钉钉/企业微信/邮件
fi
```

crontab：

```text
*/5 * * * * /usr/local/bin/scienceing-health-check.sh
```

### 8.3 证书过期监控

`verify-deploy.sh` 已含证书剩余天数检查。单独提取：

```bash
openssl x509 -in certs/live/134.175.156.233/fullchain.pem -noout -checkend $((3 * 86400))
# 退出码 0 = 剩余 > 3 天；非零 = 即将过期
```

### 8.4 磁盘空间监控

```bash
# 数据库 + 备份 + 日志 占用的主要路径
df -h /var/lib/docker
# 告警阈值：> 80%
```

---

## 9. 回滚

### 9.1 自动恢复与停机边界

停服后的迁移、校验、维护启动和 HTTPS 验收失败进入统一恢复：确认新 app 已停止 → 恢复确切配对快照 → 恢复旧代码/镜像/配置 → 校验 → 启动旧版 → HTTPS 验证。停止、恢复或旧版验证失败保持停机。失败 DB 和 WAL/SHM 留存为 `.failed-*`。

**启用业务写入后发生异常，只停机并保留当前库，禁止自动覆盖为旧快照。** `deployment.pending.json` 存在时下一次发布会被阻断；人工决定修复当前版本或确认数据回退影响后恢复。

### 9.2 手动恢复

```bash
cd /opt/scienceing
cat rollback.json
# 确认目标 Tag、快照、配对制品/镜像/配置仍在，并接受快照后业务数据回退：
bash scripts/restore.sh --previous

# 失败发布保持停机时，查看记录，确认回退影响后：
cat deployment.pending.json
bash scripts/restore.sh --pending

# 恢复脚本已执行停服 → 恢复 → 校验 → 匹配版本启动 → HTTPS 验证。
bash scripts/verify-deploy.sh
```

配对快照不受每日保留策略清理。旧制品、镜像、配置与快照一起保留并监控磁盘；禁止 `docker compose down -v`、volume prune 或删除失败库后重新初始化。

---

## 10. 扩展更新

扩展的 `manifest.json` 和 `config.js` 中烧录了服务器地址，IP 或域名变更时必须重打包。

### 10.1 Windows 开发机发布

```powershell
# 仓库和发布目录之外的原扩展私钥，持续复用并离线备份：
.\make-release.ps1 -CloudHost 134.175.156.233 -ExtensionKeyPath D:\scienceing-secrets\extension-key.pem
# 已有 Tag 可构建到新的空输出目录：
.\create-release.ps1 -Tag vX.Y.Z -CloudHost 134.175.156.233 -ExtensionKeyPath D:\scienceing-secrets\extension-key.pem -OutputDirectory D:\scienceing-releases
```

### 10.2 随同一 Tag 发布

构建器从 Tag 快照打包扩展到 Release 的 `apps/web/dist/downloads/`。ZIP 只含公钥、固定 ID 和地址；私钥不进包。`release.json` 记录站点/ID。后端从镜像该目录读取，Nginx 从同一 Release 下载，没有遮挡下载文件的空卷。上传 ZIP 与 `.sha256`；验收核对真实内容和摘要，无需手工提前打包工作区扩展。

### 10.3 用户侧安装

同事从 `https://<IP>/downloads/scienceing-extension.zip` 下载，Chrome 扩展管理页「加载已解压的扩展程序」即可。

---

## 11. 切换域名（IP → 域名）

### 11.1 前置条件

- 实例续费到**购买时长 ≥ 90 天**
- 注册境内域名 → 实名认证
- ICP 备案（1–3 周管局审核）

### 11.2 切换步骤

```bash
# 1. 改 .env
vi /opt/scienceing/.env
# DASHBOARD_HOST=dashboard.example.com
# CORS_ORIGINS=https://dashboard.example.com,chrome-extension://opockgnmgpgocghdfanhlfcpkaahodga

# 2. 重新签证书（脚本自动识别为域名形态，签发 90 天证书）
cd /opt/scienceing
bash scripts/issue-cert.sh

# 3. 开发机重打扩展
# Windows 开发机：.\make-release.ps1 -CloudHost dashboard.example.com -ExtensionKeyPath D:\scienceing-secrets\extension-key.pem

# 4. 重新发版
# make-release.ps1 → scp → deploy.sh
```

**扩展 ID 不变**（由 `extension-key.pem` 固定），所以不需要重新做来源收敛，只需重打包 + 通知同事重装扩展。

---

## 12. 日常运维命令速查

```bash
# ── 登录 ──
ssh root@134.175.156.233
cd /opt/scienceing

# ── 状态 ──
source scripts/operations.sh
export RELEASE_TAG=$(current_tag)
compose ps
compose logs --tail 50 -f app

# ── 发布 ──
bash scripts/deploy.sh /tmp/scienceing-vX.Y.Z.zip

# ── 验证 ──
bash scripts/verify-deploy.sh

# ── 备份 ──
bash scripts/backup-offsite.sh

# ── 证书 ──
bash scripts/renew-cert.sh
openssl x509 -in certs/live/134.175.156.233/fullchain.pem -noout -dates

# ── 数据库 ──
compose run --rm --no-deps -T app node /app/apps/server/dist/db/verify.js
# 结构修改统一走 deploy.sh。

# ── 重启 ──
compose restart app
# restart 不升级镜像；新版本走 deploy.sh。

# ── 停止 ──
docker compose stop
docker compose down

# ── 清理 ──
# 保留配对旧镜像和数据库卷，不做全局 image/volume prune。
```

---

## 13. 故障排查

### Q1：部署后 502 Bad Gateway

```bash
# 检查后端是否 healthy
source scripts/operations.sh
export RELEASE_TAG=$(current_tag)
compose ps
compose logs --tail 100 app

# 常见原因：
# - 数据库迁移失败（schema 不匹配）
# - .env 缺少必要变量
# - 端口 3000 被其他进程占用
```

### Q2：证书续期失败

```bash
# 查看日志
tail -50 /var/log/scienceing-cert.log

# 手动测试
bash scripts/renew-cert.sh

# 检查 80 端口是否可从公网访问
curl -I http://134.175.156.233/.well-known/acme-challenge/test

# 检查防火墙
docker compose exec gateway sh -c "nginx -t"
```

### Q3：扩展无法连接后端

1. 确认 `CORS_ORIGINS` 包含 `chrome-extension://<ID>`
2. 确认 `SCIENCEING_EXTENSION_IDS` 包含该 ID
3. 浏览器 F12 → Network → 查看具体 CORS 报错

### Q4：数据库损坏

先停止并保留现场，禁止运行中恢复、清空或 seed。

```bash
cd /opt/scienceing
source scripts/operations.sh
export RELEASE_TAG=$(current_tag)
compose stop gateway app
assert_app_stopped
# 确认配对旧版存在并接受快照之后的数据回退后：
bash scripts/restore.sh --previous
bash scripts/verify-deploy.sh
```

### Q5：磁盘满了

```bash
# 查看占用
du -sh /var/lib/docker/volumes/scienceing_*
du -sh /backups

# 清理旧备份（保留最近 7 天）
find /backups -name 'offsite-*.db' -type f -mtime +7 -delete

# 清理 Docker 日志（已配置 10MB × 3 轮转，但极端情况可手动截断）
docker compose exec app sh -c ": > /var/log/..."
```

---

## 14. 安全加固清单

部署完成后逐项确认：

- [ ] SSH 仅公钥登录，端口改为非 22（如 22022）
- [ ] fail2ban 运行中：`sudo fail2ban-client status`
- [ ] ufw 只放行 22/80/443：`sudo ufw status`
- [ ] 腾讯云控制台防火墙删除 3389 / 3000
- [ ] `.env` 权限 600：`ls -l /opt/scienceing/.env`
- [ ] `SCIENCEING_MASTER_KEY` 已离线备份
- [ ] 外部原扩展私钥已离线备份，未进入 Release/Git
- [ ] `SCIENCING_ADMIN_PASSWORD` 与开发环境不同
- [ ] cron 已配置：`crontab -l | grep scienceing`
- [ ] 证书自动续期验证通过：`bash scripts/renew-cert.sh`
- [ ] 异地备份验证通过：`bash scripts/backup-offsite.sh`
- [ ] `verify-deploy.sh` 9 组检查全部通过

---

## 附录 A：文件清单（deploy-cloud/）

| 文件 | 用途 | 执行位置 |
|---|---|---|
| `Dockerfile` | 生产镜像构建 | 服务器 |
| `docker-compose.yml` | 容器编排 | 服务器 |
| `.env.example` | 配置模板 | 开发机/服务器 |
| `nginx/templates/dashboard.conf.template` | nginx 站点模板 | 服务器 |
| `nginx/snippets/security-headers.conf` | 安全头 snippet | 服务器 |
| `scripts/patch-extension.mjs` | 扩展打包（固定 ID + 地址替换） | 开发机 |
| `scripts/harden-host.sh` | 主机加固 | 服务器 |
| `scripts/issue-cert.sh` | 首次签发证书 | 服务器 |
| `scripts/renew-cert.sh` | 证书续期 | 服务器（cron） |
| `scripts/install-cron.sh` | 一键安装 cron | 服务器 |
| `scripts/verify-deploy.sh` | 部署验收自检 | 服务器 |
| `scripts/backup-offsite.sh` | 异地备份 | 服务器（cron） |
| `scripts/deploy.sh` | 发布与回滚 | 服务器 |

---

## 附录 B：环境变量全表

| 变量 | 必填 | 示例 | 说明 |
|---|---|---|---|
| `DASHBOARD_HOST` | 是 | `134.175.156.233` | 访问地址主机部分 |
| `CERTBOT_EMAIL` | 是 | `ops@example.com` | 证书到期提醒邮箱 |
| `SCIENCEING_MASTER_KEY` | 是 | `a1b2c3...` (64 hex) | AES-256-GCM 主密钥 |
| `ADMIN_INITIAL_PASSWORD` | 首次 | `changeme123` | 首次 seed 的管理员口令 |
| `SCIENCING_ADMIN_USERNAME` | 是 | `lishenggao@highpowertech.com` | 科应后台管理员邮箱（固定） |
| `SCIENCING_ADMIN_PASSWORD` | 是 | `***` | 科应后台管理员密码（生产专用） |
| `SCIENCING_ADMIN_URL` | 否 | `https://www.scienceing.com/...` | 科应后台地址 |
| `CORS_ORIGINS` | 是 | `https://IP,chrome-extension://ID` | 来源白名单 |
| `SCIENCEING_EXTENSION_IDS` | 是 | `opockgnmgpgocghdfanhlfcpkaahodga` | 扩展 ID 白名单 |
| `TRUST_PROXY` | 否 | `172.28.0.0/16` | Express trust proxy（容器化必填） |
| `NODE_ENV` | 否 | `production` | 运行环境 |
| `PORT` | 否 | `3000` | 后端端口（容器内） |
| `DATABASE_PATH` | 否 | `/data/scienceing.prod.db` | 数据库路径 |
| `SCIENCEING_BACKUP_DIR` | 否 | `/backups` | 备份目录 |
| `EXTENSION_DOWNLOAD_DIR` | 否 | `/downloads` | 扩展 ZIP 目录 |
| `SCIENCING_BROWSER_CHANNEL` | 否 | `chromium` | Worker 浏览器通道 |
| `SCIENCING_BROWSER_HEADLESS` | 否 | `true` | Worker 无头模式 |
| `VERIFY_USERNAME` | 否 | `admin` | 验收自检登录账号（verify-deploy.sh 用） |
| `VERIFY_PASSWORD` | 否 | `***` | 验收自检登录密码（verify-deploy.sh 用） |
