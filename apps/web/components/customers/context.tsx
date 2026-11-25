'use client';

import { createContext, useCallback, useContext, useState } from 'react';

/** 고객 등록·수정·삭제 후 왼쪽 목록을 다시 불러오기 위한 신호 */
const Ctx = createContext<{ version: number; reload: () => void }>({ version: 0, reload: () => undefined });

export function CustomersProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return <Ctx.Provider value={{ version, reload }}>{children}</Ctx.Provider>;
}

export const useCustomersReload = () => useContext(Ctx);
