// 실행: node tests/cal.test.js
// 월간 달력 칸, 구글 캘린더 주소(js/cal.js)를 확인
const assert = require('node:assert/strict');
const C = require('../js/cal.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

test('달력 칸: 2026년 11월은 일요일 시작으로 5주, 앞뒤는 이웃 달 날짜', () => {
  const g = C.monthGrid(2026, 10, [], '2026-11-13');
  assert.equal(g.weeks.length, 5);
  assert.equal(g.weeks[0][0].date, '2026-11-01');          // 11월 1일은 일요일
  assert.equal(g.weeks[0][0].inMonth, true);
  assert.equal(g.weeks[4][6].date, '2026-12-05');
  assert.equal(g.weeks[4][6].inMonth, false);
  assert.ok(g.weeks.flat().every((c) => c.weekday === new Date(c.date + 'T00:00').getDay()));
  assert.equal(g.weeks.flat().filter((c) => c.isToday).length, 1);
});

test('달력 칸: 월요일 시작, 윤년 2월, 6주짜리 달', () => {
  const m = C.monthGrid(2026, 10, [], '', 1);
  assert.equal(m.weeks[0][0].date, '2026-10-26');
  const feb = C.monthGrid(2028, 1, [], '');
  assert.equal(feb.weeks.flat().filter((c) => c.inMonth).length, 29);
  assert.equal(C.monthGrid(2026, 7, [], '').weeks.length, 6);   // 2026-08 : 토요일 시작이라 6주
  assert.equal(C.monthGrid(2026, 1, [], '').weeks.length, 4);   // 2026-02 : 일요일 시작·28일이라 4주
});

test('달 넘기기: 연말·연초를 넘어간다', () => {
  assert.deepEqual(C.shiftMonth(2026, 11, 1), { year: 2027, month0: 0 });
  assert.deepEqual(C.shiftMonth(2026, 0, -1), { year: 2025, month0: 11 });
  assert.deepEqual(C.shiftMonth(2026, 10, 0), { year: 2026, month0: 10 });
});

test('일정 모으기: 마감·행사·학사일정(기간은 하루씩), 지원 완료는 제외', () => {
  const notices = [
    { id: 'a', title: 'A', deadline: '2026-11-20T23:59', events: [{ date: '2026-11-25', start: '14:00', end: '16:00' }] },
    { id: 'b', title: 'B', deadline: '2026-11-21' },
    { id: 'c', title: 'C', deadline: null }
  ];
  const cal = { items: [{ start: '2026-11-16', end: '2026-11-18', title: { ko: '수강신청' } }] };
  const e = C.collect(notices, { calendar: cal, skip: new Set(['b']) });
  assert.deepEqual(e.map((x) => x.type + ':' + x.date), ['deadline:2026-11-20', 'event:2026-11-25', 'academic:2026-11-16', 'academic:2026-11-17', 'academic:2026-11-18']);
  assert.equal(e[0].time, '23:59');
  assert.equal(e[2].title, '수강신청');
  const g = C.monthGrid(2026, 10, e, '2026-11-13');
  const cell = (d) => g.weeks.flat().find((c) => c.date === d);
  assert.equal(cell('2026-11-20').deadlines, 1);
  assert.equal(cell('2026-11-25').events, 1);
  assert.equal(cell('2026-11-17').academic, 1);
});

test('구글 캘린더 주소: 시각이 있는 일정', () => {
  const u = C.googleUrl({ summary: '[마감] 장학금, 신청', start: '2026-11-20T23:59', description: '설명', url: 'https://kku.ac.kr/x' }, 'Asia/Seoul');
  const q = new URL(u).searchParams;
  assert.equal(new URL(u).origin + new URL(u).pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(q.get('action'), 'TEMPLATE');
  assert.equal(q.get('text'), '[마감] 장학금, 신청');
  assert.equal(q.get('dates'), '20261120T235900/20261121T002900');       // 끝이 없으면 30분, 자정을 넘겨도 날짜가 바뀐다
  assert.equal(q.get('details'), '설명\n\nhttps://kku.ac.kr/x');
  assert.equal(q.get('ctz'), 'Asia/Seoul');
});

test('구글 캘린더 주소: 종일 일정은 다음 날까지, 끝이 있으면 그대로', () => {
  assert.equal(new URL(C.googleUrl({ summary: 'a', start: '2026-11-30' })).searchParams.get('dates'), '20261130/20261201');
  assert.equal(new URL(C.googleUrl({ summary: 'a', start: '2026-12-31' })).searchParams.get('dates'), '20261231/20270101');
  assert.equal(new URL(C.googleUrl({ summary: 'a', start: '2026-11-25T14:00', end: '2026-11-25T16:00' })).searchParams.get('dates'), '20261125T140000/20261125T160000');
  assert.equal(new URL(C.googleUrl({ summary: 'a', start: '2026-11-30' }, 'Asia/Seoul')).searchParams.get('ctz'), null, '종일에는 시간대를 붙이지 않음');
  assert.equal(C.googleUrl({ summary: 'a', start: 'bad' }), null);
});

test('구독 주소: https · webcal · 구글 캘린더로 바로 추가', () => {
  const f = C.feedUrls('https://alex.github.io/gongji/index.html?today=2026-11-16#/home');
  assert.equal(f.https, 'https://alex.github.io/gongji/data/gongji.ics');
  assert.equal(f.webcal, 'webcal://alex.github.io/gongji/data/gongji.ics');
  assert.equal(f.google, 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(f.webcal));
  assert.equal(C.feedUrls('file:///C:/x/index.html'), null);
  assert.equal(f.local, false, '인터넷 주소는 local 이 아님');
  for (const u of ['http://localhost:8765/index.html', 'http://127.0.0.1:5500/', 'http://192.168.0.7/app/', 'http://10.1.2.3/', 'http://172.20.1.1/', 'http://mypc.local/']) {
    assert.equal(C.feedUrls(u).local, true, u + ' 는 내부 주소');
  }
  assert.equal(C.feedUrls('http://172.32.1.1/').local, false, '172.32 는 공인 주소 범위');
  assert.equal(C.feedUrls('not a url'), null);
});

console.log(`\n${passed}개 통과`);
