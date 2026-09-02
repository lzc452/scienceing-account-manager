export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * 六张表 migration（PRD §39）：
 *   users / scienceing_accounts / leases / reset_jobs / audit_logs / system_settings
 *
 * 含 R1/R2 防御性部分唯一索引（PRD §57）：同一账号、同一用户同一时间最多一个 ACTIVE lease。
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'init_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        department TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','ADMIN')),
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scienceing_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL,
        current_password_ciphertext TEXT,
        pending_password_ciphertext TEXT,
        status TEXT NOT NULL DEFAULT 'AVAILABLE'
          CHECK (status IN ('AVAILABLE','IN_USE','RECYCLING','ERROR')),
        last_password_changed_at TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS leases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lease_token_hash TEXT NOT NULL UNIQUE,
        account_id INTEGER NOT NULL REFERENCES scienceing_accounts(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'ACTIVE'
          CHECK (status IN ('ACTIVE','RELEASE_REQUESTED','RECYCLING','RELEASED','FAILED')),
        started_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        release_requested_at TEXT,
        released_at TEXT,
        release_reason TEXT
          CHECK (release_reason IN ('USER_RETURN','INACTIVITY_TIMEOUT','ADMIN_FORCE','RESET_ERROR')),
        extension_version TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reset_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL REFERENCES scienceing_accounts(id),
        lease_id INTEGER REFERENCES leases(id),
        status TEXT NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING','RUNNING','SUCCESS','FAILED')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        account_id INTEGER REFERENCES scienceing_accounts(id),
        lease_id INTEGER REFERENCES leases(id),
        action TEXT NOT NULL,
        result TEXT NOT NULL,
        ip TEXT,
        user_agent TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_leases_one_active_account
        ON leases(account_id) WHERE status = 'ACTIVE';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_leases_one_active_user
        ON leases(user_id) WHERE status = 'ACTIVE';

      CREATE INDEX IF NOT EXISTS idx_leases_account ON leases(account_id);
      CREATE INDEX IF NOT EXISTS idx_leases_user ON leases(user_id);
      CREATE INDEX IF NOT EXISTS idx_reset_jobs_status ON reset_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
    `,
  },
  {
    version: 2,
    name: 'add_sessions',
    sql: `
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    `,
  },
];
