// 실행: node tests/search.test.js
// 검색(js/logic.js): 띄어 쓴 낱말은 모두 들어 있어야 찾고, 초성(ㅈㅎㄱ)으로도 찾는지 확인
const assert = require('node:assert/strict');
const L = require('../js/logic.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const n = {
  id: 'a', title: '2026학년도 국가장학금 2차 신청 안내', boardName: '학사공지',
  titleTr: { en: 'National Scholarship round 2 application' },
  summary: { ko: '국가장학금 2차 신청은 11월 30일까지예요.' },
  benefit: { text: { ko: '등록금 지원' } }, eligibility: { ko: '재학생 누구나' },
  events: [{ date: '2026-12-01', start: '10:00', end: '12:00' }], terms: ['국가장학금']
};

test('빈 검색어는 모두 통과', () => { assert.equal(L.matchesQuery(n, '  '), true); });
test('띄어쓰기를 무시하고 붙여 써도 찾는다 (예전 동작 유지)', () => { assert.equal(L.matchesQuery(n, '2차신청'), true); });
test('띄어 쓴 낱말은 모두 들어 있어야 찾는다', () => {
  assert.equal(L.matchesQuery(n, '장학 안내'), true);
  assert.equal(L.matchesQuery(n, '장학 해외'), false);
});
test('대상·혜택·번역 제목에서도 찾는다', () => {
  assert.equal(L.matchesQuery(n, '재학생'), true);
  assert.equal(L.matchesQuery(n, '등록금'), true);
  assert.equal(L.matchesQuery(n, 'SCHOLARSHIP'), true);
});
test('초성으로 찾는다 (두 글자 이상)', () => {
  assert.equal(L.matchesQuery(n, 'ㄱㄱㅈㅎㄱ'), true);
  assert.equal(L.matchesQuery(n, 'ㅈㅎ ㅅㅊ'), true);
  assert.equal(L.matchesQuery(n, 'ㅎㅇ'), false);
  assert.equal(L.matchesQuery(n, 'ㄱ'), false, '초성 한 글자는 너무 많이 걸려서 쓰지 않음');
});
test('초성은 글자 위치가 그대로 맞는다 (칠하기용)', () => {
  const cho = L.chosung('국가장학금 A');
  assert.equal(cho, 'ㄱㄱㅈㅎㄱ A');
  assert.equal(cho.length, '국가장학금 A'.length);
});
test('검색어 낱말 나누기', () => {
  assert.deepEqual(L.queryTokens('  장학   신청 '), ['장학', '신청']);
  assert.equal(L.isChosungOnly('ㅈㅎ'), true);
  assert.equal(L.isChosungOnly('ㅈ학'), false);
});
test('filterNotices 에서도 같은 규칙', () => {
  const now = new Date('2026-11-20T09:00');
  const other = { ...n, id: 'b', title: '해외 연수 모집', summary: { ko: '해외 연수' }, terms: [], benefit: null, eligibility: null };
  const got = L.filterNotices([n, other], { query: 'ㅎㅇ ㅇㅅ', status: 'all' }, now).map((x) => x.id);
  assert.deepEqual(got, ['b']);
});

console.log(`\n${passed}개 통과`);
