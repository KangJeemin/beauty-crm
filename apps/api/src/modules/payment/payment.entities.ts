import { PassStatus, PassTxType, PaymentMethod, PaymentStatus, PaymentType } from '@beauty-crm/shared';
import { Column, Entity } from 'typeorm';
import { TenantBaseEntity, bigintTransformer } from '../../common/entities/base.entity';

const bigint = { type: 'bigint' as const, unsigned: true, transformer: bigintTransformer };

/** 결제 1건 — 실제 돈 처리(PG)는 하지 않고 "기록"만 한다 */
@Entity('payment')
export class Payment extends TenantBaseEntity {
  @Column({ ...bigint, nullable: true }) customerId: number | null;
  @Column({ ...bigint, nullable: true }) treatmentId: number | null;
  @Column({ ...bigint, nullable: true }) prepaidPassId: number | null;
  @Column(bigint) createdBy: number;
  @Column({ type: 'varchar', length: 20, default: 'SERVICE' }) paymentType: PaymentType;
  @Column({ type: 'int', default: 0 }) listAmount: number;
  @Column({ type: 'int', default: 0 }) discountAmount: number;
  @Column({ type: 'varchar', length: 100, nullable: true }) discountReason: string | null;
  @Column({ type: 'int', default: 0 }) finalAmount: number;
  @Column({ type: 'datetime' }) paidAt: Date;
  /** 'YYYY-MM-DD' — 새벽 마감(기본 04시 이전)은 전날 영업일 */
  @Column({ type: 'date' }) businessDate: string;
  @Column({ type: 'varchar', length: 20, default: 'PAID' }) status: PaymentStatus;
  @Column({ type: 'datetime', nullable: true }) cancelledAt: Date | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) memo: string | null;
}

/** 결제수단별 금액 (카드 5만 + 현금 2만 / 선불권 차감) */
@Entity('payment_detail')
export class PaymentDetail extends TenantBaseEntity {
  @Column(bigint) paymentId: number;
  @Column({ ...bigint, nullable: true }) prepaidPassId: number | null;
  @Column({ type: 'varchar', length: 20 }) method: PaymentMethod;
  @Column({ type: 'int' }) amount: number;
}

@Entity('prepaid_pass')
export class PrepaidPass extends TenantBaseEntity {
  @Column(bigint) customerId: number;
  @Column({ type: 'varchar', length: 100 }) passName: string;
  @Column({ type: 'int', default: 0 }) chargeAmount: number;
  @Column({ type: 'int', default: 0 }) bonusAmount: number;
  /** prepaid_transaction.amount 합계와 항상 같아야 한다 */
  @Column({ type: 'int', default: 0 }) balance: number;
  @Column({ type: 'datetime' }) purchasedAt: Date;
  @Column({ type: 'date', nullable: true }) expireAt: string | null;
  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' }) status: PassStatus;
  @Column({ type: 'varchar', length: 500, nullable: true }) memo: string | null;
}

/** 선불권 잔액 변동 원장 (+충전 / -사용) */
@Entity('prepaid_transaction')
export class PrepaidTransaction extends TenantBaseEntity {
  @Column(bigint) prepaidPassId: number;
  @Column({ ...bigint, nullable: true }) paymentId: number | null;
  @Column({ ...bigint, nullable: true }) paymentDetailId: number | null;
  @Column(bigint) createdBy: number;
  @Column({ type: 'varchar', length: 20 }) txType: PassTxType;
  @Column({ type: 'int' }) amount: number;
  @Column({ type: 'int' }) balanceAfter: number;
  @Column({ type: 'varchar', length: 255, nullable: true }) memo: string | null;
}

/** 일 마감 스냅샷 */
@Entity('daily_closing')
export class DailyClosing extends TenantBaseEntity {
  @Column(bigint) closedBy: number;
  @Column({ type: 'date' }) businessDate: string;
  @Column({ type: 'int', default: 0 }) cashAmount: number;
  @Column({ type: 'int', default: 0 }) cardAmount: number;
  @Column({ type: 'int', default: 0 }) transferAmount: number;
  @Column({ type: 'int', default: 0 }) prepaidAmount: number;
  @Column({ type: 'int', default: 0 }) etcAmount: number;
  @Column({ type: 'int', default: 0 }) totalAmount: number;
  @Column({ type: 'int', default: 0 }) paymentCount: number;
  @Column({ type: 'int', nullable: true }) actualCash: number | null;
  @Column({ type: 'int', nullable: true }) actualCard: number | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) memo: string | null;
  @Column({ type: 'datetime' }) closedAt: Date;
}
