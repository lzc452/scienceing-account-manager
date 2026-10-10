# deploy-cloud —— 云服务器部署制品

腾讯云轻量服务器（134.175.156.233 / 2C2G / Ubuntu）的单机 Docker 部署制品。
完整设计与决策依据见 [../docs/cloud-deploy-design.md](../docs/cloud-deploy-design.md)。

**访问方式：路线 B —— 公网 IP + Let's Encrypt IP 证书**，不需要域名，不需要 ICP 备案。

---

## 已确定的参数

| 参数 | 值 | 说明 |
|---|---|---|
| 公网 IP | `134.175.156.233` | 证书、CORS、扩展全部绑定它 |
| 容器内网段 | `172.28.0.0/16` | 与 `.env` 的 `TRUST_PROXY` 必须一致 |
| 扩展 ID | 以发布包 `release.json` 为准 | 必须复用原扩展私钥，并与服务器白名单一致 |
| 部署根目录 | `/opt/scienceing` | 可用 `DEPLOY_ROOT` 覆盖 |
| 证书路径 | `certs/live/134.175.156.233/` | IP 证书，6 天有效期 |

---

## 目录结构

```text
deploy-cloud/
├── Dockerfile                      生产镜像（Playwright 基础镜像，零安装零编译）
├── docker-compose.yml              两段网络编排，app 不发布端口
├── .env.example                    配置模板（含每项的「为什么」）
├── nginx/
│   ├── templates/dashboard.conf.template   nginx 官方镜像用 envsubst 生成站点配置
│   └── snippets/security-headers.conf      安全头 snippet（规避 add_header 不继承）
└── scripts/
    ├── patch-extension.mjs         开发机执行：扩展域名替换 + 固定 ID + 打包
    ├── harden-host.sh              服务器执行：SSH/ufw/swap/Docker 日志/自动补丁
    ├── issue-cert.sh               服务器执行：首次签发证书
    ├── renew-cert.sh               服务器执行：证书续期（由 cron 调用）
    ├── install-cron.sh             服务器执行：一键装好续期与备份两条 cron（幂等）
    ├── verify-deploy.sh            服务器执行：部署验收自检（9 组检查）
    ├── backup-offsite.sh           服务器执行：快照 + 校验 + 异地同步
    ├── operations.sh              共享版本校验、维护锁和 HTTPS 验证
    ├── restore.sh                 停服、恢复配对快照与旧版、校验、启动、验证
    └── deploy.sh                   服务器执行：发布与回滚
```

---

## 服务器侧目录约定

```text
/opt/scienceing/
├── docker-compose.yml
├── .env                ← 权限 600
├── release/            ← 同一 Tag 的代码、deploy-cloud/Dockerfile 和运维配置
│   └── apps/web/dist/downloads/scienceing-extension.zip
├── nginx/{templates,snippets}/
├── certs/              ← Let's Encrypt 证书
├── scripts/
├── current.json        ← 当前版本指针（deploy.sh 维护）
├── current.env         ← 上次成功部署的配置，权限 600，不同步/提交
├── rollback.json       ← 上次成功发布前的快照、代码和运维配置配对记录
└── deployment.pending.json ← 失败记录；存在时禁止继续发布
```

---

## 执行顺序

### A. 开发机

```powershell
# 私钥保存在仓库和发布输出目录外，首次生成后持续复用并离线备份。
# 已有扩展必须指定原私钥；切勿生成新身份替换旧身份。
.\make-release.ps1 -CloudHost 134.175.156.233 -ExtensionKeyPath D:\scienceing-secrets\extension-key.pem
# 对已有 Tag 重新构建到新的空输出目录：
.\create-release.ps1 -Tag vX.Y.Z -CloudHost 134.175.156.233 -ExtensionKeyPath D:\scienceing-secrets\extension-key.pem -OutputDirectory D:\scienceing-releases
```

扩展直接从该 Tag 的快照打包。ZIP 内只包含公钥、固定 ID 和地址；最终 Release 同时包含云端 Dockerfile、脚本与 Nginx 配置。上传 Release ZIP **和同名 `.sha256` 文件**。镜像固定为 Playwright `v1.62.1-noble`；构建实际运行 SQLite Backup API 和 Chromium 检查，失败不会停旧服务。服务器须有 Docker Compose、Python 3、curl、unzip 和 flock。

### B. 腾讯云控制台（我无法代劳）

- [ ] 防火墙只保留 **22 / 80 / 443**，**显式删除 3389 与 3000**
- [ ] 确认实例计费与到期情况（走路线 B 不需要备案，但到期仍会丢数据）

### C. 服务器

```bash
# 0. 上传 SSH 公钥（harden-host.sh 的前置条件，没有公钥它会拒绝执行）
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@134.175.156.233

# 1. 主机加固
sudo bash harden-host.sh --ssh-port 22022 --admin-ip <你的固定出口IP>

# 2. 准备部署目录并上传制品
mkdir -p /opt/scienceing && cd /opt/scienceing
# 首次上传该 Tag 的 deploy-cloud/ 脚本/配置、Release ZIP 和同名 .sha256
cp .env.example .env && vi .env && chmod 600 .env

# 3. 签发证书（会自动停 gateway 让出 80 端口）
bash scripts/issue-cert.sh

# 4. 首次全新空数据卷部署；已有业务库禁止此参数
bash scripts/deploy.sh /tmp/scienceing-vX.Y.Z.zip --initialize

# 5. 一键装好 cron（幂等，重复执行不会产生重复条目）
sudo bash scripts/install-cron.sh

# 6. 验收自检
bash scripts/verify-deploy.sh
```

后续升级使用 `bash scripts/deploy.sh /tmp/scienceing-vX.Y.Z.zip`，缺库直接失败，已有库不会 seed。已有无迁移登记的库，先在部署机只读检查：`source scripts/operations.sh; export RELEASE_TAG=$(current_tag); compose run --rm --no-deps -T app node /app/apps/server/dist/db/schema.js inspect --output /backups/prod-schema.json`。只传递结构报告，核对匹配版本后显式 `--baseline N`；不向开发机传业务库。

发布顺序是候选镜像构建 → 阻断访问并停服 → Backup API 本地快照 → 迁移 → 完整性/外键/版本/密钥校验 → 只读维护启动与 HTTPS/ZIP 验收 → 启用写入 → 更新指针。已有库不能跳过备份。部署快照在 `/backups/deployments/`，不受每日备份清理影响；旧制品、运维配置和镜像必须与快照一起保留。

每次成功部署保存私有 `current.env`，下次升级把它与旧版本配对保留，恢复时同时恢复配置。首次接入尚无 `current.env` 的旧部署，应先确认 `.env` 与当前运行版本一致；若要调整配置，先将当前有效 `.env` 以权限 600 保存为 `current.env`，再编辑发布配置。

启用写入前的失败会停候选应用，恢复配对快照与旧版，再校验、启动和验证；停止或恢复失败保持停机。启用写入后失败只停机并保留当前库，避免丢掉新增业务。人工确认回退影响后使用 `bash scripts/restore.sh --pending`（失败发布）或 `bash scripts/restore.sh --previous`（上次成功发布前）。两者都遵循“停服 → 恢复 → 校验 → 启动匹配版本 → HTTPS 验证”，失败库及 WAL/SHM 会留存。禁止运行中替换数据库，禁止 `docker compose down -v` 或 volume prune。

`install-cron.sh` 装两条：

```text
17 3 * * *  renew-cert.sh     >> /var/log/scienceing-cert.log 2>&1   # scienceing-managed
30 3 * * *  backup-offsite.sh >> /var/log/scienceing-backup.log 2>&1 # scienceing-managed
```

装完会立刻跑一次 `renew-cert.sh` 验证链路（未到阈值时会直接跳过，属正常）。

`verify-deploy.sh` 覆盖 9 组检查：HTTP 跳转、ACME 路径未被拦截、五个安全头、证书有效期与剩余天数、3000 端口隔离、接口可用性、扩展包可下载、Cookie Secure、容器状态、cron 已配置。失败项会逐条列出并以退出码 1 结束，可直接接监控。

---

## 必须在服务器上手工完成的事项

以下是脚本无法代劳、需要人工提供的输入：

| # | 事项 | 为什么 |
|---|---|---|
| 1 | **上传 SSH 公钥** | `harden-host.sh` 会先检查公钥存在，没有就直接中止——避免关掉密码登录后把自己锁在门外 |
| 2 | **生成并离线备份 `SCIENCEING_MASTER_KEY`** | `openssl rand -hex 32`。丢失后已入库的科应账号密码**永久无法解密** |
| 3 | **提供生产专用的 `SCIENCING_ADMIN_PASSWORD`** | 邮箱固定为 `lishenggao@highpowertech.com`（科应后台只有一个管理员账号）。**密码必须与开发/测试环境不同**，该值只走服务器 `.env`，绝不入库/入镜像/Git |
| 4 | **备份外部扩展私钥** | 它决定扩展 ID。使用原私钥并放在仓库、发布目录外；丢失后身份改变 |
| 5 | **配置 rclone remote**（异地备份） | `rclone config` 新建 S3 兼容 remote，endpoint 用 `https://cos.<region>.myqcloud.com` |
| 6 | **控制台防火墙收口** | ufw 只管主机内，控制台防火墙是另一层，脚本管不到 |

---

## 需要特别留意的三个坑

### 1. 证书只有 6 天有效期

IP 证书是 Let's Encrypt 的硬性要求（`shortlived` profile，160 小时）。**cron 必须在签发当天配好**，一旦停摆 6 天内 HTTPS 就会失效。`issue-cert.sh` 成功后会直接把 crontab 行打印出来。

验证续期链路：手动跑一次 `bash scripts/renew-cert.sh`，确认退出码为 0。

### 2. 扩展 ID 是 CORS 收敛的前置条件

unpacked 扩展的 ID 原本由扩展目录的**绝对路径**派生，每人解压路径不同 ID 就不同，无法按 ID 收敛来源。`patch-extension.mjs` 通过往 `manifest.json` 注入 `key`（RSA 公钥）把 ID 固定下来。

`.env` 里这两行必须同时包含 IP 来源与扩展来源，**缺一个扩展就会被 CORS 拦死**：

```env
CORS_ORIGINS=https://134.175.156.233,chrome-extension://opockgnmgpgocghdfanhlfcpkaahodga
SCIENCEING_EXTENSION_IDS=opockgnmgpgocghdfanhlfcpkaahodga
```

### 3. TRUST_PROXY 不配会让限流失效

`main.ts` 用 Express 的 trust proxy 还原真实客户端 IP。容器化后 nginx 在 Docker 网桥而非回环，若不设 `TRUST_PROXY=172.28.0.0/16`，所有用户会被识别成同一个来源，**任意一人输错 10 次密码就会把全团队锁 15 分钟**。

验收方法：用两个不同外网出口各失败 10 次，确认只有对应来源被限、另一个不受影响。

---

## 将来切回域名（路线 A）

前置条件：实例续费到**购买时长 ≥ 90 天**（ICP 备案硬性要求）→ 注册境内域名 → 实名认证 → 首次备案（1–3 周）。

切换步骤：

```bash
# 1. 改 .env
DASHBOARD_HOST=dashboard.example.com
CORS_ORIGINS=https://dashboard.example.com,chrome-extension://opockgnmgpgocghdfanhlfcpkaahodga

# 2. 重新签证书（脚本自动识别为域名形态，签发 90 天证书）
bash scripts/issue-cert.sh

# 3. 开发机重打扩展并重新发版
# Windows 开发机：复用原私钥生成新 Tag 的发布包
# .\make-release.ps1 -CloudHost dashboard.example.com -ExtensionKeyPath D:\scienceing-secrets\extension-key.pem
```

**扩展 ID 不会变**（由 `key` 固定），所以不需要重新做来源收敛，只是重打包 + 通知同事重装扩展。nginx 模板、compose、其余脚本均无需改动。

## 本地验收

在 Windows 开发机执行（全部使用合成数据或临时旧库，不连接生产）：

```powershell
pnpm build:shared
pnpm --filter @scienceing/server build
pnpm --filter @scienceing/web build
pnpm --filter @scienceing/server test
pnpm --filter @scienceing/server test:e2e
pnpm typecheck
pnpm test:deploy-sqlite
pnpm test:deploy-cloud
pnpm test:release-cloud
pnpm test:password-visibility
```

云端控制流测试需要 Git Bash 和 Python 3；Docker、curl 和外部服务均用命令替身，数据库仍用真实 SQLite CLI。临时测试入口把重试缩短为 2 次，生产脚本仍为 30 次。发布测试只在一次性临时 Git 仓库创建合成 Tag，不提交或推送当前项目；浏览器测试在 Windows 使用隔离 Edge（其他平台使用已安装 Playwright Chromium）。容器实际验收须在有 Docker 引擎的环境构建发布包，镜像中的 `check-runtime.mjs` 会检查 Backup API 与 Chromium。
