import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ResetService } from './reset.service';

/** 回收队列处理器：周期性消费 PENDING reset_job（单 Worker 串行）。 */
@Injectable()
export class ResetQueueScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly resetService: ResetService) {}

  onModuleInit(): void {
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
