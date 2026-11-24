// 공지 줍줍 수집기 - 학사정보시스템 강의 목록 저장·자동 받기 (확장 안에서 실행)
// - kis-hook.js 가 보낸 강의 목록에서 필요한 칸만 골라 chrome.storage.local 에 저장합니다. 저장되면 서비스 워커가 내 컴퓨터로 전달합니다.
// - KIS에 로그인한 상태로 이 사이트를 열면 오늘 아직 안 받았을 때 자동으로 한 번 받습니다 (끄려면 팝업의 자동 수집).
// - 담당 교수명·과목명·요일시간·강의실을 수집하며, 개인 식별자(학생 본인 이름·학번)는 읽지 않습니다.
(() => {
  const AUTO_MS = (globalThis.KKU_AUTO_HOURS ?? 12) * 3600000;
  const slim = (r) => {
    const t = String(r.ROOM_NM ?? r.LT_DAY_TIME ?? '').trim();
    // 이러닝 / 원격 수업 여부 판별 (강의시간이 없거나 방식·비고에 원격/이러닝 표기)
    const method = String(r.LT_MTHD_NM ?? r.LSSN_FORM_NM ?? r.CLS_MTHD ?? r.CYBER_DIV_NM ?? r.CYBER_AT ?? r.LSSN_MTHD_NM ?? r.RMK ?? r.REMK ?? '').trim();
    const isElearn = !t || /이러닝|원격|온라인|cyber|사이버|e-learning/i.test(method) || /이러닝|원격|사이버/i.test(t);
    // 담당 교수명 다각적 필드 감지 (종합강의시간표 KOR_NM, 개설과목 LTPROF 대응)
    let rawProf = '';
    if (Array.isArray(r.PROF_LIST) && r.PROF_LIST.length > 0) {
      rawProf = r.PROF_LIST.map((p) => (typeof p === 'object' ? (p.PROF_NM || p.EMP_NM || p.NAME || p.KOR_NM || '') : String(p))).filter(Boolean).join(', ');
    } else {
      rawProf = String(
        r.KOR_NM ?? r.LTPROF ?? r.LT_PROF ?? r.PROF_KOR_NM ??
        r.PROF_NM ?? r.LCTR_PROF_NM ?? r.RESP_PROF_NM ?? r.EMP_NM ?? r.STAFF_NM ??
        r.CHRG_PROF_NM ?? r.PROF_KRN_NM ?? r.PROF ?? r.TEACHER_NM ?? r.INSTR_NM ??
        r.STAFF_KRN_NM ?? r.EMP_KORN_NM ?? r.PROFESSOR ?? r.PROF_NAME ?? r.PROFS_NM ??
        r.LCTR_EMP_NM ?? r.LCTR_PROFR_NM ?? r.CHRG_EMP_NM ?? r.LECTURER ?? r.INSTRUCTOR ??
        r.USER_NM ?? r.KORN_NM ?? r.LESSON_PROF ?? r.LSSN_PROF ?? r.LCTR_PROF_KRN_NM ?? ''
      ).trim();
    }
    const prof = rawProf.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();

    const name = String(r.TYPL_KOR_NM ?? r.CORS_NM ?? r.SBJT_NM ?? r.SUBJ_NM ?? r.CORS_KOR_NM ?? '').trim();
    const bunban = String(r.BUNBAN ?? r.CLSS_NO ?? '').trim();
    const sbjtId = String(r.SBJT_ID ?? '').trim();

    const item = {
      n: name,                                                      // 과목명
      t: t,                                                         // 강의시간(강의실) 예: 월0900-1030(인문사회관 101)
      d: String(r.OPEN_SUST_NM ?? r.DEPT_NM ?? '').trim(),          // 개설 학과
      k: String(r.POBT_DIV_NM ?? r.COMP_DIV_NM ?? '').trim(),       // 이수구분 (전선·전필·교양 등)
      y: String(r.OPEN_SHYR ?? r.SHYR ?? '').trim(),                // 개설 학년
      c: Number(r.PNT ?? r.CDT) || 0,                               // 학점
      h: String(r.HAKSU_ID ?? '').trim(),                           // 학수번호
      s: bunban || (sbjtId.length >= 2 ? sbjtId.slice(-2) : '01')   // 분반
    };
    if (sbjtId) item.id = sbjtId;                                   // 과목번호 (강의계획서 조회 키)
    if (r.RPST_SPRF_NO || r.SPRF_NO) item.sprfNo = String(r.RPST_SPRF_NO || r.SPRF_NO).trim(); // 교수 교번
    if (prof) item.p = prof;                                        // 담당 교수명 (정제됨)
    if (isElearn && !t) item.m = 'elearn';
    else if (method && /실시간\s*온라인/i.test(method)) item.m = 'live';
    return item;
  };

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
    if (msg.type === 'syllabus') {
      const main = msg.main;
      if (!main) return;
      const yr = main.LT_YY || '2026';
      const sm = main.LT_SHTM || 'B01012';
      const sbjt = main.SBJT_ID || '';
      const key = `syl:${yr}:${sm}:${sbjt}`;
      const syllabusData = {
        sbjtId: sbjt,
        haksuId: main.HAKSU_ID,
        name: main.CORS_KOR_NM,
        prof: main.KOR_NM,
        rank: main.WKGD_NM,
        tel: main.SPRF_TEL,
        desc: main.LT_DESC,
        goal: main.LT_PURP,
        pre: main.PRE_LT_CTNT,
        rules: [main.RULE_MANNR, main.RULE_ETC].filter(Boolean).join('\n'),
        rates: {
          examMid: main.RATE_B,
          examFinal: main.RATE_E,
          attend: main.RATE_JS,
          task: main.RATE_F,
          prac: main.RATE_PRAC,
          discuss: main.RATE_DISCUSS
        },
        weeks: (msg.weeks || []).map(w => ({
          week: w.WEEK_NO,
          theme: w.THEME,
          goal: w.LT_PURP,
          content: w.LT_CTNT,
          method: w.LT_MTHD,
          ref: w.PRJT_REF_DATA,
          prep: w.PREP_GD
        })),
        collectedAt: Date.now()
      };
      await chrome.storage.local.set({ [key]: syllabusData });
      await setStatus({ state: 'ok', message: `강의계획서 상세 저장: ${main.CORS_KOR_NM} (${main.KOR_NM} 교수)` });
      return;
    }

    if (msg.type !== 'lectures' || !Array.isArray(msg.rows)) return;
    clearTimeout(waiting);
    const key = `lec:${msg.year}:${msg.term}`;
    const cleanedRows = msg.rows.map(slim).filter((r) => r.n);
    const profCount = cleanedRows.filter((r) => r.p).length;
    const saveObj = {
      [key]: { year: msg.year, term: msg.term, count: cleanedRows.length, rows: cleanedRows, collectedAt: Date.now() }
    };
    if (msg.isPersonal) {
      saveObj['timetable:kis_mine'] = {
        source: 'kis_personal',
        year: msg.year,
        term: msg.term,
        count: cleanedRows.length,
        items: cleanedRows,
        collectedAt: Date.now()
      };
    }
    await chrome.storage.local.set(saveObj);
    const label = msg.isPersonal ? '내 수강 시간표' : '개설 강의';
    await setStatus({ state: 'ok', message: `${msg.year}년 ${cleanedRows.length}개 ${label}(담당 교수 ${profCount}명 매칭 완료)을 저장했습니다.` });
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
