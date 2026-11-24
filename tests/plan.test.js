// 수강 계획(이수 내역 · 남은 학점 · 수강신청 추천) 시험 (node --test tests/plan.test.js)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const P = require('../js/plan.js');

const load = (file, name) => {
  const box = {};
  new Function('window', fs.readFileSync(path.join(__dirname, '..', 'data', file), 'utf8'))(box);
  return box[name];
};
const REQ = load('gradreq.js', 'GONGJI_GRADREQ');
const COURSES = load('courses.js', 'GONGJI_COURSES');

const course = (n, h, s, k, y, c, t, extra) => ({ n, h, s, d: '컴퓨터공학과', k, y, c, t, ...(extra || {}) });

test('이수구분을 영역으로 나눈다', () => {
  assert.strictEqual(P.area('전필'), 'major');
  assert.strictEqual(P.area('전공선택'), 'major');
  assert.strictEqual(P.area('심화'), 'general');
  assert.strictEqual(P.area('KU소양'), 'general');
  assert.strictEqual(P.area('일선'), 'free');
  assert.strictEqual(P.genArea('기초교양'), '기초');
  assert.strictEqual(P.genArea('소양'), '소양');
  assert.strictEqual(P.genArea('전선'), null);
});

test('요람 기준: 컴퓨터공학과는 졸업 132 · 전공 66 · 교양 31', () => {
  const r = P.requirement('컴퓨터공학과', REQ, null);
  assert.deepStrictEqual([r.total, r.major, r.general, r.majorReq], [132, 66, 31, 3]);
  assert.deepStrictEqual(r.gen, { 기초: 14, 심화: 8, 소양: 9 });
  assert.ok(r.found);
  assert.strictEqual(P.requirement('사회복지상담심리전공', REQ).dept, '상담심리전공', '긴 이름도 가장 긴 학과 이름으로 찾음');
  assert.strictEqual(P.requirement('없는학과', REQ).total, null);
});

test('편입생: 잔여 66학점을 기본으로, 전공·교양은 직접 고칠 수 있다', () => {
  const base = P.requirement('컴퓨터공학과', REQ, { mode: 'transfer' });
  assert.deepStrictEqual([base.mode, base.total, base.major, base.general], ['transfer', 66, 66, 0]);
  assert.strictEqual(base.gen, null, '편입생은 교양 세부 기준을 쓰지 않음');
  const mine = P.requirement('컴퓨터공학과', REQ, { mode: 'transfer', total: 66, major: 54, general: 6 });
  assert.deepStrictEqual([mine.total, mine.major, mine.general], [66, 54, 6]);
  assert.ok(mine.edited.major && mine.edited.general);
  const bad = P.requirement('컴퓨터공학과', REQ, { mode: 'transfer', major: -3, general: 'x' });
  assert.strictEqual(bad.major, 66, '이상한 값은 무시');
  const tainted = P.requirement('컴퓨터공학과', REQ, { mode: 'transfer', total: 132 });
  assert.strictEqual(tainted.total, 66, '신입생 132학점 오염값은 66으로 정정');
});

test('편입생 이수 계산: 전공 51 + 자유 15(교양/일선 무관) 케이스', () => {
  const req = P.requirement('컴퓨터공학과', REQ, { mode: 'transfer', total: 66, major: 51, general: 15 });
  assert.deepStrictEqual([req.total, req.major, req.general], [66, 51, 15]);
  // 학생이 전공 36학점, 교양 6학점 이수한 경우
  const tot1 = { total: 42, major: 36, general: 6, free: 0 };
  const left1 = P.remaining(req, tot1);
  assert.strictEqual(left1.major, 15, '전공 51 - 36 = 15학점 남음');
  assert.strictEqual(left1.free, 9, '자유 학점 15 - 6 = 9학점 남음');
  assert.strictEqual(left1.total, 24, '총 남은 학점 66 - 42 = 24학점 (15 + 9)');
  assert.strictEqual(left1.gen, null, '기초/심화/소양 교양 세부 의무는 면제');

  // 학생이 일반선택(일선)으로 6학점을 이수한 경우에도 똑같이 자유 학점으로 인정
  const tot2 = { total: 42, major: 36, general: 0, free: 6 };
  const left2 = P.remaining(req, tot2);
  assert.strictEqual(left2.major, 15);
  assert.strictEqual(left2.free, 9);
  assert.strictEqual(left2.total, 24);

  // 초과 전공으로 60학점을 이수한 경우
  const tot3 = { total: 66, major: 60, general: 6, free: 0 };
  const left3 = P.remaining(req, tot3);
  assert.strictEqual(left3.major, 0);
  assert.strictEqual(left3.free, 0);
  assert.strictEqual(left3.total, 0);
});

test('이수 내역 정리·합계·남은 학점', () => {
  const h = P.cleanHistory([
    { name: '자료구조', credit: 3, kind: '전필', term: '2025-2', code: 'NDGE15060' },
    { name: '자료구조', credit: 3, kind: '전필', term: '2025-2', code: 'NDGE15060' },
    { name: '글쓰기1', credit: 3, kind: '기초교양', term: '2025-1' },
    { name: '성신의대학생활지도', credit: 1, kind: '소양', term: '2025-1' },
    { name: '', credit: 3 },
    { name: '이상한학점', credit: 99 },
    { name: '봉사', credit: 2, kind: '일선', term: '잘못' }
  ]);
  assert.strictEqual(h.length, 4, '중복·빈 이름·이상한 학점은 뺌');
  assert.strictEqual(h[3].term, '', '이상한 학기는 비움');
  const tot = P.totals(h);
  assert.deepStrictEqual([tot.total, tot.major, tot.general, tot.free], [9, 3, 4, 2]);
  assert.deepStrictEqual(tot.gen, { 기초: 3, 심화: 0, 소양: 1 });
  const left = P.remaining(P.requirement('컴퓨터공학과', REQ), tot);
  assert.deepStrictEqual([left.total, left.major, left.general], [123, 63, 27]);
  assert.deepStrictEqual(left.gen, { 기초: 11, 심화: 8, 소양: 8 });
  assert.strictEqual(left.free, 123 - 63 - 27, '전공·교양을 채우고 남는 학점은 일반선택');
  const terms = P.byTerm(h);
  assert.deepStrictEqual(terms.map((x) => x.term), ['2025-2', '2025-1', '']);
  assert.strictEqual(terms[1].credits, 4);
});

test('남은 학기와 학기당 학점', () => {
  const nov = new Date(2026, 10, 23);
  assert.deepStrictEqual(P.currentTerm(nov), { year: 2026, term: '2' });
  assert.deepStrictEqual(P.currentTerm(new Date(2027, 0, 10)), { year: 2026, term: '2' }, '1~2월은 지난 2학기');
  assert.strictEqual(P.nextTerm(nov), '2027-1');
  assert.strictEqual(P.semestersLeft(3, nov), 2, '3학년 2학기면 4학년 두 학기가 남음');
  assert.strictEqual(P.semestersLeft(3, new Date(2026, 3, 1)), 3, '3학년 1학기면 세 학기');
  assert.strictEqual(P.semestersLeft(4, nov), 1, '마지막 학기여도 1');
  assert.deepStrictEqual(P.pace(66, 4, 21), { per: 17, over: false });
  assert.deepStrictEqual(P.pace(50, 2, 21), { per: 25, over: true });
});

test('성적표 붙여넣기: 탭으로 나뉜 표와 띄어 쓴 글을 읽고 F는 뺀다', () => {
  const cat = P.buildCatalog({ courses: [course('자료구조', 'NDGE15060', '01', '전필', '2', 3, [])] }, COURSES);
  const text = [
    '2025년 2학기',
    '1\tNDGE15060\t자료구조\t전필\t3\tA+',
    '2\tBKSA58232\t글쓰기1\t기초\t3\tB0',
    '3\t\t알수없는과목\t일선\t2\tP',
    '4\t\t낙제과목\t전선\t3\tF',
    '2026 1학기 컴퓨터구조 전선 3학점 A0',
    '합계 11'
  ].join('\n');
  const r = P.parsePaste(text, cat);
  const names = r.items.map((x) => x.name);
  assert.deepStrictEqual(names.slice(0, 3), ['자료구조', '글쓰기1', '알수없는과목']);
  assert.ok(names.includes('컴퓨터구조'));
  assert.strictEqual(r.failed, 1, 'F 과목은 이수로 치지 않음');
  const ds = r.items.find((x) => x.name === '자료구조');
  assert.deepStrictEqual([ds.credit, ds.kind, ds.term, ds.code], [3, '전필', '2025-2', 'NDGE15060']);
  assert.strictEqual(r.items.find((x) => x.name === '컴퓨터구조').term, '2026-1');
  assert.strictEqual(r.items.find((x) => x.name === '컴퓨터구조').credit, 3);
  assert.ok(!names.includes('합계'));
});

test('개설 과목: 같은 과목의 분반을 묶고 이러닝·실시간 온라인을 구분한다', () => {
  const groups = P.groupOffered({ courses: [
    course('자료구조', 'A1', '01', '전필', '2', 3, [[1, '10:30', '12:00', '공학관 1'], [2, '10:30', '12:00', '공학관 1']]),
    course('자료구조', 'A1', '02', '전필', '2', 3, [[1, '13:30', '15:00', '공학관 1'], [3, '15:00', '16:30', '공학관 1']]),
    course('데이터베이스', 'A2', '01', '전선', '3', 3, [[1, '10:00', '13:00', '실시간온라인']]),
    course('클라우드컴퓨팅', 'A3', '01', '전선', '3', 3, [], { m: 'elearn' })
  ] });
  assert.strictEqual(groups.length, 3);
  const ds = groups.find((g) => g.name === '자료구조');
  assert.strictEqual(ds.sections.length, 2);
  assert.strictEqual(groups.find((g) => g.code === 'A2').sections[0].mode, 'live', 'm 이 없어도 강의실 글자로 판단');
  assert.strictEqual(groups.find((g) => g.code === 'A3').sections[0].mode, 'elearn');
  assert.ok(P.overlaps([[1, '10:30', '12:00']], [[1, '11:00', '13:00']]));
  assert.ok(!P.overlaps([[1, '10:30', '12:00']], [[1, '12:00', '13:00']]), '끝 = 시작이면 안 겹침');
});

const OFFER = { courses: [
  course('자료구조', 'A1', '01', '전필', '2', 3, [[1, '10:30', '12:00', 'R'], [2, '10:30', '12:00', 'R']]),
  course('자료구조', 'A1', '02', '전필', '2', 3, [[3, '13:30', '15:00', 'R'], [4, '13:30', '15:00', 'R']]),
  course('컴퓨터네트워크', 'A2', '01', '전선', '3', 3, [[1, '10:30', '12:00', 'R'], [2, '10:30', '12:00', 'R']]),
  course('데이터베이스', 'A3', '01', '전선', '3', 3, [[5, '10:00', '13:00', '실시간온라인']]),
  course('클라우드컴퓨팅', 'A4', '01', '전선', '3', 3, [], { m: 'elearn' }),
  course('딥러닝', 'A5', '01', '전선', '4', 3, [[5, '15:00', '18:00', 'R']]),
  course('C프로그래밍', 'A6', '01', '전선', '1', 3, [[1, '13:30', '15:00', 'R']]),
  { n: '미디어리터러시', h: 'G1', s: '01', d: '교양학부', k: '심화', y: '9', c: 2, t: [], m: 'elearn' },
  { n: '글쓰기1', h: 'G2', s: '01', d: '교양학부', k: '기초', y: '9', c: 3, t: [[2, '09:00', '10:30', 'R']] },
  { n: '마케팅', h: 'X1', s: '01', d: '경영학과', k: '전선', y: '2', c: 3, t: [[4, '09:00', '10:30', 'R']] }
] };

const baseOpts = (extra) => ({
  groups: P.groupOffered(OFFER), taken: new Set(), left: { major: 30, general: 10, gen: { 기초: 3, 심화: 8, 소양: 0 } },
  target: 12, grades: null, dept: '컴퓨터공학과', deptCourses: new Set(), myGrade: 3, ...(extra || {})
});

test('추천: 같은 시간 과목이 겹치면 다른 분반을 고르고, 목표 학점을 넘지 않는다', () => {
  const r = P.recommend(baseOpts());
  const names = r.picks.map((p) => p.group.name);
  assert.ok(r.credits <= 12);
  assert.strictEqual(r.credits, 12);
  assert.ok(names.includes('자료구조'), '전필이 먼저');
  assert.ok(!names.includes('마케팅'), '다른 학과 전공은 넣지 않음');
  const ds = r.picks.find((p) => p.group.name === '자료구조');
  if (names.includes('컴퓨터네트워크')) assert.strictEqual(ds.section.s, '02', '네트워크와 겹치지 않는 02분반');
  // 고른 과목끼리 시간이 겹치지 않음
  const slots = r.picks.map((p) => p.section.t);
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) assert.ok(!P.overlaps(slots[i], slots[j]));
});

test('추천: 들은 과목은 빼고, 학년 선택과 이러닝·실시간 온라인 끄기를 따른다', () => {
  const taken = new Set(['A1', P.normName('컴퓨터 네트워크')]);
  const r = P.recommend(baseOpts({ taken, grades: [3], include: { elearn: false, live: false } }));
  const names = r.picks.map((p) => p.group.name);
  assert.ok(!names.includes('자료구조') && !names.includes('컴퓨터네트워크'), '학수번호·이름으로 들은 과목 제외');
  assert.ok(!names.includes('데이터베이스'), '실시간 온라인 끔');
  assert.ok(!names.includes('클라우드컴퓨팅') && !names.includes('미디어리터러시'), '이러닝 끔');
  assert.ok(!names.includes('딥러닝') && !names.includes('C프로그래밍'), '3학년 과목만 (전 학년 교양은 포함 가능)');
  assert.ok(r.stats.taken >= 2);
});

test('추천: 피할 요일·내 시간표와 겹치는 분반은 쓰지 않고, 고정한 과목은 꼭 넣는다', () => {
  const r = P.recommend(baseOpts({ avoidDays: [5], busy: [[1, '10:00', '11:00']], locked: [{ key: 'A5', s: '01' }] }));
  const names = r.picks.map((p) => p.group.name);
  assert.ok(names.includes('딥러닝'), '고정한 과목은 피할 요일이어도 넣음');
  assert.ok(r.picks.find((p) => p.group.name === '딥러닝').locked);
  assert.ok(!names.includes('데이터베이스'), '금요일 수업 빼기');
  const ds = r.picks.find((p) => p.group.name === '자료구조');
  assert.ok(ds && ds.section.s === '02', '월 10시 바쁨 → 02분반');
  assert.ok(!names.includes('컴퓨터네트워크'), '월 10:30 과목은 바쁜 시간과 겹침');
});

test('추천: 교양이 다 찼으면 전공을, 전공이 다 찼으면 교양을 먼저', () => {
  const g = P.recommend(baseOpts({ left: { major: 0, general: 10, gen: null }, target: 5 }));
  assert.ok(g.picks.every((p) => p.area === 'general'), g.picks.map((p) => p.group.name).join());
  const m = P.recommend(baseOpts({ left: { major: 20, general: 0, gen: null }, target: 6 }));
  assert.ok(m.picks.every((p) => p.area === 'major'));
});

test('목표 학점을 남은 전공·교양 비율대로 나눈다', () => {
  assert.deepStrictEqual(P.split({ major: 57, general: 28 }, 18), { major: 12, general: 6, free: 0 });
  assert.deepStrictEqual(P.split({ major: 2, general: 30 }, 18), { major: 1, general: 17, free: 0 });
  assert.deepStrictEqual(P.split({ major: 3, general: 2 }, 18), { major: 3, general: 2, free: 13 }, '남은 게 적으면 나머지는 자유');
  assert.deepStrictEqual(P.split({ major: 0, general: 0 }, 15), { major: 0, general: 0, free: 15 });
  const r = P.recommend(baseOpts({ left: { major: 30, general: 10, gen: null }, target: 12 }));
  assert.ok(r.byArea.general >= 2, '교양 몫도 채움: ' + JSON.stringify(r.byArea));
  assert.deepStrictEqual(r.quota, { major: 9, general: 3, free: 0 });
});

test('평점평균: 4.5 만점, P·성적 없는 과목은 빼고 학점 가중 평균', () => {
  const h = P.cleanHistory([
    { name: '자료구조', credit: 3, kind: '전필', term: '2025-2', grade: 'A+' },
    { name: '글쓰기1', credit: 2, kind: '기초', term: '2025-1', grade: 'b' },
    { name: '봉사', credit: 1, kind: '일선', term: '2025-1', grade: 'Pass' },
    { name: '이산수학', credit: 3, kind: '전선', term: '2025-2' }
  ]);
  assert.deepStrictEqual(h.map((x) => x.grade || ''), ['A+', 'B0', 'P', '']);
  assert.deepStrictEqual(P.gpa(h), { gpa: 3.9, credits: 5 }, '(4.5×3 + 3.0×2) ÷ 5');
  assert.deepStrictEqual(P.gpa(h, (x) => P.area(x.kind) === 'major'), { gpa: 4.5, credits: 3 });
  assert.strictEqual(P.gpa([]), null);
  const cat = P.buildCatalog({ courses: [] }, null);
  const r = P.parsePaste('2025 2학기\t자료구조\t전필\t3\tA+\n2025 2학기\t이산수학\t전선\t3\tB0', cat);
  assert.deepStrictEqual(r.items.map((x) => x.grade), ['A+', 'B0'], '붙여넣기에서 성적도 읽음');
});

test('요람의 전공필수 중 안 들은 과목', () => {
  const left = P.requiredLeft([['2-1', '전필', '자료구조', 3], ['3-1', '전필', '운영체제', 3], ['1-1', '전선', 'C프로그래밍', 3], ['4-1', '전필', '캡스톤디자인', 3]],
    [{ name: '자료 구조', credit: 3, kind: '전필' }]);
  assert.deepStrictEqual(left.map((x) => x.name), ['운영체제', '캡스톤디자인']);
});

test('추천 3안: 공강 최대는 쉬는 평일이 더 많고, 늦게 시작은 10:30 전 수업이 없다', () => {
  const alts = P.alternatives(baseOpts({ target: 9, left: { major: 30, general: 0, gen: null } }));
  assert.deepStrictEqual(alts.map((a) => a.key), ['balanced', 'freeDay', 'lateStart']);
  const [bal, free, late] = alts;
  assert.ok(free.free.length >= 5 - bal.days.filter((d) => d >= 1 && d <= 5).length, '균형안보다 쉬는 날이 적지 않음');
  assert.ok(free.result.credits >= bal.result.credits - 2);
  assert.ok(late.start === null || late.start >= 630, '첫 수업 10:30 이후: ' + late.start);
  for (const a of alts) {
    const slots = a.result.picks.map((p) => p.section.t);
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) assert.ok(!P.overlaps(slots[i], slots[j]), a.key + ' 겹침 없음');
  }
});

test('졸업 로드맵: 남은 학점을 학기마다 고르게, 전공·교양은 비율대로', () => {
  const r = P.roadmap({ total: 66, major: 54, general: 6 }, 4, '2027-1');
  assert.deepStrictEqual(r.map((x) => x.term), ['2027-1', '2027-2', '2028-1', '2028-2']);
  assert.deepStrictEqual(r.map((x) => x.credits), [17, 17, 16, 16]);
  assert.strictEqual(r.reduce((s, x) => s + x.credits, 0), 66);
  assert.strictEqual(r.reduce((s, x) => s + x.major, 0), 54);
  assert.strictEqual(r.reduce((s, x) => s + x.general, 0), 6);
  assert.deepStrictEqual(P.roadmap({ total: 0 }, 4, '2027-1'), []);
});

test('실제 개설 과목(data/timetable.js)으로도 시간 안에 끝난다', () => {
  const TT = load('timetable.js', 'GONGJI_TIMETABLE');
  const groups = P.groupOffered(TT);
  const t0 = Date.now();
  const r = P.recommend({ groups, taken: new Set(), left: { major: 40, general: 20, gen: { 기초: 5, 심화: 8, 소양: 9 } }, target: 18, dept: '컴퓨터공학과', myGrade: 3 });
  assert.ok(Date.now() - t0 < 2000, `${Date.now() - t0}ms`);
  assert.ok(r.credits >= 15 && r.credits <= 18, `학점 ${r.credits}`);
  assert.ok(r.byArea.major >= 9 && r.byArea.general >= 3, '전공·교양을 비율대로: ' + JSON.stringify(r.byArea));
  const own = r.picks.filter((p) => p.area === 'major');
  assert.ok(own.every((p) => p.group.dept === '컴퓨터공학과'), '전공은 내 학과가 연 과목만');
  const cls = P.toClasses(r.picks);
  assert.ok(cls.every((c) => c.day >= 0 && c.day <= 6 && c.start < c.end));
});
