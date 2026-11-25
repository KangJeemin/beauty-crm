'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppShell } from '../../components/AppShell';
import { useAuth } from '../../lib/auth';

/** 로그인해야 들어올 수 있는 영역 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === 'guest') router.replace('/login');
  }, [status, router]);

  if (status !== 'authed') return <div className="splash">불러오는 중…</div>;
  return <AppShell>{children}</AppShell>;
}
