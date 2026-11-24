// 공지 줍줍 수집기 - 학사정보시스템(kis.kku.ac.kr) 강의 및 시간표 목록 (페이지 안에서 실행)
// 1) 내가 '과목조회' 또는 '수강신청/시간표 조회'를 누를 때 화면이 받는 응답을 옆에서 안전하게 읽습니다.
// 2) 확장이 요청하면 그 조회와 같은 요청을 한 번 보냅니다 (읽기 전용, 로그인 세션 유지).
(() => {
  if (window.__kkuKisHook) return;
  window.__kkuKisHook = true;

  const isLecUrl = (url) => {
    const u = String(url || '');
    return u.includes('CourLectureAplyInqPop/find.do') ||
           u.includes('CourLectureAplyInq/find.do') ||
           u.includes('CourAplyInqPop/find.do') ||
           u.includes('CourTimeTableInqPop/find.do') ||
           u.includes('CourTimeTable/find.do') ||
           u.includes('CourAply/find.do') ||
           u.includes('CourSyllabus') ||
           u.includes('CourLecturePlanInqNewGlocal/find') ||
           u.includes('CourLecturePlanInqNewGlocal/findSub') ||
           u.includes('LecPlan') ||
           (u.includes('find.do') && (u.includes('Cour') || u.includes('Lec') || u.includes('TimeTable') || u.includes('Syllabus') || u.includes('Plan')));
  };

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
    const match = isLecUrl(this.__kkuUrl);
    if (match && typeof body === 'string') {
      template = { url: this.__kkuUrl, headers: { ...this.__kkuHeaders }, body };
    }
    this.addEventListener('load', () => {
      try {
        if (match) deliver(this.responseText || '', typeof body === 'string' ? body : '');
      } catch {
        /* 화면 동작에는 영향이 없게 무시 */
      }
    });
    return send.apply(this, arguments);
  };

  const post = (data) => window.postMessage({ source: 'kku-collector', ...data }, location.origin);

  function deliver(text, body) {
    if (!text || typeof text !== 'string') return;

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }

    if (parsed.ERRMSGINFO?.ERRMSG) {
      throw new Error(parsed.ERRMSGINFO.ERRMSG || '학교 시스템 오류');
    }

    // 1) 강의계획서 상세 (기본정보/평가 or 주별 계획)
    if (parsed.DS_SPRF_SBJT_LIST || parsed.DS_WEEKPLAN) {
      post({
        type: 'syllabus',
        main: parsed.DS_SPRF_SBJT_LIST?.[0] || null,
        weeks: parsed.DS_WEEKPLAN || null,
        timeCount: parsed.DS_TIME_COUNT || null
      });
      return;
    }

    // 2) KIS 강의 목록 키들 (전체 개설 과목 또는 개인 수강신청 목록)
    const rows = parsed.DS_LECTUREINFO || parsed.DS_SUGANGINFO || parsed.DS_TIMETABLE || parsed.DS_COUR_APLY || parsed.DS_LIST;
    if (!Array.isArray(rows) || rows.length === 0) return;

    let year = '';
    let term = '';
    try {
      const params = new URLSearchParams(body);
      const dm = params.get('dmParam');
      if (dm) {
        const parsedDm = typeof dm === 'string' && dm.startsWith('{') ? JSON.parse(dm) : JSON.parse(decodeURIComponent(dm));
        year = String(parsedDm.ltYy || parsedDm.basiYy || '');
        term = String(parsedDm.ltShtm || '');
      } else {
        year = params.get('@d1#ltYy') || '';
        term = params.get('@d1#ltShtm') || '';
      }
    } catch {}
    if (!year) year = String(rows[0].LT_YY || rows[0].OPEN_YY || rows[0].YY || '2026');
    if (!term) term = String(rows[0].LT_SHTM || rows[0].OPEN_SHTM || rows[0].SHTM || 'B01012');

    post({
      type: 'lectures',
      year,
      term,
      rows,
      isPersonal: Boolean(parsed.DS_SUGANGINFO || parsed.DS_TIMETABLE || parsed.DS_COUR_APLY)
    });
  }

  // eXbuilder6 DataMap 형식으로 전체 과목 요청 (LTPROF 포함)
  function defaultBody(year, term) {
    const p = new URLSearchParams();
    p.set('dmParam', JSON.stringify({
      basiYy: '',
      curDate: '',
      ltYy: year,
      ltShtm: term,
      sbjtId: '',
      haksuId: '',
      campFg: '1'
    }));
    return p.toString();
  }

  async function fetchLectures(year, term) {
    const bodyStr = template ? template.body : defaultBody(year, term);
    const url = template ? new URL(template.url, location.href).href : new URL('/CourLectureAplyInqPop/find.do', location.origin).href;
    const res = await fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        ...(template ? template.headers : {})
      },
      body: bodyStr
    });
    const text = await res.text();
    deliver(text, bodyStr);
    if (!text.includes('"DS_LECTUREINFO"')) throw new Error('강의 목록이 비어 있습니다.');
  }

  async function fetchSyllabus(year, term, sbjtId) {
    const bodyStr = new URLSearchParams({
      dmParam: JSON.stringify({ ltYy: year, ltShtm: term, sbjtId: sbjtId, campFg: '1' })
    }).toString();
    const [resMain, resSub] = await Promise.all([
      fetch('/CourLecturePlanInqNewGlocal/find.do', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body: bodyStr
      }).then(r => r.text()).catch(() => null),
      fetch('/CourLecturePlanInqNewGlocal/findSub.do', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body: bodyStr
      }).then(r => r.text()).catch(() => null)
    ]);
    if (resMain) deliver(resMain, bodyStr);
    if (resSub) deliver(resSub, bodyStr);
  }

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window || ev.data?.source !== 'kku-collector-cmd') return;
    try {
      if (ev.data.type === 'fetchLectures') {
        await fetchLectures(String(ev.data.year), String(ev.data.term));
      } else if (ev.data.type === 'fetchSyllabus') {
        await fetchSyllabus(String(ev.data.year), String(ev.data.term), String(ev.data.sbjtId));
      }
    } catch (e) {
      post({ type: 'lecturesError', message: String(e?.message ?? e) });
    }
  });
})();
