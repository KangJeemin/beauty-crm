'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearAdminSession, getAdminSession, type AdminSession } from '../../../lib/admin-api';

const NAV = [
  { href: '/admin', label: '현황', exact: true },
  { href: '/admin/shops', label: '매장' },
  { href: '/admin/feedback', label: '의견' },
  { href: '/admin/ai-usage', label: 'AI 사용량' },
  { href: '/admin/audit', label: '변경 이력' },
];

/** 운영자 화면 — 매장 화면(AppShell)과 완전히 분리 */
export default function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [session, setSession] = useState<AdminSession | null | undefined>(undefined);

  useEffect(() => {
    const s = getAdminSession();
    setSession(s);
    if (!s) router.replace('/admin/login');
  }, [router]);

  if (!session) return <div className="splash">불러오는 중…</div>;

  return (
    <div className="admin-shell">
      <header className="admin-top">
        <Link href="/admin" className="admin-brand">
          운영
        </Link>
        <nav className="admin-nav" aria-label="운영자 메뉴">
          {NAV.map((n) => {
            const on = n.exact ? path === n.href : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={on ? 'on' : ''}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          className="link-btn small"
          onClick={() => {
            clearAdminSession();
            router.replace('/admin/login');
          }}
        >
          {session.name} · 로그아웃
        </button>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}
