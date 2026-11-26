import { Column, Entity } from 'typeorm';
import { TenantBaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

const decimal = { to: (v?: number | null) => v, from: (v?: string | null) => (v == null ? v : Number(v)) };
const bigint = { type: 'bigint' as const, unsigned: true, transformer: bigintTransformer };

/** 방문 1회 = treatment 1건 */
@Entity('treatment')
export class Treatment extends TenantBaseEntity {
  @Column(bigint)
  customerId: number;

  @Column(bigint)
  designerId: number;

  @Column({ ...bigint, nullable: true })
  copiedFromId: number | null;

  @Column({ type: 'datetime' })
  treatedAt: Date;

  @Column({ type: 'varchar', length: 10, default: 'TEXT' })
  inputType: 'VOICE' | 'TEXT' | 'MANUAL';

  /** MVP 에서는 저장 = 확정(CONFIRMED). 검토 대기는 voice_record 가 들고 있다 */
  @Column({ type: 'varchar', length: 20, default: 'CONFIRMED' })
  status: 'DRAFT' | 'CONFIRMED';

  @Column({ type: 'varchar', length: 500, nullable: true })
  summary: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'int', default: 0 })
  totalAmount: number;
}

@Entity('treatment_item')
export class TreatmentItemEntity extends TenantBaseEntity {
  @Column(bigint)
  treatmentId: number;

  @Column({ ...bigint, nullable: true })
  serviceMenuId: number | null;

  /** 메뉴명·가격은 저장 시점 값을 복사 (가격표가 바뀌어도 이력 유지) */
  @Column({ type: 'varchar', length: 100 })
  menuName: string;

  @Column({ type: 'int', default: 0 })
  price: number;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}

@Entity('treatment_recipe')
export class TreatmentRecipeEntity extends TenantBaseEntity {
  @Column(bigint)
  treatmentItemId: number;

  @Column({ type: 'varchar', length: 50, nullable: true }) area: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) productName: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) colorCode: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) mixRatio: string | null;
  @Column({ type: 'decimal', precision: 4, scale: 1, nullable: true, transformer: decimal }) developerPct: number | null;
  @Column({ type: 'decimal', precision: 6, scale: 1, nullable: true, transformer: decimal }) amountGram: number | null;
  @Column({ type: 'smallint', nullable: true }) processingMin: number | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) rodSize: string | null;
  @Column({ type: 'smallint', nullable: true }) heatTemp: number | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) memo: string | null;
  @Column({ type: 'int', default: 0 }) sortOrder: number;
}
