import { Column, Entity } from 'typeorm';
import { TenantBaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

@Entity('service_category')
export class ServiceCategory extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}

@Entity('service_menu')
export class ServiceMenu extends TenantBaseEntity {
  @Column({ type: 'bigint', unsigned: true, transformer: bigintTransformer })
  categoryId: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'int', default: 0 })
  basePrice: number;

  @Column({ type: 'smallint', nullable: true })
  durationMin: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  aliases: string | null;

  @Column({ type: 'tinyint', default: 1 })
  isActive: number;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}
