import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('admin_user')
export class AdminUser extends BaseEntity {
  @Column({ type: 'varchar', length: 50 })
  loginId: string;

  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'datetime', nullable: true })
  lastLoginAt: Date | null;
}
