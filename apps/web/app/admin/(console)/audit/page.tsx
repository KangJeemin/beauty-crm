'use client';

import type { AuditItem } from '@beauty-crm/shared';
import { AUDIT_ACTION_LABEL, AUDIT_TABLE_LABEL } from '@beauty-crm/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Alert, Button } from '../../../../components/ui';
import { AuditList } from '../../../../components/admin/common';
import { adminApi } from '../../../../lib/admin-api';

const SIZE = 50;

function AuditInner() {
  const params = useSearchParams();
  const shopId = params.get('shopId');
  const [table, setTable] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AuditItem[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPage(1), [table, action, shopId]);
  useEffect(() => {
    const sp = new URLSearchParams({ page: String(page), size: String(SIZE) });
    if (shopId) sp.set('shopId', shopId);
    if (table) sp.set('targetTable', table);
    if (action) sp.set('action', action);
    adminApi<{ items: AuditItem[]; total: number }>(`/admin/audit-logs?${sp}`).then(setData).catch((e) => setError(e.message));
  }, [page, table, action, shopId]);

  const pages = data ? Math.max(1, Math.ceil(data.total / SIZE)) : 1;

  return (
    <div className="page">
      <header className="page-head">
        <h1>변경 이력</h1>
        <p className="muted">
          누가 언제 무엇을 바꿨는지. 줄을 누르면 바뀐 값이 보여요.
          {shopId && (
            <>
              {' '}
              매장 #{shopId}만 보는 중 · <Link href="/admin/audit">전체 보기</Link>
            </>
          )}
        </p>
      </header>
      <div className="toolbar">
        <select value={table} onChange={(e) => setTable(e.target.value)} aria-label="대상">
          <option value="">모든 대상</option>
          {Object.entries(AUDIT_TABLE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="동작">
          <option value="">모든 동작</option>
          {Object.entries(AUDIT_ACTION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {error && <Alert>{error}</Alert>}
      <section className="card">
        {!data ? <p className="muted">불러오는 중…</p> : <AuditList items={data.items} showShop={!shopId} />}
      </section>
      {data && pages > 1 && (
        <div className="pager">
          <Button variant="ghost" className="btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            이전
          </Button>
          <span className="muted">
            {page} / {pages} (총 {data.total.toLocaleString('ko-KR')}건)
          </span>
          <Button variant="ghost" className="btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            다음
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense>
      <AuditInner />
    </Suspense>
  );
}
