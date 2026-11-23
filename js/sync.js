// 공지 줍줍: 서버 자동 갱신 + 내 설정 백업 (화면과 상관없는 순수 함수)
// - 서버(웹 주소)의 version.json 만 가볍게 확인하고, 더 새로우면 notices.json 을 받아 온다.
// - 브라우저(index.html)와 Node 테스트(tests/logic.test.js)에서 똑같이 씁니다.
// - 수업에서 배운 개념: 비동기 요청(fetch), 오류 처리, 문자열 비교, 데이터 검증, JSON
(function (root) {
  'use strict';

  // 'YYYY-MM-DD HH:MM' 은 글자 순서가 곧 시간 순서라서 문자열 비교로 새로운지 알 수 있다
  const isNewer = (local, remote) => typeof remote === 'string' && remote !== '' && remote > String(local || '');

  const joinUrl = (base, name) => (base.endsWith('/') ? base : base + '/') + name;

  // 서버에서 받은 데이터가 앱이 쓸 수 있는 모양인지 확인 (이상한 파일로 화면이 깨지지 않게)
  function validNotices(d) {
    return !!d && typeof d === 'object' && !!d.meta && typeof d.meta === 'object'
      && Array.isArray(d.categories) && Array.isArray(d.notices)
      && d.notices.every((n) => n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.category === 'string');
  }

  // 용어집 모양 검사: { 용어: { ko: '풀이', en: ..., tr: {...} } }
  function validGlossary(g) {
    if (!g || typeof g !== 'object' || Array.isArray(g)) return false;
    const keys = Object.keys(g);
    return keys.length > 0 && keys.every((k) => g[k] && typeof g[k] === 'object' && typeof g[k].ko === 'string');
  }

  // 갱신 전후 공지를 비교: 새로 생긴 것 / 사라진 것 / 마감이 바뀐 것
  function diffNotices(before, after) {
    const old = new Map((before || []).map((n) => [n.id, n]));
    const added = [];
    const changed = [];
    for (const n of after || []) {
      const o = old.get(n.id);
      if (!o) added.push(n.id);
      else if ((o.deadline || null) !== (n.deadline || null)) changed.push(n.id);
      old.delete(n.id);
    }
    return { added, removed: [...old.keys()], deadlineChanged: changed };
  }

  // 결과: { status: 'updated' | 'upToDate' | 'failed', data?, calendar?, glossary?, diff?, stamp?, first?, error? }
  // 받는 순서: version → notices → calendar → glossary (o.onStep 으로 지금 어디인지 알려 줌)
  async function check(opts) {
    const o = opts || {};
    const doFetch = o.fetchImpl || (typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
    if (!doFetch) return { status: 'failed', error: 'no-fetch' };
    const getJson = async (name, query, init) => {
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), o.timeoutMs || 15000) : null;
      try {
        const res = await doFetch(joinUrl(o.base || 'data/', name) + query, Object.assign({}, init, ctrl ? { signal: ctrl.signal } : {}));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    try {
      const step = (name) => { if (typeof o.onStep === 'function') { try { o.onStep(name); } catch (e) { /* 화면 쪽 오류는 무시 */ } } };
      step('version');
      const v = await getJson('version.json', '?_=' + Date.now(), { cache: 'no-store' });
      if (!v || typeof v.generatedAt !== 'string') return { status: 'failed', error: 'bad-version' };
      // 앱에 공지가 하나도 없으면(처음 열었거나 데이터 파일이 비었을 때) 버전이 같아도 서버에서 받아 온다
      const empty = o.localCount === 0;
      if (!empty && !isNewer(o.localStamp, v.generatedAt)) return { status: 'upToDate', stamp: v.generatedAt };
      step('notices');
      const data = await getJson('notices.json', '?v=' + encodeURIComponent(v.generatedAt), {});
      if (!validNotices(data)) return { status: 'failed', error: 'bad-notices' };
      if (data.meta.source === 'sample' && o.localSource && o.localSource !== 'sample') {
        return { status: 'failed', error: 'sample-data' };     // 샘플 데이터로 진짜 데이터를 덮어쓰지 않음
      }
      let calendar = null;
      step('calendar');
      try {
        const c = await getJson('calendar.json', '?v=' + encodeURIComponent(v.calendarGeneratedAt || v.generatedAt), {});
        if (c && Array.isArray(c.items)) calendar = c;
      } catch (e) { /* 학사일정은 없어도 됨 */ }
      // 용어집: 서버에 glossary.json 이 있으면 같이 받는다 (없거나 이상하면 앱에 들어 있는 용어집을 계속 씀)
      let glossary = null;
      step('glossary');
      try {
        const g = await getJson('glossary.json', '?v=' + encodeURIComponent(v.glossaryGeneratedAt || v.generatedAt), {});
        if (validGlossary(g)) glossary = g;
      } catch (e) { /* 용어집은 없어도 됨 */ }
      const diff = Array.isArray(o.localNotices) ? diffNotices(o.localNotices, data.notices) : null;
      return { status: 'updated', data, calendar, glossary, diff, stamp: v.generatedAt, first: empty };
    } catch (e) {
      return { status: 'failed', error: String((e && e.message) || e) };
    }
  }

  // ---- 내 설정 백업(시간표·언어·정렬 등): 이 브라우저에만 있는 것을 파일로 옮기고 다른 기기에서 불러오기 ----
  const BACKUP_KEYS = ['timetable', 'lang', 'sort', 'grouped', 'hideConflicts', 'budgetHours', 'budgetWindow', 'budgetSelective', 'saved',
    'theme', 'fontScale', 'applied', 'read', 'keywords', 'interests', 'recent', 'alertsOn', 'history', 'gradReq', 'planPrefs'];
  const BACKUP_KIND = 'gongji-jupjup-settings';

  function makeBackup(values, nowDate) {
    const out = {};
    for (const k of BACKUP_KEYS) if (values[k] !== undefined) out[k] = values[k];
    return { kind: BACKUP_KIND, version: 1, savedAt: (nowDate || new Date()).toISOString(), values: out };
  }

  // 불러온 파일을 검사해서 쓸 수 있는 값만 돌려준다. isValidClass: 시간표 칸 검사 함수
  function readBackup(obj, isValidClass, langs) {
    if (!obj || obj.kind !== BACKUP_KIND || !obj.values || typeof obj.values !== 'object') {
      return { ok: false, error: 'not-backup' };
    }
    const v = obj.values;
    const out = {};
    let dropped = 0;
    if (Array.isArray(v.timetable)) {
      out.timetable = v.timetable.filter((c) => (isValidClass ? isValidClass(c) : true));
      dropped = v.timetable.length - out.timetable.length;
    }
    if (typeof v.lang === 'string' && (!langs || langs.includes(v.lang))) out.lang = v.lang;
    if (['deadline', 'latest', 'benefit', 'hours', 'hits'].includes(v.sort)) out.sort = v.sort;
    if (typeof v.grouped === 'boolean') out.grouped = v.grouped;
    if (typeof v.hideConflicts === 'boolean') out.hideConflicts = v.hideConflicts;
    if (typeof v.budgetHours === 'number' && v.budgetHours > 0 && v.budgetHours <= 100) out.budgetHours = v.budgetHours;
    if ([7, 14, 30].includes(v.budgetWindow)) out.budgetWindow = v.budgetWindow;
    if (typeof v.budgetSelective === 'boolean') out.budgetSelective = v.budgetSelective;
    if (Array.isArray(v.saved)) {                                   // 저장한 공지 id 목록 (문자열만, 중복 없이, 최대 500개)
      out.saved = [...new Set(v.saved.filter((x) => typeof x === 'string' && x && x.length <= 80))].slice(-500);
    }
    if (['auto', 'light', 'dark'].includes(v.theme)) out.theme = v.theme;
    if (['sm', 'md', 'lg'].includes(v.fontScale)) out.fontScale = v.fontScale;
    if (typeof v.alertsOn === 'boolean') out.alertsOn = v.alertsOn;
    const strs = (a, max, len) => [...new Set((Array.isArray(a) ? a : []).filter((x) => typeof x === 'string' && x.trim() && x.length <= len))].slice(-max);
    if (Array.isArray(v.applied)) out.applied = strs(v.applied, 500, 80);
    if (Array.isArray(v.read)) out.read = strs(v.read, 400, 80);
    if (Array.isArray(v.keywords)) out.keywords = strs(v.keywords, 10, 20);
    if (Array.isArray(v.interests)) out.interests = strs(v.interests, 12, 20);
    if (Array.isArray(v.recent)) out.recent = strs(v.recent, 8, 40);
    // 수강 계획: 이수 내역(과목 목록)·졸업 기준·추천 조건. 자세한 검사는 js/plan.js 의 cleanHistory 가 한다
    if (Array.isArray(v.history)) out.history = v.history.filter((x) => x && typeof x === 'object' && typeof x.name === 'string').slice(0, 300);
    const plainObj = (o) => o && typeof o === 'object' && !Array.isArray(o) && JSON.stringify(o).length < 4000;
    if (plainObj(v.gradReq)) out.gradReq = v.gradReq;
    if (plainObj(v.planPrefs)) out.planPrefs = v.planPrefs;
    return { ok: true, values: out, dropped };
  }

  const api = { isNewer, joinUrl, validNotices, validGlossary, diffNotices, check, BACKUP_KEYS, makeBackup, readBackup };
  root.GongjiSync = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
