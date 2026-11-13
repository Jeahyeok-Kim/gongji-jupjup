# -*- coding: utf-8 -*-
"""백업·복원: 수집한 공지, AI가 만든 답(다시 만들면 40분 넘게 걸림), 규정·요람 정보를 zip 하나로 묶어 둔다.

  python pipeline/backup.py create              지금 상태를 backups/ 에 백업 (+ settings.json 의 backupDir 에도 한 부)
  python pipeline/backup.py list                백업 목록
  python pipeline/backup.py restore [파일]      백업으로 되돌리기 (파일을 안 적으면 가장 최근 것). 되돌리기 전에 지금 상태를 먼저 백업함.

넣는 것: collected/(공지 저장소·학교 기본 정보·원본 내보내기), pipeline/cache/(AI 답), pipeline/reference/*.json(번역·안내 페이지·요람 쪽수),
         pipeline/regulations.json, data/notices.js, data/calendar.js, settings.json
빼는 것: pipeline/media/(다운로드한 포스터·첨부, 다시 받을 수 있음)와 pipeline/reference/files/(요람 PDF). 넣고 싶으면 --with-media / --with-files.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import settings as cfg  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BACKUP_DIR = ROOT / 'backups'
PREFIX = '공지줍줍-백업-'
INFO_NAME = 'backup-info.json'

# 기본으로 넣는 것
CORE = ['collected', 'pipeline/cache', 'pipeline/reference', 'pipeline/regulations.json',
        'data/notices.js', 'data/calendar.js', 'settings.json']
OPTIONAL = {'media': 'pipeline/media', 'files': 'pipeline/reference/files'}
SKIP_PARTS = {'__pycache__'}
SKIP_SUFFIX = {'.tmp'}
# 복원할 때 폴더를 비우고 다시 채우는 곳 (백업에 없는 파일은 지워서 백업 시점 상태로 정확히 되돌림)
CLEAN_DIRS = ['collected', 'pipeline/cache']


def _is_under(rel: str, base: str) -> bool:
    return rel == base or rel.startswith(base + '/')


def _wanted(rel: str, with_media: bool, with_files: bool) -> bool:
    parts = rel.split('/')
    if SKIP_PARTS & set(parts) or Path(rel).suffix in SKIP_SUFFIX:
        return False
    if _is_under(rel, OPTIONAL['media']):
        return with_media
    if _is_under(rel, OPTIONAL['files']):
        return with_files
    return True


def collect_files(with_media: bool = False, with_files: bool = False) -> list[tuple[Path, str]]:
    bases = list(CORE) + ([OPTIONAL['media']] if with_media else []) + ([OPTIONAL['files']] if with_files else [])
    out = []
    for base in bases:
        p = ROOT / base
        if p.is_file():
            out.append((p, base))
        elif p.is_dir():
            for f in sorted(p.rglob('*')):
                if f.is_file():
                    rel = f.relative_to(ROOT).as_posix()
                    if _wanted(rel, with_media, with_files):
                        out.append((f, rel))
    return out


def _stamp(path: Path) -> str:
    """파일 이름 속 날짜시각(20261113-143000)"""
    name = path.name[len(PREFIX):] if path.name.startswith(PREFIX) else path.name
    return name[:15]


def list_backups(dirs=None) -> list[Path]:
    """최근 것이 앞으로. 같은 이름이 여러 폴더에 있으면 하나로 본다."""
    dirs = dirs if dirs is not None else _backup_dirs()
    found = {}
    for d in dirs:
        if d and Path(d).is_dir():
            for f in Path(d).glob(PREFIX + '*.zip'):
                found.setdefault(f.name, f)
    # 같은 초에 만든 것끼리는 파일 수정 시각으로 구분 (복원 직전 자동 백업이 바로 앞 백업과 같은 초일 수 있음)
    return sorted(found.values(), key=lambda f: (_stamp(f), f.stat().st_mtime_ns), reverse=True)


def _backup_dirs() -> list[Path]:
    s = cfg.load()
    dirs = [BACKUP_DIR]
    if s.get('backupDir'):
        dirs.append(Path(s['backupDir']))
    return dirs


def _prune(folder: Path, keep: int, protect: str = '') -> int:
    """오래된 백업 지우기. 방금 만든 파일(protect)은 어떤 경우에도 남긴다."""
    old = [f for f in list_backups([folder])[max(1, int(keep)):] if f.name != protect]
    for f in old:
        try:
            f.unlink()
        except OSError:
            pass
    return len(old)


def create(with_media: bool = False, with_files: bool = False, label: str = '', mirror: bool = True) -> Path | None:
    files = collect_files(with_media, with_files)
    if not files:
        print('백업할 데이터가 아직 없습니다.')
        return None
    settings = cfg.load()
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{PREFIX}{datetime.now():%Y%m%d-%H%M%S}{'-' + label if label else ''}.zip"
    dest = BACKUP_DIR / name
    tmp = dest.with_suffix('.zip.tmp')
    info = {'created': datetime.now().strftime('%Y-%m-%d %H:%M:%S'), 'files': len(files),
            'withMedia': with_media, 'withFiles': with_files, 'label': label}
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as z:
        for f, rel in files:
            z.write(f, rel)
        z.writestr(INFO_NAME, json.dumps(info, ensure_ascii=False, indent=1))
    tmp.replace(dest)
    keep = settings.get('backupKeep', 10)
    _prune(BACKUP_DIR, keep, protect=name)
    msg = f'백업 {dest.name} ({len(files)}개 파일, {dest.stat().st_size / 1e6:.1f}MB)'
    mirror_dir = settings.get('backupDir')
    if mirror and mirror_dir:
        try:
            Path(mirror_dir).mkdir(parents=True, exist_ok=True)
            shutil.copyfile(dest, Path(mirror_dir) / name)
            _prune(Path(mirror_dir), keep, protect=name)
            msg += f' → 사본: {mirror_dir}'
        except OSError as e:
            msg += f' (사본 폴더에 복사하지 못함: {e})'
    print('  ' + msg)
    return dest


def auto_backup(hours: float = 20) -> Path | None:
    """실행할 때마다 부르는 안전장치: 설정이 켜져 있고 최근 백업이 없을 때만 만든다 (하루 한 번쯤)."""
    s = cfg.load()
    if not s.get('autoBackup', True):
        return None
    last = list_backups([BACKUP_DIR])
    if last:
        try:
            when = datetime.strptime(_stamp(last[0]), '%Y%m%d-%H%M%S')
            if datetime.now() - when < timedelta(hours=hours):
                return None
        except ValueError:
            pass
    return create()


def _allowed(rel: str) -> bool:
    """백업에 들어갈 수 있는 곳(CORE·선택 항목) 안의 파일만 복원한다"""
    return any(_is_under(rel, b) for b in list(CORE) + list(OPTIONAL.values()))


def _safe_target(rel: str) -> Path | None:
    """zip 안의 경로가 프로젝트 폴더 밖으로 나가지 않는지 확인 (../ 같은 것은 거부)"""
    if rel.startswith('/') or rel.startswith('\\') or '..' in rel.split('/') or ':' in rel.split('/')[0]:
        return None
    target = (ROOT / rel).resolve()
    try:
        target.relative_to(ROOT.resolve())
    except ValueError:
        return None
    return target


def restore(path=None) -> dict:
    """백업 zip 으로 되돌린다. 돌려주는 값: {'restored': 파일 수, 'skipped': 거부한 항목 수, 'from': 파일 이름, 'safety': 복원 전 백업}"""
    if path is None:
        found = list_backups()
        if not found:
            raise FileNotFoundError('백업이 없습니다. backups 폴더나 backupDir 를 확인하세요.')
        path = found[0]
    path = Path(path)
    with zipfile.ZipFile(path) as z:
        members = [m for m in z.namelist() if not m.endswith('/') and m != INFO_NAME]
        allowed = [m for m in members if _allowed(m) and _safe_target(m) is not None]
        skipped = len(members) - len(allowed)
        if not allowed:
            raise ValueError('이 파일은 공지 줍줍 백업이 아니거나 비어 있습니다.')
        safety = create(label='복원전', mirror=False)
        for d in CLEAN_DIRS:                              # 폴더를 비우고 백업 시점 파일로 채움
            if any(_is_under(m, d) for m in allowed) and (ROOT / d).is_dir():
                shutil.rmtree(ROOT / d, ignore_errors=True)
        ref = ROOT / 'pipeline' / 'reference'
        if any(_is_under(m, 'pipeline/reference') for m in allowed) and ref.is_dir():
            for f in ref.glob('*.json'):                  # 요람 PDF(files/)는 건드리지 않음
                f.unlink()
        for m in allowed:
            target = _safe_target(m)
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(m) as src, open(target, 'wb') as dst:
                shutil.copyfileobj(src, dst)
    return {'restored': len(allowed), 'skipped': skipped, 'from': path.name, 'safety': safety.name if safety else None}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description='공지 줍줍 백업·복원')
    ap.add_argument('cmd', choices=['create', 'list', 'restore'])
    ap.add_argument('file', nargs='?', help='restore 할 백업 파일 (안 적으면 가장 최근 것)')
    ap.add_argument('--with-media', action='store_true', help='내려받은 포스터·첨부도 넣기 (용량이 큼)')
    ap.add_argument('--with-files', action='store_true', help='요람 PDF도 넣기')
    ap.add_argument('--yes', action='store_true', help='restore 할 때 확인 질문 없이 진행')
    a = ap.parse_args(argv)
    if a.cmd == 'create':
        return 0 if create(a.with_media, a.with_files) else 1
    if a.cmd == 'list':
        found = list_backups()
        if not found:
            print('백업이 없습니다.')
        for f in found:
            print(f'  {f.name}  {f.stat().st_size / 1e6:.1f}MB  ({f.parent})')
        return 0
    target = Path(a.file) if a.file else (list_backups() or [None])[0]
    if target is None:
        print('백업이 없습니다.')
        return 1
    if not a.yes:
        ans = input(f'{target.name} 으로 되돌립니다. 지금 데이터는 먼저 백업해 둡니다. 계속할까요? (y/N) ').strip().lower()
        if ans != 'y':
            print('취소했습니다.')
            return 1
    res = restore(target)
    print(f"복원 완료: 파일 {res['restored']}개 ({res['from']})" + (f" · 복원 전 상태는 {res['safety']} 에 백업" if res['safety'] else ''))
    if res['skipped']:
        print(f"  안전하지 않은 경로 {res['skipped']}개는 건너뜀")
    print('웹앱에 반영하려면 run_pipeline.bat 을 한 번 실행하세요 (AI는 다시 부르지 않음).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
