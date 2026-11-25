'use client';

import type { CustomerDetail } from '@beauty-crm/shared';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CustomerForm } from '../../../../../components/customers/CustomerForm';
import { Alert } from '../../../../../components/ui';
import { api } from '../../../../../lib/api';

export default function EditCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<CustomerDetail>(`/customers/${id}`).then(setC).catch((e) => setError(e.message));
  }, [id]);
  if (error) return <Alert>{error}</Alert>;
  if (!c) return <div className="card muted">불러오는 중…</div>;
  return <CustomerForm initial={c} />;
}
