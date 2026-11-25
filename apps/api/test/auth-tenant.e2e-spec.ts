/**
 * 1단계 e2e 테스트 — 실제 MariaDB 에 붙어서 실행한다.
 *   npm run test:e2e -w @beauty-crm/api
 *
 * 핵심: A 매장 계정으로 B 매장 데이터에 접근하면 반드시 차단(404/403)되어야 한다.
 */
import { ErrorCode, ShopStatus } from '@beauty-crm/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AdminService } from '../src/modules/admin/admin.service';

const RUN = Date.now().toString(36);
const PW = 'test1234';

interface Session {
  token: string;
  cookie: string;
  userId: number;
  shopId: number;
}

describe('1단계: 인증 · 매장 격리 · 권한', () => {
  let app: INestApplication;
  let ds: DataSource;

  const api = () => request(app.getHttpServer());
  const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });
  const cookieOf = (res: request.Response): string => {
    const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
    const c = raw?.find((v) => v.startsWith('bc_rt='));
    return c ? c.split(';')[0] : '';
  };

  async function signup(tag: string): Promise<Session> {
    const res = await api()
      .post('/api/auth/signup')
      .send({ shopName: `매장${tag}`, ownerName: `원장${tag}`, loginId: `own${tag}${RUN}`, password: PW, agreeTerms: true, agreePrivacy: true })
      .expect(201);
    const login = res.body.data.login;
    return { token: login.accessToken, cookie: cookieOf(res), userId: login.user.id, shopId: login.user.shopId };
  }

  function login(loginId: string, password = PW) {
    return api().post('/api/auth/login').send({ loginId, password });
  }

  let A: Session;
  let B: Session;
  let designer: Session;
  let designerLoginId: string;
  let bInviteId: number;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 가입 · 로그인 ──────────────────────────────────

  it('매장 가입: 매장 + 원장 계정 생성, 로그인 쿠키 발급', async () => {
    A = await signup('A');
    B = await signup('B');
    expect(A.shopId).not.toBe(B.shopId);
    expect(A.cookie).toMatch(/^bc_rt=/);

    const res = await api().get('/api/auth/me').set(auth(A)).expect(200);
    expect(res.body.data).toMatchObject({ shopId: A.shopId, role: 'OWNER', shopName: '매장A' });
  });

  it('Refresh Token 쿠키는 httpOnly', async () => {
    const res = await login(`ownA${RUN}`).expect(200);
    const raw = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Path=\/api\/auth/);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('같은 아이디로 가입하면 409', async () => {
    const res = await api()
      .post('/api/auth/signup')
      .send({ shopName: 'X', ownerName: 'X', loginId: `ownA${RUN}`, password: PW, agreeTerms: true, agreePrivacy: true })
      .expect(409);
    expect(res.body.code).toBe(ErrorCode.LOGIN_ID_TAKEN);
  });

  it('틀린 비밀번호 / 없는 아이디는 같은 에러 (아이디 존재 여부 노출 X)', async () => {
    const wrong = await login(`ownA${RUN}`, 'wrong9999').expect(401);
    const none = await login(`nobody${RUN}`).expect(401);
    expect(wrong.body.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(none.body).toEqual(wrong.body);
  });

  it('토큰 없이 호출하면 401', async () => {
    await api().get('/api/staff').expect(401);
    await api().get('/api/staff').set({ Authorization: 'Bearer garbage' }).expect(401);
  });

  // ── 초대 · 권한 ────────────────────────────────────

  it('원장이 초대 코드 발급 → 디자이너 가입', async () => {
    const inv = await api().post('/api/invites').set(auth(A)).expect(201);
    const code = inv.body.data.inviteCode as string;
    expect(code).toMatch(/^[A-Z2-9]{8}$/);

    const preview = await api().get(`/api/auth/invites/${code.toLowerCase()}`).expect(200);
    expect(preview.body.data.shopName).toBe('매장A');

    designerLoginId = `des${RUN}`;
    const res = await api()
      .post('/api/auth/join')
      .send({ inviteCode: code, loginId: designerLoginId, password: PW, name: '김디자이너' })
      .expect(201);
    const l = res.body.data.login;
    designer = { token: l.accessToken, cookie: cookieOf(res), userId: l.user.id, shopId: l.user.shopId };
    expect(designer.shopId).toBe(A.shopId);
    expect(l.user.role).toBe('DESIGNER');

    // 같은 코드는 한 번만
    const again = await api()
      .post('/api/auth/join')
      .send({ inviteCode: code, loginId: `des2${RUN}`, password: PW, name: '두번째' })
      .expect(400);
    expect(again.body.code).toBe(ErrorCode.INVITE_INVALID);
  });

  it('디자이너는 원장 전용 기능을 쓸 수 없다 (403)', async () => {
    await api().get('/api/staff').set(auth(designer)).expect(200);
    await api().post('/api/invites').set(auth(designer)).expect(403);
    await api().patch('/api/shop').set(auth(designer)).send({ name: '바꿈' }).expect(403);
    await api().post(`/api/staff/${A.userId}/reset-password`).set(auth(designer)).expect(403);
  });

  // ── 매장 격리 (가장 중요) ──────────────────────────

  describe('매장 격리: A 매장 계정으로 B 매장 데이터 접근 차단', () => {
    beforeAll(async () => {
      const inv = await api().post('/api/invites').set(auth(B)).expect(201);
      bInviteId = inv.body.data.id;
    });

    it('직원 목록에는 내 매장 사람만 보인다', async () => {
      const res = await api().get('/api/staff').set(auth(A)).expect(200);
      const ids = res.body.data.map((s: any) => s.id);
      expect(ids).toEqual(expect.arrayContaining([A.userId, designer.userId]));
      expect(ids).not.toContain(B.userId);
    });

    it('B 매장 직원 id 로 조회·수정·삭제·비밀번호 초기화 → 모두 404', async () => {
      await api().get(`/api/staff/${B.userId}`).set(auth(A)).expect(404);
      await api().patch(`/api/staff/${B.userId}`).set(auth(A)).send({ name: '해킹' }).expect(404);
      await api().delete(`/api/staff/${B.userId}`).set(auth(A)).expect(404);
      await api().post(`/api/staff/${B.userId}/reset-password`).set(auth(A)).expect(404);

      // B 데이터는 그대로
      const me = await api().get('/api/auth/me').set(auth(B)).expect(200);
      expect(me.body.data.name).toBe('원장B');
    });

    it('B 매장 초대 코드 취소 → 404, A 의 초대 목록에 B 코드 없음', async () => {
      await api().delete(`/api/invites/${bInviteId}`).set(auth(A)).expect(404);
      const res = await api().get('/api/invites').set(auth(A)).expect(200);
      expect(res.body.data.map((i: any) => i.id)).not.toContain(bInviteId);
    });

    it('요청 body 에 shopId 를 넣어도 무시가 아니라 거부(400)', async () => {
      await api().patch('/api/shop').set(auth(A)).send({ name: '바꿈', shopId: B.shopId }).expect(400);
      const shopB = await api().get('/api/shop').set(auth(B)).expect(200);
      expect(shopB.body.data.name).toBe('매장B');
    });

    it('GET /shop 은 항상 토큰의 매장', async () => {
      const res = await api().get('/api/shop').set(auth(A)).expect(200);
      expect(res.body.data.id).toBe(A.shopId);
    });
  });

  // ── 토큰 회전 · 로그아웃 ───────────────────────────

  it('Refresh: 새 Access Token + 새 쿠키, 이전 쿠키 재사용 시 전체 로그아웃', async () => {
    const r1 = await api().post('/api/auth/refresh').set('Cookie', A.cookie).expect(200);
    const newCookie = cookieOf(r1);
    expect(newCookie).toBeTruthy();
    expect(newCookie).not.toBe(A.cookie);
    expect(r1.body.data.user.shopId).toBe(A.shopId);

    // 이미 쓴 쿠키를 다시 쓰면 → 탈취 의심 → 새 쿠키까지 모두 무효
    await api().post('/api/auth/refresh').set('Cookie', A.cookie).expect(401);
    await api().post('/api/auth/refresh').set('Cookie', newCookie).expect(401);
  });

  it('로그아웃하면 그 쿠키로 갱신 불가', async () => {
    const l = await login(`ownB${RUN}`).expect(200);
    const c = cookieOf(l);
    await api().post('/api/auth/logout').set('Cookie', c).expect(200);
    await api().post('/api/auth/refresh').set('Cookie', c).expect(401);
  });

  it('비밀번호 변경 → 이전 비밀번호 로그인 실패, 다른 기기 로그아웃', async () => {
    const other = cookieOf(await login(`ownB${RUN}`).expect(200));
    await api()
      .post('/api/auth/password')
      .set(auth(B))
      .send({ currentPassword: PW, newPassword: 'newpass77' })
      .expect(200);
    await login(`ownB${RUN}`).expect(401);
    await login(`ownB${RUN}`, 'newpass77').expect(200);
    await api().post('/api/auth/refresh').set('Cookie', other).expect(401);
  });

  // ── 상태 · 소프트 삭제 ─────────────────────────────

  it('원장이 디자이너 비밀번호 초기화 → 임시 비밀번호로 로그인', async () => {
    const res = await api().post(`/api/staff/${designer.userId}/reset-password`).set(auth(A)).expect(200);
    const temp = res.body.data.tempPassword;
    await login(designerLoginId).expect(401);
    await login(designerLoginId, temp).expect(200);
  });

  it('잠긴 계정은 로그인 불가 (USER_LOCKED)', async () => {
    await api().patch(`/api/staff/${designer.userId}`).set(auth(A)).send({ status: 'LOCKED' }).expect(200);
    const res = await login(designerLoginId, PW);
    // 초기화로 비밀번호가 바뀌었으므로 비밀번호 단계에서 막힐 수 있다 → 임시 비번 재발급 후 확인
    expect([401, 403]).toContain(res.status);
    const reset = await api().post(`/api/staff/${designer.userId}/reset-password`).set(auth(A)).expect(200);
    const locked = await login(designerLoginId, reset.body.data.tempPassword).expect(403);
    expect(locked.body.code).toBe(ErrorCode.USER_LOCKED);
    await api().patch(`/api/staff/${designer.userId}`).set(auth(A)).send({ status: 'ACTIVE' }).expect(200);
  });

  it('직원 삭제는 소프트 삭제 (DB 행은 delState=1 로 남음)', async () => {
    await api().delete(`/api/staff/${designer.userId}`).set(auth(A)).expect(200);
    await api().get(`/api/staff/${designer.userId}`).set(auth(A)).expect(404);
    const [row] = await ds.query('SELECT delState FROM shop_user WHERE id = ?', [designer.userId]);
    expect(Number(row.delState)).toBe(1);
    // 원장 본인은 삭제 불가
    await api().delete(`/api/staff/${A.userId}`).set(auth(A)).expect(403);
  });

  it('정지된 매장은 로그인 불가 (SHOP_SUSPENDED)', async () => {
    const admin = app.get(AdminService);
    await admin.setShopStatus(null, B.shopId, ShopStatus.SUSPENDED);
    const res = await login(`ownB${RUN}`, 'newpass77').expect(403);
    expect(res.body.code).toBe(ErrorCode.SHOP_SUSPENDED);
    await admin.setShopStatus(null, B.shopId, ShopStatus.ACTIVE);
    await login(`ownB${RUN}`, 'newpass77').expect(200);
  });

  // ── 운영자 ─────────────────────────────────────────

  it('매장 토큰으로 운영자 API 호출 → 403, 운영자 토큰으로는 가능', async () => {
    await api().get('/api/admin/shops').set(auth(A)).expect(403);

    const admin = app.get(AdminService);
    await admin.createAdmin(`ops${RUN}`, '테스트운영자', 'adminpass1');
    const l = await api().post('/api/admin/auth/login').send({ loginId: `ops${RUN}`, password: 'adminpass1' }).expect(200);
    const adminToken = l.body.data.accessToken;

    const list = await api().get('/api/admin/shops').set({ Authorization: `Bearer ${adminToken}` }).expect(200);
    expect(list.body.data.map((s: any) => s.id)).toEqual(expect.arrayContaining([A.shopId, B.shopId]));

    // 운영자 토큰으로 매장 API 호출 → 403
    await api().get('/api/staff').set({ Authorization: `Bearer ${adminToken}` }).expect(403);
  });
});
