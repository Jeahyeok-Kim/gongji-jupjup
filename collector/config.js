// 사이트별 수집 대상 게시판 목록 (콘텐츠 스크립트와 팝업이 함께 사용)
// menu: 학교 사이트의 MENU_ID. 게시판 파라미터(SITE_NO, BOARD_SEQ 등)는 실행 시 해당 메뉴 페이지에서 읽어옵니다.
// news: true 이면 '최대 건수' 옵션을 적용합니다. off: true 이면 기본 체크 해제.
globalThis.KKU_BOARDS = {
  'www.kku.ac.kr': [
    { menu: 1740, name: '학사공지' },
    { menu: 1750, name: '장학공지' },
    { menu: 1760, name: '국제교류' },
    { menu: 1770, name: '취업/창업' },
    { menu: 1780, name: '입찰공지' },
    { menu: 1790, name: '일반공지' },
    { menu: 1800, name: '채용공지' },
    { menu: 1810, name: '투데이뉴스', news: true },
    { menu: 1820, name: '행사안내' },
    { menu: 1830, name: '사회봉사' },
    { menu: 1840, name: '아르바이트' },
    { menu: 1850, name: '외부행사/공모전' },
    { menu: 1860, name: 'Q&A', off: true, note: '개인 문의가 섞여 있을 수 있어 기본 해제' },
    { menu: 1870, name: '교직원 자료실', off: true, note: '학생 대상 정보가 아니어서 기본 해제' },
    { menu: 1880, name: '학생 자료실' }
  ],
  'int.kku.ac.kr': [
    { menu: 80, name: '국제교육원 공지사항' },
    { menu: 230, name: '유학생 공지 (留学生公告栏)' }
  ],
  'ids.kku.ac.kr': [
    { menu: 950, name: 'AX융합학부 공지사항' }
  ]
};

// 학교 기본 정보 (학기마다 한 번 받으면 되는 것): 학사일정, 요람, 안내 페이지, 규정
globalThis.KKU_REFERENCE = {
  // www.kku.ac.kr 에서
  scheduleSiteNo: 2,                 // 연간주요일정(MENU_ID=1350)의 GLOCAL 캠퍼스 번호
  yoramMenu: 590,                    // 요람 게시판
  pages: [                           // 글로 된 안내 페이지 (본문 글자만 저장)
    { menu: 650, name: '주요 전화번호' },
    { menu: 1320, name: '학사 종합안내' },
    { menu: 1080, name: '장학안내' },
    { menu: 1090, name: '통학교통 안내' },
    { menu: 1120, name: '예비군' },
    { menu: 1390, name: '증명서 발급(학부생)' }
  ],
  // rule.konkuk.ac.kr (규정정보시스템) 에서 받을 규정 이름 (앞 번호는 빼고 적음)
  rules: [
    '건국대학교 학칙',
    'GLOCAL(글로컬)캠퍼스 장학규정',
    '장학규정',
    'GLOCAL(글로컬)캠퍼스 외국인학생에 관한 학사시행내규',
    'GLOCAL(글로컬)캠퍼스 비교과 프로그램 운영 내규',
    'GLOCAL(글로컬)캠퍼스 현장실습학기제 운영 및 학점 인정에 관한 내규',
    'GLOCAL(글로컬)캠퍼스 원격수업 운영 내규',
    'GLOCAL(글로컬)캠퍼스 K-MOOC강좌 학점인정 시행내규',
    '건국대학교 생활관규정',
    '건국대학교 외국대학과의 학생교류에 관한 내규',
    '사회봉사 학점인정 운영요강',
    'GLOCAL(글로컬)캠퍼스 창업인턴십 학점인정제 운영에 관한 내규',
    'GLOCAL(글로컬)캠퍼스 학습경험 학점인정제(RPL) 내규',
    '건국대학교 학생준수규정'
  ]
};
