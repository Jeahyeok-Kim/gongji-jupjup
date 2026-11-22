// 실행: node tests/eligibility.test.js
// 지원 자격 판정(js/eligibility.js): 실제 공지의 '지원 대상' 글로 확인
const assert = require('node:assert/strict');
const E = require('../js/eligibility.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const me = { set: true, level: 'undergrad', grade: 3, status: 'enrolled', intl: false, dept: '컴퓨터공학과' };
const j = (elig, profile, title) => E.judge({ title: title || '안내', eligibility: elig == null ? null : { ko: elig } }, profile || me);
const st = (elig, profile, title) => (j(elig, profile, title) || { status: null }).status;
const codes = (elig, profile) => j(elig, profile).reasons.map((r) => r.code);

test('내 정보가 없거나 대상 글이 없으면 판단하지 않음', () => {
  assert.equal(E.judge({ eligibility: { ko: '재학생' } }, null), null);
  assert.equal(E.judge({ eligibility: { ko: '재학생' } }, { set: false }), null);
  assert.equal(st(null), null);
});
test('교직원·교수 대상은 학생에게 대상 아님', () => {
  assert.equal(st('2학기 수업하는 전임 및 비전임교수'), 'no');
  assert.equal(st('전 교직원'), 'no');
  assert.equal(st('강사'), 'no');
  assert.deepEqual(codes('교원 및 관련자'), ['staff']);
  assert.equal(st('', me, '강의 나눔 포럼 신청 안내(교수 대상)'), 'no', '제목에 교수 대상');
  assert.equal(st('충북 소재 대학 재학생, 기업·공공기관 재직자'), 'check', '학생도 들어 있으면 대상 (지역 조건만 확인)');
});
test('대학원생만 · 졸업생만', () => {
  assert.equal(st('석.박사 학위과정, 박사 후 과정, 연구과정'), 'no');
  assert.equal(st('음악을 사랑하는 전국 대학 및 대학원 재학생(개인 또는 팀)'), 'yes');
  assert.equal(st('2027학년도 학교현장실습 신청 예정자(일반교직과정 이수자, 교육대학원생)'), 'yes', '학부 이수자도 대상');
  assert.equal(st('컴퓨터공학과 졸업생'), 'no');
  assert.equal(st('4년제 대학 졸업(예정)자(전공무관)'), 'no', '3학년은 졸업예정 아님');
  assert.equal(st('4년제 대학 졸업(예정)자(전공무관)', { ...me, grade: 4 }), 'yes', '4학년은 졸업예정');
  assert.equal(st('석.박사 학위과정', { ...me, level: 'grad' }), 'yes');
});
test('학년 조건', () => {
  assert.deepEqual(E.gradeRange('우리 대학 3학년 이상 재학생(5학기 이상)'), { min: 3, max: 4 });
  assert.deepEqual(E.gradeRange('1~2학년 재학생'), { min: 1, max: 2 });
  assert.deepEqual(E.gradeRange('3, 4학년 학생').list, [3, 4]);
  assert.deepEqual(E.gradeRange('수강생(1학년)'), { min: 1, max: 1 });
  assert.deepEqual(E.gradeRange('본교 신입생'), { min: 1, max: 1 });
  assert.deepEqual(E.gradeRange('8학기 이상 등록 재학생'), { min: 4, max: 4 });
  assert.equal(E.gradeRange('초등학교 5학년 ~ 대학생'), null, '초등학교 학년은 무시');
  assert.equal(E.gradeRange('2027년도 3학년 1학기에 등록예정인 학생'), null, '등록예정 학년은 지금 학년과 다름');
  assert.equal(st('본교 신입생'), 'no');
  assert.equal(st('본교 신입생', { ...me, grade: 1 }), 'yes');
  assert.deepEqual(j('우리 대학 3학년 이상 재학생(5학기 이상)', { ...me, grade: 2 }).reasons[0], { code: 'grade', min: 3, max: 4 });
});
test('유학생·국적', () => {
  assert.equal(st('성실한 외국인 학생'), 'no');
  assert.equal(st('성실한 외국인 학생', { ...me, intl: true }), 'yes');
  assert.equal(st('통역 가능자, 통번역대학원 재학생 또는 졸업생 / 외국 대학교 졸업생 및 유학생'), 'yes', '다른 대상도 있으면 유학생 전용 아님');
  assert.equal(st('대한민국 국적을 가진 충북 소재 대학(원)생', { ...me, intl: true }), 'no');
  assert.equal(st('대한민국 국민 누구나(개인)', { ...me, intl: true }), 'check', '국민: 유학생은 확인 필요');
  assert.equal(st('대한민국 국민 누구나(개인)'), 'yes');
});
test('휴학생', () => {
  const leave = { ...me, status: 'leave' };
  assert.equal(st('충북 도내 대학 재학생 (휴학생, 졸업생 지원 불가)', leave), 'no');
  assert.equal(st('재학생(휴학생, 대학원생, 초과학기자 제외), 직전학기 백분위 성적 80점 이상', leave), 'no');
  assert.equal(st('문화예술 분야를 사랑하는 대학생(재학생, 휴학생 모두 가능)', leave), 'yes');
  assert.deepEqual(codes('건국대학교 글로컬캠퍼스 재학생', leave), ['enrolledOnly']);
  assert.equal(st('건국대학교 글로컬캠퍼스 재학생'), 'yes');
});
test('학과 · 캠퍼스 · 성적·소득 · 지역 · 나이', () => {
  assert.equal(st('융합학부 학생'), 'no');
  assert.deepEqual(codes('융합학부 학생', { ...me, dept: '' }), ['dept']);
  assert.equal(st('컴퓨터공학과 재학생'), 'yes');
  assert.equal(st('4년제 대학 졸업(예정)자(전공무관)', { ...me, grade: 4, dept: '경영학과' }), 'yes', '전공무관은 학과 조건 아님');
  assert.equal(st('서울캠퍼스 재학생'), 'no');
  assert.equal(st('글로컬캠퍼스 및 서울캠퍼스 학부 재학생'), 'yes');
  assert.deepEqual(codes('다자녀(3자녀 이상) 중 본인이 셋째 이상 재학생, 평점평균 2.5 이상'), ['extra']);
  assert.deepEqual(codes('강화군 출신 대학생(소득분위 1~8구간)'), ['extra', 'region']);
  assert.deepEqual(codes('만 13세~24세 청소년'), ['age']);
});
test('누구나 · 개인 또는 팀 · 학우는 대상', () => {
  for (const s of ['대학생, 일반 대중', '건국대학교 글로컬캠퍼스 청춘 누구나!', '개인 또는 팀(4인 이하)', '건국대학교 학우', '전국 대학(원)생으로 구성된 팀 (4~5인)', '코딩 몰라도 AI로 자동매매 만들고 싶은 사람']) {
    assert.equal(st(s), 'yes', s);
  }
  assert.deepEqual(codes('남자 00명'), ['unclear']);
});

console.log(`\n${passed}개 통과`);
