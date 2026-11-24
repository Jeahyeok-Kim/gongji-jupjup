// 공지 줍줍 수집기 - 에브리타임 시간표 원클릭 수집 브리지
// 에브리타임(everytime.kr) 시간표 페이지에서 과목명, 담당 교수명, 요일/시간, 강의실을 자동으로 추출하여
// 공지 줍줍 웹 앱 및 서버로 원클릭 전달합니다.
(() => {
  if (window.__gongjiEverytimeBridge) return;
  window.__gongjiEverytimeBridge = true;

  const DAYS_MAP = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6, '일': 0 };

  // 에브리타임 시간표 파싱 함수
  function parseEverytimeTable() {
    const courses = [];
    // 1) 시간표 테이블 셀 또는 과목 목록 DOM 탐색
    const subjectCards = document.querySelectorAll('.grid .subject, #timetableList .subject, .tableview .subject, div[class*="subject"]');
    
    // 에브리타임 전역 timetable 객체가 있는 경우 최우선 활용
    if (window.timetable && Array.isArray(window.timetable.subjects)) {
      window.timetable.subjects.forEach(s => {
        const name = String(s.name || s.subject_name || '').trim();
        const prof = String(s.professor || s.prof || '').trim();
        const timePlace = String(s.timePlace || s.time || '').trim();
        if (name) {
          courses.push({
            name,
            prof,
            timePlace,
            source: 'everytime_js'
          });
        }
      });
      if (courses.length > 0) return courses;
    }

    // 2) DOM 기반 파싱
    const seenKeys = new Set();
    const cells = document.querySelectorAll('.grid td, .table_data td, .subject');
    cells.forEach(cell => {
      const nameEl = cell.querySelector('h3, .name, strong, .title');
      const profEl = cell.querySelector('.professor, .prof, em');
      const placeEl = cell.querySelector('.place, .room');

      if (nameEl) {
        const name = nameEl.textContent.trim();
        const prof = profEl ? profEl.textContent.trim() : '';
        const room = placeEl ? placeEl.textContent.trim() : '';
        const key = `${name}|${prof}`;
        if (name && !seenKeys.has(key)) {
          seenKeys.add(key);
          courses.push({
            name,
            prof,
            room,
            source: 'everytime_dom'
          });
        }
      }
    });

    return courses;
  }

  // 화면 우측 하단에 미니멀한 '공지줍줍으로 시간표 보내기' 플로팅 위젯 삽입
  function injectFloatingButton() {
    if (document.getElementById('gongji-tt-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'gongji-tt-btn';
    btn.type = 'button';
    btn.innerHTML = `
      <span style="font-size:15px;">📦</span>
      <span style="font-size:12.5px;font-weight:700;letter-spacing:-0.02em;">공지줍줍으로 시간표 보내기</span>
    `;
    btn.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 10px 16px;
      background: #10b981;
      color: #ffffff;
      border: 0;
      border-radius: 24px;
      box-shadow: 0 4px 18px rgba(16, 185, 129, 0.42);
      font-family: -apple-system, BlinkMacSystemFont, "Pretendard", sans-serif;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-2px) scale(1.03)';
      btn.style.boxShadow = '0 6px 22px rgba(16, 185, 129, 0.55)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'none';
      btn.style.boxShadow = '0 4px 18px rgba(16, 185, 129, 0.42)';
    });

    btn.addEventListener('click', async () => {
      btn.innerHTML = `<span style="font-size:14px;">⏳</span><span style="font-size:12px;font-weight:700;">시간표 읽는 중…</span>`;
      btn.style.background = '#059669';

      const items = parseEverytimeTable();
      const payload = {
        source: 'everytime',
        collectedAt: Date.now(),
        count: items.length,
        items
      };

      try {
        await chrome.storage.local.set({ 'timetable:everytime': payload });
        // 백그라운드 서비스 워커에 알림
        chrome.runtime.sendMessage({ type: 'everytimeSync', data: payload });

        btn.innerHTML = `<span style="font-size:14px;">✓</span><span style="font-size:12px;font-weight:700;">${items.length}개 과목 전달 완료!</span>`;
        btn.style.background = '#10b981';
        setTimeout(() => {
          btn.innerHTML = `<span style="font-size:15px;">📦</span><span style="font-size:12.5px;font-weight:700;">공지줍줍으로 시간표 보내기</span>`;
        }, 3000);
      } catch (err) {
        btn.innerHTML = `<span style="font-size:14px;">!</span><span style="font-size:12px;font-weight:700;">전송 실패</span>`;
        btn.style.background = '#ef4444';
        setTimeout(() => {
          btn.innerHTML = `<span style="font-size:15px;">📦</span><span style="font-size:12.5px;font-weight:700;">공지줍줍으로 시간표 보내기</span>`;
          btn.style.background = '#10b981';
        }, 3000);
      }
    });

    document.body.appendChild(btn);
  }

  // 에브리타임 시간표 페이지가 로드되면 버튼 노출
  if (location.pathname.includes('/timetable') || location.pathname === '/' || location.pathname.includes('/table')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(injectFloatingButton, 800));
    } else {
      setTimeout(injectFloatingButton, 800);
    }
  }
})();
