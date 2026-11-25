/**
 * 3단계 e2e — 녹음 업로드 → STT → AI 정리 → 검토 → 시술 기록 저장 (MOCK 엔진)
 */
import { ErrorCode } from '@beauty-crm/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MOCK_TRANSCRIPT } from '../src/modules/ai/providers/mock.providers';
import { VoiceProcessor } from '../src/modules/voice/voice.processor';
import { makeAudio } from './helpers';

const RUN = Date.now().toString(36);
const PW = 'test1234';

interface S {
  token: string;
  userId: number;
  shopId: number;
}

describe('3단계: 음성 기록 → 시술 기록', () => {
  let app: INestApplication;
  let ds: DataSource;
  let processor: VoiceProcessor;
  const api = () => request(app.getHttpServer());
  const h = (s: S) => ({ Authorization: `Bearer ${s.token}` });

  async function signup(tag: string): Promise<S> {
    const res = await api()
      .post('/api/auth/signup')
      .send({ shopName: `음성${tag}`, ownerName: `원장${tag}`, loginId: `v${tag}${RUN}`, password: PW, agreeTerms: true, agreePrivacy: true })
      .expect(201);
    const l = res.body.data.login;
    return { token: l.accessToken, userId: l.user.id, shopId: l.user.shopId };
  }

  let A: S;
  let B: S;
  let kim: number; // A 매장 고객 김미영
  let lee: number; // A 매장 고객 이순자
  let bCustomer: number;
  let webm: Buffer;
  let voiceId: number;
  let treatmentId: number;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    processor = app.get(VoiceProcessor);
    A = await signup('A');
    B = await signup('B');
    kim = (await api().post('/api/customers').set(h(A)).send({ name: '김미영' }).expect(201)).body.data.id;
    lee = (await api().post('/api/customers').set(h(A)).send({ name: '이순자' }).expect(201)).body.data.id;
    bCustomer = (await api().post('/api/customers').set(h(B)).send({ name: 'B고객' }).expect(201)).body.data.id;
    webm = makeAudio('webm', 2);
  });

  afterAll(async () => {
    await app.close();
  });

  it('녹음 업로드(webm) → 바로 응답, 백그라운드에서 STT·AI 정리', async () => {
    const res = await api()
      .post('/api/voice-records')
      .set(h(A))
      .field('customerId', String(kim))
      .attach('audio', webm, { filename: 'rec.webm', contentType: 'audio/webm;codecs=opus' })
      .expect(201);
    voiceId = res.body.data.id;
    expect(res.body.data.inputType).toBe('VOICE');

    await processor.drain();
    const st = (await api().get(`/api/voice-records/${voiceId}`).set(h(A)).expect(200)).body.data;
    expect(st).toMatchObject({ sttStatus: 'DONE', aiStatus: 'DONE', transcript: MOCK_TRANSCRIPT, error: null, customerId: kim });
    // webm → WAV 변환 후 재생 시간 계산
    expect(st.durationSec).toBeGreaterThan(1.5);
    expect(st.durationSec).toBeLessThan(2.5);
    // 고객이 정해져 있으면 후보는 그 고객
    expect(st.candidates.map((c: any) => c.id)).toEqual([kim]);

    // AI 결과: 메뉴 매칭(별칭 "뿌리 염색" → 뿌리염색), 레시피, 금액, 메모
    const dye = st.draft.items.find((i: any) => i.menuName === '뿌리염색');
    expect(dye.serviceMenuId).toBeGreaterThan(0);
    expect(dye.price).toBe(40000); // 말하지 않은 시술 금액은 메뉴 기본가
    expect(dye.recipes[0]).toMatchObject({ area: '뿌리', colorCode: '7N', developerPct: 6, mixRatio: '1:1', processingMin: 30 });
    expect(st.draft.totalPrice).toBe(55000);
    expect(st.draft.note).toContain('두피');

    const [usage] = await ds.query('SELECT COUNT(*) n FROM ai_usage_log WHERE voiceRecordId = ?', [voiceId]);
    expect(Number(usage.n)).toBe(2); // STT 1 + LLM 1
  });

  it('원본 녹음 다시 듣기', async () => {
    const res = await api().get(`/api/voice-records/${voiceId}/audio`).set(h(A)).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(res.headers['content-type']).toContain('audio/webm');
    expect(Buffer.compare(res.body, webm)).toBe(0);
  });

  it('글로 입력 → AI 가 말한 고객 이름으로 후보를 찾는다', async () => {
    const res = await api().post('/api/voice-records/text').set(h(A)).send({ text: '이순자 고객님 일반펌 하고 6만원 받았어요' }).expect(201);
    await processor.drain();
    const st = (await api().get(`/api/voice-records/${res.body.data.id}`).set(h(A)).expect(200)).body.data;
    expect(st).toMatchObject({ inputType: 'TEXT', sttStatus: 'SKIPPED', aiStatus: 'DONE' });
    expect(st.draft.customerName).toBe('이순자');
    expect(st.candidates[0].id).toBe(lee);
    expect(st.draft.items.map((i: any) => i.menuName)).toContain('일반펌');
  });

  it('검토 대기 목록에 저장 전 기록이 보인다', async () => {
    const res = await api().get('/api/voice-records/pending').set(h(A)).expect(200);
    expect(res.body.data.map((p: any) => p.id)).toContain(voiceId);
  });

  it('검토 후 저장 → 시술 기록 생성, 고객 방문 정보 갱신', async () => {
    const st = (await api().get(`/api/voice-records/${voiceId}`).set(h(A)).expect(200)).body.data;
    const res = await api()
      .post('/api/treatments')
      .set(h(A))
      .send({
        customerId: kim,
        voiceRecordId: voiceId,
        items: [...st.draft.items, { serviceMenuId: null, menuName: '여성 커트', price: 15000, recipes: [] }],
        note: st.draft.note,
      })
      .expect(201);
    treatmentId = res.body.data.id;
    expect(res.body.data).toMatchObject({
      customerId: kim,
      customerName: '김미영',
      designerId: A.userId,
      inputType: 'VOICE',
      totalAmount: 55000,
      transcript: MOCK_TRANSCRIPT,
      summary: '뿌리염색 + 여성 커트',
    });
    expect(res.body.data.items[0].recipes[0].colorCode).toBe('7N');

    const c = (await api().get(`/api/customers/${kim}`).set(h(A)).expect(200)).body.data;
    expect(c.visitCount).toBe(1);
    expect(c.lastVisitAt).toBeTruthy();

    const pend = await api().get('/api/voice-records/pending').set(h(A)).expect(200);
    expect(pend.body.data.map((p: any) => p.id)).not.toContain(voiceId);

    // 같은 녹음으로 두 번 저장 불가
    await api().post('/api/treatments').set(h(A)).send({ customerId: kim, voiceRecordId: voiceId, items: [] }).expect(403);
  });

  it('고객 시술 이력 + 최근 기록', async () => {
    const t = await api().get(`/api/customers/${kim}/treatments`).set(h(A)).expect(200);
    expect(t.body.data.total).toBe(1);
    expect(t.body.data.items[0].items[0].recipes[0]).toMatchObject({ colorCode: '7N', developerPct: 6 });
    const recent = await api().get('/api/treatments/recent').set(h(A)).expect(200);
    expect(recent.body.data[0]).toMatchObject({ id: treatmentId, customerName: '김미영', totalAmount: 55000 });
  });

  it('수정: 항목 통째로 교체, 이전 항목은 소프트 삭제', async () => {
    const before = await ds.query('SELECT id FROM treatment_item WHERE treatmentId = ? AND delState = 0', [treatmentId]);
    const res = await api()
      .put(`/api/treatments/${treatmentId}`)
      .set(h(A))
      .send({ customerId: kim, items: [{ menuName: '전체염색', price: 70000, recipes: [{ colorCode: '6.3', developerPct: 6, processingMin: 35 }] }], note: '다음엔 7레벨' })
      .expect(200);
    expect(res.body.data).toMatchObject({ totalAmount: 70000, note: '다음엔 7레벨', summary: '전체염색' });
    const old = await ds.query(`SELECT delState FROM treatment_item WHERE id IN (${before.map((b: any) => b.id).join(',')})`);
    expect(old.every((o: any) => Number(o.delState) === 1)).toBe(true);
  });

  it('"지난번이랑 똑같이" 복사 → 방문 2회, 삭제하면 1회로', async () => {
    const prev = (await api().get(`/api/treatments/${treatmentId}`).set(h(A)).expect(200)).body.data;
    const res = await api()
      .post('/api/treatments')
      .set(h(A))
      .send({ customerId: kim, copiedFromId: treatmentId, items: prev.items.map(({ id, ...i }: any) => ({ ...i, recipes: i.recipes.map(({ id: _rid, ...r }: any) => r) })) })
      .expect(201);
    expect(res.body.data).toMatchObject({ copiedFromId: treatmentId, inputType: 'MANUAL', totalAmount: 70000 });
    expect((await api().get(`/api/customers/${kim}`).set(h(A))).body.data.visitCount).toBe(2);

    await api().delete(`/api/treatments/${res.body.data.id}`).set(h(A)).expect(200);
    expect((await api().get(`/api/customers/${kim}`).set(h(A))).body.data.visitCount).toBe(1);
    await api().get(`/api/treatments/${res.body.data.id}`).set(h(A)).expect(404);
  });

  describe('매장 격리', () => {
    it('B 는 A 의 음성 기록·녹음 파일·시술 기록을 볼 수 없다', async () => {
      await api().get(`/api/voice-records/${voiceId}`).set(h(B)).expect(404);
      await api().get(`/api/voice-records/${voiceId}/audio`).set(h(B)).expect(404);
      await api().post(`/api/voice-records/${voiceId}/retry`).set(h(B)).expect(404);
      await api().get(`/api/treatments/${treatmentId}`).set(h(B)).expect(404);
      await api().put(`/api/treatments/${treatmentId}`).set(h(B)).send({ customerId: bCustomer, items: [] }).expect(404);
      await api().delete(`/api/treatments/${treatmentId}`).set(h(B)).expect(404);
      const t = await api().get(`/api/customers/${kim}/treatments`).set(h(B)).expect(200);
      expect(t.body.data.total).toBe(0);
    });

    it('남의 고객·메뉴·디자이너·녹음·원본 기록 id 로 저장 불가', async () => {
      const bMenu = (await api().get('/api/menus').set(h(B))).body.data[0].menus[0].id;
      const item = { menuName: 'x', price: 1, recipes: [] };
      await api().post('/api/treatments').set(h(A)).send({ customerId: bCustomer, items: [item] }).expect(404);
      await api().post('/api/treatments').set(h(A)).send({ customerId: kim, items: [{ ...item, serviceMenuId: bMenu }] }).expect(404);
      await api().post('/api/treatments').set(h(A)).send({ customerId: kim, designerId: B.userId, items: [item] }).expect(404);
      await api().post('/api/treatments').set(h(B)).send({ customerId: bCustomer, copiedFromId: treatmentId, items: [item] }).expect(404);
      const v = await api().post('/api/voice-records/text').set(h(A)).send({ text: '테스트 커트' }).expect(201);
      await api().post('/api/treatments').set(h(B)).send({ customerId: bCustomer, voiceRecordId: v.body.data.id, items: [item] }).expect(404);
      // 녹음할 때 남의 고객 지정
      await api().post('/api/voice-records/text').set(h(A)).send({ text: '테스트', customerId: bCustomer }).expect(404);
    });
  });

  it('음성이 아닌 파일·빈 요청은 400', async () => {
    const r1 = await api().post('/api/voice-records').set(h(A)).attach('audio', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' }).expect(400);
    expect(r1.body.code).toBe(ErrorCode.VALIDATION);
    await api().post('/api/voice-records').set(h(A)).expect(400);
    await api().post('/api/voice-records/text').set(h(A)).send({ text: '' }).expect(400);
  });

  it('보관 기간이 지난 원본 음성은 파일만 삭제 (받아 적은 글은 유지)', async () => {
    await ds.query('UPDATE voice_record SET fileExpireAt = NOW() - INTERVAL 1 DAY WHERE id = ?', [voiceId]);
    await processor.deleteExpiredFiles();
    const [row] = await ds.query('SELECT fileDeletedAt, transcript FROM voice_record WHERE id = ?', [voiceId]);
    expect(row.fileDeletedAt).toBeTruthy();
    expect(row.transcript).toBe(MOCK_TRANSCRIPT);
    await api().get(`/api/voice-records/${voiceId}/audio`).set(h(A)).expect(404);
  });
});
