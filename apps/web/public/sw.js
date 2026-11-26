/*
 * 서비스 워커 — 최소 기능만.
 * - 화면 이동(페이지 열기)이 인터넷 문제로 실패하면 /offline.html 을 보여 준다.
 * - API·녹음 파일·결제 데이터는 절대 캐시하지 않는다 (항상 서버에서 최신 값).
 * 바꾸면 VERSION 을 올린다.
 */
const VERSION = 'v1';
const CACHE = `bc-offline-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bc-offline-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 연결 끊김 화면에 쓰는 파일(아이콘)만 캐시에서
  if (url.origin === self.location.origin && PRECACHE.includes(url.pathname) && req.mode !== 'navigate') {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }
  if (req.mode !== 'navigate') return; // 그 밖에는 페이지 열기만 관여
  event.respondWith(
    fetch(req).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return cached || new Response('인터넷 연결을 확인해 주세요.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }),
  );
});
