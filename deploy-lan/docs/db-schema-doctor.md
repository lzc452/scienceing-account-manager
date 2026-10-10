# 数据库只读检查

`db-doctor` 复用后端已编译的版本迁移定义，检查数据库结构、SHA256、版本登记、`integrity_check` 和 `foreign_key_check`，不会补表、补列、写迁移记录或置用户标志。历史的 `--fix`、`--no-backup`、`--set-must-change` 已禁用。

```powershell
node deploy-lan\scripts\db-doctor.mjs --database "D:\Applications\scienceing-account-manager\data\scienceing.db" --json
node apps\server\dist\db\schema.js --database "D:\Applications\scienceing-account-manager\data\scienceing.db" > prod-schema.json
```

第一条检查是否已可供新版本启动：0 表示完整就绪，1 表示结构/迁移状态尚未就绪，2 表示参数、目标或检查工具错误。旧库缺少校验值时第一条会返回 1，第二条仍可输出实际结构及可匹配的版本；这是基线升级前的正常状态。

目标按 `--database`、`DATABASE_PATH`、环境对应的独立数据目录确定。显式目标不存在时立刻失败，不回落到其它数据库。缺少编译工具时先构建或使用新 Release，禁止解析旧源码来自动修复生产库。

无登记的旧业务库必须在实际结构和原发布记录确认后明确选择基线；相同结构可能对应多个仅修改数据的版本。结构差异不能靠手改登记、重复 SQL 或模型同步掩盖。完整的基线、演练副本、部署和恢复流程见 [根部署说明](../../DEPLOYMENT.md)。结构报告不含业务行，数据库及备份不得传回开发机。
