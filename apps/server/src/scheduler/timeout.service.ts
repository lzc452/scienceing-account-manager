import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { LeasesService } from '../modules/leases/leases.service';

/**
 * 超时回收调度器（PRD §25）：每 10~30 秒执行一次（默认 15s，可用 RECYCLE_INTERVAL_MS 覆盖）。
 * 核心回收逻辑在 LeasesService.recycleTimedOutLeases（条件原子 UPDATE，R6）。
 */
@Injectable()
export class TimeoutScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly leasesService: LeasesService) {}

  onModuleInit(): void {
    const intervalMs = Number(process.env.RECYCLE_INTERVAL_MS ?? 15000);
    this.timer = setInterval(() => {
      try {
        this.leasesService.recycleTimedOutLeases();
      } catch (err) {
        console.error('[scheduler] 回收失败:', err);
      }
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
