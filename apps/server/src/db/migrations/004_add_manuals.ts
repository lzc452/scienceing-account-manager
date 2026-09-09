import type { Migration } from './migration';

export const migration004: Migration = {
  version: 4,
  name: 'add_manuals',
  sql: `
    CREATE TABLE IF NOT EXISTS manuals (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_by INTEGER REFERENCES users(id),
      updated_at TEXT NOT NULL
    );
  `,
};
