'use client';

import type { FeedbackCategory, FeedbackItem } from '@beauty-crm/shared';
import { FEEDBACK_CATEGORY_LABEL, FEEDBACK_STATUS_LABEL } from '@beauty-crm/shared';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Alert, Button, Empty, Section } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

const CATS = Object.keys(FEEDBACK_CATEGORY_LABEL) as FeedbackCategory[];
const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function FeedbackInner() {
  const params = useSearchParams();
  const from = params.get('from');
  const { user } = useAuth();
  const [category, setCategory] = useState<FeedbackCategory>('BUG');
  const [content, setContent] = useState('');
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<FeedbackItem[]>('/feedback').then(setItems), []);
  useEffect(() => {
    load().catch((e) => setMsg({ kind: 'error', text: e.message }));
  }, [load]);

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      await api('/feedback', { method: 'POST', body: { category, content: content.trim(), pageUrl: from } });
      setContent('');
      setMsg({ kind: 'ok', text: '보냈어요. 답변이 오면 이 화면에서 볼 수 있어요.' });
      await load();
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>의견 보내기</h1>
        <p className="muted">불편한 점, 있으면 좋겠는 기능, 궁금한 점 무엇이든 적어 주세요. 개발자가 직접 읽고 답해요.</p>
      </header>
      <div className="stack">
        <section className="card">
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <p className="label">어떤 이야기인가요?</p>
          <div className="seg" role="radiogroup" aria-label="종류">
            {CATS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={category === c} className={category === c ? 'on' : ''} onClick={() => setCategory(c)}>
                {FEEDBACK_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <div className="field" style={{ marginTop: '1rem' }}>
            <label htmlFor="fb">내용</label>
            <textarea
              id="fb"
              rows={5}
              value={content}
              maxLength={2000}
              onChange={(e) => setContent(e.target.value)}
              placeholder={category === 'BUG' ? '예) 녹음 버튼을 눌렀는데 아무 반응이 없어요' : category === 'REQUEST' ? '예) 예약 손님에게 문자를 보내고 싶어요' : ''}
            />
            {from && <p className="field-hint">보낸 화면: {from}</p>}
          </div>
          <Button className="btn-block" onClick={send} loading={busy} disabled={content.trim().length < 2}>
            보내기
          </Button>
        </section>

        <Section title={user?.role === 'OWNER' ? '우리 매장이 보낸 의견' : '내가 보낸 의견'}>
          {!items ? (
            <p className="muted">불러오는 중…</p>
          ) : items.length === 0 ? (
            <Empty title="아직 보낸 의견이 없어요" />
          ) : (
            <ul className="list">
              {items.map((f) => (
                <li key={f.id} className="fb-item">
                  <div className="fb-head">
                    <b>{FEEDBACK_CATEGORY_LABEL[f.category]}</b>
                    <span className={`badge ${f.status === 'DONE' ? '' : 'badge-warn'}`}>{FEEDBACK_STATUS_LABEL[f.status]}</span>
                    <span className="muted small">
                      {when(f.createdAt)}
                      {user?.role === 'OWNER' ? ` · ${f.userName}` : ''}
                    </span>
                  </div>
                  <p className="fb-content">{f.content}</p>
                  {f.reply && (
                    <div className="fb-reply">
                      <span className="muted small">답변 · {f.repliedAt ? when(f.repliedAt) : ''}</span>
                      <p>{f.reply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense>
      <FeedbackInner />
    </Suspense>
  );
}
