# 监控、告警与巡检

> 单机 MVP：优先「可观测的 SQL 巡检 + 端点健康探针」，不引入独立监控栈（PRD §3 不上额外基础设施）。

## 1. 核心健康探针

| 探针 | 地址 | 期望 | 异常含义 |
|---|---|---|---|
| 账号池可用性 | `GET /api/accounts/availability` | HTTP 200，`total=10` | 服务不可用 / 库异常 |
| 扩展配置 | `GET /api/extension/config` | HTTP 200，`minimumVersion` 存在 | 服务不可用 |
| 自动化健康检查 | `GET /api/admin/automation/health`（admin 会话） | 三项 `adminLoginOk/accountPageOk/resetEntryOk` | 科应后台改版 / 管理员会话失效 / 改密入口变化（PRD §49） |

> 建议由外部探针（cron + curl / 运维平台）每 1 分钟探测 `availability`，连续 3 次失败告警。

## 2. 关键 SQL 巡检项（每日/每小时）

以下 SQL 用 `node:sqlite` 或 `sqlite3` 对 `data/scienceing.db` 执行：

### 2.1 账号池状态分布（核心可用性）

```sql
SELECT status, COUNT(*) AS n FROM scienceing_accounts WHERE enabled = 1 GROUP BY status;
```

- **告警**：`ERROR > 0` 且持续超 1 小时 → 改密失败积压，需人工介入。
- 期望常态：`AVAILABLE ≥ 1`（保证有人能领）。

### 2.2 回收队列积压（重置失败数 / 积压）

```sql
SELECT status, COUNT(*) AS n FROM reset_jobs GROUP BY status;
-- 积压（长时间 PENDING/RUNNING 未收敛）
SELECT id, account_id, status, attempt_count, created_at
  FROM reset_jobs
 WHERE status IN ('PENDING','RUNNING')
   AND created_at < datetime('now','-1 hour');
```

- **告警**：`FAILED` 数量激增，或 `PENDING/RUNNING` 超过 1 小时未收敛 → 队列卡死 / Worker 异常。
- 说明：`FAILED` 任务对应账号已落 `ERROR`（R9），**不会自动转 AVAILABLE**，需管理员在 `/admin/accounts` 处置（重试 / 人工处理完成）。

### 2.3 活动租约超龄（即将释放 / 异常滞留）

```sql
SELECT l.id, a.code, u.display_name, l.last_activity_at
  FROM leases l
  JOIN scienceing_accounts a ON a.id = l.account_id
  JOIN users u ON u.id = l.user_id
 WHERE l.status = 'ACTIVE';
```

- `last_activity_at` 距今 > 30 分钟却仍 `ACTIVE` → 回收调度器异常（正常应由 `TimeoutScheduler` 转 RECYCLING）。

### 2.4 数据库文件健康

```bash
ls -la data/scienceing.db*   # 关注 -wal/-shm 是否异常增长
```

- WAL 文件长期不缩小 → 可 `PRAGMA wal_checkpoint(TRUNCATE);` 收拢（低峰期执行）。

## 3. 告警阈值建议

| 指标 | 阈值 | 动作 |
|---|---|---|
| 服务可用性探针 | 连续 3 次失败 | 告警 + 重启后端 |
| `ERROR` 账号数 | > 0 持续 1 小时 | 告警，人工处置 |
| `reset_jobs` PENDING/RUNNING 积压 | > 1 小时未收敛 | 告警，检查 Worker/Chromium |
| `FAILED` 任务数 | 单日 > 10 | 告警，核查科应后台是否改版（PRD §49） |
| 自动化健康检查 | 任一非 ok | 告警，核查 selectors/凭据 |
| 磁盘占用 | data/ 目录 > 80% 盘 | 告警，扩容/清理旧备份 |

## 4. 日志与审计

- **审计日志**：`GET /api/admin/logs`（admin），动作覆盖 LOGIN/CLAIM_ACCOUNT/ACTIVITY/RELEASE/TIMEOUT/RESET_PASSWORD/RESET_SUCCESS/RESET_FAILED/ADMIN_FORCE_RELEASE/ADMIN_MANUAL_FIX 等；`ACTIVITY` 量大，管理后台默认隐藏、可开「显示 Activity 明细」开关（PRODUCT-DESIGN §5.8）。
- **敏感红线**：审计 `metadata` 绝不落科应密码/管理员凭据/搜索词/页面内容（PRD §58），后端已在写入侧保证。
- **进程日志**：后端 stdout/stderr（Nest Logger）+ Worker 的失败信息，建议重定向到文件并由日志采集器（可选）接管。

## 5. 巡检频率建议

| 频率 | 项 |
|---|---|
| 每 1 分钟 | 可用性探针 |
| 每小时 | 账号池状态分布、队列积压 |
| 每日 | 全量 SQL 巡检 + 数据库备份（见 backup-rollback.md）+ 自动化健康检查 |
| 每周 | 审计日志抽查（有无异常 RESET_FAILED 潮）、磁盘/备份滚动清理 |
