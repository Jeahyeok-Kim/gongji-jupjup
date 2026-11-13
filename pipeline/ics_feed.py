# -*- coding: utf-8 -*-
"""구글 캘린더(와 애플·아웃룩 캘린더)가 '구독'할 수 있는 일정 파일 만들기: data/gongji.ics

- 공지의 마감 · 행사 일시 · 학교 학사일정을 한 파일(iCalendar, .ics)에 담는다.
- 이 파일을 웹앱과 같은 곳(GitHub Pages 등)에 올려 두고, 구글 캘린더의 '다른 캘린더 + → URL로 추가'에 주소를 붙여 넣으면
  파이프라인이 파일을 새로 올릴 때마다 캘린더가 알아서 따라간다 (구글은 몇 시간 간격으로 다시 확인).
- 일정마다 번호(UID)를 고정해서, 다시 만들어도 같은 일정은 중복 없이 '갱신'된다.
- 시각은 한국시간으로 읽어서 UTC(Z)로 적는다 → 캘린더 쪽에 시간대 정의가 없어도 어디서나 같은 시각으로 보인다.

  python pipeline/ics_feed.py          data/notices.json · calendar.json 으로 data/gongji.ics 만들기
"""
from __future__ import annotations

import hashlib
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'data'
KST = timezone(timedelta(hours=9))
CAL_NAME = '공지 줍줍'
KEEP_DAYS = 14          # 이만큼 지난 일정은 피드에서 뺀다 (캘린더가 지저분해지지 않게)
UID_DOMAIN = 'gongji-jupjup'


# ---------------------------------------------------------------
# 글자 다루기 (iCalendar 규칙)
# ---------------------------------------------------------------
def esc(text: str) -> str:
    """TEXT 값 이스케이프: 역슬래시·쉼표·세미콜론·줄바꿈"""
    t = str(text or '').replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,')
    return t.replace('\r\n', '\n').replace('\r', '\n').replace('\n', '\\n')


def fold(line: str) -> str:
    """한 줄은 75바이트까지. 넘으면 CRLF + 공백으로 이어 쓴다 (한글 글자 중간에서 자르지 않음)."""
    raw = line.encode('utf-8')
    if len(raw) <= 75:
        return line
    out, cur, size, limit = [], '', 0, 75
    for ch in line:
        n = len(ch.encode('utf-8'))
        if size + n > limit:
            out.append(cur)
            cur, size, limit = ch, n, 74        # 이어지는 줄은 앞의 공백 1바이트를 뺀 만큼
        else:
            cur += ch
            size += n
    out.append(cur)
    return '\r\n '.join(out)


def _local(s: str) -> datetime | None:
    """'2026-11-13T23:59' / '2026-11-13 23:59' → 한국시간 datetime (날짜만 있으면 None)"""
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})', s or '')
    if not m:
        return None
    try:
        return datetime(*map(int, m.groups()), tzinfo=KST)
    except ValueError:
        return None


def _day(s: str) -> date | None:
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', s or '')
    if not m:
        return None
    try:
        return date(*map(int, m.groups()))
    except ValueError:
        return None


def _utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')


def _ymd(d: date) -> str:
    return d.strftime('%Y%m%d')


# ---------------------------------------------------------------
# 일정 만들기
# ---------------------------------------------------------------
def _event(uid, stamp, summary, *, start, end=None, allday_end=None, desc='', url='', category='', alarm=None):
    """VEVENT 한 개의 줄 목록. start 가 date 면 종일 일정(allday_end 는 마지막 날), datetime 이면 시각 일정."""
    lines = ['BEGIN:VEVENT', f'UID:{uid}', f'DTSTAMP:{stamp}']
    if isinstance(start, datetime):
        lines.append(f'DTSTART:{_utc(start)}')
        lines.append(f'DTEND:{_utc(end or start + timedelta(minutes=30))}')
    else:
        last = allday_end or start
        lines.append(f'DTSTART;VALUE=DATE:{_ymd(start)}')
        lines.append(f'DTEND;VALUE=DATE:{_ymd(last + timedelta(days=1))}')    # 종일 일정의 끝은 '다음 날 0시'
    lines.append(f'SUMMARY:{esc(summary)}')
    if desc:
        lines.append(f'DESCRIPTION:{esc(desc)}')
    if url:
        lines.append(f'URL:{url}')
    if category:
        lines.append(f'CATEGORIES:{esc(category)}')
    if alarm is not None:
        lines += ['BEGIN:VALARM', 'ACTION:DISPLAY', f'DESCRIPTION:{esc(summary)}', f'TRIGGER:-PT{alarm}M', 'END:VALARM']
    lines.append('END:VEVENT')
    return lines


def _summary_text(n: dict) -> str:
    s = (n.get('summary') or {}).get('ko') or ''
    return s.strip()


def notice_events(n: dict, stamp: str, cutoff: date, cat_label: dict | None = None) -> list[list[str]]:
    """공지 하나 → 마감 일정, 행사 일정들"""
    out = []
    nid = n.get('id')
    if not nid:
        return out
    title = n.get('title') or ''
    cat = (cat_label or {}).get(n.get('category'), '')
    desc = '\n'.join(x for x in [_summary_text(n), n.get('link') or ''] if x)
    dl = n.get('deadline') or ''
    t = _local(dl)
    if t and t.date() >= cutoff:
        out.append(_event(f'{nid}-deadline@{UID_DOMAIN}', stamp, f'[마감] {title}', start=t,
                          desc=desc, url=n.get('link') or '', category=cat, alarm=24 * 60))
    elif _day(dl) and not t and _day(dl) >= cutoff:
        out.append(_event(f'{nid}-deadline@{UID_DOMAIN}', stamp, f'[마감] {title}', start=_day(dl),
                          desc=desc, url=n.get('link') or '', category=cat, alarm=9 * 60))
    for i, ev in enumerate(n.get('events') or []):
        if not isinstance(ev, dict):
            continue
        d = _day(ev.get('date') or '')
        if not d or d < cutoff:
            continue
        st = ev.get('start') or ''
        s = _local(f"{ev['date']}T{st or '09:00'}")
        e = _local(f"{ev['date']}T{ev.get('end') or st or '10:00'}")
        if s is None:
            continue
        if e is None or e <= s:
            e = s + timedelta(hours=1)
        out.append(_event(f'{nid}-event{i}@{UID_DOMAIN}', stamp, title, start=s, end=e,
                          desc=desc, url=n.get('link') or '', category=cat, alarm=60))
    return out


def academic_events(cal: dict | None, stamp: str, cutoff: date) -> list[list[str]]:
    out = []
    for it in (cal or {}).get('items', []) or []:
        s, e = _day(it.get('start') or ''), _day(it.get('end') or it.get('start') or '')
        title = (it.get('title') or {}).get('ko') if isinstance(it.get('title'), dict) else it.get('title')
        if not s or not e or e < s or not title or e < cutoff:
            continue
        key = hashlib.md5(f'{s}|{title}'.encode('utf-8')).hexdigest()[:12]
        out.append(_event(f'acad-{_ymd(s)}-{key}@{UID_DOMAIN}', stamp, f'[학사] {title}', start=s, allday_end=e, category='학사일정'))
    return out


def build_feed(notices_doc: dict, calendar_doc: dict | None = None, today: date | None = None) -> str:
    """notices.json · calendar.json 내용 → .ics 글자.  같은 입력이면 항상 같은 결과(깃에 불필요한 변경이 안 생김)."""
    meta = notices_doc.get('meta') or {}
    gen = _local(meta.get('generatedAt') or '') or datetime(2000, 1, 1, tzinfo=KST)
    stamp = _utc(gen)
    today = today or gen.date()
    cutoff = today - timedelta(days=KEEP_DAYS)
    cat_label = {}
    for c in notices_doc.get('categories') or []:
        lab = c.get('label') or {}
        cat_label[c.get('id')] = lab.get('ko') if isinstance(lab, dict) else str(lab)
    events: list[tuple[str, list[str]]] = []
    for n in notices_doc.get('notices') or []:
        for ev in notice_events(n, stamp, cutoff, cat_label):
            events.append((ev[1], ev))                    # ev[1] = 'UID:...'
    for ev in academic_events(calendar_doc, stamp, cutoff):
        events.append((ev[1], ev))
    events.sort(key=lambda x: x[0])
    head = ['BEGIN:VCALENDAR', 'VERSION:2.0', f'PRODID:-//{UID_DOMAIN}//ko', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
            f'X-WR-CALNAME:{CAL_NAME}', 'X-WR-TIMEZONE:Asia/Seoul',
            f'X-WR-CALDESC:{esc("건국대 GLOCAL캠퍼스 공지의 마감·행사와 학사일정 (공지 줍줍이 자동으로 갱신)")}',
            'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H']
    lines = head + [ln for _, ev in events for ln in ev] + ['END:VCALENDAR']
    return '\r\n'.join(fold(ln) for ln in lines) + '\r\n'


def write_feed(data_dir: Path | None = None, today: date | None = None) -> int:
    """data/notices.json · calendar.json → data/gongji.ics.  만든 일정 수를 돌려준다."""
    import json
    data_dir = Path(data_dir or DATA_DIR)
    notices = json.loads((data_dir / 'notices.json').read_text(encoding='utf-8'))
    cal_path = data_dir / 'calendar.json'
    cal = json.loads(cal_path.read_text(encoding='utf-8')) if cal_path.is_file() else None
    text = build_feed(notices, cal, today)
    path = data_dir / 'gongji.ics'
    tmp = path.with_suffix('.ics.tmp')
    tmp.write_bytes(text.encode('utf-8'))
    tmp.replace(path)
    return text.count('BEGIN:VEVENT')


def main(argv=None) -> int:
    try:
        n = write_feed()
    except (OSError, ValueError) as e:
        print(f'  ! 일정 파일을 만들지 못했습니다: {e}')
        return 1
    print(f'  data/gongji.ics 에 일정 {n}개를 썼습니다')
    return 0


if __name__ == '__main__':
    sys.exit(main())
