import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { LeasesService } from '../modules/leases/leases.service';
import { isDeploymentVerification } from '../lib/deploy-verification';

/**
 * DIRTY 账号的「清理回执超时」兜底。
 *
 * 触发条件：账号处于 DIRTY 且 dirty_since 已超过 purge_ack_timeout_seconds（默认 120s）。
 * 含义是那台机器没能确认清理——浏览器关了、扩展被禁用、或清理本身失败。
 * 此时唯一的退路是改密（客户端不可达，清不了）。
 *
 * 间隔沿用回收器的 15s：回执通常在归还后 1~3 秒内就到，
 * 超时后也不差这十几秒；频率再高只会空转查询。
 */
@Injectable()
export class DirtySweeper implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly leasesService: LeasesService) {}

  onModuleInit(): void {
    // 部署验证模式不跑后台任务：否则初始化期间会把 DIRTY 账号推进改密队列，污染验证结论
    if (isDeploymentVerification()) return;

    const intervalMs = Number(process.env.DIRTY_SWEEP_INTERVAL_MS ?? 15000);
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      try {
        const converted = this.leasesService.sweepDirtyAckTimeouts();
        if (converted > 0) {
          console.log(`[dirty] ${converted} 个账号清理确认超时，已转入改密`);
        }
      } catch (err) {
        console.error('[dirty] 清理超时扫描失败:', err);
      } finally {
        this.running = false;
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
