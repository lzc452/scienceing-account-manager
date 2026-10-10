import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ResetService } from './reset.service';
import { isDeploymentVerification } from '../../lib/deploy-verification';

/** 回收队列处理器：周期性消费 PENDING reset_job（单 Worker 串行）。 */
@Injectable()
export class ResetQueueScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly resetService: ResetService) {}

  onModuleInit(): void {
    if (isDeploymentVerification()) return;
    // 启动即清扫：上个进程若在 RUNNING 中途退出，该 job 会永久卡住（调度器只捡 PENDING）。
    try {
      const swept = this.resetService.sweepStaleRunningJobs();
      if (swept > 0) console.warn(`[reset] 启动清扫：${swept} 个遗留 RUNNING job 已退回 PENDING`);
    } catch (err) {
      console.error('[reset] 启动清扫失败:', err);
    }

    const intervalMs = Number(process.env.RESET_INTERVAL_MS ?? 10000);
    this.timer = setInterval(() => {
      void this.resetService.processPendingJobs().catch((err: unknown) => {
        console.error('[reset] 队列处理失败:', err);
      });
    }, intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
