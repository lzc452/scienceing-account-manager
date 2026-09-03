# 内网部署执行摘要（2026-09-02 真机验证通过）

## 一句话
新增 `deploy-lan/`：一套**无管理员、不依赖 pnpm/Docker** 的生产部署（构建→建库→守护进程→网关→扩展 zip），
同事经 `http://10.3.124.100:18080/` 访问。

## 验证过的结果（本机实测）
- 后端（NestJS，0.0.0.0:3000/api）守护运行，`/api/accounts/availability` → `{"total":10,"available":10,...}` ✅
- 网关：nginx 1.30.4 隔离 prefix 实例监听 18080，`/` 与 `/api/*` 均 200 ✅（启动失败会自动回退内置 Node 网关，同样验证过 ✅）
- 前端构建 vite 6.4.3 正常；SPA 路由回退生效：`/admin/accounts` 直接访问+刷新 200 ✅
- 数据库迁移/种子幂等（10 个科应账号）✅；Playwright Worker tsc 编译 + CLI 可用 ✅
- 扩展 LAN 版 zip 已生成并校验通过（域名已替换为 http://10.3.124.100:18080）✅

## 修复的两个部署脚本 bug（最终版已修正）
1. `lib.mjs` 端口探测 connect/error 语义写反（把“空闲”判成“占用”）→ 已按
   connect=有监听/error=空闲 重写，并加 `probePortInUse` 单测验证。
2. `stopGateway` 对游离的隔离 nginx master 回收不彻底 → 现按命令行特征
   （含 nginx-prefix）全量结束并等待端口释放（曾积压 2 个游离 master 占 18080）。

## 关键运维命令（等效 .bat）
```text
node deploy-lan/scripts/deploy.mjs deploy|update|start|stop|status|build|nginx:test|extension:pack|db:reset-admin|env:print
```
双击入口：deploy-lan/{deploy-first,deploy-update,start,stop,status}.bat

## 本机环境结论（写入文档）
- nginx 并非“起不来”：配置 `-t` 通过，80 端口早有一个跑默认欢迎页的实例；新方案用独立 prefix + 18080 绕开。
- 防火墙三个配置文件全 Disabled → 无管理员放行问题；若日后被启用，见 docs/no-admin-firewall.md 三级预案。
- 本机 WLAN IP 10.3.124.100（DHCP，可能漂移，改 deploy-lan/config.env 的 LAN_IP 即可）。
