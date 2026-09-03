# 无管理员权限：开放端口 / 防火墙 的可操作方案

> 关键前提先说清：Windows 防火墙**入站放行规则**与 `netsh portproxy` 都需要管理员权限。
> “没有管理员”时不能新增规则，但有三级变通。**本机当前防火墙三个配置文件均为 Disabled（已实测），
> 入站不受拦，此文档只是“如果哪天被拦”的预案。**

## 0. 先确认：到底拦没拦？

```powershell
# 配置文件是否启用 / 默认入站动作
Get-NetFirewallProfile | Select Name,Enabled,DefaultInboundAction

# 同事访问失败时，在本机查监听是否正常（监听在 0.0.0.0 或 :: 才算对全网卡开放）
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 3000,18080 } |
  Select LocalAddress,LocalPort,OwningProcess

# 在“另一台同事电脑”上测（本机自测会走回环，测不出防火墙问题）：
#   Test-NetConnection 10.3.124.100 -Port 18080
```
- 三个配置都 `Disabled` → 不用做任何放行，直接可用（本项目现状）。
- 只有“Public（公用）”启用了且拦入站，而 WiFi 网络被标成“公用”→ 见 §2 把网络改“专用”，或 §3 加规则。

## 1. 为什么 netsh / 加规则通常要管理员

- `netsh advfirewall firewall add rule ...` 写系统防火墙策略，标准用户执行会报“请求的操作需要提升”。
- `netsh interface portproxy` 注册内核级转发，同样需管理员。
- 因此“零管理员、IT 不管”的组合下，**唯一硬性缺口就是入站规则**；见下面三层变通逐级解决。

## 2. 第一层（最优先）：用非特权高端口 + 把网络设为“专用”

1. 端口方面：本项目默认 **18080/3000 都是高端口**，绑定**不需要**管理员（Windows 无 1024 以下特权限制，
   此限制只在 Linux 上存在），且避开了 80/443 等易冲突端口。
2. 让 Windows 把当前 WiFi 识别为“专用网络”：设置 → 网络和 Internet → WLAN → 当前网络 → “网络配置文件类型”选“专用”。
   许多默认策略对“专用网络”的入站更宽松；若公司策略强制“公用”，此项可能被锁（灰），那就看 §3。
3. 重新测 `Test-NetConnection <本机IP> -Port 18080`。

## 3. 第二层：一次性提权加规则（只需一次 UAC，不需要 IT）

“没有管理员”通常指日常账号非管理员；只要你知道本机**任一管理员账号**的密码，
就可以弹一次 UAC 提权，把规则写进防火墙（以后永久生效，日常仍用普通账号）：

```powershell
# 会弹出 UAC 授权框 → 输入管理员账号后执行；仅此一次
Start-Process powershell -Verb RunAs -ArgumentList @(
  '-Command',
  'netsh advfirewall firewall add rule name="scienceing-lan" dir=in action=allow protocol=TCP localport=18080,3000 profile=private'
)
```

核对（只读，无需管理员）：

```powershell
Get-NetFirewallRule -DisplayName "scienceing-lan" | Get-NetFirewallPortFilter
```

若连管理员密码都不知道（域环境被锁死），跳到 §4。

## 4. 第三层：用已被放行的程序做端口映射（Rancher Desktop / Docker）

Rancher Desktop（或 Docker Desktop）安装时通常已由安装者（管理员）写入**进程级入站 Allow 规则**
（本机实测存在 `Rancher Desktop Networking Private/Public Exception | Allow | Inbound`）。
既然它的进程能入站，就让**它的端口映射**替我们开 18080/3000 —— 不需要我们新建任何规则。

```yaml
# deploy-lan/docker/docker-compose.rancher.yml（Rancher Desktop 后备方案，非默认）
services:
  backend:
    image: node:24
    working_dir: /app/apps/server
    volumes:
      - ../../:/app
    command: node dist/main.js
    environment:
      - PORT=3000
      - DATABASE_PATH=/app/data/scienceing.db
      # 其余 SCIENCEING_* / SCIENCEING_MASTER_KEY 请按仓库 .env 补齐（docker compose --env-file ../.env 亦可）
    ports:
      - "3000:3000"
  gateway:
    image: nginx:alpine
    volumes:
      - ../../apps/web/dist:/usr/share/nginx/html:ro
      - ./nginx-docker.conf:/etc/nginx/conf.d/default.conf:ro
    ports:
      - "18080:80"
    depends_on: [backend]
```

```nginx
# deploy-lan/docker/nginx-docker.conf
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
  location /api/ { proxy_pass http://backend:3000; }
}
```

启动：`docker compose -f deploy-lan/docker/docker-compose.rancher.yml --env-file .env up -d`。
同事访问地址不变：`http://<本机IP>:18080/`。

## 5. 其它无效/需慎用的“偏方”（避免浪费时间）

| 方法 | 结论 |
|---|---|
| `netsh interface portproxy` 免 admin | ❌ 同样需要管理员；且端口代理只转发本机回环，不解决防火墙 |
| 关闭防火墙（`Set-NetFirewallProfile -Enabled False`） | ❌ 需管理员，且关闭后其它入站也无防护，不推荐 |
| `CheckNetIsolation` 豁免 | 仅对 UWP 回环调试，不适用于本场景 |
| 把服务挂到已被放行的端口 | 依赖“恰好有 Allow 规则的程序监听该端口”，不可控 |
| 让同事拨 VPN / 内网穿透 | 需要外网/专线；同 WiFi 场景下不如上面三层直接 |

## 6. 判断是否真的通了（在同事电脑上执行）

```powershell
Test-NetConnection 10.3.124.100 -Port 18080   # TcpTestSucceeded : True
# 然后浏览器打开 http://10.3.124.100:18080/
```
若 `TcpTestSucceeded : False`：① 确认本机 status.bat 网关/后端运行中；② 本机 IP 是否变化
（DHCP：`Get-NetIPAddress` 重新看，变了就改 config.env 的 LAN_IP）；③ 公司 WiFi 是否开了 **AP/客户端隔离**
（同 WiFi 下设备互访被禁，这是路由器策略，只能找网络管理员，与防火墙无关）。
