import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { requestContextMiddleware } from './lib/request-context';
import { createRateLimiter } from './lib/rate-limit';

/** 爆破敏感端点（含全局前缀 /api）。 */
const THROTTLED_PATHS = new Set(['/api/auth/login', '/api/admin/verify-password']);

/** 限流窗口与阈值：15 分钟内同一来源最多 10 次失败。 */
const AUTH_RATE_LIMIT = { windowMs: 15 * 60_000, max: 10 } as const;

/**
 * CORS 允许来源。
 *
 * 此前是 `origin: true`——反射任意来源并配合 `credentials: true`，等于允许任何网站
 * 携带用户 cookie 调用本 API（`sameSite: 'lax'` 只是暂时削弱了影响，改一处即失效）。
 *
 * 收敛为白名单不会影响正常链路：看板与 API 始终同源（生产经网关/nginx 反代 /api，
 * 开发经 vite dev 代理 /api），浏览器根本不会发起跨域请求——同源请求不受 CORS 约束，
 * 且来源不匹配时 cors 中间件只是不写响应头、并不会阻断请求。
 * 真正需要放行的是扩展（chrome-extension://，ID 形态由 ExtensionProofService 另行校验）
 * 与自定义部署（用 CORS_ORIGINS 显式配置，逗号分隔）。
 */
function corsOrigins(): (string | RegExp)[] {
  const configured = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length > 0) return configured;

  return [
    /^chrome-extension:\/\/[a-p]{32}$/,
    /^moz-extension:\/\/[0-9a-f-]{36}$/i,
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  ];
}

/** 取客户端标识用于限流：反代场景下 req.ip 已由 trust proxy 还原为真实来源。 */
function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

async function bootstrap(): Promise<void> {
  // 手册正文支持 data URL 内联插图（编辑器自动压缩后随 Markdown 入库），
  // JSON 请求体默认上限 100kb 不够，放开到 12mb。
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '12mb' });
  app.setGlobalPrefix('api');
  // 反代（vite dev / 生产网关/nginx）位于回环地址：仅信任回环来源的 X-Forwarded-For，
  // 使 req.ip 反映真实客户端地址；非回环直接访问时伪造头不会被采纳（安全）。
  app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');

  // 认证端点限流。只统计失败：正常登录不消耗配额，成功即清零。
  const authLimiter = createRateLimiter(AUTH_RATE_LIMIT);
  app.use((req: Request, res: Response, next: NextFunction) => {
    const path = (req.path || '').replace(/\/+$/, '');
    if (req.method !== 'POST' || !THROTTLED_PATHS.has(path)) {
      next();
      return;
    }

    const key = clientKey(req);
    if (authLimiter.isBlocked(key)) {
      res.status(429).json({ statusCode: 429, message: '尝试过于频繁，请稍后再试' });
      return;
    }

    res.on('finish', () => {
      if (res.statusCode >= 400) authLimiter.recordFailure(key);
      else authLimiter.reset(key);
    });
    next();
  });

  app.use(requestContextMiddleware);
  app.enableCors({ origin: corsOrigins(), credentials: true });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[server] scienceing-server listening on http://localhost:${port}/api`);
}

void bootstrap();
