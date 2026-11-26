import type { AdminLoginResult, ApiErrorBody } from '@beauty-crm/shared';
import { ApiError } from './api';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';
const KEY = 'bc_admin';

/**
 * 운영자 세션 — 운영자는 1~2명이고 Refresh Token 이 없으므로 탭 세션(sessionStorage)에 둔다.
 * 탭을 닫으면 로그아웃, 토큰 유효시간은 12시간.
 */
export interface AdminSession {
  token: string;
  name: string;
  exp: number;
}

export function getAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as AdminSession | null;
    if (!s || s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearAdminSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}

export async function adminLogin(loginId: string, password: string): Promise<AdminSession> {
  const r = await adminApi<AdminLoginResult>('/admin/auth/login', { method: 'POST', body: { loginId, password }, auth: false });
  const s = { token: r.accessToken, name: r.name, exp: Date.now() + r.expiresIn * 1000 };
  sessionStorage.setItem(KEY, JSON.stringify(s));
  return s;
}

export async function adminApi<T>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const s = auth ? getAdminSession() : null;
  if (s) headers.Authorization = `Bearer ${s.token}`;
  let res: Response;
  try {
    res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'NETWORK', '서버에 연결할 수 없습니다.');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const e = json as ApiErrorBody | null;
    if (res.status === 401 && auth) {
      clearAdminSession();
      if (typeof window !== 'undefined') window.location.href = '/admin/login';
    }
    throw new ApiError(res.status, e?.code ?? 'INTERNAL', e?.message ?? '잠시 후 다시 시도해 주세요.');
  }
  return json.data as T;
}
