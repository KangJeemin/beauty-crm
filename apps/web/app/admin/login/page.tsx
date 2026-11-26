'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Field, PasswordField } from '../../../components/ui';
import { adminLogin, getAdminSession } from '../../../lib/admin-api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getAdminSession()) router.replace('/admin');
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminLogin(loginId.trim(), password);
      router.replace('/admin');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-bg">
      <form className="auth-card" onSubmit={submit}>
        <p className="auth-brand">미용 고객 관리 · 운영</p>
        <h1>운영자 로그인</h1>
        <p className="muted">서비스 운영자 전용 화면입니다. 매장 계정으로는 들어올 수 없어요.</p>
        {error && <Alert>{error}</Alert>}
        <Field label="운영자 아이디" value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" required />
        <PasswordField label="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        <Button type="submit" className="btn-block" loading={busy}>
          로그인
        </Button>
      </form>
    </div>
  );
}
