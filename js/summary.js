// 공지 줍줍 요약 통일 (화면과 상관없는 순수 함수)
// - AI가 만든 요약 중 쓸 수 없는 것(제목 베끼기, 너무 짧음, 번역에서 숫자가 빠짐)을 골라 낸다.
// - 골라 낸 요약은 화면에 보이지 않고, 모든 공지가 같은 순서의 '핵심 정보'(대상·마감·혜택·일정)로 보인다.
// - 브라우저(index.html)와 Node 테스트(tests/summary.test.js)에서 똑같이 씁니다.
(function (root) {
  'use strict';

  // 글자 비교용: 공백·문장부호·기호를 없애고 소문자로
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

  // 언어별로 이 글자 수보다 짧으면 요약으로 보지 않는다 (공백·부호 뺀 글자 수)
  const MIN_LEN = { ko: 14, en: 24, zh: 10, ja: 12 };

  // 한국어 요약에 들어 있는 핵심 사실(연도·날짜의 '일'·금액)이 번역에서 빠졌는지 본다.
  // 번역이 한두 문장에서 끊기면 마감일이나 금액이 먼저 사라지기 때문이다. ('200만원'을 '2 million won'으로 옮기는 정상 번역은 통과)
  const MONEY_WORD = /won|krw|韩元|韓元|ウォン|원|万|萬|million|thousand/i;
  function lostFacts(ko, tr) {
    const text = String(tr || '').replace(/(\d),(?=\d{3})/g, '$1');
    const src = String(ko || '');
    const lost = [];
    for (const y of src.match(/20\d{2}/g) || []) if (!text.includes(y)) lost.push(y);
    for (const m of src.matchAll(/(\d{1,2})월\s*(\d{1,2})일/g)) {
      if (!new RegExp('(^|\\D)' + m[2] + '(\\D|$)').test(text)) lost.push(m[0]);
    }
    if (/[\d만천억]\s*원/.test(src) && !MONEY_WORD.test(text)) lost.push('금액');
    return [...new Set(lost)];
  }

  const titleIn = (n, lang) => (lang === 'ko' ? n.title : (n.titleTr && n.titleTr[lang]) || n.title);

  // 요약이 쓸 만하지 않은 이유 (쓸 만하면 null)
  //   empty    비어 있음 / short  너무 짧음 / title  제목을 그대로 옮김 / facts  한국어 요약의 연도·날짜·금액이 번역에서 빠짐
  function problem(n, lang) {
    const text = n && n.summary ? n.summary[lang] : '';
    const nx = norm(text);
    if (!nx) return 'empty';
    if (nx.length < (MIN_LEN[lang] || 12)) return 'short';
    const titles = [titleIn(n, lang), n.title].map(norm).filter(Boolean);
    for (const nt of titles) {
      if (nx === nt || nt.includes(nx) || (nx.includes(nt) && nx.length - nt.length < 8)) return 'title';
    }
    if (lang !== 'ko' && n.summary && n.summary.ko && lostFacts(n.summary.ko, text).length) return 'facts';
    return null;
  }

  // 화면에 보여 줄 요약: { text, ok }. 쓸 수 없으면 text 는 '' (대신 핵심 정보를 보여 줌)
  function pick(n, lang) {
    if (n.bodyStatus === 'image') return { text: (n.summary && (n.summary[lang] || n.summary.ko)) || '', ok: true, image: true };
    const p = problem(n, lang);
    return { text: p ? '' : n.summary[lang], ok: !p, why: p };
  }

  // 통계: 전체 공지 중 언어별로 쓸 수 없는 요약이 몇 건인가
  function audit(notices, langs) {
    const out = {};
    for (const l of langs) out[l] = { ok: 0, bad: 0, why: {} };
    for (const n of notices) {
      if (n.bodyStatus === 'image') continue;
      for (const l of langs) {
        const p = problem(n, l);
        if (p) { out[l].bad++; out[l].why[p] = (out[l].why[p] || 0) + 1; } else out[l].ok++;
      }
    }
    return out;
  }

  const api = { norm, lostFacts, problem, pick, audit, MIN_LEN };
  root.GongjiSummary = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
