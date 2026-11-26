'use client';

import type { AdminDashboard, AdminShopRow } from '@beauty-crm/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Empty, Section } from '../../../components/ui';
import { ago, int, krw } from '../../../components/admin/common';
import { adminApi } from '../../../lib/admin-api';

export default function AdminHome() {
  const [d, setD] = useState<AdminDashboard | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => adminApi<AdminDashboard>('/admin/dashboard').then(setD), []);
  useEffect(() => {
    load().catch((e) => setMsg({ kind: 'error', text: e.message }));
  }, [load]);

  async function approve(s: AdminShopRow, founder: boolean) {
    setBusy(s.id);
    setMsg(null);
    try {
      await adminApi(`/admin/shops/${s.id}/approve`, { method: 'POST', body: { founder } });
      setMsg({ kind: 'ok', text: `${s.name} 승인했어요${founder ? ' (창립 테스터)' : ''}.` });
      await load();
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>현황</h1>
      </header>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {!d ? (
        <p className="muted">불러오는 중…</p>
      ) : (
        <div className="stack">
          <div className="stat-grid">
            <Link href="/admin/shops?status=ACTIVE" className="stat">
              <span>사용 중 매장</span>
              <b>{d.shopCounts.ACTIVE}</b>
              <small>전체 {d.shopCounts.total} · 정지 {d.shopCounts.SUSPENDED}</small>
            </Link>
            <div className="stat">
              <span>최근 7일 쓴 매장</span>
              <b>{d.activeShops7d}</b>
              <small>시술 기록 {int(d.treatments7d)}건</small>
            </div>
            <div className={`stat ${d.voiceFailed7d ? 'warn' : ''}`}>
              <span>최근 7일 녹음</span>
              <b>{int(d.voice7d)}</b>
              <small>실패 {d.voiceFailed7d}건</small>
            </div>
            <Link href="/admin/ai-usage" className="stat">
              <span>이번 달 AI 비용(추정)</span>
              <b>{krw(d.aiMonth.costKrw)}</b>
              <small>
                호출 {int(d.aiMonth.calls)} · 실패 {d.aiMonth.failures}
              </small>
            </Link>
            <Link href="/admin/feedback" className={`stat ${d.openFeedback ? 'warn' : ''}`}>
              <span>답변 안 한 의견</span>
              <b>{d.openFeedback}</b>
              <small>의견 보러 가기 →</small>
            </Link>
          </div>

          <Section title={`승인 대기 매장 ${d.shopCounts.PENDING}곳`} desc="가입 신청한 매장이에요. 지인 매장(창립 테스터)은 평생 무료로 표시돼요.">
            {d.pendingShops.length === 0 ? (
              <Empty title="기다리는 매장이 없어요" />
            ) : (
              <ul className="list">
                {d.pendingShops.map((s) => (
                  <li key={s.id} className="list-row">
                    <span className="list-main">
                      <Link href={`/admin/shops/${s.id}`}>
                        <b>{s.name}</b>
                      </Link>
                      <span className="muted small">
                        {s.ownerName} · {s.ownerLoginId} · {s.phone ?? '연락처 없음'} · 신청 {ago(s.createdAt)}
                      </span>
                    </span>
                    <span className="row-actions">
                      <Button className="btn-sm" loading={busy === s.id} onClick={() => approve(s, true)}>
                        창립 테스터로 승인
                      </Button>
                      <Button variant="ghost" className="btn-sm" disabled={busy === s.id} onClick={() => approve(s, false)}>
                        일반 승인
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
