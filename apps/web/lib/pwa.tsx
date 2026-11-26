'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/** 안드로이드 크롬이 주는 설치 이벤트 (표준 타입에 아직 없음) */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type Platform = 'ios' | 'android' | 'other';
/** 앱 설치가 안 되는 앱 안 브라우저 (카톡·네이버·인스타 등에서 링크를 열었을 때) */
export type InApp = 'kakao' | 'naver' | 'other' | null;

export interface PwaState {
  /** 이미 홈 화면 아이콘으로 실행 중 */
  standalone: boolean;
  platform: Platform;
  inApp: InApp;
  /** 아이폰 사파리가 아닌 브라우저 (공유 메뉴 위치가 다름) */
  iosNotSafari: boolean;
  /** 안드로이드에서 버튼 한 번으로 설치 가능 */
  canPrompt: boolean;
  /** 설치 창 띄우기 → 설치했으면 true */
  promptInstall: () => Promise<boolean>;
  installed: boolean;
}

const Ctx = createContext<PwaState | null>(null);

function detect() {
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const platform: Platform = /iPhone|iPad|iPod/.test(ua) || iPadOS ? 'ios' : /Android/i.test(ua) ? 'android' : 'other';
  const inApp: InApp = /KAKAOTALK/i.test(ua) ? 'kakao' : /NAVER\(inapp/i.test(ua) ? 'naver' : /Instagram|FBAN|FBAV|Line\//i.test(ua) ? 'other' : null;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const iosNotSafari = platform === 'ios' && /CriOS|FxiOS|EdgiOS|Whale|SamsungBrowser/i.test(ua);
  return { platform, inApp, standalone, iosNotSafari };
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState({ platform: 'other' as Platform, inApp: null as InApp, standalone: false, iosNotSafari: false });
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInfo(detect());
    const onPrompt = (e: Event) => {
      e.preventDefault(); // 크롬 기본 안내 대신 우리 버튼으로
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // 서비스 워커는 운영 빌드에서만 (개발 중 캐시 혼란 방지)
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'accepted') setInstalled(true);
    return outcome === 'accepted';
  }, [deferred]);

  return <Ctx.Provider value={{ ...info, canPrompt: !!deferred, promptInstall, installed }}>{children}</Ctx.Provider>;
}

export function usePwa(): PwaState {
  const v = useContext(Ctx);
  if (!v) throw new Error('PwaProvider 가 필요합니다');
  return v;
}

/** 카카오톡 안에서 연 링크를 휴대폰 기본 브라우저로 다시 열기 */
export function openInExternalBrowser() {
  const url = window.location.href;
  window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
}
