# -*- coding: utf-8 -*-
"""공지 줍줍 수신 서버: 크롬 확장이 모은 자료를 받아 바로 처리까지 이어 주는 내 컴퓨터 전용 서버

run_server.bat 으로 켭니다 (setup_auto.bat 을 한 번 실행하면 로그인할 때마다 자동으로 켜짐).
  - POST /ingest?kind=notices|lectures|reference   확장이 보낸 JSON을 collected/ 에 kku-종류-시각.json 으로 저장하고,
                                                   1분 동안 더 오는 것이 없으면 파이프라인(run_all.py --auto)을 한 번 돌린다.
  - GET  /status                                    서버 상태: 켜짐, 처리 중인 단계·진행(공지 12/40), 웹 앱 데이터 건수·기준 시각
                                                   (확장 팝업이 보여 줌)
  - GET  /                                          웹 앱 미리보기 (index.html · css · js · data · icons 만)

안전장치
  - 127.0.0.1 에서만 받습니다 (같은 컴퓨터만 접속 가능).
  - 웹 페이지(http/https 주소)에서 오는 요청은 거절합니다. 크롬 확장(chrome-extension://)이나 Origin 이 없는 요청만 받습니다.
  - 받은 JSON은 모양(schema·kind·목록)을 확인하고, 너무 큰 요청(기본 200MB)은 거절합니다.
  - 파이프라인은 별도 프로세스로 돌려서 처리 중 오류가 나도 서버는 꺼지지 않습니다.

    python pipeline/receiver.py                 (기본 포트 8765)
    python pipeline/receiver.py --port 8770 --no-run
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import subprocess
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
VERSION = '1.1.0'
KINDS = ('notices', 'lectures', 'reference')
MAX_BYTES = 200 * 1024 * 1024
DEBOUNCE_SEC = 60
STATIC_DIRS = ('css', 'js', 'data', 'icons')
STATIC_FILES = ('index.html', 'sw.js', 'manifest.webmanifest')
STAGE_RE = re.compile(r'^=== *([\d-]+)\. *(.+?) *===')       # run_all.py 의 단계 제목
ITEM_RE = re.compile(r'^\[(\d+)/(\d+)\]')                      # build_notices.py 의 공지 한 건 처리 줄


def note(root: Path, text: str) -> None:
    """화면(창이 있을 때)과 logs/server-날짜.log 에 한 줄 남긴다 (로그인 때 창 없이 켜져도 기록이 남게)"""
    print(text)
    try:
        log_dir = Path(root) / 'logs'
        log_dir.mkdir(parents=True, exist_ok=True)
        with open(log_dir / f'server-{datetime.now():%Y-%m-%d}.log', 'a', encoding='utf-8') as f:
            f.write(text + '\n')
    except OSError:
        pass


# ------------------------------------------------------------------
# 받은 자료 확인 · 저장
# ------------------------------------------------------------------
def validate(kind: str, data) -> str | None:
    """잘못된 자료면 이유를, 괜찮으면 None 을 돌려준다"""
    if kind not in KINDS:
        return f'알 수 없는 종류: {kind}'
    if not isinstance(data, dict):
        return 'JSON 객체가 아닙니다'
    if kind == 'notices':
        notices = data.get('notices')
        if not isinstance(notices, list):
            return 'notices 목록이 없습니다'
        for n in notices[:50]:
            if not isinstance(n, dict) or not n.get('id') or not isinstance(n.get('subject', n.get('title', '')), str):
                return '공지 항목 모양이 맞지 않습니다'
    elif kind == 'lectures':
        if data.get('kind') != 'kku-lectures' or not isinstance(data.get('terms'), list):
            return '강의 시간표 모양이 맞지 않습니다'
    elif kind == 'reference':
        if data.get('kind') != 'kku-reference':
            return '학교 기본 정보 모양이 맞지 않습니다'
    return None


def save_export(kind: str, data: dict, folder: Path) -> Path:
    """collected/kku-종류-날짜-시각.json 으로 저장 (파이프라인의 find_exports 가 이 폴더에서 찾는다)"""
    folder.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime('%Y-%m-%d-%H%M%S')
    path = folder / f'kku-{kind}-{stamp}.json'
    i = 1
    while path.exists():
        path = folder / f'kku-{kind}-{stamp}-{i}.json'
        i += 1
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    tmp.replace(path)
    return path


def count_items(kind: str, data: dict) -> int:
    if kind == 'notices':
        return len(data.get('notices') or [])
    if kind == 'lectures':
        return sum(len(t.get('rows') or []) for t in data.get('terms') or [] if isinstance(t, dict))
    return len(data.get('calendar') or []) + len(data.get('rules') or [])


def origin_allowed(origin: str | None) -> bool:
    """웹 페이지가 내 컴퓨터 서버에 몰래 보내는 것을 막는다. 확장 또는 Origin 없는 요청(curl·파이썬)만 허용"""
    return not origin or origin.startswith('chrome-extension://')


# ------------------------------------------------------------------
# 파이프라인 실행기: 자료가 들어오면 잠깐 기다렸다가 한 번만 실행, 실행 중에 또 들어오면 끝난 뒤 한 번 더
# ------------------------------------------------------------------
class Runner:
    def __init__(self, root: Path, debounce: float = DEBOUNCE_SEC, command: list[str] | None = None, enabled: bool = True):
        self.root = Path(root)
        self.debounce = debounce
        # 자료가 들어올 때마다 도는 실행은 AI 시간을 20분으로 묶는다: 새 공지는 먼저 보이고, 남은 것은 다음 실행·매일 예약 실행이 마저 한다
        self.command = command or [sys.executable, str(self.root / 'pipeline' / 'run_all.py'), '--auto', '--max-minutes', '20']
        self.enabled = enabled
        self.lock = threading.Lock()
        self.timer: threading.Timer | None = None
        self.busy = False
        self.again = False
        self.last: dict | None = None
        self.runs = 0
        self.progress: dict | None = None      # 실행 중일 때 {'stage': 단계 이름, 'done': n, 'total': n}

    def request(self) -> None:
        if not self.enabled:
            return
        with self.lock:
            if self.busy:
                self.again = True
                return
            if self.timer:
                self.timer.cancel()
            self.timer = threading.Timer(self.debounce, self._run)
            self.timer.daemon = True
            self.timer.start()

    def _run(self) -> None:
        with self.lock:
            if self.busy:
                self.again = True
                return
            self.busy = True
            self.timer = None
        started = time.time()
        log_dir = self.root / 'logs'
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / f'server-{datetime.now():%Y-%m-%d}.log'
        code = None
        try:
            env = dict(os.environ, PYTHONUTF8='1', PYTHONIOENCODING='utf-8')
            env['PYTHONUNBUFFERED'] = '1'          # 진행 줄을 바로바로 읽기 위해
            with open(log_path, 'a', encoding='utf-8') as log:
                log.write(f'\n===== {datetime.now():%Y-%m-%d %H:%M:%S} 자료가 들어와 파이프라인 실행 =====\n')
                log.flush()
                # 창 없이 켜진 서버(pythonw)에서도 검은 창이 뜨지 않게
                flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
                with subprocess.Popen(self.command, cwd=str(self.root), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env,
                                      creationflags=flags, text=True, encoding='utf-8', errors='replace') as proc:
                    for line in proc.stdout:
                        log.write(line)
                        self._track(line)
                    code = proc.wait()
        except OSError as e:
            code = -1
            note(self.root, f'  파이프라인을 실행하지 못했습니다: {e}')
        finally:
            took = time.time() - started
            with self.lock:
                self.busy = False
                self.progress = None
                self.runs += 1
                self.last = {'at': datetime.now().strftime('%Y-%m-%d %H:%M'), 'code': code, 'seconds': round(took, 1), 'log': log_path.name}
                again, self.again = self.again, False
            note(self.root, f'  파이프라인 {"완료" if code == 0 else f"종료 코드 {code}"} ({took / 60:.1f}분)')
            if again:
                self.request()

    def _track(self, line: str) -> None:
        """파이프라인 출력 한 줄에서 지금 단계와 공지 처리 진행을 읽어 둔다 (팝업의 'AI 정리 중 12/40' 표시용)"""
        line = line.strip()
        m = STAGE_RE.match(line)
        if m:
            with self.lock:
                self.progress = {'stage': m[2], 'done': 0, 'total': 0}
            return
        m = ITEM_RE.match(line)
        if m:
            with self.lock:
                cur = self.progress or {'stage': ''}
                self.progress = {**cur, 'done': int(m[1]), 'total': int(m[2])}

    def status(self) -> dict:
        with self.lock:
            return {'busy': self.busy, 'waiting': self.timer is not None, 'last': self.last, 'runs': self.runs,
                    'progress': dict(self.progress) if (self.busy and self.progress) else None}


def data_info(root: Path) -> dict | None:
    """웹 앱 데이터(data/version.json)의 공지 건수와 기준 시각"""
    try:
        v = json.loads((Path(root) / 'data' / 'version.json').read_text(encoding='utf-8'))
        return {'count': int(v.get('count') or 0), 'generatedAt': str(v.get('generatedAt') or '')}
    except (OSError, ValueError, TypeError):
        return None


# ------------------------------------------------------------------
# HTTP
# ------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = 'GongjiReceiver/' + VERSION
    # 아래 셋은 make_server 가 채운다
    root: Path = ROOT
    inbox: Path = ROOT / 'collected'
    runner: Runner | None = None
    received: list = []

    def log_message(self, fmt, *args):          # 기본 접속 기록은 끄고 필요한 것만 직접 출력
        pass

    # --- 공통 ---
    def _cors(self) -> None:
        origin = self.headers.get('Origin')
        if origin and origin.startswith('chrome-extension://'):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')

    def _json(self, code: int, obj) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if not origin_allowed(self.headers.get('Origin')):
            self._json(403, {'ok': False, 'error': '허용되지 않은 출처'})
            return
        self.send_response(204)
        self._cors()
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Gongji-Collector')
        self.send_header('Access-Control-Max-Age', '600')
        self.end_headers()

    # --- 받기 ---
    def do_POST(self):
        url = urlparse(self.path)
        if url.path != '/ingest':
            self._json(404, {'ok': False, 'error': '없는 주소'})
            return
        if not origin_allowed(self.headers.get('Origin')):
            self._json(403, {'ok': False, 'error': '웹 페이지에서 보낸 요청은 받지 않습니다'})
            return
        kind = (parse_qs(url.query).get('kind') or [''])[0]
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        if length <= 0:
            self._json(411, {'ok': False, 'error': '내용이 없습니다'})
            return
        if length > MAX_BYTES:
            self._json(413, {'ok': False, 'error': f'너무 큽니다 ({length // 1048576}MB)'})
            return
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode('utf-8-sig'))
        except (UnicodeDecodeError, ValueError):
            self._json(400, {'ok': False, 'error': 'JSON 을 읽지 못했습니다'})
            return
        why = validate(kind, data)
        if why:
            self._json(400, {'ok': False, 'error': why})
            return
        path = save_export(kind, data, self.inbox)
        n = count_items(kind, data)
        rec = {'at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'), 'kind': kind, 'count': n, 'file': path.name}
        self.received.append(rec)
        del self.received[:-20]
        note(self.root, f'[{rec["at"]}] 받음: {kind} {n}건 → collected/{path.name}')
        if self.runner:
            self.runner.request()
        self._json(200, {'ok': True, 'saved': path.name, 'count': n, 'queued': bool(self.runner and self.runner.enabled)})

    # --- 상태 · 웹 앱 미리보기 ---
    def do_GET(self):
        url = urlparse(self.path)
        if url.path == '/status':
            st = self.runner.status() if self.runner else {'busy': False, 'waiting': False, 'last': None, 'runs': 0, 'progress': None}
            self._json(200, {'ok': True, 'app': 'gongji-jupjup', 'version': VERSION, **st, 'received': self.received[-5:],
                             'data': data_info(self.root)})
            return
        self._static(url.path)

    def _static(self, path: str) -> None:
        rel = unquote(path).lstrip('/') or 'index.html'
        parts = Path(rel).parts
        allowed = rel in STATIC_FILES or (len(parts) > 1 and parts[0] in STATIC_DIRS)
        target = (self.root / rel).resolve()
        if not allowed or '..' in parts or self.root.resolve() not in target.parents or not target.is_file():
            self._json(404, {'ok': False, 'error': '없는 파일'})
            return
        body = target.read_bytes()
        ctype = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
        if target.suffix in ('.js', '.css', '.html', '.json', '.webmanifest', '.ics'):
            ctype = {'.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.ics': 'text/calendar'}.get(target.suffix, ctype) + '; charset=utf-8'
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)


def make_server(port: int = 8765, root: Path | None = None, runner: Runner | None = None, inbox: Path | None = None) -> ThreadingHTTPServer:
    root = Path(root or ROOT)
    handler = type('BoundHandler', (Handler,), {
        'root': root, 'inbox': Path(inbox or root / 'collected'), 'runner': runner, 'received': []
    })
    return ThreadingHTTPServer(('127.0.0.1', port), handler)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description='크롬 확장이 모은 자료를 받아 파이프라인까지 자동으로 이어 주는 내 컴퓨터 서버')
    ap.add_argument('--port', type=int, default=int(os.environ.get('GONGJI_PORT', 8765)))
    ap.add_argument('--no-run', action='store_true', help='받기만 하고 파이프라인은 돌리지 않음')
    ap.add_argument('--wait', type=int, default=DEBOUNCE_SEC, help='자료가 들어온 뒤 파이프라인을 돌리기까지 기다리는 시간(초)')
    args = ap.parse_args(argv)
    runner = Runner(ROOT, debounce=args.wait, enabled=not args.no_run)
    try:
        httpd = make_server(args.port, ROOT, runner)
    except OSError as e:
        print(f'포트 {args.port} 을(를) 열지 못했습니다. 서버가 이미 켜져 있는지 확인하세요. ({e})')
        return 1
    print(f'공지 줍줍 수신 서버 {VERSION}: http://127.0.0.1:{args.port}')
    print(f'  웹 앱 미리보기: http://127.0.0.1:{args.port}/   ·   끄려면 이 창을 닫거나 Ctrl+C')
    print('  크롬 확장이 자료를 보내면 1분 뒤 공지 처리가 자동으로 시작됩니다.' if runner.enabled else '  받기만 합니다 (--no-run).')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
