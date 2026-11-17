// 공지 줍줍 수집기 - 학사정보시스템(kis.kku.ac.kr) 강의 목록 (페이지 안에서 실행)
// 1) 내가 '과목조회'의 조회를 누를 때 화면이 받는 응답을 옆에서 읽습니다.
// 2) 확장이 요청하면 그 조회와 같은 요청을 한 번 보냅니다(조회 버튼을 누르는 것과 같은 읽기 전용 요청, 로그인한 내 세션 그대로).
(() => {
  if (window.__kkuKisHook) return;
  window.__kkuKisHook = true;
  const LEC = 'CourLectureAplyInqPop/find.do';
  let template = null; // 화면이 마지막으로 보낸 강의 조회 요청 (주소·머리글·본문)

  const open = XMLHttpRequest.prototype.open;
  const setHeader = XMLHttpRequest.prototype.setRequestHeader;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__kkuUrl = String(url);
    this.__kkuHeaders = {};
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (this.__kkuHeaders) this.__kkuHeaders[k] = v;
    return setHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const isLec = (this.__kkuUrl || '').includes(LEC);
    if (isLec && typeof body === 'string') template = { url: this.__kkuUrl, headers: { ...this.__kkuHeaders }, body };
    this.addEventListener('load', () => {
      try { if (isLec) deliver(this.responseText || '', typeof body === 'string' ? body : ''); } catch { /* 화면 동작에는 영향이 없게 무시 */ }
    });
    return send.apply(this, arguments);
  };

  const post = (data) => window.postMessage({ source: 'kku-collector', ...data }, location.origin);

  function deliver(text, body) {
    if (!text.includes('"DS_LECTUREINFO"')) {
      if (text.includes('"ERRMSGINFO"')) throw new Error(JSON.parse(text).ERRMSGINFO?.ERRMSG || '학교 시스템 오류');
      return;
    }
    const rows = JSON.parse(text).DS_LECTUREINFO;
    if (!Array.isArray(rows) || rows.length === 0) return;
    const params = new URLSearchParams(body);
    post({ type: 'lectures', year: params.get('@d1#ltYy') || String(rows[0].LT_YY || ''), term: params.get('@d1#ltShtm') || String(rows[0].LT_SHTM || ''), rows });
  }

  // 화면이 한 번도 조회하지 않았을 때 쓰는 기본 요청 본문 (실제 화면이 보내는 모양을 따름)
  function defaultBody(year, term) {
    const d = new Date();
    const cur = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const p = new URLSearchParams();
    p.set('_AUTH_MENU_KEY', '1130308');
    p.set('@d1#basiYy', year); p.set('@d1#curDate', cur); p.set('@d1#ltYy', year); p.set('@d1#ltShtm', term);
    p.set('@d1#sbjtId', ''); p.set('@d1#haksuId', ''); p.set('@d1#campFg', '');
    p.set('@d#', '@d1#'); p.set('@d1#', 'dmParam'); p.set('@d1#tp', 'dm');
    return p.toString() + '&';
  }

  async function fetchLectures(year, term) {
    const params = new URLSearchParams(template ? template.body : defaultBody(year, term));
    params.set('@d1#basiYy', year); params.set('@d1#ltYy', year); params.set('@d1#ltShtm', term);
    const url = template ? new URL(template.url, location.href).href : new URL('/CourLectureAplyInqPop/find.do', location.origin).href;
    const res = await fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', ...(template ? template.headers : {}) },
      body: params.toString() + '&'
    });
    const text = await res.text();
    deliver(text, params.toString());
    if (!text.includes('"DS_LECTUREINFO"')) throw new Error('강의 목록이 비어 있습니다.');
  }

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window || ev.data?.source !== 'kku-collector-cmd' || ev.data.type !== 'fetchLectures') return;
    try {
      await fetchLectures(String(ev.data.year), String(ev.data.term));
    } catch (e) {
      post({ type: 'lecturesError', message: String(e?.message ?? e) });
    }
  });
})();
