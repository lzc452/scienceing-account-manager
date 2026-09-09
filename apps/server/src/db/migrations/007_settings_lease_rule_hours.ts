import type { Migration } from './migration';

export const migration007: Migration = {
  version: 7,
  name: 'settings_lease_rule_hours',
  sql: `
    INSERT OR IGNORE INTO system_settings (key, value)
    SELECT 'inactivity_timeout_hours',
           CASE
             WHEN TRIM(value) = '30' THEN '24'
             WHEN CAST(value AS INTEGER) > 0
               THEN CAST(MAX(1, (CAST(value AS INTEGER) + 59) / 60) AS INTEGER)
             ELSE '24'
           END
      FROM system_settings
     WHERE key = 'inactivity_timeout_minutes';

    INSERT OR IGNORE INTO system_settings (key, value)
    SELECT 'warning_hours',
           CASE
             WHEN TRIM(value) = '300' THEN '2'
             WHEN CAST(value AS INTEGER) > 0
               THEN CAST(MAX(1, (CAST(value AS INTEGER) + 3599) / 3600) AS INTEGER)
             ELSE '2'
           END
      FROM system_settings
     WHERE key = 'warning_seconds';

    INSERT OR IGNORE INTO system_settings (key, value)
    SELECT 'critical_warning_hours',
           CASE
             WHEN TRIM(value) = '60' THEN '1'
             WHEN CAST(value AS INTEGER) > 0
               THEN CAST(MAX(1, (CAST(value AS INTEGER) + 3599) / 3600) AS INTEGER)
             ELSE '1'
           END
      FROM system_settings
     WHERE key = 'critical_warning_seconds';

    INSERT OR IGNORE INTO system_settings (key, value) VALUES
      ('inactivity_timeout_hours', '24'),
      ('warning_hours', '2'),
      ('critical_warning_hours', '1');

    DELETE FROM system_settings
     WHERE key IN ('inactivity_timeout_minutes', 'warning_seconds', 'critical_warning_seconds');
  `,
};
