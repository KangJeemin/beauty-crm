'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../../lib/auth';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  // 이미 로그인되어 있으면 홈으로
  useEffect(() => {
    if (status === 'authed') router.replace('/home');
  }, [status, router]);

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <p className="auth-brand">미용 고객 관리</p>
        {children}
      </div>
    </div>
  );
}
