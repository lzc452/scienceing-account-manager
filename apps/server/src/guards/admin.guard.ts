import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard';

/** 仅 ADMIN 可访问；依赖 AuthGuard 已先行注入 req.user。 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user || request.user.role !== 'ADMIN') {
      throw new ForbiddenException('无访问权限');
    }
    return true;
  }
}
