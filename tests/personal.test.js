// 실행: node tests/personal.test.js
// 읽음·지원 완료·키워드·관심 분야·알림 센터(js/personal.js)를 확인
const assert = require('node:assert/strict');
const P = require('../js/personal.js');
const L = require('../js/logic.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const at = (s) => L.parseLocal(s);
const now = at('2026-11-13T09:00');
const n = (id, over) => Object.assign({ id, title: '공지 ' + id, category: 'etc', date: '2026-11-10', deadline: null, events: [], summary: { ko: '' } }, over);

test('id 목록: 문자열만·중복 없이·최대 개수 안에서 오래된 것부터 버림', () => {
  assert.deepEqual(P.cleanIds(['a', 'a', 3, '', null, 'b']), ['a', 'b']);
  assert.deepEqual(P.cleanIds(['a', 'b', 'c', 'd'], 2), ['c', 'd']);
  assert.deepEqual(P.cleanIds('nope'), []);
  assert.deepEqual(P.toggle(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(P.toggle(['a', 'b'], 'a'), ['b']);
});

test('touch: 다시 열면 맨 뒤로 옮기고 개수 제한을 지킨다', () => {
  assert.deepEqual(P.touch(['a', 'b', 'c'], 'a', 5), ['b', 'c', 'a']);
  assert.deepEqual(P.touch(['a', 'b', 'c'], 'd', 3), ['b', 'c', 'd']);
});

test('키워드: 공백 정리, 대소문자 무시 중복 제거, 20자·10개 제한', () => {
  assert.deepEqual(P.cleanKeywords(['  장학  ', '장학', 'AI', 'ai', '', 'x'.repeat(21), 5]), ['장학', 'AI']);
  assert.equal(P.cleanKeywords(Array.from({ length: 15 }, (_, i) => 'k' + i)).length, 10);
});

test('키워드 일치: 제목·번역·요약·혜택·대상 어디든, 공백과 대소문자는 무시', () => {
  const x = n('a', { title: '국가 장학금 신청', titleTr: { en: 'National Scholarship' }, summary: { ko: '', en: 'Apply for AI program' } });
  assert.deepEqual(P.matchKeywords(x, ['장학', '기숙사']), ['장학']);
  assert.deepEqual(P.matchKeywords(x, ['scholarship']), ['scholarship']);
  assert.deepEqual(P.matchKeywords(x, ['ai program']), ['ai program']);
  assert.deepEqual(P.matchKeywords(x, []), []);
  const y = n('b', { benefit: { text: { ko: '다드림 30포인트' } }, eligibility: { ko: '재학생' } });
  assert.deepEqual(P.matchKeywords(y, ['다드림', '재학생', '졸업']), ['다드림', '재학생']);
});

test('관심 분야: 정해진 분류 안의 값만 남긴다', () => {
  assert.deepEqual(P.cleanInterests(['career', 'career', 'zzz', 7], ['career', 'dorm']), ['career']);
  assert.equal(P.matchInterest(n('a', { category: 'career' }), ['career']), true);
  assert.equal(P.matchInterest(n('a'), []), false);
});

test('알림: 저장한 공지의 3일 안 마감, 새 공지의 키워드·관심 분야', () => {
  const list = [
    n('due', { deadline: '2026-11-15T23:59' }),
    n('far', { deadline: '2026-12-20T23:59' }),
    n('kw', { title: '장학금 안내', date: '2026-11-12' }),
    n('int', { category: 'career', date: '2026-11-12' }),
    n('old', { title: '장학금 옛 공지', date: '2026-11-01' }),
    n('done', { deadline: '2026-11-14T23:59' }),
    n('gone', { title: '장학금 마감', date: '2026-11-12', deadline: '2026-11-12T10:00' })
  ];
  const ctx = { saved: ['due', 'far', 'done', 'old'], applied: ['done'], keywords: ['장학'], interests: ['career'], since: '2026-11-10' };
  const a = P.buildAlerts(list, now, ctx);
  assert.deepEqual(a.map((x) => x.key), ['due:due', 'keyword:kw', 'interest:int']);
  assert.equal(a[0].daysLeft, 2);
  assert.deepEqual(a[1].keywords, ['장학']);
});

test('알림: 한 공지는 한 번만, 급한 마감이 먼저', () => {
  const list = [
    n('b', { title: '장학금 B', deadline: '2026-11-16T23:59', date: '2026-11-12' }),
    n('a', { title: '장학금 A', deadline: '2026-11-14T23:59', date: '2026-11-12' })
  ];
  const a = P.buildAlerts(list, now, { saved: ['a', 'b'], keywords: ['장학'], since: '2026-11-10' });
  assert.deepEqual(a.map((x) => x.id), ['a', 'b']);
  assert.ok(a.every((x) => x.type === 'due'));
});

test('보지 않은 알림 수', () => {
  const a = [{ key: 'due:a' }, { key: 'keyword:b' }];
  assert.equal(P.unseen(a, ['due:a']), 1);
  assert.equal(P.unseen(a, []), 2);
  assert.equal(P.unseen([], ['x']), 0);
});

console.log(`\n${passed}개 통과`);
