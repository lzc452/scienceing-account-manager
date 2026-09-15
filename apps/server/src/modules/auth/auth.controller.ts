import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard, type AuthenticatedRequest } from '../../guards/auth.guard';
import { CurrentUser } from '../../guards/current-user.decorator';
import { extractToken } from '../../guards/extract-token';
import { SESSION_TTL_MS, type AuthUser, type LoginResult } from './auth.types';
import type { LoginDto } from './dto/login.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';

/**
 * 判断本次请求是否走 HTTPS，用于决定会话 cookie 是否带 `Secure`。
 *
 * **必须条件开启**：本项目的生产部署是内网明文 HTTP（网关/nginx 监听 18080），
 * 无条件加 `Secure` 会让浏览器直接丢弃该 cookie，登录当场失效。
 * 反代场景依赖 `X-Forwarded-Proto`——main.ts 已设 `trust proxy: 'loopback'`，
 * 因此只有来自回环的反代才能影响这个判断，外部伪造该头不会被采纳。
 *
 * 未使用 `__Host-` 前缀：该前缀强制要求 `Secure` + `Path=/` + 无 `Domain`，
 * 在明文 HTTP 部署下同样会导致 cookie 不被发送。若将来改为 HTTPS 部署，
 * 应同时启用 `Secure` 与 `__Host-` 前缀，并同步修改 extract-token.ts 的 cookie 名。
 */
function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  const raw = req.headers['x-forwarded-proto'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.split(',')[0]?.trim().toLowerCase() === 'https';
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResult> {
    const result = await this.authService.login(body.username, body.password, {
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    res.cookie('session', result.token, {
      httpOnly: true,
      maxAge: SESSION_TTL_MS,
      sameSite: 'lax',
      path: '/',
      secure: isSecureRequest(req),
    });
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  logout(@Req() req: Request, @CurrentUser() user: AuthUser): { ok: true } {
    const token = extractToken(req.headers as unknown as Record<string, unknown>);
    if (token) {
      this.authService.logout(token, user, {
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      });
    }
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  /**
   * 取回当前会话令牌，供交给浏览器扩展（L1-14）。
   *
   * 扩展运行在 chrome-extension:// 源，无法携带看板的 httpOnly cookie，
   * 因此领取流程必须由看板把 Bearer 令牌递过去。此前看板把该令牌长期存在
   * localStorage 里——任何一次 XSS 都能整体窃走会话；现在改为按需取回、只驻内存。
   *
   * 返回的就是当前会话令牌本身：不引入新的凭证类型，也不新增 sessions 行。
   * 该端点由 AuthGuard 保护，攻击者拿不到会话就无法调用它。
   */
  @Post('extension-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  extensionToken(@Req() req: AuthenticatedRequest): { token: string } {
    return { token: req.sessionToken ?? '' };
  }

  /**
   * 用户本人修改登录密码（t14）：登录态下验证当前密码后写入新密码；
   * 首次登录强制改密场景下，改密成功即视为登录完成（返回最新 user，mustChangePassword=false）。
   */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  changePassword(
    @Body() body: ChangePasswordDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<AuthUser> {
    return this.authService.changePassword(
      user,
      body.currentPassword,
      body.newPassword,
      req.sessionToken!,
      {
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    );
  }
}
