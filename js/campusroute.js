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

  // 두 강의실 간 이동 동선, 소요 시간, 헐떡고개 경보 계산
  function calculateRoute(fromRoomStr, toRoomStr, breakMinutes) {
    const from = parseRoom(fromRoomStr);
    const to = parseRoom(toRoomStr);
    const breakMin = typeof breakMinutes === 'number' ? breakMinutes : 15;

    // 온라인 수업이 포함된 경우 이동 불필요
    if (from.isOnline || to.isOnline || !from.building || !to.building) {
      return {
        level: 'safe',
        statusText: '🟢 이동 여유 (온라인 연강)',
        walkMin: 0,
        distM: 0,
        elevationDiff: 0,
        hasHillAlert: false,
        breakMin: breakMin,
        remainMin: breakMin,
        tips: '장소 이동이 필요 없는 온라인/이러닝 수업입니다.',
        details: '온라인 수업'
      };
    }

    // 1. 같은 건물 내 이동
    if (from.building === to.building) {
      const floorDiff = Math.abs((to.floor || 1) - (from.floor || 1));
      let walkMin = 1;
      let tips = '동일 건물 내 강의실 이동입니다.';
      const isElevatorFree = from.buildingMeta && !from.buildingMeta.hasElevator;

      if (floorDiff === 0) {
        walkMin = 1;
        tips = '동일 층 인접 강의실입니다. 1분 이내 여유로운 이동 가능!';
      } else if (floorDiff <= 2) {
        walkMin = 2;
        tips = `${floorDiff}개 층 계단 이동. 쉬는 시간 여유 있습니다.`;
      } else {
        walkMin = isElevatorFree ? 4 : 3;
        tips = isElevatorFree
          ? `⚠️ ${from.building}은 엘리베이터가 없습니다! ${floorDiff}개 층 계단 이동 필요 (+4분 소요)`
          : `쉬는 시간 엘리베이터 혼잡 시 비상계단 이용 권장 (${floorDiff}개 층 이동)`;
      }

      return {
        level: 'safe',
        statusText: '🟢 10분 컷 여유 (동일 건물)',
        walkMin: walkMin,
        distM: floorDiff * 20,
        elevationDiff: floorDiff * 3.5,
        hasHillAlert: false,
        breakMin: breakMin,
        remainMin: Math.max(0, breakMin - walkMin),
        tips: tips,
        details: `${from.building} ${from.floor}층 ➔ ${to.floor}층`
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
      hillReason = '국제교육관 ↔ 종합강의동 급경사로(헐떡고개) 등판 코스';
      shortcut = '중원도서관 측면 계단 샛길 이용 시 약 1.5분 단축 가능!';
    } else if ((from.building === '국제교육관' && (to.building === '공학관' || to.building === '모빌리티융합관')) ||
               ((from.building === '공학관' || from.building === '모빌리티융합관') && to.building === '국제교육관')) {
      baseDist = 520;
      hasHillAlert = true;
      hillReason = '헐떡고개 최대 고저차(+34m) 급경사 코스';
      shortcut = '중원도서관 1층 로비 관통 통로를 이용하면 경사를 피해 이동 가능!';
    } else if ((from.building === '국제교육관' && (to.building === '의생명과학관' || to.building === '간호대학')) ||
               ((from.building === '의생명과학관' || to.building === '간호대학') && to.building === '국제교육관')) {
      baseDist = 650;
      hasHillAlert = true;
      hillReason = '캠퍼스 최저 지대 ↔ 최고 지대(+48m) 장거리 고난도 등판 코스';
      shortcut = '수업 종료 즉시 빠른 걸음 이동 필수 (자전거/킥보드 우회 권장)';
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
    let statusText = '🟢 10분 컷 여유';
    if (walkMin >= 9 || (walkMin >= 8 && hasHillAlert)) {
      level = 'danger';
      statusText = '🚨 10분 컷 초위험! (헐떡고개 경보)';
    } else if (walkMin >= 6 || hasHillAlert) {
      level = 'warning';
      statusText = '🟡 10분 컷 빠듯 (빠른 걸음 권장)';
    }

    const remainMin = breakMin - walkMin;
    let tips = '';
    if (level === 'danger') {
      tips = `⚠️ 예상 도보 소요 ${walkMin}분! 쉬는 시간(${breakMin}분) 대비 아슬아슬합니다. 수업 끝나자마자 바로 출발하세요. ${shortcut || hillReason}`;
    } else if (level === 'warning') {
      tips = `예상 소요 ${walkMin}분. ${hasHillAlert ? '언덕 경사로가 포함되어 있습니다. ' : ''}${shortcut || '여유 시간이 많지 않으니 서두르세요.'}`;
    } else {
      tips = `예상 소요 ${walkMin}분 (잔여 여유 ${remainMin}분). 완만하고 편안하게 이동할 수 있습니다.`;
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
        intervalMin: 25,
        firstBus: '06:00',
        lastBus: '21:30',
        durationMin: 100,
        fare: '9,200원'
      },
      'gangnam': {
        dest: '서울 강남 센트럴시티 (고속터미널)',
        intervalMin: 35,
        firstBus: '06:00',
        lastBus: '21:00',
        durationMin: 105,
        fare: '10,000원'
      },
      'suwon': {
        dest: '수원버스터미널 / 경기남부',
        intervalMin: 50,
        firstBus: '07:00',
        lastBus: '20:30',
        durationMin: 90,
        fare: '8,500원'
      },
      'seongnam': {
        dest: '성남(야탑) 터미널',
        intervalMin: 60,
        firstBus: '07:20',
        lastBus: '20:00',
        durationMin: 85,
        fare: '8,300원'
      }
    },
    // 금요일 및 통학 정기 하교 버스
    commuter: [
      { name: '서울/강남·잠실 노선', dep: '15:30', spot: '대운동장 앞', note: '금요일 운행' },
      { name: '수원/안양 노선', dep: '15:30', spot: '대운동장 앞', note: '금요일 운행' },
      { name: '서울/강남·잠실 2차', dep: '17:30', spot: '대운동장 앞', note: '금요일 운행' },
      { name: '일산/부천 노선', dep: '17:30', spot: '대운동장 앞', note: '금요일 운행' }
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
  function getTransitRecommendation(lastClassEndTime, lastClassRoom, destination) {
    const dest = destination || 'shuttle'; // 'shuttle', 'ktx', 'seoul', 'suwon', 'commuter'
    const endMin = toMin(lastClassEndTime || '15:00');
    const roomMeta = parseRoom(lastClassRoom);
    const bMeta = roomMeta.buildingMeta || { shuttleWalkMin: 6 };
    const walkMin = bMeta.shuttleWalkMin || 6;
    const arriveStopMin = endMin + walkMin; // 대운동장 정류장 도착 예상 시각

    // 1. 탑승 가능한 다음 셔틀버스 찾기
    const nextShuttles = TRANSIT_DATA.shuttle.filter((s) => toMin(s.dep) >= arriveStopMin);
    const bestShuttle = nextShuttles[0] || null;

    // 2. 목적지별 특화 정보 조합
    if (dest === 'ktx') {
      // 충주역 도착 후 탈 수 있는 KTX 찾기
      const recs = [];
      for (const sh of nextShuttles.slice(0, 3)) {
        const stationArriveMin = toMin(sh.station);
        // 환승 여유 10분 이상인 KTX 검색
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
            arrPangyo: targetKtx.arrPangyo,
            summary: `${sh.dep} 셔틀 탑승 ➔ 충주역 ${sh.station} 도착 ➔ ${targetKtx.dep} ${targetKtx.train} (판교 ${targetKtx.arrPangyo} 도착)`
          });
        }
      }

      return {
        type: 'ktx',
        destTitle: '🚄 충주역 ➔ 판교/수서 방면 KTX-이음 연계',
        walkMin,
        fromBuilding: roomMeta.building,
        arriveStop: toTimeStr(arriveStopMin),
        bestMatch: recs[0] || null,
        alternatives: recs.slice(1),
        tips: `강의실(${roomMeta.name})에서 대운동장 셔틀 정류장까지 도보 약 ${walkMin}분 소요. 충주역 KTX 탑승까지 매칭되었습니다.`
      };
    }

    if (dest === 'seoul' || dest === 'suwon') {
      const busKey = dest === 'seoul' ? 'dongseoul' : 'suwon';
      const busMeta = TRANSIT_DATA.terminalBuses[busKey];
      const recs = nextShuttles.slice(0, 3).map((sh) => {
        const termArriveMin = toMin(sh.terminal);
        const nextBusMin = termArriveMin + 15; // 터미널 도착 후 예매/탑승 여유 15분
        return {
          shuttleDep: sh.dep,
          termArrive: sh.terminal,
          waitMinAtStop: toMin(sh.dep) - arriveStopMin,
          estBusTime: toTimeStr(nextBusMin),
          busInfo: busMeta
        };
      });

      return {
        type: 'terminal',
        destTitle: `🚌 충주터미널 ➔ ${busMeta.dest}`,
        walkMin,
        fromBuilding: roomMeta.building,
        arriveStop: toTimeStr(arriveStopMin),
        bestMatch: recs[0] || null,
        busMeta,
        tips: `대운동장 셔틀로 충주터미널 이동(약 15분 소요) 후 ${busMeta.intervalMin}분 간격의 직통 버스 연계 탑승 가능.`
      };
    }

    // 기본: 교내 셔틀버스 순환
    return {
      type: 'shuttle',
      destTitle: '🚌 교내 무료 셔틀버스 (캠퍼스 ➔ 충주터미널 ➔ 충주역)',
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
      tips: bestShuttle
        ? `오늘 마지막 수업 종료 후 대운동장 정류장까지 ${walkMin}분 도보. ${bestShuttle.dep} 셔틀 탑승 시 터미널 ${bestShuttle.terminal}, 충주역 ${bestShuttle.station} 도착.`
        : '오늘 운행 가능한 남은 셔틀버스가 없습니다.'
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
