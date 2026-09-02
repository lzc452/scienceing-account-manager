import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from '../../guards/auth.guard';
import { CurrentUser } from '../../guards/current-user.decorator';
import { extractToken } from '../../guards/extract-token';
import { SESSION_TTL_MS, type AuthUser, type LoginResult } from './auth.types';
import type { LoginDto } from './dto/login.dto';

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
}
