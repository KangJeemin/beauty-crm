'use client';

import type { CustomerListItem, CustomerSort, Paged, TagItem } from '@beauty-crm/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { relDay } from '../../lib/format';
import { Alert, Empty } from '../ui';
import { useCustomersReload } from './context';
import { TagChip } from './TagChip';

const SORTS: { v: CustomerSort; label: string }[] = [
  { v: 'recent', label: '최근 방문순' },
  { v: 'name', label: '이름순' },
  { v: 'created', label: '최근 등록순' },
];

/** 고객 검색 + 목록. 휴대폰에선 한 화면, 태블릿·PC 에선 왼쪽 칸 */
export function CustomerList() {
  const path = usePathname();
  const { version } = useCustomersReload();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<CustomerSort>('recent');
  const [tagId, setTagId] = useState<number | null>(null);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [data, setData] = useState<Paged<CustomerListItem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    api<TagItem[]>('/tags').then(setTags).catch(() => undefined);
  }, [version]);

  // 입력이 멈추고 0.25초 뒤 검색 (매 글자마다 요청하지 않게)
  useEffect(() => {
    const id = ++reqId.current;
    const t = setTimeout(() => {
      const params = new URLSearchParams({ sort, size: '30' });
      if (q.trim()) params.set('q', q.trim());
      if (tagId) params.set('tagId', String(tagId));
      api<Paged<CustomerListItem>>(`/customers?${params}`)
        .then((r) => id === reqId.current && (setData(r), setError(null)))
        .catch((e) => id === reqId.current && setError(e.message));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, sort, tagId, version]);

  async function more() {
    if (!data) return;
    setLoadingMore(true);
    const params = new URLSearchParams({ sort, size: String(data.size), page: String(data.page + 1) });
    if (q.trim()) params.set('q', q.trim());
    if (tagId) params.set('tagId', String(tagId));
    try {
      const r = await api<Paged<CustomerListItem>>(`/customers?${params}`);
      setData({ ...r, items: [...data.items, ...r.items] });
    } finally {
      setLoadingMore(false);
    }
  }

  const digitsOnly = /^[\d-\s]+$/.test(q.trim());

  return (
    <div className="clist">
      <div className="clist-head">
        <div className="clist-title">
          <h1>고객</h1>
          <Link href="/customers/new" className="btn btn-primary btn-sm">
            + 새 고객
          </Link>
        </div>
        <div className="search">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="뒷자리 4자리 또는 이름"
            aria-label="고객 검색"
            inputMode={digitsOnly || !q ? 'numeric' : 'text'}
            enterKeyHint="search"
          />
          {q && (
            <button type="button" className="search-clear" onClick={() => setQ('')} aria-label="검색어 지우기">
              지우기
            </button>
          )}
        </div>
        {tags.length > 0 && (
          <div className="chips-scroll" role="group" aria-label="태그로 거르기">
            <button type="button" className={`chip ${tagId === null ? 'on' : ''}`} onClick={() => setTagId(null)}>
              전체
            </button>
            {tags.map((t) => (
              <TagChip key={t.id} tag={t} on={tagId === t.id} onClick={() => setTagId(tagId === t.id ? null : t.id)} />
            ))}
          </div>
        )}
        <div className="clist-meta">
          <span className="muted">{data ? `${data.total.toLocaleString()}명` : ''}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as CustomerSort)} aria-label="정렬">
            {SORTS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}
      {data && data.items.length === 0 && (
        <Empty
          title={q || tagId ? '찾는 고객이 없어요' : '아직 등록된 고객이 없어요'}
          desc={q || tagId ? '검색어를 확인하거나 새 고객으로 등록해 주세요.' : '"+ 새 고객" 버튼으로 첫 고객을 등록해 보세요.'}
        />
      )}

      <ul className="clist-items">
        {data?.items.map((c) => (
          <li key={c.id}>
            <Link href={`/customers/${c.id}`} className={`crow ${path === `/customers/${c.id}` ? 'on' : ''}`}>
              <span className="crow-main">
                <b>{c.name}</b>
                <span className="muted">{c.phoneMasked ?? '전화번호 없음'}</span>
              </span>
              <span className="crow-sub">
                <span className="muted small">{c.lastVisitAt ? `최근 방문 ${relDay(c.lastVisitAt)} · ${c.visitCount}회` : '방문 기록 없음'}</span>
                {c.tags.length > 0 && (
                  <span className="crow-tags">
                    {c.tags.slice(0, 3).map((t) => (
                      <TagChip key={t.id} tag={t} small />
                    ))}
                    {c.tags.length > 3 && <span className="muted small">+{c.tags.length - 3}</span>}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {data && data.items.length < data.total && (
        <button type="button" className="btn btn-ghost btn-block" onClick={more} disabled={loadingMore}>
          {loadingMore ? '불러오는 중…' : '더 보기'}
        </button>
      )}
    </div>
  );
}
