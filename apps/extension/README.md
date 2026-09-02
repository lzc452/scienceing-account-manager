# 科应共享账号助手（Chrome / Edge Manifest V3）

浏览器扩展只做四件事（PRD §8.1）：检查插件状态、建立 Lease↔科应 Tab 绑定、监听页面真实操作、显示账号状态悬浮窗。本包已交付 **t9 扩展核心** + **t10 Activity 监听 + Shadow DOM 悬浮窗五态**。

## 目录结构

```text
apps/extension/
├── manifest.json                 MV3 清单（最小权限：tabs + storage；只注入看板域 + 科应域）
├── src/
│   ├── background.js             module SW：握手/版本检测 / BIND_AND_OPEN / Tab 继承 / 状态轮询 / Activity 节流上报 / 悬浮窗跳转
│   ├── lib/
│   │   ├── config.js             域名/后端地址等环境常量（部署时替换）
│   │   └── version.js            纯函数版本比较（node:test 覆盖）
│   ├── content/
│   │   ├── dashboard.js          看板域：握手 EXTENSION_PING/EXTENSION_READY + BIND_AND_OPEN
│   │   └── scienceing/
│   │       └── scienceing.js     科应域：Activity 监听（isTrusted + 排除插件 UI）+ 状态推送驱动
│   └── panel/
│       └── panel.js              Shadow DOM 悬浮窗五态（#__scienceing_account_assistant__）
├── scripts/validate.mjs          「构建」= 结构校验 + 最小权限审计（无打包，unpacked 直载）
└── test/version.test.mjs         node:test 单测
```

## 安装（手动加载已解压扩展，PRD §53）

1. 确认本目录即扩展根目录（含 `manifest.json`）。
2. Chrome：打开 `chrome://extensions`；Edge：打开 `edge://extensions`。
3. 打开右上角「开发者模式」。
4. 点「加载已解压的扩展程序」，选择 `apps/extension` 目录。
5. 保持此目录不动（unpacked 扩展依赖原目录，PRD §53）。

## 域名配置（部署必读）

PRD 未固化科应/看板生产域名，本仓库以占位符给出，上线前需**同步**替换两处：

| 项 | 开发默认值 | 说明 |
|---|---|---|
| 看板域 | `http://localhost:5173`（Vite） | `manifest.json` content_scripts.matches + `src/lib/config.js` DASHBOARD_ORIGINS/DASHBOARD_URL |
| 科应域 | `https://www.scienceing.com` | `manifest.json` content_scripts.matches + `src/lib/config.js` SCIENCEING_ORIGINS/SCIENCEING_URL |
| 后端域 | `http://localhost:3000`（NestJS） | `manifest.json` host_permissions + `src/lib/config.js` API_BASE（生产为看板同源） |

科应真实域名请以正式开通通知为准（[科应全球创新数据平台 Scienceing](https://www.lib.szu.edu.cn/node/18772) 等试用页）。

## 握手协议（看板 ↔ 扩展，PRD §10）

看板页面与扩展 Content Script 通过受控 `window.postMessage` 通信；扩展内部再经 `chrome.runtime` 通信。

```text
看板广播 → 扩展：{ source:'scienceing-dashboard', type:'EXTENSION_PING' }
扩展应答 → 看板：{ source:'scienceing-extension', type:'EXTENSION_READY',
                    version:'1.0.0', status:'ready'|'outdated'|'error',
                    minimumVersion:'1.0.0', latestVersion:'1.2.0' }
```

- 看板侧 3 秒内未收到 `EXTENSION_READY` 判「未安装」，禁用领取（PRD §10）。
- `status` 语义：`ready` 就绪；`outdated` 版本低于 `GET /api/extension/config` 的 `minimumVersion`（禁止领取，PRD §11/R4）；`error` 后端不可达（PRD §45 系统不可用，看板应禁领取）。
- 额外提供 document 自定义事件 `scienceing:extension-ready`（detail 同 EXTENSION_READY），看板可不实现 ping 广播而直接监听。

看板侧最小接线（apps/web，非本包范围，供前端对接参考）：

```js
window.postMessage({ source: 'scienceing-dashboard', type: 'EXTENSION_PING' }, '*')
window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'scienceing-extension') return
  if (e.data?.type === 'EXTENSION_READY') { /* 更新 pluginState：ready/outdated/error */ }
})
```

## 运行时消息（content script ↔ worker）

| 方向 | 消息 | 载荷 → 返回 |
|---|---|---|
| dashboard → worker | `EXTENSION_INFO` | → `{ version, status, minimumVersion, latestVersion }` |
| dashboard → worker | `BIND_AND_OPEN` | `{ leaseId, leaseToken, accountCode? }` → `{ ok, leaseId, tabId }` |
| scienceing → worker | `GET_TAB_LEASE` | → `{ bound, leaseId?, accountCode? }` |
| scienceing → worker | `GET_LEASE_STATUS` | `{ leaseId }` → `{ ok, leaseId, status }` |
| scienceing → worker | `REPORT_ACTIVITY` | `{ leaseId }` → `{ ok, reported }`（worker 5~10s 节流合并后 POST） |
| scienceing → worker | `OPEN_DASHBOARD` | `{ path }` → `{ ok, tabId }`（立即归还确认 / 返回看板跳转） |
| worker → scienceing tab | `LEASE_STATUS`（含 config 阈值）/ `LEASE_RELEASED` / `LEASE_SERVICE_ERROR` | 状态推送（驱动悬浮窗） |

## Activity 与悬浮窗（t10，PRD §17/§18/§20/§21/§22/§44）

- **监听**：仅 `pointerdown / keydown / wheel / touchstart`，且 `event.isTrusted === true`；不监听 `mousemove`（PRD §17.2）。
- **排除插件 UI**：通过 `event.composedPath()` 判断是否命中 `#__scienceing_account_assistant__`，命中即 return（点击「立即归还」不续期，PRD §44）。
- **节流**：content script 本地 2s 粗节流 → worker 5~10s 合并（读 config `activityThrottleSeconds`，夹紧 5~10）→ `POST /api/leases/{id}/activity`，body 仅 `{ leaseToken, event:'activity' }`（PRD §9，不采集搜索词/正文/输入/Cookie/密码）。
- **悬浮窗（缩小面板）**（Shadow DOM `#__scienceing_account_assistant__`，右下角 48×48，radius 10px，白底）：默认仅显示「预计释放时间环」——环形逆时针倒计时，环内居中文字「释放时间」（8px）。环色随剩余时间：5–30min 绿 / 1–5min 黄 / 0–1min 红（数据源仅后端 `expiresAt`）。点击面板展开小型浮层（账号 + 预计释放 + 立即归还 / 返回看板）。
  - ① 正常（绿环）② 警告（黄环，剩余 1–5min）③ 临界（红环，剩余 <1min，自动弹一次提醒 Modal：继续使用 / 立即归还，含实时倒计时）④ 已释放（灰环「已释放」+ 弹窗仅「返回看板」）⑤ 连接异常（琥珀环「异常」，冻结本地倒计时）。另有未绑定（灰环「未绑」）。
- **倒计时**：数据源仅后端 `expiresAt`；本地每 1s 只做渲染，不自行决定 `last_activity_at`（PRD §19）。
- **立即归还**：Shadow DOM 确认弹窗 → 打开看板 `/my` 完成释放确认（release 端点需用户会话，扩展按 PRD §43 只持有 leaseToken，不存用户会话，故跳转看板完成）。

## 手动验证

### t9（握手/绑定/多 Tab）

1. **看板检测版本**：打开看板页 Console 执行 `window.postMessage({source:'scienceing-dashboard',type:'EXTENSION_PING'},'*')`，`message` 事件应收 `EXTENSION_READY`（version/status）。
2. **绑定**：`window.postMessage({source:'scienceing-dashboard',type:'BIND_AND_OPEN',leaseId:1,leaseToken:'<token>'},'*')`；Service Worker 控制台（`chrome://extensions` → 本扩展 → 检查视图 service worker）应打印 `BIND_AND_OPEN { tabId, leaseId }`。
3. **多 Tab 继承**：已绑定科应 Tab 内 Ctrl+点击链接，Worker 控制台应打印 `inherit { tabId, openerTabId, leaseId }`。

### t10（Activity / 悬浮窗）

1. **Activity 续期**：绑定后，在科应页真实点击/滚动/按键 → Worker 控制台 `POST /api/leases/{id}/activity`；后端 `last_activity_at` 更新（DB 或 `/api/leases/{id}/status` 验证），悬浮窗「无操作」回到 ~00:00。
2. **倒计时刷新**：悬浮窗「预计释放」每 1s 递减；操作页面后回到 ~30:00。
3. **阈值态切换**：临时把 `system_settings` 的 `warning_seconds` 调到 >30min、`critical_warning_seconds` 调大（或直接改 `GET /api/extension/config` 阈值）观察 ②/③ 态；临界态 Modal 只弹一次。
4. **立即归还不续期**：点击悬浮窗「立即归还」→ 确认弹窗 → 打开看板 `/my`；期间不触发 `REPORT_ACTIVITY`（Worker 控制台无新增 activity POST）。

## 权限与隐私（PRD §9 / §43 / §44）

- 权限仅 `tabs`（读 `openerTabId`）+ `storage`（`chrome.storage.session` 会话级折叠记忆，浏览器关闭即清空）。
- 不申请 `cookies` / `history` / `webRequest` / `scripting` 等多余权限；`scripts/validate.mjs` 审计拦截。
- 只保存 `leaseToken`（短期随机值，PRD §43）；**绝不采集/保存**搜索词、正文、输入、Cookie、科应密码、管理员凭据（PRD §9）。

## 校验命令

```bash
pnpm --filter @scienceing/extension build   # 结构 + 最小权限审计
pnpm --filter @scienceing/extension test    # 版本比较单测（node:test）
```

> 注：受限沙箱禁止 `node --test` 的多文件 runner spawn（EPERM），故测试脚本直接执行
> `node test/version.test.mjs`（node:test 作为主模块运行不 spawn，同样输出 pass/fail 并影响退出码）。
