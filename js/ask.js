// 공지에게 묻기: "이번 주 마감인 장학금", "포인트 많이 주는 것" 같은 질문을 조건으로 풀어 맞는 공지를 고른다.
// AI 없이 규칙으로 읽어 어디서나(웹에 올린 주소에서도) 동작하고, 내 컴퓨터 서버로 열었을 때는 고른 공지를 로컬 AI에게 보여 주고 답을 받는다(app.js).
(function (root) {
  'use strict';
  const L = root.GongjiLogic || (typeof require === 'function' ? require('./logic.js') : null);

  // 낱말 → 받는 것(세부 분류) / 큰 분류
  const TOPICS = [
    [/장학|scholarship|奖学|奨学/i, { subs: ['scholarship'] }],
    [/지원금|비용\s*지원|등록금|생활비|grant|补助|補助/i, { subs: ['support'] }],
    [/상금|시상|공모전|경진|대회|contest|prize|竞赛|コンテスト/i, { subs: ['prize', 'contest'] }],
    [/알바|급여|활동비|근로|일자리|아르바이트|part[-\s]?time|兼职|バイト/i, { subs: ['pay'] }],
    [/다드림|포인트|비교과|points?|积分|ポイント/i, { subs: ['dadream'] }],
    [/학점|이수|공결|credit|学分|単位/i, { subs: ['credit'] }],
    [/쿠폰|상품권|기프티|간식|기념품|경품|선물|gift|coupon|礼品|ギフト/i, { subs: ['coupon', 'gift'] }],
    [/특강|교육|강좌|워크숍|캠프|lecture|workshop|讲座|講座/i, { subs: ['edu'] }],
    [/인턴|취업|채용|진로|현장실습|intern|job|career|实习|就业|インターン|就職/i, { subs: ['career', 'jobinfo'] }],
    [/봉사|서포터즈|대외활동|기자단|volunteer|志愿|ボランティア/i, { subs: ['activity'] }],
    [/행사|축제|전시|포럼|박람회|콘서트|event|festival|活动|イベント/i, { subs: ['event'] }],
    [/설문|조사|survey|问卷|アンケート/i, { subs: ['survey'] }],
    [/돈|현금|금전|money|cash|钱|お金/i, { groups: ['money'] }]
  ];
  // 낱말로만 찾을 주제 (분류가 따로 없음)
  const WORD_TOPICS = [
    [/해외|교환|어학연수|유학(?!생)|overseas|abroad|exchange|海外|留学(?!生)/i, ['해외', '교환', '연수', '국제', '글로벌']],
    [/기숙사|생활관|dorm|宿舍|寮/i, ['기숙사', '생활관']],
    [/창업|start-?up|创业|起業/i, ['창업']],
    [/(?<![가-힣])AI|인공지능|코딩|프로그래밍|소프트웨어/i, ['AI', '인공지능', '코딩', 'SW', '소프트웨어', '데이터']]
  ];
  const DUE = [
    [/오늘|today|今天|今日/i, 0], [/내일|tomorrow|明天|明日/i, 1],
    [/이번\s*주|일주일|한\s*주|this\s*week|week|本周|这周|今週/i, 7],
    [/이번\s*달|한\s*달|this\s*month|month|本月|这个月|今月/i, 30],
    [/마감\s*임박|곧\s*마감|급한|soon|urgent|即将|もうすぐ/i, 3]
  ];
  const SORTS = [
    [/많이|큰|높은|많은|최대|가장|most|biggest|largest|最多|最大|多い/i, 'benefit'],
    [/쉬운|짧은|금방|간단|시간\s*적게|빨리|easy|quick|short|简单|簡単|短い/i, 'hours'],
    [/새로\s*올라온|최근|최신|새\s*공지|newest|latest|recent|最新|新着/i, 'latest']
  ];
  const STOP = new Set(('공지 알려줘 알려 줘 알려주세요 뭐 뭐가 뭐있어 있어 있나 있나요 있어요 있을까 찾아줘 찾아 보여줘 보여 중에 수 있는 받을 할 하는 것 거 것들 좀 '
    + '마감 마감인 마감되는 혜택 관련 대한 어떤 무슨 좋은 추천 추천해줘 해줘 해 나 내가 나에게 저 제가 나한테 신청 신청할 가능한 지원 지원할 받을수 '
    + '많이 주는 주 달 이번 오늘 내일 곧 임박 학생 대학생 대상 프로그램 정보 안내 모집 참가 참여 싶어 싶은 하고 하면 되는 됨 '
    + '맞는 맞게 어울리는 받을수있는 할수있는 괜찮은 '
    + 'what which show me find any the a an for to of in is are can i my due with this that please notices notice').split(/\s+/));
  const PARTICLE = /(은|는|이|가|을|를|의|에|에서|에게|으로|로|와|과|도|만|인|되는|하는|할|한|이랑|랑|까지|부터|중|들)$/;

  function stripWord(w) {
    let x = w.replace(/[?!.,~·"'()[\]]/g, '');
    for (let i = 0; i < 2 && x.length > 2 && PARTICLE.test(x); i++) x = x.replace(PARTICLE, '');
    return x;
  }

  // 질문 → 조건
  function parse(question) {
    const q = String(question || '').trim();
    const cond = { q, due: null, subs: [], groups: [], words: [], sort: null, intl: false, grade: null, mine: false, tokens: [] };
    if (!q) return cond;
    for (const [re, d] of DUE) if (re.test(q)) { cond.due = cond.due === null ? d : Math.min(cond.due, d); }
    const n = q.match(/(\d{1,2})\s*일\s*(안|이내|내|안에)/) || q.match(/within\s*(\d{1,2})\s*days?/i);
    if (n) cond.due = +n[1];
    for (const [re, t] of TOPICS) {
      if (!re.test(q)) continue;
      for (const s of t.subs || []) if (!cond.subs.includes(s)) cond.subs.push(s);
      for (const g of t.groups || []) if (!cond.groups.includes(g)) cond.groups.push(g);
    }
    for (const [re, ws] of WORD_TOPICS) if (re.test(q)) cond.words.push(...ws.filter((w) => !cond.words.includes(w)));
    for (const [re, s] of SORTS) if (re.test(q)) { cond.sort = s; break; }
    if (/유학생|외국인|international|留学生/i.test(q)) cond.intl = true;
    const g = q.match(/([1-4])\s*학년/) || q.match(/year\s*([1-4])/i);
    if (g) cond.grade = +g[1];
    else if (/신입생|freshm[ae]n|新生/i.test(q)) cond.grade = 1;
    if (/(나에게|내게|나한테|내가|제가|저에게|for me|i can|适合我|わたしに)/i.test(q)) cond.mine = true;
    // 남은 낱말: 검색어로 (위에서 조건으로 읽은 낱말과 흔한 말은 뺀다)
    const used = [...TOPICS.map((t) => t[0]), ...WORD_TOPICS.map((t) => t[0]), ...DUE.map((t) => t[0]), ...SORTS.map((t) => t[0]),
      /유학생|외국인|신입생|[1-4]\s*학년|\d{1,2}\s*일/];
    for (const raw of q.split(/\s+/)) {
      const w = stripWord(raw);
      if (w.length < 2 || STOP.has(w.toLowerCase()) || STOP.has(raw) || used.some((re) => re.test(w))) continue;
      cond.tokens.push(w);
    }
    return cond;
  }

  // 조건으로 공지 고르기. ctx: { now, fit(n, extraProfile) -> 'yes'|'check'|'no'|null, profileSet }
  function run(notices, cond, ctx) {
    const now = ctx.now;
    let list = notices.filter((n) => !L.isExpired(n, now));
    if (cond.due !== null) {
      list = list.filter((n) => { const d = L.daysLeft(n.deadline, now); return d !== null && d >= 0 && d <= cond.due; });
    }
    if (cond.subs.length || cond.groups.length) {
      list = list.filter((n) => {
        const b = L.classifyBenefit(n);
        return cond.subs.some((s) => b.subs.includes(s)) || cond.groups.some((g) => b.groups.includes(g));
      });
    }
    if (cond.words.length) list = list.filter((n) => cond.words.some((w) => L.matchesQuery(n, w)));
    if (ctx.fit && (cond.intl || cond.grade)) {
      const p = { set: true, level: 'undergrad', status: 'enrolled', intl: cond.intl, grade: cond.grade, dept: '' };
      list = list.filter((n) => ctx.fit(n, p) !== 'no');
    }
    if (ctx.fit && cond.mine && ctx.profileSet) list = list.filter((n) => ctx.fit(n) !== 'no');
    // 남은 낱말: 하나라도 맞는 공지만. 아무것도 안 맞는 낱말은 빼고 알려 준다
    let ignored = [];
    let hits = new Map();
    if (cond.tokens.length) {
      const good = cond.tokens.filter((t) => list.some((n) => L.matchesQuery(n, t)));
      ignored = cond.tokens.filter((t) => !good.includes(t));
      if (good.length) {
        for (const n of list) {
          const k = good.filter((t) => L.matchesQuery(n, t)).length + good.filter((t) => L.titleMatches(n, t)).length;
          if (k) hits.set(n.id, k);
        }
        list = list.filter((n) => hits.has(n.id));
      }
    }
    const sort = cond.sort || (cond.due !== null ? 'deadline' : hits.size ? 'relevance' : 'deadline');
    if (sort === 'relevance') {
      const dl = (n) => (n.deadline ? L.parseLocal(n.deadline).getTime() : Infinity);
      list = list.slice().sort((a, b) => (hits.get(b.id) || 0) - (hits.get(a.id) || 0) || dl(a) - dl(b));
    } else {
      list = L.sortNotices(list, sort, now);
    }
    // 유학생을 물으면 대상 글에 유학생·외국인이 적힌 공지를 먼저
    if (cond.intl) {
      const forIntl = (n) => /(유학생|외국인|international)/i.test(((n.eligibility && n.eligibility.ko) || '') + ' ' + n.title);
      list = list.filter(forIntl).concat(list.filter((n) => !forIntl(n)));
    }
    return { list, ignored, sort };
  }

  // 로컬 AI에게 넘길 짧은 공지 정보 (번호는 1부터)
  function brief(list, lang, limit) {
    return list.slice(0, limit || 8).map((n, i) => ({
      no: i + 1, id: n.id, title: n.title,
      deadline: n.deadline || '',
      benefit: (n.benefit && n.benefit.text && (n.benefit.text[lang] || n.benefit.text.ko)) || '',
      eligibility: (n.eligibility && (n.eligibility[lang] || n.eligibility.ko)) || '',
      summary: (n.summary && (n.summary[lang] || n.summary.ko)) || ''
    }));
  }

  const api = { parse, run, brief, stripWord };
  root.GongjiAsk = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
