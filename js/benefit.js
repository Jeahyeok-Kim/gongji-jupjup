// 공지 줍줍: 받는 것(혜택) 분류 (화면과 상관없는 순수 함수)
// - 브라우저(index.html)와 Node 테스트(tests/logic.test.js)에서 똑같이 씁니다.
// - 수업에서 배운 개념: 문자열 처리(정규식), 조건 판단, 집합(Set), 분류와 집계
(function (root) {
  'use strict';

  // 받는 것(혜택) 분류: 큰 분류 → 세부 분류의 2단계. 한 공지가 여러 세부 분류에 들 수 있다 (예: 장학금 + 다드림 포인트).
  // 숫자 칸(points·won·prize)과 혜택 글·요약·제목의 낱말로 정한다. AI를 다시 부르지 않고 화면에서 바로 계산한다.
  //  - 보상(금전·포인트·물품)이 있으면 그것을, 없으면 얻는 경험(교육·인턴·봉사)을, 그것도 없으면 안내 종류를 붙인다.
  //  - '결과 발표' 공지는 신청해서 받는 혜택이 아니므로 안내(결과·발표)로만 분류한다.
  const BENEFIT_TREE = [
    { id: 'money', subs: ['scholarship', 'support', 'prize', 'pay'] },
    { id: 'points', subs: ['dadream', 'credit'] },
    { id: 'goods', subs: ['coupon', 'gift'] },
    { id: 'growth', subs: ['edu', 'career', 'activity'] },
    { id: 'info', subs: ['contest', 'event', 'admin', 'survey', 'jobinfo', 'result', 'etc'] },
    { id: 'unknown', subs: ['unknown'] }
  ];
  const BENEFIT_GROUPS = BENEFIT_TREE.map((g) => g.id);
  const BENEFIT_SUBS = [].concat(...BENEFIT_TREE.map((g) => g.subs));
  const GROUP_OF_SUB = {};
  for (const g of BENEFIT_TREE) for (const s of g.subs) GROUP_OF_SUB[s] = g.id;

  const SUB_WORDS = {
    dadream: /다드림|비교과\s*포인트|\d+\s*(?:dp|DP)\b/,
    credit: /이수증|수료증|공결|봉사\s*시간|마일리지|인증서|학점\s*(?:을\s*)?인정|인정\s*학점/,
    scholarship: /장학/,
    support: /지원금|학자금|등록금|제작비|교통비|여비|체재비|숙박비|참가비\s*(?:전액\s*)?(?:면제|지원)|비용\s*지원|항공권|연수비|지원비|실비|장려금|할인|응시료\s*지원/,
    prize: /상금|시상|상장|상패|입상|최우수상|우수상|장려상|[가-힣]{1,4}장관상|도지사상|원장상|센터장상|총장상/,
    pay: /시급|시간당|급여|일당|월급|활동비|수당|근로\s*(?:시간|활동|장학|지)|캐시아웃/,
    coupon: /쿠폰|상품권|기프티콘|문화상품|모바일\s*상품/,
    gift: /기념품|굿즈|다과|간식|경품|증정|선물|상품(?!권)/
  };
  const GROWTH_WORDS = {
    edu: /특강|강연|강좌|워크숍|워크샵|세미나|클리닉|컨설팅|코칭|캠프|연수|아카데미|수강생|스터디|튜터|연구회|부트캠프|체험|탐방|설명회|멘토링|프로그램|교육(?!혁신|과정|실습|부|청|원|센터|서비스|대학)/,
    career: /인턴|현장실습|채용\s*연계|취업|창업|진로|면접|자격증|일자리|잡\s*페어|직무/,
    activity: /대표단|서포터즈|기자단|홍보단|위원|활동가|봉사|자원\s*활동|앰배서더|대외활동|동아리|참여단|평가단|청년단/
  };
  const INFO_WORDS = {
    survey: /설문|조사|만족도|진단|실태|강의평가|평가\s*실시|의견\s*수렴|검사/,
    jobinfo: /채용정보|구인|채용\s*(?:공고|안내)|모집\s*합니다|아르바이트|알바|재택근무|강사\s*모집|크루|채점|통역사/,
    contest: /공모전|공모제|경진대회|대회|해커톤|챌린지|콘테스트|어워즈|공모\b/,
    event: /포럼|박람회|전시|학술대회|컨퍼런스|엑스포|페스티벌|페스타|공연|관람|축제|행사|개최|웨비나|토크|북\s*!?\s*톡|발표회|오케스트라|세계총회|견학/,
    admin: /수강신청|졸업|학점|성적|중간고사|기말|휴학|복학|등록|예비군|인사발령|인증|검정|관생|시행|운영\s*(?:안내|절차|계획)|규정|계절학기|교직|교원|재검사|사정/
  };
  const RESULT_WORDS = /결과|수상자|합격자|명단|최종\s*선발|오리엔테이션\s*일정|발표(?!회)/;
  const NO_BENEFIT = /혜택[^.。]{0,14}(?:없|않|제공되지|따로)/;
  // 제목 앞의 [기관·말머리]만 뗀다 (길거나 「」가 든 대괄호는 제목 일부이므로 남김)
  const BRACKETS = /\[[^\]「」]{0,24}\]|［[^］「」]{0,24}］|【[^】「」]{0,24}】/g;
  const CLASS_CACHE = typeof WeakMap === 'function' ? new WeakMap() : null;

  function classifyBenefit(notice) {
    if (CLASS_CACHE && CLASS_CACHE.has(notice)) return CLASS_CACHE.get(notice);
    const b = notice.benefit || null;
    const ko = (o) => (o && (o.ko || Object.values(o)[0])) || '';
    const benefitText = b ? ko(b.text) : '';
    const summary = ko(notice.summary);
    const rawTitle = String(notice.title || '');
    const title = rawTitle.replace(BRACKETS, ' ');
    // "혜택은 없습니다"라고 쓴 공지는 요약 속 낱말을 혜택으로 읽지 않는다
    const rewardText = (NO_BENEFIT.test(summary) || NO_BENEFIT.test(benefitText)) ? '' : `${benefitText} ${summary}`;
    const growthText = `${title} ${benefitText}`;
    const isContest = INFO_WORDS.contest.test(title);
    const isSurvey = INFO_WORDS.survey.test(title);
    const isJobInfo = INFO_WORDS.jobinfo.test(rawTitle);
    // 채용정보 모음 글은 요약 속 '급여' 같은 낱말이 혜택이 아니므로 혜택 칸만 본다
    const rewards = isJobInfo ? benefitText : rewardText;
    const subs = new Set();

    if (!RESULT_WORDS.test(title)) {
      if ((b && b.points) || SUB_WORDS.dadream.test(rewards)) subs.add('dadream');
      if (SUB_WORDS.credit.test(rewards)) subs.add('credit');
      if (SUB_WORDS.scholarship.test(rewards)) subs.add('scholarship');
      if (SUB_WORDS.support.test(rewards)) subs.add('support');
      if ((b && b.prize) || SUB_WORDS.prize.test(rewards)) subs.add('prize');
      if (SUB_WORDS.pay.test(rewards)) subs.add('pay');
      if (b && b.won && !['scholarship', 'support', 'prize', 'pay'].some((s) => subs.has(s))) {
        // 금액은 있는데 종류를 모르면: 쿠폰 말이 있으면 물품, 장학 공지면 장학금, 아니면 지원금
        subs.add(SUB_WORDS.coupon.test(rewards) ? 'coupon' : notice.category === 'scholarship' ? 'scholarship' : 'support');
      }
      if (SUB_WORDS.coupon.test(rewards)) subs.add('coupon');
      if (SUB_WORDS.gift.test(rewards)) subs.add('gift');
      if (!isSurvey && !isJobInfo) {
        const text = isContest ? benefitText : growthText;     // 공모전 제목의 '교육·학습'은 경험이 아님
        for (const s of ['edu', 'career', 'activity']) if (GROWTH_WORDS[s].test(text)) subs.add(s);
      }
    }

    if (!subs.size && notice.bodyStatus === 'image' && !b) subs.add('unknown');
    if (!subs.size) {
      if (RESULT_WORDS.test(title)) subs.add('result');
      else if (isSurvey) subs.add('survey');
      else if (isJobInfo) subs.add('jobinfo');
      else if (isContest) subs.add('contest');
      else if (INFO_WORDS.event.test(title) || notice.category === 'event') subs.add('event');
      else if (INFO_WORDS.admin.test(title) || notice.category === 'academic' || notice.category === 'dorm') subs.add('admin');
      else subs.add('etc');
    }
    const ordered = BENEFIT_SUBS.filter((s) => subs.has(s));
    const groups = BENEFIT_GROUPS.filter((g) => ordered.some((s) => GROUP_OF_SUB[s] === g));
    const result = { subs: ordered, groups, primary: ordered[0], group: groups[0] };
    if (CLASS_CACHE) CLASS_CACHE.set(notice, result);
    return result;
  }

  // 시간 예산 추천이 쓰는 큰 덩어리(예전 분류). 세부 분류에서 계산한다.
  const BENEFIT_KINDS = ['points', 'scholarship', 'prize', 'pay', 'goods', 'career', 'info', 'unknown'];
  const KIND_OF_SUB = {
    dadream: 'points', scholarship: 'scholarship', support: 'scholarship', prize: 'prize', pay: 'pay',
    coupon: 'goods', gift: 'goods', credit: 'career', edu: 'career', career: 'career', activity: 'career', unknown: 'unknown'
  };
  function benefitKinds(notice) {
    const ks = new Set(classifyBenefit(notice).subs.map((s) => KIND_OF_SUB[s] || 'info'));
    return BENEFIT_KINDS.filter((k) => ks.has(k));
  }
  const primaryKind = (notice) => benefitKinds(notice)[0];

  function countBySub(list) {
    const counts = {};
    for (const n of list) for (const s of classifyBenefit(n).subs) counts[s] = (counts[s] || 0) + 1;
    return counts;
  }
  function countByGroup(list) {
    const counts = {};
    for (const n of list) for (const g of classifyBenefit(n).groups) counts[g] = (counts[g] || 0) + 1;
    return counts;
  }
  // 대표 세부 분류(첫 번째)의 큰 분류로 묶기. 큰 분류 순서(금전 → 포인트 → 물품 → 경험 → 안내)
  function groupByBenefit(list) {
    return BENEFIT_GROUPS
      .map((g) => ({ group: g, items: list.filter((n) => classifyBenefit(n).group === g) }))
      .filter((g) => g.items.length > 0);
  }

  const api = {
    BENEFIT_TREE, BENEFIT_GROUPS, BENEFIT_SUBS, GROUP_OF_SUB,
    classifyBenefit, countBySub, countByGroup, groupByBenefit,
    BENEFIT_KINDS, benefitKinds, primaryKind
  };
  root.GongjiBenefit = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
