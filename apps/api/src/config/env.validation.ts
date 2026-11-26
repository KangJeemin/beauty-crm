import * as Joi from 'joi';

/** 서버 시작 시 필수 환경변수를 검사한다. 누락되면 부팅 자체가 실패한다. */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  API_PORT: Joi.number().default(4000),
  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(3306),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),
  DB_LOGGING: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: Joi.string().min(32).required().messages({
    'string.min': 'JWT_ACCESS_SECRET 는 32자 이상이어야 합니다 (openssl rand -hex 32).',
  }),
  JWT_ACCESS_EXPIRES: Joi.string().pattern(/^\d+[smhd]$/).default('30m'),
  JWT_REFRESH_EXPIRES: Joi.string().pattern(/^\d+[smhd]$/).default('30d'),
  COOKIE_SECURE: Joi.string().valid('true', 'false').optional(),
  SHOP_AUTO_APPROVE: Joi.string().valid('true', 'false').default('false'),
  PHONE_ENC_KEY: Joi.string().hex().length(64).required().messages({
    'any.required': 'PHONE_ENC_KEY 가 필요합니다 (openssl rand -hex 32).',
    'string.length': 'PHONE_ENC_KEY 는 64자리 hex 여야 합니다 (openssl rand -hex 32).',
  }),
  PHONE_HMAC_KEY: Joi.string().hex().length(64).required().messages({
    'any.required': 'PHONE_HMAC_KEY 가 필요합니다 (openssl rand -hex 32).',
    'string.length': 'PHONE_HMAC_KEY 는 64자리 hex 여야 합니다 (openssl rand -hex 32).',
  }),

  STORAGE_ENDPOINT: Joi.string().uri().required(),
  STORAGE_REGION: Joi.string().default('ap-northeast-2'),
  STORAGE_BUCKET: Joi.string().required(),
  STORAGE_ACCESS_KEY: Joi.string().required(),
  STORAGE_SECRET_KEY: Joi.string().required(),
  STORAGE_FORCE_PATH_STYLE: Joi.string().valid('true', 'false').default('true'),

  // ── 정산 (4단계) ── 이 시각(0~12시) 전 결제는 전날 영업일로 집계
  BUSINESS_DAY_CUTOFF_HOUR: Joi.number().integer().min(0).max(12).default(4),

  // ── 음성 · AI (3단계) ── MOCK 은 키 없이 흐름만 확인하는 개발용
  STT_PROVIDER: Joi.string().valid('CLOVA', 'MOCK').default('MOCK'),
  CLOVA_SPEECH_INVOKE_URL: Joi.when('STT_PROVIDER', {
    is: 'CLOVA',
    then: Joi.string().uri().required().messages({ 'any.required': 'STT_PROVIDER=CLOVA 이면 CLOVA_SPEECH_INVOKE_URL 이 필요합니다.' }),
    otherwise: Joi.string().allow('').optional(),
  }),
  CLOVA_SPEECH_SECRET_KEY: Joi.when('STT_PROVIDER', {
    is: 'CLOVA',
    then: Joi.string().required().messages({ 'any.required': 'STT_PROVIDER=CLOVA 이면 CLOVA_SPEECH_SECRET_KEY 가 필요합니다.' }),
    otherwise: Joi.string().allow('').optional(),
  }),
  LLM_PROVIDER: Joi.string().valid('HYPERCLOVA', 'MOCK').default('MOCK'),
  LLM_MODEL: Joi.string().default('HCX-007'),
  CLOVA_STUDIO_API_KEY: Joi.when('LLM_PROVIDER', {
    is: 'HYPERCLOVA',
    then: Joi.string().required().messages({ 'any.required': 'LLM_PROVIDER=HYPERCLOVA 이면 CLOVA_STUDIO_API_KEY 가 필요합니다.' }),
    otherwise: Joi.string().allow('').optional(),
  }),
  CLOVA_STUDIO_BASE_URL: Joi.string().uri().default('https://clovastudio.stream.ntruss.com'),
  FFMPEG_PATH: Joi.string().allow('').optional(),
  VOICE_FILE_RETENTION_DAYS: Joi.number().integer().min(1).max(365).default(30),
  STT_COST_KRW_PER_MIN: Joi.number().min(0).default(0),
  LLM_COST_KRW_PER_1K_INPUT: Joi.number().min(0).default(0),
  LLM_COST_KRW_PER_1K_OUTPUT: Joi.number().min(0).default(0),
}).unknown(true);
