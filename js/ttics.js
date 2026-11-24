// 공지 줍줍 시간표 iCalendar (.ics) 내보내기 모듈
// 구글 캘린더, 애플 캘린더(iOS), 삼성 캘린더, 네이버 캘린더에 학기 전체 수업 일정을 일괄 등록
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GongjiTTICS = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const pad2 = (n) => String(n).padStart(2, '0');

  function formatDateTime(d, timeStr) {
    const [hh, mm] = (timeStr || '09:00').split(':').map(Number);
    const yr = d.getFullYear();
    const mo = pad2(d.getMonth() + 1);
    const da = pad2(d.getDate());
    const hr = pad2(isNaN(hh) ? 9 : hh);
    const min = pad2(isNaN(mm) ? 0 : mm);
    return `${yr}${mo}${da}T${hr}${min}00`;
  }

  function formatDateOnly(d) {
    const yr = d.getFullYear();
    const mo = pad2(d.getMonth() + 1);
    const da = pad2(d.getDate());
    return `${yr}${mo}${da}`;
  }

  // 학기 시작일 및 종강일 산출 (기본 1학기: 3월 첫 월요일 ~ 6월 셋째 금요일, 2학기: 9월 1일 주 ~ 12월 셋째 금요일)
  function getTermWindow(now) {
    const cur = (now instanceof Date) ? now : new Date();
    const yr = cur.getFullYear();
    const month = cur.getMonth() + 1; // 1~12

    let start = new Date(yr, 2, 2); // 3월 2일 기준
    let end = new Date(yr, 5, 20);   // 6월 20일 기준
    let termName = `${yr}학년도 1학기`;

    if (month >= 7) {
      // 2학기
      start = new Date(yr, 8, 1);   // 9월 1일 기준
      end = new Date(yr, 11, 20);   // 12월 20일 기준
      termName = `${yr}학년도 2학기`;
    }

    // 시작일을 해당 주의 월요일로 정렬
    const day = start.getDay(); // 0(일)~6(토)
    const diff = (day === 0 ? -6 : 1) - day;
    start.setDate(start.getDate() + diff);

    return { start, end, termName, year: yr };
  }

  // 특정 요일(0:일~6:토)의 학기 첫 수업 날짜 계산
  function getFirstClassDate(termStart, targetDay) {
    const d = new Date(termStart.getTime());
    const startDay = d.getDay(); // 1 (월요일)
    let offset = targetDay - startDay;
    if (offset < 0) offset += 7;
    d.setDate(d.getDate() + offset);
    return d;
  }

  function generateICS(classes, opts = {}) {
    if (!classes || !classes.length) return '';
    const now = opts.now || new Date();
    const { start: termStart, end: termEnd, termName } = getTermWindow(now);
    const untilStr = formatDateOnly(termEnd) + 'T235959';

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//건국대학교 GLOCAL//공지 줍줍 시간표//KO',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:건국대 시간표 (${termName})`,
      'X-WR-TIMEZONE:Asia/Seoul',
      'BEGIN:VTIMEZONE',
      'TZID:Asia/Seoul',
      'X-LIC-LOCATION:Asia/Seoul',
      'BEGIN:STANDARD',
      'TZOFFSETFROM:+0900',
      'TZOFFSETTO:+0900',
      'TZNAME:KST',
      'DTSTART:19700101T000000',
      'END:STANDARD',
      'END:VTIMEZONE'
    ];

    classes.forEach((c, idx) => {
      const isElearn = c.elearn || c.m === 'elearn' || !c.start;
      const uid = `gongji-tt-${opts.year || 2026}-${idx}-${Math.random().toString(36).slice(2, 8)}@kku.ac.kr`;
      const name = (c.name || '수업').replace(/[,;\\]/g, ' ');
      const prof = c.prof ? `${c.prof} 교수` : '';
      const room = (c.room || '').replace(/[,;\\]/g, ' ');

      if (isElearn) {
        // 이러닝 과목: 매주 월요일 리마인더
        const firstDate = getFirstClassDate(termStart, 1);
        const dtstart = formatDateTime(firstDate, '09:00');
        const dtend = formatDateTime(firstDate, '10:00');

        lines.push(
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTAMP:${formatDateTime(now, '00:00')}Z`,
          `SUMMARY:[이러닝] ${name}${prof ? ` (${prof})` : ''}`,
          `DESCRIPTION:건국대 온라인 이러닝 강좌\\n과목명: ${name}\\n담당교수: ${prof || '미지정'}\\n주차별 강의를 기한 내에 수강하세요.`,
          `LOCATION:건국대학교 e-Campus (이러닝)`,
          `DTSTART;TZID=Asia/Seoul:${dtstart}`,
          `DTEND;TZID=Asia/Seoul:${dtend}`,
          `RRULE:FREQ=WEEKLY;UNTIL=${untilStr}`,
          'STATUS:CONFIRMED',
          'TRANSP:TRANSPARENT', // 이러닝은 일정 시간 점유 안 함
          'END:VEVENT'
        );
      } else if (Number.isInteger(c.day) && c.start && c.end) {
        // 대면 정규 수업
        const firstDate = getFirstClassDate(termStart, c.day);
        const dtstart = formatDateTime(firstDate, c.start);
        const dtend = formatDateTime(firstDate, c.end);

        lines.push(
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTAMP:${formatDateTime(now, '00:00')}Z`,
          `SUMMARY:${name}${prof ? ` (${prof})` : ''}`,
          `DESCRIPTION:건국대학교 정규 강좌\\n과목명: ${name}\\n담당교수: ${prof || '미지정'}\\n강의실: ${room || '강의실 미지정'}`,
          `LOCATION:${room ? `${room} (건국대학교 GLOCAL)` : '건국대학교 GLOCAL캠퍼스'}`,
          `DTSTART;TZID=Asia/Seoul:${dtstart}`,
          `DTEND;TZID=Asia/Seoul:${dtend}`,
          `RRULE:FREQ=WEEKLY;UNTIL=${untilStr}`,
          'STATUS:CONFIRMED',
          'TRANSP:OPAQUE',
          'END:VEVENT'
        );
      }
    });

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  function download(classes, opts = {}) {
    const icsText = generateICS(classes, opts);
    if (!icsText) return false;
    const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const filename = opts.filename || `건국대_시간표_${new Date().getFullYear()}.ics`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  return {
    generateICS,
    download,
    getTermWindow
  };
});
