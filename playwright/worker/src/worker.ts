import { chromium, type Browser, type Page } from 'playwright';
import type { WorkerConfig } from './config';
import { isAuthenticated, loginAdmin, saveStorageState } from './auth';
import { performReset } from './reset-flow';
import { runQueueSerial, runWithRetry } from './pipeline';

/**
 * 密码重置队列任务输入（由 t12「回收队列接线」从 reset_jobs(PENDING) 组装）。
 *
 * newPassword 即 Phase 1 时后端已生成并加密暂存的 pending_password（明文），
 * 由后端解密后传给 Worker 填入科应后台表单（PRD §30）。
 */
export interface ResetJobInput {
  jobId?: number | string;
  accountCode: string;
  newPassword: string;
}

/** 密码重置任务结果（Worker → t12 回写 DB 的依据）。 */
export interface ResetJobResult {
  jobId?: number | string;
  accountCode: string;
  status: 'SUCCESS' | 'FAILED';
  attempts: number;
  error?: string;
}

/**
 * Playwright 单 Worker（PRD §28）。
 *
 * - 串行消费队列：run() 逐个处理，绝不并行登录管理员（避免会话互踢）。
 * - 会话复用：优先加载 playwright/.auth/admin.json，失效自动重登（PRD §29）。
 * - 两阶段改密 Phase 2：把 pending 新密码填进科应后台，校验“修改成功”后回 SUCCESS。
 * - 失败重试：最多 2～3 次，每次等待数秒并重新打开管理页（PRD §48）。
 */
export class ResetWorker {
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(private readonly config: WorkerConfig) {}

  /** 启动浏览器（单 Worker 只启动一次）。 */
  async launch(): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({
      channel: this.config.browserChannel,
      headless: this.config.headless,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    this.page = await this.browser.newPage();
    await this.page.setDefaultTimeout(this.config.defaultTimeoutMs);
  }

  /** 确保已登录（会话失效自动重登并更新 storageState，PRD §29）。 */
  async ensureAuthenticated(): Promise<void> {
    await this.launch();
    const page = this.page as Page;
    await page.goto(this.config.adminUrl);
    if (await isAuthenticated(page)) return;
    await loginAdmin(page, this.config);
    await saveStorageState(page.context(), this.config);
  }

  /**
   * 处理单个重置任务：成功校验通过 → SUCCESS；重试耗尽仍失败 → FAILED。
   * 每次尝试前都 ensureAuthenticated（覆盖“会话失效自动重登后继续”）。
   */
  async processJob(job: ResetJobInput): Promise<ResetJobResult> {
    const result = await runWithRetry(
      async () => {
        await this.ensureAuthenticated();
        return performReset(this.page as Page, this.config, job.accountCode, job.newPassword);
      },
      { maxAttempts: this.config.maxAttempts, retryDelayMs: this.config.retryDelayMs },
    );
    return { jobId: job.jobId, accountCode: job.accountCode, ...result };
  }

  /** 串行消费队列（PRD §28：单 Worker，逐个完成，不并行）。 */
  async run(jobs: ResetJobInput[]): Promise<ResetJobResult[]> {
    return runQueueSerial(jobs, (job) => this.processJob(job));
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
      this.page = null;
    }
  }
}
