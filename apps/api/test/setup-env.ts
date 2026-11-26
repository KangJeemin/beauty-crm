import { config } from 'dotenv';
import { resolve } from 'path';

// 루트 .env 의 DB 를 그대로 사용 (테스트 데이터는 실행마다 고유 아이디로 생성)
config({ path: resolve(__dirname, '../../../.env') });
process.env.NODE_ENV = 'test';
process.env.SHOP_AUTO_APPROVE = 'true';
process.env.THROTTLE_DISABLED = 'true';
process.env.REFRESH_REUSE_GRACE_SEC = '0';
// 기본은 가짜 엔진 (NAVER 키 없이 실행). 실제 요청 형식은 naver-providers.e2e-spec.ts 에서 가짜 NAVER 서버로 검증
process.env.STT_PROVIDER = 'MOCK';
process.env.LLM_PROVIDER = 'MOCK';
