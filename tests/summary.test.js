// 실행: node tests/summary.test.js
// AI 요약 중 쓸 수 없는 것을 골라 내는지(js/summary.js) 확인
const assert = require('node:assert/strict');
const S = require('../js/summary.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const mk = (over) => Object.assign({
  id: 'a', title: '2026학년도 동계 계절학기 본수강신청 안내', titleTr: { en: 'Winter session registration' },
  summary: {
    ko: '동계 계절학기 수강신청은 11월 16일부터 20일까지이며 최대 6학점까지 들을 수 있어요.',
    en: 'Winter session registration runs from November 16 to 20, and you can take up to 6 credits.'
  }
}, over);

test('멀쩡한 요약은 그대로 쓴다', () => {
  const n = mk();
  assert.equal(S.problem(n, 'ko'), null);
  assert.equal(S.problem(n, 'en'), null);
  assert.equal(S.pick(n, 'ko').text, n.summary.ko);
});

test('제목을 그대로 옮긴 요약은 버린다', () => {
  assert.equal(S.problem(mk({ summary: { ko: '2026학년도 동계 계절학기 본수강신청 안내' } }), 'ko'), 'title');
  assert.equal(S.problem(mk({ summary: { ko: '「2026학년도 동계 계절학기 본수강신청 안내」입니다' } }), 'ko'), 'title');
});

test('너무 짧거나 비어 있으면 버린다', () => {
  assert.equal(S.problem(mk({ summary: { ko: '혜택은 없습니다.' } }), 'ko'), 'short');
  assert.equal(S.problem(mk({ summary: { ko: '' } }), 'ko'), 'empty');
  assert.equal(S.problem(mk({ summary: {} }), 'en'), 'empty');
  assert.equal(S.pick(mk({ summary: { ko: '혜택은 없습니다.' } }), 'ko').text, '');
});

test('번역이 끊겨 마감일·금액이 사라지면 버린다', () => {
  const ko = '2026년 11월 23일까지 신청 가능합니다. 참가비는 일반 420만 원입니다.';
  assert.equal(S.problem(mk({ summary: { ko, en: 'Applications are open until November 23, 2026.' } }), 'en'), 'facts');
  assert.deepEqual(S.lostFacts(ko, 'Applications are open until November 23, 2026.'), ['금액']);
  assert.deepEqual(S.lostFacts('11월 23일까지 신청해요', 'Apply by the deadline'), ['11월 23일']);
});

test("'200만원'을 '2 million won'으로 옮긴 정상 번역은 통과", () => {
  const ko = '대상에는 200만원의 상금이 주어집니다. 마감은 2026년 11월 30일입니다.';
  const en = 'The grand prize is 2 million won. The deadline is November 30, 2026.';
  assert.deepEqual(S.lostFacts(ko, en), []);
  assert.deepEqual(S.lostFacts('상금 3,000,000원', 'Prize money of 3,000,000 won'), []);
  assert.deepEqual(S.lostFacts('상금 300만원', '奖金300万韩元'), []);
});

test('이미지만 있는 공지는 안내 문구를 그대로 쓴다', () => {
  const n = mk({ bodyStatus: 'image', summary: { ko: '본문이 이미지라 읽지 못했어요.', en: 'Body is an image.' } });
  const p = S.pick(n, 'en');
  assert.equal(p.text, 'Body is an image.');
  assert.ok(p.image);
});

test('audit: 언어별로 쓸 수 없는 요약 수를 센다', () => {
  const list = [mk(), mk({ summary: { ko: '혜택은 없습니다.', en: '' } })];
  const a = S.audit(list, ['ko', 'en']);
  assert.equal(a.ko.ok, 1); assert.equal(a.ko.bad, 1); assert.equal(a.ko.why.short, 1);
  assert.equal(a.en.bad, 1);
});

console.log(`\n${passed}개 통과`);
