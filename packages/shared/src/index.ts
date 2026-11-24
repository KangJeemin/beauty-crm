/**
 * 프론트(Next)와 백엔드(Nest)가 함께 쓰는 코드값·타입.
 * DB의 VARCHAR 코드 컬럼과 값이 1:1로 맞아야 한다.
 */

/** 소프트 삭제 상태 (모든 업무 테이블의 delState) */
export const DelState = {
  ACTIVE: 0,
  DELETED: 1,
} as const;
export type DelState = (typeof DelState)[keyof typeof DelState];

export const ShopStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  CLOSED: 'CLOSED',
} as const;
export type ShopStatus = (typeof ShopStatus)[keyof typeof ShopStatus];

export const PlanType = {
  FREE: 'FREE',
  FOUNDER: 'FOUNDER',
  BASIC: 'BASIC',
  PRO: 'PRO',
} as const;
export type PlanType = (typeof PlanType)[keyof typeof PlanType];

export const UserRole = {
  OWNER: 'OWNER',
  DESIGNER: 'DESIGNER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const TreatmentStatus = {
  DRAFT: 'DRAFT',
  CONFIRMED: 'CONFIRMED',
} as const;
export type TreatmentStatus = (typeof TreatmentStatus)[keyof typeof TreatmentStatus];

export const PaymentMethod = {
  CASH: 'CASH',
  CARD: 'CARD',
  TRANSFER: 'TRANSFER',
  PREPAID: 'PREPAID',
  ETC: 'ETC',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const SttProviderCode = {
  CLOVA: 'CLOVA',
} as const;
export type SttProviderCode = (typeof SttProviderCode)[keyof typeof SttProviderCode];

export const LlmProviderCode = {
  HYPERCLOVA: 'HYPERCLOVA',
} as const;
export type LlmProviderCode = (typeof LlmProviderCode)[keyof typeof LlmProviderCode];

/** API 공통 응답 형태 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface HealthStatus {
  status: 'ok' | 'error';
  db: 'up' | 'down';
  storage: 'up' | 'down';
  time: string;
}
