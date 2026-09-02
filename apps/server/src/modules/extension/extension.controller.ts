import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';

@Controller('extension')
export class ExtensionController {
  constructor(private readonly dbService: DatabaseService) {}

  /** 插件配置（PRD §11 / §40），游客可访问。 */
  @Get('config')
  config() {
    const settings = this.readSettings();
    return {
      minimumVersion: settings['extension_min_version'] ?? '1.0.0',
      latestVersion: settings['extension_latest_version'] ?? '1.2.0',
      activityThrottleSeconds: Number(settings['activity_throttle_seconds'] ?? 5),
      warningSeconds: Number(settings['warning_seconds'] ?? 300),
      criticalWarningSeconds: Number(settings['critical_warning_seconds'] ?? 60),
    };
  }

  private readSettings(): Record<string, string> {
    const rows = this.dbService.db
      .prepare('SELECT key, value FROM system_settings')
      .all() as unknown as Array<{ key: string; value: string }>;
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  }
}
