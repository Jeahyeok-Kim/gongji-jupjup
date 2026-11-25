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
    if (!name) return null;
    const globalRoot = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    const resolved = (globalRoot && globalRoot.GongjiPlan && globalRoot.GongjiPlan.resolveDept)
      ? globalRoot.GongjiPlan.resolveDept(name)
      : name;
    const targetName = resolved || name;
    for (const c of dataOf(data).colleges) {
      for (const d of c.depts) {
        if (d.name === targetName || d.name === name) return d;
      }
    }
    for (const c of dataOf(data).colleges) {
      for (const d of c.depts) {
        if (d.name.includes(targetName) || targetName.includes(d.name)) return d;
      }
    }
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

  const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  const JUNGSUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
  const JONGSUNG = ['', 'ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

  function decomposeHangul(str) {
    if (!str) return '';
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code >= 0xAC00 && code <= 0xD7A3) {
        const s = code - 0xAC00;
        const cho = Math.floor(s / 588);
        const jung = Math.floor((s % 588) / 28);
        const jong = s % 28;
        out += CHOSUNG[cho] + JUNGSUNG[jung] + (jong > 0 ? JONGSUNG[jong] : '');
      } else {
        out += str[i];
      }
    }
    return out;
  }

  function getChosung(str) {
    if (!str) return '';
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code >= 0xAC00 && code <= 0xD7A3) {
        out += CHOSUNG[Math.floor((code - 0xAC00) / 588)];
      } else {
        out += str[i];
      }
    }
    return out;
  }

  const COURSE_ALIASES = {
    os: ['운영체제'],
    db: ['데이터베이스', '데이터베이스설계'],
    ai: ['인공지능', '빅데이터와인공지능'],
    ml: ['머신러닝', '머신러닝과기계학습', '지식발견머신러닝'],
    dl: ['딥러닝'],
    ds: ['자료구조'],
    algo: ['알고리즘'],
    se: ['소프트웨어공학'],
    ca: ['컴퓨터구조'],
    cn: ['컴퓨터네트워크'],
    oop: ['객체지향프로그래밍'],
    vr: ['멀티미디어와가상현실'],
    py: ['python프로그래밍'],
    cpp: ['c++프로그래밍'],
    컴구: ['컴퓨터구조'],
    컴네: ['컴퓨터네트워크'],
    운체: ['운영체제'],
    자구: ['자료구조'],
    알고: ['알고리즘'],
    소공: ['소프트웨어공학'],
    데베: ['데이터베이스'],
    컴개: ['컴퓨터공학개론'],
    디논: ['디지털논리회로'],
    객지: ['객체지향프로그래밍'],
    이산: ['이산수학'],
    고웹: ['고급웹프로그래밍'],
    프종설: ['프로젝트종합설계'],
    캡스톤: ['프로젝트종합설계'],
    빅데: ['빅데이터기초', '빅데이터와인공지능'],
    클라: ['클라우드컴퓨팅'],
    计组: ['컴퓨터구조'],
    计网: ['컴퓨터네트워크'],
    软工: ['소프트웨어공학'],
    数构: ['자료구조']
  };

  // 한글 퍼지 + 영어·중국어·일본어·약어 매칭
  function matchCourseName(query, target) {
    if (!query || !target) return 0;
    const qNorm = String(query).replace(/\s+/g, '').toLowerCase();
    const tNorm = String(target).replace(/\s+/g, '').toLowerCase();
    if (!qNorm || !tNorm) return 0;

    let best = 0;

    // 1. 정확한 시작 / 포함
    if (tNorm.startsWith(qNorm)) best = 100;
    else if (tNorm.includes(qNorm)) best = 80;

    // 2. 약어 매칭 (OS, DB, 컴구, 计组 등)
    const aliasHits = COURSE_ALIASES[qNorm];
    if (aliasHits && aliasHits.some((a) => tNorm === a || tNorm.includes(a))) {
      best = Math.max(best, 95);
    }

    // 3. 다국어 번역 사전 매칭 (영어·중국어·일본어)
    const DI18n = typeof window !== 'undefined' ? window.GongjiDeptI18n : null;
    const tr = DI18n && DI18n.COURSES && DI18n.COURSES[String(target).trim()];
    if (tr) {
      for (const langKey of ['en', 'zh', 'ja']) {
        const val = tr[langKey];
        if (!val) continue;
        const vNorm = String(val).replace(/\s+/g, '').toLowerCase();
        if (vNorm === qNorm) best = Math.max(best, 98);
        else if (vNorm.startsWith(qNorm)) best = Math.max(best, 90);
        else if (vNorm.includes(qNorm)) best = Math.max(best, 75);
      }
    }
    if (best >= 75) return best;

    // 4. 자모 분해 매칭
    const qDec = decomposeHangul(qNorm);
    const tDec = decomposeHangul(tNorm);
    if (tDec.startsWith(qDec)) return Math.max(best, 90);
    if (tDec.includes(qDec)) return Math.max(best, 70);

    // 5. 초성 매칭 (예: ㅋㅍㅌ구조 -> 컴퓨터구조)
    const tCho = getChosung(tNorm);
    if (tCho.startsWith(qNorm) || tCho.includes(qNorm)) return Math.max(best, 65);

    // 6. 오타 허용 (1글자 오타 또는 접두사 일치)
    if (qNorm.length >= 2) {
      const qPrefix = qNorm.slice(0, Math.max(2, qNorm.length - 1));
      if (tNorm.startsWith(qPrefix)) return Math.max(best, 60);
      if (tNorm.includes(qPrefix)) return Math.max(best, 45);

      if (qDec.length >= 3) {
        let common = 0;
        for (let i = 0; i < Math.min(qDec.length, tDec.length); i++) {
          if (tDec[i] === qDec[i]) common++;
          else break;
        }
        if (common >= qDec.length - 1 && common >= 3) return Math.max(best, 55);
        const qDecPrefix = qDec.slice(0, -1);
        if (qDecPrefix.length >= 3 && tDec.includes(qDecPrefix)) return Math.max(best, 40);
      }
    }

    return best;
  }

  // 과목명 자동완성 후보: 내 학과 과목을 먼저, 그다음 교양. 같은 이름은 한 번만.
  // 각 항목: { name, label }  (label 은 "전선 · 2-1 · 3학점" 같은 보조 설명)
  function suggestions(deptName, data) {
    const seen = new Set();
    const out = [];
    const profDict = (typeof window !== 'undefined' && window.GONGJI_PROFESSORS) || null;
    const tt = (typeof window !== 'undefined' && window.GONGJI_TIMETABLE && window.GONGJI_TIMETABLE.courses) || null;

    const findProf = (name) => {
      if (profDict) {
        if (profDict[`${name}:01`]) return profDict[`${name}:01`];
        for (const [k, p] of Object.entries(profDict)) {
          if (k.startsWith(`${name}:`) && p) return p;
        }
      }
      if (tt) {
        const hit = tt.find((c) => c.n === name && c.p);
        if (hit && hit.p) return hit.p;
      }
      return '';
    };

    const add = (name, parts) => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      const prof = findProf(name);
      const meta = [...parts, prof ? `${prof} 교수` : ''].filter(Boolean).join(' · ');
      out.push({ name, label: meta, prof });
    };

    const d = findDept(deptName, data);
    if (d) {
      for (const [term, kind, name, credit] of d.courses) {
        add(name, [kind, term, credit ? `${credit}학점` : '']);
      }
    }
    for (const [kind, area, name, credit] of dataOf(data).general) {
      add(name, [`${kind}교양`.replace('소양교양', 'KU소양'), area, credit ? `${credit}학점` : '']);
    }
    // 학과를 고르지 않았거나 다른 학과 과목(복수전공 등)을 넣을 때를 위해 나머지 학과 과목도 뒤에 붙인다.
    for (const c of dataOf(data).colleges || []) {
      for (const od of c.depts) {
        if (d && od.name === d.name) continue;
        for (const [term, kind, name, credit] of od.courses) {
          add(name, [od.name, kind, term, credit ? `${credit}학점` : '']);
        }
      }
    }
    return out;
  }

  return { colleges, findDept, gradeOf, byGrade, general, suggestions, decomposeHangul, getChosung, matchCourseName };
}));
