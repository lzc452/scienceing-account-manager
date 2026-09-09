import type { Migration } from './migration';

export const migration005: Migration = {
  version: 5,
  name: 'add_first_login_flag',
  sql: `
    ALTER TABLE users ADD COLUMN first_login_at TEXT;
    ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
  `,
};
