// 지원 자격 판정: 내 정보(학년·학적·유학생 여부·학과)와 공지의 '지원 대상' 글을 비교한다.
// AI가 뽑아 둔 대상 글(eligibility.ko)과 제목을 규칙으로 읽어
//   'no'    분명히 대상이 아님 (교직원 대상, 대학원생만, 학년·국적·캠퍼스가 안 맞음, 휴학생 제외 등)
//   'check' 대상일 수 있지만 조건을 확인해야 함 (성적·소득·특정 학과·지역 등)
//   'yes'   대상에 들어감 (재학생·대학생·누구나 등)
//   null    대상 글이 없어 판단하지 않음
// 사람이 볼 이유(reasons)는 코드와 값으로 돌려주고, 문구는 화면(i18n)에서 만든다.
(function (root) {
  'use strict';

  // 학생이 아닌 사람만 대상인 글 (교수·직원 등)
  const STAFF = /(교직원|교원|전임\s*교수|비전임|교수(?!법|학습|님과)|(?<![가-힣])강사(?!진)|직원(?!\s*추천)|의사|간호사)/;
  const STUDENT = /(학생|대학생|재학|휴학|학부|청년|누구나|국민|시민|대학\s*\(?원\)?\s*생|학습자|사람|인재|청소년|개인|팀|희망자|관심\s*있는|모든|대중|일반인)/;
  const GRAD_ONLY = /(대학원생|석\s*\.?\s*박사|석사\s*과정|박사\s*과정|박사\s*후|포스트\s*닥)/;
  const UNDERGRAD = /(학부|대학생|(?<!대학원\s?)재학생|대학\s*\(\s*원\s*\)\s*생|대학\s*및\s*대학원|청년|누구나|학생(?!.*대학원생만))/;
  const GRADUATE = /(졸업생|졸업자|졸업\s*\(\s*예정\s*\)\s*자|졸업\s*예정자)/;
  const INTL_ONLY = /(외국인\s*(유학)?\s*(학)?생|유학생|외국인\s*학생|international)/ig;
  const OTHER_PEOPLE = /(재학생|학생|대학생|가능자|경험자|국민|누구나|청년|시민|졸업생|이수자|희망자)/;
  const DOMESTIC = /(대[한학]민국\s*국적|한국\s*국적|국적\s*(을|이)?\s*(가진|보유|소지)|내국인)/;
  const CITIZEN = /(대한민국\s*)?국민/;
  const SEOUL_ONLY = /서울\s*캠퍼스/;
  const GLOCAL = /(글로컬|GLOCAL|충주)/i;
  const AGE = /(만\s*\d{2}\s*세|\d{2}\s*[~∼\-]\s*\d{2}\s*세|\d{4}\s*년?\s*[~∼\-]\s*\d{4}\s*년\s*생|\d{4}년[^,]{0,12}(이전|이후)\s*출생)/;
  const EXTRA = /(성적|평점|백분위|학점\s*이상|이수한|소득\s*분위|학자금\s*지원\s*구간|분위\s*이(하|내)|다자녀|장애|기초생활|차상위|봉사\s*시간|토익|TOPIK|어학\s*성적|자격증)/i;
  const REGION = /((충북|충청북도|충주|강화군|서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|전남|전북|경남|경북|제주)[^,·]{0,6}(거주|출신|소재|주소))/;
  // 건국대 GLOCAL캠퍼스는 충북 충주 소재 대학이므로 '충북/충주 소재 대학(원)생'은 지역 조건 확인에서 제외
  const LOCAL_UNIV_REGION = /(충북|충청북도|충주)\s*(지역\s*)?(소재|내)\s*대학/;
  const EXCLUDE_WORDS = /(제외|불가|불가능|안\s*됨|지원할\s*수\s*없)/;

  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  // 학년 조건: '3학년 이상', '1~2학년', '3, 4학년', '신입생', '5학기 이상' → {min, max} (모르면 null)
  function gradeRange(text) {
    const t = text.replace(/(초등학교|초등|중학교|중학생|고등학교|고등학생|중·고등)\s*\d\s*학년/g, '');
    if (/등록\s*예정/.test(t)) return null;                  // '내년 3학년 등록예정' 같은 글은 지금 학년과 다름
    let m = t.match(/([1-4])\s*[~∼\-]\s*([1-4])\s*학년/);
    if (m) return { min: +m[1], max: +m[2] };
    m = t.match(/([1-4])\s*학년\s*(이상|부터)/);
    if (m) return { min: +m[1], max: 4 };
    m = t.match(/([1-4])\s*학년\s*(이하|까지)/);
    if (m) return { min: 1, max: +m[1] };
    m = t.match(/((?:[1-4]\s*[,·및]\s*)+[1-4])\s*학년/);
    if (m) { const ns = m[1].match(/[1-4]/g).map(Number); return { min: Math.min(...ns), max: Math.max(...ns), list: ns }; }
    m = t.match(/([1-4])\s*학년\s*(재학생|학생|대상|만)/) || t.match(/\(\s*([1-4])\s*학년\s*\)/);
    if (m) return { min: +m[1], max: +m[1] };
    m = t.match(/([3-8])\s*학기\s*(이상|부터)/);                    // 5학기 이상 → 3학년 이상
    if (m) return { min: Math.ceil(+m[1] / 2), max: 4 };
    if (/신입생/.test(t) && !/(신입생\s*(제외|불가)|재학생\s*및\s*신입생|신입생\s*및\s*재학생)/.test(t)) return { min: 1, max: 1 };
    return null;
  }

  // 특정 학과 대상: 'OO학과 졸업생', '의예과/의학과 학생', '융합학부 … 이수'
  function departments(text) {
    const out = [];
    const re = /([가-힣A-Za-z·]{2,20}(?:학과|학부|전공|의예과))/g;
    let m;
    while ((m = re.exec(text))) {
      const d = m[1];
      if (/^(전공무관|다른|타|복수|부|연합|희망|관련|해당|전|본|모든|각|소속)/.test(d) || /(무관|불문)/.test(text.slice(m.index, m.index + d.length + 4))) continue;
      out.push(d);
    }
    return out;
  }

  // 대상 글 하나 → 조건 묶음
  function parse(eligText, title) {
    const text = norm(eligText);
    const head = norm(title);
    if (!text && !/(교수|교직원|교원)\s*(대상|만)/.test(head)) return null;
    const c = { text };
    c.staff = (STAFF.test(text) && !STUDENT.test(text)) || /\(\s*(전\s*)?(교수|교직원|교원)[^)]*대상\s*\)/.test(head);
    c.gradOnly = GRAD_ONLY.test(text) && !UNDERGRAD.test(text) && !/(이수자|예정자|학생|학부)/.test(text.replace(GRAD_ONLY, ''));
    c.graduateOnly = (GRADUATE.test(text) && !/(재학|학생(?!\s*\))|대학생)/.test(text.replace(GRADUATE, ''))) || /졸업\s*대상자/.test(text);
    c.graduateSoon = /졸업\s*\(?\s*예정|졸업\s*대상자/.test(text);
    // 유학생만 대상: 유학생 말고 다른 대상(재학생·가능자 등)이 같이 적혀 있으면 아님
    const rest = text.replace(INTL_ONLY, '');
    c.intlOnly = new RegExp(INTL_ONLY.source, 'i').test(text) && !OTHER_PEOPLE.test(rest) && !/(내국인|한국인|국민|모든|누구나)/.test(text) && !/(유학생\s*(제외|불가))/.test(text);
    c.domesticOnly = DOMESTIC.test(text);
    c.citizen = !c.domesticOnly && CITIZEN.test(text) && !/외국인/.test(text);
    c.seoulOnly = SEOUL_ONLY.test(text) && !GLOCAL.test(text);
    c.grade = gradeRange(text);
    // 휴학생: '휴학생 … 제외/불가' 이면 안 됨, '휴학생 … 가능/모두' 이면 됨
    const leaveSeg = text.split(/[,)(/]/).filter((s) => /휴학/.test(s));
    c.leaveExcluded = leaveSeg.some((s) => EXCLUDE_WORDS.test(s)) || /\([^)]*휴학[^)]*\)\s*(제외|불가)/.test(text) || /휴학[^)]*(제외|불가)/.test(text);
    c.leaveOk = /휴학/.test(text) && !c.leaveExcluded;
    c.enrolledOnly = /재학/.test(text) && !c.leaveOk;
    c.depts = departments(text);
    c.extra = EXTRA.test(text);
    c.region = REGION.test(text) && !(LOCAL_UNIV_REGION.test(text) && !/(거주|출신|주소|관외|도민|시민)/.test(text));
    c.age = AGE.test(text);
    c.open = /(누구나|제한\s*없|모든\s*(사람|학생)|전체\s*학생|전\s*국민|대학생|대학\s*\(?\s*원\s*\)?\s*생|재학생|학생|청년|학우|구성원|본교생|고졸\s*이상|개인\s*(또는|및)|팀\s*단위|관심\s*(이\s*)?있는|희망하는|싶은\s*(사람|분))/.test(text);
    return c;
  }

  const has = (v) => v !== undefined && v !== null && v !== '';

  // 내 정보와 비교. profile: { level: 'undergrad'|'grad', grade: 1~4, status: 'enrolled'|'leave', intl: bool, dept: '컴퓨터공학과' }
  function judge(notice, profile) {
    if (!profile || !profile.set) return null;
    const c = parse(notice && notice.eligibility && notice.eligibility.ko, notice && notice.title);
    if (!c) return null;
    const no = [];
    const check = [];
    if (c.staff) no.push({ code: 'staff' });
    const grad = profile.level === 'grad';
    if (c.gradOnly && !grad) no.push({ code: 'gradOnly' });
    if (c.graduateOnly && !(c.graduateSoon && profile.grade === 4)) no.push({ code: 'graduateOnly' });
    if (c.intlOnly && !profile.intl) no.push({ code: 'intlOnly' });
    if (c.domesticOnly && profile.intl) no.push({ code: 'domesticOnly' });
    if (c.citizen && profile.intl) check.push({ code: 'citizen' });
    if (c.seoulOnly) no.push({ code: 'seoulOnly' });
    if (c.grade && !grad && has(profile.grade)) {
      const g = +profile.grade;
      const okGrade = c.grade.list ? c.grade.list.includes(g) : g >= c.grade.min && g <= c.grade.max;
      if (!okGrade) no.push({ code: 'grade', min: c.grade.min, max: c.grade.max });
    }
    if (profile.status === 'leave') {
      if (c.leaveExcluded) no.push({ code: 'leave' });
      else if (c.enrolledOnly) check.push({ code: 'enrolledOnly' });
    }
    if (c.depts.length) {
      const mine = norm(profile.dept);
      if (!mine) check.push({ code: 'dept', depts: c.depts });
      else if (!c.depts.some((d) => d.includes(mine) || mine.includes(d))) no.push({ code: 'dept', depts: c.depts });
    }
    if (c.extra) check.push({ code: 'extra' });
    if (c.region) check.push({ code: 'region' });
    if (c.age) check.push({ code: 'age' });
    if (no.length) return { status: 'no', reasons: no };
    if (check.length) return { status: 'check', reasons: check };
    if (c.open || c.grade || c.leaveOk || (c.gradOnly && grad) || (c.graduateSoon && +profile.grade === 4)) return { status: 'yes', reasons: [] };
    return { status: 'check', reasons: [{ code: 'unclear' }] };
  }

  const api = { parse, judge, gradeRange, departments };
  root.GongjiEligibility = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
