'use client';

import type { DailySettlement, TreatmentListItem } from '@beauty-crm/shared';
import { formatWon } from '@beauty-crm/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { IconMic } from '../../../components/icons';
import { Empty, Section } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { relDay } from '../../../lib/format';

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return '좋은 아침이에요';
  if (h < 17) return '오늘도 힘내세요';
  return '오늘 하루 수고 많으셨어요';
}

export default function HomePage() {
  const { user } = useAuth();
  const [recent, setRecent] = useState<TreatmentListItem[] | null>(null);
  const [pending, setPending] = useState(0);
  const [daily, setDaily] = useState<DailySettlement | null>(null);
  const isOwner = user?.role === 'OWNER';

  useEffect(() => {
    api<TreatmentListItem[]>('/treatments/recent').then(setRecent).catch(() => setRecent([]));
    api<unknown[]>('/voice-records/pending').then((p) => setPending(p.length)).catch(() => undefined);
    if (isOwner) api<DailySettlement>('/settlements/daily').then(setDaily).catch(() => undefined);
  }, [isOwner]);

  const today = recent?.filter((r) => new Date(r.treatedAt).toDateString() === new Date().toDateString()) ?? [];

  return (
    <div className="page">
      <header className="page-head">
        <p className="muted">{user?.shopName}</p>
        <h1>
          {user?.name}님, {greeting()}
        </h1>
      </header>

      <Link href="/records" className="record-hero">
        <span className="record-circle">
          <IconMic />
        </span>
        <span>
          <b>눌러서 시술 기록하기</b>
          <small>말로 하면 자동으로 정리돼요</small>
        </span>
      </Link>

      {pending > 0 && (
        <Link href="/records" className="notice-link">
          검토를 기다리는 기록이 <b>{pending}건</b> 있어요 →
        </Link>
      )}

      <div className="grid-2">
        {isOwner ? (
          <Section title="오늘 들어온 돈" action={<Link href="/settlement" className="btn btn-ghost btn-sm">정산 →</Link>}>
            <p className="big-num">{daily ? formatWon(daily.totals.received) : '—'}</p>
            <p className="muted">
              시술 {today.length}건
              {daily && daily.unpaid.length > 0 ? ` · 결제 기록 없는 시술 ${daily.unpaid.length}건` : ''}
            </p>
          </Section>
        ) : (
          <Section title="오늘 시술">
            <p className="big-num">{today.length}건</p>
            <p className="muted">기록 합계 {formatWon(today.reduce((a, r) => a + r.totalAmount, 0))}</p>
          </Section>
        )}
        <Section title="최근 시술 기록">
          {recent && recent.length === 0 && <Empty title="아직 기록이 없어요" desc="녹음 버튼을 눌러 첫 기록을 남겨 보세요." />}
          <ul className="list">
            {recent?.slice(0, 5).map((r) => (
              <li key={r.id} className="list-row">
                <Link href={`/customers/${r.customerId}`} className="list-main link-row">
                  <b>{r.customerName}</b>
                  <span className="muted small">
                    {r.summary ?? r.itemNames.join(' + ')} · {relDay(r.treatedAt)}
                  </span>
                </Link>
                <span className="menu-price">{formatWon(r.totalAmount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
