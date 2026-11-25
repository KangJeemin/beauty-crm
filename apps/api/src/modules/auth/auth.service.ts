import { AuthUser, InvitePreview, LoginResult, ShopStatus, SignupResult, UserRole, UserStatus } from '@beauty-crm/shared';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { ShopAuth } from '../../common/auth/auth.types';
import { Errors } from '../../common/errors/app.exception';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../../common/utils/crypto.util';
import { ShopInvite } from '../invite/shop-invite.entity';
import { Shop } from '../shop/entities/shop.entity';
import { ShopRepository } from '../shop/shop.repository';
import { ShopUser } from '../staff/entities/shop-user.entity';
import { ShopUserRepository } from '../staff/shop-user.repository';
import { ChangePasswordDto, JoinByInviteDto, LoginDto, SignupDto } from './dto/auth.dto';
import { ClientMeta, TokenService } from './token.service';


export interface IssuedLogin {
  result: LoginResult;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly autoApprove: boolean;
  /** 동시에 들어온 갱신 요청(탭 2개 등)을 탈취로 오판하지 않기 위한 유예 시간 */
  private readonly reuseGraceMs: number;

  constructor(
    private readonly ds: DataSource,
    private readonly tokens: TokenService,
    private readonly users: ShopUserRepository,
    private readonly shops: ShopRepository,
    config: ConfigService,
  ) {
    this.autoApprove = config.get('SHOP_AUTO_APPROVE', 'false') === 'true';
    this.reuseGraceMs = Number(config.get('REFRESH_REUSE_GRACE_SEC', 10)) * 1000;
  }

  // ── 가입 ─────────────────────────────────────────────

  /** 매장 + 원장 계정을 한 트랜잭션으로 만든다 */
  async signup(dto: SignupDto, meta: ClientMeta): Promise<{ result: SignupResult; refreshToken?: string }> {
    if (await this.users.loginIdExists(dto.loginId)) throw Errors.loginIdTaken();
    const passwordHash = await hashPassword(dto.password);
    const now = new Date();
    const status = this.autoApprove ? ShopStatus.ACTIVE : ShopStatus.PENDING;

    const { shop, user } = await this.ds.transaction(async (em) => {
      const shop = await em.getRepository(Shop).save(
        em.getRepository(Shop).create({
          name: dto.shopName,
          ownerName: dto.ownerName,
          phone: dto.phone ?? null,
          status,
          approvedAt: this.autoApprove ? now : null,
          termsAgreedAt: now,
          privacyAgreedAt: now,
        }),
      );
      const user = await em.getRepository(ShopUser).save(
        em.getRepository(ShopUser).create({
          shopId: shop.id,
          loginId: dto.loginId,
          passwordHash,
          name: dto.ownerName,
          phone: dto.phone ?? null,
          role: UserRole.OWNER,
        }),
      );
      return { shop, user };
    });
    this.logger.log(`매장 가입: #${shop.id} ${shop.name} (${status})`);

    if (status !== ShopStatus.ACTIVE) return { result: { shopStatus: status } };
    const issued = await this.issueLogin(user, shop, meta);
    return { result: { shopStatus: status, login: issued.result }, refreshToken: issued.refreshToken };
  }

  async invitePreview(code: string): Promise<InvitePreview> {
    const invite = await this.findUsableInvite(this.ds.manager, code);
    const shop = await this.shops.findOneById(invite.shopId);
    if (!shop) throw Errors.inviteInvalid();
    return { shopName: shop.name, role: invite.role, expiresAt: invite.expiresAt.toISOString() };
  }

  /** 초대 코드로 직원(디자이너) 가입 */
  async joinByInvite(dto: JoinByInviteDto, meta: ClientMeta): Promise<{ result: SignupResult; refreshToken?: string }> {
    if (await this.users.loginIdExists(dto.loginId)) throw Errors.loginIdTaken();
    const passwordHash = await hashPassword(dto.password);

    const { user, shop } = await this.ds.transaction(async (em) => {
      const invite = await this.findUsableInvite(em, dto.inviteCode, true);
      const shop = await em.getRepository(Shop).findOneBy({ id: invite.shopId, delState: 0 });
      if (!shop) throw Errors.inviteInvalid();
      const user = await em.getRepository(ShopUser).save(
        em.getRepository(ShopUser).create({
          shopId: shop.id,
          loginId: dto.loginId,
          passwordHash,
          name: dto.name,
          phone: dto.phone ?? null,
          role: invite.role,
        }),
      );
      await em.getRepository(ShopInvite).update(invite.id, { usedAt: new Date(), usedUserId: user.id });
      return { user, shop };
    });

    if (shop.status !== ShopStatus.ACTIVE) return { result: { shopStatus: shop.status } };
    const issued = await this.issueLogin(user, shop, meta);
    return { result: { shopStatus: shop.status, login: issued.result }, refreshToken: issued.refreshToken };
  }

  // ── 로그인 / 토큰 ───────────────────────────────────

  async login(dto: LoginDto, meta: ClientMeta): Promise<IssuedLogin> {
    const user = await this.users.findForLogin(dto.loginId);
    // 아이디가 없어도 같은 시간을 쓰도록 더미 해시와 비교
    const ok = await verifyPassword(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw Errors.invalidCredentials();

    const shop = await this.assertCanUse(user);
    await this.users.save({ id: user.id, lastLoginAt: new Date() });
    return this.issueLogin(user, shop, meta);
  }

  /** Refresh Token 회전: 쓴 토큰은 폐기하고 새 토큰을 발급 */
  async refresh(raw: string | undefined, meta: ClientMeta): Promise<IssuedLogin> {
    if (!raw) throw Errors.unauthorized();

    const outcome = await this.ds.transaction(async (em) => {
      const t = await this.tokens.findByRaw(raw, em);
      if (!t || t.userType !== 'SHOP') return { kind: 'invalid' as const };
      if (t.expiresAt.getTime() <= Date.now()) return { kind: 'expired' as const };

      if (t.revokedAt) {
        const sinceRevoked = Date.now() - t.revokedAt.getTime();
        if (sinceRevoked >= this.reuseGraceMs) {
          // 이미 회전된 토큰이 다시 쓰임 → 탈취 의심, 이 사용자 전체 로그아웃.
          // throw 하면 트랜잭션이 롤백되어 폐기가 취소되므로, 커밋하고 나서 거부한다.
          await this.tokens.revokeAll('SHOP', t.userId, em);
          return { kind: 'reused' as const, userId: t.userId };
        }
      } else {
        await this.tokens.revoke(t.id, em);
      }
      const newRaw = await this.tokens.issueRefresh('SHOP', t.userId, meta, em);
      return { kind: 'ok' as const, userId: t.userId, newRaw };
    });

    if (outcome.kind === 'invalid') throw Errors.unauthorized();
    if (outcome.kind === 'expired') throw Errors.unauthorized('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    if (outcome.kind === 'reused') {
      this.logger.warn(`Refresh Token 재사용 감지 → 전체 로그아웃: shop_user #${outcome.userId}`);
      throw Errors.unauthorized('보안을 위해 다시 로그인해 주세요.');
    }
    const { userId, newRaw } = outcome;

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw Errors.unauthorized();
    const shop = await this.assertCanUse(user);
    return { result: this.buildLoginResult(user, shop), refreshToken: newRaw };
  }

  async logout(raw: string | undefined): Promise<void> {
    if (raw) await this.tokens.revokeByRaw(raw);
  }

  async me(auth: ShopAuth): Promise<AuthUser> {
    const user = await this.users.findOneForShop(auth.shopId, auth.userId);
    const shop = await this.shops.findOneById(auth.shopId);
    if (!user || !shop) throw Errors.unauthorized();
    return this.toAuthUser(user, shop);
  }

  async changePassword(auth: ShopAuth, dto: ChangePasswordDto): Promise<void> {
    const user = await this.users.findWithPassword(auth.shopId, auth.userId);
    if (!user || !(await verifyPassword(dto.currentPassword, user.passwordHash))) {
      throw Errors.invalidCredentials();
    }
    await this.users.save({ id: user.id, passwordHash: await hashPassword(dto.newPassword) });
    // 다른 기기 로그인은 모두 끊는다
    await this.tokens.revokeAll('SHOP', user.id);
  }

  // ── 내부 ─────────────────────────────────────────────

  private async issueLogin(user: ShopUser, shop: Shop, meta: ClientMeta): Promise<IssuedLogin> {
    const refreshToken = await this.tokens.issueRefresh('SHOP', user.id, meta);
    return { result: this.buildLoginResult(user, shop), refreshToken };
  }

  private buildLoginResult(user: ShopUser, shop: Shop): LoginResult {
    return {
      accessToken: this.tokens.signShopAccess({ sub: user.id, shopId: shop.id, role: user.role }),
      expiresIn: this.tokens.accessTtlSec,
      user: this.toAuthUser(user, shop),
    };
  }

  private toAuthUser(user: ShopUser, shop: Shop): AuthUser {
    return {
      id: user.id,
      shopId: shop.id,
      shopName: shop.name,
      loginId: user.loginId,
      name: user.name,
      role: user.role,
      fontScale: user.fontScale,
    };
  }

  /** 계정·매장 상태 확인 (로그인·토큰 갱신 공통) */
  private async assertCanUse(user: ShopUser): Promise<Shop> {
    if (user.status === UserStatus.LOCKED) throw Errors.userLocked();
    const shop = await this.shops.findOneById(user.shopId);
    if (!shop) throw Errors.unauthorized();
    if (shop.status === ShopStatus.PENDING) throw Errors.shopPending();
    if (shop.status !== ShopStatus.ACTIVE) throw Errors.shopSuspended();
    return shop;
  }

  private async findUsableInvite(em: EntityManager, code: string, lock = false): Promise<ShopInvite> {
    const qb = em
      .getRepository(ShopInvite)
      .createQueryBuilder('i')
      .where('i.inviteCode = :code AND i.delState = 0 AND i.usedAt IS NULL AND i.expiresAt > NOW()', {
        code: code.trim().toUpperCase(),
      });
    if (lock) qb.setLock('pessimistic_write'); // 같은 코드로 동시에 두 명 가입 방지
    const invite = await qb.getOne();
    if (!invite) throw Errors.inviteInvalid();
    return invite;
  }
}

