/**
 * 驱动科应站点自身的「退出登录」（V3/V4 共用）。
 *
 * 为什么不用接口：注销接口要求 `code / lk / sign / timestamp / ip` 请求签名，
 * 裸调用会被业务层拒绝（HTTP 200 但 returnCode=3002/6006）。与其逆向签名，不如直接点 UI。
 *
 * 真实 DOM（2026-11-09 由 William 提供）：
 *   头部右侧 `common_header_right__LsRQ` → 第一个 div →
 *     `div.ant-dropdown-trigger.common_header_userButton__zJscr`（显示账号邮箱 + 下拉箭头）
 *   点开后 antd 下拉渲染到 body，**最后一项**是「退出登录」。不点开时该项根本不在 DOM 里。
 *
 * 注意：这个函数只负责「发起退出并确认页面回到登录页」，**不代表服务端令牌已吊销**。
 * 已实测（V3）：真退出成功（returnCode=0、页面回登录页）后，旧令牌在全新上下文里仍然 200。
 */

import type { Page, Response } from 'playwright';
import { buildSelectors } from './selectors';
import { parseCommon } from './session-probe';

/** 用户菜单触发器候选（按真实 DOM 排序）。 */
export const MENU_TRIGGERS = [
  '[class*="common_header_userButton"]',
  '[class*="common_header_right"] .ant-dropdown-trigger',
  '[class*="avatar"]',
  '[class*="userInfo"]',
  '[class*="header"] img',
];

export interface UiLogoutResult {
  found: boolean;
  clickedText: string | null;
  usedTrigger: string | null;
  redirectedToLogin: boolean;
  logoutHttpStatus: number | null;
  logoutReturnCode: string | null;
  logoutReturnMsg: string | null;
}

/** 点「退出登录」并捕获真实 /logout 请求与响应。 */
export async function tryUiLogout(page: Page): Promise<UiLogoutResult> {
  const result: UiLogoutResult = {
    found: false,
    clickedText: null,
    usedTrigger: null,
    redirectedToLogin: false,
    logoutHttpStatus: null,
    logoutReturnCode: null,
    logoutReturnMsg: null,
  };

  const onResponse = (response: Response): void => {
    if (!/\/login\/v1\/logout/i.test(response.url())) return;
    result.logoutHttpStatus = response.status();
    void response
      .text()
      .then((text) => {
        const common = parseCommon(text);
        result.logoutReturnCode = common.returnCode;
        result.logoutReturnMsg = common.returnMsg;
      })
      .catch(() => undefined);
  };
  page.on('response', onResponse);

  /** 按真实 DOM 打开用户下拉并点「退出登录」。 */
  const clickViaUserDropdown = async (): Promise<boolean> => {
    const trigger = page.locator('[class*="common_header_userButton"]').first();
    if (!(await trigger.isVisible().catch(() => false))) return false;
    await trigger.click({ timeout: 5000 }).catch(() => undefined);
    result.usedTrigger = 'common_header_userButton';

    const items = page.locator('li.ant-dropdown-menu-item');
    await items.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    const count = await items.count().catch(() => 0);
    if (count === 0) return false;

    const named = items.filter({ hasText: /退\s*出\s*登\s*录/ }).first();
    const target = (await named.count().catch(() => 0)) > 0 ? named : items.nth(count - 1);
    const text = ((await target.textContent().catch(() => '')) ?? '').replace(/\s+/g, '').trim();
    await target.click({ timeout: 5000 }).catch(() => undefined);
    result.clickedText = text;
    return true;
  };

  /** 兜底：页面上任意「退出登录」文本。 */
  const clickLogoutText = async (): Promise<boolean> => {
    const locator = page.getByText(/退\s*出\s*登\s*录|退\s*出\s*帐\s*号|退\s*出\s*账\s*号/);
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 8); i += 1) {
      const item = locator.nth(i);
      if (!(await item.isVisible().catch(() => false))) continue;
      const text = ((await item.textContent().catch(() => '')) ?? '').replace(/\s+/g, '').trim();
      if (text.length > 8) continue;
      await item.click({ timeout: 5000 }).catch(() => undefined);
      result.clickedText = text;
      return true;
    }
    return false;
  };

  try {
    if (await clickViaUserDropdown()) {
      result.found = true;
    } else if (await clickLogoutText()) {
      result.found = true;
    } else {
      for (const trigger of MENU_TRIGGERS) {
        const locator = page.locator(trigger).first();
        if (!(await locator.isVisible().catch(() => false))) continue;
        await locator.click({ timeout: 3000 }).catch(() => undefined);
        await page.waitForTimeout(800);
        result.usedTrigger = trigger;
        if (await clickLogoutText()) {
          result.found = true;
          break;
        }
      }
    }

    if (!result.found) return result;

    // 可能还有二次确认框
    const confirm = page.getByRole('button', { name: /确\s*定|确\s*认/ }).first();
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click({ timeout: 3000 }).catch(() => undefined);
    }

    const deadline = Date.now() + 12000;
    const selectors = buildSelectors(page);
    while (Date.now() < deadline) {
      if (/\/user\/login/i.test(page.url()) || (await selectors.loginForm.isVisible().catch(() => false))) {
        result.redirectedToLogin = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    return result;
  } finally {
    page.off('response', onResponse);
  }
}
