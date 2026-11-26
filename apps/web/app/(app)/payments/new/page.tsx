'use client';

import type { PrepaidPassItem, TreatmentDetail } from '@beauty-crm/shared';
import { PAYMENT_METHOD_LABEL, formatWon } from '@beauty-crm/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { PaymentForm } from '../../../../components/payment/PaymentForm';
import { Alert } from '../../../../components/ui';
import { api } from '../../../../lib/api';

function NewPayment() {
  const tid = Number(useSearchParams().get('treatmentId'));
  const [t, setT] = useState<TreatmentDetail | null>(null);
  const [passes, setPasses] = useState<PrepaidPassItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const tr = await api<TreatmentDetail>(`/treatments/${tid}`);
      setPasses(await api<PrepaidPassItem[]>(`/customers/${tr.customerId}/prepaid-passes`).catch(() => []));
      setT(tr);
    })().catch((e) => setError(e.message));
  }, [tid]);

  if (error) return <div className="page"><Alert>{error}</Alert></div>;
  if (!t) return <div className="page"><p className="muted">불러오는 중…</p></div>;

  return (
    <div className="page">
      <header className="page-head">
        <h1>결제</h1>
        <p className="muted">시술 기록을 저장했어요. 받은 금액을 기록해 주세요.</p>
      </header>
      {t.payment ? (
        <section className="card">
          <Alert kind="ok">
            이미 결제한 시술이에요: <b>{formatWon(t.payment.finalAmount)}</b> ({t.payment.methods.map((m) => PAYMENT_METHOD_LABEL[m.method]).join('·')})
          </Alert>
          <Link href={`/customers/${t.customerId}`} className="btn btn-primary btn-block">
            고객 화면으로
          </Link>
        </section>
      ) : (
        <PaymentForm treatment={t} passes={passes} />
      )}
    </div>
  );
}

export default function NewPaymentPage() {
  return (
    <Suspense fallback={null}>
      <NewPayment />
    </Suspense>
  );
}
