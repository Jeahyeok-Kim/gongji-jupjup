# -*- coding: utf-8 -*-
"""크롬 확장이 KIS(학사정보시스템)에서 받은 강의 시간표로 웹 앱의 data/timetable.js 를 만듭니다. (AI는 쓰지 않습니다)

    python pipeline/build_timetable.py                      (공지줍줍·다운로드 폴더의 kku-lectures-*.json 중 가장 최근 것)
    python pipeline/build_timetable.py kku-lectures-2026-11-13.json --term B01012

학기를 정하지 않으면 정규 학기(1·2학기) 중 가장 최근 것을 고릅니다. 계절학기처럼 과목이 몇 개 안 되는 자료가
나중에 들어와도, 이미 있는 정규 학기 시간표(과목이 훨씬 많은 것)를 덮어쓰지 않습니다 (바꾸려면 --term 또는 --force).

강의시간 글자는 '월0900-1030(인문사회관 101), 목1330-1500(인문사회관 101)' 처럼 규칙이 있어 코드로 읽습니다.
결과는 요일마다 시간이 달라도 그대로 담깁니다. 수업 방식(m)도 함께 적습니다.
  - 강의실이 '실시간온라인'처럼 온라인이면 'live' (정해진 시간에 화상으로 듣는 수업: 시간은 겹치면 안 됨)
  - 강의시간 칸이 비어 있으면 'elearn' (이러닝·현장실습처럼 정해진 시간이 없는 수업: 시간표와 겹치지 않음)
  - 그 밖에는 강의실 수업이라 m 을 적지 않습니다.
시간 글자가 있는데 읽지 못한 칸만 건너뛰고 몇 개인지 알려 줍니다.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gongji_pipeline as gp  # noqa: E402
import store as st  # noqa: E402

DAYS = {'일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6}
TERM_NAMES = {'B01011': '1학기', 'B01012': '2학기', 'B01013': '여름학기', 'B01014': '겨울학기'}
REGULAR_TERMS = ('B01011', 'B01012')
MIN_REGULAR = 50          # 정규 학기로 볼 최소 과목 수 (일부만 받은 자료는 고르지 않음)
SHRINK_GUARD = 0.2        # 새 자료가 기존 과목 수의 20% 미만이고 학기가 다르면 덮어쓰지 않음
ONLINE = re.compile(r'(실시간\s*온라인|온라인|원격|비대면|화상|zoom|webex)', re.I)
SLOT = re.compile(r'([일월화수목금토])\s*(\d{2})(\d{2})\s*-\s*(\d{2})(\d{2})\s*(?:\(([^()]*(?:\([^()]*\)[^()]*)*)\))?')


def parse_slots(text: str) -> list[list]:
    """'월0900-1030(인문사회관 101), 목1330-1500' -> [[1,'09:00','10:30','인문사회관 101'], [4,'13:30','15:00','']]"""
    out = []
    for m in SLOT.finditer(text or ''):
        day, h1, m1, h2, m2, room = m.groups()
        a, b = int(h1) * 60 + int(m1), int(h2) * 60 + int(m2)
        if not (0 <= int(h1) < 24 and int(m1) < 60 and int(h2) < 24 and int(m2) < 60) or b <= a:
            continue
        out.append([DAYS[day], f'{h1}:{m1}', f'{h2}:{m2}', (room or '').strip()])
    return out


def class_mode(text: str, slots: list[list]) -> str:
    """수업 방식: '' 강의실 · 'live' 실시간 온라인 · 'elearn' 시간이 정해지지 않은 수업"""
    if not slots:
        return 'elearn'
    rooms = [s[3] for s in slots if s[3]]
    if rooms and all(ONLINE.search(r) for r in rooms):
        return 'live'
    return ''


def pick_term(terms: list[dict]) -> dict:
    """학기를 정하지 않았을 때: 과목이 충분한 정규 학기(1·2학기) 중 가장 최근 것, 없으면 가장 최근에 받은 것"""
    key = lambda t: (str(t.get('year') or ''), t.get('collectedAt') or 0)
    regular = [t for t in terms if t.get('term') in REGULAR_TERMS and len(t.get('rows') or []) >= MIN_REGULAR]
    return sorted(regular or terms, key=key)[-1]


def keep_existing(out: Path, new_meta: dict) -> dict | None:
    """이미 있는 시간표가 훨씬 크고 학기가 다르면 그 meta 를 돌려준다 (덮어쓰지 않기)"""
    try:
        text = Path(out).read_text(encoding='utf-8')
        old = json.loads(text[text.index('{'):text.rindex('}') + 1]).get('meta') or {}
    except (OSError, ValueError):
        return None
    same = (old.get('year'), old.get('term')) == (new_meta.get('year'), new_meta.get('term'))
    if not same and (old.get('count') or 0) >= MIN_REGULAR and new_meta['count'] < (old.get('count') or 0) * SHRINK_GUARD:
        return old
    return None


def build(terms: list[dict], term_code: str | None = None) -> dict:
    """내보내기 파일의 terms 중 하나를 골라 웹 앱용 자료로"""
    if not terms:
        raise ValueError('강의 시간표가 비어 있습니다.')
    if term_code:
        picked = [t for t in terms if t.get('term') == term_code]
        if not picked:
            raise ValueError(f'{term_code} 학기 자료가 없습니다. 있는 것: ' + ', '.join(t.get('term', '?') for t in terms))
        term = picked[0]
    else:
        term = pick_term(terms)
    courses, seen, skipped = [], set(), 0
    modes = {'live': 0, 'elearn': 0}
    for r in term.get('rows', []):
        name = (r.get('n') or '').strip()
        text = (r.get('t') or '').strip()
        slots = parse_slots(text)
        if not name or (text and not slots):
            skipped += 1        # 시간 글자가 있는데 읽지 못함
            continue
        key = (r.get('h'), r.get('s'), name, json.dumps(slots, ensure_ascii=False))
        if key in seen:
            continue
        seen.add(key)
        # 짧은 키: n 과목명, h 학수번호, s 분반, d 개설학과, k 이수구분, y 개설학년(9 = 전 학년), c 학점,
        #          t 시간 [요일(0=일), 시작, 끝, 강의실], m 수업 방식('live' 실시간 온라인 · 'elearn' 시간 없음)
        c = {'n': name, 'h': r.get('h') or '', 's': r.get('s') or '', 'd': r.get('d') or '', 'k': r.get('k') or '',
             'y': r.get('y') or '', 'c': r.get('c') or 0, 't': slots}
        mode = class_mode(text, slots)
        if mode:
            c['m'] = mode
            modes[mode] += 1
        courses.append(c)
    courses.sort(key=lambda c: (c['n'], c['s']))
    code = term.get('term') or ''
    return {'meta': {'source': '학사정보시스템(KIS) 과목조회', 'year': term.get('year'), 'term': code,
                     'termName': TERM_NAMES.get(code, code), 'collectedAt': term.get('collectedAt'),
                     'count': len(courses), 'skipped': skipped, 'live': modes['live'], 'elearn': modes['elearn']},
            'courses': courses}


HEADER = '// 공지 줍줍 강의 시간표 (build_timetable.py 가 만든 파일입니다. 직접 고치지 마세요)\n'


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description='KIS 강의 시간표 -> data/timetable.js')
    ap.add_argument('input', nargs='?', help='확장에서 내보낸 kku-lectures-날짜.json (생략하면 가장 최근 것)')
    ap.add_argument('--term', default=None, help='학기 코드 (예: B01012 = 2학기). 생략하면 가장 최근에 받은 학기')
    ap.add_argument('--out', default=str(gp.ROOT / 'data' / 'timetable.js'))
    ap.add_argument('--force', action='store_true', help='과목 수가 훨씬 적은 다른 학기 자료라도 덮어쓰기')
    args = ap.parse_args(argv)
    paths = [Path(args.input)] if args.input else st.find_exports('lectures')[-1:]
    if not paths:
        print('kku-lectures-날짜.json 파일을 찾지 못했습니다. KIS에서 과목조회를 한 뒤 확장에서 내보내세요.')
        return 1
    data = json.loads(paths[0].read_text(encoding='utf-8-sig'))
    try:
        result = build(data.get('terms', []), args.term)
    except ValueError as e:
        print(f'  ! {e}')
        return 1
    old = None if (args.term or args.force) else keep_existing(Path(args.out), result['meta'])
    if old:
        m = result['meta']
        print(f'  ! 새로 받은 {m["year"]}년 {m["termName"]} 강의가 {m["count"]}개뿐이라, 기존 {old.get("year")}년 {old.get("termName")} '
              f'강의 {old.get("count")}개를 그대로 둡니다. (바꾸려면 --term {m["term"]} 또는 --force)')
        return 0
    Path(args.out).write_text(HEADER + 'window.GONGJI_TIMETABLE = ' + json.dumps(result, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    m = result['meta']
    print(f'완료: {args.out} 에 {m["year"]}년 {m["termName"]} 강의 {m["count"]}개 저장 '
          f'(실시간 온라인 {m["live"]}개 · 시간 없는 이러닝 등 {m["elearn"]}개 · 시간을 읽지 못해 건너뜀 {m["skipped"]}개)')
    if not args.input:
        # 가장 최근 것만 남기고 예전에 받은 강의 시간표 파일은 collected/원본 으로 옮긴다 (확장이 받을 때마다 쌓이지 않게)
        older = [p for p in st.find_exports('lectures') if p.resolve() != paths[0].resolve()]
        if older:
            st.archive(older)
    return 0


if __name__ == '__main__':
    sys.exit(main())
