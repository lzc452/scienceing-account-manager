import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RotationService } from './rotation.service';
import { isDeploymentVerification } from '../../lib/deploy-verification';

/**
 * 30 天超期改密清扫调度器。
 *
 * 间隔默认 5 分钟：密码有效期以「天」计，清扫频率再高也没有意义，
 * 反而会与单 Worker 的改密队列抢时间片。可用 ROTATION_INTERVAL_MS 覆盖。
 *
 * 与 ResetQueueScheduler 的差别：那个是「消费队列」（10s，必须及时），
 * 这个是「生产任务」（低频，且服务层内部会在队列忙时整轮让路）。
 */
@Injectable()
export class RotationScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  /** 防止上一轮未跑完时重入：清扫里要解密候选密码，比轮询任务重得多。 */
  private running = false;

  constructor(private readonly rotationService: RotationService) {}

  onModuleInit(): void {
    // 部署验证模式不起任何后台任务：迁移/校验期间改密会污染验证结论
    if (isDeploymentVerification()) return;

    const intervalMs = Number(process.env.ROTATION_INTERVAL_MS ?? 300_000);
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      try {
        const result = this.rotationService.sweepOverdueRotations();
        if (result.enqueued > 0 || result.deferred > 0) {
          console.log(
            `[rotation] 扫描 ${result.scanned} / 排入 ${result.enqueued} / 推迟 ${result.deferred}`
              + ` / 跳过 ${JSON.stringify(result.skipped)}`,
          );
        }
      } catch (err) {
        // 清扫失败不能影响主进程：下一轮会重试
        console.error('[rotation] 超期清扫失败:', err);
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
