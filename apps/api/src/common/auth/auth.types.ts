import { UserRole } from '@beauty-crm/shared';

/** 매장 사용자 Access Token 내용 */
export interface ShopTokenPayload {
  typ: 'SHOP';
  sub: number; // shop_user.id
  shopId: number;
  role: UserRole;
}

/** 운영자 Access Token 내용 */
export interface AdminTokenPayload {
  typ: 'ADMIN';
  sub: number; // admin_user.id
}

export type TokenPayload = ShopTokenPayload | AdminTokenPayload;

/** 컨트롤러에서 @CurrentUser() 로 받는 값 */
export interface ShopAuth {
  userId: number;
  shopId: number;
  role: UserRole;
}

export interface AdminAuth {
  adminId: number;
}
