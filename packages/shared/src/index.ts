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

// ── 인증 ────────────────────────────────────────────────

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  LOCKED: 'LOCKED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/** API 에러 코드 — 화면에서 분기할 때 사용 */
export const ErrorCode = {
  VALIDATION: 'VALIDATION',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE: 'DUPLICATE',
  LOGIN_ID_TAKEN: 'LOGIN_ID_TAKEN',
  SHOP_PENDING: 'SHOP_PENDING',
  SHOP_SUSPENDED: 'SHOP_SUSPENDED',
  USER_LOCKED: 'USER_LOCKED',
  INVITE_INVALID: 'INVITE_INVALID',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  success: false;
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: string[];
}

export interface AuthUser {
  id: number;
  shopId: number;
  shopName: string;
  loginId: string;
  name: string;
  role: UserRole;
  fontScale: number;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: number; // 초
  user: AuthUser;
}

export interface SignupResult {
  shopStatus: ShopStatus;
  /** 자동 승인(SHOP_AUTO_APPROVE=true)일 때만 바로 로그인 정보가 온다 */
  login?: LoginResult;
}

export interface InvitePreview {
  shopName: string;
  role: UserRole;
  expiresAt: string;
}

export interface StaffItem {
  id: number;
  loginId: string;
  name: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface InviteItem {
  id: number;
  inviteCode: string;
  role: UserRole;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface ShopInfo {
  id: number;
  name: string;
  ownerName: string;
  phone: string | null;
  address: string | null;
  status: ShopStatus;
  planType: PlanType;
  businessHours: Record<string, [string, string] | null> | null;
}

/** 아이디·비밀번호 규칙 (프론트·백엔드 공통) */
export const AuthRules = {
  loginIdPattern: '^[a-zA-Z0-9._@-]{4,50}$',
  loginIdHint: '영문·숫자·@ . _ - 로 4~50자 (휴대폰 번호나 이메일도 가능)',
  passwordMin: 8,
  passwordPattern: '^(?=.*[A-Za-z])(?=.*\\d).{8,72}$',
  passwordHint: '영문과 숫자를 섞어 8자 이상',
  loginIdMessage: '아이디는 영문·숫자·@ . _ - 를 사용해 4~50자로 입력해 주세요.',
  passwordMessage: '비밀번호는 영문과 숫자를 섞어 8자 이상으로 입력해 주세요.',
} as const;

// ── 2단계: 고객 · 태그 · 시술 메뉴 ──────────────────────

export type Gender = 'F' | 'M';

export interface TagItem {
  id: number;
  name: string;
  color: string | null;
  customerCount?: number;
}

/** 태그 색상 (화면에서 고르는 8가지) */
export const TAG_COLORS = ['#b3261e', '#c75b12', '#a17f00', '#2e7d32', '#00796b', '#1565c0', '#6a1b9a', '#5d4037'] as const;

export interface CustomerListItem {
  id: number;
  name: string;
  /** 010-****-5678 */
  phoneMasked: string | null;
  phoneLast4: string | null;
  gender: Gender | null;
  lastVisitAt: string | null;
  visitCount: number;
  tags: TagItem[];
}

export interface CustomerDetail extends CustomerListItem {
  /** 010-1234-5678 (복호화) */
  phone: string | null;
  birthYear: number | null;
  memo: string | null;
  firstVisitAt: string | null;
  totalPaidAmount: number;
  consentAt: string | null;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export type CustomerSort = 'recent' | 'name' | 'created';

export interface CustomerInput {
  name: string;
  phone?: string | null;
  gender?: Gender | null;
  birthYear?: number | null;
  memo?: string | null;
  consent?: boolean;
  tagIds?: number[];
}

export interface ServiceMenuItem {
  id: number;
  categoryId: number;
  name: string;
  basePrice: number;
  durationMin: number | null;
  /** 음성 인식용 별칭, 쉼표 구분 (예: "뿌염,뿌리 염색") */
  aliases: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface ServiceCategoryItem {
  id: number;
  name: string;
  sortOrder: number;
  menus: ServiceMenuItem[];
}

/** 전화번호 표시 형식 (숫자만 받아 010-1234-5678) */
export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return '';
  const d = digits.replace(/\D/g, '');
  if (d.startsWith('02')) {
    if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    if (d.length === 10) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  }
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return d;
}

/** 금액 표시 (35000 → "35,000원") */
export const formatWon = (n: number) => `${n.toLocaleString('ko-KR')}원`;
