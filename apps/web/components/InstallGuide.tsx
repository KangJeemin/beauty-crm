'use client';

import { useEffect, useState } from 'react';
import { openInExternalBrowser, usePwa } from '../lib/pwa';
import { Button } from './ui';

const DISMISS_KEY = 'bc_install_dismissed_until';

/** 아이폰 공유 버튼 모양 (□↑) */
function ShareGlyph() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" width="22" height="22" aria-label="공유 버튼" role="img">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="install-steps">
      {items.map((x, i) => (
        <li key={i}>
          <span className="step-no">{i + 1}</span>
          <span>{x}</span>
        </li>
      ))}
    </ol>
  );
}

/** 휴대폰·브라우저에 맞는 설치 방법 */
function GuideBody({ onDone }: { onDone: () => void }) {
  const pwa = usePwa();
  const [copied, setCopied] = useState(false);

  if (pwa.inApp) {
    return (
      <>
        <p>
          지금은 <b>{pwa.inApp === 'kakao' ? '카카오톡' : pwa.inApp === 'naver' ? '네이버 앱' : '다른 앱'}</b> 안에서 열려 있어서 아이콘을 만들 수 없어요.
          {pwa.platform === 'ios' ? ' 사파리' : ' 크롬이나 삼성 인터넷'}으로 다시 열어 주세요.
        </p>
        {pwa.inApp === 'kakao' ? (
          <Button className="btn-block" onClick={openInExternalBrowser}>
            {pwa.platform === 'ios' ? '사파리로 열기' : '다른 브라우저로 열기'}
          </Button>
        ) : (
          <>
            <Steps items={[<>오른쪽 위나 아래의 <b>⋯</b> 메뉴를 눌러요</>, <><b>다른 브라우저로 열기</b>를 눌러요</>, <>열린 화면에서 다시 <b>아이콘 만들기</b>를 눌러요</>]} />
            <Button
              variant="ghost"
              className="btn-block"
              onClick={() => {
                navigator.clipboard?.writeText(window.location.origin).then(() => setCopied(true)).catch(() => undefined);
              }}
            >
              {copied ? '주소를 복사했어요' : '주소 복사하기'}
            </Button>
          </>
        )}
      </>
    );
  }

  if (pwa.platform === 'ios') {
    return (
      <>
        {pwa.iosNotSafari ? (
          <Steps
            items={[
              <>주소창 오른쪽(또는 아래)의 공유 버튼 <ShareGlyph /> 을 눌러요</>,
              <>목록을 내려서 <b>홈 화면에 추가</b>를 눌러요</>,
              <>오른쪽 위 <b>추가</b>를 누르면 끝!</>,
            ]}
          />
        ) : (
          <Steps
            items={[
              <>화면 <b>맨 아래 가운데</b>의 공유 버튼 <ShareGlyph /> 을 눌러요 <span className="muted small">(아이패드는 오른쪽 위)</span></>,
              <>목록을 위로 올려서 <b>홈 화면에 추가</b>를 눌러요</>,
              <>오른쪽 위 <b>추가</b>를 누르면 끝!</>,
            ]}
          />
        )}
        <p className="muted small">아이폰은 아이콘으로 처음 열 때 한 번 더 로그인해야 해요. 그 다음부터는 계속 로그인돼 있어요.</p>
        {pwa.iosNotSafari && <p className="muted small">공유 메뉴에 &lsquo;홈 화면에 추가&rsquo;가 없으면 사파리로 이 주소를 열어 주세요.</p>}
        <Button variant="ghost" className="btn-block" onClick={onDone}>
          알겠어요
        </Button>
      </>
    );
  }

  if (pwa.canPrompt) {
    return (
      <>
        <p>버튼을 누르고 나오는 창에서 <b>설치</b>를 누르면 홈 화면에 아이콘이 생겨요.</p>
        <Button
          className="btn-block"
          onClick={async () => {
            if (await pwa.promptInstall()) onDone();
          }}
        >
          지금 아이콘 만들기
        </Button>
      </>
    );
  }

  return (
    <>
      {pwa.platform === 'android' ? (
        <>
          <p className="install-sub">크롬</p>
          <Steps items={[<>오른쪽 위 <b>⋮</b> 를 눌러요</>, <><b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 눌러요</>, <><b>설치</b>(또는 <b>추가</b>)를 누르면 끝!</>]} />
          <p className="install-sub">삼성 인터넷</p>
          <Steps items={[<>아래쪽 <b>≡</b> 를 눌러요</>, <><b>현재 페이지 추가</b> → <b>홈 화면</b>을 눌러요</>]} />
        </>
      ) : (
        <Steps items={[<>크롬·엣지 주소창 오른쪽의 <b>설치</b> 아이콘(모니터 모양)을 눌러요</>, <><b>설치</b>를 누르면 바탕화면·시작 메뉴에 생겨요</>]} />
      )}
      <p className="muted small">이미 아이콘을 만들었다면 메뉴에 &lsquo;앱 열기&rsquo;로 보일 수 있어요.</p>
      <Button variant="ghost" className="btn-block" onClick={onDone}>
        알겠어요
      </Button>
    </>
  );
}

export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="install-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <img src="/icons/icon-192.png" alt="" width={48} height={48} />
          <h2 id="install-title">홈 화면에 아이콘 만들기</h2>
          <button type="button" className="sheet-close" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>
        <GuideBody onDone={onClose} />
      </div>
    </div>
  );
}

/** 홈 화면 위쪽 안내 (아이콘으로 실행 중이거나 닫았으면 숨김) */
export function InstallBanner() {
  const pwa = usePwa();
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let until = 0;
    try {
      until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    } catch {
      /* 저장소를 못 쓰는 환경 */
    }
    setHidden(until > Date.now());
  }, []);

  if (pwa.standalone || pwa.installed || hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 14 * 86400_000)); // 2주 뒤 다시
    } catch {
      /* 무시 */
    }
    setHidden(true);
  }

  return (
    <>
      <div className="install-banner">
        <img src="/icons/icon-192.png" alt="" width={44} height={44} />
        <div className="install-text">
          <b>홈 화면에 아이콘 만들기</b>
          <span>앱처럼 한 번에 열려요</span>
        </div>
        <Button className="btn-sm" onClick={() => setOpen(true)}>
          만들기
        </Button>
        <button type="button" className="install-x" aria-label="안내 닫기" onClick={dismiss}>
          ✕
        </button>
      </div>
      <InstallSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** 설정 화면 항목 */
export function InstallCard() {
  const pwa = usePwa();
  const [open, setOpen] = useState(false);
  if (pwa.standalone || pwa.installed) {
    return (
      <div className="link-card static">
        <b>홈 화면 아이콘</b>
        <span className="muted">지금 아이콘으로 쓰고 계세요 ✓</span>
      </div>
    );
  }
  return (
    <>
      <button type="button" className="link-card" onClick={() => setOpen(true)}>
        <b>홈 화면에 아이콘 만들기</b>
        <span className="muted">앱처럼 한 번에 열기</span>
      </button>
      <InstallSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
