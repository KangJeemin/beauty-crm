'use client';

import type { AdminShopRow, ShopStatus } from '@beauty-crm/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Alert, Empty } from '../../../../components/ui';
import { SHOP_STATUS_LABEL, StatusBadge, ago, int, krw } from '../../../../components/admin/common';
import { adminApi } from '../../../../lib/admin-api';

const FILTERS: (ShopStatus | '')[] = ['', 'PENDING', 'ACTIVE', 'SUSPENDED'];

function ShopsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const status = (params.get('status') ?? '') as ShopStatus | '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [rows, setRows] = useState<AdminShopRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const sp = new URLSearchParams();
      if (status) sp.set('status', status);
      if (q.trim()) sp.set('q', q.trim());
      adminApi<AdminShopRow[]>(`/admin/shops?${sp}`).then(setRows).catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [status, q]);

  const setStatus = (s: string) => {
    const sp = new URLSearchParams(params.toString());
    if (s) sp.set('status', s);
    else sp.delete('status');
    router.replace(`/admin/shops?${sp}`);
  };

  return (
    <div className="page page-wide">
      <header className="page-head">
        <h1>매장</h1>
      </header>
      <div className="toolbar">
        <input className="search" type="search" placeholder="매장명 · 원장 · 연락처 · 로그인 아이디" value={q} onChange={(e) => setQ(e.target.value)} aria-label="매장 검색" />
        <div className="chips-wrap" role="tablist">
          {FILTERS.map((f) => (
            <button key={f || 'all'} type="button" className={`chip ${status === f ? 'on' : ''}`} onClick={() => setStatus(f)}>
              {f ? SHOP_STATUS_LABEL[f] : '전체'}
            </button>
          ))}
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      {!rows ? (
        <p className="muted">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <section className="card">
          <Empty title="매장이 없어요" />
        </section>
      ) : (
        <section className="card table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>매장</th>
                <th>상태</th>
                <th className="num">직원</th>
                <th className="num">고객</th>
                <th className="num">시술(7일)</th>
                <th className="num">이번 달 AI</th>
                <th>마지막 사용</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} onClick={() => router.push(`/admin/shops/${s.id}`)}>
                  <td data-label="매장">
                    <Link href={`/admin/shops/${s.id}`} onClick={(e) => e.stopPropagation()}>
                      <b>{s.name}</b>
                    </Link>
                    {s.isFounder ? <span className="badge">창립</span> : null}
                    <div className="muted small">
                      {s.ownerName} · {s.ownerLoginId ?? '—'}
                    </div>
                  </td>
                  <td data-label="상태">
                    <StatusBadge status={s.status} />
                  </td>
                  <td data-label="직원" className="num">{s.userCount}</td>
                  <td data-label="고객" className="num">{int(s.customerCount)}</td>
                  <td data-label="시술(7일)" className="num">
                    {int(s.treatmentCount)} ({s.treatments7d})
                  </td>
                  <td data-label="이번 달 AI" className="num">{krw(s.aiCostMonth)}</td>
                  <td data-label="마지막 사용">{ago(s.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

export default function AdminShopsPage() {
  return (
    <Suspense>
      <ShopsInner />
    </Suspense>
  );
}
