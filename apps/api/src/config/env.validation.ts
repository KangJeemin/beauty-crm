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

  // 1단계(인증)부터 필수로 바꿀 항목들
  JWT_ACCESS_SECRET: Joi.string().optional(),
  JWT_REFRESH_SECRET: Joi.string().optional(),
  PHONE_ENC_KEY: Joi.string().allow('').optional(),
  PHONE_HMAC_KEY: Joi.string().allow('').optional(),

  STORAGE_ENDPOINT: Joi.string().uri().required(),
  STORAGE_REGION: Joi.string().default('ap-northeast-2'),
  STORAGE_BUCKET: Joi.string().required(),
  STORAGE_ACCESS_KEY: Joi.string().required(),
  STORAGE_SECRET_KEY: Joi.string().required(),
  STORAGE_FORCE_PATH_STYLE: Joi.string().valid('true', 'false').default('true'),

  STT_PROVIDER: Joi.string().valid('CLOVA').default('CLOVA'),
  LLM_PROVIDER: Joi.string().valid('HYPERCLOVA').default('HYPERCLOVA'),
  LLM_MODEL: Joi.string().default('HCX-007'),
}).unknown(true);
