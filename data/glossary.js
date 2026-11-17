// 유학생 용어집 (직접 만들어 관리하는 파일)
// - 공지에 자주 나오는 학교 용어를 쉬운 한국어와 영어·중국어·일본어로 풀이합니다.
// - 로컬 AI가 번역할 때도 이 대응어(tr)를 프롬프트에 넣어 용어가 흔들리지 않게 합니다.
// - "(요람)" 표시가 있는 설명은 2026학년도 학사요람 학사 안내의 내용을 근거로 했습니다.
// - 파이프라인(Python)이 읽을 수 있도록 JSON-START ~ JSON-END 사이는 JSON 형식을 지켜 주세요.
(function (root) {
  const GLOSSARY = /*JSON-START*/{
 "계절학기": {
  "tr": {
   "en": "seasonal session",
   "zh": "季节学期",
   "ja": "季節学期"
  },
  "ko": "여름·겨울 방학 동안 짧게 여는 수업이에요. 최대 6학점까지 들을 수 있어요(요람).",
  "en": "Short courses held during summer or winter break. You can take up to 6 credits (academic handbook).",
  "zh": "在暑假或寒假期间开设的短期课程。最多可修6学分(学事要览)。",
  "ja": "夏休み・冬休みに短期間で開かれる授業です。最大6単位まで履修できます(学事要覧)。"
 },
 "휴학": {
  "tr": {
   "en": "leave of absence",
   "zh": "休学",
   "ja": "休学"
  },
  "ko": "학생 신분은 유지하면서 한 학기 이상 학교를 쉬는 것이에요.",
  "en": "Pausing your studies for a semester or more while keeping your student status.",
  "zh": "保留学籍,暂停学业一个学期以上。",
  "ja": "学籍を保ったまま1学期以上大学を休むことです。"
 },
 "학점": {
  "tr": {
   "en": "credit",
   "zh": "学分",
   "ja": "単位"
  },
  "ko": "과목을 마치면 받는 단위예요. 졸업하려면 정해진 학점을 채워야 해요.",
  "en": "The unit you earn by completing a course. You need a set number of credits to graduate.",
  "zh": "修完课程后获得的单位。毕业需要修满规定的学分。",
  "ja": "科目を修了するともらえる単位です。卒業には決められた単位数が必要です。"
 },
 "수강철회": {
  "tr": {
   "en": "course withdrawal",
   "zh": "退课",
   "ja": "履修取り消し"
  },
  "ko": "학기 중 정해진 기간에 신청한 과목을 취소하는 것이에요. 철회한 뒤에는 되돌릴 수 없어요(요람).",
  "en": "Dropping a registered course during the set period in the semester. It cannot be undone (academic handbook).",
  "zh": "在学期中规定的期间取消已选课程。退课后不可撤销(学事要览)。",
  "ja": "学期中の決められた期間に登録した科目を取り消すことです。取り消し後は元に戻せません(学事要覧)。"
 },
 "평점평균": {
  "tr": {
   "en": "GPA",
   "zh": "平均绩点",
   "ja": "GPA(成績平均点)"
  },
  "ko": "과목 성적 점수를 학점 수만큼 가중해서 평균 낸 값이에요(GPA).",
  "en": "Your grade point average: course grade points averaged by credits.",
  "zh": "按学分加权计算的各科成绩平均值(GPA)。",
  "ja": "科目の成績点を単位数で重み付けして平均した値(GPA)です。"
 },
 "장학금": {
  "tr": {
   "en": "scholarship",
   "zh": "奖学金",
   "ja": "奨学金"
  },
  "ko": "학비나 생활비로 학교·기관이 주는 돈이에요. 갚지 않아도 돼요.",
  "en": "Money given by the school or an organization for tuition or living costs. You do not repay it.",
  "zh": "学校或机构为学费或生活费提供的钱,无需偿还。",
  "ja": "学校や機関が学費・生活費として支給するお金です。返す必要はありません。"
 },
 "근로장학": {
  "tr": {
   "en": "work-study",
   "zh": "勤工助学",
   "ja": "勤労奨学"
  },
  "ko": "학교 안에서 일하고, 일한 시간만큼 장학금을 받는 제도예요.",
  "en": "Working on campus and receiving a scholarship for the hours you work.",
  "zh": "在校内工作,并按工作时间领取奖学金的制度。",
  "ja": "学内で働き、働いた時間分の奨学金を受け取る制度です。"
 },
 "비교과": {
  "tr": {
   "en": "extracurricular program",
   "zh": "非教学课程",
   "ja": "非教科プログラム"
  },
  "ko": "학점과 상관없이 학교가 여는 특강·캠프·상담 같은 프로그램이에요.",
  "en": "Non-credit programs run by the school, such as lectures, camps and counseling.",
  "zh": "学校举办的与学分无关的讲座、营地、咨询等项目。",
  "ja": "単位とは関係なく学校が開く特別講義・キャンプ・相談などのプログラムです。",
  "alt": [
   "비교과프로그램"
  ]
 },
 "다드림 포인트": {
  "tr": {
   "en": "Dadream points",
   "zh": "Dadream积分",
   "ja": "ダドリームポイント"
  },
  "ko": "비교과 프로그램 참여 등으로 받는 학교 포인트예요. 쓰는 방법은 학교 안내를 확인하세요.",
  "en": "School points earned by joining extracurricular programs. Check the school guide for how to use them.",
  "zh": "参加非教学课程等获得的学校积分。用途请查看学校说明。",
  "ja": "非教科プログラムへの参加などでもらえる学校のポイントです。使い方は学校の案内を確認してください。"
 },
 "자기소개서": {
  "tr": {
   "en": "cover letter",
   "zh": "自我介绍信",
   "ja": "自己紹介書"
  },
  "ko": "지원할 때 내는, 내 경험과 지원 동기를 쓴 글이에요.",
  "en": "A personal statement about your experience and motivation, submitted when you apply.",
  "zh": "申请时提交的、写有个人经历和申请动机的文章。",
  "ja": "応募するときに出す、自分の経験や志望動機を書いた文章です。"
 },
 "특강": {
  "tr": {
   "en": "special lecture",
   "zh": "特别讲座",
   "ja": "特別講義"
  },
  "ko": "정규 수업이 아니라 한 번이나 짧게 열리는 강의예요.",
  "en": "A one-off or short lecture outside regular classes.",
  "zh": "正规课程之外举办一次或短期的讲座。",
  "ja": "正規の授業ではなく、1回または短期間だけ開かれる講義です。"
 },
 "학사경고": {
  "tr": {
   "en": "academic probation",
   "zh": "学业警告",
   "ja": "学業警告"
  },
  "ko": "학기 평점평균이 2.0 미만이거나 수강신청을 하지 않으면 받는 경고예요. 다음 학기에 신청할 수 있는 학점이 2학점 줄어요(요람).",
  "en": "A warning given if your semester GPA is below 2.0 or you did not register for courses. Your credit limit next semester drops by 2 (academic handbook).",
  "zh": "学期平均绩点低于2.0或未选课时会受到的警告。下学期可选学分减少2学分(学事要览)。",
  "ja": "学期のGPAが2.0未満、または履修登録をしなかった場合に受ける警告です。次学期の履修上限が2単位減ります(学事要覧)。"
 },
 "봉사시간": {
  "tr": {
   "en": "volunteer hours",
   "zh": "志愿时长",
   "ja": "ボランティア時間"
  },
  "ko": "봉사활동을 한 시간을 학교나 기관이 공식으로 인정해 주는 기록이에요.",
  "en": "An official record of the time you spent volunteering.",
  "zh": "学校或机构正式认定的志愿服务时间记录。",
  "ja": "ボランティア活動をした時間を学校や機関が公式に認める記録です。"
 },
 "입사": {
  "tr": {
   "en": "dorm move-in",
   "zh": "入住(宿舍)",
   "ja": "入寮"
  },
  "ko": "기숙사에 들어가 사는 것이에요. 회사에 들어가는 \"입사\"와 글자가 같으니 주의하세요.",
  "en": "Moving into the dormitory. The same Korean word also means \"joining a company\", so read it in context.",
  "zh": "指入住宿舍。与“入职公司”是同一个韩语词,请结合上下文理解。",
  "ja": "寮に入って暮らすことです。会社への「入社」と同じ韓国語なので注意してください。"
 },
 "교환학생": {
  "tr": {
   "en": "exchange student",
   "zh": "交换生",
   "ja": "交換留学生"
  },
  "ko": "협정을 맺은 다른 나라 대학에서 한두 학기 공부하고 학점을 인정받는 학생이에요.",
  "en": "A student who studies at a partner university abroad for one or two semesters and gets the credits recognized.",
  "zh": "在签有协议的外国大学学习一两个学期并获得学分认定的学生。",
  "ja": "協定を結んだ海外の大学で1~2学期学び、単位を認定してもらう学生です。"
 },
 "창업": {
  "tr": {
   "en": "startup",
   "zh": "创业",
   "ja": "起業"
  },
  "ko": "새로 회사나 사업을 시작하는 것이에요.",
  "en": "Starting a new company or business.",
  "zh": "新创办公司或事业。",
  "ja": "新しく会社や事業を始めることです。"
 },
 "본선": {
  "tr": {
   "en": "finals",
   "zh": "决赛",
   "ja": "本選"
  },
  "ko": "예선을 통과한 팀이 겨루는 마지막 단계예요.",
  "en": "The last round, where teams that passed the preliminaries compete.",
  "zh": "通过预赛的团队参加的最后阶段。",
  "ja": "予選を通過したチームが競う最終段階です。"
 },
 "TOPIK": {
  "tr": {
   "en": "TOPIK",
   "zh": "TOPIK(韩国语能力考试)",
   "ja": "TOPIK(韓国語能力試験)"
  },
  "ko": "외국인을 위한 한국어능력시험이에요.",
  "en": "The Test of Proficiency in Korean for non-native speakers.",
  "zh": "面向外国人的韩国语能力考试。",
  "ja": "外国人向けの韓国語能力試験です。"
 },
 "다자녀": {
  "tr": {
   "en": "family with three or more children",
   "zh": "多子女家庭",
   "ja": "多子世帯"
  },
  "ko": "자녀가 셋 이상인 가정이에요. 다자녀 장학은 그 가정의 셋째 이후 자녀가 받는 장학금이에요.",
  "en": "A family with three or more children. A multi-child scholarship goes to the third or later child of such a family.",
  "zh": "有三个及以上子女的家庭。多子女奖学金发给这类家庭的第三个及以后的子女。",
  "ja": "子どもが3人以上いる家庭です。多子世帯奨学金はその家庭の3番目以降の子どもが受け取ります。"
 },
 "건국대": {
  "tr": {
   "en": "Konkuk University",
   "zh": "建国大学",
   "ja": "建国大学"
  },
  "ko": "건국대학교. 서울캠퍼스와 충주의 GLOCAL(글로컬)캠퍼스가 있어요.",
  "en": "Konkuk University. It has a Seoul campus and the GLOCAL campus in Chungju.",
  "zh": "建国大学。设有首尔校区和位于忠州的GLOCAL校区。",
  "ja": "建国大学。ソウルキャンパスと忠州のGLOCALキャンパスがあります。",
  "prompt": false
 },
 "학사정보시스템": {
  "tr": {
   "en": "Academic Information System (KIS)",
   "zh": "学事信息系统(KIS)",
   "ja": "学事情報システム(KIS)"
  },
  "ko": "수강신청, 성적 확인, 증명서 발급, 휴학·복학 신청 같은 학교 일을 하는 웹사이트(KIS)예요. 학번과 비밀번호로 로그인해요.",
  "en": "The school website (KIS) for course registration, grades, certificates, and leave/return requests. You log in with your student ID and password.",
  "zh": "用于选课、查成绩、开证明、办理休学/复学的学校网站(KIS)。用学号和密码登录。",
  "ja": "履修登録、成績確認、証明書発行、休学・復学申請などを行う大学のサイト(KIS)です。学籍番号とパスワードでログインします。",
  "prompt": false,
  "alt": [
   "KIS"
  ]
 },
 "이음교육시스템": {
  "tr": {
   "en": "IEUM education system",
   "zh": "IEUM教育系统",
   "ja": "イウム教育システム"
  },
  "ko": "비교과 프로그램 신청, 교과목 로드맵, 학교 공지를 보는 학교 시스템이에요. 학사정보시스템과 따로 로그인할 수 있어요.",
  "en": "A school system for extracurricular program sign-ups, course roadmaps, and school notices. It is separate from the academic system (KIS).",
  "zh": "用于报名非学分项目、查看课程路线图和学校通知的学校系统,与学事信息系统(KIS)是分开的。",
  "ja": "課外プログラムの申込み、科目ロードマップ、学内のお知らせを見る大学のシステムです。学事情報システム(KIS)とは別です。",
  "prompt": false,
  "alt": [
   "이음",
   "다드림"
  ]
 },
 "2차 인증": {
  "tr": {
   "en": "two-factor authentication (2FA)",
   "zh": "二次认证(2FA)",
   "ja": "二段階認証"
  },
  "ko": "비밀번호 말고도 휴대폰 앱(예: Google Authenticator)에 나오는 일회용 번호(OTP)를 한 번 더 넣어 본인임을 확인하는 방법이에요. 앱을 미리 설치하고 등록해 두어야 해요.",
  "en": "A way to confirm it is you by entering a one-time code (OTP) from a phone app such as Google Authenticator, in addition to your password. Install and register the app beforehand.",
  "zh": "除密码外,还要输入手机应用(如Google Authenticator)显示的一次性验证码(OTP)来确认本人。需要事先安装并注册该应用。",
  "ja": "パスワードに加えて、スマホアプリ(例:Google Authenticator)に表示されるワンタイムコード(OTP)を入力して本人確認する方法です。事前にアプリの準備と登録が必要です。",
  "prompt": false,
  "alt": [
   "OTP",
   "Google Authenticator",
   "이중 인증",
   "2단계 인증",
   "2차인증"
  ]
 },
 "학번": {
  "tr": {
   "en": "student ID number",
   "zh": "学号",
   "ja": "学籍番号"
  },
  "ko": "학교가 학생마다 주는 고유 번호예요. 로그인, 신청, 증명서에 쓰여요.",
  "en": "The unique number the school gives each student. It is used for logging in, applications, and certificates.",
  "zh": "学校给每位学生的唯一编号,用于登录、申请和证明。",
  "ja": "大学が学生ごとに付ける固有の番号です。ログイン、申請、証明書に使います。",
  "prompt": false
 },
 "학생증": {
  "tr": {
   "en": "student ID card",
   "zh": "学生证",
   "ja": "学生証"
  },
  "ko": "재학생임을 보여 주는 카드예요. 도서관, 시험, 기숙사 출입 등에 필요할 수 있어요.",
  "en": "A card showing you are an enrolled student. It may be needed for the library, exams, and dorm entry.",
  "zh": "证明在读学生身份的卡片,图书馆、考试、宿舍出入等可能用到。",
  "ja": "在学生であることを示すカードです。図書館、試験、寮の出入りなどで必要になることがあります。",
  "prompt": false
 },
 "수강신청": {
  "tr": {
   "en": "course registration",
   "zh": "选课",
   "ja": "履修登録"
  },
  "ko": "이번 학기에 들을 과목을 정해진 기간에 신청하는 일이에요. 인기 과목은 정원이 빨리 차니 시작 시각에 맞춰 준비하세요.",
  "en": "Signing up for the courses you will take this semester within the set period. Popular courses fill up fast, so be ready at the start time.",
  "zh": "在规定时间内申请本学期要上的课程。热门课程名额很快满,请在开始时间前做好准备。",
  "ja": "今学期に受ける科目を決められた期間に申し込むことです。人気科目はすぐ定員になるので開始時刻に合わせて準備しましょう。",
  "prompt": false,
  "alt": [
   "수강 신청"
  ]
 },
 "수강정정": {
  "tr": {
   "en": "add/drop period",
   "zh": "选课更改(补退选)",
   "ja": "履修変更"
  },
  "ko": "수강신청이 끝난 뒤 정해진 기간에 과목을 더하거나 빼는 일이에요. 기간이 지나면 바꿀 수 없어요.",
  "en": "A set period after registration when you can add or drop courses. After it ends, you cannot change them.",
  "zh": "选课结束后,在规定时间内增加或删除课程。期限过后不能再更改。",
  "ja": "履修登録のあと、決められた期間に科目を追加・削除することです。期間が過ぎると変更できません。",
  "prompt": false,
  "alt": [
   "수강 정정",
   "정정기간"
  ]
 },
 "시간표": {
  "tr": {
   "en": "timetable",
   "zh": "课表",
   "ja": "時間割"
  },
  "ko": "내가 듣는 수업의 요일·시간·강의실을 정리한 표예요.",
  "en": "The table of your classes with days, times, and rooms.",
  "zh": "整理了所上课程的星期、时间和教室的表格。",
  "ja": "受講する授業の曜日・時間・教室をまとめた表です。",
  "prompt": false
 },
 "공강": {
  "tr": {
   "en": "free period",
   "zh": "空课(没课的时间)",
   "ja": "空きコマ"
  },
  "ko": "시간표에서 수업이 없는 빈 시간이에요.",
  "en": "A gap in your timetable with no class.",
  "zh": "课表中没有课的空闲时间。",
  "ja": "時間割で授業のない空き時間です。",
  "prompt": false
 },
 "분반": {
  "tr": {
   "en": "class section",
   "zh": "分班(教学班)",
   "ja": "クラス(分割クラス)"
  },
  "ko": "같은 과목을 여러 반으로 나눈 것이에요. 반마다 교수님과 요일·시간이 달라요. 수강신청 때 번호(01, 02…)로 구분해요.",
  "en": "One course split into several groups. Each section can have a different professor, day, and time. They are numbered (01, 02…).",
  "zh": "同一课程分成多个班。每个班的教授和上课时间可能不同,选课时用编号(01、02…)区分。",
  "ja": "同じ科目を複数のクラスに分けたものです。クラスごとに教員や曜日・時間が違い、01・02などの番号で区別します。",
  "prompt": false
 },
 "학수번호": {
  "tr": {
   "en": "course code",
   "zh": "课程编号",
   "ja": "科目番号"
  },
  "ko": "과목마다 붙은 고유 번호예요. 수강신청과 강의계획서 조회에 쓰여요.",
  "en": "The unique code of each course, used in registration and syllabus search.",
  "zh": "每门课程的唯一编号,用于选课和查询教学大纲。",
  "ja": "科目ごとの固有番号です。履修登録やシラバス検索に使います。",
  "prompt": false,
  "alt": [
   "과목번호"
  ]
 },
 "강의계획서": {
  "tr": {
   "en": "syllabus",
   "zh": "教学大纲",
   "ja": "シラバス"
  },
  "ko": "과목의 목표, 주차별 수업 내용, 성적 평가 방법을 적은 안내문이에요. 수강신청 전에 읽어 보면 좋아요.",
  "en": "A guide listing a course's goals, weekly topics, and grading method. Read it before registering.",
  "zh": "写明课程目标、每周内容和成绩评定方式的说明,选课前建议阅读。",
  "ja": "科目の目標、週ごとの内容、成績評価の方法を書いた案内です。履修登録の前に読むと良いです。",
  "prompt": false,
  "alt": [
   "강의 계획서",
   "실라버스"
  ]
 },
 "전공필수": {
  "tr": {
   "en": "required major course",
   "zh": "专业必修",
   "ja": "専攻必修"
  },
  "ko": "내 전공에서 꼭 들어야 하는 과목이에요. 졸업하려면 모두 이수해야 해요.",
  "en": "A course you must take for your major. You need to complete all of them to graduate.",
  "zh": "本专业必须修读的课程,毕业前必须全部修完。",
  "ja": "自分の専攻で必ず履修しなければならない科目です。卒業にはすべて修得が必要です。",
  "prompt": false,
  "alt": [
   "전필"
  ]
 },
 "전공선택": {
  "tr": {
   "en": "major elective",
   "zh": "专业选修",
   "ja": "専攻選択"
  },
  "ko": "내 전공 과목 중 골라서 듣는 과목이에요. 정해진 학점만큼 채우면 돼요.",
  "en": "A course you choose from within your major. You only need to fill the required number of credits.",
  "zh": "在本专业课程中自行选择修读的课程,修够规定学分即可。",
  "ja": "専攻の科目の中から選んで履修する科目です。決められた単位数を満たせば良いです。",
  "prompt": false,
  "alt": [
   "전선"
  ]
 },
 "기초교양": {
  "tr": {
   "en": "foundation general education",
   "zh": "基础教养",
   "ja": "基礎教養"
  },
  "ko": "대학 공부의 바탕이 되는 교양 과목이에요(글쓰기, 영어 등).",
  "en": "General education courses that build the base for university study (writing, English, etc.).",
  "zh": "作为大学学习基础的教养课程(写作、英语等)。",
  "ja": "大学での学びの土台となる教養科目です(文章作成、英語など)。",
  "prompt": false
 },
 "심화교양": {
  "tr": {
   "en": "advanced general education",
   "zh": "深化教养",
   "ja": "深化教養"
  },
  "ko": "여러 분야를 더 깊이 배우는 교양 과목이에요.",
  "en": "General education courses that go deeper into various fields.",
  "zh": "更深入学习多个领域的教养课程。",
  "ja": "さまざまな分野をより深く学ぶ教養科目です。",
  "prompt": false
 },
 "KU소양": {
  "tr": {
   "en": "KU character & literacy courses",
   "zh": "KU素养课",
   "ja": "KU素養科目"
  },
  "ko": "인성·시민 의식 같은 소양을 기르는 교양 과목이에요.",
  "en": "General education courses that build character and civic awareness.",
  "zh": "培养品格与公民意识的教养课程。",
  "ja": "人格や市民意識などの素養を育てる教養科目です。",
  "prompt": false,
  "alt": [
   "소양교양"
  ]
 },
 "선수과목": {
  "tr": {
   "en": "prerequisite course",
   "zh": "先修课程",
   "ja": "先修科目"
  },
  "ko": "어떤 과목을 듣기 전에 먼저 들어야 하는 과목이에요.",
  "en": "A course you must take before another course.",
  "zh": "修读某门课程之前必须先修的课程。",
  "ja": "ある科目を履修する前に先に履修しておく必要がある科目です。",
  "prompt": false,
  "alt": [
   "선수 과목"
  ]
 },
 "복수전공": {
  "tr": {
   "en": "double major",
   "zh": "双专业",
   "ja": "複数専攻(ダブルメジャー)"
  },
  "ko": "내 전공 말고 다른 전공도 함께 공부해서 두 전공 졸업장을 받는 제도예요. 신청 기간과 조건은 공지를 확인하세요.",
  "en": "A system to study a second major along with your own and graduate with both. Check the notice for the period and conditions.",
  "zh": "除本专业外再修读另一个专业,毕业时获得两个专业的学位。申请时间和条件请看通知。",
  "ja": "自分の専攻に加えて別の専攻も学び、両方の専攻で卒業する制度です。申請期間や条件は告知で確認してください。",
  "prompt": false,
  "alt": [
   "복수 전공"
  ]
 },
 "부전공": {
  "tr": {
   "en": "minor",
   "zh": "辅修专业",
   "ja": "副専攻(マイナー)"
  },
  "ko": "내 전공 외에 다른 분야를 정해진 학점만큼 공부하는 제도예요. 복수전공보다 부담이 작아요.",
  "en": "Studying another field for a set number of credits besides your major. It is lighter than a double major.",
  "zh": "在本专业之外按规定学分修读另一领域。负担比双专业小。",
  "ja": "専攻のほかに別の分野を決められた単位数だけ学ぶ制度です。複数専攻より負担が小さいです。",
  "prompt": false,
  "alt": [
   "부 전공"
  ]
 },
 "전과": {
  "tr": {
   "en": "change of major",
   "zh": "转专业",
   "ja": "転科"
  },
  "ko": "지금 다니는 학과에서 다른 학과로 옮기는 것이에요. 자격과 신청 기간이 정해져 있어요.",
  "en": "Moving from your current department to another. There are eligibility rules and an application period.",
  "zh": "从目前就读的院系转到其他院系,有资格要求和申请期限。",
  "ja": "現在の学科から別の学科へ移ることです。資格と申請期間が決まっています。",
  "prompt": false
 },
 "융합전공": {
  "tr": {
   "en": "interdisciplinary major",
   "zh": "融合专业",
   "ja": "融合専攻"
  },
  "ko": "여러 학과가 함께 만든 전공이에요. 한 학과 틀에 매이지 않고 여러 분야를 배워요.",
  "en": "A major created jointly by several departments, letting you study multiple fields.",
  "zh": "由多个院系共同设立的专业,可以跨领域学习。",
  "ja": "複数の学科が共同で作った専攻です。ひとつの学科にとらわれず複数の分野を学べます。",
  "prompt": false,
  "alt": [
   "연계전공",
   "연합전공"
  ]
 },
 "중간고사": {
  "tr": {
   "en": "midterm exam",
   "zh": "期中考试",
   "ja": "中間試験"
  },
  "ko": "학기 중간(보통 8주차 무렵)에 보는 시험이에요. 날짜는 학사일정과 과목 공지를 확인하세요.",
  "en": "The exam in the middle of the semester. Check the academic calendar and your course announcements for dates.",
  "zh": "学期中间进行的考试。日期请看学事日程和课程通知。",
  "ja": "学期の中ごろに行う試験です。日程は学事日程と科目の告知で確認してください。",
  "prompt": false,
  "alt": [
   "중간 고사"
  ]
 },
 "기말고사": {
  "tr": {
   "en": "final exam",
   "zh": "期末考试",
   "ja": "期末試験"
  },
  "ko": "학기 끝에 보는 시험이에요. 시험 기간에는 수업 대신 시험을 봐요.",
  "en": "The exam at the end of the semester.",
  "zh": "学期末进行的考试。",
  "ja": "学期の終わりに行う試験です。",
  "prompt": false,
  "alt": [
   "기말 고사"
  ]
 },
 "성적이의신청": {
  "tr": {
   "en": "grade appeal",
   "zh": "成绩异议申请",
   "ja": "成績異議申立て"
  },
  "ko": "성적이 잘못됐다고 생각할 때 정해진 기간에 학교에 다시 확인해 달라고 요청하는 절차예요.",
  "en": "A procedure to ask the school to recheck a grade you think is wrong, within a set period.",
  "zh": "认为成绩有误时,在规定期限内请求学校复核的程序。",
  "ja": "成績が間違っていると思うとき、決められた期間内に大学へ再確認を求める手続きです。",
  "prompt": false,
  "alt": [
   "성적 이의",
   "성적 정정",
   "이의신청"
  ]
 },
 "재수강": {
  "tr": {
   "en": "retaking a course",
   "zh": "重修",
   "ja": "再履修"
  },
  "ko": "이미 들은 과목을 성적을 올리려고 다시 듣는 것이에요. 가능한 과목과 성적 기준은 학교 안내를 확인하세요.",
  "en": "Taking a course again to improve the grade. Check school rules for which courses and grades are allowed.",
  "zh": "为提高成绩而重新修读已修过的课程。可重修的课程与成绩标准请看学校规定。",
  "ja": "履修済みの科目を成績向上のためにもう一度受けることです。対象科目や成績基準は大学の案内で確認してください。",
  "prompt": false
 },
 "출석": {
  "tr": {
   "en": "attendance",
   "zh": "出勤(考勤)",
   "ja": "出席"
  },
  "ko": "수업에 나온 기록이에요. 결석이 많으면 성적에 불이익이 있거나 학점을 못 받을 수 있어요.",
  "en": "The record of attending class. Too many absences can lower your grade or cost you the credit.",
  "zh": "上课出席的记录。缺课太多会影响成绩甚至拿不到学分。",
  "ja": "授業に出た記録です。欠席が多いと成績に不利になったり単位がもらえなかったりします。",
  "prompt": false,
  "alt": [
   "출결",
   "전자출결"
  ]
 },
 "공결": {
  "tr": {
   "en": "excused absence",
   "zh": "公假(因公缺课)",
   "ja": "公欠"
  },
  "ko": "병원, 시험, 학교 행사 같은 인정되는 사유로 결석해도 불이익이 없게 하는 신청이에요. 증빙서류가 필요해요.",
  "en": "An application so an absence for an approved reason (illness, exam, school event) is not penalized. Proof documents are needed.",
  "zh": "因就医、考试、学校活动等被认可的理由缺课时,申请免于处罚。需要证明材料。",
  "ja": "病院、試験、学校行事など認められた理由での欠席が不利にならないようにする申請です。証明書類が必要です。",
  "prompt": false,
  "alt": [
   "공결신청",
   "공결 신청"
  ]
 },
 "휴강": {
  "tr": {
   "en": "class cancellation",
   "zh": "停课",
   "ja": "休講"
  },
  "ko": "교수님 사정이나 학교 일정으로 그날 수업을 하지 않는 것이에요.",
  "en": "A class that is not held that day for the professor's circumstances or a school schedule.",
  "zh": "因教授有事或学校安排当天不上课。",
  "ja": "教員の都合や学校の予定でその日の授業が行われないことです。",
  "prompt": false
 },
 "보강": {
  "tr": {
   "en": "make-up class",
   "zh": "补课",
   "ja": "補講"
  },
  "ko": "휴강으로 빠진 수업을 다른 날에 대신 하는 것이에요. 시간과 장소가 바뀔 수 있으니 공지를 확인하세요.",
  "en": "A class held on another day to make up for a cancelled one. The time and place may change.",
  "zh": "把停课落下的内容在别的日子补上。时间和地点可能变化,请看通知。",
  "ja": "休講で抜けた授業を別の日に行うことです。時間や場所が変わることがあります。",
  "prompt": false
 },
 "절대평가": {
  "tr": {
   "en": "absolute grading",
   "zh": "绝对评价",
   "ja": "絶対評価"
  },
  "ko": "다른 학생과 비교하지 않고 정해진 점수 기준으로 성적을 주는 방식이에요.",
  "en": "Grading by fixed score standards, not by comparison with other students.",
  "zh": "不与其他学生比较,按固定分数标准评分的方式。",
  "ja": "他の学生と比べず、決められた点数基準で成績をつける方式です。",
  "prompt": false
 },
 "상대평가": {
  "tr": {
   "en": "relative grading (curve)",
   "zh": "相对评价",
   "ja": "相対評価"
  },
  "ko": "학생들의 점수 순서에 따라 A, B 같은 성적의 비율을 정해서 주는 방식이에요.",
  "en": "Grading where the share of A, B, etc. is set by ranking students' scores.",
  "zh": "根据学生分数排名,按比例给A、B等成绩的方式。",
  "ja": "学生の点数の順位に応じてA・Bなどの割合を決めて成績をつける方式です。",
  "prompt": false
 },
 "P/NP": {
  "tr": {
   "en": "Pass / Non-pass",
   "zh": "通过/未通过(P/NP)",
   "ja": "合格/不合格(P/NP)"
  },
  "ko": "점수 대신 통과(P)·미통과(NP)로만 표시하는 성적이에요. 평점평균에는 들어가지 않는 경우가 많아요.",
  "en": "A grade shown only as pass (P) or non-pass (NP). It often does not count toward your GPA.",
  "zh": "不给分数,只记为通过(P)或未通过(NP)的成绩,通常不计入平均绩点。",
  "ja": "点数ではなく合格(P)・不合格(NP)だけで表す成績です。GPAに含まれないことが多いです。",
  "prompt": false,
  "alt": [
   "Pass/Fail",
   "합격/불합격"
  ]
 },
 "학점포기": {
  "tr": {
   "en": "credit waiver (grade forfeit)",
   "zh": "放弃学分(成绩作废)",
   "ja": "単位放棄"
  },
  "ko": "이미 받은 성적을 학점 계산에서 빼는 제도예요. 가능한 횟수와 조건이 정해져 있어요.",
  "en": "A system to remove an earned grade from your GPA calculation. Limits and conditions apply.",
  "zh": "把已取得的成绩从学分绩点计算中去掉的制度,有次数和条件限制。",
  "ja": "すでに取った成績を単位計算から除く制度です。回数や条件が決まっています。",
  "prompt": false,
  "alt": [
   "학점 포기"
  ]
 },
 "복학": {
  "tr": {
   "en": "return to school",
   "zh": "复学",
   "ja": "復学"
  },
  "ko": "휴학했다가 다시 학교에 다니는 것이에요. 정해진 기간에 신청해야 해요.",
  "en": "Coming back to school after a leave of absence. You must apply within the set period.",
  "zh": "休学后重新回校就读,需在规定期限内申请。",
  "ja": "休学のあと再び大学に通うことです。決められた期間に申請が必要です。",
  "prompt": false
 },
 "등록휴학": {
  "tr": {
   "en": "leave after paying tuition",
   "zh": "注册后休学",
   "ja": "登録後休学"
  },
  "ko": "등록금을 낸 뒤에도 정해진 날까지 할 수 있는 휴학이에요. 날짜가 지나면 신청할 수 없으니 학사일정을 확인하세요.",
  "en": "A leave of absence you can still apply for, after paying tuition, until a set date. After that date you cannot apply.",
  "zh": "缴纳学费后,在规定日期前仍可办理的休学。过期无法申请,请看学事日程。",
  "ja": "登録金を納めたあとも決められた日まで申請できる休学です。日付を過ぎると申請できません。",
  "prompt": false
 },
 "자퇴": {
  "tr": {
   "en": "voluntary withdrawal",
   "zh": "退学(自愿)",
   "ja": "自主退学"
  },
  "ko": "학생이 스스로 학교를 그만두는 것이에요.",
  "en": "A student leaving the school by their own choice.",
  "zh": "学生主动退出学校。",
  "ja": "学生が自らの意思で大学をやめることです。",
  "prompt": false
 },
 "제적": {
  "tr": {
   "en": "expulsion / removal from enrollment",
   "zh": "除籍",
   "ja": "除籍"
  },
  "ko": "등록하지 않았거나 규정을 어겨서 학생 자격을 잃는 것이에요. 이유에 따라 재입학이 가능한 경우도 있어요.",
  "en": "Losing student status for not registering or breaking rules. In some cases you can apply for readmission.",
  "zh": "因未注册或违反规定而失去学生资格。视原因,有的可以申请重新入学。",
  "ja": "登録しなかったり規則に違反したりして学生資格を失うことです。理由によっては再入学できる場合もあります。",
  "prompt": false
 },
 "재입학": {
  "tr": {
   "en": "readmission",
   "zh": "重新入学",
   "ja": "再入学"
  },
  "ko": "자퇴나 제적으로 학교를 떠났던 학생이 다시 입학하는 제도예요. 기간과 자격이 정해져 있어요.",
  "en": "A system for former students who left by withdrawal or removal to enroll again. Period and eligibility are set.",
  "zh": "因退学或除籍离校的学生再次入学的制度,有申请期限和资格要求。",
  "ja": "自主退学や除籍で大学を離れた学生が再び入学する制度です。期間と資格が決まっています。",
  "prompt": false
 },
 "편입학": {
  "tr": {
   "en": "transfer admission",
   "zh": "插班(转学)入学",
   "ja": "編入学"
  },
  "ko": "다른 대학에서 공부하다가 중간 학년으로 들어오는 입학이에요.",
  "en": "Entering at a middle year after studying at another university.",
  "zh": "在其他大学学习后,以中间年级身份入学。",
  "ja": "他大学で学んだあと、途中の学年から入学することです。",
  "prompt": false,
  "alt": [
   "편입"
  ]
 },
 "조기졸업": {
  "tr": {
   "en": "early graduation",
   "zh": "提前毕业",
   "ja": "早期卒業"
  },
  "ko": "정해진 학기보다 일찍 졸업요건을 채워 졸업하는 것이에요. 성적 등 조건이 있어요.",
  "en": "Graduating earlier than the usual number of semesters by meeting requirements, with conditions such as grades.",
  "zh": "比规定学期更早修满毕业要求而毕业,有成绩等条件。",
  "ja": "決められた学期より早く卒業要件を満たして卒業することです。成績などの条件があります。",
  "prompt": false
 },
 "졸업요건": {
  "tr": {
   "en": "graduation requirements",
   "zh": "毕业要求",
   "ja": "卒業要件"
  },
  "ko": "졸업하려면 채워야 하는 조건이에요(총 학점, 전공 학점, 교양, 졸업논문·시험 등). 학과마다 달라서 학과 안내를 확인하세요.",
  "en": "The conditions to graduate (total credits, major credits, general education, thesis or exam, etc.). They differ by department, so check yours.",
  "zh": "毕业需要满足的条件(总学分、专业学分、教养、毕业论文/考试等),各院系不同,请看本院系说明。",
  "ja": "卒業のために満たすべき条件です(総単位、専攻単位、教養、卒業論文・試験など)。学科ごとに違うので確認してください。",
  "prompt": false,
  "alt": [
   "졸업 요건",
   "졸업 기준"
  ]
 },
 "졸업유예": {
  "tr": {
   "en": "graduation deferral",
   "zh": "延期毕业",
   "ja": "卒業猶予"
  },
  "ko": "졸업요건을 채웠어도 취업 준비 등으로 졸업을 미루는 제도예요. 학교마다 조건과 비용이 달라요.",
  "en": "Postponing graduation even after meeting requirements, e.g. to prepare for a job. Conditions and costs vary by school.",
  "zh": "即使满足毕业要求,也因求职准备等推迟毕业的制度,条件和费用因校而异。",
  "ja": "卒業要件を満たしても就職準備などで卒業を延ばす制度です。条件や費用は大学ごとに違います。",
  "prompt": false,
  "alt": [
   "졸업 유예"
  ]
 },
 "수료": {
  "tr": {
   "en": "course completion (without degree)",
   "zh": "修业(结业)",
   "ja": "修了"
  },
  "ko": "필요한 학기와 학점을 마쳤지만 아직 졸업요건을 다 채우지 못한 상태예요. 졸업과는 달라요.",
  "en": "Having finished the required semesters but not yet all graduation requirements. It is not the same as graduating.",
  "zh": "读完规定学期、修够学分,但尚未满足全部毕业要求的状态,与毕业不同。",
  "ja": "必要な学期と単位は終えたが、まだ卒業要件を満たしていない状態です。卒業とは違います。",
  "prompt": false
 },
 "학위수여식": {
  "tr": {
   "en": "commencement ceremony",
   "zh": "学位授予仪式(毕业典礼)",
   "ja": "学位授与式"
  },
  "ko": "졸업생에게 학위를 주는 행사예요.",
  "en": "The ceremony where graduates receive their degrees.",
  "zh": "向毕业生颁发学位的仪式。",
  "ja": "卒業生に学位を授与する式典です。",
  "prompt": false,
  "alt": [
   "졸업식"
  ]
 },
 "학사지도교수": {
  "tr": {
   "en": "academic advisor",
   "zh": "学业指导教授",
   "ja": "学事指導教員"
  },
  "ko": "수강 계획, 진로, 학교 생활을 상담해 주는 담당 교수님이에요.",
  "en": "The professor who advises you on course plans, career, and school life.",
  "zh": "为选课计划、职业方向和校园生活提供咨询的负责教授。",
  "ja": "履修計画、進路、学校生活の相談に乗ってくれる担当教員です。",
  "prompt": false,
  "alt": [
   "책임지도교수",
   "지도교수"
  ]
 },
 "오리엔테이션": {
  "tr": {
   "en": "orientation",
   "zh": "新生入学指导",
   "ja": "オリエンテーション"
  },
  "ko": "학교 생활과 제도를 안내하는 행사예요.",
  "en": "An event that introduces school life and systems.",
  "zh": "介绍校园生活和制度的活动。",
  "ja": "学校生活や制度を案内する行事です。",
  "prompt": false,
  "alt": [
   "신입생 환영"
  ]
 },
 "재학생": {
  "tr": {
   "en": "enrolled student",
   "zh": "在读学生",
   "ja": "在学生"
  },
  "ko": "지금 학교에 등록해서 다니고 있는 학생이에요. 휴학생과 구분해서 쓰는 공지가 많아요.",
  "en": "A student currently registered and attending. Many notices separate them from students on leave.",
  "zh": "目前已注册并在校就读的学生。很多通知会与休学生区分。",
  "ja": "現在登録して通っている学生です。休学生と区別する告知が多いです。",
  "prompt": false
 },
 "휴학생": {
  "tr": {
   "en": "student on leave",
   "zh": "休学生",
   "ja": "休学中の学生"
  },
  "ko": "휴학 중인 학생이에요. 공지의 신청 대상에 포함되는지 꼭 확인하세요.",
  "en": "A student on a leave of absence. Check whether the notice's eligibility includes you.",
  "zh": "正在休学的学生。请确认通知的申请对象是否包含休学生。",
  "ja": "休学中の学生です。告知の対象に含まれるか必ず確認してください。",
  "prompt": false
 },
 "교직원": {
  "tr": {
   "en": "faculty and staff",
   "zh": "教职员",
   "ja": "教職員"
  },
  "ko": "학교에서 가르치거나 일하는 분들(교수님과 직원)을 함께 부르는 말이에요. 학생 대상이 아닌 공지가 많아요.",
  "en": "Professors and staff members together. Many such notices are not for students.",
  "zh": "在学校任教或工作的人员(教授和职员)的统称,这类通知很多不是面向学生的。",
  "ja": "大学で教えたり働いたりする人(教員と職員)の総称です。学生向けではない告知も多いです。",
  "prompt": false
 },
 "대학원생": {
  "tr": {
   "en": "graduate student",
   "zh": "研究生",
   "ja": "大学院生"
  },
  "ko": "대학교를 졸업한 뒤 석사·박사 과정을 공부하는 학생이에요.",
  "en": "A student in a master's or doctoral program after a bachelor's degree.",
  "zh": "本科毕业后攻读硕士、博士的学生。",
  "ja": "学部卒業後に修士・博士課程で学ぶ学生です。",
  "prompt": false
 },
 "등록금": {
  "tr": {
   "en": "tuition",
   "zh": "学费",
   "ja": "授業料(登録金)"
  },
  "ko": "학기마다 학교에 내는 수업료와 비용이에요. 정해진 기간에 내지 않으면 학생 자격을 잃을 수 있어요.",
  "en": "The tuition and fees paid to the school each semester. Not paying within the period can cost you student status.",
  "zh": "每学期向学校缴纳的学费和费用。不在规定期限内缴纳可能失去学生资格。",
  "ja": "学期ごとに大学へ納める授業料や費用です。期間内に納めないと学生資格を失うことがあります。",
  "prompt": false,
  "alt": [
   "납입금"
  ]
 },
 "분할납부": {
  "tr": {
   "en": "installment payment",
   "zh": "分期缴纳",
   "ja": "分納"
  },
  "ko": "등록금을 여러 번에 나눠서 내는 제도예요. 신청 기간과 방법은 공지를 확인하세요.",
  "en": "Paying tuition in several installments. Check the notice for the application period and method.",
  "zh": "把学费分几次缴纳的制度,申请时间和方法请看通知。",
  "ja": "登録金を数回に分けて納める制度です。申請期間と方法は告知で確認してください。",
  "prompt": false,
  "alt": [
   "분할 납부"
  ]
 },
 "고지서": {
  "tr": {
   "en": "payment notice (bill)",
   "zh": "缴费通知单",
   "ja": "納付書"
  },
  "ko": "내야 할 돈의 금액과 계좌, 기한이 적힌 서류예요.",
  "en": "A document stating the amount to pay, the account, and the deadline.",
  "zh": "写明应缴金额、账户和期限的单据。",
  "ja": "支払う金額、口座、期限が書かれた書類です。",
  "prompt": false,
  "alt": [
   "등록금 고지서"
  ]
 },
 "국가장학금": {
  "tr": {
   "en": "National Scholarship",
   "zh": "国家奖学金",
   "ja": "国家奨学金"
  },
  "ko": "정부가 한국장학재단을 통해 주는 장학금이에요. 학교 장학금과 별도로 재단 사이트에서 신청해요.",
  "en": "A scholarship from the government through the Korea Scholarship Foundation. You apply separately on the foundation's site.",
  "zh": "政府通过韩国奖学财团发放的奖学金,与学校奖学金分开,需在财团网站申请。",
  "ja": "政府が韓国奨学財団を通じて支給する奨学金です。大学の奨学金とは別に財団のサイトで申請します。",
  "prompt": false,
  "alt": [
   "한국장학재단"
  ]
 },
 "성적장학금": {
  "tr": {
   "en": "merit scholarship",
   "zh": "成绩奖学金",
   "ja": "成績奨学金"
  },
  "ko": "지난 학기 성적이 좋은 학생에게 주는 장학금이에요.",
  "en": "A scholarship for students with good grades in the previous semester.",
  "zh": "发给上学期成绩优秀学生的奖学金。",
  "ja": "前学期の成績が良い学生に支給される奨学金です。",
  "prompt": false,
  "alt": [
   "성적우수장학금",
   "성적 우수 장학"
  ]
 },
 "교내장학금": {
  "tr": {
   "en": "on-campus scholarship",
   "zh": "校内奖学金",
   "ja": "学内奨学金"
  },
  "ko": "학교가 직접 주는 장학금이에요.",
  "en": "A scholarship given directly by the school.",
  "zh": "由学校直接发放的奖学金。",
  "ja": "大学が直接支給する奨学金です。",
  "prompt": false,
  "alt": [
   "교내 장학"
  ]
 },
 "교외장학금": {
  "tr": {
   "en": "external scholarship",
   "zh": "校外奖学金",
   "ja": "学外奨学金"
  },
  "ko": "학교 밖 기관(기업, 재단, 지자체 등)이 주는 장학금이에요. 학교를 통해 추천받아야 하는 경우가 많아요.",
  "en": "A scholarship from outside organizations (companies, foundations, local governments). Often you need a recommendation through the school.",
  "zh": "由校外机构(企业、财团、地方政府等)发放的奖学金,常需通过学校推荐。",
  "ja": "学外の機関(企業、財団、自治体など)が支給する奨学金です。大学を通じた推薦が必要なことが多いです。",
  "prompt": false,
  "alt": [
   "교외 장학"
  ]
 },
 "학자금대출": {
  "tr": {
   "en": "student loan",
   "zh": "学费贷款",
   "ja": "学資ローン"
  },
  "ko": "등록금이나 생활비를 빌리고 나중에 갚는 대출이에요. 조건과 이자는 한국장학재단 안내를 확인하세요.",
  "en": "A loan for tuition or living costs that you repay later. Check the Korea Scholarship Foundation for terms and interest.",
  "zh": "借来支付学费或生活费、日后偿还的贷款,条件和利息请看韩国奖学财团说明。",
  "ja": "授業料や生活費を借りて後で返す貸与です。条件や利子は韓国奨学財団の案内で確認してください。",
  "prompt": false,
  "alt": [
   "학자금 대출"
  ]
 },
 "장학": {
  "tr": {
   "en": "scholarship (general)",
   "zh": "奖学",
   "ja": "奨学"
  },
  "ko": "학생이 공부에 쓰는 돈을 지원해 주는 제도를 말해요. 종류마다 대상과 신청 방법이 달라요.",
  "en": "Financial support for students' studies. Each type has different eligibility and application methods.",
  "zh": "资助学生学业费用的制度,不同种类的对象和申请方法各异。",
  "ja": "学生の学びを経済的に支える制度です。種類ごとに対象と申請方法が違います。",
  "prompt": false,
  "alt": [
   "장학생",
   "장학 신청"
  ]
 },
 "증명서": {
  "tr": {
   "en": "certificate",
   "zh": "证明书",
   "ja": "証明書"
  },
  "ko": "재학, 성적, 졸업 같은 사실을 학교가 확인해 주는 서류예요. 학사정보시스템이나 발급기에서 받을 수 있어요.",
  "en": "A document where the school confirms facts like enrollment, grades, or graduation. You can get it from KIS or a kiosk.",
  "zh": "学校确认在读、成绩、毕业等事实的文件,可在学事信息系统或自助机上办理。",
  "ja": "在学・成績・卒業などを大学が証明する書類です。学事情報システムや発行機で取得できます。",
  "prompt": false,
  "alt": [
   "재학증명서",
   "성적증명서",
   "졸업증명서"
  ]
 },
 "기숙사": {
  "tr": {
   "en": "dormitory",
   "zh": "宿舍(生活馆)",
   "ja": "寮(生活館)"
  },
  "ko": "학교가 운영하는 학생 숙소예요. 입사 신청 기간, 비용, 규칙이 정해져 있어요.",
  "en": "Student housing run by the school. It has application periods, costs, and rules.",
  "zh": "学校运营的学生住宿。有入住申请时间、费用和规定。",
  "ja": "大学が運営する学生寮です。入寮申込期間、費用、規則が決まっています。",
  "prompt": false,
  "alt": [
   "생활관"
  ]
 },
 "학생상담센터": {
  "tr": {
   "en": "Student Counseling Center",
   "zh": "学生咨询中心",
   "ja": "学生相談センター"
  },
  "ko": "학교 생활, 진로, 마음 건강에 대해 상담해 주는 곳이에요. 이용 내용은 비밀이 지켜져요.",
  "en": "A place for counseling on school life, career, and mental well-being. What you share is kept confidential.",
  "zh": "提供校园生活、职业和心理健康咨询的地方,内容保密。",
  "ja": "学校生活、進路、心の健康について相談できる場所です。内容は秘密が守られます。",
  "prompt": false,
  "alt": [
   "상담센터",
   "심리상담"
  ]
 },
 "도서관": {
  "tr": {
   "en": "library",
   "zh": "图书馆",
   "ja": "図書館"
  },
  "ko": "책을 빌리고 공부할 수 있는 곳이에요. 열람실 이용과 대출에 학생증이 필요해요.",
  "en": "A place to borrow books and study. You need your student ID for reading rooms and loans.",
  "zh": "可借书和学习的地方,使用阅览室和借阅需要学生证。",
  "ja": "本を借りたり勉強したりできる場所です。閲覧室や貸出には学生証が必要です。",
  "prompt": false,
  "alt": [
   "중원도서관"
  ]
 },
 "동아리": {
  "tr": {
   "en": "club (student group)",
   "zh": "社团",
   "ja": "サークル"
  },
  "ko": "같은 관심사를 가진 학생들이 모여 활동하는 모임이에요.",
  "en": "A group of students with shared interests who meet and do activities.",
  "zh": "兴趣相同的学生聚在一起活动的组织。",
  "ja": "同じ関心を持つ学生が集まって活動するグループです。",
  "prompt": false
 },
 "학생회": {
  "tr": {
   "en": "student council",
   "zh": "学生会",
   "ja": "学生会"
  },
  "ko": "학생들이 뽑은 대표들이 학생 의견을 모으고 행사를 운영하는 단체예요.",
  "en": "An organization of student-elected representatives that gathers student opinions and runs events.",
  "zh": "由学生选出的代表收集学生意见、组织活动的团体。",
  "ja": "学生が選んだ代表が学生の意見を集め行事を運営する団体です。",
  "prompt": false
 },
 "인성": {
  "tr": {
   "en": "character education",
   "zh": "品格教育",
   "ja": "人格教育"
  },
  "ko": "바른 태도와 공동체 의식을 기르는 교육이에요.",
  "en": "Education that builds good attitudes and a sense of community.",
  "zh": "培养良好态度和集体意识的教育。",
  "ja": "正しい態度や共同体意識を育てる教育です。",
  "prompt": false
 },
 "학점인정": {
  "tr": {
   "en": "credit recognition",
   "zh": "学分认定",
   "ja": "単位認定"
  },
  "ko": "학교 밖에서 한 활동(자격증, 사회봉사, 인턴 등)을 정해진 기준으로 학점으로 인정해 주는 제도예요.",
  "en": "A system that counts outside activities (certificates, volunteering, internships) as credits under set standards.",
  "zh": "把校外活动(资格证、社会服务、实习等)按规定标准认定为学分的制度。",
  "ja": "学外での活動(資格、ボランティア、インターンなど)を基準に従って単位として認める制度です。",
  "prompt": false,
  "alt": [
   "학점 인정"
  ]
 },
 "현장실습": {
  "tr": {
   "en": "field practice (internship semester)",
   "zh": "现场实习",
   "ja": "現場実習"
  },
  "ko": "회사나 기관에서 일하며 배우고 학점을 받는 실습이에요. 지원 기간, 선발, 기간이 따로 정해져 있어요.",
  "en": "Practical training where you work at a company or organization and earn credits. Application period, selection, and duration are set separately.",
  "zh": "在企业或机构边工作边学习并获得学分的实习,申请时间、选拔和期限另有规定。",
  "ja": "会社や機関で働きながら学び、単位を得る実習です。応募期間、選考、期間は別に決まっています。",
  "prompt": false,
  "alt": [
   "현장실습학기제"
  ]
 },
 "인턴": {
  "tr": {
   "en": "internship",
   "zh": "实习",
   "ja": "インターンシップ"
  },
  "ko": "정식 직원이 되기 전에 짧은 기간 일해 보는 경험이에요.",
  "en": "A short period of work experience before becoming a regular employee.",
  "zh": "成为正式员工之前短期工作的经历。",
  "ja": "正社員になる前に短期間働いてみる経験です。",
  "prompt": false,
  "alt": [
   "인턴십"
  ]
 },
 "캡스톤디자인": {
  "tr": {
   "en": "capstone design",
   "zh": "毕业设计(Capstone)",
   "ja": "キャップストーンデザイン"
  },
  "ko": "그동안 배운 것을 모아 실제 문제를 해결하는 작품이나 프로젝트를 만드는 수업이에요.",
  "en": "A course where you apply what you learned to build a project that solves a real problem.",
  "zh": "综合所学知识、完成解决实际问题的作品或项目的课程。",
  "ja": "これまで学んだことを活かして実際の課題を解決する作品やプロジェクトを作る授業です。",
  "prompt": false,
  "alt": [
   "캡스톤"
  ]
 },
 "졸업논문": {
  "tr": {
   "en": "graduation thesis / project",
   "zh": "毕业论文(毕业作品)",
   "ja": "卒業論文(卒業制作)"
  },
  "ko": "졸업을 위해 제출하는 논문이나 작품이에요. 학과마다 필요 여부와 기준이 달라요.",
  "en": "A thesis or project submitted to graduate. Whether it is needed, and the standard, differ by department.",
  "zh": "毕业时提交的论文或作品,是否需要及标准因院系而异。",
  "ja": "卒業のために提出する論文や作品です。必要かどうかや基準は学科ごとに違います。",
  "prompt": false,
  "alt": [
   "졸업작품",
   "졸업 논문"
  ]
 },
 "원격수업": {
  "tr": {
   "en": "remote (online) class",
   "zh": "远程授课(线上课)",
   "ja": "遠隔授業(オンライン授業)"
  },
  "ko": "교실이 아니라 인터넷으로 듣는 수업이에요. 실시간(정해진 시간에 접속)과 녹화 강의가 있어요.",
  "en": "A class taken over the internet instead of in a classroom. It can be live (at a set time) or recorded.",
  "zh": "不在教室而通过网络上的课程,分实时直播(规定时间在线)和录播两种。",
  "ja": "教室ではなくインターネットで受ける授業です。リアルタイム(決まった時間に接続)と録画があります。",
  "prompt": false,
  "alt": [
   "온라인 강의",
   "실시간온라인",
   "비대면 수업",
   "화상수업"
  ]
 },
 "K-MOOC": {
  "tr": {
   "en": "K-MOOC",
   "zh": "K-MOOC(韩国慕课)",
   "ja": "K-MOOC"
  },
  "ko": "대학이 만든 강의를 누구나 인터넷으로 들을 수 있는 한국의 온라인 공개강좌예요. 학교 기준에 따라 학점으로 인정되기도 해요.",
  "en": "Korea's free online open courses made by universities. Some count as credits under school rules.",
  "zh": "韩国由大学制作的在线公开课程,任何人都可以学习,有的可按学校规定认定学分。",
  "ja": "大学が作った講義を誰でもインターネットで受けられる韓国のオンライン公開講座です。大学の基準で単位認定されることもあります。",
  "prompt": false,
  "alt": [
   "케이무크",
   "KMOOC"
  ]
 },
 "학점교류": {
  "tr": {
   "en": "credit exchange",
   "zh": "学分互换",
   "ja": "単位交流"
  },
  "ko": "협약을 맺은 다른 대학의 수업을 듣고 학점을 인정받는 제도예요.",
  "en": "Taking classes at a partner university and having the credits recognized.",
  "zh": "修读协议高校的课程并认定学分的制度。",
  "ja": "協定を結んだ他大学の授業を受けて単位を認めてもらう制度です。",
  "prompt": false
 },
 "대외활동": {
  "tr": {
   "en": "external activity",
   "zh": "校外活动",
   "ja": "対外活動"
  },
  "ko": "학교 밖 기관이 여는 서포터즈, 봉사, 공모전, 캠프 같은 활동이에요.",
  "en": "Activities run by outside organizations, such as supporters, volunteering, contests, and camps.",
  "zh": "校外机构举办的宣传大使、志愿、竞赛、营地等活动。",
  "ja": "学外の機関が行うサポーターズ、ボランティア、コンテスト、キャンプなどの活動です。",
  "prompt": false
 },
 "공모전": {
  "tr": {
   "en": "contest (competition)",
   "zh": "征集比赛(竞赛)",
   "ja": "コンテスト(公募展)"
  },
  "ko": "아이디어, 디자인, 글 같은 작품을 내서 상을 받는 대회예요. 마감일과 제출 형식을 꼭 확인하세요.",
  "en": "A competition where you submit ideas, designs, or writing for prizes. Check the deadline and submission format.",
  "zh": "提交创意、设计、文章等作品争取奖项的比赛,请务必确认截止日期和提交格式。",
  "ja": "アイデアやデザイン、文章などの作品を出して賞を競う大会です。締切と提出形式を必ず確認してください。",
  "prompt": false
 },
 "서포터즈": {
  "tr": {
   "en": "supporters (promo team)",
   "zh": "宣传大使(服务团)",
   "ja": "サポーターズ"
  },
  "ko": "기관이나 기업의 활동을 SNS 등으로 알리는 학생 홍보단이에요.",
  "en": "A student promotion team that spreads an organization's or company's activities, e.g. on social media.",
  "zh": "通过社交媒体等宣传机构或企业活动的学生宣传团。",
  "ja": "機関や企業の活動をSNSなどで広める学生の広報チームです。",
  "prompt": false
 },
 "멘토링": {
  "tr": {
   "en": "mentoring",
   "zh": "导师辅导(Mentoring)",
   "ja": "メンタリング"
  },
  "ko": "경험이 많은 선배나 전문가가 후배를 도와주는 프로그램이에요.",
  "en": "A program where experienced seniors or experts help junior students.",
  "zh": "由经验丰富的学长或专家帮助后辈的项目。",
  "ja": "経験豊富な先輩や専門家が後輩を支援するプログラムです。",
  "prompt": false,
  "alt": [
   "멘토"
  ]
 },
 "버디": {
  "tr": {
   "en": "buddy program",
   "zh": "伙伴(Buddy)项目",
   "ja": "バディプログラム"
  },
  "ko": "유학생이 학교와 한국 생활에 적응하도록 한국 학생이 짝이 되어 도와주는 프로그램이에요.",
  "en": "A program where a Korean student is paired with an international student to help them adjust to school and life in Korea.",
  "zh": "韩国学生与留学生结对,帮助留学生适应学校和韩国生活的项目。",
  "ja": "留学生が学校や韓国での生活に慣れるよう、韓国人学生がペアになって手助けするプログラムです。",
  "prompt": false,
  "alt": [
   "버디 프로그램"
  ]
 },
 "채용설명회": {
  "tr": {
   "en": "recruitment briefing",
   "zh": "招聘说明会",
   "ja": "採用説明会"
  },
  "ko": "회사가 하는 일과 뽑는 사람, 지원 방법을 직접 설명하는 행사예요.",
  "en": "An event where a company explains its work, who it is hiring, and how to apply.",
  "zh": "企业亲自介绍业务、招聘对象和申请方法的活动。",
  "ja": "企業が事業内容や募集人材、応募方法を直接説明する行事です。",
  "prompt": false,
  "alt": [
   "채용 설명회"
  ]
 },
 "서류전형": {
  "tr": {
   "en": "document screening",
   "zh": "材料筛选(资料审查)",
   "ja": "書類選考"
  },
  "ko": "지원서와 이력서 같은 서류로 먼저 뽑는 단계예요. 통과하면 면접을 봐요.",
  "en": "The first selection stage using documents such as the application and resume. If you pass, you go to the interview.",
  "zh": "先通过申请表、简历等材料进行筛选的阶段,通过后参加面试。",
  "ja": "応募書類や履歴書などでまず選ぶ段階です。通過すると面接に進みます。",
  "prompt": false,
  "alt": [
   "서류 전형",
   "서류심사"
  ]
 },
 "면접": {
  "tr": {
   "en": "interview",
   "zh": "面试",
   "ja": "面接"
  },
  "ko": "지원한 곳 사람들과 직접 만나 이야기하며 평가받는 단계예요.",
  "en": "A stage where you meet and talk with people from the place you applied to be evaluated.",
  "zh": "与应聘单位的人直接见面交谈并接受评估的阶段。",
  "ja": "応募先の人と直接会って話し、評価を受ける段階です。",
  "prompt": false
 },
 "이력서": {
  "tr": {
   "en": "resume (CV)",
   "zh": "简历",
   "ja": "履歴書"
  },
  "ko": "내 정보, 학력, 경험을 정리한 서류예요.",
  "en": "A document summarizing your information, education, and experience.",
  "zh": "整理个人信息、学历和经历的文件。",
  "ja": "自分の情報、学歴、経験をまとめた書類です。",
  "prompt": false
 },
 "포트폴리오": {
  "tr": {
   "en": "portfolio",
   "zh": "作品集",
   "ja": "ポートフォリオ"
  },
  "ko": "내가 만든 작품이나 프로젝트를 모아 보여 주는 자료예요.",
  "en": "A collection that shows the works or projects you made.",
  "zh": "汇集并展示自己作品或项目的资料。",
  "ja": "自分が作った作品やプロジェクトをまとめて見せる資料です。",
  "prompt": false
 },
 "공채": {
  "tr": {
   "en": "open recruitment",
   "zh": "公开招聘",
   "ja": "公開採用"
  },
  "ko": "회사가 정해진 기간에 공개로 많은 사람을 한꺼번에 뽑는 방식이에요.",
  "en": "A method where a company openly hires many people at once in a set period.",
  "zh": "企业在规定时间内公开一次性招聘多人的方式。",
  "ja": "企業が決まった期間に公開で多くの人を一括採用する方式です。",
  "prompt": false,
  "alt": [
   "공개채용"
  ]
 },
 "수시채용": {
  "tr": {
   "en": "rolling recruitment",
   "zh": "随时招聘",
   "ja": "随時採用"
  },
  "ko": "필요할 때마다 정해진 때 없이 사람을 뽑는 방식이에요.",
  "en": "A method of hiring whenever needed, without a fixed season.",
  "zh": "有需要时不定期招人的方式。",
  "ja": "必要なときに時期を決めず採用する方式です。",
  "prompt": false,
  "alt": [
   "상시채용"
  ]
 },
 "아르바이트": {
  "tr": {
   "en": "part-time job",
   "zh": "兼职(打工)",
   "ja": "アルバイト"
  },
  "ko": "수업 외 시간에 짧게 하는 일이에요. 유학생은 비자에 따라 허가가 필요해요.",
  "en": "Short work done outside class hours. International students need permission depending on their visa.",
  "zh": "课余时间做的短期工作。留学生需根据签证类型获得许可。",
  "ja": "授業以外の時間に短時間行う仕事です。留学生はビザによって許可が必要です。",
  "prompt": false,
  "alt": [
   "알바"
  ]
 },
 "통역": {
  "tr": {
   "en": "interpreting",
   "zh": "口译",
   "ja": "通訳"
  },
  "ko": "서로 다른 언어를 쓰는 사람들 사이에서 말을 바로 옮겨 주는 일이에요.",
  "en": "Converting spoken words on the spot between people who use different languages.",
  "zh": "在使用不同语言的人之间当场转换口语的工作。",
  "ja": "異なる言語を話す人たちの間で、話を即座に訳す仕事です。",
  "prompt": false,
  "alt": [
   "통번역"
  ]
 },
 "제출서류": {
  "tr": {
   "en": "required documents",
   "zh": "提交材料",
   "ja": "提出書類"
  },
  "ko": "신청할 때 함께 내야 하는 서류예요. 하나라도 빠지면 접수가 안 될 수 있어요.",
  "en": "Documents you must submit with your application. If one is missing, it may not be accepted.",
  "zh": "申请时必须一并提交的材料,缺少任何一项都可能无法受理。",
  "ja": "申請時に一緒に出す必要のある書類です。ひとつでも欠けると受け付けられないことがあります。",
  "prompt": false,
  "alt": [
   "제출 서류",
   "구비서류",
   "증빙서류"
  ]
 },
 "접수": {
  "tr": {
   "en": "submission / registration",
   "zh": "受理(报名)",
   "ja": "受付"
  },
  "ko": "신청서나 서류를 받는 것(또는 내는 것)이에요. 접수 기간이 끝나면 낼 수 없어요.",
  "en": "Receiving (or submitting) applications or documents. You cannot submit after the period ends.",
  "zh": "接收(或提交)申请表或材料,受理期结束后不能再提交。",
  "ja": "申請書や書類を受け取る(または出す)ことです。受付期間が終わると提出できません。",
  "prompt": false
 },
 "선착순": {
  "tr": {
   "en": "first come, first served",
   "zh": "先到先得",
   "ja": "先着順"
  },
  "ko": "신청한 순서대로 정원까지 받는 방식이에요. 빨리 신청할수록 유리해요.",
  "en": "Accepting applicants in order of arrival until the quota is full. Applying early helps.",
  "zh": "按申请先后顺序录取直到名额满,越早申请越有利。",
  "ja": "申込み順に定員まで受け付ける方式です。早く申し込むほど有利です。",
  "prompt": false
 },
 "선발": {
  "tr": {
   "en": "selection",
   "zh": "选拔",
   "ja": "選抜"
  },
  "ko": "신청한 사람 중에서 기준에 따라 몇 명을 고르는 일이에요.",
  "en": "Choosing some applicants according to criteria.",
  "zh": "依据标准从申请者中选出若干人。",
  "ja": "応募者の中から基準に従って何人かを選ぶことです。",
  "prompt": false
 },
 "최종합격": {
  "tr": {
   "en": "final acceptance",
   "zh": "最终录取",
   "ja": "最終合格"
  },
  "ko": "모든 단계를 통과해 최종으로 뽑힌 것이에요.",
  "en": "Passing every stage and being finally selected.",
  "zh": "通过所有阶段后最终被录取。",
  "ja": "すべての段階を通過して最終的に選ばれることです。",
  "prompt": false,
  "alt": [
   "최종 합격"
  ]
 },
 "마감": {
  "tr": {
   "en": "deadline",
   "zh": "截止",
   "ja": "締切"
  },
  "ko": "신청이나 제출을 할 수 있는 마지막 날짜와 시각이에요. 보통 그 시각이 지나면 받아 주지 않아요.",
  "en": "The last date and time you can apply or submit. After it, submissions are usually not accepted.",
  "zh": "可以申请或提交的最后日期和时间,过后通常不再受理。",
  "ja": "申込みや提出ができる最終の日時です。過ぎると通常は受け付けてもらえません。",
  "prompt": false
 },
 "접수기간": {
  "tr": {
   "en": "application period",
   "zh": "申请期限",
   "ja": "申込期間"
  },
  "ko": "신청할 수 있는 시작일부터 마감일까지의 기간이에요.",
  "en": "The period from the opening date to the deadline when you can apply.",
  "zh": "从开始日到截止日之间可以申请的时间段。",
  "ja": "申込みができる開始日から締切日までの期間です。",
  "prompt": false,
  "alt": [
   "신청기간",
   "신청 기간"
  ]
 },
 "대면": {
  "tr": {
   "en": "in person",
   "zh": "线下(面对面)",
   "ja": "対面"
  },
  "ko": "직접 만나서 하는 방식이에요(온라인이 아닌 현장).",
  "en": "Done in person, not online.",
  "zh": "当面进行(非线上)。",
  "ja": "直接会って行う方式です(オンラインではなく現場で)。",
  "prompt": false
 },
 "비대면": {
  "tr": {
   "en": "non-face-to-face (online)",
   "zh": "线上(非面对面)",
   "ja": "非対面(オンライン)"
  },
  "ko": "직접 만나지 않고 인터넷으로 하는 방식이에요.",
  "en": "Done over the internet without meeting in person.",
  "zh": "不见面、通过网络进行。",
  "ja": "直接会わずインターネットで行う方式です。",
  "prompt": false
 },
 "유학생": {
  "tr": {
   "en": "international student",
   "zh": "留学生",
   "ja": "留学生"
  },
  "ko": "외국 국적으로 한국 대학에서 공부하는 학생이에요. 비자·보험·한국어 등 별도 안내가 많아요.",
  "en": "A student with foreign nationality studying at a Korean university. There is a lot of separate guidance on visas, insurance, and Korean.",
  "zh": "以外国国籍在韩国大学学习的学生,签证、保险、韩语等有许多单独的说明。",
  "ja": "外国籍で韓国の大学で学ぶ学生です。ビザ、保険、韓国語などの別案内が多いです。",
  "prompt": false,
  "alt": [
   "외국인 학생",
   "외국인유학생"
  ]
 },
 "비자": {
  "tr": {
   "en": "visa / status of stay",
   "zh": "签证(居留资格)",
   "ja": "ビザ(在留資格)"
  },
  "ko": "한국에 머물 수 있는 자격이에요. 유학생은 보통 학생비자(D-2, D-4 등)이고, 종류에 따라 할 수 있는 일이 달라요.",
  "en": "Your legal permission to stay in Korea. Students usually hold a student visa (D-2, D-4, etc.), and what you may do depends on the type.",
  "zh": "在韩国居留的资格。留学生通常持学生签证(D-2、D-4等),类型不同可做的事也不同。",
  "ja": "韓国に滞在できる資格です。留学生は通常、留学ビザ(D-2、D-4など)で、種類によってできることが違います。",
  "prompt": false,
  "alt": [
   "사증",
   "체류자격",
   "체류 자격"
  ]
 },
 "외국인등록": {
  "tr": {
   "en": "alien registration (ARC)",
   "zh": "外国人登录(外国人登录证)",
   "ja": "外国人登録(在留カード)"
  },
  "ko": "입국 후 일정 기간 안에 출입국·외국인관서에 가서 하는 등록이에요. 외국인등록증은 한국 생활의 기본 신분증 역할을 해요.",
  "en": "Registration at the immigration office within a set time after arrival. The ARC acts as your basic ID in Korea.",
  "zh": "入境后在规定期限内到出入境管理机构办理的登记。外国人登录证是在韩国生活的基本身份证件。",
  "ja": "入国後一定期間内に出入国・外国人官署で行う登録です。外国人登録証は韓国生活の基本的な身分証になります。",
  "prompt": false,
  "alt": [
   "외국인등록증",
   "체류카드"
  ]
 },
 "체류기간연장": {
  "tr": {
   "en": "extension of stay",
   "zh": "延长居留期限",
   "ja": "在留期間の延長"
  },
  "ko": "비자에 적힌 체류 기한이 끝나기 전에 출입국·외국인관서에서 연장 신청을 하는 일이에요. 기한이 지나면 불법체류가 될 수 있어요.",
  "en": "Applying at the immigration office to extend your stay before the visa deadline. Missing the deadline can make your stay illegal.",
  "zh": "在签证上的居留期限届满前向出入境管理机构申请延期。逾期可能成为非法滞留。",
  "ja": "ビザの在留期限が切れる前に出入国・外国人官署で延長を申請することです。期限を過ぎると不法滞在になる可能性があります。",
  "prompt": false,
  "alt": [
   "체류기간 연장",
   "비자 연장",
   "체류 연장"
  ]
 },
 "시간제취업": {
  "tr": {
   "en": "part-time work permit",
   "zh": "兼职就业许可",
   "ja": "アルバイト許可(資格外活動)"
  },
  "ko": "유학생이 아르바이트를 하려면 미리 출입국·외국인관서에서 받는 허가예요. 허가 없이 일하면 처벌받을 수 있어요.",
  "en": "Permission that international students must obtain from the immigration office before working part-time. Working without it can be punished.",
  "zh": "留学生打工前需先向出入境管理机构取得的许可。未经许可工作可能受处罚。",
  "ja": "留学生がアルバイトをするために事前に出入国・外国人官署で受ける許可です。許可なく働くと処罰されることがあります。",
  "prompt": false,
  "alt": [
   "시간제 취업",
   "시간제취업허가"
  ]
 },
 "한국어능력": {
  "tr": {
   "en": "Korean proficiency",
   "zh": "韩语能力",
   "ja": "韓国語能力"
  },
  "ko": "한국어를 얼마나 잘하는지를 말해요. 학교 입학, 졸업, 장학금 조건에 TOPIK 급수가 쓰이기도 해요.",
  "en": "How well you speak Korean. TOPIK levels are sometimes used for admission, graduation, or scholarship conditions.",
  "zh": "指韩语水平。入学、毕业、奖学金条件中有时会用TOPIK等级。",
  "ja": "韓国語の力のことです。入学・卒業・奨学金の条件にTOPIKの級が使われることもあります。",
  "prompt": false,
  "alt": [
   "한국어 능력",
   "한국어능력시험"
  ]
 },
 "어학연수": {
  "tr": {
   "en": "language training program",
   "zh": "语言研修",
   "ja": "語学研修"
  },
  "ko": "외국어를 배우기 위해 그 나라나 학교에서 일정 기간 공부하는 과정이에요.",
  "en": "A program of studying a language for a period in that country or at a school.",
  "zh": "为学习外语而在该国或学校学习一段时间的课程。",
  "ja": "外国語を学ぶためにその国や学校で一定期間学ぶ課程です。",
  "prompt": false
 },
 "국제교류": {
  "tr": {
   "en": "international exchange",
   "zh": "国际交流",
   "ja": "国際交流"
  },
  "ko": "외국 대학이나 학생과 교류하는 활동이에요(교환학생, 해외 연수, 국제 행사 등).",
  "en": "Activities connecting with foreign universities and students (exchange, overseas training, international events).",
  "zh": "与外国大学和学生开展的交流活动(交换生、海外研修、国际活动等)。",
  "ja": "外国の大学や学生と交流する活動です(交換留学、海外研修、国際行事など)。",
  "prompt": false
 },
 "자매대학": {
  "tr": {
   "en": "partner university",
   "zh": "姐妹(协议)大学",
   "ja": "姉妹大学(協定校)"
  },
  "ko": "학생 교환이나 학점 교류 협약을 맺은 외국(또는 다른) 대학이에요.",
  "en": "A university with which the school has an exchange or credit agreement.",
  "zh": "签订了学生交换或学分互换协议的外国(或其他)大学。",
  "ja": "学生交換や単位交流の協定を結んだ外国(または他の)大学です。",
  "prompt": false,
  "alt": [
   "협정대학",
   "협약대학"
  ]
 },
 "국민건강보험": {
  "tr": {
   "en": "national health insurance",
   "zh": "国民健康保险",
   "ja": "国民健康保険"
  },
  "ko": "병원비 부담을 줄여 주는 보험이에요. 유학생도 일정 조건에서 가입해야 하며 보험료가 있어요.",
  "en": "Insurance that reduces hospital costs. International students must enroll under certain conditions and pay premiums.",
  "zh": "减轻医疗费用负担的保险。留学生在一定条件下也需要参保并缴纳保险费。",
  "ja": "病院の費用負担を軽くする保険です。留学生も一定の条件で加入が必要で、保険料があります。",
  "prompt": false,
  "alt": [
   "건강보험",
   "유학생보험"
  ]
 },
 "하이코리아": {
  "tr": {
   "en": "HiKorea",
   "zh": "HiKorea(出入境网站)",
   "ja": "HiKorea(出入国サイト)"
  },
  "ko": "출입국·외국인 관련 민원(체류 연장, 방문 예약 등)을 온라인으로 하는 정부 사이트예요.",
  "en": "A government site for immigration and foreigner services such as stay extensions and visit reservations.",
  "zh": "在线办理出入境和外国人相关事务(延期、预约来访等)的政府网站。",
  "ja": "出入国・外国人関連の手続き(在留延長、来庁予約など)をオンラインで行う政府のサイトです。",
  "prompt": false,
  "alt": [
   "HiKorea"
  ]
 },
 "출입국": {
  "tr": {
   "en": "immigration office",
   "zh": "出入境管理机构",
   "ja": "出入国・外国人官署"
  },
  "ko": "비자, 체류 연장, 외국인등록을 처리하는 정부 기관이에요.",
  "en": "The government office that handles visas, stay extensions, and alien registration.",
  "zh": "办理签证、居留延期和外国人登录的政府机构。",
  "ja": "ビザ、在留延長、外国人登録を扱う政府機関です。",
  "prompt": false,
  "alt": [
   "출입국·외국인관서",
   "출입국외국인청",
   "출입국관리사무소"
  ]
 },
 "학사일정": {
  "tr": {
   "en": "academic calendar",
   "zh": "学事日程",
   "ja": "学事日程"
  },
  "ko": "개강, 수강신청, 시험, 방학 같은 한 해 학교 일정표예요.",
  "en": "The school's yearly schedule for semester start, registration, exams, and breaks.",
  "zh": "开学、选课、考试、假期等一年的学校日程表。",
  "ja": "開講、履修登録、試験、休みなど一年の学校日程表です。",
  "prompt": false,
  "alt": [
   "학사 일정"
  ]
 },
 "개강": {
  "tr": {
   "en": "start of semester",
   "zh": "开学",
   "ja": "開講(学期開始)"
  },
  "ko": "학기 수업이 시작되는 날이에요.",
  "en": "The day classes of a semester begin.",
  "zh": "学期课程开始的日子。",
  "ja": "学期の授業が始まる日です。",
  "prompt": false
 },
 "방학": {
  "tr": {
   "en": "school break",
   "zh": "假期",
   "ja": "長期休暇"
  },
  "ko": "학기가 끝나고 수업이 없는 긴 쉬는 기간이에요(여름·겨울).",
  "en": "The long break between semesters with no classes (summer and winter).",
  "zh": "学期结束后没有课的长假期(暑假、寒假)。",
  "ja": "学期が終わり授業がない長い休みの期間です(夏・冬)。",
  "prompt": false,
  "alt": [
   "동계방학",
   "하계방학"
  ]
 },
 "개인정보": {
  "tr": {
   "en": "personal information",
   "zh": "个人信息",
   "ja": "個人情報"
  },
  "ko": "이름, 연락처, 학번처럼 나를 알아볼 수 있는 정보예요. 신청할 때 수집·이용에 동의하라고 요청받아요.",
  "en": "Information that identifies you, like name, contact details, and student ID. You are often asked to consent to its collection and use.",
  "zh": "姓名、联系方式、学号等能识别你的信息。申请时常被要求同意收集和使用。",
  "ja": "氏名、連絡先、学籍番号など自分を特定できる情報です。申込み時に収集・利用への同意を求められます。",
  "prompt": false,
  "alt": [
   "개인 정보"
  ]
 },
 "동의서": {
  "tr": {
   "en": "consent form",
   "zh": "同意书",
   "ja": "同意書"
  },
  "ko": "정보 수집이나 활동 참여를 허락한다는 서류예요. 내용을 읽고 서명해요.",
  "en": "A document saying you agree to information collection or participation. Read it and sign.",
  "zh": "表示同意收集信息或参加活动的文件,需阅读后签名。",
  "ja": "情報収集や活動参加を認める書類です。内容を読んで署名します。",
  "prompt": false,
  "alt": [
   "개인정보 동의서"
  ]
 },
 "유의사항": {
  "tr": {
   "en": "notes / precautions",
   "zh": "注意事项",
   "ja": "注意事項"
  },
  "ko": "신청하기 전에 꼭 알아야 하는 주의할 점이에요. 놓치면 불이익이 있을 수 있어요.",
  "en": "Points you must know before applying. Missing them may lead to a disadvantage.",
  "zh": "申请前必须了解的注意点,忽略可能会吃亏。",
  "ja": "申込み前に必ず知っておくべき注意点です。見落とすと不利になることがあります。",
  "prompt": false,
  "alt": [
   "유의 사항",
   "안내사항"
  ]
 },
 "지원자격": {
  "tr": {
   "en": "eligibility",
   "zh": "申请资格",
   "ja": "応募資格"
  },
  "ko": "신청할 수 있는 사람의 조건이에요(학년, 학과, 성적, 국적 등). 먼저 나에게 해당되는지 확인하세요.",
  "en": "The conditions for who can apply (year, department, grades, nationality, etc.). Check first whether you qualify.",
  "zh": "可以申请的人的条件(年级、院系、成绩、国籍等),请先确认自己是否符合。",
  "ja": "申込みできる人の条件です(学年、学科、成績、国籍など)。まず自分が該当するか確認してください。",
  "prompt": false,
  "alt": [
   "지원 자격",
   "신청자격",
   "신청 자격",
   "응시자격"
  ]
 },
 "봉사활동": {
  "tr": {
   "en": "volunteer activity",
   "zh": "志愿服务",
   "ja": "ボランティア活動"
  },
  "ko": "대가 없이 다른 사람이나 사회를 돕는 활동이에요. 학교 기준으로 시간이 학점이나 졸업요건이 되기도 해요.",
  "en": "Helping others or society without pay. Under school rules the hours may count as credits or graduation requirements.",
  "zh": "不求报酬地帮助他人或社会的活动。按学校规定,时长可能计入学分或毕业要求。",
  "ja": "対価なく他の人や社会を助ける活動です。大学の基準で時間が単位や卒業要件になることもあります。",
  "prompt": false,
  "alt": [
   "사회봉사"
  ]
 }
}/*JSON-END*/;

  root.GONGJI_GLOSSARY = GLOSSARY;
  if (typeof module !== 'undefined' && module.exports) module.exports = GLOSSARY;
})(typeof window !== 'undefined' ? window : globalThis);
