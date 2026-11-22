// 화면 문구 추가분 4 (지원 자격 판정 · 공지에게 묻기 · 앱을 닫아도 마감 알림)
// js/i18n3.js 뒤에 불러와서 같은 문구 표(I.T)에 이어 붙입니다. 네 언어가 같은 항목을 가져야 합니다 (tests/i18n.test.js 가 확인).
(function (root) {
  'use strict';
  if (!root.GongjiI18n && typeof require === 'function') { require('./i18n.js'); require('./i18n2.js'); require('./i18n3.js'); }
  const I = root.GongjiI18n;

  const ADD = {
    ko: {
      // 지원 자격
      profileTitle: '내 정보 (지원 자격 확인)',
      profileHelp: '과정·학년·학적을 알려 주면 공지마다 지원할 수 있는지 표시하고, 대상이 아닌 공지는 오늘 화면·추천에서 빼 드려요. 이 브라우저에만 저장돼요.',
      profileLevel: '과정', levelUndergrad: '학부', levelGrad: '대학원',
      profileGrade: '학년', gradeN: (g) => `${g}학년`,
      profileStatus: '학적', statusEnrolled: '재학', statusLeave: '휴학',
      profileIntl: '외국인 유학생이에요', profileDept: '학과 (선택)', profileDeptPh: '예: 컴퓨터공학과', profileClear: '내 정보 지우기',
      profileSaved: '내 정보로 지원 자격을 확인해요',
      fitYes: '지원 가능', fitCheck: '조건 확인', fitNo: '대상 아님', fitLabel: '나는?',
      fitOnly: '나에게 맞는 공지만', fitSetup: '내 정보를 넣으면 지원할 수 있는 공지만 볼 수 있어요',
      fitHomeTip: '학년·학적을 알려 주면 지원할 수 있는 공지만 골라 드려요.', fitHomeBtn: '내 정보 넣기',
      fitHidden: (n) => `대상이 아닌 공지 ${n}건 숨김`,
      fitReason: (r) => ({
        staff: '교직원·교수 대상이에요', gradOnly: '대학원생 대상이에요', graduateOnly: '졸업(예정)자 대상이에요',
        intlOnly: '외국인 유학생 대상이에요', domesticOnly: '대한민국 국적이 필요해요', citizen: '국민 대상이라 유학생은 확인이 필요해요',
        seoulOnly: '서울캠퍼스 대상이에요', leave: '휴학생은 지원할 수 없어요', enrolledOnly: '재학생 대상이라 휴학 중이면 확인이 필요해요',
        extra: '성적·소득 같은 조건이 있어요', region: '지역 조건이 있어요', age: '나이 조건이 있어요', unclear: '대상 글만으로는 알 수 없어요',
        grade: r.min === r.max ? `${r.min}학년 대상이에요` : r.max === 4 ? `${r.min}학년 이상 대상이에요` : `${r.min}~${r.max}학년 대상이에요`,
        dept: `${(r.depts || []).join(', ')} 대상이에요`
      })[r.code] || '',
      fitYesNote: '대상 글로 보면 지원할 수 있어요',
      // 공지에게 묻기
      askTitle: '공지에게 물어보기', askPlaceholder: '예: 이번 주 마감인 장학금, 포인트 많이 주는 것',
      askExamples: ['이번 주 마감인 장학금', '다드림 포인트 많이 주는 것', '오늘 마감', '해외 프로그램', '유학생이 받을 수 있는 혜택'],
      askBtn: '찾기', askClear: '지우기', askUnderstood: '이렇게 찾았어요', askNone: '맞는 공지를 찾지 못했어요. 낱말을 바꿔 보세요.',
      askSeeAll: (n) => `목록에서 ${n}건 모두 보기`, askIgnored: (w) => `'${w}'는(은) 맞는 공지가 없어 빼고 찾았어요`,
      askCount: (n) => `맞는 공지 ${n}건`,
      condDue: (d) => (d === 0 ? '오늘 마감' : d === 1 ? '내일까지 마감' : `${d}일 안 마감`),
      condSort: { benefit: '혜택 큰 순', hours: '시간 적게 드는 순', latest: '최신순', deadline: '마감 임박순' },
      condIntl: '유학생 대상 가능', condGrade: (g) => `${g}학년 가능`, condMine: '내 정보에 맞는 것', condWords: (w) => `낱말: ${w}`,
      askAiTitle: '내 컴퓨터 AI의 답', askAiWorking: '내 컴퓨터 AI가 위 공지를 읽고 답을 쓰는 중이에요… (10~40초)',
      askAiFail: '내 컴퓨터 AI가 답하지 못해 조건으로 찾은 결과만 보여 드려요.',
      askAiLocalOnly: 'AI 답은 내 컴퓨터 서버로 열었을 때(크롬 확장의 "웹 앱 열기") 함께 나와요.',
      askAiNote: 'AI가 위 공지만 읽고 쓴 답이에요. 신청 전에 원문을 꼭 확인하세요.',
      // 앱을 닫아도 마감 알림
      notifyHelp: '앱을 열어 둔 동안 저장한 공지의 마감이 가까우면 브라우저 알림으로 알려 드려요. 앱을 닫아도 받으려면 아래 "앱을 닫아도 마감 알림"을 보세요.',
      remindTitle: '앱을 닫아도 마감 알림',
      remindOn: (n) => `켜짐 · 저장한 공지 ${n}건을 내 컴퓨터 서버에 맞춰 두었어요. 크롬 확장이 마감 하루 전과 당일에 알려 드려요.`,
      remindOff: '내 컴퓨터 서버(크롬 확장의 "웹 앱 열기")로 열면, 저장한 공지의 마감 하루 전과 당일에 크롬 확장이 알려 드려요. 앱을 닫아 둬도 돼요.'
    },
    en: {
      profileTitle: 'About me (eligibility check)',
      profileHelp: 'Tell us your program, year and status to see whether you can apply to each notice. Notices not meant for you are left out of Today and Picks. Saved only in this browser.',
      profileLevel: 'Program', levelUndergrad: 'Undergraduate', levelGrad: 'Graduate',
      profileGrade: 'Year', gradeN: (g) => `Year ${g}`,
      profileStatus: 'Status', statusEnrolled: 'Enrolled', statusLeave: 'On leave',
      profileIntl: 'I am an international student', profileDept: 'Department (optional)', profileDeptPh: 'e.g. Computer Engineering', profileClear: 'Clear my info',
      profileSaved: 'Checking eligibility with your info',
      fitYes: 'You can apply', fitCheck: 'Check conditions', fitNo: 'Not for you', fitLabel: 'Me?',
      fitOnly: 'Only notices for me', fitSetup: 'Add your info to see only notices you can apply to',
      fitHomeTip: 'Tell us your year and status and we will pick only notices you can apply to.', fitHomeBtn: 'Add my info',
      fitHidden: (n) => `${n} notices not for you hidden`,
      fitReason: (r) => ({
        staff: 'For faculty and staff', gradOnly: 'For graduate students', graduateOnly: 'For (expected) graduates',
        intlOnly: 'For international students', domesticOnly: 'Korean nationality required', citizen: 'For Korean citizens; international students should check',
        seoulOnly: 'For Seoul Campus', leave: 'Students on leave cannot apply', enrolledOnly: 'For enrolled students; check if you are on leave',
        extra: 'Has GPA, income or similar conditions', region: 'Has a residence condition', age: 'Has an age condition', unclear: 'Cannot tell from the eligibility text',
        grade: r.min === r.max ? `For year ${r.min}` : r.max === 4 ? `For year ${r.min} and above` : `For years ${r.min}–${r.max}`,
        dept: `For ${(r.depts || []).join(', ')}`
      })[r.code] || '',
      fitYesNote: 'Based on the eligibility text, you can apply',
      askTitle: 'Ask the notices', askPlaceholder: 'e.g. scholarships due this week, most points',
      askExamples: ['Scholarships due this week', 'Most Dadream points', 'Due today', 'Overseas programs', 'Benefits for international students'],
      askBtn: 'Search', askClear: 'Clear', askUnderstood: 'Here is what I looked for', askNone: 'No matching notices. Try other words.',
      askSeeAll: (n) => `See all ${n} in the list`, askIgnored: (w) => `Left out '${w}' because nothing matched it`,
      askCount: (n) => `${n} matching notices`,
      condDue: (d) => (d === 0 ? 'Due today' : d === 1 ? 'Due by tomorrow' : `Due within ${d} days`),
      condSort: { benefit: 'Biggest benefit', hours: 'Least time', latest: 'Newest', deadline: 'Deadline soonest' },
      condIntl: 'Open to international students', condGrade: (g) => `Open to year ${g}`, condMine: 'Fits my info', condWords: (w) => `Words: ${w}`,
      askAiTitle: 'Answer from my computer\'s AI', askAiWorking: 'The AI on your computer is reading these notices… (10–40 s)',
      askAiFail: 'The AI on your computer did not answer, so only the matched notices are shown.',
      askAiLocalOnly: 'AI answers appear when you open the app from your computer\'s server ("Open web app" in the Chrome extension).',
      askAiNote: 'Written by AI from the notices above only. Check the original before applying.',
      notifyHelp: 'While the app is open, it tells you when a saved notice is close to its deadline. To get alerts with the app closed, see "Deadline alerts even when the app is closed" below.',
      remindTitle: 'Deadline alerts even when the app is closed',
      remindOn: (n) => `On · ${n} saved notices are synced to your computer's server. The Chrome extension alerts you the day before and on the deadline.`,
      remindOff: 'Open the app from your computer\'s server ("Open web app" in the Chrome extension) and the extension will alert you the day before and on the deadline of saved notices, even with the app closed.'
    },
    zh: {
      profileTitle: '我的信息(申请资格确认)',
      profileHelp: '填写课程、年级和学籍后,会显示每条公告能否申请,不适合你的公告不会出现在今日和推荐中。只保存在本浏览器。',
      profileLevel: '课程', levelUndergrad: '本科', levelGrad: '研究生',
      profileGrade: '年级', gradeN: (g) => `${g}年级`,
      profileStatus: '学籍', statusEnrolled: '在读', statusLeave: '休学',
      profileIntl: '我是外国留学生', profileDept: '专业(可选)', profileDeptPh: '例:计算机工程系', profileClear: '清除我的信息',
      profileSaved: '已按我的信息确认申请资格',
      fitYes: '可申请', fitCheck: '需确认条件', fitNo: '不符合', fitLabel: '我呢?',
      fitOnly: '只看适合我的公告', fitSetup: '填写我的信息后可只看能申请的公告',
      fitHomeTip: '告诉我们年级和学籍,只为你挑选能申请的公告。', fitHomeBtn: '填写我的信息',
      fitHidden: (n) => `已隐藏不适合的公告 ${n} 条`,
      fitReason: (r) => ({
        staff: '面向教职员', gradOnly: '面向研究生', graduateOnly: '面向(预计)毕业生',
        intlOnly: '面向外国留学生', domesticOnly: '需要韩国国籍', citizen: '面向韩国国民,留学生需确认',
        seoulOnly: '面向首尔校区', leave: '休学生不能申请', enrolledOnly: '面向在读生,休学中请确认',
        extra: '有成绩、收入等条件', region: '有地区条件', age: '有年龄条件', unclear: '仅凭对象说明无法判断',
        grade: r.min === r.max ? `面向${r.min}年级` : r.max === 4 ? `面向${r.min}年级以上` : `面向${r.min}~${r.max}年级`,
        dept: `面向${(r.depts || []).join('、')}`
      })[r.code] || '',
      fitYesNote: '按对象说明可以申请',
      askTitle: '向公告提问', askPlaceholder: '例:本周截止的奖学金、积分最多的',
      askExamples: ['本周截止的奖学金', '积分最多的', '今天截止', '海外项目', '留学生可获得的福利'],
      askBtn: '查找', askClear: '清除', askUnderstood: '按以下条件查找', askNone: '没有找到符合的公告,请换个说法。',
      askSeeAll: (n) => `在列表中查看全部 ${n} 条`, askIgnored: (w) => `“${w}”没有匹配的公告,已忽略`,
      askCount: (n) => `符合的公告 ${n} 条`,
      condDue: (d) => (d === 0 ? '今天截止' : d === 1 ? '明天前截止' : `${d}天内截止`),
      condSort: { benefit: '福利最大', hours: '用时最少', latest: '最新', deadline: '截止最近' },
      condIntl: '留学生可申请', condGrade: (g) => `${g}年级可申请`, condMine: '符合我的信息', condWords: (w) => `关键词:${w}`,
      askAiTitle: '我电脑上AI的回答', askAiWorking: '电脑上的AI正在阅读这些公告… (10~40秒)',
      askAiFail: '电脑上的AI未能回答,只显示按条件找到的公告。',
      askAiLocalOnly: '通过电脑服务器打开(Chrome扩展的“打开网页应用”)时会显示AI回答。',
      askAiNote: 'AI仅根据上面的公告作答,申请前请查看原文。',
      notifyHelp: '应用打开时,收藏的公告临近截止会用浏览器通知提醒你。想在关闭应用时也收到提醒,请看下面的“关闭应用也能收到截止提醒”。',
      remindTitle: '关闭应用也能收到截止提醒',
      remindOn: (n) => `已开启 · 已将 ${n} 条收藏公告同步到电脑服务器,Chrome扩展会在截止前一天和当天提醒你。`,
      remindOff: '通过电脑服务器打开(Chrome扩展的“打开网页应用”)后,即使关闭应用,扩展也会在收藏公告截止前一天和当天提醒你。'
    },
    ja: {
      profileTitle: 'わたしの情報(応募資格の確認)',
      profileHelp: '課程・学年・学籍を入れると、お知らせごとに応募できるかを表示し、対象外のお知らせは今日・おすすめから外します。このブラウザにだけ保存されます。',
      profileLevel: '課程', levelUndergrad: '学部', levelGrad: '大学院',
      profileGrade: '学年', gradeN: (g) => `${g}年`,
      profileStatus: '学籍', statusEnrolled: '在学', statusLeave: '休学',
      profileIntl: '外国人留学生です', profileDept: '学科(任意)', profileDeptPh: '例:コンピュータ工学科', profileClear: 'わたしの情報を消す',
      profileSaved: 'わたしの情報で応募資格を確認します',
      fitYes: '応募可', fitCheck: '条件を確認', fitNo: '対象外', fitLabel: 'わたしは?',
      fitOnly: 'わたしに合うお知らせだけ', fitSetup: 'わたしの情報を入れると応募できるお知らせだけ見られます',
      fitHomeTip: '学年・学籍を教えてくれれば、応募できるお知らせだけを選びます。', fitHomeBtn: '情報を入れる',
      fitHidden: (n) => `対象外のお知らせ ${n}件を非表示`,
      fitReason: (r) => ({
        staff: '教職員向けです', gradOnly: '大学院生向けです', graduateOnly: '卒業(見込み)者向けです',
        intlOnly: '外国人留学生向けです', domesticOnly: '韓国国籍が必要です', citizen: '国民向けのため留学生は確認が必要です',
        seoulOnly: 'ソウルキャンパス向けです', leave: '休学生は応募できません', enrolledOnly: '在学生向けのため休学中は確認が必要です',
        extra: '成績・所得などの条件があります', region: '地域の条件があります', age: '年齢の条件があります', unclear: '対象の文だけでは判断できません',
        grade: r.min === r.max ? `${r.min}年生向けです` : r.max === 4 ? `${r.min}年生以上向けです` : `${r.min}~${r.max}年生向けです`,
        dept: `${(r.depts || []).join('、')}向けです`
      })[r.code] || '',
      fitYesNote: '対象の文から見て応募できます',
      askTitle: 'お知らせに聞く', askPlaceholder: '例:今週締切の奨学金、ポイントが多いもの',
      askExamples: ['今週締切の奨学金', 'ポイントが多いもの', '今日締切', '海外プログラム', '留学生がもらえる特典'],
      askBtn: '探す', askClear: '消す', askUnderstood: 'この条件で探しました', askNone: '合うお知らせが見つかりません。言葉を変えてみてください。',
      askSeeAll: (n) => `一覧で${n}件すべて見る`, askIgnored: (w) => `「${w}」は合うお知らせがないため外しました`,
      askCount: (n) => `合うお知らせ ${n}件`,
      condDue: (d) => (d === 0 ? '今日締切' : d === 1 ? '明日までに締切' : `${d}日以内に締切`),
      condSort: { benefit: '特典が大きい順', hours: '時間が少ない順', latest: '新しい順', deadline: '締切が近い順' },
      condIntl: '留学生も応募可', condGrade: (g) => `${g}年生も応募可`, condMine: 'わたしの情報に合うもの', condWords: (w) => `言葉:${w}`,
      askAiTitle: 'わたしのパソコンのAIの答え', askAiWorking: 'パソコンのAIが上のお知らせを読んで答えを書いています… (10~40秒)',
      askAiFail: 'パソコンのAIが答えられなかったため、条件で見つけたお知らせだけを表示します。',
      askAiLocalOnly: 'パソコンのサーバーで開いたとき(Chrome拡張の「ウェブアプリを開く」)にAIの答えも表示されます。',
      askAiNote: 'AIが上のお知らせだけを読んで書いた答えです。申し込む前に原文を確認してください。',
      notifyHelp: 'アプリを開いている間、保存したお知らせの締切が近いとブラウザ通知でお知らせします。閉じていても受け取るには下の「アプリを閉じても締切通知」を見てください。',
      remindTitle: 'アプリを閉じても締切通知',
      remindOn: (n) => `オン · 保存したお知らせ${n}件をパソコンのサーバーに同期しました。Chrome拡張が締切の前日と当日にお知らせします。`,
      remindOff: 'パソコンのサーバー(Chrome拡張の「ウェブアプリを開く」)で開くと、アプリを閉じていても保存したお知らせの締切の前日と当日に拡張がお知らせします。'
    }
  };

  for (const lang of Object.keys(ADD)) Object.assign(I.T[lang], ADD[lang]);
  I.EXTRA_KEYS = (I.EXTRA_KEYS || []).concat(Object.keys(ADD.ko));
})(typeof window !== 'undefined' ? window : globalThis);
