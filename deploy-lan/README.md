# deploy-lan 运行时

本目录保留 Node/nginx 的启停、状态与 LAN 扩展打包能力；正式生产发布统一按根目录 [DEPLOYMENT.md](../DEPLOYMENT.md) 操作。

生产机不要在源码目录执行 `git pull`、不要复制开发数据库，也不要用 `deploy-update.bat --pull`。正式流程是一键部署（自动取最新 Release、自动迁移）：

```powershell
.\deploy-prod.bat                    # 等价于 deploy-release.ps1 -Tag latest
.\deploy-release.ps1 -Tag vX.Y.Z     # 指定版本
```

开发机一键发版：

```powershell
.\make-release.ps1 [-Bump patch|minor|major] [-Tag vX.Y.Z] [-DryRun]
```

Release 中的 `deploy.mjs` 可在发布脚本内部调用以下命令：

```text
start / stop / status / extension:pack
db:migrate / db:seed / db:backup / db:import / db:restore / db:verify / db:doctor
```

设置 `SCIENCEING_RUNTIME_DIR=D:\Applications\scienceing-account-manager-app` 后，`.env`、`config.env`、`run`、`backups` 与 `data\scienceing.prod.db` 均位于稳定安装根目录；代码则从独立的 `releases\vX.Y.Z` 目录运行。
