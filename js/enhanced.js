/**
 * 공지 줍줍 — 고도화 모듈 (enhanced.js)
 * app.js 가 모두 로드된 뒤 DOMContentLoaded 가 아닌 'load' 이벤트를 기다려 실행.
 * 기존 코드를 건드리지 않고 기능·UX·접근성을 추가합니다.
 * 모바일(터치) · PC(마우스+키보드) 동시 고려.
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════
     0. 유틸
     ═══════════════════════════════════════════════════════ */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const reduceMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = () => window.innerWidth < 900;

  /* ═══════════════════════════════════════════════════════
     1. Skip-link (접근성: 스크린리더 · 키보드 사용자)
        — Tab 한 번으로 메인 콘텐츠로 바로 이동
     ═══════════════════════════════════════════════════════ */
  function initSkipLink() {
    if ($('.skip-link')) return;
    const main = $('main.layout, section[data-view="notices"]');
    if (!main) return;
    if (!main.id) main.id = 'main-content';
    const a = document.createElement('a');
    a.className = 'skip-link';
    a.href = '#' + main.id;
    a.textContent = '본문으로 바로 가기';
    document.body.prepend(a);
  }

  /* ═══════════════════════════════════════════════════════
     2. 마감 카운트다운 — 갱신 주기 동적화
        기존: 고정 30초 setInterval
        개선: 남은 시간에 따라 10분 / 1분 / 30초 / 10초
     ═══════════════════════════════════════════════════════ */
  let _cdHandle = null;

  function smartCountdown() {
    const els = $$('.tk-time[data-deadline]');
    if (!els.length) return;

    let minRemaining = Infinity;
    els.forEach((el) => {
      const ms = new Date(el.dataset.deadline).getTime() - Date.now();
      if (ms > 0) minRemaining = Math.min(minRemaining, ms);

      // 텍스트 갱신 (기존 countdownText 함수 활용)
      if (window.GongjiLogic && el.dataset.deadline) {
        const rem = ms / 1000;
        if (rem <= 0) {
          el.textContent = '마감';
        } else if (rem < 3600) {
          const h = Math.floor(rem / 3600);
          const m = Math.floor((rem % 3600) / 60);
          const s = Math.floor(rem % 60);
          el.textContent = h > 0
            ? `${h}시간 ${m}분`
            : m > 0
              ? `${m}분 ${s}초`
              : `${s}초`;
        } else if (rem < 86400) {
          const h = Math.floor(rem / 3600);
          const m = Math.floor((rem % 3600) / 60);
          el.textContent = `${h}시간 ${m}분`;
        }
      }
    });

    // 다음 갱신 주기 결정
    clearTimeout(_cdHandle);
    let nextMs;
    if (minRemaining <= 60 * 1000)      nextMs = 10_000;   // 1분 미만: 10초마다
    else if (minRemaining <= 3600_000)  nextMs = 30_000;   // 1시간 미만: 30초마다
    else if (minRemaining <= 86400_000) nextMs = 60_000;   // 하루 미만: 1분마다
    else                                nextMs = 10 * 60_000; // 그 외: 10분마다

    _cdHandle = setTimeout(smartCountdown, nextMs);
  }

  /* ═══════════════════════════════════════════════════════
     3. 마스트헤드 collapse (모바일 스크롤 UX)
        — 아래로 100px 이상 스크롤하면 hero 영역을 접고
          검색창만 남긴다. 위로 올리면 복원.
     ═══════════════════════════════════════════════════════ */
  function initMastheadCollapse() {
    const masthead = $('.masthead');
    if (!masthead) return;

    let lastY = 0;
    let ticking = false;

    function update() {
      const y = window.scrollY;
      const tab = document.body.dataset.tab;
      if (tab !== 'home') { ticking = false; return; }

      // 모바일: 100px 이상 내려가면 collapse
      // PC: 200px 이상에서만 적용 (PC는 화면 여유있어 더 늦게)
      const threshold = isMobile() ? 90 : 200;

      if (y > threshold && y > lastY) {
        masthead.classList.add('is-collapsed');
      } else if (y < threshold - 20) {
        // 약간의 히스테리시스로 깜빡임 방지
        masthead.classList.remove('is-collapsed');
      }

      lastY = y;
      ticking = false;
    }

    if (reduceMotion()) return; // 움직임 줄이기 환경에서는 collapse 없음

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });

    // 탭 전환 시 collapse 해제
    const observer = new MutationObserver(() => {
      if (document.body.dataset.tab !== 'home') {
        masthead.classList.remove('is-collapsed');
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-tab'] });
  }

  /* ═══════════════════════════════════════════════════════
     4. 활성 필터 칩 × 해제 버튼
        — aria-pressed="true" 인 칩에 × 버튼을 추가.
           × 를 누르면 칩 자체를 한번 더 클릭해 해제.
     ═══════════════════════════════════════════════════════ */
  function initChipClear() {
    // DOM 변화 감지: 칩이 새로 그려질 때마다 × 버튼 주입
    const chipContainers = $$('.chips, #chips, #subchips');

    function attachClearBtns(container) {
      $$('.chip', container).forEach((chip) => {
        // 이미 × 버튼 있으면 스킵
        if ($('.chip-clear', chip)) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip-clear';
        btn.setAttribute('aria-label', '필터 해제');
        btn.setAttribute('tabindex', '-1'); // 칩 자체가 접근 가능
        btn.textContent = '×';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (chip.getAttribute('aria-pressed') === 'true') {
            chip.click(); // 칩 토글
          }
        });
        chip.append(btn);
      });
    }

    chipContainers.forEach((c) => {
      attachClearBtns(c);
      new MutationObserver(() => attachClearBtns(c)).observe(c, {
        childList: true, subtree: true
      });
    });
  }

  /* ═══════════════════════════════════════════════════════
     5. 상세 대화상자 — 스크롤 위치 복원
        — 같은 공지를 다시 열면 이전에 보던 위치로
     ═══════════════════════════════════════════════════════ */
  function initDetailScrollMemory() {
    const detail = $('#detail');
    if (!detail) return;

    const mem = {}; // { noticeId: scrollTop }
    let currentId = null;

    // dialog 가 열릴 때마다 현재 공지 id를 body의 data- 로 추적
    const bodyObserver = new MutationObserver(() => {
      const id = detail.dataset.noticeId;
      if (id && id !== currentId) {
        currentId = id;
        const body = $('.dialog-body', detail);
        if (!body) return;

        // 이전 위치 복원
        if (mem[id] && mem[id] > 0) {
          requestAnimationFrame(() => { body.scrollTop = mem[id]; });
        }

        // 스크롤 위치 저장
        body.addEventListener('scroll', () => {
          if (currentId) mem[currentId] = body.scrollTop;
        }, { passive: true });
      }
    });

    bodyObserver.observe(detail, { attributes: true, attributeFilter: ['data-notice-id'] });
  }

  /* ═══════════════════════════════════════════════════════
     6. 단축키 힌트 — 상세 패널 footer (PC 전용)
        — 키보드 사용자에게 ← → S Esc 힌트 한 줄
     ═══════════════════════════════════════════════════════ */
  function initDetailKbdHint() {
    if (isMobile()) return;

    const detail = $('#detail');
    if (!detail) return;

    const actions = $('.detail-actions', detail);
    if (!actions) return;

    // 이미 있으면 스킵
    if ($('.kbd-hint', actions)) return;

    const hint = document.createElement('p');
    hint.className = 'kbd-hint';
    hint.setAttribute('aria-hidden', 'true');

    const keys = [
      ['←', '이전'],
      ['→', '다음'],
      ['S', '저장'],
      ['Esc', '닫기'],
    ];
    keys.forEach(([k, label]) => {
      const kbd = document.createElement('kbd');
      kbd.textContent = k;
      hint.append(kbd, ' ' + label + '  ');
    });

    // detail-foot 오른쪽에 왼쪽 정렬로 추가
    actions.prepend(hint);
  }

  /* ═══════════════════════════════════════════════════════
     7. 혜택 금액 TOP 3 미니 막대 차트
        오늘 화면 "이번 주 큰 혜택" 섹션에 추가
     ═══════════════════════════════════════════════════════ */
  function renderBenefitChart() {
    const notices = window.GONGJI_DATA && window.GONGJI_DATA.notices;
    if (!notices || !notices.length) return;

    // 마감 안 지난 공지 중 혜택 금액 상위 3개
    const now = new Date();
    const top = notices
      .filter(n => n.benefit && (n.benefit.won || n.benefit.prize || n.benefit.points))
      .filter(n => !n.deadline || new Date(n.deadline) > now)
      .map(n => ({
        id: n.id,
        title: n.title,
        amount: n.benefit.won || n.benefit.prize || (n.benefit.points ? n.benefit.points * 100 : 0),
        label: n.benefit.won
          ? formatWon(n.benefit.won)
          : n.benefit.prize
            ? formatWon(n.benefit.prize)
            : `${n.benefit.points}P`,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    if (!top.length) return;

    // 이미 렌더링된 섹션 찾기 (sec-benefit 이라는 클래스)
    const existing = $('.sec-benefit-chart');
    if (existing) return; // 이미 주입됨

    const max = top[0].amount;

    const chart = document.createElement('div');
    chart.className = 'benefit-chart sec-benefit-chart';
    chart.setAttribute('aria-label', '혜택 금액 상위 3개');

    top.forEach((item, i) => {
      const pct = max > 0 ? Math.round((item.amount / max) * 100) : 100;
      const row = document.createElement('div');
      row.className = 'benefit-row';
      row.style.setProperty('--i', i);

      row.innerHTML = `
        <span class="benefit-row-name" title="${item.title}">${item.title}</span>
        <span class="benefit-row-amount">${item.label}</span>
        <div class="benefit-bar-wrap">
          <div class="benefit-bar-fill" style="width:${pct}%; --i:${i}"></div>
        </div>`;

      row.addEventListener('click', () => {
        // 클릭하면 공지 목록으로 이동 (공지 id 활용 시도)
        const hash = `#/notices`;
        if (location.hash !== hash) location.hash = hash;
      });

      chart.append(row);
    });

    // 오늘 화면의 "이번 주 큰 금액" 브리핑 셀 뒤에 삽입
    const briefSection = $('.bf-acad, .brief');
    const homeWrap = $('.home-wrap, .home-v5');
    if (homeWrap) {
      // 가장 처음 .sec 뒤에 혜택 차트 섹션으로 넣기
      const firstSec = $('.sec', homeWrap);
      if (firstSec && firstSec.parentNode) {
        const wrap = document.createElement('div');
        wrap.className = 'home-card';
        wrap.style.marginBottom = '0';

        const head = document.createElement('h3');
        head.style.cssText = 'font-size:15px;font-weight:800;margin-bottom:12px;letter-spacing:-0.02em;';
        head.textContent = '이번 주 혜택 금액 TOP';

        wrap.append(head, chart);

        // 삽입 위치: homeWrap 안의 마지막 자식 앞
        const lastChild = homeWrap.lastElementChild;
        if (lastChild) homeWrap.insertBefore(wrap, lastChild);
        else homeWrap.append(wrap);
      }
    }
  }

  function formatWon(v) {
    if (!v) return '';
    if (v >= 10000) return Math.floor(v / 10000) + '만원';
    return v.toLocaleString() + '원';
  }

  /* ═══════════════════════════════════════════════════════
     가로 스크롤 영역 마우스 드래그 & 휠 스크롤 지원
     ═══════════════════════════════════════════════════════ */
  function enableDragScroll(el) {
    if (!el) return;
    let isDown = false;
    let startX = 0;
    let scrollStart = 0;
    let hasMoved = false;

    const onMove = (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      if (!hasMoved && Math.abs(dx) > 4) {
        hasMoved = true;
        el.classList.add('is-dragging');
      }
      if (hasMoved) el.scrollLeft = scrollStart - dx;
    };

    const onUp = () => {
      if (!isDown) return;
      isDown = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      el.classList.remove('is-dragging');
      if (hasMoved) {
        const preventClick = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        el.addEventListener('click', preventClick, { capture: true, once: true });
        setTimeout(() => el.removeEventListener('click', preventClick, { capture: true }), 120);
      }
    };

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      isDown = true;
      hasMoved = false;
      startX = e.clientX;
      scrollStart = el.scrollLeft;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });

    el.addEventListener('wheel', (e) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }

  /* ═══════════════════════════════════════════════════════
     8. 주간 마감 타임라인 위젯 (모던 프리미엄 리디자인)
        데스크톱: 7컬럼 모던 칸반 보드
        모바일: 스마트 요일 캡슐 탭 + 선택 요일 시원한 카드 덱
     ═══════════════════════════════════════════════════════ */
  function renderWeekTimeline() {
    const notices = window.GONGJI_DATA && window.GONGJI_DATA.notices;
    if (!notices || !notices.length) return;

    // 언어 변경 및 리프레시 시 기존 위젯 깨끗하게 재구성
    const existing = $('.week-timeline-sec');
    if (existing) existing.remove();

    const lang = document.documentElement.lang || localStorage.getItem('gongji:lang') || 'ko';
    const I = window.GongjiI18n;
    const T = (I && I.T && I.T[lang]) || {};
    const DOW_NAMES = (I && I.WEEKDAYS && I.WEEKDAYS[lang]) || ['일', '월', '화', '수', '목', '금', '토'];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 이번 주 월요일부터 일요일까지
    const dow = today.getDay(); // 0=일
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });

    // 이번 주에 마감인 공지 필터
    const weekEnd = new Date(days[6]);
    weekEnd.setHours(23, 59, 59, 999);

    const withDeadline = notices.filter(n => {
      if (!n.deadline) return false;
      const dl = new Date(n.deadline);
      return dl >= today && dl <= weekEnd;
    });

    if (withDeadline.length < 1) return; // 1개 이상이면 표시

    const saved = (() => {
      try { return JSON.parse(localStorage.getItem('gongji:saved') || '[]'); } catch { return []; }
    })();

    const CAT_COLORS = {
      '장학': 'var(--badge-money, #f59e0b)',
      '학사': 'var(--accent, #10b981)',
      '취업': 'var(--badge-exp, #3b82f6)',
      '행사': '#8b5cf6',
      '기타': 'var(--badge-info, #64748b)'
    };

    // 요일별 공지 매핑
    const dayMap = {};
    days.forEach(d => {
      const dayStr = d.toISOString().slice(0, 10);
      dayMap[dayStr] = withDeadline.filter(n => n.deadline && n.deadline.startsWith(dayStr));
    });

    // 섹션 컨테이너
    const sec = document.createElement('div');
    sec.className = 'home-card week-timeline-sec';
    sec.style.marginTop = '0';

    // 1. 헤더 영역
    const headWrap = document.createElement('div');
    headWrap.className = 'wt-sec-head';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'wt-sec-title-wrap';

    const h3 = document.createElement('h3');
    h3.className = 'wt-sec-title';
    h3.innerHTML = `📅 <span>${T.timelineTitle || '이번 주 마감 타임라인'}</span>`;

    const count = document.createElement('span');
    count.className = 'wt-sec-count';
    count.textContent = T.unitCount ? `${withDeadline.length}${T.unitCount}` : `${withDeadline.length}`;
    h3.append(count);

    const sub = document.createElement('p');
    sub.className = 'wt-sec-sub';
    sub.textContent = T.timelineSub || '다가오는 일주일간의 주요 마감 일정입니다.';

    titleWrap.append(h3, sub);

    const viewAllBtn = document.createElement('button');
    viewAllBtn.type = 'button';
    viewAllBtn.className = 'wt-view-all-btn';
    viewAllBtn.textContent = T.timelineViewAll || (lang === 'en' ? 'View all in list ↗' : lang === 'zh' ? '在列表中查看 ↗' : lang === 'ja' ? '一覧で確認 ↗' : '전체 마감 목록 ↗');
    viewAllBtn.onclick = () => {
      location.hash = '#/list';
      if (window.GongjiApp && window.GongjiApp.goList) {
        window.GongjiApp.goList({ due: 'soon', sort: 'deadline' });
      }
    };

    headWrap.append(titleWrap, viewAllBtn);
    sec.append(headWrap);

    // 공지 카드 생성 헬퍼 함수
    function createNoticeCard(n, isCompact = false) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'wt-item' + (isCompact ? ' is-compact' : '');

      const dl = new Date(n.deadline);
      const hoursLeft = (dl - Date.now()) / 3600_000;
      if (hoursLeft < 24) item.classList.add('is-urgent');
      if (saved.includes(n.id)) item.classList.add('is-saved');

      const cat = n.category || '기타';
      const catColor = CAT_COLORS[cat] || CAT_COLORS['기타'];
      item.style.setProperty('--wt-cat-color', catColor);

      // 상단 메타 바
      const metaRow = document.createElement('div');
      metaRow.className = 'wt-item-meta';

      const catTag = document.createElement('span');
      catTag.className = 'wt-item-cat';
      catTag.textContent = cat;

      const ddayTag = document.createElement('span');
      ddayTag.className = 'wt-item-dday';
      const daysLeft = Math.ceil(hoursLeft / 24);
      if (hoursLeft <= 24) {
        ddayTag.textContent = T.dueToday || '오늘 마감';
        ddayTag.classList.add('urgent');
      } else {
        ddayTag.textContent = `D-${daysLeft}`;
      }

      metaRow.append(catTag, ddayTag);

      // 제목
      const titleEl = document.createElement('div');
      titleEl.className = 'wt-item-title';
      const title = (lang !== 'ko' && n.titleTr && n.titleTr[lang]) || n.title;
      titleEl.textContent = title;
      item.title = title;

      item.append(metaRow, titleEl);

      // 모바일 등 여유 공간이 있을 때 혜택/게시판 배지 추가
      if (!isCompact && ((n.benefit && n.benefit.text) || n.boardName)) {
        const extraRow = document.createElement('div');
        extraRow.className = 'wt-item-extra';
        if (n.boardName) {
          const boardTag = document.createElement('span');
          boardTag.className = 'wt-extra-tag';
          boardTag.textContent = n.boardName;
          extraRow.append(boardTag);
        }
        if (n.benefit && n.benefit.text) {
          const benTag = document.createElement('span');
          benTag.className = 'wt-extra-benefit';
          benTag.textContent = n.benefit.text;
          extraRow.append(benTag);
        }
        item.append(extraRow);
      }

      item.addEventListener('click', () => {
        if (window.GongjiApp && window.GongjiApp.openDetail) {
          window.GongjiApp.openDetail(n.id);
        } else {
          location.hash = '#/n/' + encodeURIComponent(n.id);
        }
      });

      return item;
    }

    // ═══════════════════════════════════════════════════════
    // [1] 데스크톱 뷰: 7컬럼 모던 칸반 보드
    // ═══════════════════════════════════════════════════════
    const desktopTimeline = document.createElement('div');
    desktopTimeline.className = 'week-timeline wt-grid-desktop';

    let todayColEl = null;

    days.forEach((day) => {
      const isToday = day.getTime() === today.getTime();
      const col = document.createElement('div');
      col.className = 'wt-col' + (isToday ? ' is-today' : '');
      if (isToday) todayColEl = col;

      const dayStr = day.toISOString().slice(0, 10);
      const items = dayMap[dayStr] || [];
      const mm = String(day.getMonth() + 1);
      const dd = String(day.getDate());
      const dateText = `${mm}.${dd}`;

      // 컬럼 헤더
      const colHead = document.createElement('div');
      colHead.className = 'wt-col-head';

      const headLeft = document.createElement('div');
      headLeft.className = 'wt-head-left';

      const dowEl = document.createElement('span');
      dowEl.className = 'wt-dow';
      dowEl.textContent = DOW_NAMES[day.getDay()];

      const dateEl = document.createElement('span');
      dateEl.className = 'wt-date';
      dateEl.textContent = dateText;

      headLeft.append(dowEl, dateEl);

      const headRight = document.createElement('div');
      headRight.className = 'wt-head-right';

      if (isToday) {
        const todayBadge = document.createElement('span');
        todayBadge.className = 'wt-today-pill';
        todayBadge.textContent = T.timelineTodayBadge || '오늘';
        headRight.append(todayBadge);
      }

      if (items.length > 0) {
        const cntBadge = document.createElement('span');
        cntBadge.className = 'wt-cnt-badge';
        cntBadge.textContent = T.unitCount ? `${items.length}${T.unitCount}` : `${items.length}`;
        headRight.append(cntBadge);
      }

      colHead.append(headLeft, headRight);
      col.append(colHead);

      // 컬럼 공지 목록
      const colBody = document.createElement('div');
      colBody.className = 'wt-col-body';

      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'wt-col-empty';
        empty.innerHTML = `<span class="wt-empty-icon">☕</span><span>${T.timelineNoDeadlines || '마감 없음'}</span>`;
        colBody.append(empty);
      } else {
        items.slice(0, 5).forEach(n => {
          colBody.append(createNoticeCard(n, true));
        });

        if (items.length > 5) {
          const moreBtn = document.createElement('button');
          moreBtn.type = 'button';
          moreBtn.className = 'wt-more-hint-btn';
          moreBtn.textContent = `+${items.length - 5}건 더보기 ↗`;
          moreBtn.onclick = () => {
            if (window.GongjiApp && window.GongjiApp.goList) {
              window.GongjiApp.goList({ due: 'soon', sort: 'deadline' });
            }
          };
          colBody.append(moreBtn);
        }
      }

      col.append(colBody);
      desktopTimeline.append(col);
    });

    enableDragScroll(desktopTimeline);
    sec.append(desktopTimeline);

    // ═══════════════════════════════════════════════════════
    // [2] 모바일 뷰: 스마트 요일 캡슐 탭 + 선택 요일 시원한 카드 덱
    // ═══════════════════════════════════════════════════════
    const mobileTimeline = document.createElement('div');
    mobileTimeline.className = 'wt-deck-mobile';

    // 기본 선택 요일: 오늘(마감 있든 없든) 또는 마감 있는 가장 가까운 요일
    let selectedDayIdx = days.findIndex(d => d.getTime() === today.getTime());
    if (selectedDayIdx === -1) selectedDayIdx = 0;

    // 상단 7일 요일 스트립 바
    const dayStrip = document.createElement('div');
    dayStrip.className = 'wt-mob-day-strip';

    const dayBtns = [];
    const cardDeckContainer = document.createElement('div');
    cardDeckContainer.className = 'wt-mob-cards-container';

    function renderMobileCards(dayIndex) {
      selectedDayIdx = dayIndex;
      const targetDay = days[dayIndex];
      const targetDayStr = targetDay.toISOString().slice(0, 10);
      const items = dayMap[targetDayStr] || [];
      const isTargetToday = targetDay.getTime() === today.getTime();

      // 버튼 활성 상태 갱신
      dayBtns.forEach((btn, idx) => {
        btn.classList.toggle('is-active', idx === dayIndex);
      });

      cardDeckContainer.innerHTML = '';

      // 선택 요일 정보 배너
      const deckHeader = document.createElement('div');
      deckHeader.className = 'wt-mob-deck-head';

      const deckTitle = document.createElement('span');
      deckTitle.className = 'wt-mob-deck-title';
      const mm = String(targetDay.getMonth() + 1);
      const dd = String(targetDay.getDate());
      deckTitle.textContent = `${mm}월 ${dd}일 (${DOW_NAMES[targetDay.getDay()]})${isTargetToday ? ' · 오늘 마감' : ''}`;

      const deckCount = document.createElement('span');
      deckCount.className = 'wt-mob-deck-count';
      deckCount.textContent = items.length > 0 ? (T.unitCount ? `${items.length}${T.unitCount} 마감` : `${items.length}건 마감`) : '마감 없음';
      if (items.length > 0) deckCount.classList.add('has-items');

      deckHeader.append(deckTitle, deckCount);
      cardDeckContainer.append(deckHeader);

      if (items.length === 0) {
        const emptyDeck = document.createElement('div');
        emptyDeck.className = 'wt-mob-empty';
        emptyDeck.innerHTML = `
          <div class="wt-mob-empty-icon">☕</div>
          <div class="wt-mob-empty-title">${T.timelineNoDeadlines || '마감 공지가 없습니다'}</div>
          <div class="wt-mob-empty-sub">이 날은 여유롭게 학업과 휴식을 즐겨보세요!</div>
        `;
        cardDeckContainer.append(emptyDeck);
      } else {
        const listWrap = document.createElement('div');
        listWrap.className = 'wt-mob-cards-list';
        items.forEach(n => {
          listWrap.append(createNoticeCard(n, false));
        });
        cardDeckContainer.append(listWrap);
      }
    }

    days.forEach((day, idx) => {
      const isDayToday = day.getTime() === today.getTime();
      const dayStr = day.toISOString().slice(0, 10);
      const items = dayMap[dayStr] || [];

      const dayBtn = document.createElement('button');
      dayBtn.type = 'button';
      dayBtn.className = 'wt-mob-day-pill' + (isDayToday ? ' is-today' : '') + (idx === selectedDayIdx ? ' is-active' : '');

      const dowSpan = document.createElement('span');
      dowSpan.className = 'wt-mob-dow';
      dowSpan.textContent = DOW_NAMES[day.getDay()];

      const numSpan = document.createElement('span');
      numSpan.className = 'wt-mob-num';
      numSpan.textContent = String(day.getDate());

      dayBtn.append(dowSpan, numSpan);

      if (items.length > 0) {
        const dot = document.createElement('span');
        dot.className = 'wt-mob-dot';
        dot.textContent = String(items.length);
        dayBtn.append(dot);
      }

      dayBtn.addEventListener('click', () => {
        renderMobileCards(idx);
      });

      dayBtns.push(dayBtn);
      dayStrip.append(dayBtn);
    });

    mobileTimeline.append(dayStrip, cardDeckContainer);

    // 모바일 터치 스와이프로 요일 전환 제스처
    let touchStartX = 0;
    let touchStartY = 0;
    cardDeckContainer.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    cardDeckContainer.addEventListener('touchend', (e) => {
      const diffX = e.changedTouches[0].screenX - touchStartX;
      const diffY = e.changedTouches[0].screenY - touchStartY;
      if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX < 0 && selectedDayIdx < 6) {
          // 오른쪽으로 스와이프 -> 다음 요일
          renderMobileCards(selectedDayIdx + 1);
        } else if (diffX > 0 && selectedDayIdx > 0) {
          // 왼쪽으로 스와이프 -> 이전 요일
          renderMobileCards(selectedDayIdx - 1);
        }
      }
    }, { passive: true });

    renderMobileCards(selectedDayIdx);
    sec.append(mobileTimeline);

    // 홈 화면 상단에 주입
    const homeWrap = $('.home-wrap, #home-body');
    if (homeWrap) {
      homeWrap.prepend(sec);
    }

    // 데스크톱 오늘 컬럼 포커스 스크롤
    if (todayColEl) {
      setTimeout(() => {
        try {
          const offset = todayColEl.offsetLeft - 16;
          desktopTimeline.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
        } catch (_) {}
      }, 150);
    }
  }

  /* ═══════════════════════════════════════════════════════
     8-1. 주요 학사일정 D-Day 로드맵 위젯
          오늘 이후 다가오는 핵심 학사일정 타임트랙 카드
     ═══════════════════════════════════════════════════════ */
  function renderAcademicDdayWidget() {
    const cal = window.GONGJI_CALENDAR;
    if (!cal || !cal.items || !cal.items.length) return;
    if ($('.acad-roadmap-sec')) return;

    const lang = document.documentElement.lang || localStorage.getItem('gongji:lang') || 'ko';
    const I = window.GongjiI18n;
    const T = (I && I.T && I.T[lang]) || {};
    const DOW_NAMES = (I && I.WEEKDAYS && I.WEEKDAYS[lang]) || ['일', '월', '화', '수', '목', '금', '토'];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = cal.items.filter(item => {
      if (!item.end && !item.start) return false;
      const endD = new Date(item.end || item.start);
      endD.setHours(23, 59, 59, 999);
      return endD >= today;
    }).slice(0, 4);

    if (!upcoming.length) return;

    const sec = document.createElement('div');
    sec.className = 'home-card acad-roadmap-sec';

    const head = document.createElement('div');
    head.className = 'ar-head';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'ar-title-wrap';

    const h3 = document.createElement('h3');
    h3.className = 'ar-title';
    h3.innerHTML = `🎓 <span>${T.acadRoadmapTitle || '주요 학사일정 로드맵'}</span>`;

    const sub = document.createElement('p');
    sub.className = 'ar-sub';
    sub.textContent = T.acadRoadmapSub || '건국대학교 GLOCAL캠퍼스 주요 학사일정입니다.';

    titleWrap.append(h3, sub);

    const viewAllBtn = document.createElement('button');
    viewAllBtn.type = 'button';
    viewAllBtn.className = 'ar-view-all';
    viewAllBtn.textContent = T.acadViewAll || '전체 달력 보기 ↗';
    viewAllBtn.onclick = () => {
      location.hash = '#/calendar';
      if (typeof setTab === 'function') setTab('calendar', true);
    };

    head.append(titleWrap, viewAllBtn);

    const list = document.createElement('div');
    list.className = 'ar-list';

    upcoming.forEach(item => {
      const row = document.createElement('div');
      row.className = 'ar-item';

      const startD = new Date(item.start);
      startD.setHours(0, 0, 0, 0);
      const endD = new Date(item.end || item.start);
      endD.setHours(23, 59, 59, 999);

      const daysUntilStart = Math.ceil((startD - today) / 86400000);
      const isOngoing = today >= startD && today <= endD;

      // 아이콘 결정
      const rawTitle = (item.title && (item.title.ko || item.title)) || '';
      let icon = '🏛️';
      if (/시험|기말|중간/.test(rawTitle)) icon = '📝';
      else if (/방학|계절/.test(rawTitle)) icon = '❄️';
      else if (/성적|정정|열람/.test(rawTitle)) icon = '📊';
      else if (/수업|개강|종강/.test(rawTitle)) icon = '📚';
      else if (/등록|휴학|복학/.test(rawTitle)) icon = '💳';

      const iconEl = document.createElement('span');
      iconEl.className = 'ar-icon';
      iconEl.textContent = icon;

      const infoWrap = document.createElement('div');
      infoWrap.className = 'ar-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'ar-item-title';
      const displayTitle = (item.title && typeof item.title === 'object' && (item.title[lang] || item.title.ko)) || rawTitle;
      titleEl.textContent = displayTitle;

      const dateEl = document.createElement('div');
      dateEl.className = 'ar-item-period';
      const fmtDate = (d) => {
        const mm = d.getMonth() + 1;
        const dd = d.getDate();
        const dow = DOW_NAMES[d.getDay()];
        return `${mm}.${dd}(${dow})`;
      };
      dateEl.textContent = item.start === item.end ? fmtDate(startD) : `${fmtDate(startD)} ~ ${fmtDate(endD)}`;

      infoWrap.append(titleEl, dateEl);

      const ddayBadge = document.createElement('span');
      ddayBadge.className = 'ar-dday' + (isOngoing ? ' is-ongoing' : daysUntilStart <= 7 ? ' is-urgent' : '');
      if (isOngoing) {
        ddayBadge.textContent = T.bfOngoing || '진행 중';
      } else if (daysUntilStart === 0) {
        ddayBadge.textContent = T.dueToday || '오늘 시작';
      } else {
        ddayBadge.textContent = `D-${daysUntilStart}`;
      }

      row.append(iconEl, infoWrap, ddayBadge);
      list.append(row);
    });

    sec.append(head, list);

    const weekSec = $('.week-timeline-sec');
    if (weekSec && weekSec.nextSibling) {
      weekSec.parentNode.insertBefore(sec, weekSec.nextSibling);
    } else {
      const homeWrap = $('.home-wrap, #home-body');
      if (homeWrap) homeWrap.append(sec);
    }
  }

  /* ═══════════════════════════════════════════════════════
     9. 알림 개별 읽음 처리 — 클릭 즉시 is-new 제거
     ═══════════════════════════════════════════════════════ */
  function initAlertReadOnClick() {
    const alertsDialog = $('#alerts');
    if (!alertsDialog) return;

    alertsDialog.addEventListener('click', (e) => {
      const item = e.target.closest('.alert-item');
      if (!item) return;
      if (item.classList.contains('is-new')) {
        item.classList.remove('is-new');
        // 뱃지 카운트 줄이기
        const badge = $('#alerts-badge');
        if (badge && !badge.hidden) {
          const n = parseInt(badge.textContent, 10);
          if (n <= 1) badge.hidden = true;
          else badge.textContent = String(n - 1);
        }
      }
    });
  }

  /* ═══════════════════════════════════════════════════════
     10. 토스트 — 접근성 개선
         기존 role="status" 에 aria-live="polite" 이미 있음.
         추가: 토스트가 사라질 때 포커스 이전 위치로 복원.
     ═══════════════════════════════════════════════════════ */
  function initToastFocusRestore() {
    const toast = $('#toast');
    if (!toast) return;

    let prevFocus = null;

    const obs = new MutationObserver(() => {
      if (!toast.hidden) {
        prevFocus = document.activeElement;
      } else if (prevFocus && document.contains(prevFocus)) {
        prevFocus.focus({ preventScroll: true });
        prevFocus = null;
      }
    });
    obs.observe(toast, { attributes: true, attributeFilter: ['hidden'] });
  }

  /* ═══════════════════════════════════════════════════════
     11. 카드 목록 — 행 클릭 가능 영역 힌트 (모바일)
         모바일에서 카드 행의 card-link::after 가 영역을 덮는데,
         시각적으로 커서가 없어 클릭 가능 여부 불명확.
         → 터치 start 시 옅은 highlight 추가
     ═══════════════════════════════════════════════════════ */
  function initCardTouchFeedback() {
    if (!isMobile()) return;

    document.addEventListener('touchstart', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      card.classList.add('is-touching');
    }, { passive: true });

    document.addEventListener('touchend', () => {
      $$('.card.is-touching').forEach(c => c.classList.remove('is-touching'));
    }, { passive: true });

    // CSS: is-touching 상태
    const style = document.createElement('style');
    style.textContent = `.card.is-touching::before { opacity: 1 !important; }`;
    document.head.append(style);
  }

  /* ═══════════════════════════════════════════════════════
     12. PWA — manifest share_target 주입 (필요 시)
     ═══════════════════════════════════════════════════════ */
  // manifest.webmanifest 는 별도 파일이라 여기서는 service worker 등록 후
  // URL 파라미터를 감지해 검색창으로 연결하는 방식으로 처리
  function initShareTarget() {
    const params = new URLSearchParams(location.search);
    const sharedText = params.get('shared-text') || params.get('text') || params.get('title');
    if (!sharedText) return;

    // 검색창에 shared text 주입
    const q = $('#q');
    if (!q) return;
    q.value = sharedText;
    q.dispatchEvent(new Event('input', { bubbles: true }));
    q.dispatchEvent(new Event('change', { bubbles: true }));

    // 공지 탭으로 이동
    setTimeout(() => {
      if (location.hash !== '#/notices') location.hash = '#/notices';
      q.focus();
    }, 300);
  }

  /* ═══════════════════════════════════════════════════════
     13. 오늘 화면 "오늘 마감 투두 체크리스트" 위젯 (Today's Checklist)
         오늘 마감 중 미완료 공지를 투두 형태로 제공 + 원클릭 지원완료 & 상세 열기
     ═══════════════════════════════════════════════════════ */
  function renderTodayChecklist() {
    const notices = window.GONGJI_DATA && window.GONGJI_DATA.notices;
    if (!notices || !notices.length) return;

    // 기존 요소가 있으면 내용만 갱신하거나 재작성
    const existing = $('.today-checklist-sec');
    if (existing) existing.remove();

    const app = window.GongjiApp;
    const isApplied = (id) => {
      if (app && typeof app.isApplied === 'function') return app.isApplied(id);
      try {
        const arr = JSON.parse(localStorage.getItem('gongji:applied') || '[]');
        return arr.includes(id);
      } catch { return false; }
    };

    const now = new Date();
    const todayStr = new Intl.DateTimeFormat('en-CA').format(now); // 'YYYY-MM-DD'
    const lang = (app && app.getState && app.getState().lang) || document.documentElement.lang || 'ko';

    const todayDue = notices.filter(n => {
      if (!n.deadline) return false;
      return n.deadline.startsWith(todayStr);
    });

    if (!todayDue.length) return;

    const unapplied = todayDue.filter(n => !isApplied(n.id));

    const sec = document.createElement('div');
    sec.className = 'home-card today-checklist-sec';

    const getI18nText = () => {
      const pendingCount = unapplied.length;
      if (lang === 'en') {
        return {
          title: `Due today — ${pendingCount} pending`,
          doneTitle: '🎉 All notices due today are completed!',
          timeLabel: (tm) => tm ? `by ${tm}` : 'Today'
        };
      } else if (lang === 'zh') {
        return {
          title: `今日截止 — 还有 ${pendingCount} 项待申请`,
          doneTitle: '🎉 今日截止的所有公告均已完成！',
          timeLabel: (tm) => tm ? `${tm} 截止` : '今日截止'
        };
      } else if (lang === 'ja') {
        return {
          title: `今日締切 — 未応募 ${pendingCount}件`,
          doneTitle: '🎉 今日の締切のお知らせはすべて完了しました！',
          timeLabel: (tm) => tm ? `${tm}まで` : '今日締切'
        };
      }
      return {
        title: `오늘 마감 — 아직 지원 안 한 ${pendingCount}건`,
        doneTitle: '🎉 오늘 마감 공지를 모두 지원·확인했습니다!',
        timeLabel: (tm) => tm ? `${tm} 마감` : '오늘 마감'
      };
    };

    const i18n = getI18nText();

    const headDiv = document.createElement('div');
    headDiv.className = 'tc-head';

    const h3 = document.createElement('h3');
    h3.className = 'tc-title';
    h3.textContent = unapplied.length > 0 ? i18n.title : i18n.doneTitle;
    if (unapplied.length === 0) h3.classList.add('tc-all-done');
    headDiv.append(h3);
    sec.append(headDiv);

    if (unapplied.length === 0) {
      const doneCard = document.createElement('div');
      doneCard.className = 'tc-done-box';
      doneCard.innerHTML = `<span class="tc-done-icon">👏</span><span class="tc-done-msg">${lang === 'en' ? 'Great job! You have checked all deadlines today.' : '오늘 마감인 모든 장학금 및 프로그램을 확인했습니다.'}</span>`;
      sec.append(doneCard);
    } else {
      const ul = document.createElement('ul');
      ul.className = 'tc-list';

      todayDue.slice(0, 5).forEach(n => {
        const appliedNow = isApplied(n.id);
        const li = document.createElement('li');
        li.className = 'tc-item' + (appliedNow ? ' is-done' : '');

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'tc-cb';
        cb.checked = appliedNow;
        cb.id = `tdc-${n.id}`;
        cb.setAttribute('aria-label', `${n.title} 지원 완료 토글`);

        // 마감 시간 추출 (예: '2026-11-24T18:00' -> '18:00')
        let timeStr = '';
        if (n.deadline && n.deadline.includes('T')) {
          timeStr = n.deadline.split('T')[1].slice(0, 5);
        }

        const titleBtn = document.createElement('button');
        titleBtn.type = 'button';
        titleBtn.className = 'tc-title-btn';
        titleBtn.textContent = n.title;
        titleBtn.title = '공지 상세 보기';
        titleBtn.onclick = () => {
          if (app && typeof app.openDetail === 'function') {
            app.openDetail(n.id);
          }
        };

        const metaSpan = document.createElement('span');
        metaSpan.className = 'tc-time';
        metaSpan.textContent = i18n.timeLabel(timeStr);

        cb.addEventListener('change', () => {
          if (app && typeof app.toggleApplied === 'function') {
            app.toggleApplied(n.id);
          } else {
            try {
              const arr = JSON.parse(localStorage.getItem('gongji:applied') || '[]');
              const idx = arr.indexOf(n.id);
              if (cb.checked && idx < 0) arr.push(n.id);
              else if (!cb.checked && idx >= 0) arr.splice(idx, 1);
              localStorage.setItem('gongji:applied', JSON.stringify(arr));
            } catch {}
          }
          // 리렌더링
          renderTodayChecklist();
        });

        li.append(cb, titleBtn, metaSpan);
        ul.append(li);
      });

      sec.append(ul);
    }

    const homeWrap = $('#home-body, .home-wrap');
    if (homeWrap) homeWrap.prepend(sec);
  }

  /* ═══════════════════════════════════════════════════════
     14. 접근성 — 언어 전환 시 <html lang> 보완
         기존 applyStaticText() 에 이미 document.documentElement.lang = state.lang 있음.
         확인 후 없으면 보완.
     ═══════════════════════════════════════════════════════ */
  function watchLangChange() {
    // lang-control select 변경 감지
    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('lang-control')) {
        const lang = e.target.value;
        if (lang) {
          document.documentElement.lang = lang;
          // 메타 locale도 업데이트
          const meta = document.querySelector('meta[property="og:locale"]');
          if (meta) meta.content = lang;
        }
      }
    });
  }

  /* ═══════════════════════════════════════════════════════
     15. 반응형 뷰포트 변화 대응
         화면 너비가 900px 경계를 넘을 때 필요한 처리
     ═══════════════════════════════════════════════════════ */
  function initResizeHandler() {
    let prevMobile = isMobile();
    window.addEventListener('resize', () => {
      const nowMobile = isMobile();
      if (prevMobile !== nowMobile) {
        prevMobile = nowMobile;
        // 단축키 힌트: PC ↔ 모바일 전환 시 힌트 토글
        const hints = $$('.kbd-hint');
        hints.forEach(h => { h.style.display = nowMobile ? 'none' : ''; });
      }
    }, { passive: true });
  }

  /* ═══════════════════════════════════════════════════════
     16. 오늘 화면 MutationObserver — 화면이 그려지면 위젯 주입
     ═══════════════════════════════════════════════════════ */
  function observeHomeBody() {
    const homeBody = $('#home-body');
    if (!homeBody) return;

    let injected = false;
    const obs = new MutationObserver(() => {
      if (injected || !homeBody.children.length) return;
      injected = true;
      // DOM이 완성된 뒤 약간의 delay로 주입
      setTimeout(() => {
        try { renderWeekTimeline(); } catch (e) { console.warn('[enhanced] week timeline:', e); }
        try { renderAcademicDdayWidget(); } catch (e) { console.warn('[enhanced] acad roadmap:', e); }
        try { renderTodayChecklist(); } catch (e) { console.warn('[enhanced] today checklist:', e); }
        try { startSmartCountdown(); } catch (e) {}
      }, 200);
    });

    obs.observe(homeBody, { childList: true, subtree: false });

    // 탭 전환 시 재주입 허용
    document.body.addEventListener('gongji:tabchange', () => {
      if (document.body.dataset.tab === 'home') {
        injected = false;
      }
    });

    // 언어 변경 및 renderAll 이벤트 시 홈 위젯들 즉시 리프레시
    window.addEventListener('gongji:renderall', () => {
      setTimeout(() => {
        try { renderWeekTimeline(); } catch (_) {}
        try { renderTodayChecklist(); } catch (_) {}
        try { renderAcademicDdayWidget(); } catch (_) {}
      }, 50);
    });
  }

  function startSmartCountdown() {
    clearTimeout(_cdHandle);
    smartCountdown();
  }

  /* ═══════════════════════════════════════════════════════
     초기화
     ═══════════════════════════════════════════════════════ */
  function init() {
    try { initSkipLink(); } catch (e) {}
    try { initMastheadCollapse(); } catch (e) {}
    try { initChipClear(); } catch (e) {}
    try { initDetailScrollMemory(); } catch (e) {}
    try { initDetailKbdHint(); } catch (e) {}
    try { initAlertReadOnClick(); } catch (e) {}
    try { initToastFocusRestore(); } catch (e) {}
    try { initCardTouchFeedback(); } catch (e) {}
    try { initShareTarget(); } catch (e) {}
    try { watchLangChange(); } catch (e) {}
    try { initResizeHandler(); } catch (e) {}
    try { observeHomeBody(); } catch (e) {}

    // 상세 대화상자가 열릴 때마다 kbd hint 삽입
    const detail = $('#detail');
    if (detail) {
      new MutationObserver((muts) => {
        muts.forEach(m => {
          if (m.attributeName === 'open' && detail.hasAttribute('open')) {
            setTimeout(() => { try { initDetailKbdHint(); } catch {} }, 50);
          }
        });
      }).observe(detail, { attributes: true, attributeFilter: ['open'] });
    }

    // 기존 cdTimer (30초 고정) 가 있으면 덮어씌우기
    // → 최초 1회 smartCountdown 실행으로 이후 주기를 가져감
    setTimeout(startSmartCountdown, 1000);
  }

  // 앱 로드 완료 후 실행 (app.js 가 먼저 실행된 뒤)
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }

})();
