import { Injectable } from '@nestjs/common';
import type { HealthCheckDetail, HealthCheckExecutor, ResetExecutor, ResetJobInput, ResetJobResult } from './automation.types';
import { checkWorkerEnv, parseWorkerJson, runWorkerCli } from './worker-client';

/** Worker `reset` 命令 stdout 结构（worker.ts ResetJobResult）。 */
interface WorkerResetOutput {
  status?: 'SUCCESS' | 'FAILED';
  error?: string;
}

/** Worker `check` 命令 stdout 结构（health.ts HealthCheckDetail + ok）。 */
interface WorkerCheckOutput {
  adminLoginOk?: boolean;
  accountPageOk?: boolean;
  resetEntryOk?: boolean;
  error?: string;
}

/**
 * 真实改密执行器（t12 接线）：子进程调用 playwright/worker CLI 的 `reset` 命令。
 *
 * 说明：
 *  - Worker 负责真实浏览器操作（登录后台 → 定位账号 → 填新密码 → 校验「修改成功」）；
 *  - 本执行器只做编排：预检环境 → 子进程调用 → 解析 JSON → 映射为 ResetJobResult；
 *  - 浏览器崩溃、超时等异常在子进程内隔离，不会影响 NestJS API 进程。
 */
@Injectable()
export class PlaywrightResetExecutor implements ResetExecutor {
  async execute(input: ResetJobInput): Promise<ResetJobResult> {
    const envError = checkWorkerEnv();
    if (envError) return { success: false, error: envError };

    const result = await runWorkerCli(['reset', '--username', input.accountUsername, '--password', input.newPassword]);
    const output = parseWorkerJson<WorkerResetOutput>(result.raw);
    if (result.ok && output?.status === 'SUCCESS') {
      return { success: true };
    }
    // 失败路径优先取 Worker 的具体错误（如「账号未出现成功文案」），其次取子进程错误。
    const error = output?.error ?? result.error ?? 'Worker 输出无法解析';
    return { success: false, error };
  }
}

/**
 * 健康检查执行器（PRD §49）：子进程调用 Worker CLI 的 `check` 命令，
 * 返回「管理员登录 / 账号管理页 / 改密入口」三项，用于页面改版检测。
 */
@Injectable()
export class PlaywrightHealthExecutor implements HealthCheckExecutor {
  async check(): Promise<HealthCheckDetail> {
    const envError = checkWorkerEnv();
    if (envError) {
      return { adminLoginOk: false, accountPageOk: false, resetEntryOk: false, error: envError };
    }

    const result = await runWorkerCli(['check']);
    const output = parseWorkerJson<WorkerCheckOutput>(result.raw);
    if (!output || typeof output.adminLoginOk !== 'boolean') {
      return {
        adminLoginOk: false,
        accountPageOk: false,
        resetEntryOk: false,
        error: result.error ?? 'Worker check 输出无法解析',
      };
    }
    return {
      adminLoginOk: output.adminLoginOk,
      accountPageOk: output.accountPageOk ?? false,
      resetEntryOk: output.resetEntryOk ?? false,
      error: output.error,
    };
  }
}
