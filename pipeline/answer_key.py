# -*- coding: utf-8 -*-
"""정답표로 AI 추출 정확도 재기

1) 정답표 만들기: 게시판별로 골고루 30건을 뽑아 CSV를 만듭니다.
    python pipeline/answer_key.py make kku-notices-2026-11-20.json --n 30
   → pipeline/answer_key.csv 를 엑셀로 열고, 원문을 직접 읽어 마감·포인트·금액·분류 칸을 채웁니다.

2) 채점하기: 정답표와 data/notices.js(AI 결과)를 비교합니다.
    python pipeline/answer_key.py check
"""
from __future__ import annotations

import argparse
import csv
import random
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gongji_pipeline as gp  # noqa: E402

DEFAULT_CSV = gp.PIPELINE_DIR / 'answer_key.csv'
COLUMNS = ['id', '게시판', '제목', '원문 링크', '마감(YYYY-MM-DD HH:MM, 없으면 비움)', '다드림 포인트(숫자)',
           '확정 금액(원, 숫자)', '혜택 종류(' + '/'.join(gp.CATEGORY_IDS) + ')', '메모']


def make(args) -> int:
    # AI 결과에 들어갈 공지(최근 글, 개인정보 제외, 글로 된 본문)만 뽑는다
    today = date.fromisoformat(args.today) if args.today else date.today()
    since = today - timedelta(days=args.days) if args.days > 0 else None

    def recent(n):
        d = gp.norm_date(n.get('date'))
        return not since or (d and date.fromisoformat(d) >= since)

    notices = [n for n in gp.load_collected(Path(args.input))
               if not gp.skip_reason(n) and gp.body_status(n) == 'text' and recent(n)]
    by_board = defaultdict(list)
    for n in notices:
        by_board[n.get('boardName', '')].append(n)
    rng = random.Random(2026)
    for lst in by_board.values():
        rng.shuffle(lst)
    picked = []
    boards = sorted(by_board)
    while len(picked) < args.n and any(by_board.values()):
        for b in boards:                       # 게시판을 돌아가며 한 건씩 → 골고루
            if by_board[b] and len(picked) < args.n:
                picked.append(by_board[b].pop())
    out = Path(args.out)
    if out.exists() and not args.force:
        print(f'{out} 이(가) 이미 있습니다. 덮어쓰려면 --force 를 붙이세요.')
        return 1
    with out.open('w', encoding='utf-8-sig', newline='') as f:   # utf-8-sig: 엑셀에서 한글이 안 깨지게
        w = csv.writer(f)
        w.writerow(COLUMNS)
        for n in picked:
            w.writerow([n['id'], n.get('boardName', ''), n.get('subject', ''), n.get('link', ''), '', '', '', '', ''])
    print(f'{out} 에 {len(picked)}건을 뽑았습니다. 원문을 읽고 빈칸을 채운 뒤 check 를 실행하세요.')
    return 0


def _int(s: str):
    s = (s or '').replace(',', '').strip()
    return int(s) if s.isdigit() and int(s) > 0 else None


def _deadline(s: str):
    s = (s or '').strip()
    if not s:
        return None
    v = gp.norm_datetime(s.replace(' ', 'T') if len(s) > 10 else s, '00:00')
    return (v, len(s) > 10) if v else ('?', True)


def check(args) -> int:
    data = gp.read_notices_js(Path(args.notices))
    ai = {n['id']: n for n in data['notices']}
    with Path(args.key).open(encoding='utf-8-sig') as f:
        rows = list(csv.DictReader(f))
    fields = {'마감': [0, 0], '다드림 포인트': [0, 0], '확정 금액': [0, 0], '혜택 종류': [0, 0]}
    wrong, missing = [], 0
    for r in rows:
        n = ai.get(r['id'])
        if not n:
            missing += 1
            continue
        # 마감: 정답에 시각까지 있으면 시각까지, 날짜만 있으면 날짜만 비교
        key_dl = _deadline(r[COLUMNS[4]])
        got = n.get('deadline')
        if key_dl is None:
            ok = got is None
        else:
            v, with_time = key_dl
            ok = got is not None and (got == v if with_time else got[:10] == v[:10])
        fields['마감'][0] += ok; fields['마감'][1] += 1
        if not ok:
            wrong.append((r['id'], '마감', r[COLUMNS[4]] or '없음', got or '없음'))
        b = n.get('benefit') or {}
        for name, col, k in (('다드림 포인트', COLUMNS[5], 'points'), ('확정 금액', COLUMNS[6], 'won')):
            want, have = _int(r[col]), b.get(k)
            ok = want == have
            fields[name][0] += ok; fields[name][1] += 1
            if not ok:
                wrong.append((r['id'], name, want or '없음', have or '없음'))
        cat = (r[COLUMNS[7]] or '').strip()
        if cat:
            ok = cat == n.get('category')
            fields['혜택 종류'][0] += ok; fields['혜택 종류'][1] += 1
            if not ok:
                wrong.append((r['id'], '혜택 종류', cat, n.get('category')))
    print(f'정답표 {len(rows)}건 중 AI 결과에 있는 공지 {len(rows) - missing}건으로 채점했습니다.')
    total_ok = total = 0
    for name, (ok, cnt) in fields.items():
        if cnt:
            print(f'  {name}: {ok}/{cnt} ({ok / cnt:.0%})')
            total_ok += ok; total += cnt
    if total:
        print(f'  전체: {total_ok}/{total} ({total_ok / total:.0%})')
    if wrong:
        print('\n틀린 항목 (id, 항목, 정답, AI):')
        for w in wrong:
            print('  ', *w, sep=' | ')
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description='정답표 만들기와 AI 추출 정확도 채점')
    sub = ap.add_subparsers(dest='cmd', required=True)
    m = sub.add_parser('make', help='정답표 CSV 만들기')
    m.add_argument('input', help='크롬 확장에서 내보낸 JSON')
    m.add_argument('--n', type=int, default=30)
    m.add_argument('--out', default=str(DEFAULT_CSV))
    m.add_argument('--force', action='store_true')
    m.add_argument('--days', type=int, default=60, help='정답표를 뽑을 기간(일). 최근 글 위주로 뽑도록 기본 60 (웹 앱 보관 기간과는 따로)')
    m.add_argument('--today', default=None, help='기준 날짜 YYYY-MM-DD (시험용)')
    c = sub.add_parser('check', help='정답표와 AI 결과 비교')
    c.add_argument('--key', default=str(DEFAULT_CSV))
    c.add_argument('--notices', default=str(gp.ROOT / 'data' / 'notices.js'))
    args = ap.parse_args(argv)
    return make(args) if args.cmd == 'make' else check(args)


if __name__ == '__main__':
    sys.exit(main())
