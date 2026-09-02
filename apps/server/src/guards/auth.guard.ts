import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../modules/auth/auth.service';
import { extractToken } from './extract-token';
import type { AuthUser } from '../modules/auth/auth.types';

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  sessionToken?: string;
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
    request.user = user;
    request.sessionToken = token;
    return true;
  }
}
