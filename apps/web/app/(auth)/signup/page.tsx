'use client';

import { AuthRules, type SignupResult } from '@beauty-crm/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { Alert, Button, Field, PasswordField } from '../../../components/ui';

const LOGIN_ID = new RegExp(AuthRules.loginIdPattern);
const PASSWORD = new RegExp(AuthRules.passwordPattern);

export default function SignupPage() {
  const { applySignup } = useAuth();
  const router = useRouter();
  const [f, setF] = useState({ shopName: '', ownerName: '', phone: '', loginId: '', password: '', password2: '' });
  const [agree, setAgree] = useState({ terms: false, privacy: false });
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  // 입력 중 실시간 안내 (제출을 한 번 시도한 뒤부터 빨간 글씨)
  const errs = {
    shopName: !f.shopName.trim() ? '매장 이름을 입력해 주세요.' : null,
    ownerName: !f.ownerName.trim() ? '성함을 입력해 주세요.' : null,
    loginId: !LOGIN_ID.test(f.loginId.trim()) ? AuthRules.loginIdMessage : null,
    password: !PASSWORD.test(f.password) ? AuthRules.passwordMessage : null,
    password2: f.password !== f.password2 ? '비밀번호가 서로 다릅니다.' : null,
    agree: !(agree.terms && agree.privacy) ? '약관에 모두 동의해 주세요.' : null,
  };
  const valid = Object.values(errs).every((v) => !v);
  const show = (k: keyof typeof errs) => (touched ? errs[k] : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setError(null);
    setBusy(true);
    try {
      const r = await api<SignupResult>('/auth/signup', {
        method: 'POST',
        auth: false,
        body: {
          shopName: f.shopName,
          ownerName: f.ownerName,
          phone: f.phone || undefined,
          loginId: f.loginId,
          password: f.password,
          agreeTerms: agree.terms,
          agreePrivacy: agree.privacy,
        },
      });
      router.replace(applySignup(r) ? '/home' : '/pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : '가입에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const all = agree.terms && agree.privacy;

  return (
    <form onSubmit={submit} noValidate>
      <h1>매장 가입</h1>
      <p className="lead">가입하면 원장님 계정이 만들어지고, 직원은 나중에 초대할 수 있습니다.</p>
      {error && <Alert>{error}</Alert>}

      <Field label="매장 이름" value={f.shopName} onChange={set('shopName')} error={show('shopName')} placeholder="예) 행복헤어" />
      <Field label="원장님 성함" value={f.ownerName} onChange={set('ownerName')} error={show('ownerName')} autoComplete="name" />
      <Field label="휴대폰 번호 (선택)" value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" />
      <Field
        label="아이디"
        value={f.loginId}
        onChange={set('loginId')}
        error={show('loginId')}
        hint={AuthRules.loginIdHint}
        autoCapitalize="none"
        autoComplete="username"
      />
      <PasswordField label="비밀번호" value={f.password} onChange={set('password')} error={show('password')} hint={AuthRules.passwordHint} autoComplete="new-password" />
      <PasswordField label="비밀번호 확인" value={f.password2} onChange={set('password2')} error={show('password2')} autoComplete="new-password" />

      <fieldset className="agree">
        <label className="check check-all">
          <input type="checkbox" checked={all} onChange={(e) => setAgree({ terms: e.target.checked, privacy: e.target.checked })} />
          <span>전체 동의</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={agree.terms} onChange={(e) => setAgree({ ...agree, terms: e.target.checked })} />
          <span>(필수) 이용약관 동의</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={agree.privacy} onChange={(e) => setAgree({ ...agree, privacy: e.target.checked })} />
          <span>(필수) 개인정보 처리방침 동의</span>
        </label>
        {show('agree') && <p className="field-err">{errs.agree}</p>}
        <p className="field-hint">약관 전문은 정식 오픈 전에 연결됩니다.</p>
      </fieldset>

      <Button type="submit" loading={busy} className="btn-block">
        가입 신청
      </Button>
      <div className="auth-links">
        <Link href="/login">이미 계정이 있어요 — 로그인</Link>
      </div>
    </form>
  );
}
