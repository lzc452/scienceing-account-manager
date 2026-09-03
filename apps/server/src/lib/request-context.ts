import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * 请求上下文（AsyncLocalStorage）：把每个 HTTP 请求的来源 IP / User-Agent 挂到请求栈上，
 * 供 AuditService.record 等深层 service 在无 @Req 注入时兜底采集审计字段。
 * 后台任务（scheduler / reset worker）不经过中间件 → store 为空 → 返回 null，审计两列留空。
 */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

const context = new AsyncLocalStorage<RequestMeta>();

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const meta: RequestMeta = {
    ip: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  };
  context.run(meta, () => next());
}

/** 读取当前请求的元信息；非请求上下文（定时任务等）返回 null。 */
export function currentRequestMeta(): RequestMeta | null {
  return context.getStore() ?? null;
}
