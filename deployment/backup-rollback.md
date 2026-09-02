# 数据库备份与回滚

> SQLite 单文件 + WAL 模式。备份/回滚核心是**安全复制数据库文件**；生产建议定期全量备份 + 保留 N 份滚动。

## 1. 备份（在线安全备份）

SQLite 官方推荐 `VACUUM INTO`（一致性快照，无需停服）：

```sql
-- 在 sqlite3 中执行（或通过 node:sqlite / sqlite3 CLI）
VACUUM INTO '/backup/scienceing-<timestamp>.db';
```

用 `sqlite3` CLI（未安装则 `npx sqlite3` 或直接文件复制见下）：

```bash
sqlite3 /var/lib/scienceing/scienceing.db "VACUUM INTO '/backup/scienceing-$(date +%Y%m%d-%H%M%S).db';"
```

> 备选（低并发下可接受）：直接文件复制。因 WAL 未 checkpoint 的数据在 `-wal` 文件里，需连 `-wal`/`-shm` 一起拷，或先 `PRAGMA wal_checkpoint(TRUNCATE);` 再拷主库。

## 2. 备份脚本（PowerShell / Bash）

PowerShell：

```powershell
$db = $env:DATABASE_PATH ?? "data/scienceing.db"
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$bak = "backup/scienceing-$ts.db"
New-Item -ItemType Directory -Force backup | Out-Null
# 用 node:sqlite 执行 VACUUM INTO（避免依赖 sqlite3 CLI）
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec(\"VACUUM INTO '\"+process.argv[2]+\"'\");console.log('backup ok')" $db $bak
```

Bash：

```bash
#!/usr/bin/env bash
set -euo pipefail
DB="${DATABASE_PATH:-data/scienceing.db}"
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p backup
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec(\"VACUUM INTO '\"+process.argv[2]+\"'\");console.log('backup ok')" "$DB" "backup/scienceing-$TS.db"
# 滚动保留最近 30 份
ls -1t backup/scienceing-*.db 2>/dev/null | tail -n +31 | xargs -r rm -f
```

## 3. 回滚（恢复）

```bash
# 1. 停后端（避免写入）
# 2. 用备份覆盖主库（含清理 WAL 残留）
cp backup/scienceing-<timestamp>.db /var/lib/scienceing/scienceing.db
rm -f /var/lib/scienceing/scienceing.db-wal /var/lib/scienceing/scienceing.db-shm
# 3. 重启后端（DatabaseService 启动时自动 migrate，幂等）
```

## 4. 应急：仅回滚某个账号密码

场景：某账号改密失败落入 `ERROR`，希望恢复旧密码继续可用（管理员确认旧密码仍有效时）：

```sql
-- 将 pending 清空、状态置回 AVAILABLE（current_password_ciphertext 保持 OLD 不动）
UPDATE scienceing_accounts
   SET pending_password_ciphertext = NULL,
       status = 'AVAILABLE',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE code = 'KY-03' AND status = 'ERROR';
```

> 注意：仅当管理员能确认「科应侧密码未被改成 pending 值」时才可这样回滚；否则请走「人工处理完成」（`/admin/accounts/{id}/mark-available`）并在科应后台手动核对密码。

## 5. 回滚注意事项

- `schema_migrations` 表随库一起备份，恢复后 `migrate` 幂等跳过已应用版本。
- 若备份与代码版本不一致（新代码含新迁移），恢复旧库后启动会自动补齐新迁移；若代码回退且库含新迁移，则需人工处理——**建议「先备份库，再升级代码」**。
- 敏感文件（`playwright/.auth/admin.json`、`.env`）不在库内，需单独备份到安全位置（不落 Git）。
