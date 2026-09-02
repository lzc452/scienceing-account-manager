import * as path from 'node:path';

/**
 * Worker 配置（PRD §29 / §42）。
 *
 * 敏感凭据（科应管理员用户名/密码）只允许通过环境变量注入，绝不写死在代码/仓库中：
 *   - SCIENCING_ADMIN_USERNAME
 *   - SCIENCING_ADMIN_PASSWORD
 *
 * 其余可配置项见下表，均有安全默认值。
 */
export interface WorkerConfig {
  /** 科应管理后台地址（登录页 / 账号管理页，mock 或真实科应后台）。 */
  adminUrl: string;
  /** 科应管理员用户名（环境变量注入，PRD §42）。 */
  adminUsername: string;
  /** 科应管理员密码（环境变量注入，PRD §42）。 */
  adminPassword: string;
  /** 管理员认证状态文件（playwright/.auth/admin.json，PRD §29）。 */
  storageStatePath: string;
  /** 浏览器渠道：默认系统 Chrome；也可用 msedge。 */
  browserChannel: 'chrome' | 'msedge' | 'chromium';
  headless: boolean;
  /** 单步默认超时（毫秒）。 */
  defaultTimeoutMs: number;
  /** 重置成功的成功文案（PRD §31：必须校验“修改成功”之类的状态）。 */
  resetSuccessText: string;
  /** 失败重试间隔（毫秒，PRD §48：等待数秒）。 */
  retryDelayMs: number;
  /** 最大尝试次数（PRD §48：2～3 次）。 */
  maxAttempts: number;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

function envInt(name: string, fallback: number): number {
  const raw = env(name);
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 默认 storageState 路径：<repo>/playwright/.auth/admin.json（PRD §29）。 */
export function defaultStorageStatePath(cwd: string = process.cwd()): string {
  return path.join(cwd, 'playwright', '.auth', 'admin.json');
}

/** 从环境变量加载配置（生产入口使用）。 */
export function loadConfigFromEnv(): WorkerConfig {
  const adminUsername = env('SCIENCING_ADMIN_USERNAME');
  const adminPassword = env('SCIENCING_ADMIN_PASSWORD');
  if (!adminUsername || !adminPassword) {
    throw new Error(
      '缺少科应管理员凭据：请设置环境变量 SCIENCING_ADMIN_USERNAME 与 SCIENCING_ADMIN_PASSWORD（PRD §42）',
    );
  }
  const adminUrl = env('SCIENCING_ADMIN_URL');
  if (!adminUrl) {
    throw new Error('缺少科应管理后台地址：请设置环境变量 SCIENCING_ADMIN_URL');
  }
  const channel = (env('SCIENCING_BROWSER_CHANNEL') as WorkerConfig['browserChannel'] | undefined) ?? 'chrome';
  return {
    adminUrl,
    adminUsername,
    adminPassword,
    storageStatePath: env('SCIENCING_STORAGE_STATE') ?? defaultStorageStatePath(),
    browserChannel: channel === 'msedge' || channel === 'chromium' ? channel : 'chrome',
    headless: env('SCIENCING_BROWSER_HEADLESS') !== '0',
    defaultTimeoutMs: envInt('SCIENCING_DEFAULT_TIMEOUT_MS', 15_000),
    resetSuccessText: env('SCIENCING_RESET_SUCCESS_TEXT') ?? '修改成功',
    retryDelayMs: envInt('SCIENCING_RETRY_DELAY_MS', 3_000),
    maxAttempts: Math.min(3, Math.max(2, envInt('SCIENCING_MAX_ATTEMPTS', 3))),
  };
}
