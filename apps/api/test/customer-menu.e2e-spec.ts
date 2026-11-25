/**
 * 2단계 e2e — 고객(전화번호 암호화·뒷자리 검색), 태그, 시술 메뉴
 *   npm run test:e2e -w @beauty-crm/api
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
// 실행마다 다른 번호 (뒷자리 4자리 검색이 이전 실행 데이터와 섞이지 않게)
const rnd = () => String(Math.floor(1000 + Math.random() * 9000));
const L4A = rnd();
const PHONE_A = `010-${rnd()}-${L4A}`;

interface S {
  token: string;
  userId: number;
  shopId: number;
}

describe('2단계: 고객 · 태그 · 시술 메뉴', () => {
  let app: INestApplication;
  let ds: DataSource;
  const api = () => request(app.getHttpServer());
  const h = (s: S) => ({ Authorization: `Bearer ${s.token}` });

  async function signup(tag: string): Promise<S> {
    const res = await api()
      .post('/api/auth/signup')
      .send({ shopName: `매장${tag}`, ownerName: `원장${tag}`, loginId: `c${tag}${RUN}`, password: PW, agreeTerms: true, agreePrivacy: true })
      .expect(201);
    const l = res.body.data.login;
    return { token: l.accessToken, userId: l.user.id, shopId: l.user.shopId };
  }

  let A: S;
  let B: S;
  let designer: S;
  let customerA: number;
  let customerB: number;
  let tagA: number;
  let tagB: number;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    A = await signup('A');
    B = await signup('B');

    // A 매장 디자이너
    const inv = await api().post('/api/invites').set(h(A)).expect(201);
    const j = await api()
      .post('/api/auth/join')
      .send({ inviteCode: inv.body.data.inviteCode, loginId: `cd${RUN}`, password: PW, name: '디자이너' })
      .expect(201);
    const l = j.body.data.login;
    designer = { token: l.accessToken, userId: l.user.id, shopId: l.user.shopId };
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 시술 메뉴 ──────────────────────────────────────

  describe('시술 메뉴', () => {
    it('가입하면 기본 메뉴가 들어 있다', async () => {
      const res = await api().get('/api/menus').set(h(A)).expect(200);
      const names = res.body.data.map((c: any) => c.name);
      expect(names).toEqual(['커트', '펌', '염색', '클리닉', '기타']);
      const dye = res.body.data.find((c: any) => c.name === '염색');
      expect(dye.menus.find((m: any) => m.name === '뿌리염색')).toMatchObject({ basePrice: 40000, aliases: expect.stringContaining('뿌염') });
    });

    it('원장은 분류·메뉴 추가, 가격 수정, 판매 중지, 순서 변경', async () => {
      const cat = await api().post('/api/menus/categories').set(h(A)).send({ name: '이벤트' }).expect(201);
      const m1 = await api().post('/api/menus/items').set(h(A)).send({ categoryId: cat.body.data.id, name: '첫방문 할인 커트', basePrice: 10000 }).expect(201);
      const m2 = await api().post('/api/menus/items').set(h(A)).send({ categoryId: cat.body.data.id, name: '커플 펌', basePrice: 150000, durationMin: 180 }).expect(201);

      await api().patch(`/api/menus/items/${m1.body.data.id}`).set(h(A)).send({ basePrice: 12000, isActive: false }).expect(200);
      await api().put(`/api/menus/categories/${cat.body.data.id}/order`).set(h(A)).send({ ids: [m2.body.data.id, m1.body.data.id] }).expect(200);

      const res = await api().get('/api/menus').set(h(A)).expect(200);
      const ev = res.body.data.find((c: any) => c.id === cat.body.data.id);
      expect(ev.menus.map((m: any) => m.name)).toEqual(['커플 펌', '첫방문 할인 커트']);
      expect(ev.menus[1]).toMatchObject({ basePrice: 12000, isActive: false });
    });

    it('분류 삭제 시 안의 메뉴도 소프트 삭제', async () => {
      const cat = await api().post('/api/menus/categories').set(h(A)).send({ name: '삭제용' }).expect(201);
      const m = await api().post('/api/menus/items').set(h(A)).send({ categoryId: cat.body.data.id, name: 'x', basePrice: 1 }).expect(201);
      await api().delete(`/api/menus/categories/${cat.body.data.id}`).set(h(A)).expect(200);
      const [row] = await ds.query('SELECT delState FROM service_menu WHERE id = ?', [m.body.data.id]);
      expect(Number(row.delState)).toBe(1);
    });

    it('디자이너는 조회만 가능 (수정 403)', async () => {
      await api().get('/api/menus').set(h(designer)).expect(200);
      await api().post('/api/menus/categories').set(h(designer)).send({ name: 'x' }).expect(403);
    });

    it('매장 격리: B 매장 분류·메뉴에 접근·이동 불가', async () => {
      const bMenus = (await api().get('/api/menus').set(h(B)).expect(200)).body.data;
      const bCat = bMenus[0].id;
      const bItem = bMenus[0].menus[0].id;
      const aMenus = (await api().get('/api/menus').set(h(A)).expect(200)).body.data;
      const aItem = aMenus[0].menus[0].id;

      await api().patch(`/api/menus/items/${bItem}`).set(h(A)).send({ basePrice: 1 }).expect(404);
      await api().delete(`/api/menus/items/${bItem}`).set(h(A)).expect(404);
      await api().patch(`/api/menus/categories/${bCat}`).set(h(A)).send({ name: '해킹' }).expect(404);
      // 내 메뉴를 남의 분류로 옮기기 / 남의 분류에 메뉴 만들기
      await api().patch(`/api/menus/items/${aItem}`).set(h(A)).send({ categoryId: bCat }).expect(404);
      await api().post('/api/menus/items').set(h(A)).send({ categoryId: bCat, name: 'x', basePrice: 1 }).expect(404);
      // 순서 변경에 남의 id 섞기
      await api().put('/api/menus/categories/order').set(h(A)).send({ ids: [aMenus[0].id, bCat] }).expect(404);

      const after = (await api().get('/api/menus').set(h(B)).expect(200)).body.data;
      expect(after[0].name).toBe('커트');
      expect(after[0].menus[0].basePrice).toBe(bMenus[0].menus[0].basePrice);
    });
  });

  // ── 태그 ───────────────────────────────────────────

  describe('태그', () => {
    it('태그 만들기 (같은 이름 409)', async () => {
      tagA = (await api().post('/api/tags').set(h(A)).send({ name: '두피 민감' }).expect(201)).body.data.id;
      await api().post('/api/tags').set(h(designer)).send({ name: '탈색 이력' }).expect(201);
      const dup = await api().post('/api/tags').set(h(A)).send({ name: '두피 민감' }).expect(409);
      expect(dup.body.code).toBe(ErrorCode.DUPLICATE);
      tagB = (await api().post('/api/tags').set(h(B)).send({ name: 'B태그' }).expect(201)).body.data.id;
    });

    it('B 매장 태그 수정·삭제 → 404', async () => {
      await api().patch(`/api/tags/${tagB}`).set(h(A)).send({ name: '해킹' }).expect(404);
      await api().delete(`/api/tags/${tagB}`).set(h(A)).expect(404);
    });
  });

  // ── 고객 ───────────────────────────────────────────

  describe('고객', () => {
    it('고객 등록: 전화번호는 암호화되어 저장된다', async () => {
      const res = await api()
        .post('/api/customers')
        .set(h(A))
        .send({ name: '김미영', phone: PHONE_A, gender: 'F', birthYear: 1975, memo: '두피 예민, 저자극 약제', consent: true, tagIds: [tagA] })
        .expect(201);
      customerA = res.body.data.id;
      expect(res.body.data).toMatchObject({
        name: '김미영',
        phone: PHONE_A.replace(/-/g, ''),
        phoneLast4: L4A,
        phoneMasked: `***-****-${L4A}`,
        tags: [{ id: tagA, name: '두피 민감' }],
      });
      expect(res.body.data.consentAt).toBeTruthy();

      // DB 에는 평문 번호가 없다
      const [row] = await ds.query('SELECT phoneEnc, phoneHash, phoneLast4 FROM customer WHERE id = ?', [customerA]);
      const digits = PHONE_A.replace(/-/g, '');
      expect(Buffer.from(row.phoneEnc).toString('latin1')).not.toContain(digits);
      expect(row.phoneHash).toHaveLength(64);
      expect(row.phoneHash).not.toContain(digits);
      expect(row.phoneLast4).toBe(L4A);

      customerB = (await api().post('/api/customers').set(h(B)).send({ name: 'B고객', phone: PHONE_A }).expect(201)).body.data.id;
    });

    it('같은 매장에 같은 번호는 409 (다른 매장은 같은 번호 허용)', async () => {
      const res = await api().post('/api/customers').set(h(designer)).send({ name: '중복', phone: PHONE_A.replace(/-/g, '') }).expect(409);
      expect(res.body.code).toBe(ErrorCode.DUPLICATE);
      expect(res.body.message).toContain('김미영');

      const check = await api().get('/api/customers/check-phone').query({ phone: PHONE_A }).set(h(A)).expect(200);
      expect(check.body.data.existing.id).toBe(customerA);
      const self = await api().get('/api/customers/check-phone').query({ phone: PHONE_A, excludeId: customerA }).set(h(A)).expect(200);
      expect(self.body.data.existing).toBeNull();
    });

    it('잘못된 전화번호는 400', async () => {
      await api().post('/api/customers').set(h(A)).send({ name: 'x', phone: '12345' }).expect(400);
    });

    it('검색: 뒷자리 4자리 · 전체 번호 · 이름 · 태그', async () => {
      await api().post('/api/customers').set(h(A)).send({ name: '이순자' }).expect(201);

      const byL4 = await api().get('/api/customers').query({ q: L4A }).set(h(A)).expect(200);
      expect(byL4.body.data.items.map((c: any) => c.id)).toEqual([customerA]);

      const byFull = await api().get('/api/customers').query({ q: PHONE_A }).set(h(A)).expect(200);
      expect(byFull.body.data.items.map((c: any) => c.id)).toEqual([customerA]);

      const byName = await api().get('/api/customers').query({ q: '미영' }).set(h(A)).expect(200);
      expect(byName.body.data.items.map((c: any) => c.id)).toContain(customerA);

      const byTag = await api().get('/api/customers').query({ tagId: tagA }).set(h(A)).expect(200);
      expect(byTag.body.data.items.map((c: any) => c.id)).toEqual([customerA]);

      const all = await api().get('/api/customers').set(h(A)).expect(200);
      expect(all.body.data.total).toBe(2);
      // 목록에는 전체 번호가 없다
      expect(all.body.data.items[0].phone).toBeUndefined();
    });

    it('매장 격리: 같은 번호여도 내 매장 고객만 검색된다', async () => {
      const res = await api().get('/api/customers').query({ q: L4A }).set(h(B)).expect(200);
      expect(res.body.data.items.map((c: any) => c.id)).toEqual([customerB]);
    });

    it('매장 격리: B 고객 조회·수정·삭제 → 404, B 태그를 내 고객에 붙이기 → 404', async () => {
      await api().get(`/api/customers/${customerB}`).set(h(A)).expect(404);
      await api().patch(`/api/customers/${customerB}`).set(h(A)).send({ name: '해킹' }).expect(404);
      await api().delete(`/api/customers/${customerB}`).set(h(A)).expect(404);
      await api().patch(`/api/customers/${customerA}`).set(h(A)).send({ tagIds: [tagB] }).expect(404);
      await api().post('/api/customers').set(h(A)).send({ name: '태그해킹', tagIds: [tagB] }).expect(404);

      const b = await api().get(`/api/customers/${customerB}`).set(h(B)).expect(200);
      expect(b.body.data.name).toBe('B고객');
    });

    it('수정: 번호 변경 시 검색도 바뀌고, 태그 교체', async () => {
      const newL4 = L4A === '9999' ? '8888' : '9999';
      const tag2 = (await api().post('/api/tags').set(h(A)).send({ name: 'VIP' }).expect(201)).body.data.id;
      const res = await api()
        .patch(`/api/customers/${customerA}`)
        .set(h(designer))
        .send({ phone: `010-5555-${newL4}`, tagIds: [tag2], memo: null })
        .expect(200);
      expect(res.body.data).toMatchObject({ phoneLast4: newL4, memo: null, tags: [{ id: tag2, name: 'VIP' }] });

      const old = await api().get('/api/customers').query({ q: L4A }).set(h(A)).expect(200);
      expect(old.body.data.items).toHaveLength(0);

      // 태그 다시 붙였다 떼기 (activeKey UNIQUE 와 소프트 삭제가 충돌하지 않는지)
      await api().patch(`/api/customers/${customerA}`).set(h(A)).send({ tagIds: [tagA, tag2] }).expect(200);
      await api().patch(`/api/customers/${customerA}`).set(h(A)).send({ tagIds: [tag2] }).expect(200);
      const again = await api().patch(`/api/customers/${customerA}`).set(h(A)).send({ tagIds: [tagA, tag2] }).expect(200);
      expect(again.body.data.tags.map((t: any) => t.id).sort()).toEqual([tagA, tag2].sort());
    });

    it('태그 삭제 시 고객에게서도 빠진다', async () => {
      await api().delete(`/api/tags/${tagA}`).set(h(A)).expect(200);
      const c = await api().get(`/api/customers/${customerA}`).set(h(A)).expect(200);
      expect(c.body.data.tags.map((t: any) => t.id)).not.toContain(tagA);
    });

    it('고객 삭제는 소프트 삭제, 같은 번호로 다시 등록 가능', async () => {
      const c = await api().get(`/api/customers/${customerA}`).set(h(A)).expect(200);
      await api().delete(`/api/customers/${customerA}`).set(h(A)).expect(200);
      await api().get(`/api/customers/${customerA}`).set(h(A)).expect(404);
      const [row] = await ds.query('SELECT delState FROM customer WHERE id = ?', [customerA]);
      expect(Number(row.delState)).toBe(1);
      await api().post('/api/customers').set(h(A)).send({ name: '재등록', phone: c.body.data.phone }).expect(201);
    });
  });
});
