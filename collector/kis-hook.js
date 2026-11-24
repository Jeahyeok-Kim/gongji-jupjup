// 공지 줍줍 수집기 - 학사정보시스템(kis.kku.ac.kr) 강의 및 시간표 목록 (페이지 안에서 실행)
// 1) 내가 '과목조회' 또는 '수강신청/시간표 조회'를 누를 때 화면이 받는 응답을 옆에서 안전하게 읽습니다.
// 2) 확장이 요청하면 그 조회와 같은 요청을 한 번 보냅니다 (읽기 전용, 로그인 세션 유지).
(() => {
  if (window.__kkuKisHook) return;
  window.__kkuKisHook = true;

  const isLecUrl = (url) => {
    const u = String(url || '');
    return u.includes('CourTotalTimetableInq/find.do') ||
           u.includes('CourTotalTimetableInq') ||
           u.includes('CourLectureAplyInqPop/find.do') ||
           u.includes('CourLectureAplyInq/find.do') ||
           u.includes('CourAplyInqPop/find.do') ||
           u.includes('CourTimeTableInqPop/find.do') ||
           u.includes('CourTimeTable/find.do') ||
           u.includes('CourAply/find.do') ||
           u.includes('CourSyllabus') ||
           u.includes('CourLecturePlanInqNewGlocal/find') ||
           u.includes('CourLecturePlanInqNewGlocal/findSub') ||
           u.includes('LecPlan') ||
           (u.includes('find.do') && (u.includes('Cour') || u.includes('Lec') || u.includes('TimeTable') || u.includes('Syllabus') || u.includes('Plan') || u.includes('Total')));
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

    // 2) KIS 강의 목록 키들 (종합강의시간표, 전체 개설 과목 또는 개인 수강신청 목록)
    const rows = parsed.DS_SUSTTIMETABLE || parsed.DS_LECTUREINFO || parsed.DS_SUGANGINFO || parsed.DS_TIMETABLE || parsed.DS_COUR_APLY || parsed.DS_LIST;
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

  // eXbuilder6 DataMap 형식으로 종합강의시간표 요청 (1474개 전 과목 + 담당교수)
  function totalTimetableBody(year, term) {
    const p = new URLSearchParams();
    p.set('dmParam', JSON.stringify({
      ltYy: year,
      ltShtm: term,
      openSust: '',
      pobtDiv: '',
      sbjtId: '',
      corsKorNm: '',
      sprfNo: '',
      argDeptFg: '수강',
      arglangNm: ''
    }));
    return p.toString();
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

  // eXbuilder6 메모리 인스턴스에서 이미 로드된 DataSet 직접 조회
  function getInMemoryRows() {
    try {
      if (window.cpr && window.cpr.core && window.cpr.core.Platform) {
        const platform = window.cpr.core.Platform.INSTANCE;
        const instances = platform._appInstances || (platform.getMountedAppInstances ? platform.getMountedAppInstances() : []);
        for (const app of instances) {
          if (!app || !app.lookup) continue;
          const ds = app.lookup('DS_SUSTTIMETABLE') || app.lookup('DS_LECTUREINFO') || app.lookup('DS_TIMETABLE');
          if (ds && ds.getRowDataRanged) {
            const data = ds.getRowDataRanged();
            if (Array.isArray(data) && data.length > 0) return data;
          }
        }
      }
    } catch {}
    return null;
  }

  async function fetchLectures(year, term) {
    // 1. 이미 화면(종합강의시간표조회)에 로드된 1474개 데이터셋이 있으면 즉시 전달
    const inMem = getInMemoryRows();
    if (inMem && inMem.length) {
      post({ type: 'lectures', year, term, rows: inMem, isPersonal: false });
      return;
    }

    // 2. 화면에서 가로챈 템플릿 또는 종합강의시간표조회(CourTotalTimetableInq) 엔드포인트 직접 호출
    const endpoints = [];
    if (template) {
      endpoints.push({ url: template.url, body: template.body, headers: template.headers });
    }
    endpoints.push({
      url: '/CourTotalTimetableInq/find.do',
      body: totalTimetableBody(year, term),
      headers: {}
    });
    endpoints.push({
      url: '/CourLectureAplyInqPop/find.do',
      body: defaultBody(year, term),
      headers: {}
    });

    let success = false;
    for (const ep of endpoints) {
      try {
        const targetUrl = new URL(ep.url, location.origin).href;
        const res = await fetch(targetUrl, {
          method: 'POST', credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            ...(ep.headers || {})
          },
          body: ep.body
        });
        const text = await res.text();
        if (text.includes('"DS_SUSTTIMETABLE"') || text.includes('"DS_LECTUREINFO"') || text.includes('"DS_SUGANGINFO"') || text.includes('"DS_TIMETABLE"') || text.includes('"DS_LIST"')) {
          deliver(text, ep.body);
          success = true;
          break;
        }
      } catch (err) {
        // try next endpoint
      }
    }
    if (!success) throw new Error('강의 목록이 비어 있습니다. (KIS 종합강의시간표 메뉴에서 [조회]를 눌러주세요)');
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
