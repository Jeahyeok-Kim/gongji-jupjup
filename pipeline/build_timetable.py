# -*- coding: utf-8 -*-
"""크롬 확장이 KIS(학사정보시스템)에서 받은 강의 시간표로 웹 앱의 data/timetable.js 를 만듭니다. (AI는 쓰지 않습니다)

    python pipeline/build_timetable.py                      (공지줍줍·다운로드 폴더의 kku-lectures-*.json 중 가장 최근 것)
    python pipeline/build_timetable.py kku-lectures-2026-11-13.json --term B01012

강의시간 글자는 '월0900-1030(인문사회관 101), 목1330-1500(인문사회관 101)' 처럼 규칙이 있어 코드로 읽습니다.
읽지 못한 칸은 건너뛰고 몇 개인지 알려 줍니다. 결과는 요일마다 시간이 달라도 그대로 담깁니다.
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
        term = sorted(terms, key=lambda t: (t.get('collectedAt') or 0))[-1]
    courses, seen, skipped = [], set(), 0
    for r in term.get('rows', []):
        name = (r.get('n') or '').strip()
        slots = parse_slots(r.get('t') or '')
        if not name or not slots:
            skipped += 1
            continue
        key = (r.get('h'), r.get('s'), name, json.dumps(slots, ensure_ascii=False))
        if key in seen:
            continue
        seen.add(key)
        # 짧은 키: n 과목명, s 분반, d 개설학과, k 이수구분, y 개설학년, c 학점, t 시간 [요일(0=일), 시작, 끝, 강의실]
        courses.append({'n': name, 's': r.get('s') or '', 'd': r.get('d') or '', 'k': r.get('k') or '',
                        'y': r.get('y') or '', 'c': r.get('c') or 0, 't': slots})
    courses.sort(key=lambda c: (c['n'], c['s']))
    code = term.get('term') or ''
    return {'meta': {'source': '학사정보시스템(KIS) 과목조회', 'year': term.get('year'), 'term': code,
                     'termName': TERM_NAMES.get(code, code), 'collectedAt': term.get('collectedAt'),
                     'count': len(courses), 'skipped': skipped},
            'courses': courses}


HEADER = '// 공지 줍줍 강의 시간표 (build_timetable.py 가 만든 파일입니다. 직접 고치지 마세요)\n'


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description='KIS 강의 시간표 -> data/timetable.js')
    ap.add_argument('input', nargs='?', help='확장에서 내보낸 kku-lectures-날짜.json (생략하면 가장 최근 것)')
    ap.add_argument('--term', default=None, help='학기 코드 (예: B01012 = 2학기). 생략하면 가장 최근에 받은 학기')
    ap.add_argument('--out', default=str(gp.ROOT / 'data' / 'timetable.js'))
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
    Path(args.out).write_text(HEADER + 'window.GONGJI_TIMETABLE = ' + json.dumps(result, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    m = result['meta']
    print(f'완료: {args.out} 에 {m["year"]}년 {m["termName"]} 강의 {m["count"]}개 저장 (시간을 읽지 못해 건너뜀 {m["skipped"]}개)')
    if not args.input:
        # 가장 최근 것만 남기고 예전에 받은 강의 시간표 파일은 collected/원본 으로 옮긴다 (확장이 받을 때마다 쌓이지 않게)
        older = [p for p in st.find_exports('lectures') if p.resolve() != paths[0].resolve()]
        if older:
            st.archive(older)
    return 0


if __name__ == '__main__':
    sys.exit(main())
