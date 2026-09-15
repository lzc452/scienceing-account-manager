import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AuthService } from './auth.service';

/** 默认 30 分钟清扫一次；可用 SESSION_SWEEP_INTERVAL_MS 覆盖。 */
const DEFAULT_INTERVAL_MS = 30 * 60_000;

/**
 * 过期会话清扫调度器（L2-15）。
 *
 * 会话过期目前只在 `resolveUserByToken` 里被「按需拒绝」——行本身会永远留在
 * sessions 表里，随登录次数无限累积。这里周期性删除，既控制表体积，
 * 也让「已过期会话」不再是一种长期驻留的状态。
 */
@Injectable()
export class SessionSweepScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly authService: AuthService) {}

  onModuleInit(): void {
    // 启动先扫一次：进程可能已停机很久，表里会积压大量过期行。
    this.runOnce();

    const configured = Number(process.env.SESSION_SWEEP_INTERVAL_MS);
    const intervalMs = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_INTERVAL_MS;
    this.timer = setInterval(() => this.runOnce(), intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private runOnce(): void {
    try {
      const removed = this.authService.sweepExpiredSessions();
      if (removed > 0) console.log(`[auth] 已清扫 ${removed} 个过期会话`);
    } catch (err) {
      console.error('[auth] 过期会话清扫失败:', err);
    }
  }
}
