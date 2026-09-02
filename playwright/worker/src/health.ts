import type { Browser } from 'playwright';
import type { WorkerConfig } from './config';
import { openAuthenticatedSession } from './auth';
import { buildSelectors } from './selectors';

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
 *  - accountPageOk：账号管理页标题可见
 *  - resetEntryOk：账号表格中存在「重置密码」按钮（改密入口可用）
 * 任一项不满足时返回 error 说明，便于运维定位「科应页面改版 / 凭据失效」。
 */
export async function checkHealth(browser: Browser, config: WorkerConfig): Promise<HealthCheckDetail> {
  try {
    const { page } = await openAuthenticatedSession(browser, config);
    const s = buildSelectors(page);
    const accountPageOk = await s.accountManagementHeading.isVisible().catch(() => false);
    const resetButtons = page.getByRole('button', { name: '重置密码' });
    const resetEntryOk = (await resetButtons.count().catch(() => 0)) > 0;
    const error =
      accountPageOk && resetEntryOk
        ? undefined
        : '科应后台页面元素与 selectors.ts 语义描述不一致（PRD §49 页面改版检测）';
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
