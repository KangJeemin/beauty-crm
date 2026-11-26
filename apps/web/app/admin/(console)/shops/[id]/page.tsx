'use client';

import type { AdminShopDetail } from '@beauty-crm/shared';
import { FEEDBACK_CATEGORY_LABEL, FEEDBACK_STATUS_LABEL } from '@beauty-crm/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Section } from '../../../../../components/ui';
import { AuditList, StatusBadge, ago, dt, int, krw } from '../../../../../components/admin/common';
import { adminApi } from '../../../../../lib/admin-api';

export default function AdminShopDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<AdminShopDetail | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'info'; text: React.ReactNode } | null>(null);
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState('');

  const load = useCallback(async () => {
    const r = await adminApi<AdminShopDetail>(`/admin/shops/${id}`);
    setD(r);
    setQuota(String(r.shop.storageQuotaMb));
  }, [id]);
  useEffect(() => {
    load().catch((e) => setMsg({ kind: 'error', text: e.message }));
  }, [load]);

  async function run(label: string, fn: () => Promise<unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (r && typeof r === 'object' && 'tempPassword' in r) {
        const t = r as { loginId: string; tempPassword: string };
        setMsg({
          kind: 'info',
          text: (
            <>
              원장님께 알려 주세요 — 아이디 <b>{t.loginId}</b> · 임시 비밀번호 <b className="code">{t.tempPassword}</b>
              <br />
              <span className="small">이 화면을 벗어나면 다시 볼 수 없어요. 로그인 후 비밀번호를 바꾸도록 안내해 주세요.</span>
            </>
          ),
        });
      } else setMsg({ kind: 'ok', text: `${label} 완료` });
      await load();
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <div className="page">{msg ? <Alert kind="error">{msg.text}</Alert> : <p className="muted">불러오는 중…</p>}</div>;
  const s = d.shop;

  return (
    <div className="page page-wide">
      <header className="page-head">
        <p className="muted small">
          <Link href="/admin/shops">← 매장 목록</Link>
        </p>
        <h1>
          {s.name} <StatusBadge status={s.status} />
          {s.isFounder ? <span className="badge">창립 테스터</span> : null}
        </h1>
        <p className="muted">
          #{s.id} · 가입 {dt(s.createdAt)} · 승인 {dt(s.approvedAt)} · 마지막 사용 {ago(s.lastActivityAt)}
        </p>
      </header>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <div className="admin-grid">
        <div className="stack">
          <Section title="매장 정보">
            <dl className="info-list">
              <div><dt>원장</dt><dd>{s.ownerName} ({s.ownerLoginId ?? '—'})</dd></div>
              <div><dt>연락처</dt><dd>{s.phone ?? '—'}</dd></div>
              <div><dt>주소</dt><dd>{s.address ?? '—'}</dd></div>
              <div><dt>사업자번호</dt><dd>{s.bizNo ?? '—'}</dd></div>
              <div><dt>요금제</dt><dd>{s.planType}</dd></div>
              <div><dt>약관 동의</dt><dd>{dt(s.termsAgreedAt)}</dd></div>
              <div><dt>사진 용량</dt><dd>{(s.storageUsedBytes / 1048576).toFixed(1)}MB / {int(s.storageQuotaMb)}MB</dd></div>
              <div><dt>이용 현황</dt><dd>고객 {int(s.customerCount)} · 시술 {int(s.treatmentCount)} (7일 {s.treatments7d}) · 이번 달 AI {krw(s.aiCostMonth)}</dd></div>
            </dl>
          </Section>

          <Section title="관리">
            <div className="action-grid">
              {s.status !== 'ACTIVE' && (
                <Button loading={busy} onClick={() => run('승인', () => adminApi(`/admin/shops/${s.id}/approve`, { method: 'POST', body: {} }))}>
                  {s.status === 'PENDING' ? '승인' : '다시 사용하게 하기'}
                </Button>
              )}
              {s.status === 'ACTIVE' && (
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() =>
                    run('이용 정지', () => adminApi(`/admin/shops/${s.id}/suspend`, { method: 'POST' }), `${s.name} 매장을 정지할까요?\n모든 직원이 바로 로그아웃되고 로그인할 수 없어요.`)
                  }
                >
                  이용 정지
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => run(s.isFounder ? '창립 테스터 해제' : '창립 테스터 지정', () => adminApi(`/admin/shops/${s.id}`, { method: 'PATCH', body: { isFounder: !s.isFounder } }))}
              >
                {s.isFounder ? '창립 테스터 해제' : '창립 테스터로 지정'}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  run('비밀번호 초기화', () => adminApi(`/admin/shops/${s.id}/reset-owner-password`, { method: 'POST' }), '원장 비밀번호를 임시 비밀번호로 바꿀까요?\n원장님의 모든 기기에서 로그아웃돼요.')
                }
              >
                원장 비밀번호 초기화
              </Button>
            </div>
            <div className="row-end" style={{ marginTop: '0.8rem' }}>
              <div className="field">
                <label htmlFor="quota">사진 저장 용량 상한 (MB)</label>
                <input id="quota" inputMode="numeric" value={quota} onChange={(e) => setQuota(e.target.value.replace(/\D/g, ''))} />
              </div>
              <Button
                variant="ghost"
                disabled={busy || !quota || Number(quota) === s.storageQuotaMb}
                onClick={() => run('용량 변경', () => adminApi(`/admin/shops/${s.id}`, { method: 'PATCH', body: { storageQuotaMb: Number(quota) } }))}
              >
                저장
              </Button>
            </div>
          </Section>

          <Section title={`직원 ${d.users.length}명`}>
            <ul className="list">
              {d.users.map((u) => (
                <li key={u.id} className="list-row">
                  <span className="list-main">
                    <b>
                      {u.name} <span className="muted small">{u.role === 'OWNER' ? '원장' : '디자이너'}</span>
                      {u.status !== 'ACTIVE' && <span className="badge badge-warn">잠김</span>}
                    </b>
                    <span className="muted small">{u.loginId}</span>
                  </span>
                  <span className="muted small">로그인 {ago(u.lastLoginAt)}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="AI 사용량 (최근 6개월)">
            {d.usage.length === 0 ? (
              <p className="muted">아직 사용 기록이 없어요.</p>
            ) : (
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>월</th>
                    <th className="num">호출</th>
                    <th className="num">실패</th>
                    <th className="num">음성(분)</th>
                    <th className="num">비용</th>
                  </tr>
                </thead>
                <tbody>
                  {d.usage.map((u) => (
                    <tr key={u.month}>
                      <td data-label="월">{u.month}</td>
                      <td data-label="호출" className="num">{int(u.calls)}</td>
                      <td data-label="실패" className="num">{u.failures}</td>
                      <td data-label="음성(분)" className="num">{(u.sttSeconds / 60).toFixed(1)}</td>
                      <td data-label="비용" className="num">{krw(u.costKrw)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>

        <div className="stack">
          <Section title="의견" action={<Link href="/admin/feedback" className="btn btn-ghost btn-sm">전체 →</Link>}>
            {d.feedback.length === 0 ? (
              <p className="muted">보낸 의견이 없어요.</p>
            ) : (
              <ul className="list">
                {d.feedback.map((f) => (
                  <li key={f.id} className="fb-item">
                    <div className="fb-head">
                      <b>{FEEDBACK_CATEGORY_LABEL[f.category]}</b>
                      <span className={`badge ${f.status === 'DONE' ? '' : 'badge-warn'}`}>{FEEDBACK_STATUS_LABEL[f.status]}</span>
                      <span className="muted small">
                        {f.userName} · {ago(f.createdAt)}
                      </span>
                    </div>
                    <p className="fb-content">{f.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="최근 변경 이력" action={<Link href={`/admin/audit?shopId=${s.id}`} className="btn btn-ghost btn-sm">전체 →</Link>}>
            <AuditList items={d.audit} showShop={false} />
          </Section>
        </div>
      </div>
    </div>
  );
}
