'use client';

import type { AiUsageReport } from '@beauty-crm/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Section } from '../../../../components/ui';
import { int, krw } from '../../../../components/admin/common';
import { adminApi } from '../../../../lib/admin-api';

const nowMonth = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
function shift(month: string, n: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export default function AiUsagePage() {
  const [month, setMonth] = useState(nowMonth());
  const [r, setR] = useState<AiUsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setR(null);
    adminApi<AiUsageReport>(`/admin/ai-usage?month=${month}`).then(setR).catch((e) => setError(e.message));
  }, [month]);

  const max = Math.max(1, ...(r?.days.map((d) => d.calls) ?? [1]));

  return (
    <div className="page page-wide">
      <header className="page-head">
        <h1>AI 사용량</h1>
        <p className="muted">음성 받아쓰기(CLOVA Speech)와 정리(HyperCLOVA X) 호출 기록. 비용은 .env 단가로 계산한 추정치예요.</p>
      </header>
      <div className="date-nav">
        <Button variant="ghost" className="btn-icon" aria-label="전달" onClick={() => setMonth(shift(month, -1))}>
          ◀
        </Button>
        <span className="date-pick">
          <span>
            {month.slice(0, 4)}년 {Number(month.slice(5))}월
          </span>
        </span>
        <Button variant="ghost" className="btn-icon" aria-label="다음 달" disabled={month >= nowMonth()} onClick={() => setMonth(shift(month, 1))}>
          ▶
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {!r ? (
        <p className="muted">불러오는 중…</p>
      ) : (
        <div className="stack">
          <div className="stat-grid">
            <div className="stat">
              <span>추정 비용</span>
              <b>{krw(r.totals.costKrw)}</b>
              <small>매장당 {krw(r.shops.length ? r.totals.costKrw / r.shops.length : 0)}</small>
            </div>
            <div className={`stat ${r.totals.failures ? 'warn' : ''}`}>
              <span>호출</span>
              <b>{int(r.totals.calls)}</b>
              <small>실패 {r.totals.failures}</small>
            </div>
            <div className="stat">
              <span>받아쓴 음성</span>
              <b>{(r.totals.sttSeconds / 60).toFixed(1)}분</b>
              <small>STT</small>
            </div>
            <div className="stat">
              <span>LLM 토큰</span>
              <b>{int(r.totals.llmInput + r.totals.llmOutput)}</b>
              <small>
                입력 {int(r.totals.llmInput)} · 출력 {int(r.totals.llmOutput)}
              </small>
            </div>
          </div>

          <Section title="매장별">
            {r.shops.length === 0 ? (
              <Empty title="이 달에는 사용 기록이 없어요" />
            ) : (
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>매장</th>
                    <th className="num">녹음</th>
                    <th className="num">호출</th>
                    <th className="num">실패</th>
                    <th className="num">음성(분)</th>
                    <th className="num">비용</th>
                  </tr>
                </thead>
                <tbody>
                  {r.shops.map((s) => (
                    <tr key={s.shopId}>
                      <td data-label="매장">
                        <Link href={`/admin/shops/${s.shopId}`}>{s.shopName}</Link>
                      </td>
                      <td data-label="녹음" className="num">{int(s.voiceCount)}</td>
                      <td data-label="호출" className="num">{int(s.calls)}</td>
                      <td data-label="실패" className="num">{s.failures}</td>
                      <td data-label="음성(분)" className="num">{(s.sttSeconds / 60).toFixed(1)}</td>
                      <td data-label="비용" className="num">{krw(s.costKrw)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {r.days.length > 0 && (
            <Section title="날짜별 호출">
              <ul className="bars">
                {r.days.map((d) => (
                  <li key={d.date}>
                    <div className="bar-row" style={{ cursor: 'default' }}>
                      <span className="bar-day">{Number(d.date.slice(8))}일</span>
                      <span className="bar-track">
                        <span className="bar-fill" style={{ width: `${(d.calls / max) * 100}%` }} />
                      </span>
                      <span className="bar-amt">
                        {d.calls}회{d.failures ? ` (실패 ${d.failures})` : ''}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
