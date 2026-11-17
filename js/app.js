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
    { day: 1, start: '13:30', end: '15:00', names: { ko: '이산수학', en: 'Discrete Math', zh: '离散数学', ja: '離散数学' } },
    { day: 3, start: '13:00', end: '14:30', names: { ko: '컴퓨터공학개론', en: 'Intro to Computer Eng.', zh: '计算机工程概论', ja: 'コンピュータ工学概論' } },
    { day: 4, start: '16:30', end: '18:00', names: { ko: '자료구조', en: 'Data Structures', zh: '数据结构', ja: 'データ構造' } },
    { day: 5, start: '10:30', end: '12:00', names: { ko: '대학영어', en: 'College English', zh: '大学英语', ja: '大学英語' } }
  ];

  const state = {
    lang: initialLang(),
    query: '',
    board: '',
    status: 'open',
    sort: store.get('sort', 'deadline'),
    category: '',
    group: '',
    sub: '',
    grouped: store.get('grouped', false),
    timetable: (store.get('timetable', []) || []).filter(L.isValidClass),
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
  const activeNotices = () => DATA.notices.filter((n) => !isApplied(n.id));
  const personalCtx = () => ({ keywords: state.keywords, interests: state.interests });
  const mineOf = (n) => P.mine(n, personalCtx());
  const hasMine = () => state.keywords.length > 0 || state.interests.length > 0;
  // 검색어와 같은 글자를 노란 형광펜으로 (두 글자 이상일 때)
  function hl(text) {
    const q = state.query.trim();
    if (q.length < 2 || !text) return text;
    const low = text.toLowerCase();
    const ql = q.toLowerCase();
    const out = [];
    let i = 0;
    for (;;) {
      const k = low.indexOf(ql, i);
      if (k < 0) break;
      out.push(text.slice(i, k), h('mark', null, text.slice(k, k + q.length)));
      i = k + q.length;
    }
    out.push(text.slice(i));
    return out;
  }
  // 게시판 이름: 한국어가 아니면 번역 이름 (없으면 원래 이름)
  const boardLabel = (b) => (state.lang !== 'ko' && I.BOARD_NAMES[b] && I.BOARD_NAMES[b][state.lang]) || b;

  // 자리 비움(null·undefined·false)을 건너뛰고 요소의 내용을 통째로 바꾼다 (replaceChildren 에 null 을 그대로 주면 'null' 글자가 찍힘)
  function fill(el, ...kids) {
    el.replaceChildren(...kids.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  }
  // 안전하게 요소 만들기 (데이터는 textContent 로만 넣어서 HTML 주입을 막음)
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
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
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t()[el.dataset.i18nPlaceholder];
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t()[el.dataset.i18nAria]);
    });
    document.querySelectorAll('.today-text').forEach((el) => { el.textContent = I.formatDate(now, state.lang); });
    document.querySelectorAll('.data-info').forEach((el) => { el.textContent = t().dataInfo(DATA.meta); });
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
    if (state.unreadOnly) base = base.filter((n) => !isRead(n.id));
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
    list = L.sortNotices(list, state.sort, now);
    let hidden = 0;
    if (state.hideConflicts && state.timetable.length) {
      const before = list.length;
      list = list.filter((n) => L.findConflicts(n, state.timetable).length === 0);
      hidden = before - list.length;
    }
    list = list.filter((n) => n.pinned).concat(list.filter((n) => !n.pinned));      // 운영자가 '중요'로 표시한 공지는 맨 위
    return { base, counts, subCounts, list, hidden };
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
    if (!def || def.subs.length < 2) { row.hidden = true; fill(row, ); return; }
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
    renderListTools();
    if (state.savedOnly) renderList();
    renderHome();
    renderAlerts();
    if ($('#detail').open && state.openId) openDetail(state.openId, true);
    if (!quiet) toast(was ? t().unsavedToastMsg : t().savedToastMsg, { label: t().undo, run: () => toggleSave(id, true) });
  }

  // ---------- 지원 완료 ----------
  function toggleApplied(id, quiet) {
    const was = isApplied(id);
    state.applied = P.toggle(state.applied, id, 500);
    store.set('applied', state.applied);
    state.budgetResult = null;
    renderList();
    renderHome();
    renderAlerts();
    if ($('#detail').open && state.openId) openDetail(state.openId, true);
    if (document.body.dataset.tab === 'budget') runBudget();
    if (!quiet) toast(was ? t().unappliedToast : t().appliedToast, { label: t().undo, run: () => toggleApplied(id, true) });
  }
  function markRead(id) {
    if (isRead(id)) return;
    state.read = P.touch(state.read, id, 400);
    store.set('read', state.read);
    const li = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    if (li) li.classList.add('is-read');
  }

  // ---------- 핵심 정보 줄: 모든 공지가 같은 순서(대상 · 마감 · 혜택 · 일정)로 보인다 ----------
  function keyInfo(n) {
    const T = t();
    const left = L.daysLeft(n.deadline, now);
    const urgent = !L.isExpired(n, now) && left !== null && left <= 3;
    const item = (cls, label, value, missing) => h('div', { class: 'ki ' + cls + (missing ? ' missing' : '') + (cls === 'deadline' && urgent && !missing ? ' urgent' : '') },
      h('span', { class: 'ki-label' }, label), h('span', { class: 'ki-value' }, missing ? T.notStated : value));
    const ev = n.events && n.events.length ? formatEvent(n.events[0]) + (n.events.length > 1 ? ` +${n.events.length - 1}` : '') : '';
    return h('div', { class: 'keyinfo' },
      item('who', T.eligibility, n.eligibility ? tr(n.eligibility) : '', !n.eligibility),
      item('deadline', T.deadline, n.deadline ? I.formatDateTime(L.parseLocal(n.deadline), state.lang) : '', !n.deadline),
      item('benefit', T.benefit, n.benefit ? tr(n.benefit.text) : '', !n.benefit),
      ev ? item('when', T.when, ev, false) : null);
  }

  function card(n) {
    const conflicts = L.findConflicts(n, state.timetable);
    const expired = L.isExpired(n, now);
    const imageOnly = n.bodyStatus === 'image';
    const sm = S.pick(n, state.lang);
    const mine = mineOf(n);
    return h('li', {
      'data-id': n.id,
      class: 'card' + (expired ? ' is-expired' : '') + (conflicts.length ? ' has-conflict' : '') + (n.pinned ? ' is-pinned' : '')
        + (isRead(n.id) ? ' is-read' : '') + (isApplied(n.id) ? ' is-applied' : '')
    },
      h('div', { class: 'card-top' },
        X.isNew(n, since) ? h('span', { class: 'new-badge' }, t().newBadge) : null,
        n.pinned ? h('span', { class: 'pin-badge' }, t().pinnedBadge) : null,
        isApplied(n.id) ? h('span', { class: 'applied-badge' }, t().appliedBadge) : null,
        mine.any ? h('span', { class: 'mine-badge', title: mine.keywords.join(', ') }, t().mineBadge) : null,
        n.aiPending ? h('span', { class: 'pending-badge', title: t().aiPendingNote }, t().aiPendingBadge) : null,
        ...L.classifyBenefit(n).subs.slice(0, 2).map((sb) => subTag(n, sb)),
        h('span', { class: 'board' }, `${catLabel(n.category)} · ${boardsOf(n)}`),
        ddayBadge(n),
        starButton(n)),
      h('h3', { class: 'card-title' },
        h('button', { type: 'button', class: 'card-link', 'aria-haspopup': 'dialog', onclick: () => openDetail(n.id) }, hl(titleOf(n)))),
      state.lang !== 'ko' ? h('p', { class: 'card-orig', lang: 'ko' }, n.title) : null,
      sm.text ? h('p', { class: 'card-summary' }, hl(sm.text)) : null,
      n.opNote ? h('p', { class: 'op-note' }, `${t().opNoteLabel}: ${n.opNote}`) : null,
      imageOnly ? null : keyInfo(n),
      (conflicts.length || imageOnly || fromMedia(n)) ? h('div', { class: 'badges' },
        conflicts.length ? h('span', { class: 'badge conflict' }, t().conflict) : null,
        imageOnly ? h('span', { class: 'badge warn' }, t().imageOnly) : null,
        fromMedia(n) ? h('span', { class: 'badge media' }, t().readMedia) : null) : null
    );
  }

  const filtersActive = () => !!(state.query || state.board || state.category || state.group || state.sub || state.savedOnly || state.mineOnly || state.unreadOnly || state.due || state.status !== 'open');
  function resetFilters() {
    Object.assign(state, { query: '', board: '', category: '', group: '', sub: '', savedOnly: false, mineOnly: false, unreadOnly: false, due: '', status: 'open' });
    $('#q').value = '';
    applyStaticText();
    renderList();
  }
  function renderListTools() {
    const mineWrap = $('#mine-only-wrap');
    if (mineWrap) { mineWrap.hidden = !hasMine() && !state.mineOnly; $('#mine-only').checked = state.mineOnly; }
    const unread = $('#unread-only');
    if (unread) unread.checked = state.unreadOnly;
    const label = $('#saved-only-label');
    if (label) label.textContent = t().savedOnly(state.saved.length);
    const chk = $('#saved-only');
    if (chk) chk.checked = state.savedOnly;
    const btn = $('#reset-filters');
    if (btn) btn.hidden = !filtersActive();
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

  function renderList() {
    // 조건(검색·분류·정렬 …)이 바뀌면 처음 30건부터 다시 보여 준다
    const sig = JSON.stringify([state.query, state.board, state.category, state.status, state.sort, state.group, state.sub,
      state.savedOnly, state.mineOnly, state.unreadOnly, state.due, state.grouped, state.hideConflicts, state.lang]);
    if (sig !== state.sig) { state.sig = sig; state.limit = PAGE; }
    const { base, counts, subCounts, list: full, hidden } = computeVisible();
    const list = full.slice(0, state.limit);
    const rest = full.length - list.length;
    renderListTools();
    renderChips(counts, subCounts, base.length);
    $('#count').textContent = t().count(full.length) + (hidden ? ` · ${t().hiddenByConflict(hidden)}` : '');
    const box = $('#list');
    if (!list.length) {
      fill(box, h('div', { class: 'empty' },
        h('p', null, state.savedOnly && !state.saved.length ? t().savedEmpty : t().empty),
        filtersActive() ? h('button', { type: 'button', class: 'btn small', onclick: resetFilters }, t().resetFilters) : null));
      return;
    }
    if (state.grouped) {
      fill(box, ...L.groupByBenefit(list).map((g) =>
        h('section', { class: 'group' },
          h('h3', { class: 'group-title' },
            h('span', { class: 'tag kind-' + g.group }, groupLabel(g.group)),
            h('span', { class: 'group-count' }, t().count(g.items.length))),
          h('ul', { class: 'cards' }, g.items.map(card)))));
    } else {
      fill(box, h('ul', { class: 'cards' }, list.map(card)));
    }
    if (rest > 0) {
      box.append(h('button', { type: 'button', class: 'btn more-btn', onclick: () => { state.limit += PAGE; renderList(); } }, t().moreItems(rest)));
    }
  }

  // ---------- 해독 카드 (상세 대화상자) ----------
  function fact(label, value, missing) {
    return [h('dt', null, label), h('dd', { class: missing ? 'missing' : null }, value)];
  }

  function detailContent(n) {
    const T = t();
    const conflicts = L.findConflicts(n, state.timetable);
    const parts = [];

    parts.push(h('div', { class: 'card-top' },
      ...L.classifyBenefit(n).subs.map((sb) => subTag(n, sb)),
      h('span', { class: 'board' }, `${catLabel(n.category)} · ${boardsOf(n)}`),
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
      sm.text ? [h('p', null, sm.text), n.aiPending ? null : h('p', { class: 'ai-note' }, T.aiNote)] : h('p', { class: 'summary-none' }, T.summaryNone)));

    if (n.bodyStatus !== 'image') {
      const eventsNode = n.events && n.events.length
        ? h('ul', { class: 'plain' }, n.events.map((ev) => h('li', null, formatEvent(ev))),
            conflicts.map((c) => h('li', { class: 'conflict-note' }, T.conflictWith(c.cls, dayName(c.cls.day)))))
        : null;
      parts.push(h('dl', { class: 'facts' },
        n.deadline
          ? fact(T.deadline, [I.formatDateTime(L.parseLocal(n.deadline), state.lang), ' ', ddayBadge(n)])
          : fact(T.deadline, T.notStated, true),
        n.benefit ? fact(T.benefit, tr(n.benefit.text)) : fact(T.benefit, T.notStated, true),
        fact(T.category, catLabel(n.category)),
        n.eligibility ? fact(T.eligibility, tr(n.eligibility)) : fact(T.eligibility, T.notStated, true),
        eventsNode ? fact(T.when, eventsNode) : null,
        n.hours ? fact(T.hours, T.hoursValue(n.hours)) : null));
    }

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

    parts.push(h('div', { class: 'd-actions' },
      h('button', {
        type: 'button', class: 'btn small' + (isApplied(n.id) ? ' is-on' : ''), 'aria-pressed': String(isApplied(n.id)),
        title: isApplied(n.id) ? T.appliedUnmark : T.appliedMark, 'aria-label': isApplied(n.id) ? T.appliedUnmark : T.appliedMark,
        onclick: () => toggleApplied(n.id)
      }, isApplied(n.id) ? '✓ ' + T.appliedBadge : T.appliedMark),
      h('button', { type: 'button', class: 'btn small', onclick: () => exportCalendar([n], 'gongji-' + n.id) }, T.addToCalendar),
      h('button', { type: 'button', class: 'btn small', onclick: () => shareNotice(n) }, navigator.share ? T.share : T.copyLink)));

    if (!n.link) parts.push(h('p', { class: 'original' }, h('span', { class: 'fine' }, T.noOriginal)));

    return parts;
  }

  // 상세 창 아래 고정 줄: 어디까지 내려 읽었든 저장과 원문 보기를 바로 누를 수 있게 한다
  const glossFold = { id: null, open: false };
  function detailFoot(n) {
    const T = t();
    const saved = isSaved(n.id);
    return [
      h('button', { type: 'button', class: 'btn' + (saved ? ' is-on' : ''), 'aria-pressed': String(saved), onclick: () => toggleSave(n.id) },
        (saved ? '★ ' : '☆ ') + (saved ? T.savedNotice : T.saveNotice)),
      n.link ? h('a', { href: n.link, target: '_blank', rel: 'noopener noreferrer', class: 'btn primary' }, T.original + ' ↗') : null
    ];
  }

  function openDetail(id, keepScroll) {
    const n = DATA.notices.find((x) => x.id === id);
    if (!n) return;
    state.openId = id;
    const body = $('#detail-body');
    const top = body.scrollTop;
    fill(body, ...detailContent(n));
    fill($('#detail-foot'), ...detailFoot(n));
    const dlg = $('#detail');
    if (!dlg.open) {
      dlg.showModal();
      try { history.replaceState(null, '', '#/n/' + encodeURIComponent(id)); } catch (e) { /* 주소 바꾸기 실패는 무시 */ }
    }
    body.scrollTop = keepScroll ? top : 0;
    markRead(id);
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

  function saveTimetable() {
    store.set('timetable', state.timetable);
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
      const chip = (c) => h('button', {
        type: 'button', class: 'course-chip' + (c.kind === '전필' ? ' req' : ''),
        title: [c.kind, c.term, c.credit ? T.creditN(c.credit) : ''].filter(Boolean).join(' · '),
        onclick: () => openClassDialog({ name: c.name })
      }, c.name, c.kind === '전필' ? h('span', { class: 'req-mark' }, T.reqMark) : null);
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

  function renderTimetable() {
    renderCalendar();
    const badge = $('#badge-timetable');
    badge.hidden = state.timetable.length === 0;
    badge.textContent = String(state.timetable.length);

    const tt = state.timetable;
    // 월~금은 항상, 토·일은 수업이 있을 때만 칸을 만든다
    const days = DAY_ORDER.filter((d) => (d >= 1 && d <= 5) || tt.some((c) => c.day === d));
    let from = TT_DEFAULT.from;
    let to = TT_DEFAULT.to;
    for (const c of tt) {
      from = Math.min(from, Math.floor(L.toMinutes(c.start) / 60));
      to = Math.max(to, Math.ceil(L.toMinutes(c.end) / 60));
    }
    const base = from * 60;
    const span = (to - from) * 60;
    const pct = (m) => `${((m - base) / span) * 100}%`;

    const head = h('div', { class: 'tt-head' }, h('span'), ...days.map((d) => h('span', null, dayName(d))));
    const hours = h('div', { class: 'tt-hours', 'aria-hidden': 'true' },
      ...Array.from({ length: to - from }, (_, i) => h('span', null, String(from + i))));
    const cols = days.map((d) => {
      const blocks = tt.filter((c) => c.day === d).map((c) => {
        const s = L.toMinutes(c.start);
        const e = L.toMinutes(c.end);
        const name = c.name || t().classFallback;
        return h('button', {
          type: 'button', class: 'tt-class',
          style: `top:${pct(s)};height:${pct(e - s + base)};--c:${classColor(c.name)}`,
          'aria-label': `${dayName(d)} ${c.start}~${c.end} ${name}`,
          onclick: (ev) => { ev.stopPropagation(); openClassDialog({ cls: c }); }
        }, h('span', { class: 'tt-name' }, name), h('span', { class: 'tt-time' }, `${c.start}~\u200b${c.end}`),
          c.room ? h('span', { class: 'tt-room' }, c.room) : null);
      });
      return h('div', {
        class: 'tt-col', 'data-day': String(d),
        // 빈 칸을 누르면 그 요일·그 시각(정각)으로 새 수업 넣기
        onclick: (ev) => {
          const r = ev.currentTarget.getBoundingClientRect();
          const m = base + Math.floor(((ev.clientY - r.top) / r.height) * (to - from)) * 60;
          openClassDialog({ day: d, start: Math.max(TT_HOURS.first * 60, Math.min(m, TT_HOURS.last * 60 - 60)) });
        }
      }, ...blocks);
    });
    const body = h('div', { class: 'tt-body' }, hours, ...cols);
    const box = $('#tt');
    box.style.setProperty('--cols', String(days.length));
    box.style.setProperty('--rows', String(to - from));
    fill(box, head, body);
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
        h('span', { class: 'cal-what' }, tr(x.title)))),
      h('p', { class: 'fine' }, t().calendarSource(cal.generatedAt))));
  }

  function timetableChanged() {
    renderTimetable();
    renderList();
    renderHome();
    if (state.budgetResult) runBudget();
    if ($('#detail').open && state.openId) openDetail(state.openId);
  }

  // 수업 넣기·고치기 창
  const classEdit = { id: null, days: new Set(), extra: [], rooms: {} };   // rooms: 강의 시간표에서 고른 수업의 '요일|시작' → 강의실

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
    const hits = T.courses.filter((c) => normName(c.n).includes(q));
    const mine = (c) => (state.dept && c.d && (c.d.includes(state.dept) || state.dept.includes(c.d)) ? 0 : 1);
    hits.sort((a, b) => (normName(a.n).startsWith(q) ? 0 : 1) - (normName(b.n).startsWith(q) ? 0 : 1) || mine(a) - mine(b) || a.n.localeCompare(b.n) || a.s.localeCompare(b.s));
    return hits.slice(0, 6).map((c) => ({
      name: c.n, slots: c.t,
      label: [c.s ? `${c.s}분반` : '', slotText(c.t), c.d, c.k].filter(Boolean).join(' · ')
    }));
  }

  function pickLecture(item) {
    const groups = groupSlots(item.slots);
    const first = groups[0];
    classEdit.days = new Set(first.days);
    setTime('start', toMin(first.start));
    setTime('end', toMin(first.end));
    // 나머지 시간(요일마다 시간이 다른 경우)은 저장할 때 함께 넣는다.
    classEdit.extra = groups.slice(1).flatMap((g) => g.days.map((d) => ({ day: d, start: g.start, end: g.end })));
    classEdit.rooms = {};
    for (const [d, a, , room] of item.slots) if (room) classEdit.rooms[`${d}|${a}`] = room;
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
    const plain = q
      ? [...courseList.filter((c) => normName(c.name).startsWith(q)), ...courseList.filter((c) => !normName(c.name).startsWith(q) && normName(c.name).includes(q))]
          .filter((c) => !taken.has(normName(c.name)) && c.name !== input.value.trim())
      : [];
    const shown = [...lectures, ...plain.slice(0, Math.max(0, 8 - lectures.length))];
    box.replaceChildren(...shown.map((c) => h('li', { role: 'option' },
      h('button', { type: 'button', onpointerdown: (e) => e.preventDefault(), onclick: () => {
        input.value = c.name;
        classEdit.extra = [];
        classEdit.rooms = {};
        renderExtraNote();
        if (c.slots) pickLecture(c);
        hideSuggest(); input.focus();
      } }, h('span', {}, c.name), h('small', {}, c.label || '')))));
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

  function openClassDialog({ cls = null, day = 1, start = 9 * 60, name = '' } = {}) {
    classEdit.id = cls ? cls.id : null;
    classEdit.days = new Set([cls ? cls.day : day]);
    classEdit.extra = [];
    classEdit.rooms = {};
    renderExtraNote();
    $('#class-dialog-title').textContent = cls ? t().editClass : t().addClass;
    $('#class-name').value = cls ? cls.name || '' : name;
    const s = cls ? L.toMinutes(cls.start) : start;
    setTime('start', s);
    setTime('end', cls ? L.toMinutes(cls.end) : s + 90);
    $('#class-delete').hidden = !cls;
    $('#class-delete').setAttribute('aria-label', cls ? t().removeClass(cls) : '');
    // 같은 이름의 칸이 여러 개면(월·목 수업 등) 삭제가 모두 지운다는 것을 버튼에 적어 둔다
    const sib = cls && classKey(cls) ? state.timetable.filter((c) => classKey(c) === classKey(cls)).length : 1;
    $('#class-delete').textContent = sib > 1 ? t().removeAll(sib) : t().remove;
    $('#class-dialog').classList.toggle('editing', !!cls);
    renderDayPicks();
    renderDurations();
    showClassError('');
    hideSuggest();
    $('#class-dialog').showModal();
    if (name && !cls) showSuggest();   // 교육과정에서 과목을 눌러 들어온 경우 분반·시간 후보를 바로 보여 준다.
    else if (!cls) $('#class-name').focus();
  }

  const classKey = (c) => String((c && c.name) || '').trim().toLowerCase();
  function saveClass(more = false) {
    const s = getTime('start');
    const e = getTime('end');
    if (e <= s) return showClassError(t().timeError);
    if (!classEdit.days.size) return showClassError(t().pickDay);
    const name = $('#class-name').value.trim();
    const orig = classEdit.id ? state.timetable.find((c) => c.id === classEdit.id) : null;
    let others = state.timetable.filter((c) => c.id !== classEdit.id);
    // 수업 이름을 고치면 같은 수업의 다른 요일 칸도 같은 이름으로 바꾼다 (월·목 수업이 둘로 갈라지지 않게)
    if (orig && classKey(orig) && name && name !== orig.name) {
      others = others.map((c) => (classKey(c) === classKey(orig) ? Object.assign({}, c, { name }) : c));
    }
    const withRoom = (c, room) => (room ? Object.assign(c, { room }) : c);
    for (const d of classEdit.days) {
      const hit = others.find((c) => c.day === d && L.overlaps(s, e, L.toMinutes(c.start), L.toMinutes(c.end)));
      if (hit) return showClassError(t().overlapError(dayName(d), hit));
    }
    const made = [...classEdit.days].map((d, i) => withRoom({
      id: classEdit.id || 'c' + Date.now().toString(36) + i + Math.random().toString(36).slice(2, 5),
      day: d, start: fromMinutes(s), end: fromMinutes(e), name
    }, orig ? orig.room : classEdit.rooms[`${d}|${fromMinutes(s)}`])).filter(L.isValidClass);
    // 강의 시간표에서 고른 수업의 다른 요일·시간
    const extras = classEdit.id ? [] : classEdit.extra.map((x, i) => withRoom({
      id: 'c' + Date.now().toString(36) + 'x' + i + Math.random().toString(36).slice(2, 5),
      day: x.day, start: x.start, end: x.end, name
    }, classEdit.rooms[`${x.day}|${x.start}`])).filter(L.isValidClass);
    for (const x of extras) {
      const hit = others.concat(made).find((c) => c.day === x.day && L.overlaps(toMin(x.start), toMin(x.end), toMin(c.start), toMin(c.end)));
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

  function renderBudget() {
    const box = $('#budget-result');
    const r = state.budgetResult;
    if (!r) { fill(box, ); return; }
    if (!r.chosen.length) {
      fill(box, h('p', { class: 'empty' }, t().budgetEmpty), r.skipped ? h('p', { class: 'fine' }, t().budgetSkipped(r.skipped)) : null);
      return;
    }
    fill(box, 
      h('p', { class: 'budget-sum' }, t().budgetSummary({
        count: r.chosen.length, hours: round1(r.totalHours), score: round1(r.totalScore), candidates: r.candidates
      })),
      h('ol', { class: 'picks' }, r.chosen.map((it) => h('li', null,
        h('button', { type: 'button', class: 'link', 'aria-haspopup': 'dialog', onclick: () => openDetail(it.id) }, titleOf(it.notice)),
        it.selective ? h('span', { class: 'tag kind-info selective-tag' }, t().selectiveTag) : null,
        h('span', { class: 'pick-meta' }, `${t().hoursValue(it.hours)}${it.estimated ? ` (${t().estimated})` : ''} · ${round1(it.score)}${t().points}` +
          (it.notice.deadline ? ` · ${t().deadline} ${I.formatDateTime(L.parseLocal(it.notice.deadline), state.lang)}` : ''))))),
      h('button', { type: 'button', class: 'btn small', onclick: () => exportCalendar(r.chosen.map((it) => it.notice), 'gongji-picks') }, t().pickCalendar));
  }

  // ---------- 오늘 (홈) ----------
  function goList(patch) {
    Object.assign(state, { query: '', board: '', category: '', group: '', sub: '', savedOnly: false, mineOnly: false, unreadOnly: false, due: '', status: 'open' }, patch);
    $('#q').value = '';
    applyStaticText();
    renderList();
    location.hash = '#/notices';
    setTab('notices', true);
  }

  function homeRow(n) {
    const sub = L.classifyBenefit(n).subs[0];
    return h('li', { class: 'home-row' },
      h('button', { type: 'button', class: 'link home-title', 'aria-haspopup': 'dialog', onclick: () => openDetail(n.id) }, titleOf(n)),
      h('span', { class: 'home-meta' },
        X.isNew(n, since) ? h('span', { class: 'new-badge' }, t().newBadge) : null,
        sub ? subTag(n, sub) : null,
        ddayBadge(n)));
  }

  function homeSection(title, items, limit, moreAction) {
    if (!items.length) return null;
    return h('section', { class: 'home-card' },
      h('h3', null, title, h('span', { class: 'group-count' }, ` ${items.length}`)),
      h('ul', { class: 'home-list' }, items.slice(0, limit).map(homeRow)),
      moreAction && items.length > limit ? h('button', { type: 'button', class: 'link-btn', onclick: moreAction }, t().homeMore) : null);
  }

  // 오늘 내 수업: 시간표를 넣었으면 오늘 수업을 시간순으로, 수업 사이 빈 시간(공강)과 함께 보여 준다
  function todayClassCard() {
    const tt = state.timetable;
    if (!tt.length) return null;
    const T = t();
    const dow = now.getDay();
    const cur = now.getHours() * 60 + now.getMinutes();
    const byStart = (a, b) => toMin(a.start) - toMin(b.start);
    const today = tt.filter((c) => c.day === dow).sort(byStart);
    const rows = [];
    let nextMarked = false;
    today.forEach((c, i) => {
      const s = toMin(c.start);
      const e = toMin(c.end);
      if (i > 0 && s - toMin(today[i - 1].end) >= 30) {
        rows.push(h('li', { class: 'home-row tc-gap' }, T.freeGap(today[i - 1].end, c.start)));
      }
      const st = cur >= e ? 'done' : cur >= s ? 'now' : (!nextMarked ? 'next' : '');
      if (st === 'next' || st === 'now') nextMarked = true;
      rows.push(h('li', { class: 'home-row tc-row' + (st ? ' ' + st : '') },
        h('span', { class: 'tc-time' }, `${c.start}–${c.end}`),
        h('span', { class: 'tc-name' }, c.name || T.classFallback, c.room ? h('small', null, c.room) : null),
        st === 'now' ? h('span', { class: 'tc-badge now' }, T.classNow) : st === 'next' ? h('span', { class: 'tc-badge' }, T.classNext) : null));
    });
    // 오늘 남은 수업이 없으면 다음 수업이 언제인지 알려 준다
    let foot = '';
    if (!today.some((c) => toMin(c.end) > cur)) {
      for (let i = 1; i <= 7 && !foot; i++) {
        const d = (dow + i) % 7;
        const first = tt.filter((c) => c.day === d).sort(byStart)[0];
        if (first) foot = T.nextClass(dayName(d), first.start, first.name || T.classFallback);
      }
    }
    return h('section', { class: 'home-card today-classes' },
      h('h3', null, T.todayClasses, today.length ? h('span', { class: 'group-count' }, ` ${today.length}`) : null),
      today.length ? h('ul', { class: 'home-list' }, rows) : h('p', { class: 'fine' }, T.todayNoClass),
      foot ? h('p', { class: 'fine' }, foot) : null,
      h('button', { type: 'button', class: 'link-btn', onclick: () => { location.hash = '#/timetable'; setTab('timetable', true); } }, T.seeTimetable));
  }

  function renderHome() {
    const box = $('#home-body');
    if (!box) return;
    const T = t();
    const sOpts = { saved: state.saved, since, timetable: state.timetable, hideConflicts: state.hideConflicts };
    const s = X.summarize(activeNotices(), now, sOpts);                  // 지원 완료한 공지는 요약에서 뺀다
    const sAll = X.summarize(DATA.notices, now, sOpts);                  // 저장한 공지는 지원 완료한 것도 보여 준다
    const mineFresh = hasMine() ? s.fresh.filter((n) => mineOf(n).any) : [];
    const pill = (label, n, onclick, urgent) => h('button', { type: 'button', class: 'home-pill' + (urgent && n ? ' urgent' : ''), onclick },
      h('strong', null, String(n)), h('span', null, label));
    const labels = { ko: ['오늘 마감', '3일 안 마감', '새 공지'], en: ['Due today', 'Due in 3 days', 'New'], zh: ['今天截止', '3天内截止', '新公告'], ja: ['今日締切', '3日以内', '新着'] }[state.lang] || [];
    const parts = [h('div', { class: 'home-pills', role: 'group', 'aria-label': T.homeSummary({ today: s.today.length, soon: s.soon.length, fresh: s.fresh.length }) },
      pill(labels[0], s.today.length, () => goList({ due: 'today', sort: 'deadline' }), true),
      pill(labels[1], s.soon.length, () => goList({ due: 'soon', sort: 'deadline' }), true),
      pill(labels[2], s.fresh.length, () => goList({ due: 'new', sort: 'latest' }), false))];

    if (!state.timetable.length) {
      parts.push(h('div', { class: 'home-tip' },
        h('p', null, T.homeTimetableTip),
        h('button', { type: 'button', class: 'btn small primary', onclick: () => {
          location.hash = '#/timetable'; setTab('timetable', true);
          if (window.matchMedia && window.matchMedia('(min-width: 900px)').matches) openClassDialog();
        } }, T.homeTimetableBtn)));
    }

    const cards = [
      todayClassCard(),
      homeSection(T.homePinned, s.pinned, 5, null),
      homeSection(T.homeSoon, s.soon, 5, () => goList({ due: 'soon', sort: 'deadline' })),
      homeSection(T.homeSaved, sAll.saved, 5, () => goList({ savedOnly: true, status: 'all' })),
      homeSection(T.homeMine, mineFresh, 5, () => goList({ mineOnly: true, sort: 'latest' })),
      homeSection(T.homeNew, s.fresh, 5, () => goList({ due: 'new', sort: 'latest' }))
    ];
    // 이번 주 추천 (추천 탭에서 쓰는 시간·기간 설정 그대로)
    const rec = L.recommend(activeNotices(), state.budgetHours, {
      now, windowDays: state.budgetWindow, timetable: state.timetable, includeSelective: state.budgetSelective
    });
    if (rec.chosen.length) {
      cards.push(h('section', { class: 'home-card' },
        h('h3', null, T.homePicks),
        h('ul', { class: 'home-list' }, rec.chosen.slice(0, 4).map((it) => homeRow(it.notice))),
        h('button', { type: 'button', class: 'link-btn', onclick: () => { location.hash = '#/budget'; setTab('budget', true); } }, T.homeMore)));
    }
    const calItems = upcomingCalendar(3);
    if (calItems.length) {
      const fmt = (d) => I.formatDate(L.parseLocal(d), state.lang);
      cards.push(h('section', { class: 'home-card' },
        h('h3', null, T.calendarTitle),
        h('ul', { class: 'home-list' }, calItems.map((x) => h('li', { class: 'home-row' },
          h('span', { class: 'cal-what' }, tr(x.title)),
          h('span', { class: 'home-meta cal-when' }, x.start === x.end ? fmt(x.start) : `${fmt(x.start)} ~ ${fmt(x.end)}`))))));
    }
    cards.push(calCard());
    const shown = cards.filter(Boolean);
    parts.push(shown.length ? h('div', { class: 'home-grid' }, shown) : h('p', { class: 'empty' }, T.homeNothing));
    fill(box, ...parts);
    const badge = $('#badge-home');
    const urgent = s.today.length + s.pinned.length;
    if (badge) { badge.hidden = !urgent; badge.textContent = String(urgent); }
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
      id: 'ex' + i, day: c.day, start: c.start, end: c.end, name: c.names[state.lang] || c.names.ko
    }));
    saveTimetable();
    timetableChanged();
    renderHome();
  }
  function renderWelcome() {
    const T = t();
    fill($('#welcome-body'), 
      h('div', { class: 'welcome-logo', 'aria-hidden': 'true' }, '줍'),
      h('h2', { id: 'welcome-title' }, T.welcomeTitle),
      h('p', { class: 'welcome-lead' }, T.welcomeLead),
      h('ol', { class: 'welcome-steps' }, T.welcomeSteps.map((st) => h('li', null, h('strong', null, st.t), h('span', null, st.d)))),
      usedCategories().length ? h('div', { class: 'welcome-interests' }, h('p', null, T.welcomeInterests), interestChips()) : null,
      h('label', { class: 'welcome-lang' }, h('span', null, T.language),
        h('select', { class: 'lang-control', translate: 'no', onchange: (e) => { state.lang = e.target.value; store.set('lang', state.lang); renderAll(); } },
          ...I.LANGS.map((l) => h('option', { value: l.code, lang: l.code, selected: l.code === state.lang }, l.name)))));
    $('#welcome-example').textContent = T.welcomeExample;
    $('#welcome-start').textContent = T.welcomeStart;
  }
  function openWelcome() {
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
  const TABS = ['home', 'notices', 'timetable', 'budget', 'settings'];
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
  function setTab(tab, scrollTop) {
    document.body.dataset.tab = tab;
    document.querySelectorAll('.tabbar a').forEach((a) => {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    // 추천 탭을 처음 열면 저장된 시간으로 바로 계산해 보여 줌
    if (tab === 'budget' && !state.budgetResult) runBudget();
    if (scrollTop) scrollToTab(tab);
  }

  // PC(왼쪽 내비게이션)와 휴대폰(아래 탭) 모두 화면을 통째로 바꾸므로, 화면을 옮기면 맨 위에서 시작한다
  function scrollToTab() {
    window.scrollTo(0, 0);
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
      h('div', { class: 'my-section' },
        h('p', { class: 'help' }, T.interestsHelp),
        h('h3', null, T.interestsFields), interestChips(),
        h('h3', { style: 'margin-top:12px' }, T.keywordsLabel),
        h('form', { class: 'kw-form', onsubmit: (e) => { e.preventDefault(); const v = input.value; input.value = ''; addKeyword(v); } },
          input, h('button', { type: 'submit', class: 'btn small' }, T.keywordAdd)),
        h('div', { class: 'kw-list' }, state.keywords.map((k) => h('span', { class: 'kw-chip' }, k,
          h('button', { type: 'button', 'aria-label': T.keywordRemove(k), onclick: () => removeKeyword(k) }, '×'))))),
      h('div', { class: 'my-section' },
        h('h3', null, T.notifyTitle),
        h('p', { class: 'help' }, T.notifyHelp),
        h('button', { type: 'button', class: 'btn small' + (state.alertsOn ? ' is-on' : ''), 'aria-pressed': String(state.alertsOn), onclick: () => setNotify(!state.alertsOn) },
          state.alertsOn ? T.notifyOff : T.notifyOn),
        denied ? h('p', { class: 'fine' }, T.notifyDenied) : null,
        !notifySupported() ? h('p', { class: 'fine' }, T.notifyUnsupported) : null),
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

  // 검색창 아래에 최근 검색어와 내 키워드를 제안
  function renderRecent() {
    const dl = $('#recent-list');
    if (!dl) return;
    const items = state.recent.slice().reverse().concat(state.keywords.filter((k) => !state.recent.includes(k)));
    fill(dl, ...items.map((v) => h('option', { value: v })));
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
    if (old) old.replaceWith(calCard());
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
    $('#sync-text').textContent = !m ? T.syncAsOf(stamp)
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
      keywords: state.keywords, interests: state.interests, recent: state.recent, alertsOn: state.alertsOn
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
    for (const [k, v] of Object.entries(r.values)) {
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
    renderList();
    renderTimetable();
    renderCurriculum();
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
    $('#import-mine').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) importMine(f);
    });
    $('#q').addEventListener('input', (e) => { state.query = e.target.value; renderList(); });
    $('#q').addEventListener('change', rememberQuery);
    $('#mine-only').addEventListener('change', (e) => { state.mineOnly = e.target.checked; renderList(); });
    $('#unread-only').addEventListener('change', (e) => { state.unreadOnly = e.target.checked; renderList(); });
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
    $('#class-form').addEventListener('submit', (e) => { e.preventDefault(); saveClass(); });
    $('#class-more').addEventListener('click', () => saveClass(true));
    $('#class-name').addEventListener('input', () => { classEdit.extra = []; classEdit.rooms = {}; renderExtraNote(); showSuggest(); });
    $('#class-name').addEventListener('focus', showSuggest);
    $('#class-name').addEventListener('blur', () => setTimeout(hideSuggest, 120));
    $('#class-cancel').addEventListener('click', () => $('#class-dialog').close());
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
    $('#welcome-start').addEventListener('click', closeWelcome);
    $('#welcome-example').addEventListener('click', () => { loadExampleTimetable(); closeWelcome(); });
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

    // 대화상자: 바깥을 눌러 닫기(closedby="any")를 지원하지 않는 브라우저(Safari)용 보완
    const dlg = $('#detail');
    dlg.addEventListener('close', () => {
      state.openId = null;
      dlg.returnValue = '';
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
  document.body.classList.toggle('home-collapsed', homeCollapsed);
  renderAll();
  setTab(tabFromHash(), false);
  openFromHash();
  runBudget();
  loadOverrides();
  if (CFG.overridesUrl) setInterval(loadOverrides, Math.max(5, CFG.refreshMinutes || 30) * 60000);
  registerWorker();
  // 공지가 하나도 없으면 서버에서 받아 오는 불러오기 화면부터 (서버를 쓸 수 없으면 안내만)
  const noData = !DATA.notices.length;
  if (noData && !syncOn()) showBoot('nodata');
  else maybeWelcome();
  if (syncOn()) {
    refreshData(false, { blocking: noData, startup: true });
    setInterval(() => refreshData(false), (CFG.refreshMinutes || 30) * 60000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - sync.last > 10 * 60000) refreshData(false);
    });
  }
})();
