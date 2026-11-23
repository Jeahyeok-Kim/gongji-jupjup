// 크롬 확장(수집기) 보관 기간 시험 (node --test tests/collector.test.js)
// collector/config.js 를 가짜 chrome.storage 와 함께 불러 와 날짜 계산·다음 쪽 판단·내보내기 범위를 확인한다.
const test = require('node:test');
const assert = require('node:assert');

const mem = {};
globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        if (keys === null || keys === undefined) return { ...mem };
        const list = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(list.filter((k) => k in mem).map((k) => [k, mem[k]]));
      },
      async set(obj) { Object.assign(mem, obj); },
      async remove(keys) { for (const k of [].concat(keys)) delete mem[k]; }
    }
  }
};
require('../collector/config.js');

test('보관 기간 첫날: 6개월 전 같은 날 (없는 날은 그 달 마지막 날), 6개월보다 짧게는 안 함', () => {
  const S = globalThis.kkuSince;
  assert.strictEqual(S(6, new Date(2026, 10, 23)), '2026-05-23');
  assert.strictEqual(S(12, new Date(2026, 10, 23)), '2025-11-23');
  assert.strictEqual(S(6, new Date(2026, 7, 31)), '2026-02-28');
  assert.strictEqual(S(6, new Date(2026, 0, 15)), '2025-07-15');
  assert.strictEqual(S(3, new Date(2026, 10, 23)), '2026-05-23', '3개월을 골라도 6개월');
});

test('설정: 보관 기간 기본 6개월, 1년 선택, 이상한 값은 6~24개월로', async () => {
  assert.strictEqual((await globalThis.kkuSettings()).keepMonths, 6);
  mem.settings = { keepMonths: 12 };
  assert.strictEqual((await globalThis.kkuSettings()).keepMonths, 12);
  mem.settings = { keepMonths: 1 };
  assert.strictEqual((await globalThis.kkuSettings()).keepMonths, 6);
  mem.settings = { keepMonths: 'x' };
  assert.strictEqual((await globalThis.kkuSettings()).keepMonths, 6);
  delete mem.settings;
});

test('다음 쪽 판단: 보관 기간보다 오래된 글이 나오면 끝, 고정 공지 날짜는 보지 않음', () => {
  const N = globalThis.kkuNextPage;
  const base = { since: '2026-05-23', full: false, backfill: false, fresh: 3, seen: 50, limit: Infinity, listLen: 50, pageSize: 50 };
  const page = (...dates) => dates.map((d, i) => ({ date: d, pinned: i === 0 && d < '2020' }));
  assert.strictEqual(N({ ...base, items: page('2014-12-01', '2026-11-20', '2026-06-01') }), 'next', '맨 위 고정 공지(2014년)는 무시');
  assert.strictEqual(N({ ...base, items: page('2026-07-01', '2026-05-22') }), 'done', '첫날보다 하루 오래된 글');
  assert.strictEqual(N({ ...base, items: page('2026-07-01'), listLen: 12 }), 'done', '목록 끝');
  assert.strictEqual(N({ ...base, items: page('2026-07-01'), seen: 300, limit: 300 }), 'done', '투데이뉴스 건수 상한');
});

test('다음 쪽 판단: 새 글이 없으면 멈추되, 보관 기간을 채우는 중이거나 전부 다시 받을 때는 계속', () => {
  const N = globalThis.kkuNextPage;
  const items = [{ date: '2026-10-01' }, { date: '2026-09-30' }];
  const base = { items, since: '2026-05-23', fresh: 0, seen: 50, limit: Infinity, listLen: 50, pageSize: 50 };
  assert.strictEqual(N({ ...base, full: false, backfill: false }), 'known');
  assert.strictEqual(N({ ...base, full: false, backfill: true }), 'next');
  assert.strictEqual(N({ ...base, full: true, backfill: false }), 'next');
  const B = globalThis.kkuNeedsBackfill;
  assert.strictEqual(B(undefined, '2026-05-23'), true, '처음(1.2 이하에서 올린 경우 포함)');
  assert.strictEqual(B('2026-05-23', '2026-05-23'), false);
  assert.strictEqual(B('2026-05-23', '2025-11-23'), true, '6개월 → 1년으로 늘림');
  assert.strictEqual(B('2025-11-23', '2026-05-23'), false, '줄이면 다시 받을 것 없음');
  assert.strictEqual(B('2026-05-23', ''), false);
});

test('내보내기: 보관 기간에 올라온 공지만, 보관 기간 정보와 함께', async () => {
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ago = (days) => ymd(new Date(Date.now() - days * 86400000));
  mem['n:a'] = { id: 'a', date: ago(3), bbsSeq: 3 };          // 사흘 전
  mem['n:b'] = { id: 'b', date: ago(150), bbsSeq: 2 };        // 약 5개월 전
  mem['n:c'] = { id: 'c', date: ago(300), bbsSeq: 1 };        // 약 10개월 전
  mem['s:1:2'] = { host: 'www.kku.ac.kr', menu: 1, name: '학사공지', since: '2026-05-23' };
  const since = globalThis.kkuSince(6);
  const p = await globalThis.kkuNoticesPayload();
  assert.deepStrictEqual(p.period, { months: 6, since });
  assert.deepStrictEqual(p.notices.map((n) => n.id), ['a', 'b'], '최신 순, 10개월 된 글은 6개월 보관이면 보내지 않음');
  assert.strictEqual(p.count, 2);
  assert.strictEqual(p.boards.length, 1);
  mem.settings = { keepMonths: 12 };
  const p12 = await globalThis.kkuNoticesPayload();
  assert.strictEqual(p12.period.months, 12);
  assert.deepStrictEqual(p12.notices.map((n) => n.id), ['a', 'b', 'c'], '1년으로 늘리면 함께 보냄');
  delete mem.settings;
});
