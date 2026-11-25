'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth';
import { IconGear, IconHome, IconMic, IconUsers, IconWon } from './icons';

const NAV = [
  { href: '/home', label: '홈', Icon: IconHome },
  { href: '/customers', label: '고객', Icon: IconUsers },
  { href: '/records', label: '녹음', Icon: IconMic, primary: true },
  { href: '/settlement', label: '정산', Icon: IconWon },
  { href: '/settings', label: '설정', Icon: IconGear },
];

/**
 * 반응형 레이아웃
 *  - 휴대폰(~767px)   : 하단 탭 + 가운데 큰 녹음 버튼
 *  - 태블릿(768~1199) : 왼쪽 좁은 아이콘 메뉴
 *  - PC(1200~)        : 왼쪽 넓은 사이드바 (매장명·사용자)
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user } = useAuth();

  return (
    <div className="shell-app">
      <nav className="sidenav" aria-label="주 메뉴">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            {user?.shopName?.slice(0, 1)}
          </span>
          <span className="brand-text">
            <b>{user?.shopName}</b>
            <small>
              {user?.name} · {user?.role === 'OWNER' ? '원장' : '디자이너'}
            </small>
          </span>
        </div>
        {NAV.map(({ href, label, Icon, primary }) => (
          <Link key={href} href={href} className={`navlink ${path.startsWith(href) ? 'on' : ''} ${primary ? 'primary' : ''}`}>
            <Icon />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <main className="content">{children}</main>

      <nav className="tabbar" aria-label="주 메뉴">
        {NAV.map(({ href, label, Icon, primary }) => (
          <Link key={href} href={href} className={`tab ${path.startsWith(href) ? 'on' : ''} ${primary ? 'tab-primary' : ''}`}>
            <span className="tab-icon">
              <Icon />
            </span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
