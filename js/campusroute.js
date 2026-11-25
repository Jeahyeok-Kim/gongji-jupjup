// 건국대학교 GLOCAL캠퍼스 연강 동선 & 헐떡고개 10분 컷 판독기 및 시간표 연동 귀가/하교 교통 알리미
// 브라우저(window.GongjiCampusRoute)와 Node.js(단위 테스트) 양쪽에서 지원됩니다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GongjiCampusRoute = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 1. 캠퍼스 주요 건물 메타데이터 (고저차, 엘리베이터 유무, 층수, 대운동장 정류장 도보 거리)
  // 1. 캠퍼스 주요 건물 메타데이터 (공식 K/U 건물 번호, 다국어 명칭, 고저차, 엘리베이터 유무, 대운동장 도보 거리)
  const BUILDINGS = {
    '국제교육관': {
      code: 'U5',
      name: '국제교육관',
      names: { ko: '국제교육관', en: "Int'l Education Hall", ja: '国際教育館', zh: '国际教育馆' },
      aliases: ['국제관', '국제교육', '국제', 'U5', 'u5'],
      hasElevator: false, // 사용자 제보 및 실사: 엘리베이터 없음 (전 층 계단 보행)
      floors: 4,
      elevation: 90, // 저지대 (계곡/후문 부근)
      shuttleDistM: 520, // 대운동장(셔틀 정류장)까지 거리
      shuttleWalkMin: 8,
      zone: 'lower',
      note: '엘리베이터가 없어 전 층 계단 이동 필요. 캠퍼스 중앙 이동 시 급경사 헐떡고개 진입.'
    },
    '인문학관': {
      code: 'K6',
      name: '인문사회관',
      names: { ko: '인문사회관', en: 'Humanities & Social Sciences Hall', ja: '人文社会館', zh: '人文社科楼' },
      aliases: ['인문관', '인문학관', '인문사회관', '인문사회', '인문', 'K6', 'k6'],
      hasElevator: true,
      floors: 5,
      elevation: 112,
      shuttleDistM: 350,
      shuttleWalkMin: 5,
      zone: 'mid',
      note: '엘리베이터 운행. 종합강의동 및 중원도서관과 연결 완만.'
    },
    '글로벌이음관': {
      code: 'U11',
      name: '글로컬이음관',
      names: { ko: '글로컬이음관', en: 'GLOCAL Ieum Hall', ja: 'グローカルイウム館', zh: 'GLOCAL连接馆' },
      aliases: ['이음관', '글로벌이음관', '글로컬이음', '글로벌이음', 'U11', 'u11'],
      hasElevator: true,
      floors: 5,
      elevation: 110,
      shuttleDistM: 360,
      shuttleWalkMin: 5,
      zone: 'mid',
      note: '최신 시설 및 엘리베이터 운행.'
    },
    '중원도서관': {
      code: 'U7',
      name: '중원도서관',
      names: { ko: '중원도서관', en: 'Jungwon Library', ja: '中原図書館', zh: '中原图书馆' },
      aliases: ['도서관', '중도', 'U7', 'u7'],
      hasElevator: true,
      floors: 6,
      elevation: 115,
      shuttleDistM: 260,
      shuttleWalkMin: 4,
      zone: 'central',
      note: '캠퍼스 중앙 허브. 각 건물 간 지름길 샛길 교차점.'
    },
    '종합강의동': {
      code: 'U5',
      name: '종합강의동(국제교육관)',
      names: { ko: '종합강의동(국제교육관)', en: 'General Lecture Hall (U5)', ja: '総合講義棟(U5)', zh: '综合教学楼(U5)' },
      aliases: ['종강동', '종합관', '종강', '종합강의'],
      hasElevator: true,
      floors: 6,
      elevation: 122,
      shuttleDistM: 390,
      shuttleWalkMin: 6,
      zone: 'central_high',
      note: '대형 강의실 다수 배치. 쉬는 시간 엘리베이터 혼잡.'
    },
    '공학관': {
      code: 'U4',
      name: '자연과학·공학관',
      names: { ko: '자연과학·공학관', en: 'Natural Sciences & Engineering Hall', ja: '自然科学・工学館', zh: '自然科学·工学楼' },
      aliases: ['공대', '제1공학관', '공학', '공학관', '자연과학관', 'U4', 'u4'],
      hasElevator: true,
      floors: 5,
      elevation: 124,
      shuttleDistM: 360,
      shuttleWalkMin: 5,
      zone: 'central_high',
      note: '엘리베이터 운행. 모빌리티융합관 및 종합강의동과 인접(평지 3분).'
    },
    '모빌리티융합관': {
      code: 'U4',
      name: '모빌리티융합관',
      names: { ko: '모빌리티융합관', en: 'Mobility Convergence Hall', ja: 'モビリティ融合館', zh: '移动出行融合楼' },
      aliases: ['모빌리티관', '모빌리티', '신공학관'],
      hasElevator: true,
      floors: 5,
      elevation: 125,
      shuttleDistM: 340,
      shuttleWalkMin: 5,
      zone: 'central_high',
      note: '엘리베이터 운행. 공학관과 브릿지/인접 보도 연결.'
    },
    '의생명과학관': {
      code: 'U2',
      name: '생명과학관',
      names: { ko: '생명과학관', en: 'Life Sciences Hall', ja: '生命科学館', zh: '生命科学楼' },
      aliases: ['의생명과학관', '의생명관', '의생명', '생명관', '생명과학관', 'U2', 'u2'],
      hasElevator: true,
      floors: 6,
      elevation: 138, // 최고 지대
      shuttleDistM: 480,
      shuttleWalkMin: 7,
      zone: 'high',
      note: '캠퍼스 상단 위치. 국제교육관 등 저지대에서 도보 이동 시 고저차 48m 등판 필요.'
    },
    '간호대학': {
      code: 'K2',
      name: '의학·간호대학',
      names: { ko: '의학·간호대학', en: 'Medical & Nursing Hall', ja: '医学・看護館', zh: '医学·护理楼' },
      aliases: ['간호관', '간호대', '의학관', '간호대학', 'K2', 'k2'],
      hasElevator: true,
      floors: 4,
      elevation: 135,
      shuttleDistM: 450,
      shuttleWalkMin: 7,
      zone: 'high',
      note: '생명과학관 인근 상단 지대.'
    },
    '디자인문화관': {
      code: 'U6',
      name: '창의예술·디자인관',
      names: { ko: '창의예술·디자인관', en: 'Creative Arts & Design Hall', ja: '創意芸術・デザイン館', zh: '创意艺术·设计楼' },
      aliases: ['디자인문화관', '디자인관', '디문관', '디자인', '창의예술관', 'U6', 'u6'],
      hasElevator: true,
      floors: 5,
      elevation: 116,
      shuttleDistM: 380,
      shuttleWalkMin: 6,
      zone: 'west',
      note: '실습실 다수. 조형예술관과 인접.'
    },
    '조형예술관': {
      code: 'U6',
      name: '조형예술관',
      names: { ko: '조형예술관', en: 'Plastic Arts Hall', ja: '造形芸術館', zh: '造型艺术楼' },
      aliases: ['조형관', '예술관', '조예관'],
      hasElevator: true,
      floors: 4,
      elevation: 114,
      shuttleDistM: 400,
      shuttleWalkMin: 6,
      zone: 'west',
      note: '창의예술관 옆.'
    },
    '학생회관': {
      code: 'K1',
      name: '학생회관',
      names: { ko: '학생회관', en: 'Student Union', ja: '学生会館', zh: '学生会馆' },
      aliases: ['학관', '학생회관', 'K1', 'k1'],
      hasElevator: true,
      floors: 4,
      elevation: 110,
      shuttleDistM: 220,
      shuttleWalkMin: 3,
      zone: 'central',
      note: '식당 및 학생 편의시설. 대운동장 셔틀 정류장과 가장 가까움.'
    },
    '대운동장': {
      code: 'U14',
      name: '대운동장(셔틀승하차장)',
      names: { ko: '대운동장(셔틀승하차장)', en: 'Main Stadium & Shuttle Stop', ja: '大運動場(シャトル乗り場)', zh: '大运动场(班车站)' },
      aliases: ['운동장', '셔틀정류장', '정류장', '스포츠콤플렉스', '건국터미널', 'U14'],
      hasElevator: false,
      floors: 1,
      elevation: 105,
      shuttleDistM: 0,
      shuttleWalkMin: 0,
      zone: 'transit',
      note: '교내 셔틀버스 및 시외/통학버스 메인 승하차장.'
    }
  };

  // 강의실 문자열에서 건물명과 층수를 스마트 추출
  // 예: "국제교육관 302-2" -> { building: "국제교육관", floor: 3, room: "302-2" }
  // 예: "공학관 201" -> { building: "공학관", floor: 2, room: "201" }
  // 예: "실시간온라인", "이러닝" -> { isOnline: true }
  function parseRoom(roomStr) {
    const raw = String(roomStr || '').trim();
    if (!raw) return { name: '미정', building: null, floor: 1, isOnline: false };
    if (/이러닝|원격|온라인|cyber|사이버/i.test(raw)) {
      return { name: raw, building: null, floor: 0, isOnline: true };
    }

    let detectedBuilding = null;
    let bMeta = null;

    for (const [bName, meta] of Object.entries(BUILDINGS)) {
      if (raw.includes(bName)) {
        detectedBuilding = bName;
        bMeta = meta;
        break;
      }
      for (const al of meta.aliases) {
        if (raw.includes(al)) {
          detectedBuilding = bName;
          bMeta = meta;
          break;
        }
      }
      if (detectedBuilding) break;
    }

    // 층수 추출: "302호", "302-2", "B101", "4층" 등
    let floor = 1;
    const floorMatch = raw.match(/(\d)\d{2}/) || raw.match(/(\d)층/);
    if (floorMatch) {
      floor = parseInt(floorMatch[1], 10);
    } else if (raw.includes('B1') || raw.includes('지하1')) {
      floor = -1;
    }

    return {
      name: raw,
      building: detectedBuilding || raw.split(/\s+/)[0] || '교내',
      buildingMeta: bMeta,
      floor: floor,
      isOnline: false
    };
  }

  // 강의실 문자열을 다국어 및 공식 K/U 건물 코드와 함께 포맷
  // 예: "국제교육관 302-2", 'ja' -> "[U5] 国際教育館 302-2 (국제교육관 302-2)"
  // 예: "국제교육관 302-2", 'ko' -> "[U5] 국제교육관 302-2"
  function formatRoom(roomStr, lang) {
    const raw = String(roomStr || '').trim();
    if (!raw) return lang === 'en' ? 'TBD' : lang === 'ja' ? '教室未定' : lang === 'zh' ? '教室待定' : '강의실 미정';
    if (/이러닝|원격|온라인|cyber|사이버/i.test(raw)) {
      return lang === 'en' ? '💻 E-learning' : lang === 'ja' ? '💻 eラーニング' : lang === 'zh' ? '💻 网课' : '💻 이러닝';
    }
    const meta = parseRoom(raw);
    const b = meta.buildingMeta;
    if (!b) return raw;

    const code = b.code ? `[${b.code}] ` : '';
    const localizedBldg = (b.names && b.names[lang]) || b.name;
    const roomNumMatch = raw.match(/([B\d]+(?:-\d+)?(?:호)?)/);
    const roomNum = roomNumMatch ? roomNumMatch[1] : '';

    if (!lang || lang === 'ko') {
      return `${code}${b.name}${roomNum ? ' ' + roomNum : ''}`;
    }
    const localized = `${code}${localizedBldg}${roomNum ? ' ' + roomNum : ''}`;
    const original = `${b.name}${roomNum ? ' ' + roomNum : ''}`;
    return `${localized} (${original})`;
  }

  // 두 강의실 간 이동 동선, 소요 시간, 헐떡고개 경보 계산 (다국어 지원)
  function calculateRoute(fromRoomStr, toRoomStr, breakMinutes, lang = 'ko') {
    const from = parseRoom(fromRoomStr);
    const to = parseRoom(toRoomStr);
    const breakMin = typeof breakMinutes === 'number' ? breakMinutes : 15;
    const curLang = lang || 'ko';

    const getStatusText = (lvl, isOnline = false, isSameBldg = false) => {
      if (isOnline) {
        if (curLang === 'en') return '🟢 Online Class (No Travel)';
        if (curLang === 'zh') return '🟢 网课 (无需移动)';
        if (curLang === 'ja') return '🟢 オンライン授業 (移動なし)';
        return '🟢 이동 여유 (온라인 연강)';
      }
      if (isSameBldg) {
        if (curLang === 'en') return '🟢 Same Building (Easy)';
        if (curLang === 'zh') return '🟢 同楼层移动 (充裕)';
        if (curLang === 'ja') return '🟢 同一建物 (余裕)';
        return '🟢 10분 컷 여유 (동일 건물)';
      }
      if (lvl === 'danger') {
        if (curLang === 'en') return '🚨 High Rush Risk! (Steep Hill Alert)';
        if (curLang === 'zh') return '🚨 10分钟极度紧张! (急陡坡警报)';
        if (curLang === 'ja') return '🚨 10分移動超危険! (急坂警報)';
        return '🚨 10분 컷 초위험! (헐떡고개 경보)';
      }
      if (lvl === 'warning') {
        if (curLang === 'en') return '🟡 Tight 10m Window (Brisk Walk)';
        if (curLang === 'zh') return '🟡 10分钟较紧 (建议快走)';
        if (curLang === 'ja') return '🟡 10分カツカツ (早歩き推奨)';
        return '🟡 10분 컷 빠듯 (빠른 걸음 권장)';
      }
      if (curLang === 'en') return '🟢 10m Walk Safe';
      if (curLang === 'zh') return '🟢 10分钟充裕';
      if (curLang === 'ja') return '🟢 10分余裕';
      return '🟢 10분 컷 여유';
    };

    // 온라인 수업이 포함된 경우 이동 불필요
    if (from.isOnline || to.isOnline || !from.building || !to.building) {
      return {
        level: 'safe',
        statusText: getStatusText('safe', true),
        walkMin: 0,
        distM: 0,
        elevationDiff: 0,
        hasHillAlert: false,
        breakMin: breakMin,
        remainMin: breakMin,
        tips: curLang === 'en' ? 'Online or e-learning course with no physical classroom change required.'
          : curLang === 'zh' ? '无需更换地点的在线/网络课程。'
          : curLang === 'ja' ? '場所移動の必要がないオンライン/eラーニング授業です。'
          : '장소 이동이 필요 없는 온라인/이러닝 수업입니다.',
        details: curLang === 'en' ? 'Online' : curLang === 'zh' ? '网课' : curLang === 'ja' ? 'オンライン' : '온라인 수업'
      };
    }

    // 1. 같은 건물 내 이동
    if (from.building === to.building) {
      const floorDiff = Math.abs((to.floor || 1) - (from.floor || 1));
      let walkMin = 1;
      let tips = '';
      const isElevatorFree = from.buildingMeta && !from.buildingMeta.hasElevator;

      if (floorDiff === 0) {
        walkMin = 1;
        tips = curLang === 'en' ? 'Adjacent rooms on the same floor. Under 1 min easy walk!'
          : curLang === 'zh' ? '同楼层相邻教室。1分钟内即可轻松到达!'
          : curLang === 'ja' ? '同フロアの隣接教室です。1分以内の快適移動!'
          : '동일 층 인접 강의실입니다. 1분 이내 여유로운 이동 가능!';
      } else if (floorDiff <= 2) {
        walkMin = 2;
        tips = curLang === 'en' ? `Take stairs for ${floorDiff} floor(s). Plenty of break time.`
          : curLang === 'zh' ? `步行爬楼梯 ${floorDiff} 层。课间时间充裕。`
          : curLang === 'ja' ? `階段で ${floorDiff} 階移動。休憩時間に余裕があります。`
          : `${floorDiff}개 층 계단 이동. 쉬는 시간 여유 있습니다.`;
      } else {
        walkMin = isElevatorFree ? 4 : 3;
        const bldgLabel = formatRoom(from.building, curLang);
        tips = isElevatorFree
          ? (curLang === 'en' ? `⚠️ No elevator in ${bldgLabel}! ${floorDiff} floors stairs walk (+4m)`
             : curLang === 'zh' ? `⚠️ ${bldgLabel} 无电梯! 需爬 ${floorDiff} 层楼梯 (+4分钟)`
             : curLang === 'ja' ? `⚠️ ${bldgLabel}はエレベーターがありません! ${floorDiff}階分の階段移動 (+4分)`
             : `⚠️ ${bldgLabel}은 엘리베이터가 없습니다! ${floorDiff}개 층 계단 이동 필요 (+4분 소요)`)
          : (curLang === 'en' ? `Stairs recommended if elevators are crowded between classes (${floorDiff} floors)`
             : curLang === 'zh' ? `课间电梯拥挤时建议使用楼梯 (${floorDiff} 层移动)`
             : curLang === 'ja' ? `混雑時は階段利用推奨 (${floorDiff}階移動)`
             : `쉬는 시간 엘리베이터 혼잡 시 비상계단 이용 권장 (${floorDiff}개 층 이동)`);
      }

      const bldgLabel = formatRoom(from.building, curLang);
      return {
        level: 'safe',
        statusText: getStatusText('safe', false, true),
        walkMin: walkMin,
        distM: floorDiff * 20,
        elevationDiff: floorDiff * 3.5,
        hasHillAlert: false,
        breakMin: breakMin,
        remainMin: Math.max(0, breakMin - walkMin),
        tips: tips,
        fromBuilding: from.building,
        toBuilding: to.building,
        details: `${bldgLabel} ${from.floor}F ➔ ${to.floor}F`
      };
    }

    // 2. 다른 건물 간 이동
    const m1 = from.buildingMeta || { elevation: 110, hasElevator: true };
    const m2 = to.buildingMeta || { elevation: 110, hasElevator: true };
    const elevationDiff = m2.elevation - m1.elevation; // 양수면 오르막(상승), 음수면 내리막

    // 평면 추정 거리 계산 (기본 250m)
    let baseDist = 280;
    const z1 = m1.zone || 'mid';
    const z2 = m2.zone || 'mid';

    // 특정 경로 거리 및 헐떡고개(Hill) 보정
    let hasHillAlert = false;
    let hillReason = '';
    let shortcut = '';

    if ((from.building === '국제교육관' && to.building === '종합강의동') ||
        (from.building === '종합강의동' && to.building === '국제교육관')) {
      baseDist = 450;
      hasHillAlert = true;
      hillReason = curLang === 'en' ? 'Steep hill section between Int\'l Education Hall and General Lecture Hall'
        : curLang === 'zh' ? '国际教育馆与综合教学楼之间急陡坡路段'
        : curLang === 'ja' ? '国際教育館と総合講義棟間の急坂区間'
        : '국제교육관 ↔ 종합강의동 급경사로(헐떡고개) 등판 코스';
      shortcut = curLang === 'en' ? 'Take the library side stairs to save ~1.5 mins!'
        : curLang === 'zh' ? '走图书馆侧面楼梯近道可节省约1.5分钟!'
        : curLang === 'ja' ? '図書館脇の階段ショートカットで約1.5分短縮!'
        : '중원도서관 측면 계단 샛길 이용 시 약 1.5분 단축 가능!';
    } else if ((from.building === '국제교육관' && (to.building === '공학관' || to.building === '모빌리티융합관')) ||
               ((from.building === '공학관' || from.building === '모빌리티융합관') && to.building === '국제교육관')) {
      baseDist = 520;
      hasHillAlert = true;
      hillReason = curLang === 'en' ? 'Max elevation change (+34m) steep slope hill'
        : curLang === 'zh' ? '最大高差(+34米)急陡坡路段'
        : curLang === 'ja' ? '最大標高差(+34m)の急坂コース'
        : '헐떡고개 최대 고저차(+34m) 급경사 코스';
      shortcut = curLang === 'en' ? 'Passing through Jungwon Library 1F lobby avoids the slope!'
        : curLang === 'zh' ? '穿过中原图书馆1楼大堂可避开陡坡!'
        : curLang === 'ja' ? '中原図書館1Fロビー通過ルートで坂を回避可能!'
        : '중원도서관 1층 로비 관통 통로를 이용하면 경사를 피해 이동 가능!';
    } else if ((from.building === '국제교육관' && (to.building === '의생명과학관' || to.building === '간호대학')) ||
               ((from.building === '의생명과학관' || to.building === '간호대학') && to.building === '국제교육관')) {
      baseDist = 650;
      hasHillAlert = true;
      hillReason = curLang === 'en' ? 'Long-distance high elevation climb (+48m)'
        : curLang === 'zh' ? '校园最低处至最高处(+48米)长距离爬坡路线'
        : curLang === 'ja' ? 'キャンパス最低部から最高部(+48m)への長距離急登コース'
        : '캠퍼스 최저 지대 ↔ 최고 지대(+48m) 장거리 고난도 등판 코스';
      shortcut = curLang === 'en' ? 'Immediate departure required upon class dismissal!'
        : curLang === 'zh' ? '下课后必须立刻快速步行出发!'
        : curLang === 'ja' ? '授業終了直後の早歩き必須!'
        : '수업 종료 즉시 빠른 걸음 이동 필수 (자전거/킥보드 우회 권장)';
    } else if (z1 === z2) {
      baseDist = 180; // 인접 구역
    } else if ((z1.includes('central') && z2.includes('central'))) {
      baseDist = 220;
    } else {
      baseDist = 380;
    }

    // 도보 소요 시간 계산 (평지 4km/h = 분당 약 65m, 오르막 10m 고저차당 +1.2분 가산)
    let walkMin = Math.round(baseDist / 65);
    if (elevationDiff > 10) {
      walkMin += Math.round(elevationDiff / 10 * 1.2);
    }
    // 출발/도착 건물의 계단/엘리베이터 가산 (국제교육관은 엘베 없으므로 3~4층은 +1~2분)
    if (!m1.hasElevator && from.floor >= 3) walkMin += 1;
    if (!m2.hasElevator && to.floor >= 3) walkMin += 1;

    // 최소 2분, 최대 15분 클램핑
    walkMin = Math.max(2, walkMin);

    // 판정 등급 (10분 쉬는 시간 기준)
    let level = 'safe';
    if (walkMin >= 9 || (walkMin >= 8 && hasHillAlert)) {
      level = 'danger';
    } else if (walkMin >= 6 || hasHillAlert) {
      level = 'warning';
    }

    const statusText = getStatusText(level);
    const remainMin = breakMin - walkMin;
    let tips = '';
    if (level === 'danger') {
      tips = curLang === 'en' ? `⚠️ Est. walk ${walkMin}m! Very tight against ${breakMin}m break. Head out as soon as class ends. ${shortcut || hillReason}`
        : curLang === 'zh' ? `⚠️ 预计步行约${walkMin}分钟! 相比课间(${breakMin}分钟)极为紧迫,请下课后立即出发。${shortcut || hillReason}`
        : curLang === 'ja' ? `⚠️ 予想徒歩${walkMin}分! 休憩時間(${breakMin}分)に対してギリギリです。授業終了後すぐに出発してください。${shortcut || hillReason}`
        : `⚠️ 예상 도보 소요 ${walkMin}분! 쉬는 시간(${breakMin}분) 대비 아슬아슬합니다. 수업 끝나자마자 바로 출발하세요. ${shortcut || hillReason}`;
    } else if (level === 'warning') {
      tips = curLang === 'en' ? `Est. walk ${walkMin}m. Time is limited, please walk briskly.`
        : curLang === 'zh' ? `预计步行约${walkMin}分钟。富余时间有限,建议保持较快步伐。`
        : curLang === 'ja' ? `予想徒歩${walkMin}分。余裕があまりないため、早歩きをおすすめします。`
        : `예상 소요 ${walkMin}분. ${hasHillAlert ? '언덕 경사로가 포함되어 있습니다. ' : ''}${shortcut || '여유 시간이 많지 않으니 서두르세요.'}`;
    } else {
      tips = curLang === 'en' ? `Est. walk ${walkMin}m (${remainMin}m buffer). Gentle and comfortable walk.`
        : curLang === 'zh' ? `预计步行约${walkMin}分钟 (富余约${remainMin}分钟)。地势平缓,可从容移动。`
        : curLang === 'ja' ? `予想徒歩${walkMin}分 (残り余裕${remainMin}分)。緩やかで快適に移動できます。`
        : `예상 소요 ${walkMin}분 (잔여 여유 ${remainMin}분). 완만하고 편안하게 이동할 수 있습니다.`;
    }

    return {
      level,
      statusText,
      walkMin,
      distM: baseDist,
      elevationDiff,
      hasHillAlert,
      hillReason,
      breakMin,
      remainMin,
      tips,
      shortcut,
      fromBuilding: from.building,
      toBuilding: to.building,
      details: `${from.building}(${from.floor}층) ➔ ${to.building}(${to.floor}층) · ${baseDist}m (${elevationDiff > 0 ? '+' + elevationDiff + 'm 오르막' : '내리막/평지'})`
    };
  }

  // 2. 시간표 연동 귀가 & 하교 교통 알리미 (셔틀버스, 충주역 KTX, 충주터미널, 수도권 통학버스)
  const TRANSIT_DATA = {
    // 대운동장 출발 교내 셔틀버스 정기 시간표 (평일 학기중)
    // 코스: 대운동장 ➔ (15분) ➔ 충주공용버스터미널 ➔ (10분) ➔ 충주역
    shuttle: [
      { dep: '09:10', terminal: '09:25', station: '09:35' },
      { dep: '10:10', terminal: '10:25', station: '10:35' },
      { dep: '11:10', terminal: '11:25', station: '11:35' },
      { dep: '12:10', terminal: '12:25', station: '12:35' },
      { dep: '13:10', terminal: '13:25', station: '13:35' },
      { dep: '14:10', terminal: '14:25', station: '14:35' },
      { dep: '15:10', terminal: '15:25', station: '15:35' },
      { dep: '15:40', terminal: '15:55', station: '16:05' },
      { dep: '16:10', terminal: '16:25', station: '16:35' },
      { dep: '16:40', terminal: '16:55', station: '17:05' },
      { dep: '17:10', terminal: '17:25', station: '17:35' },
      { dep: '17:40', terminal: '17:55', station: '18:05' },
      { dep: '18:10', terminal: '18:25', station: '18:35' },
      { dep: '18:40', terminal: '18:55', station: '19:05' },
      { dep: '19:30', terminal: '19:45', station: '19:55' },
      { dep: '20:30', terminal: '20:45', station: '20:55' },
      { dep: '21:30', terminal: '21:45', station: '21:55' }
    ],
    // 충주역 출발 판교/수도권행 KTX-이음 시간표
    ktx: [
      { train: 'KTX 712', dep: '07:14', arrPangyo: '08:02' },
      { train: 'KTX 714', dep: '08:35', arrPangyo: '09:25' },
      { train: 'KTX 716', dep: '10:20', arrPangyo: '11:10' },
      { train: 'KTX 718', dep: '12:35', arrPangyo: '13:25' },
      { train: 'KTX 720', dep: '14:24', arrPangyo: '15:14' },
      { train: 'KTX 722', dep: '16:05', arrPangyo: '16:55' },
      { train: 'KTX 724', dep: '18:02', arrPangyo: '18:52' },
      { train: 'KTX 726', dep: '19:42', arrPangyo: '20:32' },
      { train: 'KTX 728', dep: '21:28', arrPangyo: '22:18' }
    ],
    // 충주공용버스터미널 주요 목적지별 배차 정보
    terminalBuses: {
      'dongseoul': {
        dest: '동서울터미널 (강변역 2호선)',
        names: { ko: '동서울터미널 (강변역 2호선)', en: 'East Seoul Terminal (Gangbyeon Sta.)', zh: '东首尔客运站 (江边站 2号线)', ja: '東ソウルターミナル (江辺駅 2号線)' },
        intervalMin: 25,
        firstBus: '06:00',
        lastBus: '21:30',
        durationMin: 100,
        fare: '9,200원',
        fareNum: 9200
      },
      'gangnam': {
        dest: '서울 강남 센트럴시티 (고속터미널)',
        names: { ko: '서울 강남 센트럴시티 (고속터미널)', en: 'Seoul Gangnam Central City', zh: '首尔江南中心城客运站', ja: 'ソウル江南セントラルシティ' },
        intervalMin: 35,
        firstBus: '06:00',
        lastBus: '21:00',
        durationMin: 105,
        fare: '10,000원',
        fareNum: 10000
      },
      'suwon': {
        dest: '수원버스터미널 / 경기남부',
        names: { ko: '수원버스터미널 / 경기남부', en: 'Suwon Terminal / S. Gyeonggi', zh: '水原客运站 / 京畿南部', ja: '水原ターミナル / 京畿南部' },
        intervalMin: 50,
        firstBus: '07:00',
        lastBus: '20:30',
        durationMin: 90,
        fare: '8,500원',
        fareNum: 8500
      },
      'cheongju': {
        dest: '청주 시외버스터미널 (북부/사창)',
        names: { ko: '청주 시외버스터미널 (북부/사창)', en: 'Cheongju Intercity Terminal', zh: '清州长途汽车站', ja: '清州市外バスターミナル' },
        intervalMin: 30,
        firstBus: '06:40',
        lastBus: '21:10',
        durationMin: 60,
        fare: '5,900원',
        fareNum: 5900
      },
      'daejeon': {
        dest: '대전 복합터미널 / 유성',
        names: { ko: '대전 복합터미널 / 유성', en: 'Daejeon Complex Terminal', zh: '大田综合客运站', ja: '大田複合ターミナル' },
        intervalMin: 40,
        firstBus: '06:50',
        lastBus: '20:20',
        durationMin: 90,
        fare: '8,800원',
        fareNum: 8800
      },
      'incheon': {
        dest: '인천 / 안산 / 부천 터미널',
        names: { ko: '인천 / 안산 / 부천 터미널', en: 'Incheon / Ansan / Bucheon Terminal', zh: '仁川 / 安山 / 富川客运站', ja: '仁川 / 安山 / 富川ターミナル' },
        intervalMin: 50,
        firstBus: '07:10',
        lastBus: '20:10',
        durationMin: 100,
        fare: '10,500원',
        fareNum: 10500
      },
      'wonju': {
        dest: '원주 시외버스터미널 (강원)',
        names: { ko: '원주 시외버스터미널 (강원)', en: 'Wonju Intercity Terminal', zh: '原州长途汽车站', ja: '原州市外バスターミナル' },
        intervalMin: 50,
        firstBus: '07:30',
        lastBus: '20:30',
        durationMin: 50,
        fare: '6,200원',
        fareNum: 6200
      },
      'downtown': {
        dest: '충주 시내 (성서동 / 상권·영화관)',
        names: { ko: '충주 시내 (성서동 / 상권)', en: 'Chungju Downtown (Seongseo-dong)', zh: '忠州市区 (城西洞 / 商业街)', ja: '忠州市内 (城西洞 / 繁華街)' },
        intervalMin: 15,
        firstBus: '06:30',
        lastBus: '22:00',
        durationMin: 15,
        fare: '1,500원',
        fareNum: 1500
      },
      'seongnam': {
        dest: '성남(야탑) 터미널',
        names: { ko: '성남(야탑) 터미널', en: 'Seongnam (Yatap) Terminal', zh: '城南(野塔)客运站', ja: '城南(野塔)ターミナル' },
        intervalMin: 60,
        firstBus: '07:20',
        lastBus: '20:00',
        durationMin: 85,
        fare: '8,300원',
        fareNum: 8300
      }
    },
    // 금요일 및 통학 정기 하교 버스
    commuter: [
      {
        name: '서울/강남·잠실 노선',
        names: { ko: '서울/강남·잠실 노선', en: 'Seoul (Gangnam / Jamsil)', zh: '首尔/江南·蚕室专线', ja: 'ソウル/江南・蚕室路線' },
        dep: '15:30',
        spot: '대운동장 앞',
        spots: { ko: '대운동장 앞', en: 'Main Stadium Front', zh: '大运动场前', ja: '大運動場前' },
        note: '금요일 운행',
        notes: { ko: '금요일 운행', en: 'Fridays only', zh: '每周五发车', ja: '金曜運行' }
      },
      {
        name: '수원/안양 노선',
        names: { ko: '수원/안양 노선', en: 'Suwon / Anyang Route', zh: '水原/安养专线', ja: '水原/安養路線' },
        dep: '15:30',
        spot: '대운동장 앞',
        spots: { ko: '대운동장 앞', en: 'Main Stadium Front', zh: '大运动场前', ja: '大運動場前' },
        note: '금요일 운행',
        notes: { ko: '금요일 운행', en: 'Fridays only', zh: '每周五发车', ja: '金曜運行' }
      },
      {
        name: '서울/강남·잠실 2차',
        names: { ko: '서울/강남·잠실 2차', en: 'Seoul (Gangnam / Jamsil) #2', zh: '首尔/江南·蚕室第2班', ja: 'ソウル/江南・蚕室 2便' },
        dep: '17:30',
        spot: '대운동장 앞',
        spots: { ko: '대운동장 앞', en: 'Main Stadium Front', zh: '大运动场前', ja: '大運動場前' },
        note: '금요일 운행',
        notes: { ko: '금요일 운행', en: 'Fridays only', zh: '每周五发车', ja: '金曜運行' }
      },
      {
        name: '일산/부천 노선',
        names: { ko: '일산/부천 노선', en: 'Ilsan / Bucheon Route', zh: '一山/富川专线', ja: '一山/富川路線' },
        dep: '17:30',
        spot: '대운동장 앞',
        spots: { ko: '대운동장 앞', en: 'Main Stadium Front', zh: '大运动场前', ja: '大運動場前' },
        note: '금요일 운행',
        notes: { ko: '금요일 운행', en: 'Fridays only', zh: '每周五发车', ja: '金曜運行' }
      }
    ]
  };

  function toMin(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = String(timeStr).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function toTimeStr(min) {
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // 오늘 수업 종료 시간 및 강의실 기준 가장 빠른 교통편(셔틀, KTX, 터미널 버스) 추천
  function getTransitRecommendation(lastClassEndTime, lastClassRoom, destination, lang) {
    const L = lang || 'ko';
    const dest = destination || 'shuttle';
    const endMin = toMin(lastClassEndTime || '15:00');
    const roomMeta = parseRoom(lastClassRoom);
    const bMeta = roomMeta.buildingMeta || { shuttleWalkMin: 6 };
    const walkMin = bMeta.shuttleWalkMin || 6;
    const arriveStopMin = endMin + walkMin; // 대운동장 정류장 도착 예상 시각

    // 1. 탑승 가능한 다음 셔틀버스 찾기
    const nextShuttles = TRANSIT_DATA.shuttle.filter((s) => toMin(s.dep) >= arriveStopMin);
    const bestShuttle = nextShuttles[0] || null;

    // 2. KTX 모드
    if (dest === 'ktx') {
      const recs = [];
      for (const sh of nextShuttles.slice(0, 3)) {
        const stationArriveMin = toMin(sh.station);
        const ktxHits = TRANSIT_DATA.ktx.filter((k) => toMin(k.dep) >= stationArriveMin + 10);
        if (ktxHits.length) {
          const targetKtx = ktxHits[0];
          const ktxDepMin = toMin(targetKtx.dep);
          recs.push({
            shuttleDep: sh.dep,
            waitMinAtStop: toMin(sh.dep) - arriveStopMin,
            stationArrive: sh.station,
            ktx: targetKtx,
            waitMinAtStation: ktxDepMin - stationArriveMin,
            arrPangyo: targetKtx.arrPangyo
          });
        }
      }

      const destTitle = L === 'en' ? '🚄 Chungju Sta. ➔ Pangyo/Suseo KTX-Eum'
        : L === 'zh' ? '🚄 忠州站 ➔ 板桥/水西方向 KTX-EUM高铁连运'
        : L === 'ja' ? '🚄 忠州駅 ➔ 板橋/水西方面 KTX-イウム連携'
        : '🚄 충주역 ➔ 판교/수서 방면 KTX-이음 연계';

      const roomLabel = formatRoom(lastClassRoom, L);
      const tips = L === 'en' ? `Walk ~${walkMin}m from classroom (${roomLabel}) to main stadium shuttle stop. Matched with KTX at Chungju Station.`
        : L === 'zh' ? `从教学楼(${roomLabel})步行至大运动场校车乘车点约需${walkMin}分钟。已智能匹配忠州站KTX高铁车次。`
        : L === 'ja' ? `講義室(${roomLabel})から大運動場シャトル停留所まで徒歩約${walkMin}分。忠州駅KTX乗車まで連携マッチングしました。`
        : `강의실(${roomLabel})에서 대운동장 셔틀 정류장까지 도보 약 ${walkMin}분 소요. 충주역 KTX 탑승까지 매칭되었습니다.`;

      return {
        type: 'ktx',
        destTitle,
        walkMin,
        fromBuilding: roomMeta.building,
        arriveStop: toTimeStr(arriveStopMin),
        bestMatch: recs[0] || null,
        alternatives: recs.slice(1),
        upcoming: nextShuttles.slice(0, 4),
        tips
      };
    }

    // 3. 금요 통학버스 (commuter)
    if (dest === 'commuter') {
      const bestCom = TRANSIT_DATA.commuter.find((c) => toMin(c.dep) >= arriveStopMin) || TRANSIT_DATA.commuter[0];
      const destTitle = L === 'en' ? '🚌 Friday Direct Commuter Bus (Main Stadium Front)'
        : L === 'zh' ? '🚌 周五通学专线直达巴士 (大运动场前)'
        : L === 'ja' ? '🚌 金曜通学直通バス (大運動場前)'
        : '🚌 금요일 수도권 직통 통학버스 (대운동장 앞)';

      const tips = L === 'en' ? `Departs directly from Main Stadium stop without transfer. Runs on Fridays to Seoul/Suwon/Ilsan.`
        : L === 'zh' ? `从大运动场前直发，无需换乘校车。每周五下午运行开往首尔、水原、一山等地。`
        : L === 'ja' ? `大運動場前から直行発車（シャトル乗換不要）。金曜午後にソウル・水原・一山方面へ運行。`
        : `대운동장 앞에서 셔틀 환승 없이 직통 출발합니다. 금요일 오후 서울·수원·일산 방면 운행.`;

      return {
        type: 'commuter',
        destTitle,
        walkMin,
        fromBuilding: roomMeta.building,
        arriveStop: toTimeStr(arriveStopMin),
        bestMatch: bestCom ? {
          shuttleDep: bestCom.dep,
          destName: (bestCom.names && bestCom.names[L]) || bestCom.name,
          spot: (bestCom.spots && bestCom.spots[L]) || bestCom.spot,
          note: (bestCom.notes && bestCom.notes[L]) || bestCom.note
        } : null,
        tips
      };
    }

    // 4. 시외버스 및 시내 (terminal buses / downtown)
    const busKey = dest === 'seoul' ? 'dongseoul'
      : (TRANSIT_DATA.terminalBuses[dest] ? dest : 'dongseoul');

    if (dest !== 'shuttle') {
      const busMeta = TRANSIT_DATA.terminalBuses[busKey];
      const localizedDest = (busMeta.names && busMeta.names[L]) || busMeta.dest;
      const fareNumStr = busMeta.fareNum ? busMeta.fareNum.toLocaleString() : busMeta.fare.replace(/원$/, '');
      const localizedFare = L === 'en' ? `${fareNumStr} KRW`
        : L === 'zh' ? `${fareNumStr}韩元`
        : L === 'ja' ? `${fareNumStr}ウォン`
        : busMeta.fare;
      const recs = nextShuttles.slice(0, 3).map((sh) => {
        const termArriveMin = toMin(sh.terminal);
        const nextBusMin = termArriveMin + 15;
        return {
          shuttleDep: sh.dep,
          termArrive: sh.terminal,
          waitMinAtStop: toMin(sh.dep) - arriveStopMin,
          estBusTime: toTimeStr(nextBusMin),
          busInfo: {
            ...busMeta,
            dest: localizedDest,
            fare: localizedFare
          }
        };
      });

      const destTitle = L === 'en' ? `🚌 Chungju Terminal ➔ ${localizedDest}`
        : L === 'zh' ? `🚌 忠州客运站 ➔ ${localizedDest}`
        : L === 'ja' ? `🚌 忠州ターミナル ➔ ${localizedDest}`
        : `🚌 충주터미널 ➔ ${localizedDest}`;

      const tips = L === 'en' ? `Take shuttle to Chungju Terminal (~15 mins), then connect with direct buses every ${busMeta.intervalMin}m.`
        : L === 'zh' ? `乘坐大运动场校车前往忠州客运站(约15分钟)，之后换乘发车间隔约${busMeta.intervalMin}分钟的直达巴士。`
        : L === 'ja' ? `大運動場シャトルで忠州ターミナルへ移動(約15分)後、約${busMeta.intervalMin}分間隔の直行バスへ乗継可能です。`
        : `대운동장 셔틀로 충주터미널 이동(약 15분 소요) 후 ${busMeta.intervalMin}분 간격의 직통 버스 연계 탑승 가능.`;

      return {
        type: 'terminal',
        destTitle,
        walkMin,
        fromBuilding: roomMeta.building,
        arriveStop: toTimeStr(arriveStopMin),
        bestMatch: recs[0] || null,
        upcoming: nextShuttles.slice(0, 4),
        busMeta: { ...busMeta, dest: localizedDest, fare: localizedFare },
        tips
      };
    }

    // 5. 기본: 교내 무료 셔틀버스 순환
    const destTitle = L === 'en' ? '🚌 Free Campus Shuttle (Campus ➔ Terminal ➔ Station)'
      : L === 'zh' ? '🚌 校内免费校车 (校园 ➔ 客运站 ➔ 忠州站)'
      : L === 'ja' ? '🚌 校内無料シャトルバス (キャンパス ➔ ターミナル ➔ 忠州駅)'
      : '🚌 교내 무료 셔틀버스 (캠퍼스 ➔ 충주터미널 ➔ 충주역)';

    const tips = bestShuttle
      ? (L === 'en' ? `Walk ${walkMin}m to stadium stop after last class. Board ${bestShuttle.dep} shuttle to Terminal ${bestShuttle.terminal}, Station ${bestShuttle.station}.`
        : L === 'zh' ? `今日最后一节课结束后步行约${walkMin}分钟至大运动场乘车点。搭乘${bestShuttle.dep}校车可于${bestShuttle.terminal}到达客运站，${bestShuttle.station}到达忠州站。`
        : L === 'ja' ? `授業終了後、大運動場停留所まで徒歩約${walkMin}分。${bestShuttle.dep}発シャトル乗車でターミナル${bestShuttle.terminal}、忠州駅${bestShuttle.station}着。`
        : `오늘 마지막 수업 종료 후 대운동장 정류장까지 ${walkMin}분 도보. ${bestShuttle.dep} 셔틀 탑승 시 터미널 ${bestShuttle.terminal}, 충주역 ${bestShuttle.station} 도착.`)
      : (L === 'en' ? 'No more shuttle buses running today.'
        : L === 'zh' ? '今日校车运行已全部结束。'
        : L === 'ja' ? '本日のシャトルバス運行は終了しました。'
        : '오늘 남은 셔틀버스 운행이 종료되었습니다.');

    return {
      type: 'shuttle',
      destTitle,
      walkMin,
      fromBuilding: roomMeta.building,
      arriveStop: toTimeStr(arriveStopMin),
      bestMatch: bestShuttle ? {
        shuttleDep: bestShuttle.dep,
        waitMinAtStop: toMin(bestShuttle.dep) - arriveStopMin,
        termArrive: bestShuttle.terminal,
        stationArrive: bestShuttle.station
      } : null,
      upcoming: nextShuttles.slice(0, 4),
      tips
    };
  }

  return {
    BUILDINGS,
    parseRoom,
    formatRoom,
    calculateRoute,
    TRANSIT_DATA,
    getTransitRecommendation
  };
}));
