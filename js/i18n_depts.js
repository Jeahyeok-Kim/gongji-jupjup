// 건국대학교 GLOCAL캠퍼스 학과명 및 교과목 4개국어(한·영·중·일) 번역 및 양방향 검색 모듈
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GongjiDeptI18n = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEPARTMENTS = [
    { ko: '컴퓨터공학과', en: 'Computer Science & Engineering', ja: 'コンピュータ工学科', zh: '计算机工学系', aliases: ['cs', 'cse', 'computer', 'coomputer', 'computor', 'comp', '컴공', '컴퓨터', '컴공과', '소프트웨어', 'sw', 'コンピュータ', 'コン工', '计算机', '电脑'] },
    { ko: '경영학과', en: 'Business Administration', ja: '経営学科', zh: '经营学系', aliases: ['biz', 'business', '경영', '경영학', '경영과', '経営', '商务', '工商管理'] },
    { ko: '경제통상학과', en: 'Economics & International Trade', ja: '経済通商学科', zh: '经济通商学系', aliases: ['econ', 'trade', '경제', '통상', '경제학과', '経済', '贸易'] },
    { ko: '경찰학과', en: 'Police Science', ja: '警察学科', zh: '警察学系', aliases: ['police', '경찰', '경행', '경찰학', '警察'] },
    { ko: '간호학과', en: 'Nursing', ja: '看護学科', zh: '护理学系', aliases: ['nursing', '간호', '간호학', '看護', '护理'] },
    { ko: '소방방재융합학과', en: 'Fire & Disaster Prevention Engineering', ja: '消防防災融合学科', zh: '消防防灾融合学系', aliases: ['fire', '소방', '방재', '소방방재', '소방방재학과', '消防'] },
    { ko: '시스템반도체학과', en: 'System Semiconductor', ja: 'システム半導体学科', zh: '系统半导体学系', aliases: ['semiconductor', '반도체', '시반', '시스템반도체', '半導体', '半导体'] },
    { ko: '배터리산업학과', en: 'Battery Industry', ja: 'バッテリー産業学科', zh: '电池产业学系', aliases: ['battery', '배터리', '이차전지', '배터리학과', '二次電池', '电池'] },
    { ko: '메카트로닉스공학과', en: 'Mechatronics Engineering', ja: 'メカトロニクス工学科', zh: '机电一体化工学系', aliases: ['mechatronics', 'mecha', '메카', '메카트로닉스', '메카과', 'メカトロ', '机电'] },
    { ko: '에너지신소재공학과', en: 'Energy & Advanced Materials', ja: 'エネルギー新素材工学科', zh: '能源新材料工学系', aliases: ['materials', '신소재', '에너지', '신소재공학', '新素材', '新材料'] },
    { ko: '바이오메디컬공학과', en: 'Biomedical Engineering', ja: 'バイオメディカル工学科', zh: '生物医学工学系', aliases: ['bme', 'biomedical', '의공학', '바이오메디컬', '生物医学'] },
    { ko: '바이오의약학과', en: 'Biopharmaceuticals', ja: 'バイオ医薬学科', zh: '生物医药学系', aliases: ['pharma', 'biopharm', '바이오의약', '제약', '제약공학', '医薬', '生物医药'] },
    { ko: '생명공학과', en: 'Biotechnology', ja: '生命工学科', zh: '生命工学系', aliases: ['biotech', 'bt', '생명공학', '생공', '생명과', 'バイオ', '生物工程'] },
    { ko: '응용화학과', en: 'Applied Chemistry', ja: '応用化学科', zh: '应用化学系', aliases: ['chem', 'chemistry', '화학', '응용화학', '화학과', '応用化学', '化学'] },
    { ko: '녹색기술융합학과', en: 'Green Technology Convergence', ja: 'グリーン技術融合学科', zh: '绿色技术融合学系', aliases: ['green', '녹색기술', '환경', '환경공학', '环境'] },
    { ko: '식품영양학과', en: 'Food & Nutrition', ja: '食品栄養学科', zh: '食品营养学系', aliases: ['food', 'nutrition', '식영', '식품영양', '식영과', '食品栄養', '营养'] },
    { ko: '뷰티화장품학과', en: 'Beauty & Cosmetics', ja: 'ビューティー化粧品学科', zh: '美容化妆品学系', aliases: ['beauty', 'cosmetics', '화장품', '뷰티', '뷰티학과', '化粧品', '化妆品'] },
    { ko: '스포츠건강학과', en: 'Sports & Health', ja: 'スポーツ健康学科', zh: '运动健康学系', aliases: ['sports', '스포츠', '체육', '스건', '体育', '运动'] },
    { ko: '골프산업학과', en: 'Golf Industry', ja: 'ゴルフ産業学科', zh: '高尔夫产业学系', aliases: ['golf', '골프', '골프학과', 'ゴルフ', '高尔夫'] },
    { ko: '산업디자인학과', en: 'Industrial Design', ja: '産業デザイン学科', zh: '工业设计学系', aliases: ['industrial', '산디', '산업디자인', '산디과', '工设', '工业设计'] },
    { ko: '시각영상디자인학과', en: 'Visual & Motion Design', ja: '視覚映像デザイン学科', zh: '视觉影像设计学系', aliases: ['visual', 'motion', '시디', '시각디자인', '영상디자인', '视传', '视觉设计'] },
    { ko: '실내디자인학과', en: 'Interior Design', ja: '室内デザイン学科', zh: '室内设计学系', aliases: ['interior', '실디', '실내디자인', '실디과', '인테리어', '室内设计'] },
    { ko: '패션디자인학과', en: 'Fashion Design', ja: 'ファッションデザイン学科', zh: '服装设计学系', aliases: ['fashion', '패디', '패션', '패션디자인', '의상', '服装', '服装设计'] },
    { ko: '조형예술학과', en: 'Plastic Arts & Fine Arts', ja: '造形芸術学科', zh: '造型艺术学系', aliases: ['arts', '조형', '회화', '미술', 'fine arts', '조형예술', '艺术'] },
    { ko: '미디어콘텐츠학과', en: 'Media Contents', ja: 'メディアコンテンツ学科', zh: '媒体内容学系', aliases: ['media', 'contents', '미디어', '콘텐츠', '미콘', '传媒'] },
    { ko: '신문방송학과', en: 'Journalism & Mass Communication', ja: '新聞放送学科', zh: '新闻传播学系', aliases: ['journalism', '신방', '신문방송', '언론', '방송', '传播', '新闻'] },
    { ko: '영어문화학과', en: 'English Language & Culture', ja: '英語文化学科', zh: '英语文化学系', aliases: ['english', 'eng', '영문', '영어', '영문과', '英语'] },
    { ko: '동화·한국어문화학과', en: 'Fairy Tales & Korean Culture', ja: '童話・韓国語文化学科', zh: '童话·韩国语文化学系', aliases: ['korean', '동화', '한국어', '국문', '동화학과', '韩语'] },
    { ko: '문헌정보학과', en: 'Library & Information Science', ja: '文献情報学科', zh: '图书情报学系', aliases: ['library', '문정', '문헌정보', '도서관', '문정과', '文献'] },
    { ko: '사회복지학과', en: 'Social Welfare', ja: '社会福祉学科', zh: '社会福利学系', aliases: ['welfare', '사복', '사회복지', '사복과', '社工', '福利'] },
    { ko: '유아교육과', en: 'Early Childhood Education', ja: '幼児教育科', zh: '幼儿教育学系', aliases: ['childhood', '유교', '유아교육', '유교과', '幼教'] },
    { ko: '의예과', en: 'Pre-Medicine', ja: '医学科予科', zh: '医学预科', aliases: ['premed', '의예', '의대', '의예과', '医学'] },
    { ko: '의학과', en: 'Medicine', ja: '医学科', zh: '医学系', aliases: ['med', 'medicine', '의학', '의대', '의학과'] },
    { ko: 'AI빅데이터전공', en: 'AI & Big Data', ja: 'AI・ビッグデータ専攻', zh: 'AI·大数据专业', aliases: ['ai', 'bigdata', '빅데이터', '인공지능', '인공지능학과', '에이아이'] },
    { ko: 'AX융합학부', en: 'AX Convergence Division', ja: 'AX融合学部', zh: 'AX融合学部', aliases: ['ax', 'ax융합', '인공지능전환'] },
    { ko: 'KU자유전공학부', en: 'KU Open Major Division', ja: 'KU自由専攻学部', zh: 'KU自由专业学部', aliases: ['free', '자전', '자유전공', '자유전공학부'] },
    { ko: '교양학부', en: 'General Education Division', ja: '教養学部', zh: '通识教育部', aliases: ['gened', '교양', '교양과목', '교양학'] },
    { ko: '교직과', en: 'Teaching Certification', ja: '教職課程', zh: '教师资格课程', aliases: ['teaching', '교직', '교원'] },
    { ko: '국제경영학과', en: 'International Business', ja: '国際経営学科', zh: '国际经营学系', aliases: ['ib', '국경', '국제경영', '국제경영학'] },
    { ko: '다문화·한국어교육전공', en: 'Multicultural & Korean Education', ja: '多文化・韓国語教育専攻', zh: '多元文化·韩国语教育专业', aliases: ['multicultural', '다문화', '한국어교육'] },
    { ko: '도시디자인융합전공', en: 'Urban Design Convergence', ja: '都市デザイン融合専攻', zh: '城市设计融合专业', aliases: ['urban', '도시', '도시디자인'] },
    { ko: '디자인대학', en: 'College of Design', ja: 'デザイン大学', zh: '设计学院', aliases: ['design', '디자인'] },
    { ko: '미디어영상학과', en: 'Media & Film', ja: 'メディア映像学科', zh: '媒体影像学系', aliases: ['film', '영상', '미디어영상'] },
    { ko: '바이오융합학과', en: 'Bio Convergence', ja: 'バイオ融合学科', zh: '生物融合学系', aliases: ['bio', '바이오융합'] },
    { ko: '반려동물융합전공', en: 'Companion Animal Studies', ja: '伴侶動物融合専攻', zh: '伴侣动物融合专业', aliases: ['pet', '반려동물', '동물'] },
    { ko: '배터리반도체융합산업전공', en: 'Battery & Semiconductor Convergence', ja: 'バッテリー半導体融合専攻', zh: '电池半导体融合专业', aliases: ['battery_semi', '배터리반도체'] },
    { ko: '빅데이터융합전공', en: 'Big Data Convergence', ja: 'ビッグデータ融合専攻', zh: '大数据融合专业', aliases: ['bigdata_conv', '빅데이터융합'] },
    { ko: '사회복지상담심리전공', en: 'Social Welfare & Counseling Psychology', ja: '社会福祉・相談心理専攻', zh: '社会福利·咨询心理专业', aliases: ['counseling', '상담심리', '사복상담'] },
    { ko: '상담심리전공', en: 'Counseling Psychology', ja: '相談心理専攻', zh: '咨询心理专业', aliases: ['psychology', '상담', '심리'] },
    { ko: '스마트푸드테크산업전공', en: 'Smart Food Tech Industry', ja: 'スマートフードテック産業専攻', zh: '智能食品科技产业专业', aliases: ['foodtech', '푸드테크'] },
    { ko: '창업경영전공', en: 'Entrepreneurship & Management', ja: '創業経営専攻', zh: '创业经营专业', aliases: ['startup', '창업', '창업경영'] },
    { ko: '전체(GLOCAL)', en: 'All GLOCAL', ja: '全体(GLOCAL)', zh: '全部(GLOCAL)', aliases: ['all', '전체', '공통'] }
  ];

  const COURSES = {
    '컴퓨터공학개론': { en: 'Intro to Computer Engineering', ja: 'コンピュータ工学概論', zh: '计算机工学概论' },
    '소프트웨어공학': { en: 'Software Engineering', ja: 'ソフトウェア工学', zh: '软件工程' },
    '자료구조': { en: 'Data Structures', ja: 'データ構造', zh: '数据结构' },
    '알고리즘': { en: 'Algorithms', ja: 'アルゴリズム', zh: '算法' },
    '운영체제': { en: 'Operating Systems', ja: 'オペレーティングシステム', zh: '操作系统' },
    '데이터베이스': { en: 'Database Systems', ja: 'データベース', zh: '数据库系统' },
    '컴퓨터네트워크': { en: 'Computer Networks', ja: 'コンピュータネットワーク', zh: '计算机网络' },
    '컴퓨터구조': { en: 'Computer Architecture', ja: 'コンピュータ構造', zh: '计算机体系结构' },
    '인공지능': { en: 'Artificial Intelligence', ja: '人工知能', zh: '人工智能' },
    '머신러닝과기계학습': { en: 'Machine Learning', ja: '機械学習', zh: '机器学习' },
    '머신러닝과 기계학습': { en: 'Machine Learning', ja: '機械学習', zh: '机器学习' },
    '머신러닝': { en: 'Machine Learning', ja: '機械学習', zh: '机器学习' },
    '딥러닝': { en: 'Deep Learning', ja: 'ディープラーニング', zh: '深度学习' },
    '디지털논리회로': { en: 'Digital Logic Circuits', ja: 'デジタル論理回路', zh: '数字逻辑电路' },
    '대학영어': { en: 'College English', ja: '大学英語', zh: '大学英语' },
    '이산수학': { en: 'Discrete Mathematics', ja: '離散数学', zh: '离散数学' },
    '토익1': { en: 'TOEIC 1', ja: 'TOEIC 1', zh: '托业 1' },
    '토익2': { en: 'TOEIC 2', ja: 'TOEIC 2', zh: '托业 2' },
    '지식발견머신러닝': { en: 'Knowledge Discovery & ML', ja: '知識発見機械学習', zh: '知识发现机器学习' },
    '슬로리딩과자기돌봄': { en: 'Slow Reading & Self-Care', ja: 'スローリーディングと自己配慮', zh: '慢读与自我关怀' },
    'Python프로그래밍': { en: 'Python Programming', ja: 'Pythonプログラミング', zh: 'Python程序设计' },
    '안드로이드프로그래밍': { en: 'Android Programming', ja: 'Androidプログラミング', zh: 'Android程序设计' },
    '영화음악의이해': { en: 'Understanding Film Music', ja: '映画音楽の理解', zh: '电影音乐的理解' },
    '객체지향프로그래밍': { en: 'Object-Oriented Programming', ja: 'オブジェクト指向プログラミング', zh: '面向对象程序设计' },
    '웹프로그래밍': { en: 'Web Programming', ja: 'Webプログラミング', zh: 'Web程序设计' },
    '시스템프로그래밍': { en: 'System Programming', ja: 'システムプログラミング', zh: '系统程序设计' }
  };

  // 오타 허용 거리 (Levenshtein distance)
  function editDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) costs[j] = j;
        else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  }

  // 학과 양방향 검색 (한국어, 영어, 일본어, 중국어, 약어, 오타 허용 모두 지원)
  function search(query, lang) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) {
      return DEPARTMENTS.map((d) => ({
        ko: d.ko,
        en: d.en,
        ja: d.ja,
        zh: d.zh,
        displayName: formatDept(d.ko, lang),
        value: d.ko
      }));
    }

    const hits = [];
    for (const d of DEPARTMENTS) {
      let score = 0;
      const koLower = d.ko.toLowerCase();
      const enLower = d.en.toLowerCase();
      const jaLower = d.ja.toLowerCase();
      const zhLower = d.zh.toLowerCase();

      if (koLower === q || enLower === q || jaLower === q || zhLower === q) score += 100;
      else if (koLower.startsWith(q) || enLower.startsWith(q) || jaLower.startsWith(q) || zhLower.startsWith(q)) score += 50;
      else if (koLower.includes(q) || enLower.includes(q) || jaLower.includes(q) || zhLower.includes(q)) score += 20;

      for (const al of d.aliases) {
        const alLower = al.toLowerCase();
        if (alLower === q) score += 85;
        else if (alLower.startsWith(q)) score += 45;
        else if (alLower.includes(q)) score += 18;
        else if (q.length >= 4 && editDistance(alLower, q) <= 2) score += 30; // 오타 허용 (예: coomputer)
      }

      // 영어 명칭 오타 허용
      if (score === 0 && q.length >= 5) {
        const enWords = enLower.split(/[\s&]+/);
        for (const w of enWords) {
          if (w.length >= 4 && editDistance(w, q) <= 2) {
            score += 25;
            break;
          }
        }
      }

      if (score > 0) {
        hits.push({
          score,
          ko: d.ko,
          en: d.en,
          ja: d.ja,
          zh: d.zh,
          displayName: formatDept(d.ko, lang),
          value: d.ko
        });
      }
    }

    hits.sort((a, b) => b.score - a.score);
    return hits;
  }

  // 학과명 표시 포맷: 외국어 모드일 때는 [현지어 (한국어)] 둘 다 병기
  function formatDept(deptName, lang) {
    const raw = String(deptName || '').trim();
    if (!raw) return '';
    const q = raw.toLowerCase();
    const item = DEPARTMENTS.find((d) =>
      d.ko === raw ||
      d.en.toLowerCase() === q ||
      d.ja === raw ||
      d.zh === raw ||
      d.aliases.some((a) => a.toLowerCase() === q || (q.length >= 4 && editDistance(a.toLowerCase(), q) <= 2))
    );
    if (!item) return raw;

    if (!lang || lang === 'ko') return item.ko;
    const localized = item[lang] || item.en || item.ko;
    return localized + ' (' + item.ko + ')';
  }

  // 입력된 다양한 학과명/약어/오타를 공식 한국어 학과명으로 변환
  function resolveDept(rawName) {
    const q = String(rawName || '').trim().toLowerCase();
    if (!q) return '';
    const item = DEPARTMENTS.find((d) =>
      d.ko.toLowerCase() === q ||
      d.en.toLowerCase() === q ||
      d.ja.toLowerCase() === q ||
      d.zh.toLowerCase() === q ||
      d.aliases.some((a) => a.toLowerCase() === q || (q.length >= 4 && editDistance(a.toLowerCase(), q) <= 2))
    );
    return item ? item.ko : rawName;
  }

  // 교과목명 4개국어 번역 및 한글 병기
  function formatCourse(courseName, lang) {
    const raw = String(courseName || '').trim();
    if (!raw) return '';
    if (!lang || lang === 'ko') return raw;

    // 1. 사전 일치 검색
    const hit = COURSES[raw];
    if (hit && hit[lang]) {
      return hit[lang] + ' (' + raw + ')';
    }

    // 2. 일반적인 학술 접미사 패턴 자동 번역
    let translated = raw;
    if (lang === 'en') {
      if (raw.endsWith('개론')) translated = 'Intro to ' + raw.slice(0, -2);
      else if (raw.endsWith('실습')) translated = raw.slice(0, -2) + ' Lab';
      else if (raw.endsWith('프로그래밍')) translated = raw.slice(0, -5) + ' Programming';
      else if (raw.endsWith('의이해') || raw.endsWith('의 이해')) translated = 'Understanding ' + raw.replace(/의\s*이해$/, '');
      else if (raw.endsWith('특론')) translated = 'Advanced ' + raw.slice(0, -2);
      else if (raw.endsWith('설계')) translated = raw.slice(0, -2) + ' Design';
    } else if (lang === 'ja') {
      if (raw.endsWith('개론')) translated = raw.slice(0, -2) + '概論';
      else if (raw.endsWith('실습')) translated = raw.slice(0, -2) + '実習';
      else if (raw.endsWith('프로그래밍')) translated = raw.slice(0, -5) + 'プログラミング';
      else if (raw.endsWith('의이해') || raw.endsWith('의 이해')) translated = raw.replace(/의\s*이해$/, '') + 'の理解';
      else if (raw.endsWith('특론')) translated = raw.slice(0, -2) + '特論';
      else if (raw.endsWith('설계')) translated = raw.slice(0, -2) + '設計';
    } else if (lang === 'zh') {
      if (raw.endsWith('개론')) translated = raw.slice(0, -2) + '概论';
      else if (raw.endsWith('실습')) translated = raw.slice(0, -2) + '实习';
      else if (raw.endsWith('프로그래밍')) translated = raw.slice(0, -5) + '程序设计';
      else if (raw.endsWith('의이해') || raw.endsWith('의 이해')) translated = raw.replace(/의\s*이해$/, '') + '的理解';
      else if (raw.endsWith('특론')) translated = raw.slice(0, -2) + '特论';
      else if (raw.endsWith('설계')) translated = raw.slice(0, -2) + '设计';
    }

    return translated !== raw ? (translated + ' (' + raw + ')') : raw;
  }

  return {
    DEPARTMENTS,
    COURSES,
    search,
    formatDept,
    resolveDept,
    formatCourse
  };
});
