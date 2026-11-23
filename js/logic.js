// 공지 줍줍 핵심 로직 (화면과 상관없는 순수 함수 모음)
// - 브라우저(index.html)와 Node 테스트(tests/logic.test.js)에서 똑같이 씁니다.
// - 수업에서 배운 개념: 탐색(검색), 정렬, 문자열 처리, 조건 판단(날짜 경계), 동적 계획법(배낭 문제)
(function (root) {
  'use strict';

  // 혜택 분류는 js/benefit.js 에 있다 (브라우저에서는 먼저 불러온 스크립트, Node 에서는 require)
  const Benefit = typeof require === 'function' ? require('./benefit.js') : root.GongjiBenefit;
  const { classifyBenefit, benefitKinds, primaryKind } = Benefit;

  // ---------------------------------------------------------------
  // 1. 날짜·시간
  // ---------------------------------------------------------------

  // 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:MM' → 내 컴퓨터 시간대 기준 Date
  function parseLocal(str) {
    if (!str) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(str);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  }

  // 'HH:MM' → 자정부터 몇 분인지
  function toMinutes(hhmm) {
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(d, days) {
    const r = new Date(d.getTime());
    r.setDate(r.getDate() + days);
    return r;
  }

  // 마감까지 남은 날짜 수 (오늘 마감 = 0, 지났으면 음수, 마감일이 없으면 null)
  function daysLeft(deadlineStr, now) {
    const d = parseLocal(deadlineStr);
    if (!d) return null;
    return Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  }

  // 이미 끝난 공지인가? 마감이 있으면 마감 시각, 없으면 마지막 행사가 끝난 시각으로 판단
  function isExpired(notice, now) {
    if (notice.deadline) return parseLocal(notice.deadline) < now;
    const events = notice.events || [];
    if (events.length) return events.every((e) => parseLocal(e.date + 'T' + e.end) < now);
    return false;
  }

  // ---------------------------------------------------------------
  // 2. 시간표 충돌 판정 (구간 겹침)
  // ---------------------------------------------------------------

  // [aStart, aEnd) 와 [bStart, bEnd) 가 겹치는가? 한쪽 끝과 다른 쪽 시작이 같으면 겹치지 않는다.
  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  // 0=일, 1=월, ... 6=토
  function weekdayOf(dateStr) {
    return parseLocal(dateStr).getDay();
  }

  // 시간표 한 줄이 올바른가? (요일 0~6, 시작이 끝보다 빠름)
  function isValidClass(c) {
    return c && Number.isInteger(c.day) && c.day >= 0 && c.day <= 6 &&
      /^\d{2}:\d{2}$/.test(c.start || '') && /^\d{2}:\d{2}$/.test(c.end || '') &&
      toMinutes(c.start) < toMinutes(c.end);
  }

  // 공지의 행사 일시와 내 수업이 겹치는 목록
  function findConflicts(notice, timetable) {
    const out = [];
    for (const ev of notice.events || []) {
      const day = weekdayOf(ev.date);
      const s = toMinutes(ev.start);
      const e = toMinutes(ev.end);
      for (const c of timetable || []) {
        if (!isValidClass(c)) continue;
        if (c.day === day && overlaps(s, e, toMinutes(c.start), toMinutes(c.end))) {
          out.push({ event: ev, cls: c });
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------
  // 3. 검색·필터·정렬·분류
  // ---------------------------------------------------------------

  function squash(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, '');
  }

  // 한글 초성: 'ㅈㅎㄱ' 으로 '장학금'을 찾을 수 있게 (음절 하나 → 초성 하나라 글자 위치가 그대로 맞는다)
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function chosung(s) {
    let out = '';
    for (const ch of String(s || '')) {
      const c = ch.charCodeAt(0);
      out += c >= 0xac00 && c <= 0xd7a3 ? CHO[Math.floor((c - 0xac00) / 588)] : ch;
    }
    return out;
  }
  const isChosungOnly = (t) => /^[ㄱ-ㅎ]{2,}$/.test(t);

  // 검색어 → 낱말들 (띄어 쓴 낱말은 모두 들어 있어야 찾음)
  function queryTokens(query) {
    return String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  // 제목, 번역 제목, 요약, 혜택, 대상, 행사, 용어에서 검색어 찾기 (띄어쓰기·대소문자 무시, 낱말마다 AND, 초성 검색)
  function matchesQuery(notice, query) {
    const tokens = queryTokens(query);
    if (!tokens.length) return true;
    const parts = [notice.title, notice.boardName]
      .concat(Object.values(notice.titleTr || {}))
      .concat(Object.values(notice.summary || {}))
      .concat(notice.benefit ? Object.values(notice.benefit.text || {}) : [])
      .concat(notice.eligibility ? Object.values(notice.eligibility) : [])
      .concat((notice.events || []).map((e) => e && (e.label || e.title || '')))
      .concat(notice.terms || []);
    const hay = squash(parts.join(' '));
    let cho = null;
    return tokens.every((t) => {
      if (hay.includes(t)) return true;
      if (!isChosungOnly(t)) return false;
      // 초성은 너무 많이 걸리지 않게 제목에서만, 낱말을 넘어가지 않게 띄어쓰기를 살려서 찾는다
      cho = cho || chosung(String(notice.title || '').toLowerCase());
      return cho.includes(t);
    });
  }

  // 검색어 낱말이 모두 제목에 있는가 (검색 결과에서 제목에 맞는 공지를 먼저 보여 줄 때 씀)
  function titleMatches(notice, query) {
    const tokens = queryTokens(query);
    if (!tokens.length) return false;
    const title = squash([notice.title].concat(Object.values(notice.titleTr || {})).join(' '));
    let cho = null;
    return tokens.every((t) => title.includes(t) || (isChosungOnly(t) && (cho = cho || chosung(String(notice.title || '').toLowerCase())).includes(t)));
  }

  // filters: { query, board, category, group(큰 혜택 분류), sub(세부 혜택 분류), status: 'open' | 'week' | 'all' | 'past'(마감 지난 공지만) }
  function filterNotices(notices, filters, now) {
    const f = filters || {};
    return notices.filter((n) => {
      if (f.board && n.boardName !== f.board) return false;
      if (f.category && n.category !== f.category) return false;
      if (f.group && !classifyBenefit(n).groups.includes(f.group)) return false;
      if (f.sub && !classifyBenefit(n).subs.includes(f.sub)) return false;
      const status = f.status || 'open';
      if (status === 'past') { if (!isExpired(n, now)) return false; }
      else if (status !== 'all' && isExpired(n, now)) return false;
      if (status === 'week') {
        const d = daysLeft(n.deadline, now);
        if (d === null || d > 7) return false;
      }
      return matchesQuery(n, f.query);
    });
  }

  // key: 'deadline'(마감 임박순, 기본) | 'latest'(최신순) | 'hits'(조회수순)
  function sortNotices(list, key, now) {
    const arr = list.slice();
    const time = (s) => {
      const d = parseLocal(s);
      return d ? d.getTime() : Number.POSITIVE_INFINITY;
    };
    const cmpNum = (a, b) => (a === b ? 0 : a < b ? -1 : 1);
    if (key === 'latest') {
      arr.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    } else if (key === 'recentClosed') {
      // 마감 지난 공지 보기: 최근에 끝난 것부터 (마감이 없으면 마지막 행사 날, 그것도 없으면 올린 날)
      const endOf = (n) => {
        const ev = (n.events || []).map((e) => parseLocal(e.date)).filter(Boolean).sort((x, y) => y - x)[0];
        const d = parseLocal(n.deadline) || ev || parseLocal(n.date);
        return d ? d.getTime() : 0;
      };
      arr.sort((a, b) => endOf(b) - endOf(a));
    } else if (key === 'hits') {
      arr.sort((a, b) => (b.hits || 0) - (a.hits || 0));
    } else if (key === 'benefit') {
      // 혜택 큰 순: 포인트 + 확정 금액(1만 원 = 1점) + 상금(뽑혀야 받으니 1/10만 반영). 숫자 없는 공지는 뒤로
      const v = (n) => {
        const b = n.benefit;
        if (!b) return -1;
        const s = (benefitScore(n) || 0) + (b.prize ? b.prize / WON_PER_POINT * PRIZE_WEIGHT : 0);
        return s > 0 ? s : 0;
      };
      arr.sort((a, b) => cmpNum(Number(isExpired(a, now)), Number(isExpired(b, now))) || v(b) - v(a));
    } else if (key === 'hours') {
      // 시간 적게 드는 순: 예상 소요 시간이 없는 공지는 뒤로
      const v = (n) => (typeof n.hours === 'number' && n.hours > 0 ? n.hours : Number.POSITIVE_INFINITY);
      arr.sort((a, b) => cmpNum(Number(isExpired(a, now)), Number(isExpired(b, now))) || cmpNum(v(a), v(b)));
    } else {
      // 진행 중인 공지 먼저, 그 안에서 마감이 빠른 순. 마감일이 없는 공지는 뒤로.
      arr.sort((a, b) =>
        cmpNum(Number(isExpired(a, now)), Number(isExpired(b, now))) ||
        cmpNum(time(a.deadline), time(b.deadline)));
    }
    return arr;
  }

  function countByCategory(list) {
    const counts = {};
    for (const n of list) counts[n.category] = (counts[n.category] || 0) + 1;
    return counts;
  }

  // ---------------------------------------------------------------
  // 분류표 순서대로 묶기 (빈 분류는 뺌)
  function groupByCategory(list, categories) {
    return categories
      .map((c) => ({ category: c, items: list.filter((n) => n.category === c.id) }))
      .filter((g) => g.items.length > 0);
  }

  // ---------------------------------------------------------------
  // 4. 시간 예산 추천 (0/1 배낭 문제 → 동적 계획법)
  // ---------------------------------------------------------------

  // 혜택 점수: 다드림 포인트 1점 = 1점, 확정 금액 1만 원 = 1점 (임의로 정한 기준)
  // 상금(prize)처럼 받는다는 보장이 없는 혜택이나 숫자가 없는 혜택은 null → 추천에서 제외
  const WON_PER_POINT = 10000;

  function benefitScore(notice) {
    const b = notice.benefit;
    if (!b) return null;
    let score = 0;
    let has = false;
    if (typeof b.points === 'number') { score += b.points; has = true; }
    if (typeof b.won === 'number') { score += b.won / WON_PER_POINT; has = true; }
    return has ? score : null;
  }

  // 선발형 혜택(상금·시상, 선발·심사로 주는 장학금)은 받는다는 보장이 없으니 확률을 반영해 깎아서 센다 (임의 기준)
  //  - 상금(prize)은 10%, 금액이 있어도 제목·혜택에 '선발·심사·추첨' 같은 말이 있으면 30%
  const PRIZE_WEIGHT = 0.1;
  const SELECT_WEIGHT = 0.3;
  const SELECT_WORDS = /선발|선정|심사|추첨|추천\s*(?:자|대상)|입상|우수\s*(?:자|학생)|경쟁/;

  // 기대 점수: includeSelective 가 거짓이면 benefitScore 와 같고(확정 혜택만), 참이면 선발형을 깎아서 더한다
  function expectedScore(notice, includeSelective) {
    const b = notice.benefit;
    if (!b) return { score: null, selective: false };
    if (!includeSelective) { const s = benefitScore(notice); return { score: s, selective: false }; }
    let score = 0;
    let has = false;
    let selective = false;
    if (typeof b.points === 'number') { score += b.points; has = true; }
    if (typeof b.won === 'number') {
      const text = [notice.title, b.text && b.text.ko].join(' ');
      const sel = SELECT_WORDS.test(text);
      score += (b.won / WON_PER_POINT) * (sel ? SELECT_WEIGHT : 1);
      has = true;
      if (sel) selective = true;
    }
    if (typeof b.prize === 'number' && b.prize > 0) { score += (b.prize / WON_PER_POINT) * PRIZE_WEIGHT; has = true; selective = true; }
    return { score: has ? score : null, selective };
  }

  // items: [{ hours, score, ... }] 에서 시간 합이 budgetHours 이하이면서 점수 합이 가장 큰 조합
  // 시간은 30분 단위로 바꿔서 표(dp)를 채운다. dp[i][c] = 앞의 i개만 보고 c칸(30분 단위) 안에서 얻는 최대 점수
  function knapsack(items, budgetHours) {
    const cap = Math.max(0, Math.floor(budgetHours * 2 + 1e-9));
    const w = items.map((it) => Math.max(0, Math.ceil(it.hours * 2 - 1e-9)));
    const n = items.length;
    const dp = [];
    for (let i = 0; i <= n; i++) dp.push(new Array(cap + 1).fill(0));
    for (let i = 1; i <= n; i++) {
      for (let c = 0; c <= cap; c++) {
        dp[i][c] = dp[i - 1][c];                       // i번째를 고르지 않는 경우
        if (w[i - 1] <= c) {
          const take = dp[i - 1][c - w[i - 1]] + items[i - 1].score;  // 고르는 경우
          if (take > dp[i][c]) dp[i][c] = take;
        }
      }
    }
    // 표를 거꾸로 따라가며 실제로 고른 항목 찾기
    const chosen = [];
    let c = cap;
    for (let i = n; i >= 1; i--) {
      if (dp[i][c] !== dp[i - 1][c]) {
        chosen.push(items[i - 1]);
        c -= w[i - 1];
      }
    }
    chosen.reverse();
    return {
      chosen,
      totalScore: dp[n][cap],
      totalHours: chosen.reduce((s, it) => s + it.hours, 0)
    };
  }

  // 추천에 쓸 "관련 날짜": 아직 안 끝난 첫 행사 날짜, 행사가 없으면 마감일
  function relevantDate(notice, now) {
    const upcoming = (notice.events || [])
      .map((e) => parseLocal(e.date + 'T' + e.start))
      .filter((d) => d >= startOfDay(now))
      .sort((a, b) => a - b)[0];
    return upcoming || parseLocal(notice.deadline);
  }

  // 예상 소요 시간: 행사 시간이 있으면 그것(파이프라인이 계산), AI 추정이 있으면 그것,
  // 둘 다 없으면 공지 종류로 기본값을 정한다 (화면에 '추정'으로 표시)
  const HOUR_RULES = [
    [/설문|조사|만족도|진단|응답|투표/, 0.5],
    [/공모전|경진대회|대회|해커톤|챌린지|아이디어|백일장|콘테스트/, 6],
    [/봉사/, 4],
    [/특강|설명회|워크숍|세미나|포럼|강연|교육|강좌|클리닉|상담|캠프|체험|탐방|박람회|페어|행사/, 2],
    [/장학|지원금|신청|모집|선발|접수|등록/, 1]
  ];
  function estimateHours(notice) {
    if (typeof notice.hours === 'number' && notice.hours > 0) return { hours: notice.hours, estimated: false };
    const text = [notice.title, notice.benefit && notice.benefit.text && notice.benefit.text.ko].join(' ');
    for (const [re, h] of HOUR_RULES) if (re.test(text)) return { hours: h, estimated: true };
    return { hours: 1, estimated: true };
  }

  // 앞으로 windowDays일 안에 할 수 있는 공지 중에서 고른다
  // - 행사·교육처럼 날짜가 정해진 공지: 그 날짜가 기간 안에 있어야 함, 수업과 겹치면 뺌
  // - 신청·제출만 하는 공지: 마감 전이면 지금 할 수 있으므로 후보 (마감일을 모르면 최근 30일 안에 올라온 것만)
  // - 혜택이 숫자(다드림 포인트·확정 금액)로 적힌 공지만. 시급 알바처럼 계속 일하는 것은 뺌
  function recommend(notices, budgetHours, options) {
    const opt = options || {};
    const now = opt.now || new Date();
    const windowDays = opt.windowDays || 7;
    const today = startOfDay(now);
    const limit = addDays(today, windowDays + 1); // windowDays일째 하루 끝까지 포함
    const items = [];
    const skipped = { noScore: 0, outOfWindow: 0, conflict: 0, job: 0 };
    for (const n of notices) {
      if (isExpired(n, now)) continue;
      const es = expectedScore(n, !!opt.includeSelective);
      const score = es.score;
      if (score === null || score <= 0) { skipped.noScore++; continue; }
      const kinds = benefitKinds(n);
      if (kinds.includes('pay') && !(n.benefit && n.benefit.points)) { skipped.job++; continue; }
      const upcoming = (n.events || []).map((e) => parseLocal(e.date + 'T' + e.start)).filter((d) => d && d >= today);
      if ((n.events || []).length) {
        if (!upcoming.length || Math.min(...upcoming) >= limit) { skipped.outOfWindow++; continue; }
      } else if (!n.deadline) {
        const posted = parseLocal(n.date);
        if (!posted || posted < addDays(today, -30)) { skipped.outOfWindow++; continue; }
      }
      if (findConflicts(n, opt.timetable || []).length) { skipped.conflict++; continue; }
      // 같은 공지를 제목만 조금 바꿔 다시 올린 경우는 하나만 (괄호·'안내'·'실시'·띄어쓰기 무시)
      const key = String(n.title || '').replace(/안내|실시|공지|[<>()[\]「」『』"'·\s/]/g, '') + '|' + score;
      if (items.some((it) => it.key === key)) continue;
      const est = estimateHours(n);
      items.push({ id: n.id, key, hours: est.hours, estimated: est.estimated, score, selective: es.selective, notice: n });
    }
    const result = knapsack(items, budgetHours);
    result.candidates = items.length;
    result.skipped = skipped;
    return result;
  }

  // ---------------------------------------------------------------
  // 5. 안전장치 (파이프라인에서 사용): AI가 인용한 근거 문장이 원문에 정말 있는가?
  // ---------------------------------------------------------------
  function verifyEvidence(body, quote) {
    if (!body || !quote) return false;
    const strip = (s) => String(s).replace(/\s+/g, '');
    return strip(body).includes(strip(quote));
  }

  const api = {
    parseLocal, toMinutes, startOfDay, addDays, daysLeft, isExpired,
    overlaps, weekdayOf, isValidClass, findConflicts,
    matchesQuery, titleMatches, queryTokens, chosung, isChosungOnly, filterNotices, sortNotices, countByCategory, groupByCategory,
    BENEFIT_KINDS: Benefit.BENEFIT_KINDS, benefitKinds, primaryKind,
    BENEFIT_TREE: Benefit.BENEFIT_TREE, classifyBenefit, countBySub: Benefit.countBySub,
    countByGroup: Benefit.countByGroup, groupByBenefit: Benefit.groupByBenefit,
    WON_PER_POINT, PRIZE_WEIGHT, SELECT_WEIGHT, benefitScore, expectedScore, knapsack, relevantDate, recommend, estimateHours,
    verifyEvidence
  };
  root.GongjiLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
