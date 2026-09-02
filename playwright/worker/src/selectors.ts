import type { Locator, Page } from 'playwright';

/**
 * 真实科应平台（www.scienceing.com）页面定位器（2026-09-02 按真实 DOM 核对）。
 *
 * 与早期 mock 假设不同，真实页面：
 *  - 登录表单 form#login-form；用户名/密码输入框外层 div 带稳定 id（login-form_username/_password），
 *    且 label 是 div 内文本、input 靠 placeholder 提示 —— getByLabel() 无法命中，改用 id/属性定位；
 *  - 登录需勾选「我已阅读并同意」协议 checkbox（#login-form 内唯一的 input[type=checkbox]）；
 *  - 账号管理页是 CSS Modules，class 带随机后缀（account_userlist_filters__QoVrZ），
 *    统一用 [class*="account_userlist_xxx"] 前缀匹配，绝不依赖完整随机 class；
 *  - 行定位靠 td[title="科应账号"]；行内重置入口是 iconfont 图标（icon-zhongzhimima）；
 *  - 重置弹窗是 Ant Design modal（.ant-modal-* 为稳定类）；
 *  - 按钮文本带空格（查 询 / 重 置 / 取 消 / 确 定），用 /查\s*询/ 等正则匹配可访问名；
 *  - 成功 toast 文案为「重置成功」（config.resetSuccessText）。
 *
 * 定位集中在本文件；科应页面改版时只需调整本文件（PRD §49 降级点），不污染业务逻辑。
 */

export interface ScienceingPageSelectors {
  /** 登录表单。 */
  loginForm: Locator;
  /** 登录：用户名输入框（div#login-form_username 内 text 输入框）。 */
  loginUsernameInput: Locator;
  /** 登录：密码输入框（div#login-form_password 内 password 输入框）。 */
  loginPasswordInput: Locator;
  /** 登录：协议同意 checkbox（#login-form 内第一个 checkbox）。 */
  loginAgreeCheckbox: Locator;
  /** 登录：提交按钮（button[type=submit]，内部文本「登录」）。 */
  loginSubmitButton: Locator;
  /** 账号管理页就绪判据：筛选组件容器可见（替代早期 mock 的 heading「账号管理」）。 */
  accountPageReady: Locator;
  /** 账号管理页：按用户名搜索输入框（筛选区内 text 输入框）。 */
  accountSearchInput: Locator;
  /** 账号管理页：查 询 按钮。 */
  accountSearchButton: Locator;
}

/* ---------------------------------------------------------------------------
 * 「密码重置方式」与通知设置的真实文案（2026-09-02 真实弹窗取证确认）：
 *   - 密码重置方式 radio：默认「随机密码」(value=random)，可选「指定密码」(value=specified)
 *     —— 指定密码即我们场景要选的项，选中后条件渲染新密码输入框；
 *   - 新密码输入框：type=password，placeholder=「请输入指定密码」；
 *   - 通知设置 checkbox 文案：真实为「邮箱通知（脱敏邮箱）」/「短信通知（手机号）」
 *     （注意：是「邮箱通知」不是「邮件通知」；hasText 子串匹配「邮箱通知」即可命中整条）。
 * 若页面再改版，只需调整下面两个数组。
 * ------------------------------------------------------------------------- */

/** 「密码重置方式」中指定密码 radio 的候选文案（首位为真实页已确认的「指定密码」）。 */
export const CUSTOM_PASSWORD_RADIO_CANDIDATES = ['指定密码', '自定义密码', '手动设置'] as const;

/** 选中「指定密码」后新密码输入框 placeholder 的候选文案（首位为真实页已确认的「请输入指定密码」）。 */
export const NEW_PASSWORD_PLACEHOLDER_CANDIDATES = ['请输入指定密码', '请输入新密码', '设置新密码'] as const;

/** 通知设置 checkbox 文案（真实页为「邮箱通知」「短信通知」，已确认）。 */
export const NOTIFICATION_EMAIL_TEXT = '邮箱通知';
export const NOTIFICATION_SMS_TEXT = '短信通知';

function escapeAttr(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

/* ----------------------------- 登录页 ----------------------------- */

export function loginForm(page: Page): Locator {
  return page.locator('#login-form');
}

export function loginUsernameInput(page: Page): Locator {
  return page.locator('#login-form_username input[type="text"]');
}

export function loginPasswordInput(page: Page): Locator {
  return page.locator('#login-form_password input[type="password"]');
}

/** 协议同意 checkbox：真实结构为 form 内唯一 checkbox（首 span 包裹）。 */
export function loginAgreeCheckbox(page: Page): Locator {
  return page.locator('#login-form input[type="checkbox"]').first();
}

export function loginSubmitButton(page: Page): Locator {
  return page.locator('#login-form button[type="submit"]');
}

/* --------------------------- 账号管理页 --------------------------- */

/** 筛选组件容器（前缀匹配 CSS Modules class）。 */
export function accountPageReady(page: Page): Locator {
  return page.locator('[class*="account_userlist_filters"]');
}

export function accountSearchInput(page: Page): Locator {
  return page.locator('[class*="account_userlist_filters"] input[type="text"]');
}

/** 「查 询」按钮：按钮文本带空格，用正则忽略空白匹配。 */
export function accountSearchButton(page: Page): Locator {
  return page.locator('[class*="account_userlist_buttons"] button').filter({ hasText: /查\s*询/ }).first();
}

/** 「重 置」按钮（筛选项，当前流程未使用，仅健康检查/人工排查备用）。 */
export function accountResetFilterButton(page: Page): Locator {
  return page.locator('[class*="account_userlist_buttons"] button').filter({ hasText: /重\s*置/ }).first();
}

/** 以科应账号 username 定位表格行：存在 td[title="username"]（title 与单元格文本均为科应账号用户名）。 */
export function accountRow(page: Page, accountUsername: string): Locator {
  return page.locator('tr').filter({ has: page.locator(`td[title="${escapeAttr(accountUsername)}"]`) });
}

/** 行内重置入口：iconfont 重置密码图标（icon-zhongzhimima）。 */
export function resetIconFor(page: Page, accountUsername: string): Locator {
  return accountRow(page, accountUsername).locator('[class*="icon-zhongzhimima"]').first();
}

/** 页面是否存在任意重置入口（健康检查用）。 */
export function anyResetIcon(page: Page): Locator {
  return page.locator('[class*="icon-zhongzhimima"]').first();
}

/* --------------------------- 重置弹窗(AntD) --------------------------- */

/** 弹窗内容容器（Ant Design modal 稳定类）。 */
export function resetModal(page: Page): Locator {
  return page.locator('.ant-modal-content');
}

/** 弹窗标题（真实文案「重置密码-{科应账号}」）。 */
export function resetModalTitle(page: Page): Locator {
  return page.locator('.ant-modal-title');
}

/** 「密码重置方式」某个 radio 选项（wrapper 为 label.ant-radio-wrapper）。 */
export function passwordModeRadio(page: Page, name: string): Locator {
  return page.locator('.ant-modal-body label.ant-radio-wrapper').filter({ hasText: name }).first();
}

/** 自定义方式下新密码输入框：候选 placeholder 依次尝试，再兜底 body 内 password 输入框。 */
export async function modalNewPasswordInput(page: Page): Promise<Locator | null> {
  for (const placeholder of NEW_PASSWORD_PLACEHOLDER_CANDIDATES) {
    const loc = page.locator(`.ant-modal-body input[placeholder*="${placeholder}"]`);
    if ((await loc.count()) > 0 && (await loc.first().isVisible().catch(() => false))) {
      return loc.first();
    }
  }
  const fallback = page.locator('.ant-modal-body input[type="password"]');
  if ((await fallback.count()) > 0 && (await fallback.first().isVisible().catch(() => false))) {
    return fallback.first();
  }
  return null;
}

/** 通知设置项容器（CSS Modules 前缀匹配；文案如「邮件通知」/「短信通知」）。 */
export function notificationItem(page: Page, text: string): Locator {
  return page.locator('[class*="account_userlist_notificationItem"]').filter({ hasText: text }).first();
}

/** 通知设置项内的原生 checkbox（antd 视觉隐藏，读取/勾选需 force）。 */
export function notificationCheckbox(page: Page, text: string): Locator {
  return notificationItem(page, text).locator('input[type="checkbox"]');
}

/** 弹窗 footer「确 定」按钮（文本带空格，正则匹配）。 */
export function modalConfirmButton(page: Page): Locator {
  return page.locator('.ant-modal-footer').getByRole('button', { name: /确\s*定/ });
}

/**
 * 单点登录强制下线确认框（真实科应特性）。
 * 管理员账号在别处已登录时，提交后会弹出「由于您的账号已经在其他地方登录...」确认框，
 * 需点「确 定」强制下线其他设备才能继续。AntD Modal.confirm 渲染容器为
 * `.ant-modal-confirm`（区别于改密弹窗的 `.ant-modal`/`.ant-modal-footer`）。
 */
export function singleSessionConfirmModal(page: Page): Locator {
  return page.locator('.ant-modal-confirm');
}

export function singleSessionConfirmButton(page: Page): Locator {
  return singleSessionConfirmModal(page).getByRole('button', { name: /确\s*定/ });
}

/** 成功文案（PRD §31：真实 toast 为「重置成功」，用 exact 避免误命中）。 */
export function successMessage(page: Page, text: string): Locator {
  return page.getByText(text, { exact: true });
}

/** 聚合登录/账号管理页常用定位器（auth / health / reset-flow 共用）。 */
export function buildSelectors(page: Page): ScienceingPageSelectors {
  return {
    loginForm: loginForm(page),
    loginUsernameInput: loginUsernameInput(page),
    loginPasswordInput: loginPasswordInput(page),
    loginAgreeCheckbox: loginAgreeCheckbox(page),
    loginSubmitButton: loginSubmitButton(page),
    accountPageReady: accountPageReady(page),
    accountSearchInput: accountSearchInput(page),
    accountSearchButton: accountSearchButton(page),
  };
}
