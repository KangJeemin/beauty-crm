import { AsyncLocalStorage } from 'async_hooks';

/** 요청 하나 동안 서비스가 변경 이력에 보탤 정보 (변경 전 값 등) */
export interface AuditStore {
  before?: unknown;
  after?: unknown;
  shopId?: number | null;
  targetId?: number | null;
  skip?: boolean;
  /** 토큰 없이 들어온 요청(운영자 로그인 등)의 행위자 */
  actor?: { type: 'SHOP' | 'ADMIN'; id: number };
}

export const auditStorage = new AsyncLocalStorage<AuditStore>();

/** 수정·삭제 전 값을 남긴다. 요청 밖(CLI·큐)에서 불리면 아무 일도 안 함 */
export function auditBefore(before: unknown): void {
  const s = auditStorage.getStore();
  if (s) s.before = before;
}

/** 응답 대신 남길 "변경 후" 값 / 대상 매장·ID 지정 */
export function auditMeta(meta: Omit<AuditStore, 'before' | 'skip'>): void {
  const s = auditStorage.getStore();
  if (s) Object.assign(s, meta);
}
