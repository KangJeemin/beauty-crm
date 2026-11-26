'use client';

import type { FeedbackItem, FeedbackStatus } from '@beauty-crm/shared';
import { FEEDBACK_CATEGORY_LABEL, FEEDBACK_STATUS_LABEL } from '@beauty-crm/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Empty } from '../../../../components/ui';
import { ago, dt } from '../../../../components/admin/common';
import { adminApi } from '../../../../lib/admin-api';

const FILTERS: { v: FeedbackStatus | 'UNDONE' | ''; label: string }[] = [
  { v: 'UNDONE', label: '답변 안 함' },
  { v: 'DONE', label: '답변 완료' },
  { v: '', label: '전체' },
];

function Card({ f, onSaved }: { f: FeedbackItem; onSaved: () => Promise<void> }) {
  const [reply, setReply] = useState(f.reply ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(body: { status?: FeedbackStatus; reply?: string }) {
    setBusy(true);
    setError(null);
    try {
      await adminApi(`/admin/feedback/${f.id}`, { method: 'PATCH', body });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card fb-admin">
      <div className="fb-head">
        <b>{FEEDBACK_CATEGORY_LABEL[f.category]}</b>
        <span className={`badge ${f.status === 'DONE' ? '' : 'badge-warn'}`}>{FEEDBACK_STATUS_LABEL[f.status]}</span>
        <span className="muted small">
          <Link href={`/admin/shops/${f.shopId}`}>{f.shopName}</Link> · {f.userName} · {dt(f.createdAt)} ({ago(f.createdAt)})
          {f.pageUrl ? ` · ${f.pageUrl}` : ''}
        </span>
      </div>
      <p className="fb-content">{f.content}</p>
      {error && <Alert>{error}</Alert>}
      <div className="field" style={{ marginTop: '0.8rem' }}>
        <label htmlFor={`r${f.id}`}>답변 {f.repliedAt ? `(${dt(f.repliedAt)} 보냄)` : ''}</label>
        <textarea id={`r${f.id}`} rows={3} value={reply} maxLength={2000} onChange={(e) => setReply(e.target.value)} placeholder="매장 화면의 '의견 보내기'에서 원장님·디자이너가 보게 돼요." />
      </div>
      <div className="row-actions">
        <Button className="btn-sm" loading={busy} disabled={!reply.trim() || reply.trim() === (f.reply ?? '')} onClick={() => save({ reply: reply.trim() })}>
          답변 보내기
        </Button>
        {f.status === 'OPEN' && (
          <Button variant="ghost" className="btn-sm" disabled={busy} onClick={() => save({ status: 'IN_PROGRESS' })}>
            확인 중으로
          </Button>
        )}
        {f.status !== 'DONE' && (
          <Button variant="ghost" className="btn-sm" disabled={busy} onClick={() => save({ status: 'DONE' })}>
            답변 없이 완료
          </Button>
        )}
      </div>
    </section>
  );
}

export default function AdminFeedbackPage() {
  const [status, setStatus] = useState<FeedbackStatus | 'UNDONE' | ''>('UNDONE');
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(await adminApi<FeedbackItem[]>(`/admin/feedback${status ? `?status=${status}` : ''}`));
  }, [status]);
  useEffect(() => {
    setItems(null);
    load().catch((e) => setError(e.message));
  }, [load]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>의견</h1>
      </header>
      <div className="chips-wrap">
        {FILTERS.map((f) => (
          <button key={f.label} type="button" className={`chip ${status === f.v ? 'on' : ''}`} onClick={() => setStatus(f.v)}>
            {f.label}
          </button>
        ))}
      </div>
      {error && <Alert>{error}</Alert>}
      {!items ? (
        <p className="muted">불러오는 중…</p>
      ) : items.length === 0 ? (
        <section className="card">
          <Empty title={status === 'UNDONE' ? '답변할 의견이 없어요' : '의견이 없어요'} />
        </section>
      ) : (
        <div className="stack">
          {items.map((f) => (
            <Card key={`${f.id}-${f.status}-${f.repliedAt}`} f={f} onSaved={load} />
          ))}
        </div>
      )}
    </div>
  );
}
