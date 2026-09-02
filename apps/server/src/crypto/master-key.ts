import { randomBytes } from 'node:crypto';

export const MASTER_KEY_ENV = 'SCIENCEING_MASTER_KEY';
export const MASTER_KEY_BYTES = 32;

/**
 * 生成一个可写入环境变量的 AES-256-GCM Master Key（hex，64 字符 = 32 字节）。
 */
export function generateMasterKey(): { hex: string; key: Buffer } {
  const key = randomBytes(MASTER_KEY_BYTES);
  return { hex: key.toString('hex'), key };
}

/**
 * 从环境变量读取 Master Key（PRD §41/§42：独立 Master Key 走环境变量，不落代码与 Git）。
 *
 * 未设置时生成一次性临时 key 并告警——仅开发/种子可用；生产必须显式设置
 * `SCIENCEING_MASTER_KEY`，否则进程重启后无法解密已存的科应账号密码。
 */
export function loadMasterKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const hex = env[MASTER_KEY_ENV];
  if (hex) {
    const key = Buffer.from(hex, 'hex');
    if (key.length !== MASTER_KEY_BYTES) {
      throw new Error(
        `${MASTER_KEY_ENV} 必须是 ${MASTER_KEY_BYTES} 字节（${MASTER_KEY_BYTES * 2} 个 hex 字符），实际 ${key.length} 字节`,
      );
    }
    return key;
  }
  process.stderr.write(`[warn] 未设置 ${MASTER_KEY_ENV}，使用临时随机 Master Key（仅本进程有效）\n`);
  return randomBytes(MASTER_KEY_BYTES);
}
