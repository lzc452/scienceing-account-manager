import { Injectable } from '@nestjs/common';
import type { HealthCheckDetail, HealthCheckExecutor, ResetExecutor, ResetJobInput, ResetJobResult } from './automation.types';

/**
 * 生产中由 Playwright Worker（playwright/worker，t11）实现真实改密。
 * 受限沙箱无 Chromium（chromium.launch 报 spawn EPERM），此默认实现返回失败并说明原因；
 * 正常环境将其替换为真实 Worker 调用（import ResetWorker 或经 HTTP/子进程），契约见 automation.types.ts。
 */
@Injectable()
export class PlaywrightResetExecutor implements ResetExecutor {
  async execute(input: ResetJobInput): Promise<ResetJobResult> {
    return { success: false, error: `Playwright Worker 未接线（无 Chromium）：${input.accountCode}` };
  }
}

/**
 * 健康检查默认实现（PRD §49）：三项——管理员登录正常 / 账号管理页可访问 / 改密入口正常。
 * 受限沙箱无 Chromium，三项返回 false；正常环境替换为真实检查。
 */
@Injectable()
export class PlaywrightHealthExecutor implements HealthCheckExecutor {
  async check(): Promise<HealthCheckDetail> {
    return { adminLoginOk: false, accountPageOk: false, resetEntryOk: false, error: 'Playwright 不可用（无 Chromium）' };
  }
}
