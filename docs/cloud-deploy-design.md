# 云服务器部署方案设计

> 目标：把 scienceing-account-manager 部署到腾讯云轻量应用服务器，**完整关闭**
> `docs/cloud-deploy-readiness.md` 中识别出的 P0/P1/P2 全部问题。
> 实例到期问题（原 P0-1）按用户要求不在本方案范围内。
>
> 评估基线：2 核 / 2 GB / 50 GB SSD / 4 Mbps，Docker CE 镜像，Ubuntu 22.04 假设。

---

## 一、设计目标、约束与访问方式决策

| 约束 | 说明 |
|---|---|
| 架构不变 | 仍是单机、单实例、SQLite、不拆微服务（PRD §55）。不引入 Redis / 消息队列 / K8s。 |
| 制品链路不变 | 仍是「开发机构建 Release → 生产机只消费制品」。**不在 2C2G 服务器上跑 pnpm install / tsc / vite。** |
| 不破坏开发链路 | 所有改动必须让 `pnpm dev` 与 Windows/LAN 部署继续可用。 |
| 内存不越界 | 峰值控制在 1.6 GB 以内，给宿主机留出余量。 |
| 可回滚 | 任何一步失败都能回到上一版，且数据不丢。 |

### 1.1 访问方式：先走 IP + IP 证书（路线 B）

这是本方案唯一一个「外部依赖驱动」的决策，必须放在最前面说明。

**约束来自 ICP 备案。** 腾讯云官方文档明确：使用中国内地地域的轻量应用服务器**开办网站并绑定域名服务时，必须先办理 ICP 备案**，取得备案号后才能开通域名访问。这是法规要求（国务院令第292号），不是云厂商的限制。

而备案有硬性前置条件，本项目当前一条都不满足：

| 备案要求 | 当前状态 |
|---|---|
| 包年包月，购买时长 ≥ 90 天 | 包月，仅 1 个月 ❌ |
| 备案期间实例剩余时长 ≥ 30 天 | 剩余 5 天 ❌ |
| 域名在境内注册商 + 已实名认证 + 主体信息一致 | 尚无域名 ❌ |

叠加首次备案 1–3 周的管局审核周期，走域名路线意味着 2–4 周的外部等待。

**绕开的方式是 Let's Encrypt 的 IP 地址证书**，它已于 2026-01-15 正式 GA：

- 裸 IP 可以拿到浏览器信任的证书，**不需要域名，也不需要备案**；
- 硬性要求：必须是 `shortlived` profile，**有效期仅 160 小时（约 6.7 天）**；
- 需要 Certbot ≥ 5.4（`--ip-address` + webroot 支持）与 ≥ 4.0（`--preferred-profile`）；本方案固定使用 v5.8.0；
- Certbot 目前**只支持签发 IP 证书，不支持自动装进 web server**，需手动配置 nginx 证书路径并用 `--deploy-hook` 通知重载。

**取舍**：代价是 6 天有效期带来的续期频率（每天一次 cron），以及用户需要记 IP 地址。收益是省掉 2–4 周的备案等待，且仍然拥有真实受信任的 HTTPS 而非自签证书。对 10 人规模的内部工具，这个取舍是划算的。

**切回域名路线的成本是受控的**：`DASHBOARD_HOST` 从 IP 改成域名，重跑 `issue-cert.sh` 与 `patch-extension.mjs` 即可。扩展 ID **不受影响**（已由 `key` 固定），所以不需要重新做来源收敛，只是重打包 + 通知同事重装扩展。nginx 模板、compose、其余脚本均无需改动。

**HSTS 在 IP 形态下是空转的**：HSTS 规范只作用于域名，浏览器会忽略 IP 字面量响应中的该头。保留它是为了将来切域名后自动生效，且对 IP 访问无副作用。IP 形态下真正起作用的强制跳转是 80 端口的 301。

---

## 二、目标架构

```text
                        公网
                         │
        ┌────────────────┴────────────────┐
        │  腾讯云控制台防火墙（第一层）      │  仅 22 / 80 / 443
        └────────────────┬────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │  ufw（第二层，主机内）            │  仅 22 / 80 / 443
        └────────────────┬────────────────┘
                         │
╔════════════════════════▼════════════════════════════════════╗
║  轻量服务器  134.175.156.233                                ║
║                                                             ║
║  ┌──────────────── edge 网络 ────────────────┐              ║
║  │  gateway (nginx:1.27-alpine)              │              ║
║  │   :80  → ACME 校验 + 301                  │              ║
║  │   :443 → TLS 终止 + 安全头 + 静态资源      │              ║
║  │   /api/ → app:3000（internal 网络）        │              ║
║  └───────────────────┬───────────────────────┘              ║
║                      │ internal 172.28.0.0/16              ║
║  ┌───────────────────▼───────────────────────┐              ║
║  │  app (scienceing/app, 非 root)            │              ║
║  │    NestJS :3000  ← 不发布任何端口          │              ║
║  │    ├── SQLite  /data/scienceing.prod.db   │              ║
║  │    ├── 备份    /backups                    │              ║
║  │    └── Worker  → Chromium（子进程）        │              ║
║  └───────────────────┬───────────────────────┘              ║
║                      │ 出网                                 ║
║                      ▼                                      ║
║              scienceing.com（改密自动化）                     ║
║                                                             ║
║  数据卷：db-data / backup-data / downloads / worker-state     ║
║  证书：certs/（Let's Encrypt，certbot 容器按需 run）           ║
╚═════════════════════════════════════════════════════════════╝
                         │
                         ▼ 每日 rclone
              对象存储（异地备份 + latest.db）
```

关键结构决策：

1. **两段网络。** `edge` 只接 gateway，`internal` 接 app 与 gateway。app **不 publish 任何端口**，从物理上消灭「后端直连公网」这一类问题，而不是靠配置纪律去维持。
2. **单容器装后端与 Worker。** Worker 由后端 `spawn(process.execPath, [cli])` 拉起为子进程（`worker-client.ts:142`），拆容器会让它找不到 CLI，也会让 Chromium 与 Node 的 IPC 复杂化。用 Playwright 官方镜像作基础，Chromium 与系统依赖一次到位。
3. **gateway 直接托管前端静态资源。** 通过 bind mount `release/apps/web/dist` 进 nginx，不额外做镜像层，也不用后端托管静态文件。
4. **证书用 certbot 容器按需签发/续期**，不用常驻容器，续期由宿主机 cron 驱动，出问题好排查。

---

## 三、问题 → 设计决策映射

### P0 级

| 编号 | 问题 | 设计决策 | 落地位置 |
|---|---|---|---|
| P0-2a | 全链路无 TLS，凭据明文过公网 | nginx 443 终止 TLS，80 仅保留 ACME 与 301；Let's Encrypt 证书经 certbot 容器签发；启用 HSTS | `nginx/templates/dashboard.conf.template` |
| P0-2b | 安全头可能丢失 | 安全头抽成 snippet，凡自带 `add_header` 的 location 全部 include（规避 nginx `add_header` 不继承的坑） | `nginx/snippets/security-headers.conf` |
| P0-2c | 会话 Cookie 无 Secure | nginx 注入 `X-Forwarded-Proto $scheme`，后端 `isSecureRequest()` 据此置位 `Secure` | 同上，`proxy_set_header` |
| P0-2d | CORS 放行任意 `chrome-extension://` | 配置 `CORS_ORIGINS` 显式收敛；同时**固定扩展 ID** 才能收敛（见 4.3） | `.env` + `scripts/patch-extension.mjs` |
| P0-3 | 3000 端口直连公网 | app 服务不写 `ports`，仅挂 `internal` 网络；网关经服务名 `app:3000` 访问 | `docker-compose.yml` |
| P0-4a | 备份只存本机盘 | 每日 SQLite Backup API 一致性快照 → rclone 同步到对象存储 → 异地保留 30 天 | `scripts/backup-offsite.sh` |
| P0-4b | Master Key 仅存服务器 | 密钥写入 `.env`（600 权限）+ 离线备份到密码管理器；部署清单强制核对 | `.env.example` + 检查清单 |

### P1 级

| 编号 | 问题 | 设计决策 | 落地位置 |
|---|---|---|---|
| P1-1 | SSH 默认密码登录 | 公钥登录 + 禁密码 + 禁 root 直登 + fail2ban。**脚本先校验存在公钥，否则直接中止**，杜绝把自己锁在门外 | `scripts/harden-host.sh` |
| P1-2 | 防火墙需人工核对 | ufw 只放行 22/80/443；脚本显式提示控制台防火墙是另一层、ufw 管不到 | 同上 |
| P1-3 | 容器以 root 运行 | 镜像 `USER pwuser`；不挂 docker socket；数据卷按最小权限 | `Dockerfile` |
| P1-4 | 扩展域名是 localhost 占位 | 打包脚本替换为正式 HTTPS 域名并重打 zip | `scripts/patch-extension.mjs` |
| P1-5 | `.env` 含真实凭据 | `.env` 不进镜像（build context 是 `release/`，本身已排除 `.env`）；权限 600 | `Dockerfile` + `docker-compose.yml` |

### P2 级

| 编号 | 问题 | 设计决策 |
|---|---|---|
| P2-1 | 无监控告警 | 容器 `healthcheck` + `restart: unless-stopped`；建议接入云监控告警（磁盘 > 80%、容器退出） |
| P2-2 | Docker 日志无上限 | `daemon.json` 全局 `max-size=10m / max-file=3`，compose 内再声明一次 |
| P2-3 | SQLite WAL 与磁盘水位 | 50 GB 充裕；异地备份同时起到水位兜底 |
| P2-4 | compose 缺 Worker 服务 | 本方案改为**单容器含 Worker**，从设计上消除该缺口 |
| P2-5 | 限流器为进程内 Map | 单实例部署下可接受，不做改动（见第六节「明确不做的事」） |
| P2-6 | 2 GB 内存偏紧 | 2 GB swap + 容器内存上限 1500M + `shm_size: 512m` |

---

## 四、关键设计决策详解

### 4.1 真实客户端 IP 与限流（**已修改源码**）

这是容器化引入的**新增缺陷**，不处理会比现在更糟。

`apps/server/src/main.ts` 原本是：

```ts
app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');
```

Windows/LAN 形态下 nginx 跑在同一台机器的回环地址上，`'loopback'` 是对的。但容器化后 nginx 位于 Docker 网桥（`172.28.0.x`），**不是回环**，Express 不会采信 `X-Forwarded-For`，于是：

- `req.ip` 变成 nginx 容器的 IP；
- `clientKey()`（`main.ts:42`）对所有用户返回同一个键；
- 登录限流是「15 分钟内 10 次失败」（`main.ts:13`）→ **任意一个人输错 10 次密码，全团队被锁 15 分钟**；
- 审计日志丢失真实来源 IP。

**修改方案**（保持默认值不变，开发与 LAN 形态零影响）——**已实施**：

```diff
-  // 反代（vite dev / 生产网关/nginx）位于回环地址：仅信任回环来源的 X-Forwarded-For，
-  // 使 req.ip 反映真实客户端地址；非回环直接访问时伪造头不会被采纳（安全）。
-  app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');
+  // 反代来源白名单。默认仅回环，对应开发（vite dev）与 Windows/LAN 单机部署形态。
+  //
+  // 容器化部署下 nginx 位于 Docker 网桥（如 172.28.0.0/16）而非回环，必须用
+  // TRUST_PROXY 显式配置该子网，否则 Express 不采信 X-Forwarded-For：
+  //   - req.ip 退化为 nginx 容器 IP，clientKey() 对所有用户返回同一个键，
+  //     而登录限流是「15 分钟内 10 次失败」——任意一人输错 10 次密码，
+  //     全团队会被锁 15 分钟（可用性事故）；
+  //   - 审计日志丢失真实来源 IP。
+  // 只信任显式配置的子网，公网直连时伪造的 X-Forwarded-For 依旧不被采纳。
+  const trustProxy = process.env.TRUST_PROXY?.trim() || 'loopback';
+  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
```

配套：`.env` 的 `TRUST_PROXY=172.28.0.0/16`，必须与 compose 的 `internal` 子网严格一致。

验收方法：用两个不同外网出口各失败 10 次登录，确认只有对应来源被限、另一个不受影响。这是唯一能确认该配置真正生效的方式。

### 4.2 TLS 与 Cookie 安全

后端 `isSecureRequest()`（`auth.controller.ts:23-28`）已经同时看 `req.secure` 与 `x-forwarded-proto`，所以**只要 nginx 注入该头，Cookie 的 `Secure` 就会正确置位**，无需改代码。

因此 nginx 的 `/api/` location 里这一行是硬性要求：

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```

漏掉它，TLS 就只是「传输加密」，Cookie 仍会在明文场景下发出去 —— 半吊子防护。

CSP 需要为 Vue + Tailwind 放开 `style-src 'unsafe-inline'`（运行时注入内联样式），为手册内联插图放开 `img-src data:`。其余全部锁死到同源。

**不配 OCSP stapling。** Let's Encrypt 已于 2025-08-06 关停 OCSP 服务，其签发的证书不再包含 OCSP URL，开启 `ssl_stapling` 只会让 nginx 持续报 "no OCSP responder" 告警而不产生任何实际效果，故模板中显式不启用。

**证书引导死锁。** 首次部署有个先有鸡还是先有蛋的问题：nginx 的 443 站点引用证书文件，证书不存在 nginx 就起不来；而 ACME 的 HTTP-01 校验又需要 80 端口可达。`issue-cert.sh` 的处理方式是：先停掉 gateway 让出 80 端口，用 certbot 的 `--standalone` 模式签发，再拉起 gateway。首次签发时服务本就还没上线，这个「停机」不产生实际影响。

**续期沿用 standalone，需要短暂停机。** 因为首次签发用的是 standalone，certbot 记录的 authenticator 就是 standalone，续期同样需要占用 80 端口，所以 `renew-cert.sh` 会短暂停一下 gateway（约 5–10 秒）。没有改用 webroot 的理由是：webroot 需要依赖 certbot 在 `renew` 时接受 authenticator 覆盖，行为不够确定，而对 6 天有效期的 IP 证书来说，**一旦续期静默失败，6 天内服务就会断**——这个失败模式比几秒钟的停机严重得多。

`renew-cert.sh` 因此做了两件防御：

1. **阈值前置判断**：先用 `openssl -checkend` 看剩余有效期，未到阈值（IP 形态 3 天、域名形态 30 天）直接退出，避免每天都白停一次 gateway；
2. **结果复核不看退出码**：续期后重新读证书实际到期时间。若仍未更新，再区分「certbot 判定尚未到续期点」（正常）与「真的失败」（退出码 2 触发告警）。

---

### 4.2.1 IP 证书形态的运维要求

| 项 | 要求 |
|---|---|
| 签发命令 | `certbot certonly --standalone --preferred-profile shortlived --ip-address <IP>` |
| 有效期 | 160 小时（约 6.7 天），Let's Encrypt 对 IP 证书的硬性要求 |
| Certbot 版本 | ≥ 5.4（`--ip-address` + webroot 支持）；本方案固定镜像 `certbot/certbot:v5.8.0`，脚本内另有版本守卫，版本不足直接报错而非签出坏证书 |
| 续期频率 | 每天一次（`17 3 * * *`） |
| 监控 | 证书剩余 < 3 天仍未续期成功时脚本退出码为 2，需接入告警 |
| 失败后果 | cron 停摆 → 6 天内 HTTPS 失效 → 用户被浏览器证书错误挡住 |

**cron 必须与签发同一天配好**，`issue-cert.sh` 在成功后会直接把 crontab 行打印出来提醒。

### 4.3 扩展 ID 固定（**这是 CORS 收敛的前置条件**）

`main.ts:27-39` 的默认 CORS 白名单是 `/^chrome-extension:\/\/[a-p]{32}$/` —— **放行任意扩展 ID**。要收敛就必须知道确定的 ID。

但 unpacked 扩展的 ID 由**扩展目录的绝对路径**派生：每个同事解压到不同目录，ID 就不同。直接按 ID 收敛会把所有人挡在门外。

解法是在 `manifest.json` 注入 `key`（RSA 公钥），此后 ID 由公钥决定、与路径无关。`deploy-cloud/scripts/patch-extension.mjs` 做的事：

1. 首次运行生成 RSA-2048 密钥对，私钥落 外部扩展私钥（仓库及发布目录之外）（已被 `.gitignore` 的 `*.pem` 覆盖），后续复用；
2. 把公钥 DER 的 base64 写入 `manifest.json.key`；
3. 按 Chrome 规则算出稳定 ID：`SHA-256(公钥DER)` 前 16 字节，每个 nibble 映射到 `a`..`p`；
4. 替换 `DASHBOARD_ORIGINS` / `DASHBOARD_URL` / `DASHBOARD_MY_URL` / `API_BASE` 为 `https://<域名>`，并在 `host_permissions` 与看板 `content_scripts.matches` 中追加域名；
5. 跑既有 `apps/extension/scripts/validate.mjs` 做最小权限审计；
6. 输出 zip 与 `extension.json` 到 `apps/web/dist/downloads/`，并打印需要写进 `.env` 的两行。

**易踩的坑：`CORS_ORIGINS` 一旦非空就会整体替换默认白名单**，替换后必须把扩展来源补回去，否则扩展的 service worker 会被 CORS 拦死：

```env
CORS_ORIGINS=https://dashboard.example.com,chrome-extension://<32位ID>
```

### 4.4 Worker 与 Chromium

代码里已经写好了容器化所需的一切，**无需改动**：

- `cli.ts:95` / `worker.ts:52`：`args: ['--no-sandbox', '--disable-dev-shm-usage']`
- `config.ts:106-113`：浏览器通道由 `SCIENCING_BROWSER_CHANNEL` 控制，接受 `chromium`

所以只需在 `.env` 里设 `SCIENCING_BROWSER_CHANNEL=chromium`，配合 Playwright 官方基础镜像自带的 Chromium，就不必装 Google Chrome、也不必折腾 apt 依赖。

`SCIENCING_WORKER_CLI` 在 `worker-client.ts:82-87` 是相对 `repoRoot` 解析的，容器内 `repoRoot = /app`，故设为 `/app/playwright/worker/dist/cli.js`。

### 4.5 密钥与配置

- `.env` 落在 `/opt/scienceing/.env`，权限 600，属主 root。
- Docker build context 是 `release/` 而非仓库根，而 Release 打包时已拒绝 `.env` / 数据库 / 密钥（`DEPLOYMENT.md` §1），因此 `.env` 不可能进入镜像层。
- `SCIENCEING_MASTER_KEY` 必须离线备份：它是 AES-256-GCM 主密钥，丢失后已入库的科应账号密码**永久不可解密**（`master-key.ts` 对生产环境缺失直接抛错，行为正确，保持不变）。

**脚本一律不 `source .env`。** 所有运维脚本改用 `env_get()` 按需提取单个键：

```bash
env_get() { sed -n "s/^$1=//p" .env | head -1 | tr -d '\r'; }
```

原因：`source` 会对值做变量展开与命令替换。实测 `SCIENCING_ADMIN_PASSWORD=abc$def\`whoami\`` 在 source 后变成 `abc<当前用户名>` —— 口令被静默改写，且反引号里的命令**被真实执行**。生产 `.env` 里存的正是管理员口令这类任意字符，用 sed 提取则原样读取、不解析。

### 4.6 备份与容灾

两道防线：

1. **应用内**（已存在，不改）：每日 02:00 SQLite Backup API 一致性快照到 `/backups`，保留 30 天；启动时若最近备份超 24 小时会先补备份。
2. **异地**（新增）：`backup-offsite.sh` 在 03:30 再打一次快照、校验完整性与外键、rclone 同步到对象存储，并维护一份固定名 `latest.db` 便于快速定位。异地保留 30 天、本地 offsite 快照保留 7 天。

为什么再打一次快照而不是直接同步 `/backups`：同步前做一次「能打开 + 完整性与外键 + 账号数可读」的校验，避免把空壳文件当成备份同步到异地。

### 4.7 发布流程

沿用「开发机构建、生产机消费制品」的原则，替换掉 Windows 专属的传输与托管方式：

```text
Windows：make-release.ps1 -CloudHost <站点> -ExtensionKeyPath <外部原私钥>
  → 同一 Tag 快照构建代码、扩展、Dockerfile、Nginx 和运维脚本
  → ZIP + SHA256 上传（不传数据库或私钥）
Linux：deploy.sh <ZIP>（首次空卷才加 --initialize）
  → 制品核验/候选镜像构建（Backup API + Chromium 自检）
  → 阻断访问/停旧应用并确认/本地 Backup API 快照
  → 迁移/完整性、外键、版本、密钥校验
  → 只读维护启动/HTTPS 200 + JSON + 实际 ZIP 摘要验收
  → 启用写入/更新 current.json + rollback.json
失败：启用写入前恢复配对数据、代码、镜像与配置后验证；之后仅停机保留当前库。
人工恢复：restore.sh --previous 或 --pending；先停服、恢复、校验，再匹配版本启动、验证。
```

健康检查用 `GET /api/extension/config` —— 该端点在 `extension.controller.ts:64` 没有 `AuthGuard`，是现成的公开探针，不必为健康检查新开接口、扩大攻击面。

---

## 五、交付物清单

| 文件 | 作用 |
|---|---|
| `deploy-cloud/Dockerfile` | 生产镜像：Playwright 基础镜像 + 非 root + 健康检查，零安装零编译 |
| `deploy-cloud/docker-compose.yml` | 两段网络、app 不发布端口、资源与日志上限、按需 certbot |
| `deploy-cloud/nginx/templates/dashboard.conf.template` | 443 站点、TLS 参数、安全头、`X-Forwarded-Proto` |
| `deploy-cloud/nginx/snippets/security-headers.conf` | 安全头 snippet（规避 add_header 不继承） |
| `deploy-cloud/.env.example` | 完整配置模板，含每一项的「为什么」 |
| `deploy-cloud/scripts/patch-extension.mjs` | 扩展域名替换 + 固定 ID + 校验 + 打包（已试跑通过） |
| `deploy-cloud/scripts/harden-host.sh` | SSH / ufw / swap / Docker 日志 / 自动补丁 |
| `deploy-cloud/scripts/backup-offsite.sh` | 一致性快照 + 校验 + 异地同步 + 保留策略 |
| `deploy-cloud/scripts/issue-cert.sh` | 首次签发证书（自动识别 IP / 域名形态，含 Certbot 版本守卫） |
| `deploy-cloud/scripts/renew-cert.sh` | 证书续期 + 形态自适应告警阈值（IP 3 天 / 域名 30 天） |
| `deploy-cloud/scripts/install-cron.sh` | 一键安装续期与备份两条 cron（幂等，避免漏配导致 6 天内断服） |
| `deploy-cloud/scripts/verify-deploy.sh` | 部署验收自检（9 组检查，退出码可直接接监控） |
| `deploy-cloud/scripts/deploy.sh` | 云端发布与回滚 |
| `deploy-cloud/README.md` | 操作入口：目录说明、执行顺序、用户侧待办、易踩的坑 |
| 外部扩展私钥（仓库及发布目录之外） | 扩展签名私钥（首次运行 patch-extension.mjs 时生成，**必须离线备份**，已被 gitignore） |
| `docs/cloud-deploy-design.md` | 本文件 |

---

## 六、明确不做的事

| 项 | 决策 | 理由 |
|---|---|---|
| 会话 Cookie 改 `__Host-` 前缀 | **不做** | 代码注释（`auth.controller.ts:20-22`）预留了该改进，但 `__Host-` 强制要求 `Secure`，而开发环境是 HTTP，会导致本地登录态直接失效。需要把 Cookie 名做成「按是否 HTTPS 切换」，`extract-token.ts` 也要同步兼容双名，收益（防子域 Cookie 注入）在单域名部署下很小，不值得引入回归风险。 |
| 限流器改为 Redis / 共享存储 | **不做** | 单实例部署，进程内 Map 够用。跨实例才需要，而 PRD §55 明确不拆。仅记录：进程重启会清零配额。 |
| 引入 Caddy 替代 nginx | **不做** | Caddy 自动证书确实更省事，但项目已有成体系的 nginx 配置与安全头回归测试（`scripts/test/security-headers.test.mjs`），换掉等于让既有测试失去对象。nginx + certbot 的学习成本在这个规模下可接受。 |
| 把 Worker 拆成独立容器 | **不做** | 后端以子进程方式拉起 Worker，拆分需要改 IPC 通道，收益（隔离性）在单租户内网工具里不成立。 |
| 后端托管前端静态资源 | **不做** | 让 nginx 直接托管更省内存、更快，也避免 NestJS 多一层静态中间件。 |

---

## 七、实施规划

### 阶段 0：准备（0.5 天）

| # | 任务 | 验收 |
|---|---|---|
| 0.1 | 确认访问方式：走 IP + IP 证书，**无需域名与备案**（见 1.1） | 无外部等待，可立即开工 |
| 0.2 | 控制台防火墙收口：只留 22/80/443，删除 3389 与 3000 | 控制台防火墙规则截图确认 |
| 0.3 | 上传 SSH 公钥，验证免密登录 | 新开终端可免密登录 |
| 0.4 | 生成 Master Key：`openssl rand -hex 32` | 已存入密码管理器 |
| 0.5 | （可选，不阻塞）如将来要切域名，可并行启动域名注册与 ICP 备案 | 备案需实例时长 ≥ 90 天，需先续费 |

### 阶段 1：主机加固（0.5 天）

```bash
sudo bash harden-host.sh --ssh-port 22022 --admin-ip <你的固定IP>
```

| # | 任务 | 验收 |
|---|---|---|
| 1.1 | SSH 密钥登录 + 禁密码 + fail2ban | `sshd -T \| grep passwordauth` → `no`；`fail2ban-client status sshd` 正常 |
| 1.2 | ufw 只放行 22/80/443 | `ufw status` 符合预期 |
| 1.3 | 2 GB swap | `free -h` 显示 swap 2.0Gi |
| 1.4 | Docker 日志上限 | `docker info \| grep -i log` 或查看 daemon.json |
| 1.5 | **另开终端验证 SSH 仍可登录** | 确认后才关闭原会话 |

### 阶段 2：制品与扩展（0.5 天，在开发机）

| # | 任务 | 验收 |
|---|---|---|
| 2.1 | `make-release.ps1 -CloudHost 134.175.156.233 -ExtensionKeyPath <外部原私钥>` | 同一 Tag 制品中有固定 ID 的 ZIP、元信息和摘要 |
| 2.2 | 把打印的 ID 写入服务器 `.env` 的 `CORS_ORIGINS` 与 `SCIENCEING_EXTENSION_IDS` | 模板中已预填本仓库生成的 ID：`opockgnmgpgocghdfanhlfcpkaahodga` |
| 2.3 | 备份 外部扩展私钥（仓库及发布目录之外） 到密码管理器 | 丢失将导致扩展 ID 变化，全员需重装 |
| 2.4 | `.\make-release.ps1` 生成 Release | 得到 `scienceing-vX.Y.Z.zip`（内含已改造的扩展包） |

### 阶段 3：首次部署（1 天）

| # | 任务 | 验收 |
|---|---|---|
| 3.1 | 服务器建 `/opt/scienceing`，上传 `deploy-cloud/` 内容与 Release zip | 目录结构符合 compose 注释约定 |
| 3.2 | 复制 `.env.example` → `.env`，逐项填写，`chmod 600` | `stat -c %a .env` → `600` |
| 3.3 | 签发证书：`bash scripts/issue-cert.sh` | `certs/live/134.175.156.233/fullchain.pem` 存在；脚本末尾自动验证 `https://134.175.156.233/api/extension/config` 可达 |
| 3.4 | `bash scripts/deploy.sh <zip>` | 健康检查通过，`current.json` 更新 |
| 3.5 | **源码改动**：`main.ts` 的 `TRUST_PROXY` 补丁（本仓库已完成，随 Release 生效） | 见 4.1 diff |
| 3.6 | 一键装 cron：`sudo bash scripts/install-cron.sh` | `crontab -l` 可见 2 条 `# scienceing-managed` 条目；脚本会立刻验证一次续期链路 |
| 3.7 | 自检：`bash scripts/verify-deploy.sh` | 9 组检查全部 PASS，退出码 0 |

### 阶段 4：验证（0.5 天）

阶段 3.7 的 `verify-deploy.sh` 已覆盖下表 4.1–4.6、4.11 的自动部分；其余仍需人工确认。

| # | 验收项 | 方法 |
|---|---|---|
| 4.1 | HTTP 强制跳转 HTTPS | 自检脚本第 1 组（含 ACME 路径未被拦截的检查） |
| 4.2 | 四个安全头齐备 | 自检脚本第 2 组 |
| 4.3 | HSTS 头已下发（IP 形态下浏览器会忽略，仅确认配置正确） | 自检脚本第 2 组 |
| 4.4 | 3000 端口不可达 | 自检脚本第 4 组 |
| 4.5 | Cookie 带 Secure | 自检脚本第 7 组（需在 `.env` 提供可登录凭据，否则 SKIP） |
| 4.6 | **限流按真实 IP 生效** | **人工**：用两个不同外网出口各失败 10 次，确认只有对应来源被限，另一个不受影响 |
| 4.7 | 登录与后台可用 | **人工**：admin 登录 `/admin`，五个页面可访问 |
| 4.8 | 扩展可用 | **人工**：加载扩展 → 看板握手成功 → 领取账号 → 跳转科应 |
| 4.9 | 自动化可用 | **人工**：`/admin/settings` → 「立即检测」三项健康检查通过 |
| 4.10 | 备份可恢复 | 从对象存储拉回 `latest.db`，在临时目录用 `db:verify` 校验 |
| 4.11 | 重启自愈 | `docker compose restart` 后服务自动恢复，再跑一次自检脚本 |
| 4.12 | 证书续期链路可用 | 自检脚本第 9 组确认 cron 已配；另手动跑一次 `renew-cert.sh` 确认退出码为 0 |

### 阶段 5：上线与观察（持续）

| # | 任务 |
|---|---|
| 5.1 | 灰度：先给 2–3 人试用一周，观察内存与 Chromium 是否稳定 |
| 5.2 | 接入云监控告警：磁盘 > 80%、容器退出、备份任务失败、**证书续期脚本退出码非 0** |
| 5.3 | 记录一次完整的改密全流程，确认 Worker 在容器内无异常 |
| 5.4 | 全量通知团队，分发扩展安装教程（地址已变，`docs/install-extension.md` 需同步更新为 IP 地址） |
| 5.5 | 第 2 天与第 5 天各检查一次证书剩余有效期，确认续期 cron 真的在跑 |

### 回滚预案

| 场景 | 动作 |
|---|---|
| 新版启动失败 | 启用写入前恢复配对快照、代码、镜像与配置后验证；停止/恢复失败保持停机，启用写入后只停机保留当前库 |
| 新版运行期出问题 | `RELEASE_TAG=<上一版> docker compose up -d` |
| 数据库迁移出错 | 停服 → 从 `/backups` 取发布前快照 → `docker compose run --rm app node /app/apps/server/dist/db/backup.js` 恢复 |
| 服务器整体故障 | 新机重建 → 拉回对象存储的 `latest.db` 与 `.env`（含 Master Key）→ 重新签证书 |

---

## 八、遗留风险

1. **单点部署。** 服务器故障 = 服务中断。当前规模下可接受，异地备份保证了「数据不丢」但保不了「服务不断」。若后续要求 RTO < 1 小时，需要预置一台冷备机。
2. **2 GB 内存无余量做并发。** Chromium 峰值若超预期，会触发容器内存上限（1500M）导致重启。阶段 5.1 的灰度观察就是为验证这一点。
3. **4 Mbps 出网带宽。** 扩展 zip 约 80 KB、看板资源在 1 MB 量级，10 人规模无压力；但 Playwright 每次改密会真实加载科应后台页面，若出现改密风暴会挤占带宽。当前 Worker 串行，不构成问题。
4. **扩展仍需开发者模式加载。** 这是 PRD §10 的既定选择，不是本方案引入的。若后续要进企业策略托管，需要走 Chrome 企业分发，届时扩展 ID 已固定，可以直接复用。
5. **证书续期依赖 cron 可靠运行，且 IP 证书的容错窗口只有 6 天。** 这是走路线 B 最主要的风险：一旦 cron 停摆或续期静默失败，6 天内 HTTPS 就会失效，所有用户被浏览器证书错误挡住。缓解手段有三层——`renew-cert.sh` 的阈值前置判断避免无谓停机、结果复核不看退出码、剩余不足 3 天时退出码 2 触发告警。**阶段 5.2 的监控告警必须把这一条包含进去，阶段 5.5 的两次人工检查不要跳过。**
6. **访问地址是 IP，IP 变更即全盘失效。** 证书绑定 IP、扩展的 `host_permissions` 与 `API_BASE` 绑定 IP、`CORS_ORIGINS` 绑定 IP。轻量服务器的公网 IP 在实例生命周期内固定，但**一旦销毁重建或更换实例，IP 会变**，届时需要重签证书 + 重打扩展 + 全员重装。这是路线 B 的固有代价，也是将来值得切回域名的主要理由。
7. **ICP 备案是路线 A 的前置门槛。** 若将来要切域名，需先把实例续费到购买时长 ≥ 90 天（备案硬性要求），再走域名注册 → 实名认证 → 首次备案，整体 2–4 周。建议在有切换意向时**立刻并行启动**，不要等到需要了才开始。
