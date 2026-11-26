import {
  ErrorCode, PassStatus, PaymentItem, PrepaidPassDetail, PrepaidPassItem, UserRole,
} from '@beauty-crm/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, In } from 'typeorm';
import { ShopAuth } from '../../common/auth/auth.types';
import { AppException, Errors } from '../../common/errors/app.exception';
import { Customer } from '../customer/entities/customer.entity';
import { ShopUser } from '../staff/entities/shop-user.entity';
import { Treatment } from '../treatment/entities/treatment.entity';
import { businessDateOf, todayBusinessDate, ymd } from './business-date';
import { PassAdjustDto, PassRefundDto, PaymentCreateDto, PaymentDetailDto, PrepaidPassCreateDto } from './dto/payment.dto';
import { Payment, PaymentDetail, PrepaidPass, PrepaidTransaction } from './payment.entities';

const bad = (msg: string) => new AppException(ErrorCode.VALIDATION, msg, HttpStatus.BAD_REQUEST);
const conflict = (msg: string) => new AppException(ErrorCode.DUPLICATE, msg, HttpStatus.CONFLICT);
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

/**
 * 결제 · 선불권
 *
 * 원칙
 *  - 실제 결제(PG)는 하지 않고 "무엇으로 얼마 받았는지" 기록만 한다.
 *  - 선불권 잔액은 반드시 prepaid_transaction 원장을 통해서만 바뀐다 (balance = 원장 합계).
 *  - 잔액을 바꾸는 작업은 선불권 행을 잠그고(FOR UPDATE) 한 트랜잭션에서 처리 → 동시에 두 번 차감 방지.
 *  - 결제는 지우지 않고 "취소" 상태로 남기며, 선불권 차감도 반대 거래(CANCEL_USE)로 되돌린다.
 */
@Injectable()
export class PaymentService {
  readonly cutoffHour: number;

  constructor(
    private readonly ds: DataSource,
    config: ConfigService,
  ) {
    this.cutoffHour = Number(config.get('BUSINESS_DAY_CUTOFF_HOUR', 4));
  }

  // ── 결제 ─────────────────────────────────────────────

  async create(auth: ShopAuth, dto: PaymentCreateDto): Promise<PaymentItem> {
    const discount = dto.discountAmount ?? 0;
    if (discount > dto.listAmount) throw bad('할인 금액이 결제 금액보다 클 수 없습니다.');
    const finalAmount = dto.listAmount - discount;
    this.assertDetailSum(dto.details, finalAmount);

    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    const businessDate = businessDateOf(paidAt, this.cutoffHour);

    const id = await this.ds.transaction(async (em) => {
      let customerId: number | null = null;
      let paymentType: 'SERVICE' | 'PRODUCT' = dto.paymentType ?? (dto.treatmentId ? 'SERVICE' : 'PRODUCT');

      if (dto.treatmentId) {
        const t = await em
          .getRepository(Treatment)
          .createQueryBuilder('t')
          .setLock('pessimistic_write') // 같은 시술 동시 결제 방지
          .where('t.id = :id AND t.shopId = :shopId AND t.delState = 0', { id: dto.treatmentId, shopId: auth.shopId })
          .getOne();
        if (!t) throw Errors.notFound('시술 기록');
        if (await this.paidPaymentOf(em, auth.shopId, t.id)) throw conflict('이미 결제한 시술입니다. 바꾸려면 결제를 취소하고 다시 입력해 주세요.');
        if (dto.listAmount !== t.totalAmount) throw bad(`시술 금액(${won(t.totalAmount)})과 결제 금액이 다릅니다.`);
        customerId = t.customerId;
        paymentType = 'SERVICE';
      } else if (dto.customerId) {
        await this.mustCustomer(em, auth.shopId, dto.customerId);
        customerId = dto.customerId;
      }

      const p = await em.getRepository(Payment).save(
        em.getRepository(Payment).create({
          shopId: auth.shopId,
          customerId,
          treatmentId: dto.treatmentId ?? null,
          createdBy: auth.userId,
          paymentType,
          listAmount: dto.listAmount,
          discountAmount: discount,
          discountReason: discount ? dto.discountReason ?? null : null,
          finalAmount,
          paidAt,
          businessDate,
          status: 'PAID',
          memo: dto.memo ?? null,
        }),
      );

      // 선불권 차감은 선불권별로 모아서 잔액 확인
      const usePerPass = new Map<number, number>();
      for (const d of dto.details) {
        if (d.method === 'PREPAID') {
          if (!d.prepaidPassId) throw bad('차감할 선불권을 선택해 주세요.');
          usePerPass.set(d.prepaidPassId, (usePerPass.get(d.prepaidPassId) ?? 0) + d.amount);
        } else if (d.prepaidPassId) {
          throw bad('선불권은 결제수단이 "선불권"일 때만 선택할 수 있습니다.');
        }
      }
      const passes = new Map<number, PrepaidPass>();
      for (const [passId, total] of usePerPass) {
        const pass = await this.lockPass(em, auth.shopId, passId);
        if (pass.customerId !== customerId) throw bad('다른 고객의 선불권은 사용할 수 없습니다.');
        this.assertUsable(pass, businessDate);
        if (pass.balance < total) throw bad(`선불권 잔액(${won(pass.balance)})이 부족합니다.`);
        passes.set(passId, pass);
      }

      for (const d of dto.details) {
        const det = await em.getRepository(PaymentDetail).save(
          em.getRepository(PaymentDetail).create({
            shopId: auth.shopId, paymentId: p.id, method: d.method, amount: d.amount, prepaidPassId: d.method === 'PREPAID' ? d.prepaidPassId! : null,
          }),
        );
        if (d.method === 'PREPAID') {
          await this.moveBalance(em, auth, passes.get(d.prepaidPassId!)!, -d.amount, 'USE', { paymentId: p.id, paymentDetailId: det.id });
        }
      }

      if (customerId) await this.recomputeCustomerPaid(em, auth.shopId, customerId);
      return p.id;
    });
    return this.get(auth, id);
  }

  /** 결제 취소 — 원장(선불권)은 반대 거래로 되돌린다. 원장님 또는 결제를 입력한 사람만 */
  async cancel(auth: ShopAuth, id: number): Promise<PaymentItem> {
    await this.ds.transaction(async (em) => {
      const p = await em
        .getRepository(Payment)
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .where('p.id = :id AND p.shopId = :shopId AND p.delState = 0', { id, shopId: auth.shopId })
        .getOne();
      if (!p) throw Errors.notFound('결제');
      if (p.status !== 'PAID') throw bad('이미 취소된 결제입니다.');
      if (auth.role !== UserRole.OWNER && p.createdBy !== auth.userId) throw Errors.forbidden('결제를 입력한 사람이나 원장님만 취소할 수 있습니다.');
      if (p.paymentType === 'PASS_REFUND') throw bad('환불 기록은 취소할 수 없습니다.');

      if (p.paymentType === 'PASS_SALE') {
        const pass = await this.lockPass(em, auth.shopId, p.prepaidPassId!);
        const others = await em.getRepository(PrepaidTransaction).count({
          where: { prepaidPassId: pass.id, shopId: auth.shopId, delState: 0, txType: In(['USE', 'ADJUST', 'REFUND']) },
        });
        if (others > 0) throw bad('이미 사용(또는 조정)한 선불권은 판매를 취소할 수 없습니다. 선불권 환불을 이용해 주세요.');
        await this.moveBalance(em, auth, pass, -pass.balance, 'REFUND', { paymentId: p.id, memo: '판매 취소' }, 'REFUNDED');
      } else {
        const uses = await em.getRepository(PaymentDetail).find({ where: { paymentId: p.id, shopId: auth.shopId, method: 'PREPAID', delState: 0 } });
        for (const d of uses) {
          const pass = await this.lockPass(em, auth.shopId, d.prepaidPassId!);
          if (pass.status === 'REFUNDED') throw bad('이미 환불된 선불권으로 결제한 건이라 취소할 수 없습니다.');
          await this.moveBalance(em, auth, pass, d.amount, 'CANCEL_USE', { paymentId: p.id, paymentDetailId: d.id, memo: '결제 취소' });
        }
      }

      await em.getRepository(Payment).update(p.id, { status: 'CANCELLED', cancelledAt: new Date() });
      if (p.customerId) await this.recomputeCustomerPaid(em, auth.shopId, p.customerId);
    });
    return this.get(auth, id);
  }

  async get(auth: ShopAuth, id: number): Promise<PaymentItem> {
    const p = await this.ds.getRepository(Payment).findOneBy({ id, shopId: auth.shopId, delState: 0 });
    if (!p) throw Errors.notFound('결제');
    return (await this.toItems(auth.shopId, [p]))[0];
  }

  // ── 선불권 ───────────────────────────────────────────

  /** 선불권 판매: 선불권 + 판매 결제 + 충전 거래를 한 번에 */
  async sellPass(auth: ShopAuth, dto: PrepaidPassCreateDto): Promise<PrepaidPassDetail> {
    if (dto.details.some((d) => d.method === 'PREPAID')) throw bad('선불권으로 선불권을 살 수는 없습니다.');
    this.assertDetailSum(dto.details, dto.chargeAmount);
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    const bonus = dto.bonusAmount ?? 0;
    if (dto.expireAt && dto.expireAt < businessDateOf(paidAt, this.cutoffHour)) throw bad('유효기간이 판매일보다 빠릅니다.');

    const passId = await this.ds.transaction(async (em) => {
      await this.mustCustomer(em, auth.shopId, dto.customerId);
      const pass = await em.getRepository(PrepaidPass).save(
        em.getRepository(PrepaidPass).create({
          shopId: auth.shopId, customerId: dto.customerId, passName: dto.passName, chargeAmount: dto.chargeAmount, bonusAmount: bonus,
          balance: 0, purchasedAt: paidAt, expireAt: dto.expireAt ?? null, status: 'ACTIVE', memo: dto.memo ?? null,
        }),
      );
      const p = await em.getRepository(Payment).save(
        em.getRepository(Payment).create({
          shopId: auth.shopId, customerId: dto.customerId, prepaidPassId: pass.id, createdBy: auth.userId, paymentType: 'PASS_SALE',
          listAmount: dto.chargeAmount, discountAmount: 0, finalAmount: dto.chargeAmount, paidAt,
          businessDate: businessDateOf(paidAt, this.cutoffHour), status: 'PAID', memo: dto.passName,
        }),
      );
      await em.getRepository(PaymentDetail).insert(
        dto.details.map((d) => ({ shopId: auth.shopId, paymentId: p.id, method: d.method, amount: d.amount, prepaidPassId: null })),
      );
      await this.moveBalance(em, auth, pass, dto.chargeAmount + bonus, 'CHARGE', {
        paymentId: p.id, memo: bonus ? `충전 ${won(dto.chargeAmount)} + 보너스 ${won(bonus)}` : `충전 ${won(dto.chargeAmount)}`,
      });
      await this.recomputeCustomerPaid(em, auth.shopId, dto.customerId);
      return pass.id;
    });
    return this.passDetail(auth, passId);
  }

  async listPasses(auth: ShopAuth, customerId: number): Promise<PrepaidPassItem[]> {
    const rows = await this.ds.getRepository(PrepaidPass).find({
      where: { shopId: auth.shopId, customerId, delState: 0 },
      order: { purchasedAt: 'DESC', id: 'DESC' },
    });
    return rows.map((p) => this.toPassItem(p));
  }

  async passDetail(auth: ShopAuth, id: number): Promise<PrepaidPassDetail> {
    const p = await this.ds.getRepository(PrepaidPass).findOneBy({ id, shopId: auth.shopId, delState: 0 });
    if (!p) throw Errors.notFound('선불권');
    const [customer, txs] = await Promise.all([
      this.ds.getRepository(Customer).findOneBy({ id: p.customerId, shopId: auth.shopId }),
      this.ds.getRepository(PrepaidTransaction).find({ where: { prepaidPassId: id, shopId: auth.shopId, delState: 0 }, order: { id: 'DESC' } }),
    ]);
    const users = await this.userNames(auth.shopId, txs.map((t) => t.createdBy));
    return {
      ...this.toPassItem(p),
      customerName: customer?.name ?? '(삭제된 고객)',
      transactions: txs.map((t) => ({
        id: t.id, txType: t.txType, amount: t.amount, balanceAfter: t.balanceAfter, paymentId: t.paymentId, memo: t.memo,
        createdByName: users.get(t.createdBy) ?? '', createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  /** 잔액 직접 조정 (원장님) — 서비스 적립, 잘못 입력한 잔액 바로잡기 */
  async adjustPass(auth: ShopAuth, id: number, dto: PassAdjustDto): Promise<PrepaidPassDetail> {
    if (dto.amount === 0) throw bad('조정 금액을 입력해 주세요.');
    await this.ds.transaction(async (em) => {
      const pass = await this.lockPass(em, auth.shopId, id);
      if (pass.status === 'REFUNDED') throw bad('환불된 선불권은 조정할 수 없습니다.');
      if (pass.balance + dto.amount < 0) throw bad(`잔액(${won(pass.balance)})보다 많이 뺄 수 없습니다.`);
      await this.moveBalance(em, auth, pass, dto.amount, 'ADJUST', { memo: dto.memo });
    });
    return this.passDetail(auth, id);
  }

  /** 선불권 환불 (원장님) — 남은 잔액을 없애고, 돌려준 돈은 음수 결제로 기록 (그날 들어온 돈에서 빠짐) */
  async refundPass(auth: ShopAuth, id: number, dto: PassRefundDto): Promise<PrepaidPassDetail> {
    await this.ds.transaction(async (em) => {
      const pass = await this.lockPass(em, auth.shopId, id);
      if (pass.status === 'REFUNDED') throw bad('이미 환불된 선불권입니다.');
      if (dto.refundAmount > pass.balance) throw bad(`돌려줄 금액은 잔액(${won(pass.balance)})을 넘을 수 없습니다.`);

      let paymentId: number | null = null;
      if (dto.refundAmount > 0) {
        const paidAt = new Date();
        const p = await em.getRepository(Payment).save(
          em.getRepository(Payment).create({
            shopId: auth.shopId, customerId: pass.customerId, prepaidPassId: pass.id, createdBy: auth.userId, paymentType: 'PASS_REFUND',
            listAmount: -dto.refundAmount, discountAmount: 0, finalAmount: -dto.refundAmount, paidAt,
            businessDate: businessDateOf(paidAt, this.cutoffHour), status: 'PAID', memo: dto.memo ?? `${pass.passName} 환불`,
          }),
        );
        await em.getRepository(PaymentDetail).insert({ shopId: auth.shopId, paymentId: p.id, method: dto.method, amount: -dto.refundAmount, prepaidPassId: null });
        paymentId = p.id;
      }
      await this.moveBalance(em, auth, pass, -pass.balance, 'REFUND', { paymentId, memo: dto.memo ?? `환불 ${won(dto.refundAmount)}` }, 'REFUNDED');
      await this.recomputeCustomerPaid(em, auth.shopId, pass.customerId);
    });
    return this.passDetail(auth, id);
  }

  // ── 공용 ─────────────────────────────────────────────

  async paidPaymentOf(em: EntityManager, shopId: number, treatmentId: number): Promise<Payment | null> {
    return em.getRepository(Payment).findOneBy({ shopId, treatmentId, status: 'PAID', delState: 0 });
  }

  /** 고객 누적 결제액 = 실제 받은 돈 (선불권 차감분 제외, 선불권 판매 포함, 환불 차감) */
  async recomputeCustomerPaid(em: EntityManager, shopId: number, customerId: number) {
    await em.query(
      `UPDATE customer c
          SET c.totalPaidAmount = COALESCE((
                SELECT SUM(d.amount) FROM payment p
                  JOIN payment_detail d ON d.paymentId = p.id AND d.delState = 0
                 WHERE p.shopId = ? AND p.customerId = c.id AND p.status = 'PAID' AND p.delState = 0 AND d.method <> 'PREPAID'
              ), 0)
        WHERE c.id = ? AND c.shopId = ?`,
      [shopId, customerId, shopId],
    );
  }

  async toItems(shopId: number, rows: Payment[]): Promise<PaymentItem[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const details = await this.ds.getRepository(PaymentDetail).find({ where: { paymentId: In(ids), shopId, delState: 0 }, order: { id: 'ASC' } });
    const passIds = [...new Set([...details.map((d) => d.prepaidPassId), ...rows.map((r) => r.prepaidPassId)].filter((v): v is number => !!v))];
    const passes = passIds.length ? await this.ds.getRepository(PrepaidPass).findBy({ id: In(passIds), shopId }) : [];
    const custIds = [...new Set(rows.map((r) => r.customerId).filter((v): v is number => !!v))];
    const customers = custIds.length ? await this.ds.getRepository(Customer).findBy({ id: In(custIds), shopId }) : [];
    const tIds = [...new Set(rows.map((r) => r.treatmentId).filter((v): v is number => !!v))];
    const treatments = tIds.length ? await this.ds.getRepository(Treatment).findBy({ id: In(tIds), shopId }) : [];
    const users = await this.userNames(shopId, [...rows.map((r) => r.createdBy), ...treatments.map((t) => t.designerId)]);

    return rows.map((p) => {
      const t = treatments.find((x) => x.id === p.treatmentId);
      const pass = passes.find((x) => x.id === p.prepaidPassId);
      return {
        id: p.id,
        paymentType: p.paymentType,
        status: p.status,
        customerId: p.customerId,
        customerName: customers.find((c) => c.id === p.customerId)?.name ?? null,
        treatmentId: p.treatmentId,
        prepaidPassId: p.prepaidPassId,
        listAmount: p.listAmount,
        discountAmount: p.discountAmount,
        discountReason: p.discountReason,
        finalAmount: p.finalAmount,
        paidAt: p.paidAt.toISOString(),
        businessDate: ymd(p.businessDate),
        cancelledAt: p.cancelledAt?.toISOString() ?? null,
        memo: p.memo,
        createdByName: users.get(p.createdBy) ?? '',
        designerName: users.get(t ? t.designerId : p.createdBy) ?? null,
        summary: t?.summary ?? (pass ? `${pass.passName} ${p.paymentType === 'PASS_REFUND' ? '환불' : '판매'}` : p.memo),
        details: details
          .filter((d) => d.paymentId === p.id)
          .map((d) => ({
            id: d.id, method: d.method, amount: d.amount, prepaidPassId: d.prepaidPassId,
            passName: passes.find((x) => x.id === d.prepaidPassId)?.passName ?? null,
          })),
      };
    });
  }

  toPassItem(p: PrepaidPass): PrepaidPassItem {
    // 유효기간이 지난 사용 중 선불권은 화면에 "만료"로 보여준다 (원장님이 조정·환불은 가능)
    const expired = p.status === 'ACTIVE' && p.expireAt && ymd(p.expireAt) < todayBusinessDate(this.cutoffHour);
    return {
      id: p.id, customerId: p.customerId, passName: p.passName, chargeAmount: p.chargeAmount, bonusAmount: p.bonusAmount,
      balance: p.balance, purchasedAt: p.purchasedAt.toISOString(), expireAt: p.expireAt ? ymd(p.expireAt) : null,
      status: expired ? 'EXPIRED' : p.status, memo: p.memo,
    };
  }

  private assertDetailSum(details: PaymentDetailDto[], expected: number) {
    const sum = details.reduce((a, d) => a + d.amount, 0);
    if (expected > 0 && !details.length) throw bad('결제수단을 입력해 주세요.');
    if (sum !== expected) throw bad(`결제수단 금액 합계(${won(sum)})가 받을 금액(${won(expected)})과 다릅니다.`);
  }

  private assertUsable(pass: PrepaidPass, businessDate: string) {
    if (pass.status === 'REFUNDED') throw bad('환불된 선불권입니다.');
    if (pass.status === 'EXHAUSTED' || pass.balance <= 0) throw bad('잔액이 없는 선불권입니다.');
    if (pass.expireAt && ymd(pass.expireAt) < businessDate) throw bad(`유효기간(${ymd(pass.expireAt)})이 지난 선불권입니다.`);
  }

  private async lockPass(em: EntityManager, shopId: number, id: number): Promise<PrepaidPass> {
    const pass = await em
      .getRepository(PrepaidPass)
      .createQueryBuilder('p')
      .setLock('pessimistic_write')
      .where('p.id = :id AND p.shopId = :shopId AND p.delState = 0', { id, shopId })
      .getOne();
    if (!pass) throw Errors.notFound('선불권');
    return pass;
  }

  /** 잔액 변경은 반드시 여기로 — 원장 기록과 잔액을 함께 바꾼다 */
  private async moveBalance(
    em: EntityManager,
    auth: ShopAuth,
    pass: PrepaidPass,
    amount: number,
    txType: PrepaidTransaction['txType'],
    ref: { paymentId?: number | null; paymentDetailId?: number | null; memo?: string | null },
    forceStatus?: PassStatus,
  ) {
    const balance = pass.balance + amount;
    if (balance < 0) throw bad('선불권 잔액이 부족합니다.');
    const status: PassStatus = forceStatus ?? (balance === 0 ? 'EXHAUSTED' : pass.status === 'EXHAUSTED' ? 'ACTIVE' : pass.status);
    await em.getRepository(PrepaidPass).update(pass.id, { balance, status });
    await em.getRepository(PrepaidTransaction).insert({
      shopId: auth.shopId, prepaidPassId: pass.id, createdBy: auth.userId, txType, amount, balanceAfter: balance,
      paymentId: ref.paymentId ?? null, paymentDetailId: ref.paymentDetailId ?? null, memo: ref.memo?.slice(0, 255) ?? null,
    });
    pass.balance = balance;
    pass.status = status;
  }

  private async mustCustomer(em: EntityManager, shopId: number, id: number) {
    if (!(await em.getRepository(Customer).count({ where: { id, shopId, delState: 0 } }))) throw Errors.notFound('고객');
  }

  private async userNames(shopId: number, ids: number[]): Promise<Map<number, string>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const users = await this.ds.getRepository(ShopUser).findBy({ id: In(unique), shopId });
    return new Map(users.map((u) => [u.id, u.name]));
  }
}
