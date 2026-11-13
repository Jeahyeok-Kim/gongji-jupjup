// 실행: node tests/sync.test.js
// 서버 자동 갱신(js/sync.js)이 새 데이터만 받아 오고, 이상한 데이터나 연결 실패에도 화면을 깨지 않는지 확인
const assert = require('node:assert/strict');
const S = require('../js/sync.js');
const L = require('../js/logic.js');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

// 가짜 서버: 주소 → 응답. 주소 끝의 ?쿼리는 무시하고 파일 이름으로 찾음
function fakeServer(files) {
  const calls = [];
  const fn = async (url) => {
    const name = url.split('?')[0].split('/').pop();
    calls.push(name);
    if (!(name in files)) return { ok: false, status: 404, json: async () => ({}) };
    const v = files[name];
    if (v instanceof Error) throw v;
    return { ok: true, status: 200, json: async () => v };
  };
  fn.calls = calls;
  return fn;
}
const good = (stamp, extra) => Object.assign({
  meta: { source: 'pipeline', generatedAt: stamp }, categories: [{ id: 'etc' }],
  notices: [{ id: 'a', title: '가', category: 'etc' }, { id: 'b', title: '나', category: 'etc' }]
}, extra);

(async () => {
  console.log('새 데이터인지 확인');
  await test('시각 문자열 비교: 더 늦은 시각만 새로운 것', () => {
    assert.equal(S.isNewer('2026-11-13 14:41', '2026-11-13 15:00'), true);
    assert.equal(S.isNewer('2026-11-13 14:41', '2026-11-13 14:41'), false);
    assert.equal(S.isNewer('2026-11-13 14:41', '2026-11-12 23:59'), false);
    assert.equal(S.isNewer('', '2026-11-13 14:41'), true);
    assert.equal(S.isNewer('2026-11-13 14:41', undefined), false);
  });
  await test('주소 이어 붙이기: 끝에 /가 있든 없든 같음', () => {
    assert.equal(S.joinUrl('data', 'version.json'), 'data/version.json');
    assert.equal(S.joinUrl('https://x.io/d/', 'version.json'), 'https://x.io/d/version.json');
  });

  console.log('서버에서 가져오기');
  await test('서버 데이터가 같거나 오래되면 version.json 만 받고 끝 (큰 파일은 안 받음)', async () => {
    const f = fakeServer({ 'version.json': { generatedAt: '2026-11-13 14:41' }, 'notices.json': good('2026-11-13 14:41') });
    const r = await S.check({ base: 'data/', localStamp: '2026-11-13 14:41', fetchImpl: f });
    assert.equal(r.status, 'upToDate');
    assert.deepEqual(f.calls, ['version.json']);
  });
  await test('더 새로운 데이터가 있으면 공지와 학사일정을 받아 온다', async () => {
    const f = fakeServer({
      'version.json': { generatedAt: '2026-11-14 07:30', calendarGeneratedAt: '2026-11-14' },
      'notices.json': good('2026-11-14 07:30'), 'calendar.json': { generatedAt: '2026-11-14', items: [{ start: '2026-12-14' }] }
    });
    const r = await S.check({ base: 'data/', localStamp: '2026-11-13 14:41', fetchImpl: f });
    assert.equal(r.status, 'updated');
    assert.equal(r.data.notices.length, 2);
    assert.equal(r.calendar.items.length, 1);
    assert.equal(r.stamp, '2026-11-14 07:30');
  });
  await test('학사일정 파일이 없어도 공지는 갱신', async () => {
    const f = fakeServer({ 'version.json': { generatedAt: '2026-11-14 07:30' }, 'notices.json': good('2026-11-14 07:30') });
    const r = await S.check({ base: 'data/', localStamp: '2026-11-13 14:41', fetchImpl: f });
    assert.equal(r.status, 'updated');
    assert.equal(r.calendar, null);
  });
  await test('서버가 없거나(404) 연결이 끊기면 실패로 알리고 예외는 던지지 않는다', async () => {
    assert.equal((await S.check({ fetchImpl: fakeServer({}) })).status, 'failed');
    assert.equal((await S.check({ fetchImpl: fakeServer({ 'version.json': new TypeError('Failed to fetch') }) })).status, 'failed');
  });
  await test('망가진 데이터(공지 목록 없음, id 없음)는 받아도 쓰지 않는다', async () => {
    const bad = { 'version.json': { generatedAt: '2026-11-14 07:30' } };
    for (const body of [{ meta: {}, categories: [], notices: 'x' }, good('2026-11-14 07:30', { notices: [{ title: '제목만' }] }), null]) {
      const r = await S.check({ localStamp: '', fetchImpl: fakeServer(Object.assign({ 'notices.json': body }, bad)) });
      assert.equal(r.status, 'failed');
      assert.equal(r.error, 'bad-notices');
    }
  });
  await test('version.json 이 이상하면 실패', async () => {
    assert.equal((await S.check({ fetchImpl: fakeServer({ 'version.json': { nope: 1 } }) })).error, 'bad-version');
  });
  await test('샘플 데이터로 진짜(파이프라인) 데이터를 덮어쓰지 않는다', async () => {
    const sample = good('2026-11-20 00:00', { meta: { source: 'sample', generatedAt: '2026-11-20 00:00' } });
    const f = fakeServer({ 'version.json': { generatedAt: '2026-11-20 00:00' }, 'notices.json': sample });
    assert.equal((await S.check({ localStamp: '2026-11-13 14:41', localSource: 'pipeline', fetchImpl: f })).error, 'sample-data');
    assert.equal((await S.check({ localStamp: '2026-11-13 14:41', localSource: 'sample', fetchImpl: f })).status, 'updated');
  });
  await test('실제 data/notices.js 를 서버 파일처럼 올려도 앱이 받아들이는 모양이다', async () => {
    global.window = {};
    const DATA = require('../data/notices.sample.js');
    assert.equal(S.validNotices(JSON.parse(JSON.stringify(DATA))), true);
  });

  console.log('내 설정 백업');
  await test('내보내기 → 불러오기: 시간표와 설정이 그대로 돌아온다', () => {
    const tt = [{ day: 3, start: '13:00', end: '14:15', name: '컴퓨터공학개론' }];
    const file = JSON.parse(JSON.stringify(S.makeBackup({ timetable: tt, lang: 'en', sort: 'benefit', grouped: true, other: 'x' }, new Date('2026-11-13T00:00:00Z'))));
    assert.equal(file.savedAt, '2026-11-13T00:00:00.000Z');
    assert.equal('other' in file.values, false);               // 정해진 항목만 담는다
    const r = S.readBackup(file, L.isValidClass, ['ko', 'en', 'zh', 'ja']);
    assert.equal(r.ok, true);
    assert.deepEqual(r.values.timetable, tt);
    assert.equal(r.values.lang, 'en');
    assert.equal(r.values.sort, 'benefit');
  });
  await test('다른 파일·망가진 값은 거부하거나 걸러 낸다', () => {
    assert.equal(S.readBackup({ hello: 1 }, L.isValidClass).ok, false);
    assert.equal(S.readBackup(null, L.isValidClass).ok, false);
    const r = S.readBackup({ kind: 'gongji-jupjup-settings', values: {
      timetable: [{ day: 3, start: '13:00', end: '14:15', name: 'ok' }, { day: 9, start: 'x', end: 'y', name: '' }],
      lang: 'fr', sort: 'nope', budgetHours: -5, budgetWindow: 3, grouped: 'yes' } }, L.isValidClass, ['ko', 'en']);
    assert.equal(r.ok, true);
    assert.equal(r.values.timetable.length, 1);
    assert.equal(r.dropped, 1);
    assert.deepEqual(Object.keys(r.values), ['timetable']);   // 나머지 값은 모두 걸러짐
  });

  await test('저장한 공지·선발형 포함 설정도 백업에 들어가고, 이상한 값은 걸러진다', () => {
    const made = S.makeBackup({ saved: ['a', 'b'], budgetSelective: false, timetable: [] });
    assert.deepEqual(made.values.saved, ['a', 'b']);
    assert.equal(made.values.budgetSelective, false);
    const r = S.readBackup({ kind: 'gongji-jupjup-settings', values: { saved: ['a', 'a', 7, '', 'b'], budgetSelective: 'yes' } }, L.isValidClass);
    assert.deepEqual(r.values.saved, ['a', 'b']);
    assert.equal('budgetSelective' in r.values, false);
  });


  console.log('처음 열 때·갱신할 때 불러오기 흐름');
  await test('공지가 하나도 없으면 버전이 같아도 서버에서 받아 온다 (처음 실행)', async () => {
    const f = fakeServer({ 'version.json': { generatedAt: '2026-11-13 10:00' }, 'notices.json': good('2026-11-13 10:00') });
    const r = await S.check({ fetchImpl: f, localStamp: '2026-11-13 10:00', localCount: 0, localSource: '' });
    assert.equal(r.status, 'updated');
    assert.equal(r.first, true);
    assert.equal(r.data.notices.length, 2);
    const same = await S.check({ fetchImpl: fakeServer({ 'version.json': { generatedAt: '2026-11-13 10:00' } }), localStamp: '2026-11-13 10:00', localCount: 5 });
    assert.equal(same.status, 'upToDate');
  });

  await test('받는 순서를 알려 준다 (version → notices → calendar → glossary)', async () => {
    const f = fakeServer({
      'version.json': { generatedAt: '2026-11-13 11:00' }, 'notices.json': good('2026-11-13 11:00'),
      'calendar.json': { generatedAt: '2026-11-13', items: [] },
      'glossary.json': { 다드림: { ko: '비교과 포인트', en: 'Dadream points' } }
    });
    const steps = [];
    const r = await S.check({ fetchImpl: f, localStamp: '2026-11-13 10:00', onStep: (s) => steps.push(s) });
    assert.deepEqual(steps, ['version', 'notices', 'calendar', 'glossary']);
    assert.deepEqual(Object.keys(r.glossary), ['다드림']);
    const bad = await S.check({ fetchImpl: fakeServer({ 'version.json': { generatedAt: '2026-11-13 11:00' }, 'notices.json': good('2026-11-13 11:00'), 'glossary.json': { x: 3 } }), localStamp: '' });
    assert.equal(bad.status, 'updated');
    assert.equal(bad.glossary, null, '이상한 용어집은 받지 않음');
    // 화면 쪽 콜백이 예외를 던져도 갱신은 계속된다
    const boom = await S.check({ fetchImpl: f, localStamp: '', onStep: () => { throw new Error('화면 오류'); } });
    assert.equal(boom.status, 'updated');
  });

  await test('갱신 전후 비교: 새 공지·사라진 공지·마감이 바뀐 공지', async () => {
    const before = [{ id: 'a', deadline: '2026-11-20' }, { id: 'b', deadline: null }, { id: 'c', deadline: '2026-11-25' }];
    const after = [{ id: 'a', deadline: '2026-11-21' }, { id: 'b', deadline: null }, { id: 'd', deadline: null }];
    assert.deepEqual(S.diffNotices(before, after), { added: ['d'], removed: ['c'], deadlineChanged: ['a'] });
    assert.deepEqual(S.diffNotices(null, after).added, ['a', 'b', 'd']);
    const f = fakeServer({ 'version.json': { generatedAt: '2026-11-13 12:00' }, 'notices.json': good('2026-11-13 12:00') });
    const r = await S.check({ fetchImpl: f, localStamp: '2026-11-13 10:00', localNotices: [{ id: 'a', deadline: null }] });
    assert.deepEqual(r.diff, { added: ['b'], removed: [], deadlineChanged: [] });
  });

  await test('용어집 모양 검사', () => {
    assert.equal(S.validGlossary({ a: { ko: '풀이' } }), true);
    assert.equal(S.validGlossary({}), false);
    assert.equal(S.validGlossary([]), false);
    assert.equal(S.validGlossary({ a: { en: 'x' } }), false);
    assert.equal(S.validGlossary(null), false);
  });

  await test('테마·글자 크기·지원 완료·키워드 같은 개인 설정도 백업되고 걸러진다', () => {
    const made = S.makeBackup({ theme: 'dark', fontScale: 'lg', applied: ['a'], read: ['b'], keywords: ['장학'], interests: ['career'], recent: ['장학'], alertsOn: true });
    assert.equal(Object.keys(made.values).length, 8);
    const r = S.readBackup({ kind: 'gongji-jupjup-settings', values: {
      theme: 'blue', fontScale: 'xl', applied: ['a', 'a', 5], read: ['x'.repeat(81), 'ok'], keywords: ['k'.repeat(21), '장학'],
      interests: Array.from({ length: 20 }, (_, i) => 'c' + i), recent: ['a', ' '], alertsOn: 'yes' } }, L.isValidClass);
    assert.equal('theme' in r.values, false);
    assert.equal('fontScale' in r.values, false);
    assert.deepEqual(r.values.applied, ['a']);
    assert.deepEqual(r.values.read, ['ok']);
    assert.deepEqual(r.values.keywords, ['장학']);
    assert.equal(r.values.interests.length, 12);
    assert.deepEqual(r.values.recent, ['a']);
    assert.equal('alertsOn' in r.values, false);
    const ok = S.readBackup({ kind: 'gongji-jupjup-settings', values: { theme: 'auto', fontScale: 'sm', alertsOn: false } }, L.isValidClass);
    assert.deepEqual(ok.values, { theme: 'auto', fontScale: 'sm', alertsOn: false });
  });

  console.log(`\n${passed}개 통과${failed ? `, ${failed}개 실패` : ''}`);
})();
