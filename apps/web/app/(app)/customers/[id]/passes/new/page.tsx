'use client';

import type { CustomerDetail, PaymentMethod, PrepaidPassDetail } from '@beauty-crm/shared';
import { PAYMENT_METHOD_LABEL, formatWon } from '@beauty-crm/shared';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCustomersReload } from '../../../../../../components/customers/context';
import { Alert, Button, Field } from '../../../../../../components/ui';
import { api } from '../../../../../../lib/api';
import { parsePrice, priceText } from '../../../../../../lib/format';

/** 자주 파는 정액권 (금액만 바꿔 쓰면 됨) */
const PRESETS = [
  { charge: 100000, bonus: 10000 },
  { charge: 200000, bonus: 30000 },
  { charge: 300000, bonus: 50000 },
];

function oneYearLater() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export default function SellPassPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { reload } = useCustomersReload();
  const [c, setC] = useState<CustomerDetail | null>(null);
  const [charge, setCharge] = useState('');
  const [bonus, setBonus] = useState('');
  const [name, setName] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  const [expire, setExpire] = useState(oneYearLater());
  const [noExpire, setNoExpire] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<CustomerDetail>(`/customers/${id}`).then(setC).catch((e) => setError(e.message));
  }, [id]);

  const chargeN = parsePrice(charge) ?? 0;
  const bonusN = parsePrice(bonus) ?? 0;
  const autoName = chargeN ? `${chargeN / 10000}만원 정액권` : '';

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const p = await api<PrepaidPassDetail>('/prepaid-passes', {
        method: 'POST',
        body: {
          customerId: Number(id),
          passName: name.trim() || autoName,
          chargeAmount: chargeN,
          bonusAmount: bonusN,
          expireAt: noExpire ? null : expire,
          details: [{ method, amount: chargeN }],
        },
      });
      reload();
      router.replace(`/passes/${p.id}?sold=1`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="card form-card">
      <h1>선불권 판매</h1>
      <p className="muted">{c ? `${c.name} 고객님` : ''}</p>
      {error && <Alert>{error}</Alert>}

      <p className="label">자주 파는 금액</p>
      <div className="chips-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.charge}
            type="button"
            className={`chip ${chargeN === p.charge && bonusN === p.bonus ? 'on' : ''}`}
            onClick={() => {
              setCharge(priceText(p.charge));
              setBonus(priceText(p.bonus));
            }}
          >
            {p.charge / 10000}만 + {p.bonus / 10000}만
          </button>
        ))}
      </div>
      <div className="grid-2 tight">
        <Field label="고객이 낸 돈 (원)" value={charge} onChange={(e) => setCharge(priceText(parsePrice(e.target.value)))} inputMode="numeric" />
        <Field label="보너스 적립 (원)" value={bonus} onChange={(e) => setBonus(priceText(parsePrice(e.target.value)))} inputMode="numeric" />
      </div>
      {chargeN > 0 && (
        <Alert kind="info">
          선불권 잔액 <b>{formatWon(chargeN + bonusN)}</b> 으로 시작해요.
        </Alert>
      )}
      <Field label="선불권 이름" value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName || '예) 20만원 정액권'} maxLength={100} />

      <p className="label">받은 방법</p>
      <div className="seg seg-3" role="radiogroup">
        {(['CARD', 'CASH', 'TRANSFER'] as PaymentMethod[]).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={method === m} className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>
            {PAYMENT_METHOD_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="field-gap" />
      <div className="row-end">
        <Field label="유효기간" type="date" value={expire} onChange={(e) => setExpire(e.target.value)} disabled={noExpire} />
      </div>
      <label className="check">
        <input type="checkbox" checked={noExpire} onChange={(e) => setNoExpire(e.target.checked)} />
        <span>유효기간 없음</span>
      </label>

      <div className="form-actions">
        <Button variant="ghost" onClick={() => router.back()}>
          취소
        </Button>
        <Button onClick={submit} loading={busy} disabled={chargeN <= 0}>
          {chargeN ? `${formatWon(chargeN)} 받고 판매` : '판매'}
        </Button>
      </div>
    </div>
  );
}
