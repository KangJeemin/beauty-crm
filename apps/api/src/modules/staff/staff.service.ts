import { StaffItem, UserRole, UserStatus } from '@beauty-crm/shared';
import { Injectable } from '@nestjs/common';
import { ShopAuth } from '../../common/auth/auth.types';
import { Errors } from '../../common/errors/app.exception';
import { hashPassword, newTempPassword } from '../../common/utils/crypto.util';
import { TokenService } from '../auth/token.service';
import { UpdateMySettingsDto, UpdateStaffDto } from './dto/staff.dto';
import { ShopUser } from './entities/shop-user.entity';
import { ShopUserRepository } from './shop-user.repository';

@Injectable()
export class StaffService {
  constructor(
    private readonly users: ShopUserRepository,
    private readonly tokens: TokenService,
  ) {}

  async list(auth: ShopAuth): Promise<StaffItem[]> {
    const rows = await this.users.findForShop(auth.shopId, { order: { role: 'DESC', createdAt: 'ASC' } });
    return rows.map(toItem);
  }

  async get(auth: ShopAuth, id: number): Promise<StaffItem> {
    return toItem(await this.mustGet(auth.shopId, id));
  }

  async update(auth: ShopAuth, id: number, dto: UpdateStaffDto): Promise<StaffItem> {
    const target = await this.mustGet(auth.shopId, id);
    if (dto.status && target.id === auth.userId) throw Errors.forbidden('본인 계정은 잠글 수 없습니다.');
    Object.assign(target, dto);
    await this.users.save(target);
    if (dto.status === UserStatus.LOCKED) await this.tokens.revokeAll('SHOP', target.id);
    return toItem(target);
  }

  async remove(auth: ShopAuth, id: number): Promise<void> {
    const target = await this.mustGet(auth.shopId, id);
    if (target.id === auth.userId || target.role === UserRole.OWNER) {
      throw Errors.forbidden('원장 계정은 삭제할 수 없습니다.');
    }
    await this.users.softDeleteForShop(auth.shopId, id);
    await this.tokens.revokeAll('SHOP', id);
  }

  /** 원장이 디자이너 비밀번호를 임시 비밀번호로 초기화 (MVP: 문자 인증 대신) */
  async resetPassword(auth: ShopAuth, id: number): Promise<{ tempPassword: string }> {
    const target = await this.mustGet(auth.shopId, id);
    if (target.role === UserRole.OWNER) throw Errors.forbidden('원장 비밀번호는 고객센터에서 초기화할 수 있습니다.');
    const tempPassword = newTempPassword();
    await this.users.save({ id: target.id, passwordHash: await hashPassword(tempPassword) });
    await this.tokens.revokeAll('SHOP', target.id);
    return { tempPassword };
  }

  async updateMySettings(auth: ShopAuth, dto: UpdateMySettingsDto): Promise<StaffItem> {
    const me = await this.mustGet(auth.shopId, auth.userId);
    Object.assign(me, dto);
    await this.users.save(me);
    return toItem(me);
  }

  /** 다른 매장 사용자 id 를 넣으면 여기서 404 — 존재 여부도 알려주지 않는다 */
  private async mustGet(shopId: number, id: number): Promise<ShopUser> {
    const u = await this.users.findOneForShop(shopId, id);
    if (!u) throw Errors.notFound('직원');
    return u;
  }
}

function toItem(u: ShopUser): StaffItem {
  return {
    id: u.id,
    loginId: u.loginId,
    name: u.name,
    phone: u.phone,
    role: u.role,
    status: u.status,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}
