import { isVersionAtLeast } from '../../lib/version';

/**
 * 回收模式判定（纯函数）。
 *
 * 两种模式：
 *  - `PURGE`  ：新链路。服务端把账号置为 DIRTY 并等客户端回执「本机已清理干净」，
 *               零改密。只有在客户端确实能执行清理时才成立。
 *  - `ROTATE` ：旧链路。归还即改密（account RECYCLING + reset_job），不依赖客户端。
 *
 * 为什么需要判定而不是直接用配置：**发布顺序决定安全边界**。
 * S1 上线时在用的扩展是 1.4.0，它根本不会发清理回执；若此时默认走 PURGE，
 * 每次归还要白等一个 ack 超时才转改密，比原来更慢，且期间账号处于不可领取的 DIRTY。
 * 所以 PURGE 必须受「扩展版本 >= purge_gate_min_version」约束，
 * 让新旧客户端在同一次发布里各走各的路。
 */

export type RecycleMode = 'PURGE' | 'ROTATE';

/** 与 DEFAULT_SYSTEM_SETTINGS.purge_gate_min_version 保持一致。 */
export const DEFAULT_PURGE_GATE_VERSION = '1.5.0';

export interface RecycleModeInput {
  /** system_settings.recycle_mode；缺失或非法时按 PURGE 处理（再由版本门槛兜底） */
  configuredMode: string | null | undefined;
  /** 发起归还的客户端版本（leases.extension_version，领取时记录） */
  extensionVersion: string | null | undefined;
  /** system_settings.purge_gate_min_version */
  gateVersion: string | null | undefined;
}

export interface RecycleModeDecision {
  mode: RecycleMode;
  /** 走 ROTATE 的理由，写入审计便于排查「为什么这次没走清理」 */
  reason: 'CONFIG_ROTATE' | 'EXTENSION_UNKNOWN' | 'EXTENSION_OUTDATED' | 'CONFIG_PURGE';
}

export function resolveRecycleMode(input: RecycleModeInput): RecycleModeDecision {
  // 1) 管理员强制退回旧链路：这是止血开关，必须无视版本门槛无条件生效。
  //    注意只在显式 'ROTATE' 时才生效——把脏值（拼错、旧版本遗留）当成 PURGE 更危险。
  if (input.configuredMode === 'ROTATE') {
    return { mode: 'ROTATE', reason: 'CONFIG_ROTATE' };
  }

  // 2) 没有扩展版本等于「不知道对面能不能清理」：
  //    宁可多改一次密，也不要让账号停在 DIRTY 等一个永远不来的回执。
  const extensionVersion = input.extensionVersion?.trim();
  if (!extensionVersion) {
    return { mode: 'ROTATE', reason: 'EXTENSION_UNKNOWN' };
  }

  // 3) 版本门槛：门槛值非法时回落到默认，避免「配置写错 → 全体走 PURGE」这种反向事故
  const gate = input.gateVersion?.trim();
  const gateVersion = gate && /^\d+\.\d+\.\d+$/.test(gate) ? gate : DEFAULT_PURGE_GATE_VERSION;

  if (!isVersionAtLeast(extensionVersion, gateVersion)) {
    return { mode: 'ROTATE', reason: 'EXTENSION_OUTDATED' };
  }

  return { mode: 'PURGE', reason: 'CONFIG_PURGE' };
}
