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

  STT_PROVIDER: Joi.string().valid('CLOVA').default('CLOVA'),
  LLM_PROVIDER: Joi.string().valid('HYPERCLOVA').default('HYPERCLOVA'),
  LLM_MODEL: Joi.string().default('HCX-007'),
}).unknown(true);
