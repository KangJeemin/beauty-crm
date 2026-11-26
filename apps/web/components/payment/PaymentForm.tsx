'use client';

import type { PaymentDetailInput, PaymentItem, PaymentMethod, PrepaidPassItem, TreatmentDetail } from '@beauty-crm/shared';
import { PAYMENT_METHOD_LABEL, formatWon } from '@beauty-crm/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '../../lib/api';
import { parsePrice, priceText } from '../../lib/format';
import { Alert, Button, Field } from '../ui';

type Row = { method: PaymentMethod; amount: string; prepaidPassId?: number };

const BASIC: PaymentMethod[] = ['CARD', 'CASH', 'TRANSFER'];
const REASONS = ['단골', '첫 방문', '서비스', '지인'];

/**
 * 시술 결제 입력 — 가장 흔한 경우(카드 한 번)는 버튼 두 번으로 끝나게
 *   결제수단 누르기 → 금액 자동 → "결제 완료"
 * 할인·나눠 내기·선불권 차감은 필요할 때만
 */
export function PaymentForm({ treatment, passes }: { treatment: TreatmentDetail; passes: PrepaidPassItem[] }) {
  const router = useRouter();
  const list = treatment.totalAmount;
  const [discount, setDiscount] = useState('');
  const [reason, setReason] = useState('');
  const [showDiscount, setShowDiscount] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const disc = Math.min(parsePrice(discount) ?? 0, list);
  const final = list - disc;
  const paidSum = rows.reduce((a, r) => a + (parsePrice(r.amount) ?? 0), 0);
  const remain = final - paidSum;
  const usable = passes.filter((p) => p.status === 'ACTIVE' && p.balance > 0);

  function pick(method: PaymentMethod, pass?: PrepaidPassItem) {
    const left = rows.length ? remain : final;
    if (left <= 0) return;
    const amount = pass ? Math.min(pass.balance, left) : left;
    setRows([...rows, { method, amount: priceText(amount), prepaidPassId: pass?.id }]);
  }

  async function submit() {
    setError(null);
    if (final > 0 && remain !== 0) return setError(remain > 0 ? `${formatWon(remain)}이 남았어요. 결제수단을 더 선택해 주세요.` : `받을 금액보다 ${formatWon(-remain)} 많아요.`);
    for (const r of rows) {
      if (r.prepaidPassId) {
        const p = usable.find((x) => x.id === r.prepaidPassId);
        if (p && (parsePrice(r.amount) ?? 0) > p.balance) return setError(`${p.passName} 잔액(${formatWon(p.balance)})보다 많아요.`);
      }
    }
    setBusy(true);
    try {
      const details: PaymentDetailInput[] = rows
        .map((r) => ({ method: r.method, amount: parsePrice(r.amount) ?? 0, prepaidPassId: r.prepaidPassId ?? null }))
        .filter((d) => d.amount > 0);
      await api<PaymentItem>('/payments', {
        method: 'POST',
        body: { treatmentId: treatment.id, listAmount: list, discountAmount: disc, discountReason: disc ? reason || null : null, details },
      });
      router.replace(`/customers/${treatment.customerId}?paid=${treatment.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="pay-head">
          <div>
            <p className="muted">{treatment.customerName} 고객님</p>
            <p className="pay-items">{treatment.items.map((i) => i.menuName).join(' + ')}</p>
          </div>
          <div className="pay-final">
            {disc > 0 && <s className="muted">{formatWon(list)}</s>}
            <b>{formatWon(final)}</b>
          </div>
        </div>

        {!showDiscount ? (
          <button type="button" className="link-btn" onClick={() => setShowDiscount(true)}>
            + 할인
          </button>
        ) : (
          <div className="menu-editor">
            <div className="chips-wrap">
              {[0, 10, 20].map((pct) => (
                <button key={pct} type="button" className={`chip ${disc === Math.round((list * pct) / 100) && (pct > 0 || !discount) ? 'on' : ''}`} onClick={() => { setDiscount(pct ? priceText(Math.round((list * pct) / 100 / 100) * 100) : ''); setRows([]); }}>
                  {pct ? `${pct}%` : '할인 없음'}
                </button>
              ))}
              {[5000, 10000].map((w) => (
                <button key={w} type="button" className={`chip ${disc === w ? 'on' : ''}`} onClick={() => { setDiscount(priceText(w)); setRows([]); }}>
                  {formatWon(w)}
                </button>
              ))}
            </div>
            <Field label="할인 금액 (원)" value={discount} onChange={(e) => { setDiscount(priceText(parsePrice(e.target.value))); setRows([]); }} inputMode="numeric" />
            <p className="label">할인 이유 (선택)</p>
            <div className="chips-wrap">
              {REASONS.map((r) => (
                <button key={r} type="button" className={`chip ${reason === r ? 'on' : ''}`} onClick={() => setReason(reason === r ? '' : r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {final > 0 && (
        <section className="card">
          <h2 className="sec-title">어떻게 받으셨어요?</h2>
          {rows.length === 0 || remain > 0 ? (
            <>
              {rows.length > 0 && <p className="remain">남은 금액 <b>{formatWon(remain)}</b></p>}
              <div className="method-grid">
                {BASIC.map((m) => (
                  <button key={m} type="button" className="method-btn" onClick={() => pick(m)}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </button>
                ))}
                {usable.map((p) => (
                  <button key={p.id} type="button" className="method-btn pass" onClick={() => pick('PREPAID', p)} disabled={rows.some((r) => r.prepaidPassId === p.id)}>
                    선불권
                    <small>
                      {p.passName} · 잔액 {formatWon(p.balance)}
                    </small>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {rows.length > 0 && (
            <ul className="pay-rows">
              {rows.map((r, i) => (
                <li key={i} className="pay-row">
                  <span className="pay-row-label">
                    {r.prepaidPassId ? `선불권 · ${usable.find((p) => p.id === r.prepaidPassId)?.passName ?? ''}` : PAYMENT_METHOD_LABEL[r.method]}
                  </span>
                  <input
                    aria-label={`${PAYMENT_METHOD_LABEL[r.method]} 금액`}
                    value={r.amount}
                    inputMode="numeric"
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: priceText(parsePrice(e.target.value)) } : x)))}
                  />
                  <span className="won">원</span>
                  <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="빼기" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {rows.length > 0 && remain === 0 && <p className="muted small">나눠서 받았다면 금액을 고친 뒤 결제수단을 더 누르세요.</p>}
        </section>
      )}

      {error && <Alert>{error}</Alert>}
      <div className="save-bar">
        <Link href={`/customers/${treatment.customerId}`} className="btn btn-ghost">
          나중에
        </Link>
        <Button className="grow" onClick={submit} loading={busy} disabled={final > 0 && rows.length === 0}>
          {final > 0 ? `${formatWon(final)} 결제 완료` : '0원으로 기록'}
        </Button>
      </div>
    </div>
  );
}
