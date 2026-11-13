// 공지 줍줍 달력 (화면과 상관없는 순수 함수)
// - 월간 달력 칸 만들기, 구글 캘린더에 한 번에 추가하는 주소, 구글 캘린더 구독 주소
// - 브라우저(index.html)와 Node 테스트(tests/cal.test.js)에서 똑같이 씁니다.
// - 수업에서 배운 개념: 날짜 계산(윤년·월 길이), 반복문으로 격자 만들기, 문자열 인코딩
(function (root) {
  'use strict';

  const L = typeof require === 'function' ? require('./logic.js') : root.GongjiLogic;
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // ---------------------------------------------------------------
  // 1. 달력에 올릴 일정 모으기
  // ---------------------------------------------------------------
  // 공지의 마감·행사와 학사일정을 '날짜별 일정' 목록으로 펼친다.
  //   { date, type: 'deadline'|'event'|'academic', id?, time?, title }
  // opts: { titleOf(n), calendar: {items}, skip: Set(id) (지원 완료한 공지 등), maxSpanDays }
  function collect(notices, opts) {
    const o = opts || {};
    const titleOf = o.titleOf || ((n) => n.title);
    const skip = o.skip || new Set();
    const out = [];
    for (const n of notices) {
      if (skip.has(n.id)) continue;
      if (n.deadline && L.parseLocal(n.deadline)) {
        out.push({ date: n.deadline.slice(0, 10), type: 'deadline', id: n.id, time: n.deadline.includes('T') ? n.deadline.slice(11, 16) : '', title: titleOf(n) });
      }
      for (const ev of n.events || []) {
        if (ev && ev.date) out.push({ date: ev.date, type: 'event', id: n.id, time: ev.start || '', title: titleOf(n) });
      }
    }
    const cal = o.calendar;
    const span = o.maxSpanDays || 31;
    for (const it of (cal && cal.items) || []) {
      const s = L.parseLocal(it.start);
      const e = L.parseLocal(it.end || it.start);
      if (!s || !e || e < s) continue;
      const title = typeof o.academicTitle === 'function' ? o.academicTitle(it) : (it.title && (it.title.ko || it.title)) || '';
      for (let d = s, i = 0; d <= e && i < span; d = L.addDays(d, 1), i++) {
        out.push({ date: ymd(d), type: 'academic', time: '', title, first: i === 0 });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------
  // 2. 월간 달력 칸
  // ---------------------------------------------------------------
  // month0: 0~11. 일요일부터 시작(weekStart 0) 또는 월요일부터(1). 앞뒤 빈 칸은 이웃 달의 날짜로 채운다.
  function monthGrid(year, month0, entries, todayStr, weekStart) {
    const ws = weekStart === 1 ? 1 : 0;
    const first = new Date(year, month0, 1);
    const lead = (first.getDay() - ws + 7) % 7;
    const start = L.addDays(first, -lead);
    const byDate = new Map();
    for (const e of entries || []) {
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date).push(e);
    }
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    const rows = Math.ceil((lead + daysInMonth) / 7);
    const weeks = [];
    for (let w = 0; w < rows; w++) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        const d = L.addDays(start, w * 7 + i);
        const key = ymd(d);
        const list = byDate.get(key) || [];
        week.push({
          date: key, day: d.getDate(), inMonth: d.getMonth() === month0, isToday: key === todayStr,
          weekday: d.getDay(), entries: list,
          deadlines: list.filter((x) => x.type === 'deadline').length,
          events: list.filter((x) => x.type === 'event').length,
          academic: list.filter((x) => x.type === 'academic').length
        });
      }
      weeks.push(week);
    }
    return { year, month0, weeks };
  }

  function shiftMonth(year, month0, delta) {
    const d = new Date(year, month0 + delta, 1);
    return { year: d.getFullYear(), month0: d.getMonth() };
  }

  // ---------------------------------------------------------------
  // 3. 구글 캘린더
  // ---------------------------------------------------------------
  const icsStamp = (str) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(str || '');
    if (!m) return null;
    return m[4] ? { v: `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00`, allDay: false } : { v: `${m[1]}${m[2]}${m[3]}`, allDay: true };
  };

  // 항목({ summary, start, end?, description?, url? }) 하나를 구글 캘린더에 '일정 추가' 화면으로 여는 주소.
  // 로그인한 구글 계정의 캘린더로 열리고, 저장 버튼만 누르면 된다. (서버나 키가 필요 없음)
  function googleUrl(item, ctz) {
    const s = icsStamp(item.start);
    if (!s) return null;
    let end;
    if (s.allDay) {
      const e = icsStamp(item.end);
      end = e && e.allDay && e.v > s.v ? e.v : ymd(L.addDays(L.parseLocal(item.start.slice(0, 10)), 1)).replace(/-/g, '');
    } else {
      const e = icsStamp(item.end);
      if (e && !e.allDay && e.v > s.v) end = e.v;
      else {
        const d = new Date(L.parseLocal(item.start).getTime() + 30 * 60000);
        end = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
      }
    }
    const details = [item.description || '', item.url || ''].filter(Boolean).join('\n\n');
    const q = [['action', 'TEMPLATE'], ['text', item.summary || ''], ['dates', `${s.v}/${end}`]];
    if (details) q.push(['details', details]);
    if (ctz && !s.allDay) q.push(['ctz', ctz]);
    return 'https://calendar.google.com/calendar/render?' + q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  }

  // 데이터 폴더의 일정 파일(gongji.ics)을 구글 캘린더가 '구독'하는 주소.
  // 구독하면 파이프라인이 파일을 새로 올릴 때마다 구글 캘린더가 알아서 따라간다 (갱신은 구글이 몇 시간 간격으로 확인)
  function feedUrls(pageUrl, file) {
    let u;
    try { u = new URL(file || 'data/gongji.ics', pageUrl); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = ''; u.search = '';
    const https = u.href;
    const webcal = 'webcal://' + https.replace(/^https?:\/\//, '');
    // 내 컴퓨터(localhost)나 집·학교 내부망 주소는 구글 서버가 읽어 갈 수 없다 → 화면에서 '인터넷에 올린 뒤에 쓸 수 있어요'라고 알려 줌
    const host = u.hostname;
    const local = host === 'localhost' || host === '[::1]' || /\.(local|lan|internal)$/.test(host) || /^127\./.test(host)
      || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    return { https, webcal, google: 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal), local };
  }

  const api = { collect, monthGrid, shiftMonth, googleUrl, feedUrls, ymd };
  root.GongjiCal = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
