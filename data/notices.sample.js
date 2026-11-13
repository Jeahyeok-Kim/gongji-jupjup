// 공지 줍줍 데이터 파일
// - 지금은 "샘플" 데이터입니다. 실제 학교 공지가 아닙니다.
// - 나중에는 내 컴퓨터(메인 서버 역할)의 파이프라인(수집 → 로컬 AI 해독 → 번역)이 이 파일을 새로 만들어 덮어씁니다.
// - JSON 대신 .js 로 둔 이유: index.html 을 더블클릭(file://)해서 열어도 브라우저가 읽을 수 있게 하려고.
(function (root) {
  const DATA = {
    meta: {
      source: 'sample',          // 'sample' = 예시 데이터, 'pipeline' = 실제 수집·해독 결과
      generatedAt: '2026-11-12',
      model: null,               // 실제 데이터에서는 예: 'qwen3:8b'
      note: '화면 개발용 샘플 공지입니다. 학교에 실제로 올라온 공지가 아닙니다.'
    },

    // 혜택 종류 분류표: AI는 이 목록 안에서만 고르고, 애매하면 'etc'(기타)
    categories: [
      { id: 'dadream',     label: { ko: '다드림 포인트',   en: 'Dadream Points',        zh: 'Dadream积分',  ja: 'ダドリームポイント' } },
      { id: 'scholarship', label: { ko: '장학',           en: 'Scholarships',          zh: '奖学金',       ja: '奨学金' } },
      { id: 'dorm',        label: { ko: '기숙사',         en: 'Dormitory',             zh: '宿舍',         ja: '寮' } },
      { id: 'global',      label: { ko: '교환·해외',       en: 'Exchange & Abroad',     zh: '交换·海外',    ja: '交換留学・海外' } },
      { id: 'career',      label: { ko: '취업·창업',       en: 'Jobs & Startups',       zh: '就业·创业',    ja: '就職・起業' } },
      { id: 'contest',     label: { ko: '공모전·대외활동', en: 'Contests & Activities', zh: '比赛·校外活动', ja: 'コンテスト・課外活動' } },
      { id: 'academic',    label: { ko: '학사',           en: 'Academic Affairs',      zh: '学务',         ja: '学事' } },
      { id: 'event',       label: { ko: '행사·특강',       en: 'Events & Lectures',     zh: '活动·讲座',    ja: 'イベント・特別講義' } },
      { id: 'etc',         label: { ko: '기타',           en: 'Other',                 zh: '其他',         ja: 'その他' } }
    ],

    notices: [
      {
        id: 'sample-01', boardName: '학사공지', link: null, date: '2026-11-09', hits: 812, bodyStatus: 'text',
        title: '[샘플] 2026학년도 동계 계절학기 수강신청 안내',
        titleTr: { en: '[Sample] Winter Session 2026 Course Registration', zh: '[示例] 2026学年度冬季学期选课通知', ja: '[サンプル] 2026年度 冬季学期の履修登録案内' },
        category: 'academic',
        deadline: '2026-11-27T17:00',
        benefit: null,
        eligibility: { ko: '재학생 및 휴학생', en: 'Enrolled students and students on leave', zh: '在校生及休学生', ja: '在学生および休学中の学生' },
        events: [], hours: 0.5,
        evidence: { deadline: '신청 기간: 2026. 11. 23.(월) 10:00 ~ 11. 27.(금) 17:00', eligibility: '신청 대상: 재학생 및 휴학생' },
        evidenceVerified: null,
        summary: {
          ko: '겨울방학 계절학기 수강신청은 11월 23일(월)부터 27일(금) 17시까지입니다. 휴학생도 신청할 수 있지만 들을 수 있는 학점이 더 적습니다.',
          en: 'Registration for the winter session runs from Nov 23 (Mon) to Nov 27 (Fri), 5 p.m. Students on leave can also apply, but with a lower credit limit.',
          zh: '冬季学期选课时间为11月23日(周一)至27日(周五)17点。休学生也可申请,但可修学分较少。',
          ja: '冬季学期の履修登録は11月23日(月)から27日(金)17時までです。休学中の学生も申し込めますが、取れる単位数が少なくなります。'
        },
        terms: ['계절학기', '휴학', '학점'],
        regulation: {
          quote: '최대 6학점(초과학기가 아닌 휴학생은 최대 3학점)',
          tr: { en: 'Seasonal session: up to 6 credits (up to 3 credits for students on leave who are not in an extra semester).', zh: '季节学期最多6学分(非超学期的休学生最多3学分)。', ja: '季節学期は最大6単位(超過学期でない休学生は最大3単位)。' },
          source: '2026학년도 학사요람 · 학사 안내', sourceTr: { en: '2026 Academic Handbook · Academic Guide', zh: '2026学年度学事要览 · 学事指南', ja: '2026年度 学事要覧 · 学事案内' }, page: 12, year: 2026
        }
      },
      {
        id: 'sample-02', boardName: '학사공지', link: null, date: '2026-11-10', hits: 1204, bodyStatus: 'text',
        title: '[샘플] 2026학년도 2학기 수강철회 기간 안내',
        titleTr: { en: '[Sample] Course Withdrawal Period, Fall 2026', zh: '[示例] 2026学年度第2学期退课期间通知', ja: '[サンプル] 2026年度2学期 履修取り消し期間のお知らせ' },
        category: 'academic',
        deadline: '2026-11-13T17:00',
        benefit: null,
        eligibility: { ko: '재학생', en: 'Enrolled students', zh: '在校生', ja: '在学生' },
        events: [], hours: 0.5,
        evidence: { deadline: '철회 기간: 2026. 11. 11.(수) ~ 11. 13.(금) 17:00' },
        evidenceVerified: null,
        summary: {
          ko: '듣고 있는 과목을 11월 13일(금) 17시까지 철회할 수 있습니다. 철회한 뒤에는 되돌릴 수 없으니 신중히 결정하세요.',
          en: 'You can withdraw from a course you are taking until Nov 13 (Fri), 5 p.m. A withdrawal cannot be undone, so decide carefully.',
          zh: '可在11月13日(周五)17点前退选正在修读的课程。退课后无法撤销,请慎重决定。',
          ja: '受講中の科目は11月13日(金)17時まで取り消せます。取り消した後は元に戻せないので慎重に決めてください。'
        },
        terms: ['수강철회', '학점'],
        regulation: {
          quote: '재학생은 공고된 수강철회 기간을 이용하여 수강신청한 과목을 삭제할 수 있으며, 수강철회 이후 취소 처리는 불가함.',
          tr: { en: 'Students may drop registered courses during the announced withdrawal period; a withdrawal cannot be cancelled afterward.', zh: '在校生可在公告的退课期间删除已选课程,退课后不可撤销。', ja: '在学生は告知された履修取り消し期間に登録科目を削除でき、取り消し後の撤回はできない。' },
          source: '2026학년도 학사요람 · 학사 안내', sourceTr: { en: '2026 Academic Handbook · Academic Guide', zh: '2026学年度学事要览 · 学事指南', ja: '2026年度 学事要覧 · 学事案内' }, page: 10, year: 2026
        }
      },
      {
        id: 'sample-03', boardName: '장학공지', link: null, date: '2026-11-11', hits: 356, bodyStatus: 'text',
        title: '[샘플] 2026학년도 2학기 성적우수 외국인 유학생 장학금 신청 안내',
        titleTr: { en: '[Sample] Merit Scholarship for International Students, Fall 2026', zh: '[示例] 2026学年度第2学期优秀外国留学生奖学金申请通知', ja: '[サンプル] 2026年度2学期 成績優秀外国人留学生奨学金の申請案内' },
        category: 'scholarship',
        deadline: '2026-11-20T17:00',
        benefit: { text: { ko: '1인당 500,000원', en: 'KRW 500,000 per student', zh: '每人50万韩元', ja: '1人あたり50万ウォン' }, points: null, won: 500000 },
        eligibility: { ko: '직전 학기 평점평균 3.0 이상인 외국인 유학생', en: 'International students with a previous-semester GPA of 3.0 or higher', zh: '上学期平均绩点3.0以上的外国留学生', ja: '前学期のGPAが3.0以上の外国人留学生' },
        events: [], hours: 1,
        evidence: { deadline: '신청 기간: 2026. 11. 11.(수) ~ 11. 20.(금) 17:00', benefit: '장학 금액: 1인당 500,000원', eligibility: '지원 자격: 직전 학기 평점평균 3.0 이상인 외국인 유학생' },
        evidenceVerified: null,
        summary: {
          ko: '직전 학기 성적이 좋은 외국인 유학생에게 50만 원을 줍니다. 11월 20일(금) 17시까지 신청서를 내야 합니다.',
          en: 'International students with good grades last semester can receive KRW 500,000. Submit the application by Nov 20 (Fri), 5 p.m.',
          zh: '上学期成绩优秀的外国留学生可获得50万韩元。需在11月20日(周五)17点前提交申请。',
          ja: '前学期の成績が良い外国人留学生に50万ウォンが支給されます。11月20日(金)17時までに申請書を提出してください。'
        },
        terms: ['평점평균', '장학금'],
        regulation: null
      },
      {
        id: 'sample-04', boardName: '장학공지', link: null, date: '2026-11-02', hits: 990, bodyStatus: 'text',
        title: '[샘플] 2026학년도 2학기 국가근로장학생 추가 모집',
        titleTr: { en: '[Sample] Additional Recruitment: National Work-Study, Fall 2026', zh: '[示例] 2026学年度第2学期国家勤工助学生追加招募', ja: '[サンプル] 2026年度2学期 国家勤労奨学生の追加募集' },
        category: 'scholarship',
        deadline: '2026-11-06T18:00',
        benefit: { text: { ko: '근무 시간에 따라 장학금 지급 (금액은 공지에 명시 없음)', en: 'Paid according to hours worked (amount not stated in the notice)', zh: '按工作时间发放奖学金(公告未写明金额)', ja: '勤務時間に応じて奨学金を支給(金額は公告に記載なし)' }, points: null, won: null },
        eligibility: { ko: '재학생', en: 'Enrolled students', zh: '在校生', ja: '在学生' },
        events: [], hours: 1,
        evidence: { deadline: '신청 기간: 2026. 11. 2.(월) ~ 11. 6.(금) 18:00' },
        evidenceVerified: null,
        summary: {
          ko: '학교 안에서 일하고 장학금을 받는 근로장학생을 추가로 뽑습니다. 신청 기간은 11월 2일(월)부터 6일(금) 18시까지입니다.',
          en: 'Additional work-study students will be selected to work on campus for a scholarship. Applications run from Nov 2 (Mon) to Nov 6 (Fri), 6 p.m.',
          zh: '追加招募在校内工作并领取奖学金的勤工助学生。申请时间为11月2日(周一)至6日(周五)18点。',
          ja: '学内で働いて奨学金を受け取る勤労奨学生を追加募集します。申請期間は11月2日(月)から6日(金)18時までです。'
        },
        terms: ['근로장학', '장학금'],
        regulation: null
      },
      {
        id: 'sample-05', boardName: '행사안내', link: null, date: '2026-11-10', hits: 433, bodyStatus: 'text',
        title: "[샘플] 비교과 프로그램 '자기소개서 클리닉' 참여자 모집",
        titleTr: { en: '[Sample] Extracurricular Program: Cover Letter Clinic', zh: '[示例] 非教学课程项目「自我介绍信诊所」参与者招募', ja: '[サンプル] 非教科プログラム「自己紹介書クリニック」参加者募集' },
        category: 'dadream',
        deadline: '2026-11-16T23:59',
        benefit: { text: { ko: '다드림 포인트 20점', en: '20 Dadream points', zh: '20个Dadream积分', ja: 'ダドリームポイント20点' }, points: 20, won: null },
        eligibility: { ko: '재학생 누구나 (선착순 30명)', en: 'All enrolled students (first 30)', zh: '全体在校生(先到先得30名)', ja: '在学生なら誰でも(先着30名)' },
        events: [{ date: '2026-11-18', start: '13:00', end: '15:00' }], hours: 2,
        evidence: { deadline: '신청 마감: 2026. 11. 16.(월) 23:59', benefit: '참여자 전원 다드림 포인트 20점 지급', eligibility: '대상: 재학생 누구나 (선착순 30명)', events: '일시: 2026. 11. 18.(수) 13:00 ~ 15:00' },
        evidenceVerified: null,
        summary: {
          ko: '취업용 자기소개서를 첨삭받는 2시간 프로그램입니다. 11월 18일(수) 13시에 열리고, 참여하면 다드림 포인트 20점을 받습니다.',
          en: 'A two-hour program where you get feedback on your job-application cover letter. It runs on Nov 18 (Wed) at 1 p.m., and participants earn 20 Dadream points.',
          zh: '为求职用自我介绍信提供修改指导的2小时项目。11月18日(周三)13点举行,参加可获得20个Dadream积分。',
          ja: '就職用の自己紹介書を添削してもらう2時間のプログラムです。11月18日(水)13時から開かれ、参加するとダドリームポイント20点がもらえます。'
        },
        terms: ['비교과', '다드림 포인트', '자기소개서'],
        regulation: null
      },
      {
        id: 'sample-06', boardName: '취업/창업', link: null, date: '2026-11-11', hits: 287, bodyStatus: 'text',
        title: "[샘플] 진로 특강 '선배와의 대화' 안내",
        titleTr: { en: '[Sample] Career Talk: Conversation with Alumni', zh: '[示例] 职业讲座「与学长学姐对话」', ja: '[サンプル] 進路特別講義「先輩との対話」のご案内' },
        category: 'dadream',
        deadline: '2026-11-18T18:00',
        benefit: { text: { ko: '다드림 포인트 15점', en: '15 Dadream points', zh: '15个Dadream积分', ja: 'ダドリームポイント15点' }, points: 15, won: null },
        eligibility: { ko: '재학생 누구나', en: 'All enrolled students', zh: '全体在校生', ja: '在学生なら誰でも' },
        events: [{ date: '2026-11-19', start: '16:00', end: '17:30' }], hours: 1.5,
        evidence: { deadline: '사전 신청: ~ 2026. 11. 18.(수) 18:00', benefit: '참석자 다드림 포인트 15점', events: '일시: 2026. 11. 19.(목) 16:00 ~ 17:30' },
        evidenceVerified: null,
        summary: {
          ko: 'IT 기업에 취업한 선배가 준비 과정을 들려주는 특강입니다. 11월 19일(목) 16시부터 90분 동안 열리고, 참석하면 다드림 포인트 15점을 받습니다.',
          en: 'An alumnus working at an IT company shares how they prepared for the job. Held on Nov 19 (Thu) from 4 p.m. for 90 minutes; attendees earn 15 Dadream points.',
          zh: '就职于IT企业的学长学姐分享求职准备过程的讲座。11月19日(周四)16点开始,时长90分钟,参加可获得15个Dadream积分。',
          ja: 'IT企業に就職した先輩が準備の過程を話す特別講義です。11月19日(木)16時から90分間行われ、参加するとダドリームポイント15点がもらえます。'
        },
        terms: ['다드림 포인트', '특강'],
        regulation: null
      },
      {
        id: 'sample-07', boardName: '학사공지', link: null, date: '2026-11-12', hits: 198, bodyStatus: 'text',
        title: "[샘플] 학습 상담 프로그램 '학사경고 예방 클리닉' 참여 안내",
        titleTr: { en: '[Sample] Study Counseling: Academic Probation Prevention Clinic', zh: '[示例] 学习咨询项目「学业警告预防诊所」参与通知', ja: '[サンプル] 学習相談プログラム「学業警告予防クリニック」参加案内' },
        category: 'dadream',
        deadline: '2026-11-20T17:00',
        benefit: { text: { ko: '다드림 포인트 10점', en: '10 Dadream points', zh: '10个Dadream积分', ja: 'ダドリームポイント10点' }, points: 10, won: null },
        eligibility: { ko: '직전 학기 평점평균 2.5 미만인 재학생 우선', en: 'Priority to students with a previous-semester GPA below 2.5', zh: '优先上学期平均绩点低于2.5的在校生', ja: '前学期のGPAが2.5未満の在学生を優先' },
        events: [{ date: '2026-11-23', start: '15:00', end: '16:00' }], hours: 1,
        evidence: { deadline: '신청 기간: ~ 2026. 11. 20.(금) 17:00', benefit: '상담 완료 시 다드림 포인트 10점', eligibility: '대상: 직전 학기 평점평균 2.5 미만인 재학생 우선', events: '상담 일시: 2026. 11. 23.(월) 15:00 ~ 16:00' },
        evidenceVerified: null,
        summary: {
          ko: '성적이 걱정되는 학생이 공부 방법을 1:1로 상담받는 프로그램입니다. 11월 23일(월) 15시에 상담하며, 마치면 다드림 포인트 10점을 받습니다.',
          en: 'One-on-one study counseling for students worried about their grades. The session is on Nov 23 (Mon) at 3 p.m., and completing it earns 10 Dadream points.',
          zh: '为担心成绩的学生提供一对一学习方法咨询。11月23日(周一)15点咨询,完成后可获得10个Dadream积分。',
          ja: '成績が心配な学生が学習方法を1対1で相談できるプログラムです。11月23日(月)15時に相談し、終えるとダドリームポイント10点がもらえます。'
        },
        terms: ['학사경고', '평점평균', '다드림 포인트'],
        regulation: {
          quote: '재학 중 매 학기 성적의 평점 평균이 2.0 미만인 자 또는 수강신청을 하지 않은 자에게는 학사경고를 과한다.',
          tr: { en: 'Academic probation is given to students whose semester GPA is below 2.0 or who did not register for courses.', zh: '在学期间每学期平均绩点低于2.0或未选课者,将受到学业警告。', ja: '在学中、各学期の成績平均点が2.0未満の者、または履修登録をしなかった者には学業警告が科される。' },
          source: '2026학년도 학사요람 · 학사 안내', sourceTr: { en: '2026 Academic Handbook · Academic Guide', zh: '2026学年度学事要览 · 学事指南', ja: '2026年度 学事要覧 · 学事案内' }, page: 15, year: 2026
        }
      },
      {
        id: 'sample-08', boardName: '사회봉사', link: null, date: '2026-11-12', hits: 164, bodyStatus: 'text',
        title: '[샘플] 지역 아동센터 학습 멘토링 봉사자 모집',
        titleTr: { en: "[Sample] Volunteers Wanted: Tutoring at a Local Children's Center", zh: '[示例] 招募地区儿童中心学习辅导志愿者', ja: '[サンプル] 地域児童センター学習メンタリングのボランティア募集' },
        category: 'dadream',
        deadline: '2026-11-19T18:00',
        benefit: { text: { ko: '봉사시간 2시간 인정, 다드림 포인트 20점', en: '2 volunteer hours recognized, 20 Dadream points', zh: '认定2小时志愿时长,20个Dadream积分', ja: 'ボランティア2時間認定、ダドリームポイント20点' }, points: 20, won: null },
        eligibility: { ko: '재학생 누구나', en: 'All enrolled students', zh: '全体在校生', ja: '在学生なら誰でも' },
        events: [{ date: '2026-11-21', start: '10:00', end: '12:00' }], hours: 2,
        evidence: { deadline: '모집 기간: ~ 2026. 11. 19.(목) 18:00', benefit: '봉사시간 2시간 인정 및 다드림 포인트 20점 지급', events: '활동 일시: 2026. 11. 21.(토) 10:00 ~ 12:00' },
        evidenceVerified: null,
        summary: {
          ko: '토요일 오전에 지역 아동센터 초등학생의 공부를 돕는 봉사입니다. 봉사시간 2시간과 다드림 포인트 20점을 받습니다.',
          en: "Volunteer on Saturday morning helping elementary school students at a local children's center. You get 2 volunteer hours and 20 Dadream points.",
          zh: '周六上午在地区儿童中心辅导小学生学习的志愿活动。可获得2小时志愿时长和20个Dadream积分。',
          ja: '土曜の午前に地域児童センターで小学生の勉強を手伝うボランティアです。ボランティア2時間とダドリームポイント20点がもらえます。'
        },
        terms: ['봉사시간', '다드림 포인트'],
        regulation: null
      },
      {
        id: 'sample-09', boardName: '일반공지', link: null, date: '2026-11-12', hits: 1530, bodyStatus: 'text',
        title: '[샘플] 2027학년도 1학기 기숙사 입사 신청 안내',
        titleTr: { en: '[Sample] Dormitory Application for Spring 2027', zh: '[示例] 2027学年度第1学期宿舍入住申请通知', ja: '[サンプル] 2027年度1学期 入寮申請の案内' },
        category: 'dorm',
        deadline: '2026-12-03T17:00',
        benefit: { text: { ko: '선발되면 기숙사에 입사할 수 있음', en: 'Selected students can move into the dormitory', zh: '被选中者可入住宿舍', ja: '選ばれると寮に入居できる' }, points: null, won: null },
        eligibility: { ko: '재학생 (신입생은 별도 공지)', en: 'Enrolled students (separate notice for freshmen)', zh: '在校生(新生另行通知)', ja: '在学生(新入生は別途公告)' },
        events: [], hours: 0.5,
        evidence: { deadline: '신청 기간: 2026. 11. 30.(월) ~ 12. 3.(목) 17:00', eligibility: '신청 대상: 재학생 (신입생은 별도 공지)' },
        evidenceVerified: null,
        summary: {
          ko: '다음 학기 기숙사 입사 신청은 11월 30일(월)부터 12월 3일(목) 17시까지 온라인으로 받습니다.',
          en: "Applications for next semester's dormitory are accepted online from Nov 30 (Mon) to Dec 3 (Thu), 5 p.m.",
          zh: '下学期宿舍入住申请于11月30日(周一)至12月3日(周四)17点在线受理。',
          ja: '来学期の入寮申請は11月30日(月)から12月3日(木)17時までオンラインで受け付けます。'
        },
        terms: ['입사'],
        regulation: null
      },
      {
        id: 'sample-10', boardName: '국제교류', link: null, date: '2026-11-06', hits: 742, bodyStatus: 'text',
        title: '[샘플] 2027-1학기 해외 교환학생 파견 2차 모집',
        titleTr: { en: '[Sample] Outbound Exchange Program, Spring 2027: Second Call', zh: '[示例] 2027-1学期海外交换生派遣第二次招募', ja: '[サンプル] 2027年1学期 海外交換留学派遣 第2次募集' },
        category: 'global',
        deadline: '2026-11-25T17:00',
        benefit: { text: { ko: '파견 대학 등록금 면제 (본교 등록금 납부)', en: 'Host-university tuition waived (pay home-university tuition)', zh: '免除派遣大学学费(缴纳本校学费)', ja: '派遣先大学の授業料免除(本学の授業料を納付)' }, points: null, won: null },
        eligibility: { ko: '평점평균 3.0 이상, 공인 어학 성적 보유자', en: 'GPA 3.0 or higher with an official language test score', zh: '平均绩点3.0以上并持有官方语言成绩者', ja: 'GPA3.0以上で公認語学スコアを持つ者' },
        events: [], hours: 3,
        evidence: { deadline: '서류 접수: 2026. 11. 16.(월) ~ 11. 25.(수) 17:00', benefit: '파견 대학 등록금 면제(본교 등록금 납부)', eligibility: '지원 자격: 평점평균 3.0 이상, 공인 어학 성적 보유자' },
        evidenceVerified: null,
        summary: {
          ko: '다음 학기에 해외 협정 대학으로 교환학생을 보냅니다. 서류는 11월 25일(수) 17시까지 내야 합니다.',
          en: 'Exchange students will be sent to partner universities abroad next semester. Documents are due by Nov 25 (Wed), 5 p.m.',
          zh: '下学期将向海外协议大学派遣交换生。需在11月25日(周三)17点前提交材料。',
          ja: '来学期、海外の協定大学へ交換留学生を派遣します。書類は11月25日(水)17時までに提出してください。'
        },
        terms: ['교환학생', '평점평균'],
        regulation: null
      },
      {
        id: 'sample-11', boardName: '취업/창업', link: null, date: '2026-11-05', hits: 611, bodyStatus: 'text',
        title: '[샘플] 2026 창업 아이디어 경진대회 참가팀 모집',
        titleTr: { en: '[Sample] 2026 Startup Idea Competition: Teams Wanted', zh: '[示例] 2026创业创意大赛参赛团队招募', ja: '[サンプル] 2026 起業アイデアコンテスト参加チーム募集' },
        category: 'career',
        deadline: '2026-11-30T18:00',
        // 상금은 받는다는 보장이 없으므로 won(확정 금액)이 아니라 prize 로 둔다 → 시간 예산 추천 점수에는 넣지 않음
        benefit: { text: { ko: '대상 상금 1,000,000원', en: 'Grand prize KRW 1,000,000', zh: '大奖奖金100万韩元', ja: '大賞賞金100万ウォン' }, points: null, won: null, prize: 1000000 },
        eligibility: { ko: '재학생 1~4명 팀', en: 'Teams of 1–4 enrolled students', zh: '1至4名在校生组成的团队', ja: '在学生1~4名のチーム' },
        events: [{ date: '2026-12-04', start: '13:00', end: '17:00' }], hours: 8,
        evidence: { deadline: '참가 신청: ~ 2026. 11. 30.(월) 18:00', benefit: '대상(1팀) 상금 1,000,000원', eligibility: '참가 대상: 재학생 1~4명으로 구성된 팀', events: '본선 발표: 2026. 12. 4.(금) 13:00 ~ 17:00' },
        evidenceVerified: null,
        summary: {
          ko: '창업 아이디어를 겨루는 대회입니다. 11월 30일(월)까지 신청하고 12월 4일(금) 본선에서 발표하며, 대상은 상금 100만 원입니다.',
          en: 'A competition for startup ideas. Apply by Nov 30 (Mon) and present in the finals on Dec 4 (Fri); the grand prize is KRW 1,000,000.',
          zh: '比拼创业创意的大赛。11月30日(周一)前报名,12月4日(周五)决赛发表,大奖奖金100万韩元。',
          ja: '起業アイデアを競う大会です。11月30日(月)までに申し込み、12月4日(金)の本選で発表します。大賞は賞金100万ウォンです。'
        },
        terms: ['창업', '본선'],
        regulation: null
      },
      {
        id: 'sample-12', boardName: '외부행사/공모전', link: null, date: '2026-11-08', hits: 205, bodyStatus: 'image',
        title: '[샘플] 지역 관광 콘텐츠 공모전 안내 (포스터)',
        titleTr: { en: '[Sample] Regional Tourism Content Contest (poster)', zh: '[示例] 地区旅游内容征集大赛(海报)', ja: '[サンプル] 地域観光コンテンツ公募展(ポスター)' },
        category: 'contest',
        deadline: null, benefit: null, eligibility: null, events: [], hours: null,
        evidence: {}, evidenceVerified: null,
        summary: {
          ko: '본문이 이미지로만 올라와 내용을 읽지 못했습니다. 원문을 확인해 주세요.',
          en: 'The notice body is only an image, so it could not be read. Please check the original.',
          zh: '公告正文仅为图片,无法读取。请查看原文。',
          ja: '本文が画像のみのため読み取れませんでした。原文をご確認ください。'
        },
        terms: [],
        regulation: null
      },
      {
        id: 'sample-13', boardName: '유학생 공지 (留学生公告栏)', link: null, date: '2026-11-09', hits: 318, bodyStatus: 'text',
        title: '[샘플] 외국인 유학생 TOPIK 대비 특강 (무료)',
        titleTr: { en: '[Sample] Free TOPIK Prep Lecture for International Students', zh: '[示例] 外国留学生TOPIK备考讲座(免费)', ja: '[サンプル] 外国人留学生向けTOPIK対策特別講義(無料)' },
        category: 'event',
        deadline: '2026-11-18T17:00',
        benefit: { text: { ko: '무료 수강, 교재 제공', en: 'Free of charge, textbook provided', zh: '免费听课,提供教材', ja: '受講無料、教材提供' }, points: null, won: null },
        eligibility: { ko: '외국인 유학생', en: 'International students', zh: '外国留学生', ja: '外国人留学生' },
        events: [{ date: '2026-11-20', start: '18:00', end: '20:00' }], hours: 2,
        evidence: { deadline: '신청 마감: 2026. 11. 18.(수) 17:00', benefit: '수강료 무료, 교재 제공', eligibility: '대상: 외국인 유학생', events: '일시: 2026. 11. 20.(금) 18:00 ~ 20:00' },
        evidenceVerified: null,
        summary: {
          ko: '한국어능력시험(TOPIK)을 준비하는 유학생을 위한 2시간 특강입니다. 11월 20일(금) 18시에 열리며 무료이고 교재도 줍니다.',
          en: 'A two-hour lecture for international students preparing for the TOPIK Korean test. Held on Nov 20 (Fri) at 6 p.m.; free, with a textbook provided.',
          zh: '为准备韩国语能力考试(TOPIK)的留学生开设的2小时讲座。11月20日(周五)18点举行,免费并提供教材。',
          ja: '韓国語能力試験(TOPIK)を準備する留学生向けの2時間の特別講義です。11月20日(金)18時に開かれ、無料で教材ももらえます。'
        },
        terms: ['TOPIK', '특강'],
        regulation: null
      }
    ]
  };

  root.GONGJI_DATA = DATA;
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
