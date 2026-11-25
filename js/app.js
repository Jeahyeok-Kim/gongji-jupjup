// 공지 줍줍 화면 (목록·검색·분류·해독 카드·시간표·시간 예산·언어 전환)
// 데이터는 data/notices.js, 계산은 js/logic.js, 문구는 js/i18n.js 에서 가져옵니다.
(function () {
  'use strict';

  const L = window.GongjiLogic;
  const I = window.GongjiI18n;
  // 데이터 파일(data/notices.js)이 없거나 비어 있어도 앱은 열리고, 서버에서 받아 온다 (불러오기 화면)
  const DATA = window.GONGJI_DATA || { meta: { source: 'none', generatedAt: '' }, categories: [], notices: [] };
  window.GONGJI_DATA = DATA;
  const GLOSSARY = window.GONGJI_GLOSSARY || {};
  window.GONGJI_GLOSSARY = GLOSSARY;
  const X = window.GongjiExtras;
  const O = window.GongjiOverrides;
  const S = window.GongjiSummary;
  const P = window.GongjiPersonal;
  const C = window.GongjiCal;
  const TH = window.GongjiTheme;
  const CU = window.GongjiCurriculum;
  const EL = window.GongjiEligibility;               // 지원 자격 판정
  const AK = window.GongjiAsk;                       // 공지에게 묻기
  const K = window.GongjiTrack;                      // 지원 보드 (관심 → 준비 중 → 지원 완료 → 결과)
  let planUI = null;                                 // 이수 내역 · 수강신청 추천 화면 (아래에서 mount)
  let palette = null;                                // 빠른 실행 (아래에서 mount)
  const PAGE = 30;                                   // 목록은 30건씩 보여 주고 '더 보기'로 늘린다
  const $ = (sel) => document.querySelector(sel);

  // ---------- 저장소: 이 브라우저에만 저장 (실패해도 화면은 동작) ----------
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('gongji:' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('gongji:' + key, JSON.stringify(value)); } catch (e) { /* 무시 */ }
    }
  };

  // ---------- 기준 시각: 주소 뒤에 ?today=2026-11-16 을 붙이면 그날 오전 9시로 시연 ----------
  function getNow() {
    const p = new URLSearchParams(location.search).get('today');
    const d = p ? L.parseLocal(p) : null;
    if (d) {
      if (!p.includes('T')) d.setHours(9, 0, 0, 0);
      return d;
    }
    return new Date();
  }
  const now = getNow();

  function initialLang() {
    const saved = store.get('lang', null);
    if (saved && I.T[saved]) return saved;
    const nav = (navigator.languages || [navigator.language || 'ko']).map((s) => String(s).slice(0, 2));
    return nav.find((c) => I.T[c]) || 'ko';
  }

  const EXAMPLE_TIMETABLE = [
    { day: 1, start: '13:30', end: '15:00', prof: '선우하식', room: '자연과학관 516', names: { ko: '이산수학', en: 'Discrete Math', zh: '离散数学', ja: '離散数学' } },
    { day: 3, start: '13:00', end: '14:30', prof: '이철원', room: '국제교육관 302-2', names: { ko: '컴퓨터공학개론', en: 'Intro to Computer Eng.', zh: '计算机工程概论', ja: 'コンピュータ工学概論' } },
    { day: 4, start: '16:30', end: '18:00', prof: '김창호', room: '자연과학관 206', names: { ko: '자료구조', en: 'Data Structures', zh: '数据结构', ja: 'データ構造' } },
    { day: 5, start: '10:30', end: '12:00', prof: 'Smith', room: '국제교육관 402', names: { ko: '대학영어', en: 'College English', zh: '大学英语', ja: '大学英語' } },
    { elearn: true, prof: '이철원', names: { ko: '인공지능과미래사회', en: 'AI & Future Society', zh: '人工智能与未来社会', ja: 'AIと未来社会' } }
  ];

  // 내 정보(지원 자격 확인용): 과정·학년·학적·유학생·학과. 학년(또는 대학원)을 고르면 켜진다
  function cleanProfile(p) {
    const o = p && typeof p === 'object' ? p : {};
    const level = o.level === 'grad' ? 'grad' : 'undergrad';
    const grade = [1, 2, 3, 4].includes(+o.grade) ? +o.grade : null;
    const out = { level, grade, status: o.status === 'leave' ? 'leave' : 'enrolled', intl: o.intl === true, dept: String(o.dept || '').trim().slice(0, 30) };
    out.set = level === 'grad' || grade !== null;
    return out;
  }

  function initTimetables() {
    let saved = store.get('timetables', null);
    const legacy = (store.get('timetable', []) || []).filter(L.isValidClass);
    if (!Array.isArray(saved) || saved.length === 0) {
      saved = [{
        id: 'default',
        name: '기본 시간표',
        classes: legacy,
        createdAt: Date.now()
      }];
      store.set('timetables', saved);
    } else {
      saved = saved.map((t, idx) => ({
        id: t.id || ('tt_' + idx),
        name: t.name || ('시간표 ' + (idx + 1)),
        classes: Array.isArray(t.classes) ? t.classes.filter(L.isValidClass) : [],
        createdAt: t.createdAt || Date.now()
      }));
    }
    let activeId = store.get('activeTimetableId', '');
    if (!activeId || !saved.some((t) => t.id === activeId)) {
      activeId = saved[0].id;
      store.set('activeTimetableId', activeId);
    }
    const active = saved.find((t) => t.id === activeId) || saved[0];
    return { list: saved, activeId, activeClasses: active.classes };
  }
  const ttInit = initTimetables();

  const state = {
    lang: initialLang(),
    profile: cleanProfile(store.get('profile', null)),
    fitOnly: store.get('fitOnly', true) !== false,
    query: '',
    board: '',
    status: 'open',
    sort: store.get('sort', 'deadline'),
    category: '',
    group: '',
    sub: '',
    grouped: store.get('grouped', false),
    timetables: ttInit.list,
    activeTimetableId: ttInit.activeId,
    timetable: ttInit.activeClasses,
    customFilterPresets: store.get('customFilterPresets', []),
    activePresetId: '',
    hideConflicts: store.get('hideConflicts', false),
    dept: store.get('dept', ''),                       // 내 학과 (요람의 학과 이름)
    currTab: store.get('currTab', ''),                 // '1'~'4' 학년, '0' 학년 무관, 'gen' 교양
    budgetHours: store.get('budgetHours', 4),
    budgetWindow: store.get('budgetWindow', 7),
    budgetSelective: store.get('budgetSelective', true),
    budgetResult: null,
    saved: X ? X.cleanSaved(store.get('saved', [])) : [],
    savedOnly: false,
    openId: null,
    applied: P.cleanIds(store.get('applied', []), 500),          // 지원 완료로 표시한 공지
    track: K ? K.cleanTrack(store.get('track', {})) : {},       // 지원 보드: 단계·준비물·메모
    nview: store.get('nview', 'list') === 'table' ? 'table' : 'list',   // 공지 보기: 목록 · 표
    read: P.cleanIds(store.get('read', []), 400),                // 열어 본 공지
    keywords: P.cleanKeywords(store.get('keywords', [])),        // 내 키워드
    interests: P.cleanInterests(store.get('interests', [])),     // 내 관심 분야 (분류 id)
    recent: P.cleanIds(store.get('recent', []), 8),              // 최근 검색어
    alertsOn: store.get('alertsOn', false) === true,
    seenAlerts: P.cleanIds(store.get('seenAlerts', []), 300),
    mineOnly: false,
    unreadOnly: false,
    due: '',                                           // 오늘 화면의 숫자 버튼에서 넘어온 조건: 'today' 오늘 마감 · 'soon' 3일 안 마감 · 'new' 새 공지
    limit: PAGE,
    sig: '',
    cal: { year: now.getFullYear(), month0: now.getMonth(), sel: X.ymd(now) }
  };

  // 마지막 방문: 같은 날 다시 열어도 '새 공지' 기준은 그대로. 시연용 ?today= 주소에서는 저장하지 않음
  const demoDate = new URLSearchParams(location.search).has('today');
  const visit = X.nextVisit(store.get('visit', null), X.ymd(now));
  if (!demoDate) store.set('visit', visit);
  const since = visit.prev || X.ymd(L.addDays(now, -3));

  // 보정표: 서버(구글 시트·깃허브)에서 받은 표를 공지에 덮어쓴다. RAW_NOTICES 는 덮어쓰기 전 원본
  let RAW_NOTICES = DATA.notices;
  const ov = { parsed: { rules: [], banner: '', errors: [] }, applied: 0, hidden: 0, unmatched: [], error: '', source: '' };

  // ---------- 작은 도우미 ----------
  const t = () => I.T[state.lang];
  const tr = (obj) => (obj ? obj[state.lang] || obj.ko || '' : '');
  const round1 = (x) => Math.round(x * 10) / 10;
  const catLabel = (id) => {
    const c = DATA.categories.find((x) => x.id === id);
    return c ? tr(c.label) : id;
  };
  const groupLabel = (g) => t().groups[g] || g;
  const subLabel = (s) => t().subs[s] || s;
  const GROUP_OF = {};
  for (const g of L.BENEFIT_TREE) for (const sb of g.subs) GROUP_OF[sb] = g.id;
  // 같은 공지가 여러 게시판에 올라온 경우 함께 보여 줌
  const boardsOf = (n) => [n.boardName].concat(n.alsoIn || []).map(boardLabel).join(' · ');
  // 혜택 표: 다드림 30P, 장학금 50만 원처럼 숫자를 붙여 보여 준다 (색은 큰 분류를 따름)
  const subTag = (n, sb) => {
    const b = n.benefit || {};
    const won = (v) => (I.formatWon ? I.formatWon(v, state.lang) : v.toLocaleString());
    let extra = '';
    if (sb === 'dadream' && b.points) extra = ` ${b.points}P`;
    if ((sb === 'scholarship' || sb === 'support' || sb === 'pay') && b.won) extra = ` ${won(b.won)}`;
    if (sb === 'prize' && b.prize) extra = ` ${won(b.prize)}`;
    return h('span', { class: 'tag kind-' + GROUP_OF[sb] }, subLabel(sb) + extra);
  };
  const titleOf = (n) => (state.lang === 'ko' ? n.title : (n.titleTr && n.titleTr[state.lang]) || n.title);
  const dayName = (d) => I.WEEKDAYS[state.lang][d];
  const isApplied = (id) => state.applied.includes(id);
  const isRead = (id) => state.read.includes(id);
  // 지원 완료한 공지는 알림·추천·오늘 요약에서 뺀다
  // 지원 완료한 공지와, 내 정보로 보아 대상이 아닌 공지(교직원 대상 등)는 오늘 화면·추천·알림 요약에서 뺀다
  const activeNotices = () => DATA.notices.filter((n) => !isApplied(n.id) && !unfit(n));
  let fitMemo = { sig: '', map: new Map() };
  function fitOf(n, profile) {
    if (!EL) return null;
    if (profile) return EL.judge(n, profile);
    const sig = JSON.stringify(state.profile) + '|' + DATA.meta.generatedAt + '|' + DATA.notices.length;
    if (fitMemo.sig !== sig) fitMemo = { sig, map: new Map() };
    if (!fitMemo.map.has(n.id)) fitMemo.map.set(n.id, EL.judge(n, state.profile));
    return fitMemo.map.get(n.id);
  }
  const fitStatus = (n, profile) => { const r = fitOf(n, profile); return r ? r.status : null; };
  const unfit = (n) => state.profile.set && fitStatus(n) === 'no';
  const personalCtx = () => ({ keywords: state.keywords, interests: state.interests });
  const mineOf = (n) => P.mine(n, personalCtx());
  const hasMine = () => state.keywords.length > 0 || state.interests.length > 0;
  // 검색어(노란 형광펜) 및 사용자 등록 관심 키워드(그린 형광펜) 하이라이트
  function hl(text) {
    if (text === null || text === undefined || text === '') return text;
    const str = String(text);
    const queryTokens = L.queryTokens(state.query).filter((q) => q.length >= 1);
    const kwTokens = (state.keywords || []).filter((k) => k && k.length >= 1);
    if (!queryTokens.length && !kwTokens.length) return str;

    const low = str.toLowerCase();
    const cho = queryTokens.some(L.isChosungOnly) ? L.chosung(low) : null;
    const marks = [];

    // 검색어 매칭
    for (const q of queryTokens) {
      const qLow = q.toLowerCase();
      const isCho = L.isChosungOnly(q);
      const hay = isCho && cho ? cho : low;
      for (let i = 0, k; (k = hay.indexOf(qLow, i)) >= 0; i = k + qLow.length) {
        marks.push({ start: k, end: k + qLow.length, type: 'query' });
      }
    }

    // 내 관심 키워드 매칭
    for (const kw of kwTokens) {
      const q = kw.toLowerCase();
      for (let i = 0, k; (k = low.indexOf(q, i)) >= 0; i = k + q.length) {
        marks.push({ start: k, end: k + q.length, type: 'keyword' });
      }
    }

    if (!marks.length) return str;
    marks.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

    const out = [];
    let pos = 0;
    for (const m of marks) {
      if (m.end <= pos) continue;
      const from = Math.max(m.start, pos);
      if (from > pos) out.push(str.slice(pos, from));
      out.push(h('mark', { class: m.type === 'query' ? 'query-hl' : 'kw-hl' }, str.slice(from, m.end)));
      pos = m.end;
    }
    if (pos < str.length) out.push(str.slice(pos));
    return out;
  }
  // 게시판 이름: 한국어가 아니면 번역 이름 (없으면 원래 이름)
  const boardLabel = (b) => (state.lang !== 'ko' && I.BOARD_NAMES[b] && I.BOARD_NAMES[b][state.lang]) || b;

  // 자리 비움(null·undefined·false)을 건너뛰고 요소의 내용을 통째로 바꾼다 (replaceChildren 에 null 을 그대로 주면 'null' 글자가 찍힘)
  function fill(el, ...kids) {
    if (!el) return;
    el.replaceChildren(...kids.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  }
  // 안전하게 요소 만들기 (데이터는 textContent 로만 넣어서 HTML 주입을 막음)
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = Boolean(v);
        else if (k === 'value' && (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'OPTION')) el.value = v;
        else if (k === 'tabindex' || k === 'tabIndex') el.tabIndex = Number(v);
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : String(c));
    }
    return el;
  }

  function formatEvent(ev) {
    return `${I.formatDate(L.parseLocal(ev.date), state.lang)} ${ev.start}~${ev.end}`;
  }

  function ddayBadge(n) {
    if (L.isExpired(n, now)) return h('span', { class: 'dday closed' }, t().closed);
    const d = L.daysLeft(n.deadline, now);
    if (d === null) return null;
    if (d === 0) return h('span', { class: 'dday urgent' }, t().dueToday);
    return h('span', { class: 'dday' + (d <= 3 ? ' urgent' : '') }, `D-${d}`);
  }

  // ---------- 화면 고정 문구 ----------
  function applyStaticText() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const v = t()[el.dataset.i18n];
      if (typeof v === 'string') el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const v = t()[el.dataset.i18nHtml];
      if (typeof v === 'string') el.innerHTML = v;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t()[el.dataset.i18nPlaceholder];
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t()[el.dataset.i18nAria]);
    });
    if (t().brandName) {
      document.title = state.lang === 'ko' ? t().brandName : `${t().brandName} (공지 줍줍)`;
      const brandH1 = $('#brand-title') || document.querySelector('.brand h1');
      if (brandH1) {
        brandH1.title = state.lang === 'ko' ? '공지 줍줍' : `${t().brandName} (원제: 공지 줍줍)`;
        if (t().brandLogo) brandH1.innerHTML = t().brandLogo;
      }
    }
    const aboutVer = $('#about-ver') || document.querySelector('.settings-about-ver');
    if (aboutVer) aboutVer.textContent = `${t().brandName || '공지 줍줍'} v67`;
    document.querySelectorAll('.today-text').forEach((el) => { el.textContent = I.formatDate(now, state.lang); });
    const keep = DATA.meta.keep;
    const keepText = keep && keep.months && keep.since ? ' · ' + t().keepNote(keep.months, String(keep.since).replace(/-/g, '.')) : '';
    document.querySelectorAll('.data-info').forEach((el) => { el.textContent = t().dataInfo(DATA.meta) + keepText; });
    $('#sample-banner').hidden = DATA.meta.source !== 'sample';

    // 게시판 목록
    const board = $('#board');
    const boards = [...new Set(DATA.notices.map((n) => n.boardName))];
    fill(board, 
      h('option', { value: '' }, t().allBoards),
      ...boards.map((b) => h('option', { value: b }, boardLabel(b)))
    );
    board.value = state.board;

    // 분야 (장학·학사·취업 …): 예전 분류 칩 → 선택 상자
    const field = $('#field');
    const used = new Set(DATA.notices.map((n) => n.category));
    fill(field, h('option', { value: '' }, t().allFields),
      ...DATA.categories.filter((c) => used.has(c.id)).map((c) => h('option', { value: c.id }, tr(c.label))));
    field.value = state.category;


    document.querySelectorAll('.lang-control').forEach((el) => { el.value = state.lang; });
    $('#status').value = state.status;
    $('#sort').value = state.sort;
    document.querySelectorAll('.group-control').forEach((el) => { el.checked = state.grouped; });
    document.querySelectorAll('.hide-control').forEach((el) => { el.checked = state.hideConflicts; });
    $('#budget-selective').checked = state.budgetSelective;
    $('#budget-hours').value = state.budgetHours;
    $('#budget-window').value = String(state.budgetWindow);
    renderSync();
  }

  // ---------- 목록 ----------
  function computeVisible() {
    let base = L.filterNotices(DATA.notices,
      { query: state.query, board: state.board, status: state.status, category: state.category }, now);
    if (state.savedOnly) { const keep = new Set(state.saved); base = base.filter((n) => keep.has(n.id)); }
    if (state.mineOnly) base = base.filter((n) => mineOf(n).any);
    if (state.keywordsOnly) {
      const kwList = (state.keywords || []).map((k) => k.toLowerCase()).filter(Boolean);
      if (kwList.length) {
        base = base.filter((n) => {
          const t = (n.title || '').toLowerCase();
          const sm = S.pick(n, state.lang);
          const s = (sm && sm.text ? sm.text : '').toLowerCase();
          const b = (n.bodyText || '').toLowerCase();
          const haystack = `${t} ${s} ${b}`;
          return kwList.some((k) => haystack.includes(k));
        });
      }
    }
    if (state.unreadOnly) base = base.filter((n) => !isRead(n.id));
    let fitHidden = 0;
    if (state.profile.set && state.fitOnly) {
      const before = base.length;
      base = base.filter((n) => fitStatus(n) !== 'no');
      fitHidden = before - base.length;
    }
    if (state.due) {
      // 오늘 화면의 숫자(오늘 마감·3일 안 마감·새 공지)와 목록이 같은 공지를 가리키게 한다
      base = base.filter((n) => {
        if (state.due === 'new') return X.isNew(n, since);
        if (L.isExpired(n, now)) return false;
        const d = L.daysLeft(n.deadline, now);
        return d !== null && d >= 0 && d <= (state.due === 'today' ? 0 : 3);
      });
    }
    const counts = L.countByGroup(base);
    const inGroup = state.group ? base.filter((n) => L.classifyBenefit(n).groups.includes(state.group)) : base;
    const subCounts = L.countBySub(inGroup);
    let list = state.sub ? inGroup.filter((n) => L.classifyBenefit(n).subs.includes(state.sub)) : inGroup;
    // 마감 지난 공지만 볼 때 '마감 가까운 순'은 최근에 끝난 것부터
    list = L.sortNotices(list, state.status === 'past' && state.sort === 'deadline' ? 'recentClosed' : state.sort, now);
    if (state.query.trim()) {
      // 검색 중에는 제목에 검색어가 다 들어 있는 공지를 먼저 (고른 정렬 순서는 그 안에서 그대로)
      const inTitle = list.filter((n) => L.titleMatches(n, state.query));
      if (inTitle.length && inTitle.length < list.length) list = inTitle.concat(list.filter((n) => !inTitle.includes(n)));
    }
    let hidden = 0;
    if (state.hideConflicts && state.timetable.length) {
      const before = list.length;
      list = list.filter((n) => L.findConflicts(n, state.timetable).length === 0);
      hidden = before - list.length;
    }
    list = list.filter((n) => n.pinned).concat(list.filter((n) => !n.pinned));      // 운영자가 '중요'로 표시한 공지는 맨 위
    return { base, counts, subCounts, list, hidden, fitHidden };
  }

  function renderChips(counts, subCounts, total) {
    // 받는 것(혜택)으로 고르기 2단계: 첫 줄은 큰 분류(금전·포인트·물품·경험·안내), 큰 분류를 누르면 둘째 줄에 세부 분류
    const chip = (cls, pressed, label, count, onclick) => h('button', {
      type: 'button',
      class: 'chip' + (cls ? ' ' + cls : ''),
      'aria-pressed': String(pressed),
      onclick
    }, label, h('span', { class: 'chip-count' }, String(count)));
    const items = [chip('', !state.group, t().allCategories, total, () => { state.group = ''; state.sub = ''; renderList(); })];
    for (const g of L.BENEFIT_TREE) {
      const n = counts[g.id] || 0;
      if (n > 0 || state.group === g.id) {
        items.push(chip('kind-' + g.id, state.group === g.id, groupLabel(g.id), n,
          () => { state.group = state.group === g.id ? '' : g.id; state.sub = ''; renderList(); }));
      }
    }
    fill($('#chips'), ...items);

    const def = L.BENEFIT_TREE.find((g) => g.id === state.group);
    const row = $('#subchips');
    if (!def || def.subs.length < 2) { row.hidden = true; fill(row); return; }
    const subs = [chip('kind-' + def.id, !state.sub, t().allSubs, counts[def.id] || 0, () => { state.sub = ''; renderList(); })];
    for (const sb of def.subs) {
      const n = subCounts[sb] || 0;
      if (n > 0 || state.sub === sb) {
        subs.push(chip('kind-' + def.id, state.sub === sb, subLabel(sb), n,
          () => { state.sub = state.sub === sb ? '' : sb; renderList(); }));
      }
    }
    row.hidden = false;
    fill(row, ...subs);
  }

  // 본문 대신(또는 본문과 함께) 포스터·첨부파일에서 읽은 글로 정리한 공지
  const fromMedia = (n) => Array.isArray(n.readFrom) && n.readFrom.length > 0;

  function metaItem(label, value, missing) {
    return h('span', { class: 'meta-item' + (missing ? ' missing' : '') },
      h('span', { class: 'meta-label' }, label), ' ', value);
  }

  // ---------- 저장(★) ----------
  const isSaved = (id) => state.saved.includes(id);
  function starButton(n) {
    const on = isSaved(n.id);
    return h('button', {
      type: 'button', class: 'star' + (on ? ' on' : ''), 'data-id': n.id, 'aria-pressed': String(on),
      'aria-label': on ? t().unsaveAria(titleOf(n)) : t().saveAria(titleOf(n)), title: on ? t().savedNotice : t().saveNotice,
      onclick: (e) => { e.stopPropagation(); toggleSave(n.id); }
    }, on ? '★' : '☆');
  }
  function toggleSave(id, quiet) {
    const was = isSaved(id);
    state.saved = X.toggleSaved(state.saved, id);
    store.set('saved', state.saved);
    document.querySelectorAll('.star[data-id]').forEach((b) => {
      const n = DATA.notices.find((x) => x.id === b.dataset.id);
      const on = isSaved(b.dataset.id);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? '★' : '☆';
      if (n) b.setAttribute('aria-label', on ? t().unsaveAria(titleOf(n)) : t().saveAria(titleOf(n)));
      b.title = on ? t().savedNotice : t().saveNotice;
    });
    if (!isSaved(id) && state.track[id]) {                       // 저장을 풀면 보드에서도 뺀다
      const tr2 = { ...state.track };
      delete tr2[id];
      state.track = tr2;
      store.set('track', state.track);
    }
    renderListTools();
    if (state.savedOnly) renderList();
    renderHome();
    renderAlerts();
    renderBoard();
    if ($('#detail').open && state.openId) openDetail(state.openId, true);
    if (!quiet) toast(was ? t().unsavedToastMsg : t().savedToastMsg, { label: t().undo, run: () => toggleSave(id, true) });
    syncMine();
  }

  // ---------- 지원 완료 ----------
  function toggleApplied(id, quiet) {
    const was = isApplied(id);
    state.applied = P.toggle(state.applied, id, 500);
    store.set('applied', state.applied);
    // 보드 단계도 맞춘다: 지원 완료로 표시하면 '지원 완료' 칸으로, 해제하면 '준비 중'으로
    const te = state.track[id];
    if (K && te) {
      if (isApplied(id) && (te.stage === 'interest' || te.stage === 'prep')) state.track = K.update(state.track, id, { stage: 'done' });
      if (!isApplied(id) && (te.stage === 'done' || te.stage === 'result')) state.track = K.update(state.track, id, { stage: 'prep' });
      store.set('track', state.track);
    }
    renderBoard();
    state.budgetResult = null;
    renderList();
    renderHome();
    renderAlerts();
    if ($('#detail').open && state.openId) openDetail(state.openId, true);
    if (document.body.dataset.tab === 'budget') runBudget();
    if (!quiet) toast(was ? t().unappliedToast : t().appliedToast, { label: t().undo, run: () => toggleApplied(id, true) });
    syncMine();
  }
  function markRead(id) {
    if (isRead(id)) return;
    state.read = P.touch(state.read, id, 400);
    store.set('read', state.read);
    const li = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    if (li) li.classList.add('is-read');
  }

  function markAllAsRead() {
    const ids = activeNotices().map((n) => n.id);
    state.read = P.cleanIds(ids.concat(state.read), 600);
    store.set('read', state.read);
    renderList();
    renderHome();
    toast(t().markAllReadDone || '모든 공지를 읽음 처리했습니다.');
  }

  // ---------- 핵심 정보 줄: 모든 공지가 같은 순서(대상 · 마감 · 혜택 · 일정)로 보인다 ----------
  // 목록 행 왼쪽의 마감 날짜 칸: 'D-3' 크게, 그 아래 '11.26 (목)'. 마감이 없으면 '마감 없음'
  function dateCol(n) {
    const T = t();
    if (!n.deadline) return h('div', { class: 'card-date none' }, h('strong', null, '—'), h('span', null, T.noDeadlineShort));
    const d = L.parseLocal(n.deadline);
    const expired = L.isExpired(n, now);
    const left = L.daysLeft(n.deadline, now);
    const big = expired ? T.closed : left === 0 ? T.dueToday : left !== null && left > 0 ? `D-${left}` : T.closed;
    const urgent = !expired && left !== null && left <= 3;
    return h('div', { class: 'card-date' + (urgent ? ' urgent' : '') + (expired ? ' closed' : '') },
      h('strong', null, big),
      h('span', null, `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')} (${dayName(d.getDay())})`));
  }

  function keyInfo(n, opts) {
    const T = t();
    const listRow = opts && opts.listRow;          // 목록 행에서는 마감을 왼쪽 날짜 칸에 보여 주므로 뺀다
    const left = L.daysLeft(n.deadline, now);
    const urgent = !L.isExpired(n, now) && left !== null && left <= 3;
    const item = (cls, label, value, missing) => h('div', { class: 'ki ' + cls + (missing ? ' missing' : '') + (cls === 'deadline' && urgent && !missing ? ' urgent' : '') },
      h('span', { class: 'ki-label' }, label), h('span', { class: 'ki-value' }, missing ? T.notStated : value));
    const ev = n.events && n.events.length ? formatEvent(n.events[0]) + (n.events.length > 1 ? ` +${n.events.length - 1}` : '') : '';
    return h('div', { class: 'keyinfo' },
      item('who', T.eligibility, n.eligibility ? tr(n.eligibility) : '', !n.eligibility),
      listRow ? null : item('deadline', T.deadline, n.deadline ? I.formatDateTime(L.parseLocal(n.deadline), state.lang) : '', !n.deadline),
      item('benefit', T.benefit, n.benefit ? tr(n.benefit.text) : '', !n.benefit),
      ev ? item('when', T.when, ev, false) : null);
  }

  function card(n) {
    const conflicts = L.findConflicts(n, state.timetable);
    const expired = L.isExpired(n, now);
    const imageOnly = n.bodyStatus === 'image';
    const sm = S.pick(n, state.lang);
    const mine = mineOf(n);
    const fit = state.profile.set ? fitStatus(n) : null;
    const notes = store.get('noticeNotes', {}) || {};
    const memo = notes[n.id];
    return h('li', {
      'data-id': n.id,
      class: 'card' + (expired ? ' is-expired' : '') + (conflicts.length ? ' has-conflict' : '') + (n.pinned ? ' is-pinned' : '') + (fit === 'no' ? ' is-unfit' : '')
        + (isRead(n.id) ? ' is-read' : '') + (isApplied(n.id) ? ' is-applied' : '') + (memo ? ' has-memo' : '')
    },
      dateCol(n),
      h('div', { class: 'card-top' },
        !isRead(n.id) ? h('span', { class: 'unread-dot', title: t().unreadBadge || '새 공지', 'aria-label': '새 공지' }) : null,
        fitBadge(n),
        X.isNew(n, since) ? h('span', { class: 'new-badge' }, t().newBadge) : null,
        n.pinned ? h('span', { class: 'pin-badge' }, t().pinnedBadge) : null,
        isApplied(n.id) ? h('span', { class: 'applied-badge' }, t().appliedBadge) : null,
        memo ? h('span', { class: 'memo-badge', title: `내 메모: ${memo}` }, '📝 메모') : null,
        ...(mine.keywords || []).map((kw) => h('span', { class: 'kw-match-badge', title: `'${kw}' 키워드 일치` }, `#${kw}`)),
        mine.any ? h('span', { class: 'mine-badge', title: mine.keywords.join(', ') }, t().mineBadge) : null,
        n.aiPending ? h('span', { class: 'pending-badge', title: t().aiPendingNote }, t().aiPendingBadge) : null,
        ...L.classifyBenefit(n).subs.slice(0, 2).map((sb) => subTag(n, sb)),
        h('span', { class: 'card-board' }, `${catLabel(n.category)} · ${boardsOf(n)}`),
        starButton(n)),
      h('h3', { class: 'card-title' },
        h('button', { type: 'button', class: 'card-link', 'aria-haspopup': 'dialog', onclick: () => openDetail(n.id) }, hl(titleOf(n)))),
      state.lang !== 'ko' ? h('p', { class: 'card-orig', lang: 'ko' }, n.title) : null,
      memo ? h('p', { class: 'card-memo-preview', onclick: () => openDetail(n.id) }, `📝 ${memo}`) : null,
      sm.text ? h('p', { class: 'card-summary' }, hl(sm.text)) : null,
      n.opNote ? h('p', { class: 'op-note' }, `${t().opNoteLabel}: ${n.opNote}`) : null,
      imageOnly ? null : keyInfo(n, { listRow: true }),
      imageOnly && n.link ? h('div', { class: 'image-check-callout' },
        h('span', { class: 'callout-text' }, '⚠️ ' + (t().imageOnly || '본문 확인 불가 (이미지·첨부)')),
        h('a', { href: n.link, target: '_blank', rel: 'noopener noreferrer' }, (t().original || '원문 공지') + ' ↗')
      ) : null,
      (conflicts.length || imageOnly || fromMedia(n) || n.check) ? h('div', { class: 'badges' },
        n.check ? h('span', { class: 'badge check', title: t().checkNote(I.formatDate(L.parseLocal(n.check.deadline), state.lang)) }, t().checkBadge) : null,
        conflicts.length ? h('span', { class: 'badge conflict' }, t().conflict) : null,
        imageOnly ? h('span', { class: 'badge warn' }, t().imageOnly) : null,
        fromMedia(n) ? h('span', { class: 'badge media' }, t().readMedia) : null) : null
    );
  }

  // ---------- 지원 보드 (트렐로·노션 보드처럼 끌어서 단계 옮기기) ----------
  function saveTrackState(r) {
    state.track = r.track; state.saved = r.saved; state.applied = r.applied;
    store.set('track', state.track); store.set('saved', state.saved); store.set('applied', state.applied);
  }
  function afterTrackChange() {
    renderBoard();
    renderList();
    renderHome();
    renderAlerts();
    syncMine();
    if ($('#detail').open && state.openId) openDetail(state.openId, true);
  }
  function moveStage(id, stage) {
    if (!K) return;
    const before = { track: state.track, saved: state.saved, applied: state.applied };
    const cur = K.stageOf(id, state.track, state.saved, state.applied);
    if (cur === stage) return;
    saveTrackState(K.move(before, id, stage, new Date()));
    afterTrackChange();
    const T = t();
    toast(stage ? T.movedTo(T.stage[stage]) : T.boardRemoved, { label: T.undo, run: () => { saveTrackState(before); afterTrackChange(); } });
  }
  // 준비물·메모 고치기. quiet 이면 상세 창을 다시 그리지 않는다 (메모를 쓰는 중에 글자 칸이 사라지지 않게)
  function setTrack(track, id, quiet) {
    state.track = track;
    if (track[id] && !isSaved(id)) { state.saved = X.toggleSaved(state.saved, id); store.set('saved', state.saved); syncMine(); }
    store.set('track', state.track);
    renderBoard();
    if (!quiet && $('#detail').open && state.openId) openDetail(state.openId, true);
  }
  function boardIds() {
    if (!K) return [];
    const cols = K.columns(DATA.notices, { track: state.track, saved: state.saved, applied: state.applied }, now);
    return K.STAGES.flatMap((s) => cols[s].map((n) => n.id));
  }

  // 모바일 & 터치 디바이스 (iOS Safari / Android Chrome·삼성인터넷) 터치 드래그 앤 드롭 제어
  let touchHoldTimer = null;
  let isTouchDragging = false;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchCardEl = null;
  let touchGhostEl = null;
  let touchHoverCol = null;
  let suppressDetailClickUntil = 0;

  function handleBoardTouchStart(ev, nId, stage) {
    if (ev.touches.length !== 1) return;
    if (ev.target.closest('select, button, a, input, textarea')) return;
    const t0 = ev.touches[0];
    touchStartX = t0.clientX;
    touchStartY = t0.clientY;
    isTouchDragging = false;
    touchCardEl = ev.currentTarget;
    touchHoverCol = null;

    clearTimeout(touchHoldTimer);
    touchHoldTimer = setTimeout(() => {
      isTouchDragging = true;
      if (navigator.vibrate) navigator.vibrate(25);
      if (touchCardEl) touchCardEl.classList.add('is-touch-dragging');
      document.body.classList.add('is-dragging');

      touchGhostEl = touchCardEl.cloneNode(true);
      touchGhostEl.classList.add('bcard-touch-ghost');
      const rect = touchCardEl.getBoundingClientRect();
      touchGhostEl.style.width = `${rect.width}px`;
      touchGhostEl.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) scale(1.03)`;
      document.body.appendChild(touchGhostEl);
    }, 180);
  }

  function handleBoardTouchMove(ev, box) {
    if (ev.touches.length !== 1) return;
    const t0 = ev.touches[0];
    const dx = t0.clientX - touchStartX;
    const dy = t0.clientY - touchStartY;

    if (!isTouchDragging) {
      if (Math.hypot(dx, dy) > 8) {
        clearTimeout(touchHoldTimer);
      }
      return;
    }

    // 터치 드래그 중 화면 스크롤 방지
    if (ev.cancelable) ev.preventDefault();

    if (touchGhostEl) {
      const gw = touchGhostEl.offsetWidth || 280;
      touchGhostEl.style.transform = `translate3d(${t0.clientX - gw / 2}px, ${t0.clientY - 30}px, 0) scale(1.04)`;
    }

    // 엣지 오토스크롤: 보드 좌우 끝에 닿으면 가로 스크롤 이동
    if (box) {
      const edge = 44;
      if (t0.clientX < edge) {
        box.scrollLeft -= 10;
      } else if (t0.clientX > window.innerWidth - edge) {
        box.scrollLeft += 10;
      }
    }

    // 드롭 대상 컬럼 실시간 탐지
    if (touchGhostEl) touchGhostEl.style.display = 'none';
    const elUnder = document.elementFromPoint(t0.clientX, t0.clientY);
    if (touchGhostEl) touchGhostEl.style.display = '';

    const col = elUnder ? elUnder.closest('.bcol') : null;
    if (box) {
      box.querySelectorAll('.bcol').forEach((c) => {
        if (c !== col) c.classList.remove('is-over');
      });
    }
    if (col) {
      col.classList.add('is-over');
      touchHoverCol = col;
    } else {
      touchHoverCol = null;
    }
  }

  function handleBoardTouchEnd(ev, nId, curStage, box) {
    clearTimeout(touchHoldTimer);
    if (!isTouchDragging) return;

    isTouchDragging = false;
    document.body.classList.remove('is-dragging');
    if (touchCardEl) touchCardEl.classList.remove('is-touch-dragging');
    if (touchGhostEl) {
      touchGhostEl.remove();
      touchGhostEl = null;
    }
    if (box) {
      box.querySelectorAll('.bcol').forEach((c) => c.classList.remove('is-over'));
    }

    if (touchHoverCol) {
      const destStage = touchHoverCol.getAttribute('data-stage');
      if (destStage && destStage !== curStage) {
        if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
        moveStage(nId, destStage);
      }
    }

    suppressDetailClickUntil = Date.now() + 350;
  }

  function boardCard(n, stage, ids) {
    const T = t();
    const e = state.track[n.id];
    const pg = K.progress(e);
    const sub = L.classifyBenefit(n).subs[0];
    const next = K.STAGES[K.STAGES.indexOf(stage) + 1];
    return h('li', {
      class: 'bcard' + (L.isExpired(n, now) ? ' is-expired' : ''), draggable: 'true', 'data-id': n.id,
      ondragstart: (ev) => { ev.dataTransfer.setData('text/plain', n.id); ev.dataTransfer.effectAllowed = 'move'; ev.currentTarget.classList.add('is-drag'); document.body.classList.add('is-dragging'); },
      ondragend: (ev) => { ev.currentTarget.classList.remove('is-drag'); document.body.classList.remove('is-dragging'); },
      ontouchstart: (ev) => handleBoardTouchStart(ev, n.id, stage),
      ontouchmove: (ev) => handleBoardTouchMove(ev, $('#kanban')),
      ontouchend: (ev) => handleBoardTouchEnd(ev, n.id, stage, $('#kanban')),
      ontouchcancel: (ev) => handleBoardTouchEnd(ev, n.id, stage, $('#kanban'))
    },
    h('div', { class: 'bcard-top' }, ddayBadge(n), sub ? subTag(n, sub) : null,
      e && e.result ? h('span', { class: 'bres ' + resultTypeClass(e.result) }, (T.result && T.result[e.result]) || e.result) : null),
    h('button', {
      type: 'button', class: 'bcard-title', 'aria-haspopup': 'dialog',
      onclick: (ev) => {
        if (Date.now() < suppressDetailClickUntil) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        openDetail(n.id, false, ids);
      }
    }, titleOf(n)),
    pg.total ? h('div', { class: 'bcard-prog' },
      h('span', { class: 'bbar', 'aria-hidden': 'true' }, h('i', { style: `width:${(pg.done / pg.total) * 100}%` })),
      h('small', null, T.checksDone(pg.done, pg.total))) : null,
    e && e.memo ? h('p', { class: 'bcard-memo' }, e.memo) : null,
    h('div', { class: 'bcard-foot' },
      h('select', { class: 'bcard-move', 'aria-label': `${titleOf(n)} · ${T.moveTo}`, onchange: (ev) => moveStage(n.id, ev.target.value || null) },
        K.STAGES.map((s2) => h('option', { value: s2, selected: s2 === stage ? true : null }, T.stage[s2])),
        h('option', { value: '' }, T.boardRemove)),
      next ? h('button', { type: 'button', class: 'bcard-next', onclick: () => moveStage(n.id, next) }, T.stage[next], h('span', { 'aria-hidden': 'true' }, ' →')) : null));
  }
  function renderBoard() {
    const box = $('#kanban');
    if (!box || !K) return;
    const T = t();
    const cols = K.columns(DATA.notices, { track: state.track, saved: state.saved, applied: state.applied }, now);
    const sum = K.summary(cols, now);
    const ids = K.STAGES.flatMap((s2) => cols[s2].map((n) => n.id));
    const sumEl = $('#board-sum');
    if (sumEl) sumEl.textContent = T.boardSummary(sum);

    const hasCards = ids.length > 0;
    const guideEl = $('#board-pipeline-guide');
    if (guideEl) {
      if (!hasCards) {
        guideEl.hidden = false;
        fill(guideEl,
          h('div', { class: 'bpg-left' },
            h('span', { class: 'bpg-tag' }, '💡 PIPELINE'),
            h('div', { class: 'bpg-steps' },
              h('span', { class: 'bpg-step interest' }, h('span', { class: 'bcol-dot interest' }), T.stage.interest || '관심'),
              h('span', { class: 'bpg-arrow', 'aria-hidden': 'true' }, '→'),
              h('span', { class: 'bpg-step prep' }, h('span', { class: 'bcol-dot prep' }), T.stage.prep || '준비 중'),
              h('span', { class: 'bpg-arrow', 'aria-hidden': 'true' }, '→'),
              h('span', { class: 'bpg-step done' }, h('span', { class: 'bcol-dot done' }), T.stage.done || '지원 완료'),
              h('span', { class: 'bpg-arrow', 'aria-hidden': 'true' }, '→'),
              h('span', { class: 'bpg-step result' }, h('span', { class: 'bcol-dot result' }), T.stage.result || '결과')
            )
          ),
          h('div', { class: 'bpg-chips' },
            h('span', { class: 'bpg-chip-label' }, T.bpgLabel || (state.lang === 'en' ? 'Explore:' : state.lang === 'ja' ? 'おすすめクイック追加:' : state.lang === 'zh' ? '推荐快捷添加:' : '추천 바로담기:')),
            h('button', { type: 'button', class: 'chip small bpg-chip', onclick: () => goList({ due: 'soon', sort: 'deadline' }) }, T.bpgChipSoon || (state.lang === 'en' ? '🔥 Closing Soon' : state.lang === 'ja' ? '🔥 締切間近' : state.lang === 'zh' ? '🔥 即将截止' : '🔥 마감 임박')),
            h('button', { type: 'button', class: 'chip small bpg-chip', onclick: () => goList({ category: '장학', sort: 'deadline' }) }, T.bpgChipScholar || (state.lang === 'en' ? '💰 Scholarships' : state.lang === 'ja' ? '💰 奨学金' : state.lang === 'zh' ? '💰 奖学金' : '💰 장학금')),
            h('button', { type: 'button', class: 'chip small bpg-chip', onclick: () => goList({ category: '공모전', sort: 'deadline' }) }, T.bpgChipContest || (state.lang === 'en' ? '🏆 Contests' : state.lang === 'ja' ? '🏆 コンテスト' : state.lang === 'zh' ? '🏆 竞赛' : '🏆 공모전'))
          )
        );
      } else {
        guideEl.hidden = true;
        guideEl.replaceChildren();
      }
    }

    const stageNavEl = $('#board-stage-nav');
    if (stageNavEl) {
      const activeStage = stageNavEl.getAttribute('data-active-stage') || 'interest';
      fill(stageNavEl, ...K.STAGES.map((stage) => {
        const stageCards = cols[stage];
        const isActive = stage === activeStage;
        return h('button', {
          type: 'button',
          class: 'bsn-pill' + (isActive ? ' is-active' : ''),
          role: 'tab',
          'aria-selected': String(isActive),
          onclick: () => {
            stageNavEl.setAttribute('data-active-stage', stage);
            stageNavEl.querySelectorAll('.bsn-pill').forEach((p, idx) => {
              const matched = K.STAGES[idx] === stage;
              p.classList.toggle('is-active', matched);
              p.setAttribute('aria-selected', String(matched));
            });
            const targetCol = box.querySelector(`.bcol[data-stage="${stage}"]`);
            if (targetCol) {
              targetCol.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
          }
        },
          h('span', { class: 'bcol-dot ' + stage, 'aria-hidden': 'true' }),
          h('span', { class: 'bsn-label' }, T.stage[stage]),
          h('span', { class: 'bsn-badge' }, String(stageCards.length))
        );
      }));
    }

    box.classList.remove('is-empty');
    fill(box, ...K.STAGES.map((stage) => {
      const stageCards = cols[stage];
      let bodyContent;
      if (stageCards.length) {
        bodyContent = h('ul', { class: 'bcards' }, stageCards.map((n) => boardCard(n, stage, ids)));
      } else if (!hasCards && stage === 'interest') {
        bodyContent = h('div', { class: 'bcol-guide-card' },
          h('div', { class: 'bgc-icon' }, '⭐'),
          h('strong', { class: 'bgc-title' }, T.boardEmptyTitle || '관심 공지를 담아보세요'),
          h('p', { class: 'bgc-desc' }, T.boardEmpty || '공지에서 ★를 누르면 이 칸에 들어와요.'),
          h('button', { type: 'button', class: 'btn primary small bgc-btn', onclick: () => goList({ due: 'soon', sort: 'deadline' }) }, T.boardEmptyBtn || '마감 가까운 공지 보기')
        );
      } else {
        bodyContent = h('p', { class: 'bcol-empty' }, T.stageEmpty[stage]);
      }

      return h('section', {
        class: 'bcol', 'data-stage': stage, 'aria-label': T.stage[stage],
        ondragover: (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; ev.currentTarget.classList.add('is-over'); },
        ondragleave: (ev) => { if (!ev.currentTarget.contains(ev.relatedTarget)) ev.currentTarget.classList.remove('is-over'); },
        ondrop: (ev) => { ev.preventDefault(); ev.currentTarget.classList.remove('is-over'); const id = ev.dataTransfer.getData('text/plain'); if (id) moveStage(id, stage); }
      },
      h('header', { class: 'bcol-head' },
        h('span', { class: 'bcol-dot ' + stage, 'aria-hidden': 'true' }),
        h('h3', null, T.stage[stage]),
        h('span', { class: 'bcol-count' }, String(stageCards.length))
      ),
      bodyContent);
    }));

    if (!box._hasScrollSync) {
      box._hasScrollSync = true;
      let syncTid = null;
      box.addEventListener('scroll', () => {
        if (syncTid) cancelAnimationFrame(syncTid);
        syncTid = requestAnimationFrame(() => {
          const center = box.scrollLeft + box.clientWidth / 2;
          const cols = Array.from(box.querySelectorAll('.bcol'));
          if (!cols.length) return;
          let closestStage = 'interest';
          let minDiff = Infinity;
          cols.forEach((col) => {
            const colCenter = col.offsetLeft + col.offsetWidth / 2;
            const diff = Math.abs(center - colCenter);
            if (diff < minDiff) {
              minDiff = diff;
              closestStage = col.getAttribute('data-stage') || 'interest';
            }
          });
          const stageNavEl = $('#board-stage-nav');
          if (stageNavEl && stageNavEl.getAttribute('data-active-stage') !== closestStage) {
            stageNavEl.setAttribute('data-active-stage', closestStage);
            const pills = stageNavEl.querySelectorAll('.bsn-pill');
            pills.forEach((p, idx) => {
              const matched = K.STAGES[idx] === closestStage;
              p.classList.toggle('is-active', matched);
              p.setAttribute('aria-selected', String(matched));
              if (matched) {
                p.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
              }
            });
          }
        });
      }, { passive: true });
    }
  }

  function resultTypeClass(res) {
    if (!res) return '';
    const r = String(res).toLowerCase();
    if (/대상|최우수|우수|장려|입선|입상|수상|상금|award/.test(r)) return 'is-award';
    if (/합격|선정|수료|이수|완료|pass|select/.test(r)) return 'is-pass';
    if (/서류|본선|면접|milestone/.test(r)) return 'is-milestone';
    if (/대기|예비|wait/.test(r)) return 'is-wait';
    if (/불합격|미선정|미이수|탈락|fail/.test(r)) return 'is-fail';
    return 'is-custom';
  }

  function resultCategoryPresets(n) {
    const benefitInfo = L && L.classifyBenefit ? L.classifyBenefit(n) : { subs: [] };
    const primarySub = (benefitInfo.subs && benefitInfo.subs[0]) || '';
    const title = String((n && n.title) || '').toLowerCase();
    const isContest = primarySub === 'contest' || primarySub === 'prize' || /공모전|대회|경진대회|해커톤|시상|콘테스트|공모|미디어아트|창작|영상제/.test(title);
    const isScholarship = primarySub === 'scholarship' || primarySub === 'support' || /장학|장학생|지원사업|지원금|수혜/.test(title);
    const isEdu = primarySub === 'edu' || primarySub === 'activity' || primarySub === 'event' || /교육|특강|워크숍|아카데미|이수|수료|봉사|캠프|세미나|포럼/.test(title);
    const isCareer = primarySub === 'career' || primarySub === 'jobinfo' || /인턴|채용|서포터즈|기자단|홍보대사|크루|동아리|모집/.test(title);
    const lang = state.lang || 'ko';

    if (isContest) {
      const hint = lang === 'en' ? '🏆 Contest & Competition Results' : lang === 'zh' ? '🏆 竞赛与大赛专属结果' : lang === 'ja' ? '🏆 コンテスト・大会の結果' : '🏆 공모전·대회 맞춤 결과';
      const presets = lang === 'en' ? [
        { text: 'Grand Prize', badge: '🏆 Grand Prize', type: 'award' },
        { text: '1st Place', badge: '🥇 1st Place', type: 'award' },
        { text: 'Excellence Award', badge: '🥈 Excellence', type: 'award' },
        { text: 'Honorable Mention', badge: '🥉 Honorable', type: 'award' },
        { text: 'Selected / Finalist', badge: '🎖️ Finalist', type: 'award' },
        { text: 'Awarded', badge: '🏅 Awarded', type: 'award' },
        { text: 'Main Round', badge: '🎯 Main Round', type: 'milestone' },
        { text: 'Not Selected', badge: '❌ Not Selected', type: 'fail' }
      ] : lang === 'zh' ? [
        { text: '特等奖', badge: '🏆 特等奖', type: 'award' },
        { text: '一等奖', badge: '🥇 一等奖', type: 'award' },
        { text: '二等奖', badge: '🥈 二等奖', type: 'award' },
        { text: '三等奖/鼓励奖', badge: '🥉 鼓励奖', type: 'award' },
        { text: '入选/入围', badge: '🎖️ 入选', type: 'award' },
        { text: '获奖', badge: '🏅 获奖', type: 'award' },
        { text: '晋级决赛', badge: '🎯 决赛', type: 'milestone' },
        { text: '未入选', badge: '❌ 未入选', type: 'fail' }
      ] : lang === 'ja' ? [
        { text: '大賞', badge: '🏆 大賞', type: 'award' },
        { text: '最優秀賞', badge: '🥇 最優秀賞', type: 'award' },
        { text: '優秀賞', badge: '🥈 優秀賞', type: 'award' },
        { text: '奨励賞', badge: '🥉 奨励賞', type: 'award' },
        { text: '入選', badge: '🎖️ 入選', type: 'award' },
        { text: '受賞', badge: '🏅 受賞', type: 'award' },
        { text: '本選進出', badge: '🎯 本選', type: 'milestone' },
        { text: '不採択', badge: '❌ 不採択', type: 'fail' }
      ] : [
        { text: '대상', badge: '🏆 대상', type: 'award' },
        { text: '최우수상', badge: '🥇 최우수상', type: 'award' },
        { text: '우수상', badge: '🥈 우수상', type: 'award' },
        { text: '장려상', badge: '🥉 장려상', type: 'award' },
        { text: '입선', badge: '🎖️ 입선', type: 'award' },
        { text: '수상(입상)', badge: '🏅 수상', type: 'award' },
        { text: '본선 진출', badge: '🎯 본선진출', type: 'milestone' },
        { text: '미선정/탈락', badge: '❌ 미선정', type: 'fail' }
      ];
      return { theme: 'contest', hint, presets };
    }
    if (isScholarship) {
      const hint = lang === 'en' ? '💰 Scholarship & Grant Results' : lang === 'zh' ? '💰 奖学金专属结果' : lang === 'ja' ? '💰 奨学金・支援金の結果' : '💰 장학금·지원금 맞춤 결과';
      const presets = lang === 'en' ? [
        { text: 'Awarded', badge: '🎉 Awarded', type: 'pass' },
        { text: 'Waitlist Passed', badge: '✨ Waitlist', type: 'pass' },
        { text: 'Pending Review', badge: '⏳ Pending', type: 'wait' },
        { text: 'Not Selected', badge: '❌ Not Selected', type: 'fail' }
      ] : lang === 'zh' ? [
        { text: '获批/入选', badge: '🎉 获批', type: 'pass' },
        { text: '补录通过', badge: '✨ 补录', type: 'pass' },
        { text: '审核中', badge: '⏳ 审核中', type: 'wait' },
        { text: '未入选', badge: '❌ 未入选', type: 'fail' }
      ] : lang === 'ja' ? [
        { text: '採用 (受給)', badge: '🎉 採用', type: 'pass' },
        { text: '追加合格', badge: '✨ 追加合格', type: 'pass' },
        { text: '審査待ち', badge: '⏳ 審査待ち', type: 'wait' },
        { text: '不採択', badge: '❌ 不採択', type: 'fail' }
      ] : [
        { text: '선정 (수혜)', badge: '🎉 선정', type: 'pass' },
        { text: '추가 합격', badge: '✨ 추가합격', type: 'pass' },
        { text: '심사 대기', badge: '⏳ 심사대기', type: 'wait' },
        { text: '미선정/탈락', badge: '❌ 미선정', type: 'fail' }
      ];
      return { theme: 'scholarship', hint, presets };
    }
    if (isEdu) {
      const hint = lang === 'en' ? '📜 Education & Activity Results' : lang === 'zh' ? '📜 培训与活动专属结果' : lang === 'ja' ? '📜 教育・活動の結果' : '📜 교육·활동 맞춤 결과';
      const presets = lang === 'en' ? [
        { text: 'Completed', badge: '📜 Completed', type: 'pass' },
        { text: 'Participated', badge: '✨ Attended', type: 'pass' },
        { text: 'Graduated with Honors', badge: '🏆 Honors', type: 'award' },
        { text: 'Incomplete', badge: '❌ Incomplete', type: 'fail' }
      ] : lang === 'zh' ? [
        { text: '结业/修完', badge: '📜 结业', type: 'pass' },
        { text: '完成参加', badge: '✨ 参加', type: 'pass' },
        { text: '优秀学员/结业', badge: '🏆 优秀结业', type: 'award' },
        { text: '未修完', badge: '❌ 未修完', type: 'fail' }
      ] : lang === 'ja' ? [
        { text: '修了', badge: '📜 修了', type: 'pass' },
        { text: '参加完了', badge: '✨ 参加完了', type: 'pass' },
        { text: '優秀修了', badge: '🏆 優秀修了', type: 'award' },
        { text: '未修了', badge: '❌ 未修了', type: 'fail' }
      ] : [
        { text: '이수/수료', badge: '📜 수료', type: 'pass' },
        { text: '참가 완료', badge: '✨ 참가완료', type: 'pass' },
        { text: '우수 수료', badge: '🏆 우수수료', type: 'award' },
        { text: '미이수', badge: '❌ 미이수', type: 'fail' }
      ];
      return { theme: 'edu', hint, presets };
    }
    if (isCareer) {
      const hint = lang === 'en' ? '💼 Recruitment & Activity Results' : lang === 'zh' ? '💼 招聘与校外活动结果' : lang === 'ja' ? '💼 採用・活動の結果' : '💼 채용·대외활동 맞춤 결과';
      const presets = lang === 'en' ? [
        { text: 'Final Offer', badge: '🎉 Final Offer', type: 'pass' },
        { text: 'Resume Passed', badge: '📄 Resume Ok', type: 'milestone' },
        { text: 'Interview Stage', badge: '💬 Interview', type: 'milestone' },
        { text: 'Alternate List', badge: '⏳ Alternate', type: 'wait' },
        { text: 'Not Accepted', badge: '❌ Not Accepted', type: 'fail' }
      ] : lang === 'zh' ? [
        { text: '最终录取', badge: '🎉 最终录取', type: 'pass' },
        { text: '简历初审通过', badge: '📄 初审通过', type: 'milestone' },
        { text: '等待面试', badge: '💬 等待面试', type: 'milestone' },
        { text: '候补名单', badge: '⏳ 候补', type: 'wait' },
        { text: '未录取', badge: '❌ 未录取', type: 'fail' }
      ] : lang === 'ja' ? [
        { text: '最終合格', badge: '🎉 最終合格', type: 'pass' },
        { text: '書類選考通過', badge: '📄 書類通過', type: 'milestone' },
        { text: '面接待ち', badge: '💬 面接待ち', type: 'milestone' },
        { text: '補欠番号', badge: '⏳ 補欠', type: 'wait' },
        { text: '不合格', badge: '❌ 不合格', type: 'fail' }
      ] : [
        { text: '최종 합격', badge: '🎉 최종합격', type: 'pass' },
        { text: '서류 합격', badge: '📄 서류합격', type: 'milestone' },
        { text: '면접 대기', badge: '💬 면접대기', type: 'milestone' },
        { text: '예비 번호', badge: '⏳ 예비', type: 'wait' },
        { text: '불합격', badge: '❌ 불합격', type: 'fail' }
      ];
      return { theme: 'career', hint, presets };
    }
    const hint = lang === 'en' ? '🎯 Select Outcome' : lang === 'zh' ? '🎯 选择申请结果' : lang === 'ja' ? '🎯 応募結果を選択' : '🎯 지원 결과 선택';
    const presets = lang === 'en' ? [
      { text: 'Passed', badge: '🎉 Passed', type: 'pass' },
      { text: 'Awarded', badge: '🏆 Awarded', type: 'award' },
      { text: 'Selected', badge: '🌟 Selected', type: 'pass' },
      { text: 'Completed', badge: '📜 Completed', type: 'pass' },
      { text: 'Not Selected', badge: '❌ Not Selected', type: 'fail' }
    ] : lang === 'zh' ? [
      { text: '通过/录取', badge: '🎉 通过', type: 'pass' },
      { text: '获奖', badge: '🏆 获奖', type: 'award' },
      { text: '入选', badge: '🌟 入选', type: 'pass' },
      { text: '结业', badge: '📜 结业', type: 'pass' },
      { text: '未录取', badge: '❌ 未录取', type: 'fail' }
    ] : lang === 'ja' ? [
      { text: '合格', badge: '🎉 合格', type: 'pass' },
      { text: '受賞', badge: '🏆 受賞', type: 'award' },
      { text: '採用', badge: '🌟 採用', type: 'pass' },
      { text: '修了', badge: '📜 修了', type: 'pass' },
      { text: '不合格', badge: '❌ 不合格', type: 'fail' }
    ] : [
      { text: '합격', badge: '🎉 합격', type: 'pass' },
      { text: '수상', badge: '🏆 수상', type: 'award' },
      { text: '선정', badge: '🌟 선정', type: 'pass' },
      { text: '수료', badge: '📜 수료', type: 'pass' },
      { text: '불합격', badge: '❌ 불합격', type: 'fail' }
    ];
    return { theme: 'general', hint, presets };
  }

  function renderResultSection(n, e, checks) {
    const curResult = (e && e.result) || '';
    const cat = resultCategoryPresets(n);
    const activeClass = resultTypeClass(curResult);

    const setResult = (val) => {
      const trimmed = (val || '').trim();
      setTrack(K.update(state.track, n.id, { result: trimmed }), n.id);
      const T = t();
      if (trimmed) toast(T.resultSaved ? T.resultSaved(trimmed) : `결과가 [${trimmed}](으)로 저장되었습니다.`);
      else toast(T.resultCleared || '결과가 초기화되었습니다.');
    };

    return h('div', { class: 'result-tracker-wrap' },
      h('div', { class: 'result-head-row' },
        h('span', { class: 'result-guide-label' }, cat.hint),
        curResult ? h('div', { class: 'result-active-pill ' + activeClass },
          h('strong', null, curResult),
          h('button', {
            type: 'button',
            class: 'result-clear-btn',
            title: t().resultClearBtn || '결과 초기화',
            'aria-label': t().resultClearBtn || '결과 초기화',
            onclick: () => setResult('')
          }, '✕')
        ) : h('span', { class: 'fine' }, t().resultPickOrType || '결과를 선택하거나 직접 입력하세요')
      ),
      h('div', { class: 'result-presets-grid', role: 'group', 'aria-label': t().resultPresetAria || (state.lang === 'en' ? 'Outcome presets' : state.lang === 'zh' ? '推荐结果列表' : state.lang === 'ja' ? 'おすすめ結果一覧' : '추천 결과 목록') },
        cat.presets.map((p) => {
          const isSelected = curResult === p.badge || curResult === p.text;
          return h('button', {
            type: 'button',
            class: 'result-preset-chip ' + (isSelected ? `is-active is-${p.type}` : ''),
            'aria-pressed': String(isSelected),
            onclick: () => setResult(isSelected ? '' : p.badge)
          }, p.badge);
        })
      ),
      h('form', {
        class: 'result-custom-row',
        onsubmit: (ev) => {
          ev.preventDefault();
          const inp = ev.currentTarget.elements.customResult;
          setResult(inp ? inp.value : '');
        }
      },
        h('input', {
          name: 'customResult',
          type: 'text',
          class: 'result-custom-input',
          maxlength: '40',
          value: curResult,
          placeholder: state.lang === 'en' ? 'Enter custom outcome (e.g. Grand Prize, Waitlist #2...)'
            : state.lang === 'zh' ? '直接输入结果 (例: 特等奖, 候补第2名...)'
            : state.lang === 'ja' ? '結果を直接入力 (例: 大賞、補欠2番...)'
            : '직접 결과 입력 (예: 대상, 상금 300만원, 우수상, 예비 2번...)',
          'aria-label': state.lang === 'en' ? 'Custom outcome' : state.lang === 'zh' ? '直接输入结果' : state.lang === 'ja' ? '結果を直接入力' : '직접 결과 입력'
        }),
        h('button', { type: 'submit', class: 'btn small primary result-custom-submit' }, t().save || '저장')
      ),
      h('textarea', {
        class: 'memo result-memo',
        rows: '2',
        maxlength: '500',
        placeholder: state.lang === 'en' ? 'Detailed outcome memo (e.g. prize account submitted, interview notes)'
          : state.lang === 'zh' ? '结果详细备忘 (例: 奖金收款账户已提交、面试反馈等)'
          : state.lang === 'ja' ? '結果の詳細メモ (例: 賞金口座提出済み、面接メモなど)'
          : '결과 상세 메모 (예: 상금 수령 계좌 제출 완료, 면접 피드백, 소감 등)',
        'aria-label': state.lang === 'en' ? 'Outcome memo' : state.lang === 'zh' ? '结果详细备忘' : state.lang === 'ja' ? '結果の詳細メモ' : '결과 상세 메모',
        oninput: (ev) => {
          const v = ev.target.value;
          clearTimeout(memoTimer);
          memoTimer = setTimeout(() => setTrack(K.update(state.track, n.id, { memo: v }), n.id, true), 350);
        }
      }, (e && e.memo) || ''),
      checks && checks.length ? h('details', { class: 'result-prev-checks' },
        h('summary', null, state.lang === 'en'
          ? `Checklist (${checks.filter((c) => c.d).length}/${checks.length} done)`
          : state.lang === 'zh'
          ? `准备清单 (${checks.filter((c) => c.d).length}/${checks.length} 已完成)`
          : state.lang === 'ja'
          ? `準備チェックリスト (${checks.filter((c) => c.d).length}/${checks.length} 完了)`
          : `이전 준비물 체크리스트 (${checks.filter((c) => c.d).length}/${checks.length} 완료)`),
        h('ul', { class: 'checks' }, checks.map((c, i) => h('li', { class: c.d ? 'is-done' : '' },
          h('label', null,
            h('input', { type: 'checkbox', checked: c.d ? true : null, onchange: () => setTrack(K.toggleCheck(state.track, n.id, i), n.id) }),
            h('span', null, c.t)),
          h('button', { type: 'button', class: 'icon-x', 'aria-label': `${c.t} ${t().histRemove}`, onclick: () => setTrack(K.removeCheck(state.track, n.id, i), n.id) }, '×'))))) : null
    );
  }

  // 공지 상세의 '지원 준비': 단계 · 준비물 체크리스트 · 메모
  let memoTimer = null;
  function trackBox(n) {
    const T = t();
    const stage = K.stageOf(n.id, state.track, state.saved, state.applied);
    const e = state.track[n.id];
    const checks = (e && e.checks) || [];
    return h('section', { class: 'd-section track-box' },
      h('h3', null, T.trackTitle),
      h('div', { class: 'stage-seg', role: 'group', 'aria-label': T.boardTitle },
        K.STAGES.map((s2) => h('button', { type: 'button', 'aria-pressed': String(stage === s2), onclick: () => moveStage(n.id, s2) },
          h('span', { class: 'bcol-dot ' + s2, 'aria-hidden': 'true' }), T.stage[s2]))),
      stage === 'result' ? renderResultSection(n, e, checks) : [
        checks.length ? h('ul', { class: 'checks' }, checks.map((c, i) => h('li', { class: c.d ? 'is-done' : '' },
          h('label', null,
            h('input', { type: 'checkbox', checked: c.d ? true : null, onchange: () => setTrack(K.toggleCheck(state.track, n.id, i), n.id) }),
            h('span', null, c.t)),
          h('button', { type: 'button', class: 'icon-x', 'aria-label': `${c.t} ${T.histRemove}`, onclick: () => setTrack(K.removeCheck(state.track, n.id, i), n.id) }, '×')))) : null,
        h('form', { class: 'check-add', onsubmit: (ev) => {
          ev.preventDefault();
          const input = ev.currentTarget.elements.c;
          const v = input ? input.value : '';
          if (v && v.trim()) {
            setTrack(K.addCheck(state.track, n.id, v.trim()), n.id);
            input.value = '';
          }
        } },
          h('input', { name: 'c', type: 'text', maxlength: '40', placeholder: T.checkPh, 'aria-label': T.checkPh }),
          h('button', { type: 'submit', class: 'btn small' }, T.checkAdd)),
        h('div', { class: 'check-sugg' }, (T.checkSuggest || K.SUGGEST).filter((x) => !checks.some((c) => c.t === x)).slice(0, 6)
          .map((x) => h('button', { type: 'button', class: 'chip small', onclick: () => setTrack(K.addCheck(state.track, n.id, x), n.id) }, '+ ' + x))),
        h('textarea', { class: 'memo', rows: '2', maxlength: '500', placeholder: T.memoPh, 'aria-label': T.memoPh,
          oninput: (ev) => { const v = ev.target.value; clearTimeout(memoTimer); memoTimer = setTimeout(() => setTrack(K.update(state.track, n.id, { memo: v }), n.id, true), 350); } },
        (e && e.memo) || '')
      ]);
  }

  // ---------- 공지 보기 바꾸기: 목록 · 표 · 시간 맞춤 추천 ----------
  function renderViewSwitch() {
    const T = t();
    const tab = document.body.dataset.tab;
    const cur = tab === 'budget' ? 'budget' : state.nview;
    const items = [
      ['list', '📇 ' + T.nviewList, T.nviewListHint || '요약 카드 목록'],
      ['table', '📊 ' + T.nviewTable, T.nviewTableHint || '마감순 한눈에 비교하는 표'],
      ['budget', '⚡ ' + T.nviewBudget, state.lang === 'en' ? 'Notices matching free slots in my timetable' : state.lang === 'zh' ? '匹配课表空闲时间的公告' : state.lang === 'ja' ? '時間割の空きコマに合うお知らせ' : '내 시간표 공강에 맞는 공지']
    ];
    document.querySelectorAll('.view-switch').forEach((box) => {
      fill(box, ...items.map(([k, label, hint]) => h('button', {
        type: 'button', role: 'tab', 'aria-selected': String(cur === k),
        title: hint,
        onclick: () => {
          if (k === 'budget') { location.hash = '#/budget'; setTab('budget', true); return; }
          state.nview = k; store.set('nview', k);
          if (tab !== 'notices') { location.hash = '#/notices'; setTab('notices', true); }
          renderList(); renderViewSwitch();
        }
      }, label)));
    });
  }
  const shortDate = (s) => { const d = L.parseLocal(s); return d ? `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}` : ''; };
  // 표 보기: 머리글을 누르면 그 기준으로 정렬 (노션 데이터베이스 표처럼)
  function tableView(list, ids) {
    const T = t();
    const th = (label, sortKey, cls) => h('th', { scope: 'col', class: cls || null, 'aria-sort': sortKey && state.sort === sortKey ? (sortKey === 'latest' || sortKey === 'benefit' ? 'descending' : 'ascending') : null },
      sortKey ? h('button', { type: 'button', class: 'th-sort' + (state.sort === sortKey ? ' is-on' : ''), onclick: () => {
        state.sort = sortKey; store.set('sort', sortKey); $('#sort').value = sortKey; renderList();
      } }, label) : label);
    return h('div', { class: 'ntable-wrap' }, h('table', { class: 'ntable' },
      h('thead', null, h('tr', null, th(T.deadline, 'deadline', 'th-dl'), th(T.colTitle, null, 'th-title'), th(T.benefit, 'benefit', 'th-benefit'),
        th(T.eligibility, null, 'th-who'), th(T.board, null, 'th-board'), th(T.colPosted, 'latest', 'th-date'), h('th', { class: 'th-star' }, h('span', { class: 'visually-hidden' }, T.saveNotice)))),
      h('tbody', null, list.map((n) => {
        const left = L.daysLeft(n.deadline, now);
        const expired = L.isExpired(n, now);
        return h('tr', { 'data-id': n.id, class: (expired ? 'is-expired' : '') + (isRead(n.id) ? ' is-read' : '') },
          h('td', { class: 'td-dl' + (!expired && left !== null && left <= 3 ? ' urgent' : '') },
            n.deadline ? [h('strong', null, expired ? T.closed : left === 0 ? T.dueToday : `D-${left}`), h('small', null, shortDate(n.deadline))] : h('small', null, T.noDeadlineShort)),
          h('td', { class: 'td-title' },
            h('button', { type: 'button', class: 'tt-link', 'aria-haspopup': 'dialog', onclick: () => openDetail(n.id, false, ids) }, hl(titleOf(n))),
            h('div', { class: 'td-sub' }, fitBadge(n), X.isNew(n, since) ? h('span', { class: 'new-badge' }, T.newBadge) : null,
              ...L.classifyBenefit(n).subs.slice(0, 1).map((sb) => subTag(n, sb)))),
          h('td', { class: 'td-benefit' }, n.benefit ? tr(n.benefit.text) : h('span', { class: 'missing' }, '—')),
          h('td', { class: 'td-who' }, n.eligibility ? tr(n.eligibility) : h('span', { class: 'missing' }, '—')),
          h('td', { class: 'td-board' }, boardsOf(n)),
          h('td', { class: 'td-date' }, n.date ? shortDate(n.date) : ''),
          h('td', { class: 'td-star' }, starButton(n)));
      }))));
  }

  // 지원 자격 배지: 지원 가능 · 조건 확인 · 대상 아님 (마우스를 올리면 이유)
  function fitBadge(n) {
    if (!state.profile.set) return null;
    const r = fitOf(n);
    if (!r) return null;
    const T = t();
    const why = r.reasons.map((x) => T.fitReason(x)).filter(Boolean).join(' · ') || T.fitYesNote;
    return h('span', { class: 'fit-badge ' + r.status, title: why }, r.status === 'yes' ? T.fitYes : r.status === 'no' ? T.fitNo : T.fitCheck);
  }

  const filtersActive = () => !!(state.query || state.board || state.category || state.group || state.sub || state.savedOnly || state.mineOnly || state.keywordsOnly || state.unreadOnly || state.due || state.status !== 'open');
  function resetFilters() {
    Object.assign(state, { query: '', board: '', category: '', group: '', sub: '', savedOnly: false, mineOnly: false, keywordsOnly: false, unreadOnly: false, due: '', status: 'open' });
    $('#q').value = '';
    applyStaticText();
    renderList();
  }

  const BUILTIN_FILTER_PRESETS = [
    {
      id: 'fp_all',
      key: 'presetAll',
      defaultName: '전체 공지',
      icon: '🏛️',
      apply: () => {
        resetFilters();
      }
    },
    {
      id: 'fp_scholarship',
      key: 'presetScholarship',
      defaultName: '장학금 마감순',
      icon: '💰',
      apply: () => {
        state.category = '장학';
        state.group = '';
        state.sub = '';
        state.status = 'open';
        state.sort = 'deadline';
        state.savedOnly = false;
        state.mineOnly = false;
        state.due = '';
        if ($('#sort')) $('#sort').value = 'deadline';
        if ($('#status')) $('#status').value = 'open';
      }
    },
    {
      id: 'fp_soon',
      key: 'presetSoon',
      defaultName: '3일 내 마감',
      icon: '⚡',
      apply: () => {
        state.due = 'soon';
        state.status = 'open';
        state.sort = 'deadline';
        if ($('#sort')) $('#sort').value = 'deadline';
        if ($('#status')) $('#status').value = 'open';
      }
    },
    {
      id: 'fp_mine',
      key: 'presetMine',
      defaultName: '내 맞춤 공지',
      icon: '🎯',
      apply: () => {
        state.mineOnly = true;
        state.status = 'open';
        if ($('#mine-only')) $('#mine-only').checked = true;
        if ($('#status')) $('#status').value = 'open';
      }
    },
    {
      id: 'fp_noclash',
      key: 'presetNoClash',
      defaultName: '공강 시간대 공지',
      icon: '🗓️',
      apply: () => {
        state.hideConflicts = true;
        store.set('hideConflicts', true);
        const chk = $('#hide-conflicts');
        if (chk) chk.checked = true;
      }
    }
  ];

  function renderFilterPresets() {
    const el = $('#filter-presets');
    if (!el) return;
    const T = t();
    const customList = store.get('customFilterPresets', []) || [];

    const chips = [];
    chips.push(h('span', { class: 'fp-label' }, T.fastFilters || '⚡ 빠른 필터'));

    BUILTIN_FILTER_PRESETS.forEach((p) => {
      const isActive = state.activePresetId === p.id;
      const pName = T[p.key] || p.defaultName;
      chips.push(
        h('button', {
          type: 'button',
          class: `fp-chip ${isActive ? 'is-active' : ''}`,
          onclick: () => {
            state.activePresetId = p.id;
            state.keywordsOnly = false;
            p.apply();
            renderList();
            renderFilterPresets();
            toast(T.presetAppliedToast ? T.presetAppliedToast(pName) : `'${pName}' 필터가 적용되었습니다.`);
          }
        }, `${p.icon} ${pName}`)
      );
    });

    if (state.keywords && state.keywords.length > 0) {
      const kwList = state.keywords.map((k) => k.toLowerCase());
      const kwMatchingCount = (DATA.notices || []).filter((n) => {
        const t = (n.title || '').toLowerCase();
        const sm = S.pick(n, state.lang);
        const s = (sm && sm.text ? sm.text : '').toLowerCase();
        const b = (n.bodyText || '').toLowerCase();
        return kwList.some((k) => t.includes(k) || s.includes(k) || b.includes(k));
      }).length;

      const isKwActive = state.activePresetId === 'fp_my_keywords';
      chips.push(
        h('button', {
          type: 'button',
          class: `fp-chip kw-preset-chip ${isKwActive ? 'is-active' : ''}`,
          onclick: () => {
            state.activePresetId = 'fp_my_keywords';
            state.keywordsOnly = true;
            state.status = 'open';
            renderList();
            renderFilterPresets();
            toast(T.presetAppliedToast ? T.presetAppliedToast(T.kwPreset || '관심 키워드') : `'관심 키워드' 필터가 적용되었습니다.`);
          }
        }, `🏷️ ${T.kwPreset || '내 키워드'} (${kwMatchingCount})`)
      );
    }

    customList.forEach((cp) => {
      const isActive = state.activePresetId === cp.id;
      chips.push(
        h('div', { class: `fp-chip custom-fp ${isActive ? 'is-active' : ''}` },
          h('button', {
            type: 'button',
            class: 'fp-chip-btn',
            onclick: () => {
              state.activePresetId = cp.id;
              applyFilterState(cp.filter);
              renderList();
              renderFilterPresets();
              toast(T.presetAppliedToast ? T.presetAppliedToast(cp.name) : `'${cp.name}' 필터가 적용되었습니다.`);
            }
          }, `🏷️ ${cp.name}`),
          h('button', {
            type: 'button',
            class: 'fp-chip-del',
            title: T.presetDelTitle || '필터 삭제',
            'aria-label': `${cp.name} ${T.presetDelTitle || '필터 삭제'}`,
            onclick: (e) => {
              e.stopPropagation();
              deleteCustomFilterPreset(cp.id);
            }
          }, '×')
        )
      );
    });

    chips.push(
      h('button', {
        type: 'button',
        class: 'fp-save-btn',
        title: T.presetSaveCurrentTitle || '현재 설정된 검색·필터 조건을 프리셋으로 저장',
        onclick: saveCurrentAsFilterPreset
      }, T.presetSaveCurrent || '+ 현재 조건 저장')
    );

    fill(el, ...chips);
  }

  function applyFilterState(f) {
    if (!f) return;
    if (f.board !== undefined) { state.board = f.board; if ($('#board')) $('#board').value = f.board; }
    if (f.category !== undefined) state.category = f.category;
    if (f.status !== undefined) { state.status = f.status; if ($('#status')) $('#status').value = f.status; }
    if (f.sort !== undefined) { state.sort = f.sort; if ($('#sort')) $('#sort').value = f.sort; }
    if (f.savedOnly !== undefined) state.savedOnly = !!f.savedOnly;
    if (f.mineOnly !== undefined) {
      state.mineOnly = !!f.mineOnly;
      if ($('#mine-only')) $('#mine-only').checked = state.mineOnly;
    }
    if (f.unreadOnly !== undefined) state.unreadOnly = !!f.unreadOnly;
    if (f.hideConflicts !== undefined) {
      state.hideConflicts = !!f.hideConflicts;
      store.set('hideConflicts', state.hideConflicts);
      const chk = $('#hide-conflicts');
      if (chk) chk.checked = state.hideConflicts;
    }
    if (f.query !== undefined) {
      state.query = f.query;
      if ($('#q')) $('#q').value = f.query;
    }
  }

  function saveCurrentAsFilterPreset() {
    const T = t();
    const customList = store.get('customFilterPresets', []) || [];
    const promptMsg = T.presetSavePrompt || '현재 필터 조건의 이름을 입력하세요:';
    const defaultVal = (state.lang === 'en' ? 'Filter ' : state.lang === 'zh' ? '筛选 ' : state.lang === 'ja' ? 'フィルター ' : '내 필터 ') + (customList.length + 1);
    const name = (prompt(promptMsg, defaultVal) || '').trim();
    if (!name) return;
    const newPreset = {
      id: 'custom_fp_' + Date.now().toString(36),
      name,
      filter: {
        board: state.board,
        category: state.category,
        status: state.status,
        sort: state.sort,
        savedOnly: state.savedOnly,
        mineOnly: state.mineOnly,
        unreadOnly: state.unreadOnly,
        hideConflicts: state.hideConflicts,
        query: state.query
      }
    };
    customList.push(newPreset);
    store.set('customFilterPresets', customList);
    state.activePresetId = newPreset.id;
    renderFilterPresets();
    toast(T.presetAppliedToast ? T.presetAppliedToast(name) : `'${name}' 필터 프리셋이 저장되었습니다.`);
  }

  function deleteCustomFilterPreset(id) {
    const T = t();
    let customList = store.get('customFilterPresets', []) || [];
    customList = customList.filter((p) => p.id !== id);
    store.set('customFilterPresets', customList);
    if (state.activePresetId === id) state.activePresetId = '';
    renderFilterPresets();
    toast(T.presetDelTitle ? `${T.presetDelTitle} 완료` : '필터 프리셋이 삭제되었습니다.');
  }

  function renderListTools() {
    renderFilterPresets();
    const mineWrap = $('#mine-only-wrap');
    if (mineWrap) { mineWrap.hidden = !hasMine() && !state.mineOnly; $('#mine-only').checked = state.mineOnly; }
    const fitWrap = $('#fit-only-wrap');
    if (fitWrap) { fitWrap.hidden = !state.profile.set || !EL; $('#fit-only').checked = state.fitOnly; }
    const fitSetup = $('#fit-setup');
    if (fitSetup) fitSetup.hidden = state.profile.set || !EL;
    const unread = $('#unread-only');
    if (unread) unread.checked = state.unreadOnly;
    const label = $('#saved-only-label');
    if (label) label.textContent = t().savedOnly(state.saved.length);
    const chk = $('#saved-only');
    if (chk) chk.checked = state.savedOnly;
    const btn = $('#reset-filters');
    if (btn) btn.hidden = !filtersActive();
    const btnAllRead = $('#mark-all-read');
    if (btnAllRead) {
      btnAllRead.textContent = t().markAllRead || '✓ 모두 읽음';
      btnAllRead.onclick = markAllAsRead;
    }
    // 오늘 화면에서 넘어온 조건은 목록 위에 한 줄로 보여 주고, 눌러서 바로 풀 수 있게 한다
    const note = $('#due-note');
    if (note) {
      note.hidden = !state.due;
      if (state.due) {
        fill(note, h('span', null, t().dueNote[state.due]),
          h('button', { type: 'button', class: 'link-btn', onclick: () => {
            // 조건을 풀면 정렬도 내가 골라 둔 순서로 되돌린다
            state.due = ''; state.sort = store.get('sort', 'deadline'); $('#sort').value = state.sort; renderList();
          } }, t().dueClear));
      }
    }
    // 휴대폰의 '필터·정렬' 버튼: 지금 걸려 있는 조건 수를 숫자로 보여 준다
    const ft = $('#filter-toggle');
    if (ft) {
      const n = [state.board, state.category, state.status !== 'open', state.sort !== 'deadline', state.savedOnly, state.mineOnly, state.unreadOnly, state.grouped].filter(Boolean).length;
      const cnt = ft.querySelector('.ft-count');
      cnt.textContent = n ? String(n) : '';
      cnt.hidden = !n;
      ft.setAttribute('aria-label', t().filterToggleAria(n));
    }
  }

  let moreObserver = null;
  function renderList() {
    // 조건(검색·분류·정렬·보기 …)이 바뀌면 처음 30건부터 다시 보여 준다
    const sig = JSON.stringify([state.nview, state.query, state.board, state.category, state.status, state.sort, state.group, state.sub,
      state.savedOnly, state.mineOnly, state.unreadOnly, state.due, state.grouped, state.hideConflicts, state.lang]);
    const fresh = sig !== state.sig;                 // 조건이 바뀌었을 때만 행이 차례로 떠오르게 (더 보기로 늘릴 때는 그대로)
    if (fresh) { state.sig = sig; state.limit = PAGE; }
    const { base, counts, subCounts, list: full, hidden, fitHidden } = computeVisible();
    const list = full.slice(0, state.limit);
    const rest = full.length - list.length;
    listIds = full.map((n) => n.id);
    renderListTools();
    renderChips(counts, subCounts, base.length);
    $('#count').textContent = t().count(full.length) + (hidden ? ` · ${t().hiddenByConflict(hidden)}` : '') + (fitHidden ? ` · ${t().fitHidden(fitHidden)}` : '');
    const box = $('#list');
    if (!list.length) {
      const T = t();
      const q = state.query.trim();
      // 검색했는데 없으면: 무엇이 없는지, 어떻게 찾는지, 마감 지난 공지까지 찾기를 바로 보여 준다
      fill(box, h('div', { class: 'empty' },
        h('p', null, state.savedOnly && !state.saved.length ? T.savedEmpty : q ? T.noResultFor(q) : T.empty),
        q ? h('p', { class: 'fine' }, T.searchTips) : null,
        h('div', { class: 'empty-actions' },
          q && state.status !== 'all' ? h('button', { type: 'button', class: 'btn small primary', onclick: () => {
            state.status = 'all'; $('#status').value = 'all'; renderList();
          } }, T.searchAllStatus) : null,
          filtersActive() ? h('button', { type: 'button', class: 'btn small', onclick: resetFilters }, T.resetFilters) : null)));
      return;
    }
    box.classList.toggle('reveal', fresh && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
    if (state.nview === 'table') {
      if (state.grouped) {
        fill(box, ...L.groupByBenefit(list).map((g) =>
          h('section', { class: 'group group-table' },
            h('h3', { class: 'group-title' },
              h('span', { class: 'tag kind-' + g.group }, groupLabel(g.group)),
              h('span', { class: 'group-count' }, t().count(g.items.length))),
            tableView(g.items, listIds))));
      } else {
        fill(box, tableView(list, listIds));
      }
    } else if (state.grouped) {
      fill(box, ...L.groupByBenefit(list).map((g) =>
        h('section', { class: 'group' },
          h('h3', { class: 'group-title' },
            h('span', { class: 'tag kind-' + g.group }, groupLabel(g.group)),
            h('span', { class: 'group-count' }, t().count(g.items.length))),
          h('ul', { class: 'cards' }, g.items.map(card)))));
    } else {
      fill(box, h('ul', { class: 'cards' }, list.map(card)));
    }
    box.querySelectorAll('.card').forEach((el, i) => { if (i < 14) el.style.setProperty('--i', String(i)); });
    if (rest > 0) {
      const more = h('button', { type: 'button', class: 'btn more-btn', onclick: () => { state.limit += PAGE; renderList(); } }, t().moreItems(rest));
      box.append(more);
      // 버튼이 화면 가까이 오면 저절로 다음 30건 (버튼은 키보드·느린 기기용으로 그대로 둠)
      if ('IntersectionObserver' in window) {
        moreObserver = moreObserver || new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting) && document.body.dataset.tab === 'notices') { state.limit += PAGE; renderList(); }
        }, { rootMargin: '600px 0px' });
        moreObserver.disconnect();
        moreObserver.observe(more);
      }
    } else if (moreObserver) {
      moreObserver.disconnect();
    }
    if (rest <= 0) { const arc = archiveHint(); if (arc) box.append(arc); }
  }

  // 목록 끝: 보관 기간(기본 6개월 = 한 학기 이상) 동안 마감된 공지도 가지고 있다는 안내 + 바로 보기
  function archiveHint() {
    if (state.status !== 'open' || state.savedOnly || state.due || state.query.trim()) return null;
    // 지금 고른 게시판·분야·받는 것 조건 그대로, 마감만 지난 공지 수
    const past = L.filterNotices(DATA.notices, { board: state.board, category: state.category, group: state.group, sub: state.sub, status: 'past' }, now).length;
    if (!past) return null;
    const T = t();
    const keep = DATA.meta.keep;
    return h('div', { class: 'archive-hint' },
      h('p', null, T.archiveHint(past, keep && keep.months ? keep.months : 0)),
      h('button', { type: 'button', class: 'btn small', onclick: () => {
        state.status = 'past'; $('#status').value = 'past'; renderList();
        const top = $('#list'); if (top) top.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
      } }, T.archiveBtn));
  }

  // ---------- 해독 카드 (상세 대화상자) ----------
  function fact(label, value, missing) {
    return [h('dt', null, label), h('dd', { class: missing ? 'missing' : null }, value)];
  }

  function renderNoticeMemo(n) {
    const notes = store.get('noticeNotes', {}) || {};
    const memo = notes[n.id] || '';

    const textarea = h('textarea', {
      class: 'notice-memo-input',
      rows: '2',
      placeholder: t().myMemoPh || '이 공지에 대한 메모를 남겨보세요. (예: 3월 15일 서류제출, 지원자격 확인)',
      oninput: (e) => {
        const val = e.target.value.trim();
        const curNotes = store.get('noticeNotes', {}) || {};
        if (val) curNotes[n.id] = val;
        else delete curNotes[n.id];
        store.set('noticeNotes', curNotes);
        renderList();
      }
    });
    textarea.value = memo;

    return h('section', { class: 'd-section notice-memo-sec' },
      h('div', { class: 'memo-sec-head' },
        h('h3', null, t().myMemo || '📝 내 개인 메모'),
        h('span', { class: 'memo-sec-hint' }, t().myMemoHint || '기기에만 안전하게 자동 저장됩니다.')
      ),
      textarea
    );
  }

  function detailContent(n) {
    const T = t();
    const conflicts = L.findConflicts(n, state.timetable);
    const parts = [];

    parts.push(h('div', { class: 'card-top' },
      ...L.classifyBenefit(n).subs.map((sb) => subTag(n, sb)),
      h('span', { class: 'card-board' }, `${catLabel(n.category)} · ${boardsOf(n)}`),
      ddayBadge(n)));
    parts.push(h('h2', { id: 'detail-title' }, titleOf(n)));
    if (n.overrides || n.pinned || X.isNew(n, since) || isApplied(n.id) || mineOf(n).any) {
      parts.push(h('p', { class: 'badges' },
        X.isNew(n, since) ? h('span', { class: 'new-badge' }, T.newBadge) : null,
        n.pinned ? h('span', { class: 'pin-badge' }, T.pinnedBadge) : null,
        isApplied(n.id) ? h('span', { class: 'applied-badge' }, T.appliedBadge) : null,
        mineOf(n).any ? h('span', { class: 'mine-badge' }, T.mineBadge) : null,
        n.overrides ? h('span', { class: 'badge ok' }, T.overriddenBadge) : null));
    }
    if (n.opNote) parts.push(h('p', { class: 'op-note' }, `${T.opNoteLabel}: ${n.opNote}`));
    if (n.aiPending) parts.push(h('p', { class: 'ai-note pending-note' }, T.aiPendingNote));
    if (n.check) {
      const d = I.formatDate(L.parseLocal(n.check.deadline), state.lang);
      parts.push(h('div', { class: 'check-note', role: 'note' },
        h('p', null, n.check.kind === 'missing' ? T.checkMissing(d) : T.checkNote(d)),
        n.check.line ? h('p', { class: 'check-line' }, h('span', null, T.checkLine), h('q', { lang: 'ko' }, n.check.line)) : null));
    }
    if (state.lang !== 'ko') parts.push(h('p', { class: 'card-orig' }, `${T.originalTitle}: `, h('span', { lang: 'ko' }, n.title)));
    if (n.bodyStatus === 'image') parts.push(h('p', { class: 'badges' }, h('span', { class: 'badge warn' }, T.imageOnly)));
    if (fromMedia(n)) {
      const names = n.readFrom.map((x) => (x.kind === 'poster' ? T.posterLabel : `'${x.name}'`))
        .filter((v, i, a) => a.indexOf(v) === i).join(', ');
      parts.push(h('p', { class: 'ai-note' }, T.readMediaNote(names)));
    }

    const sm = S.pick(n, state.lang);
    parts.push(h('section', { class: 'd-section' },
      h('h3', null, T.summary),
      sm.text ? [h('p', null, sm.text), n.aiPending || fromMedia(n) ? null : h('p', { class: 'ai-note' }, T.aiNote)] : h('p', { class: 'summary-none' }, T.summaryNone)));

    if (n.bodyStatus !== 'image') {
      const eventsNode = n.events && n.events.length
        ? h('ul', { class: 'plain' }, n.events.map((ev) => h('li', null, formatEvent(ev))),
            conflicts.map((c) => h('li', { class: 'conflict-note' }, T.conflictWith(c.cls, dayName(c.cls.day)))))
        : null;
      parts.push(h('dl', { class: 'facts' },
        n.deadline
          ? fact(T.deadline, [I.formatDateTime(L.parseLocal(n.deadline), state.lang), ' ', ddayBadge(n)])
          : fact(T.deadline, T.notStated, true),
        n.benefit ? fact(T.benefit, [
          tr(n.benefit.text),
          (L.classifyBenefit(n).subs.includes('dadream') || (n.benefit && n.benefit.points)) ? h('div', { class: 'dadream-scholarship-tip' },
            h('span', { class: 'dst-badge' }, '🍱 ' + ((T.subs && T.subs.dadream) || '다드림 포인트')),
            h('span', { class: 'dst-desc' }, T.dadreamScholarshipTip || '건국대 다드림 포인트 장학금: 학기별 상위 400명에게 현금 장학금(대상 70만·최우수 50만·우수 30만·장려 10만 원) 지급!')
          ) : null
        ]) : fact(T.benefit, T.notStated, true),
        fact(T.category, catLabel(n.category)),
        n.eligibility ? fact(T.eligibility, tr(n.eligibility)) : fact(T.eligibility, T.notStated, true),
        state.profile.set && fitOf(n) ? fact(T.fitLabel, [fitBadge(n), ' ',
          h('span', { class: 'fit-why' }, fitOf(n).reasons.map((x) => T.fitReason(x)).filter(Boolean).join(' · ') || T.fitYesNote)]) : null,
        eventsNode ? fact(T.when, eventsNode) : null,
        n.hours ? fact(T.hours, T.hoursValue(n.hours)) : null));
    }

    // 자주 쓰는 동작(지원 완료·캘린더·공유·요약 복사)은 핵심 정보 바로 아래에
    parts.push(h('div', { class: 'd-actions' },
      h('button', {
        type: 'button', class: 'btn small' + (isApplied(n.id) ? ' is-on' : ''), 'aria-pressed': String(isApplied(n.id)),
        title: isApplied(n.id) ? T.appliedUnmark : T.appliedMark, 'aria-label': isApplied(n.id) ? T.appliedUnmark : T.appliedMark,
        onclick: () => toggleApplied(n.id)
      }, isApplied(n.id) ? '✓ ' + T.appliedBadge : T.appliedMark),
      n.deadline ? h('a', {
        href: gcalUrl(n), target: '_blank', rel: 'noopener noreferrer',
        class: 'btn small btn-gcal', title: T.gcalHint || 'Google 캘린더에 마감 일정 등록'
      }, `📅 ${T.gcalAdd || 'Google 캘린더'}`) : null,
      h('button', { type: 'button', class: 'btn small', onclick: () => exportCalendar([n], 'gongji-' + n.id) }, T.addToCalendar),
      h('button', { type: 'button', class: 'btn small btn-copy-card', onclick: () => copyNoticeCard(n), title: T.copySummary || '요약 복사' }, T.copySummary || '📋 요약 복사'),
      h('button', { type: 'button', class: 'btn small btn-tts-speak', onclick: () => speakNoticeSummary(n), title: T.speakSummary || '요약 듣기' }, T.speakSummary || '🔊 요약 듣기'),
      h('button', {
        type: 'button',
        class: 'btn small btn-card-img',
        title: T.cardNewsTitle || '카드뉴스 저장 및 공유',
        onclick: () => {
          if (window.GongjiNoticeImage) {
            window.GongjiNoticeImage.openNoticeCardModal(n, {
              lang: state.lang,
              now,
              titleOf,
              boardsOf,
              catLabel
            });
          }
        }
      }, T.cardNewsTitle || '🖼️ 카드뉴스'),
      h('button', { type: 'button', class: 'btn small', onclick: () => shareNotice(n) }, navigator.share ? T.share : T.copyLink)));
    if (K) parts.push(trackBox(n));
    parts.push(renderNoticeMemo(n));


    // 캘린더에 추가: 마감·행사마다 구글 캘린더로 한 번에 (서버·키 없이 주소만으로)
    const gItems = X.noticeToIcsItems(n, { title: titleOf(n), deadline: T.deadline, summary: sm.text });
    if (gItems.length) {
      const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })();
      parts.push(h('section', { class: 'd-section' },
        h('h3', null, T.gcalSection),
        h('ul', { class: 'gcal-list' }, gItems.map((it) => {
          const isDeadline = /-deadline@/.test(it.uid);
          const d = L.parseLocal(it.start);
          const when = it.start.includes('T') ? I.formatDateTime(d, state.lang) : I.formatDate(d, state.lang);
          return h('li', { class: 'gcal-row' },
            h('span', null, `${isDeadline ? T.gcalKindDeadline : T.gcalKindEvent} · ${when}`),
            h('a', { class: 'btn small', href: C.googleUrl(it, tz), target: '_blank', rel: 'noopener noreferrer' }, T.gcalAdd + ' ↗'));
        })),
        h('p', { class: 'fine' }, T.gcalHint)));
    }

    const ev = n.evidence || {};
    const evKeys = Object.keys(ev);
    if (evKeys.length) {
      parts.push(h('section', { class: 'd-section' },
        h('h3', null, T.evidence, n.evidenceVerified === true ? h('span', { class: 'badge ok' }, '✓ ' + T.verified) : null),
        h('ul', { class: 'evidence' }, evKeys.map((k) =>
          h('li', null, h('span', { class: 'ev-label' }, T.evidenceField[k] || k),
            h('q', { lang: 'ko' }, ev[k]))))));
    }

    const r = n.regulation;
    parts.push(h('section', { class: 'd-section' },
      h('h3', null, T.regulation),
      r ? [
        r.title ? h('p', { class: 'reg-title' }, tr(r.title)) : null,
        // 요람 문장
        r.quote ? [
          h('blockquote', { lang: 'ko' }, r.quote),
          state.lang !== 'ko' && r.tr && r.tr[state.lang] ? h('p', null, `${T.regulationTr}: ${r.tr[state.lang]}`) : null,
          h('p', { class: 'fine' }, T.regulationSource(Object.assign({}, r, { source: (r.sourceTr && r.sourceTr[state.lang]) || r.source })))
        ] : null,
        // 규정정보시스템 조문
        r.rule ? [
          h('blockquote', { lang: 'ko' }, r.rule.quote),
          state.lang !== 'ko' && r.rule.tr && r.rule.tr[state.lang] ? h('p', null, `${T.regulationTr}: ${r.rule.tr[state.lang]}`) : null,
          h('p', { class: 'fine' }, T.ruleSource(r.rule), ' ',
            r.rule.url ? h('a', { href: r.rule.url, target: '_blank', rel: 'noopener' }, T.ruleLink) : null)
        ] : null
      ] : h('p', { class: 'missing' }, T.regulationNone)));

    // 파이프라인이 붙여 둔 용어에 더해, 지금 용어집에서 제목·요약·근거 문장에 나온 용어를 바로 찾는다 (용어집만 갱신해도 예전 공지에 풀이가 붙는다).
    const terms = glossaryTermsFor(n);
    if (terms.length) {
      // 용어가 많으면 접어 두고(한국어 화면), 유학생 언어에서는 처음부터 펼쳐 둔다. 한 번 펼치거나 접으면 그 공지를 보는 동안 유지
      const open = glossFold.id === n.id ? glossFold.open : (state.lang !== 'ko' || terms.length <= 3);
      parts.push(h('details', { class: 'd-section d-fold', open, ontoggle: (e) => { glossFold.id = n.id; glossFold.open = e.currentTarget.open; } },
        h('summary', null, h('h3', null, T.glossaryTitle), h('span', { class: 'group-count' }, String(terms.length))),
        h('dl', { class: 'glossary' }, terms.map((k) => {
          const g = GLOSSARY[k];
          return [
            h('dt', null, h('span', { lang: 'ko' }, k), state.lang !== 'ko' && g.tr ? ` · ${g.tr[state.lang]}` : ''),
            h('dd', null, g[state.lang] || g.ko)
          ];
        }))));
    }

    // 비슷한 공지 스마트 추천: 모던 카드 덱 형태
    const rel = relatedNotices(n, 3);
    if (rel.length) {
      const ids = [n.id].concat(rel.map((x) => x.id));
      parts.push(h('section', { class: 'd-section related-notices-sec' },
        h('div', { class: 'rn-head' },
          h('h3', null, `💡 ${T.relatedTitle || '이 공지와 비슷한 추천 공지'}`),
          h('span', { class: 'rn-sub' }, T.unitCount ? `${rel.length}${T.unitCount}` : `${rel.length}`)
        ),
        h('div', { class: 'rn-deck' }, rel.map((x) => {
          const sub = L.classifyBenefit(x).subs[0];
          return h('button', {
            type: 'button',
            class: 'rn-card',
            onclick: () => { openDetail(x.id, false, ids); $('#detail-body').scrollTop = 0; }
          },
            h('div', { class: 'rn-card-top' },
              sub ? subTag(x, sub) : h('span', { class: 'rn-cat' }, catLabel(x.category)),
              ddayBadge(x)
            ),
            h('p', { class: 'rn-card-title' }, titleOf(x)),
            h('div', { class: 'rn-card-foot' },
              h('span', { class: 'rn-board' }, boardsOf(x)),
              x.deadline ? h('span', { class: 'rn-date' }, I.formatDate(L.parseLocal(x.deadline), state.lang)) : null
            )
          );
        }))
      ));
    }

    if (!n.link) parts.push(h('p', { class: 'original' }, h('span', { class: 'fine' }, T.noOriginal)));

    return parts;
  }

  function relatedNotices(n, limit) {
    const mineSubs = new Set(L.classifyBenefit(n).subs.filter((v) => v !== 'etc' && v !== 'unknown'));
    const nWords = (n.title || '').replace(/[\[\]\(\)\-\_\,\.]/g, ' ').split(/\s+/).filter((w) => w.length >= 2);
    const scored = [];

    for (const x of activeNotices()) {
      if (x.id === n.id || L.isExpired(x, now)) continue;
      let score = 0;
      const xSubs = L.classifyBenefit(x).subs;
      const sharedSubs = xSubs.filter((v) => mineSubs.has(v)).length;
      score += sharedSubs * 3;

      if (x.category && x.category === n.category) score += 2;
      if (x.boardName && x.boardName === n.boardName) score += 1.5;

      const xTitle = x.title || '';
      for (const w of nWords) {
        if (xTitle.includes(w)) score += 1.5;
      }

      if (score > 1.2) {
        scored.push({ x, score });
      }
    }

    const dl = (x) => (x.deadline ? L.parseLocal(x.deadline).getTime() : Infinity);
    scored.sort((a, b) => b.score - a.score || dl(a.x) - dl(b.x));
    return scored.slice(0, limit).map((s) => s.x);
  }

  // 상세 창 아래 고정 줄: 어디까지 내려 읽었든 저장과 원문 보기를 바로 누를 수 있게 한다
  const glossFold = { id: null, open: false };
  function detailFoot(n) {
    const T = t();
    const saved = isSaved(n.id);
    return [
      h('button', { type: 'button', class: 'btn' + (saved ? ' is-on' : ''), 'aria-pressed': String(saved), onclick: () => toggleSave(n.id) },
        (saved ? '★ ' : '☆ ') + (saved ? T.savedNotice : T.saveNotice)),
      h('button', {
        type: 'button',
        class: 'btn btn-card-img',
        title: T.cardNewsTitle || '카드뉴스 저장',
        onclick: () => {
          if (window.GongjiNoticeImage) {
            window.GongjiNoticeImage.openNoticeCardModal(n, {
              lang: state.lang,
              now,
              titleOf,
              boardsOf,
              catLabel
            });
          }
        }
      }, '🖼️ ' + (T.cardNewsTitle ? T.cardNewsTitle.replace('🖼️ ', '') : '카드뉴스')),
      n.link ? h('a', { href: n.link, target: '_blank', rel: 'noopener noreferrer', class: 'btn primary' }, T.original + ' ↗') : null
    ];
  }

  // 상세 창에서 이전·다음으로 넘길 공지 순서: 목록에서 열면 지금 목록, 오늘 화면에서 열면 그 칸의 공지들
  let listIds = [];
  let navIds = null;
  function openDetail(id, keepScroll, ids) {
    const n = DATA.notices.find((x) => x.id === id);
    if (!n) return;
    if (ids) navIds = ids;
    else if (!keepScroll && !$('#detail').open) navIds = listIds.includes(id) ? listIds : null;
    state.openId = id;
    renderDetailNav(id);
    const body = $('#detail-body');
    const top = body.scrollTop;
    fill(body, ...detailContent(n));
    fill($('#detail-foot'), ...detailFoot(n));
    const dlg = $('#detail');
    if (!dlg.open) {
      dlg.showModal();
      const title = $('#detail-title');
      if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
      try { history.replaceState(null, '', '#/n/' + encodeURIComponent(id)); } catch (e) { /* 주소 바꾸기 실패는 무시 */ }
    }
    dlg.dataset.noticeId = id; // enhanced.js 스크롤 복원 연동
    body.scrollTop = keepScroll ? top : 0;
    markRead(id);
  }

  function renderDetailNav(id) {
    const nav = $('#detail-nav');
    const i = navIds ? navIds.indexOf(id) : -1;
    nav.hidden = i < 0 || navIds.length < 2;
    if (nav.hidden) { nav.replaceChildren(); return; }
    const T = t();
    fill(nav,
      h('span', { class: 'nav-pos', title: T.navHint }, T.navPos(i + 1, navIds.length)),
      h('button', { type: 'button', class: 'icon-btn nav-btn', 'aria-label': T.prevNotice, title: T.prevNotice + ' (←)', disabled: i === 0, onclick: () => stepDetail(-1) }, '‹'),
      h('button', { type: 'button', class: 'icon-btn nav-btn', 'aria-label': T.nextNotice, title: T.nextNotice + ' (→)', disabled: i === navIds.length - 1, onclick: () => stepDetail(1) }, '›'));
  }
  function stepDetail(d) {
    if (!navIds || !state.openId) return;
    const j = navIds.indexOf(state.openId) + d;
    if (j < 0 || j >= navIds.length || j - d < 0) return;
    const body = $('#detail-body');
    body.classList.remove('slide-next', 'slide-prev');
    void body.offsetWidth;                      // 같은 방향으로 연달아 넘겨도 움직임이 다시 나오게
    openDetail(navIds[j]);
    body.classList.add(d > 0 ? 'slide-next' : 'slide-prev');
    try { history.replaceState(null, '', '#/n/' + encodeURIComponent(navIds[j])); } catch (e) { /* 무시 */ }
  }

  // ---------- 캘린더 내보내기 · 공유 ----------
  // 아래에 잠깐 뜨는 안내. action 을 주면 '되돌리기' 같은 버튼이 같이 뜬다
  function toast(msg, action) {
    const el = $('#toast');
    $('#toast-text').textContent = msg;
    const btn = $('#toast-action');
    btn.hidden = !action;
    btn.onclick = null;
    if (action) {
      btn.textContent = action.label;
      btn.onclick = () => { el.hidden = true; clearTimeout(toast.timer); action.run(); };
    }
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 3500);
  }
  window.toast = toast;
  window.showToast = toast;
  function download(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportCalendar(list, name) {
    const items = [];
    for (const n of list) {
      items.push(...X.noticeToIcsItems(n, { title: titleOf(n), deadline: t().deadline, summary: tr(n.summary) }));
    }
    const r = X.buildIcs(items, { name: '공지 줍줍', now: new Date() });
    if (!r.count) { toast(t().calendarNone); return; }
    download(`${name}.ics`, r.text, 'text/calendar;charset=utf-8');
    toast(t().calendarDone(r.count));
  }
  function noticeUrl(id) {
    return location.href.split('#')[0].split('?')[0] + '#/n/' + encodeURIComponent(id);
  }

  function gcalUrl(n) {
    if (!n.deadline) return '';
    const d = L.parseLocal(n.deadline);
    if (!d || isNaN(d.getTime())) return '';
    const pad = (v) => String(v).padStart(2, '0');
    const startStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const endD = new Date(d.getTime() + 60 * 60 * 1000);
    const endStr = `${endD.getFullYear()}${pad(endD.getMonth() + 1)}${pad(endD.getDate())}T${pad(endD.getHours())}${pad(endD.getMinutes())}00`;
    const title = `[마감] ${titleOf(n)}`;
    const sm = S.pick(n, state.lang);
    const details = [
      sm.text ? `요약: ${sm.text}` : '',
      n.benefit ? `혜택: ${tr(n.benefit.text)}` : '',
      n.eligibility ? `대상: ${tr(n.eligibility)}` : '',
      `원문: ${noticeUrl(n.id)}`
    ].filter(Boolean).join('\n');

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startStr}/${endStr}&details=${encodeURIComponent(details)}`;
  }

  // ---------- 고품질 자연스러운 TTS (Neural Voice & 발음 정제) ----------
  let _cachedVoices = [];
  function getTtsVoices() {
    if (!('speechSynthesis' in window)) return [];
    if (_cachedVoices.length) return _cachedVoices;
    _cachedVoices = window.speechSynthesis.getVoices() || [];
    return _cachedVoices;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      _cachedVoices = window.speechSynthesis.getVoices() || [];
    };
  }

  function pickBestVoice(langCode) {
    const voices = getTtsVoices();
    if (!voices.length) return null;

    const prefix = langCode.slice(0, 2).toLowerCase(); // 'ko', 'en', 'zh', 'ja'
    const targetLang = langCode.toLowerCase().replace('_', '-');

    const matchVoices = voices.filter(v => {
      const vl = (v.lang || '').toLowerCase().replace('_', '-');
      return vl.startsWith(prefix) || vl === targetLang;
    });
    if (!matchVoices.length) return null;

    // 언어별 가장 자연스럽고 맑은 고품질 성우/아나운서 음성 우선순위
    const PREFERRED_NAMES = {
      ko: [
        'sunhi online (natural)', // MS Edge Natural 여성 아나운서 (최고음질)
        'sunhi',
        'google 한국의',         // Chrome 신경망 클라우드 고품질
        'google 한국어',
        'yuna',                   // 삼성 One UI 갤럭시 / iOS 자연스러운 여성
        'sora',
        'injoon online (natural)',// MS Edge Natural 남성 아나운서
        'natural',                // 기타 모든 Natural 뉴럴 음성
        'online',
        'korean'
      ],
      en: [
        'jenny online (natural)',
        'aria online (natural)',
        'google us english',
        'samantha',
        'natural',
        'online'
      ],
      zh: [
        'xiaoxiao online (natural)',
        'google 普通话',
        'tingting',
        'natural'
      ],
      ja: [
        'nanami online (natural)',
        'google 日本語',
        'kyoko',
        'natural'
      ]
    };

    const prefs = PREFERRED_NAMES[prefix] || ['natural', 'online'];

    // 1. 선호 뉴럴 보이스 키워드 순서대로 매칭
    for (const pref of prefs) {
      const found = matchVoices.find(v => (v.name || '').toLowerCase().includes(pref));
      if (found) return found;
    }

    // 2. localService === false 인 고품질 원격 음성
    const remoteVoice = matchVoices.find(v => v.localService === false);
    if (remoteVoice) return remoteVoice;

    // 3. 브라우저 기본 음성
    const defVoice = matchVoices.find(v => v.default);
    if (defVoice) return defVoice;

    return matchVoices[0];
  }

  // 발음 자연스럽게 정제하기 (기호, D-Day, 약어, 마감일 등)
  function cleanTextForSpeech(text, lang) {
    if (!text) return '';
    let s = String(text);

    if (lang === 'ko') {
      // 대괄호/소괄호: 기계가 "대괄호 열고..." 하지 않도록 자연스러운 쉼표 호흡 처리
      s = s.replace(/\[([^\]]+)\]/g, '$1, ');
      s = s.replace(/\(([^)]+)\)/g, ', $1, ');
      // D-Day 발음 개선: "디 빼기 이" 방지 -> "오늘 마감", "마감 2일 전"
      s = s.replace(/\bD-(?:Day|0)\b/gi, '오늘 마감');
      s = s.replace(/\bD-(\d+)\b/gi, '마감 $1일 전');
      // 포인트: "10P" -> "10 포인트"
      s = s.replace(/(\d+)\s*P\b/gi, '$1 포인트');
      // 금액: "250만원" -> "250만 원"
      s = s.replace(/(\d+)만원/g, '$1만 원');
      // 날짜: 2026.11.24. -> 2026년 11월 24일
      s = s.replace(/(\d{4})\.(\d{1,2})\.(\d{1,2})\.?/g, '$1년 $2월 $3일');
      // 시간: 17:00 -> 17시
      s = s.replace(/(\d{1,2}):00\b/g, '$1시');
      s = s.replace(/(\d{1,2}):(\d{2})\b/g, '$1시 $2분');
      // 문장 호흡 및 불필요한 특수문자 정돈
      s = s.replace(/[~·~…\-―]/g, ', ');
      s = s.replace(/\s+/g, ' ');
    } else if (lang === 'en') {
      s = s.replace(/\[([^\]]+)\]/g, '$1, ');
      s = s.replace(/\bD-0\b/gi, 'due today');
      s = s.replace(/\bD-(\d+)\b/gi, 'due in $1 days');
      s = s.replace(/(\d+)\s*P\b/gi, '$1 points');
    }

    return s.trim();
  }

  function speakNoticeSummary(n) {
    const T = t();
    if (!('speechSynthesis' in window)) {
      toast(T.speakUnavailable || '현재 브라우저에서 음성 안내(TTS)를 지원하지 않습니다.');
      return;
    }
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      toast(T.speakStoppedToast || '음성 안내를 중단했습니다.');
      const btn = document.querySelector('.btn-tts-speak');
      if (btn) btn.textContent = T.speakSummary || '🔊 요약 듣기';
      return;
    }

    const sm = S.pick(n, state.lang);
    const left = L.daysLeft(n.deadline, now);
    const ddayText = left === 0 ? (T.dueToday || '오늘 마감') : left !== null && left > 0 ? `${left}일 남음` : '';
    const langCode = state.lang === 'en' ? 'en-US' : state.lang === 'zh' ? 'zh-CN' : state.lang === 'ja' ? 'ja-JP' : 'ko-KR';

    const rawParts = [
      titleOf(n),
      n.deadline ? `${T.deadline}: ${I.formatDate(L.parseLocal(n.deadline), state.lang)} ${ddayText}` : '',
      sm.text ? `${T.viewSummary || '요약'}: ${sm.text}` : '',
      n.benefit && n.benefit.text ? `${T.benefit}: ${tr(n.benefit.text)}` : '',
      n.eligibility ? `${T.eligibility}: ${tr(n.eligibility)}` : ''
    ].filter(Boolean);

    // 발음 개선 정제 적용
    const speechText = rawParts.map(p => cleanTextForSpeech(p, state.lang)).join('. ');

    const ut = new SpeechSynthesisUtterance(speechText);
    ut.lang = langCode;

    // 자연스럽고 예쁜 고음질 음성 선택
    const bestVoice = pickBestVoice(langCode);
    if (bestVoice) {
      ut.voice = bestVoice;
    }

    // 아나운서처럼 편안하고 청아한 톤 세팅
    ut.rate = 0.98;
    ut.pitch = 1.05;
    ut.volume = 1.0;

    const btn = document.querySelector('.btn-tts-speak');
    if (btn) btn.textContent = T.speakStop || '⏹️ 멈추기';

    ut.onend = () => { if (btn) btn.textContent = T.speakSummary || '🔊 요약 듣기'; };
    ut.onerror = () => { if (btn) btn.textContent = T.speakSummary || '🔊 요약 듣기'; };

    window.speechSynthesis.speak(ut);

    const voiceName = bestVoice ? ` (${bestVoice.name.replace(/(Online|Natural|\(Natural\))/gi, '').trim()})` : '';
    toast(state.lang === 'en' ? `Reading notice summary${voiceName}...` : state.lang === 'zh' ? `正在语音播报公告摘要${voiceName}...` : state.lang === 'ja' ? `お知らせの要約を読み上げています${voiceName}...` : `공지 핵심 요약을 자연스러운 목소리로 읽어드립니다${voiceName}.`);
  }

  function copyNoticeCard(n) {
    const T = t();
    const sm = S.pick(n, state.lang);
    const left = L.daysLeft(n.deadline, now);
    const dday = left === 0 ? (T.dueToday || '오늘 마감') : left !== null && left > 0 ? `D-${left}` : '';
    const dlStr = n.deadline ? `${I.formatDateTime(L.parseLocal(n.deadline), state.lang)}${dday ? ` (${dday})` : ''}` : '';
    const benStr = n.benefit ? tr(n.benefit.text) : '';
    const eligStr = n.eligibility ? tr(n.eligibility) : '';
    const url = noticeUrl(n.id);

    const text = [
      `📌 [건국대 GLOCAL] ${titleOf(n)}`,
      dlStr ? `⏰ ${T.deadline}: ${dlStr}` : '',
      benStr ? `💰 ${T.benefit}: ${benStr}` : '',
      eligStr ? `🎯 ${T.eligibility}: ${eligStr}` : '',
      sm.text ? `📝 ${T.viewSummary || '요약'}: ${sm.text}` : '',
      url ? `🔗 ${url}` : ''
    ].filter(Boolean).join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        toast(T.copySummaryDone || '공지 핵심 요약을 복사했어요! (카톡·에타 공유용)');
      }).catch(() => {
        window.prompt(T.copySummary || '공지 요약 복사', text);
      });
    } else {
      window.prompt(T.copySummary || '공지 요약 복사', text);
    }
  }

  async function shareNotice(n) {
    const url = noticeUrl(n.id);
    try {
      if (navigator.share) { await navigator.share({ title: titleOf(n), url }); return; }
      await navigator.clipboard.writeText(url);
      toast(t().linkCopied);
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      window.prompt(t().copyLink, url);
    }
  }

  // ---------- 시간표 (에브리타임식 격자) ----------
  const TT_HOURS = { first: 7, last: 23 };          // 고를 수 있는 시각 범위
  const TT_DEFAULT = { from: 9, to: 18 };           // 수업이 없을 때 보여 줄 범위
  const DURATIONS = [60, 90, 120, 150, 180];            // 수업 길이 빠른 선택 (분). 요람: 1교시 = 30분
  const CLASS_COLORS = ['#ffd8d6', '#ffe6bf', '#fff1a8', '#d9f2c7', '#c9ecec', '#cfe0ff', '#e3d6ff', '#ffd6ec'];
  const pad2 = (n) => String(n).padStart(2, '0');
  const fromMinutes = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];          // 월요일부터

  function calcTotalCredits(classes) {
    if (!classes || !classes.length) return 0;
    const seen = new Set();
    let total = 0;
    for (const c of classes) {
      const k = (c.name || '').trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const cr = Number(c.credit || c.credits || 3);
      total += isNaN(cr) ? 3 : cr;
    }
    return total;
  }

  function saveTimetable() {
    const cur = state.timetables.find((t) => t.id === state.activeTimetableId);
    if (cur) {
      cur.classes = state.timetable;
      cur.updatedAt = Date.now();
    }
    store.set('timetables', state.timetables);
    store.set('timetable', state.timetable);
    renderTimetableSelector();
    renderTimetableStats();
  }

  function switchTimetable(id) {
    const target = state.timetables.find((t) => t.id === id);
    if (!target) return;
    state.activeTimetableId = id;
    store.set('activeTimetableId', id);
    state.timetable = (target.classes || []).filter(L.isValidClass);
    store.set('timetable', state.timetable);
    timetableChanged();
    renderTimetable();
    const T = t();
    toast(T.ttSwitched ? T.ttSwitched(target.name) : `'${target.name}' 시간표로 전환되었습니다.`);
  }

  function addTimetable(name, classes) {
    const T = t();
    const newName = (name || prompt(T.ttNewPrompt || '새 시간표 이름을 입력해주세요:', `시간표 ${state.timetables.length + 1}`) || '').trim();
    if (!newName) return;
    const newId = 'tt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const newEntry = {
      id: newId,
      name: newName,
      classes: Array.isArray(classes) ? classes.filter(L.isValidClass) : [],
      createdAt: Date.now()
    };
    state.timetables.push(newEntry);
    state.activeTimetableId = newId;
    state.timetable = newEntry.classes;
    saveTimetable();
    timetableChanged();
    renderTimetable();
    toast(T.ttNewCreated ? T.ttNewCreated(newName) : `새 시간표 '${newName}'이(가) 생성되었습니다.`);
  }

  function duplicateTimetable() {
    const cur = state.timetables.find((t) => t.id === state.activeTimetableId);
    const baseName = cur ? cur.name : '시간표';
    const T = t();
    const newName = (prompt(T.ttCopyPrompt || '복제할 시간표 이름을 입력해주세요:', `${baseName} (사본)`) || '').trim();
    if (!newName) return;
    const newId = 'tt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const clonedClasses = JSON.parse(JSON.stringify(state.timetable)).map((c) => ({
      ...c,
      id: 'cls_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)
    }));
    const newEntry = {
      id: newId,
      name: newName,
      classes: clonedClasses,
      createdAt: Date.now()
    };
    state.timetables.push(newEntry);
    state.activeTimetableId = newId;
    state.timetable = newEntry.classes;
    saveTimetable();
    timetableChanged();
    renderTimetable();
    toast(T.ttCopyDone ? T.ttCopyDone(newName) : `'${newName}'(으)로 복제되었습니다.`);
  }

  function manageTimetable() {
    const cur = state.timetables.find((t) => t.id === state.activeTimetableId);
    if (!cur) return;
    const isOnly = state.timetables.length <= 1;
    const choice = confirm(`[시간표 관리: ${cur.name}]\n\n• 확인(OK): 이름 변경\n• 취소(Cancel): ${isOnly ? '닫기' : '이 시간표 삭제'}`);
    if (choice) {
      const T = t();
      const newName = (prompt(T.ttRenamePrompt || '새 이름을 입력해주세요:', cur.name) || '').trim();
      if (newName && newName !== cur.name) {
        cur.name = newName;
        saveTimetable();
        toast(T.ttRenameDone ? T.ttRenameDone(newName) : `시간표 이름이 '${newName}'(으)로 변경되었습니다.`);
      }
    } else if (!isOnly) {
      const T = t();
      const delConfirm = confirm(T.ttDeleteConfirm ? T.ttDeleteConfirm(cur.name) : `정말 '${cur.name}' 시간표를 삭제하시겠습니까?\n이 작업은 취소할 수 없습니다.`);
      if (delConfirm) {
        const delName = cur.name;
        state.timetables = state.timetables.filter((t) => t.id !== cur.id);
        state.activeTimetableId = state.timetables[0].id;
        state.timetable = state.timetables[0].classes;
        saveTimetable();
        timetableChanged();
        renderTimetable();
        toast(T.ttDeleted ? T.ttDeleted(delName) : `'${delName}' 시간표가 삭제되었습니다.`);
      }
    }
  }

  function renderTimetableSelector() {
    const sel = $('#tt-selector');
    if (!sel) return;
    sel.innerHTML = '';
    state.timetables.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      const credits = calcTotalCredits(t.classes);
      const cnt = t.classes ? t.classes.length : 0;
      opt.textContent = `${t.name} (${cnt}과목 · ${credits}학점)`;
      if (t.id === state.activeTimetableId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function findClassClashes(classes) {
    const timed = (classes || []).filter((c) => !c.elearn && c.start && c.end && Number.isInteger(c.day));
    const clashes = [];
    const clashIds = new Set();
    for (let i = 0; i < timed.length; i++) {
      for (let j = i + 1; j < timed.length; j++) {
        const c1 = timed[i];
        const c2 = timed[j];
        if (c1.day === c2.day) {
          const s1 = L.toMinutes(c1.start);
          const e1 = L.toMinutes(c1.end);
          const s2 = L.toMinutes(c2.start);
          const e2 = L.toMinutes(c2.end);
          if (s1 < e2 && s2 < e1) {
            clashes.push({
              c1,
              c2,
              day: c1.day,
              overlapStart: Math.max(s1, s2),
              overlapEnd: Math.min(e1, e2)
            });
            clashIds.add(c1.id);
            clashIds.add(c2.id);
          }
        }
      }
    }
    return { clashes, clashIds };
  }

  function findAlternativeSections(courseName, currentClass) {
    if (!window.GONGJI_TIMETABLE || !Array.isArray(window.GONGJI_TIMETABLE.courses)) return [];
    const nameNorm = (courseName || '').trim().toLowerCase();
    if (!nameNorm) return [];
    const allMatches = window.GONGJI_TIMETABLE.courses.filter((c) => (c.n || '').trim().toLowerCase() === nameNorm);
    if (!allMatches.length) return [];

    const others = (state.timetable || []).filter((x) => x.id !== (currentClass && currentClass.id) && (x.name || '').trim().toLowerCase() !== nameNorm);
    const results = [];

    allMatches.forEach((course) => {
      const isCurrentTime = currentClass && (course.t || []).some(([d, s, e]) => d === currentClass.day && s === currentClass.start);
      if (isCurrentTime) return;

      let hasConflict = false;
      if (Array.isArray(course.t)) {
        for (const [d, s, e] of course.t) {
          const sMin = L.toMinutes(s);
          const eMin = L.toMinutes(e);
          for (const o of others) {
            if (o.day === d) {
              const osMin = L.toMinutes(o.start);
              const oeMin = L.toMinutes(o.end);
              if (sMin < oeMin && osMin < eMin) {
                hasConflict = true;
                break;
              }
            }
          }
          if (hasConflict) break;
        }
      }

      results.push({
        section: course.s,
        course,
        hasConflict,
        slots: course.t || [],
        prof: course.p || '',
        room: (course.t && course.t[0] && course.t[0][3]) || ''
      });
    });

    return results;
  }

  function renderAltSections(cls) {
    const sec = $('#class-alt-sec');
    if (!sec) return;
    if (!cls || !cls.name) {
      sec.hidden = true;
      sec.innerHTML = '';
      return;
    }
    const T = t();
    const alts = findAlternativeSections(cls.name, cls);
    if (!alts.length) {
      sec.hidden = true;
      sec.innerHTML = '';
      return;
    }

    sec.hidden = false;
    const chips = alts.map((alt) => {
      const slotTexts = (alt.slots || []).map(([d, s, e]) => `${dayName(d)} ${s}~${e}`).join(', ');
      const desc = `[${alt.section}${T.planSection ? '' : '분반'}] ${slotTexts || (T.planModeElearn ? T.planModeElearn : '시간 미지정')}${alt.prof ? ` (${alt.prof})` : ''}`;
      return h('button', {
        type: 'button',
        class: `alt-sec-chip ${alt.hasConflict ? 'is-clashing' : 'is-clean'}`,
        title: alt.hasConflict ? (T.ttClashBadge || '다른 수업과 시간이 겹칩니다') : (T.ttAltRecommend || '충돌 없이 등록 가능'),
        onclick: (e) => {
          e.preventDefault();
          if (alt.hasConflict) {
            if (!confirm(T.ttAltConfirmClash || '이 분반은 현재 시간표의 다른 과목과 시간이 겹칩니다. 그래도 변경하시겠습니까?')) return;
          }
          const name = cls.name;
          const origKey = classKey(cls);
          const others = state.timetable.filter((c) => (origKey ? classKey(c) !== origKey : c.id !== cls.id));
          const newClasses = [];
          if (alt.slots && alt.slots.length) {
            alt.slots.forEach(([d, s, e, rm]) => {
              newClasses.push({
                id: 'cls_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
                name,
                day: d,
                start: s,
                end: e,
                room: rm || alt.room || '',
                prof: alt.prof || cls.prof || '',
                elearn: false
              });
            });
          } else {
            newClasses.push({
              id: 'cls_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
              name,
              prof: alt.prof || cls.prof || '',
              elearn: true
            });
          }
          state.timetable = others.concat(newClasses);
          saveTimetable();
          timetableChanged();
          renderTimetable();
          $('#class-dialog').close();
          toast(T.ttAltSuccess ? T.ttAltSuccess(name, alt.section) : `'${name}' 과목을 [${alt.section}분반]으로 변경했습니다.`);
        }
      },
        h('span', { class: 'asc-badge' }, alt.hasConflict ? (T.ttClashBadge || '⚠️ 겹침') : (T.ttAltRecommend || '✨ 추천')),
        h('span', { class: 'asc-text' }, desc)
      );
    });

    fill(sec,
      h('div', { class: 'alt-sec-head' },
        h('span', { class: 'alt-sec-title' }, T.ttAltTitle || '💡 다른 분반으로 즉시 변경'),
        h('span', { class: 'alt-sec-sub' }, T.ttAltSub || '클릭하면 해당 분반 시간대로 자동 교체됩니다.')
      ),
      h('div', { class: 'alt-sec-list' }, ...chips)
    );
  }

  function renderTimetableStats() {
    const bar = $('#tt-stats-bar');
    if (!bar) return;
    const T = t();
    const tt = state.timetable || [];
    const timed = tt.filter((c) => !c.elearn && c.start && c.end && Number.isInteger(c.day));
    const elearn = tt.filter((c) => c.elearn || c.m === 'elearn' || !c.start);
    const credits = calcTotalCredits(tt);
    const { clashes } = findClassClashes(tt);

    const activeDays = new Set(timed.map((c) => c.day));
    const weekdays = [1, 2, 3, 4, 5];
    const freeWeekdays = weekdays.filter((d) => !activeDays.has(d));
    let freeBadge = '';
    if (activeDays.size === 0) {
      freeBadge = T.ttStatNoCampus || '대면 수업 없음';
    } else if (freeWeekdays.length === 0) {
      freeBadge = T.ttStatAllDays || '주 5일 올출';
    } else {
      const freeStr = freeWeekdays.map((d) => dayName(d)).join('·');
      freeBadge = T.ttStatFreeDays ? T.ttStatFreeDays(freeStr) : `${freeStr} 공강`;
    }

    let lunchOk = true;
    if (activeDays.size > 0) {
      for (const d of activeDays) {
        const dayClasses = timed.filter((c) => c.day === d);
        let hasFree45 = false;
        let freeSlots = 0;
        for (let m = 690; m < 810; m += 15) {
          const busy = dayClasses.some((c) => {
            const cs = L.toMinutes(c.start);
            const ce = L.toMinutes(c.end);
            return m >= cs && m < ce;
          });
          if (!busy) freeSlots += 15;
          else freeSlots = 0;
          if (freeSlots >= 45) { hasFree45 = true; break; }
        }
        if (!hasFree45) { lunchOk = false; break; }
      }
    }

    fill(bar,
      h('div', { class: 'tt-stat-item' },
        h('span', { class: 'tt-stat-lbl' }, T.ttStatCredits || '신청 학점'),
        h('strong', { class: 'tt-stat-val' }, `${credits}${T.creditUnit || '학점'}`)
      ),
      h('div', { class: 'tt-stat-item' },
        h('span', { class: 'tt-stat-lbl' }, T.ttStatComp || '수업 구성'),
        h('span', { class: 'tt-stat-detail' },
          `${T.unitCount ? `${tt.length}${T.unitCount}` : tt.length} `,
          elearn.length > 0 ? h('span', { class: 'tt-stat-sub' }, `(${timed.length} / ${elearn.length})`) : ''
        )
      ),
      h('div', { class: 'tt-stat-item' },
        h('span', { class: 'tt-stat-lbl' }, T.ttStatDays || '등교 일정'),
        h('span', { class: 'tt-stat-badges' },
          h('span', { class: 'tt-stat-badge day-badge' }, activeDays.size ? (T.ttStatDaysCount ? T.ttStatDaysCount(activeDays.size) : `주 ${activeDays.size}일`) : (T.ttStatNoCampus || '비등교')),
          h('span', { class: `tt-stat-badge ${freeWeekdays.length ? 'free-badge' : 'full-badge'}` }, freeBadge)
        )
      ),
      activeDays.size > 0 ? h('div', { class: 'tt-stat-item' },
        h('span', { class: 'tt-stat-lbl' }, T.ttStatLunch || '점심시간'),
        h('span', { class: `tt-stat-badge ${lunchOk ? 'lunch-ok' : 'lunch-warn'}` },
          lunchOk ? (T.ttStatLunchOk || '점심 여유 🍱') : (T.ttStatLunchWarn || '점심 부족 ⚠️')
        )
      ) : '',
      clashes.length > 0 ? h('div', { class: 'tt-stat-item tt-clash-warning' },
        h('span', { class: 'tt-stat-lbl' }, T.ttClashBadge || '수업 겹침'),
        h('span', {
          class: 'tt-stat-badge clash-warn-badge',
          style: 'cursor:pointer;',
          title: '클릭하여 겹치는 수업 확인',
          onclick: () => {
            const msg = clashes.map(cl => `• [${dayName(cl.day)}] ${cl.c1.name} ↔ ${cl.c2.name} (${fromMinutes(cl.overlapStart)}~${fromMinutes(cl.overlapEnd)})`).join('\n');
            alert(`⚠️ 시간표 수업 겹침 (${clashes.length}건 발생)\n\n${msg}\n\n해당 수업을 누르면 다른 분반으로 즉시 변경할 수 있습니다.`);
          }
        }, T.ttClashWarning ? T.ttClashWarning(clashes.length) : `⚠️ ${clashes.length}건 겹침!`)
      ) : ''
    );
  }

  // 과목명이 같으면 같은 색 (요일이 달라도 한눈에 같은 과목으로 보이게)
  function classColor(name) {
    let hsh = 0;
    for (const ch of name || '') hsh = (hsh * 31 + ch.codePointAt(0)) >>> 0;
    return CLASS_COLORS[hsh % CLASS_COLORS.length];
  }

  // ---------- 내 학과 교육과정: 학과를 고르면 요람의 과목이 학년별로 나오고, 과목을 누르면 수업 추가 창에 이름이 들어간다 ----------
  function renderCurriculum() {
    const body = $('#curr-body');
    if (!body || !CU) return;
    const T = t();
    const hasData = !!(window.GONGJI_COURSES && window.GONGJI_COURSES.colleges);
    $('#curr').hidden = !hasData;
    if (!hasData) return;
    // 과목명 자동완성 후보 (내 학과 과목 먼저, 그다음 교양)
    courseList = CU.suggestions(state.dept);
    const sel = h('select', { id: 'dept-select', 'aria-label': T.deptLabel, onchange: (e) => {
      state.dept = e.target.value; store.set('dept', state.dept); renderCurriculum();
    } }, h('option', { value: '' }, T.deptPick),
    ...CU.colleges().map((c) => h('optgroup', { label: c.name }, c.depts.map((d) => h('option', { value: d }, d)))));
    sel.value = state.dept;
    const parts = [h('p', { class: 'help' }, T.currHelp), h('label', { class: 'curr-dept' }, h('span', null, T.deptLabel), sel)];
    if (!state.dept || !CU.findDept(state.dept)) {
      parts.push(h('p', { class: 'help' }, T.currEmpty));
    } else {
      const g = CU.byGrade(state.dept);
      const tabs = [1, 2, 3, 4].filter((n) => g[n].length).map((n) => ({ key: String(n), label: T.gradeN(n), n: g[n].length }));
      if (g[0].length) tabs.push({ key: '0', label: T.gradeAny, n: g[0].length });
      tabs.push({ key: 'gen', label: T.gradeGeneral, n: CU.general().reduce((a, x) => a + x.courses.length, 0) });
      if (!tabs.some((x) => x.key === state.currTab)) state.currTab = tabs[0].key;
      parts.push(h('div', { class: 'curr-tabs', role: 'group' }, tabs.map((x) => h('button', {
        type: 'button', class: 'chip small', 'aria-pressed': String(x.key === state.currTab),
        onclick: () => { state.currTab = x.key; store.set('currTab', x.key); renderCurriculum(); }
      }, x.label, h('span', { class: 'chip-count' }, ` ${x.n}`)))));
      const chip = (c) => {
        const prof = findProfForCourse(c.name);
        return h('button', {
          type: 'button', class: 'course-chip' + (c.kind === '전필' ? ' req' : '') + (prof ? ' has-prof' : ''),
          title: [c.kind, c.term, c.credit ? T.creditN(c.credit) : '', prof ? `${prof} 교수` : ''].filter(Boolean).join(' · '),
          onclick: () => openClassDialog({ name: c.name })
        },
          c.name,
          c.kind === '전필' ? h('span', { class: 'req-mark' }, T.reqMark) : null,
          prof ? h('span', { class: 'chip-prof', style: 'margin-left: 5px; font-size: 11px; opacity: 0.85; font-weight: 600;' }, `[${prof}]`) : null
        );
      };
      if (state.currTab === 'gen') {
        parts.push(CU.general().map((grp) => h('div', { class: 'curr-group' },
          h('h4', null, `${grp.kind === '소양' ? 'KU소양' : grp.kind + '교양'} · ${grp.area}`),
          h('div', { class: 'course-chips' }, grp.courses.map(chip)))));
      } else {
        const list = g[Number(state.currTab)] || [];
        const terms = [...new Set(list.map((c) => c.term))];
        parts.push(terms.map((term) => h('div', { class: 'curr-group' },
          h('h4', null, term.replace(/^전체/, T.gradeAny)),
          h('div', { class: 'course-chips' }, list.filter((c) => c.term === term).map(chip)))));
      }
    }
    parts.push(h('p', { class: 'help small' }, T.currNote));
    fill(body, ...parts);
  }

  // ---------- 하이브리드 시간표 드래그 & 롱프레스 시간 이동 핸들러 (PC & 모바일 대응) ----------
  window.GONGJI_SNAP_STEP = 30;
  try {
    const savedStep = parseInt(localStorage.getItem('gongji:snapStep'), 10);
    if (savedStep === 10 || savedStep === 30) window.GONGJI_SNAP_STEP = savedStep;
  } catch {}

  function updateSnapUI() {
    const s30 = $('#btn-snap-30');
    const s10 = $('#btn-snap-10');
    const is30 = (window.GONGJI_SNAP_STEP || 30) === 30;
    if (s30) {
      s30.classList.toggle('is-active', is30);
      s30.setAttribute('aria-checked', String(is30));
    }
    if (s10) {
      s10.classList.toggle('is-active', !is30);
      s10.setAttribute('aria-checked', String(!is30));
    }
  }

  function attachClassDragHandler(btn, c, d, s, e, from, to, base, span, pct) {
    let timer = null;
    let isDragging = false;
    let hasMoved = false;
    let justDragged = false;
    let startX = 0;
    let startY = 0;
    let ghostEl = null;
    let tipEl = null;
    let targetCol = null;
    let targetDay = d;
    let targetStart = s;
    let dur = e - s;

    function cleanupGhostAndTip() {
      btn.classList.remove('is-dragging-card');
      document.body.classList.remove('is-tt-dragging-active');
      if (ghostEl) { ghostEl.remove(); ghostEl = null; }
      if (tipEl) { tipEl.remove(); tipEl = null; }
    }

    function startDrag(clientX, clientY) {
      isDragging = true;
      dur = e - s;
      targetDay = d;
      targetStart = s;
      targetCol = btn.parentElement;

      if (navigator.vibrate) {
        try { navigator.vibrate(25); } catch {}
      }

      btn.classList.add('is-dragging-card');
      document.body.classList.add('is-tt-dragging-active');

      // 드래그 목적지 고스트 생성
      ghostEl = document.createElement('div');
      ghostEl.className = 'tt-drag-ghost';
      ghostEl.style.cssText = `top:${pct(s)};height:${pct(dur + base)};--c:${classColor(c.name)}`;
      ghostEl.innerHTML = `<span class="tt-dg-label">${c.name}</span><span class="tt-dg-time">${c.start}~${c.end}</span>`;
      btn.parentElement.appendChild(ghostEl);

      // 마우스/터치를 따라다니는 플로팅 안내 뱃지
      tipEl = document.createElement('div');
      tipEl.className = 'tt-drag-floating-tip';
      updateTipContent(clientX, clientY, targetDay, targetStart, targetStart + dur);
      document.body.appendChild(tipEl);
    }

    function updateTipContent(cx, cy, day, st, en) {
      if (!tipEl) return;
      const snapStep = window.GONGJI_SNAP_STEP || 30;
      tipEl.style.left = `${Math.min(window.innerWidth - 190, Math.max(10, cx + 16))}px`;
      tipEl.style.top = `${Math.max(10, cy - 44)}px`;
      const stStr = fromMinutes(st);
      const enStr = fromMinutes(en);
      tipEl.innerHTML = `<span class="tt-tip-day">${dayName(day)}</span> <strong>${stStr}~${enStr}</strong> <span class="tt-tip-step">(${snapStep}분 스냅)</span>`;
    }

    function onPointerMove(mev) {
      const dx = mev.clientX - startX;
      const dy = mev.clientY - startY;
      const dist = Math.hypot(dx, dy);

      if (!isDragging) {
        if (dist > 7) {
          if (mev.pointerType === 'touch') {
            // 모바일 터치 스크롤 동작 감지: 롱프레스 취소하고 자연스럽게 스크롤 허용
            if (timer) { clearTimeout(timer); timer = null; }
            cleanupListeners();
            return;
          } else {
            // PC 마우스 드래그 동작: 7px 이상 움직이면 즉시 드래그 모드 진입
            if (timer) { clearTimeout(timer); timer = null; }
            startDrag(mev.clientX, mev.clientY);
          }
        } else {
          return;
        }
      }

      // 드래그 중 브라우저 기본 스크롤 차단
      if (mev.cancelable) mev.preventDefault();
      hasMoved = true;

      // 커서 위치 기준 요일 컬럼 탐색
      const elUnder = document.elementFromPoint(mev.clientX, mev.clientY);
      const colUnder = elUnder?.closest('.tt-col');
      if (colUnder && colUnder !== targetCol) {
        targetCol = colUnder;
        targetDay = parseInt(targetCol.getAttribute('data-day'), 10) || d;
        if (ghostEl && ghostEl.parentElement !== targetCol) {
          targetCol.appendChild(ghostEl);
        }
      }

      // 목표 요일 컬럼 내 Y좌표로부터 시간 계산
      const curCol = targetCol || btn.parentElement;
      const rect = curCol.getBoundingClientRect();
      const relY = Math.max(0, Math.min(rect.height, mev.clientY - rect.top));
      const rawMin = base + (relY / rect.height) * span;

      // 사용자가 선택한 단위(기본 30분, 미세조정 10분)로 정밀 스냅
      const snapStep = window.GONGJI_SNAP_STEP || 30;
      let snappedS = Math.round(rawMin / snapStep) * snapStep;
      snappedS = Math.max(from * 60, Math.min(to * 60 - dur, snappedS));
      targetStart = snappedS;
      const targetEnd = targetStart + dur;

      // 고스트 요소 위치 및 시간 라벨 업데이트
      if (ghostEl) {
        ghostEl.style.top = pct(targetStart);
        ghostEl.style.height = pct(dur + base);
        const timeSpan = ghostEl.querySelector('.tt-dg-time');
        if (timeSpan) timeSpan.textContent = `${fromMinutes(targetStart)}~${fromMinutes(targetEnd)}`;
      }

      updateTipContent(mev.clientX, mev.clientY, targetDay, targetStart, targetEnd);
    }

    function onPointerUp(uev) {
      if (timer) { clearTimeout(timer); timer = null; }
      cleanupListeners();

      if (isDragging && hasMoved) {
        const finalDay = targetDay;
        const finalStart = targetStart;
        const finalEnd = finalStart + dur;
        cleanupGhostAndTip();

        // 실제 시간이나 요일이 바뀐 경우에만 저장 및 토스트 알림
        if (finalDay !== d || finalStart !== s) {
          const prevSchedule = state.timetable.map((x) => ({ ...x }));
          const newStartStr = fromMinutes(finalStart);
          const newEndStr = fromMinutes(finalEnd);

          c.day = finalDay;
          c.start = newStartStr;
          c.end = newEndStr;
          saveTimetable();
          timetableChanged();

          if (navigator.vibrate) {
            try { navigator.vibrate([30, 45]); } catch {}
          }

          toast(`'${c.name}' 수업이 ${dayName(finalDay)} ${newStartStr}~${newEndStr}로 이동되었습니다.`, {
            label: '실행 취소',
            run: () => {
              state.timetable = prevSchedule;
              saveTimetable();
              timetableChanged();
            }
          });
        }
        isDragging = false;
        hasMoved = false;
        justDragged = true;
        setTimeout(() => { justDragged = false; }, 300);
      } else {
        // 드래그가 아니거나 이동량이 없는 단순 탭/클릭
        cleanupGhostAndTip();
        isDragging = false;
        hasMoved = false;
      }
    }

    function cleanupListeners() {
      window.removeEventListener('pointermove', onPointerMove, { passive: false });
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    }

    btn.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      startX = ev.clientX;
      startY = ev.clientY;
      hasMoved = false;
      isDragging = false;

      // 모바일 터치 환경: 270ms 롱프레스 유지 시 드래그 활성화
      if (ev.pointerType === 'touch') {
        timer = setTimeout(() => {
          startDrag(startX, startY);
        }, 270);
      }

      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp, { once: true });
      window.addEventListener('pointercancel', onPointerUp, { once: true });
    });

    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      if (justDragged) {
        justDragged = false;
        return;
      }
      openClassDialog({ cls: c });
    });
  }

  function renderTimetable() {
    renderTimetableSelector();
    renderTimetableStats();
    updateSnapUI();
    renderCalendar();
    const badge = $('#badge-timetable');
    badge.hidden = state.timetable.length === 0;
    badge.textContent = String(state.timetable.length);

    const tt = state.timetable;
    const timed = tt.filter((c) => !c.elearn && c.start && c.end && Number.isInteger(c.day));
    const elearn = tt.filter((c) => c.elearn || c.m === 'elearn' || !c.start);
    const { clashIds } = findClassClashes(tt);

    // 월~금은 항상, 토·일은 수업이 있을 때만 칸을 만든다
    const days = DAY_ORDER.filter((d) => (d >= 1 && d <= 5) || timed.some((c) => c.day === d));
    let from = TT_DEFAULT.from;
    let to = TT_DEFAULT.to;
    for (const c of timed) {
      from = Math.min(from, Math.floor(L.toMinutes(c.start) / 60));
      to = Math.max(to, Math.ceil(L.toMinutes(c.end) / 60));
    }
    const base = from * 60;
    const span = (to - from) * 60;
    const pct = (m) => `${((m - base) / span) * 100}%`;

    const today = now.getDay();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const head = h('div', { class: 'tt-head' }, h('span'), ...days.map((d) => h('span', { class: d === today ? 'is-today' : null, 'aria-current': d === today ? 'date' : null }, dayName(d))));
    const hours = h('div', { class: 'tt-hours', 'aria-hidden': 'true' },
      ...Array.from({ length: to - from }, (_, i) => h('span', null, String(from + i))));
    const cols = days.map((d) => {
      const dayTimed = timed.filter((c) => c.day === d).sort((a, b) => L.toMinutes(a.start) - L.toMinutes(b.start));
      const routePills = [];
      const CR = (typeof window !== 'undefined' && window.GongjiCampusRoute) || root.GongjiCampusRoute;
      if (CR && CR.calculateRoute) {
        for (let i = 1; i < dayTimed.length; i++) {
          const prev = dayTimed[i - 1];
          const curr = dayTimed[i];
          const gap = L.toMinutes(curr.start) - L.toMinutes(prev.end);
          if (gap > 0 && gap <= 20) {
            const route = CR.calculateRoute(prev.room, curr.room, gap, state.lang);
            const prevEnd = L.toMinutes(prev.end);
            const isDanger = route.level === 'danger';
            const isWarn = route.level === 'warning';
            const badgeClass = isDanger ? 'is-danger' : isWarn ? 'is-warn' : 'is-safe';
            const icon = isDanger ? '🚨' : isWarn ? '⚠️' : '🚶';
            const pillTitle = state.lang === 'en'
              ? `${prev.room || 'Prev'} ➔ ${curr.room || 'Next'}: Walk ~${route.walkMin}m (${route.statusText}) - Click for 10-Min Hill Route Reader`
              : state.lang === 'zh'
              ? `${prev.room || '前节'} ➔ ${curr.room || '下节'}: 步行约${route.walkMin}分 (${route.statusText}) - 点击打开10分钟换教室路线判读`
              : state.lang === 'ja'
              ? `${prev.room || '前'} ➔ ${curr.room || '次'}: 徒歩約${route.walkMin}分 (${route.statusText}) - クリックして10分移動ルート確認`
              : `${prev.room || '이전'} ➔ ${curr.room || '다음'}: 도보 ${route.walkMin}분 (${route.statusText}) - 클릭하여 10분 컷 판독기 열기`;
            const walkText = state.lang === 'en'
              ? `${route.walkMin}m${route.hasHillAlert ? ' Steep Hill' : ''}`
              : state.lang === 'zh'
              ? `${route.walkMin}分${route.hasHillAlert ? ' 陡坡' : ''}`
              : state.lang === 'ja'
              ? `${route.walkMin}分${route.hasHillAlert ? ' 急坂' : ''}`
              : `${route.walkMin}분${route.hasHillAlert ? ' 헐떡고개' : ''}`;
            routePills.push(h('button', {
              type: 'button',
              class: 'tt-route-pill ' + badgeClass,
              style: `top:${pct(prevEnd)};height:${pct(gap + base)};`,
              title: pillTitle,
              onclick: (ev) => {
                ev.stopPropagation();
                openRouteDialog(prev, curr, route);
              }
            },
              h('span', { class: 'ttrp-inner' },
                h('span', { class: 'ttrp-icon' }, icon),
                h('span', { class: 'ttrp-text' }, walkText)
              )
            ));
          }
        }
      }

      const blocks = dayTimed.map((c) => {
        const s = L.toMinutes(c.start);
        const e = L.toMinutes(c.end);
        const DI18n = (typeof window !== 'undefined' && window.GongjiDeptI18n) || root.GongjiDeptI18n;
        const CR = (typeof window !== 'undefined' && window.GongjiCampusRoute) || root.GongjiCampusRoute;
        const courseTitle = (DI18n && DI18n.formatCourse) ? DI18n.formatCourse(c.name, state.lang) : (c.name || t().classFallback);
        const roomFormatted = (CR && CR.formatRoom) ? CR.formatRoom(c.room, state.lang) : (c.room || '');
        const prof = c.prof || c.p || '';
        const profText = prof ? (state.lang === 'en' ? `Prof. ${prof}` : state.lang === 'ja' || state.lang === 'zh' ? `${prof} 教授` : (prof.endsWith('교수') ? prof : `${prof} 교수`)) : '';
        const isClash = clashIds.has(c.id);
        const dragTitle = state.lang === 'en' ? 'Press and hold or drag to move 30 mins'
          : state.lang === 'zh' ? '长按或拖拽可按30分钟移动'
          : state.lang === 'ja' ? '長押しまたはドラッグで30分移動'
          : '길게 누르거나 드래그하여 이동';
        const clashText = state.lang === 'en' ? '⚠️ Clash'
          : state.lang === 'zh' ? '⚠️ 冲突'
          : state.lang === 'ja' ? '⚠️ 重複'
          : '⚠️ 겹침';
        const clashAriaPrefix = isClash ? (state.lang === 'en' ? '[Clash] ' : state.lang === 'zh' ? '[时间冲突] ' : state.lang === 'ja' ? '[重複] ' : '[시간 겹침] ') : '';
        const btn = h('button', {
          type: 'button', class: 'tt-class' + (isClash ? ' has-clash' : ''),
          style: `top:${pct(s)};height:${pct(e - s + base)};--c:${classColor(c.name)}`,
          'aria-label': `${clashAriaPrefix}${dayName(d)} ${c.start}~${c.end} ${courseTitle}${profText ? ` (${profText})` : ''}`,
          'data-class-id': c.id,
          'data-day': String(d),
          'data-start': String(s),
          'data-end': String(e)
        },
          h('span', { class: 'tt-drag-handle', title: dragTitle, 'aria-hidden': 'true' }, '⋮⋮'),
          isClash ? h('span', { class: 'tt-clash-badge' }, clashText) : null,
          h('span', { class: 'tt-name' }, courseTitle),
          profText ? h('span', { class: 'tt-prof' }, profText) : null,
          h('span', { class: 'tt-time' }, `${c.start}~\u200b${c.end}`),
          roomFormatted ? h('span', { class: 'tt-room' }, roomFormatted) : null);

        attachClassDragHandler(btn, c, d, s, e, from, to, base, span, pct);
        return btn;
      });
      const nowLine = d === today && nowMin >= base && nowMin <= base + span
        ? h('div', { class: 'tt-now', style: `top:${pct(nowMin)}`, 'aria-hidden': 'true' }, h('span', null, t().nowLine)) : null;
      return h('div', {
        class: 'tt-col' + (d === today ? ' is-today' : ''), 'data-day': String(d),
        // 빈 칸을 누르면 그 요일·그 시각(정각)으로 새 수업 넣기
        onclick: (ev) => {
          if (ev.target.closest('.tt-class, .tt-route-pill, .tt-now')) return;
          const r = ev.currentTarget.getBoundingClientRect();
          const m = base + Math.floor(((ev.clientY - r.top) / r.height) * (to - from)) * 60;
          openClassDialog({ day: d, start: Math.max(TT_HOURS.first * 60, Math.min(m, TT_HOURS.last * 60 - 60)) });
        }
      }, ...blocks, ...routePills, nowLine);
    });
    const body = h('div', { class: 'tt-body' }, hours, ...cols);
    const box = $('#tt');
    box.style.setProperty('--cols', String(days.length));
    box.style.setProperty('--rows', String(to - from));
    fill(box, head, body);

    renderElearnSection(elearn);
  }

  function renderElearnSection(elearn) {
    const sec = $('#tt-elearn-sec');
    if (!sec) return;
    if (!elearn.length) {
      fill(sec, h('div', { class: 'tt-elearn-empty-bar' },
        h('span', { class: 'tt-elearn-empty-txt' }, '시간이 정해지지 않은 온라인·이러닝 수업이 있나요?'),
        h('button', {
          type: 'button',
          class: 'btn-add-elearn',
          onclick: () => openClassDialog({ elearn: true })
        }, '+ 이러닝 추가')
      ));
      return;
    }

    const T = t();
    const CR = (typeof window !== 'undefined' && window.GongjiCampusRoute) || root.GongjiCampusRoute;
    const elearnBadgeText = state.lang === 'en' ? 'Online' : state.lang === 'zh' ? '网课' : state.lang === 'ja' ? 'eラーニング' : '이러닝';

    const heading = h('div', { class: 'tt-elearn-head' },
      h('h3', { class: 'tt-elearn-title' },
        T.ttElearnTitle || '이러닝 · 시간 미지정 과목',
        h('span', { class: 'tt-elearn-count' }, `${elearn.length}`)
      ),
      h('button', {
        type: 'button',
        class: 'btn-add-elearn-icon',
        title: T.ttElearnAdd || '+ 추가',
        onclick: () => openClassDialog({ elearn: true })
      }, T.ttElearnAdd || '+ 추가')
    );

    const items = elearn.map((c) => {
      const color = classColor(c.name);
      const profText = (c.prof || c.p) ? (T.ttProfTitle ? T.ttProfTitle(c.prof || c.p) : `${c.prof || c.p} 교수`) : '';
      const roomText = c.room && c.room !== '이러닝'
        ? ((CR && CR.formatRoom) ? CR.formatRoom(c.room, state.lang) : c.room)
        : (T.ttElearnRemote || '원격 · 정해진 수업 시간 없음');
      return h('div', {
        class: 'tt-elearn-card',
        style: `--c:${color}`,
        tabindex: 0,
        role: 'button',
        'aria-label': `${c.name} ${elearnBadgeText}`,
        onclick: () => openClassDialog({ cls: c }),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openClassDialog({ cls: c }); } }
      },
        h('div', { class: 'tt-elearn-color-bar' }),
        h('div', { class: 'tt-elearn-info' },
          h('div', { class: 'tt-elearn-name-row' },
            h('strong', { class: 'tt-elearn-name' }, c.name || t().classFallback),
            profText ? h('span', { class: 'tt-elearn-prof' }, profText) : null,
            h('span', { class: 'tt-elearn-badge' }, elearnBadgeText)
          ),
          h('span', { class: c.room && c.room !== '이러닝' ? 'tt-elearn-room' : 'tt-elearn-sub' }, roomText)
        ),
        h('button', {
          type: 'button',
          class: 'tt-elearn-del',
          title: `${c.name} ×`,
          'aria-label': `${c.name} ×`,
          onclick: (e) => {
            e.stopPropagation();
            const before = state.timetable;
            state.timetable = before.filter((x) => x.id !== c.id);
            saveTimetable();
            timetableChanged();
          }
        }, '×')
      );
    });

    const grid = h('div', { class: 'tt-elearn-grid' }, ...items);
    fill(sec, heading, grid);
  }

  // 학사일정 (data/calendar.js, 크롬 확장으로 받은 학교 연간주요일정): 진행 중이거나 60일 안에 시작하는 것
  function renderCalendar() {
    const box = $('#calendar');
    const cal = window.GONGJI_CALENDAR;
    if (!box) return;
    const today = L.startOfDay(now);
    const until = L.addDays(today, 60);
    const items = ((cal && cal.items) || []).filter((x) => {
      const s = L.parseLocal(x.start);
      const e = L.parseLocal(x.end);
      return s && e && e >= today && s <= until;
    }).slice(0, 8);
    box.hidden = !items.length;
    if (!items.length) return;
    const fmt = (d) => I.formatDate(L.parseLocal(d), state.lang);
    fill(box, h('h3', null, t().calendarTitle), h('ul', { class: 'cal-list' }, items.map((x) =>
      h('li', null,
        h('span', { class: 'cal-when' }, x.start === x.end ? fmt(x.start) : `${fmt(x.start)} ~ ${fmt(x.end)}`),
        h('span', { class: 'cal-what' }, tr(x.title))))));
  }

  function timetableChanged() {
    renderTimetable();
    renderList();
    renderHome();
    if (state.budgetResult) runBudget();
    if ($('#detail').open && state.openId) openDetail(state.openId);
  }

  // 수업 넣기·고치기 창
  const classEdit = { id: null, days: new Set(), extra: [], rooms: {}, isElearn: false, prof: '' };   // rooms: 강의 시간표에서 고른 수업의 '요일|시작' → 강의실

  function updateClassModeUI(isElearn) {
    classEdit.isElearn = !!isElearn;
    const btnReg = $('#btn-mode-regular');
    const btnEl = $('#btn-mode-elearn');
    if (btnReg) {
      btnReg.classList.toggle('is-active', !isElearn);
      btnReg.setAttribute('aria-checked', String(!isElearn));
    }
    if (btnEl) {
      btnEl.classList.toggle('is-active', isElearn);
      btnEl.setAttribute('aria-checked', String(isElearn));
    }
    const note = $('#class-elearn-note');
    if (note) note.hidden = !isElearn;

    const dayField = $('#class-dialog .day-field');
    const timeFields = Array.from(document.querySelectorAll('#class-dialog .time-field'));
    const durations = $('#class-dialog .durations');
    const btnMore = $('#class-more');

    if (dayField) dayField.hidden = isElearn;
    timeFields.forEach((tf) => { tf.hidden = isElearn; });
    if (durations) durations.hidden = isElearn;
    if (btnMore) btnMore.hidden = isElearn;

    showClassError('');
  }

  function fillTimeSelects() {
    const hoursOpts = () => Array.from({ length: TT_HOURS.last - TT_HOURS.first + 1 },
      (_, i) => h('option', { value: String(TT_HOURS.first + i) }, pad2(TT_HOURS.first + i)));
    const minOpts = () => [0, 10, 20, 30, 40, 50].map((m) => h('option', { value: String(m) }, pad2(m)));
    for (const p of ['start', 'end']) {
      fill($(`#${p}-h`), ...hoursOpts());
      fill($(`#${p}-m`), ...minOpts());
    }
  }

  function getTime(p) {
    return parseInt($(`#${p}-h`).value, 10) * 60 + parseInt($(`#${p}-m`).value, 10);
  }

  function setTime(p, minutes) {
    const m = Math.max(TT_HOURS.first * 60, Math.min(minutes, TT_HOURS.last * 60 + 50));
    const mm = m % 60;
    const mSel = $(`#${p}-m`);
    // 예전에 넣은 15분·45분 같은 시각도 그대로 보이게 선택지를 하나 더 만든다
    if (![...mSel.options].some((o) => o.value === String(mm))) {
      mSel.append(h('option', { value: String(mm) }, pad2(mm)));
    }
    $(`#${p}-h`).value = String(Math.floor(m / 60));
    mSel.value = String(mm);
  }

  function renderDayPicks() {
    const box = $('#class-days');
    fill(box, ...DAY_ORDER.map((d) => h('button', {
      type: 'button', class: 'day-pick', 'aria-pressed': String(classEdit.days.has(d)),
      onclick: () => {
        if (classEdit.id) classEdit.days = new Set([d]);   // 고칠 때는 요일 하나만
        else if (classEdit.days.has(d)) classEdit.days.delete(d);
        else classEdit.days.add(d);
        renderDayPicks();
        showClassError('');
      }
    }, dayName(d))));
  }

  function renderDurations() {
    const len = getTime('end') - getTime('start');
    fill($('#durations'), ...DURATIONS.map((m) => h('button', {
      type: 'button', class: 'chip small', 'aria-pressed': String(len === m),
      onclick: () => { setTime('end', getTime('start') + m); renderDurations(); showClassError(''); }
    }, `${t().durationText(m)} (${t().periodText(m / 30)})`)));
  }

  function showClassError(msg) {
    $('#class-error').textContent = msg;
    $('#class-form').classList.toggle('show-time-error', !!msg);
  }

  // 과목명 자동완성: 휴대폰 브라우저는 datalist를 제대로 보여주지 않아서 직접 만든 목록을 쓴다.
  // 강의 시간표(data/timetable.js)가 있으면 분반별 요일·시간이 담긴 후보를 먼저 보여 준다.
  let courseList = [];
  const normName = (x) => String(x).replace(/\s+/g, '').toLowerCase();
  const toMin = (hm) => L.toMinutes(hm);

  function getCourseList() {
    if (courseList && courseList.length > 500) return courseList;
    const CU = window.GongjiCurriculum;
    const CO = window.GONGJI_COURSES;
    const list = [];
    const seen = new Set();
    const add = (name, kind, credit, dept) => {
      const n = normName(name);
      if (!n || seen.has(n)) return;
      seen.add(n);
      list.push({ name, kind: kind || '', credit: credit || 3, dept: dept || '' });
    };

    // 1. 내 학과 요람 과목 우선
    if (CU && state.dept) {
      for (const c of CU.suggestions(state.dept, CO) || []) add(c.name, c.kind, c.credit, state.dept);
    }
    // 2. 전체 단과대학/학과의 요람 과목 (컴퓨터공학과 등 모든 학과)
    if (CO && Array.isArray(CO.colleges)) {
      for (const col of CO.colleges) {
        for (const d of col.depts || []) {
          for (const item of d.courses || []) {
            add(item[2], item[1], item[3], d.name);
          }
        }
      }
    }
    // 3. 교양 과목
    if (CO && Array.isArray(CO.general)) {
      for (const item of CO.general) {
        add(item[2], item[0], item[3], '교양');
      }
    }
    courseList = list;
    return courseList;
  }

  // 같은 시작·끝 시간인 요일끼리 묶는다: [{days:[1,4], start:'10:00', end:'11:30'}...]
  function groupSlots(slots) {
    const groups = [];
    for (const [day, start, end] of slots) {
      const g = groups.find((x) => x.start === start && x.end === end);
      if (g) g.days.push(day); else groups.push({ days: [day], start, end });
    }
    return groups;
  }
  const slotText = (slots) => slots.map(([d, a, b]) => `${dayName(d)} ${a}–${b}`).join(', ');

  function lectureHits(q) {
    const T = window.GONGJI_TIMETABLE;
    if (!q || !T || !Array.isArray(T.courses)) return [];
    const hits = T.courses.filter((c) => normName(c.n).includes(q) || (c.p && normName(c.p).includes(q)));
    const mine = (c) => (state.dept && c.d && (c.d.includes(state.dept) || state.dept.includes(c.d)) ? 0 : 1);
    hits.sort((a, b) => {
      const aN = normName(a.n).startsWith(q) ? 0 : 1;
      const bN = normName(b.n).startsWith(q) ? 0 : 1;
      const aP = a.p && normName(a.p).startsWith(q) ? 0 : 1;
      const bP = b.p && normName(b.p).startsWith(q) ? 0 : 1;
      return (aN - bN) || (aP - bP) || (mine(a) - mine(b)) || a.n.localeCompare(b.n) || a.s.localeCompare(b.s);
    });
    return hits.slice(0, 8).map((c) => ({
      name: c.n, slots: c.t, prof: c.p || '',
      // 교수명, 분반, 시간, 수업방식 순으로 상세 표시
      label: [c.p ? `${c.p} 교수` : '', c.s ? `${c.s}분반` : '', c.t.length ? slotText(c.t) : (t().planModeElearn || ''), c.m === 'live' ? t().planModeLive : '', c.d, c.k].filter(Boolean).join(' · ')
    }));
  }

  function checkTransferredCourseWarning(courseName) {
    const warnEl = $('#class-transferred-warn');
    if (!warnEl) return false;
    const n = (courseName || '').replace(/\s+/g, '').toLowerCase();
    if (!n) { warnEl.hidden = true; return false; }
    const trList = store.get('transferredCourses', []) || [];
    const hit = trList.find((x) => x && x.name && x.name.replace(/\s+/g, '').toLowerCase() === n);
    if (hit) {
      warnEl.hidden = false;
      warnEl.innerHTML = `🚫 <strong>전적대 전공 인정 교과목</strong> (${hit.name} · ${hit.credit || 3}학점 ${hit.kind === '전필' ? '전공필수' : '전공선택'})<br>건국대학교 학사 규정상 전적대에서 이미 인정받은 과목은 <strong>재수강(중복 수강신청)할 수 없습니다.</strong>`;
      return true;
    } else {
      warnEl.hidden = true;
      return false;
    }
  }

  function pickLecture(item) {
    if (item && item.name) checkTransferredCourseWarning(item.name);
    const groups = groupSlots(item.slots);
    const first = groups[0] || { days: [], start: '09:00', end: '10:30' };
    classEdit.days = new Set(first.days);
    setTime('start', toMin(first.start));
    setTime('end', toMin(first.end));
    classEdit.prof = item.prof || item.p || '';
    const profInput = $('#class-prof');
    if (profInput) profInput.value = classEdit.prof;
    // 나머지 시간(요일마다 시간이 다른 경우)은 저장할 때 함께 넣는다.
    classEdit.extra = groups.slice(1).flatMap((g) => g.days.map((d) => ({ day: d, start: g.start, end: g.end })));
    classEdit.rooms = {};
    for (const [d, a, , room] of item.slots || []) if (room) classEdit.rooms[`${d}|${a}`] = room;
    renderDayPicks();
    renderDurations();
    showClassError('');
    renderExtraNote();
  }

  function renderExtraNote() {
    const box = $('#class-extra');
    box.hidden = classEdit.extra.length === 0;
    box.textContent = classEdit.extra.length
      ? t().extraNote(classEdit.extra.map((x) => `${dayName(x.day)} ${x.start}–${x.end}`).join(', '))
      : '';
  }

  function showSuggest() {
    const box = $('#course-suggest');
    const input = $('#class-name');
    const q = normName(input.value.trim());
    const lectures = lectureHits(q);
    const taken = new Set(lectures.map((x) => normName(x.name)));
    const allCourses = getCourseList();
    const plain = q
      ? [...allCourses.filter((c) => normName(c.name).startsWith(q)), ...allCourses.filter((c) => !normName(c.name).startsWith(q) && normName(c.name).includes(q))]
          .filter((c) => !taken.has(normName(c.name)) && c.name !== input.value.trim())
      : [];
    const shown = [...lectures, ...plain.slice(0, Math.max(0, 8 - lectures.length))];
    box.replaceChildren(...shown.map((c) => h('li', { role: 'option' },
      h('button', { type: 'button', onpointerdown: (e) => e.preventDefault(), onclick: () => {
        input.value = c.name;
        checkTransferredCourseWarning(c.name);
        classEdit.extra = [];
        classEdit.rooms = {};
        classEdit.prof = c.prof || c.p || '';
        const profInput = $('#class-prof');
        if (profInput) profInput.value = classEdit.prof;
        renderExtraNote();
        if (c.slots && c.slots.length) {
          updateClassModeUI(false);
          pickLecture(c);
        } else {
          updateClassModeUI(true);
        }
        hideSuggest(); input.focus();
      } }, h('span', {}, c.name), h('small', {}, c.label || [c.prof ? `${c.prof} 교수` : '', c.dept, c.kind, c.credit ? `${c.credit}학점` : ''].filter(Boolean).join(' · '))))));
    box.hidden = shown.length === 0;
    input.setAttribute('aria-expanded', String(shown.length > 0));
  }
  function hideSuggest() {
    $('#course-suggest').hidden = true;
    $('#class-name').setAttribute('aria-expanded', 'false');
  }

  // 공지에 나온 어려운 용어 찾기: 제목에 나온 것을 먼저, 최대 10개
  function glossaryTermsFor(n) {
    const sq = (x) => String(x || '').replace(/\s+/g, '').toLowerCase();
    const parts = [n.title, n.summary && n.summary.ko, n.eligibility && n.eligibility.ko, n.benefit && n.benefit.text && n.benefit.text.ko];
    if (n.evidence) parts.push(...Object.values(n.evidence));
    const hay = sq(parts.filter(Boolean).join(' '));
    const head = sq(n.title);
    const names = (k) => [k, ...((GLOSSARY[k] && GLOSSARY[k].alt) || [])].map(sq).filter(Boolean);
    const set = new Set((n.terms || []).filter((k) => GLOSSARY[k]));
    for (const k of Object.keys(GLOSSARY)) if (names(k).some((x) => hay.includes(x))) set.add(k);
    return [...set].sort((a, b) => (names(a).some((x) => head.includes(x)) ? 0 : 1) - (names(b).some((x) => head.includes(x)) ? 0 : 1)).slice(0, 10);
  }

  function updateQuickSlotSuggest(day, startMinutes) {
    const box = $('#class-quick-suggest');
    const chipsBox = $('#cqs-chips');
    if (!box || !chipsBox) return;

    if (classEdit.id || classEdit.isElearn || !window.GONGJI_TIMETABLE || !Array.isArray(window.GONGJI_TIMETABLE.courses)) {
      box.hidden = true;
      return;
    }

    const tt = window.GONGJI_TIMETABLE.courses;
    const startWindowMin = startMinutes - 30;
    const endWindowMin = startMinutes + 120;
    const matching = [];
    const userDept = (state.profile && state.profile.dept) || state.dept || '';

    for (const c of tt) {
      if (!c.t || !c.t.length) continue;
      const hitSlot = c.t.find(([d, s, e]) => {
        if (d !== day) return false;
        const sm = toMin(s);
        const em = toMin(e);
        return (sm >= startWindowMin && sm <= endWindowMin) || (sm <= startMinutes && em > startMinutes);
      });
      if (hitSlot) {
        const isDept = userDept && c.d && (c.d.includes(userDept) || userDept.includes(c.d));
        let score = 0;
        if (isDept) score += 50;
        if (c.k === '전필') score += 40;
        else if (c.k === '전선') score += 30;
        else if (c.k === '기초') score += 20;
        else if (c.k === '심화' || c.k === '소양') score += 15;
        matching.push({ c, slot: hitSlot, isDept, score });
      }
    }

    matching.sort((a, b) => b.score - a.score || a.c.n.localeCompare(b.c.n, 'ko'));

    const seen = new Set();
    const top = [];
    for (const m of matching) {
      const k = normName(m.c.n);
      if (seen.has(k)) continue;
      seen.add(k);
      top.push(m);
      if (top.length >= 5) break;
    }

    if (!top.length) {
      box.hidden = true;
      return;
    }

    box.hidden = false;
    const DI18n = (typeof window !== 'undefined' && window.GongjiDeptI18n) || root.GongjiDeptI18n;
    chipsBox.replaceChildren(...top.map(({ c, slot }) => {
      const localizedName = (DI18n && DI18n.formatCourse) ? DI18n.formatCourse(c.n, state.lang) : c.n;
      const kindLocalized = state.lang === 'en'
        ? (c.k === '전필' ? 'Major Req' : c.k === '전선' ? 'Major Elect' : c.k === '기초' ? 'Basic' : c.k === '심화' ? 'Advanced' : c.k === '소양' ? 'Gen Ed' : c.k)
        : state.lang === 'zh'
        ? (c.k === '전필' ? '专业必修' : c.k === '전선' ? '专业选修' : c.k === '기초' ? '基础' : c.k === '심화' ? '深化' : c.k === '소양' ? '通识' : c.k)
        : state.lang === 'ja'
        ? (c.k === '전필' ? '専攻必修' : c.k === '전선' ? '専攻選択' : c.k === '기초' ? '基礎' : c.k === '심화' ? '深化' : c.k === '소양' ? '教養' : c.k)
        : c.k;
      const creditUnit = state.lang === 'en' ? ' cr' : state.lang === 'zh' ? '学分' : state.lang === 'ja' ? '単位' : '학점';
      const profText = c.p ? (state.lang === 'en' ? `Prof. ${c.p}` : state.lang === 'ja' || state.lang === 'zh' ? `${c.p} 教授` : `${c.p} 교수`) : '';
      const meta = [kindLocalized, c.c ? `${c.c}${creditUnit}` : '', profText].filter(Boolean).join(' · ');
      return h('button', {
        type: 'button',
        class: 'cqs-chip' + (c.k === '전필' ? ' is-major-req' : ''),
        title: `${localizedName} (${c.d || ''} · ${meta})`,
        onclick: () => {
          $('#class-name').value = c.n;
          checkTransferredCourseWarning(c.n);
          classEdit.extra = [];
          classEdit.rooms = {};
          classEdit.prof = c.p || '';
          const profInput = $('#class-prof');
          if (profInput) profInput.value = classEdit.prof;
          renderExtraNote();
          pickLecture({ name: c.n, p: c.p, prof: c.p, slots: c.t });
          box.hidden = true;
        }
      },
        h('span', { class: 'cqs-name' }, localizedName),
        h('span', { class: 'cqs-meta' }, meta)
      );
    }));
  }

  // 과목명으로 크롬 확장이 수집한 KIS 강의 시간표(GONGJI_TIMETABLE) 및 검증된 건국대 글로컬 교수진 매핑에서 담당 교수 자동 조회
  function findProfForCourse(courseName, section) {
    if (!courseName) return '';
    const norm = normName(courseName);

    // 1) 현재 시간표(state.classes)에 이미 등록된 동일 과목의 교수명이 있으면 최우선 계승
    if (Array.isArray(state.classes)) {
      const existing = state.classes.find((c) => c && normName(c.name) === norm && (c.prof || c.p));
      if (existing) return (existing.prof || existing.p || '').trim();
    }

    // 2) KIS 수집 강의 시간표(window.GONGJI_TIMETABLE: 1,532 강좌) 조회
    const T = window.GONGJI_TIMETABLE;
    if (T && Array.isArray(T.courses)) {
      const userDept = (state.profile && state.profile.dept) || state.dept || '';
      // 학과 일치 + 과목명 일치 우선
      if (userDept) {
        const deptExact = T.courses.find((c) => normName(c.n) === norm && (c.p || c.prof) && c.d && (c.d.includes(userDept) || userDept.includes(c.d)) && (!section || c.s === section));
        if (deptExact) return (deptExact.p || deptExact.prof || '').trim();
      }
      // 정확히 과목명이 일치하는 강의
      const exact = T.courses.find((c) => normName(c.n) === norm && (c.p || c.prof) && (!section || c.s === section));
      if (exact) return (exact.p || exact.prof || '').trim();
      // 과목명을 포함하는 강의
      const partial = T.courses.find((c) => (normName(c.n).startsWith(norm) || norm.startsWith(normName(c.n))) && (c.p || c.prof));
      if (partial) return (partial.p || partial.prof || '').trim();
    }

    // 3) KIS 공식 교수진 매핑 데이터베이스 (window.GONGJI_PROFESSORS: 2,800 강좌)
    const P_DICT = window.GONGJI_PROFESSORS;
    if (P_DICT && typeof P_DICT === 'object') {
      if (section && P_DICT[`${courseName}:${section}`]) return P_DICT[`${courseName}:${section}`];
      if (P_DICT[`${courseName}:01`]) return P_DICT[`${courseName}:01`];
      for (const [k, p] of Object.entries(P_DICT)) {
        const [cName] = k.split(':');
        if (normName(cName) === norm && p) return p;
      }
    }

    // 4) 예시 시간표 조회
    const exHit = EXAMPLE_TIMETABLE.find((c) => {
      const ko = c.names && c.names.ko ? normName(c.names.ko) : '';
      const en = c.names && c.names.en ? normName(c.names.en) : '';
      return ko === norm || en === norm || (c.name && normName(c.name) === norm);
    });
    if (exHit && exHit.prof) return exHit.prof.trim();

    return '';
  }

  function openClassDialog({ cls = null, day = 1, start = 9 * 60, name = '', elearn = false } = {}) {
    classEdit.id = cls ? cls.id : null;
    const isElearn = cls ? Boolean(cls.elearn || cls.m === 'elearn' || !cls.start) : Boolean(elearn);
    classEdit.isElearn = isElearn;
    classEdit.days = new Set(isElearn ? [] : [cls ? cls.day : day]);
    classEdit.extra = [];
    classEdit.rooms = {};
    classEdit.prof = cls ? (cls.prof || cls.p || '') : '';
    const targetName = cls ? (cls.name || '') : name;

    // 과목명으로 시간표(GONGJI_TIMETABLE)에서 개설 정보 조회 (강의실, 요일, 시간, 교수 자동 반영)
    if (!cls && targetName && window.GONGJI_TIMETABLE && Array.isArray(window.GONGJI_TIMETABLE.courses)) {
      const userDept = (state.profile && state.profile.dept) || state.dept || '';
      const hits = window.GONGJI_TIMETABLE.courses.filter((c) => normName(c.n) === normName(targetName));
      const hit = hits.find((c) => userDept && c.d && (c.d.includes(userDept) || userDept.includes(c.d))) || hits[0];
      if (hit) {
        if (!classEdit.prof && (hit.p || hit.prof)) classEdit.prof = hit.p || hit.prof;
        if (hit.t && hit.t.length) {
          const groups = groupSlots(hit.t);
          const first = groups[0];
          if (first) {
            classEdit.days = new Set(first.days);
            start = toMin(first.start);
            classEdit.extra = groups.slice(1).flatMap((g) => g.days.map((d) => ({ day: d, start: g.start, end: g.end })));
          }
        }
      }
    }

    // 교수명이 비어있는 경우, 과목명으로 KIS 공식 DB에서 담당 교수 자동 조회 및 채우기
    if (!classEdit.prof && targetName) {
      const autoProf = findProfForCourse(targetName);
      if (autoProf) {
        classEdit.prof = autoProf;
      }
    }
    const profInput = $('#class-prof');
    if (profInput) profInput.value = classEdit.prof;
    renderExtraNote();
    $('#class-dialog-title').textContent = cls ? t().editClass : t().addClass;
    $('#class-name').value = cls ? cls.name || '' : name;
    checkTransferredCourseWarning($('#class-name').value);
    const s = cls && cls.start ? L.toMinutes(cls.start) : start;
    setTime('start', s);
    setTime('end', cls && cls.end ? L.toMinutes(cls.end) : s + 90);
    $('#class-delete').hidden = !cls;
    $('#class-delete').setAttribute('aria-label', cls ? t().removeClass(cls) : '');
    // 같은 이름의 칸이 여러 개면(월·목 수업 등) 삭제가 모두 지운다는 것을 버튼에 적어 둔다
    const sib = cls && classKey(cls) ? state.timetable.filter((c) => classKey(c) === classKey(cls)).length : 1;
    $('#class-delete').textContent = sib > 1 ? t().removeAll(sib) : t().remove;
    $('#class-dialog').classList.toggle('editing', !!cls);
    renderDayPicks();
    renderDurations();
    updateClassModeUI(isElearn);
    updateQuickSlotSuggest(cls ? cls.day : day, s);
    renderAltSections(cls);
    showClassError('');
    hideSuggest();
    $('#class-dialog').showModal();
    if (name && !cls) showSuggest();   // 교육과정에서 과목을 눌러 들어온 경우 분반·시간 후보를 바로 보여 준다.
    else if (!cls) $('#class-name').focus();
  }

  const classKey = (c) => String((c && c.name) || '').trim().toLowerCase();
  function saveClass(more = false) {
    const name = $('#class-name').value.trim();
    if (!name) return showClassError('수업 이름을 적어 주세요.');
    const isTr = checkTransferredCourseWarning(name);
    if (isTr) {
      if (!confirm(`[${name}] 과목은 전적대에서 전공으로 인정받은 과목입니다.\n건국대학교 학사 규정상 전적대 인정과목은 재수강(중복 수강신청)할 수 없습니다.\n\n그래도 시간표에 추가하시겠습니까?`)) {
        return;
      }
    }
    const prof = ($('#class-prof')?.value || classEdit.prof || '').trim();

    if (classEdit.isElearn) {
      let others = state.timetable.filter((c) => c.id !== classEdit.id);
      const orig = classEdit.id ? state.timetable.find((c) => c.id === classEdit.id) : null;
      if (orig && classKey(orig) && name !== orig.name) {
        others = others.map((c) => (classKey(c) === classKey(orig) ? Object.assign({}, c, { name, prof: prof || c.prof }) : c));
      }
      const item = {
        id: classEdit.id || 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name,
        prof,
        elearn: true,
        m: 'elearn',
        room: '이러닝'
      };
      state.timetable = others.concat([item]);
      saveTimetable();
      $('#class-dialog').close();
      timetableChanged();
      return;
    }

    const s = getTime('start');
    const e = getTime('end');
    if (e <= s) return showClassError(t().timeError);
    if (!classEdit.days.size) return showClassError(t().pickDay);
    const orig = classEdit.id ? state.timetable.find((c) => c.id === classEdit.id) : null;
    let others = state.timetable.filter((c) => c.id !== classEdit.id);
    // 수업 이름을 고치면 같은 수업의 다른 요일 칸도 같은 이름으로 바꾼다 (월·목 수업이 둘로 갈라지지 않게)
    if (orig && classKey(orig) && name && name !== orig.name) {
      others = others.map((c) => (classKey(c) === classKey(orig) ? Object.assign({}, c, { name, prof: prof || c.prof }) : c));
    }
    const withDetails = (c, room) => Object.assign(c, room ? { room } : {}, prof ? { prof } : {});
    for (const d of classEdit.days) {
      const hit = others.find((c) => c.day === d && !c.elearn && c.start && L.overlaps(s, e, L.toMinutes(c.start), L.toMinutes(c.end)));
      if (hit) return showClassError(t().overlapError(dayName(d), hit));
    }
    const made = [...classEdit.days].map((d, i) => withDetails({
      id: classEdit.id || 'c' + Date.now().toString(36) + i + Math.random().toString(36).slice(2, 5),
      day: d, start: fromMinutes(s), end: fromMinutes(e), name
    }, orig ? orig.room : classEdit.rooms[`${d}|${fromMinutes(s)}`])).filter(L.isValidClass);
    // 강의 시간표에서 고른 수업의 다른 요일·시간
    const extras = classEdit.id ? [] : classEdit.extra.map((x, i) => withDetails({
      id: 'c' + Date.now().toString(36) + 'x' + i + Math.random().toString(36).slice(2, 5),
      day: x.day, start: x.start, end: x.end, name
    }, classEdit.rooms[`${x.day}|${x.start}`])).filter(L.isValidClass);
    for (const x of extras) {
      const hit = others.concat(made).find((c) => c.day === x.day && !c.elearn && c.start && L.overlaps(toMin(x.start), toMin(x.end), toMin(c.start), toMin(c.end)));
      if (hit) return showClassError(t().overlapError(dayName(x.day), hit));
    }
    state.timetable = others.concat(made, extras);
    saveTimetable();
    if (more) {
      // 같은 과목의 다른 요일·시간을 이어서 넣는다: 이름·시간은 그대로 두고 요일만 비운다.
      classEdit.days = new Set();
      classEdit.extra = [];
      renderExtraNote();
      renderDayPicks();
      renderDurations();
      showClassError('');
      timetableChanged();
      $('#class-dialog').querySelector('.day-picks button')?.focus();
      return;
    }
    $('#class-dialog').close();
    timetableChanged();
  }

  // ---------- 시간 예산 추천 ----------
  function runBudget() {
    const hours = parseFloat($('#budget-hours').value);
    const windowDays = parseInt($('#budget-window').value, 10) || 7;
    if (!(hours > 0)) return;
    state.budgetHours = hours;
    state.budgetWindow = windowDays;
    store.set('budgetHours', hours);
    store.set('budgetWindow', windowDays);
    state.budgetResult = L.recommend(activeNotices(), hours, {
      now, windowDays, timetable: state.timetable, includeSelective: state.budgetSelective
    });
    renderBudget();
  }

  // 빠른 선택: 누르면 그 시간으로 바로 추천
  const BUDGET_PRESETS = [2, 4, 8, 16];
  function renderBudgetPresets() {
    const box = $('#budget-presets');
    if (!box) return;
    const T = t();
    fill(box, h('span', { class: 'presets-label' }, T.budgetQuick),
      BUDGET_PRESETS.map((v) => h('button', {
        type: 'button', class: 'chip small', 'aria-pressed': String(state.budgetHours === v),
        onclick: () => { $('#budget-hours').value = String(v); runBudget(); }
      }, T.hoursValue(v))));
  }

  function renderBudget() {
    const box = $('#budget-result');
    const r = state.budgetResult;
    renderBudgetPresets();
    if (!r) { fill(box); return; }
    const T = t();
    if (!r.chosen.length) {
      fill(box, h('p', { class: 'empty' }, T.budgetEmpty), r.skipped ? h('p', { class: 'fine' }, T.budgetSkipped(r.skipped)) : null);
      return;
    }
    const ids = r.chosen.map((it) => it.id);
    const used = Math.min(1, r.totalHours / (state.budgetHours || 1));
    fill(box,
      h('div', { class: 'budget-summary' },
        h('p', { class: 'budget-sum' }, T.budgetSummary({
          count: r.chosen.length, hours: round1(r.totalHours), score: round1(r.totalScore), candidates: r.candidates
        })),
        h('div', { class: 'budget-bar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.round(used * 100)}%` })),
        h('p', { class: 'fine' }, T.budgetUsed(round1(r.totalHours), state.budgetHours))),
      h('ol', { class: 'picks' }, r.chosen.map((it, i) => {
        const n = it.notice;
        const sub = L.classifyBenefit(n).subs[0];
        return h('li', { class: 'pick' },
          h('span', { class: 'pick-rank', 'aria-hidden': 'true' }, String(i + 1)),
          h('div', { class: 'pick-body' },
            h('button', { type: 'button', class: 'link pick-title', 'aria-haspopup': 'dialog', onclick: () => openDetail(it.id, false, ids) }, titleOf(n)),
            h('div', { class: 'pick-tags' },
              sub ? subTag(n, sub) : null,
              it.selective ? h('span', { class: 'tag kind-info selective-tag' }, T.selectiveTag) : null,
              ddayBadge(n)),
            h('p', { class: 'pick-meta' }, `${T.hoursValue(it.hours)}${it.estimated ? ` (${T.estimated})` : ''} · ${round1(it.score)}${T.points}` +
              (n.deadline ? ` · ${T.deadline} ${I.formatDateTime(L.parseLocal(n.deadline), state.lang)}` : ''))));
      })),
      h('button', { type: 'button', class: 'btn small', onclick: () => exportCalendar(r.chosen.map((it) => it.notice), 'gongji-picks') }, T.pickCalendar));
  }

  // ---------- 오늘 (홈) ----------
  function goList(patch) {
    scrollMem.notices = 0;                       // 조건을 바꿔 들어오면 목록 맨 위부터
    Object.assign(state, { query: '', board: '', category: '', group: '', sub: '', savedOnly: false, mineOnly: false, unreadOnly: false, due: '', status: 'open' }, patch);
    $('#q').value = '';
    applyStaticText();
    renderList();
    location.hash = '#/notices';
    setTab('notices', true);
    window.scrollTo(0, 0);
  }

  function homeRow(n, ids) {
    const sub = L.classifyBenefit(n).subs[0];
    return h('li', { class: 'home-row' },
      h('button', { type: 'button', class: 'link home-title', 'aria-haspopup': 'dialog', onclick: () => openDetail(n.id, false, ids || null) }, titleOf(n)),
      h('span', { class: 'home-meta' },
        X.isNew(n, since) ? h('span', { class: 'new-badge' }, t().newBadge) : null,
        sub ? subTag(n, sub) : null,
        ddayBadge(n)));
  }

  function homeSection(title, items, limit, moreAction) {
    if (!items.length) return null;
    return h('section', { class: 'home-card' },
      h('h3', null, title, h('span', { class: 'group-count' }, ` ${items.length}`)),
      h('ul', { class: 'home-list' }, items.slice(0, limit).map((n) => homeRow(n, items.map((x) => x.id)))),
      moreAction && items.length > limit ? h('button', { type: 'button', class: 'link-btn', onclick: moreAction }, t().homeMore) : null);
  }

  // ---------- [1순위: 연강 동선 & 헐떡고개 10분 컷 판독기 모달] ----------
  function openRouteDialog(clsA, clsB, route) {
    const dlg = $('#route-dialog');
    if (!dlg) return;
    const body = $('#route-dialog-body');
    if (!body) return;
    const T = t();

    const isDanger = route.level === 'danger';
    const isWarn = route.level === 'warning';
    const levelClass = isDanger ? 'is-danger' : isWarn ? 'is-warn' : 'is-safe';
    const levelIcon = isDanger ? '🚨' : isWarn ? '⚠️' : '🟢';

    const DI18n = (typeof window !== 'undefined' && window.GongjiDeptI18n) || root.GongjiDeptI18n;
    const CR = (typeof window !== 'undefined' && window.GongjiCampusRoute) || root.GongjiCampusRoute;
    const nameA = (DI18n && DI18n.formatCourse) ? DI18n.formatCourse(clsA.name, state.lang) : (clsA.name || (state.lang === 'en' ? 'Course A' : state.lang === 'zh' ? '课程A' : state.lang === 'ja' ? '授業A' : '과목A'));
    const roomA = (CR && CR.formatRoom) ? CR.formatRoom(clsA.room, state.lang) : (clsA.room || (state.lang === 'en' ? 'Classroom TBA' : state.lang === 'zh' ? '教室待定' : state.lang === 'ja' ? '教室未定' : '강의실 미지정'));
    const nameB = (DI18n && DI18n.formatCourse) ? DI18n.formatCourse(clsB.name, state.lang) : (clsB.name || (state.lang === 'en' ? 'Course B' : state.lang === 'zh' ? '课程B' : state.lang === 'ja' ? '授業B' : '과목B'));
    const roomB = (CR && CR.formatRoom) ? CR.formatRoom(clsB.room, state.lang) : (clsB.room || (state.lang === 'en' ? 'Classroom TBA' : state.lang === 'zh' ? '教室待定' : state.lang === 'ja' ? '教室未定' : '강의실 미지정'));

    const bldgA = (CR && CR.formatRoom) ? CR.formatRoom(route.fromBuilding, state.lang) : route.fromBuilding;
    const bldgB = (CR && CR.formatRoom) ? CR.formatRoom(route.toBuilding, state.lang) : route.toBuilding;

    const elevDiffText = route.elevationDiff > 0
      ? (T.rdClimbUp ? T.rdClimbUp(route.elevationDiff) : `+${route.elevationDiff}m 등판`)
      : (T.rdFlatDown || '평지/내리막');

    const pathDesc = route.hasHillAlert
      ? (state.lang === 'en' ? '⚠️ Steep Hill Course (Heavy Incline)'
        : state.lang === 'zh' ? '⚠️ 陡坡爬坡路线 (喘息坡警报)'
        : state.lang === 'ja' ? '⚠️ 息切れ坂・急勾配コース'
        : '⚠️ 헐떡고개 급경사로 코스')
      : (state.lang === 'en' ? '🚶 Gentle Footpath Walk'
        : state.lang === 'zh' ? '🚶 平缓步道通行'
        : state.lang === 'ja' ? '🚶 緩やかな歩道移動'
        : '🚶 완만 보도 이동');

    const bMetaA = CR && CR.BUILDINGS && CR.BUILDINGS[route.fromBuilding];
    const bMetaB = CR && CR.BUILDINGS && CR.BUILDINGS[route.toBuilding];
    const hasElevA = bMetaA ? bMetaA.hasElevator : (route.fromBuilding !== '국제교육관');
    const hasElevB = bMetaB ? bMetaB.hasElevator : (route.toBuilding !== '국제교육관');
    const elevA = !hasElevA
      ? (T.rdElevatorNone || '❌ 엘리베이터 없음 (전 층 계단 보행 필수)')
      : (T.rdElevatorOk || '⭕ 엘리베이터 운행 (쉬는시간 혼잡 가능)');
    const elevB = !hasElevB
      ? (T.rdElevatorNone || '❌ 엘리베이터 없음 (전 층 계단 보행 필수)')
      : (T.rdElevatorOk || '⭕ 엘리베이터 운행 (쉬는시간 혼잡 가능)');

    const endStr = state.lang === 'en' ? `${clsA.end} End` : state.lang === 'zh' ? `${clsA.end} 下课` : state.lang === 'ja' ? `${clsA.end} 終了` : `${clsA.end} 종료`;
    const startStr = state.lang === 'en' ? `${clsB.start} Start` : state.lang === 'zh' ? `${clsB.start} 上课` : state.lang === 'ja' ? `${clsB.start} 開始` : `${clsB.start} 시작`;
    const shortcutPrefix = state.lang === 'en' ? '💡 Shortcut Tip: ' : state.lang === 'zh' ? '💡 捷径提示: ' : state.lang === 'ja' ? '💡 近道ヒント: ' : '💡 지름길 팁: ';

    fill(body,
      h('div', { class: 'rd-banner ' + levelClass },
        h('div', { class: 'rdb-icon' }, levelIcon),
        h('div', { class: 'rdb-text' },
          h('h3', { class: 'rdb-title' }, route.statusText),
          h('p', { class: 'rdb-sub' }, route.tips)
        )
      ),
      h('div', { class: 'rd-metrics-grid' },
        h('div', { class: 'rd-metric-card' },
          h('span', { class: 'rdm-label' }, T.rdBreakTime || '쉬는 시간'),
          h('strong', { class: 'rdm-val' }, `${route.breakMin}${state.lang === 'en' ? 'm' : '분'}`)
        ),
        h('div', { class: 'rd-metric-card' },
          h('span', { class: 'rdm-label' }, T.rdEstWalk || '예상 도보 소요'),
          h('strong', { class: 'rdm-val' + (isDanger ? ' text-red' : isWarn ? ' text-amber' : ' text-green') }, `${route.walkMin}${state.lang === 'en' ? 'm' : '분'}`)
        ),
        h('div', { class: 'rd-metric-card' },
          h('span', { class: 'rdm-label' }, T.rdDistElev || '이동 거리 / 고저차'),
          h('strong', { class: 'rdm-val' }, `${route.distM}m · ${elevDiffText}`)
        ),
        h('div', { class: 'rd-metric-card' },
          h('span', { class: 'rdm-label' }, T.rdBuffer || '10분 컷 잔여 여유'),
          h('strong', { class: 'rdm-val' + (route.remainMin <= 1 ? ' text-red' : ' text-green') }, `${route.remainMin}${state.lang === 'en' ? 'm' : '분'}`)
        )
      ),
      h('div', { class: 'rd-timeline' },
        h('div', { class: 'rdt-step start' },
          h('span', { class: 'rdt-badge' }, T.rdPrevClass || '이전 수업'),
          h('div', { class: 'rdt-info' },
            h('strong', null, `${nameA} (${roomA})`),
            h('span', { class: 'fine muted' }, `${bldgA} · ${endStr}`)
          )
        ),
        h('div', { class: 'rdt-step path ' + levelClass },
          h('span', { class: 'rdt-badge path' }, T.rdRoutePath || '이동 동선'),
          h('div', { class: 'rdt-info' },
            h('strong', null, pathDesc),
            route.hillReason ? h('p', { class: 'rdt-hill-reason' }, route.hillReason) : null,
            route.shortcut ? h('p', { class: 'rdt-shortcut-box' }, `${shortcutPrefix}${route.shortcut}`) : null
          )
        ),
        h('div', { class: 'rdt-step dest' },
          h('span', { class: 'rdt-badge' }, T.rdNextClass || '다음 수업'),
          h('div', { class: 'rdt-info' },
            h('strong', null, `${nameB} (${roomB})`),
            h('span', { class: 'fine muted' }, `${bldgB} · ${startStr}`)
          )
        )
      ),
      h('div', { class: 'rd-building-notes' },
        h('h4', { class: 'rdn-title' }, T.rdBuildingNotes || '🏢 건물별 계단 & 엘리베이터 특성'),
        h('ul', { class: 'rdn-list' },
          h('li', null, `📍 ${bldgA}: ${elevA}`),
          h('li', null, `📍 ${bldgB}: ${elevB}`)
        )
      )
    );

    if (dlg.showModal) dlg.showModal();
    else dlg.open = true;
  }

  function renderConsecutiveRouteItem(prev, next, route, gap) {
    const isDanger = route.level === 'danger';
    const isWarn = route.level === 'warning';
    const badgeClass = isDanger ? 'is-danger' : isWarn ? 'is-warn' : 'is-safe';
    const icon = isDanger ? '🚨' : isWarn ? '⚠️' : '🟢';
    const T = t();
    const DI18n = (typeof window !== 'undefined' && window.GongjiDeptI18n) || root.GongjiDeptI18n;
    const CR = (typeof window !== 'undefined' && window.GongjiCampusRoute) || root.GongjiCampusRoute;
    const roomA = (CR && CR.formatRoom) ? CR.formatRoom(prev.room, state.lang) : (prev.room || (state.lang === 'en' ? 'Classroom A' : '강의실A'));
    const roomB = (CR && CR.formatRoom) ? CR.formatRoom(next.room, state.lang) : (next.room || (state.lang === 'en' ? 'Classroom B' : '강의실B'));
    const timeMeta = T.rdBreakWalkMeta ? T.rdBreakWalkMeta(gap, route.walkMin) : `쉬는시간 ${gap}분 · 도보 ${route.walkMin}분`;
    const btnTitle = state.lang === 'en' ? 'Click to inspect consecutive route and steep hill advice'
      : state.lang === 'zh' ? '点击查看连堂移动路线及爬坡建议'
      : state.lang === 'ja' ? 'クリックして連講移動ルートと息切れ坂のアドバイスを確認'
      : '클릭하여 연강 이동 동선 및 헐떡고개 상세 보기';

    return h('li', {
      class: 'home-row tc-route-item ' + badgeClass,
      role: 'button',
      tabindex: 0,
      title: btnTitle,
      onclick: () => openRouteDialog(prev, next, route),
      onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openRouteDialog(prev, next, route); } }
    },
      h('div', { class: 'tc-route-head' },
        h('span', { class: 'tc-route-badge ' + badgeClass }, `${icon} ${route.statusText}`),
        h('span', { class: 'tc-route-time-pill' }, timeMeta)
      ),
      h('div', { class: 'tc-route-body' },
        h('span', { class: 'tc-route-path' }, `${roomA} ➔ ${roomB}`),
        route.hasHillAlert ? h('span', { class: 'tc-route-hill-warning' }, T.rdHillWarningBadge || '⚠️ 헐떡고개') : null,
        h('span', { class: 'tc-route-arrow' }, T.rdRouteCheckBtn || '동선 판독 ↗')
      )
    );
  }

  // ---------- [3순위: 시간표 연동 귀가 & 하교 교통 알리미] ----------
  function renderTransitAssistantCard(today) {
    const CR = (typeof window !== 'undefined' && window.GongjiCampusRoute) || root.GongjiCampusRoute;
    if (!CR || !CR.getTransitRecommendation || !today || !today.length) return null;

    const T = t();
    const lastClass = today[today.length - 1];
    let selectedDest = 'shuttle';
    try { selectedDest = localStorage.getItem('gongji:transitDest') || 'shuttle'; } catch {}
    const rec = CR.getTransitRecommendation(lastClass.end, lastClass.room, selectedDest, state.lang);
    if (!rec) return null;

    const DI18n = (typeof window !== 'undefined' && window.GongjiDeptI18n) || root.GongjiDeptI18n;
    const localizedClassName = (DI18n && DI18n.formatCourse) ? DI18n.formatCourse(lastClass.name, state.lang) : lastClass.name;
    const localizedBldg = (CR && CR.formatRoom) ? CR.formatRoom(rec.fromBuilding || lastClass.room, state.lang) : (rec.fromBuilding || '교내');

    const destinations = [
      { id: 'shuttle', icon: '🚌', names: { ko: '교내 셔틀', en: 'Shuttle', zh: '校内校车', ja: '校内シャトル' } },
      { id: 'ktx', icon: '🚅', names: { ko: '충주역 KTX', en: 'KTX Train', zh: '忠州站KTX', ja: '忠州駅KTX' } },
      { id: 'downtown', icon: '🛍️', names: { ko: '충주 시내', en: 'Downtown', zh: '忠州市区', ja: '忠州市内' } },
      { id: 'seoul', icon: '🏙️', names: { ko: '동서울/강남', en: 'Seoul', zh: '首尔', ja: '東ソウル/江南' } },
      { id: 'suwon', icon: '🛣️', names: { ko: '수원/경기', en: 'Suwon', zh: '水原/京畿', ja: '水原/京畿' } },
      { id: 'cheongju', icon: '🏬', names: { ko: '청주/충청', en: 'Cheongju', zh: '清州', ja: '清州' } },
      { id: 'daejeon', icon: '🏢', names: { ko: '대전', en: 'Daejeon', zh: '大田', ja: '大田' } },
      { id: 'incheon', icon: '🌊', names: { ko: '인천/안산', en: 'Incheon', zh: '仁川/安山', ja: '仁川/安山' } },
      { id: 'wonju', icon: '⛰️', names: { ko: '원주/강원', en: 'Wonju', zh: '原州', ja: '原州' } },
      { id: 'commuter', icon: '🚌', names: { ko: '금요 통학버스', en: 'Friday Bus', zh: '周五专车', ja: '金曜通学バス' } }
    ];

    const destChips = destinations.map((d) => h('button', {
      type: 'button',
      class: 'tc-transit-chip' + (selectedDest === d.id ? ' is-active' : ''),
      onclick: (e) => {
        e.stopPropagation();
        try { localStorage.setItem('gongji:transitDest', d.id); } catch {}
        renderHome();
      }
    }, `${d.icon} ${(d.names && d.names[state.lang]) || d.names.ko}`));

    let scheduleContent = null;
    if (selectedDest === 'ktx' && rec.bestMatch) {
      const bm = rec.bestMatch;
      scheduleContent = h('div', { class: 'tc-transit-detail' },
        h('div', { class: 'tct-step-row' },
          h('span', { class: 'tct-step-badge' }, T.ttStepShuttle || '1단계 셔틀'),
          h('strong', null, `${bm.shuttleDep} ${T.ttMainStadiumShuttle || '대운동장 셔틀'}`),
          h('span', { class: 'tct-sub' }, `(${T.ttWalkWait ? T.ttWalkWait(rec.walkMin, bm.waitMinAtStop) : `도보 ${rec.walkMin}분 · 정류장 ${bm.waitMinAtStop}분 대기`})`)
        ),
        h('div', { class: 'tct-step-row' },
          h('span', { class: 'tct-step-badge' }, T.ttStepTransfer || '2단계 환승'),
          h('strong', null, `${bm.stationArrive} ${state.lang === 'en' ? 'Arrives Chungju Sta.' : state.lang === 'zh' ? '到达忠州站' : state.lang === 'ja' ? '忠州駅到着' : '충주역 도착'}`),
          h('span', { class: 'tct-sub' }, `(${T.ttTransferWait ? T.ttTransferWait(bm.waitMinAtStation) : `환승 여유 ${bm.waitMinAtStation}분`})`)
        ),
        h('div', { class: 'tct-step-row is-target' },
          h('span', { class: 'tct-step-badge ktx' }, T.ttStepKtx || '3단계 KTX'),
          h('strong', null, `${bm.ktx.dep} ${bm.ktx.train}`),
          h('span', { class: 'tct-highlight' }, `${state.lang === 'en' ? `Arrives Pangyo ${bm.arrPangyo} (~50m)` : state.lang === 'zh' ? `到达板桥站 ${bm.arrPangyo} (约50分)` : state.lang === 'ja' ? `板橋駅 ${bm.arrPangyo} 到着 (約50分)` : `판교역 ${bm.arrPangyo} 도착 (약 50분 소요)`}`)
        )
      );
    } else if (selectedDest === 'commuter' && rec.bestMatch) {
      const bm = rec.bestMatch;
      scheduleContent = h('div', { class: 'tc-transit-detail' },
        h('div', { class: 'tct-step-row is-target' },
          h('span', { class: 'tct-step-badge commuter' }, T.ttStepRide || '직통 탑승'),
          h('strong', null, `${bm.shuttleDep} ${bm.destName}`),
          h('span', { class: 'tct-sub' }, `(${bm.spot} · ${bm.note})`)
        ),
        h('div', { class: 'tct-route-flow' },
          state.lang === 'en' ? 'Main Stadium ➔ Direct to Seoul / Suwon / Ilsan / Bucheon'
            : state.lang === 'zh' ? '大运动场前 ➔ 直达 首尔 / 水原 / 一山 / 富川'
            : state.lang === 'ja' ? '大運動場前 ➔ ソウル / 水原 / 一山 / 富川 直通'
            : '대운동장 앞 ➔ 서울 / 수원 / 일산 / 부천 직통 운행'
        )
      );
    } else if (rec.type === 'terminal' && rec.bestMatch) {
      const bm = rec.bestMatch;
      scheduleContent = h('div', { class: 'tc-transit-detail' },
        h('div', { class: 'tct-step-row' },
          h('span', { class: 'tct-step-badge' }, T.ttStepShuttle || '1단계 셔틀'),
          h('strong', null, `${bm.shuttleDep} ${T.ttMainStadiumShuttle || '대운동장 셔틀'}`),
          h('span', { class: 'tct-sub' }, `(${state.lang === 'en' ? `Arrives Terminal ${bm.termArrive}` : state.lang === 'zh' ? `${bm.termArrive} 到达客运站` : state.lang === 'ja' ? `ターミナル ${bm.termArrive} 到着` : `충주터미널 ${bm.termArrive} 도착`})`)
        ),
        h('div', { class: 'tct-step-row is-target' },
          h('span', { class: 'tct-step-badge bus' }, T.ttStepBus || '2단계 시외버스'),
          h('strong', null, `${bm.estBusTime} ${bm.busInfo.dest}`),
          h('span', { class: 'tct-highlight' }, T.ttBusMetaFmt ? T.ttBusMetaFmt(bm.busInfo.intervalMin, bm.busInfo.fare) : `배차 ${bm.busInfo.intervalMin}분 간격 · 요금 ${bm.busInfo.fare}`)
        )
      );
    } else if (rec.bestMatch) {
      const bm = rec.bestMatch;
      scheduleContent = h('div', { class: 'tc-transit-detail' },
        h('div', { class: 'tct-step-row is-target' },
          h('span', { class: 'tct-step-badge shuttle' }, T.ttStepRide || '탑승 추천'),
          h('strong', null, `${bm.shuttleDep} ${state.lang === 'en' ? 'Shuttle Bus Departs' : state.lang === 'zh' ? '校车发车 (大运动场)' : state.lang === 'ja' ? 'シャトルバス出発 (大運動場)' : '셔틀버스 출발 (대운동장)'}`),
          h('span', { class: 'tct-sub' }, `${state.lang === 'en' ? `Walk ${rec.walkMin}m` : state.lang === 'zh' ? `步行约${rec.walkMin}分钟` : state.lang === 'ja' ? `徒歩約${rec.walkMin}分` : `도보 ${rec.walkMin}분 소요`}`)
        ),
        h('div', { class: 'tct-route-flow' },
          `${state.lang === 'en' ? 'Main Stadium' : state.lang === 'zh' ? '大运动场' : state.lang === 'ja' ? '大運動場' : '대운동장'}(${bm.shuttleDep}) ➔ ${state.lang === 'en' ? 'Terminal' : state.lang === 'zh' ? '客运站' : state.lang === 'ja' ? 'ターミナル' : '충주터미널'}(${bm.termArrive}) ➔ ${state.lang === 'en' ? 'Chungju Sta.' : state.lang === 'zh' ? '忠州站' : state.lang === 'ja' ? '忠州駅' : '충주역'}(${bm.stationArrive})`
        )
      );
    } else {
      scheduleContent = h('p', { class: 'muted fine' }, rec.tips || '오늘 남은 셔틀버스 운행이 종료되었습니다.');
    }

    const upcomingList = (rec.upcoming && rec.upcoming.length > 1)
      ? h('div', { class: 'tct-upcoming-row' },
          h('span', { class: 'tct-up-label' }, (T.ttNextShuttlesLabel || '이후 셔틀') + ':'),
          ...rec.upcoming.slice(1, 4).map((sh) => h('span', { class: 'tct-up-pill' }, sh.dep))
        )
      : null;

    const walkBadge = rec.walkMin && rec.arriveStop && T.ttWalkToStopBadge
      ? h('span', { class: 'tct-walk-badge' }, T.ttWalkToStopBadge(rec.walkMin, rec.arriveStop))
      : null;

    return h('div', { class: 'tc-transit-box' },
      h('div', { class: 'tc-transit-header' },
        h('div', { class: 'tct-title-group' },
          h('span', { class: 'tct-icon' }, '🚌'),
          h('div', null,
            h('strong', { class: 'tct-title' }, T.ttTransitTitle || '시간표 연동 하교 & 귀가 알리미'),
            h('span', { class: 'tct-subtitle' }, T.ttTransitSubtitle ? T.ttTransitSubtitle(localizedClassName, lastClass.end, localizedBldg) : `오늘 마지막 수업: ${localizedClassName} (${lastClass.end} 종료 · ${localizedBldg})`)
          )
        ),
        walkBadge
      ),
      h('div', { class: 'tc-transit-dest-chips' }, destChips),
      scheduleContent,
      upcomingList,
      h('p', { class: 'tc-transit-tips' }, `💡 ${rec.tips}`)
    );
  }

  // 오늘 내 수업: 시간표를 넣었으면 오늘 수업을 시간순으로, 수업 사이 빈 시간(공강)과 함께 보여 준다
  function todayClassCard() {
    const tt = state.timetable;
    const T = t();
    if (!tt.length) {
      return h('section', { class: 'home-card today-classes today-classes-empty' },
        h('div', { class: 'tc-empty-box' },
          h('span', { class: 'tc-empty-icon' }, '📅'),
          h('div', { class: 'tc-empty-text' },
            h('strong', null, T.setupTimetable || '이번 학기 시간표 넣기'),
            h('p', null, T.emptyTimetableHint || '시간표를 등록하면 오늘 수업 시간, 강의실, 공강 알림을 홈에서 바로 볼 수 있어요.')
          ),
          h('button', { type: 'button', class: 'btn small primary', onclick: () => { location.hash = '#/timetable'; setTab('timetable', true); } }, T.addTimetable || '시간표 등록 ↗')
        )
      );
    }
    const dow = now.getDay();
    const cur = now.getHours() * 60 + now.getMinutes();
    const byStart = (a, b) => toMin(a.start) - toMin(b.start);
    const today = tt.filter((c) => c.day === dow && !c.elearn && c.start).sort(byStart);
    const rows = [];
    let nextMarked = false;
    today.forEach((c, i) => {
      const s = toMin(c.start);
      const e = toMin(c.end);
      if (i > 0) {
        const prev = today[i - 1];
        const gap = s - toMin(prev.end);
        if (gap >= 30) {
          rows.push(h('li', { class: 'home-row tc-gap' }, T.freeGap(prev.end, c.start)));
        } else if (gap > 0 && gap <= 20) {
          // [1순위: 연강 이동 동선 & 헐떡고개 10분 컷 판독기]
          const CR = (typeof window !== 'undefined' && window.GongjiCampusRoute) || root.GongjiCampusRoute;
          if (CR && CR.calculateRoute) {
            const route = CR.calculateRoute(prev.room, c.room, gap, state.lang);
            rows.push(renderConsecutiveRouteItem(prev, c, route, gap));
          }
        }
      }
      const st = cur >= e ? 'done' : cur >= s ? 'now' : (!nextMarked ? 'next' : '');
      if (st === 'next' || st === 'now') nextMarked = true;
      const prof = c.prof || c.p || '';
      const DI18n = (typeof window !== 'undefined' && window.GongjiDeptI18n) || root.GongjiDeptI18n;
      const CR = (typeof window !== 'undefined' && window.GongjiCampusRoute) || root.GongjiCampusRoute;
      const courseTitle = (DI18n && DI18n.formatCourse) ? DI18n.formatCourse(c.name, state.lang) : (c.name || T.classFallback);
      const roomFormatted = (CR && CR.formatRoom) ? CR.formatRoom(c.room, state.lang) : (c.room || '');
      const profText = prof ? (state.lang === 'en' ? `Prof. ${prof}` : state.lang === 'ja' || state.lang === 'zh' ? `${prof} 教授` : `${prof} 교수`) : '';
      const meta = [profText, roomFormatted].filter(Boolean).join(' · ');
      rows.push(h('li', { class: 'home-row tc-row' + (st ? ' ' + st : '') },
        h('span', { class: 'tc-time' }, `${c.start}–${c.end}`),
        h('span', { class: 'tc-name' }, courseTitle, meta ? h('small', null, meta) : null),
        st === 'now' ? h('span', { class: 'tc-badge now' }, T.classNow) : st === 'next' ? h('span', { class: 'tc-badge' }, T.classNext) : null));
    });
    // 오늘 남은 수업이 없으면 다음 수업이 언제인지 알려 준다
    let foot = '';
    const DI18n = (typeof window !== 'undefined' && window.GongjiDeptI18n) || root.GongjiDeptI18n;
    const CR = (typeof window !== 'undefined' && window.GongjiCampusRoute) || root.GongjiCampusRoute;
    if (!today.some((c) => toMin(c.end) > cur)) {
      for (let i = 1; i <= 7 && !foot; i++) {
        const d = (dow + i) % 7;
        const first = tt.filter((c) => c.day === d && !c.elearn && c.start).sort(byStart)[0];
        if (first) {
          const fn = (DI18n && DI18n.formatCourse) ? DI18n.formatCourse(first.name, state.lang) : (first.name || T.classFallback);
          foot = T.nextClass(dayName(d), first.start, fn);
        }
      }
    }
    const elearn = tt.filter((c) => c.elearn || c.m === 'elearn' || !c.start);
    let elearnNote = null;
    if (elearn.length) {
      const names = elearn.map((ec) => ((DI18n && DI18n.formatCourse) ? DI18n.formatCourse(ec.name, state.lang) : ec.name) || T.classFallback).join(' · ');
      const labelText = state.lang === 'en' ? `💻 E-learning (${elearn.length})`
        : state.lang === 'zh' ? `💻 网课 (${elearn.length})`
        : state.lang === 'ja' ? `💻 eラーニング (${elearn.length})`
        : `💻 이러닝 (${elearn.length})`;

      elearnNote = h('button', {
        type: 'button',
        class: 'tc-elearn-bar',
        title: `${labelText}: ${names} (${T.seeTimetable || '시간표 보기'})`,
        onclick: () => { location.hash = '#/timetable'; setTab('timetable', true); }
      },
        h('span', { class: 'tc-elearn-label' }, labelText),
        h('span', { class: 'tc-elearn-names' }, names),
        h('span', { class: 'tc-elearn-arrow' }, '↗')
      );
    }

    // 실시간 라이브 브리핑 배너 (진행 중 / 다음 수업)
    let liveBanner = null;
    const ongoing = today.find((c) => {
      const s = toMin(c.start);
      const e = toMin(c.end);
      return cur >= s && cur < e;
    });
    const upcoming = today.find((c) => toMin(c.start) > cur);

    if (ongoing) {
      const remMin = toMin(ongoing.end) - cur;
      const op = ongoing.prof || ongoing.p || '';
      const onName = (DI18n && DI18n.formatCourse) ? DI18n.formatCourse(ongoing.name, state.lang) : ongoing.name;
      const onRoom = (CR && CR.formatRoom) ? CR.formatRoom(ongoing.room, state.lang) : (ongoing.room || (state.lang === 'en' ? 'Classroom TBA' : state.lang === 'zh' ? '教室待定' : state.lang === 'ja' ? '教室未定' : '강의실 미지정'));
      const remStr = state.lang === 'en' ? `${remMin}m left`
        : state.lang === 'zh' ? `剩余 ${remMin}分钟`
        : state.lang === 'ja' ? `残り ${remMin}分`
        : `${remMin}분 남음`;
      const curClassTitle = state.lang === 'en' ? `In Class (${remStr})`
        : state.lang === 'zh' ? `正在上课 (${remStr})`
        : state.lang === 'ja' ? `授業中 (${remStr})`
        : `지금 수업 중 (${remStr})`;
      const profOpText = op ? ` (${T.ttProfTitle ? T.ttProfTitle(op) : `${op} 교수`})` : '';
      liveBanner = h('div', { class: 'tc-live-banner is-ongoing' },
        h('span', { class: 'tcl-pulse-dot red' }),
        h('div', { class: 'tcl-info' },
          h('strong', { class: 'tcl-title' }, curClassTitle),
          h('span', { class: 'tcl-sub' }, `${onName} · ${onRoom}${profOpText}`)
        )
      );
    } else if (upcoming) {
      const waitMin = toMin(upcoming.start) - cur;
      const up = upcoming.prof || upcoming.p || '';
      const hWait = Math.floor(waitMin / 60);
      const mWait = waitMin % 60;
      const waitStr = T.ttWaitTime ? T.ttWaitTime(hWait, mWait) : (hWait > 0 ? `${hWait}시간 ${mWait}분 전` : `${mWait}분 전`);
      const nextTitle = T.ttNextClassLive ? T.ttNextClassLive(waitStr) : `다음 수업 (시작 ${waitStr})`;
      const upName = (DI18n && DI18n.formatCourse) ? DI18n.formatCourse(upcoming.name, state.lang) : upcoming.name;
      const upRoom = (CR && CR.formatRoom) ? CR.formatRoom(upcoming.room, state.lang) : (upcoming.room || (state.lang === 'en' ? 'Classroom TBA' : state.lang === 'zh' ? '教室待定' : state.lang === 'ja' ? '教室未定' : '강의실 미지정'));
      const profUpText = up ? ` (${T.ttProfTitle ? T.ttProfTitle(up) : `${up} 교수`})` : '';
      liveBanner = h('div', { class: 'tc-live-banner is-upcoming' },
        h('span', { class: 'tcl-pulse-dot green' }),
        h('div', { class: 'tcl-info' },
          h('strong', { class: 'tcl-title' }, nextTitle),
          h('span', { class: 'tcl-sub' }, `${upName} (${upcoming.start}) · ${upRoom}${profUpText}`)
        )
      );
    }

    const restingCard = h('div', { class: 'tc-resting-card' },
      h('span', { class: 'tc-resting-icon' }, '☕'),
      h('div', { class: 'tc-resting-info' },
        h('strong', { class: 'tc-resting-title' }, T.todayNoClass || '오늘은 오프라인 수업이 없는 날이에요'),
        h('p', { class: 'tc-resting-sub' }, foot || '과제나 관심 공지를 정리하기 좋은 여유로운 날이에요.')
      )
    );

    const header = h('header', { class: 'sec-head tc-head' },
      h('div', { class: 'tc-title-wrap' },
        h('h3', null, T.todayClasses),
        today.length ? h('span', { class: 'group-count' }, ` ${today.length}`) : null
      ),
      h('div', { class: 'sec-tools' },
        h('button', {
          type: 'button',
          class: 'link-btn tc-header-link',
          title: T.seeTimetable || '시간표 보기',
          onclick: () => { location.hash = '#/timetable'; setTab('timetable', true); }
        }, h('span', null, T.seeTimetable || '시간표 보기'), h('span', { class: 'tc-link-arrow' }, '↗'))
      )
    );

    return h('section', { class: 'home-card today-classes' },
      header,
      liveBanner,
      today.length ? h('ul', { class: 'home-list' }, rows) : restingCard,
      today.length ? renderTransitAssistantCard(today) : null,
      (today.length && foot) ? h('p', { class: 'fine' }, foot) : null,
      elearnNote ? h('div', { class: 'tc-elearn-wrap' }, elearnNote) : null);
  }

  // ---------- 오늘 (홈): 큰 헤드라인 + 위젯 격자 (애플 위젯·토스 홈 방식) ----------
  let homeAnimated = false;                              // 처음 한 번만 순서대로 떠오르며 나타남
  let cdTimer = null;                                    // 마감 카운트다운을 30초마다 고침
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clock = () => (demoDate ? now : new Date());

  // 숫자가 0 에서 값까지 올라가는 효과 (토스식). 움직임 줄이기 설정이면 바로 값
  function countUp(rootEl) {
    if (reduceMotion()) return;
    rootEl.querySelectorAll('[data-count]').forEach((el) => {
      const to = Number(el.dataset.count);
      if (!Number.isFinite(to) || to <= 0) return;
      const t0 = performance.now();
      const dur = Math.min(900, 380 + to * 18);
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(step);
      };
      el.textContent = '0';
      requestAnimationFrame(step);
    });
  }

  function heroCopy(s) {
    const T = t();
    const hr = clock().getHours();
    const part = hr < 5 ? 'night' : hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : hr < 23 ? 'evening' : 'night';
    const date = new Intl.DateTimeFormat({ ko: 'ko-KR', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP' }[state.lang] || 'ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(now);
    return { kicker: `${date} · ${T.heroGreeting[part]}`, title: s.today.length || s.soon.length ? T.heroTitle(s.today.length, s.soon.length) : T.heroTitleCalm(s.fresh.length) };
  }

  // 남은 시간: 하루 안이면 'N시간 M분', 아니면 'D-N'
  function countdownText(deadline) {
    const T = t();
    const ms = L.parseLocal(deadline).getTime() - clock().getTime();
    if (ms <= 0) return T.closed;
    const mins = Math.floor(ms / 60000);
    if (mins < 24 * 60) return T.cdLeft(Math.floor(mins / 60), mins % 60);
    return T.cdDays(L.daysLeft(deadline, clock()));
  }

  // 졸업까지: 이수 내역의 진행률을 원으로
  function widgetGrad() {
    if (!planUI) return null;
    const T = t();
    const g = planUI.progress();
    const go = () => { planUI.setSub('history'); location.hash = '#/timetable'; setTab('timetable', true); };
    const has = g.count > 0 && g.total;
    const pct = has ? Math.min(100, Math.round((g.done / g.total) * 100)) : 0;
    const r = 42;
    const c = 2 * Math.PI * r;
    const ringEl = h('div', { class: 'ring', role: 'img', 'aria-label': `${pct}%` });
    ringEl.innerHTML = `<svg viewBox="0 0 100 100"><circle class="ring-bg" cx="50" cy="50" r="${r}"/><circle class="ring-fg" cx="50" cy="50" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(reduceMotion() || homeAnimated ? c * (1 - pct / 100) : c).toFixed(1)}"/></svg><span>${has ? pct + '%' : '—'}</span>`;
    if (!reduceMotion() && !homeAnimated) {
      const fg = ringEl.querySelector('.ring-fg');
      requestAnimationFrame(() => requestAnimationFrame(() => { fg.style.strokeDashoffset = String((c * (1 - pct / 100)).toFixed(1)); }));
    }
    let subText = null;
    if (has) {
      if (!g.left || !g.left.total) {
        subText = T.wGradDone;
      } else if (g.mode === 'transfer') {
        const majLeft = g.left.major || 0;
        const freeLeft = Math.max(0, g.left.total - majLeft);
        if (T.wGradTransferSub) {
          subText = T.wGradTransferSub(majLeft, freeLeft);
        } else if (state.lang === 'ja') {
          subText = majLeft > 0 && freeLeft > 0 ? `専攻 ${majLeft} · 自由 ${freeLeft}単位` : majLeft > 0 ? `専攻 ${majLeft}単位` : `自由 ${freeLeft}単位`;
        } else if (state.lang === 'en') {
          subText = majLeft > 0 && freeLeft > 0 ? `Major ${majLeft} · Free ${freeLeft} cr` : majLeft > 0 ? `Major ${majLeft} cr` : `Free ${freeLeft} cr`;
        } else if (state.lang === 'zh') {
          subText = majLeft > 0 && freeLeft > 0 ? `专业 ${majLeft} · 选修 ${freeLeft}学分` : majLeft > 0 ? `专业 ${majLeft}学分` : `选修 ${freeLeft}学分`;
        } else {
          subText = majLeft > 0 && freeLeft > 0 ? `전공 ${majLeft} · 자유 ${freeLeft}학점` : majLeft > 0 ? `전공 ${majLeft}학점` : `자유(교양·일선) ${freeLeft}학점`;
        }
      } else {
        subText = T.wGradSub(g.left.major || 0, g.left.general || 0);
      }
    }
    return h('section', { class: 'w w-grad' },
      h('button', { type: 'button', class: 'w-hit', onclick: go, 'aria-label': T.wGrad }),
      h('p', { class: 'w-label' }, T.wGrad),
      h('div', { class: 'grad-body' }, ringEl,
        h('div', null,
          has ? h('p', { class: 'grad-big' }, g.left.total ? T.wGradLeft(g.left.total) : T.wGradDone) : h('p', { class: 'grad-empty' }, T.wGradEmpty),
          subText ? h('p', { class: 'grad-sub' }, subText) : null)));
  }

  // 이번 주: 월~일 일곱 칸에 마감·행사·학사일정 점 (삼성 캘린더 주간 띠)
  function widgetWeek() {
    const T = t();
    const entries = C.collect(activeNotices(), { titleOf, calendar: window.GONGJI_CALENDAR, academicTitle: (it) => tr(it.title) });
    const base = L.startOfDay(now);
    const monday = L.addDays(base, -((base.getDay() + 6) % 7));
    const todayKey = X.ymd(now);
    const days = Array.from({ length: 7 }, (_, i) => L.addDays(monday, i));
    return h('section', { class: 'w w-week' },
      h('p', { class: 'w-label' }, T.wWeek),
      h('div', { class: 'week' }, days.map((d) => {
        const key = X.ymd(d);
        const es = entries.filter((e) => e.date === key);
        const cnt = (type) => es.filter((e) => e.type === type).length;
        const dl = cnt('deadline');
        return h('button', {
          type: 'button', class: 'wk' + (key === todayKey ? ' is-today' : '') + (d.getDay() === 0 ? ' sun' : d.getDay() === 6 ? ' sat' : ''),
          'aria-label': T.calCellAria(I.formatDate(d, state.lang), es.length),
          onclick: () => {
            state.cal = { year: d.getFullYear(), month0: d.getMonth(), sel: key };
            refreshCal();
            const cc = document.querySelector('.cal-card');
            if (cc) cc.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
          }
        },
        h('span', { class: 'wk-dow' }, dayName(d.getDay())),
        h('span', { class: 'wk-num' }, String(d.getDate())),
        h('span', { class: 'wk-dots', 'aria-hidden': 'true' },
          dl ? h('i', { class: 'dot deadline' }) : null, cnt('event') ? h('i', { class: 'dot event' }) : null, cnt('academic') ? h('i', { class: 'dot academic' }) : null),
        dl ? h('span', { class: 'wk-count' }, String(dl)) : null);
      })));
  }

  // 시작하기 스마트 팁: 처음 쓰는 사람에게 다음 맞춤 설정을 한 줄 카드로 안내 (✕ 닫기 가능)
  function setupStrip() {
    if (store.get('setupDismissed')) return null;
    const T = t();
    const hist = planUI ? planUI.progress().count > 0 : true;
    const steps = [
      { id: 'tt', done: state.timetable.length > 0, label: T.setupTimetable, desc: '시간표를 넣으면 수업과 안 겹치는 공지를 쏙 골라요', run: () => { if (planUI) planUI.setSub('week'); location.hash = '#/timetable'; setTab('timetable', true); if (window.matchMedia('(min-width: 900px)').matches) openClassDialog(); } },
      { id: 'profile', done: state.profile.set, label: T.setupProfile, desc: '내 학년·학과를 넣으면 맞춤 장학 공지를 바로 보여드려요', run: goProfile },
      { id: 'history', done: hist, label: T.setupHistory, desc: '지금까지 들은 과목을 넣으면 졸업까지 남은 학점을 계산해요', run: () => { if (planUI) planUI.setSub('history'); location.hash = '#/timetable'; setTab('timetable', true); } },
      { id: 'interests', done: state.interests.length > 0 || state.keywords.length > 0, label: T.setupInterests, desc: '관심 분야를 등록하면 새 공지 알림을 받아요', run: () => { location.hash = '#/settings'; setTab('settings', true); } }
    ];
    const done = steps.filter((x) => x.done).length;
    if (done === steps.length) return null;
    const nextStep = steps.find((x) => !x.done) || steps[0];

    const dismiss = () => {
      store.set('setupDismissed', true);
      renderHome();
    };

    return h('aside', { class: 'setup-suggestion-card', 'aria-label': T.wSetup },
      h('div', { class: 'sug-left' },
        h('span', { class: 'sug-icon', 'aria-hidden': 'true' }, '✨'),
        h('div', { class: 'sug-text' },
          h('div', { class: 'sug-tag-row' },
            h('span', { class: 'sug-badge' }, '스마트 추천'),
            h('span', { class: 'sug-count' }, `${done}/${steps.length} 완료`)
          ),
          h('p', { class: 'sug-msg' }, h('strong', null, nextStep.label), ` · ${nextStep.desc}`)
        )
      ),
      h('div', { class: 'sug-actions' },
        h('button', { type: 'button', class: 'sug-btn', onclick: nextStep.run }, '설정하기 →'),
        h('button', { type: 'button', class: 'sug-close', onclick: dismiss, 'aria-label': '추천 닫기' }, '✕')
      )
    );
  }

  // 오늘의 브리핑: 숫자 하나와 한 줄 설명으로 '지금 볼 것'을 네 칸에 (토스 리포트·애플 요약처럼). 모두 규칙으로 계산
  function nextAcademic() {
    const today = L.startOfDay(now);
    for (const x of upcomingCalendar(12)) {
      const st = L.parseLocal(x.start);
      const en = L.parseLocal(x.end);
      if (!st || !en) continue;
      if (st <= today && en >= today) return { item: x, days: 0, ongoing: true };
      if (st > today) return { item: x, days: Math.round((st - today) / 86400000), ongoing: false };
    }
    return null;
  }
  function briefing(s) {
    const T = t();
    const out = [];
    const fitOk = (n) => !state.profile.set || fitStatus(n) !== 'no';
    out.push({
      k: 'today', big: String(s.today.length), unit: T.unitCount, label: T.bfToday,
      sub: s.today.length && state.profile.set ? T.bfTodayFit(s.today.filter(fitOk).length) : T.bfSoon(s.soon.length),
      go: () => goList({ due: s.today.length ? 'today' : 'soon', sort: 'deadline' }), hot: s.today.length > 0
    });
    const week = activeNotices().filter((n) => n.deadline && !L.isExpired(n, now) && L.daysLeft(n.deadline, now) <= 7 && fitOk(n));
    const money = week.map((n) => ({ n, won: (n.benefit && (n.benefit.won || 0)) || 0 })).filter((x) => x.won > 0).sort((a, b) => b.won - a.won)[0];
    if (money) out.push({ k: 'money', big: I.formatWon(money.won, state.lang), label: T.bfMoney, sub: titleOf(money.n), go: () => openDetail(money.n.id) });
    const pts = week.filter((n) => n.benefit && n.benefit.points > 0);
    if (pts.length) out.push({ k: 'points', big: String(pts.reduce((a, n) => a + n.benefit.points, 0)), unit: 'P', label: T.bfPoints, sub: T.bfPointsSub(pts.length), go: () => goList({ sub: 'dadream', sort: 'deadline' }) });
    const ac = nextAcademic();
    if (ac) out.push({ k: 'acad', big: ac.ongoing ? T.bfOngoing : `D-${ac.days}`, label: tr(ac.item.title), sub: `${I.formatDate(L.parseLocal(ac.item.start), state.lang)}${ac.item.end !== ac.item.start ? ' ~' : ''}`, go: () => { const cc = document.querySelector('.cal-card'); if (cc) cc.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' }); } });
    if (K) {
      const sum = K.summary(K.columns(DATA.notices, { track: state.track, saved: state.saved, applied: state.applied }, now), now);
      if (sum.interest + sum.prep + sum.done) out.push({ k: 'board', big: String(sum.prep), unit: T.unitCount, label: T.bfBoard, sub: T.bfBoardSub(sum), go: () => { location.hash = '#/track'; setTab('track', true); } });
    }
    if (state.timetable.length) {
      const clash = activeNotices().filter((n) => !L.isExpired(n, now) && L.findConflicts(n, state.timetable).length).length;
      if (clash) out.push({ k: 'clash', big: String(clash), unit: T.unitCount, label: T.bfClash, sub: T.bfClashSub, go: () => goList({ status: 'open' }) });
    }
    return out.slice(0, 4);
  }
  function briefingRow(s) {
    const T = t();
    const items = briefing(s);
    if (!items.length) return null;
    const icons = {
      today: '🚨',
      money: '💰',
      points: '💎',
      acad: '📅',
      board: '📋',
      clash: '⚠️'
    };
    return h('section', { class: 'brief', 'aria-label': T.bfTitle },
      h('h3', { class: 'visually-hidden' }, T.bfTitle),
      h('ul', null, items.map((x) => h('li', { class: 'bf bf-' + x.k + (x.hot ? ' is-hot' : '') },
        h('button', { type: 'button', onclick: x.go, 'aria-label': `${x.label}: ${x.big}${x.unit || ''}` },
          h('div', { class: 'bf-head' },
            h('span', { class: 'bf-pill' },
              h('span', { class: 'bf-icon', 'aria-hidden': 'true' }, icons[x.k] || '📌'),
              h('span', { class: 'bf-label' }, x.label)
            ),
            h('span', { class: 'bf-arrow', 'aria-hidden': 'true' }, '↗')
          ),
          h('div', { class: 'bf-value-wrap' },
            h('span', { class: 'bf-big' },
              /^\d+$/.test(x.big) ? h('span', { 'data-count': x.big }, x.big) : x.big,
              x.unit ? h('small', null, x.unit) : null
            )
          ),
          h('span', { class: 'bf-sub' }, x.sub)
        )
      )))
    );
  }

  // 가로 스크롤 영역 마우스 드래그 & 휠 스크롤 지원 (티켓·타임라인 등)
  function enableDragScroll(el) {
    if (!el) return;
    let isDown = false;
    let startX = 0;
    let scrollStart = 0;
    let hasMoved = false;

    const onMouseMove = (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      if (!hasMoved && Math.abs(dx) > 4) {
        hasMoved = true;
        el.classList.add('is-dragging');
      }
      if (hasMoved) {
        el.scrollLeft = scrollStart - dx;
      }
    };

    const onMouseUp = () => {
      if (!isDown) return;
      isDown = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.classList.remove('is-dragging');
      if (hasMoved) {
        const preventClick = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        el.addEventListener('click', preventClick, { capture: true, once: true });
        setTimeout(() => el.removeEventListener('click', preventClick, { capture: true }), 150);
      }
    };

    // 마우스 드래그 지원 (데스크톱)
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDown = true;
      hasMoved = false;
      startX = e.clientX;
      scrollStart = el.scrollLeft;
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    // 모바일 터치 제스처: 스와이프 도중 공지 클릭 오동작 방지 + 네이티브 가로 스크롤 보장
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoved = false;
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      touchMoved = false;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (touchMoved || e.touches.length !== 1) return;
      const dx = Math.abs(e.touches[0].clientX - touchStartX);
      const dy = Math.abs(e.touches[0].clientY - touchStartY);
      if (dx > 8 && dx > dy) {
        touchMoved = true;
      }
    }, { passive: true });

    el.addEventListener('touchend', () => {
      if (touchMoved) {
        const preventClick = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        el.addEventListener('click', preventClick, { capture: true, once: true });
        setTimeout(() => el.removeEventListener('click', preventClick, { capture: true }), 180);
      }
    }, { passive: true });

    el.addEventListener('wheel', (e) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }

  // 마감 티켓: 통합 스마트 마감 허브 (티켓 레일 + 주간 요일 뷰 + 요일 퀵 필터)
  function ticketStrip() {
    const T = t();
    const fitOk = (n) => !state.profile.set || fitStatus(n) !== 'no';
    const list = activeNotices().filter((n) => n.deadline && !L.isExpired(n, now) && fitOk(n))
      .sort((a, b) => L.parseLocal(a.deadline) - L.parseLocal(b.deadline)).slice(0, 18);
    if (!list.length) return null;
    const ids = list.map((n) => n.id);

    // 뷰 모드 ('rail' | 'week', 기본값 'rail')
    let viewMode = store.get('ticketViewMode', 'rail');

    // 다국어 라벨 매핑
    const lang = state.lang || 'ko';
    const i18nLabels = {
      viewRail: lang === 'en' ? '🎫 Tickets' : lang === 'zh' ? '🎫 票券' : lang === 'ja' ? '🎫 チケット' : '🎫 티켓',
      viewWeek: lang === 'en' ? '📅 By Day' : lang === 'zh' ? '📅 按星期' : lang === 'ja' ? '📅 曜日別' : '📅 요일별',
      all: lang === 'en' ? 'All' : lang === 'zh' ? '全部' : lang === 'ja' ? 'すべて' : '전체',
      noDue: lang === 'en' ? 'No deadlines' : lang === 'zh' ? '无截止' : lang === 'ja' ? '締切なし' : '마감 없음'
    };

    // 날짜별 그룹핑 (오늘부터 7일)
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const dayList = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayItems = list.filter((n) => n.deadline && n.deadline.startsWith(dayKey));
      dayList.push({ date: d, key: dayKey, items: dayItems, isToday: i === 0 });
    }

    // [1] 티켓 레일
    const rail = h('div', { class: 'tickets' + (viewMode === 'rail' ? '' : ' is-hidden'), tabindex: '-1' }, list.map((n) => {
      const d = L.parseLocal(n.deadline);
      const left = L.daysLeft(n.deadline, now);
      const sub = L.classifyBenefit(n).subs[0];
      const dayKey = n.deadline ? n.deadline.slice(0, 10) : '';
      return h('button', {
        type: 'button',
        class: 'ticket' + (left <= 1 ? ' is-hot' : '') + (left === 0 ? ' is-today' : '') + (isSaved(n.id) ? ' is-saved' : ''),
        'data-day': dayKey,
        'data-id': n.id,
        'aria-haspopup': 'dialog',
        onclick: () => openDetail(n.id, false, ids)
      },
        h('span', { class: 'tk-stub' },
          h('strong', null, left === 0 ? T.dueToday : `D-${left}`),
          h('small', null, `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')} ${dayName(d.getDay())}`),
          left === 0 ? h('small', { class: 'tk-time is-live', 'data-deadline': n.deadline }, countdownText(n.deadline))
            : h('small', { class: 'tk-time' }, `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)),
        h('span', { class: 'tk-body' },
          h('span', { class: 'tk-meta' }, isSaved(n.id) ? h('span', { class: 'tk-saved' }, '★ ' + T.savedNotice) : catLabel(n.category)),
          h('span', { class: 'tk-title' }, titleOf(n)),
          sub ? subTag(n, sub) : null));
    }));
    enableDragScroll(rail);

    // [2] 주간 요일 뷰 (Week Calendar Deck)
    const weekDeck = h('div', { class: 'ticket-week-deck' + (viewMode === 'week' ? '' : ' is-hidden'), tabindex: '-1' },
      dayList.map((dayObj) => {
        const d = dayObj.date;
        const mm = d.getMonth() + 1;
        const dd = String(d.getDate()).padStart(2, '0');
        const dow = dayName(d.getDay());
        return h('div', { class: 'twd-col' + (dayObj.isToday ? ' is-today' : '') + (dayObj.items.length ? '' : ' is-empty'), 'data-day': dayObj.key },
          h('div', { class: 'twd-col-head' },
            h('span', { class: 'twd-col-dow' }, dow),
            h('span', { class: 'twd-col-date' }, `${mm}.${dd}`),
            dayObj.isToday ? h('span', { class: 'twd-today-badge' }, T.dueToday || '오늘') : null,
            dayObj.items.length ? h('span', { class: 'twd-cnt-badge' }, `${dayObj.items.length}`) : null),
          h('div', { class: 'twd-col-body' },
            dayObj.items.length ? dayObj.items.map((n) => {
              const left = L.daysLeft(n.deadline, now);
              return h('button', {
                type: 'button',
                class: 'twd-card' + (left <= 1 ? ' is-urgent' : '') + (isSaved(n.id) ? ' is-saved' : ''),
                title: titleOf(n),
                onclick: () => openDetail(n.id, false, ids)
              },
                h('div', { class: 'twd-card-meta' },
                  h('span', { class: 'twd-card-cat' }, catLabel(n.category)),
                  h('span', { class: 'twd-card-dday' + (left === 0 ? ' is-urgent' : '') }, left === 0 ? T.dueToday : `D-${left}`)),
                h('div', { class: 'twd-card-title' }, titleOf(n)));
            }) : h('div', { class: 'twd-empty-slot' }, h('span', { class: 'twd-empty-icon' }, '☕'), h('span', null, i18nLabels.noDue))));
      }));
    enableDragScroll(weekDeck);

    // [3] 상단 요일 캡슐 필터 바 (Day Quick-Filter Strip)
    const dayChips = [];
    const allChip = h('button', {
      type: 'button',
      class: 'sdh-day-chip is-active',
      onclick: () => {
        dayChips.forEach(c => c.classList.remove('is-active'));
        allChip.classList.add('is-active');
        if (viewMode === 'rail') {
          rail.scrollTo({ left: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
        } else {
          weekDeck.scrollTo({ left: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
        }
      }
    }, h('span', null, i18nLabels.all), h('span', { class: 'sdh-chip-cnt' }, String(list.length)));

    const filterChips = dayList.map((dayObj) => {
      const d = dayObj.date;
      const mm = d.getMonth() + 1;
      const dd = d.getDate();
      const dow = dayName(d.getDay());
      const label = dayObj.isToday ? (lang === 'ko' ? `오늘 ${dd}` : `${dow} ${dd}`) : `${dow} ${dd}`;
      const chip = h('button', {
        type: 'button',
        class: 'sdh-day-chip' + (dayObj.isToday ? ' is-today-chip' : '') + (dayObj.items.length ? ' has-items' : ' no-items'),
        title: `${mm}.${dd} (${dow}) · ${dayObj.items.length}`,
        onclick: () => {
          dayChips.forEach(c => c.classList.remove('is-active'));
          allChip.classList.remove('is-active');
          chip.classList.add('is-active');

          if (viewMode === 'rail') {
            const firstTarget = rail.querySelector(`.ticket[data-day="${dayObj.key}"]`);
            if (firstTarget) {
              const offset = firstTarget.offsetLeft - rail.offsetLeft - 8;
              rail.scrollTo({ left: Math.max(0, offset), behavior: reduceMotion() ? 'auto' : 'smooth' });
              firstTarget.classList.add('is-focused-pulse');
              setTimeout(() => firstTarget.classList.remove('is-focused-pulse'), 1200);
            }
          } else {
            const targetCol = weekDeck.querySelector(`.twd-col[data-day="${dayObj.key}"]`);
            if (targetCol) {
              const offset = targetCol.offsetLeft - weekDeck.offsetLeft - 8;
              weekDeck.scrollTo({ left: Math.max(0, offset), behavior: reduceMotion() ? 'auto' : 'smooth' });
              targetCol.classList.add('is-focused-pulse');
              setTimeout(() => targetCol.classList.remove('is-focused-pulse'), 1200);
            }
          }
        }
      },
        h('span', null, label),
        dayObj.items.length ? h('span', { class: 'sdh-chip-cnt' }, String(dayObj.items.length)) : null);
      dayChips.push(chip);
      return chip;
    });

    const dayStrip = h('div', { class: 'sdh-day-strip' }, allChip, ...filterChips);

    // [4] 헤더 컨트롤 (뷰 스위처 + 슬라이드 버튼 + 전체보기)
    const btnRail = h('button', {
      type: 'button',
      class: 'sdh-view-btn' + (viewMode === 'rail' ? ' is-active' : ''),
      'aria-pressed': String(viewMode === 'rail'),
      onclick: () => setViewMode('rail')
    }, h('span', null, i18nLabels.viewRail));

    const btnWeek = h('button', {
      type: 'button',
      class: 'sdh-view-btn' + (viewMode === 'week' ? ' is-active' : ''),
      'aria-pressed': String(viewMode === 'week'),
      onclick: () => setViewMode('week')
    }, h('span', null, i18nLabels.viewWeek));

    const switcher = h('div', { class: 'sdh-view-switcher', role: 'group' }, btnRail, btnWeek);

    const scroll = (dir) => {
      const target = viewMode === 'rail' ? rail : weekDeck;
      target.scrollBy({ left: dir * Math.max(280, target.clientWidth * 0.8), behavior: reduceMotion() ? 'auto' : 'smooth' });
    };

    const navBtns = h('div', { class: 'sdh-nav-btns' },
      h('button', { type: 'button', class: 'rail-btn', 'aria-label': T.calPrev, onclick: () => scroll(-1) }, '‹'),
      h('button', { type: 'button', class: 'rail-btn', 'aria-label': T.calNext, onclick: () => scroll(1) }, '›'));

    function setViewMode(mode) {
      viewMode = mode;
      store.set('ticketViewMode', mode);
      btnRail.classList.toggle('is-active', mode === 'rail');
      btnWeek.classList.toggle('is-active', mode === 'week');
      btnRail.setAttribute('aria-pressed', String(mode === 'rail'));
      btnWeek.setAttribute('aria-pressed', String(mode === 'week'));
      rail.classList.toggle('is-hidden', mode !== 'rail');
      weekDeck.classList.toggle('is-hidden', mode !== 'week');
    }

    return h('section', { class: 'sec sec-tickets smart-deadline-hub' },
      h('header', { class: 'sec-head sdh-head' },
        h('div', { class: 'sdh-title-row' },
          h('div', { class: 'sdh-title-group' },
            h('h3', null, T.secTickets),
            h('span', { class: 'sec-count' }, String(list.length))),
          h('button', { type: 'button', class: 'link-btn sdh-more-btn', onclick: () => goList({ due: 'soon', sort: 'deadline' }) }, T.homeMore)),
        h('div', { class: 'sec-tools sdh-tools' },
          switcher,
          navBtns)),
      dayStrip,
      rail,
      weekDeck);
  }

  // 편집형 섹션: 위에 굵은 선 + 제목 + '더 보기' (카드 상자 대신)
  function sec(cls, title, count, more, ...body) {
    return h('section', { class: 'sec ' + (cls || '') },
      h('header', { class: 'sec-head' }, h('h3', null, title), count !== null && count !== undefined ? h('span', { class: 'sec-count' }, String(count)) : null,
        more ? h('div', { class: 'sec-tools' }, h('button', { type: 'button', class: 'link-btn', onclick: more.run }, more.label)) : null),
      ...body);
  }
  function rows(items, limit, ids) {
    return h('ul', { class: 'home-list' }, items.slice(0, limit).map((n) => homeRow(n, ids || items.map((x) => x.id))));
  }
  function boardMini() {
    if (!K) return null;
    const T = t();
    const cols = K.columns(DATA.notices, { track: state.track, saved: state.saved, applied: state.applied }, now);
    const sum = K.summary(cols, now);
    const go = () => { location.hash = '#/track'; setTab('track', true); };
    if (!(sum.interest + sum.prep + sum.done + sum.result)) {
      return sec('sec-board is-empty-mini', T.boardTitle, null, { label: '보드 열기 ↗', run: go },
        h('div', { class: 'bm-empty-card', onclick: () => goList({ due: 'soon', sort: 'deadline' }) },
          h('span', { class: 'bm-empty-icon' }, '⭐'),
          h('div', { class: 'bm-empty-text' },
            h('strong', null, '챙길 공지를 보관해보세요'),
            h('p', null, '공지에서 ★를 누르면 관심 칸에 모이고 마감을 놓치지 않아요.')
          ),
          h('span', { class: 'bm-empty-badge' }, '공지 둘러보기 →')
        )
      );
    }
    return sec('sec-board', T.boardTitle, null, { label: T.homeMore, run: go },
      h('ol', { class: 'pipe' }, K.STAGES.map((st) => h('li', { class: 'pipe-' + st },
        h('button', { type: 'button', onclick: go }, h('strong', { 'data-count': String(cols[st].length) }, String(cols[st].length)), h('span', null, T.stage[st]))))),
      sum.dueWeek ? h('p', { class: 'fine' }, T.boardDueWeek(sum.dueWeek)) : null);
  }

  function renderHome() {
    const box = $('#home-body');
    if (!box) return;
    const T = t();
    const sOpts = { saved: state.saved, since, timetable: state.timetable, hideConflicts: state.hideConflicts };
    const s = X.summarize(activeNotices(), now, sOpts);                  // 지원 완료한 공지는 요약에서 뺀다
    const mineFresh = hasMine() ? s.fresh.filter((n) => mineOf(n).any) : [];
    const hero = heroCopy(s);
    const kick = $('#home-date');
    if (kick) kick.textContent = hero.kicker;
    $('#home-title').textContent = hero.title;

    // 이번 주 추천 (추천 보기에서 쓰는 시간·기간 설정 그대로)
    const rec = L.recommend(activeNotices(), state.budgetHours, {
      now, windowDays: state.budgetWindow, timetable: state.timetable, includeSelective: state.budgetSelective
    });
    const recIds = rec.chosen.map((it) => it.notice.id);
    const calItems = upcomingCalendar(4);
    const fmt = (d) => I.formatDate(L.parseLocal(d), state.lang);
    const classes = todayClassCard();
    if (classes) classes.className = 'sec sec-classes today-classes';
    const week = widgetWeek();
    if (week) week.className = 'sec sec-week';
    const grad = widgetGrad();
    if (grad) grad.className = 'sec sec-grad w-grad';

    const lists = [
      s.pinned.length ? sec('', T.homePinned, s.pinned.length, null, rows(s.pinned, 4)) : null,
      mineFresh.length ? sec('', T.homeMine, mineFresh.length, { label: T.homeMore, run: () => goList({ mineOnly: true, sort: 'latest' }) }, rows(mineFresh, 4)) : null,
      s.fresh.length ? sec('', T.homeNew, s.fresh.length, { label: T.homeMore, run: () => goList({ due: 'new', sort: 'latest' }) }, rows(s.fresh, 4)) : null,
      rec.chosen.length ? sec('', T.homePicks, null, { label: T.homeMore, run: () => { location.hash = '#/budget'; setTab('budget', true); } },
        h('ul', { class: 'home-list' }, rec.chosen.slice(0, 4).map((it) => homeRow(it.notice, recIds)))) : null,
      calItems.length ? sec('', T.calendarTitle, null, {
        label: T.homeMore || '전체 보기',
        run: () => {
          if (typeof window.openAcademicCalendarModal === 'function') {
            window.openAcademicCalendarModal();
          } else {
            location.hash = '#/calendar';
          }
        }
      }, h('ul', { class: 'home-list' }, calItems.map((x) => h('li', { class: 'home-row' },
        h('span', { class: 'cal-what' }, tr(x.title)),
        h('span', { class: 'home-meta cal-when' }, x.start === x.end ? fmt(x.start) : `${fmt(x.start)} ~ ${fmt(x.end)}`))))) : null
    ].filter(Boolean);

    // PC에서 카드 높이 차이로 인한 거대한 빈 공간(Dead Space)을 없애고
    // 모바일처럼 카드가 상하로 매끄럽게 연결(Masonry Flow)되도록 좌우 2개 컬럼으로 균형 분할
    let listContainer = null;
    if (lists.length === 1) {
      listContainer = h('div', { class: 'home-lists is-single' }, lists[0]);
    } else if (lists.length > 1) {
      const col1 = [];
      const col2 = [];
      lists.forEach((item, idx) => {
        item.style.setProperty('--card-idx', String(idx));
        if (idx % 2 === 0) col1.push(item);
        else col2.push(item);
      });
      listContainer = h('div', { class: 'home-lists' },
        h('div', { class: 'home-list-col' }, col1),
        h('div', { class: 'home-list-col' }, col2)
      );
    }

    const parts = [
      briefingRow(s),
      setupStrip(),
      h('div', { class: 'home-cols' },
        h('div', { class: 'home-col' }, classes, week),
        h('div', { class: 'home-col' }, grad, boardMini())),
      ticketStrip(),
      listContainer,
      calCard()
    ].filter(Boolean);
    const cc = parts.find((x) => x.classList && x.classList.contains('cal-card'));
    if (cc) cc.classList.add('sec');
    const wrap = h('div', { class: 'home-v5' + (homeAnimated || reduceMotion() ? '' : ' reveal') }, parts);
    [...wrap.children].forEach((el, i) => el.style.setProperty('--i', String(i)));
    fill(box, wrap);
    if (!homeAnimated) { countUp(wrap); homeAnimated = true; }
    const badge = $('#badge-home');
    const urgent = s.today.length + s.pinned.length;
    if (badge) { badge.hidden = !urgent; badge.textContent = String(urgent); }
    const tb = $('#badge-track');
    if (tb && K) {
      const sum = K.summary(K.columns(DATA.notices, { track: state.track, saved: state.saved, applied: state.applied }, now), now);
      tb.hidden = !sum.dueWeek; tb.textContent = String(sum.dueWeek);
    }
    // 오늘 마감 티켓의 남은 시간은 30초마다 글자만 고친다
    clearInterval(cdTimer);
    cdTimer = setInterval(() => {
      document.querySelectorAll('.tk-time[data-deadline]').forEach((el) => { el.textContent = countdownText(el.dataset.deadline); });
    }, 30000);
  }

  // 빠른 실행에 보일 항목: 검색어가 비면 이동·동작만, 있으면 공지·과목까지
  function paletteItems(q) {
    const T = t();
    const low = q.toLowerCase();
    const has = (...xs) => !q || xs.some((x) => String(x || '').toLowerCase().includes(low));
    const goTab = (tab, sub) => () => { if (sub && planUI) planUI.setSub(sub); location.hash = '#/' + tab; setTab(tab, true); };
    const nav = [
      { icon: 'home', label: T.tabHome, run: goTab('home') },
      { icon: 'doc', label: T.tabNotices, run: goTab('notices') },
      { icon: 'board', label: T.boardTitle, run: goTab('track') },
      { icon: 'cal', label: `${T.tabTimetable} · ${T.planTabWeek}`, run: goTab('timetable', 'week') },
      { icon: 'book', label: T.planTabHistory, run: goTab('timetable', 'history') },
      { icon: 'spark', label: T.planTabPlan, run: goTab('timetable', 'plan') },
      { icon: 'star', label: `${T.tabNotices} · ${T.nviewBudget}`, run: goTab('budget') },
      { icon: 'gear', label: T.tabSettings, run: goTab('settings') },
      { icon: 'star', label: T.palSaved, run: () => goList({ savedOnly: true, status: 'all' }) }
    ].filter((x) => has(x.label));
    const dark = TH && TH.effective() === 'dark';
    const acts = [
      TH ? { icon: 'moon', label: dark ? T.palLight : T.palDark, run: () => { TH.setTheme(dark ? 'light' : 'dark'); renderThemeButton(); } } : null,
      { icon: 'plus', label: T.palAddClass, run: () => { location.hash = '#/timetable'; setTab('timetable', true); if (planUI) planUI.setSub('week'); openClassDialog(); } },
      ...I.LANGS.filter((l) => l.code !== state.lang).map((l) => ({ icon: 'globe', label: T.palLang(l.name), run: () => { state.lang = l.code; store.set('lang', state.lang); renderAll(); } }))
    ].filter((x) => x && has(x.label, 'language', '언어', 'theme', '테마'));
    const out = [{ title: T.palGo, items: nav }, { title: T.palActions, items: acts }];
    if (q.length >= 1) {
      const hits = L.sortNotices(L.filterNotices(DATA.notices, { query: q, board: '', status: 'all', category: '' }, now), 'deadline', now).slice(0, 6);
      const ids = hits.map((n) => n.id);
      out.splice(0, 0, { title: T.palNotices, items: hits.map((n) => ({
        icon: 'doc', label: titleOf(n),
        sub: [n.deadline ? I.formatDate(L.parseLocal(n.deadline), state.lang) : '', catLabel(n.category)].filter(Boolean).join(' · '),
        run: () => openDetail(n.id, false, ids)
      })) });
      if (planUI) {
        out.push({ title: T.palCourses, items: planUI.findCourses(q, 4).map((c) => ({
          icon: 'book', label: c.name, sub: `${c.sub} · ${T.palPin}`,
          run: () => { location.hash = '#/timetable'; setTab('timetable', true); planUI.pin(c.key); }
        })) });
      }
    }
    return out;
  }

  function upcomingCalendar(limit) {
    const cal = window.GONGJI_CALENDAR;
    const today = L.startOfDay(now);
    return ((cal && cal.items) || []).filter((x) => {
      const e = L.parseLocal(x.end);
      return e && e >= today;
    }).slice(0, limit);
  }

  // ---------- 운영 안내 줄 · 보정표 ----------
  function renderBanner() {
    const el = $('#notice-banner');
    const text = ov.parsed.banner;
    el.hidden = !text || store.get('bannerClosed', '') === text;
    $('#notice-banner-text').textContent = text || '';
  }

  function applyOv() {
    const r = O.applyOverrides(RAW_NOTICES, ov.parsed);
    DATA.notices = r.notices;
    ov.applied = r.applied;
    ov.hidden = r.hidden;
    ov.unmatched = r.unmatched;
  }

  function renderOvStatus() {
    const el = $('#ov-status');
    if (!el) return;
    const have = ov.parsed.rules.length || ov.parsed.banner || ov.parsed.errors.length || ov.error;
    el.hidden = !have;
    if (!have) return;
    const bits = [t().overridesStatus(ov.applied + ov.hidden)];
    if (ov.parsed.errors.length) bits.push(`⚠ ${ov.parsed.errors.slice(0, 2).map((e) => `${e.line}: ${e.reason}`).join(' / ')}`);
    if (ov.unmatched.length) bits.push(`⚠ ${ov.unmatched.slice(0, 2).join(', ')}`);
    el.textContent = bits.join(' · ');
  }

  function setOverrideRows(rows, source) {
    ov.parsed = O.parseOverrides(rows);
    ov.source = source;
    ov.error = '';
    applyOv();
  }

  // 앱을 열 때와 새로 고칠 때: 설정한 주소(CFG.overridesUrl)나 서버의 data/overrides.json 에서 받아 온다. 실패하면 마지막으로 받은 표를 계속 쓴다
  async function loadOverrides() {
    if (!O) return;
    const cached = store.get('ovCache', null);
    const url = CFG.overridesUrl || '';
    if (cached && cached.url === url && Array.isArray(cached.rows) && !ov.parsed.rules.length && !ov.parsed.banner) {
      setOverrideRows(cached.rows, 'cache');
    }
    let r = { ok: false };
    if (url) r = await O.fetchRows(url);
    else if (/^https?:$/.test(location.protocol)) {
      r = await O.fetchRows({ url: (CFG.dataBase || 'data/').replace(/\/?$/, '/') + 'overrides.json', kind: 'other' });
      if (!r.ok) return;                           // 서버에 보정표가 없는 건 정상
    } else return;
    if (r.ok) {
      store.set('ovCache', { url, rows: r.rows, at: Date.now() });
      setOverrideRows(r.rows, url ? 'url' : 'server');
    } else if (url) {
      ov.error = r.error;
    }
    state.budgetResult = null;
    runBudget();
    renderAll();
  }

  // ---------- 첫 방문 안내 ----------
  function loadExampleTimetable() {
    state.timetable = EXAMPLE_TIMETABLE.map((c, i) => ({
      id: 'ex' + i, day: c.day, start: c.start, end: c.end, prof: c.prof || '', room: c.room || '', elearn: c.elearn || false, name: c.names[state.lang] || c.names.ko
    }));
    saveTimetable();
    timetableChanged();
    renderHome();
  }
  // 첫 화면 안내: 세 단계 (소개·언어 → 내 정보 → 관심 분야). 토스·애플 첫 실행 화면처럼 한 화면에 한 가지
  let wStep = 0;
  const brandMark = () => {
    const el = h('span', { class: 'mark-wrap', 'aria-hidden': 'true' });
    el.innerHTML = document.querySelector('.brand-mark') ? document.querySelector('.brand-mark').outerHTML.replace('brand-mark', 'w-mark') : '';
    return el;
  };
  function renderWelcome() {
    const T = t();
    const dots = h('div', { class: 'w-progress', 'aria-hidden': 'true' }, [0, 1, 2].map((i) => h('i', { class: i === wStep ? 'on' : i < wStep ? 'done' : '' })));
    let body;
    if (wStep === 0) {
      body = [
        h('div', { class: 'w-brand' }, brandMark(), h('span', null, '공지 ', h('em', null, '줍줍'))),
        h('h2', { id: 'welcome-title' }, T.welcomeTitle),
        h('p', { class: 'welcome-lead' }, T.welcomeLead),
        h('ol', { class: 'welcome-steps' }, T.welcomeSteps.map((st) => h('li', null, h('strong', null, st.t), h('span', null, st.d)))),
        h('label', { class: 'welcome-lang' }, h('span', null, T.language),
          h('select', { class: 'lang-control', translate: 'no', onchange: (e) => { state.lang = e.target.value; store.set('lang', state.lang); renderAll(); } },
            ...I.LANGS.map((l) => h('option', { value: l.code, lang: l.code, selected: l.code === state.lang }, l.name))))
      ];
    } else if (wStep === 1) {
      body = [
        h('p', { class: 'w-kicker' }, T.wStepOf(2, 3)),
        h('h2', { id: 'welcome-title' }, T.wAboutTitle),
        h('p', { class: 'welcome-lead' }, T.wAboutLead),
        profileSection((items, cur, pick, label) => h('div', { class: 'seg', role: 'group', 'aria-label': label },
          items.map(([val, text]) => h('button', { type: 'button', 'aria-pressed': String(cur === val), onclick: () => pick(val) }, text))), { prefix: 'welcome', compact: true })
      ];
    } else {
      body = [
        h('p', { class: 'w-kicker' }, T.wStepOf(3, 3)),
        h('h2', { id: 'welcome-title' }, T.wInterestTitle),
        h('p', { class: 'welcome-lead' }, T.wInterestLead),
        usedCategories().length ? h('div', { class: 'welcome-interests' }, interestChips()) : null
      ];
    }
    fill($('#welcome-body'), dots, h('div', { class: 'w-pane' }, body));
    $('#welcome-example').textContent = wStep === 0 ? T.welcomeExample : T.wBack;
    $('#welcome-start').textContent = wStep === 0 ? T.welcomeStart : wStep === 1 ? T.wNext : T.wDone;
  }
  function openWelcome() {
    wStep = 0;
    renderWelcome();
    const dlg = $('#welcome');
    if (!dlg.open) dlg.showModal();
  }
  function closeWelcome() { $('#welcome').close(); }
  // 처음 방문이면 안내를 연다 (불러오기 화면이 떠 있을 때는 끝난 뒤에)
  function maybeWelcome() {
    if (boot.visible || store.get('onboarded', false) || demoDate || /^#\/n\//.test(location.hash) || $('#welcome').open) return;
    setTimeout(() => { if (!boot.visible && !$('#welcome').open && !store.get('onboarded', false)) openWelcome(); }, 400);
  }

  // ---------- 앱으로 설치 (PWA) ----------
  let installEvent = null;
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function renderInstall() {
    const box = $('#install-box');
    if (!box) return;
    const web = /^https?:$/.test(location.protocol);
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    box.hidden = !web || !(installEvent || ios || isStandalone());
    if (box.hidden) return;
    $('#install-btn').hidden = !installEvent;
    $('#install-hint').textContent = isStandalone() ? t().installed : installEvent ? t().installHint : t().installIos;
  }
  function registerWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 기능만 빠짐 */ });
  }

  // ---------- 휴대폰 아래 탭 ----------
  const TABS = ['home', 'notices', 'track', 'timetable', 'budget', 'settings'];
  function tabFromHash() {
    if (/^#\/n\//.test(location.hash)) return 'notices';
    const m = /^#\/(\w+)$/.exec(location.hash);
    return m && TABS.includes(m[1]) ? m[1] : 'home';
  }
  // #/n/공지id 주소로 들어오면 그 공지의 상세 화면을 바로 연다 (공유한 링크)
  function openFromHash() {
    const m = /^#\/n\/(.+)$/.exec(location.hash);
    if (!m) return;
    let id = m[1];
    try { id = decodeURIComponent(id); } catch (e) { /* 그대로 */ }
    if (DATA.notices.some((x) => x.id === id)) { setTab('notices', false); openDetail(id); }
  }
  // 화면마다 보던 위치를 기억했다가, 다른 화면에 갔다 돌아오면 그 위치로 (공지 목록을 내려 보다가 시간표를 보고 와도 그대로)
  const scrollMem = {};
  function setTab(tab, scrollTop) {
    const prev = document.body.dataset.tab;
    if (prev && prev !== tab) scrollMem[prev] = window.scrollY;
    document.body.dataset.tab = tab;
    const navTab = tab === 'budget' ? 'notices' : tab;          // 시간 맞춤 추천은 공지 화면의 한 보기
    document.querySelectorAll('.tabbar a').forEach((a) => {
      if (a.dataset.tab === navTab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    renderViewSwitch();
    if (tab === 'track') renderBoard();
    // 추천 탭을 처음 열면 저장된 시간으로 바로 계산해 보여 줌
    if (tab === 'budget' && !state.budgetResult) runBudget();
    // 링크 클릭과 주소 바뀜(hashchange)이 같은 화면으로 두 번 부르므로, 화면이 실제로 바뀔 때만 위치를 옮긴다
    if (scrollTop && prev !== tab) scrollToTab(tab, true);
    // enhanced.js 연동: 탭 전환 이벤트 발행 (위젯 재주입·collapse 해제 등)
    if (prev !== tab) document.body.dispatchEvent(new CustomEvent('gongji:tabchange', { detail: { tab, prev } }));
  }

  // PC(왼쪽 내비게이션)와 휴대폰(아래 탭) 모두 화면을 통째로 바꾼다. 처음 여는 화면은 맨 위, 다시 온 화면은 보던 곳
  function scrollToTab(tab, restore) {
    const y = restore ? scrollMem[tab] || 0 : 0;
    window.scrollTo(0, y);
    // 목록이 아직 덜 그려졌으면 한 번 더
    if (y) requestAnimationFrame(() => { if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y); });
  }

  // ---------- 알림 센터 (종 모양 버튼) ----------
  // 알려 줄 것: 저장한 공지의 3일 안 마감 / 새로 올라온 공지 중 내 키워드·관심 분야. 지원 완료한 공지는 제외
  function currentAlerts() {
    return P.buildAlerts(DATA.notices, now, { saved: state.saved, applied: state.applied, keywords: state.keywords, interests: state.interests, since });
  }
  function alertKind(a, n) {
    const T = t();
    if (a.type === 'due') return T.alertDue(a.daysLeft);
    if (a.type === 'keyword') return T.alertKeyword(a.keywords.join(', '));
    return T.alertInterest(catLabel(n.category));
  }
  function renderAlertsBody(alerts) {
    const T = t();
    const seen = new Set(state.seenAlerts);
    const items = alerts.map((a) => {
      const n = DATA.notices.find((x) => x.id === a.id);
      if (!n) return null;
      return h('li', null, h('button', {
        type: 'button', class: 'alert-item ' + a.type + (seen.has(a.key) ? '' : ' is-new'),
        onclick: () => { $('#alerts').close(); openDetail(a.id); }
      },
      h('span', { class: 'alert-kind' }, alertKind(a, n)),
      h('span', { class: 'alert-title' }, titleOf(n)),
      n.deadline ? h('span', { class: 'alert-sub' }, `${T.deadline} ${I.formatDateTime(L.parseLocal(n.deadline), state.lang)}`) : null));
    }).filter(Boolean);
    fill($('#alerts-body'), 
      h('h2', { id: 'alerts-title' }, T.alertsTitle),
      items.length ? h('ul', { class: 'alert-list' }, items) : h('p', { class: 'empty' }, T.alertsEmpty));
  }
  function renderAlerts() {
    const a = currentAlerts();
    const n = P.unseen(a, state.seenAlerts);
    const badge = $('#alerts-badge');
    badge.hidden = n === 0;
    badge.textContent = n > 9 ? '9+' : String(n);
    const btn = $('#alerts-btn');
    btn.setAttribute('aria-label', t().alertsAria(n));
    btn.title = t().alertsTitle;
    if ($('#alerts').open) renderAlertsBody(a);
    maybeNotify(a);
  }
  function openAlerts() {
    renderAlertsBody(currentAlerts());
    $('#alerts').showModal();
  }
  function markAlertsSeen() {
    state.seenAlerts = P.cleanIds(state.seenAlerts.concat(currentAlerts().map((a) => a.key)), 300);
    store.set('seenAlerts', state.seenAlerts);
    renderAlerts();
  }

  // 브라우저 알림: 앱이 열려 있을 때(또는 설치한 앱을 열 때) 저장한 공지의 마감이 가까우면 하루에 한 번 알린다
  const notifySupported = () => 'Notification' in window;
  async function setNotify(on) {
    const T = t();
    const save = (v) => { state.alertsOn = v; store.set('alertsOn', v); renderMyPanel(); };
    if (!on) { save(false); toast(T.notifyDisabled); return; }
    if (!notifySupported()) { save(false); toast(T.notifyUnsupported); return; }
    let perm = Notification.permission;
    if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; } }
    if (perm !== 'granted') { save(false); toast(T.notifyDenied); return; }
    save(true);
    toast(T.notifyEnabled);
    maybeNotify(currentAlerts(), true);
  }
  function maybeNotify(alerts, force) {
    if (!state.alertsOn || demoDate || !notifySupported() || Notification.permission !== 'granted') return;
    const due = alerts.filter((a) => a.type === 'due');
    const today = X.ymd(now);
    if (!due.length || (!force && store.get('notifiedOn', '') === today)) return;
    store.set('notifiedOn', today);
    const opts = { body: t().notifyBody(due.length), icon: 'icons/icon-192.png', tag: 'gongji-due' };
    const fallback = () => { try { new Notification('공지 줍줍', opts); } catch (e) { /* 일부 휴대폰은 서비스 워커로만 알림을 띄울 수 있음 */ } };
    if (/^https?:$/.test(location.protocol) && navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then((r) => r.showNotification('공지 줍줍', opts)).catch(fallback);
    } else fallback();
  }

  // ---------- 관심 분야 · 키워드 ----------
  const usedCategories = () => {
    const used = new Set(DATA.notices.map((n) => n.category));
    return DATA.categories.filter((c) => used.has(c.id));
  };
  function afterInterestChange() {
    renderListTools();
    renderList();
    renderHome();
    renderAlerts();
    renderRecent();
  }
  function interestChips() {
    const box = h('div', { class: 'interest-chips', role: 'group', 'aria-label': t().interestsFields });
    for (const c of usedCategories()) {
      const btn = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.interests.includes(c.id)) }, tr(c.label));
      btn.addEventListener('click', () => {
        state.interests = state.interests.includes(c.id) ? state.interests.filter((x) => x !== c.id) : state.interests.concat(c.id);
        store.set('interests', state.interests);
        btn.setAttribute('aria-pressed', String(state.interests.includes(c.id)));
        afterInterestChange();
      });
      box.append(btn);
    }
    return box;
  }
  function addKeyword(raw) {
    const before = state.keywords.length;
    const next = P.cleanKeywords(state.keywords.concat(String(raw || '')));
    if (next.length === before) { if (before >= P.MAX_KEYWORDS && String(raw || '').trim()) toast(t().keywordMax); return; }
    state.keywords = next;
    store.set('keywords', next);
    afterInterestChange();
    renderMyPanel(true);
  }
  function removeKeyword(k) {
    state.keywords = state.keywords.filter((x) => x !== k);
    store.set('keywords', state.keywords);
    if (!hasMine()) state.mineOnly = false;
    afterInterestChange();
    renderMyPanel();
  }

  // ---------- 설정: 나에게 맞게 (화면 모드·글자 크기·관심·알림·구글 캘린더) ----------
  function renderThemeButton() {
    const btn = $('#theme-toggle');
    if (!btn || !TH) return;
    const dark = TH.effective() === 'dark';
    const label = dark ? t().themeToLight : t().themeToDark;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(dark));
    btn.title = label;
  }
  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); } catch (e) { window.prompt('', text); }
  }
  function renderMyPanel(focusKeyword) {
    const box = $('#my-body');
    if (!box) return;
    const T = t();
    const seg = (items, cur, pick, label) => h('div', { class: 'seg', role: 'group', 'aria-label': label },
      items.map(([val, text]) => h('button', { type: 'button', 'aria-pressed': String(cur === val), onclick: () => pick(val) }, text)));
    const feed = C.feedUrls(location.href);
    const input = h('input', { type: 'text', id: 'kw-input', maxlength: '20', autocomplete: 'off', placeholder: T.keywordPlaceholder, 'aria-label': T.keywordsLabel });
    const denied = notifySupported() && Notification.permission === 'denied';
    fill(box, 
      TH ? h('div', { class: 'my-section' },
        h('h3', null, T.themeTitle),
        seg([['auto', T.themeAuto], ['light', T.themeLight], ['dark', T.themeDark]], TH.get(), (v) => TH.setTheme(v), T.themeTitle),
        h('h3', { style: 'margin-top:12px' }, T.fontTitle),
        seg([['sm', T.fontSm], ['md', T.fontMd], ['lg', T.fontLg]], TH.font(), (v) => { TH.setFont(v); renderMyPanel(); }, T.fontTitle)) : null,
      EL ? profileSection(seg) : null,
      h('div', { class: 'my-section' },
        h('p', { class: 'help' }, T.interestsHelp),
        h('h3', null, T.interestsFields), interestChips(),
        h('h3', { style: 'margin-top:12px' }, T.keywordsLabel),
        h('form', { class: 'kw-form', onsubmit: (e) => { e.preventDefault(); const v = input.value; input.value = ''; addKeyword(v); } },
          input, h('button', { type: 'submit', class: 'btn small' }, T.keywordAdd)),
        h('div', { class: 'kw-list' }, state.keywords.map((k) => h('span', { class: 'kw-chip' }, k,
          h('button', { type: 'button', 'aria-label': T.keywordRemove(k), onclick: () => removeKeyword(k) }, '×')))),
        h('div', { class: 'kw-suggest-wrap' },
          h('span', { class: 'kw-suggest-label' }, T.kwSuggestLabel || '💡 추천 키워드:'),
          h('div', { class: 'kw-suggest-chips' },
            ((state.lang === 'ja'
              ? [{ l: '寮 (기숙사)', v: '기숙사' }, { l: '国家奨学金 (국가장학)', v: '국가장학' }, { l: '勤労 (근로)', v: '근로' }, { l: 'TOEIC (토익)', v: '토익' }, { l: '交換留学 (교환학생)', v: '교환학생' }, { l: '現場実習 (현장실습)', v: '현장실습' }, { l: '海外ボランティア (해외봉사)', v: '해외봉사' }, { l: 'インターン (인턴)', v: '인턴' }, { l: '卒業 (졸업)', v: '졸업' }]
              : state.lang === 'zh'
              ? [{ l: '宿舍 (기숙사)', v: '기숙사' }, { l: '国家奖学金 (국가장학)', v: '국가장학' }, { l: '勤工助学 (근로)', v: '근로' }, { l: '托业 (토익)', v: '토익' }, { l: '交换生 (교환학생)', v: '교환학생' }, { l: '实习实训 (현장실습)', v: '현장실습' }, { l: '海外志愿 (해외봉사)', v: '해외봉사' }, { l: '实习 (인턴)', v: '인턴' }, { l: '毕业 (졸업)', v: '졸업' }]
              : state.lang === 'en'
              ? [{ l: 'Dorm (기숙사)', v: '기숙사' }, { l: 'National Scholarship (국가장학)', v: '국가장학' }, { l: 'Work-Study (근로)', v: '근로' }, { l: 'TOEIC (토익)', v: '토익' }, { l: 'Exchange Student (교환학생)', v: '교환학생' }, { l: 'Internship (현장실습)', v: '현장실습' }, { l: 'Global Volunteer (해외봉사)', v: '해외봉사' }, { l: 'Intern (인턴)', v: '인턴' }, { l: 'Graduation (졸업)', v: '졸업' }]
              : [{ l: '기숙사', v: '기숙사' }, { l: '국가장학', v: '국가장학' }, { l: '근로', v: '근로' }, { l: '토익', v: '토익' }, { l: '교환학생', v: '교환학생' }, { l: '현장실습', v: '현장실습' }, { l: '해외봉사', v: '해외봉사' }, { l: '인턴', v: '인턴' }, { l: '졸업', v: '졸업' }]
            ).filter((item) => !state.keywords.includes(item.v)).map((item) =>
              h('button', {
                type: 'button',
                class: 'kw-suggest-chip',
                onclick: () => addKeyword(item.v)
              }, `+ ${item.l}`)
            ))
          )
        )),
      h('div', { class: 'my-section' },
        h('h3', null, T.notifyTitle),
        h('p', { class: 'help' }, T.notifyHelp),
        h('button', { type: 'button', class: 'btn small' + (state.alertsOn ? ' is-on' : ''), 'aria-pressed': String(state.alertsOn), onclick: () => setNotify(!state.alertsOn) },
          state.alertsOn ? T.notifyOff : T.notifyOn),
        denied ? h('p', { class: 'fine' }, T.notifyDenied) : null,
        !notifySupported() ? h('p', { class: 'fine' }, T.notifyUnsupported) : null,
        h('h3', { style: 'margin-top:14px' }, T.remindTitle),
        h('p', { class: 'help' + (server.ok ? ' ok-note' : '') }, server.ok ? T.remindOn(state.saved.length) : T.remindOff)),
      h('div', { class: 'my-section' },
        h('h3', null, T.calSyncTitle),
        feed ? [
          h('p', { class: 'help' }, T.calSyncHelp),
          h('code', { class: 'sync-url' }, feed.https),
          feed.local ? h('p', { class: 'fine warn-note' }, T.calSyncLocal) : null,
          h('div', { class: 'btn-row' },
            feed.local ? null : h('a', { class: 'btn small primary', href: feed.google, target: '_blank', rel: 'noopener noreferrer' }, T.calSyncOpen + ' ↗'),
            h('button', { type: 'button', class: 'btn small', onclick: () => copyText(feed.https, T.calSyncCopied) }, T.calSyncCopy)),
          h('p', { class: 'fine' }, T.calSyncSteps)
        ] : h('p', { class: 'help' }, T.calSyncUnavailable)));
    if (focusKeyword) { const el = $('#kw-input'); if (el) el.focus(); }
  }

  // ---------- 내 정보 (지원 자격 확인) ----------
  function profileSection(seg, opts) {
    const T = t();
    const p = state.profile;
    const pre = (opts && opts.prefix) || 'profile';                 // 첫 화면 안내에서도 같은 양식을 쓰므로 id 가 겹치지 않게
    const set = (patch) => {
      state.profile = cleanProfile(Object.assign({}, state.profile, patch));
      store.set('profile', state.profile);
      profileChanged();
    };
    const DI18n = (typeof window !== 'undefined' && window.GongjiDeptI18n) || root.GongjiDeptI18n;
    const curDept = p.dept || state.dept || '';
    const displayDept = (DI18n && DI18n.formatDept) ? DI18n.formatDept(curDept, state.lang) : curDept;
    const dept = h('input', {
      type: 'text', id: pre + '-dept', maxlength: '60', value: displayDept, placeholder: T.profileDeptPh,
      list: pre + '-dept-list', autocomplete: 'off', 'aria-label': T.profileDept,
      onchange: (e) => {
        const raw = e.target.value.trim();
        const P = window.GongjiPlan;
        const resolved = (DI18n && DI18n.resolveDept) ? DI18n.resolveDept(raw) : ((P && P.resolveDept) ? P.resolveDept(raw, DATA.gradreq) : raw);
        const val = resolved || raw;
        set({ dept: val });
        e.target.value = (DI18n && DI18n.formatDept) ? DI18n.formatDept(val, state.lang) : val;
        if (resolved && resolved !== raw) {
          toast(`'${raw}' → [${(DI18n && DI18n.formatDept) ? DI18n.formatDept(resolved, state.lang) : resolved}] 학과로 자동 인식되었습니다.`);
        }
      }
    });
    return h('div', { class: 'my-section profile-section', id: pre + '-section' },
      opts && opts.compact ? null : h('h3', null, T.profileTitle),
      opts && opts.compact ? null : h('p', { class: 'help' }, T.profileHelp),
      h('div', { class: 'profile-grid' },
        h('span', { class: 'pf-label' }, T.profileLevel),
        seg([['undergrad', T.levelUndergrad], ['grad', T.levelGrad]], p.level, (v) => set({ level: v }), T.profileLevel),
        p.level === 'grad' ? null : [h('span', { class: 'pf-label' }, T.profileGrade),
          seg([1, 2, 3, 4].map((g) => [g, T.gradeN(g)]), p.grade, (v) => set({ grade: v }), T.profileGrade)],
        h('span', { class: 'pf-label' }, T.profileStatus),
        seg([['enrolled', T.statusEnrolled], ['leave', T.statusLeave]], p.status, (v) => set({ status: v }), T.profileStatus),
        h('span', { class: 'pf-label' }, T.profileDept), dept),
      h('label', { class: 'toggle pf-intl' },
        h('input', { type: 'checkbox', checked: p.intl, onchange: (e) => set({ intl: e.target.checked }) }), h('span', null, T.profileIntl)),
      h('datalist', { id: pre + '-dept-list' }, deptList().map((d) => h('option', { value: (DI18n && DI18n.formatDept) ? DI18n.formatDept(d, state.lang) : d }))),
      p.set ? h('div', { class: 'profile-save-status' },
        h('span', { class: 'ok-note' }, '✓ ' + T.profileSaved),
        h('button', { type: 'button', class: 'link-btn pf-clear-btn', onclick: () => { state.profile = cleanProfile(null); store.set('profile', null); profileChanged(); } }, T.profileClear)) : null);
  }
  // 학과 이름 후보: 강의 시간표(data/timetable.js)의 개설 학과 + 요람 기준 학과
  let deptCache = null;
  function deptList() {
    if (deptCache) return deptCache;
    const tt = window.GONGJI_TIMETABLE;
    const gq = window.GONGJI_GRADREQ;
    const set = new Set(((tt && tt.courses) || []).map((c) => c.d).filter((d) => d && /(과|부|전공)$/.test(d)));
    if (gq && gq.depts) {
      for (const d of Object.keys(gq.depts)) set.add(d);
    }
    deptCache = [...set].sort((a, b) => a.localeCompare(b, 'ko')).slice(0, 200);
    return deptCache;
  }
  function profileChanged() {
    if ($('#welcome').open) renderWelcome();
    renderMyPanel();
    renderList();
    renderHome();
    renderAlerts();
    if (state.budgetResult) runBudget();
    if (ask.res) runAsk(ask.q);
    if ($('#detail').open && state.openId) openDetail(state.openId, true);
  }
  function goProfile() {
    location.hash = '#/settings';
    setTab('settings', true);
    setTimeout(() => { const el = $('#profile-section'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60);
  }

  // ---------- 공지에게 묻기 ----------
  const ask = { q: '', res: null, ai: null, aiState: '', seq: 0, all: false };
  function renderAskExamples() {
    const box = $('#ask-examples');
    if (!box || !AK) return;
    fill(box, t().askExamples.map((q) => h('button', { type: 'button', class: 'chip small', onclick: () => { $('#ask-q').value = q; runAsk(q); } }, q)));
  }
  function runAsk(question) {
    if (!AK) return;
    const q = String(question || '').trim();
    ask.q = q;
    ask.seq += 1;
    ask.ai = null;
    ask.aiState = '';
    ask.all = false;
    if (!q) { ask.res = null; renderAsk(); return; }
    const cond = AK.parse(q);
    const r = AK.run(DATA.notices.filter((n) => !isApplied(n.id)), cond,
      { now, fit: (n, p) => fitStatus(n, p), profileSet: state.profile.set });
    // 내 정보가 있으면 대상이 아닌 공지는 뺀다
    if (state.profile.set && state.fitOnly) r.list = r.list.filter((n) => fitStatus(n) !== 'no');
    ask.res = Object.assign({ cond }, r);
    renderAsk();
    if (server.ok && r.list.length) askAi(q, r.list, ask.seq);
  }
  async function askAi(q, list, seq) {
    const brief = AK.brief(list, state.lang, 8);
    ask.aiState = 'busy';
    renderAsk();
    try {
      const res = await fetch('ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, lang: state.lang, notices: brief })
      });
      const j = await res.json();
      if (seq !== ask.seq) return;
      if (!res.ok || !j.ok || !j.answer) throw new Error(j.error || String(res.status));
      ask.ai = { answer: j.answer, brief, model: j.model, seconds: j.seconds };
      ask.aiState = '';
    } catch (e) {
      if (seq !== ask.seq) return;
      ask.aiState = 'fail';
    }
    renderAsk();
  }
  // AI 답의 [1] 같은 번호를 누르면 그 공지가 열리게
  function cited(answer, brief, ids) {
    const out = [];
    let last = 0;
    answer.replace(/\[(\d{1,2})\]/g, (m, k, at) => {
      const b = brief.find((x) => x.no === +k);
      out.push(answer.slice(last, at));
      out.push(b ? h('button', { type: 'button', class: 'cite', title: b.title, onclick: () => openDetail(b.id, false, ids) }, m) : m);
      last = at + m.length;
      return m;
    });
    out.push(answer.slice(last));
    return out;
  }
  function renderAsk() {
    const box = $('#ask-result');
    if (!box) return;
    const r = ask.res;
    if (!r) { fill(box); return; }
    const T = t();
    const c = r.cond;
    const chips = [];
    if (c.due !== null) chips.push(T.condDue(c.due));
    for (const sb of c.subs) chips.push(subLabel(sb));
    for (const g of c.groups) chips.push(groupLabel(g));
    const words = c.words.slice(0, 3).concat(c.tokens.filter((w) => !r.ignored.includes(w)));
    if (words.length) chips.push(T.condWords(words.join(', ')));
    if (c.intl) chips.push(T.condIntl);
    if (c.grade) chips.push(T.condGrade(c.grade));
    if ((c.mine || state.fitOnly) && state.profile.set) chips.push(T.condMine);
    if (r.sort && T.condSort[r.sort]) chips.push(T.condSort[r.sort]);
    const ids = r.list.map((n) => n.id);
    const shown = ask.all ? r.list.slice(0, 60) : r.list.slice(0, 5);
    let ai = null;
    if (r.list.length) {
      if (ask.aiState === 'busy') ai = h('div', { class: 'ask-ai busy', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), T.askAiWorking);
      else if (ask.aiState === 'fail') ai = h('p', { class: 'fine' }, T.askAiFail);
      else if (ask.ai) ai = h('div', { class: 'ask-ai' }, h('h4', null, T.askAiTitle), h('p', null, cited(ask.ai.answer, ask.ai.brief, ids)), h('p', { class: 'fine' }, T.askAiNote));
      else if (server.checked && !server.ok) ai = h('p', { class: 'fine ask-ai-hint' }, T.askAiLocalOnly);
    }
    const isDadreamQuery = c.subs.includes('dadream') || (ask.q && /다드림|포인트|비교과|dadream/i.test(ask.q));
    const dadreamBanner = isDadreamQuery ? h('div', { class: 'ask-dadream-banner' },
      h('div', { class: 'adb-head' },
        h('span', { class: 'adb-icon' }, '🍱'),
        h('strong', { class: 'adb-title' }, T.dadreamBannerTitle || '건국대 글로컬 다드림 포인트 장학금 지급 기준'),
        h('span', { class: 'adb-badge' }, T.dadreamBannerTotal || '총 400명 선발 · 1.1억 원 규모')
      ),
      h('div', { class: 'adb-table' },
        h('div', { class: 'adb-row gold' }, h('span', { class: 'adb-tier' }, T.dadreamTierGrand || '대상 (상위 20명)'), h('strong', { class: 'adb-amount' }, '700,000원')),
        h('div', { class: 'adb-row silver' }, h('span', { class: 'adb-tier' }, T.dadreamTierFirst || '최우수 (상위 60명)'), h('strong', { class: 'adb-amount' }, '500,000원')),
        h('div', { class: 'adb-row bronze' }, h('span', { class: 'adb-tier' }, T.dadreamTierSecond || '우수 (상위 120명)'), h('strong', { class: 'adb-amount' }, '300,000원')),
        h('div', { class: 'adb-row green' }, h('span', { class: 'adb-tier' }, T.dadreamTierEnc || '장려 (상위 200명)'), h('strong', { class: 'adb-amount' }, '100,000원'))
      ),
      h('p', { class: 'adb-note' }, T.dadreamBannerNote || '※ 선발 대상: 당해 학기 다드림 포인트 상위 획득자 순으로 선발하여 현금 장학금으로 지급됩니다.')
    ) : null;
    fill(box, h('div', { class: 'ask-card' },
      h('div', { class: 'ask-cond' },
        h('span', { class: 'ask-cond-label' }, T.askUnderstood),
        chips.map((x) => h('span', { class: 'cond-chip' }, x)),
        h('span', { class: 'ask-count' }, T.askCount(r.list.length))),
      r.ignored.length ? h('p', { class: 'fine' }, T.askIgnored(r.ignored.join(', '))) : null,
      dadreamBanner,
      ai,
      shown.length ? h('ul', { class: 'home-list' }, shown.map((n) => homeRow(n, ids))) : h('p', { class: 'ask-none' }, T.askNone),
      h('div', { class: 'ask-actions' },
        !ask.all && r.list.length > 5 ? h('button', { type: 'button', class: 'link-btn', onclick: () => { ask.all = true; renderAsk(); } }, T.askSeeAll(r.list.length)) : null,
        h('button', { type: 'button', class: 'link-btn', onclick: () => { $('#ask-q').value = ''; runAsk(''); } }, T.askClear))));
  }

  // ---------- 내 컴퓨터 서버 (수신 서버로 열었을 때만): AI 답 · 저장한 공지 마감 알림 ----------
  const server = { ok: false, checked: false };
  async function detectServer() {
    const local = /^https?:$/.test(location.protocol) && /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
    if (local) {
      try {
        const r = await fetch('status', { cache: 'no-store' });
        const j = await r.json();
        server.ok = !!(j && j.app === 'gongji-jupjup');
      } catch (e) { server.ok = false; }
    }
    server.checked = true;
    if (server.ok) syncMine(true);
    renderMyPanel();
    renderAsk();
  }
  let mineTimer = null;
  function syncMine(now) {
    if (!server.ok) return;
    clearTimeout(mineTimer);
    mineTimer = setTimeout(() => {
      fetch('mine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saved: state.saved, applied: state.applied }) })
        .then((r) => { if (r.ok) renderMyPanel(); })
        .catch(() => { /* 서버가 잠깐 꺼져 있으면 다음에 */ });
    }, now ? 0 : 500);
  }

  const RECOMMENDED_SEARCH_KEYWORDS = [
    { label: '장학금', icon: '💰' },
    { label: '기숙사', icon: '🏠' },
    { label: '국가장학', icon: '🏛️' },
    { label: '토익', icon: '📜' },
    { label: '교환학생', icon: '🌐' },
    { label: '현장실습', icon: '💼' },
    { label: '다드림', icon: '🍱' },
    { label: 'K-MOOC', icon: '💻' }
  ];

  // 검색창 아래에 최근 검색어와 추천 인기 키워드 스마트 팝오버
  function renderRecent() {
    const dl = $('#recent-list');
    if (dl) {
      const items = state.recent.slice().reverse().concat(state.keywords.filter((k) => !state.recent.includes(k)));
      fill(dl, ...items.map((v) => h('option', { value: v })));
    }
    renderSearchSuggestPopover();
  }

  function renderSearchSuggestPopover() {
    const input = $('#q');
    if (!input) return;
    const parent = input.closest('.search');
    if (!parent) return;

    let pop = parent.querySelector('.search-suggest-popover');
    if (!pop) {
      pop = h('div', { class: 'search-suggest-popover', role: 'region', 'aria-label': '검색 제안' });
      parent.appendChild(pop);

      input.addEventListener('focus', () => {
        renderSearchSuggestPopover();
        pop.classList.add('is-open');
      });
      document.addEventListener('click', (e) => {
        if (!parent.contains(e.target)) pop.classList.remove('is-open');
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') pop.classList.remove('is-open');
      });
    }

    const T = t();
    const recents = state.recent.slice().reverse().slice(0, 6);

    const onPick = (kw) => {
      input.value = kw;
      state.query = kw;
      rememberQuery();
      renderList();
      pop.classList.remove('is-open');
      input.focus();
    };

    const clearRecents = () => {
      state.recent = [];
      store.set('recent', []);
      renderRecent();
    };

    const removeRecent = (kw, e) => {
      e.stopPropagation();
      state.recent = state.recent.filter((x) => x !== kw);
      store.set('recent', state.recent);
      renderRecent();
    };

    const parts = [];

    // 1. 최근 검색어 섹션
    if (recents.length) {
      parts.push(h('div', { class: 'ssp-sec' },
        h('div', { class: 'ssp-head' },
          h('span', { class: 'ssp-title' }, T.recentSearches || '최근 검색어'),
          h('button', { type: 'button', class: 'ssp-clear-btn', onclick: clearRecents }, T.clearAll || '모두 삭제')
        ),
        h('ul', { class: 'ssp-recent-list' }, recents.map((kw) => h('li', { class: 'ssp-recent-item' },
          h('button', { type: 'button', class: 'ssp-recent-btn', onclick: () => onPick(kw) },
            h('span', { class: 'ssp-icon' }, '🕒'),
            h('span', { class: 'ssp-kw' }, kw)
          ),
          h('button', { type: 'button', class: 'ssp-del-btn', 'aria-label': `${kw} 삭제`, onclick: (e) => removeRecent(kw, e) }, '✕')
        )))
      ));
    }

    // 2. 추천 인기 키워드 섹션
    parts.push(h('div', { class: 'ssp-sec' },
      h('div', { class: 'ssp-head' },
        h('span', { class: 'ssp-title' }, T.recommendedKeywords || '💡 추천 검색어')
      ),
      h('div', { class: 'ssp-chips' }, RECOMMENDED_SEARCH_KEYWORDS.map((item) => h('button', {
        type: 'button',
        class: 'ssp-chip',
        onclick: () => onPick(item.label)
      }, `${item.icon} ${item.label}`)))
    ));

    fill(pop, ...parts);
  }

  function rememberQuery() {
    const q = state.query.trim();
    if (q.length < 2) return;
    state.recent = P.touch(state.recent, q.slice(0, 40), 8);
    store.set('recent', state.recent);
    renderRecent();
  }

  // ---------- 마감 달력 (홈) ----------
  // 마감(빨강)·행사(초록)·학사일정(파랑)을 월간 달력에 점으로 보여 주고, 날짜를 누르면 그날 목록을 보여 준다
  function refreshCal() {
    const old = document.querySelector('.cal-card');
    if (!old) return;
    const nc = calCard();
    nc.classList.add('sec');                    // 홈의 편집형 섹션 모양 그대로
    old.replaceWith(nc);
  }
  function calCard() {
    const T = t();
    const { year, month0, sel } = state.cal;
    const entries = C.collect(activeNotices(), { titleOf, calendar: window.GONGJI_CALENDAR, academicTitle: (it) => tr(it.title) });
    const g = C.monthGrid(year, month0, entries, X.ymd(now), 0);
    const go = (delta) => { const m = C.shiftMonth(year, month0, delta); state.cal.year = m.year; state.cal.month0 = m.month0; refreshCal(); };
    const head = h('div', { class: 'mcal-head' },
      h('h3', null, `${T.calViewTitle} · ${T.calMonth(year, month0 + 1)}`),
      h('div', { class: 'mcal-nav' },
        h('button', { type: 'button', class: 'btn small', 'aria-label': T.calPrev, onclick: () => go(-1) }, '‹'),
        h('button', { type: 'button', class: 'btn small', onclick: () => { state.cal = { year: now.getFullYear(), month0: now.getMonth(), sel: X.ymd(now) }; refreshCal(); } }, T.calToday),
        h('button', { type: 'button', class: 'btn small', 'aria-label': T.calNext, onclick: () => go(1) }, '›')));
    const cells = g.weeks.flat().map((c) => h('button', {
      type: 'button', 'aria-pressed': String(c.date === sel), 'data-date': c.date,
      class: 'mcal-cell' + (c.inMonth ? '' : ' out') + (c.isToday ? ' today' : '') + (c.weekday === 0 ? ' sun' : c.weekday === 6 ? ' sat' : ''),
      'aria-label': T.calCellAria(I.formatDate(L.parseLocal(c.date), state.lang), c.entries.length),
      onclick: () => {
        state.cal.sel = c.date;
        if (!c.inMonth) { const d = L.parseLocal(c.date); state.cal.year = d.getFullYear(); state.cal.month0 = d.getMonth(); }
        refreshCal();
      }
    },
    h('span', { class: 'mcal-num' }, String(c.day)),
    h('span', { class: 'mcal-dots', 'aria-hidden': 'true' },
      c.deadlines ? h('i', { class: 'dot deadline' }) : null, c.events ? h('i', { class: 'dot event' }) : null, c.academic ? h('i', { class: 'dot academic' }) : null)));
    const grid = h('div', { class: 'mcal-grid' }, T.calDow.map((d) => h('span', { class: 'mcal-dow', 'aria-hidden': 'true' }, d)), cells);
    const legend = h('ul', { class: 'mcal-legend' }, ['deadline', 'event', 'academic'].map((k) =>
      h('li', null, h('i', { class: 'dot ' + k }), T.calLegend[k])));
    const ORDER = { deadline: 0, event: 1, academic: 2 };
    const day = entries.filter((e) => e.date === sel).sort((a, b) => ORDER[a.type] - ORDER[b.type] || String(a.time).localeCompare(String(b.time)));
    const dayBox = h('div', { class: 'mcal-day' },
      h('h4', null, I.formatDate(L.parseLocal(sel), state.lang)),
      day.length ? h('ul', { class: 'mcal-list' }, day.map((e) => h('li', { class: 'mcal-item' },
        h('span', { class: 'mcal-kind ' + e.type }, T.calLegend[e.type]),
        e.id ? h('button', { type: 'button', class: 'link', 'aria-haspopup': 'dialog', onclick: () => openDetail(e.id) }, e.title) : h('span', { style: 'flex:1;min-width:0' }, e.title),
        e.time ? h('span', { class: 'mcal-time' }, e.time) : null)))
        : h('p', { class: 'fine' }, T.calDayEmpty));
    return h('section', { class: 'home-card cal-card' }, head, h('div', { class: 'mcal-cols' }, h('div', { class: 'mcal-main' }, grid, legend), dayBox));
  }

  // ---------- 불러오기 화면 (처음 열었을 때 · 공지가 비었을 때 · 새 데이터를 받을 때) ----------
  const BOOT_STEPS = ['version', 'notices', 'calendar', 'glossary'];
  const boot = { step: '', timer: 0, visible: false, error: '' };
  function renderBoot(mode) {
    const T = t();
    const idx = boot.step === 'end' ? BOOT_STEPS.length : BOOT_STEPS.indexOf(boot.step);
    const steps = BOOT_STEPS.map((k, i) => {
      const cls = i < idx ? 'done' : i === idx ? (mode === 'failed' ? 'fail' : 'active') : '';
      return h('li', { class: 'boot-step ' + cls }, h('span', { class: 'step-dot', 'aria-hidden': 'true' }, cls === 'done' ? '✓' : cls === 'fail' ? '!' : ''), T.bootSteps[k]);
    });
    const pct = Math.min(100, Math.round(((Math.max(idx, 0) + (idx < BOOT_STEPS.length && mode === 'loading' ? 0.5 : 0)) / BOOT_STEPS.length) * 100));
    const actions = [];
    if (mode === 'failed') {
      actions.push(h('button', { type: 'button', class: 'btn primary', onclick: () => { hideBoot(); refreshData(true, { blocking: !DATA.notices.length }); } }, T.bootRetry));
      actions.push(h('button', { type: 'button', class: 'btn', onclick: hideBoot }, DATA.notices.length ? T.bootSample : T.close));
    } else if (mode === 'nodata') {
      actions.push(h('button', { type: 'button', class: 'btn primary', onclick: hideBoot }, T.close));
    }
    fill($('#boot-card'), 
      h('div', { class: 'welcome-logo', 'aria-hidden': 'true' }, '줍'),
      h('h2', null, T.bootTitle),
      h('p', null, mode === 'nodata' ? T.bootNoData : T.bootLead),
      mode === 'nodata' ? null : h('ul', { class: 'boot-steps' }, steps),
      mode === 'loading' ? h('div', { class: 'boot-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h('i', { style: `width:${pct}%` })) : null,
      mode === 'failed' ? h('p', { class: 'boot-error' }, navigator.onLine === false ? T.bootOffline : T.bootFailed) : null,
      actions.length ? h('div', { class: 'boot-actions' }, actions) : null);
  }
  function showBoot(mode) { renderBoot(mode); $('#boot').hidden = false; boot.visible = true; }
  function hideBoot() { clearTimeout(boot.timer); $('#boot').hidden = true; boot.visible = false; maybeWelcome(); }

  // ---------- 서버 자동 갱신 + 내 설정 백업 ----------
  // 열 때와 열어 둔 동안 주기적으로 서버의 version.json 을 확인해서, 더 새로운 데이터가 있으면 받아 와 화면을 바꾼다.
  // 파일(file://)로 열었거나 서버가 없으면 조용히 들어 있는 데이터를 그대로 쓴다.
  const CFG = window.GONGJI_CONFIG || {};
  const SY = window.GongjiSync;
  const sync = { busy: false, last: 0, msg: null };
  const syncOn = () => !!SY && !(CFG.refreshMinutes <= 0) && !(location.protocol === 'file:' && !CFG.dataBase);

  function renderSync() {
    const bar = $('#sync-bar');
    if (!bar) return;
    const offline = navigator.onLine === false && /^https?:$/.test(location.protocol);
    bar.hidden = !syncOn() && !offline;
    if (bar.hidden) return;
    const T = t();
    if (offline) { $('#sync-text').textContent = T.offline; $('#sync-btn').disabled = true; return; }
    const stamp = DATA.meta.generatedAt;
    const m = sync.msg;
    // 자료가 3일 넘게 갱신되지 않았으면 눈에 띄게 (실제 오늘 날짜 기준)
    const made = L.parseLocal(String(stamp || '').replace(' ', 'T'));
    const age = made ? Math.floor((Date.now() - made.getTime()) / 86400000) : 0;
    bar.classList.toggle('stale', age >= 3);
    $('#sync-text').textContent = (!m && age >= 3) ? `${T.syncAsOf(stamp)} · ${T.staleData(age)}` : !m ? T.syncAsOf(stamp)
      : m.k === 'checking' ? T.syncChecking
      : m.k === 'updated' ? T.syncUpdated(DATA.notices.length, stamp)
      : m.k === 'upToDate' ? T.syncUpToDate(stamp) : T.syncFailed(stamp);
    $('#sync-btn').disabled = sync.busy;
  }

  // 서버에서 새 데이터를 받아 온다.
  //   blocking: 공지가 하나도 없을 때 (불러오기 화면을 바로 띄움)
  //   startup : 앱을 열 때 (받는 데 0.6초 넘게 걸리면 불러오기 화면을 띄움)
  async function refreshData(manual, opts) {
    const o = opts || {};
    if (!syncOn() || sync.busy) return;
    sync.busy = true;
    sync.last = Date.now();
    if (manual) { sync.msg = { k: 'checking' }; renderSync(); }
    boot.step = '';
    clearTimeout(boot.timer);
    if (o.blocking) showBoot('loading');
    else if (o.startup || manual) boot.timer = setTimeout(() => showBoot('loading'), 600);
    const r = await SY.check({
      base: CFG.dataBase || 'data/', localStamp: DATA.meta.generatedAt, localSource: DATA.meta.source,
      localCount: DATA.notices.length, localNotices: RAW_NOTICES,
      onStep: (name) => { boot.step = name; if (boot.visible) renderBoot('loading'); }
    });
    clearTimeout(boot.timer);
    sync.busy = false;
    if (r.status === 'updated') {
      const hadBudget = !!state.budgetResult;
      DATA.meta = r.data.meta;
      RAW_NOTICES = r.data.notices;
      applyOv();
      DATA.categories = r.data.categories;
      if (r.calendar) window.GONGJI_CALENDAR = r.calendar;
      if (r.glossary) { Object.keys(GLOSSARY).forEach((k) => delete GLOSSARY[k]); Object.assign(GLOSSARY, r.glossary); }
      state.budgetResult = null;
      sync.msg = { k: 'updated' };
      renderAll();
      if (hadBudget) runBudget();
      // 무엇이 바뀌었는지 한 줄로 알려 준다
      const d = r.diff;
      if (r.first) toast(t().updatedFirst(DATA.notices.length));
      else if (d && (d.added.length || d.deadlineChanged.length)) toast(`${t().updatedTitle} · ${t().updatedSummary(d.added.length, d.deadlineChanged.length)}`);
      if (boot.visible) {
        boot.step = 'end';
        renderBoot('loading');
        setTimeout(hideBoot, 450);
      } else maybeWelcome();
    } else if (r.status === 'failed' && (o.blocking || boot.visible)) {
      if (!boot.visible) showBoot('failed'); else renderBoot('failed');
      sync.msg = manual ? { k: 'failed' } : sync.msg;
      renderSync();
    } else {
      if (boot.visible) hideBoot();
      sync.msg = manual ? { k: r.status === 'upToDate' ? 'upToDate' : 'failed' } : sync.msg;
      renderSync();
    }
  }

  const backupMsg = (text) => { const el = $('#backup-msg'); if (el) el.textContent = text; };

  function exportMine() {
    const values = {
      timetable: state.timetable, lang: state.lang, sort: state.sort, grouped: state.grouped,
      hideConflicts: state.hideConflicts, budgetHours: state.budgetHours, budgetWindow: state.budgetWindow,
      budgetSelective: state.budgetSelective, saved: state.saved,
      theme: TH ? TH.get() : undefined, fontScale: TH ? TH.font() : undefined, applied: state.applied, read: state.read,
      keywords: state.keywords, interests: state.interests, recent: state.recent, alertsOn: state.alertsOn,
      track: state.track,
      ...(planUI ? planUI.values() : {})
    };
    const blob = new Blob([JSON.stringify(SY.makeBackup(values), null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `gongji-settings-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    backupMsg(t().exportDone);
  }

  async function importMine(file) {
    let r = { ok: false };
    try { r = SY.readBackup(JSON.parse(await file.text()), L.isValidClass, I.LANGS.map((l) => l.code)); } catch (e) { /* 아래에서 안내 */ }
    if (!r.ok) { backupMsg(t().importBad); return; }
    if (planUI) planUI.load(r.values);
    for (const [k, v] of Object.entries(r.values)) {
      if (['history', 'gradReq', 'planPrefs'].includes(k)) continue;     // 수강 계획 값은 planUI 가 넣음
      if (k === 'track') { state.track = K ? K.cleanTrack(v) : {}; store.set('track', state.track); continue; }
      if (k === 'theme') { if (TH) TH.setTheme(v); continue; }
      if (k === 'fontScale') { if (TH) TH.setFont(v); continue; }
      state[k] = v;
      store.set(k, v);
    }
    renderAll();
    if (r.values.budgetHours || r.values.budgetWindow) runBudget();
    backupMsg(t().importOk((r.values.timetable || []).length, r.dropped));
  }

  // ---------- 전체 다시 그리기 ----------
  let homeCollapsed = store.get('homeCollapsed', false);
  function renderAll() {
    applyStaticText();
    renderAskExamples();
    renderAsk();
    renderList();
    renderFilterPresets();
    renderTimetable();
    renderCurriculum();
    if (planUI) planUI.render();
    renderBoard();
    renderViewSwitch();
    renderBudget();
    renderHome();
    renderAlerts();
    renderMyPanel();
    renderRecent();
    renderThemeButton();
    renderBanner();
    renderOvStatus();
    renderInstall();
    $('#home-toggle').textContent = homeCollapsed ? t().homeMore : '▲';
    $('#export-saved-cal').textContent = t().exportSavedCal;
    if ($('#welcome').open) renderWelcome();
    if (boot.visible && !$('#boot').hidden) renderBoot($('#boot-card').querySelector('.boot-actions') ? 'failed' : 'loading');
    if ($('#detail').open && state.openId) openDetail(state.openId, true);
    // 향상된 커스텀 위젯들(주간 타임라인, 오늘 마감 투두 등) 언어 동기화 트리거
    try {
      window.dispatchEvent(new CustomEvent('gongji:renderall', { detail: { lang: state.lang } }));
    } catch (_) {}
  }

  // ---------- 이벤트 연결 ----------
  function bind() {
    // 언어 선택은 PC(위쪽)와 휴대폰(설정 탭) 두 곳에 있고 서로 맞춰 줌
    document.querySelectorAll('.lang-control').forEach((sel) => {
      fill(sel, ...I.LANGS.map((l) => h('option', { value: l.code, lang: l.code }, l.name)));
      sel.addEventListener('change', (e) => {
        state.lang = e.target.value;
        store.set('lang', state.lang);
        renderAll();
      });
    });
    $('#sync-btn').addEventListener('click', () => refreshData(true));
    $('#export-mine').addEventListener('click', exportMine);
    // 시간표를 이미지로 저장 (js/ttimage.js)
    const ttImg = $('#tt-image');
    if (ttImg) {
      if (!window.GongjiTTImage) ttImg.hidden = true;
      else ttImg.addEventListener('click', () => {
        if (!state.timetable.length) { toast(t().ttImageEmpty); return; }
        const names = new Set(state.timetable.map((c) => c.name));
        const cur = window.GongjiPlan ? window.GongjiPlan.currentTerm(now) : null;
        window.GongjiTTImage.download(state.timetable, {
          kicker: t().ttImageTitle, title: cur ? t().termName(cur.year, cur.term) : t().ttImageTitle, sub: t().ttImageCount(names.size),
          dayName, colorOf: classColor, dark: document.documentElement.dataset.theme === 'dark', filename: 'gongji-timetable.png'
        }).then((ok) => { if (ok) toast(t().ttImageDone); });
      });
    }
    const ttIcs = $('#tt-ics');
    if (ttIcs) {
      if (!window.GongjiTTICS) ttIcs.hidden = true;
      else ttIcs.addEventListener('click', () => {
        if (!state.timetable.length) { toast(t().ttImageEmpty || '시간표에 수업이 없습니다.'); return; }
        const cur = window.GongjiPlan ? window.GongjiPlan.currentTerm(now) : null;
        const curName = (state.timetables.find((t) => t.id === state.activeTimetableId) || {}).name || '시간표';
        const ok = window.GongjiTTICS.download(state.timetable, {
          now,
          year: cur ? cur.year : 2026,
          filename: `건국대_시간표_${curName}.ics`
        });
        if (ok) toast('캘린더 파일(.ics)을 다운로드했습니다! 열어서 캘린더에 추가하세요.');
      });
    }
    $('#import-mine').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) importMine(f);
    });
    $('#q').addEventListener('input', (e) => { state.query = e.target.value; renderList(); });
    $('#q').addEventListener('change', rememberQuery);
    $('#mine-only').addEventListener('change', (e) => { state.mineOnly = e.target.checked; renderList(); });
    $('#unread-only').addEventListener('change', (e) => { state.unreadOnly = e.target.checked; renderList(); });
    $('#fit-only').addEventListener('change', (e) => { state.fitOnly = e.target.checked; store.set('fitOnly', state.fitOnly); renderList(); });
    $('#fit-setup').addEventListener('click', goProfile);
    $('#ask-form').addEventListener('submit', (e) => { e.preventDefault(); runAsk($('#ask-q').value); });
    $('#ask-q').addEventListener('search', (e) => { if (!e.target.value) runAsk(''); });
    // 해·달 버튼 · 알림 센터
    $('#theme-toggle').addEventListener('click', () => { if (TH) TH.toggle(); });
    document.addEventListener('gongji:theme', () => { renderThemeButton(); renderMyPanel(); });
    $('#alerts-btn').addEventListener('click', openAlerts);
    $('#alerts').addEventListener('close', markAlertsSeen);
    $('#board').addEventListener('change', (e) => { state.board = e.target.value; renderList(); });
    $('#field').addEventListener('change', (e) => { state.category = e.target.value; renderList(); });
    $('#status').addEventListener('change', (e) => { state.status = e.target.value; renderList(); });
    $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; store.set('sort', state.sort); renderList(); });
    document.querySelectorAll('.group-control').forEach((el) => el.addEventListener('change', (e) => {
      state.grouped = e.target.checked;
      store.set('grouped', state.grouped);
      document.querySelectorAll('.group-control').forEach((x) => { x.checked = state.grouped; });
      renderList();
    }));
    document.querySelectorAll('.hide-control').forEach((el) => el.addEventListener('change', (e) => {
      state.hideConflicts = e.target.checked;
      store.set('hideConflicts', state.hideConflicts);
      document.querySelectorAll('.hide-control').forEach((x) => { x.checked = state.hideConflicts; });
      renderList();
    }));

    fillTimeSelects();
    $('#add-class-btn').addEventListener('click', () => openClassDialog());
    $('#btn-mode-regular')?.addEventListener('click', () => {
      if (!classEdit.days.size) classEdit.days = new Set([1]);
      updateClassModeUI(false);
      renderDayPicks();
    });
    $('#btn-mode-elearn')?.addEventListener('click', () => {
      updateClassModeUI(true);
    });
    $('#class-form').addEventListener('submit', (e) => { e.preventDefault(); saveClass(); });
    $('#class-more').addEventListener('click', () => saveClass(true));
    $('#class-name').addEventListener('input', () => {
      classEdit.extra = [];
      classEdit.rooms = {};
      renderExtraNote();
      showSuggest();
      const val = $('#class-name').value.trim();
      checkTransferredCourseWarning(val);
      const profInput = $('#class-prof');
      if (val && profInput && !profInput.value.trim()) {
        const auto = findProfForCourse(val);
        if (auto) {
          profInput.value = auto;
          classEdit.prof = auto;
        }
      }
    });
    $('#class-name').addEventListener('focus', showSuggest);
    $('#class-name').addEventListener('blur', () => setTimeout(hideSuggest, 120));
    $('#class-cancel').addEventListener('click', () => $('#class-dialog').close());

    // 시간표 스냅 단위 토글 (30분 대학 표준 / 10분 미세조정)
    $('#btn-snap-30')?.addEventListener('click', () => {
      window.GONGJI_SNAP_STEP = 30;
      try { localStorage.setItem('gongji:snapStep', '30'); } catch {}
      updateSnapUI();
      toast('30분 스냅 이동 모드로 설정되었습니다. (대학 정규 교시 표준)');
    });
    $('#btn-snap-10')?.addEventListener('click', () => {
      window.GONGJI_SNAP_STEP = 10;
      try { localStorage.setItem('gongji:snapStep', '10'); } catch {}
      updateSnapUI();
      toast('10분 미세조정 이동 모드로 설정되었습니다.');
    });

    // 수업 상세 수정 모달 빠른 시간 이동 버튼
    $('#btn-shift-prev30')?.addEventListener('click', () => {
      const s = getTime('start');
      const e = getTime('end');
      const dur = e - s;
      const step = window.GONGJI_SNAP_STEP || 30;
      const newS = Math.max(TT_HOURS.first * 60, s - step);
      setTime('start', newS);
      setTime('end', newS + dur);
    });
    $('#btn-shift-next30')?.addEventListener('click', () => {
      const s = getTime('start');
      const e = getTime('end');
      const dur = e - s;
      const step = window.GONGJI_SNAP_STEP || 30;
      const newS = Math.min(TT_HOURS.last * 60 - dur, s + step);
      setTime('start', newS);
      setTime('end', newS + dur);
    });
    $('#btn-shift-add30')?.addEventListener('click', () => {
      const s = getTime('start');
      const e = getTime('end');
      const step = window.GONGJI_SNAP_STEP || 30;
      const newE = Math.min(TT_HOURS.last * 60, e + step);
      setTime('end', newE);
      renderDurations();
    });
    $('#btn-shift-sub30')?.addEventListener('click', () => {
      const s = getTime('start');
      const e = getTime('end');
      const step = window.GONGJI_SNAP_STEP || 30;
      const newE = Math.max(s + step, e - step);
      setTime('end', newE);
      renderDurations();
    });
    $('#class-delete').addEventListener('click', () => {
      // 월·목처럼 요일마다 칸이 따로 저장되는 같은 수업(이름이 같은 칸)은 한꺼번에 지운다.
      const key = (c) => String(c.name || '').trim().toLowerCase();
      const me = state.timetable.find((c) => c.id === classEdit.id);
      const gone = me ? state.timetable.filter((c) => c.id === me.id || (key(me) && key(c) === key(me))) : [];
      const before = state.timetable;
      state.timetable = before.filter((c) => !gone.includes(c));
      saveTimetable();
      $('#class-dialog').close();
      timetableChanged();
      if (gone.length > 1) {
        toast(({ ko: `'${me.name}' ${gone.length}칸을 모두 지웠어요`, en: `Removed all ${gone.length} slots of '${me.name}'`, zh: `已删除“${me.name}”的全部 ${gone.length} 个时段`, ja: `「${me.name}」の${gone.length}コマをすべて削除しました` })[state.lang] || `'${me.name}' ×${gone.length}`,
          { label: t().undo, run: () => { state.timetable = before; saveTimetable(); timetableChanged(); } });
      } else if (me) {
        toast(({ ko: `'${me.name}' 수업을 삭제했어요`, en: `Removed '${me.name}'`, zh: `已删除“${me.name}”课程`, ja: `「${me.name}」を削除しました` })[state.lang] || `'${me.name}' 삭제`,
          { label: t().undo, run: () => { state.timetable = before; saveTimetable(); timetableChanged(); } });
      }
    });
    // 시작 시각을 바꾸면 수업 길이는 그대로 두고 끝 시각을 같이 옮김
    let lastLen = 90;
    for (const id of ['#start-h', '#start-m']) {
      $(id).addEventListener('focus', () => { lastLen = getTime('end') - getTime('start'); });
      $(id).addEventListener('change', () => {
        if (lastLen > 0) setTime('end', getTime('start') + lastLen);
        lastLen = getTime('end') - getTime('start');
        renderDurations(); showClassError('');
      });
    }
    for (const id of ['#end-h', '#end-m']) {
      $(id).addEventListener('change', () => { renderDurations(); showClassError(''); });
    }
    $('#tt-selector')?.addEventListener('change', (e) => switchTimetable(e.target.value));
    $('#tt-new-btn')?.addEventListener('click', () => addTimetable());
    $('#tt-dup-btn')?.addEventListener('click', () => duplicateTimetable());
    $('#tt-manage-btn')?.addEventListener('click', () => manageTimetable());

    $('#example-tt').addEventListener('click', loadExampleTimetable);
    $('#clear-tt').addEventListener('click', () => {
      const before = state.timetable;
      if (!before.length) return;
      state.timetable = [];
      saveTimetable();
      timetableChanged();
      // 실수로 눌러도 되돌릴 수 있게
      toast(t().clearedTimetable(before.length), { label: t().undo, run: () => { state.timetable = before; saveTimetable(); timetableChanged(); } });
    });

    // 휴대폰: 검색 옆 '필터·정렬' 버튼으로 선택 상자와 체크 항목을 펼치고 접는다
    $('#filter-toggle').addEventListener('click', (e) => {
      const open = !document.querySelector('.content').classList.contains('filters-open');
      document.querySelector('.content').classList.toggle('filters-open', open);
      e.currentTarget.setAttribute('aria-expanded', String(open));
    });
    // 길게 내려갔을 때 맨 위로
    const toTop = $('#to-top');
    const onScroll = () => { toTop.hidden = window.scrollY < 900; };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    toTop.addEventListener('click', () => {
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });

    $('#budget-form').addEventListener('submit', (e) => { e.preventDefault(); runBudget(); });
    $('#budget-selective').addEventListener('change', (e) => {
      state.budgetSelective = e.target.checked;
      store.set('budgetSelective', state.budgetSelective);
      runBudget();
      renderHome();
    });

    // 저장한 공지 · 필터 초기화 · 홈 접기 · 안내 · 설치 · 운영 안내 닫기
    $('#saved-only').addEventListener('change', (e) => { state.savedOnly = e.target.checked; if (state.savedOnly) state.status = 'all'; applyStaticText(); renderList(); });
    $('#reset-filters').addEventListener('click', resetFilters);
    $('#home-toggle').addEventListener('click', () => {
      homeCollapsed = !homeCollapsed;
      store.set('homeCollapsed', homeCollapsed);
      document.body.classList.toggle('home-collapsed', homeCollapsed);
      $('#home-toggle').setAttribute('aria-expanded', String(!homeCollapsed));
      $('#home-toggle').textContent = homeCollapsed ? t().homeMore : '▲';
    });
    $('#show-guide').addEventListener('click', openWelcome);
    $('#welcome').addEventListener('close', () => { store.set('onboarded', true); renderMyPanel(); });
    $('#welcome-start').addEventListener('click', () => { if (wStep < 2) { wStep += 1; renderWelcome(); } else closeWelcome(); });
    $('#welcome-example').addEventListener('click', () => {
      if (wStep === 0) { loadExampleTimetable(); closeWelcome(); } else { wStep -= 1; renderWelcome(); }
    });
    $('#export-saved-cal').addEventListener('click', () => exportCalendar(DATA.notices.filter((n) => isSaved(n.id)), 'gongji-saved'));
    $('#notice-banner-close').addEventListener('click', () => { store.set('bannerClosed', ov.parsed.banner); renderBanner(); });
    $('#install-btn').addEventListener('click', async () => {
      if (!installEvent) return;
      installEvent.prompt();
      try { await installEvent.userChoice; } catch (e) { /* 무시 */ }
      installEvent = null;
      renderInstall();
    });
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; renderInstall(); });
    window.addEventListener('appinstalled', () => { installEvent = null; renderInstall(); toast(t().installed); });
    window.addEventListener('online', renderSync);
    window.addEventListener('offline', renderSync);
    // 키보드: / 를 누르면 검색 칸으로
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      if (document.body.dataset.tab !== 'notices') { location.hash = '#/notices'; setTab('notices', false); }
      $('#q').focus();
    });

    // 상세 창: ← → 로 이전·다음 공지, s 로 저장
    document.addEventListener('keydown', (e) => {
      if (!$('#detail').open || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); stepDetail(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepDetail(-1); }
      else if ((e.key === 's' || e.key === 'S') && state.openId) { e.preventDefault(); toggleSave(state.openId); }
    });
    // 휴대폰: 상세 창을 옆으로 밀어 이전·다음 공지 (옆으로 밀리는 칸 안에서는 무시)
    {
      const db = $('#detail-body');
      let start = null;
      db.addEventListener('touchstart', (e) => {
        const p = e.touches[0];
        const inScroller = e.target.closest && e.target.closest('.chips, .evidence, table, pre');
        start = e.touches.length === 1 && !inScroller ? { x: p.clientX, y: p.clientY, at: Date.now() } : null;
      }, { passive: true });
      db.addEventListener('touchend', (e) => {
        if (!start) return;
        const p = e.changedTouches[0];
        const dx = p.clientX - start.x;
        const dy = p.clientY - start.y;
        const quick = Date.now() - start.at < 700;
        start = null;
        if (quick && Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.5) stepDetail(dx < 0 ? 1 : -1);
      }, { passive: true });
    }

    // 휴대폰: 상세 시트의 손잡이(맨 위)를 아래로 끌어 내리면 닫기
    {
      const sheet = $('#detail');
      const narrow = window.matchMedia ? window.matchMedia('(max-width: 899px)') : { matches: false };
      let drag = null;
      sheet.addEventListener('touchstart', (e) => {
        if (!narrow.matches || e.touches.length !== 1) return;
        const top = sheet.getBoundingClientRect().top;
        const y = e.touches[0].clientY;
        const onHandle = e.target.closest('.detail-nav') && !e.target.closest('button');
        if (onHandle || (y - top < 44 && $('#detail-body').scrollTop <= 0)) drag = { y, dy: 0 };
      }, { passive: true });
      sheet.addEventListener('touchmove', (e) => {
        if (!drag) return;
        drag.dy = Math.max(0, e.touches[0].clientY - drag.y);
        sheet.style.transition = 'none';
        sheet.style.translate = `0 ${drag.dy}px`;
      }, { passive: true });
      const end = () => {
        if (!drag) return;
        const close = drag.dy > 110;
        drag = null;
        sheet.style.transition = '';
        sheet.style.translate = '';
        if (close) sheet.close();
      };
      sheet.addEventListener('touchend', end, { passive: true });
      sheet.addEventListener('touchcancel', end, { passive: true });
    }

    // 대화상자: 바깥을 눌러 닫기(closedby="any")를 지원하지 않는 브라우저(Safari)용 보완
    const dlg = $('#detail');
    dlg.addEventListener('close', () => {
      state.openId = null;
      dlg.returnValue = '';
      if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      if (/^#\/n\//.test(location.hash)) {
        try { history.replaceState(null, '', '#/' + (document.body.dataset.tab || 'notices')); } catch (e) { /* 무시 */ }
      }
    });
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      for (const d of [dlg, $('#class-dialog'), $('#alerts')]) {
        const outside = (e) => {
          const r = d.getBoundingClientRect();
          return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        };
        let pressedOutside = false;
        d.addEventListener('pointerdown', (e) => { pressedOutside = outside(e); });
        d.addEventListener('pointerup', (e) => { if (pressedOutside && outside(e)) d.close(); });
      }
    }

    // 분류 칩 줄: 옆으로 밀기. 손가락은 브라우저가 처리하고, 마우스(PC에서 모바일 화면 보기 포함)는 끌기와 휠로 처리
    const enableChipSwipe = (chips) => {
    const edge = () => {
      const max = chips.scrollWidth - chips.clientWidth;
      chips.classList.toggle('can-left', chips.scrollLeft > 4);
      chips.classList.toggle('can-right', chips.scrollLeft < max - 4);
    };
    let drag = null;
    chips.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, left: chips.scrollLeft, moved: false };
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 5) { drag.moved = true; chips.classList.add('dragging'); }
      if (drag.moved) chips.scrollLeft = drag.left - dx;
    });
    const endDrag = () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      chips.classList.remove('dragging');
      if (moved) {
        // 끌기를 마칠 때 칩이 눌리지 않도록 바로 뒤의 클릭 한 번을 막음
        const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
        chips.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => chips.removeEventListener('click', stop, { capture: true }), 0);
      }
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    chips.addEventListener('wheel', (e) => {
      if (chips.scrollWidth <= chips.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      chips.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
    chips.addEventListener('scroll', edge, { passive: true });
    new ResizeObserver(edge).observe(chips);
    new MutationObserver(edge).observe(chips, { childList: true });
    edge();
    };
    enableChipSwipe($('#chips'));
    enableChipSwipe($('#subchips'));

    // 휴대폰 아래 탭: 주소 끝(#/timetable 등)으로 화면을 바꿔서 뒤로 가기 버튼도 동작
    window.addEventListener('hashchange', () => {
      setTab(tabFromHash(), true);
      openFromHash();
    });
    // 누르는 즉시 화면을 바꿈 (주소 변경은 링크가 그대로 처리)
    document.querySelectorAll('.tabbar a').forEach((a) => {
      a.addEventListener('click', () => setTab(a.dataset.tab, true));
    });
  }

  if (!L || !I || !S || !P || !C) {
    document.body.prepend(h('p', { class: 'banner' }, '스크립트를 불러오지 못했습니다. 폴더 구조를 확인하세요.'));
    return;
  }
  bind();
  // 이수 내역 · 수강신청 추천 (js/planui.js): 시간표 화면 안의 두 보기
  planUI = window.GongjiPlanUI && window.GongjiPlan ? window.GongjiPlanUI.mount({
    h, store, toast, t, now, dayName, classColor,
    getLang: () => state.lang,
    getProfile: () => state.profile,
    getDept: () => state.dept,
    getTimetable: () => state.timetable,
    onChange: () => renderHome(),
    setTimetable: (classes, msg) => {
      const before = state.timetable;
      state.timetable = classes.filter(L.isValidClass);
      saveTimetable();
      timetableChanged();
      toast(msg, { label: t().undo, run: () => { state.timetable = before; saveTimetable(); timetableChanged(); } });
    }
  }) : null;
  // 빠른 실행 (Ctrl+K): 화면 이동·동작·공지·과목을 한 칸에서
  palette = window.GongjiPalette ? window.GongjiPalette.mount({ h, t, items: paletteItems }) : null;
  const palBtn = $('#palette-btn');
  if (palBtn) { if (palette) palBtn.addEventListener('click', () => palette.open()); else palBtn.hidden = true; }
  document.body.classList.toggle('home-collapsed', homeCollapsed);
  renderAll();
  setTab(tabFromHash(), false);
  openFromHash();
  detectServer();
  runBudget();
  loadOverrides();
  if (CFG.overridesUrl) setInterval(loadOverrides, Math.max(5, CFG.refreshMinutes || 30) * 60000);
  registerWorker();
  // 공지가 하나도 없으면 서버에서 받아 오는 불러오기 화면부터 (서버를 쓸 수 없으면 안내만)
  const noData = !DATA.notices.length;
  if (noData && !syncOn()) showBoot('nodata');
  else maybeWelcome();
  window.GongjiApp = {
    openDetail,
    toggleApplied,
    isApplied,
    getState: () => state,
    renderHome,
    renderList,
    toast,
    t
  };
  if (syncOn()) {
    refreshData(false, { blocking: noData, startup: true });
    setInterval(() => refreshData(false), (CFG.refreshMinutes || 30) * 60000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - sync.last > 10 * 60000) refreshData(false);
    });
  }
})();
