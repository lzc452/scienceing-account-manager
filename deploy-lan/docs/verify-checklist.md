# 验收清单：同事端与运维端测试步骤

> 目的：花 5 分钟确认内网部署四件套（前端/后端/扩展/Worker）全部可用。

## 1. 本机（部署机）侧

```powershell
# 一键状态：应看到后端/网关运行中，健康自检 200
deploy-lan\status.bat
# 或命令行：
node deploy-lan\scripts\deploy.mjs status
```

期望输出要点：
- `本机局域网 IP : 10.3.124.100 (WLAN)`（若变了，改 `config.env` 的 LAN_IP 后重启）
- 网关模式 `nginx`（或 `node`），`/ → 200`，`/api → 200`，`局域网 / → 200`

## 2. 同事浏览器访问（同 WiFi）

| # | 步骤 | 期望 |
|---|---|---|
| 1 | 打开 `http://10.3.124.100:18080/` | 看板加载，可用账号数 > 0 |
| 2 | 打开 `http://10.3.124.100:18080/admin/accounts` 后**按 F5 刷新** | 不 404（SPA 回退生效） |
| 3 | 用 `admin` 登录管理后台 | 账号/用户/租约/日志/设置五页可访问 |
| 4 | 后台“设置”→ Scienceing 自动化“立即检测” | 三项健康检查返回（login/accountPage/resetEntry 等） |
| 5 | 直连后端：`http://10.3.124.100:3000/api/accounts/availability` | 返回 `{"total":10,"available":10,...}` |
| 6 | 扩展：`deploy-lan\dist\scienceing-extension-lan-v1.0.0.zip` 解压 → `chrome://extensions` 开发者模式 → 加载已解压 → 刷新看板 | 看板插件状态变 “ready”（未装时 3 秒判 missing，领取被禁属正常） |

> 若 1 就不通：在同事电脑 `Test-NetConnection 10.3.124.100 -Port 18080`。不通再看
> `docs/no-admin-firewall.md`（网络类型/AP 隔离/本机 IP 是否漂移）。

## 3. Playwright Worker 功能验证（headless，真实科应站）

在部署机命令行（会用仓库 `.env` 里科应管理员凭据；`.auth/admin.json` 已存在则秒过）：

```bash
# ① 刷新登录态（可选，Worker 也会自动登录）
node playwright/worker/dist/cli.js login

# ② 健康检查三项（headless）
set SCIENCING_BROWSER_HEADLESS=1
node playwright/worker/dist/cli.js check
# 期望：{ ok:true, adminLoginOk:true, accountPageOk:true, resetEntryOk:true }

# ③ 真实改密单测（谨慎：会真改目标账号密码）
node playwright/worker/dist/cli.js reset --username <科应username> --password <新密码>

# ④ 消费队列（后端调度器自动调用，也可手动）
node playwright/worker/dist/cli.js run --jobs <jobfile.json>
```

> Windows 终端可能看不到 Chrome 的 stdout/stderr → 进度看 `playwright/.worker-logs/worker.log`。
>
> ⚠ 已知业务适配项（与部署无关）：2026-09-02 实测科应后台改版后，`check` 的
> `resetEntryOk` 可能为 `false`（selectors.ts 与页面 DOM 不一致，PRD §49 页面改版检测）。
> 若三项非全绿：先看 worker.log 具体是哪一项失败；login/accountPage 通、仅 resetEntry 挂
> 说明是“重置入口选择器”需按新页面更新 `playwright/worker/src/selectors.ts`，不影响部署可用性。

## 4. 更新发布回归（每次 deploy-update.bat 后重跑 §1 与 §2 的 1–3）

1. `status.bat` 两服务运行中；
2. 看板刷新正常、接口 200；
3. 若改动了扩展/域名：重新 `extension:pack` 并把新 zip 分发给同事（`chrome://extensions` 点“重新加载”）。
