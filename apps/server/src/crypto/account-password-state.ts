import { decryptSecret, parsePayload } from './secret-box';
import { loadMasterKey } from './master-key';
import { PLACEHOLDER_ACCOUNT_PASSWORD } from '../db/constants';

/**
 * 判断账号是否已完成真实密码托管。
 *
 * 背景（CSV 导入不闭环的根因）：seed 与「批量导入科应账号」写入的
 * current_password_ciphertext 都是占位值 __PLACEHOLDER__，它只表示账号已登记，
 * 并不对应科应平台上的真实口令。领用流程会把该密文解密后下发给浏览器扩展用于登录，
 * 占位值必然登录失败——账号「能领用、一用就废」。
 * 只有经「重置密码」流程在科应后台改密成功后，密码才算真正配置（provisioned）。
 */
export function isPasswordProvisioned(ciphertext: string | null | undefined): boolean {
  if (!ciphertext) return false;
  try {
    const plaintext = decryptSecret(parsePayload(ciphertext), loadMasterKey());
    return plaintext !== '' && plaintext !== PLACEHOLDER_ACCOUNT_PASSWORD;
  } catch {
    // 解密失败（密钥轮换 / 载荷损坏）一律按「未配置」处理：
    // 宁可拒绝领用，也不能把解不出口令的账号放出去。
    return false;
  }
}
