'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../lib/auth';

/** 첫 화면: 로그인 상태에 따라 홈 또는 로그인으로 */
export default function Index() {
  const { status } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === 'authed') router.replace('/home');
    if (status === 'guest') router.replace('/login');
  }, [status, router]);
  return <div className="splash">불러오는 중…</div>;
}
