'use client';

import type { PassTxType, PaymentMethod, PrepaidPassDetail } from '@beauty-crm/shared';
import { PAYMENT_METHOD_LABEL, formatWon } from '@beauty-crm/shared';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Alert, Button, Field } from '../../../../components/ui';
import { api } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { fmtDate, parsePrice, priceText } from '../../../../lib/format';

const TX: Record<PassTxType, string> = { CHARGE: '충전', USE: '사용', CANCEL_USE: '사용 취소', ADJUST: '조정', REFUND: '환불·소멸' };
const STATUS: Record<string, string> = { ACTIVE: '사용 중', EXHAUSTED: '다 씀', REFUNDED: '환불됨', EXPIRED: '기간 만료' };

function PassDetail() {
  const { id } = useParams<{ id: string }>();
  const sold = useSearchParams().get('sold');
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const [p, setP] = useState<PrepaidPassDetail | null>(null);
  const [mode, setMode] = useState<'adjust' | 'refund' | null>(null);
  const [amount, setAmount] = useState('');
  const [minus, setMinus] = useState(false);
  const [memo, setMemo] = useState('');
  const [method, setMethod] = useState<Exclude<PaymentMethod, 'PREPAID'>>('CASH');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(sold ? { kind: 'ok', text: '선불권을 판매했어요.' } : null);

  const load = useCallback(() => api<PrepaidPassDetail>(`/prepaid-passes/${id}`).then(setP), [id]);
  useEffect(() => {
    load().catch((e) => setMsg({ kind: 'error', text: e.message }));
  }, [load]);

  async function run() {
    setMsg(null);
    const n = parsePrice(amount) ?? 0;
    try {
      if (mode === 'adjust') {
        await api(`/prepaid-passes/${id}/adjust`, { method: 'POST', body: { amount: minus ? -n : n, memo: memo.trim() } });
        setMsg({ kind: 'ok', text: '잔액을 조정했어요.' });
      } else {
        await api(`/prepaid-passes/${id}/refund`, { method: 'POST', body: { refundAmount: n, method, memo: memo.trim() || null } });
        setMsg({ kind: 'ok', text: n ? `${formatWon(n)} 환불을 기록했어요.` : '선불권을 소멸 처리했어요.' });
      }
      setMode(null);
      setAmount('');
      setMemo('');
      await load();
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    }
  }

  if (!p) return <div className="page">{msg ? <Alert kind={msg.kind}>{msg.text}</Alert> : <p className="muted">불러오는 중…</p>}</div>;

  return (
    <div className="page">
      <header className="page-head">
        <Link href={`/customers/${p.customerId}`} className="back">
          ← {p.customerName} 고객님
        </Link>
        <h1>{p.passName}</h1>
        <p className="muted">
          {STATUS[p.status]} · {fmtDate(p.purchasedAt)} 구매{p.expireAt ? ` · ${p.expireAt}까지` : ' · 기간 없음'}
        </p>
      </header>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <section className="card pass-hero">
        <p className="muted">남은 금액</p>
        <p className="big-num">{formatWon(p.balance)}</p>
        <p className="muted small">
          낸 돈 {formatWon(p.chargeAmount)}
          {p.bonusAmount ? ` + 보너스 ${formatWon(p.bonusAmount)}` : ''}
        </p>
      </section>

      {isOwner && p.status !== 'REFUNDED' && (
        <section className="card">
          {!mode ? (
            <div className="form-actions start">
              <Button variant="ghost" onClick={() => setMode('adjust')}>
                잔액 조정
              </Button>
              <Button variant="danger" onClick={() => { setMode('refund'); setAmount(priceText(Math.min(p.balance, p.chargeAmount))); }}>
                환불
              </Button>
            </div>
          ) : (
            <div>
              <h2 className="sec-title">{mode === 'adjust' ? '잔액 조정' : '선불권 환불'}</h2>
              {mode === 'adjust' ? (
                <div className="seg seg-2">
                  <button type="button" className={!minus ? 'on' : ''} onClick={() => setMinus(false)}>
                    더하기 (서비스 적립)
                  </button>
                  <button type="button" className={minus ? 'on' : ''} onClick={() => setMinus(true)}>
                    빼기 (잘못 입력 정정)
                  </button>
                </div>
              ) : (
                <p className="muted">남은 {formatWon(p.balance)}은 없어지고, 고객에게 돌려준 돈은 오늘 정산에서 빠져요.</p>
              )}
              <Field label={mode === 'adjust' ? '금액 (원)' : '돌려준 돈 (원, 없으면 0)'} value={amount} onChange={(e) => setAmount(priceText(parsePrice(e.target.value)) || (e.target.value === '0' ? '0' : ''))} inputMode="numeric" />
              {mode === 'refund' && (
                <div className="seg seg-3" role="radiogroup">
                  {(['CASH', 'TRANSFER', 'CARD'] as const).map((m) => (
                    <button key={m} type="button" className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>
                      {PAYMENT_METHOD_LABEL[m]}
                    </button>
                  ))}
                </div>
              )}
              <div className="field-gap" />
              <Field label={mode === 'adjust' ? '사유 (필수)' : '메모'} value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={255} />
              <div className="form-actions">
                <Button variant="ghost" onClick={() => setMode(null)}>
                  취소
                </Button>
                <Button
                  variant={mode === 'refund' ? 'danger' : 'primary'}
                  onClick={() => (mode === 'refund' ? window.confirm('환불하면 되돌릴 수 없어요. 진행할까요?') && run() : run())}
                  disabled={mode === 'adjust' ? !(parsePrice(amount) ?? 0) || !memo.trim() : amount === ''}
                >
                  {mode === 'adjust' ? '조정하기' : '환불하기'}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="card">
        <h2 className="sec-title">사용 내역</h2>
        <ul className="list">
          {p.transactions.map((t) => (
            <li key={t.id} className="list-row">
              <span className="list-main">
                <b>{TX[t.txType]}</b>
                <span className="muted small">
                  {new Date(t.createdAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {t.createdByName}
                  {t.memo ? ` · ${t.memo}` : ''}
                </span>
              </span>
              <span className="tx-amt">
                <b className={t.amount < 0 ? 'neg' : 'pos'}>
                  {t.amount > 0 ? '+' : ''}
                  {formatWon(t.amount)}
                </b>
                <span className="muted small">잔액 {formatWon(t.balanceAfter)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function PassDetailPage() {
  return (
    <Suspense fallback={null}>
      <PassDetail />
    </Suspense>
  );
}
