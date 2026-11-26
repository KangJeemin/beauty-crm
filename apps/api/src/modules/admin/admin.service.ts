import { PlanType, ShopStatus, UserRole } from '@beauty-crm/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { auditMeta } from '../../common/audit/audit-context';
import { Errors } from '../../common/errors/app.exception';
import { BaseRepository } from '../../common/repositories/base.repository';
import { DUMMY_HASH, hashPassword, newTempPassword, verifyPassword } from '../../common/utils/crypto.util';
import { TokenService } from '../auth/token.service';
import { ShopRepository } from '../shop/shop.repository';
import { ShopUserRepository } from '../staff/shop-user.repository';
import { AdminUser } from './entities/admin-user.entity';

@Injectable()
export class AdminUserRepository extends BaseRepository<AdminUser> {
  constructor(@InjectRepository(AdminUser) repo: Repository<AdminUser>) {
    super(repo);
  }

  findForLogin(loginId: string) {
    return this.qb('a').addSelect('a.passwordHash').andWhere('a.loginId = :loginId', { loginId }).getOne();
  }
}

export interface AdminShopRow {
  id: number;
  name: string;
  ownerName: string;
  phone: string | null;
  status: ShopStatus;
  planType: string;
  isFounder: number;
  ownerLoginId: string | null;
  userCount: number;
  createdAt: string;
  approvedAt: string | null;
}

/** 서비스 운영자 기능 — 매장 승인·정지, 원장 비밀번호 초기화 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly admins: AdminUserRepository,
    private readonly shops: ShopRepository,
    private readonly users: ShopUserRepository,
    private readonly tokens: TokenService,
  ) {}

  async login(loginId: string, password: string): Promise<{ accessToken: string; expiresIn: number; name: string }> {
    const admin = await this.admins.findForLogin(loginId);
    const ok = await verifyPassword(password, admin?.passwordHash ?? DUMMY_HASH);
    if (!admin || !ok) throw Errors.invalidCredentials();
    await this.admins.save({ id: admin.id, lastLoginAt: new Date() });
    auditMeta({ actor: { type: 'ADMIN', id: admin.id } });
    return { accessToken: this.tokens.signAdminAccess(admin.id), expiresIn: this.tokens.adminTtlSec, name: admin.name };
  }

  async listShops(status?: ShopStatus): Promise<AdminShopRow[]> {
    const qb = this.shops
      .qb('s')
      .leftJoin('shop_user', 'o', "o.shopId = s.id AND o.role = 'OWNER' AND o.delState = 0")
      .leftJoin('shop_user', 'u', 'u.shopId = s.id AND u.delState = 0')
      .select([
        's.id AS id', 's.name AS name', 's.ownerName AS ownerName', 's.phone AS phone', 's.status AS status',
        's.planType AS planType', 's.isFounder AS isFounder', 's.createdAt AS createdAt', 's.approvedAt AS approvedAt',
        'MIN(o.loginId) AS ownerLoginId', 'COUNT(DISTINCT u.id) AS userCount',
      ])
      .groupBy('s.id')
      .orderBy('s.createdAt', 'DESC');
    if (status) qb.andWhere('s.status = :status', { status });
    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      ...r,
      id: Number(r.id),
      isFounder: Number(r.isFounder),
      userCount: Number(r.userCount),
      createdAt: new Date(r.createdAt).toISOString(),
      approvedAt: r.approvedAt ? new Date(r.approvedAt).toISOString() : null,
    }));
  }

  async setShopStatus(adminId: number | null, shopId: number, status: ShopStatus, opts: { founder?: boolean } = {}) {
    const shop = await this.shops.findOneById(shopId);
    if (!shop) throw Errors.notFound('매장');
    shop.status = status;
    if (status === ShopStatus.ACTIVE && !shop.approvedAt) {
      shop.approvedAt = new Date();
      shop.approvedBy = adminId;
    }
    if (opts.founder) {
      shop.isFounder = 1;
      shop.planType = PlanType.FOUNDER;
    }
    await this.shops.save(shop);
    if (status !== ShopStatus.ACTIVE) {
      // 정지된 매장의 로그인 유지 토큰을 모두 끊는다 (Access Token 은 최대 30분 후 만료)
      const members = await this.users.findForShop(shopId);
      for (const m of members) await this.tokens.revokeAll('SHOP', m.id);
    }
    this.logger.log(`매장 #${shopId} 상태 변경 → ${status}`);
    return { id: shop.id, status: shop.status, isFounder: shop.isFounder };
  }

  /** 원장 비밀번호 초기화 (원장님이 비밀번호를 잊었을 때 운영자가 처리) */
  async resetOwnerPassword(shopId: number): Promise<{ loginId: string; tempPassword: string }> {
    const owner = (await this.users.findForShop(shopId, { where: { role: UserRole.OWNER } }))[0];
    if (!owner) throw Errors.notFound('원장 계정');
    const tempPassword = newTempPassword();
    await this.users.save({ id: owner.id, passwordHash: await hashPassword(tempPassword) });
    await this.tokens.revokeAll('SHOP', owner.id);
    return { loginId: owner.loginId, tempPassword };
  }

  async createAdmin(loginId: string, name: string, password: string): Promise<AdminUser> {
    return this.admins.save(this.admins.create({ loginId, name, passwordHash: await hashPassword(password) }));
  }
}
