import {
  ClosingSnapshot, DailySettlement, DesignerTotal, ErrorCode, MoneyTotals, MonthlySettlement, UnpaidTreatment,
} from '@beauty-crm/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { ShopAuth } from '../../common/auth/auth.types';
import { AppException } from '../../common/errors/app.exception';
import { ShopUser } from '../staff/entities/shop-user.entity';
import { Treatment } from '../treatment/entities/treatment.entity';
import { businessDayRange, monthRange, todayBusinessDate, ymd } from './business-date';
import { ClosingDto } from './dto/payment.dto';
import { DailyClosing, Payment, PaymentDetail } from './payment.entities';
import { PaymentService } from './payment.service';

const emptyTotals = (): MoneyTotals => ({
  received: 0, cash: 0, card: 0, transfer: 0, etc: 0, prepaidUsed: 0, sales: 0, passSales: 0, passRefunds: 0, discount: 0, paymentCount: 0,
});

/**
 * 정산 (원장님 전용)
 *  - 들어온 돈 = 현금 + 카드 + 이체 + 기타 (선불권 판매 포함, 환불은 음수) → 마감 때 단말기·시재와 대조
 *  - 시술 매출 = 시술·제품 결제 금액 (선불권으로 낸 것 포함, 할인 후)
 *  - 선불권 차감은 들어온 돈이 아니므로 따로 표시
 */
@Injectable()
export class SettlementService {
  constructor(
    private readonly ds: DataSource,
    private readonly payments: PaymentService,
  ) {}

  async daily(auth: ShopAuth, date?: string): Promise<DailySettlement> {
    const day = date ?? todayBusinessDate(this.payments.cutoffHour);
    const rows = await this.ds.getRepository(Payment).find({
      where: { shopId: auth.shopId, businessDate: day, delState: 0 },
      order: { paidAt: 'DESC', id: 'DESC' },
    });
    const items = await this.payments.toItems(auth.shopId, rows);
    const paid = items.filter((p) => p.status === 'PAID');
    const totals = this.sum(paid);

    const closingRow = await this.ds.getRepository(DailyClosing).findOneBy({ shopId: auth.shopId, businessDate: day, delState: 0 });
    let closing: DailySettlement['closing'] = null;
    if (closingRow) {
      const by = await this.ds.getRepository(ShopUser).findOneBy({ id: closingRow.closedBy, shopId: auth.shopId });
      closing = {
        closedAt: closingRow.closedAt.toISOString(),
        closedByName: by?.name ?? '',
        snapshot: {
          received: closingRow.totalAmount, cash: closingRow.cashAmount, card: closingRow.cardAmount, transfer: closingRow.transferAmount,
          etc: closingRow.etcAmount, prepaidUsed: closingRow.prepaidAmount, paymentCount: closingRow.paymentCount,
        },
        actualCash: closingRow.actualCash,
        actualCard: closingRow.actualCard,
        memo: closingRow.memo,
      };
    }

    return {
      date: day,
      totals,
      designers: this.byDesigner(paid),
      payments: items,
      unpaid: await this.unpaid(auth.shopId, day),
      closing,
      changedSinceClosing: !!closing && !sameSnapshot(closing.snapshot, snapshotOf(totals)),
    };
  }

  async monthly(auth: ShopAuth, month?: string): Promise<MonthlySettlement> {
    const m = month ?? todayBusinessDate(this.payments.cutoffHour).slice(0, 7);
    const { from, to } = monthRange(m);
    const rows = await this.ds
      .getRepository(Payment)
      .createQueryBuilder('p')
      .where('p.shopId = :shopId AND p.delState = 0 AND p.status = :st AND p.businessDate BETWEEN :from AND :to', { shopId: auth.shopId, st: 'PAID', from, to })
      .getMany();
    const items = await this.payments.toItems(auth.shopId, rows);
    const closings = await this.ds
      .getRepository(DailyClosing)
      .createQueryBuilder('c')
      .select('c.businessDate', 'd')
      .where('c.shopId = :shopId AND c.delState = 0 AND c.businessDate BETWEEN :from AND :to', { shopId: auth.shopId, from, to })
      .getRawMany();
    const closedDays = new Set(closings.map((c) => ymd(c.d)));

    const days: MonthlySettlement['days'] = [];
    const last = Number(to.slice(8));
    for (let i = 1; i <= last; i++) {
      const date = `${m}-${String(i).padStart(2, '0')}`;
      const t = this.sum(items.filter((p) => p.businessDate === date));
      days.push({ date, received: t.received, sales: t.sales, count: t.paymentCount, closed: closedDays.has(date) });
    }

    // 결제된 시술 기준 메뉴별 건수·금액
    const menus = await this.ds.query(
      `SELECT i.menuName AS menuName, COUNT(*) AS cnt, SUM(i.price) AS amount
         FROM payment p
         JOIN treatment_item i ON i.treatmentId = p.treatmentId AND i.delState = 0
        WHERE p.shopId = ? AND p.delState = 0 AND p.status = 'PAID' AND p.paymentType = 'SERVICE'
          AND p.businessDate BETWEEN ? AND ?
        GROUP BY i.menuName
        ORDER BY amount DESC
        LIMIT 10`,
      [auth.shopId, from, to],
    );

    return {
      month: m,
      totals: this.sum(items),
      days,
      designers: this.byDesigner(items),
      menus: menus.map((r: any) => ({ menuName: r.menuName, count: Number(r.cnt), amount: Number(r.amount) })),
    };
  }

  /** 일 마감 — 다시 마감하면 이전 기록은 소프트 삭제하고 새로 저장 */
  async close(auth: ShopAuth, date: string, dto: ClosingDto): Promise<DailySettlement> {
    if (date > todayBusinessDate(this.payments.cutoffHour)) {
      throw new AppException(ErrorCode.VALIDATION, '아직 오지 않은 날은 마감할 수 없습니다.', HttpStatus.BAD_REQUEST);
    }
    const current = await this.daily(auth, date);
    const t = current.totals;
    await this.ds.transaction(async (em) => {
      await em.getRepository(DailyClosing).update({ shopId: auth.shopId, businessDate: date, delState: 0 }, { delState: 1 });
      await em.getRepository(DailyClosing).insert({
        shopId: auth.shopId, closedBy: auth.userId, businessDate: date,
        cashAmount: t.cash, cardAmount: t.card, transferAmount: t.transfer, prepaidAmount: t.prepaidUsed, etcAmount: t.etc,
        totalAmount: t.received, paymentCount: t.paymentCount,
        actualCash: dto.actualCash ?? null, actualCard: dto.actualCard ?? null, memo: dto.memo ?? null, closedAt: new Date(),
      });
    });
    return this.daily(auth, date);
  }

  private sum(items: Awaited<ReturnType<PaymentService['toItems']>>): MoneyTotals {
    const t = emptyTotals();
    for (const p of items) {
      t.paymentCount++;
      if (p.paymentType === 'SERVICE' || p.paymentType === 'PRODUCT') {
        t.sales += p.finalAmount;
        t.discount += p.discountAmount;
      } else if (p.paymentType === 'PASS_SALE') t.passSales += p.finalAmount;
      else if (p.paymentType === 'PASS_REFUND') t.passRefunds += -p.finalAmount;
      for (const d of p.details) {
        if (d.method === 'PREPAID') t.prepaidUsed += d.amount;
        else {
          t.received += d.amount;
          if (d.method === 'CASH') t.cash += d.amount;
          else if (d.method === 'CARD') t.card += d.amount;
          else if (d.method === 'TRANSFER') t.transfer += d.amount;
          else t.etc += d.amount;
        }
      }
    }
    return t;
  }

  /** 디자이너별 시술 매출 (시술 결제는 담당 디자이너, 그 외는 결제 받은 사람) */
  private byDesigner(items: Awaited<ReturnType<PaymentService['toItems']>>): DesignerTotal[] {
    const map = new Map<string, DesignerTotal>();
    for (const p of items) {
      if (p.paymentType !== 'SERVICE' && p.paymentType !== 'PRODUCT') continue;
      const name = p.designerName ?? '(알 수 없음)';
      const cur = map.get(name) ?? { designerId: null, designerName: name, sales: 0, count: 0 };
      cur.sales += p.finalAmount;
      cur.count++;
      map.set(name, cur);
    }
    return [...map.values()].sort((a, b) => b.sales - a.sales);
  }

  /** 그 영업일에 시술했는데 아직 결제 기록이 없는 시술 */
  private async unpaid(shopId: number, day: string): Promise<UnpaidTreatment[]> {
    const { start, end } = businessDayRange(day, this.payments.cutoffHour);
    const rows = await this.ds
      .getRepository(Treatment)
      .createQueryBuilder('t')
      .where('t.shopId = :shopId AND t.delState = 0 AND t.treatedAt >= :start AND t.treatedAt < :end', { shopId, start, end })
      .andWhere("NOT EXISTS (SELECT 1 FROM payment p WHERE p.treatmentId = t.id AND p.status = 'PAID' AND p.delState = 0)")
      .orderBy('t.treatedAt', 'ASC')
      .getMany();
    if (!rows.length) return [];
    const [customers, designers] = await Promise.all([
      this.ds.query(`SELECT id, name FROM customer WHERE shopId = ? AND id IN (?)`, [shopId, [...new Set(rows.map((r) => r.customerId))]]),
      this.ds.getRepository(ShopUser).findBy({ id: In([...new Set(rows.map((r) => r.designerId))]), shopId }),
    ]);
    return rows.map((t) => ({
      id: t.id,
      customerId: t.customerId,
      customerName: customers.find((c: any) => Number(c.id) === t.customerId)?.name ?? '',
      designerName: designers.find((d) => d.id === t.designerId)?.name ?? '',
      treatedAt: t.treatedAt.toISOString(),
      totalAmount: t.totalAmount,
      summary: t.summary,
    }));
  }
}

function snapshotOf(t: MoneyTotals): ClosingSnapshot {
  return { received: t.received, cash: t.cash, card: t.card, transfer: t.transfer, etc: t.etc, prepaidUsed: t.prepaidUsed, paymentCount: t.paymentCount };
}

function sameSnapshot(a: ClosingSnapshot, b: ClosingSnapshot) {
  return (Object.keys(a) as (keyof ClosingSnapshot)[]).every((k) => a[k] === b[k]);
}
