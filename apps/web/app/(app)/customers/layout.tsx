'use client';

import { usePathname } from 'next/navigation';
import { CustomersProvider } from '../../../components/customers/context';
import { CustomerList } from '../../../components/customers/CustomerList';

/**
 * 휴대폰: 목록 ↔ 상세 화면 전환
 * 태블릿·PC(1000px~): 왼쪽 목록 + 오른쪽 상세 (2단)
 */
export default function CustomersLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const detail = path !== '/customers';
  return (
    <CustomersProvider>
      <div className="split" data-detail={detail}>
        <aside className="split-list">
          <CustomerList />
        </aside>
        <section className="split-detail">{children}</section>
      </div>
    </CustomersProvider>
  );
}
