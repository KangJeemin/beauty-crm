import { InviteItem, UserRole } from '@beauty-crm/shared';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { ShopAuth } from '../../common/auth/auth.types';
import { Errors } from '../../common/errors/app.exception';
import { TenantRepository } from '../../common/repositories/base.repository';
import { newCode } from '../../common/utils/crypto.util';
import { ShopInvite } from './shop-invite.entity';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class InviteRepository extends TenantRepository<ShopInvite> {
  constructor(@InjectRepository(ShopInvite) repo: Repository<ShopInvite>) {
    super(repo);
  }
}

@Injectable()
export class InviteService {
  constructor(private readonly invites: InviteRepository) {}

  /** 사용 전이고 만료되지 않은 초대 코드 목록 */
  async listActive(auth: ShopAuth): Promise<InviteItem[]> {
    const rows = await this.invites.findForShop(auth.shopId, {
      where: { usedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toItem);
  }

  async create(auth: ShopAuth): Promise<InviteItem> {
    // 코드 충돌 시 재시도 (31^8 ≈ 8,500억 가지라 사실상 1회)
    for (let i = 0; i < 5; i++) {
      try {
        const saved = await this.invites.save(
          this.invites.create({
            shopId: auth.shopId,
            createdBy: auth.userId,
            inviteCode: newCode(8),
            role: UserRole.DESIGNER,
            expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86400_000),
          }),
        );
        return toItem(saved);
      } catch (e: any) {
        if (e?.code !== 'ER_DUP_ENTRY') throw e;
      }
    }
    throw new Error('초대 코드 생성 실패');
  }

  async cancel(auth: ShopAuth, id: number): Promise<void> {
    if (!(await this.invites.softDeleteForShop(auth.shopId, id))) throw Errors.notFound('초대 코드');
  }
}

function toItem(i: ShopInvite): InviteItem {
  return {
    id: i.id,
    inviteCode: i.inviteCode,
    role: i.role,
    expiresAt: i.expiresAt.toISOString(),
    usedAt: i.usedAt ? i.usedAt.toISOString() : null,
    createdAt: i.createdAt.toISOString(),
  };
}
