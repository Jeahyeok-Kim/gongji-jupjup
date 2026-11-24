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
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
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

    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDown = true;
      hasMoved = false;
      startX = e.clientX;
      scrollStart = el.scrollLeft;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    // 모바일 터치 제스처 시 스와이프 도중 클릭 방지
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoved = false;
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      touchMoved = false;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (touchMoved || e.touches.length !== 1) return;
      const dx = Math.abs(e.touches[0].clientX - touchStartX);
      const dy = Math.abs(e.touches[0].clientY - touchStartY);
      if (dx > 8 && dx > dy) touchMoved = true;
    }, { passive: true });

    el.addEventListener('touchend', () => {
      if (touchMoved) {
        const preventClick = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        el.addEventListener('click', preventClick, { capture: true, once: true });
        setTimeout(() => el.removeEventListener('click', preventClick, { capture: true }), 180);
      }
    }, { passive: true });

    el.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        el.scrollLeft += e.deltaY;
      }
    }, { passive: true });
  }

  /* ═══════════════════════════════════════════════════════
     8. 주간 마감 타임라인 위젯
        (다가오는 마감 스마트 허브로 통합되어 중복 독립 섹션은 제거)
     ═══════════════════════════════════════════════════════ */
  function renderWeekTimeline() {
    // 기존 잔여 독립 섹션이 있다면 깨끗하게 제거
    const existing = $('.week-timeline-sec');
    if (existing) existing.remove();
    return;
  }
  /* ═══════════════════════════════════════════════════════
     8-1. 주요 학사일정 D-Day 로드맵 위젯
          오늘 이후 다가오는 핵심 학사일정 타임트랙 카드
     ═══════════════════════════════════════════════════════ */
  function renderAcademicDdayWidget() {
    const cal = window.GONGJI_CALENDAR;
    if (!cal || !cal.items || !cal.items.length) return;

    // 언어 변경 및 갱신 시 기존 위젯 제거 후 재작성
    const existing = $('.acad-roadmap-sec');
    if (existing) existing.remove();

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
    viewAllBtn.textContent = T.acadViewAll || '연간 일정 전체보기 ↗';
    viewAllBtn.onclick = () => {
      openAcademicCalendarModal();
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
     8-2. 연간 주요 학사일정 전체보기 모달
     ═══════════════════════════════════════════════════════ */
  function openAcademicCalendarModal() {
    const cal = window.GONGJI_CALENDAR;
    if (!cal || !cal.items || !cal.items.length) {
      alert('등록된 학사일정 정보가 없습니다.');
      return;
    }

    let dialog = document.getElementById('acad-full-modal');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'acad-full-modal';
      dialog.className = 'acad-full-dialog';
      dialog.setAttribute('closedby', 'any');
      document.body.appendChild(dialog);
    }

    const lang = document.documentElement.lang || localStorage.getItem('gongji:lang') || 'ko';
    const I = window.GongjiI18n;
    const T = (I && I.T && I.T[lang]) || {};
    const DOW_NAMES = (I && I.WEEKDAYS && I.WEEKDAYS[lang]) || ['일', '월', '화', '수', '목', '금', '토'];

    let activeFilter = 'all'; // 'all', 'upcoming', 'ongoing', 'past'
    let searchQuery = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pad = (v) => String(v).padStart(2, '0');
    const fmtFullDate = (d) => {
      const yyyy = d.getFullYear();
      const mm = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const dow = DOW_NAMES[d.getDay()];
      return `${yyyy}.${mm}.${dd}(${dow})`;
    };

    function renderModalContent() {
      dialog.innerHTML = '';

      const wrap = document.createElement('div');
      wrap.className = 'afm-wrap';

      // 1. 헤더
      const header = document.createElement('div');
      header.className = 'afm-header';

      const titleBox = document.createElement('div');
      titleBox.className = 'afm-title-box';
      const h2 = document.createElement('h2');
      h2.className = 'afm-title';
      h2.textContent = T.acadModalTitle || '🎓 건국대학교 연간 학사일정';
      const p = document.createElement('p');
      p.className = 'afm-sub';
      p.textContent = (T.acadModalSub || '학교 연간주요일정 전체 목록') + ` (총 ${cal.items.length}개 일정)`;
      titleBox.append(h2, p);

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'afm-close-btn';
      closeBtn.setAttribute('aria-label', '닫기');
      closeBtn.innerHTML = '✕';
      closeBtn.onclick = () => dialog.close();

      header.append(titleBox, closeBtn);

      // 2. 검색창 & 필터 바
      const controlBar = document.createElement('div');
      controlBar.className = 'afm-controls';

      const searchInput = document.createElement('input');
      searchInput.type = 'search';
      searchInput.className = 'afm-search-input';
      searchInput.placeholder = T.acadModalSearchPh || '학사일정 검색 (예: 수강신청, 시험, 방학...)';
      searchInput.value = searchQuery;
      searchInput.oninput = (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        updateList();
      };

      const filterBar = document.createElement('div');
      filterBar.className = 'afm-filters';

      const filters = [
        { id: 'all', label: T.acadFilterAll || '전체' },
        { id: 'upcoming', label: T.acadFilterUpcoming || '다가오는 일정' },
        { id: 'ongoing', label: T.acadFilterOngoing || '진행 중' },
        { id: 'past', label: T.acadFilterPast || '종료된 일정' }
      ];

      filters.forEach(f => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'afm-filter-chip' + (activeFilter === f.id ? ' is-active' : '');
        chip.textContent = f.label;
        chip.onclick = () => {
          activeFilter = f.id;
          updateList();
        };
        filterBar.appendChild(chip);
      });

      controlBar.append(searchInput, filterBar);

      // 3. 리스트 영역
      const listContainer = document.createElement('div');
      listContainer.className = 'afm-list';

      function updateList() {
        listContainer.innerHTML = '';

        filterBar.querySelectorAll('.afm-filter-chip').forEach((c, idx) => {
          c.classList.toggle('is-active', filters[idx].id === activeFilter);
        });

        const filtered = cal.items.filter(item => {
          const rawTitle = (item.title && (item.title[lang] || item.title.ko || item.title)) || '';
          if (searchQuery && !rawTitle.toLowerCase().includes(searchQuery)) return false;

          const startD = new Date(item.start);
          startD.setHours(0, 0, 0, 0);
          const endD = new Date(item.end || item.start);
          endD.setHours(23, 59, 59, 999);

          const isOngoing = today >= startD && today <= endD;
          const isPast = today > endD;
          const isUpcoming = today < startD;

          if (activeFilter === 'upcoming') return isUpcoming;
          if (activeFilter === 'ongoing') return isOngoing;
          if (activeFilter === 'past') return isPast;
          return true;
        });

        if (!filtered.length) {
          const empty = document.createElement('div');
          empty.className = 'afm-empty';
          empty.textContent = '조건에 일치하는 학사일정이 없습니다.';
          listContainer.appendChild(empty);
          return;
        }

        filtered.forEach(item => {
          const startD = new Date(item.start);
          startD.setHours(0, 0, 0, 0);
          const endD = new Date(item.end || item.start);
          endD.setHours(23, 59, 59, 999);

          const daysUntilStart = Math.ceil((startD - today) / 86400000);
          const isOngoing = today >= startD && today <= endD;
          const isPast = today > endD;

          const rawTitle = (item.title && (item.title[lang] || item.title.ko || item.title)) || '';
          let icon = '🏛️';
          if (/시험|기말|중간/.test(rawTitle)) icon = '📝';
          else if (/방학|계절/.test(rawTitle)) icon = '❄️';
          else if (/성적|정정|열람/.test(rawTitle)) icon = '📊';
          else if (/수업|개강|종강/.test(rawTitle)) icon = '📚';
          else if (/등록|휴학|복학|수강신청/.test(rawTitle)) icon = '💳';
          else if (/실습|현장/.test(rawTitle)) icon = '💼';

          const card = document.createElement('div');
          card.className = 'afm-item' + (isOngoing ? ' is-ongoing' : isPast ? ' is-past' : '');

          const left = document.createElement('div');
          left.className = 'afm-item-left';

          const iconEl = document.createElement('span');
          iconEl.className = 'afm-item-icon';
          iconEl.textContent = icon;

          const textEl = document.createElement('div');
          textEl.className = 'afm-item-text';

          const titleEl = document.createElement('strong');
          titleEl.className = 'afm-item-title';
          titleEl.textContent = rawTitle;

          const dateEl = document.createElement('span');
          dateEl.className = 'afm-item-date';
          dateEl.textContent = item.start === item.end ? fmtFullDate(startD) : `${fmtFullDate(startD)} ~ ${fmtFullDate(endD)}`;

          textEl.append(titleEl, dateEl);
          left.append(iconEl, textEl);

          const right = document.createElement('div');
          right.className = 'afm-item-right';

          const badge = document.createElement('span');
          badge.className = 'afm-dday' + (isOngoing ? ' is-ongoing' : isPast ? ' is-past' : daysUntilStart <= 7 ? ' is-urgent' : '');
          if (isOngoing) badge.textContent = T.bfOngoing || '진행 중';
          else if (isPast) badge.textContent = '종료';
          else if (daysUntilStart === 0) badge.textContent = '오늘 시작';
          else badge.textContent = `D-${daysUntilStart}`;

          const gcalLink = document.createElement('a');
          const sClean = item.start.replace(/-/g, '');
          const eClean = item.end ? item.end.replace(/-/g, '') : sClean;
          gcalLink.href = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(rawTitle)}&dates=${sClean}/${eClean}&details=${encodeURIComponent('건국대학교 GLOCAL캠퍼스 주요 학사일정')}`;
          gcalLink.target = '_blank';
          gcalLink.rel = 'noopener noreferrer';
          gcalLink.className = 'afm-gcal-btn';
          gcalLink.title = '구글 캘린더에 추가';
          gcalLink.innerHTML = '📅';

          right.append(badge, gcalLink);
          card.append(left, right);
          listContainer.appendChild(card);
        });
      }

      updateList();

      // 4. 푸터
      const footer = document.createElement('div');
      footer.className = 'afm-footer';

      const icsBtn = document.createElement('button');
      icsBtn.type = 'button';
      icsBtn.className = 'btn small secondary afm-ics-btn';
      icsBtn.textContent = T.acadExportIcs || '📅 연간 학사일정 (.ics) 다운로드';
      icsBtn.onclick = () => {
        exportAcademicIcs(cal.items);
      };

      const closeFooterBtn = document.createElement('button');
      closeFooterBtn.type = 'button';
      closeFooterBtn.className = 'btn small primary';
      closeFooterBtn.textContent = '닫기';
      closeFooterBtn.onclick = () => dialog.close();

      footer.append(icsBtn, closeFooterBtn);

      wrap.append(header, controlBar, listContainer, footer);
      dialog.appendChild(wrap);
    }

    renderModalContent();
    dialog.showModal();
    dialog.onclick = (e) => {
      if (e.target === dialog) dialog.close();
    };
  }
  window.openAcademicCalendarModal = openAcademicCalendarModal;

  function exportAcademicIcs(items) {
    if (!items || !items.length) return;
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Gongji Jupjup//KR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];
    items.forEach((it, idx) => {
      const s = it.start ? it.start.replace(/-/g, '') : '';
      const e = it.end ? it.end.replace(/-/g, '') : s;
      const title = (it.title && (it.title.ko || it.title)) || '학사일정';
      lines.push(
        'BEGIN:VEVENT',
        `UID:acad-${idx}-${s}@gongji-jupjup`,
        `DTSTART;VALUE=DATE:${s}`,
        `DTEND;VALUE=DATE:${e}`,
        `SUMMARY:${title}`,
        'DESCRIPTION:건국대학교 GLOCAL캠퍼스 주요 학사일정',
        'END:VEVENT'
      );
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'konkuk-academic-calendar.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
         모던 인터랙티브 액션 카드 리디자인:
         - 카테고리 칩 + D-Day 긴급 배지 + 남은 시간
         - 커스텀 라운드 체크 서클 애니메이션
         - 다국어 지원 및 클릭 시 상세 보기
         - 진행률 게이지 및 완료 축하 애니메이션
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

    const appliedCount = todayDue.filter(n => isApplied(n.id)).length;
    const totalCount = todayDue.length;
    const unappliedCount = totalCount - appliedCount;

    const sec = document.createElement('div');
    sec.className = 'home-card today-checklist-sec';

    const getI18nText = () => {
      if (lang === 'en') {
        return {
          title: `Due Today`,
          pendingBadge: `${unappliedCount} pending`,
          doneTitle: '🎉 All notices due today are completed!',
          timeLabel: (tm) => tm ? `by ${tm}` : 'Today',
          viewDetail: 'Detail ↗',
          allDoneMsg: 'Great job! You have checked all deadlines today.',
          progressText: `${appliedCount}/${totalCount} completed`
        };
      } else if (lang === 'zh') {
        return {
          title: `今日截止事项`,
          pendingBadge: `还有 ${unappliedCount} 项待申请`,
          doneTitle: '🎉 今日截止的所有公告均已完成！',
          timeLabel: (tm) => tm ? `${tm} 截止` : '今日截止',
          viewDetail: '详情 ↗',
          allDoneMsg: '太棒了！今日截止的所有项目均已确认。',
          progressText: `已完成 ${appliedCount}/${totalCount}`
        };
      } else if (lang === 'ja') {
        return {
          title: `今日締切のやること`,
          pendingBadge: `未応募 ${unappliedCount}件`,
          doneTitle: '🎉 今日の締切のお知らせはすべて完了しました！',
          timeLabel: (tm) => tm ? `${tm}まで` : '今日締切',
          viewDetail: '詳細 ↗',
          allDoneMsg: '素晴らしい！今日の締切はすべて確認完了しました。',
          progressText: `${appliedCount}/${totalCount} 完了`
        };
      }
      return {
        title: `오늘 마감 할 일`,
        pendingBadge: `아직 ${unappliedCount}건 미지원`,
        doneTitle: '🎉 오늘 마감 공지를 모두 완료했습니다!',
        timeLabel: (tm) => tm ? `${tm} 마감` : '오늘 마감',
        viewDetail: '상세 ↗',
        allDoneMsg: '오늘 마감인 모든 장학금 및 프로그램을 확인했습니다.',
        progressText: `${appliedCount}/${totalCount} 완료`
      };
    };

    const i18n = getI18nText();

    const headDiv = document.createElement('div');
    headDiv.className = 'tc-head';

    const headLeft = document.createElement('div');
    headLeft.className = 'tc-head-left';

    const h3 = document.createElement('h3');
    h3.className = 'tc-title' + (unappliedCount === 0 ? ' tc-all-done' : '');
    h3.innerHTML = unappliedCount > 0 ? `🚨 <span>${i18n.title}</span>` : `✨ <span>${i18n.doneTitle}</span>`;

    const badge = document.createElement('span');
    badge.className = 'tc-badge' + (unappliedCount === 0 ? ' is-done' : '');
    badge.textContent = unappliedCount > 0 ? i18n.pendingBadge : '100% 완료';

    headLeft.append(h3, badge);

    const progressDiv = document.createElement('div');
    progressDiv.className = 'tc-prog-wrap';
    const pct = Math.round((appliedCount / totalCount) * 100);
    progressDiv.innerHTML = `
      <span class="tc-prog-label">${i18n.progressText}</span>
      <div class="tc-prog-track"><div class="tc-prog-bar" style="width:${pct}%"></div></div>
    `;

    headDiv.append(headLeft, progressDiv);
    sec.append(headDiv);

    if (unappliedCount === 0) {
      const doneCard = document.createElement('div');
      doneCard.className = 'tc-done-box';
      doneCard.innerHTML = `<span class="tc-done-icon">👏</span><span class="tc-done-msg">${i18n.allDoneMsg}</span>`;
      sec.append(doneCard);
    } else {
      const ul = document.createElement('ul');
      ul.className = 'tc-list';

      const CAT_COLORS = {
        '장학': 'var(--badge-money, #f59e0b)',
        '학사': 'var(--accent, #10b981)',
        '취업': 'var(--badge-exp, #3b82f6)',
        '행사': '#8b5cf6',
        '기타': 'var(--badge-info, #64748b)'
      };

      todayDue.slice(0, 5).forEach(n => {
        const appliedNow = isApplied(n.id);
        const li = document.createElement('li');
        li.className = 'tc-item' + (appliedNow ? ' is-done' : '');

        // 커스텀 체크박스 버튼
        const checkBtn = document.createElement('button');
        checkBtn.type = 'button';
        checkBtn.className = 'tc-check-btn' + (appliedNow ? ' is-checked' : '');
        checkBtn.setAttribute('aria-label', `${n.title} 지원 완료 토글`);
        checkBtn.innerHTML = appliedNow ? '✓' : '';

        const cat = n.category || '기타';
        const catColor = CAT_COLORS[cat] || CAT_COLORS['기타'];

        const contentWrap = document.createElement('div');
        contentWrap.className = 'tc-content';

        const tagRow = document.createElement('div');
        tagRow.className = 'tc-tag-row';

        const catBadge = document.createElement('span');
        catBadge.className = 'tc-cat-badge';
        catBadge.textContent = cat;
        catBadge.style.color = catColor;
        catBadge.style.backgroundColor = `color-mix(in srgb, ${catColor} 14%, transparent)`;

        let timeStr = '';
        if (n.deadline && n.deadline.includes('T')) {
          timeStr = n.deadline.split('T')[1].slice(0, 5);
        }
        const timeBadge = document.createElement('span');
        timeBadge.className = 'tc-time-badge';
        timeBadge.textContent = i18n.timeLabel(timeStr);

        tagRow.append(catBadge, timeBadge);

        const titleBtn = document.createElement('button');
        titleBtn.type = 'button';
        titleBtn.className = 'tc-title-btn';
        const titleText = (lang !== 'ko' && n.titleTr && n.titleTr[lang]) || n.title;
        titleBtn.textContent = titleText;
        titleBtn.title = titleText;
        titleBtn.onclick = () => {
          if (app && typeof app.openDetail === 'function') {
            app.openDetail(n.id);
          }
        };

        contentWrap.append(tagRow, titleBtn);

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'tc-detail-link';
        openBtn.textContent = i18n.viewDetail;
        openBtn.onclick = () => {
          if (app && typeof app.openDetail === 'function') {
            app.openDetail(n.id);
          }
        };

        const toggleHandler = () => {
          if (app && typeof app.toggleApplied === 'function') {
            app.toggleApplied(n.id);
          } else {
            try {
              const arr = JSON.parse(localStorage.getItem('gongji:applied') || '[]');
              const idx = arr.indexOf(n.id);
              if (idx < 0) arr.push(n.id);
              else arr.splice(idx, 1);
              localStorage.setItem('gongji:applied', JSON.stringify(arr));
            } catch {}
          }
          renderTodayChecklist();
        };

        checkBtn.onclick = toggleHandler;

        li.append(checkBtn, contentWrap, openBtn);
        ul.append(li);
      });

      sec.append(ul);
    }

    const homeWrap = $('#home-body .home-v5') || $('#home-body');
    if (homeWrap) {
      // 유저 피드백 반영: 시작하기 온보딩 및 4분할 브리핑 카드 뒤, 다가오는 마감 앞
      const anchor = $('.brief, .bf-grid, .setup-strip', homeWrap);
      if (anchor && anchor.parentNode) {
        anchor.after(sec);
      } else {
        const firstSec = $('.sec-tickets, .sec', homeWrap);
        if (firstSec && firstSec.parentNode) {
          firstSec.before(sec);
        } else {
          homeWrap.append(sec);
        }
      }
    }
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
    const injectWidgets = () => {
      injected = true;
      try { renderWeekTimeline(); } catch (e) { console.warn('[enhanced] week timeline:', e); }
      try { renderAcademicDdayWidget(); } catch (e) { console.warn('[enhanced] acad roadmap:', e); }
      try { renderTodayChecklist(); } catch (e) { console.warn('[enhanced] today checklist:', e); }
      try { startSmartCountdown(); } catch (e) {}
    };

    const obs = new MutationObserver(() => {
      if (injected || !homeBody.children.length) return;
      setTimeout(injectWidgets, 100);
    });

    obs.observe(homeBody, { childList: true, subtree: false });

    // 이미 홈 화면 자식 요소가 그려져 있는 경우 즉시 주입 실행
    if (homeBody.children.length > 0) {
      setTimeout(injectWidgets, 60);
    }

    // 탭 전환 시 재주입 허용
    document.body.addEventListener('gongji:tabchange', () => {
      if (document.body.dataset.tab === 'home' || location.hash === '#/home' || !location.hash) {
        injected = false;
        setTimeout(injectWidgets, 100);
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
