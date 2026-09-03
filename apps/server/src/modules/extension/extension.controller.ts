import { Controller, Get } from '@nestjs/common';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseService } from '../../db/database.service';

/** 部署时由 deploy-lan 产出的扩展包元信息（apps/web/dist/downloads/extension.json）。 */
interface ExtensionPackageMeta {
  available: boolean;
  version?: string;
  fileName?: string;
  size?: number;
  downloadPath?: string;
  updatedAt?: string;
  dashboardOrigin?: string;
}

// 编译产物位于 apps/server/dist/modules/extension → 上溯 4 级到 apps/，再进 web/dist/downloads
// （docker / 自定义目录可用 EXTENSION_DOWNLOAD_DIR 覆盖）
const DOWNLOAD_DIR = resolve(
  process.env.EXTENSION_DOWNLOAD_DIR || join(__dirname, '..', '..', '..', '..', 'web', 'dist', 'downloads'),
);
const PACKAGE_JSON = join(DOWNLOAD_DIR, 'extension.json');

/**
 * 读取扩展下载包元信息。
 *
 * 包由 `deploy-lan` 的 extension:pack 生成（zip + extension.json 落在前端静态目录，
 * 由网关直接托管在 /downloads/*）。未打包（或包被清理）时 available=false，
 * 前端据此提示「执行 deploy 后可用」而不是给出一个必然 404 的链接。
 */
function readPackage(): ExtensionPackageMeta {
  if (!existsSync(PACKAGE_JSON)) return { available: false };
  try {
    const meta = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    const zip = meta.fileName ? join(DOWNLOAD_DIR, meta.fileName) : '';
    if (!zip || !existsSync(zip)) return { available: false };
    return {
      available: true,
      version: meta.version,
      fileName: meta.fileName,
      size: meta.size ?? statSync(zip).size,
      downloadPath: meta.downloadPath ?? `/downloads/${meta.fileName}`,
      updatedAt: meta.updatedAt,
      dashboardOrigin: meta.dashboardOrigin,
    };
  } catch {
    return { available: false };
  }
}

@Controller('extension')
export class ExtensionController {
  constructor(private readonly dbService: DatabaseService) {}

  /** 插件配置（PRD §11 / §40），游客可访问。 */
  @Get('config')
  config() {
    const settings = this.readSettings();
    return {
      minimumVersion: settings['extension_min_version'] ?? '1.0.0',
      latestVersion: settings['extension_latest_version'] ?? '1.2.0',
      activityThrottleSeconds: Number(settings['activity_throttle_seconds'] ?? 5),
      warningSeconds: Number(settings['warning_seconds'] ?? 300),
      criticalWarningSeconds: Number(settings['critical_warning_seconds'] ?? 60),
      // 无操作超时（秒，默认 1800 = 30 分钟）：管理员可在「系统设置-租约规则」调整，
      // 回收判定与悬浮窗「环满刻度 / 倒计时」均以本值为准（扩展不再本地硬编码 30 分钟）。
      inactivityTimeoutSeconds: this.numericSetting(settings, 'inactivity_timeout_seconds', 1800),
      // 下载包信息：前端「下载助手 / 下载最新版 ZIP」据此给出真实入口
      package: readPackage(),
    };
  }

  /** 读取数值型系统设置：仅采用 >0 的有效数字，否则回退 fallback（与 leases/accounts 的超时判定语义一致）。 */
  private numericSetting(settings: Record<string, string>, key: string, fallback: number): number {
    const value = Number(settings[key] ?? fallback);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
  }

  private readSettings(): Record<string, string> {
    const rows = this.dbService.db
      .prepare('SELECT key, value FROM system_settings')
      .all() as unknown as Array<{ key: string; value: string }>;
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  }
}
