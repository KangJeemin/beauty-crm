import { UserRole } from '@beauty-crm/shared';
import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import { AdminAuth, ShopAuth } from './auth.types';

export const IS_PUBLIC = 'auth:isPublic';
export const ACTOR = 'auth:actor';
export const ROLES = 'auth:roles';

/** 로그인 없이 호출 가능한 API */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** 운영자(admin_user) 전용 API. 붙이지 않으면 매장 사용자 전용 */
export const AdminOnly = () => SetMetadata(ACTOR, 'ADMIN');

/** 매장 안에서 특정 역할만 허용 — 예: @Roles('OWNER') */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

/** 로그인한 매장 사용자 { userId, shopId, role } — shopId 는 반드시 여기서 꺼낸다 */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): ShopAuth => {
  return ctx.switchToHttp().getRequest().shopAuth;
});

export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext): AdminAuth => {
  return ctx.switchToHttp().getRequest().adminAuth;
});
