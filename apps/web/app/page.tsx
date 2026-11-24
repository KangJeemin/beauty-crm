'use client';

import type { ApiResponse, HealthStatus } from '@beauty-crm/shared';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

/** 0단계 확인용 화면 — 1단계에서 로그인 화면으로 교체한다. */
export default function Home() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json() as Promise<ApiResponse<HealthStatus>>)
      .then((res) => setHealth(res.data))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main className="shell">
      <h1>미용 고객 관리</h1>
      <p className="muted">개발 환경 점검</p>
      <ul className="checks">
        <li>
          <span>웹(Next.js)</span>
          <b className="ok">정상</b>
        </li>
        <li>
          <span>API(Nest.js)</span>
          <b className={health ? 'ok' : error ? 'bad' : ''}>{health ? '정상' : error ? '연결 실패' : '확인 중…'}</b>
        </li>
        <li>
          <span>DB(MariaDB)</span>
          <b className={health?.db === 'up' ? 'ok' : health ? 'bad' : ''}>
            {health ? (health.db === 'up' ? '정상' : '연결 실패') : '—'}
          </b>
        </li>
        <li>
          <span>파일 저장소(SeaweedFS)</span>
          <b className={health?.storage === 'up' ? 'ok' : health ? 'bad' : ''}>
            {health ? (health.storage === 'up' ? '정상' : '연결 실패') : '—'}
          </b>
        </li>
      </ul>
      <button className="record" type="button" disabled>
        녹음 (3단계에서 연결)
      </button>
    </main>
  );
}
