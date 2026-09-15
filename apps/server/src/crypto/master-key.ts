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
 * 进程级兜底 key 缓存。
 *
 * 未设置环境变量时只能生成临时 key，但**必须**在进程内复用同一个：
 * 否则每次调用都返回新 key，加密与解密用的不是同一把钥匙，
 * 任何刚写入的密文都立刻读不回来（claim 时解密失败 → 密码降级为空串）。
 */
let fallbackKey: Buffer | null = null;

/**
 * 从环境变量读取 Master Key（PRD §41/§42：独立 Master Key 走环境变量，不落代码与 Git）。
 *
 * 生产环境缺失时**直接抛错**：缺 key 还继续运行，只会写出「重启后无法解密」的密文，
 * 把一次配置疏漏延后成静默的数据损坏。开发/测试仍允许临时 key（进程内复用）。
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

  if (env.NODE_ENV === 'production') {
    throw new Error(
      `生产环境必须显式设置 ${MASTER_KEY_ENV}（${MASTER_KEY_BYTES * 2} 个 hex 字符）。`
        + '未设置时进程只能生成临时 key，重启后已入库的科应账号密码将无法解密。',
    );
  }

  if (!fallbackKey) {
    fallbackKey = randomBytes(MASTER_KEY_BYTES);
    process.stderr.write(
      `[warn] 未设置 ${MASTER_KEY_ENV}，本进程使用临时随机 Master Key（仅本进程有效，重启后已存密码不可解密）\n`,
    );
  }
  return fallbackKey;
}
