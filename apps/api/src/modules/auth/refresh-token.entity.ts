import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../common/entities/base.entity';

export type TokenUserType = 'SHOP' | 'ADMIN';

/** 로그 성격 테이블 — delState 없음. 무효화는 revokedAt */
@Entity('refresh_token')
export class RefreshToken {
  @PrimaryColumn({ type: 'bigint', unsigned: true, generated: 'increment', transformer: bigintTransformer })
  id: number;

  @Column({ type: 'varchar', length: 10 })
  userType: TokenUserType;

  @Column({ type: 'bigint', unsigned: true, transformer: bigintTransformer })
  userId: number;

  /** 토큰 원문이 아닌 SHA-256 해시만 저장 */
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  deviceInfo: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
