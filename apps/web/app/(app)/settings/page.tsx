'use client';

import { AuthRules, type InviteItem, type ShopInfo, type StaffItem } from '@beauty-crm/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Field, PasswordField, Section } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

const FONT_SIZES = [
  { v: 90, label: '작게' },
  { v: 100, label: '보통' },
  { v: 115, label: '크게' },
  { v: 130, label: '아주 크게' },
];

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '없음';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ── 내 정보 · 글자 크기 ──────────────────────────────

function MySettings() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function save(patch: { name?: string; fontScale?: number }) {
    setMsg(null);
    try {
      await api('/me/settings', { method: 'PATCH', body: patch });
      updateUser(patch);
      if (patch.name) setMsg({ kind: 'ok', text: '저장했습니다.' });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    }
  }

  return (
    <Section title="내 정보">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="row-end">
        <Field label="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="ghost" onClick={() => save({ name: name.trim() })} disabled={!name.trim() || name === user?.name}>
          이름 저장
        </Button>
      </div>
      <p className="label">글자 크기</p>
      <div className="seg" role="radiogroup" aria-label="글자 크기">
        {FONT_SIZES.map((s) => (
          <button
            key={s.v}
            type="button"
            role="radio"
            aria-checked={user?.fontScale === s.v}
            className={user?.fontScale === s.v ? 'on' : ''}
            onClick={() => save({ fontScale: s.v })}
            style={{ fontSize: `${s.v / 100}rem` }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </Section>
  );
}

// ── 비밀번호 변경 ─────────────────────────────────────

function ChangePassword() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = new RegExp(AuthRules.passwordPattern).test(next);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/auth/password', { method: 'POST', body: { currentPassword: cur, newPassword: next } });
      setCur('');
      setNext('');
      setMsg({ kind: 'ok', text: '비밀번호를 바꿨습니다. 다른 기기에서는 다시 로그인해야 합니다.' });
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="비밀번호 변경">
      <form onSubmit={submit}>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <PasswordField label="현재 비밀번호" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
        <PasswordField
          label="새 비밀번호"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          hint={AuthRules.passwordHint}
          error={next && !valid ? AuthRules.passwordMessage : null}
          autoComplete="new-password"
        />
        <Button type="submit" variant="ghost" loading={busy} disabled={!cur || !valid}>
          비밀번호 바꾸기
        </Button>
      </form>
    </Section>
  );
}

// ── 매장 정보 ─────────────────────────────────────────

function ShopSettings({ isOwner }: { isOwner: boolean }) {
  const { updateUser } = useAuth();
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [f, setF] = useState({ name: '', phone: '', address: '' });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api<ShopInfo>('/shop').then((s) => {
      setShop(s);
      setF({ name: s.name, phone: s.phone ?? '', address: s.address ?? '' });
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const s = await api<ShopInfo>('/shop', { method: 'PATCH', body: { name: f.name, phone: f.phone, address: f.address } });
      setShop(s);
      updateUser({ shopName: s.name });
      setMsg({ kind: 'ok', text: '매장 정보를 저장했습니다.' });
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message });
    }
  }

  if (!shop) return <Section title="매장 정보"><p className="muted">불러오는 중…</p></Section>;
  return (
    <Section title="매장 정보" desc={isOwner ? undefined : '매장 정보는 원장님만 바꿀 수 있습니다.'}>
      <form onSubmit={save}>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <fieldset disabled={!isOwner} className="plain">
          <Field label="매장 이름" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Field label="매장 전화번호" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" />
          <Field label="주소" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          {isOwner && (
            <Button type="submit" variant="ghost" disabled={!f.name.trim()}>
              매장 정보 저장
            </Button>
          )}
        </fieldset>
      </form>
    </Section>
  );
}

// ── 직원 관리 · 초대 ─────────────────────────────────

function StaffSettings({ isOwner, myId }: { isOwner: boolean; myId: number }) {
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error' | 'info'; text: React.ReactNode } | null>(null);

  const load = useCallback(async () => {
    setStaff(await api<StaffItem[]>('/staff'));
    if (isOwner) setInvites(await api<InviteItem[]>('/invites'));
  }, [isOwner]);

  useEffect(() => {
    load().catch((e) => setNotice({ kind: 'error', text: e.message }));
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: React.ReactNode) => {
    setNotice(null);
    try {
      await fn();
      if (ok) setNotice({ kind: 'ok', text: ok });
      await load();
    } catch (e) {
      setNotice({ kind: 'error', text: (e as Error).message });
    }
  };

  const joinLink = (code: string) => `${window.location.origin}/join?code=${code}`;

  async function createInvite() {
    await run(async () => {
      const inv = await api<InviteItem>('/invites', { method: 'POST' });
      const copied = await copy(`[미용 고객 관리] 직원 초대 코드: ${inv.inviteCode}\n${joinLink(inv.inviteCode)}`);
      setNotice({
        kind: 'ok',
        text: (
          <>
            초대 코드 <b className="code">{inv.inviteCode}</b> 를 만들었습니다 (7일간 1회 사용).
            {copied ? ' 링크를 복사했으니 직원에게 문자로 보내 주세요.' : ' 직원에게 이 코드를 알려 주세요.'}
          </>
        ),
      });
    });
  }

  async function resetPw(s: StaffItem) {
    if (!window.confirm(`${s.name}님의 비밀번호를 임시 비밀번호로 바꿀까요?`)) return;
    setNotice(null);
    try {
      const { tempPassword } = await api<{ tempPassword: string }>(`/staff/${s.id}/reset-password`, { method: 'POST' });
      setNotice({
        kind: 'info',
        text: (
          <>
            {s.name}님의 임시 비밀번호: <b className="code">{tempPassword}</b>
            <br />
            로그인 후 설정에서 비밀번호를 바꾸도록 안내해 주세요. 이 화면을 벗어나면 다시 볼 수 없습니다.
          </>
        ),
      });
    } catch (e) {
      setNotice({ kind: 'error', text: (e as Error).message });
    }
  }

  return (
    <Section
      title="직원"
      desc={isOwner ? '직원을 초대하면 각자 아이디로 로그인해서 시술을 기록할 수 있습니다.' : undefined}
      action={
        isOwner ? (
          <Button onClick={createInvite} className="btn-sm">
            + 직원 초대
          </Button>
        ) : undefined
      }
    >
      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

      <ul className="list">
        {staff.map((s) => (
          <li key={s.id} className="list-row">
            <div className="list-main">
              <b>
                {s.name} {s.id === myId && <span className="badge">나</span>}
              </b>
              <span className="muted">
                {s.role === 'OWNER' ? '원장' : '디자이너'} · {s.loginId}
                {s.status === 'LOCKED' && <span className="badge badge-warn">잠김</span>}
              </span>
              <span className="muted small">최근 로그인 {fmtDate(s.lastLoginAt)}</span>
            </div>
            {isOwner && s.role !== 'OWNER' && (
              <div className="list-actions">
                <Button variant="ghost" className="btn-sm" onClick={() => resetPw(s)}>
                  비밀번호 초기화
                </Button>
                <Button
                  variant="ghost"
                  className="btn-sm"
                  onClick={() =>
                    run(
                      () => api(`/staff/${s.id}`, { method: 'PATCH', body: { status: s.status === 'LOCKED' ? 'ACTIVE' : 'LOCKED' } }),
                      s.status === 'LOCKED' ? `${s.name}님 계정 잠금을 풀었습니다.` : `${s.name}님 계정을 잠갔습니다.`,
                    )
                  }
                >
                  {s.status === 'LOCKED' ? '잠금 해제' : '잠금'}
                </Button>
                <Button
                  variant="danger"
                  className="btn-sm"
                  onClick={() =>
                    window.confirm(`${s.name}님을 직원 목록에서 삭제할까요?\n이 직원이 남긴 기록은 그대로 남습니다.`) &&
                    run(() => api(`/staff/${s.id}`, { method: 'DELETE' }), `${s.name}님을 삭제했습니다.`)
                  }
                >
                  삭제
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {isOwner && invites.length > 0 && (
        <>
          <p className="label">사용 전 초대 코드</p>
          <ul className="list">
            {invites.map((i) => (
              <li key={i.id} className="list-row">
                <div className="list-main">
                  <b className="code">{i.inviteCode}</b>
                  <span className="muted small">{fmtDate(i.expiresAt)}까지</span>
                </div>
                <div className="list-actions">
                  <Button
                    variant="ghost"
                    className="btn-sm"
                    onClick={async () =>
                      setNotice({ kind: 'ok', text: (await copy(joinLink(i.inviteCode))) ? '가입 링크를 복사했습니다.' : joinLink(i.inviteCode) })
                    }
                  >
                    링크 복사
                  </Button>
                  <Button variant="ghost" className="btn-sm" onClick={() => run(() => api(`/invites/${i.id}`, { method: 'DELETE' }), '초대 코드를 취소했습니다.')}>
                    취소
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;
  const isOwner = user.role === 'OWNER';

  return (
    <div className="page">
      <header className="page-head">
        <h1>설정</h1>
      </header>
      <div className="stack">
        <MySettings />
        <StaffSettings isOwner={isOwner} myId={user.id} />
        <ShopSettings isOwner={isOwner} />
        <ChangePassword />
        <Button
          variant="ghost"
          className="btn-block"
          onClick={async () => {
            await logout();
            router.replace('/login');
          }}
        >
          로그아웃
        </Button>
      </div>
    </div>
  );
}
