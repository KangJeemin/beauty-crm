'use client';

import type { AuthUser, LoginResult, SignupResult } from '@beauty-crm/shared';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, onSessionChange, refreshSession, setSession } from './api';

type Status = 'loading' | 'authed' | 'guest';

interface AuthCtx {
  status: Status;
  user: AuthUser | null;
  login: (loginId: string, password: string) => Promise<void>;
  /** 가입·초대 가입 결과 반영. 승인 대기면 false */
  applySignup: (r: SignupResult) => boolean;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => void;
}

const Ctx = createContext<AuthCtx | null>(null);

/** 글자 크기 설정(80~150%)을 화면 전체에 적용 */
function applyFontScale(scale: number | undefined) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.fontSize = `${(18 * (scale ?? 100)) / 100}px`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const off = onSessionChange((r) => {
      setUser(r?.user ?? null);
      setStatus(r ? 'authed' : 'guest');
      applyFontScale(r?.user.fontScale);
    });
    // 새로고침 시 쿠키로 로그인 복원
    refreshSession().catch(() => setStatus('guest'));
    return () => {
      off();
    };
  }, []);

  const login = useCallback(async (loginId: string, password: string) => {
    const r = await api<LoginResult>('/auth/login', { method: 'POST', body: { loginId, password }, auth: false });
    setSession(r);
  }, []);

  const applySignup = useCallback((r: SignupResult) => {
    if (r.login) {
      setSession(r.login);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', auth: false }).catch(() => undefined);
    setSession(null);
  }, []);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((u) => {
      const next = u ? { ...u, ...patch } : u;
      applyFontScale(next?.fontScale);
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ status, user, login, applySignup, logout, updateUser }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider 밖에서 useAuth 사용');
  return c;
}
