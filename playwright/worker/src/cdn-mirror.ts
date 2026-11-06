/**
 * CDN 镜像改写（部署环境适配层）。
 *
 * 背景：
 *   科应前端用 react-mathjax 包住整棵树，且 `noGate` 默认 false —— MathJax 加载完成前
 *   整个页面 `return this.props.loading`（默认 null），即渲染空壳。而 MathJax 默认从
 *   `cdnjs.cloudflare.com` 拉取。
 *
 *   国内 IDC 机房出口访问 cdnjs 会长时间挂起（实测 curl 8s 无响应），家庭宽带则正常。
 *   结果就是「人工打开能看见登录框、自动化跑却永远白屏」，`#login-form` 永不出现。
 *
 * 处理：
 *   把 cdnjs 的请求透明改写到国内同构镜像。BootCDN 完整镜像了 cdnjs 的目录结构，
 *   因此 MathJax 后续按自身 URL 相对解析出来的子资源也能正常加载。
 *
 * 边界：
 *   只作用于 Worker 自己的 BrowserContext，不改目标站点、不影响宿主机其他流量。
 *   镜像地址可用 `CDNJS_MIRROR` 环境变量覆盖；指向源站即等于关闭改写。
 */
import type { BrowserContext } from 'playwright';
import { log } from './logger';

const CDNJS_ORIGIN = 'https://cdnjs.cloudflare.com';
const DEFAULT_MIRROR = 'https://cdn.bootcdn.net';

/**
 * 给浏览器上下文装上 cdnjs → 镜像 的路由改写。
 * 必须在 `newContext()` 之后、任何 `goto()` 之前调用，否则首个页面可能已错过改写。
 */
export async function installCdnMirrorRouting(context: BrowserContext): Promise<void> {
  const mirror = (process.env.CDNJS_MIRROR || DEFAULT_MIRROR).replace(/\/+$/, '');
  if (mirror === CDNJS_ORIGIN) {
    log('[cdn-mirror] 改写已禁用（CDNJS_MIRROR 指向源站）');
    return;
  }

  let rewritten = 0;
  await context.route(/^https:\/\/cdnjs\.cloudflare\.com\//, (route) => {
    const url = route.request().url().replace(CDNJS_ORIGIN, mirror);
    rewritten += 1;
    if (rewritten === 1) log(`[cdn-mirror] cdnjs 不可达，本会话请求已改写到 ${mirror}`);
    return route.continue({ url });
  });
}
