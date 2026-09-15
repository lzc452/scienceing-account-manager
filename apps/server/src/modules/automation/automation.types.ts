/** Playwright 自动化集成契约（与 playwright/worker README 对齐）。 */

export interface ResetJobInput {
  jobId: number;
  /**
   * 目标科应共享账号的 username（不是 code）—— Worker 用它在科应后台
   * `/account/management/list` 页面定位对应行（td[title=username]）。
   */
  accountUsername: string;
  /** 后端解密的 pending 明文密码（Phase 1 生成） */
  newPassword: string;
}

export interface ResetJobResult {
  success: boolean;
  error?: string;
  /**
   * 致命失败：环境/配置层面的问题，重试再多次也不会成功
   * （如缺少 Worker 环境变量、Worker CLI 未构建）。
   *
   * 这类失败**不得**计入 attempt_count：否则一次配置疏漏会在几十秒内
   * 把整池已释放账号逐个烧成 ERROR，且每个都白跑 3 轮浏览器。
   */
  fatal?: boolean;
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
