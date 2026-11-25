import { UserRole, UserStatus } from '@beauty-crm/shared';
import { Column, Entity } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/base.entity';

@Entity('shop_user')
export class ShopUser extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 100 })
  loginId: string;

  /** 조회 시 기본 제외 — 비밀번호 확인할 때만 addSelect / select 로 꺼낸다 */
  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 20, default: UserRole.DESIGNER })
  role: UserRole;

  @Column({ type: 'varchar', length: 20, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ type: 'tinyint', default: 100 })
  fontScale: number;

  @Column({ type: 'datetime', nullable: true })
  lastLoginAt: Date | null;
}
