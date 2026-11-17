// 학과별 교육과정(요람)과 교양과목 목록 도우미. 데이터는 data/courses.js (window.GONGJI_COURSES) 에 들어 있다.
// 시간표의 "내 학과 교육과정"과 과목명 자동완성이 이 파일을 쓴다. 브라우저와 Node(테스트) 양쪽에서 동작.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GongjiCurriculum = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const dataOf = (d) => d || (typeof window !== 'undefined' ? window.GONGJI_COURSES : null) || { colleges: [], general: [] };

  // 단과대별 학과 이름 목록: [{ name, depts: [이름] }]
  function colleges(data) {
    return dataOf(data).colleges.map((c) => ({ name: c.name, depts: c.depts.map((d) => d.name) }));
  }

  function findDept(name, data) {
    for (const c of dataOf(data).colleges) for (const d of c.depts) if (d.name === name) return d;
    return null;
  }

  // 학기 문자열("2-1,2", "3-1", "전체-1")에서 학년(1~4)을 뽑는다. 학년 구분이 없으면 0.
  function gradeOf(term) {
    const m = /^(\d)/.exec(String(term || ''));
    return m ? Number(m[1]) : 0;
  }

  // 학과의 과목을 학년별로 묶는다: { 1: [...], 2: [...], 3: [...], 4: [...], 0: [...] }
  // 과목: { term, kind, name, credit }
  function byGrade(deptName, data) {
    const d = findDept(deptName, data);
    const out = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    if (!d) return out;
    for (const [term, kind, name, credit] of d.courses) {
      const g = gradeOf(term);
      (out[g] || out[0]).push({ term, kind, name, credit });
    }
    return out;
  }

  // 교양: 이수구분(기초/심화/소양) → 영역 → 과목
  function general(data) {
    const out = [];
    for (const [kind, area, name, credit, term] of dataOf(data).general) {
      let g = out.find((x) => x.kind === kind && x.area === area);
      if (!g) { g = { kind, area, courses: [] }; out.push(g); }
      g.courses.push({ kind, area, name, credit, term });
    }
    return out;
  }

  // 과목명 자동완성 후보: 내 학과 과목을 먼저, 그다음 교양. 같은 이름은 한 번만.
  // 각 항목: { name, label }  (label 은 "전선 · 2-1 · 3학점" 같은 보조 설명)
  function suggestions(deptName, data) {
    const seen = new Set();
    const out = [];
    const add = (name, label) => { if (name && !seen.has(name)) { seen.add(name); out.push({ name, label }); } };
    const d = findDept(deptName, data);
    if (d) for (const [term, kind, name, credit] of d.courses) add(name, [kind, term, credit ? `${credit}학점` : ''].filter(Boolean).join(' · '));
    for (const [kind, area, name, credit] of dataOf(data).general) add(name, [`${kind}교양`.replace('소양교양', 'KU소양'), area, credit ? `${credit}학점` : ''].filter(Boolean).join(' · '));
    // 학과를 고르지 않았거나 다른 학과 과목(복수전공 등)을 넣을 때를 위해 나머지 학과 과목도 뒤에 붙인다.
    for (const c of dataOf(data).colleges || []) {
      for (const od of c.depts) {
        if (d && od.name === d.name) continue;
        for (const [term, kind, name, credit] of od.courses) add(name, [od.name, kind, term, credit ? `${credit}학점` : ''].filter(Boolean).join(' · '));
      }
    }
    return out;
  }

  return { colleges, findDept, gradeOf, byGrade, general, suggestions };
}));
