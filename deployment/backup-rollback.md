# SQLite 备份、恢复和回滚

Windows 的完整流程及命令见 [部署说明](../DEPLOYMENT.md)。备份、首次导入和恢复均复用 `apps/server/src/db/backup.ts` 中的原生 SQLite Backup API，包含已提交 WAL，不复制在线主文件。

1. 每次发布在确认旧应用停止后强制备份；失败就中止发布。
2. 生产服务每日 02:00 备份，超过 24 小时没有有效快照时启动补备份，保留 30 天。备份先写临时文件，通过 `integrity_check` / `foreign_key_check` 后再发布为快照文件。
3. 迁移及登记整批事务提交，失败回滚。恢复仅在确认新应用完全停止后进行；停止失败时不触碰数据库。
4. 恢复前验证备份；保留失败主库、WAL、SHM 为 `.failed-*`，并从快照恢复。启动与该快照匹配的旧版本，禁止再次启动失败的新版本。
5. 原 `SCIENCEING_MASTER_KEY` 必须保留在部署机，否则账号密文不能解密。恢复不修改密码、不 seed、不删业务记录、不手改迁移版本。

维护工具入口（执行前先用当前 Release 的 `deploy.mjs stop` 并检查退出码）：

```powershell
$env:SCIENCEING_RUNTIME_DIR = Join-Path $env:LOCALAPPDATA 'scienceing-account-manager\production'
node .\deploy-lan\scripts\deploy.mjs db:backup --reason manual
node .\deploy-lan\scripts\deploy.mjs db:restore --source "C:\替换为发布前备份的完整路径.db"
```

原数据库、快照、`.failed-*`、`.partial-*`、密钥、认证状态仅保留在部署机，不同步到开发机，也不进入 Git 或发布 ZIP。人工恢复的版本选择、端口确认和完整命令见部署说明第 6 节。
