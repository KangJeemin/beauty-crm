/**
 * 4단계 e2e — 결제 · 선불권 · 정산 · 일 마감
 */
import { ErrorCode } from '@beauty-crm/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

const RUN = Date.now().toString(36);
const PW = 'test1234';
// 정산 검증용 고정 영업일 (매장이 실행마다 새로 생기므로 다른 실행과 섞이지 않음)
const DAY = '2026-03-10';
const at = (hhmm: string, day = DAY) => `${day}T${hhmm}:00+09:00`;

interface S {
  token: string;
  userId: number;
  shopId: number;
}

describe('4단계: 결제 · 선불권 · 정산', () => {
  let app: INestApplication;
  let ds: DataSource;
  const api = () => request(app.getHttpServer());
  const h = (s: S) => ({ Authorization: `Bearer ${s.token}` });

  let A: S;
  let B: S;
  let D: S; // A 매장 디자이너
  let kim: number;
  let lee: number;
  let bCust: number;

  async function signup(tag: string): Promise<S> {
    const res = await api()
      .post('/api/auth/signup')
      .send({ shopName: `정산${tag}`, ownerName: `원장${tag}`, loginId: `p${tag}${RUN}`, password: PW, agreeTerms: true, agreePrivacy: true })
      .expect(201);
    const l = res.body.data.login;
    return { token: l.accessToken, userId: l.user.id, shopId: l.user.shopId };
  }

  async function treatment(s: S, customerId: number, price: number, treatedAt?: string, designerId?: number): Promise<number> {
    const res = await api()
      .post('/api/treatments')
      .set(h(s))
      .send({ customerId, designerId, treatedAt, items: [{ menuName: '테스트 시술', price, recipes: [] }] })
      .expect(201);
    return res.body.data.id;
  }

  const pay = (s: S, body: Record<string, unknown>) => api().post('/api/payments').set(h(s)).send(body);
  const customer = async (s: S, id: number) => (await api().get(`/api/customers/${id}`).set(h(s))).body.data;
  const pass = async (s: S, id: number) => (await api().get(`/api/prepaid-passes/${id}`).set(h(s))).body.data;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    A = await signup('A');
    B = await signup('B');
    const inv = await api().post('/api/invites').set(h(A)).expect(201);
    const j = await api().post('/api/auth/join').send({ inviteCode: inv.body.data.inviteCode, loginId: `pd${RUN}`, password: PW, name: '디자이너' }).expect(201);
    D = { token: j.body.data.login.accessToken, userId: j.body.data.login.user.id, shopId: A.shopId };
    kim = (await api().post('/api/customers').set(h(A)).send({ name: '김미영' })).body.data.id;
    lee = (await api().post('/api/customers').set(h(A)).send({ name: '이순자' })).body.data.id;
    bCust = (await api().post('/api/customers').set(h(B)).send({ name: 'B고객' })).body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 시술 결제 ──────────────────────────────────────

  describe('시술 결제', () => {
    let t1: number;

    it('할인 + 카드·현금 나눠 결제 → 시술에 결제 표시, 고객 누적 결제액', async () => {
      t1 = await treatment(A, kim, 70000);
      const res = await pay(A, {
        treatmentId: t1, listAmount: 70000, discountAmount: 5000, discountReason: '단골 할인',
        details: [{ method: 'CARD', amount: 50000 }, { method: 'CASH', amount: 15000 }],
      }).expect(201);
      expect(res.body.data).toMatchObject({ paymentType: 'SERVICE', status: 'PAID', finalAmount: 65000, customerId: kim, discountReason: '단골 할인' });
      expect(res.body.data.details.map((d: any) => [d.method, d.amount])).toEqual([['CARD', 50000], ['CASH', 15000]]);

      const t = (await api().get(`/api/treatments/${t1}`).set(h(A))).body.data;
      expect(t.payment).toMatchObject({ finalAmount: 65000, discountAmount: 5000 });
      expect((await customer(A, kim)).totalPaidAmount).toBe(65000);
    });

    it('금액이 안 맞으면 400, 같은 시술 두 번 결제는 409', async () => {
      const t = await treatment(A, kim, 30000);
      const sumWrong = await pay(A, { treatmentId: t, listAmount: 30000, details: [{ method: 'CARD', amount: 20000 }] }).expect(400);
      expect(sumWrong.body.message).toContain('합계');
      await pay(A, { treatmentId: t, listAmount: 30000, discountAmount: 40000, details: [] }).expect(400);
      const listWrong = await pay(A, { treatmentId: t, listAmount: 25000, details: [{ method: 'CARD', amount: 25000 }] }).expect(400);
      expect(listWrong.body.message).toContain('시술 금액');
      await pay(A, { treatmentId: t1, listAmount: 70000, details: [{ method: 'CARD', amount: 70000 }] }).expect(409);
    });

    it('결제된 시술은 금액 변경·삭제 불가 (메모만 수정은 가능)', async () => {
      const item = { menuName: '테스트 시술', price: 70000, recipes: [] };
      await api().put(`/api/treatments/${t1}`).set(h(A)).send({ customerId: kim, items: [{ ...item, price: 80000 }] }).expect(400);
      await api().put(`/api/treatments/${t1}`).set(h(A)).send({ customerId: lee, items: [item] }).expect(400);
      await api().put(`/api/treatments/${t1}`).set(h(A)).send({ customerId: kim, items: [item], note: '메모만' }).expect(200);
      await api().delete(`/api/treatments/${t1}`).set(h(A)).expect(400);
    });

    it('무료 시술(0원)은 결제수단 없이 기록', async () => {
      const t = await treatment(A, kim, 10000);
      await pay(A, { treatmentId: t, listAmount: 10000, discountAmount: 10000, discountReason: '서비스', details: [] }).expect(201);
    });
  });

  // ── 선불권 ─────────────────────────────────────────

  describe('선불권', () => {
    let passId: number;

    it('판매: 20만원 + 보너스 3만원 → 잔액 23만원, 판매 결제·충전 원장 생성', async () => {
      const before = (await customer(A, kim)).totalPaidAmount;
      const res = await api()
        .post('/api/prepaid-passes')
        .set(h(D))
        .send({ customerId: kim, passName: '20만원 정액권', chargeAmount: 200000, bonusAmount: 30000, details: [{ method: 'CARD', amount: 200000 }] })
        .expect(201);
      passId = res.body.data.id;
      expect(res.body.data).toMatchObject({ balance: 230000, status: 'ACTIVE', customerName: '김미영' });
      expect(res.body.data.transactions).toEqual([expect.objectContaining({ txType: 'CHARGE', amount: 230000, balanceAfter: 230000 })]);
      expect((await customer(A, kim)).totalPaidAmount).toBe(before + 200000);
      const list = (await api().get(`/api/customers/${kim}/prepaid-passes`).set(h(A))).body.data;
      expect(list.map((p: any) => p.id)).toContain(passId);
    });

    it('선불권으로 선불권 결제·금액 불일치 → 400', async () => {
      await api().post('/api/prepaid-passes').set(h(A)).send({ customerId: kim, passName: 'x', chargeAmount: 1000, details: [{ method: 'PREPAID', amount: 1000, prepaidPassId: passId }] }).expect(400);
      await api().post('/api/prepaid-passes').set(h(A)).send({ customerId: kim, passName: 'x', chargeAmount: 1000, details: [{ method: 'CASH', amount: 900 }] }).expect(400);
    });

    let usePayment: number;
    let useTreatment: number;

    it('시술을 선불권 + 현금으로 결제 → 잔액 차감, 누적 결제액은 현금만 증가', async () => {
      const before = (await customer(A, kim)).totalPaidAmount;
      useTreatment = await treatment(A, kim, 55000);
      const res = await pay(A, {
        treatmentId: useTreatment, listAmount: 55000,
        details: [{ method: 'PREPAID', amount: 50000, prepaidPassId: passId }, { method: 'CASH', amount: 5000 }],
      }).expect(201);
      usePayment = res.body.data.id;
      expect(res.body.data.details[0]).toMatchObject({ method: 'PREPAID', passName: '20만원 정액권' });
      const p = await pass(A, passId);
      expect(p.balance).toBe(180000);
      expect(p.transactions[0]).toMatchObject({ txType: 'USE', amount: -50000, balanceAfter: 180000, paymentId: usePayment });
      expect((await customer(A, kim)).totalPaidAmount).toBe(before + 5000);
    });

    it('잔액 부족·선불권 미선택·다른 고객 선불권 → 400', async () => {
      const t = await treatment(A, kim, 500000);
      const r = await pay(A, { treatmentId: t, listAmount: 500000, details: [{ method: 'PREPAID', amount: 500000, prepaidPassId: passId }] }).expect(400);
      expect(r.body.message).toContain('잔액');
      await pay(A, { treatmentId: t, listAmount: 500000, details: [{ method: 'PREPAID', amount: 500000 }] }).expect(400);
      const tLee = await treatment(A, lee, 10000);
      const other = await pay(A, { treatmentId: tLee, listAmount: 10000, details: [{ method: 'PREPAID', amount: 10000, prepaidPassId: passId }] }).expect(400);
      expect(other.body.message).toContain('다른 고객');
    });

    it('결제 취소 → 선불권 잔액 복원(CANCEL_USE), 시술은 다시 결제 가능', async () => {
      const res = await api().post(`/api/payments/${usePayment}/cancel`).set(h(A)).expect(200);
      expect(res.body.data.status).toBe('CANCELLED');
      const p = await pass(A, passId);
      expect(p.balance).toBe(230000);
      expect(p.transactions[0]).toMatchObject({ txType: 'CANCEL_USE', amount: 50000 });
      expect((await api().get(`/api/treatments/${useTreatment}`).set(h(A))).body.data.payment).toBeNull();
      await api().post(`/api/payments/${usePayment}/cancel`).set(h(A)).expect(400); // 이미 취소
      await pay(A, { treatmentId: useTreatment, listAmount: 55000, details: [{ method: 'PREPAID', amount: 55000, prepaidPassId: passId }] }).expect(201);
      expect((await pass(A, passId)).balance).toBe(175000);
    });

    it('디자이너는 남이 입력한 결제를 취소할 수 없다', async () => {
      const t = await treatment(A, kim, 1000);
      const p = (await pay(A, { treatmentId: t, listAmount: 1000, details: [{ method: 'CASH', amount: 1000 }] })).body.data.id;
      await api().post(`/api/payments/${p}/cancel`).set(h(D)).expect(403);
    });

    it('사용한 선불권은 판매 취소 불가, 안 쓴 선불권은 판매 취소 가능', async () => {
      const salePayment = (await ds.query("SELECT id FROM payment WHERE prepaidPassId = ? AND paymentType = 'PASS_SALE'", [passId]))[0].id;
      const r = await api().post(`/api/payments/${salePayment}/cancel`).set(h(A)).expect(400);
      expect(r.body.message).toContain('환불');

      const fresh = (await api().post('/api/prepaid-passes').set(h(A)).send({ customerId: lee, passName: '10만원권', chargeAmount: 100000, details: [{ method: 'CASH', amount: 100000 }] })).body.data;
      const freshSale = (await ds.query("SELECT id FROM payment WHERE prepaidPassId = ? AND paymentType = 'PASS_SALE'", [fresh.id]))[0].id;
      await api().post(`/api/payments/${freshSale}/cancel`).set(h(A)).expect(200);
      expect(await pass(A, fresh.id)).toMatchObject({ status: 'REFUNDED', balance: 0 });
      expect((await customer(A, lee)).totalPaidAmount).toBe(0);
    });

    it('잔액 조정은 원장님만, 잔액보다 많이 빼면 400', async () => {
      await api().post(`/api/prepaid-passes/${passId}/adjust`).set(h(D)).send({ amount: 10000, memo: '서비스' }).expect(403);
      await api().post(`/api/prepaid-passes/${passId}/adjust`).set(h(A)).send({ amount: 10000, memo: '생일 서비스 적립' }).expect(200);
      await api().post(`/api/prepaid-passes/${passId}/adjust`).set(h(A)).send({ amount: -999999, memo: '실수' }).expect(400);
      expect((await pass(A, passId)).balance).toBe(185000);
    });

    it('환불: 잔액 소멸 + 돌려준 돈은 음수 결제로 기록, 환불된 선불권은 사용 불가', async () => {
      const res = await api().post(`/api/prepaid-passes/${passId}/refund`).set(h(A)).send({ refundAmount: 150000, method: 'TRANSFER', memo: '이사로 환불' }).expect(200);
      expect(res.body.data).toMatchObject({ status: 'REFUNDED', balance: 0 });
      expect(res.body.data.transactions[0]).toMatchObject({ txType: 'REFUND', amount: -185000 });
      const [refund] = await ds.query("SELECT finalAmount FROM payment WHERE prepaidPassId = ? AND paymentType = 'PASS_REFUND'", [passId]);
      expect(Number(refund.finalAmount)).toBe(-150000);
      await api().post(`/api/prepaid-passes/${passId}/refund`).set(h(A)).send({ refundAmount: 0, method: 'CASH' }).expect(400);
      const t = await treatment(A, kim, 1000);
      await pay(A, { treatmentId: t, listAmount: 1000, details: [{ method: 'PREPAID', amount: 1000, prepaidPassId: passId }] }).expect(400);
    });

    it('원장 무결성: 모든 선불권의 잔액 = 원장(prepaid_transaction) 합계', async () => {
      const rows = await ds.query(
        `SELECT p.id, p.balance, COALESCE(SUM(t.amount), 0) AS ledger
           FROM prepaid_pass p LEFT JOIN prepaid_transaction t ON t.prepaidPassId = p.id AND t.delState = 0
          WHERE p.shopId = ? GROUP BY p.id`,
        [A.shopId],
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(Number(r.balance)).toBe(Number(r.ledger));
    });
  });

  // ── 매장 격리 ──────────────────────────────────────

  it('매장 격리: B 는 A 의 시술 결제·선불권·결제 취소 불가', async () => {
    const tA = await treatment(A, kim, 20000);
    const passA = (await api().post('/api/prepaid-passes').set(h(A)).send({ customerId: kim, passName: '격리용', chargeAmount: 50000, details: [{ method: 'CASH', amount: 50000 }] })).body.data.id;
    const pA = (await pay(A, { treatmentId: tA, listAmount: 20000, details: [{ method: 'CARD', amount: 20000 }] })).body.data.id;

    await pay(B, { treatmentId: tA, listAmount: 20000, details: [{ method: 'CARD', amount: 20000 }] }).expect(404);
    const tB = await treatment(B, bCust, 10000);
    await pay(B, { treatmentId: tB, listAmount: 10000, details: [{ method: 'PREPAID', amount: 10000, prepaidPassId: passA }] }).expect(404);
    await api().get(`/api/prepaid-passes/${passA}`).set(h(B)).expect(404);
    await api().post(`/api/prepaid-passes/${passA}/adjust`).set(h(B)).send({ amount: 1, memo: 'x' }).expect(404);
    await api().post('/api/prepaid-passes').set(h(B)).send({ customerId: kim, passName: 'x', chargeAmount: 1000, details: [{ method: 'CASH', amount: 1000 }] }).expect(404);
    await api().get(`/api/payments/${pA}`).set(h(B)).expect(404);
    await api().post(`/api/payments/${pA}/cancel`).set(h(B)).expect(404);
    expect((await pass(A, passA)).balance).toBe(50000);
  });

  // ── 정산 ───────────────────────────────────────────

  describe(`정산 (${DAY})`, () => {
    let cancelLater: number;
    let p2: number;

    beforeAll(async () => {
      // P1 시술 7만 - 할인 5천 = 6.5만 (카드 5만 + 현금 1.5만), 원장 담당
      const t1 = await treatment(A, kim, 70000, at('11:00'));
      await pay(A, { treatmentId: t1, listAmount: 70000, discountAmount: 5000, details: [{ method: 'CARD', amount: 50000 }, { method: 'CASH', amount: 15000 }], paidAt: at('12:00') }).expect(201);
      // P2 시술 4만 계좌이체, 디자이너 담당
      const t2 = await treatment(A, lee, 40000, at('13:00'), D.userId);
      p2 = (await pay(A, { treatmentId: t2, listAmount: 40000, details: [{ method: 'TRANSFER', amount: 40000 }], paidAt: at('13:30') }).expect(201)).body.data.id;
      // P3 선불권 판매 10만 카드
      const ps = (await api().post('/api/prepaid-passes').set(h(A)).send({ customerId: lee, passName: '10만원권', chargeAmount: 100000, details: [{ method: 'CARD', amount: 100000 }], paidAt: at('14:00') }).expect(201)).body.data.id;
      // P4 시술 3만 선불권 차감
      const t4 = await treatment(A, lee, 30000, at('15:00'));
      await pay(A, { treatmentId: t4, listAmount: 30000, details: [{ method: 'PREPAID', amount: 30000, prepaidPassId: ps }], paidAt: at('15:30') }).expect(201);
      // P5 시술 2만 카드 → 취소 (합계에서 빠져야 함)
      const t5 = await treatment(A, kim, 20000, at('16:00'));
      cancelLater = (await pay(A, { treatmentId: t5, listAmount: 20000, details: [{ method: 'CARD', amount: 20000 }], paidAt: at('16:30') }).expect(201)).body.data.id;
      await api().post(`/api/payments/${cancelLater}/cancel`).set(h(A)).expect(200);
      // P6 다음날 새벽 1시 30분 현금 1만 → 영업일은 DAY
      const t6 = await treatment(A, kim, 10000, at('23:30'));
      const p6 = await pay(A, { treatmentId: t6, listAmount: 10000, details: [{ method: 'CASH', amount: 10000 }], paidAt: at('01:30', '2026-03-11') }).expect(201);
      expect(p6.body.data.businessDate).toBe(DAY);
      // 미결제 시술 2.5만
      await treatment(A, kim, 25000, at('17:00'));
    });

    it('일 정산 합계가 정확하다 (취소 제외, 새벽 결제는 전날)', async () => {
      const res = await api().get('/api/settlements/daily').query({ date: DAY }).set(h(A)).expect(200);
      const d = res.body.data;
      expect(d.totals).toEqual({
        received: 215000, // 5만+1.5만+4만+10만+1만
        cash: 25000,
        card: 150000,
        transfer: 40000,
        etc: 0,
        prepaidUsed: 30000,
        sales: 145000, // 6.5만+4만+3만+1만
        passSales: 100000,
        passRefunds: 0,
        discount: 5000,
        paymentCount: 5,
      });
      expect(d.payments).toHaveLength(6); // 취소 건도 목록에는 보임
      expect(d.payments.find((p: any) => p.id === cancelLater).status).toBe('CANCELLED');
      // 결제를 취소한 시술(2만)은 다시 미결제로 보인다
      expect(d.unpaid.map((u: any) => u.totalAmount)).toEqual([20000, 25000]);
      const byName = Object.fromEntries(d.designers.map((x: any) => [x.designerName, x.sales]));
      expect(byName).toEqual({ 원장A: 105000, 디자이너: 40000 });
      expect(d.closing).toBeNull();
    });

    it('마감 → 스냅샷 저장, 이후 결제가 바뀌면 표시, 다시 마감하면 1건만 유지', async () => {
      const c = await api().put(`/api/settlements/daily/${DAY}/closing`).set(h(A)).send({ actualCash: 25000, actualCard: 150000, memo: '이상 없음' }).expect(200);
      expect(c.body.data.closing).toMatchObject({ actualCash: 25000, actualCard: 150000, snapshot: { received: 215000, card: 150000, paymentCount: 5 } });
      expect(c.body.data.changedSinceClosing).toBe(false);

      await api().post(`/api/payments/${p2}/cancel`).set(h(A)).expect(200);
      const after = (await api().get('/api/settlements/daily').query({ date: DAY }).set(h(A))).body.data;
      expect(after.changedSinceClosing).toBe(true);
      expect(after.totals.received).toBe(175000);

      await api().put(`/api/settlements/daily/${DAY}/closing`).set(h(A)).send({ actualCash: 25000 }).expect(200);
      const rows = await ds.query('SELECT COUNT(*) n FROM daily_closing WHERE shopId = ? AND businessDate = ? AND delState = 0', [A.shopId, DAY]);
      expect(Number(rows[0].n)).toBe(1);
      expect((await api().get('/api/settlements/daily').query({ date: DAY }).set(h(A))).body.data.changedSinceClosing).toBe(false);
    });

    it('월 정산: 날짜별 합계·마감 여부·메뉴별 건수', async () => {
      const m = (await api().get('/api/settlements/monthly').query({ month: '2026-03' }).set(h(A)).expect(200)).body.data;
      expect(m.days).toHaveLength(31);
      const day = m.days.find((x: any) => x.date === DAY);
      expect(day).toMatchObject({ received: 175000, sales: 105000, count: 4, closed: true });
      expect(m.totals.received).toBe(175000);
      expect(m.menus[0]).toMatchObject({ menuName: '테스트 시술', count: 3, amount: 110000 });
    });

    it('정산은 원장님만, 미래 날짜 마감 불가, 다른 매장은 자기 숫자만', async () => {
      await api().get('/api/settlements/daily').query({ date: DAY }).set(h(D)).expect(403);
      await api().put('/api/settlements/daily/2099-01-01/closing').set(h(A)).send({}).expect(400);
      await api().get('/api/settlements/daily').query({ date: 'abc' }).set(h(A)).expect(400);
      const b = (await api().get('/api/settlements/daily').query({ date: DAY }).set(h(B)).expect(200)).body.data;
      expect(b.totals.received).toBe(0);
      expect(b.payments).toHaveLength(0);
    });
  });

  it('잘못된 결제수단 → 400 (VALIDATION)', async () => {
    const t = await treatment(A, kim, 1000);
    const r = await pay(A, { treatmentId: t, listAmount: 1000, details: [{ method: 'BITCOIN', amount: 1000 }] }).expect(400);
    expect(r.body.code).toBe(ErrorCode.VALIDATION);
  });
});
