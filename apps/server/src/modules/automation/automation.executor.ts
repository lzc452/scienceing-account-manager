import { Injectable } from '@nestjs/common';
import type { HealthCheckDetail, HealthCheckExecutor, ResetExecutor, ResetJobInput, ResetJobResult } from './automation.types';
import { checkWorkerEnv, parseWorkerJson, runWorkerCli } from './worker-client';
import { redactSecrets } from '../../lib/redact';

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
    // 环境预检失败属致命错误：重试不会让缺失的环境变量出现，
    // 标记 fatal 让队列暂停并上报配置问题，而不是把账号一个个烧成 ERROR。
    const envError = checkWorkerEnv();
    if (envError) return { success: false, error: envError, fatal: true };

    // 口令经 stdin 传入（不进 argv、不进进程列表）；--job-id 用于结果文件归属校验。
    const result = await runWorkerCli(
      ['reset', '--job-id', String(input.jobId), '--username', input.accountUsername, '--password-stdin'],
      { stdin: input.newPassword, expectJobId: input.jobId },
    );
    const output = parseWorkerJson<WorkerResetOutput>(result.raw);
    // 只要 Worker 明确给出 SUCCESS 就判定成功——即便进程超时、退出码非 0 或被强杀。
    // 此前额外要求 result.ok 会丢弃「已打印 SUCCESS 但未正常退出」的结果，
    // 导致平台口令已改、库里却记失败，最终账号被标 ERROR 且密文与平台发散。
    if (output?.status === 'SUCCESS') {
      return { success: true };
    }
    // 失败路径优先取 Worker 的具体错误（如「账号未出现成功文案」），其次取子进程错误。
    // 脱敏后再外传：该文案会写入 reset_jobs.error_message 与审计 metadata。
    const error = redactSecrets(output?.error ?? result.error ?? 'Worker 输出无法解析', [input.newPassword]);
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
