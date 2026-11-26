'use client';

import type { CustomerCandidate, CustomerDetail, CustomerListItem, Paged } from '@beauty-crm/shared';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { relDay, typingPhone } from '../../lib/format';
import { Alert, Button, Field } from '../ui';

export interface PickedCustomer {
  id: number;
  name: string;
  phoneMasked: string | null;
}

/**
 * 고객 고르기 — AI 가 찾은 후보 → 검색 → 바로 등록 순서
 * 녹음 전에 고르지 않았어도 검토 화면에서 정할 수 있다.
 */
export function CustomerPicker({
  value,
  onChange,
  candidates = [],
  suggestedName,
}: {
  value: PickedCustomer | null;
  onChange: (c: PickedCustomer | null) => void;
  candidates?: CustomerCandidate[];
  suggestedName?: string | null;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CustomerListItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState(suggestedName ?? '');
  const [newPhone, setNewPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const t = setTimeout(() => {
      api<Paged<CustomerListItem>>(`/customers?q=${encodeURIComponent(q.trim())}&size=8`)
        .then((r) => setResults(r.items))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function create() {
    setError(null);
    try {
      const c = await api<CustomerDetail>('/customers', {
        method: 'POST',
        body: { name: newName.trim(), phone: newPhone.replace(/\D/g, '') || null },
      });
      onChange({ id: c.id, name: c.name, phoneMasked: c.phoneMasked });
      setCreating(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (value) {
    return (
      <div className="picked">
        <div className="picked-main">
          <b>{value.name}</b>
          {value.phoneMasked && <span className="muted small">{value.phoneMasked}</span>}
        </div>
        <Button variant="ghost" className="btn-sm" onClick={() => onChange(null)}>
          바꾸기
        </Button>
      </div>
    );
  }

  return (
    <div className="picker">
      {candidates.length > 0 && (
        <>
          <p className="label">이 고객님이 맞나요?</p>
          <div className="cand-list">
            {candidates.map((c) => (
              <button key={c.id} type="button" className="cand" onClick={() => onChange(c)}>
                <b>{c.name}</b>
                <span className="muted small">
                  {c.phoneMasked ?? '전화번호 없음'}
                  {c.lastVisitAt ? ` · 최근 ${relDay(c.lastVisitAt)}` : ''}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="search">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="뒷자리 4자리 또는 이름"
          aria-label="고객 찾기"
        />
      </div>
      {results.length > 0 && (
        <div className="cand-list">
          {results.map((c) => (
            <button key={c.id} type="button" className="cand" onClick={() => onChange(c)}>
              <b>{c.name}</b>
              <span className="muted small">{c.phoneMasked ?? '전화번호 없음'}</span>
            </button>
          ))}
        </div>
      )}
      {!creating ? (
        <Button
          variant="ghost"
          className="btn-block"
          onClick={() => {
            setNewName(suggestedName ?? (/^[^\d]+$/.test(q) ? q : ''));
            setNewPhone(/^\d+$/.test(q) && q.length > 4 ? typingPhone(q) : '');
            setCreating(true);
          }}
        >
          + 새 고객으로 등록
        </Button>
      ) : (
        <div className="menu-editor">
          {error && <Alert>{error}</Alert>}
          <Field label="고객 이름" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <Field label="전화번호 (선택)" value={newPhone} onChange={(e) => setNewPhone(typingPhone(e.target.value))} inputMode="numeric" placeholder="010-1234-5678" />
          <div className="form-actions">
            <Button variant="ghost" className="btn-sm" onClick={() => setCreating(false)}>
              취소
            </Button>
            <Button className="btn-sm" onClick={create} disabled={!newName.trim()}>
              등록하고 선택
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
