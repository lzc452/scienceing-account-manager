/**
 * 扩展环境配置（部署时按需替换）。
 *
 * 域名与 manifest.json 中的 content_scripts.matches / host_permissions 一一对应：
 *   - 看板域（开发 = Vite 5173）：注入 dashboard content script，负责握手与 BIND_AND_OPEN。
 *   - 科应域：注入 scienceing content script，负责 Activity 监听与 Shadow DOM 悬浮窗。
 *   - 后端域（开发 = NestJS 3000）：service worker 直接 fetch /api/*（dev 不走 Vite 代理）。
 *
 * ⚠️ 部署说明：科应真实域名请以正式开通页为准（PRD 未固化，本仓库以占位符给出），
 *   上线前需同步替换 manifest.json 与本文常量；后端地址在正式环境为「看板同源」。
 */

/** 看板域名（content script 注入 + 握手来源校验）。 */
export const DASHBOARD_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

/** 看板根地址（悬浮窗「返回看板」跳转用）。 */
export const DASHBOARD_URL = 'http://localhost:5173';

/** 看板「我的账号」地址（悬浮窗「立即归还」确认后跳转，由看板完成释放确认）。 */
export const DASHBOARD_MY_URL = 'http://localhost:5173/my';

/** 科应平台域名（content script 注入 + 打开 Tab 目标）。 */
export const SCIENCEING_ORIGINS = ['https://www.scienceing.com', 'https://scienceing.com'];

/** BIND_AND_OPEN 时打开的科应首页地址。 */
export const SCIENCEING_URL = 'https://www.scienceing.com';

/** 后端 API 根地址（service worker fetch 用绝对地址）。 */
export const API_BASE = 'http://localhost:3000';

/** Lease 状态轮询间隔（毫秒）。 */
export const POLL_INTERVAL_MS = 10000;

/** GET /api/extension/config 的内存缓存时长（毫秒）。 */
export const CONFIG_CACHE_MS = 60000;
