import { Column, Entity } from 'typeorm';
import { TenantBaseEntity, bigintTransformer } from '../../common/entities/base.entity';

@Entity('tag')
export class Tag extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 30 })
  name: string;

  @Column({ type: 'char', length: 7, nullable: true })
  color: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}

@Entity('customer_tag')
export class CustomerTag extends TenantBaseEntity {
  @Column({ type: 'bigint', unsigned: true, transformer: bigintTransformer })
  customerId: number;

  @Column({ type: 'bigint', unsigned: true, transformer: bigintTransformer })
  tagId: number;
}
