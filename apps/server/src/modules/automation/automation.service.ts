import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { nowIso } from '../../db/config';
import { HEALTH_EXECUTOR, type HealthCheckDetail, type HealthCheckExecutor } from './automation.types';

export interface HealthCheckResult {
  adminLoginOk: boolean;
  accountPageOk: boolean;
  resetEntryOk: boolean;
  checkedAt: string;
}

const HEALTH_RESULT_KEY = 'automation_health_result';

@Injectable()
export class AutomationService {
  constructor(
    private readonly dbService: DatabaseService,
    @Inject(HEALTH_EXECUTOR) private readonly healthExecutor: HealthCheckExecutor,
  ) {}

  /** 读取最近一次健康检查结果（无则 null）。 */
  getLastHealth(): HealthCheckResult | null {
    const row = this.dbService.db
      .prepare('SELECT value FROM system_settings WHERE key = ?')
      .get(HEALTH_RESULT_KEY) as unknown as { value: string } | undefined;
    if (!row) return null;
    try {
      const parsed: unknown = JSON.parse(row.value);
      return parsed as HealthCheckResult;
    } catch {
      return null;
    }
  }

  /** 执行健康检查（PRD §49），持久化结果并返回。可注入 executor 便于测试。 */
  async checkHealth(executor?: HealthCheckExecutor): Promise<HealthCheckResult> {
    const exec = executor ?? this.healthExecutor;
    const detail: HealthCheckDetail = await exec.check();
    const result: HealthCheckResult = {
      adminLoginOk: detail.adminLoginOk,
      accountPageOk: detail.accountPageOk,
      resetEntryOk: detail.resetEntryOk,
      checkedAt: nowIso(),
    };
    this.dbService.db
      .prepare('INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(HEALTH_RESULT_KEY, JSON.stringify(result));
    return result;
  }
}
