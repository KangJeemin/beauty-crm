'use client';

import Link from 'next/link';
import { IconMic } from '../../../components/icons';
import { Empty, Section } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return '좋은 아침이에요';
  if (h < 17) return '오늘도 힘내세요';
  return '오늘 하루 수고 많으셨어요';
}

export default function HomePage() {
  const { user } = useAuth();
  return (
    <div className="page">
      <header className="page-head">
        <p className="muted">{user?.shopName}</p>
        <h1>
          {user?.name}님, {greeting()}
        </h1>
      </header>

      <Link href="/records" className="record-hero">
        <span className="record-circle">
          <IconMic />
        </span>
        <span>
          <b>눌러서 시술 기록하기</b>
          <small>말로 하면 자동으로 정리돼요 (3단계에서 연결)</small>
        </span>
      </Link>

      <div className="grid-2">
        <Section title="오늘 매출">
          <p className="big-num">— 원</p>
          <p className="muted">정산 기능은 4단계에서 연결됩니다.</p>
        </Section>
        <Section title="최근 시술 기록">
          <Empty title="아직 기록이 없어요" desc="녹음 버튼을 눌러 첫 기록을 남겨 보세요." />
        </Section>
      </div>
    </div>
  );
}
