// 공지 줍줍 수집기 - 학사정보시스템 강의 목록 저장·자동 받기 (확장 안에서 실행)
// - kis-hook.js 가 보낸 강의 목록에서 필요한 칸만 골라 chrome.storage.local 에 저장합니다. 저장되면 서비스 워커가 내 컴퓨터로 전달합니다.
// - KIS에 로그인한 상태로 이 사이트를 열면 오늘 아직 안 받았을 때 자동으로 한 번 받습니다 (끄려면 팝업의 자동 수집).
// - 교수 이름·수강 인원은 저장하지 않고, 내 이름·학번도 읽지 않습니다.
(() => {
  const AUTO_MS = (globalThis.KKU_AUTO_HOURS ?? 12) * 3600000;
  const slim = (r) => ({
    n: String(r.CORS_NM ?? '').trim(),            // 과목명
    t: String(r.LT_DAY_TIME ?? '').trim(),        // 강의시간(강의실) 예: 월0900-1030(인문사회관 101), 목1330-1500(...)
    d: String(r.OPEN_SUST_NM ?? '').trim(),       // 개설 학과
    k: String(r.POBT_DIV_NM ?? '').trim(),        // 이수구분 (전선·전필·교양 등)
    y: String(r.OPEN_SHYR ?? '').trim(),          // 개설 학년
    c: Number(r.PNT) || 0,                        // 학점
    h: String(r.HAKSU_ID ?? '').trim(),           // 학수번호
    s: String(r.CLSS_NO ?? '').trim()             // 분반
  });

  const setStatus = (patch) => chrome.storage.local.set({ 'kis:status': { ...patch, at: Date.now() } });

  // 지금 학기 (2~7월 1학기, 8~1월 2학기). 코드는 학교 시스템 값: B01011=1학기(추정), B01012=2학기
  function currentTerm() {
    const d = new Date();
    const m = d.getMonth() + 1;
    if (m >= 2 && m <= 7) return { year: String(d.getFullYear()), term: 'B01011' };
    return { year: String(m === 1 ? d.getFullYear() - 1 : d.getFullYear()), term: 'B01012' };
  }

  let waiting = null;
  async function requestFetch(force) {
    if (window !== window.top) return;
    const { year, term } = currentTerm();
    const key = `lec:${year}:${term}`;
    const cur = (await chrome.storage.local.get(key))[key];
    if (!force && cur && Date.now() - cur.collectedAt < AUTO_MS) return;
    await setStatus({ state: 'running', message: `${year}년 강의 목록을 받는 중` });
    clearTimeout(waiting);
    waiting = setTimeout(() => setStatus({ state: 'error', message: '응답이 없습니다. 로그인되어 있는지 확인하세요.' }), 30000);
    window.postMessage({ source: 'kku-collector-cmd', type: 'fetchLectures', year, term }, location.origin);
  }

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window || ev.data?.source !== 'kku-collector') return;
    const msg = ev.data;
    if (msg.type === 'lecturesError') {
      clearTimeout(waiting);
      await setStatus({ state: 'error', message: msg.message });
      return;
    }
    if (msg.type !== 'lectures' || !Array.isArray(msg.rows)) return;
    clearTimeout(waiting);
    const key = `lec:${msg.year}:${msg.term}`;
    await chrome.storage.local.set({
      [key]: { year: msg.year, term: msg.term, count: msg.rows.length, rows: msg.rows.map(slim).filter((r) => r.n), collectedAt: Date.now() }
    });
    await setStatus({ state: 'ok', message: `${msg.year}년 ${msg.rows.length}개 과목을 저장했습니다.` });
  });

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg?.type === 'kisFetch') { requestFetch(true); sendResponse({ ok: true }); }
    return false;
  });

  // 로그인된 화면이 준비될 시간을 주고 자동으로 한 번 받는다 (설정이 꺼져 있으면 하지 않음)
  if (window === window.top) {
    setTimeout(async () => {
      if (!(await globalThis.kkuSettings()).auto) return;
      requestFetch(false);
    }, 6000);
  }
})();
