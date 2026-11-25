import { Gender } from '@beauty-crm/shared';
import { Column, Entity } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/base.entity';

@Entity('customer')
export class Customer extends TenantBaseEntity {
  @Column({ type: 'char', length: 64, nullable: true })
  phoneHash: string | null;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'varbinary', length: 255, nullable: true })
  phoneEnc: Buffer | null;

  @Column({ type: 'char', length: 4, nullable: true })
  phoneLast4: string | null;

  @Column({ type: 'char', length: 1, nullable: true })
  gender: Gender | null;

  @Column({ type: 'smallint', nullable: true })
  birthYear: number | null;

  @Column({ type: 'text', nullable: true })
  memo: string | null;

  @Column({ type: 'datetime', nullable: true })
  firstVisitAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastVisitAt: Date | null;

  @Column({ type: 'int', unsigned: true, default: 0 })
  visitCount: number;

  @Column({ type: 'int', default: 0 })
  totalPaidAmount: number;

  @Column({ type: 'datetime', nullable: true })
  consentAt: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  consentVersion: string | null;
}
