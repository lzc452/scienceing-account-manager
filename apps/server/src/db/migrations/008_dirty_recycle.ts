import type { Migration } from './migration';

/**
 * 引入 `DIRTY`（回收隔离态）与改密窗口字段。
 *
 * 为什么必须重建表：`001_init_schema` 对 `status` 写了
 * `CHECK (status IN ('AVAILABLE','IN_USE','RECYCLING','ERROR'))`，
 * 而 SQLite 无法修改 CHECK 约束，只能换表（12 步法）。
 *
 * 设计要点：
 *  - `DIRTY` = 服务端**没有**改密任务，等客户端确认清理；`RECYCLING` = 服务端正在/已排队改密。
 *  - `rotation_due_reason` 非空表示「欠一次改密」，`rotation_not_before` 是 24h 频次护栏的解禁时间。
 *    这样不需要为 DIRTY 再造更多状态，避免状态机膨胀。
 *  - `leases` 只加列不重建（避免动 reset_jobs/audit_logs 的外键），记录清理证据用于审计与复核。
 *
 * 迁移执行器约束（见 db/migrate.ts）：SQL 内禁止 BEGIN/COMMIT/PRAGMA、checks 必须是只读 SELECT。
 * 因此「重建前的行数/编号快照」用 TEMP 表保存，checks 里比对；TEMP 表不进 sqlite_master 指纹。
 */
export const migration008: Migration = {
  version: 8,
  name: 'dirty_recycle',
  foreignKeysOff: true,
  preconditions: [
    // 存量状态必须是四个旧值之一，避免手工改库留下的脏值被静默吞掉
    "SELECT id FROM scienceing_accounts WHERE status NOT IN ('AVAILABLE','IN_USE','RECYCLING','ERROR')",
    // code 有 UNIQUE 约束，重复会让重建后的插入失败；提前给出可读错误
    'SELECT code FROM scienceing_accounts GROUP BY code HAVING COUNT(*) > 1',
    // 必填列不得为空，否则重建时 NOT NULL 会失败在半途
    "SELECT id FROM scienceing_accounts WHERE code IS NULL OR TRIM(code) = '' OR username IS NULL OR TRIM(username) = ''",
  ],
  sql: `
    CREATE TEMP TABLE __mig008_guard AS
      SELECT id, code, status FROM scienceing_accounts;

    CREATE TABLE scienceing_accounts_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      current_password_ciphertext TEXT,
      pending_password_ciphertext TEXT,
      status TEXT NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN ('AVAILABLE','IN_USE','DIRTY','RECYCLING','ERROR')),
      last_password_changed_at TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      dirty_since TEXT,
      purge_attempts INTEGER NOT NULL DEFAULT 0,
      last_purge_ack_at TEXT,
      rotation_due_reason TEXT
        CHECK (rotation_due_reason IS NULL OR rotation_due_reason IN
          ('ACK_TIMEOUT','PURGE_FAILED','PASSWORD_EXPIRED','ADMIN_REQUEST','INACTIVITY_TIMEOUT')),
      rotation_not_before TEXT
    );

    INSERT INTO scienceing_accounts_new (
      id, code, username, current_password_ciphertext, pending_password_ciphertext,
      status, last_password_changed_at, enabled, created_at, updated_at,
      dirty_since, purge_attempts, last_purge_ack_at, rotation_due_reason, rotation_not_before
    )
    SELECT
      id, code, username, current_password_ciphertext, pending_password_ciphertext,
      status, last_password_changed_at, enabled, created_at, updated_at,
      NULL, 0, NULL, NULL, NULL
    FROM scienceing_accounts;

    DROP TABLE scienceing_accounts;
    ALTER TABLE scienceing_accounts_new RENAME TO scienceing_accounts;

    ALTER TABLE leases ADD COLUMN purge_ack_at TEXT;
    ALTER TABLE leases ADD COLUMN purge_method TEXT
      CHECK (purge_method IS NULL OR purge_method IN ('PAGE','BROWSING_DATA','FAILED'));
    ALTER TABLE leases ADD COLUMN purge_detail TEXT;
  `,
  checks: [
    // 快照里的每一行都必须还在
    'SELECT id FROM __mig008_guard EXCEPT SELECT id FROM scienceing_accounts',
    'SELECT 1 WHERE (SELECT COUNT(*) FROM __mig008_guard) <> (SELECT COUNT(*) FROM scienceing_accounts)',
    // 关键字段不得漂移（code 决定账号编号展示，status 决定可发放性）
    "SELECT g.id FROM __mig008_guard g JOIN scienceing_accounts a ON a.id = g.id "
      + 'WHERE g.code IS NOT a.code OR g.status IS NOT a.status',
    // 不允许产生孤儿租约（换表过程中外键关闭，必须显式校验）
    'SELECT id FROM leases WHERE account_id NOT IN (SELECT id FROM scienceing_accounts)',
    // 新状态集合自检
    "SELECT id FROM scienceing_accounts WHERE status NOT IN ('AVAILABLE','IN_USE','DIRTY','RECYCLING','ERROR')",
  ],
};
