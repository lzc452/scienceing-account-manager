# 科应共享账号助手 — 安装说明（ZIP 打包 + 加载已解压扩展）

> 第一阶段采用 **ZIP 分发 + 用户「加载已解压的扩展程序」**（PRD §7.5/§53）。扩展为纯 JS 无打包，`apps/extension` 目录即扩展根目录（含 `manifest.json`）。

## 1. 打包 ZIP

扩展运行时只需 `manifest.json` + `src/`（`scripts/`、`test/` 为开发校验，无需打包）。

### Windows（PowerShell）

```powershell
Compress-Archive -Path apps/extension/manifest.json, apps/extension/src `
  -DestinationPath deployment/科应共享账号助手_v1.0.0.zip -Force
```

### macOS / Linux

```bash
cd apps/extension
zip -r ../../deployment/科应共享账号助手_v1.0.0.zip manifest.json src/
```

> 版本号与 `manifest.json` 的 `version` 一致（当前 `1.0.0`）。产物 `deployment/科应共享账号助手_v1.0.0.zip`（`*.zip` 已 gitignore）。
>
> 校验：解压后 ZIP 根目录应**直接**是 `manifest.json`（不能多套一层目录），否则浏览器「加载已解压」无法识别。

## 2. 安装（加载已解压扩展）

### Edge（推荐）

1. 解压 ZIP 到固定目录，例如 `C:\ScienceingAssistant\`（**解压后保持此目录不动**，unpacked 扩展依赖原目录，PRD §53）。
2. 打开 `edge://extensions`。
3. 打开右上角「**开发人员模式**」开关。
4. 点「**加载解压缩的扩展**」，选择 `C:\ScienceingAssistant\`。
5. 返回账号看板，页面会自动检测插件（握手 `EXTENSION_PING → EXTENSION_READY`，3 秒超时判「未安装」，PRD §10）。

### Chrome

1. 解压 ZIP 到固定目录，例如 `C:\ScienceingAssistant\`。
2. 打开 `chrome://extensions`。
3. 打开右上角「**开发者模式**」。
4. 点「**加载已解压的扩展程序**」，选择 `C:\ScienceingAssistant\`。
5. 返回账号看板。

## 3. 升级（版本过旧）

后端 `GET /api/extension/config` 下发 `minimumVersion`（默认 `1.0.0`）与 `latestVersion`（默认 `1.2.0`）。看板/扩展握手时比对：

- 安装版本 < `minimumVersion` → 状态 `outdated`，**禁止领取**（R4），提示下载最新 ZIP（PRD §11）。
- 升级步骤：下载新 ZIP → 解压覆盖原目录 → 到 `edge://extensions`/`chrome://extensions` 点扩展卡片上的「重新加载」→ 返回看板。

## 4. 域名配置（部署必读）

PRD 未固化科应/看板生产域名，仓库以占位符给出，**上线前必须同步替换**两处（见 `apps/extension/README.md`「域名配置」）：

| 项 | 开发默认值 | 需替换位置 |
|---|---|---|
| 看板域 | `http://localhost:5173` | `manifest.json` content_scripts.matches + `src/lib/config.js` DASHBOARD_ORIGINS/DASHBOARD_URL |
| 科应域 | `https://www.scienceing.com` | `manifest.json` content_scripts.matches + `src/lib/config.js` SCIENCEING_ORIGINS/SCIENCEING_URL |
| 后端域 | `http://localhost:3000` | `manifest.json` host_permissions + `src/lib/config.js` API_BASE（生产为看板同源） |

## 5. 验证插件工作正常

1. **握手**：看板 Console 执行 `window.postMessage({source:'scienceing-dashboard',type:'EXTENSION_PING'},'*')`，应收到 `EXTENSION_READY`（version/status）。
2. **绑定**：看板领取账号 → 点「打开科应」→ Service Worker 控制台打印 `BIND_AND_OPEN { tabId, leaseId }`。
3. **Activity**：科应页真实点击/滚动 → Worker 控制台 `POST /api/leases/{id}/activity`，悬浮窗倒计时回到 ~30:00。
4. **悬浮窗**：科应页右下角出现 Shadow DOM 悬浮窗（`#__scienceing_account_assistant__`），显示 KY 代码 + 无操作/预计释放。

> 详细握手/运行时消息契约、手动验证四步见 `apps/extension/README.md`。

## 6. 权限说明（最小权限）

- 仅 `tabs`（读 `openerTabId`）+ `storage`（`chrome.storage.session` 折叠记忆）。
- 不申请 `cookies`/`history`/`webRequest` 等；`scripts/validate.mjs` 审计拦截。
- 只保存 `leaseToken`（短期随机，PRD §43），**绝不采集**搜索词/正文/输入/Cookie/科应密码/管理员凭据（PRD §9）。
