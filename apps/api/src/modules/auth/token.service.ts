import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { AdminTokenPayload, ShopTokenPayload } from '../../common/auth/auth.types';
import { newOpaqueToken, sha256 } from '../../common/utils/crypto.util';
import { RefreshToken, TokenUserType } from './refresh-token.entity';

export interface ClientMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/** 기간 문자열(30m, 12h, 30d) → 초 */
export function parseDuration(v: string): number {
  const m = /^(\d+)([smhd])$/.exec(v.trim());
  if (!m) throw new Error(`기간 형식 오류: ${v}`);
  const n = Number(m[1]);
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
}

@Injectable()
export class TokenService {
  readonly accessTtlSec: number;
  readonly refreshTtlSec: number;
  readonly adminTtlSec = 12 * 3600;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
    @InjectRepository(RefreshToken) private readonly tokens: Repository<RefreshToken>,
  ) {
    this.accessTtlSec = parseDuration(config.get('JWT_ACCESS_EXPIRES', '30m'));
    this.refreshTtlSec = parseDuration(config.get('JWT_REFRESH_EXPIRES', '30d'));
  }

  signShopAccess(p: Omit<ShopTokenPayload, 'typ'>): string {
    return this.jwt.sign({ typ: 'SHOP', ...p } satisfies ShopTokenPayload, { expiresIn: this.accessTtlSec });
  }

  signAdminAccess(adminId: number): string {
    return this.jwt.sign({ typ: 'ADMIN', sub: adminId } satisfies AdminTokenPayload, { expiresIn: this.adminTtlSec });
  }

  /** Refresh Token 발급 — DB 에는 해시만 저장하고 원문은 쿠키로만 내려간다 */
  async issueRefresh(userType: TokenUserType, userId: number, meta: ClientMeta, em?: EntityManager): Promise<string> {
    const raw = newOpaqueToken();
    const repo = em ? em.getRepository(RefreshToken) : this.tokens;
    await repo.insert({
      userType,
      userId,
      tokenHash: sha256(raw),
      ip: meta.ip?.slice(0, 45) ?? null,
      deviceInfo: meta.userAgent?.slice(0, 255) ?? null,
      expiresAt: new Date(Date.now() + this.refreshTtlSec * 1000),
      revokedAt: null,
    });
    return raw;
  }

  findByRaw(raw: string, em: EntityManager): Promise<RefreshToken | null> {
    return em
      .getRepository(RefreshToken)
      .createQueryBuilder('t')
      .setLock('pessimistic_write') // 동시 갱신 요청 직렬화
      .where('t.tokenHash = :h', { h: sha256(raw) })
      .getOne();
  }

  async revoke(id: number, em?: EntityManager): Promise<void> {
    const repo = em ? em.getRepository(RefreshToken) : this.tokens;
    await repo.update({ id, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async revokeByRaw(raw: string): Promise<void> {
    await this.tokens.update({ tokenHash: sha256(raw), revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /** 해당 사용자의 모든 기기 로그아웃 (비밀번호 변경·토큰 탈취 의심 시) */
  async revokeAll(userType: TokenUserType, userId: number, em?: EntityManager): Promise<void> {
    const repo = em ? em.getRepository(RefreshToken) : this.tokens;
    await repo.update({ userType, userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }
}
