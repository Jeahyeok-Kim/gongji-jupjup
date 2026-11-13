// 공지 줍줍 '나에게 맞게' 기능 (화면과 상관없는 순수 함수)
// - 읽은 공지, 지원 완료, 관심 분야, 내 키워드, 알림 센터 목록
// - 브라우저(index.html)와 Node 테스트(tests/personal.test.js)에서 똑같이 씁니다.
(function (root) {
  'use strict';

  const L = typeof require === 'function' ? require('./logic.js') : root.GongjiLogic;
  const X = typeof require === 'function' ? require('./extras.js') : root.GongjiExtras;

  // ---- id 목록(읽음·지원 완료·저장): 문자열만, 중복 없이, 오래된 것부터 버려 최대 max개 ----
  function cleanIds(list, max) {
    const seen = new Set();
    const out = [];
    for (const id of Array.isArray(list) ? list : []) {
      if (typeof id === 'string' && id && id.length <= 80 && !seen.has(id)) { seen.add(id); out.push(id); }
    }
    return out.slice(-(max || 500));
  }
  // 이미 있으면 빼고, 없으면 넣는다
  function toggle(list, id, max) {
    const cur = cleanIds(list, max);
    return cur.includes(id) ? cur.filter((x) => x !== id) : cleanIds(cur.concat(id), max);
  }
  // 있든 없든 맨 뒤(가장 최근)로 넣는다 (읽음 표시·검색 기록)
  function touch(list, id, max) {
    return cleanIds(cleanIds(list, max).filter((x) => x !== id).concat(id), max);
  }

  // ---- 키워드·관심 분야 ----
  const MAX_KEYWORDS = 10;
  function cleanKeywords(list) {
    const seen = new Set();
    const out = [];
    for (const k of Array.isArray(list) ? list : []) {
      const s = typeof k === 'string' ? k.trim().replace(/\s+/g, ' ') : '';
      const key = s.toLowerCase();
      if (s && s.length <= 20 && !seen.has(key)) { seen.add(key); out.push(s); }
    }
    return out.slice(0, MAX_KEYWORDS);
  }
  function cleanInterests(list, validIds) {
    const ok = new Set(validIds || []);
    return [...new Set((Array.isArray(list) ? list : []).filter((c) => typeof c === 'string' && (!validIds || ok.has(c))))];
  }

  // 공지 제목·요약(모든 언어)·혜택·대상 안에 키워드가 있으면 그 키워드들을 돌려준다 (공백은 무시하고 비교)
  function matchKeywords(n, keywords) {
    if (!keywords || !keywords.length) return [];
    const parts = [n.title].concat(Object.values(n.titleTr || {}), Object.values(n.summary || {}));
    if (n.benefit && n.benefit.text) parts.push(...Object.values(n.benefit.text));
    if (n.eligibility) parts.push(...Object.values(n.eligibility));
    const hay = parts.filter((s) => typeof s === 'string').join('\n').toLowerCase().replace(/\s+/g, '');
    return keywords.filter((k) => hay.includes(String(k).toLowerCase().replace(/\s+/g, '')));
  }
  const matchInterest = (n, interests) => !!interests && interests.length > 0 && interests.includes(n.category);

  // 이 공지가 '내 관심'(키워드나 관심 분야)에 해당하는가
  function mine(n, ctx) {
    const kw = matchKeywords(n, ctx.keywords);
    return { keywords: kw, interest: matchInterest(n, ctx.interests), any: kw.length > 0 || matchInterest(n, ctx.interests) };
  }

  // ---- 알림 센터: 지금 알려 줄 것들 ----
  // ctx: { saved, applied, keywords, interests, since }
  //   due      저장한 공지 중 3일 안에 마감 (지원 완료로 표시한 것은 제외)
  //   keyword  마지막 방문 이후 새로 올라온 공지 중 내 키워드가 들어간 것
  //   interest 마지막 방문 이후 새로 올라온 공지 중 내 관심 분야인 것
  // 한 공지는 한 번만 나오고, 급한 것(due)이 먼저
  function buildAlerts(notices, now, ctx) {
    const c = ctx || {};
    const saved = new Set(c.saved || []);
    const applied = new Set(c.applied || []);
    const out = [];
    const RANK = { due: 0, keyword: 1, interest: 2 };
    for (const n of notices) {
      if (applied.has(n.id) || L.isExpired(n, now)) continue;
      const left = L.daysLeft(n.deadline, now);
      const kw = matchKeywords(n, c.keywords);
      let type = null;
      if (saved.has(n.id) && left !== null && left >= 0 && left <= 3) type = 'due';
      else if (X.isNew(n, c.since) && kw.length) type = 'keyword';
      else if (X.isNew(n, c.since) && matchInterest(n, c.interests)) type = 'interest';
      if (!type) continue;
      out.push({ key: `${type}:${n.id}`, type, id: n.id, daysLeft: left, keywords: kw });
    }
    out.sort((a, b) => RANK[a.type] - RANK[b.type]
      || (a.daysLeft === null) - (b.daysLeft === null) || (a.daysLeft || 0) - (b.daysLeft || 0));
    return out;
  }
  // 아직 보지 않은 알림 수 (seen: 이미 본 알림 key 목록)
  const unseen = (alerts, seen) => alerts.filter((a) => !(seen || []).includes(a.key)).length;

  const api = { cleanIds, toggle, touch, cleanKeywords, cleanInterests, matchKeywords, matchInterest, mine, buildAlerts, unseen, MAX_KEYWORDS };
  root.GongjiPersonal = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
