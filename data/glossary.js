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
  "ja": "単位とは関係なく学校が開く特別講義・キャンプ・相談などのプログラムです。"
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
 }
}/*JSON-END*/;

  root.GONGJI_GLOSSARY = GLOSSARY;
  if (typeof module !== 'undefined' && module.exports) module.exports = GLOSSARY;
})(typeof window !== 'undefined' ? window : globalThis);
