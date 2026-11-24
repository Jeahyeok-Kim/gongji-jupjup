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

  // ---------- 성적 (4.5 만점) ----------
  const GRADE_POINTS = { 'A+': 4.5, A0: 4.0, 'B+': 3.5, B0: 3.0, 'C+': 2.5, C0: 2.0, 'D+': 1.5, D0: 1.0, F: 0 };
  const GRADES = ['A+', 'A0', 'B+', 'B0', 'C+', 'C0', 'D+', 'D0', 'P'];
  function cleanGrade(g) {
    const x = String(g || '').trim().toUpperCase().replace(/^([ABCD])$/, '$10').replace(/^([ABCD])-$/, '$10').replace(/^PASS$|^S$/, 'P');
    return GRADES.includes(x) || x === 'F' ? x : '';
  }
  // 평점평균: P(통과)와 성적 없는 과목은 빼고, 학점을 곱해 평균 (소수 둘째 자리)
  function gpa(history, filter) {
    let sum = 0;
    let cr = 0;
    for (const x of history || []) {
      if (filter && !filter(x)) continue;
      const pt = GRADE_POINTS[cleanGrade(x.grade)];
      if (pt === undefined) continue;
      sum += pt * (Number(x.credit) || 0);
      cr += Number(x.credit) || 0;
    }
    return cr ? { gpa: Math.round((sum / cr) * 100) / 100, credits: cr } : null;
  }

  // ---------- 이수 내역 ----------
  const TERM_RE = /^(\d{4}-(1|2|S|W)|전적대|인정)$/;
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
      const grade = cleanGrade(x.grade);
      out.push(Object.assign({ id, name, code, credit, kind: cleanKind(x.kind), term }, grade ? { grade } : {}));
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

  // 학기 순서: '2025-1' < '2025-S' < '2025-2' < '2025-W' (전적대 인정은 별도 구분 표기)
  const TERM_ORDER = { 1: 0, S: 1, 2: 2, W: 3 };
  function termKey(term) {
    if (term === '전적대' || term === '인정') return -1;
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
  const DEPT_MAP = {
    '컴퓨터공학과': {
      en: 'Computer Engineering', zh: '计算机工学', ja: 'コンピュータ工学科',
      aliases: ['컴공', '컴공과', '컴퓨터', '컴퓨터공학', '컴터', '소웨', '소프트웨어', '소프트웨어공학', '전산', '정보통신',
                'computer', 'cs', 'ce', 'sw', 'comp', 'coomputer', 'computor', 'se', 'software', 'soft', 'it']
    },
    '경영학과': {
      en: 'Business Administration', zh: '经营学', ja: '経営学科',
      aliases: ['경영', '경영과', '비즈니스', 'business', 'ba', 'biz', 'management', 'bus']
    },
    '경제통상학과': {
      en: 'Economics & International Trade', zh: '经济通商学', ja: '経済通商学科',
      aliases: ['경통', '경제', '통상', '경제학과', '통상학과', 'econ', 'economics', 'trade']
    },
    '경찰학과': {
      en: 'Police Science', zh: '警察学', ja: '警察学科',
      aliases: ['경찰', '경찰행정', '경행', 'police', 'cop', 'cj']
    },
    '소방방재융합학과': {
      en: 'Fire Protection & Disaster Engineering', zh: '消防防灾融合学', ja: '消防防災融合学科',
      aliases: ['소방', '소방방재', '방재', '소방과', '소방학과', 'fire', 'safety', 'disaster']
    },
    '문헌정보학과': {
      en: 'Library & Information Science', zh: '文献信息学', ja: '文献情報学科',
      aliases: ['문정', '문헌', '문헌정보', '사서', 'lis', 'library']
    },
    '유아교육과': {
      en: 'Early Childhood Education', zh: '幼儿教育科', ja: '幼児教育科',
      aliases: ['유교', '유아', '유아교육', '유치원', 'ece', 'kindergarten']
    },
    '사회복지학과': {
      en: 'Social Welfare', zh: '社会福利学', ja: '社会福祉学科',
      aliases: ['사복', '사회복지', '복지', 'social', 'welfare']
    },
    '신문방송학과': {
      en: 'Journalism & Mass Communication', zh: '新闻传播学', ja: '新聞放送学科',
      aliases: ['신방', '신문', '방송', '언론', '언론정보', 'journalism', 'media', 'comm']
    },
    '동화·한국어문화학과': {
      en: 'Fairy Tale & Korean Culture', zh: '童话与韩国语文化学', ja: '童話・韓国語文化学科',
      aliases: ['동화', '한국어', '한국어문화', '국문', 'fairy', 'korean']
    },
    '영어문화학과': {
      en: 'English & Cultural Studies', zh: '英语文化学', ja: '英語文化学科',
      aliases: ['영문', '영어', '영어문화', '영어영문', 'english', 'eng']
    },
    '메카트로닉스공학과': {
      en: 'Mechatronics Engineering', zh: '机电工程学', ja: 'メカトロニクス工学科',
      aliases: ['메카', '메카트로닉스', '기계', '로봇', '기계전자', 'mechatronics', 'mecha', 'robot']
    },
    '바이오메디컬공학과': {
      en: 'Biomedical Engineering', zh: '生物医学工程', ja: '生体医工学科',
      aliases: ['바메공', '바이오메디컬', '의공', '의공학', 'bme', 'biomedical', 'biomed']
    },
    '녹색기술융합학과': {
      en: 'Green Technology Convergence', zh: '绿色技术融合学', ja: 'グリーンテクノロジー融合学科',
      aliases: ['녹기', '녹색기술', '환경', '환경공학', 'green', 'env']
    },
    '에너지신소재공학과': {
      en: 'Energy Materials Engineering', zh: '能源新材料工程', ja: 'エネルギー新素材工学科',
      aliases: ['신소재', '에너지신소재', '재료', '재료공학', '신소재공학', 'mse', 'materials', 'energy']
    },
    '간호학과': {
      en: 'Nursing', zh: '护理学', ja: '看護学科',
      aliases: ['간호', '간호과', 'nurse', 'nursing']
    },
    '바이오의약학과': {
      en: 'Biopharmaceuticals', zh: '生物医药学', ja: 'バイオ医薬学科',
      aliases: ['바의약', '바의동', '바이오의약', '제약', '약학', 'pharma', 'biopharma']
    },
    '생명공학과': {
      en: 'Biotechnology', zh: '生命工程学', ja: '生命工学科',
      aliases: ['생공', '생명공학', '생명', '바이오', '생명과학', 'biotech', 'bio', 'bt']
    },
    '식품영양학과': {
      en: 'Food & Nutrition', zh: '食品营养学', ja: '食品栄養学科',
      aliases: ['식영', '식품영양', '영양', '영양학과', 'food', 'nutrition']
    },
    '뷰티화장품학과': {
      en: 'Beauty & Cosmetic Science', zh: '美容化妆品学', ja: 'ビューティー化粧品学科',
      aliases: ['뷰티', '화장품', '뷰티화장품', 'cosmetics', 'beauty', 'cosmetic']
    },
    '스포츠건강학과': {
      en: 'Sports & Health Science', zh: '体育健康学', ja: 'スポーツ健康学科',
      aliases: ['스건', '스포츠', '체육', '스포츠건강', '체육학과', 'sports', 'pe', 'kinesiology']
    },
    '골프산업학과': {
      en: 'Golf Industry', zh: '高尔夫产业学', ja: 'ゴルフ産業学科',
      aliases: ['골프', '골프산업', 'golf']
    },
    '배터리반도체융합산업전공': {
      en: 'Battery & Semiconductor Convergence', zh: '电池与半导体融合学', ja: 'バッテリー半導体融合専攻',
      aliases: ['배반', '배터리', '반도체', '배터리반도체', 'battery', 'semi', 'semiconductor']
    },
    'AI빅데이터전공': {
      en: 'AI & Big Data', zh: '人工智能与大数据', ja: 'AI・ビッグデータ専攻',
      aliases: ['에이아이', '인공지능', '빅데이터', 'ai', 'bigdata', 'ds', 'data', 'datascience']
    },
    '스마트푸드테크산업전공': {
      en: 'Smart Food Tech Industry', zh: '智能食品科技产业', ja: 'スマートフードテック産業専攻',
      aliases: ['푸드테크', '스마트푸드', 'foodtech']
    },
    '다문화·한국어교육전공': {
      en: 'Multicultural & Korean Education', zh: '多元文化与韩语教育', ja: '多文化・韓国語教育専攻',
      aliases: ['다문화', '한국어교육', 'multicultural']
    },
    '상담심리전공': {
      en: 'Counseling Psychology', zh: '咨询心理学', ja: '相談心理学専攻',
      aliases: ['상심', '상담', '심리', '심리학', 'psychology', 'counseling']
    },
    '창업경영전공': {
      en: 'Entrepreneurship & Management', zh: '创业经营学', ja: '起業経営専攻',
      aliases: ['창경', '창업', '창업경영', 'startup', 'entrepreneurship']
    },
    '국제경영학과': {
      en: 'International Business', zh: '国际经营学', ja: '国際経営学科',
      aliases: ['국경', '국제경영', '글로벌경영', 'ib', 'global']
    },
    '미디어영상학과': {
      en: 'Media & Film', zh: '媒体影像学', ja: 'メディア映像学科',
      aliases: ['미영', '영상', '미디어영상', '영상학과', 'film', 'video']
    },
    '산업디자인학과': {
      en: 'Industrial Design', zh: '工业设计学', ja: '産業デザイン学科',
      aliases: ['산디', '산업디자인', 'id', 'industrial', 'product']
    },
    '실내디자인학과': {
      en: 'Interior Design', zh: '室内设计学', ja: '室内デザイン学科',
      aliases: ['실디', '실내디자인', '인테리어', 'interior']
    },
    '패션디자인학과': {
      en: 'Fashion Design', zh: '服装设计学', ja: 'ファッションデザイン学科',
      aliases: ['패디', '패션디자인', '패션', 'fashion']
    },
    '시각영상디자인학과': {
      en: 'Visual & Video Design', zh: '视觉传达与影像设计', ja: '視覚映像デザイン学科',
      aliases: ['시디', '시각디자인', '시각영상', 'vcd', 'visual']
    },
    '미디어콘텐츠학과': {
      en: 'Media Contents', zh: '媒体内容学', ja: 'メディアコンテンツ学科',
      aliases: ['미콘', '미디어콘텐츠', 'contents', 'content']
    },
    '조형예술학과': {
      en: 'Fine & Plastic Arts', zh: '造型艺术学', ja: '造形芸術学科',
      aliases: ['조형', '조형예술', '회화', '순수미술', '미술', 'art', 'fineart']
    }
  };

  function levenshteinDistance(s1, s2) {
    if (s1 === s2) return 0;
    const m = s1.length, n = s2.length;
    if (!m) return n;
    if (!n) return m;
    if (Math.abs(m - n) > 3) return 999;
    const d = [];
    for (let i = 0; i <= m; i++) d[i] = [i];
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      }
    }
    return d[m][n];
  }

  function normDeptStr(s) {
    return String(s || '').trim().toLowerCase().replace(/[\s\-_·•.,/()]/g, '');
  }

  function resolveDept(input, req) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    const depts = (req && req.depts) || {};
    const officialNames = Object.keys(depts);

    // 1. Exact match with official name
    if (depts[raw]) return raw;
    const normRaw = normDeptStr(raw);
    for (const name of officialNames) {
      if (normDeptStr(name) === normRaw) return name;
    }

    // 2. Exact match in DEPT_MAP multilingual names or aliases
    for (const [name, meta] of Object.entries(DEPT_MAP)) {
      if (normDeptStr(meta.en) === normRaw || normDeptStr(meta.zh) === normRaw || normDeptStr(meta.ja) === normRaw) {
        return name;
      }
      for (const a of meta.aliases || []) {
        if (normDeptStr(a) === normRaw) return name;
      }
    }

    // 3. Substring in official names (longest match)
    const subHits = officialNames.filter((k) => normDeptStr(k).includes(normRaw) || normRaw.includes(normDeptStr(k)))
      .sort((a, b) => b.length - a.length);
    if (subHits.length) return subHits[0];

    // 4. Substring in aliases
    if (normRaw.length >= 2) {
      for (const [name, meta] of Object.entries(DEPT_MAP)) {
        if (normDeptStr(meta.en).includes(normRaw) || normRaw.includes(normDeptStr(meta.en))) return name;
        for (const a of meta.aliases || []) {
          if (normDeptStr(a).includes(normRaw) || normRaw.includes(normDeptStr(a))) return name;
        }
      }
    }

    // 5. Fuzzy match (Levenshtein distance <= 2 for strings with length >= 4)
    if (normRaw.length >= 4) {
      let bestMatch = null;
      let minDistance = 999;
      for (const [name, meta] of Object.entries(DEPT_MAP)) {
        const dOfficial = levenshteinDistance(normRaw, normDeptStr(name));
        if (dOfficial <= 2 && dOfficial < minDistance) {
          minDistance = dOfficial;
          bestMatch = name;
        }
        const dEn = levenshteinDistance(normRaw, normDeptStr(meta.en));
        if (dEn <= 2 && dEn < minDistance) {
          minDistance = dEn;
          bestMatch = name;
        }
        for (const a of meta.aliases || []) {
          if (a.length >= 4) {
            const da = levenshteinDistance(normRaw, normDeptStr(a));
            if (da <= 2 && da < minDistance) {
              minDistance = da;
              bestMatch = name;
            }
          }
        }
      }
      if (bestMatch && minDistance <= 2) return bestMatch;
    }

    return '';
  }

  function findDept(dept, req) {
    const depts = (req && req.depts) || {};
    const d = String(dept || '').trim();
    if (!d) return null;
    if (depts[d]) return { name: d, row: depts[d] };
    const resolved = resolveDept(d, req);
    if (resolved && depts[resolved]) return { name: resolved, row: depts[resolved] };
    const hits = Object.keys(depts).filter((k) => k.includes(d) || d.includes(k)).sort((a, b) => b.length - a.length);
    return hits.length ? { name: hits[0], row: depts[hits[0]] } : null;
  }

  function searchDepts(query, req, lang) {
    const q = normDeptStr(query);
    const depts = (req && req.depts) || {};
    const officialNames = Object.keys(depts).length ? Object.keys(depts) : Object.keys(DEPT_MAP);
    if (!q) {
      return officialNames.map((name) => {
        const meta = DEPT_MAP[name] || { en: '', zh: '', ja: '', aliases: [] };
        const local = (lang && lang !== 'ko' && meta[lang]) ? meta[lang] : '';
        return {
          name,
          displayName: local ? `${name} (${local})` : name,
          subText: [meta.en, ...(meta.aliases || []).slice(0, 3)].filter(Boolean).join(' · ')
        };
      });
    }

    const scored = [];
    for (const name of officialNames) {
      const meta = DEPT_MAP[name] || { en: '', zh: '', ja: '', aliases: [] };
      const normName = normDeptStr(name);
      let score = 0;
      let matchNote = '';

      if (normName === q) {
        score = 1000;
      } else if (normName.startsWith(q)) {
        score = 600;
      } else if (normName.includes(q)) {
        score = 400;
      }

      for (const lk of ['en', 'zh', 'ja']) {
        const val = normDeptStr(meta[lk]);
        if (val) {
          if (val === q) { score = Math.max(score, 900); matchNote = meta[lk]; }
          else if (val.startsWith(q)) { score = Math.max(score, 550); matchNote = meta[lk]; }
          else if (val.includes(q)) { score = Math.max(score, 350); matchNote = meta[lk]; }
        }
      }

      for (const a of meta.aliases || []) {
        const na = normDeptStr(a);
        if (na === q) { score = Math.max(score, 850); matchNote = a; }
        else if (na.startsWith(q)) { score = Math.max(score, 500); matchNote = a; }
        else if (na.includes(q)) { score = Math.max(score, 300); matchNote = a; }
      }

      if (q.length >= 3 && score < 300) {
        const dEn = levenshteinDistance(q, normDeptStr(meta.en));
        if (dEn <= 2) { score = Math.max(score, 250 - dEn * 50); matchNote = meta.en; }
        const dName = levenshteinDistance(q, normName);
        if (dName <= 2) { score = Math.max(score, 250 - dName * 50); }
        for (const a of meta.aliases || []) {
          if (a.length >= 3) {
            const da = levenshteinDistance(q, normDeptStr(a));
            if (da <= 2) { score = Math.max(score, 220 - da * 50); matchNote = a; }
          }
        }
      }

      if (score > 0) {
        const local = (lang && lang !== 'ko' && meta[lang]) ? meta[lang] : '';
        scored.push({
          name,
          displayName: local ? `${name} (${local})` : name,
          subText: [meta.en, matchNote, ...(meta.aliases || []).slice(0, 2)].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(' · '),
          score
        });
      }
    }

    return scored.sort((a, b) => b.score - a.score);
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
      const defaultTot = (reqData && reqData.transferTotal) || 66;
      base = { total: defaultTot, major: row ? Math.min(row[1] + row[2], defaultTot) : 66, general: 0, majorReq: row ? row[1] : null };

      // 편입생 총 이수학점: 기본 66학점이나 다전공(복수전공)·융합전공·부전공 및 초과이수를 고려하여 최대 250학점까지 수동 자유 설정 허용
      let tot = num(c.total, 30, 250);
      if (tot === null) tot = defaultTot;
      base.total = tot;

      // 전공 최소 학점: 0부터 250학점까지 허용
      let maj = num(c.major, 0, 250);
      if (maj === null) {
        maj = base.major !== null ? base.major : defaultTot;
      }
      base.major = maj;

      // 자유/다전공 학점: 0부터 250학점까지 허용.
      // 명시적으로 지정되지 않은 경우에만 잔여(tot - maj)로 산출
      let genVal = num(c.general, 0, 250);
      if (genVal === null) {
        genVal = Math.max(0, tot - maj);
      }
      base.general = genVal;

      const edited = {};
      if (c.total !== undefined && c.total !== null && c.total !== defaultTot) edited.total = true;
      if (c.major !== undefined && c.major !== null && c.major !== (row ? Math.min(row[1] + row[2], defaultTot) : 66)) edited.major = true;
      if (c.general !== undefined && c.general !== null) edited.general = true;

      return {
        mode, dept: found ? found.name : '', found: !!found, edited,
        total: base.total, major: base.major, general: base.general, majorReq: base.majorReq,
        gen: null
      };
    } else {
      base = row ? { total: row[3], major: row[1] + row[2], general: row[0], majorReq: row[1] } : { total: null, major: null, general: null, majorReq: null };
      const edited = {};
      for (const k of ['total', 'major', 'general']) {
        let v = num(c[k], 0, 300);
        if (v !== null) { base[k] = v; edited[k] = true; }
      }
      return {
        mode, dept: found ? found.name : '', found: !!found, edited,
        total: base.total, major: base.major, general: base.general, majorReq: base.majorReq,
        gen: gen && !edited.general && base.general === 31 ? gen : null
      };
    }
  }

  function remaining(req, tot) {
    const left = (need, done) => (need === null || need === undefined ? null : Math.max(0, need - done));
    if (req.mode === 'transfer') {
      const majorLeft = left(req.major, tot.major);
      const rawTotalLeft = left(req.total, tot.total);
      const totalLeft = (rawTotalLeft !== null && majorLeft !== null) ? Math.max(rawTotalLeft, majorLeft) : rawTotalLeft;
      const freeLeft = (totalLeft !== null && majorLeft !== null) ? Math.max(0, totalLeft - majorLeft) : null;
      return {
        total: totalLeft,
        major: majorLeft,
        general: freeLeft,
        free: freeLeft,
        gen: null
      };
    }
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
    const m = /(20\d{2})\s*(?:년도?|학년도)?\s*[-./\s]?\s*(1|2|여름|하계|겨울|동계)\s*(?:학기)?/.exec(line);
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
        const termOnly = (x) => !/[가-힣A-Za-z]{2,}/.test(x.replace(/20\d{2}\s*(년도?|학년도)?/g, '').replace(/(1|2)?\s*학기|여름|겨울|하계|동계|계절/g, ''));
        const tok = tokens.find((x) => /[가-힣A-Za-z]{2,}/.test(x) && !termOnly(x) && !KIND_RE.test(x) && !GRADE_TOKEN.test(x) && !/^[A-Z]{4}\d{5}$/.test(x)
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
      const gradeTok = tokens.find((x) => GRADE_TOKEN.test(x) && !/^(W|U|FA|NP|F)$/i.test(x));
      const grade = gradeTok ? cleanGrade(gradeTok) : '';
      items.push(Object.assign({ name, code: code || (cat && cat.code) || '', credit, kind, term }, grade ? { grade } : {}));
    }
    return { items, failed, skipped };
  }

  // 내 학과 요람의 전공필수 중 아직 안 들은 과목 (courses: [학년-학기, 이수구분, 과목명, 학점])
  function requiredLeft(courses, history) {
    const done = new Set((history || []).map((x) => normName(x.name)));
    const seen = new Set();
    const out = [];
    for (const [term, kind, name, credit] of courses || []) {
      const n = normName(name);
      if (cleanKind(kind) !== '전필' || done.has(n) || seen.has(n)) continue;
      seen.add(n);
      out.push({ term, name, credit: Number(credit) || 0 });
    }
    return out.sort((a, b) => String(a.term).localeCompare(String(b.term)) || a.name.localeCompare(b.name));
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
      g.sections.push({ s: c.s || '', t: c.t || [], mode: modeOf(c), prof: c.p || c.prof || '', sig });
    }
    for (const g of map.values()) g.sections.sort((a, b) => a.s.localeCompare(b.s));
    return [...map.values()];
  }

  const deptMatch = (a, b) => {
    const x = String(a || '').trim().replace(/\s+/g, '').toLowerCase();
    const y = String(b || '').trim().replace(/\s+/g, '').toLowerCase();
    if (!x || !y) return false;
    if (x === y || x.includes(y) || y.includes(x)) return true;
    const clean = (s) => s.replace(/(학부|전공|학과|공학과|트랙)$/, '');
    const cx = clean(x);
    const cy = clean(y);
    return cx.length >= 2 && cy.length >= 2 && (cx.includes(cy) || cy.includes(cx));
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

  // ---------- 시간표 품질 평가 (Schedule Quality Fitness) ----------
  // 공강일 수, 우주공강 방지, 점심시간 확보, 하루 1과목 낭비 등교 방지 등을 점수화
  function scheduleQuality(slots, theme) {
    if (!slots || !slots.length) return 60;
    const byDay = {};
    for (const [d, a, b] of slots) {
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push([toMin(a), toMin(b)]);
    }
    let score = 100;
    const weekdays = [1, 2, 3, 4, 5];
    const daysAttending = weekdays.filter((d) => byDay[d] && byDay[d].length > 0);
    const freeDaysCount = 5 - daysAttending.length;

    // 1. 공강일 보너스
    if (freeDaysCount === 1) score += (theme === 'freeDay' ? 50 : 30);
    else if (freeDaysCount === 2) score += (theme === 'freeDay' ? 100 : 70);
    else if (freeDaysCount >= 3) score += (theme === 'freeDay' ? 140 : 100);

    // 금공강 / 월공강 특화 보너스
    if (!byDay[5] || byDay[5].length === 0) score += (theme === 'freeDay' ? 35 : 20);
    if (!byDay[1] || byDay[1].length === 0) score += (theme === 'freeDay' ? 25 : 15);

    for (const d of daysAttending) {
      const times = byDay[d].sort((x, y) => x[0] - y[0]);

      // 하루 1과목만 듣기 위한 단과목 등교 페널티 (이동 시간 대비 비효율)
      if (times.length === 1 && (times[0][1] - times[0][0]) <= 90) {
        score -= 20;
      }

      // 우주공강(2.5시간 이상 틈) 페널티 및 적정 이동시간 보너스
      let hasLunch = false;
      for (let i = 0; i < times.length - 1; i++) {
        const gap = times[i + 1][0] - times[i][1];
        if (gap > 150) {
          score -= Math.min(50, 20 + Math.round((gap - 150) / 3)); // 우주공강 감점
        } else if (gap >= 20 && gap <= 80) {
          score += 8; // 편안한 쉬는시간
        }
        // 점심시간(11:30~13:30 사이) 40분 이상 공강 확보
        if (times[i][1] <= 12 * 60 + 20 && times[i + 1][0] >= 12 * 60 + 40 && gap >= 40) {
          hasLunch = true;
        }
      }

      // 오후 늦게 시작하거나 12시 전에 끝나는 날은 자연스럽게 식사 가능
      if (times[times.length - 1][1] <= 12 * 60 || times[0][0] >= 13 * 60) {
        hasLunch = true;
      }
      if (hasLunch) score += 12;
      else if (times.length >= 2) score -= 15; // 밥 못 먹는 연강

      // 과도한 하루 연강(5시간 초과) 피로도 페널티
      const dailyTotal = times.reduce((s, t) => s + (t[1] - t[0]), 0);
      if (dailyTotal > 300) score -= 25;

      // 테마: 늦게 시작(lateStart)
      if (theme === 'lateStart') {
        if (times[0][0] < 10 * 60 + 30) score -= 40; // 1교시 회피
        else score += 25;
      }
    }
    return score;
  }

  // ---------- 추천 ----------
  function candidates(opts) {
    const o = opts || {};
    const inc = { major: true, general: true, elearn: true, live: true, ...(o.include || {}) };
    const taken = o.taken || new Set();
    const excluded = new Set(o.excluded || []);
    const lockedKeys = new Set((o.locked || []).map((x) => x.key));
    const grades = Array.isArray(o.grades) && o.grades.length ? new Set(o.grades.map(Number)) : null;
    const avoid = new Set(o.avoidDays || []);
    const minStart = Number(o.minStart) || 0;
    const deptCourses = o.deptCourses || new Set();
    const left = o.left || {};
    const reqLeftNames = new Set((o.requiredCourses || []).map(normName));
    const out = [];
    const stats = { taken: 0, grade: 0, time: 0, area: 0 };
    const needFree = (left.free && left.free > 0) || (left.total !== null && left.total > ((left.major || 0) + (left.general || 0)));

    for (const g of o.groups || []) {
      if (excluded.has(g.key) || g.credit <= 0) continue;
      const nm = normName(g.name);
      if ((g.code && taken.has(g.code)) || taken.has(nm)) { stats.taken += 1; continue; }
      const isLocked = lockedKeys.has(g.key);
      const isReqLeft = (g.kind === '전필' || reqLeftNames.has(nm)) && (deptMatch(g.dept, o.dept) || deptCourses.has(nm));
      let ar = g.area;

      if (ar === 'major' && !(deptMatch(g.dept, o.dept) || deptCourses.has(nm))) {
        ar = 'free'; // 타 학과 전공은 일반선택 영역으로 전환
      }

      if (!isLocked) {
        if (ar === 'major' && !inc.major) { stats.area += 1; continue; }
        if (ar === 'general' && !inc.general) { stats.area += 1; continue; }
        if (ar === 'free' && (!needFree && !isLocked && !inc.general)) { stats.area += 1; continue; }
        if (grades && g.grade && !grades.has(g.grade)) { stats.grade += 1; continue; }
      }

      const sections = isLocked ? g.sections : g.sections.filter((s) => {
        if (s.mode === 'elearn' && !inc.elearn) return false;
        if (s.mode === 'live' && !inc.live) return false;
        if (s.t && s.t.length) {
          if (s.t.some(([d, a]) => avoid.has(d) || (minStart && toMin(a) < minStart))) return false;
          if (overlaps(s.t, o.busy || [])) return false;
        }
        return true;
      });

      if (!sections.length) { stats.time += 1; continue; }

      // 스마트 점수 체계: 미이수 전필 > 부족 영역 교양 > 전공선택 > 일반선택
      let score = 50;
      if (isReqLeft) {
        score = 160; // 미이수 전공필수 최우선
      } else if (ar === 'major') {
        score = (left.major === 0) ? 35 : (g.kind === '전필' ? 120 : 90);
      } else if (ar === 'general') {
        score = (left.general === 0) ? 25 : 70;
        if (left.gen && g.gen) {
          if (left.gen[g.gen] > 0) score += 30; // 부족한 세부 교양 영역
          else score -= 15; // 이미 채운 세부 영역
        }
      } else {
        score = needFree ? 50 : 20;
      }

      if (o.myGrade && g.grade) {
        if (g.grade === o.myGrade) score += 15;
        else if (g.grade < o.myGrade) score += (isReqLeft ? 20 : 5);
        else score -= 10;
      }

      if (deptCourses.has(nm)) score += 10;
      if (ar === 'major' && deptMatch(g.dept, o.dept)) score += 10;
      if (o.theme === 'smartMix' && sections.some((s) => s.mode === 'elearn')) score += 30;

      out.push({ g, sections, score, area: ar, isReqLeft });
    }

    out.sort((a, b) => b.score - a.score || b.g.credit - a.g.credit || a.g.name.localeCompare(b.g.name));
    return { list: out, stats };
  }

  function recommend(opts) {
    const o = opts || {};
    const target = num(o.target, 1, 30) || 18;
    const left = o.left || {};
    const { list: all, stats } = candidates(o);

    // 1단계: 꼭 넣을 고정 과목 및 미이수 전공필수 우선 슬롯 확보
    const fixed = [];
    let fixedSlots = [...(o.busy || [])].map((x) => x.slice(0, 3));
    let fixedCredits = 0;
    const lockedMap = new Map((o.locked || []).map((x) => [x.key, x.s]));

    // 고정 과목
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

    // 2단계: 탐색할 자유 후보군
    const per = num(o.limit, 6, 60) || 28;
    const free = all.filter((c) => !lockedMap.has(c.g.key) && !fixedNames.has(normName(c.g.name)));
    const pool = ['major', 'general', 'free'].flatMap((a) => free.filter((c) => c.area === a).slice(0, a === 'free' ? 6 : per))
      .sort((a, b) => (b.score / b.g.credit) - (a.score / a.g.credit) || b.score - a.score);
    const n = pool.length;
    const maxNodes = o.maxNodes || 50000;
    let nodes = 0;

    let best = { val: -1, quality: -1, credits: -1, chosen: [] };
    const cap = target - fixedCredits;
    const areaUsed = { major: 0, general: 0, free: 0 };
    const quota = o.quota || split(left, target);
    for (const f of fixed) areaUsed[f.c.area] += f.c.g.credit;

    const chosen = [];
    const names = new Set(fixedNames);

    const valueOf = (c) => {
      const cap2 = c.area === 'major' ? quota.major : c.area === 'general' ? quota.general : 0;
      const over = areaUsed[c.area] >= cap2;
      return (over ? Math.min(c.score, 18) : c.score) * c.g.credit;
    };

    function evaluateCombo(items, currentCredits, currentSlots) {
      const courseVal = items.reduce((sum, item) => sum + valueOf(item.c), 0);
      const quality = scheduleQuality(currentSlots, o.theme);
      // 목표 학점을 맞추는 것이 1순위, 그 다음 과목 가치와 시간표 품질
      const creditScore = currentCredits === cap ? 200 : currentCredits > (cap - 2) ? 100 : 0;
      return (courseVal * 0.7) + (quality * 0.8) + creditScore;
    }

    function dfs(i, credits, slots, val) {
      nodes += 1;
      if (credits <= cap) {
        const quality = scheduleQuality(slots, o.theme);
        const comboScore = evaluateCombo(chosen, credits, slots);
        if (comboScore > best.val || (comboScore === best.val && credits > best.credits)) {
          best = { val: comboScore, quality, credits, chosen: chosen.slice() };
        }
      }
      if (i >= n || nodes > maxNodes || credits >= cap) return;

      const c = pool[i];
      const nm = normName(c.g.name);
      if (credits + c.g.credit <= cap && !names.has(nm)) {
        const tried = new Set();
        // 분반 선택 시 시간대가 다른 상위 3개 분반 시도
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
    const result = picks.map((p, idx) => {
      const others = picks.filter((_, j) => j !== idx).flatMap((q) => q.sec.t).concat((o.busy || []).map((x) => x.slice(0, 3)));
      const alts = p.c.sections.filter((s) => s !== p.sec && !overlaps(s.t, others));
      return { key: p.c.g.key, group: p.c.g, section: p.sec, area: p.c.area, score: p.c.score, locked: p.locked, alts };
    });

    const credits = result.reduce((s, r) => s + r.group.credit, 0);
    const byArea = { major: 0, general: 0, free: 0 };
    for (const r of result) byArea[r.area] += r.group.credit;
    result.sort((a, b) => (a.area === b.area ? 0 : a.area === 'major' ? -1 : b.area === 'major' ? 1 : 0) || b.score - a.score);

    const finalQuality = scheduleQuality(result.flatMap((r) => r.section.t), o.theme);
    return { picks: result, credits, byArea, target, quota, value: best.val, quality: finalQuality, short: Math.max(0, target - credits), considered: all.length, stats, nodes };
  }

  // 결과에서 수업이 있는 요일 (월=1 … 일=0) 과 가장 이른 시작 시각
  function daysUsed(r) {
    return [...new Set((r.picks || []).flatMap((p) => p.section.t.map((x) => x[0])))].sort((a, b) => (a || 7) - (b || 7));
  }
  function earliest(r) {
    const all = (r.picks || []).flatMap((p) => p.section.t.map((x) => toMin(x[1])));
    return all.length ? Math.min(...all) : null;
  }

  // ---------- 추천 4대 테마 ----------
  // 1. balanced: 황금 밸런스형 (전필 우선 + 점심시간 확보 + 요일별 고른 분산)
  // 2. freeDay: 공강 극대화형 (금공강/월공강 우선, 주 3~4일 등교 시간표)
  // 3. lateStart: 오후 집중형 (오전 10:30 이전 1교시 배제)
  // 4. smartMix: 이러닝+대면 꿀조합 (원격 과목 활용으로 등교 부담 최소화)
  function alternatives(opts) {
    const o = { ...(opts || {}), maxNodes: (opts && opts.maxNodes) || 30000 };
    const base = recommend({ ...o, theme: 'balanced' });
    const enough = (r) => r.credits >= Math.min(base.credits, base.target - 2);
    const out = [{ key: 'balanced', title: '황금 밸런스', result: base, days: daysUsed(base), start: earliest(base), quality: base.quality }];

    const avoid0 = o.avoidDays || [];
    const weekdays = [1, 2, 3, 4, 5].filter((d) => !avoid0.includes(d));
    const freeOf = (r) => weekdays.filter((d) => !daysUsed(r).includes(d)).length;

    // 2. 공강 극대화
    let bestFree = { r: base, free: freeOf(base) };
    const tryFreeDays = (days) => {
      const r = recommend({ ...o, theme: 'freeDay', avoidDays: avoid0.concat(days) });
      if (!enough(r)) return;
      const f = freeOf(r);
      if (f > bestFree.free || (f === bestFree.free && r.credits > bestFree.r.credits)) bestFree = { r, free: f };
    };
    for (const d of [5, 1, 4, 2, 3]) tryFreeDays([d]); // 금공강, 월공강 우선 시도
    out.push({
      key: 'freeDay', title: '공강 극대화', result: bestFree.r,
      days: daysUsed(bestFree.r), free: weekdays.filter((d) => !daysUsed(bestFree.r).includes(d)),
      start: earliest(bestFree.r), quality: bestFree.r.quality
    });

    // 3. 늦게 시작 (오전 10:30 이후)
    const late = recommend({ ...o, theme: 'lateStart', minStart: 10 * 60 + 30 });
    out.push({
      key: 'lateStart', title: '오후 집중', result: late,
      days: daysUsed(late), start: earliest(late), quality: late.quality, ok: enough(late)
    });

    // 4. 이러닝 꿀조합 (원격 수업 적극 포함)
    const smart = recommend({ ...o, theme: 'smartMix', include: { ...(o.include || {}), elearn: true } });
    out.push({
      key: 'smartMix', title: '이러닝 꿀조합', result: smart,
      days: daysUsed(smart), start: earliest(smart), quality: smart.quality
    });

    return out;
  }

  // 졸업 로드맵: 남은 학점을 남은 학기에 고르게 나누고, 학기마다 전공·교양을 남은 비율대로
  function roadmap(left, semesters, firstTerm) {
    const n = Math.max(0, Math.min(12, Number(semesters) || 0));
    const total = Math.max(0, Number(left && left.total) || 0);
    if (!n || !total) return [];
    let restM = Math.max(0, Number(left.major) || 0);
    let restG = Math.max(0, Number(left.general) || 0);
    let restT = total;
    const out = [];
    let term = firstTerm;
    for (let i = 0; i < n; i++) {
      const credits = Math.ceil(restT / (n - i));
      const sp = split({ major: restM, general: restG }, credits);
      out.push({ term, credits, major: sp.major, general: sp.general, free: sp.free });
      restT -= credits; restM -= sp.major; restG -= sp.general;
      const m = /^(\d{4})-(1|2)$/.exec(term || '');
      term = m ? (m[2] === '1' ? `${m[1]}-2` : `${Number(m[1]) + 1}-1`) : '';
    }
    return out;
  }

  // 목표 졸업 평점 역산기 계산: 현재 이수학점, 현재 평점, 잔여 학점, 목표 평점
  function simGpa(curCredits, curGpa, remCredits, targetGpa) {
    const curC = Math.max(0, Number(curCredits) || 0);
    const curG = Math.max(0, Math.min(4.5, Number(curGpa) || 0));
    const rem = Math.max(1, Number(remCredits) || 18);
    const target = Math.max(0, Math.min(4.5, Number(targetGpa) || 4.0));

    const curSum = curC * curG;
    const targetSum = (curC + rem) * target;
    const neededSum = targetSum - curSum;
    const neededGpa = neededSum / rem;
    const maxPossible = Math.min(4.5, (curSum + rem * 4.5) / (curC + rem));
    const maxRounded = Math.round(maxPossible * 100) / 100;
    const targetRounded = Math.round(target * 100) / 100;

    if (neededGpa <= 0) {
      return { status: 'achieved', neededGpa: 0, maxPossible, maxRounded, target };
    }
    // 소수점 둘째 자리 반올림으로도 목표에 도달할 수 없는 경우 (불가능)
    if (targetRounded > maxRounded) {
      return { status: 'impossible', neededGpa, maxPossible, maxRounded, target };
    }
    // 전과목 A+(4.5) 만점 취득 시에만 달성 가능한 최고 난도 케이스 (4.495 이상이거나 반올림 한계치에 걸친 경우)
    if (neededGpa >= 4.495 || targetRounded === maxRounded) {
      return { status: 'all-aplus', neededGpa: 4.5, maxPossible, maxRounded, target };
    }
    // 4.40 이상 4.495 미만: 거의 전과목 A+ 수준 (한 과목만 감점되어도 미달 위기인 극상 난이도)
    if (neededGpa >= 4.40) {
      return { status: 'extreme', neededGpa, maxPossible, maxRounded, target };
    }
    // 4.15 이상 4.40 미만: A+ 및 A0 위주의 고득점 필요
    if (neededGpa >= 4.15) {
      return { status: 'challenging', neededGpa, maxPossible, maxRounded, target };
    }
    // 3.70 이상 4.15 미만: A0 및 B+ 위주의 달성 가능권
    if (neededGpa >= 3.70) {
      return { status: 'possible', neededGpa, maxPossible, maxRounded, target };
    }
    // 3.70 미만: 여유 있는 안정권
    return { status: 'comfortable', neededGpa, maxPossible, maxRounded, target };
  }

  // 결과의 시간을 내 시간표 수업 형식으로: [{ name, prof, day, start, end, room }] (이러닝은 elearn: true)
  function toClasses(picks) {
    const out = [];
    for (const p of picks || []) {
      const prof = p.section.prof || p.group.prof || '';
      if (!p.section.t || !p.section.t.length) {
        out.push({ name: p.group.name, prof, elearn: true, m: 'elearn', room: '이러닝' });
      } else {
        for (const [day, start, end, room] of p.section.t) {
          out.push({ name: p.group.name, prof, day, start, end, room: room || '' });
        }
      }
    }
    return out;
  }

  return {
    normName, cleanKind, area, genArea, cleanHistory, totals, byTerm, termKey, requirement, remaining,
    currentTerm, semestersLeft, pace, nextTerm, buildCatalog, parsePaste, overlaps, groupOffered, modeOf, split,
    candidates, recommend, toClasses, deptMatch, alternatives, roadmap, daysUsed, earliest,
    GRADES, cleanGrade, gpa, requiredLeft, simGpa,
    findDept, resolveDept, searchDepts, DEPT_MAP
  };
}));
