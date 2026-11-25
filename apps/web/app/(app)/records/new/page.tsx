'use client';

import type { CustomerDetail, TreatmentDetail } from '@beauty-crm/shared';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { EditorInitial, TreatmentEditor } from '../../../../components/records/TreatmentEditor';
import { Alert } from '../../../../components/ui';
import { api } from '../../../../lib/api';

/** 직접 입력(?customerId=) 또는 "지난번이랑 똑같이"(?copyFrom=시술ID) */
function NewRecord() {
  const params = useSearchParams();
  const copyFrom = params.get('copyFrom') ? Number(params.get('copyFrom')) : null;
  const customerId = params.get('customerId') ? Number(params.get('customerId')) : null;
  const [initial, setInitial] = useState<EditorInitial | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (copyFrom) {
        const t = await api<TreatmentDetail>(`/treatments/${copyFrom}`);
        const c = await api<CustomerDetail>(`/customers/${t.customerId}`);
        setInitial({
          customer: { id: c.id, name: c.name, phoneMasked: c.phoneMasked },
          // id 는 빼고 내용만 복사 (가격은 지난번 받은 금액)
          items: t.items.map(({ serviceMenuId, menuName, price, recipes }) => ({
            serviceMenuId, menuName, price, recipes: recipes.map(({ id: _id, ...r }) => r),
          })),
          note: null,
        });
      } else if (customerId) {
        const c = await api<CustomerDetail>(`/customers/${customerId}`);
        setInitial({ customer: { id: c.id, name: c.name, phoneMasked: c.phoneMasked }, items: [], note: null });
      } else {
        setInitial({ customer: null, items: [], note: null });
      }
    })().catch((e) => setError(e.message));
  }, [copyFrom, customerId]);

  if (error) return <div className="page"><Alert>{error}</Alert></div>;
  if (!initial) return <div className="page"><p className="muted">불러오는 중…</p></div>;
  return (
    <div className="page">
      <header className="page-head">
        <h1>{copyFrom ? '지난번이랑 똑같이' : '직접 입력'}</h1>
        {copyFrom && <p className="muted">지난 시술 내용을 그대로 가져왔어요. 오늘 달라진 부분만 고쳐 주세요.</p>}
      </header>
      <TreatmentEditor initial={initial} copiedFromId={copyFrom ?? undefined} />
    </div>
  );
}

export default function NewRecordPage() {
  return (
    <Suspense fallback={null}>
      <NewRecord />
    </Suspense>
  );
}
