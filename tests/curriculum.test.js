// 학과 교육과정·교양 목록 도우미 시험 (node --test tests/curriculum.test.js)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const C = require('../js/curriculum.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'data', 'courses.js'), 'utf8');
const box = {};
new Function('window', src)(box);
const D = box.GONGJI_COURSES;

test('학과와 교양이 들어 있다', () => {
  const names = C.colleges(D).flatMap((c) => c.depts);
  assert.ok(names.length >= 30);
  assert.ok(names.includes('컴퓨터공학과'));
  assert.strictEqual(D.general.length, 258);
});

test('컴퓨터공학과는 학년별로 나뉘고 1학년에 컴퓨터공학개론이 있다', () => {
  const g = C.byGrade('컴퓨터공학과', D);
  assert.ok(g[1].some((c) => c.name === '컴퓨터공학개론'));
  assert.ok(g[2].some((c) => c.name === '자료구조' && c.kind === '전필'));
  assert.ok(g[3].some((c) => c.name === '운영체제'));
  assert.ok(g[4].some((c) => c.name === '딥러닝'));
});

test('학년 뽑기', () => {
  assert.strictEqual(C.gradeOf('2-1,2'), 2);
  assert.strictEqual(C.gradeOf('3-1'), 3);
  assert.strictEqual(C.gradeOf('전체-1'), 0);
  assert.strictEqual(C.gradeOf(''), 0);
});

test('자동완성은 내 학과 과목이 먼저이고 이름이 겹치지 않는다', () => {
  const s = C.suggestions('컴퓨터공학과', D);
  assert.strictEqual(s[0].name, '자료구조');
  assert.strictEqual(new Set(s.map((x) => x.name)).size, s.length);
  assert.ok(s.some((x) => x.name === '글쓰기1'));
});

test('학과를 안 골라도 모든 학과 전공 과목이 자동완성에 들어간다', () => {
  const s = C.suggestions('', D);
  assert.ok(s.some((x) => x.name === '자료구조'));
  assert.ok(s.length > C.general(D).length);
});

test('없는 학과나 데이터가 없어도 죽지 않는다', () => {
  assert.deepStrictEqual(C.byGrade('없는학과', D)[1], []);
  assert.deepStrictEqual(C.suggestions('', { colleges: [], general: [] }), []);
  assert.strictEqual(C.findDept('없는학과', D), null);
});
