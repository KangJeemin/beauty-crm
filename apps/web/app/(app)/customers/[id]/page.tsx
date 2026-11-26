'use client';

import type { CustomerDetail } from '@beauty-crm/shared';
import { formatPhone, formatWon } from '@beauty-crm/shared';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCustomersReload } from '../../../../components/customers/context';
import { TagChip } from '../../../../components/customers/TagChip';
import { PassesCard } from '../../../../components/payment/PassesCard';
import { TreatmentTimeline } from '../../../../components/records/TreatmentTimeline';
import { Alert, Button } from '../../../../components/ui';
import { api } from '../../../../lib/api';
import { fmtDate, relDay } from '../../../../lib/format';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sp = useSearchParams();
  const saved = sp.get('saved');
  const paid = sp.get('paid');
  const { version, reload } = useCustomersReload();
  const [c, setC] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api<CustomerDetail>(`/customers/${id}`)
      .then(setC)
      .catch((e) => setError(e.message));
  }, [id, version]);

  async function remove() {
    if (!c || !window.confirm(`${c.name} 고객님을 삭제할까요?\n시술·결제 기록은 지워지지 않고 보관됩니다.`)) return;
    try {
      await api(`/customers/${c.id}`, { method: 'DELETE' });
      reload();
      router.replace('/customers');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error) {
    return (
      <div className="card">
        <Link href="/customers" className="back">
          ← 고객 목록
        </Link>
        <Alert>{error}</Alert>
      </div>
    );
  }
  if (!c) return <div className="card muted">불러오는 중…</div>;

  const age = c.birthYear ? new Date().getFullYear() - c.birthYear + 1 : null;

  return (
    <div className="stack">
      <div className="card">
        <Link href="/customers" className="back">
          ← 고객 목록
        </Link>
        <div className="detail-head">
          <div>
            <h1>{c.name}</h1>
            <p className="muted">
              {[c.gender === 'F' ? '여성' : c.gender === 'M' ? '남성' : null, c.birthYear ? `${c.birthYear}년생 (${age}세)` : null]
                .filter(Boolean)
                .join(' · ') || '기본 정보 없음'}
            </p>
          </div>
          <Link href={`/customers/${c.id}/edit`} className="btn btn-ghost btn-sm">
            수정
          </Link>
        </div>

        {c.phone ? (
          <a href={`tel:${c.phone}`} className="phone-line">
            <span>{formatPhone(c.phone)}</span>
            <small>전화 걸기</small>
          </a>
        ) : (
          <p className="muted">전화번호 없음</p>
        )}

        {c.tags.length > 0 && (
          <div className="chips-wrap">
            {c.tags.map((t) => (
              <TagChip key={t.id} tag={t} />
            ))}
          </div>
        )}

        {c.memo && (
          <div className="memo-box">
            <p className="label">메모</p>
            <p>{c.memo}</p>
          </div>
        )}

        <dl className="stats">
          <div>
            <dt>방문</dt>
            <dd>{c.visitCount}회</dd>
          </div>
          <div>
            <dt>최근 방문</dt>
            <dd>{c.lastVisitAt ? relDay(c.lastVisitAt) : '—'}</dd>
          </div>
          <div>
            <dt>누적 결제</dt>
            <dd>{formatWon(c.totalPaidAmount)}</dd>
          </div>
        </dl>
      </div>

      {saved && <Alert kind="ok">시술 기록을 저장했어요.</Alert>}
      {paid && <Alert kind="ok">시술 기록과 결제를 저장했어요.</Alert>}
      <TreatmentTimeline customerId={c.id} highlightId={saved ? Number(saved) : paid ? Number(paid) : undefined} />
      <PassesCard customerId={c.id} refreshKey={version} />

      <div className="card small muted">
        <p>등록일 {fmtDate(c.createdAt)}</p>
        <p>개인정보 수집·이용 동의: {c.consentAt ? `${fmtDate(c.consentAt)} 받음` : '아직 받지 않음'}</p>
        <Button variant="danger" className="btn-sm" onClick={remove}>
          고객 삭제
        </Button>
      </div>
    </div>
  );
}
