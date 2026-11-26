/**
 * 실제 엔진(CLOVA Speech · HyperCLOVA X) 연동 검증 — 가짜 NAVER 서버를 띄워
 * 우리가 보내는 요청 형식(경로·헤더·multipart·responseFormat)과 응답 처리, 실패·재시도를 확인한다.
 * (실제 키로 호출하는 시험은 운영 서버에서 별도로)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { VoiceProcessor } from '../src/modules/voice/voice.processor';
import { makeAudio } from './helpers';

const RUN = Date.now().toString(36);

interface Captured {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: Buffer;
}

describe('NAVER 엔진 연동 (가짜 NAVER 서버)', () => {
  let fake: Server;
  let port: number;
  const calls: Captured[] = [];
  // 시나리오 제어
  let sttMode: 'ok' | 'fail' = 'ok';
  let llmFailures = 0;

  let app: INestApplication;
  let ds: DataSource;
  let processor: VoiceProcessor;
  let token: string;
  let customerId: number;
  const saved: Record<string, string | undefined> = {};

  const llmContent = {
    customerName: '김미영',
    phoneLast4: '',
    items: [
      {
        menuName: '뿌염', // 별칭 → "뿌리염색" 으로 매칭되어야 함
        price: 0,
        recipes: [{ area: '뿌리', productName: '', colorCode: '7N', mixRatio: '1:1', developerPct: 6, amountGram: 0, processingMin: 30, rodSize: '', heatTemp: 0, memo: '' }],
      },
      { menuName: '여성 커트', price: 15000, recipes: [] },
    ],
    totalPrice: 55000,
    note: '두피 예민',
    summary: '뿌리염색 7N + 커트',
  };

  beforeAll(async () => {
    fake = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        calls.push({ method: req.method!, url: req.url!, headers: req.headers, body });
        res.setHeader('Content-Type', 'application/json');

        if (req.url?.endsWith('/recognizer/upload')) {
          if (sttMode === 'fail') return res.end(JSON.stringify({ result: 'FAILED', message: 'Invalid media' }));
          return res.end(JSON.stringify({ result: 'COMPLETED', message: 'Succeeded', token: 'tok-1', text: '김미영 고객님 뿌염 7N 6프로 1대1 30분 커트 5만 5천원' }));
        }
        if (req.url === '/v3/chat-completions/HCX-007') {
          if (llmFailures > 0) {
            llmFailures--;
            res.statusCode = 500;
            return res.end(JSON.stringify({ status: { code: '50000', message: 'Internal Server Error' } }));
          }
          return res.end(
            JSON.stringify({
              status: { code: '20000', message: 'OK' },
              result: {
                message: { role: 'assistant', content: JSON.stringify(llmContent) },
                finishReason: 'stop',
                usage: { promptTokens: 812, completionTokens: 143, totalTokens: 955 },
              },
            }),
          );
        }
        res.statusCode = 404;
        res.end('{}');
      });
    });
    await new Promise<void>((r) => fake.listen(0, '127.0.0.1', () => r()));
    port = (fake.address() as AddressInfo).port;

    // 이 파일에서만 실제 엔진 사용 → 가짜 서버로
    const env = {
      STT_PROVIDER: 'CLOVA',
      CLOVA_SPEECH_INVOKE_URL: `http://127.0.0.1:${port}/external/v1/1234/invokekey`,
      CLOVA_SPEECH_SECRET_KEY: 'speech-secret',
      LLM_PROVIDER: 'HYPERCLOVA',
      LLM_MODEL: 'HCX-007',
      CLOVA_STUDIO_API_KEY: 'studio-key',
      CLOVA_STUDIO_BASE_URL: `http://127.0.0.1:${port}`,
    };
    for (const [k, v] of Object.entries(env)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }

    // env 를 바꾼 뒤에 AppModule 을 불러와야 ConfigModule 이 새 값을 읽는다
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/app.setup');
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    processor = app.get(VoiceProcessor);

    const s = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ shopName: '연동매장', ownerName: '원장', loginId: `nv${RUN}`, password: 'test1234', agreeTerms: true, agreePrivacy: true })
      .expect(201);
    token = s.body.data.login.accessToken;
    customerId = (await request(app.getHttpServer()).post('/api/customers').set({ Authorization: `Bearer ${token}` }).send({ name: '김미영' })).body.data.id;
  });

  afterAll(async () => {
    await app?.close();
    await new Promise((r) => fake.close(r));
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const api = () => request(app.getHttpServer());
  const h = () => ({ Authorization: `Bearer ${token}` });

  async function upload(): Promise<number> {
    const res = await api()
      .post('/api/voice-records')
      .set(h())
      .attach('audio', makeAudio('m4a', 1), { filename: 'rec.m4a', contentType: 'audio/mp4' })
      .expect(201);
    await processor.drain();
    return res.body.data.id;
  }

  it('CLOVA Speech: /recognizer/upload 로 WAV + params(JSON) 를 multipart 로 보낸다', async () => {
    calls.length = 0;
    const id = await upload();

    const stt = calls.find((c) => c.url.endsWith('/recognizer/upload'))!;
    expect(stt).toBeTruthy();
    expect(stt.method).toBe('POST');
    expect(stt.url).toBe('/external/v1/1234/invokekey/recognizer/upload');
    expect(stt.headers['x-clovaspeech-api-key']).toBe('speech-secret');
    expect(stt.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);

    const raw = stt.body.toString('latin1');
    expect(raw).toMatch(/name="media"; filename="voice-\d+\.wav"/);
    expect(raw).toContain('Content-Type: audio/wav');
    const paramsJson = /name="params"\r\n\r\n(\{.*?\})\r\n/s.exec(Buffer.from(raw, 'latin1').toString('utf8'))?.[1];
    const params = JSON.parse(paramsJson!);
    expect(params).toMatchObject({ language: 'ko-KR', completion: 'sync', fullText: true });
    // 키워드 부스팅: 메뉴명·별칭·미용 용어 (한글·영어만)
    const words: string[] = params.boostings[0].words.split(',');
    expect(words).toEqual(expect.arrayContaining(['뿌리염색', '뿌염', '산화제']));
    expect(words.every((w) => /^[가-힣a-zA-Z ]+$/.test(w))).toBe(true);

    const st = (await api().get(`/api/voice-records/${id}`).set(h())).body.data;
    expect(st.sttStatus).toBe('DONE');
    expect(st.transcript).toContain('뿌염 7N');
  });

  it('HCX-007: Structured Outputs(responseFormat json) + thinking none 으로 요청하고 결과를 검증·정리한다', async () => {
    const llm = calls.find((c) => c.url === '/v3/chat-completions/HCX-007')!;
    expect(llm.headers.authorization).toBe('Bearer studio-key');
    expect(llm.headers['x-ncp-clovastudio-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(llm.headers['content-type']).toContain('application/json');

    const body = JSON.parse(llm.body.toString('utf8'));
    expect(body.thinking).toEqual({ effort: 'none' });
    expect(body.responseFormat.type).toBe('json');
    expect(body.responseFormat.schema.required).toEqual(['customerName', 'phoneLast4', 'items', 'totalPrice', 'note', 'summary']);
    expect(JSON.stringify(body.responseFormat.schema)).not.toContain('"pattern"'); // 미지원 키워드
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('뿌리염색 (염색, 40000원) / 다르게 부르는 말: 뿌염, 뿌리 염색');
    expect(body.messages[1].content).toContain('뿌염 7N');

    const vr = (await ds.query('SELECT id FROM voice_record WHERE shopId = (SELECT shopId FROM customer WHERE id = ?) ORDER BY id DESC LIMIT 1', [customerId]))[0];
    const st = (await api().get(`/api/voice-records/${vr.id}`).set(h())).body.data;
    expect(st.aiStatus).toBe('DONE');
    expect(st.draft.items[0]).toMatchObject({ menuName: '뿌리염색', price: 40000 });
    expect(st.draft.items[0].serviceMenuId).toBeGreaterThan(0);
    expect(st.draft.items[0].recipes[0]).toMatchObject({ colorCode: '7N', developerPct: 6, amountGram: null, rodSize: null }); // 0/"" → null
    expect(st.draft.items[1]).toMatchObject({ menuName: '여성 커트', price: 15000 });
    expect(st.candidates[0]).toMatchObject({ id: customerId, name: '김미영' });

    const logs = await ds.query('SELECT usageType, provider, model, inputUnits, outputUnits FROM ai_usage_log WHERE voiceRecordId = ? ORDER BY id', [vr.id]);
    expect(logs[0]).toMatchObject({ usageType: 'STT', provider: 'CLOVA' });
    expect(logs[1]).toMatchObject({ usageType: 'LLM', provider: 'HYPERCLOVA', model: 'HCX-007', inputUnits: 812, outputUnits: 143 });
  });

  it('STT 실패 → 사용자 메시지 저장, 재시도하면 성공', async () => {
    sttMode = 'fail';
    const id = await upload();
    let st = (await api().get(`/api/voice-records/${id}`).set(h())).body.data;
    expect(st).toMatchObject({ sttStatus: 'FAILED', aiStatus: 'PENDING' });
    expect(st.error).toContain('Invalid media');

    sttMode = 'ok';
    await api().post(`/api/voice-records/${id}/retry`).set(h()).expect(200);
    await processor.drain();
    st = (await api().get(`/api/voice-records/${id}`).set(h())).body.data;
    expect(st).toMatchObject({ sttStatus: 'DONE', aiStatus: 'DONE', error: null });
  });

  it('LLM 서버 오류(5xx)는 한 번 재시도, 계속 실패하면 FAILED (받아 적은 글은 남음)', async () => {
    llmFailures = 1; // 첫 시도만 실패 → 재시도로 성공
    calls.length = 0;
    const ok = await upload();
    expect(calls.filter((c) => c.url === '/v3/chat-completions/HCX-007')).toHaveLength(2);
    expect((await api().get(`/api/voice-records/${ok}`).set(h())).body.data.aiStatus).toBe('DONE');

    llmFailures = 5; // 계속 실패
    const bad = await upload();
    const st = (await api().get(`/api/voice-records/${bad}`).set(h())).body.data;
    expect(st).toMatchObject({ sttStatus: 'DONE', aiStatus: 'FAILED' });
    expect(st.transcript).toContain('뿌염');
    expect(st.error).toContain('AI 정리에 실패했습니다');
    llmFailures = 0;
  });
});
