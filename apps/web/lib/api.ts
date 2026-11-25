import type { ApiErrorBody, ErrorCode, LoginResult } from '@beauty-crm/shared';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

/** API 에러 — code 로 화면 분기 (SHOP_PENDING 등) */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK',
    message: string,
    readonly details?: string[],
  ) {
    super(message);
  }
}

// Access Token 은 메모리에만 둔다 (localStorage 저장 X → XSS 로 탈취되기 어려움)
// 새로고침하면 사라지므로 httpOnly 쿠키의 Refresh Token 으로 다시 받는다.
let accessToken: string | null = null;
let refreshing: Promise<LoginResult | null> | null = null;
const listeners = new Set<(r: LoginResult | null) => void>();

export function onSessionChange(fn: (r: LoginResult | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setSession(r: LoginResult | null) {
  accessToken = r?.accessToken ?? null;
  listeners.forEach((fn) => fn(r));
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(API + path, { ...init, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'NETWORK', '서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.');
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const e = body as ApiErrorBody | null;
    throw new ApiError(res.status, e?.code ?? 'INTERNAL', e?.message ?? '잠시 후 다시 시도해 주세요.', e?.details);
  }
  return body.data as T;
}

/**
 * 로그인 유지 토큰으로 Access Token 재발급.
 * 동시에 여러 번 불려도 실제 요청은 한 번만 (React StrictMode·여러 API 동시 401 대비)
 */
export function refreshSession(): Promise<LoginResult | null> {
  if (!refreshing) {
    refreshing = send('/auth/refresh', { method: 'POST' })
      .then((res) => parse<LoginResult>(res))
      .then((r) => {
        setSession(r);
        return r;
      })
      .catch((e) => {
        if (e instanceof ApiError && e.code === 'NETWORK') throw e;
        setSession(null);
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** false 면 토큰을 붙이지 않음 (로그인·가입) */
  auth?: boolean;
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const run = () => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return send(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  };

  let res = await run();
  // Access Token 만료 → 한 번만 갱신 후 재시도
  if (res.status === 401 && auth) {
    const r = await refreshSession();
    if (r) res = await run();
  }
  return parse<T>(res);
}
