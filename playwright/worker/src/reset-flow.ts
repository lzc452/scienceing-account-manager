import type { Page } from 'playwright';
import type { WorkerConfig } from './config';
import {
  CUSTOM_PASSWORD_RADIO_CANDIDATES,
  NOTIFICATION_EMAIL_TEXT,
  NOTIFICATION_SMS_TEXT,
  accountRow,
  buildSelectors,
  modalConfirmButton,
  modalNewPasswordInput,
  notificationCheckbox,
  notificationItem,
  passwordModeRadio,
  resetIconFor,
  resetModal,
  resetModalTitle,
  successMessage,
} from './selectors';
import { log } from './logger';

/** 重置流程结果（PRD §30 Phase 2 / §31）。 */
export type ResetOutcome =
  | { ok: true; accountUsername: string }
  | { ok: false; accountUsername: string; error: string };

/** 账号定位失败错误（PRD §47 示例：账号找不到）。 */
export class AccountNotFoundError extends Error {
  constructor(accountUsername: string) {
    super(`未找到账号「${accountUsername}」`);
    this.name = 'AccountNotFoundError';
  }
}

/** 成功文案校验失败错误（PRD §31：点击“确定”≠成功，必须出现成功 toast）。 */
export class ResetVerificationError extends Error {
  constructor(accountCode: string, successText: string) {
    super(`账号「${accountCode}」未出现成功文案「${successText}」`);
    this.name = 'ResetVerificationError';
  }
}

/**
 * 真实科应平台执行一次密码重置（PRD §27 / §31）。
 *
 * 真实序列（www.scienceing.com/account/management/list，2026-09-02 核对）：
 *   进账号管理页 → 按用户名搜索账号 → 点「查 询」→ 定位目标行
 *   → 点行内重置 icon（icon-zhongzhimima）→ AntD 弹窗
 *   → 「密码重置方式」选「自定义密码」→ 填系统生成的新密码
 *   → 取消「邮件通知/短信通知」勾选（静默重置）
 *   → footer「确 定」→ 校验 toast「重置成功」。
 *
 * 说明：
 *  - 先搜索再定位，规避账号列表分页导致目标行不在 DOM 的问题；
 *  - 成功与否只看「重置成功」toast（点“确定”不等于成功）。
 */
export async function performReset(
  page: Page,
  config: WorkerConfig,
  accountUsername: string,
  newPassword: string,
): Promise<ResetOutcome> {
  log(`[reset] 打开账号管理页 ${config.adminUrl}`);
  await page.goto(config.adminUrl, { waitUntil: 'domcontentloaded' });
  const s = buildSelectors(page);
  await s.accountPageReady.waitFor({ state: 'visible', timeout: config.defaultTimeoutMs });
  log('[reset] 账号管理页已就绪');

  // 1) 按用户名搜索账号并等待目标行出现（规避分页/长列表）。
  log(`[reset] 搜索账号 username=${accountUsername}`);
  await s.accountSearchInput.fill(accountUsername);
  await s.accountSearchButton.click();
  const row = accountRow(page, accountUsername);
  try {
    await row.first().waitFor({ state: 'visible', timeout: config.defaultTimeoutMs });
  } catch {
    log(`[reset] 未找到目标行 username=${accountUsername}`);
    throw new AccountNotFoundError(accountUsername);
  }
  log('[reset] 目标行已定位');

  // 2) 打开重置弹窗并校验标题「重置密码-{username}」。
  await resetIconFor(page, accountUsername).click();
  log('[reset] 已点击行内重置 icon，等待弹窗');
  await resetModal(page).waitFor({ state: 'visible', timeout: config.defaultTimeoutMs });
  const title = (await resetModalTitle(page).textContent().catch(() => '')) ?? '';
  log(`[reset] 弹窗标题=「${title.trim()}」`);
  if (!title.includes(`重置密码-${accountUsername}`)) {
    throw new Error(`重置弹窗标题异常：「${title.trim()}」（期望包含「重置密码-${accountUsername}」）`);
  }

  // 3) 密码重置方式 → 指定密码，并填入新密码。
  const pwdInput = await selectCustomPasswordMode(page, config);
  await pwdInput.fill(newPassword);
  log('[reset] 已选择「指定密码」并填入新密码');

  // 4) 静默重置：取消邮箱/短信通知勾选（真实科应默认勾选，会向账号发通知；文案为「邮箱通知/短信通知」）。
  await ensureNotificationUnchecked(page, NOTIFICATION_EMAIL_TEXT);
  await ensureNotificationUnchecked(page, NOTIFICATION_SMS_TEXT);
  log('[reset] 已取消邮箱/短信通知勾选（静默重置）');

  // 5) 提交（footer「确 定」）。
  await modalConfirmButton(page).click();
  log('[reset] 已点击「确 定」，等待成功 toast');

  // 6) 校验成功 toast（PRD §31）。
  const successVisible = await successMessage(page, config.resetSuccessText)
    .waitFor({ state: 'visible', timeout: config.defaultTimeoutMs })
    .then(() => true)
    .catch(() => false);

  if (!successVisible) {
    log(`[reset] 未出现成功文案「${config.resetSuccessText}」`);
    throw new ResetVerificationError(accountUsername, config.resetSuccessText);
  }

  log('[reset] 改密成功');
  return { ok: true, accountUsername };
}

/** 选择「自定义密码」方式并返回新密码输入框；候选文案全部失败时给出可读报错。 */
async function selectCustomPasswordMode(page: Page, config: WorkerConfig) {
  const tried: string[] = [];
  for (const name of CUSTOM_PASSWORD_RADIO_CANDIDATES) {
    tried.push(name);
    const radio = passwordModeRadio(page, name);
    if ((await radio.count()) === 0) continue;
    await radio.click({ timeout: config.defaultTimeoutMs }).catch(() => undefined);
    const input = await modalNewPasswordInput(page);
    if (input) return input;
  }
  throw new Error(
    `未能在弹窗中找到「自定义密码」选项并定位新密码输入框（已尝试 radio 文案：${tried.join(' / ')}）。` +
      '请核对真实弹窗「密码重置方式」文案并更新 selectors.ts 的 CUSTOM_PASSWORD_RADIO_CANDIDATES / NEW_PASSWORD_PLACEHOLDER_CANDIDATES',
  );
}

/** 取消某个通知勾选（静默重置的硬性要求：取消失败直接抛错，宁可失败也不泄露通知）。 */
async function ensureNotificationUnchecked(page: Page, text: string): Promise<void> {
  const checkbox = notificationCheckbox(page, text);
  if ((await checkbox.count()) === 0) {
    throw new Error(`未找到通知设置项「${text}」（静默重置前置条件缺失）`);
  }
  const target = checkbox.first();
  if (!(await target.isChecked().catch(() => false))) return; // 本来就是未勾选

  await target
    .setChecked(false, { force: true }) // antd 原生 input 视觉隐藏，force 触发 change 事件
    .catch(async () => {
      await notificationItem(page, text).click(); // 兜底：点击整个通知项切换
    });

  if (await target.isChecked().catch(() => true)) {
    throw new Error(`通知设置项「${text}」取消失败（静默重置要求取消勾选）`);
  }
}
