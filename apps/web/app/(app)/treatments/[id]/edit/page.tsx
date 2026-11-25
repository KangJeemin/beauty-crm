'use client';

import type { CustomerDetail, TreatmentDetail } from '@beauty-crm/shared';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EditorInitial, TreatmentEditor } from '../../../../../components/records/TreatmentEditor';
import { Alert } from '../../../../../components/ui';
import { api } from '../../../../../lib/api';

export default function EditTreatmentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [initial, setInitial] = useState<EditorInitial | null>(null);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const t = await api<TreatmentDetail>(`/treatments/${id}`);
      const c = await api<CustomerDetail>(`/customers/${t.customerId}`).catch(() => null);
      setCustomerId(t.customerId);
      setInitial({
        customer: c ? { id: c.id, name: c.name, phoneMasked: c.phoneMasked } : null,
        items: t.items.map(({ serviceMenuId, menuName, price, recipes }) => ({ serviceMenuId, menuName, price, recipes: recipes.map(({ id: _id, ...r }) => r) })),
        note: t.note,
        designerId: t.designerId,
        treatedAt: t.treatedAt,
      });
    })().catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="page"><Alert>{error}</Alert></div>;
  if (!initial) return <div className="page"><p className="muted">불러오는 중…</p></div>;
  return (
    <div className="page">
      <header className="page-head">
        <h1>시술 기록 수정</h1>
      </header>
      <TreatmentEditor initial={initial} treatmentId={Number(id)} onDeleted={() => router.replace(customerId ? `/customers/${customerId}` : '/home')} />
    </div>
  );
}
