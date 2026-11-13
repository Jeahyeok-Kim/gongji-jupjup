# -*- coding: utf-8 -*-
"""보정표를 '수정할 수 있는 문서'에서 가져오기: 구글 문서(docx) · 구글 드라이브 파일 · 구글 시트 · 깃허브 CSV · 내 컴퓨터 파일

공지에서 AI가 잘못 읽은 마감일·금액을 고치거나, 지난 공지를 숨기거나, 긴급 안내를 띄우고 싶을 때
구글 문서(또는 docx)의 표에 한 줄씩 적어 두면 파이프라인이 받아서 data/overrides.json 으로 게시하고, 웹앱이 그걸 읽어 공지에 덮어쓴다.

왜 파이프라인이 받아 오나?
  브라우저(웹앱)는 구글 문서를 직접 읽을 수 없다 (구글이 다른 사이트의 읽기를 막는 CORS 규칙 때문).
  그래서 이 컴퓨터에서 도는 파이프라인이 대신 받아 와서 data/overrides.json 으로 바꿔 올린다.
  (구글 시트와 깃허브 CSV 는 브라우저가 직접 읽을 수 있어서 data/config.js 의 overridesUrl 에 적어도 된다.)

표 한 줄 = [대상, 항목, 값, 메모]
  대상  공지 id 또는 제목의 일부 (긴급 안내는 비워 둠)
  항목  마감 · 포인트 · 금액 · 혜택 · 메모 · 숨김 · 중요 · 알림
  '#' 으로 시작하는 줄은 설명(무시)

settings.json 의  "remote": {"overrides": "<주소 또는 파일 경로>"}  에 적는다.
  구글 문서  공유 → '링크가 있는 모든 사용자 - 뷰어' → 주소 복사
  구글 드라이브 데스크톱 앱을 쓰면 동기화된 폴더의 docx 경로를 그대로 적어도 된다 (예: G:\\내 드라이브\\보정표.docx)

  python pipeline/remote.py                  settings.json 의 주소로 가져와서 data/overrides.json 만들기
  python pipeline/remote.py --url <주소>     주소를 직접 지정해서 시험
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import urllib.error
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parent))
import settings as cfg  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'data'
MAX_BYTES = 2 * 1024 * 1024          # 보정표가 이보다 크면 잘못된 파일로 본다
MAX_ROWS = 2000
MAX_CELL = 500
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
UA = 'Mozilla/5.0 (compatible; gongji-jupjup-pipeline)'


class RemoteError(Exception):
    """사람이 읽을 수 있는 설명이 들어 있는 실패"""


# ---------------------------------------------------------------
# 1. 주소 바꾸기: 편집용 주소 → 받을 수 있는 주소들 (앞에서부터 시도)
# ---------------------------------------------------------------
def to_candidates(source: str) -> tuple[str, list[str]]:
    """(종류, 시도할 주소 목록).  종류: file · gdoc · gdrive · sheet · github · other"""
    src = str(source or '').strip().strip('"')
    if not src:
        return 'none', []
    if not re.match(r'^https?://', src, re.I):
        return 'file', [src]
    m = re.match(r'^https?://docs\.google\.com/document/d/([\w-]+)', src, re.I)
    if m:
        i = m.group(1)
        # 구글 문서로 만든 문서는 export 로, 드라이브에 올린 .docx 를 문서에서 연 경우는 드라이브 내려받기로 받는다
        return 'gdoc', [f'https://docs.google.com/document/d/{i}/export?format=docx',
                        f'https://drive.google.com/uc?export=download&id={i}']
    m = re.match(r'^https?://drive\.google\.com/file/d/([\w-]+)', src, re.I) or re.match(r'^https?://drive\.google\.com/(?:open|uc)\?(?:[^#]*&)?id=([\w-]+)', src, re.I)
    if m:
        return 'gdrive', [f'https://drive.google.com/uc?export=download&id={m.group(1)}']
    m = re.match(r'^https?://docs\.google\.com/spreadsheets/d/e/[\w-]+/pub', src, re.I)
    if m:
        return 'sheet', [src if re.search(r'[?&]output=', src) else src + ('&' if '?' in src else '?') + 'output=csv']
    m = re.match(r'^https?://docs\.google\.com/spreadsheets/d/([\w-]+)', src, re.I)
    if m:
        gid = (re.search(r'[?#&]gid=(\d+)', src) or [None, '0'])[1]
        return 'sheet', [f'https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=csv&gid={gid}']
    m = re.match(r'^https?://github\.com/([^/]+)/([^/]+)/blob/(.+)$', src, re.I)
    if m:
        return 'github', [f'https://raw.githubusercontent.com/{m.group(1)}/{m.group(2)}/{m.group(3).split("?")[0]}']
    return ('github' if re.search(r'raw\.githubusercontent\.com', src, re.I) else 'other'), [src]


# ---------------------------------------------------------------
# 2. 받기
# ---------------------------------------------------------------
def http_get(url: str, timeout: float = 20) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read(MAX_BYTES + 1)
    except urllib.error.HTTPError as e:
        raise RemoteError(f'HTTP {e.code}') from e
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise RemoteError(f'연결 실패: {getattr(e, "reason", e)}') from e
    if len(data) > MAX_BYTES:
        raise RemoteError('파일이 너무 커요 (보정표는 2MB 이하여야 해요)')
    return data


def read_source(source: str, get=http_get) -> tuple[str, bytes]:
    """주소/경로에서 내용을 받아 (종류, 바이트)로 돌려준다. 후보 주소를 차례로 시도한다."""
    kind, cands = to_candidates(source)
    if kind == 'none':
        raise RemoteError('주소가 비어 있어요')
    if kind == 'file':
        p = Path(cands[0]).expanduser()
        try:
            data = p.read_bytes()
        except OSError as e:
            raise RemoteError(f'파일을 읽지 못했어요: {p} ({e.strerror or e})') from e
        if len(data) > MAX_BYTES:
            raise RemoteError('파일이 너무 커요 (보정표는 2MB 이하여야 해요)')
        return 'file', data
    last = ''
    for url in cands:
        try:
            data = get(url)
        except RemoteError as e:
            last = str(e)
            continue
        if re.match(rb'^\s*<', data[:50]):
            # 로그인 화면·권한 없음 화면 (HTML) → 공유 설정 문제
            last = 'html'
            continue
        return kind, data
    if last == 'html' or last.startswith('HTTP 40') or last.startswith('HTTP 302'):
        raise RemoteError("문서를 열 수 없어요. 공유 설정을 '링크가 있는 모든 사용자 - 뷰어' 이상으로 바꿨는지 확인해 주세요")
    raise RemoteError(last or '받지 못했어요')


# ---------------------------------------------------------------
# 3. 읽기: docx 표 / CSV / JSON → 줄(rows)
# ---------------------------------------------------------------
def _cell_text(tc) -> str:
    """표 칸 하나의 글자.  문단은 줄바꿈으로, 칸 안의 줄바꿈(Shift+Enter)도 줄바꿈으로 읽는다."""
    paras = []
    for p in tc.findall(W + 'p'):                  # 칸 바로 아래의 문단만 (겹친 표 안의 글자는 제외)
        buf = []
        for n in p.iter():
            if n.tag == W + 't':
                buf.append(n.text or '')
            elif n.tag in (W + 'br', W + 'cr'):
                buf.append('\n')
            elif n.tag == W + 'tab':
                buf.append('\t')
        paras.append(''.join(buf))
    return '\n'.join(paras).strip()


def docx_tables(data: bytes) -> list[list[list[str]]]:
    """docx 안의 표들 → [표][줄][칸].  다른 표 안에 들어 있는 표(겹친 표)는 무시한다."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            if 'word/document.xml' not in z.namelist():
                raise RemoteError('docx 파일이 아니에요')
            if z.getinfo('word/document.xml').file_size > 20 * 1024 * 1024:
                raise RemoteError('문서가 너무 커요')
            root = ET.fromstring(z.read('word/document.xml'))
    except zipfile.BadZipFile as e:
        raise RemoteError('docx 파일이 아니에요') from e
    except ET.ParseError as e:
        raise RemoteError('docx 안의 내용을 읽지 못했어요') from e
    all_tbl = list(root.iter(W + 'tbl'))
    nested = {id(inner) for outer in all_tbl for inner in outer.iter(W + 'tbl') if inner is not outer}
    return [[[_cell_text(tc) for tc in tr.findall(W + 'tc')] for tr in tbl.findall(W + 'tr')]
            for tbl in all_tbl if id(tbl) not in nested]


def _is_header(row: list[str]) -> bool:
    return len(row) > 1 and bool(re.match(r'^(항목|field)$', row[1].strip(), re.I))


def docx_rows(data: bytes) -> list[list[str]]:
    """보정표 표의 줄들.  머리줄(대상·항목·값)이 있는 표만 쓴다. 머리줄이 있는 표가 하나도 없으면 모든 표를 쓴다."""
    tables = docx_tables(data)
    marked = [t for t in tables if any(_is_header(r) for r in t)]
    use = marked or tables
    return [r for t in use for r in t]


def text_rows(data: bytes) -> list[list[str]]:
    for enc in ('utf-8-sig', 'cp949'):
        try:
            text = data.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise RemoteError('글자 인코딩을 알 수 없어요 (UTF-8 로 저장해 주세요)')
    s = text.lstrip()
    if s.startswith('{'):
        j = json.loads(s)
        if not isinstance(j, dict) or not isinstance(j.get('rows'), list):
            raise RemoteError('JSON 에 rows 목록이 없어요')
        return [[str(c) for c in r] for r in j['rows'] if isinstance(r, list)]
    dialect = csv.excel_tab if text.count('\t') > text.count(',') else csv.excel
    return [row for row in csv.reader(io.StringIO(text), dialect)]


def parse_rows(data: bytes) -> list[list[str]]:
    """바이트 내용을 보고 docx / JSON / CSV 를 알아서 읽는다"""
    rows = docx_rows(data) if data[:4] == b'PK\x03\x04' else text_rows(data)
    out = []
    for r in rows:
        cells = [str(c).strip()[:MAX_CELL] for c in r][:4]
        cells += [''] * (4 - len(cells))
        if any(cells):
            out.append(cells)
    if len(out) > MAX_ROWS:
        raise RemoteError(f'줄이 너무 많아요 ({len(out)}줄, 최대 {MAX_ROWS}줄)')
    return out


# ---------------------------------------------------------------
# 4. 게시: data/overrides.json
# ---------------------------------------------------------------
def _load_existing(path: Path) -> dict | None:
    try:
        j = json.loads(path.read_text(encoding='utf-8'))
        return j if isinstance(j, dict) and isinstance(j.get('rows'), list) else None
    except (OSError, ValueError):
        return None


def sync_overrides(settings: dict | None = None, data_dir: Path | None = None, get=http_get, source: str | None = None) -> str | None:
    """보정표를 가져와 data/overrides.json 에 쓴다.  하는 일이 없으면 None, 있으면 사람이 읽을 안내 한 줄.

    - 주소가 없으면: 아무것도 하지 않는다 (손으로 만든 overrides.json 이 있으면 그대로 둠)
    - 받기에 실패하면: 이전에 받아 둔 보정표를 그대로 둔다 (한 번 실패했다고 보정이 사라지지 않게)
    - 내용이 그대로면: 파일을 다시 쓰지 않는다 (깃에 불필요한 변경이 생기지 않음)
    """
    settings = settings if settings is not None else cfg.load()
    src = source if source is not None else ((settings.get('remote') or {}).get('overrides') or '')
    if not str(src).strip():
        return None
    data_dir = Path(data_dir or DATA_DIR)
    path = data_dir / 'overrides.json'
    old = _load_existing(path)
    try:
        kind, raw = read_source(src, get)
        rows = parse_rows(raw)
    except RemoteError as e:
        keep = '이전에 받아 둔 보정표를 계속 씁니다' if old else '보정표 없이 진행합니다'
        return f'보정표를 가져오지 못했어요 ({e}) → {keep}'
    except ValueError as e:
        return f'보정표를 읽지 못했어요 ({e}) → ' + ('이전에 받아 둔 보정표를 계속 씁니다' if old else '보정표 없이 진행합니다')
    n_rules = sum(1 for r in rows if r[0] and not r[0].startswith('#') and not _is_header(r)) + \
        sum(1 for r in rows if not r[0] and r[1] in ('알림', 'banner') and r[2])
    if old and old.get('rows') == rows:
        return f'보정표 {n_rules}건 (바뀐 내용 없음)'
    doc = {'fetchedAt': datetime.now().strftime('%Y-%m-%d %H:%M'), 'source': kind, 'rows': rows}
    data_dir.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tmp.replace(path)
    label = {'gdoc': '구글 문서', 'gdrive': '구글 드라이브 파일', 'sheet': '구글 시트', 'github': '깃허브', 'file': '내 컴퓨터 파일'}.get(kind, '주소')
    return f'보정표 {n_rules}건을 {label}에서 가져왔습니다'


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description='공지 줍줍 보정표 가져오기')
    ap.add_argument('--url', help='주소나 파일 경로를 직접 지정 (없으면 settings.json 의 remote.overrides)')
    a = ap.parse_args(argv)
    msg = sync_overrides(source=a.url)
    print('  ' + (msg or "보정표 주소가 정해져 있지 않습니다 (settings.json 의 remote.overrides 에 구글 문서 주소를 적으세요)"))
    return 1 if msg and msg.startswith('보정표를 가져오지 못했') else 0


if __name__ == '__main__':
    sys.exit(main())
