'use client';

import { AuthRules, type InvitePreview, type SignupResult } from '@beauty-crm/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { Alert, Button, Field, PasswordField } from '../../../components/ui';

const LOGIN_ID = new RegExp(AuthRules.loginIdPattern);
const PASSWORD = new RegExp(AuthRules.passwordPattern);

function JoinForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { applySignup } = useAuth();
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase());
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [f, setF] = useState({ name: '', phone: '', loginId: '', password: '' });
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 코드 8자리가 입력되면 어느 매장 초대인지 미리 보여준다
  useEffect(() => {
    setPreview(null);
    setCodeErr(null);
    const c = code.trim();
    if (c.length < 6) return;
    const t = setTimeout(() => {
      api<InvitePreview>(`/auth/invites/${encodeURIComponent(c)}`, { auth: false })
        .then(setPreview)
        .catch((e) => setCodeErr(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [code]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const errs = {
    name: !f.name.trim() ? '이름을 입력해 주세요.' : null,
    loginId: !LOGIN_ID.test(f.loginId.trim()) ? AuthRules.loginIdMessage : null,
    password: !PASSWORD.test(f.password) ? AuthRules.passwordMessage : null,
  };
  const show = (k: keyof typeof errs) => (touched ? errs[k] : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!preview || Object.values(errs).some(Boolean)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<SignupResult>('/auth/join', {
        method: 'POST',
        auth: false,
        body: { inviteCode: code.trim(), name: f.name, phone: f.phone || undefined, loginId: f.loginId, password: f.password },
      });
      router.replace(applySignup(r) ? '/home' : '/pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : '가입에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1>직원 가입</h1>
      <p className="lead">원장님께 받은 초대 코드를 입력해 주세요.</p>
      {error && <Alert>{error}</Alert>}
      <Field
        label="초대 코드"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
        error={codeErr}
        maxLength={32}
        autoCapitalize="characters"
        placeholder="예) K7MPQ2XA"
        className="code-input"
      />
      {preview && (
        <Alert kind="ok">
          <b>{preview.shopName}</b> 매장의 디자이너로 가입합니다.
        </Alert>
      )}
      <fieldset disabled={!preview} className="plain">
        <Field label="이름" value={f.name} onChange={set('name')} error={show('name')} autoComplete="name" />
        <Field label="휴대폰 번호 (선택)" value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" />
        <Field label="아이디" value={f.loginId} onChange={set('loginId')} error={show('loginId')} hint={AuthRules.loginIdHint} autoCapitalize="none" autoComplete="username" />
        <PasswordField label="비밀번호" value={f.password} onChange={set('password')} error={show('password')} hint={AuthRules.passwordHint} autoComplete="new-password" />
        <Button type="submit" loading={busy} className="btn-block">
          가입하기
        </Button>
      </fieldset>
      <div className="auth-links">
        <Link href="/login">로그인으로 돌아가기</Link>
      </div>
    </form>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinForm />
    </Suspense>
  );
}
