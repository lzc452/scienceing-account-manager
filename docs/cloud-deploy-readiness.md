# 腾讯云轻量服务器部署可行性评估

> 评估日期：2026-09-29
> 目标实例：Docker CE-hqX9 / lhins-kjsnc8ht / 134.175.156.233（广州 ap-guangzhou-6）
> 规格：2 核 / 2 GB / 50 GB SSD / 4 Mbps 出网
> 被评估项目：scienceing-account-manager（NestJS + SQLite + Playwright Worker 单机三件套）

> **状态更新（2026-09-29）**：本报告识别出的 P0/P1/P2 问题已在
> [cloud-deploy-design.md](cloud-deploy-design.md) 中给出完整解决方案与实施规划，
> 对应制品位于 `deploy-cloud/`。访问方式已确定为**路线 B：公网 IP + Let's Encrypt IP 证书**
> （无需域名、无需 ICP 备案）。本报告保留作为问题清单与评估依据。

## 结论

**资源层面可行，安全层面当前状态不可上公网。**

本项目 PRD §55 明确「单机部署、并发极低、不拆微服务、不上 Redis/Kafka」，2C2G 的规格与设计目标匹配，内存有约 1 GB 余量。但现有部署链路是**Windows + 局域网 + SMB + PowerShell**，直接搬到公网 Linux 服务器会同时暴露 4 个 P0 级问题，其中「实例 5 天后到期」是必须先处理的时间炸弹。

**放行条件：4 个 P0 全部关闭后可以部署；P1 建议在同一次窗口内一并处理。**

---

## 一、资源可行性

| 维度 | 需求 | 供给 | 判定 |
|---|---|---|---|
| CPU | 低并发、Worker 串行 | 2 核 | 充足 |
| 内存 | 约 1.0 GB 峰值 | 2 GB | 够用，建议配 2 GB swap |
| 磁盘 | 应用 + Chromium 镜像约 2–3 GB，库 < 1 GB | 50 GB SSD | 充足 |
| 带宽 | 看板静态资源 + 扩展 zip + Worker 出网 | 4 Mbps 出网 | 小团队够用 |
| 并发 | 设计上并发极低 | 单机 | 匹配 |

内存预算（估算）：系统 + Docker 守护进程约 350 MB，Chromium Worker 峰值约 400 MB，NestJS 后端约 180 MB，nginx + SQLite 约 50 MB，合计约 1.0 GB，余量约 1 GB。

注意事项：

- Worker 是后端通过 `spawn(process.execPath, [cli, ...])` 拉起的**子进程**（`apps/server/src/modules/automation/worker-client.ts:142`），因此 **Chromium 与 Linux 系统依赖必须和后端装在同一个容器/主机**，不能拆成两个镜像了事。
- Chromium 在容器内需 `--no-sandbox`（多数镜像无 user namespace 权限），并显式设置 `shm_size`（默认 64 MB 会导致 Chromium 崩溃），建议 ≥ 512 MB。
- 4 Mbps 出网带宽对看板和扩展分发足够；但 Playwright 每次改密都会真实加载科应后台页面，若同时有多个改密任务会挤占带宽。当前 Worker 串行执行，不构成问题。
- 建议配置 2 GB swap 作为 OOM 兜底，避免 Chromium 峰值把后端一起拖死。

## 二、P0 阻断项（必须解决后才能上线）

### P0-1　实例 5 天后到期，到期即释放

- 到期时间：**2026-10-04 08:40**，距今仅 5 天。
- 腾讯云包年包月实例到期后进入回收期（约 7 天，关机保留），超期后实例被释放、数据清除且不可找回。
- 处置：**先续费，再谈部署。** 续费策略当前是「到期提醒 + 手动续费」，建议改为自动续费，避免同类问题复发。

### P0-2　全链路无 TLS，凭据明文过公网

这是最严重的一项。仓库里所有网关配置**只监听 80 端口**，没有任何 TLS 配置：

- `deploy-lan/nginx-prefix/conf/nginx.conf` → `listen 18080`
- `deploy-lan/docker/nginx-docker.conf` → `listen 80`
- `deployment/deploy.md` 的 nginx 示例 → `listen 80`
- 全仓搜索 `HTTPS|TLS|证书|ssl` 无任何结果

后果：员工登录密码、会话 Cookie、科应账号密码全部以明文经过公网传输；`res.cookie` 的 `secure` 标志依赖 `isSecureRequest(req)`（`apps/server/src/modules/auth/auth.controller.ts:48`），在 HTTP 下不会置位。

同时 `apps/server/src/main.ts:27-39` 的 CORS 白名单只放行 `chrome-extension://`、`moz-extension://` 与 `localhost/127.0.0.1`。**用裸公网 IP 访问时，看板与 API 同源所以不受影响，但扩展的 `chrome-extension://` 来源能通过——这意味着任何安装该扩展的人都能跨域调用你的 API。**

处置（**已于方案设计中落地，见 [cloud-deploy-design.md](cloud-deploy-design.md)**）：

1. nginx 增加 443 + `ssl_certificate`，80 端口 301 跳转到 443。

   **关于证书来源，两条路可选：**

   | | 路线 A：域名证书 | 路线 B：IP 证书（**当前采用**） |
   |---|---|---|
   | 需要域名 | 是 | 否 |
   | 需要 ICP 备案 | **是** | 否 |
   | 证书有效期 | 90 天 | 160 小时（约 6.7 天） |
   | 前置条件 | 实例购买时长 ≥ 90 天 | 无 |

   > **勘误**：本报告初版称「Let's Encrypt 不签发纯 IP 证书」，该说法已过时。
   > Let's Encrypt 的 IP 地址证书已于 **2026-01-15 正式 GA**，裸 IP 可取得浏览器信任的证书，
   > 唯一硬性要求是必须使用 `shortlived` profile（6 天有效期）。因此本方案选择路线 B，
   > 绕开域名与备案，代价是续期频率提高到每天一次。

   > **ICP 备案约束**（腾讯云官方文档，走路线 A 时必须先解决）：
   > 使用中国内地地域的轻量应用服务器**开办网站并绑定域名服务时，必须先办理 ICP 备案**，
   > 取得备案号后才能开通域名访问（国务院令第292号）。且备案要求实例
   > **包年包月、购买时长 ≥ 90 天、备案期间剩余时长 ≥ 30 天**，域名须在境内注册商注册
   > 并完成实名认证、主体信息一致。本实例当前购买时长仅 1 个月、剩余 5 天，
   > **两条都不满足**，走路线 A 必须先续费。叠加首次备案 1–3 周的管局审核周期，
   > 整体需要 2–4 周外部等待。

2. 通过 `CORS_ORIGINS` 环境变量把来源收敛到具体来源（路线 B 下为 `https://134.175.156.233`），不要再依赖默认白名单。
   **注意：`CORS_ORIGINS` 一旦非空会整体替换默认白名单，必须同时把扩展来源 `chrome-extension://<ID>` 补回去**，
   而扩展 ID 需先用 `manifest.json` 的 `key` 字段固定下来（详见方案设计 4.3）。
3. 确认 CSP / X-Content-Type-Options / X-Frame-Options / Referrer-Policy 四个安全头在 443 站点上同样下发——注意 nginx 的 `add_header` **不继承**，子 location 一旦自己写了 `add_header`，父级全部失效（`scripts/test/security-headers.test.mjs` 已把这条坑写成回归测试，新增 location 后记得跑 `pnpm test:security-headers`）。

### P0-3　3000 端口直连公网

`deploy-lan/docker/docker-compose.rancher.yml` 里后端是 `ports: - "3000:3000"`，会绑定到 `0.0.0.0`。这等于把 NestJS 直接暴露在公网，绕过 nginx 的限流与安全头，且 `trust proxy` 设为 `'loopback'`（`apps/server/src/main.ts:54`）时，来自非回环的真实客户端 IP 会被直接采信，**限流键可被伪造请求头绕过**。

处置：改为 `127.0.0.1:3000:3000`，或用 Docker 内部网络让 nginx 通过服务名访问（推荐，`nginx-docker.conf` 里已经是 `proxy_pass http://backend:3000`，把 `ports` 整段删掉即可）。

### P0-4　备份只落本机磁盘，服务器释放即全丢

`DEPLOYMENT.md` 的备份策略是「每天 02:00 本地备份 + 保留 30 天」，`backups/` 与 SQLite 同盘。结合 P0-1 的到期释放风险，**实例一旦回收，业务数据和全部备份一起消失**。

更关键的是 `SCIENCEING_MASTER_KEY`：它是 AES-256-GCM 主密钥，丢失后**已入库的科应账号密码永久无法解密**（`apps/server/src/crypto/master-key.ts` 对生产环境缺失直接抛错，这是对的）。

处置：

1. 备份异地化：每日 rsync / COS 同步 `backups/` 与 `data/scienceing.prod.db` 到对象存储或另一台机器。
2. `SCIENCEING_MASTER_KEY` 用密码管理器或密钥服务单独保管，**不要只存在于服务器上的 `.env`**。
3. 服务器 `.env` 权限收紧到 `600`，属主为运行服务的非 root 用户。该文件当前含真实的 `SCIENCING_ADMIN_USERNAME`（科应管理员账号）与密码。

## 三、P1 高危项（建议同窗口处理）

| 编号 | 问题 | 处置 |
|---|---|---|
| P1-1 | SSH 默认 root + 密码登录（Lighthouse 初始状态） | 禁用密码登录，改用密钥；禁止 root 直登；改非标端口；部署 fail2ban |
| P1-2 | 轻量服务器防火墙默认只放行部分端口，需人工核对 | 控制台防火墙只保留 22 / 80 / 443，**显式关闭 3389**（Linux 镜像也常默认放行）与 3000；并与系统内 ufw/iptables 双重确认 |
| P1-3 | Docker 容器以 root 运行，Chromium 需 `--no-sandbox` | 后端容器用非 root 用户运行；数据卷按最小权限挂载；不要把 docker socket 挂进容器 |
| P1-4 | 扩展域名仍是 `localhost` 占位符 | `apps/extension/src/lib/config.js` 与 `manifest.json` 的 `DASHBOARD_ORIGINS` / `API_BASE` / `host_permissions` / `content_scripts.matches` 必须同步替换为公网地址，否则扩展完全不可用 |
| P1-5 | `.env` 中管理员凭据 | 部署时通过密钥管理注入，不落盘到镜像层；确认 `.env` 未被打进任何镜像或 Release |

## 四、P2 建议项

- **监控告警**：`deployment/monitoring.md` 描述的方案需确认是否覆盖磁盘水位、进程存活、备份失败；至少加一条磁盘 > 80% 与容器退出告警。
- **日志轮转**：Docker 默认 json-file 无上限，2 GB 内存 + 50 GB 磁盘下建议配置 `max-size=10m, max-file=3`。
- **SQLite WAL**：确认 `data/` 目录所在分区不会因磁盘写满导致 WAL 无法回写。50 GB 充裕，但需监控。
- **`deploy-lan/docker/docker-compose.rancher.yml` 缺 Worker 服务**：该 compose 只有 `backend` 与 `gateway` 两个服务，没有 Playwright Worker。若照抄此文件部署，自动改密/回收功能将不可用。
- **限流器为进程内 Map**（`apps/server/src/lib/rate-limit.ts`）：单实例部署没问题，但重启即清零，且无法跨实例共享。当前架构下可接受，仅作记录。

## 五、部署链路适配（Windows/LAN → Linux/Docker）

现有正式发布链路是为局域网设计的，**不能直接用于这台 Linux 服务器**：

- `deploy-prod.bat` / `deploy-release.ps1` / `sync-from-dev.ps1` 全部是 PowerShell + SMB 共享 + `D:\scienceing-prod` 路径，Linux 上无法执行。
- `make-release.ps1` / `create-release.ps1` 在开发机侧构建 Release ZIP，这一步可以保留——**在 Windows 开发机构建产物，再传到服务器**，比在 2C2G 服务器上跑 `pnpm install` + 构建更合理（服务器上构建会吃掉大量内存）。

推荐路径：

1. 开发机执行 `.\make-release.ps1 -CloudHost <站点> -ExtensionKeyPath <外部原私钥>` 产出 `scienceing-vX.Y.Z.zip`（含 server/web/worker 生产依赖）。
2. 打包为 Docker 镜像（基于 `mcr.microsoft.com/playwright:v1.62.1-noble`（构建实际验证 Backup API/Chromium） 以自带 Chromium 依赖），镜像内含 `apps/server/dist` + `apps/web/dist` + `playwright/worker/dist`。
3. 服务器侧 `deploy.sh <ZIP>`，nginx 容器 443 对外，backend 仅内网可达。
4. 首次部署按 `DEPLOYMENT.md` 约定导入旧库：仅在旧部署机用 SQLite Backup API 生成一致性快照，在目标部署机只读核对结构后指定匹配基线；不向开发机同步真实业务库，并沿用原 `SCIENCEING_MASTER_KEY`。

## 六、上线前检查清单

> 走路线 B（IP + IP 证书），已按此调整。完整清单见 [cloud-deploy-design.md](cloud-deploy-design.md) 阶段 4。

- [ ] 实例已续费，自动续费已开启（P0-1）
- [ ] **IP 证书已签发**（`certs/live/134.175.156.233/fullchain.pem`），80 → 443 跳转生效（P0-2）
- [ ] **证书续期 cron 已配置并实测跑通一次**（`17 3 * * *`，退出码 0）——IP 证书仅 6 天有效期，漏配等于 6 天后必然断服（P0-2）
- [ ] `CORS_ORIGINS` 已收敛为 `https://134.175.156.233,chrome-extension://opockgnmgpgocghdfanhlfcpkaahodga`（P0-2）
- [ ] **扩展签名私钥 `deploy-cloud/extension-key.pem` 已离线备份**（丢失将导致扩展 ID 变化，全员重装）
- [ ] 四个安全头在 443 站点验证通过：`pnpm test:security-headers`（P0-2）
- [ ] 后端 3000 端口未绑定 `0.0.0.0`（P0-3）
- [ ] 备份异地同步已跑通并验证可恢复（P0-4）
- [ ] `SCIENCEING_MASTER_KEY` 已离线备份（P0-4）
- [ ] 服务器 `.env` 权限 600，属主为非 root（P0-4）
- [ ] SSH 密钥登录已启用，密码登录已关闭，fail2ban 已运行（P1-1）
- [ ] 控制台防火墙仅放行 22 / 80 / 443，3389 与 3000 已关闭（P1-2）
- [ ] 容器以非 root 运行，`shm_size` ≥ 512 MB（P1-3）
- [ ] 扩展 `config.js` 与 `manifest.json` 已替换为 IP 并重新打包（P1-4）
- [ ] swap 已配置（2 GB）
- [ ] Docker 日志轮转已配置
- [ ] `TRUST_PROXY=172.28.0.0/16` 已配置，且**限流按真实来源 IP 生效**（用两个外网出口各失败 10 次验证）
- [ ] Worker 在容器内可正常运行（`pnpm --filter @scienceing/playwright-worker build` 产物存在，Chromium 可启动）
- [ ] `GET /api/accounts/availability` 返回 `{"total":10,"available":10,...}`
- [ ] `GET /api/extension/config` 返回 `minimumVersion/latestVersion/...`
- [ ] admin 登录 `/admin`，五个页面可访问
- [ ] `/admin/settings` → Scienceing 自动化「立即检测」三项健康检查通过
