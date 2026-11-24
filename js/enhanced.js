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
     8. 주간 마감 타임라인 위젯
        오늘 화면에 이번 주 7일을 세로 슬롯으로 보여줌
     ═══════════════════════════════════════════════════════ */
  function renderWeekTimeline() {
    const notices = window.GONGJI_DATA && window.GONGJI_DATA.notices;
    if (!notices || !notices.length) return;
    if ($('.week-timeline-sec')) return;

    const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
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

    if (withDeadline.length < 2) return; // 2개 미만이면 표시 불필요

    const saved = (() => {
      try { return JSON.parse(localStorage.getItem('gongji:saved') || '[]'); } catch { return []; }
    })();

    const timeline = document.createElement('div');
    timeline.className = 'week-timeline';

    days.forEach((day, di) => {
      const col = document.createElement('div');
      col.className = 'wt-col' + (day.getTime() === today.getTime() ? ' is-today' : '');

      const dow = document.createElement('div');
      dow.className = 'wt-dow';
      dow.textContent = DAYS[day.getDay()];
      col.append(dow);

      const dayStr = day.toISOString().slice(0, 10);
      const items = withDeadline.filter(n => n.deadline && n.deadline.startsWith(dayStr));

      items.slice(0, 3).forEach(n => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'wt-item';

        const dl = new Date(n.deadline);
        const hoursLeft = (dl - Date.now()) / 3600_000;
        if (hoursLeft < 24) item.classList.add('is-urgent');
        if (saved.includes(n.id)) item.classList.add('is-saved');

        item.textContent = n.title;
        item.title = n.title;
        item.addEventListener('click', () => {
          location.hash = '#/n/' + encodeURIComponent(n.id);
        });
        col.append(item);
      });

      if (items.length > 3) {
        const more = document.createElement('p');
        more.style.cssText = 'font-size:11px;color:var(--faint);margin:2px 0 0;text-align:center;';
        more.textContent = `+${items.length - 3}`;
        col.append(more);
      }

      timeline.append(col);
    });

    // 섹션 감싸기
    const sec = document.createElement('div');
    sec.className = 'home-card week-timeline-sec';
    sec.style.marginTop = '0';

    const h3 = document.createElement('h3');
    h3.style.cssText = 'font-size:15px;font-weight:800;margin-bottom:12px;letter-spacing:-0.02em;display:flex;align-items:center;gap:8px;';
    h3.textContent = '이번 주 마감 타임라인';

    const count = document.createElement('span');
    count.style.cssText = 'font-size:13px;color:var(--accent-strong);font-variant-numeric:tabular-nums;';
    count.textContent = `${withDeadline.length}건`;
    h3.append(count);

    enableDragScroll(timeline);
    sec.append(h3, timeline);

    const homeWrap = $('.home-wrap, #home-body');
    if (homeWrap) {
      homeWrap.prepend(sec);
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
     13. 오늘 화면 "오늘 할 일" 체크리스트 간단 위젯
         오늘 마감 중 아직 지원 안 한 것을 체크리스트로 표시
     ═══════════════════════════════════════════════════════ */
  function renderTodayChecklist() {
    const notices = window.GONGJI_DATA && window.GONGJI_DATA.notices;
    if (!notices || !notices.length) return;
    if ($('.today-checklist-sec')) return;

    const todayStr = new Date().toISOString().slice(0, 10);
    const applied = (() => {
      try { return JSON.parse(localStorage.getItem('gongji:applied') || '[]'); } catch { return []; }
    })();

    const todayDue = notices.filter(n => {
      if (!n.deadline) return false;
      return n.deadline.startsWith(todayStr) && !applied.includes(n.id);
    }).slice(0, 5);

    if (!todayDue.length) return;

    const sec = document.createElement('div');
    sec.className = 'home-card today-checklist-sec';

    const h3 = document.createElement('h3');
    h3.style.cssText = 'font-size:15px;font-weight:800;margin-bottom:10px;letter-spacing:-0.02em;';
    h3.textContent = `오늘 마감 — 아직 지원 안 한 ${todayDue.length}건`;
    h3.style.color = 'var(--danger)';
    sec.append(h3);

    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style:none;margin:0;padding:0;display:grid;gap:6px;';

    todayDue.forEach(n => {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.style.cssText = 'flex:none;width:18px;height:18px;accent-color:var(--accent);cursor:pointer;';
      cb.setAttribute('aria-label', `${n.title} 지원 완료 표시`);

      const label = document.createElement('label');
      label.style.cssText = 'flex:1;font-size:14px;font-weight:600;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      label.textContent = n.title;

      // 체크하면 applied에 추가 + 흐리게
      cb.addEventListener('change', () => {
        if (cb.checked) {
          li.style.opacity = '0.45';
          label.style.textDecoration = 'line-through';
          // localStorage applied 갱신 (앱의 state와 별개이지만 UX용)
          try {
            const arr = JSON.parse(localStorage.getItem('gongji:applied') || '[]');
            if (!arr.includes(n.id)) {
              arr.push(n.id);
              localStorage.setItem('gongji:applied', JSON.stringify(arr));
            }
          } catch {}
        }
      });

      label.htmlFor = `tdc-${n.id}`;
      cb.id = `tdc-${n.id}`;
      li.append(cb, label);
      ul.append(li);
    });

    sec.append(ul);

    // home-wrap 상단에 삽입
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
