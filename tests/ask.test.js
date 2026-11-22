// 실행: node tests/ask.test.js
// 공지에게 묻기(js/ask.js): 질문을 조건으로 풀고, 조건으로 공지를 고르는지 확인
const assert = require('node:assert/strict');
globalThis.GongjiBenefit = require('../js/benefit.js');
globalThis.GongjiLogic = require('../js/logic.js');
const A = require('../js/ask.js');
const E = require('../js/eligibility.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const now = new Date('2026-11-19T10:00');
const mk = (id, title, deadline, extra) => Object.assign({ id, title, date: '2026-11-10', deadline, category: 'etc', summary: { ko: title }, benefit: null, eligibility: null, events: [] }, extra);
const notices = [
  mk('s1', '국가장학금 2차 신청 안내', '2026-11-21T18:00', { category: 'scholarship', benefit: { text: { ko: '등록금 지원' }, won: 2000000, points: 0 } }),
  mk('s2', '교내 성적우수 장학생 선발', '2026-12-10T23:59', { category: 'scholarship', benefit: { text: { ko: '장학금 100만원' }, won: 1000000, points: 0 } }),
  mk('p1', '비교과 특강: 포트폴리오 만들기', '2026-11-20T23:59', { benefit: { text: { ko: '다드림 포인트 30점' }, won: 0, points: 30 } }),
  mk('p2', '학습 설문조사 참여', '2026-11-25T23:59', { benefit: { text: { ko: '다드림 포인트 5점' }, won: 0, points: 5 } }),
  mk('x1', '2027 해외 교환학생 모집', '2026-11-30T23:59', { eligibility: { ko: '2학년 이상 재학생' } }),
  mk('i1', '외국인 유학생 한국어 말하기 대회', '2026-11-24T23:59', { eligibility: { ko: '외국인 유학생' }, benefit: { text: { ko: '상금 50만원' }, won: 0, points: 0, prize: 500000 } }),
  mk('old', '지난 장학 공지', '2026-11-01T23:59', { category: 'scholarship' })
];
const fit = (n, p) => { const r = E.judge(n, p || { set: true, level: 'undergrad', grade: 1, status: 'enrolled', intl: false, dept: '' }); return r && r.status; };
const ask = (q, profileSet) => A.run(notices, A.parse(q), { now, fit, profileSet: !!profileSet }).list.map((n) => n.id);

test('질문 → 조건', () => {
  const c = A.parse('이번 주 마감인 장학금 알려줘');
  assert.equal(c.due, 7);
  assert.deepEqual(c.subs, ['scholarship']);
  assert.deepEqual(c.tokens, [], '흔한 말·조건 낱말은 검색어로 쓰지 않음');
  assert.equal(A.parse('오늘 마감').due, 0);
  assert.equal(A.parse('3일 안에 마감되는 것').due, 3);
  assert.equal(A.parse('다드림 포인트 많이 주는 것').sort, 'benefit');
  assert.equal(A.parse('유학생이 받을 수 있는 혜택').intl, true);
  assert.equal(A.parse('2학년이 할 수 있는 활동').grade, 2);
  assert.equal(A.parse('scholarships due this week').due, 7);
  assert.deepEqual(A.parse('토익 특강 있어?').tokens, ['토익']);
});
test('조건으로 고르기: 마감 지난 공지는 빼고, 이번 주 장학금은 마감순', () => {
  assert.deepEqual(ask('이번 주 마감인 장학금'), ['s1']);
  assert.deepEqual(ask('장학금'), ['s1', 's2']);
});
test('포인트 많이 주는 순', () => { assert.deepEqual(ask('다드림 포인트 많이 주는 것'), ['p1', 'p2']); });
test('해외 프로그램은 낱말로 찾고, 학년 조건은 자격 판정으로', () => {
  assert.deepEqual(ask('해외 프로그램'), ['x1']);
  assert.deepEqual(ask('1학년이 갈 수 있는 해외 프로그램'), [], '2학년 이상 대상이라 1학년은 빠짐');
});
test('유학생 질문은 유학생 대상 공지를 먼저', () => { assert.equal(ask('유학생이 받을 수 있는 혜택')[0], 'i1'); });
test('맞는 공지가 없는 낱말은 빼고 찾고 알려 준다', () => {
  const r = A.run(notices, A.parse('토익 특강'), { now, fit });
  assert.deepEqual(r.ignored, ['토익']);
  assert.deepEqual(r.list.map((n) => n.id), ['p1']);
});
test('AI에게 넘길 공지 정보는 짧게, 번호는 1부터', () => {
  const b = A.brief(notices.slice(0, 2), 'ko', 8);
  assert.deepEqual(b.map((x) => x.no), [1, 2]);
  assert.equal(b[0].benefit, '등록금 지원');
  assert.equal(A.brief(notices, 'ko').length, 7);
  assert.equal(A.brief(notices, 'ko', 3).length, 3);
});

console.log(`\n${passed}개 통과`);
