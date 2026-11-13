// 실행: node tests/logic.test.js
// 핵심 로직이 기획서에 적은 대로 동작하는지 확인하는 테스트
const assert = require('node:assert/strict');
const L = require('../js/logic.js');
// 시험은 항상 고정된 샘플 데이터로 (data/notices.js 는 파이프라인이 실제 공지로 바꿈)
const DATA = require('../data/notices.sample.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const byId = (id) => DATA.notices.find((n) => n.id === id);
const at = (s) => L.parseLocal(s);

console.log('날짜·시간');
test('요일 계산: 2026-11-18은 수요일(3)', () => assert.equal(L.weekdayOf('2026-11-18'), 3));
test('남은 날짜: 11/12 → 11/20 마감은 8일', () => assert.equal(L.daysLeft('2026-11-20T17:00', at('2026-11-12T09:00')), 8));
test('마감 당일은 0일', () => assert.equal(L.daysLeft('2026-11-13T17:00', at('2026-11-13T09:00')), 0));
test('마감 경계: 16:59에는 진행 중, 17:01에는 마감', () => {
  assert.equal(L.isExpired(byId('sample-02'), at('2026-11-13T16:59')), false);
  assert.equal(L.isExpired(byId('sample-02'), at('2026-11-13T17:01')), true);
});
test('마감일 없는 이미지 공지는 마감으로 보지 않음', () => assert.equal(L.isExpired(byId('sample-12'), at('2026-11-30T00:00')), false));

console.log('시간표 충돌');
test('겹침 경계: 수업 종료 = 행사 시작이면 겹치지 않음', () => assert.equal(L.overlaps(600, 660, 660, 720), false));
test('1분이라도 겹치면 겹침', () => assert.equal(L.overlaps(600, 661, 660, 720), true));
test('수요일 13:00~14:15 수업은 수요일 13~15시 행사와 겹침', () => {
  const tt = [{ day: 3, start: '13:00', end: '14:15', name: '컴퓨터공학개론' }];
  assert.equal(L.findConflicts(byId('sample-05'), tt).length, 1);
});
test('수요일 15:00 시작 수업은 15시에 끝나는 행사와 안 겹침', () => {
  const tt = [{ day: 3, start: '15:00', end: '16:15', name: '자료구조' }];
  assert.equal(L.findConflicts(byId('sample-05'), tt).length, 0);
});
test('요일이 다르면 안 겹침', () => {
  const tt = [{ day: 2, start: '13:00', end: '15:00', name: '화요일 수업' }];
  assert.equal(L.findConflicts(byId('sample-05'), tt).length, 0);
});
test('시작이 끝보다 늦은 시간표 줄은 무시', () => {
  const tt = [{ day: 3, start: '15:00', end: '13:00', name: '잘못 입력' }];
  assert.equal(L.findConflicts(byId('sample-05'), tt).length, 0);
});

console.log('검색·필터·정렬·분류');
const now12 = at('2026-11-12T09:00');
test('한국어 검색: "장학"', () => {
  const ids = L.filterNotices(DATA.notices, { query: '장학', status: 'all' }, now12).map((n) => n.id);
  assert.deepEqual(ids.sort(), ['sample-03', 'sample-04']);
});
test('영어 검색도 번역 제목에서 찾음: "scholarship"', () => {
  const ids = L.filterNotices(DATA.notices, { query: 'scholarship', status: 'all' }, now12).map((n) => n.id);
  assert.ok(ids.includes('sample-03'));
});
test('띄어쓰기 무시: "계절 학기" → 계절학기 공지', () => {
  const ids = L.filterNotices(DATA.notices, { query: '계절 학기', status: 'all' }, now12).map((n) => n.id);
  assert.deepEqual(ids, ['sample-01']);
});
test('진행 중만 보기에서는 마감된 근로장학 공지가 빠짐', () => {
  const ids = L.filterNotices(DATA.notices, { status: 'open' }, now12).map((n) => n.id);
  assert.ok(!ids.includes('sample-04'));
});
test('7일 안에 마감만 보기', () => {
  const ids = L.filterNotices(DATA.notices, { status: 'week' }, now12).map((n) => n.id);
  assert.deepEqual(ids.sort(), ['sample-02', 'sample-05', 'sample-06', 'sample-08', 'sample-13']);
});
test('분류 필터: 다드림 포인트', () => {
  const ids = L.filterNotices(DATA.notices, { category: 'dadream', status: 'all' }, now12).map((n) => n.id);
  assert.deepEqual(ids.sort(), ['sample-05', 'sample-06', 'sample-07', 'sample-08']);
});
test('마감 임박순: 진행 중 첫 공지는 11/13 마감, 마감 지난 공지는 맨 뒤', () => {
  const sorted = L.sortNotices(DATA.notices, 'deadline', now12);
  assert.equal(sorted[0].id, 'sample-02');
  assert.equal(sorted[sorted.length - 1].id, 'sample-04');
});
test('조회수순', () => {
  const sorted = L.sortNotices(DATA.notices, 'hits', now12);
  assert.equal(sorted[0].id, 'sample-09');
});
test('분류별 개수', () => {
  const c = L.countByCategory(DATA.notices);
  assert.equal(c.dadream, 4);
  assert.equal(c.academic, 2);
});

console.log('시간 예산 추천 (동적 계획법)');
test('혜택 점수: 50만 원 = 50점, 포인트 20점 = 20점, 상금·숫자 없음 = 제외', () => {
  assert.equal(L.benefitScore(byId('sample-03')), 50);
  assert.equal(L.benefitScore(byId('sample-05')), 20);
  assert.equal(L.benefitScore(byId('sample-11')), null);
  assert.equal(L.benefitScore(byId('sample-09')), null);
});
test('작은 예: 4시간 안에서 최대 점수 80', () => {
  const items = [
    { id: 'A', hours: 1, score: 50 }, { id: 'B', hours: 2, score: 20 },
    { id: 'C', hours: 1, score: 10 }, { id: 'D', hours: 1.5, score: 15 }
  ];
  const r = L.knapsack(items, 4);
  assert.equal(r.totalScore, 80);
  assert.ok(r.totalHours <= 4);
});
test('무작위 300번: 동적 계획법 결과 = 모든 조합을 다 해본 결과', () => {
  let seed = 42;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let t = 0; t < 300; t++) {
    const n = 1 + Math.floor(rand() * 8);
    const items = Array.from({ length: n }, (_, i) => ({ id: i, hours: (1 + Math.floor(rand() * 8)) / 2, score: Math.floor(rand() * 50) }));
    const budget = Math.floor(rand() * 12) / 2;
    let best = 0;
    for (let mask = 0; mask < (1 << n); mask++) {
      let h = 0, s = 0;
      for (let i = 0; i < n; i++) if (mask & (1 << i)) { h += items[i].hours; s += items[i].score; }
      if (h <= budget + 1e-9 && s > best) best = s;
    }
    const r = L.knapsack(items, budget);
    assert.equal(r.totalScore, best, `case ${t}`);
    assert.ok(r.totalHours <= budget + 1e-9, `case ${t} hours`);
    assert.equal(r.chosen.reduce((s, it) => s + it.score, 0), r.totalScore, `case ${t} chosen`);
  }
});
test('샘플 데이터, 11/16 기준 7일·4시간: 점수 80 (장학 50 + 포인트 30)', () => {
  const r = L.recommend(DATA.notices, 4, { now: at('2026-11-16T09:00'), windowDays: 7 });
  assert.equal(r.totalScore, 80);
  assert.ok(r.chosen.some((it) => it.id === 'sample-03'));
});
test('수요일 13시 수업이 있으면 겹치는 자기소개서 클리닉은 추천에서 빠짐', () => {
  const tt = [{ day: 3, start: '13:00', end: '14:15', name: '수업' }];
  const r = L.recommend(DATA.notices, 4, { now: at('2026-11-16T09:00'), windowDays: 7, timetable: tt });
  assert.ok(!r.chosen.some((it) => it.id === 'sample-05'));
  assert.equal(r.totalScore, 80);
});
test('기간 밖(7일 넘게 남은) 행사는 후보가 아님', () => {
  const r = L.recommend(DATA.notices, 10, { now: at('2026-11-12T09:00'), windowDays: 7 });
  assert.ok(!r.chosen.some((it) => it.id === 'sample-07')); // 11/23 행사
});

console.log('시간 예산 추천: 실제 공지 모양');
test('소요 시간이 없으면 종류로 추정 (설문 30분, 공모전 6시간, 그 밖 신청 1시간)', () => {
  assert.deepEqual(L.estimateHours({ title: '재학생 만족도 조사' }), { hours: 0.5, estimated: true });
  assert.deepEqual(L.estimateHours({ title: '아이디어 공모전' }), { hours: 6, estimated: true });
  assert.deepEqual(L.estimateHours({ title: '장학생 선발 안내' }), { hours: 1, estimated: true });
  assert.deepEqual(L.estimateHours({ title: '특강', hours: 2.5 }), { hours: 2.5, estimated: false });
});
test('신청만 하는 공지는 마감이 7일 뒤여도 후보, 시급 알바·같은 공지 다시 올린 것·기간 밖 행사는 뺌', () => {
  const now = at('2026-11-13T09:00');
  const pts = (n) => ({ text: { ko: `다드림 ${n}포인트` }, points: n, won: null });
  const ns = [
    { id: 'a', title: '만족도 조사 실시 안내', date: '2026-11-01', deadline: '2026-12-06T23:59', events: [], benefit: pts(30) },
    { id: 'b', title: '<만족도 조사 실시>', date: '2026-11-02', deadline: '2026-12-06T23:59', events: [], benefit: pts(30) },
    { id: 'c', title: '홀서빙 구합니다', date: '2026-11-10', deadline: null, events: [], benefit: { text: { ko: '시급 12,000원' }, points: null, won: 12000 } },
    { id: 'd', title: '특강', date: '2026-11-10', deadline: null, events: [{ date: '2026-12-20', start: '13:00', end: '15:00' }], benefit: pts(20) }
  ];
  const r = L.recommend(ns, 4, { now, windowDays: 7 });
  assert.deepEqual(r.chosen.map((x) => x.id), ['a']);
  assert.equal(r.skipped.job, 1);
  assert.equal(r.skipped.outOfWindow, 1);
});

console.log('추천: 선발형 혜택(상금·선발 장학) 반영');
{
  const now = at('2026-11-16T09:00');
  const mk = (id, title, benefit) => ({ id, title, date: '2026-11-10', deadline: '2026-11-20T17:00', events: [], benefit });
  const ben = (extra) => Object.assign({ text: { ko: '' }, points: null, won: null, prize: null }, extra);
  test('상금은 10%, 선발·심사로 주는 금액은 30%, 확정 금액은 100%로 센다', () => {
    assert.equal(L.expectedScore(mk('a', '글쓰기 공모전', ben({ prize: 1000000 })), true).score, 10);
    assert.equal(L.expectedScore(mk('b', '우수 장학생 선발', ben({ won: 1000000 })), true).score, 30);
    assert.equal(L.expectedScore(mk('c', '생활비 지원', ben({ won: 1000000 })), true).score, 100);
    assert.equal(L.expectedScore(mk('d', '특강', ben({ points: 30 })), true).score, 30);
    assert.equal(L.expectedScore(mk('e', '공모전', ben({ prize: 500000, points: 5 })), true).score, 10);
  });
  test('선발형 표시: 상금·선발 말이 있는 금액만 true', () => {
    assert.equal(L.expectedScore(mk('a', '공모전', ben({ prize: 100000 })), true).selective, true);
    assert.equal(L.expectedScore(mk('b', '장학생 선발', ben({ won: 100000 })), true).selective, true);
    assert.equal(L.expectedScore(mk('c', '비용 지원', ben({ won: 100000 })), true).selective, false);
    assert.equal(L.expectedScore(mk('d', '특강', ben({ points: 5 })), true).selective, false);
  });
  test('끄면 예전 점수와 같다 (상금은 점수 없음)', () => {
    const n = mk('a', '글쓰기 공모전', ben({ prize: 1000000 }));
    assert.equal(L.expectedScore(n, false).score, null);
    assert.equal(L.expectedScore(mk('b', '우수 장학생 선발', ben({ won: 1000000 })), false).score, 100);
    assert.equal(L.expectedScore({ benefit: null }, true).score, null);
  });
  test('추천: 상금뿐인 공지는 기본에서는 빠지고, 포함하면 후보가 되어 selective 표시', () => {
    const ns = [mk('p', '글쓰기 공모전', ben({ prize: 1000000 })), mk('q', '특강 참가', ben({ points: 20 }))];
    const off = L.recommend(ns, 8, { now, windowDays: 7 });
    assert.deepEqual(off.chosen.map((x) => x.id), ['q']);
    const on = L.recommend(ns, 8, { now, windowDays: 7, includeSelective: true });
    assert.deepEqual(on.chosen.map((x) => x.id).sort(), ['p', 'q']);
    assert.equal(on.chosen.find((x) => x.id === 'p').selective, true);
    assert.equal(on.chosen.find((x) => x.id === 'q').selective, false);
    assert.equal(on.skipped.noScore, 0);
  });
}

console.log('혜택 분류 (큰 분류 → 세부 분류)');
{
  const mk = (title, o = {}) => Object.assign({ id: 'x', title, category: 'etc', summary: { ko: '' }, benefit: null }, o);
  const ben = (ko, extra) => Object.assign({ text: { ko }, points: null, won: null, prize: null }, extra || {});
  const cls = (n) => L.classifyBenefit(n);
  test('다드림 포인트 + 기념품: 한 공지가 세부 분류 여러 개에 든다', () => {
    const c = cls(mk('특강', { benefit: ben('다드림 30P, 기념품 증정', { points: 30 }) }));
    assert.deepEqual(c.subs.filter((s) => ['dadream', 'gift'].includes(s)), ['dadream', 'gift']);
    assert.deepEqual(c.groups.slice(0, 2), ['points', 'goods']);
    assert.equal(c.group, 'points');
  });
  test('장학금·지원금·상금·급여를 따로 나눈다', () => {
    assert.ok(cls(mk('장학생 선발', { benefit: ben('장학금 500,000원', { won: 500000 }) })).subs.includes('scholarship'));
    assert.ok(cls(mk('연수 안내', { benefit: ben('교통비 지원금 10만원', { won: 100000 }) })).subs.includes('support'));
    assert.ok(cls(mk('영상 공모전', { benefit: ben('대상 상금 100만원', { prize: 1000000 }) })).subs.includes('prize'));
    assert.ok(cls(mk('근로 신청', { benefit: ben('시간당 12,790원', { won: 12790 }) })).subs.includes('pay'));
  });
  test('금액만 있고 종류를 모르면: 쿠폰 말이 있으면 물품, 장학 공지면 장학금, 아니면 지원금', () => {
    assert.ok(cls(mk('설문', { benefit: ben('커피쿠폰 5,000원', { won: 5000 }) })).subs.includes('coupon'));
    assert.ok(cls(mk('신청', { category: 'scholarship', benefit: ben('1인당 30만 원', { won: 300000 }) })).subs.includes('scholarship'));
    assert.ok(cls(mk('신청', { benefit: ben('1인당 30만 원', { won: 300000 }) })).subs.includes('support'));
  });
  test('혜택이 없어도 얻는 경험이 있으면 경험·스펙 (교육, 인턴·취업, 봉사·대외활동)', () => {
    assert.equal(cls(mk('KU STAR 학습클리닉 신청')).group, 'growth');
    assert.ok(cls(mk('KU STAR 학습클리닉 신청')).subs.includes('edu'));
    assert.ok(cls(mk('현장실습 학생 모집')).subs.includes('career'));
    assert.ok(cls(mk('해외봉사단 서포터즈 모집')).subs.includes('activity'));
  });
  test('안내(혜택 없음)는 종류로 나눈다: 설문, 채용정보, 행사, 학사·행정, 공모전', () => {
    assert.equal(cls(mk('재학생 만족도 조사 실시')).primary, 'survey');
    assert.equal(cls(mk('[채용정보] 11월 2주차 채용정보', { summary: { ko: '급여 협의' } })).primary, 'jobinfo');
    assert.equal(cls(mk('AI 시대의 대학행정 포럼 개최')).primary, 'event');
    assert.equal(cls(mk('동계 계절학기 수강신청 안내', { category: 'academic' })).primary, 'admin');
    assert.equal(cls(mk('K-MOOC 홍보 아이디어 공모전')).primary, 'contest');
  });
  test('결과 발표 공지는 혜택이 적혀 있어도 안내(결과·발표)로만 분류', () => {
    const c = cls(mk('수기 공모전 수상자 안내', { benefit: ben('상금 100만원', { prize: 1000000 }) }));
    assert.deepEqual(c.subs, ['result']);
    assert.equal(c.group, 'info');
  });
  test('"혜택은 없습니다"라고 쓴 요약의 낱말은 혜택으로 읽지 않는다', () => {
    assert.deepEqual(cls(mk('안전 포스터 배포', { summary: { ko: '혜택은 없습니다. 쿠폰 문의는 센터로.' } })).subs.filter((s) => s === 'coupon'), []);
  });
  test('본문을 못 읽은 이미지 공지는 확인 필요', () => {
    assert.equal(cls(mk('안내', { bodyStatus: 'image' })).primary, 'unknown');
  });
  test('큰 분류·세부 분류로 거르고 개수를 센다', () => {
    const ns = [
      mk('장학생 선발', { id: '1', benefit: ben('장학금 50만 원', { won: 500000 }) }),
      mk('상담 특강', { id: '2' }),
      mk('수강신청 안내', { id: '3', category: 'academic' })
    ];
    assert.equal(L.filterNotices(ns, { group: 'money', status: 'all' }).length, 1);
    assert.equal(L.filterNotices(ns, { sub: 'edu', status: 'all' }).length, 1);
    assert.equal(L.countByGroup(ns).info, 1);
    assert.equal(L.countBySub(ns).admin, 1);
    assert.deepEqual(L.groupByBenefit(ns).map((g) => g.group), ['money', 'growth', 'info']);
  });
  test('실제 모양 데이터: 모든 공지가 세부 분류를 하나 이상 가진다', () => {
    for (const n of DATA.notices) assert.ok(cls(n).subs.length >= 1, n.title);
  });
}

console.log('안전장치: 근거 문장 확인');
test('줄바꿈·띄어쓰기가 달라도 원문에 있으면 통과', () => {
  const body = '신청 기간: 2026. 11. 11.(수) ~\n 11. 20.(금) 17:00\n장학 금액: 1인당 500,000원';
  assert.equal(L.verifyEvidence(body, '장학 금액: 1인당 500,000원'), true);
  assert.equal(L.verifyEvidence(body, '신청 기간: 2026. 11. 11.(수) ~ 11. 20.(금) 17:00'), true);
});
test('원문에 없는 문장(AI가 지어낸 문장)은 탈락', () => {
  assert.equal(L.verifyEvidence('장학 금액: 1인당 500,000원', '장학 금액: 1인당 700,000원'), false);
});

console.log(`\n${passed}개 통과${process.exitCode ? ' (실패 있음)' : ''}`);
