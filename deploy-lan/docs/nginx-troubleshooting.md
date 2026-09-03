# nginx “无法启动”排查报告与解决（本机实测结论）

> 适用：`D:\Applications\nginx-1.30.4\nginx.exe`。本文是 2026-09-02 在本机实测后的结论，
> 可直接照着验证；最终本部署方案采用“隔离 prefix + 高端口”绕开所有坑（见 §5）。

## 1. 本机实测结论（重要）

| 检查项 | 结果 |
|---|---|
| `nginx.exe -v` | `nginx version: nginx/1.30.4` ✅ |
| `nginx.exe -t -p <安装目录> -c <conf/nginx.conf>` | `syntax is ok` / `test is successful` ✅ |
| 是否已在运行 | **是**，存在多个 nginx 进程；**80 端口正被 nginx 监听**（`Get-NetTCPConnection` 可见） |
| 80 端口在服务什么 | 安装目录默认 `conf/nginx.conf` 的欢迎页（`root html`），即官方默认页面 |
| 配置是否损坏 | 当前磁盘上的配置有效 |

**结论：这台机器上 nginx 本身是“能启动且已启动”的。** 你感觉“起不来”，最常见是以下错觉/诱因之一：

1. **双击无窗口反馈**：Windows 版 nginx 双击后**不弹界面**，进程已在后台跑。看起来“什么都没发生”。
2. **再次启动时端口被占**：第一次已占 80，第二次 `nginx.exe` 会立刻退出并把错误写进
   `logs\error.log`（提示 `bind() to 0.0.0.0:80 failed (10048: ...)`）。你以为没起来，其实第一次那个还活着。
3. **改了配置后没重载/没重启**：改 `conf\nginx.conf` 后需要 `nginx -s reload`（改端口/监听需先 `-s stop` 再启动），
   直接再双击 nginx.exe = 又一个端口冲突实例。
4. **控制台一闪而过**：如果从 cmd 直接运行 `nginx.exe`，master 进程会“前台挂着”；把它当普通程序双击，
   那个黑色窗口可能被误关/被系统隐藏，进程仍在。

## 2. 三步自查命令（无管理员即可）

PowerShell（管理员权限**不是**必需，都是只读/自管操作）：

```powershell
# 1) 配置是否有语法错
& "D:\Applications\nginx-1.30.4\nginx.exe" -t

# 2) 谁占着 80（和你想用的端口）
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 80,8080,18080 } |
  Select-Object LocalAddress,LocalPort,OwningProcess

# 3) 对应进程是什么、nginx 的错误日志说了什么
Get-CimInstance Win32_Process -Filter "ProcessId=<上面拿到的PID>" | Select CommandLine
Get-Content "D:\Applications\nginx-1.30.4\logs\error.log" -Tail 20
```

## 3. 常见根因清单与对策

| 根因 | 特征（error.log 关键字） | 对策 |
|---|---|---|
| 端口被占 | `bind() to 0.0.0.0:80 failed (10048)` | 用高端口（如 18080）；或结束占 80 的进程（本机那个是默认欢迎页 nginx，可 `nginx -s stop` 停掉再改用 80） |
| 二次实例冲突 | `bind() failed` + 存在旧 nginx 进程 | 先 `nginx -s quit` 停干净再启动；只保留一个 master |
| 配置错误 | `unknown directive` / `test failed` | `nginx -t` 先自检；注意 `server_name`/`location` 花括号配对；路径不要带中文与尾部反斜杠 |
| `include` 文件缺失 | `open() "mime.types" failed` 等 | 确保 `conf` 下有 `mime.types`；本方案已自动从安装目录复制 |
| 日志/临时目录不可写 | `open() "logs/error.log" failed (13: Permission denied)` | 用**项目内 prefix**（本方案做法），日志落在可写目录 |
| 路径含中文/空格 | 启动即失败/找不到配置 | 配置内绝对路径用英文路径；本仓库路径无中文无空格，安全 |
| 缺运行库 | 进程秒退、Windows 报“缺少 DLL” | 官方 Windows 版 nginx 不依赖 VC 运行库之外的东西；如被杀软拦截，看系统事件日志 |
| 被杀软/EDR 拦 | 无 error.log、进程闪退 | 检查 Defender/EDR 隔离记录；本仓库路径与 nginx 均在 D 盘应用目录，未被拦 |

## 4. 为什么本部署不直接改 80 端口的那个 nginx

- 80 端口实例正在服务**默认欢迎页**，改它的配置/重载可能影响你在它上面已有的其它站点；
- 直接写 `D:\Applications\nginx-1.30.4\conf` 属于“改系统盘外应用目录”，无管理员时权限不可控；
- 需求只是让同事访问本项目 —— 用一个**独立、可整体删除、可回退**的实例更干净。

## 5. 本部署的做法（自动、可回退）

1. 在项目内创建隔离前缀 `deploy-lan\nginx-prefix\{conf,logs,temp}`；
2. 把 `mime.types` 从安装目录**只读复制**进来（无需写安装目录）；
3. 自动生成 `conf\nginx.conf`：`listen 18080`（高端口、避开 80）+ 前端静态 + `/api` 反代 127.0.0.1:3000 + SPA 回退；
4. 启动命令：`nginx.exe -p <项目prefix> -c <绝对conf>`；停止：`nginx.exe -s quit -p ... -c ...`；
5. 若 `nginx -t` 自检不过或启动失败，部署脚本**自动切换到内置 Node 网关**（`scripts/gateway.mjs`），功能等价。

### 手动测试隔离实例

```powershell
# 自检（不启动）
node deploy-lan\scripts\deploy.mjs nginx:test

# 只看结果：conf 在 deploy-lan\nginx-prefix\conf\nginx.conf，日志在 nginx-prefix\logs\
```

### 想改用 80 端口（可选，先停掉现有默认实例）

```powershell
# 停掉 80 端口的旧实例（仅当你确认它没用）
& "D:\Applications\nginx-1.30.4\nginx.exe" -s quit
# 然后把 deploy-lan\config.env 的 GATEWAY_PORT 改成 80，重新执行 deploy
```
