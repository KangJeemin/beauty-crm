import { AuthUser, InvitePreview, LoginResult, SignupResult } from '@beauty-crm/shared';
import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { CookieOptions, Request, Response } from 'express';
import { ShopAuth } from '../../common/auth/auth.types';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { AuthService } from './auth.service';
import { ChangePasswordDto, JoinByInviteDto, LoginDto, SignupDto } from './dto/auth.dto';
import { ClientMeta, TokenService } from './token.service';

export const REFRESH_COOKIE = 'bc_rt';

/** 로그인·가입은 IP당 1분에 10회로 제한 (비밀번호 대입 방지) */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  private readonly cookieBase: CookieOptions;

  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    config: ConfigService,
  ) {
    const secure = config.get('COOKIE_SECURE', String(config.get('NODE_ENV') === 'production')) === 'true';
    // Refresh Token 은 JS 에서 읽을 수 없는 httpOnly 쿠키로만 주고받는다
    this.cookieBase = { httpOnly: true, secure, sameSite: 'lax', path: '/api/auth' };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SignupResult> {
    const { result, refreshToken } = await this.auth.signup(dto, this.meta(req));
    if (refreshToken) this.setCookie(res, refreshToken);
    return result;
  }

  @Public()
  @Get('invites/:code')
  invitePreview(@Param('code') code: string): Promise<InvitePreview> {
    return this.auth.invitePreview(code);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('join')
  async join(@Body() dto: JoinByInviteDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SignupResult> {
    const { result, refreshToken } = await this.auth.joinByInvite(dto, this.meta(req));
    if (refreshToken) this.setCookie(res, refreshToken);
    return result;
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginResult> {
    const { result, refreshToken } = await this.auth.login(dto, this.meta(req));
    this.setCookie(res, refreshToken);
    return result;
  }

  /** Access Token 재발급 (쿠키의 Refresh Token 사용, 회전) */
  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginResult> {
    try {
      const { result, refreshToken } = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], this.meta(req));
      this.setCookie(res, refreshToken);
      return result;
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, this.cookieBase);
      throw e;
    }
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, this.cookieBase);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: ShopAuth): Promise<AuthUser> {
    return this.auth.me(user);
  }

  @HttpCode(200)
  @Post('password')
  async changePassword(
    @CurrentUser() user: ShopAuth,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.auth.changePassword(user, dto);
    // 다른 기기는 모두 로그아웃, 현재 기기는 새 토큰으로 유지
    this.setCookie(res, await this.tokens.issueRefresh('SHOP', user.userId, this.meta(req)));
    return { ok: true };
  }

  private setCookie(res: Response, raw: string) {
    res.cookie(REFRESH_COOKIE, raw, { ...this.cookieBase, maxAge: this.tokens.refreshTtlSec * 1000 });
  }

  private meta(req: Request): ClientMeta {
    return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
  }
}
