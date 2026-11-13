// 공지 줍줍 부가 기능 (화면과 상관없는 순수 함수): 캘린더(.ics) 만들기, 오늘의 요약, 저장한 공지, 마지막 방문
// - 브라우저(index.html)와 Node 테스트(tests/extras.test.js)에서 똑같이 씁니다.
(function (root) {
  'use strict';

  const L = typeof require === 'function' ? require('./logic.js') : root.GongjiLogic;
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // ---------------------------------------------------------------
  // 1. 캘린더 파일(.ics): 구글 캘린더·아이폰·아웃룩에서 열린다
  // ---------------------------------------------------------------
  const icsEscape = (s) => String(s == null ? '' : s)
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

  // 한 줄은 75바이트를 넘지 않게 접는다 (이어지는 줄은 공백으로 시작). 한글은 글자 하나가 3바이트
  function foldLine(line) {
    const out = [];
    let cur = '';
    let bytes = 0;
    let limit = 73;
    for (const ch of line) {
      const b = unescape(encodeURIComponent(ch)).length;
      if (bytes + b > limit) { out.push(cur); cur = ' '; bytes = 1; limit = 73; }
      cur += ch;
      bytes += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  // 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:MM' → 'YYYYMMDD' / 'YYYYMMDDTHHMM00'
  function icsDate(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(str || '');
    if (!m) return null;
    return m[4] ? { value: `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00`, allDay: false }
      : { value: `${m[1]}${m[2]}${m[3]}`, allDay: true };
  }
  const nextDay = (str) => ymd(L.addDays(L.parseLocal(str.slice(0, 10)), 1)).replace(/-/g, '');

  // items: [{ uid, summary, start, end?, description?, url?, alarmMinutes? }] → .ics 글
  function buildIcs(items, options) {
    const o = options || {};
    const stampDate = o.now || new Date();
    const stamp = `${stampDate.getUTCFullYear()}${pad(stampDate.getUTCMonth() + 1)}${pad(stampDate.getUTCDate())}` +
      `T${pad(stampDate.getUTCHours())}${pad(stampDate.getUTCMinutes())}${pad(stampDate.getUTCSeconds())}Z`;
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gongji Jupjup//KR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:' + icsEscape(o.name || '공지 줍줍')];
    let count = 0;
    for (const it of items || []) {
      const s = icsDate(it.start);
      if (!s) continue;
      count++;
      lines.push('BEGIN:VEVENT', 'UID:' + icsEscape(it.uid || `${count}-${s.value}@gongji-jupjup`), 'DTSTAMP:' + stamp);
      if (s.allDay) {
        lines.push('DTSTART;VALUE=DATE:' + s.value);
        const e = icsDate(it.end);
        lines.push('DTEND;VALUE=DATE:' + (e && e.allDay && e.value > s.value ? e.value : nextDay(it.start)));
      } else {
        lines.push('DTSTART:' + s.value);
        let e = icsDate(it.end);
        if (!e || e.allDay || e.value <= s.value) {
          const d = new Date(L.parseLocal(it.start).getTime() + 30 * 60000);
          e = { value: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00` };
        }
        lines.push('DTEND:' + e.value);
      }
      lines.push('SUMMARY:' + icsEscape(it.summary));
      if (it.description) lines.push('DESCRIPTION:' + icsEscape(it.description));
      if (it.url) lines.push('URL:' + icsEscape(it.url));
      if (it.alarmMinutes > 0) {
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(it.summary),
          'TRIGGER:-PT' + Math.round(it.alarmMinutes) + 'M', 'END:VALARM');
      }
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return { text: lines.map(foldLine).join('\r\n') + '\r\n', count };
  }

  // 공지 한 건 → 캘린더 칸: 마감(하루 전에 알림) + 행사 일시(1시간 전에 알림)
  function noticeToIcsItems(n, labels) {
    const lb = labels || {};
    const title = lb.title || n.title;
    const desc = [n.title !== title ? n.title : '', lb.summary || '', n.link || ''].filter(Boolean).join('\n');
    const out = [];
    if (n.deadline && icsDate(n.deadline)) {
      const hasTime = n.deadline.includes('T');
      out.push({
        uid: `${n.id}-deadline@gongji-jupjup`, summary: `[${lb.deadline || '마감'}] ${title}`,
        start: n.deadline, end: null, description: desc, url: n.link,
        alarmMinutes: hasTime ? 24 * 60 : 9 * 60   // 마감 시각이 있으면 하루 전, 날짜만 있으면(0시 기준) 전날 오후 3시에 알림
      });
    }
    (n.events || []).forEach((ev, i) => {
      if (!ev || !ev.date) return;
      out.push({
        uid: `${n.id}-event${i}@gongji-jupjup`, summary: title,
        start: `${ev.date}T${ev.start || '09:00'}`, end: `${ev.date}T${ev.end || ev.start || '10:00'}`,
        description: desc, url: n.link, alarmMinutes: 60
      });
    });
    return out;
  }

  // ---------------------------------------------------------------
  // 2. 저장한 공지(★)
  // ---------------------------------------------------------------
  function cleanSaved(list) {
    const seen = new Set();
    const out = [];
    for (const id of Array.isArray(list) ? list : []) {
      if (typeof id === 'string' && id && id.length <= 80 && !seen.has(id)) { seen.add(id); out.push(id); }
    }
    return out.slice(-500);
  }
  function toggleSaved(list, id) {
    const cur = cleanSaved(list);
    return cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat(id);
  }

  // ---------------------------------------------------------------
  // 3. 마지막 방문 이후 새 공지
  // ---------------------------------------------------------------
  // 저장된 {last, prev}와 오늘 날짜로 이번 방문의 기준을 정한다. 같은 날 다시 열어도 기준은 그대로
  function nextVisit(stored, today) {
    const s = stored && typeof stored === 'object' ? stored : {};
    if (s.last === today) return { last: today, prev: s.prev || null };
    return { last: today, prev: typeof s.last === 'string' ? s.last : null };
  }
  // 올린 날짜가 기준일보다 뒤이면 새 공지
  const isNew = (n, since) => !!since && !!n.date && String(n.date).slice(0, 10) > since;

  // ---------------------------------------------------------------
  // 4. 오늘의 요약 (홈 화면)
  // ---------------------------------------------------------------
  // o: { saved: [id], since: 'YYYY-MM-DD', timetable, hideConflicts }
  function summarize(notices, now, o) {
    const opt = o || {};
    const saved = new Set(opt.saved || []);
    const open = notices.filter((n) => !L.isExpired(n, now));
    const visible = (n) => !(opt.hideConflicts && opt.timetable && opt.timetable.length && L.findConflicts(n, opt.timetable).length);
    const left = (n) => L.daysLeft(n.deadline, now);
    const byDeadline = (a, b) => (left(a) === null) - (left(b) === null) || (left(a) || 0) - (left(b) || 0);
    const today = open.filter((n) => left(n) === 0 && visible(n)).sort(byDeadline);
    const soon = open.filter((n) => { const d = left(n); return d !== null && d >= 0 && d <= 3 && visible(n); }).sort(byDeadline);
    const fresh = open.filter((n) => isNew(n, opt.since) && visible(n))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const savedOpen = open.filter((n) => saved.has(n.id)).sort(byDeadline);
    const pinned = open.filter((n) => n.pinned).sort(byDeadline);
    return { today, soon, fresh, saved: savedOpen, pinned, openCount: open.length };
  }

  const api = { icsEscape, foldLine, buildIcs, noticeToIcsItems, cleanSaved, toggleSaved, nextVisit, isNew, summarize, ymd };
  root.GongjiExtras = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
