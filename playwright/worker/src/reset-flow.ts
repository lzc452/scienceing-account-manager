import type { Page } from 'playwright';
import type { WorkerConfig } from './config';
import { accountRow, buildSelectors, resetButtonFor, successMessage } from './selectors';

/** 重置流程结果（PRD §30 Phase 2 / §31）。 */
export type ResetOutcome =
  | { ok: true; accountCode: string }
  | { ok: false; accountCode: string; error: string };

/** 账号定位失败错误（PRD §47 示例：账号找不到）。 */
export class AccountNotFoundError extends Error {
  constructor(accountCode: string) {
    super(`未找到账号「${accountCode}」`);
    this.name = 'AccountNotFoundError';
  }
}

/** 成功文案校验失败错误（PRD §31：点击“确定”≠成功，必须出现“修改成功”）。 */
export class ResetVerificationError extends Error {
  constructor(accountCode: string, successText: string) {
    super(`账号「${accountCode}」未出现成功文案「${successText}」`);
    this.name = 'ResetVerificationError';
  }
}

/**
 * 在科应管理后台执行一次密码重置（PRD §27 / §31）。
 *
 * 流程：
 *   进入账号管理 → 定位账号行 → 点击“重置密码” → 填新密码 → 保存 → 点“确定”
 *   → 校验“修改成功”文案可见（点击“确定”不等于成功）。
 */
export async function performReset(
  page: Page,
  config: WorkerConfig,
  accountCode: string,
  newPassword: string,
): Promise<ResetOutcome> {
  await page.goto(config.adminUrl);
  const s = buildSelectors(page);
  await s.accountManagementHeading.waitFor({ state: 'visible', timeout: config.defaultTimeoutMs });

  const row = accountRow(page, accountCode);
  const resetButton = resetButtonFor(page, accountCode);
  const rowCount = await row.count();
  if (rowCount === 0) {
    throw new AccountNotFoundError(accountCode);
  }
  await resetButton.click();

  await s.newPasswordInput.fill(newPassword);
  await s.saveButton.click();

  // PRD §31：点击“确定”不等于成功；若存在确定按钮则点击，但成功与否只看成功文案。
  if (await s.confirmButton.isVisible().catch(() => false)) {
    await s.confirmButton.click();
  }

  const successVisible = await successMessage(page, config.resetSuccessText)
    .waitFor({ state: 'visible', timeout: config.defaultTimeoutMs })
    .then(() => true)
    .catch(() => false);

  if (!successVisible) {
    throw new ResetVerificationError(accountCode, config.resetSuccessText);
  }

  return { ok: true, accountCode };
}
