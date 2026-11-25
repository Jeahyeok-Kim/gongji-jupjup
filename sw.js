// 공지 줍줍 서비스 워커: 한 번 열어 본 화면은 오프라인에서도 열리고, 새 데이터는 네트워크가 되면 받아 온다.
// - 화면 파일(html·css·js·아이콘): 네트워크 먼저(새 버전이 바로 보임), 안 되면 저장된 것
// - 공지 데이터(version·notices·calendar·overrides 의 json): 항상 네트워크 먼저, 안 되면 저장된 것
const CACHE = 'gongji-v71';
const CORE = ['./', 'index.html', 'css/style.css?v=71', 'css/enhanced.css?v=71', 'manifest.webmanifest', 'icons/icon-192.png',
  'js/benefit.js', 'js/sync.js', 'js/logic.js', 'js/overrides.js', 'js/extras.js', 'js/summary.js', 'js/personal.js', 'js/eligibility.js', 'js/ask.js', 'js/cal.js',
  'js/i18n.js?v=71', 'js/i18n2.js', 'js/i18n3.js', 'js/i18n4.js', 'js/i18n5.js?v=71', 'js/i18n_depts.js?v=71', 'js/theme.js', 'js/plan.js?v=71', 'js/planui.js?v=71', 'js/track.js?v=71', 'js/palette.js', 'js/ttimage.js', 'js/ttics.js', 'js/noticeimage.js?v=71', 'js/app.js?v=71', 'js/enhanced.js?v=71', 'icons/mark.svg',
  'data/notices.js', 'data/glossary.js', 'data/calendar.js', 'data/config.js', 'data/courses.js', 'data/timetable.js', 'data/professors.js', 'data/gradreq.js', 'js/curriculum.js?v=71', 'js/campusroute.js?v=71'];
const DATA_JSON = /\/data\/(version|notices|calendar|glossary|overrides)\.json$|\/data\/gongji\.ics$/;

self.addEventListener('install', (e) => {
  // 일부 파일(calendar.js 등)이 없어도 설치는 되게 하나씩 담는다
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                     // 다른 서버(깃허브 raw·구글 시트)는 건드리지 않음
  if (/^\/(status|reminders|ask|mine|ingest)$/.test(url.pathname)) return;   // 내 컴퓨터 서버의 API 는 언제나 새로 묻는다

  if (DATA_JSON.test(url.pathname)) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || Response.error())));
    return;
  }

  // 화면 파일(html·css·js·아이콘): 네트워크를 먼저 쓴다. 새 버전을 올리면 바로 새 화면이 보이게 (예전에는 저장본을 먼저 보여 줘서
  // 고친 디자인이 한 번 더 새로고침해야 보였음). 3초 안에 답이 없거나 오프라인이면 저장해 둔 것을 쓴다.
  e.respondWith(new Promise((resolve) => {
    let done = false;
    const fromCache = () => caches.match(req, { ignoreSearch: true });
    const timer = setTimeout(() => {
      fromCache().then((hit) => { if (hit && !done) { done = true; resolve(hit); } });
    }, 3000);
    fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      if (!done) { done = true; clearTimeout(timer); resolve(res); }
    }).catch(() => fromCache().then((hit) => {
      clearTimeout(timer);
      if (!done) { done = true; resolve(hit || Response.error()); }
    }));
  }));
});

// 알림을 누르면 열려 있는 앱 창으로 가고, 없으면 새로 연다
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./#/home');
  }));
});
