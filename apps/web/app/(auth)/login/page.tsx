'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { Alert, Button, Field, PasswordField } from '../../../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(loginId.trim(), password);
      router.replace('/home');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SHOP_PENDING') return router.push('/pending');
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1>로그인</h1>
      {error && <Alert>{error}</Alert>}
      <Field label="아이디" value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" autoCapitalize="none" inputMode="email" required />
      <PasswordField label="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      <Button type="submit" loading={busy} disabled={!loginId || !password} className="btn-block">
        로그인
      </Button>
      <p className="auth-foot">로그인 상태가 30일 동안 유지됩니다.</p>
      <div className="auth-links">
        <Link href="/signup">처음이신가요? 매장 가입하기</Link>
        <Link href="/join">직원 초대 코드로 가입</Link>
      </div>
      <p className="auth-foot muted">비밀번호를 잊으셨다면 원장님(직원) 또는 고객센터에 초기화를 요청해 주세요.</p>
    </form>
  );
}
