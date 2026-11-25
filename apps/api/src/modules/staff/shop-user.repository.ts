import { DelState } from '@beauty-crm/shared';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantRepository } from '../../common/repositories/base.repository';
import { ShopUser } from './entities/shop-user.entity';

@Injectable()
export class ShopUserRepository extends TenantRepository<ShopUser> {
  constructor(@InjectRepository(ShopUser) repo: Repository<ShopUser>) {
    super(repo);
  }

  /**
   * 로그인 전용 — 아직 shopId 를 모르는 유일한 경우. passwordHash 포함.
   * 그 외 업무 코드에서는 반드시 *ForShop 메서드를 쓴다.
   */
  findForLogin(loginId: string): Promise<ShopUser | null> {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.loginId = :loginId AND u.delState = :d', { loginId, d: DelState.ACTIVE })
      .getOne();
  }

  findWithPassword(shopId: number, id: number): Promise<ShopUser | null> {
    return this.qbForShop(shopId, 'u').addSelect('u.passwordHash').andWhere('u.id = :id', { id }).getOne();
  }

  async loginIdExists(loginId: string): Promise<boolean> {
    return (await this.repo.count({ where: { loginId, delState: DelState.ACTIVE } })) > 0;
  }
}
