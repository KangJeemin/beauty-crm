'use client';

import type { PrepaidPassItem } from '@beauty-crm/shared';
import { formatWon } from '@beauty-crm/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';

const STATUS: Record<string, string> = { ACTIVE: '', EXHAUSTED: '다 씀', REFUNDED: '환불', EXPIRED: '기간 만료' };

/** 고객 상세 — 선불권(정액권) 잔액 */
export function PassesCard({ customerId, refreshKey }: { customerId: number; refreshKey?: unknown }) {
  const [passes, setPasses] = useState<PrepaidPassItem[] | null>(null);
  const [showOld, setShowOld] = useState(false);

  useEffect(() => {
    api<PrepaidPassItem[]>(`/customers/${customerId}/prepaid-passes`).then(setPasses).catch(() => setPasses([]));
  }, [customerId, refreshKey]);

  const active = passes?.filter((p) => p.status === 'ACTIVE') ?? [];
  const old = passes?.filter((p) => p.status !== 'ACTIVE') ?? [];
  const total = active.reduce((a, p) => a + p.balance, 0);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>선불권</h2>
          {active.length > 0 && <p className="muted">남은 금액 합계 {formatWon(total)}</p>}
        </div>
        <Link href={`/customers/${customerId}/passes/new`} className="btn btn-ghost btn-sm">
          + 선불권 판매
        </Link>
      </div>
      {passes && passes.length === 0 && <p className="muted">선불권이 없어요.</p>}
      <ul className="list">
        {[...active, ...(showOld ? old : [])].map((p) => (
          <li key={p.id}>
            <Link href={`/passes/${p.id}`} className={`pass-row ${p.status !== 'ACTIVE' ? 'inactive' : ''}`}>
              <span className="list-main">
                <b>
                  {p.passName}
                  {STATUS[p.status] && <span className="badge badge-warn">{STATUS[p.status]}</span>}
                </b>
                <span className="muted small">
                  {fmtDate(p.purchasedAt)} 구매{p.expireAt ? ` · ${p.expireAt}까지` : ''}
                </span>
              </span>
              <span className="pass-balance">{formatWon(p.balance)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {old.length > 0 && (
        <button type="button" className="link-btn" onClick={() => setShowOld(!showOld)}>
          {showOld ? '지난 선불권 숨기기' : `지난 선불권 ${old.length}개 보기`}
        </button>
      )}
    </div>
  );
}
