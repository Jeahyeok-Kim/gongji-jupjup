// 지원 보드(관심 → 준비 중 → 지원 완료 → 결과) 시험 (node --test tests/track.test.js)
const test = require('node:test');
const assert = require('node:assert');
const K = require('../js/track.js');

const now = new Date(2026, 10, 23, 10, 0);
const N = (id, deadline) => ({ id, title: id, deadline });
const notices = [N('a', '2026-11-25 23:59'), N('b', '2026-11-24 18:00'), N('c', '2026-11-20 23:59'), N('d', null), N('e', '2026-12-30 23:59')];

test('단계: 보드에 적은 단계 > 지원 완료 목록 > 저장 목록', () => {
  const track = { a: { stage: 'prep', checks: [], memo: '' } };
  assert.strictEqual(K.stageOf('a', track, ['a'], []), 'prep');
  assert.strictEqual(K.stageOf('b', track, ['b'], ['b']), 'done');
  assert.strictEqual(K.stageOf('c', track, ['c'], []), 'interest');
  assert.strictEqual(K.stageOf('z', track, [], []), null);
});

test('옮기기: 지원 완료로 옮기면 지원 완료 목록에 넣고, 되돌리면 뺀다. 보드에 있으면 저장도 된다', () => {
  let st = { track: {}, saved: [], applied: [] };
  st = K.move(st, 'a', 'prep', now);
  assert.deepStrictEqual([st.track.a.stage, st.saved, st.applied], ['prep', ['a'], []]);
  st = K.move(st, 'a', 'done', now);
  assert.deepStrictEqual([st.track.a.stage, st.applied], ['done', ['a']]);
  st = K.move(st, 'a', 'interest', now);
  assert.deepStrictEqual(st.applied, [], '관심으로 되돌리면 지원 완료 해제');
  assert.strictEqual(st.track.a, undefined, '준비물·메모가 없으면 관심 단계는 적지 않음');
  st = K.move(st, 'a', null, now);
  assert.deepStrictEqual(st.saved, [], '빼기 = 저장 해제');
});

test('준비물 체크리스트와 메모', () => {
  let t = {};
  t = K.addCheck(t, 'a', '자기소개서');
  t = K.addCheck(t, 'a', '자기소개서');
  t = K.addCheck(t, 'a', '성적증명서');
  assert.strictEqual(t.a.checks.length, 2, '같은 준비물은 한 번');
  t = K.toggleCheck(t, 'a', 1);
  assert.deepStrictEqual(K.progress(t.a), { done: 1, total: 2 });
  t = K.update(t, 'a', { memo: '교수님 추천서 부탁' });
  assert.strictEqual(t.a.memo, '교수님 추천서 부탁');
  t = K.removeCheck(t, 'a', 0);
  t = K.removeCheck(t, 'a', 0);
  t = K.update(t, 'a', { memo: '' });
  assert.strictEqual(t.a, undefined, '다 비우면 기록도 지움');
});

test('보드 칸: 마감 가까운 순, 마감 지난 공지는 뒤로, 요약', () => {
  const st = { saved: ['a', 'b', 'c', 'd'], applied: ['e'], track: { b: { stage: 'prep', checks: [], memo: '' }, e: { stage: 'result', result: 'pass', checks: [], memo: '' } } };
  const cols = K.columns(notices, st, now);
  assert.deepStrictEqual(cols.interest.map((n) => n.id), ['a', 'd', 'c']);
  assert.deepStrictEqual(cols.prep.map((n) => n.id), ['b']);
  assert.deepStrictEqual(cols.result.map((n) => n.id), ['e']);
  assert.strictEqual(K.cleanTrack(st.track).e.result, 'pass');
  assert.deepStrictEqual(K.summary(cols, now), { interest: 3, prep: 1, done: 0, result: 1, dueWeek: 2 });
});

test('이상한 값은 정리한다', () => {
  const t = K.cleanTrack({ a: { stage: 'xx', checks: [{ t: '' }, { t: 'ok', d: 'yes' }], memo: 3 }, '': { stage: 'prep' }, b: null, c: { stage: 'prep', result: 'pass' } });
  assert.deepStrictEqual(Object.keys(t), ['a', 'c']);
  assert.deepStrictEqual(t.a, { stage: 'interest', checks: [{ t: 'ok', d: false }], memo: '3', result: '', at: 0 });
  assert.strictEqual(t.c.result, '', '결과 단계가 아니면 합격·불합격은 지움');
  assert.deepStrictEqual(K.cleanTrack([1, 2]), {});
});
