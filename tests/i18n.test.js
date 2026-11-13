// 실행: node tests/i18n.test.js
// 네 언어가 같은 문구 항목을 가지고, 함수형 문구가 모두 글자를 돌려주는지 확인 (js/i18n.js + js/i18n2.js)
const assert = require('node:assert/strict');
require('../js/i18n.js');
require('../js/i18n2.js');
const I = globalThis.GongjiI18n;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const langs = Object.keys(I.T);

test('네 언어의 항목 이름이 모두 같다', () => {
  const base = Object.keys(I.T.ko).sort();
  for (const l of langs) {
    const keys = Object.keys(I.T[l]).sort();
    assert.deepEqual(base.filter((k) => !keys.includes(k)), [], `${l} 에 없는 항목`);
    assert.deepEqual(keys.filter((k) => !base.includes(k)), [], `${l} 에만 있는 항목`);
  }
});

test('함수형 문구는 글자를 돌려주고, undefined 가 섞이지 않는다', () => {
  const samples = [[0], [1], [3], [2026, 11], [2026, 1], ['장학', 2]];
  for (const l of langs) {
    for (const k of I.EXTRA_KEYS) {
      const v = I.T[l][k];
      if (typeof v !== 'function') continue;
      for (const args of samples) {
        if (args.length < v.length) continue;                    // 인자 개수가 모자란 조합은 건너뜀
        if (v.length === 2 && typeof args[0] !== 'number') continue;
        const out = v(...args);
        assert.equal(typeof out, 'string', `${l}.${k}`);
        assert.ok(!/undefined|NaN|\[object/.test(out), `${l}.${k}(${args}) = ${out}`);
      }
    }
  }
});

test('달력 요일·단계 이름은 일곱 개·네 개', () => {
  for (const l of langs) {
    assert.equal(I.T[l].calDow.length, 7);
    assert.deepEqual(Object.keys(I.T[l].bootSteps).sort(), ['calendar', 'glossary', 'notices', 'version']);
    assert.deepEqual(Object.keys(I.T[l].calLegend).sort(), ['academic', 'deadline', 'event']);
  }
});

test('날짜 문구: 알림·달력 제목이 언어에 맞다', () => {
  assert.equal(I.T.ko.calMonth(2026, 11), '2026년 11월');
  assert.equal(I.T.en.calMonth(2026, 11), 'November 2026');
  assert.equal(I.T.zh.calMonth(2026, 11), '2026年11月');
  assert.equal(I.T.ja.alertDue(0), '保存したお知らせ・今日締切');
  assert.equal(I.T.en.alertDue(1), 'Saved notice · due in 1 day');
  assert.equal(I.T.en.alertDue(3), 'Saved notice · due in 3 days');
});

console.log(`\n${passed}개 통과`);
