import { migration001 } from './migrations/001_init_schema';
import { migration002 } from './migrations/002_add_sessions';
import { migration003 } from './migrations/003_settings_inactivity_minutes';
import { migration004 } from './migrations/004_add_manuals';
import { migration005 } from './migrations/005_add_first_login_flag';
import { migration006 } from './migrations/006_add_extension_claim_proofs';
import { migration007 } from './migrations/007_settings_lease_rule_hours';
import type { Migration } from './migrations/migration';

export type { Migration } from './migrations/migration';

/**
 * 迁移只能追加；已经发布的 version/name/sql 不得修改。
 * 每个迁移由 migrate.ts 在独立事务中执行并登记到 schema_migrations。
 */
export const MIGRATIONS: readonly Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS.at(-1)?.version ?? 0;
