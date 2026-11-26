'use client';

import type { VoiceRecordStatus } from '@beauty-crm/shared';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { TreatmentEditor } from '../../../../components/records/TreatmentEditor';
import { Alert, Button } from '../../../../components/ui';
import { api, apiBlob } from '../../../../lib/api';

const isDone = (s: VoiceRecordStatus) => s.sttStatus === 'FAILED' || s.aiStatus === 'DONE' || s.aiStatus === 'FAILED';

/** 처리 중(받아 적기 → 정리) → 검토·수정 → 저장 */
export default function VoiceReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [st, setSt] = useState<VoiceRecordStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = await api<VoiceRecordStatus>(`/voice-records/${id}`);
        if (!alive) return;
        setSt(s);
        if (s.treatmentId) return;
        if (!isDone(s)) timer.current = window.setTimeout(poll, 1500);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [id]);

  useEffect(() => () => void (audioUrl && URL.revokeObjectURL(audioUrl)), [audioUrl]);

  async function retry() {
    setError(null);
    try {
      setSt(await api<VoiceRecordStatus>(`/voice-records/${id}/retry`, { method: 'POST' }));
      const poll = async () => {
        const s = await api<VoiceRecordStatus>(`/voice-records/${id}`);
        setSt(s);
        if (!isDone(s)) timer.current = window.setTimeout(poll, 1500);
      };
      timer.current = window.setTimeout(poll, 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function discard() {
    if (!window.confirm('이 기록을 버릴까요?')) return;
    await api(`/voice-records/${id}`, { method: 'DELETE' }).catch(() => undefined);
    router.replace('/records');
  }

  async function listen() {
    try {
      setAudioUrl(URL.createObjectURL(await apiBlob(`/voice-records/${id}/audio`)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error && !st) return <div className="page"><Alert>{error}</Alert></div>;
  if (!st) return <div className="page"><p className="muted">불러오는 중…</p></div>;

  if (st.treatmentId) {
    return (
      <div className="page">
        <Alert kind="ok">이미 저장된 기록이에요.</Alert>
        <Button onClick={() => router.replace(st.customerId ? `/customers/${st.customerId}` : '/records')}>기록 보기</Button>
      </div>
    );
  }

  const failed = st.sttStatus === 'FAILED' || st.aiStatus === 'FAILED';
  const ready = st.aiStatus === 'DONE' || manual;

  if (!ready) {
    const steps = [
      { label: st.inputType === 'TEXT' ? '글 받기' : '녹음 올리기', done: true },
      { label: '말씀 받아 적기', done: st.sttStatus === 'DONE' || st.sttStatus === 'SKIPPED', active: st.sttStatus === 'PENDING' || st.sttStatus === 'PROCESSING', fail: st.sttStatus === 'FAILED' },
      { label: '시술 내용 정리하기', done: st.aiStatus === 'DONE', active: (st.sttStatus === 'DONE' || st.sttStatus === 'SKIPPED') && st.aiStatus !== 'FAILED', fail: st.aiStatus === 'FAILED' },
    ];
    return (
      <div className="page">
        <header className="page-head">
          <h1>{failed ? '정리하지 못했어요' : '정리하고 있어요'}</h1>
          <p className="muted">{failed ? '다시 시도하거나 직접 입력할 수 있어요.' : '보통 10초 안에 끝나요. 다른 일을 하셔도 돼요.'}</p>
        </header>
        <section className="card">
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.label} className={s.fail ? 'fail' : s.done ? 'done' : s.active ? 'active' : ''}>
                <span className="step-dot" aria-hidden />
                {s.label}
              </li>
            ))}
          </ol>
          {failed && (
            <>
              <Alert>{st.error}</Alert>
              <div className="form-actions">
                <Button variant="ghost" onClick={discard}>
                  버리기
                </Button>
                <Button variant="ghost" onClick={() => setManual(true)}>
                  직접 입력
                </Button>
                <Button onClick={retry}>다시 시도</Button>
              </div>
            </>
          )}
          {st.transcript && (
            <div className="transcript">
              <p className="label">받아 적은 내용</p>
              <p>{st.transcript}</p>
            </div>
          )}
        </section>
      </div>
    );
  }

  const d = st.draft;
  return (
    <div className="page">
      <header className="page-head">
        <h1>확인하고 저장해 주세요</h1>
        <p className="muted">AI가 정리한 내용이에요. 틀린 부분만 고치면 돼요.</p>
      </header>
      {st.transcript && (
        <section className="card transcript-card">
          <div className="transcript-links">
          <button type="button" className="link-btn" onClick={() => setShowText((v) => !v)} aria-expanded={showText}>
            {showText ? '받아 적은 내용 접기' : '받아 적은 내용 보기'}
          </button>
          {st.inputType === 'VOICE' && !audioUrl && (
            <button type="button" className="link-btn" onClick={listen}>
              녹음 다시 듣기
            </button>
          )}
          </div>
          {showText && <p className="transcript-text">{st.transcript}</p>}
          {audioUrl && <audio controls src={audioUrl} className="audio" />}
        </section>
      )}
      <TreatmentEditor
        voiceRecordId={st.id}
        candidates={st.candidates}
        initial={{
          customer: st.customerId && st.candidates[0] ? st.candidates[0] : null,
          items: d?.items ?? [],
          note: d?.note ?? null,
          heardTotal: d?.totalPrice ?? null,
          suggestedName: d?.customerName ?? null,
        }}
      />
      <Button variant="ghost" className="btn-block mt" onClick={discard}>
        이 기록 버리기
      </Button>
    </div>
  );
}
