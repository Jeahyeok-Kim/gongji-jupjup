// 실행: node tests/overrides.test.js
// 보정표(js/overrides.js): CSV 읽기, 주소 바꾸기, 규칙 검사, 공지에 덮어쓰기, 받아 오기 실패 처리
const assert = require('node:assert/strict');
const O = require('../js/overrides.js');
const L = require('../js/logic.js');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const ns = () => [
  { id: '2-26-100', title: '[학사] 2026학년도 겨울 계절학기 수강신청 안내', deadline: '2026-11-20', benefit: null },
  { id: '2-26-101', title: '다드림 비교과 프로그램 참가자 모집', deadline: '2026-11-25', benefit: { points: 10, text: { ko: '다드림 10P' } } },
  { id: '2-26-102', title: '교내 공모전 안내', deadline: null }
];

(async () => {
  await test('CSV: 따옴표 안의 쉼표·줄바꿈·큰따옴표, BOM, CRLF', () => {
    const rows = O.parseCSV('﻿"a,b","c ""q"" d","줄1\n줄2"\r\nx,y,z\r\n');
    assert.deepEqual(rows, [['a,b', 'c "q" d', '줄1\n줄2'], ['x', 'y', 'z']]);
    assert.deepEqual(O.parseCSV(''), []);
    assert.deepEqual(O.parseCSV('a,b'), [['a', 'b']]);
  });

  await test('주소: 구글 시트 편집 주소 → CSV, 게시 주소 → output=csv, 깃허브 blob → raw', () => {
    assert.deepEqual(O.toRemoteUrl('https://docs.google.com/spreadsheets/d/AbC_1-2/edit?usp=sharing#gid=77'),
      { url: 'https://docs.google.com/spreadsheets/d/AbC_1-2/gviz/tq?tqx=out:csv&gid=77', kind: 'sheet' });
    assert.equal(O.toRemoteUrl('https://docs.google.com/spreadsheets/d/AbC/edit').url.endsWith('gid=0'), true);
    const pub = O.toRemoteUrl('https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pub?gid=0&single=true');
    assert.equal(pub.kind, 'pub');
    assert.ok(pub.url.endsWith('&output=csv'));
    assert.equal(O.toRemoteUrl('https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pub?output=csv').url.match(/output=/g).length, 1);
    assert.equal(O.toRemoteUrl('https://github.com/me/repo/blob/main/data/o.csv').url, 'https://raw.githubusercontent.com/me/repo/main/data/o.csv');
    assert.equal(O.toRemoteUrl('https://docs.google.com/document/d/AAA/edit').kind, 'gdoc');
    assert.equal(O.toRemoteUrl('https://drive.google.com/file/d/AAA/view').kind, 'gdrive');
    assert.deepEqual(O.toRemoteUrl('javascript:alert(1)'), { url: '', kind: 'none' });
    assert.deepEqual(O.toRemoteUrl(''), { url: '', kind: 'none' });
  });

  await test('규칙 읽기: 항목별 값 검사와 오류 줄 번호', () => {
    const p = O.parseOverrides(O.parseCSV([
      '대상,항목,값,메모',
      '# 주석 줄,마감,2026-11-20,',
      '계절학기,마감,2026.11.5 17:00,연장',
      '계절학기,마감,내일,',
      'abc,포인트,30P,',
      'abc,금액,50만원,',
      'abc,금액,많이,',
      'abc,숨김,,',
      'abc2,숨김,아니오,',
      'abc3,항목없음,x,',
      ',알림,"서버 점검, 오늘 밤",',
      'abc4,메모,,'
    ].join('\n')));
    assert.deepEqual(p.rules.map((r) => [r.field, r.value]),
      [['deadline', '2026-11-05T17:00'], ['points', 30], ['won', 500000], ['hide', true]]);
    assert.equal(p.banner, '서버 점검, 오늘 밤');
    assert.deepEqual(p.errors.map((e) => e.line), [4, 7, 10, 12]);
    assert.equal(O.parseOverrides([['x', '마감', '2026-02-30']]).errors.length, 1, '없는 날짜(2월 30일)는 거부');
  });

  await test('덮어쓰기: id 우선, 없으면 제목 일부, 원본은 그대로', () => {
    const list = ns();
    const p = O.parseOverrides([['계절학기', '마감', '2026-11-27'], ['2-26-101', '메모', '현장 접수만 가능'], ['2-26-102', '중요', '예']]);
    const r = O.applyOverrides(list, p);
    assert.equal(r.applied, 3);
    assert.equal(r.notices[0].deadline, '2026-11-27');
    assert.equal(list[0].deadline, '2026-11-20', '원본은 바뀌지 않음');
    assert.equal(r.notices[1].opNote, '현장 접수만 가능');
    assert.equal(r.notices[2].pinned, true);
    assert.deepEqual(r.notices[0].overrides, ['deadline']);
    assert.equal(r.notices[1].benefit.points, 10, '메모만 바꾸면 혜택은 그대로');
  });

  await test('덮어쓰기: 숨김, 못 찾은 대상 알려 줌, 짧은 제목 조각은 안 맞춤', () => {
    const p = O.parseOverrides([['공모전 안내', '숨김', ''], ['없는 공지 제목입니다', '마감', '2026-12-01'], ['공모', '숨김', '']]);
    const r = O.applyOverrides(ns(), p);
    assert.equal(r.hidden, 1);
    assert.equal(r.notices.length, 2);
    assert.deepEqual(r.unmatched, ['없는 공지 제목입니다', '공모']);
  });

  await test('덮어쓰기: 혜택 숫자를 고치면 분류와 점수에 바로 반영', () => {
    const p = O.parseOverrides([['2-26-100', '금액', '50만'], ['2-26-100', '혜택', '장학금 50만 원']]);
    const n = O.applyOverrides(ns(), p).notices[0];
    assert.equal(n.benefit.won, 500000);
    assert.equal(n.benefit.text.ko, '장학금 50만 원');
    assert.equal(L.benefitScore(n), 50);
    const q = O.applyOverrides(ns(), O.parseOverrides([['2-26-102', '포인트', '20']])).notices[2];
    assert.equal(q.benefit.points, 20);
    assert.equal(q.benefit.text.ko, '다드림 20P', '혜택 글이 없던 공지는 숫자로 글을 만들어 줌');
    assert.ok(L.classifyBenefit(q).subs.includes('dadream'));
  });

  await test('규칙이 없으면 같은 목록을 그대로 돌려줌', () => {
    const list = ns();
    assert.equal(O.applyOverrides(list, O.parseOverrides([])).notices, list);
  });

  await test('받아 오기: CSV·JSON 성공, 로그인 화면(HTML)·404·네트워크 오류·브라우저 못 읽는 주소는 실패로', async () => {
    const mk = (body, ok = true, status = 200) => async () => ({ ok, status, text: async () => body });
    const sheet = 'https://docs.google.com/spreadsheets/d/AbC/edit';
    let r = await O.fetchRows(sheet, { fetchImpl: mk('대상,항목,값\nx,마감,2026-11-20\n') });
    assert.equal(r.ok, true);
    assert.equal(r.rows.length, 2);
    r = await O.fetchRows(sheet, { fetchImpl: mk('{"rows":[["a","숨김",""]]}') });
    assert.deepEqual(r.rows, [['a', '숨김', '']]);
    assert.equal((await O.fetchRows(sheet, { fetchImpl: mk('<!doctype html><html>로그인</html>') })).error, 'not-csv');
    assert.equal((await O.fetchRows(sheet, { fetchImpl: mk('', false, 404) })).error, 'http-404');
    assert.equal((await O.fetchRows(sheet, { fetchImpl: async () => { throw new Error('offline'); } })).ok, false);
    assert.equal((await O.fetchRows('https://docs.google.com/document/d/AAA/edit', { fetchImpl: mk('x') })).error, 'browser-unsupported');
    assert.equal((await O.fetchRows('', { fetchImpl: mk('x') })).error, 'no-url');
  });

  console.log(`\n${passed}개 통과`);
})();
