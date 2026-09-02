import type { Locator, Page } from 'playwright';

/**
 * 科应管理后台页面元素定位器（PRD §27）。
 *
 * 只使用面向用户语义的定位方式：
 *   getByRole() / getByLabel() / getByText()
 *
 * 禁止长 CSS / XPath。科应页面改版时，只需调整本文件的语义描述，
 * 不污染 reset-flow 的业务逻辑（PRD §49 页面改版检测的降级点）。
 */
export interface ScienceingPageSelectors {
  /** 登录表单：用户名输入框。 */
  loginUsername: Locator;
  /** 登录表单：密码输入框。 */
  loginPassword: Locator;
  /** 登录提交按钮。 */
  loginButton: Locator;
  /** 账号管理页标题（用于判断是否已登录/已进入账号管理）。 */
  accountManagementHeading: Locator;
  /** 新密码输入框（重置对话框）。 */
  newPasswordInput: Locator;
  /** 保存按钮（重置对话框）。 */
  saveButton: Locator;
  /** 确定按钮（PRD §31：点击“确定”不等于成功）。 */
  confirmButton: Locator;
}

/** 以账号编号定位账号行，并在该行内取“重置密码”按钮（语义定位，无 CSS/XPath）。 */
export function accountRow(page: Page, accountCode: string): Locator {
  return page.getByRole('row', { name: new RegExp(escapeRegExp(accountCode)) });
}

export function resetButtonFor(page: Page, accountCode: string): Locator {
  return accountRow(page, accountCode).getByRole('button', { name: '重置密码' });
}

/** 成功文案（PRD §31：必须出现“修改成功”之类的状态才算成功）。 */
export function successMessage(page: Page, text: string): Locator {
  return page.getByText(text, { exact: true });
}

export function buildSelectors(page: Page): ScienceingPageSelectors {
  return {
    loginUsername: page.getByLabel('用户名'),
    // exact: true —— getByLabel 默认子串匹配，「密码」会同时命中登录密码框与「新密码」框（strict 违规）。
    loginPassword: page.getByLabel('密码', { exact: true }),
    loginButton: page.getByRole('button', { name: '登录' }),
    accountManagementHeading: page.getByRole('heading', { name: '账号管理' }),
    newPasswordInput: page.getByLabel('新密码', { exact: true }),
    saveButton: page.getByRole('button', { name: '保存' }),
    confirmButton: page.getByRole('button', { name: '确定' }),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
