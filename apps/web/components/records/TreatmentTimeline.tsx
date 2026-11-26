'use client';

import type { TreatmentDetail } from '@beauty-crm/shared';
import { formatWon, recipeLine } from '@beauty-crm/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { fmtDate, relDay } from '../../lib/format';
import { IconMic } from '../icons';
import { Button, Empty } from '../ui';

/** 고객 상세의 시술 이력 — 레시피까지 한눈에 */
export function TreatmentTimeline({ customerId, highlightId }: { customerId: number; highlightId?: number }) {
  const [data, setData] = useState<{ items: TreatmentDetail[]; total: number } | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api<{ items: TreatmentDetail[]; total: number }>(`/customers/${customerId}/treatments?page=1&size=10`).then(setData).catch(() => undefined);
    setPage(1);
  }, [customerId, highlightId]);

  async function more() {
    const next = await api<{ items: TreatmentDetail[]; total: number }>(`/customers/${customerId}/treatments?page=${page + 1}&size=10`);
    setData((d) => (d ? { total: next.total, items: [...d.items, ...next.items] } : next));
    setPage(page + 1);
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>시술 기록{data ? ` ${data.total}건` : ''}</h2>
        <Link href={`/records?customerId=${customerId}`} className="btn btn-primary btn-sm">
          <IconMic /> 기록하기
        </Link>
      </div>
      {data && data.items.length === 0 && <Empty title="아직 시술 기록이 없어요" desc="'기록하기'를 눌러 말로 남겨 보세요." />}
      <ol className="timeline">
        {data?.items.map((t, idx) => (
          <li key={t.id} className={`tl-item ${t.id === highlightId ? 'tl-new' : ''}`}>
            <div className="tl-head">
              <div>
                <b>{fmtDate(t.treatedAt)}</b>
                <span className="muted small"> · {relDay(t.treatedAt)} · {t.designerName}</span>
              </div>
              <span className="tl-amount">{formatWon(t.totalAmount)}</span>
            </div>
            <ul className="tl-services">
              {t.items.map((i) => (
                <li key={i.id}>
                  <div className="tl-service">
                    <span>{i.menuName}</span>
                    <span className="muted small">{formatWon(i.price)}</span>
                  </div>
                  {i.recipes.map((r) => (
                    <p key={r.id} className="recipe-line">
                      {recipeLine(r)}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
            {t.note && <p className="tl-note">{t.note}</p>}
            <div className="tl-actions">
              {idx === 0 && (
                <Link href={`/records/new?copyFrom=${t.id}`} className="btn btn-ghost btn-sm">
                  지난번이랑 똑같이
                </Link>
              )}
              <Link href={`/treatments/${t.id}/edit`} className="btn btn-ghost btn-sm">
                수정
              </Link>
            </div>
          </li>
        ))}
      </ol>
      {data && data.items.length < data.total && (
        <Button variant="ghost" className="btn-block" onClick={more}>
          이전 기록 더 보기
        </Button>
      )}
    </div>
  );
}
