# -*- coding: utf-8 -*-
"""데이터 게시: 웹앱이 자동으로 읽어 갈 수 있게 data/ 의 파일을 서버(웹 주소)에 올린다.

웹앱은 열 때마다 version.json 만 가볍게 확인해서, 더 새로운 데이터가 있으면 notices.json 을 받아 화면을 바꾼다.
  1) data/notices.js, calendar.js, glossary.js (파이프라인이 만든 파일) → notices.json, calendar.json, glossary.json, version.json 도 같이 만들고,
     구글 캘린더가 구독하는 일정 파일 gongji.ics 도 만든다
  2) settings.json 의 publish 설정대로 올린다
       folder  지정한 폴더로 복사 (구글 드라이브 폴더, 공유 폴더 등)
       git     커밋하고 push (GitHub Pages 로 웹앱을 열어 두었다면 몇 분 뒤 반영)

  python pipeline/publish.py            설정대로 게시
  python pipeline/publish.py --json     JSON 파일만 만들기
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import settings as cfg  # noqa: E402
import ics_feed  # noqa: E402
from gongji_pipeline import load_marked_json  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'data'
FILES = ['notices.js', 'notices.json', 'calendar.js', 'calendar.json', 'glossary.json', 'gongji.ics', 'overrides.json', 'version.json']


def _dump(path: Path, obj) -> None:
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tmp.replace(path)


def write_json_mirrors(data_dir: Path | None = None) -> dict:
    """notices.js / calendar.js 안의 JSON 을 .json 파일로도 저장하고, 버전 확인용 version.json 을 만든다."""
    data_dir = Path(data_dir or DATA_DIR)
    notices = load_marked_json(data_dir / 'notices.js')
    _dump(data_dir / 'notices.json', notices)
    meta = notices.get('meta', {})
    version = {'generatedAt': meta.get('generatedAt', ''), 'count': len(notices.get('notices', [])),
               'source': meta.get('source', ''), 'published': datetime.now().strftime('%Y-%m-%d %H:%M')}
    cal = data_dir / 'calendar.js'
    if cal.is_file():
        c = load_marked_json(cal)
        _dump(data_dir / 'calendar.json', c)
        version['calendarGeneratedAt'] = c.get('generatedAt', '')
    # 용어집: 내용이 바뀔 때만 값이 바뀌는 짧은 표시(내용 해시)를 version.json 에 적는다 → 웹앱은 용어집이 바뀌었을 때만 다시 받는다
    gl = data_dir / 'glossary.js'
    if gl.is_file():
        try:
            g = load_marked_json(gl)
            _dump(data_dir / 'glossary.json', g)
            version['glossaryGeneratedAt'] = hashlib.md5(json.dumps(g, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()[:10]
        except (OSError, ValueError):
            pass                                    # 용어집이 이상해도 공지 게시는 계속
    # 구글 캘린더 구독용 일정 파일 (실패해도 나머지 게시는 계속)
    try:
        ics_feed.write_feed(data_dir)
    except (OSError, ValueError):
        pass
    _dump(data_dir / 'version.json', version)
    return version


def _git(root: Path, *args, run=subprocess.run):
    return run(['git', '-C', str(root), *args], capture_output=True, text=True, encoding='utf-8', timeout=120)


def publish_git(root: Path | None = None, run=subprocess.run) -> str:
    root = Path(root or ROOT)
    if not (root / '.git').exists():
        return 'git: 이 폴더는 git 저장소가 아닙니다 (README 의 "웹에 올리기" 순서대로 git init 과 GitHub 연결을 먼저 하세요)'
    files = [f'data/{f}' for f in FILES if (root / 'data' / f).is_file()]
    try:
        r = _git(root, 'add', '--', *files, run=run)
        if r.returncode:
            return f'git add 실패: {r.stderr.strip()[:200]}'
        if _git(root, 'diff', '--cached', '--quiet', '--', *files, run=run).returncode == 0:
            return 'git: 바뀐 데이터가 없어 올리지 않았습니다'
        msg = f"데이터 갱신 {datetime.now():%Y-%m-%d %H:%M}"
        r = _git(root, 'commit', '-m', msg, '--', *files, run=run)
        if r.returncode:
            return f'git commit 실패: {(r.stderr or r.stdout).strip()[:200]}'
        r = _git(root, 'push', run=run)
        if r.returncode:
            return f'git push 실패 (커밋은 되어 있음, 나중에 git push): {r.stderr.strip()[:200]}'
        return f'git: "{msg}" 커밋하고 push 했습니다'
    except (OSError, subprocess.SubprocessError) as e:
        return f'git 을 실행하지 못했습니다: {e}'


def publish_folder(folder: str, data_dir: Path | None = None) -> str:
    data_dir = Path(data_dir or DATA_DIR)
    dest = Path(folder)
    try:
        dest.mkdir(parents=True, exist_ok=True)
        n = 0
        for f in FILES:
            if (data_dir / f).is_file():
                shutil.copyfile(data_dir / f, dest / f)
                n += 1
        return f'폴더 {dest} 에 데이터 파일 {n}개를 복사했습니다'
    except OSError as e:
        return f'폴더 복사 실패: {e}'


def publish(settings: dict | None = None, data_dir: Path | None = None, root: Path | None = None) -> list[str]:
    settings = settings if settings is not None else cfg.load()
    notes = []
    try:
        v = write_json_mirrors(data_dir)
        notes.append(f"웹앱용 JSON 파일을 만들었습니다 (데이터 기준 {v['generatedAt']}, 공지 {v['count']}건)")
    except (OSError, ValueError) as e:
        return [f'JSON 파일을 만들지 못했습니다: {e}']
    pub = settings.get('publish', {}) or {}
    if pub.get('folder'):
        notes.append(publish_folder(pub['folder'], data_dir))
    if pub.get('git'):
        notes.append(publish_git(root))
    if not pub.get('folder') and not pub.get('git'):
        notes.append('올리는 곳이 정해져 있지 않아 이 컴퓨터의 data/ 에만 있습니다 (settings.json 의 publish 참고)')
    return notes


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description='공지 줍줍 데이터 게시')
    ap.add_argument('--json', action='store_true', help='JSON 파일만 만들고 올리지는 않음')
    a = ap.parse_args(argv)
    for line in (publish({'publish': {}}) if a.json else publish()):
        print('  ' + line)
    return 0


if __name__ == '__main__':
    sys.exit(main())
