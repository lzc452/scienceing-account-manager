import type { Migration } from './migration';

export const migration006: Migration = {
  version: 6,
  name: 'add_extension_claim_proofs',
  sql: `
    CREATE TABLE extension_claim_proofs (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      extension_id TEXT NOT NULL,
      extension_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    );
    CREATE INDEX idx_extension_claim_proofs_expiry ON extension_claim_proofs(expires_at);
  `,
};
