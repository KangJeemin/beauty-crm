import { UserRole } from '@beauty-crm/shared';
import { Column, Entity } from 'typeorm';
import { TenantBaseEntity, bigintTransformer } from '../../common/entities/base.entity';

@Entity('shop_invite')
export class ShopInvite extends TenantBaseEntity {
  @Column({ type: 'bigint', unsigned: true, nullable: true, transformer: bigintTransformer })
  usedUserId: number | null;

  @Column({ type: 'bigint', unsigned: true, transformer: bigintTransformer })
  createdBy: number;

  @Column({ type: 'varchar', length: 32 })
  inviteCode: string;

  @Column({ type: 'varchar', length: 20, default: UserRole.DESIGNER })
  role: UserRole;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true })
  usedAt: Date | null;
}
