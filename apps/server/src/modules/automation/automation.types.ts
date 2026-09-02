/** Playwright 自动化集成契约（与 playwright/worker README 对齐）。 */

export interface ResetJobInput {
  jobId: number;
  accountCode: string;
  /** 后端解密的 pending 明文密码（Phase 1 生成） */
  newPassword: string;
}

export interface ResetJobResult {
  success: boolean;
  error?: string;
}

/** 改密执行器：生产中由 Playwright Worker（t11）实现；测试用 mock。 */
export interface ResetExecutor {
  execute(input: ResetJobInput): Promise<ResetJobResult>;
}

export interface HealthCheckDetail {
  adminLoginOk: boolean;
  accountPageOk: boolean;
  resetEntryOk: boolean;
  error?: string;
}

/** 健康检查执行器（PRD §49）：管理员登录/账号管理页/改密入口三项。 */
export interface HealthCheckExecutor {
  check(): Promise<HealthCheckDetail>;
}

export const RESET_EXECUTOR = 'RESET_EXECUTOR';
export const HEALTH_EXECUTOR = 'HEALTH_EXECUTOR';
