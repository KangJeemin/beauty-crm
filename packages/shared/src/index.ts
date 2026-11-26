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

// ── 3단계: 음성 기록 · 시술 기록 ────────────────────────

export type JobStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'SKIPPED';

/** 시술 레시피 1줄 (약제·컬러·비율·방치시간) */
export interface RecipeInput {
  area?: string | null;
  productName?: string | null;
  colorCode?: string | null;
  mixRatio?: string | null;
  developerPct?: number | null;
  amountGram?: number | null;
  processingMin?: number | null;
  rodSize?: string | null;
  heatTemp?: number | null;
  memo?: string | null;
}

export interface TreatmentItemInput {
  serviceMenuId?: number | null;
  menuName: string;
  price: number;
  recipes: RecipeInput[];
}

/** AI 가 정리한 결과 (검토 화면 초기값) */
export interface AiDraft {
  customerName: string | null;
  phoneLast4: string | null;
  items: TreatmentItemInput[];
  totalPrice: number | null;
  note: string | null;
  summary: string | null;
}

export interface CustomerCandidate {
  id: number;
  name: string;
  phoneMasked: string | null;
  lastVisitAt: string | null;
}

export interface VoiceRecordStatus {
  id: number;
  inputType: 'VOICE' | 'TEXT';
  customerId: number | null;
  sttStatus: JobStatus;
  aiStatus: JobStatus;
  transcript: string | null;
  draft: AiDraft | null;
  error: string | null;
  treatmentId: number | null;
  /** AI 가 알아들은 고객 이름·뒷자리로 찾은 후보 */
  candidates: CustomerCandidate[];
  durationSec: number | null;
  createdAt: string;
}

export interface PendingVoiceItem {
  id: number;
  inputType: 'VOICE' | 'TEXT';
  customerName: string | null;
  summary: string | null;
  aiStatus: JobStatus;
  sttStatus: JobStatus;
  createdAt: string;
}

export interface TreatmentSaveInput {
  customerId: number;
  designerId?: number;
  treatedAt?: string;
  voiceRecordId?: number | null;
  copiedFromId?: number | null;
  items: TreatmentItemInput[];
  note?: string | null;
  summary?: string | null;
}

export interface TreatmentRecipe extends RecipeInput {
  id: number;
}

export interface TreatmentItem {
  id: number;
  serviceMenuId: number | null;
  menuName: string;
  price: number;
  recipes: TreatmentRecipe[];
}

export interface TreatmentDetail {
  id: number;
  /** 결제 완료면 요약, 아직이면 null (4단계) */
  payment?: PaymentSummary | null;
  customerId: number;
  customerName: string;
  designerId: number;
  designerName: string;
  treatedAt: string;
  inputType: 'VOICE' | 'TEXT' | 'MANUAL';
  summary: string | null;
  note: string | null;
  totalAmount: number;
  copiedFromId: number | null;
  transcript: string | null;
  items: TreatmentItem[];
  createdAt: string;
}

export interface TreatmentListItem {
  id: number;
  customerId: number;
  customerName: string;
  designerName: string;
  treatedAt: string;
  summary: string | null;
  totalAmount: number;
  itemNames: string[];
  paid?: boolean;
}

/** 레시피 한 줄 요약 (예: "뿌리 · 7N · 6% · 1:1 · 30분") */
export function recipeLine(r: RecipeInput): string {
  return [
    r.area,
    r.productName,
    r.colorCode,
    r.developerPct != null ? `${r.developerPct}%` : null,
    r.mixRatio,
    r.amountGram != null ? `${r.amountGram}g` : null,
    r.processingMin != null ? `${r.processingMin}분` : null,
    r.rodSize ? `로드 ${r.rodSize}` : null,
    r.heatTemp != null ? `${r.heatTemp}℃` : null,
    r.memo,
  ]
    .filter((v) => v !== null && v !== undefined && v !== '')
    .join(' · ');
}

// ── 4단계: 결제 · 선불권 · 정산 ─────────────────────────

export type PaymentType = 'SERVICE' | 'PRODUCT' | 'PASS_SALE' | 'PASS_REFUND';
export type PaymentStatus = 'PAID' | 'CANCELLED';
export type PassStatus = 'ACTIVE' | 'EXHAUSTED' | 'REFUNDED' | 'EXPIRED';
export type PassTxType = 'CHARGE' | 'USE' | 'CANCEL_USE' | 'ADJUST' | 'REFUND';

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CARD: '카드',
  CASH: '현금',
  TRANSFER: '계좌이체',
  PREPAID: '선불권',
  ETC: '기타',
};

export interface PaymentDetailInput {
  method: PaymentMethod;
  amount: number;
  /** method=PREPAID 일 때 차감할 선불권 */
  prepaidPassId?: number | null;
}

export interface PaymentCreateInput {
  /** 시술 결제면 연결 (고객·금액은 시술에서 가져옴) */
  treatmentId?: number | null;
  /** 제품 판매 등 시술 없는 결제 */
  customerId?: number | null;
  paymentType?: 'SERVICE' | 'PRODUCT';
  listAmount: number;
  discountAmount?: number;
  discountReason?: string | null;
  details: PaymentDetailInput[];
  paidAt?: string;
  memo?: string | null;
}

export interface PaymentDetailItem {
  id: number;
  method: PaymentMethod;
  amount: number;
  prepaidPassId: number | null;
  passName: string | null;
}

export interface PaymentItem {
  id: number;
  paymentType: PaymentType;
  status: PaymentStatus;
  customerId: number | null;
  customerName: string | null;
  treatmentId: number | null;
  prepaidPassId: number | null;
  listAmount: number;
  discountAmount: number;
  discountReason: string | null;
  finalAmount: number;
  paidAt: string;
  businessDate: string;
  cancelledAt: string | null;
  memo: string | null;
  createdByName: string;
  /** 시술 결제면 담당 디자이너, 아니면 결제 받은 사람 */
  designerName: string | null;
  summary: string | null;
  details: PaymentDetailItem[];
}

/** 시술 기록에 붙는 결제 요약 */
export interface PaymentSummary {
  id: number;
  finalAmount: number;
  discountAmount: number;
  methods: { method: PaymentMethod; amount: number }[];
  paidAt: string;
}

export interface PrepaidPassInput {
  customerId: number;
  passName: string;
  chargeAmount: number;
  bonusAmount?: number;
  expireAt?: string | null;
  memo?: string | null;
  /** 고객이 선불권 값을 낸 방법 (선불권으로 선불권 결제 불가) */
  details: PaymentDetailInput[];
  paidAt?: string;
}

export interface PrepaidPassItem {
  id: number;
  customerId: number;
  passName: string;
  chargeAmount: number;
  bonusAmount: number;
  balance: number;
  purchasedAt: string;
  expireAt: string | null;
  status: PassStatus;
  memo: string | null;
}

export interface PrepaidTxItem {
  id: number;
  txType: PassTxType;
  amount: number;
  balanceAfter: number;
  paymentId: number | null;
  memo: string | null;
  createdByName: string;
  createdAt: string;
}

export interface PrepaidPassDetail extends PrepaidPassItem {
  customerName: string;
  transactions: PrepaidTxItem[];
}

/** 하루·한 달 합계 공통 */
export interface MoneyTotals {
  /** 실제 들어온 돈 = 현금 + 카드 + 이체 + 기타 (선불권 판매 포함, 환불 차감) */
  received: number;
  cash: number;
  card: number;
  transfer: number;
  etc: number;
  /** 선불권으로 차감한 금액 (들어온 돈 아님) */
  prepaidUsed: number;
  /** 시술·제품 매출 (선불권 차감분 포함, 할인 후) */
  sales: number;
  /** 선불권 판매액 */
  passSales: number;
  /** 선불권 환불액 */
  passRefunds: number;
  discount: number;
  paymentCount: number;
}

export interface DesignerTotal {
  designerId: number | null;
  designerName: string;
  sales: number;
  count: number;
}

/** 마감 시점에 저장해 둔 숫자 */
export interface ClosingSnapshot {
  received: number;
  cash: number;
  card: number;
  transfer: number;
  etc: number;
  prepaidUsed: number;
  paymentCount: number;
}

export interface DailyClosingInfo {
  closedAt: string;
  closedByName: string;
  snapshot: ClosingSnapshot;
  actualCash: number | null;
  actualCard: number | null;
  memo: string | null;
}

export interface UnpaidTreatment {
  id: number;
  customerId: number;
  customerName: string;
  designerName: string;
  treatedAt: string;
  totalAmount: number;
  summary: string | null;
}

export interface DailySettlement {
  date: string;
  totals: MoneyTotals;
  designers: DesignerTotal[];
  payments: PaymentItem[];
  unpaid: UnpaidTreatment[];
  closing: DailyClosingInfo | null;
  /** 마감 이후 결제가 바뀌었는지 */
  changedSinceClosing: boolean;
}

export interface MonthlySettlement {
  month: string;
  totals: MoneyTotals;
  days: { date: string; received: number; sales: number; count: number; closed: boolean }[];
  designers: DesignerTotal[];
  menus: { menuName: string; count: number; amount: number }[];
}

export interface ClosingInput {
  actualCash?: number | null;
  actualCard?: number | null;
  memo?: string | null;
}
