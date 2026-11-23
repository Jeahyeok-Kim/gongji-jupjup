// 수강 계획: 이수 내역(지금까지 들은 과목)을 모아 남은 학점을 계산하고, 개설 과목 중 안 들은 과목으로 다음 수강신청을 추천한다.
// AI 없이 규칙과 계산만 쓴다. 브라우저와 Node(테스트) 양쪽에서 동작한다.
//  - 남은 학점: 학사요람의 졸업 최저 학점(data/gradreq.js) − 이수 내역. 편입생은 잔여 66학점을 기본으로 두고 전공·교양을 직접 고친다.
//  - 추천: 같은 과목의 여러 분반 중 시간이 안 겹치는 분반을 고르고, 이러닝(시간 없음)·실시간 온라인 수업도 따로 다룬다.
//          목표 학점 안에서 '남은 학점을 많이 채우는' 조합을 분기 한정(branch and bound)으로 찾는다 (0/1 배낭 + 구간 겹침).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GongjiPlan = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 이름·이수구분 ----------
  const normName = (s) => String(s || '').normalize('NFC').replace(/[\s·・‧\-_()（）[\]{}.,:;'"“”‘’<>「」『』/\\]/g, '').toLowerCase();

  // KIS·요람에 쓰이는 긴 이름을 짧은 이름으로
  const KIND_ALIAS = [
    [/^전공\s*필수$/, '전필'], [/^전공\s*선택$/, '전선'], [/^전공\s*기초$/, '전기'],
    [/^기초\s*교양$/, '기초'], [/^심화\s*교양$/, '심화'], [/^(KU\s*)?소양$/i, '소양'],
    [/^일반\s*선택$/, '일선'], [/^자율\s*선택$/, '자선'], [/^교양\s*필수$/, '교필'], [/^교양\s*선택$/, '교선']
  ];
  function cleanKind(k) {
    const s = String(k || '').trim();
    for (const [re, v] of KIND_ALIAS) if (re.test(s)) return v;
    return s.slice(0, 6);
  }
  const KIND_RE = /^(전필|전선|전기|복필|복선|부필|부선|연필|연선|다필|다선|기초|심화|소양|교필|교선|기교|심교|핵교|일선|자선|교직|전공필수|전공선택|전공기초|기초교양|심화교양|KU소양|일반선택|자율선택|교양필수|교양선택)$/i;

  // 이수구분 → 영역: 'major' 전공 · 'general' 교양 · 'free' 일반선택 등
  function area(kind) {
    const k = cleanKind(kind);
    if (/^(전필|전선|전기|복필|복선|부필|부선|연필|연선|다필|다선)/.test(k)) return 'major';
    if (/^(기초|심화|소양|교필|교선|기교|심교|핵교)/.test(k)) return 'general';
    return 'free';
  }
  // 교양의 세부 영역 (요람: 기초교양 14 · 심화교양 8 · KU소양 9)
  function genArea(kind) {
    const k = cleanKind(kind);
    if (/^(기초|기교)/.test(k)) return '기초';
    if (/^(심화|심교)/.test(k)) return '심화';
    if (/^소양/.test(k)) return '소양';
    return null;
  }

  // ---------- 이수 내역 ----------
  const TERM_RE = /^\d{4}-(1|2|S|W)$/;
  const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

  function cleanHistory(list) {
    const out = [];
    const seen = new Set();
    for (const x of Array.isArray(list) ? list : []) {
      if (!x || typeof x !== 'object') continue;
      const name = String(x.name || '').trim().slice(0, 60);
      const credit = num(x.credit, 0, 9);
      if (!name || credit === null) continue;
      const code = /^[A-Z]{3,5}\d{4,6}$/.test(String(x.code || '')) ? String(x.code) : '';
      const term = TERM_RE.test(String(x.term || '')) ? String(x.term) : '';
      const id = String(x.id || '').slice(0, 40) || `${term}|${code || normName(name)}`;
      const key = `${term}|${code || normName(name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id, name, code, credit, kind: cleanKind(x.kind), term });
      if (out.length >= 300) break;
    }
    return out;
  }

  function totals(history) {
    const t = { total: 0, major: 0, general: 0, free: 0, gen: { 기초: 0, 심화: 0, 소양: 0 }, count: 0 };
    for (const x of history || []) {
      const c = Number(x.credit) || 0;
      t.total += c;
      t[area(x.kind)] += c;
      const g = genArea(x.kind);
      if (g) t.gen[g] += c;
      t.count += 1;
    }
    return t;
  }

  // 학기 순서: '2025-1' < '2025-S' < '2025-2' < '2025-W'
  const TERM_ORDER = { 1: 0, S: 1, 2: 2, W: 3 };
  function termKey(term) {
    const m = /^(\d{4})-(1|2|S|W)$/.exec(term || '');
    return m ? Number(m[1]) * 10 + TERM_ORDER[m[2]] : 0;
  }
  function byTerm(history) {
    const map = new Map();
    for (const x of history || []) {
      const k = x.term || '';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(x);
    }
    return [...map.entries()].sort((a, b) => termKey(b[0]) - termKey(a[0])).map(([term, items]) => ({ term, items, credits: items.reduce((s, x) => s + (Number(x.credit) || 0), 0) }));
  }

  // ---------- 졸업 기준과 남은 학점 ----------
  function findDept(dept, req) {
    const depts = (req && req.depts) || {};
    const d = String(dept || '').trim();
    if (!d) return null;
    if (depts[d]) return { name: d, row: depts[d] };
    const hits = Object.keys(depts).filter((k) => k.includes(d) || d.includes(k)).sort((a, b) => b.length - a.length);
    return hits.length ? { name: hits[0], row: depts[hits[0]] } : null;
  }

  // custom: { mode: 'regular'|'transfer', total, major, general } 사용자가 고친 값 (없으면 요람 값)
  function requirement(dept, reqData, custom) {
    const c = custom && typeof custom === 'object' ? custom : {};
    const mode = c.mode === 'transfer' ? 'transfer' : 'regular';
    const found = findDept(dept, reqData);
    const row = found ? found.row : null;
    const gen = reqData && reqData.general ? { ...reqData.general } : null;
    let base;
    if (mode === 'transfer') {
      const total = (reqData && reqData.transferTotal) || 66;
      base = { total, major: row ? Math.min(row[1] + row[2], total) : null, general: row ? 0 : null, majorReq: row ? row[1] : null };
    } else {
      base = row ? { total: row[3], major: row[1] + row[2], general: row[0], majorReq: row[1] } : { total: null, major: null, general: null, majorReq: null };
    }
    const edited = {};
    for (const k of ['total', 'major', 'general']) {
      const v = num(c[k], 0, 300);
      if (v !== null) { base[k] = v; edited[k] = true; }
    }
    return {
      mode, dept: found ? found.name : '', found: !!found, edited,
      total: base.total, major: base.major, general: base.general, majorReq: base.majorReq,
      // 교양 세부 기준은 일반 학생이고 교양 기준을 고치지 않았을 때만 (요람 31 = 14 + 8 + 9)
      gen: mode === 'regular' && gen && !edited.general && base.general === 31 ? gen : null
    };
  }

  function remaining(req, tot) {
    const left = (need, done) => (need === null || need === undefined ? null : Math.max(0, need - done));
    const r = {
      total: left(req.total, tot.total),
      major: left(req.major, tot.major),
      general: left(req.general, tot.general),
      gen: null
    };
    if (req.gen) r.gen = { 기초: Math.max(0, req.gen.기초 - tot.gen.기초), 심화: Math.max(0, req.gen.심화 - tot.gen.심화), 소양: Math.max(0, req.gen.소양 - tot.gen.소양) };
    // 전공·교양을 채우고도 졸업 학점이 모자라면 그만큼은 아무 과목(일반선택)으로 채운다
    r.free = r.total === null ? null : Math.max(0, r.total - (r.major || 0) - (r.general || 0));
    return r;
  }

  // 지금 학기(달 기준)와 졸업까지 남은 학기 수 (이번 학기는 빼고 센다)
  function currentTerm(now) {
    const m = now.getMonth() + 1;
    if (m >= 3 && m <= 7) return { year: now.getFullYear(), term: '1' };
    return { year: m <= 2 ? now.getFullYear() - 1 : now.getFullYear(), term: '2' };
  }
  function semestersLeft(grade, now) {
    const g = num(grade, 1, 6);
    if (!g) return null;
    const cur = currentTerm(now);
    return Math.max(1, (4 - g) * 2 + (cur.term === '1' ? 1 : 0)) || 1;
  }
  // 학기당 들어야 할 학점: 남은 학점 ÷ 남은 학기 (올림). cap 은 한 학기 최대 신청 학점
  function pace(leftTotal, semesters, cap) {
    if (!leftTotal || !semesters) return { per: 0, over: false };
    const per = Math.ceil(leftTotal / semesters);
    return { per, over: per > (cap || 21) };
  }
  const nextTerm = (now) => {
    const c = currentTerm(now);
    return c.term === '1' ? `${c.year}-2` : `${c.year + 1}-1`;
  };

  // ---------- 붙여넣기: 학사정보시스템 성적표를 복사해 붙이면 과목을 읽는다 ----------
  // catalog: buildCatalog() 결과 (학수번호·과목명으로 학점·이수구분을 채운다)
  function buildCatalog(timetable, courses) {
    const byCode = new Map();
    const byName = new Map();
    const add = (name, credit, kind, code) => {
      const n = normName(name);
      if (!n) return;
      if (code && !byCode.has(code)) byCode.set(code, { name, credit, kind });
      if (!byName.has(n)) byName.set(n, { name, credit, kind, code: code || '' });
    };
    for (const c of (timetable && timetable.courses) || []) add(c.n, c.c, c.k, c.h);
    for (const col of (courses && courses.colleges) || []) for (const d of col.depts) for (const [, kind, name, credit] of d.courses) add(name, credit, kind);
    for (const [kind, , name, credit] of (courses && courses.general) || []) add(name, credit, kind);
    const names = [...byName.keys()].filter((n) => n.length >= 2).sort((a, b) => b.length - a.length);
    return { byCode, byName, names };
  }

  const GRADE_TOKEN = /^(A\+|A0|A-|A|B\+|B0|B-|B|C\+|C0|C-|C|D\+|D0|D-|D|P|S|PASS|F|NP|U|FA|W)$/i;
  function parseTerm(line) {
    const m = /(20\d{2})\s*(?:년도?|학년도)?\s*[-./]?\s*(1|2|여름|하계|겨울|동계)\s*(?:학기)?/.exec(line);
    if (!m) return '';
    const t = { 1: '1', 2: '2', 여름: 'S', 하계: 'S', 겨울: 'W', 동계: 'W' }[m[2]];
    return `${m[1]}-${t}`;
  }

  function parsePaste(text, catalog) {
    const items = [];
    let failed = 0;
    let skipped = 0;
    let lastTerm = '';
    const seen = new Set();
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.replace(/ /g, ' ').trim();
      if (!line || !/[가-힣A-Za-z]/.test(line)) continue;
      const cells = (line.includes('\t') ? line.split('\t') : line.split(/\s{2,}|\s*\|\s*/)).map((s) => s.trim()).filter(Boolean);
      const tokens = cells.length > 1 ? cells : line.split(/\s+/);
      const termHere = parseTerm(line);
      // '2025년 1학기' 같은 제목 줄: 학기만 기억하고 넘어간다
      const rest = line.replace(/20\d{2}\s*(년도?|학년도)?/g, '').replace(/(1|2)?\s*학기|여름|겨울|하계|동계|계절/g, '');
      if (termHere && !/[A-Z]{4}\d{5}/.test(line) && !/[가-힣A-Za-z]{2,}/.test(rest)) { lastTerm = termHere; continue; }
      if (tokens.some((x) => /^(F|NP|U|FA)$/i.test(x))) { failed += 1; continue; }
      const term = termHere || lastTerm;
      const codeM = /\b([A-Z]{4}\d{5})\b/.exec(line);
      const code = codeM ? codeM[1] : '';
      const kindTok = tokens.find((x) => KIND_RE.test(x));
      let name = '';
      let credit = null;
      let kind = kindTok ? cleanKind(kindTok) : '';
      const fromCode = code && catalog ? catalog.byCode.get(code) : null;
      if (fromCode) name = fromCode.name;
      if (!name && catalog) {
        const n = normName(line);
        const hit = catalog.names.find((x) => n.includes(x));
        if (hit) name = catalog.byName.get(hit).name;
      }
      if (!name) {
        const tok = tokens.find((x) => /[가-힣A-Za-z]{2,}/.test(x) && !KIND_RE.test(x) && !GRADE_TOKEN.test(x) && !/^[A-Z]{4}\d{5}$/.test(x)
          && !/^(20\d{2}|\d{4}년|\d학기|[1-4]학년|학기|여름|겨울|하계|동계|이수|재수강|학점)$/.test(x));
        if (tok) name = tok.replace(/^\d+\s*/, '').slice(0, 60);
      }
      if (!name) { skipped += 1; continue; }
      // 학점: '3학점' 또는 혼자 있는 1~6 숫자 (학년도·학기 숫자, 평점(4.5 등)은 뺀다)
      const termNums = new Set();
      const tm = /(20\d{2})\s*(?:년도?|학년도)?\s*[-./]?\s*([12])\s*학기?/.exec(line);
      if (tm) termNums.add(tm[2]);
      const withUnit = /(\d(?:\.\d)?)\s*학점/.exec(line);
      if (withUnit) credit = Number(withUnit[1]);
      if (credit === null) {
        // 과목명(또는 이수구분) 뒤에 오는 숫자를 먼저 본다 (앞의 숫자는 보통 순번·학년도·학기)
        const at = Math.max(tokens.findIndex((x) => normName(x) && normName(name).includes(normName(x))), tokens.findIndex((x) => KIND_RE.test(x)));
        const order = at >= 0 ? [...tokens.slice(at + 1), ...tokens.slice(0, at)] : tokens;
        let usedTerm = false;
        for (const x of order) {
          if (!/^\d$/.test(x)) continue;
          if (at < 0 && termNums.has(x) && !usedTerm) { usedTerm = true; continue; }
          const v = Number(x);
          if (v >= 1 && v <= 6) { credit = v; break; }
        }
      }
      const cat = fromCode || (catalog ? catalog.byName.get(normName(name)) : null);
      if (credit === null && cat) credit = Number(cat.credit) || null;
      if (!kind && cat) kind = cleanKind(cat.kind);
      if (credit === null) { skipped += 1; continue; }
      const key = `${term}|${code || (cat && cat.code) || normName(name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ name, code: code || (cat && cat.code) || '', credit, kind, term });
    }
    return { items, failed, skipped };
  }

  // ---------- 개설 과목 (data/timetable.js) ----------
  const toMin = (hm) => { const [hh, mm] = String(hm).split(':').map(Number); return hh * 60 + (mm || 0); };
  function overlaps(a, b) {
    for (const [d1, s1, e1] of a || []) {
      for (const [d2, s2, e2] of b || []) {
        if (d1 === d2 && toMin(s1) < toMin(e2) && toMin(s2) < toMin(e1)) return true;
      }
    }
    return false;
  }
  const ONLINE = /(실시간\s*온라인|온라인|원격|비대면|화상|zoom|webex)/i;
  function modeOf(c) {
    if (c.m) return c.m;
    const slots = c.t || [];
    if (!slots.length) return 'elearn';
    const rooms = slots.map((s) => s[3]).filter(Boolean);
    return rooms.length && rooms.every((r) => ONLINE.test(r)) ? 'live' : '';
  }

  // 같은 과목(학수번호)의 분반을 하나로 묶는다. 학수번호가 없으면 이름+개설학과로 묶는다.
  function groupOffered(timetable) {
    const map = new Map();
    for (const c of (timetable && timetable.courses) || []) {
      if (!c || !c.n) continue;
      const key = c.h || `${c.n}|${c.d || ''}`;
      let g = map.get(key);
      if (!g) {
        const y = String(c.y || '');
        g = {
          key, code: c.h || '', name: c.n, dept: c.d || '', kind: cleanKind(c.k), area: area(c.k), gen: genArea(c.k),
          grade: /^[1-6]$/.test(y) ? Number(y) : 0, credit: Number(c.c) || 0, sections: []
        };
        map.set(key, g);
      }
      const sig = `${c.s}|${JSON.stringify(c.t || [])}`;
      if (g.sections.some((s) => s.sig === sig)) continue;
      g.sections.push({ s: c.s || '', t: c.t || [], mode: modeOf(c), sig });
    }
    for (const g of map.values()) g.sections.sort((a, b) => a.s.localeCompare(b.s));
    return [...map.values()];
  }

  const deptMatch = (a, b) => {
    const x = String(a || '').trim();
    const y = String(b || '').trim();
    return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
  };

  // 이번 학기 목표 학점을 남은 전공·교양 학점 비율대로 나눈다 (예: 전공 57 · 교양 28 남음, 18학점 → 전공 12 · 교양 6)
  function split(left, target) {
    const m = Math.max(0, Number(left && left.major) || 0);
    const g = Math.max(0, Number(left && left.general) || 0);
    const t = Math.max(0, Number(target) || 0);
    if (!m && !g) return { major: 0, general: 0, free: t };
    let major = Math.min(m, Math.round((t * m) / (m + g)));
    let general = Math.min(g, t - major);
    let rest = t - major - general;
    const addM = Math.min(rest, m - major); major += addM; rest -= addM;
    const addG = Math.min(rest, g - general); general += addG; rest -= addG;
    return { major, general, free: rest };
  }

  // ---------- 추천 ----------
  // opts: {
  //   groups: groupOffered() 결과, taken: Set(학수번호·정규화한 과목명), left: remaining() 결과,
  //   target: 목표 학점, grades: [1..4] 또는 null(전체), dept: 내 학과, deptCourses: Set(내 학과 요람 과목 이름, 정규화),
  //   myGrade: 다음 학기에 다닐 학년, include: { major, general, elearn, live }, avoidDays: [요일], busy: [[요일, 시작, 끝]],
  //   locked: [{ key, s }] 꼭 넣을 과목(분반), excluded: [key] 뺄 과목, maxNodes
  // }
  function candidates(opts) {
    const o = opts || {};
    const inc = { major: true, general: true, elearn: true, live: true, ...(o.include || {}) };
    const taken = o.taken || new Set();
    const excluded = new Set(o.excluded || []);
    const lockedKeys = new Set((o.locked || []).map((x) => x.key));
    const grades = Array.isArray(o.grades) && o.grades.length ? new Set(o.grades.map(Number)) : null;
    const avoid = new Set(o.avoidDays || []);
    const deptCourses = o.deptCourses || new Set();
    const left = o.left || {};
    const out = [];
    const stats = { taken: 0, grade: 0, time: 0, area: 0 };
    for (const g of o.groups || []) {
      if (excluded.has(g.key) || g.credit <= 0) continue;
      if ((g.code && taken.has(g.code)) || taken.has(normName(g.name))) { stats.taken += 1; continue; }
      const isLocked = lockedKeys.has(g.key);
      let ar = g.area;
      if (ar === 'major' && !(deptMatch(g.dept, o.dept) || deptCourses.has(normName(g.name)))) {
        if (!isLocked) { stats.area += 1; continue; }
      }
      if (ar === 'free') { if (!isLocked) { stats.area += 1; continue; } }
      if (!isLocked && ((ar === 'major' && !inc.major) || (ar === 'general' && !inc.general))) { stats.area += 1; continue; }
      if (!isLocked && grades && g.grade && !grades.has(g.grade)) { stats.grade += 1; continue; }
      // 고정한 과목은 사용자가 고른 것이라 요일·방식 조건을 따지지 않는다
      const sections = isLocked ? g.sections : g.sections.filter((s) => (s.mode !== 'elearn' || inc.elearn) && (s.mode !== 'live' || inc.live)
        && !s.t.some(([d]) => avoid.has(d)) && !overlaps(s.t, o.busy || []));
      if (!sections.length) { stats.time += 1; continue; }
      // 점수: 남은 학점이 있는 영역 > 학년이 맞는 과목 > 그 밖
      let score;
      if (ar === 'major') score = left.major === 0 ? 15 : g.kind === '전필' ? 100 : 70;
      else if (ar === 'general') {
        score = left.general === 0 ? 10 : 55;
        if (left.gen && g.gen && left.gen[g.gen] > 0) score += 15;
      } else score = 5;
      if (o.myGrade && g.grade) {
        if (g.grade === o.myGrade) score += 12;
        else if (g.grade < o.myGrade) score += g.kind === '전필' ? 18 : -4;
        else score -= 12;
      }
      if (deptCourses.has(normName(g.name))) score += 5;
      if (ar === 'major' && deptMatch(g.dept, o.dept)) score += 8;      // 같은 과목이면 내 학과가 연 분반을 먼저
      out.push({ g, sections, score, area: ar });
    }
    out.sort((a, b) => b.score - a.score || b.g.credit - a.g.credit || a.g.name.localeCompare(b.g.name));
    return { list: out, stats };
  }

  function recommend(opts) {
    const o = opts || {};
    const target = num(o.target, 1, 30) || 18;
    const left = o.left || {};
    const { list: all, stats } = candidates(o);
    // 꼭 넣을 과목부터
    const fixed = [];
    let fixedSlots = [...(o.busy || [])].map((x) => x.slice(0, 3));
    let fixedCredits = 0;
    const lockedMap = new Map((o.locked || []).map((x) => [x.key, x.s]));
    for (const c of all) {
      if (!lockedMap.has(c.g.key)) continue;
      const want = lockedMap.get(c.g.key);
      const sec = c.sections.find((s) => s.s === want && !overlaps(s.t, fixedSlots)) || c.sections.find((s) => !overlaps(s.t, fixedSlots));
      if (!sec) continue;
      fixed.push({ c, sec });
      fixedSlots = fixedSlots.concat(sec.t);
      fixedCredits += c.g.credit;
    }
    const fixedNames = new Set(fixed.map((x) => normName(x.c.g.name)));
    // 탐색할 후보: 영역마다 점수 높은 순으로 따로 뽑는다 (전공 과목이 많아도 교양 후보가 밀려나지 않게)
    const per = num(o.limit, 4, 60) || 22;
    const free = all.filter((c) => !lockedMap.has(c.g.key) && !fixedNames.has(normName(c.g.name)));
    const pool = ['major', 'general', 'free'].flatMap((a) => free.filter((c) => c.area === a).slice(0, a === 'free' ? 4 : per))
      .sort((a, b) => b.score - a.score || b.g.credit - a.g.credit);
    const n = pool.length;
    const maxNodes = o.maxNodes || 60000;
    let nodes = 0;
    let best = { val: -1, credits: -1, chosen: [] };
    const cap = target - fixedCredits;
    const areaUsed = { major: 0, general: 0, free: 0 };
    const quota = o.quota || split(left, target);
    for (const f of fixed) areaUsed[f.c.area] += f.c.g.credit;
    const chosen = [];
    const names = new Set(fixedNames);
    // 이번 학기 영역별 몫(quota)을 넘으면 점수를 낮춘다: 전공만 잔뜩, 교양만 잔뜩 고르지 않게
    const valueOf = (c) => {
      const cap2 = c.area === 'major' ? quota.major : c.area === 'general' ? quota.general : 0;
      const over = areaUsed[c.area] >= cap2;
      return (over ? Math.min(c.score, 12) : c.score) * c.g.credit;
    };
    function dfs(i, credits, slots, val) {
      nodes += 1;
      if (val > best.val || (val === best.val && credits > best.credits)) best = { val, credits, chosen: chosen.slice() };
      if (i >= n || nodes > maxNodes || credits >= cap) return;
      if (val + (cap - credits) * pool[i].score <= best.val) return;   // 남은 칸을 지금 점수로 다 채워도 못 이기면 그만
      const c = pool[i];
      const nm = normName(c.g.name);
      if (credits + c.g.credit <= cap && !names.has(nm)) {
        // 같은 과목의 분반: 시간이 다른 분반을 최대 3개까지 시도 (같은 시간 분반은 한 번만)
        const tried = new Set();
        for (const sec of c.sections) {
          const sig = JSON.stringify(sec.t.map((x) => x.slice(0, 3)));
          if (tried.has(sig) || tried.size >= 3 || overlaps(sec.t, slots)) continue;
          tried.add(sig);
          const v = valueOf(c);
          chosen.push({ c, sec });
          names.add(nm);
          areaUsed[c.area] += c.g.credit;
          dfs(i + 1, credits + c.g.credit, slots.concat(sec.t), val + v);
          areaUsed[c.area] -= c.g.credit;
          names.delete(nm);
          chosen.pop();
        }
      }
      dfs(i + 1, credits, slots, val);
    }
    if (cap > 0) dfs(0, 0, fixedSlots, 0);
    const picks = [...fixed.map((x) => ({ ...x, locked: true })), ...best.chosen.map((x) => ({ ...x, locked: false }))];
    // 다른 분반: 다른 고른 과목·바쁜 시간과 안 겹치는 분반
    const result = picks.map((p, idx) => {
      const others = picks.filter((_, j) => j !== idx).flatMap((q) => q.sec.t).concat((o.busy || []).map((x) => x.slice(0, 3)));
      const alts = p.c.sections.filter((s) => s !== p.sec && !overlaps(s.t, others));
      return { key: p.c.g.key, group: p.c.g, section: p.sec, area: p.c.area, score: p.c.score, locked: p.locked, alts };
    });
    const credits = result.reduce((s, r) => s + r.group.credit, 0);
    const byArea = { major: 0, general: 0, free: 0 };
    for (const r of result) byArea[r.area] += r.group.credit;
    result.sort((a, b) => (a.area === b.area ? 0 : a.area === 'major' ? -1 : b.area === 'major' ? 1 : 0) || b.score - a.score);
    return { picks: result, credits, byArea, target, quota, short: Math.max(0, target - credits), considered: all.length, stats, nodes };
  }

  // 결과의 시간을 내 시간표 수업 형식으로: [{ name, day, start, end, room }]
  function toClasses(picks) {
    const out = [];
    for (const p of picks || []) for (const [day, start, end, room] of p.section.t) out.push({ name: p.group.name, day, start, end, room: room || '' });
    return out;
  }

  return {
    normName, cleanKind, area, genArea, cleanHistory, totals, byTerm, termKey, requirement, remaining,
    currentTerm, semestersLeft, pace, nextTerm, buildCatalog, parsePaste, overlaps, groupOffered, modeOf, split,
    candidates, recommend, toClasses, deptMatch
  };
}));
