/**
 * 5단계 e2e — 운영자 화면 · 피드백 · 변경 이력
 */
import { ShopStatus } from '@beauty-crm/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AdminService } from '../src/modules/admin/admin.service';

const RUN = Date.now().toString(36);
const PW = 'test1234';

interface S {
  token: string;
  userId: number;
  shopId: number;
}

describe('5단계: 운영자 화면 · 피드백 · 변경 이력', () => {
  let app: INestApplication;
  let ds: DataSource;
  const api = () => request(app.getHttpServer());
  const h = (s: S) => ({ Authorization: `Bearer ${s.token}` });
  let adminH: Record<string, string>;
  let adminId: number;

  let A: S;
  let D: S; // A 매장 디자이너
  let P: S; // 승인 대기로 바꿀 매장

  async function signup(tag: string): Promise<S> {
    const res = await api()
      .post('/api/auth/signup')
      .send({ shopName: `운영${tag}${RUN}`, ownerName: `원장${tag}`, loginId: `o${tag}${RUN}`, password: PW, agreeTerms: true, agreePrivacy: true })
      .expect(201);
    const l = res.body.data.login;
    return { token: l.accessToken, userId: l.user.id, shopId: l.user.shopId };
  }

  /** 변경 이력은 응답 뒤에 기록된다 → 잠깐 기다리며 조회 */
  async function auditOf(where: string, args: unknown[], min = 1) {
    for (let i = 0; i < 40; i++) {
      const rows = await ds.query(`SELECT * FROM audit_log WHERE ${where} ORDER BY id DESC`, args);
      if (rows.length >= min) return rows.map((r: any) => ({ ...r, beforeData: parse(r.beforeData), afterData: parse(r.afterData) }));
      await new Promise((r) => setTimeout(r, 50));
    }
    return [];
  }
  const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);

    const admin = await app.get(AdminService).createAdmin(`adm${RUN}`, '운영자', 'adminpass1');
    adminId = admin.id;
    const l = await api().post('/api/admin/auth/login').send({ loginId: `adm${RUN}`, password: 'adminpass1' }).expect(200);
    adminH = { Authorization: `Bearer ${l.body.data.accessToken}` };

    A = await signup('A');
    P = await signup('P');
    await ds.query(`UPDATE shop SET status = 'PENDING', approvedAt = NULL WHERE id = ?`, [P.shopId]);
    const inv = await api().post('/api/invites').set(h(A)).expect(201);
    const j = await api().post('/api/auth/join').send({ inviteCode: inv.body.data.inviteCode, loginId: `od${RUN}`, password: PW, name: '디자이너' }).expect(201);
    D = { token: j.body.data.login.accessToken, userId: j.body.data.login.user.id, shopId: A.shopId };
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 권한 ─────────────────────────────────────────

  it('운영자 API 는 매장 토큰으로 403, 토큰 없으면 401', async () => {
    await api().get('/api/admin/dashboard').set(h(A)).expect(403);
    await api().get('/api/admin/feedback').set(h(A)).expect(403);
    await api().get('/api/admin/audit-logs').expect(401);
  });

  // ── 현황 · 매장 ──────────────────────────────────

  it('매장 가입도 매장·원장으로 남음 (승인 대기 포함)', async () => {
    const [log] = await auditOf(`action = 'SIGNUP' AND targetId = ?`, [P.shopId]);
    expect(Number(log.shopId)).toBe(P.shopId);
    expect(log.actorType).toBe('SHOP');
    expect(log.afterData).toMatchObject({ name: `운영P${RUN}`, loginId: `oP${RUN}` });
  });

  it('대시보드: 승인 대기 매장과 매장 수', async () => {
    const d = (await api().get('/api/admin/dashboard').set(adminH).expect(200)).body.data;
    expect(d.shopCounts.PENDING).toBeGreaterThanOrEqual(1);
    expect(d.shopCounts.total).toBeGreaterThanOrEqual(2);
    expect(d.pendingShops.map((s: any) => s.id)).toContain(P.shopId);
    expect(d.aiMonth.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it('매장 목록: 검색과 이용 현황 숫자', async () => {
    await api().post('/api/customers').set(h(A)).send({ name: '현황고객' }).expect(201);
    const list = (await api().get(`/api/admin/shops?q=${encodeURIComponent(`운영A${RUN}`)}`).set(adminH).expect(200)).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: A.shopId, userCount: 2, customerCount: 1, ownerLoginId: `oA${RUN}` });
    expect(list[0].lastActivityAt).not.toBeNull();
    // 로그인 아이디로도 찾기
    const byLogin = (await api().get(`/api/admin/shops?q=od${RUN}`).set(adminH).expect(200)).body.data;
    expect(byLogin.map((s: any) => s.id)).toEqual([A.shopId]);
    const pending = (await api().get('/api/admin/shops?status=PENDING').set(adminH).expect(200)).body.data;
    expect(pending.every((s: any) => s.status === 'PENDING')).toBe(true);
  });

  it('승인 + 창립 테스터 → 변경 이력에 운영자 이름으로 남음', async () => {
    await api().post(`/api/admin/shops/${P.shopId}/approve`).set(adminH).send({ founder: true }).expect(200);
    const [log] = await auditOf(`targetTable = 'shop' AND action = 'APPROVE' AND targetId = ?`, [P.shopId]);
    expect(log).toMatchObject({ actorType: 'ADMIN', action: 'APPROVE' });
    expect(Number(log.actorId)).toBe(adminId);
    expect(Number(log.shopId)).toBe(P.shopId);

    const d = (await api().get(`/api/admin/shops/${P.shopId}`).set(adminH).expect(200)).body.data;
    expect(d.shop).toMatchObject({ status: ShopStatus.ACTIVE, isFounder: 1, planType: 'FOUNDER' });
    expect(d.users).toHaveLength(1);
    expect(d.audit.some((x: any) => x.action === 'APPROVE' && x.actorName === '운영자')).toBe(true);
  });

  it('매장 설정 변경: 창립 테스터 해제 · 사진 용량', async () => {
    const d = (await api().patch(`/api/admin/shops/${P.shopId}`).set(adminH).send({ isFounder: false, storageQuotaMb: 2048 }).expect(200)).body.data;
    expect(d.shop).toMatchObject({ isFounder: 0, planType: 'FREE', storageQuotaMb: 2048 });
    const [log] = await auditOf(`targetTable = 'shop' AND action = 'UPDATE' AND targetId = ? AND actorType = 'ADMIN'`, [P.shopId]);
    expect(log.beforeData).toMatchObject({ isFounder: 1, planType: 'FOUNDER', storageQuotaMb: 1024 });
    await api().patch(`/api/admin/shops/${P.shopId}`).set(adminH).send({ storageQuotaMb: -1 }).expect(400);
    await api().get('/api/admin/shops/99999999').set(adminH).expect(404);
  });

  it('원장 비밀번호 초기화: 임시 비밀번호는 이력에 남지 않음', async () => {
    const r = (await api().post(`/api/admin/shops/${P.shopId}/reset-owner-password`).set(adminH).expect(200)).body.data;
    expect(r.tempPassword).toBeTruthy();
    const [log] = await auditOf(`action = 'RESET_PASSWORD' AND shopId = ?`, [P.shopId]);
    expect(JSON.stringify(log.afterData)).not.toContain(r.tempPassword);
    expect(log.afterData).toMatchObject({ loginId: `oP${RUN}` });
  });

  // ── 피드백 ───────────────────────────────────────

  let fbId: number;

  it('의견 보내기 → 운영자 목록 → 답변 → 매장에서 답변 확인', async () => {
    await api().post('/api/feedback').set(h(D)).send({ category: 'BUG', content: '' }).expect(400);
    await api().post('/api/feedback').set(h(D)).send({ category: 'NOPE', content: '버튼이 안 눌려요' }).expect(400);
    const f = (await api().post('/api/feedback').set(h(D)).send({ category: 'BUG', content: '녹음 버튼이 가끔 안 눌려요', pageUrl: '/records' }).expect(201)).body.data;
    expect(f).toMatchObject({ status: 'OPEN', userName: '디자이너', category: 'BUG', pageUrl: '/records' });
    fbId = f.id;
    await api().post('/api/feedback').set(h(A)).send({ category: 'REQUEST', content: '문자 보내기 기능이 있으면 좋겠어요' }).expect(201);

    // 디자이너는 자기 것만, 원장은 매장 전체
    expect((await api().get('/api/feedback').set(h(D)).expect(200)).body.data).toHaveLength(1);
    expect((await api().get('/api/feedback').set(h(A)).expect(200)).body.data).toHaveLength(2);

    const undone = (await api().get('/api/admin/feedback?status=UNDONE').set(adminH).expect(200)).body.data;
    expect(undone.find((x: any) => x.id === fbId)).toMatchObject({ shopName: `운영A${RUN}`, status: 'OPEN' });
    const d = (await api().get('/api/admin/dashboard').set(adminH).expect(200)).body.data;
    expect(d.openFeedback).toBeGreaterThanOrEqual(2);

    await api().patch(`/api/admin/feedback/${fbId}`).set(adminH).send({ status: 'IN_PROGRESS' }).expect(200);
    const replied = (await api().patch(`/api/admin/feedback/${fbId}`).set(adminH).send({ reply: '확인했어요. 다음 업데이트에서 고칠게요.' }).expect(200)).body.data;
    expect(replied).toMatchObject({ status: 'DONE', reply: '확인했어요. 다음 업데이트에서 고칠게요.' });
    expect(replied.repliedAt).toBeTruthy();

    const mine = (await api().get('/api/feedback').set(h(D)).expect(200)).body.data;
    expect(mine[0]).toMatchObject({ id: fbId, status: 'DONE', reply: '확인했어요. 다음 업데이트에서 고칠게요.' });

    const [log] = await auditOf(`targetTable = 'feedback' AND action = 'REPLY' AND targetId = ?`, [fbId], 2);
    expect(Number(log.shopId)).toBe(A.shopId);
    expect(log.beforeData).toMatchObject({ status: 'IN_PROGRESS', reply: null });

    const shopDetail = (await api().get(`/api/admin/shops/${A.shopId}`).set(adminH).expect(200)).body.data;
    expect(shopDetail.feedback.map((x: any) => x.id)).toContain(fbId);
  });

  // ── 변경 이력 ────────────────────────────────────

  it('고객 수정: 변경 전/후가 남고 전화번호 원문은 없음', async () => {
    const c = (await api().post('/api/customers').set(h(A)).send({ name: '이력고객', phone: '010-1234-5678', memo: '처음' }).expect(201)).body.data;
    await api().patch(`/api/customers/${c.id}`).set(h(D)).send({ memo: '바뀜', phone: '010-9999-8888' }).expect(200);
    const [log] = await auditOf(`targetTable = 'customer' AND action = 'UPDATE' AND targetId = ?`, [c.id]);
    expect(Number(log.actorId)).toBe(D.userId);
    expect(log.actorType).toBe('SHOP');
    expect(log.beforeData).toMatchObject({ memo: '처음', phoneLast4: '5678' });
    expect(log.afterData).toMatchObject({ memo: '바뀜', phoneLast4: '8888' });
    const raw = JSON.stringify([log.beforeData, log.afterData]);
    expect(raw).not.toContain('9999');
    expect(raw).not.toContain('1234-5678');

    await api().delete(`/api/customers/${c.id}`).set(h(A)).expect(200);
    const [del] = await auditOf(`targetTable = 'customer' AND action = 'DELETE' AND targetId = ?`, [c.id]);
    expect(del.beforeData).toMatchObject({ name: '이력고객', memo: '바뀜' });
  });

  it('시술 금액 수정 · 결제 · 결제 취소 · 마감이 이력으로 이어짐', async () => {
    const cust = (await api().post('/api/customers').set(h(A)).send({ name: '결제이력' }).expect(201)).body.data.id;
    const t = (
      await api().post('/api/treatments').set(h(D)).send({ customerId: cust, items: [{ menuName: '커트', price: 20000, recipes: [] }] }).expect(201)
    ).body.data.id;
    await api().put(`/api/treatments/${t}`).set(h(D)).send({ customerId: cust, items: [{ menuName: '커트', price: 25000, recipes: [] }] }).expect(200);
    const [upd] = await auditOf(`targetTable = 'treatment' AND action = 'UPDATE' AND targetId = ?`, [t]);
    expect(upd.beforeData.totalAmount).toBe(20000);
    expect(upd.afterData.totalAmount).toBe(25000);

    const pay = (
      await api().post('/api/payments').set(h(D)).send({ treatmentId: t, listAmount: 25000, discountAmount: 0, details: [{ method: 'CARD', amount: 25000 }] }).expect(201)
    ).body.data;
    await api().post(`/api/payments/${pay.id}/cancel`).set(h(A)).expect(200);
    const [cancel] = await auditOf(`targetTable = 'payment' AND action = 'CANCEL' AND targetId = ?`, [pay.id]);
    expect(Number(cancel.actorId)).toBe(A.userId);
    expect(cancel.beforeData).toMatchObject({ status: 'PAID', finalAmount: 25000 });
    expect(cancel.afterData).toMatchObject({ status: 'CANCELLED' });

    const day = new Date(Date.now() + 9 * 3600_000 - 4 * 3600_000).toISOString().slice(0, 10);
    await api().put(`/api/settlements/daily/${day}/closing`).set(h(A)).send({ actualCash: 0 }).expect(200);
    const [close] = await auditOf(`targetTable = 'daily_closing' AND action = 'CLOSE' AND shopId = ?`, [A.shopId]);
    expect(close.afterData).toMatchObject({ businessDate: day, actualCash: 0 });
    expect(Number(close.targetId)).toBeGreaterThan(0);

    // 운영자 조회: 대상으로 필터
    const logs = (await api().get(`/api/admin/audit-logs?targetTable=payment&targetId=${pay.id}`).set(adminH).expect(200)).body.data;
    expect(logs.items.map((x: any) => x.action)).toEqual(['CANCEL', 'CREATE']);
    expect(logs.items[1].actorName).toBe('디자이너');
  });

  it('로그인 · 직원 비밀번호 초기화 기록, 실패한 요청은 남지 않음', async () => {
    await api().post('/api/auth/login').send({ loginId: `od${RUN}`, password: PW }).expect(200);
    const [login] = await auditOf(`action = 'LOGIN' AND targetTable = 'shop_user' AND actorId = ?`, [D.userId]);
    expect(login.afterData).toEqual({ loginId: `od${RUN}` });
    expect(login.ip).toBeTruthy();

    const before = Number((await ds.query(`SELECT COUNT(*) n FROM audit_log WHERE shopId = ?`, [A.shopId]))[0].n);
    await api().post('/api/auth/login').send({ loginId: `od${RUN}`, password: 'wrong-pass' }).expect(401);
    await api().patch('/api/customers/99999999').set(h(A)).send({ memo: 'x' }).expect(404);

    const r = (await api().post(`/api/staff/${D.userId}/reset-password`).set(h(A)).expect(200)).body.data;
    const [reset] = await auditOf(`action = 'RESET_PASSWORD' AND targetTable = 'shop_user' AND targetId = ?`, [D.userId]);
    expect(JSON.stringify(reset.afterData ?? {})).not.toContain(r.tempPassword);
    const after = Number((await ds.query(`SELECT COUNT(*) n FROM audit_log WHERE shopId = ?`, [A.shopId]))[0].n);
    expect(after - before).toBe(1); // 실패 2건은 빠지고 초기화 1건만
  });

  it('운영자 로그인도 기록', async () => {
    const [log] = await auditOf(`targetTable = 'admin_user' AND action = 'LOGIN' AND actorId = ?`, [adminId]);
    expect(log.actorType).toBe('ADMIN');
    expect(log.afterData).toEqual({ loginId: `adm${RUN}` });
  });

  // ── AI 사용량 ────────────────────────────────────

  it('AI 사용량: 매장별 · 날짜별 합계', async () => {
    const month = '2026-02';
    await ds.query(
      `INSERT INTO ai_usage_log (shopId, usageType, provider, model, inputUnits, outputUnits, costKrw, isSuccess, latencyMs, createdAt) VALUES
       (?, 'STT', 'CLOVA', NULL, 90, 0, 12.5, 1, 800, '2026-02-03 10:00:00'),
       (?, 'LLM', 'HYPERCLOVA', 'HCX-007', 1000, 200, 7.5, 1, 1500, '2026-02-03 10:00:05'),
       (?, 'STT', 'CLOVA', NULL, 30, 0, 0, 0, 300, '2026-02-04 11:00:00')`,
      [P.shopId, P.shopId, P.shopId],
    );
    const r = (await api().get(`/api/admin/ai-usage?month=${month}`).set(adminH).expect(200)).body.data;
    const mine = r.shops.find((s: any) => s.shopId === P.shopId);
    expect(mine).toMatchObject({ calls: 3, failures: 1, sttSeconds: 120, llmInput: 1000, llmOutput: 200, costKrw: 20 });
    expect(r.totals.calls).toBeGreaterThanOrEqual(3);
    expect(r.days.map((d: any) => d.date)).toEqual(expect.arrayContaining(['2026-02-03', '2026-02-04']));
    await api().get('/api/admin/ai-usage?month=2026-13').set(adminH).expect(400);
  });
});
