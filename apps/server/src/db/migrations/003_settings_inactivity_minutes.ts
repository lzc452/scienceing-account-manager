import type { Migration } from './migration';

export const migration003: Migration = {
  version: 3,
  name: 'settings_inactivity_minutes',
  sql: `
    UPDATE system_settings
    SET key = 'inactivity_timeout_minutes',
        value = CAST(MAX(1, ROUND(CAST(value AS REAL) / 60.0)) AS INTEGER)
    WHERE key = 'inactivity_timeout_seconds' AND CAST(value AS REAL) > 0;
    DELETE FROM system_settings WHERE key = 'inactivity_timeout_seconds';
  `,
};
