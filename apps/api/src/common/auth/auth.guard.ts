import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { ErrorCode, UserRole } from '@beauty-crm/shared';
import { HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { AppException, Errors } from '../errors/app.exception';
import { TokenPayload } from './auth.types';
import { ACTOR, IS_PUBLIC, ROLES } from './decorators';

/**
 * 전역 인증 가드 (APP_GUARD).
 *  1) @Public() 이면 통과
 *  2) Bearer 토큰 검증
 *  3) @AdminOnly() → 운영자 토큰만, 그 외 → 매장 사용자 토큰만
 *  4) @Roles(...) 검사
 *
 * 매장 사용자의 shopId 는 오직 토큰에서만 온다. 요청 body/query 의 shopId 는 쓰지 않는다.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & Record<string, any>>();
    const token = this.extract(req);
    if (!token) throw Errors.unauthorized();

    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token);
    } catch (e) {
      if (e instanceof TokenExpiredError) {
        throw new AppException(ErrorCode.TOKEN_EXPIRED, '로그인이 만료되었습니다.', HttpStatus.UNAUTHORIZED);
      }
      throw Errors.unauthorized();
    }

    const actor = this.reflector.getAllAndOverride<'ADMIN' | undefined>(ACTOR, targets) ?? 'SHOP';
    if (actor === 'ADMIN') {
      if (payload.typ !== 'ADMIN') throw Errors.forbidden();
      req.adminAuth = { adminId: payload.sub };
      return true;
    }

    if (payload.typ !== 'SHOP') throw Errors.forbidden();
    req.shopAuth = { userId: payload.sub, shopId: payload.shopId, role: payload.role };

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, targets);
    if (roles?.length && !roles.includes(payload.role)) throw Errors.forbidden('원장님만 사용할 수 있는 기능입니다.');
    return true;
  }

  private extract(req: Request): string | null {
    const h = req.headers.authorization;
    if (!h) return null;
    const [type, value] = h.split(' ');
    return type === 'Bearer' && value ? value : null;
  }
}
