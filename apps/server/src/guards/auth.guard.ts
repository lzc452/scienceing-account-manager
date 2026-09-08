import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../modules/auth/auth.service';
import { extractToken } from './extract-token';
import type { AuthUser } from '../modules/auth/auth.types';

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  sessionToken?: string;
}

/**
 * 首次登录强制改密（t14）：未修改初始/临时密码（mustChangePassword）的会话，
 * 仅允许改密、自检当前用户、退出三个端点；其余业务接口一律 403 ——
 * 防止绕过前端弹窗直接调用业务 API。
 */
const PASSWORD_CHANGE_ALLOWED: ReadonlyArray<readonly [string, string]> = [
  ['POST', '/auth/change-password'],
  ['GET', '/auth/me'],
  ['POST', '/auth/logout'],
];

/** 归一化请求路径：去掉全局前缀 /api（e2e 与生产 main.ts 均挂 /api，双兼容）。 */
function normalizedPath(request: Request): string {
  const raw = request.path || (request.url ?? '').split('?')[0] || '';
  return raw.startsWith('/api') ? raw.slice(4) || raw : raw;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractToken(request.headers as unknown as Record<string, unknown>);
    if (!token) {
      throw new UnauthorizedException('未登录');
    }
    const user = this.authService.resolveUserByToken(token);
    if (!user) {
      throw new UnauthorizedException('会话已失效，请重新登录');
    }
    if (user.mustChangePassword) {
      const allowed = PASSWORD_CHANGE_ALLOWED.some(
        ([method, path]) => request.method === method && normalizedPath(request) === path,
      );
      if (!allowed) {
        throw new ForbiddenException('首次登录请先修改初始密码');
      }
    }
    request.user = user;
    request.sessionToken = token;
    return true;
  }
}
