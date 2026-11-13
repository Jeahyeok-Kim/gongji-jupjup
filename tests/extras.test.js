// 실행: node tests/extras.test.js
// 캘린더(.ics), 저장한 공지, 새 공지 판정, 오늘의 요약(js/extras.js)을 확인
const assert = require('node:assert/strict');
const E = require('../js/extras.js');
const L = require('../js/logic.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const at = (s) => L.parseLocal(s);

test('.ics: 쉼표·세미콜론·줄바꿈을 막아 쓰고 줄 끝은 CRLF', () => {
  const { text, count } = E.buildIcs([{ uid: 'x', summary: '장학금, 신청; 안내\n둘째 줄', start: '2026-11-20' }], { now: at('2026-11-13T09:00') });
  assert.equal(count, 1);
  assert.ok(text.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(text.endsWith('END:VCALENDAR\r\n'));
  assert.ok(text.includes('SUMMARY:장학금\\, 신청\\; 안내\\n둘째 줄\r\n'));
  assert.ok(!/[^\r]\n/.test(text), '줄바꿈은 항상 CRLF');
});

test('.ics: 날짜만 있으면 종일, 시각이 있으면 시간 일정, 끝이 없으면 30분', () => {
  const a = E.buildIcs([{ summary: 'a', start: '2026-11-30' }]).text;
  assert.ok(a.includes('DTSTART;VALUE=DATE:20261130') && a.includes('DTEND;VALUE=DATE:20261201'), '다음 날이 끝(달이 바뀌어도)');
  const b = E.buildIcs([{ summary: 'b', start: '2026-11-20T23:45' }]).text;
  assert.ok(b.includes('DTSTART:20261120T234500') && b.includes('DTEND:20261121T001500'), '자정을 넘기는 30분');
  const c = E.buildIcs([{ summary: 'c', start: '2026-11-20T10:00', end: '2026-11-20T12:30' }]).text;
  assert.ok(c.includes('DTEND:20261120T123000'));
});

test('.ics: 날짜가 이상한 칸은 건너뛰고 개수에 세지 않음', () => {
  const r = E.buildIcs([{ summary: 'x', start: '내일' }, { summary: 'y', start: '2026-02-30x' }, { summary: 'ok', start: '2026-11-20' }]);
  assert.equal(r.count, 1);
  assert.equal((r.text.match(/BEGIN:VEVENT/g) || []).length, 1);
});

test('.ics: 한글이 긴 줄은 75바이트 안으로 접히고 접힌 줄은 공백으로 시작', () => {
  const long = '가'.repeat(60);
  const { text } = E.buildIcs([{ summary: long, start: '2026-11-20' }]);
  for (const line of text.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `${Buffer.byteLength(line)}바이트`);
  const unfolded = text.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('SUMMARY:' + long), '접었다 펴면 원래대로');
});

test('공지 → 캘린더 칸: 마감 한 칸 + 행사마다 한 칸, 알림 붙음', () => {
  const n = { id: 'n1', title: '특강', deadline: '2026-11-18T17:00', link: 'https://e.kr/1',
    events: [{ date: '2026-11-19', start: '13:00', end: '14:30' }, { date: '2026-11-20', start: '13:00', end: '14:30' }] };
  const items = E.noticeToIcsItems(n, { deadline: '마감' });
  assert.equal(items.length, 3);
  assert.equal(items[0].summary, '[마감] 특강');
  assert.equal(items[0].alarmMinutes, 1440);
  assert.equal(items[1].start, '2026-11-19T13:00');
  assert.equal(items[1].end, '2026-11-19T14:30');
  assert.equal(new Set(items.map((i) => i.uid)).size, 3, 'uid 가 겹치지 않음');
  assert.equal(E.noticeToIcsItems({ id: 'n2', title: 't' }).length, 0, '날짜가 없으면 칸도 없음');
});

test('저장: 넣고 빼기, 중복·이상한 값 걸러냄', () => {
  assert.deepEqual(E.toggleSaved([], 'a'), ['a']);
  assert.deepEqual(E.toggleSaved(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(E.cleanSaved(['a', 'a', 3, null, '', 'b']), ['a', 'b']);
  assert.deepEqual(E.cleanSaved('nope'), []);
  assert.equal(E.cleanSaved(Array.from({ length: 700 }, (_, i) => 'id' + i)).length, 500);
});

test('마지막 방문: 같은 날 다시 열어도 기준은 그대로, 다른 날이면 이전 방문일이 기준', () => {
  assert.deepEqual(E.nextVisit(null, '2026-11-13'), { last: '2026-11-13', prev: null });
  const day2 = E.nextVisit({ last: '2026-11-13', prev: null }, '2026-11-14');
  assert.deepEqual(day2, { last: '2026-11-14', prev: '2026-11-13' });
  assert.deepEqual(E.nextVisit(day2, '2026-11-14'), day2);
  assert.deepEqual(E.nextVisit('망가짐', '2026-11-14'), { last: '2026-11-14', prev: null });
});

test('새 공지: 기준일 다음 날부터, 기준이 없으면 새 공지 없음', () => {
  assert.equal(E.isNew({ date: '2026-11-13' }, '2026-11-12'), true);
  assert.equal(E.isNew({ date: '2026-11-12' }, '2026-11-12'), false);
  assert.equal(E.isNew({ date: '2026-11-13' }, null), false);
  assert.equal(E.isNew({}, '2026-11-12'), false);
});

test('오늘의 요약: 오늘 마감·3일 안 마감·새 공지·저장·중요를 나눔', () => {
  const now = at('2026-11-16T09:00');
  const ns = [
    { id: 'a', title: 'A', date: '2026-11-10', deadline: '2026-11-16T18:00' },   // 오늘
    { id: 'b', title: 'B', date: '2026-11-15', deadline: '2026-11-18' },          // 2일 뒤, 새 공지
    { id: 'c', title: 'C', date: '2026-11-01', deadline: '2026-11-25' },          // 멀다
    { id: 'd', title: 'D', date: '2026-11-01', deadline: '2026-11-10' },          // 지남
    { id: 'e', title: 'E', date: '2026-11-01', pinned: true },                    // 마감 없음, 중요
    { id: 'f', title: 'F', date: '2026-11-01', deadline: '2026-11-17',
      events: [{ date: '2026-11-17', start: '13:00', end: '14:00' }] }            // 내일, 수업과 겹침
  ];
  const tt = [{ day: 2, start: '12:30', end: '14:00' }];                          // 화요일(11-17)
  const s = E.summarize(ns, now, { saved: ['c', 'd'], since: '2026-11-12', timetable: tt, hideConflicts: false });
  assert.deepEqual(s.today.map((n) => n.id), ['a']);
  assert.deepEqual(s.soon.map((n) => n.id), ['a', 'f', 'b']);
  assert.deepEqual(s.fresh.map((n) => n.id), ['b']);
  assert.deepEqual(s.saved.map((n) => n.id), ['c'], '지난 공지는 저장했어도 빠짐');
  assert.deepEqual(s.pinned.map((n) => n.id), ['e']);
  const h = E.summarize(ns, now, { saved: [], since: '2026-11-12', timetable: tt, hideConflicts: true });
  assert.deepEqual(h.soon.map((n) => n.id), ['a', 'b'], '겹치는 행사 숨기기를 켜면 빠짐');
});

console.log(`\n${passed}개 통과`);
