# -*- coding: utf-8 -*-
"""수집 저장소: 크롬 확장에서 여러 번 내보낸 JSON을 하나로 합친다.

- 공지      kku-notices-*.json   → collected/공지/게시판이름.json (같은 id는 더 최근에 모은 것으로, 새 공지만 추가,
                                     기간이 지난 공지는 지우고 _지운목록.json 에 남겨 다시 들어오지 않게)
- 기본 정보 kku-reference-*.json → collected/reference.json (학사일정·요람·안내 페이지·규정을 종류별로 합침)
- 합친 내보내기 파일은 collected/원본/ 으로 옮겨서 다운로드 폴더에 쌓이지 않게 한다 (지우지 않음).
찾는 곳: 공지줍줍 폴더, collected 폴더, 내 PC의 다운로드 폴더.
"""
from __future__ import annotations

import json
import re
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STORE_DIR = ROOT / 'collected'
ARCHIVE_DIR = STORE_DIR / '원본'
NOTICE_DIR = STORE_DIR / '공지'
REMOVED_FILE = '_지운목록.json'
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
    store = {'boards': {}, 'notices': {}, 'removed': {}}
    if NOTICE_DIR.is_dir():
        for f in sorted(NOTICE_DIR.glob('*.json')):
            data = _read(f)
            if f.name == REMOVED_FILE:
                store['removed'] = data.get('removed', {})
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
        if f.name != REMOVED_FILE and f not in written:
            try:
                f.unlink()
            except OSError:
                _write(f, {'schema': 1, 'board': f.stem, 'count': 0, 'syncs': [], 'notices': {}})
    _write(NOTICE_DIR / REMOVED_FILE, {'note': '기간이 지나 지운 공지. 확장에서 다시 내보내도 되살리지 않음.',
                                       'removed': store.get('removed', {})})
    return written


def _content(n: dict) -> tuple:
    return (n.get('subject'), n.get('text'), tuple(n.get('imgs') or []), n.get('fileCnt'))


def merge_notice_files(paths: list[Path], store: dict | None = None) -> tuple[dict, dict]:
    """내보낸 파일들을 저장소에 합친다. 같은 id면 더 최근에 모은 것으로 바꾸고, 새 id는 추가.
    지운 목록에 있는 id는 다시 넣지 않는다.
    돌려주는 값: (저장소, {'added', 'updated', 'skippedRemoved', 'files', 'byBoard'})"""
    store = store or load_notices()
    notices, removed = store['notices'], store.setdefault('removed', {})
    stats = {'added': 0, 'updated': 0, 'skippedRemoved': 0, 'files': 0, 'byBoard': {}}
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
                stats['skippedRemoved'] += 1
                continue
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


def prune(store: dict, deadlines: dict[str, str | None], today, keep_days: int = 30, max_age_days: int = 180) -> list[str]:
    """기간이 지난 공지를 저장소에서 지운다.
    - 마감일이 있으면: 마감 후 keep_days 일이 지나면
    - 마감일을 모르면: 올린 날부터 max_age_days 일이 지나면
    deadlines: 파이프라인이 찾은 {id: 마감 'YYYY-MM-DDTHH:MM' 또는 None}"""
    from datetime import date as _date, timedelta
    gone = []
    for nid, n in list(store['notices'].items()):
        dl = deadlines.get(nid)
        try:
            if dl:
                expired = _date.fromisoformat(dl[:10]) + timedelta(days=keep_days) < today
            else:
                posted = _date.fromisoformat(str(n.get('date'))[:10])
                expired = posted + timedelta(days=max_age_days) < today
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
