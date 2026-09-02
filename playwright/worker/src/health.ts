import type { Browser } from 'playwright';
import type { WorkerConfig } from './config';
import { openAuthenticatedSession } from './auth';
import { anyResetIcon, buildSelectors } from './selectors';

/** 科应后台健康检查结果（PRD §49：管理员登录 / 账号管理页 / 改密入口三项）。 */
export interface HealthCheckDetail {
  adminLoginOk: boolean;
  accountPageOk: boolean;
  resetEntryOk: boolean;
  error?: string;
}

/**
 * 三项健康检查（PRD §49，页面改版检测的降级点）：
 *  - adminLoginOk：登录态有效（openAuthenticatedSession 成功即含 storageState 复用与自动重登）
 *  - accountPageOk：账号管理页筛选组件可见（真实科应无独立 heading，用筛选区做就绪判据）
 *  - resetEntryOk：账号列表存在重置 icon（icon-zhongzhimima，改密入口可用）
 *
 * 时序注意：筛选区先渲染、表格行数据异步 XHR 加载，因此两项都用 waitFor（最多 15s）等元素
 * 出现，而不是「页面就绪后立即 isVisible/count」——否则会把加载中的页面误判为改版。
 * 任一项不满足时返回 error 说明，便于运维定位「科应页面改版 / 凭据失效」。
 */
export async function checkHealth(browser: Browser, config: WorkerConfig): Promise<HealthCheckDetail> {
  try {
    const { page } = await openAuthenticatedSession(browser, config);
    const s = buildSelectors(page);
    const accountPageOk = await s.accountPageReady
      .waitFor({ state: 'visible', timeout: config.defaultTimeoutMs })
      .then(() => true)
      .catch(() => false);
    // 表格数据可能晚于筛选区出现，等待第一个重置 icon 可见。
    const resetEntryOk = await anyResetIcon(page)
      .waitFor({ state: 'visible', timeout: config.defaultTimeoutMs })
      .then(() => true)
      .catch(() => false);
    const error =
      accountPageOk && resetEntryOk
        ? undefined
        : '科应后台页面元素与 selectors.ts 描述不一致（PRD §49 页面改版检测）';
    return { adminLoginOk: true, accountPageOk, resetEntryOk, error };
  } catch (err) {
    return {
      adminLoginOk: false,
      accountPageOk: false,
      resetEntryOk: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
