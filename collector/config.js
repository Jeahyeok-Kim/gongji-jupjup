// 사이트별 수집 대상 게시판 목록 (콘텐츠 스크립트와 팝업이 함께 사용)
// menu: 학교 사이트의 MENU_ID. 게시판 파라미터(SITE_NO, BOARD_SEQ 등)는 실행 시 해당 메뉴 페이지에서 읽어옵니다.
// news: true 이면 '최대 건수' 옵션을 적용합니다. off: true 이면 기본 체크 해제.
globalThis.KKU_BOARDS = {
  'www.kku.ac.kr': [
    { menu: 1740, name: '학사공지' },
    { menu: 1750, name: '장학공지' },
    { menu: 1760, name: '국제교류' },
    { menu: 1770, name: '취업/창업' },
    { menu: 1780, name: '입찰공지' },
    { menu: 1790, name: '일반공지' },
    { menu: 1800, name: '채용공지' },
    { menu: 1810, name: '투데이뉴스', news: true },
    { menu: 1820, name: '행사안내' },
    { menu: 1830, name: '사회봉사' },
    { menu: 1840, name: '아르바이트' },
    { menu: 1850, name: '외부행사/공모전' },
    { menu: 1860, name: 'Q&A', off: true, note: '개인 문의가 섞여 있을 수 있어 기본 해제' },
    { menu: 1870, name: '교직원 자료실', off: true, note: '학생 대상 정보가 아니어서 기본 해제' },
    { menu: 1880, name: '학생 자료실' }
  ],
  'int.kku.ac.kr': [
    { menu: 80, name: '국제교육원 공지사항' },
    { menu: 230, name: '유학생 공지 (留学生公告栏)' }
  ],
  'ids.kku.ac.kr': [
    { menu: 950, name: 'AX융합학부 공지사항' }
  ],
  // 이음교육시스템: 로그인한 브라우저에서만 보임. 글에 private 표시가 붙고, 파이프라인은 기본적으로 공개 데이터에서 제외함
  'im.kku.ac.kr': [
    { menu: 1, name: '이음교육시스템 공지', note: '이음에 로그인한 탭에서 실행 (menu 1 = 공지 게시판)' }
  ]
};

// 학교 기본 정보 (학기마다 한 번 받으면 되는 것): 학사일정, 요람, 안내 페이지, 규정
globalThis.KKU_REFERENCE = {
  // www.kku.ac.kr 에서
  scheduleSiteNo: 2,                 // 연간주요일정(MENU_ID=1350)의 GLOCAL 캠퍼스 번호
  yoramMenu: 590,                    // 요람 게시판
  pages: [                           // 글로 된 안내 페이지 (본문 글자만 저장)
    { menu: 650, name: '주요 전화번호' },
    { menu: 1320, name: '학사 종합안내' },
    { menu: 1080, name: '장학안내' },
    { menu: 1090, name: '통학교통 안내' },
    { menu: 1120, name: '예비군' },
    { menu: 1390, name: '증명서 발급(학부생)' }
  ],
  // rule.konkuk.ac.kr (규정정보시스템) 에서 받을 규정 이름 (앞 번호는 빼고 적음)
  rules: [
    '건국대학교 학칙',
    'GLOCAL(글로컬)캠퍼스 장학규정',
    '장학규정',
    'GLOCAL(글로컬)캠퍼스 외국인학생에 관한 학사시행내규',
    'GLOCAL(글로컬)캠퍼스 비교과 프로그램 운영 내규',
    'GLOCAL(글로컬)캠퍼스 현장실습학기제 운영 및 학점 인정에 관한 내규',
    'GLOCAL(글로컬)캠퍼스 원격수업 운영 내규',
    'GLOCAL(글로컬)캠퍼스 K-MOOC강좌 학점인정 시행내규',
    '건국대학교 생활관규정',
    '건국대학교 외국대학과의 학생교류에 관한 내규',
    '사회봉사 학점인정 운영요강',
    'GLOCAL(글로컬)캠퍼스 창업인턴십 학점인정제 운영에 관한 내규',
    'GLOCAL(글로컬)캠퍼스 학습경험 학점인정제(RPL) 내규',
    '건국대학교 학생준수규정'
  ]
};

// ---- 공통 설정·도우미 (서비스 워커 · 콘텐츠 스크립트 · 팝업이 함께 사용) ----
globalThis.KKU_VERSION = '1.3.0';

// 자동 수집이 백그라운드 탭으로 여는 주소 (login: 로그인해야 보이는 곳이라 기본으로는 꺼 둠)
globalThis.KKU_SITES = [
  { host: 'www.kku.ac.kr', name: '글로컬캠퍼스 홈페이지', url: 'https://www.kku.ac.kr/cms/FR_CON/index.do?MENU_ID=1740' },
  { host: 'int.kku.ac.kr', name: '국제교육원', url: 'https://int.kku.ac.kr/' },
  { host: 'ids.kku.ac.kr', name: 'AX융합학부', url: 'https://ids.kku.ac.kr/' },
  { host: 'im.kku.ac.kr', name: '이음교육시스템', url: 'https://im.kku.ac.kr/ko/community/community/notice/list/1', login: true }
];

globalThis.KKU_DEFAULT_SETTINGS = {
  auto: true,                                  // 정해진 간격으로 알아서 수집
  intervalHours: 6,                            // 수집 간격(시간)
  sites: { 'www.kku.ac.kr': true, 'int.kku.ac.kr': true, 'ids.kku.ac.kr': true, 'im.kku.ac.kr': false },
  server: 'http://127.0.0.1:8765',             // 내 컴퓨터의 수신 서버 (pipeline/receiver.py)
  keepMonths: 6,                               // 공지를 모으고 남겨 둘 기간(개월). 6 = 한 학기 이상, 12 = 1년(두 학기)
  newsLimit: 300,                              // 투데이뉴스는 최근 몇 건까지 (보관 기간 안에서)
  notify: true                                 // 새 공지 · 웹 앱 반영 · 저장한 공지 마감(하루 전·당일) 알림
};

// 저장된 설정 + 기본값. 예전 버전의 '자동 수집' 체크(autoCollect)도 이어받는다.
globalThis.kkuSettings = async () => {
  const got = await chrome.storage.local.get(['settings', 'autoCollect']);
  const d = globalThis.KKU_DEFAULT_SETTINGS;
  const u = got.settings && typeof got.settings === 'object' ? got.settings : {};
  const out = { ...d, ...u, sites: { ...d.sites, ...(u.sites ?? {}) } };
  if (u.auto === undefined && got.autoCollect === false) out.auto = false;
  out.intervalHours = Math.min(24, Math.max(1, Number(out.intervalHours) || d.intervalHours));
  out.keepMonths = Math.min(24, Math.max(6, Math.round(Number(out.keepMonths) || d.keepMonths)));
  out.server = String(out.server || d.server).replace(/\/+$/, '');
  return out;
};

const kkuGenerator = () => `kku-collector ${globalThis.KKU_VERSION}`;

// 보관 기간의 첫날 'YYYY-MM-DD': 오늘에서 months 개월 전 같은 날 (그 달에 없는 날이면 그 달 마지막 날).
// 수집기는 이 날짜보다 오래된 글이 나오면 그 게시판을 그만 읽고, 내보낼 때도 이 날짜 이후 글만 보낸다.
globalThis.kkuSince = (months, now = new Date()) => {
  const m = Math.min(24, Math.max(6, Math.round(Number(months) || 6)));
  const y = now.getFullYear();
  const mon = now.getMonth() - m;
  const first = new Date(y, mon, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const d = new Date(first.getFullYear(), first.getMonth(), Math.min(now.getDate(), last));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// 게시판 한 쪽을 읽은 뒤 다음 쪽으로 갈지 정한다 (수집기 crawler.js 와 시험이 함께 씀)
//   'done'  : 보관 기간보다 오래된 글이나 목록 끝·건수 상한까지 왔다 (보관 기간을 빈틈없이 가짐)
//   'known' : 한 쪽이 전부 이미 아는 글이라 멈춘다 (증분 수집. 빈 곳을 채우는 중이거나 전부 다시 받을 때는 계속)
//   'next'  : 다음 쪽으로
globalThis.kkuNextPage = ({ items, since, full, backfill, fresh, seen, limit, listLen, pageSize }) => {
  // 고정 공지는 날짜와 상관없이 맨 위에 있으므로 빼고 본다
  const oldest = (items || []).filter((it) => !it.pinned && it.date)
    .reduce((m, it) => { const d = String(it.date).slice(0, 10); return !m || d < m ? d : m; }, '');
  if (since && oldest && oldest < since) return 'done';
  if (seen >= limit || listLen < pageSize) return 'done';
  if (!full && !backfill && fresh === 0) return 'known';
  return 'next';
};
// 처음이거나 보관 기간을 늘렸으면(전에 채운 첫날이 새 첫날보다 늦으면) 거슬러 올라가 빈 곳을 채워야 한다
globalThis.kkuNeedsBackfill = (coveredSince, since) => !!since && !(coveredSince && coveredSince <= since);

// 내보내기 꾸러미 3종: 공지 · 강의 시간표 · 학교 기본 정보 (없으면 null)
globalThis.kkuNoticesPayload = async () => {
  const all = await chrome.storage.local.get(null);
  const s = await globalThis.kkuSettings();
  const since = globalThis.kkuSince(s.keepMonths);
  const notices = [];
  const boards = [];
  for (const [key, value] of Object.entries(all)) {
    // 보관 기간(since 이후에 올라온 글)만 보낸다. 날짜를 모르는 글은 보낸다.
    if (key.startsWith('n:')) { if (!value?.date || String(value.date).slice(0, 10) >= since) notices.push(value); }
    else if (key.startsWith('s:')) boards.push(value);
  }
  if (notices.length === 0) return null;
  notices.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.bbsSeq - a.bbsSeq));
  return { schema: 1, generator: kkuGenerator(), generatedAt: new Date().toISOString(),
    period: { months: s.keepMonths, since }, boards, count: notices.length, notices };
};
globalThis.kkuLecturesPayload = async () => {
  const all = await chrome.storage.local.get(null);
  const terms = Object.entries(all).filter(([k]) => k.startsWith('lec:')).map(([, v]) => v);
  if (terms.length === 0) return null;
  return { schema: 1, kind: 'kku-lectures', generator: kkuGenerator(), generatedAt: new Date().toISOString(), terms };
};
globalThis.kkuReferencePayload = async () => {
  const { 'ref:kku': kku, 'ref:rule': rule } = await chrome.storage.local.get(['ref:kku', 'ref:rule']);
  if (!kku && !rule) return null;
  return {
    schema: 1, kind: 'kku-reference', generator: kkuGenerator(), generatedAt: new Date().toISOString(),
    calendar: kku?.calendar ?? [], yoram: kku?.yoram ?? [], pages: kku?.pages ?? [],
    rules: rule?.rules ?? [], collected: { kku: kku?.collectedAt ?? null, rule: rule?.collectedAt ?? null }
  };
};
globalThis.kkuPayload = (kind) => ({ notices: globalThis.kkuNoticesPayload, lectures: globalThis.kkuLecturesPayload, reference: globalThis.kkuReferencePayload })[kind]();
