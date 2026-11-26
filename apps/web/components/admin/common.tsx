'use client';

import type { AuditItem, ShopStatus } from '@beauty-crm/shared';
import { AUDIT_ACTION_LABEL, AUDIT_TABLE_LABEL, formatWon } from '@beauty-crm/shared';
import Link from 'next/link';
import { useState } from 'react';

export const SHOP_STATUS_LABEL: Record<ShopStatus, string> = {
  PENDING: '승인 대기',
  ACTIVE: '사용 중',
  SUSPENDED: '정지',
  CLOSED: '해지',
};

export function StatusBadge({ status }: { status: ShopStatus }) {
  return <span className={`st st-${status.toLowerCase()}`}>{SHOP_STATUS_LABEL[status]}</span>;
}

export const dt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export function ago(iso: string | null | undefined): string {
  if (!iso) return '기록 없음';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return d < 31 ? `${d}일 전` : dt(iso);
}

export const krw = (n: number) => formatWon(Math.round(n));
export const int = (n: number) => n.toLocaleString('ko-KR');

// ── 변경 이력 ─────────────────────────────────────────

const HIDE = new Set(['createdAt', 'updatedAt', 'delState', 'shopId']);

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('ko-KR');
  if (typeof v === 'string') return v.length > 80 ? `${v.slice(0, 80)}…` : v;
  const s = JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

/** 변경 전 값이 있으면 바뀐 칸만, 없으면 변경 후 주요 값 */
function changes(before: unknown, after: unknown): { key: string; from?: string; to: string }[] {
  const b = before && typeof before === 'object' && !Array.isArray(before) ? (before as Record<string, unknown>) : null;
  const a = after && typeof after === 'object' && !Array.isArray(after) ? (after as Record<string, unknown>) : null;
  if (b) {
    const keys = Object.keys(b).filter((k) => !HIDE.has(k));
    return keys
      .filter((k) => !a || JSON.stringify(b[k]) !== JSON.stringify(a[k]))
      .map((k) => ({ key: k, from: show(b[k]), to: a ? show(a[k]) : '(삭제)' }));
  }
  if (a) {
    return Object.entries(a)
      .filter(([k, v]) => !HIDE.has(k) && v !== null && typeof v !== 'object')
      .slice(0, 8)
      .map(([k, v]) => ({ key: k, to: show(v) }));
  }
  return [];
}

export function AuditList({ items, showShop = true }: { items: AuditItem[]; showShop?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return <p className="muted">기록이 없어요.</p>;
  return (
    <ul className="audit-list">
      {items.map((l) => {
        const ch = changes(l.beforeData, l.afterData);
        const isOpen = open === l.id;
        return (
          <li key={l.id}>
            <button type="button" className="audit-row" onClick={() => setOpen(isOpen ? null : l.id)} aria-expanded={isOpen}>
              <span className="audit-time">{dt(l.createdAt)}</span>
              <span className="audit-what">
                <b>
                  {AUDIT_TABLE_LABEL[l.targetTable] ?? l.targetTable}
                  {l.targetId ? ` #${l.targetId}` : ''} {AUDIT_ACTION_LABEL[l.action] ?? l.action}
                </b>
                <span className="muted small">
                  {l.actorType === 'ADMIN' ? `운영자 ${l.actorName ?? ''}` : l.actorName ?? '시스템'}
                  {showShop && l.shopName ? ` · ${l.shopName}` : ''}
                  {ch.length && l.beforeData ? ` · ${ch.map((c) => c.key).slice(0, 3).join(', ')} 변경` : ''}
                </span>
              </span>
              <span className="audit-caret" aria-hidden>
                {isOpen ? '▲' : '▼'}
              </span>
            </button>
            {isOpen && (
              <div className="audit-detail">
                {ch.length > 0 ? (
                  <table className="kv">
                    <tbody>
                      {ch.map((c) => (
                        <tr key={c.key}>
                          <th>{c.key}</th>
                          {c.from !== undefined && <td className="from">{c.from}</td>}
                          <td>{c.to}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted small">남은 값이 없어요.</p>
                )}
                <p className="muted small">
                  IP {l.ip ?? '—'}
                  {l.shopId && showShop ? (
                    <>
                      {' · '}
                      <Link href={`/admin/shops/${l.shopId}`}>매장 보기</Link>
                    </>
                  ) : null}
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
