import { PlanType, ShopStatus } from '@beauty-crm/shared';
import { Column, Entity } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

/**
 * 엔티티 작성 예시 — 테이블명은 snake_case, 프로퍼티(=컬럼)는 camelCase.
 * 다른 엔티티도 이 형태를 따라 1단계부터 하나씩 추가한다.
 */
@Entity('shop')
export class Shop extends BaseEntity {
  @Column({ type: 'bigint', unsigned: true, nullable: true, transformer: bigintTransformer })
  approvedBy: number | null;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  ownerName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  bizNo: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 20, default: ShopStatus.PENDING })
  status: ShopStatus;

  @Column({ type: 'varchar', length: 20, default: PlanType.FREE })
  planType: PlanType;

  @Column({ type: 'tinyint', default: 0 })
  isFounder: number;

  @Column({ type: 'int', unsigned: true, default: 1024 })
  storageQuotaMb: number;

  @Column({ type: 'bigint', unsigned: true, default: 0, transformer: bigintTransformer })
  storageUsedBytes: number;

  @Column({ type: 'json', nullable: true })
  businessHours: Record<string, [string, string] | null> | null;

  @Column({ type: 'datetime', nullable: true })
  termsAgreedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  privacyAgreedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  approvedAt: Date | null;
}
