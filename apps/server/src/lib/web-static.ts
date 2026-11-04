import { existsSync, statSync } from 'node:fs';
import { basename, extname, join, normalize, resolve, sep } from 'node:path';
import type { NextFunction, Request, Response } from 'express';

/**
 * 容器内前端静态托管（CloudBase 云托管单容器形态）。
 *
 * 为什么不是 nginx：云托管只允许一个监听端口，也不是 Docker Compose 环境。
 * 于是把「前端产物 + /api」合到同一个 Node 进程里，网关层的三件事在这里补齐：
 *  1. SPA history 回退（刷新 /admin/accounts 不 404）；
 *  2. /downloads/* 缺失时必须 404（否则用户会下到一个 HTML 文件）；
 *  3. 安全响应头（CSP 等，与 deploy-lan/scripts/gateway.mjs 取值一致）。
 *
 * 只有显式配置 WEB_DIST_DIR 才启用——本地开发（vite dev 代理）与
 * 内网 nginx 部署不受影响，仍在网关侧托管静态资源。
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.zip': 'application/zip',
  '.crx': 'application/x-chrome-extension',
};

/**
 * 与 deploy-lan 网关完全一致的取值依据：构建产物只有外链 script/style + favicon；
 * 界面存在行内 style，手册正文允许 data URL 图片，因此 style-src 保留 inline、img-src 保留 data:。
 */
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
};

/** 解析 WEB_DIST_DIR；未配置返回 null，配置了但产物不完整则直接报错（启动即失败优于白屏）。 */
export function resolveWebDist(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = (env.WEB_DIST_DIR ?? '').trim();
  if (!configured) return null;
  const root = resolve(configured);
  if (!existsSync(join(root, 'index.html'))) {
    throw new Error(`WEB_DIST_DIR 指向的目录缺少 index.html：${root}（前端未构建或被 .dockerignore 排除）`);
  }
  return root;
}

/** 路径穿越防护：解码后必须仍在 root 内。畸形百分号编码属于非法输入，返回 null 由调用方回 400。 */
function toFilePath(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const target = normalize(join(root, decoded.replace(/^\/+/, '')));
  return target === root || target.startsWith(root + sep) ? target : null;
}

export function webStaticMiddleware(root: string) {
  const indexPath = join(root, 'index.html');

  return function serveWebStatic(req: Request, res: Response, next: NextFunction): void {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }

    const pathname = (req.url || '/').split('?')[0] || '/';
    // /api 交给 Nest 路由；这里必须放行，否则健康检查与所有接口都会被静态层吞掉。
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      next();
      return;
    }

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);

    const resolved = toFilePath(root, pathname);
    if (resolved === null) {
      res.status(400).type('text/plain').send('Bad Request');
      return;
    }

    const isDownload = pathname.startsWith('/downloads/');
    let target = resolved;
    try {
      if (statSync(target).isDirectory()) target = join(target, 'index.html');
      if (!statSync(target).isFile()) throw new Error('not a file');
    } catch {
      if (isDownload) {
        res.status(404).type('text/plain').send('Not Found');
        return;
      }
      // 未知路由一律回 index.html，交给前端路由处理。
      target = indexPath;
    }

    const isHashedAsset = pathname.startsWith('/assets/');
    res.setHeader('Cache-Control', isHashedAsset ? 'public, max-age=604800, immutable' : 'no-cache');
    if (isDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="${basename(target)}"`);
    }
    res.setHeader('Content-Type', MIME[extname(target).toLowerCase()] ?? 'application/octet-stream');

    res.sendFile(target, (error) => {
      if (!error) return;
      // 传了回调就必须自己收尾，否则响应会挂起（Express 文档约定）。
      if (!res.headersSent) res.status(404).type('text/plain').send('Not Found');
      else res.end();
    });
  };
}
