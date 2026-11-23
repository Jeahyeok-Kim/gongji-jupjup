# -*- coding: utf-8 -*-
"""수집 저장소: 크롬 확장에서 여러 번 내보낸 JSON을 하나로 합친다.

- 공지      kku-notices-*.json   → collected/공지/게시판이름.json (같은 id는 더 최근에 모은 것으로, 새 공지만 추가,
                                     보관 기간(기본 최근 6개월 = 한 학기 이상)보다 오래되고 마감도 지난 공지는 지우고
                                     _지운목록.json 에 남겨 다시 들어오지 않게. 보관 기간을 늘리면 그 안의 공지는 다시 받는다)
- 기본 정보 kku-reference-*.json → collected/reference.json (학사일정·요람·안내 페이지·규정을 종류별로 합침)
- 합친 내보내기 파일은 collected/원본/ 으로 옮겨서 다운로드 폴더에 쌓이지 않게 한다 (지우지 않음).
찾는 곳: 공지줍줍 폴더, collected 폴더, 내 PC의 다운로드 폴더.
"""
from __future__ import annotations

import json
import re
import shutil
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STORE_DIR = ROOT / 'collected'
ARCHIVE_DIR = STORE_DIR / '원본'
NOTICE_DIR = STORE_DIR / '공지'
REMOVED_FILE = '_지운목록.json'
PERIOD_FILE = '_보관기간.json'       # 확장 팝업에서 고른 보관 기간 {'months': 6, 'since': 'YYYY-MM-DD'}

# 보관 기간: 웹 앱에 남겨 두는 공지 기간. 한 학기 이상은 늘 가지고 있도록 6개월보다 짧게는 하지 않는다.
DEFAULT_KEEP_MONTHS = 6
MIN_KEEP_MONTHS, MAX_KEEP_MONTHS = 6, 24
_DEFAULT = object()


def months_ago(today: date, months: int) -> date:
    """오늘에서 months 개월 전 같은 날 (그 달에 없는 날이면 그 달 마지막 날). 확장의 kkuSince 와 같은 계산"""
    y, m = divmod(today.year * 12 + (today.month - 1) - months, 12)
    m += 1
    nxt = date(y + (m == 12), m % 12 + 1, 1)
    return date(y, m, min(today.day, (nxt - timedelta(days=1)).day))


def keep_months(value, default: int = DEFAULT_KEEP_MONTHS) -> int:
    """확장에서 온 보관 기간(개월)을 6~24개월로"""
    try:
        v = round(float(value))
    except (TypeError, ValueError):
        return default
    return min(MAX_KEEP_MONTHS, max(MIN_KEEP_MONTHS, v))


def read_period(paths: list[Path]) -> dict | None:
    """내보내기 파일에 적힌 보관 기간 (가장 나중 파일 것). 예전 확장(1.2 이하)이 만든 파일에는 없다"""
    found = None
    for p in paths:
        try:
            data = _read(p)
        except (OSError, ValueError):
            continue
        per = data.get('period') if isinstance(data, dict) else None
        if isinstance(per, dict) and per.get('months') is not None:
            found = {'months': keep_months(per.get('months')), 'since': str(per.get('since') or '')[:10]}
    return found


def _posted(n: dict) -> date | None:
    try:
        return date.fromisoformat(str(n.get('date') or '')[:10].replace('.', '-'))
    except ValueError:
        return None
REFERENCE_PATH = STORE_DIR / 'reference.json'


def search_dirs() -> list[Path]:
    return [d for d in (ROOT, STORE_DIR, Path.home() / 'Downloads') if d.is_dir()]


def find_exports(kind: str) -> list[Path]:
    """kind: 'notices' 또는 'reference'. 오래된 것부터 (나중 것이 덮어쓰도록)"""
    files = {}
    for d in search_dirs():
        for f in d.glob(f'kku-{kind}-*.json'):
            if f.is_file():
                files[f.resolve()] = f
    return sorted(files.values(), key=lambda f: f.stat().st_mtime)


def _read(path: Path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def _write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    tmp.replace(path)


def archive(paths: list[Path]) -> list[Path]:
    """합친 내보내기 파일을 collected/원본/ 으로 옮긴다 (같은 이름이 있으면 번호를 붙임)"""
    moved = []
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    for p in paths:
        p = Path(p)
        if not p.exists() or ARCHIVE_DIR in p.resolve().parents:
            continue
        dest = ARCHIVE_DIR / p.name
        i = 1
        while dest.exists():
            dest = ARCHIVE_DIR / f'{p.stem}_{i}{p.suffix}'
            i += 1
        try:
            shutil.move(str(p), str(dest))
            moved.append(dest)
        except OSError:
            pass        # 다른 프로그램이 열고 있으면 그대로 둠
    return moved


# ------------------------------------------------------------------
# 공지: 게시판마다 파일 하나 (collected/공지/학사공지.json …)
# ------------------------------------------------------------------
def _board_file(name: str) -> Path:
    safe = re.sub(r'[\\/:*?"<>|]', '_', name or '기타').strip() or '기타'
    return NOTICE_DIR / f'{safe}.json'


def load_notices() -> dict:
    """게시판별 파일을 모두 읽어 하나로: {'boards': {...}, 'notices': {id: 공지}, 'removed': {id: 지운 날짜}}"""
    store = {'boards': {}, 'notices': {}, 'removed': {}, 'period': None}
    if NOTICE_DIR.is_dir():
        for f in sorted(NOTICE_DIR.glob('*.json')):
            data = _read(f)
            if f.name == REMOVED_FILE:
                store['removed'] = data.get('removed', {})
                continue
            if f.name == PERIOD_FILE:
                store['period'] = data if isinstance(data, dict) and data.get('months') else None
                continue
            if f.name.startswith('_'):
                continue
            store['notices'].update(data.get('notices', {}))
            for b in data.get('syncs', []):
                store['boards'][f"{b.get('host')}:{b.get('menu')}"] = b
    return store


def save_notices(store: dict) -> list[Path]:
    """게시판별로 나눠 쓴다. 공지가 하나도 안 남은 게시판 파일은 지운다."""
    NOTICE_DIR.mkdir(parents=True, exist_ok=True)
    groups: dict[str, dict] = {}
    for nid, n in store['notices'].items():
        groups.setdefault(n.get('boardName') or '기타', {})[nid] = n
    written = []
    for name, items in groups.items():
        syncs = [b for b in store['boards'].values() if b.get('name') == name]
        _write(_board_file(name), {'schema': 1, 'board': name, 'count': len(items),
                                   'updatedAt': datetime.now().isoformat(timespec='seconds'),
                                   'syncs': syncs, 'notices': items})
        written.append(_board_file(name))
    for f in NOTICE_DIR.glob('*.json'):
        if not f.name.startswith('_') and f not in written:
            try:
                f.unlink()
            except OSError:
                _write(f, {'schema': 1, 'board': f.stem, 'count': 0, 'syncs': [], 'notices': {}})
    _write(NOTICE_DIR / REMOVED_FILE, {'note': '보관 기간이 지나 지운 공지. 보관 기간 안에 드는 공지만 다시 받는다.',
                                       'removed': store.get('removed', {})})
    if store.get('period'):
        _write(NOTICE_DIR / PERIOD_FILE, store['period'])
    return written


def _content(n: dict) -> tuple:
    return (n.get('subject'), n.get('text'), tuple(n.get('imgs') or []), n.get('fileCnt'))


def merge_notice_files(paths: list[Path], store: dict | None = None, since: date | None = None) -> tuple[dict, dict]:
    """내보낸 파일들을 저장소에 합친다. 같은 id면 더 최근에 모은 것으로 바꾸고, 새 id는 추가.
    지운 목록에 있는 id는 다시 넣지 않는다. 다만 since(보관 기간 첫날) 이후에 올라온 공지는 되살린다
    (예전 규칙으로 지웠거나 보관 기간을 늘린 경우).
    돌려주는 값: (저장소, {'added', 'updated', 'restored', 'skippedRemoved', 'files', 'byBoard'})"""
    store = store or load_notices()
    notices, removed = store['notices'], store.setdefault('removed', {})
    stats = {'added': 0, 'updated': 0, 'restored': 0, 'skippedRemoved': 0, 'files': 0, 'byBoard': {}}
    for p in paths:
        data = _read(p)
        items = data.get('notices', []) if isinstance(data, dict) else data
        stats['files'] += 1
        for b in (data.get('boards') or []) if isinstance(data, dict) else []:
            key = f"{b.get('host')}:{b.get('menu')}"
            if (b.get('lastSyncAt') or 0) >= (store['boards'].get(key, {}).get('lastSyncAt') or 0):
                store['boards'][key] = b
        for n in items:
            if not isinstance(n, dict) or not n.get('id'):
                continue
            if n['id'] in removed:
                posted = _posted(n)
                if not (since and posted and posted >= since):
                    stats['skippedRemoved'] += 1
                    continue
                del removed[n['id']]
                stats['restored'] += 1
            old = notices.get(n['id'])
            if old is None:
                notices[n['id']] = n
                stats['added'] += 1
                bn = n.get('boardName') or '?'
                stats['byBoard'][bn] = stats['byBoard'].get(bn, 0) + 1
            elif (n.get('collectedAt') or 0) >= (old.get('collectedAt') or 0):
                if _content(n) != _content(old):
                    stats['updated'] += 1
                notices[n['id']] = n
    return store, stats


def prune(store: dict, deadlines: dict[str, str | None], today: date, since=_DEFAULT, keep_days: int = 30) -> list[str]:
    """보관 기간이 지난 공지를 저장소에서 지운다.
    - since(보관 기간 첫날, 기본 6개월 전) 이후에 올라온 공지는 마감이 지났어도 남긴다 (지난 공지 다시 보기)
    - 그보다 오래된 공지는: 마감을 모르거나, 마감 후 keep_days 일이 지났으면 지운다 (마감이 아직이면 남김)
    - since=None 이면 기간 제한 없이 아무것도 지우지 않는다
    deadlines: 파이프라인이 찾은 {id: 마감 'YYYY-MM-DDTHH:MM' 또는 None}"""
    if since is _DEFAULT:
        since = months_ago(today, DEFAULT_KEEP_MONTHS)
    if since is None:
        return []
    gone = []
    for nid, n in list(store['notices'].items()):
        posted = _posted(n)
        if posted is None or posted >= since:
            continue
        dl = deadlines.get(nid)
        try:
            expired = not dl or date.fromisoformat(dl[:10]) + timedelta(days=keep_days) < today
        except ValueError:
            continue
        if expired:
            del store['notices'][nid]
            store.setdefault('removed', {})[nid] = today.isoformat()
            gone.append(nid)
    return gone


def store_as_export(store: dict) -> dict:
    """파이프라인이 읽는 모양 ({notices: [...]})으로"""
    items = sorted(store['notices'].values(), key=lambda n: (n.get('date') or '', n.get('bbsSeq') or 0), reverse=True)
    return {'schema': 1, 'boards': list(store.get('boards', {}).values()), 'count': len(items), 'notices': items}


def board_summary(store: dict) -> dict:
    out = {}
    for n in store['notices'].values():
        bn = n.get('boardName') or '?'
        out[bn] = out.get(bn, 0) + 1
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


# ------------------------------------------------------------------
# 학교 기본 정보
# ------------------------------------------------------------------
def load_reference() -> dict:
    if REFERENCE_PATH.exists():
        return _read(REFERENCE_PATH)
    return {'schema': 1, 'kind': 'kku-reference', 'calendar': [], 'yoram': [], 'pages': [], 'rules': [],
            'collected': {}}


def merge_reference_files(paths: list[Path], ref: dict | None = None) -> tuple[dict, dict]:
    """종류별로 합친다. 학사일정: (시작일, 이름)이 같으면 하나 / 요람: 학년도별 / 안내 페이지: 메뉴별 / 규정: 이름별 최신"""
    ref = ref or load_reference()
    stats = {'calendar': 0, 'yoram': 0, 'pages': 0, 'rules': 0, 'rulesChanged': 0, 'files': 0}
    cal = {(x.get('start'), re.sub(r'\s+', ' ', x.get('title') or '').strip()): x for x in ref.get('calendar', [])}
    yor = {x.get('year'): x for x in ref.get('yoram', [])}
    pages = {x.get('menu'): x for x in ref.get('pages', [])}
    rules = {re.sub(r'\s+', '', x.get('name') or ''): x for x in ref.get('rules', [])}
    for p in paths:
        data = _read(p)
        stats['files'] += 1
        when = data.get('collected') or {}
        for x in data.get('calendar') or []:
            k = (x.get('start'), re.sub(r'\s+', ' ', x.get('title') or '').strip())
            if k not in cal:
                stats['calendar'] += 1
            cal[k] = x
        for x in data.get('yoram') or []:
            if x.get('year') not in yor:
                stats['yoram'] += 1
            yor[x.get('year')] = x
        for x in data.get('pages') or []:
            if x.get('menu') not in pages or pages[x['menu']].get('text') != x.get('text'):
                stats['pages'] += 1
            pages[x.get('menu')] = x
        for x in data.get('rules') or []:
            k = re.sub(r'\s+', '', x.get('name') or '')
            if k not in rules:
                stats['rules'] += 1
            elif rules[k].get('hseq') != x.get('hseq') or rules[k].get('text') != x.get('text'):
                stats['rulesChanged'] += 1
            rules[k] = x
        for k, v in when.items():
            if v and (v > (ref.get('collected', {}).get(k) or 0)):
                ref.setdefault('collected', {})[k] = v
    ref['calendar'] = sorted(cal.values(), key=lambda x: (x.get('start') or '', x.get('title') or ''))
    ref['yoram'] = sorted(yor.values(), key=lambda x: x.get('year') or 0, reverse=True)
    ref['pages'] = sorted(pages.values(), key=lambda x: x.get('menu') or 0)
    ref['rules'] = sorted(rules.values(), key=lambda x: x.get('name') or '')
    ref['updatedAt'] = datetime.now().isoformat(timespec='seconds')
    return ref, stats


def save_reference(ref: dict) -> None:
    _write(REFERENCE_PATH, ref)
