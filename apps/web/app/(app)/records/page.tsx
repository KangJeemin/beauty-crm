'use client';

import type { CustomerDetail, PendingVoiceItem, VoiceRecordStatus } from '@beauty-crm/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { IconMic } from '../../../components/icons';
import { Alert, Button, Empty } from '../../../components/ui';
import { api } from '../../../lib/api';
import { relDay } from '../../../lib/format';
import { mmss, useRecorder } from '../../../lib/recorder';

const STATUS_LABEL: Record<string, string> = { PENDING: '대기', PROCESSING: '정리 중', DONE: '검토 대기', FAILED: '실패', SKIPPED: '' };

function RecordScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const customerId = params.get('customerId') ? Number(params.get('customerId')) : null;
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [mode, setMode] = useState<'voice' | 'text'>('voice');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingVoiceItem[]>([]);
  const rec = useRecorder(180);

  useEffect(() => {
    if (customerId) api<CustomerDetail>(`/customers/${customerId}`).then(setCustomer).catch(() => undefined);
    api<PendingVoiceItem[]>('/voice-records/pending').then(setPending).catch(() => undefined);
  }, [customerId]);

  async function finish() {
    const blob = await rec.stop();
    if (blob.size < 1000) return setError('녹음이 너무 짧아요. 다시 녹음해 주세요.');
    setBusy(true);
    setError(null);
    const fd = new FormData();
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    fd.append('audio', blob, `record.${ext}`);
    if (customerId) fd.append('customerId', String(customerId));
    try {
      const r = await api<VoiceRecordStatus>('/voice-records', { method: 'POST', body: fd });
      router.push(`/records/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function submitText() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<VoiceRecordStatus>('/voice-records/text', { method: 'POST', body: { text: text.trim(), customerId: customerId ?? undefined } });
      router.push(`/records/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const recording = rec.state === 'recording';

  return (
    <div className="page record-page">
      <header className="page-head">
        <h1>시술 기록</h1>
        {customer ? (
          <p className="for-customer">
            <b>{customer.name}</b> 고객님 기록 · <Link href="/records">고객 없이 기록</Link>
          </p>
        ) : (
          <p className="muted">고객 이름도 같이 말하면 자동으로 찾아 드려요.</p>
        )}
      </header>

      <div className="seg seg-2" role="tablist">
        <button role="tab" aria-selected={mode === 'voice'} className={mode === 'voice' ? 'on' : ''} onClick={() => setMode('voice')} disabled={recording}>
          말로 기록
        </button>
        <button role="tab" aria-selected={mode === 'text'} className={mode === 'text' ? 'on' : ''} onClick={() => setMode('text')} disabled={recording}>
          글로 기록
        </button>
      </div>

      {(error || rec.error) && <Alert>{error ?? rec.error}</Alert>}

      {mode === 'voice' ? (
        <section className="card rec-card">
          {!recording ? (
            <>
              <button type="button" className="rec-btn" onClick={rec.start} disabled={busy} aria-label="녹음 시작">
                <IconMic />
              </button>
              <p className="rec-title">{busy ? '올리는 중…' : '눌러서 말하기'}</p>
              <p className="muted rec-help">
                예) “김미영 고객님, 뿌리 염색 7N에 6프로 1대1, 30분 방치. 커트 같이 해서 5만 5천원.”
              </p>
            </>
          ) : (
            <>
              <div className="rec-live" style={{ '--lv': rec.level } as React.CSSProperties}>
                <span className="rec-dot" />
                <span className="rec-time">{mmss(rec.elapsed)}</span>
              </div>
              <div className="meter" aria-hidden>
                <span style={{ width: `${Math.round(rec.level * 100)}%` }} />
              </div>
              <p className="muted">듣고 있어요. 다 말씀하시면 완료를 눌러 주세요. (최대 {rec.maxSeconds / 60}분)</p>
              <div className="rec-actions">
                <Button variant="ghost" onClick={rec.cancel}>
                  취소
                </Button>
                <Button className="grow btn-xl" onClick={finish}>
                  완료
                </Button>
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="card">
          <div className="field">
            <label htmlFor="rtext">시술 내용</label>
            <textarea
              id="rtext"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="예) 김미영 뿌리염색 7N 6% 1:1 30분, 커트, 5만 5천원. 두피 예민"
              maxLength={5000}
            />
          </div>
          <Button className="btn-block" onClick={submitText} disabled={text.trim().length < 2} loading={busy}>
            AI로 정리하기
          </Button>
          <Link href={`/records/new${customerId ? `?customerId=${customerId}` : ''}`} className="btn btn-ghost btn-block mt">
            AI 없이 직접 입력
          </Link>
        </section>
      )}

      <section className="card">
        <h2 className="sec-title">검토를 기다리는 기록</h2>
        {pending.length === 0 ? (
          <Empty title="모두 저장했어요" />
        ) : (
          <ul className="list">
            {pending.map((p) => (
              <li key={p.id} className="list-row">
                <Link href={`/records/${p.id}`} className="list-main link-row">
                  <b>
                    {p.customerName ?? '고객 미정'}
                    {(p.aiStatus === 'FAILED' || p.sttStatus === 'FAILED') && <span className="badge badge-warn">실패</span>}
                  </b>
                  <span className="muted small">
                    {p.summary ?? (p.aiStatus === 'DONE' ? '' : STATUS_LABEL[p.aiStatus])} · {relDay(p.createdAt)} {p.inputType === 'TEXT' ? '· 글' : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function RecordsPage() {
  return (
    <Suspense fallback={null}>
      <RecordScreen />
    </Suspense>
  );
}
