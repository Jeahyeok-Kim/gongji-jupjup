# -*- coding: utf-8 -*-
"""공지의 포스터 이미지와 첨부파일 읽기

본문이 이미지뿐이거나 내용이 첨부파일에만 있는 공지가 많다(외부행사·공모전 게시판은 거의 전부 포스터).
1) 이미지·첨부파일을 내 PC로 내려받는다 (pipeline/media/<공지 id>/ 에 보관, 두 번째부터는 다시 받지 않음)
2) 첨부파일에서 글자를 꺼낸다: hwpx·docx 는 표준 라이브러리로, pdf 는 pypdf, hwp 는 olefile 이 설치돼 있으면
3) 이미지는 이미지를 읽는 로컬 AI(Ollama의 비전 모델, 기본 qwen2.5vl:7b)가 적힌 글자를 그대로 옮겨 적는다
꺼낸 글은 본문 대신(또는 본문 뒤에) 들어가 기존 해독 과정을 그대로 거친다.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import urllib.parse
import urllib.request
import zipfile
import zlib
from pathlib import Path
from xml.etree import ElementTree as ET

MEDIA_DIR = Path(__file__).resolve().parent / 'media'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
MAX_BYTES = 30 * 1024 * 1024        # 30MB 넘는 파일은 받지 않음
IMAGE_EXT = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp')
TEXT_EXT = ('.hwpx', '.hwp', '.docx', '.pdf', '.xlsx', '.pptx', '.txt', '.zip')

OCR_SYSTEM = """너는 대학 공지 포스터의 글자를 옮겨 적는 도우미다.
- 이미지에 적힌 글자를 위에서 아래로, 왼쪽에서 오른쪽으로 빠짐없이 그대로 옮겨 적는다.
- 한 줄에 적힌 글은 한 줄로 쓰고, 표는 한 행을 한 줄로 쓰며 칸 사이에 ' | ' 를 넣는다.
- 날짜·시각·금액·전화번호·주소는 보이는 그대로 쓴다. 읽기 어려운 글자는 추측하지 말고 빼 둔다.
- 그림 설명이나 내 의견은 쓰지 않는다. 글자가 하나도 없으면 아무것도 쓰지 않는다."""


# ------------------------------------------------------------------
# 내려받기
# ------------------------------------------------------------------
def _load_json(path: Path) -> dict:
    """저장해 둔 JSON. 없거나 깨져 있으면(쓰는 도중 끊긴 경우) 빈 것으로 보고 다시 만든다."""
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _save_json(path: Path, data: dict) -> None:
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(scrub(json.dumps(data, ensure_ascii=False, indent=1)), encoding='utf-8')
    tmp.replace(path)


def _safe(name: str) -> str:
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', '_', name or '').strip(' .')
    return name[:120] or 'file'


def file_list(raw: dict) -> list[dict]:
    """수집 기록의 첨부파일 목록. 예전 확장(v0.1)으로 모은 기록은 게시판·글 번호로 주소를 만든다."""
    if raw.get('files'):
        return [f for f in raw['files'] if isinstance(f, dict) and f.get('url')]
    n = int(raw.get('fileCnt') or 0)
    host, site, board, seq = raw.get('host'), raw.get('site'), raw.get('board'), raw.get('bbsSeq')
    if not (n and host and site and board and seq):
        return []
    return [{'seq': i + 1, 'name': raw.get('fileName') if i == 0 else None,
             'url': f'https://{host}/ajaxFile/FR_SVC/FileDown.do?BOARD_SEQ={board}&SITE_NO={site}&BBS_SEQ={seq}&FILE_SEQ={i + 1}'}
            for i in range(min(n, 10))]


def _filename_from_headers(headers, fallback: str) -> str:
    cd = headers.get('Content-Disposition') or headers.get('content-disposition') or ''
    m = re.search(r"filename\*=(?:UTF-8'')?([^;]+)", cd, re.I) or re.search(r'filename="?([^";]+)"?', cd, re.I)
    if m:
        name = urllib.parse.unquote(m[1].strip())
        try:   # 서버가 UTF-8 바이트를 latin-1 로 보낸 경우
            name = name.encode('latin-1').decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
        return _safe(name)
    return _safe(fallback)


def download(url: str, folder: Path, fallback_name: str, timeout: int = 60) -> Path | None:
    """주소에서 파일을 받아 folder 에 저장. 이미 받은 파일이 있으면 그 파일을 돌려준다."""
    folder.mkdir(parents=True, exist_ok=True)
    index = folder / 'index.json'
    known = _load_json(index)
    if url in known and (folder / known[url]).exists():
        return folder / known[url]
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': url.split('/ajax')[0] + '/'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            return None
        if b'\xec\x9b\xb9\xeb\xb0\xa9\xed\x99\x94\xeb\xb2\xbd' in data[:5000]:     # '웹방화벽' 차단 화면
            raise OSError('학교 웹방화벽이 막았습니다')
        name = _filename_from_headers(r.headers, fallback_name)
    if not Path(name).suffix:
        name += _guess_ext(data)
    path = folder / name
    i = 1
    while path.exists():
        path = folder / f'{Path(name).stem}_{i}{Path(name).suffix}'
        i += 1
    path.write_bytes(data)
    known[url] = path.name
    _save_json(index, known)
    return path


def _guess_ext(data: bytes) -> str:
    sigs = [(b'\x89PNG', '.png'), (b'\xff\xd8', '.jpg'), (b'GIF8', '.gif'), (b'%PDF', '.pdf'),
            (b'\xd0\xcf\x11\xe0', '.hwp'), (b'PK\x03\x04', '.zip'), (b'RIFF', '.webp')]
    for sig, ext in sigs:
        if data.startswith(sig):
            return ext
    return ''


# ------------------------------------------------------------------
# 첨부파일에서 글자 꺼내기
# ------------------------------------------------------------------
def _xml_paragraphs(xml: bytes, para_tag: str, text_tag: str) -> list[str]:
    root = ET.fromstring(xml)
    out = []
    for p in root.iter():
        if p.tag.endswith('}' + para_tag):
            t = ''.join((x.text or '') for x in p.iter() if x.tag.endswith('}' + text_tag))
            if t.strip():
                out.append(t.strip())
    return out


def text_hwpx(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        names = sorted((n for n in z.namelist() if re.match(r'Contents/section\d+\.xml$', n)),
                       key=lambda n: int(re.findall(r'\d+', n)[-1]))
        lines = []
        for n in names:
            lines += _xml_paragraphs(z.read(n), 'p', 't')
    return '\n'.join(lines)


def text_docx(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        return '\n'.join(_xml_paragraphs(z.read('word/document.xml'), 'p', 't'))


def text_xlsx(path: Path) -> str:
    """엑셀: 공유 문자열 + 각 시트의 칸 값을 행 단위로"""
    with zipfile.ZipFile(path) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            root = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root:
                shared.append(''.join(t.text or '' for t in si.iter() if t.tag.endswith('}t')))
        lines = []
        for n in sorted(x for x in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$', x)):
            root = ET.fromstring(z.read(n))
            for row in (r for r in root.iter() if r.tag.endswith('}row')):
                cells = []
                for c in (c for c in row if c.tag.endswith('}c')):
                    v = next((x.text for x in c.iter() if x.tag.endswith('}v') or x.tag.endswith('}t')), None)
                    if v is None:
                        continue
                    if c.get('t') == 's' and v.isdigit() and int(v) < len(shared):
                        v = shared[int(v)]
                    cells.append(v.strip())
                if any(cells):
                    lines.append(' | '.join(cells))
    return '\n'.join(lines)


def text_pptx(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        slides = sorted((n for n in z.namelist() if re.match(r'ppt/slides/slide\d+\.xml$', n)),
                        key=lambda n: int(re.findall(r'\d+', n)[-1]))
        lines = []
        for n in slides:
            lines += _xml_paragraphs(z.read(n), 'p', 't')
    return '\n'.join(lines)


def text_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader      # pip install pypdf
    except ImportError:
        raise RuntimeError('pdf 를 읽으려면 pypdf 가 필요합니다:  pip install pypdf')
    reader = PdfReader(str(path))
    return '\n'.join((page.extract_text() or '') for page in reader.pages[:20])


def pdf_images(path: Path, folder: Path, limit: int = 6) -> list[Path]:
    """글자가 없는(스캔한) pdf 에서 쪽마다 들어 있는 이미지를 꺼낸다 → 비전 모델로 읽기"""
    try:
        from pypdf import PdfReader
    except ImportError:
        return []
    out = []
    for pi, page in enumerate(PdfReader(str(path)).pages[:limit]):
        try:
            imgs = list(page.images)
        except Exception:
            continue
        for ii, im in enumerate(imgs[:2]):
            ext = Path(im.name).suffix.lower() or '.png'
            if ext not in IMAGE_EXT:
                continue
            p = folder / f'{path.stem}_p{pi + 1}_{ii + 1}{ext}'
            if not p.exists():
                p.write_bytes(im.data)
            out.append(p)
    return out[:limit]


def unzip_files(path: Path, folder: Path, limit: int = 8) -> list[Path]:
    """zip 안의 문서·이미지를 꺼낸다 (한글 파일 이름은 cp949 로 들어 있는 경우가 많음)"""
    out = []
    target = folder / (path.stem + '_zip')
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            if info.is_dir() or info.file_size > MAX_BYTES:
                continue
            name = info.filename
            if not info.flag_bits & 0x800:
                try:
                    name = name.encode('cp437').decode('cp949')
                except (UnicodeEncodeError, UnicodeDecodeError):
                    pass
            name = _safe(Path(name).name)
            if Path(name).suffix.lower() not in TEXT_EXT + IMAGE_EXT or name.lower().endswith('.zip'):
                continue
            target.mkdir(parents=True, exist_ok=True)
            p = target / name
            if not p.exists():
                p.write_bytes(z.read(info))
            out.append(p)
            if len(out) >= limit:
                break
    return out


_LONE_SURROGATE = re.compile('[\ud800-\udfff]')


def scrub(text: str) -> str:
    """UTF-16 서로게이트 쌍(이모지 등)은 한 글자로 합치고, 짝 없는 서로게이트는 지운다 (파일에 쓸 때 오류 방지)."""
    try:
        text = text.encode('utf-16', 'surrogatepass').decode('utf-16', 'replace')
    except UnicodeError:
        pass
    return _LONE_SURROGATE.sub('', text).replace('\ufffd', '')


def _hwp_para_text(rec: bytes) -> str:
    """HWP 문단 글자 레코드(UTF-16LE). 0~31 사이 제어 문자는 종류에 따라 1칸 또는 8칸을 차지한다."""
    out, i, n = [], 0, len(rec) // 2
    while i < n:
        c = int.from_bytes(rec[2 * i:2 * i + 2], 'little')
        if c < 32:
            if c in (10, 13):
                out.append('\n')
                i += 1
            elif c == 9:
                out.append('\t')
                i += 8
            elif c in (0, 24, 25, 26, 27, 28, 29, 30, 31):
                i += 1
            else:
                i += 8
            continue
        out.append(chr(c))
        i += 1
    return scrub(''.join(out))


def text_hwp(path: Path) -> str:
    try:
        import olefile                   # pip install olefile
    except ImportError:
        raise RuntimeError('hwp 를 읽으려면 olefile 이 필요합니다:  pip install olefile')
    with olefile.OleFileIO(str(path)) as ole:
        header = ole.openstream('FileHeader').read()
        compressed = bool(header[36] & 1)
        if header[36] & 2:
            raise RuntimeError('암호가 걸린 hwp 입니다')
        sections = sorted((e for e in ole.listdir() if len(e) == 2 and e[0] == 'BodyText'),
                          key=lambda e: int(re.findall(r'\d+', e[1])[0]))
        lines = []
        for e in sections:
            data = ole.openstream(e).read()
            if compressed:
                data = zlib.decompress(data, -15)
            i = 0
            while i + 4 <= len(data):
                h = int.from_bytes(data[i:i + 4], 'little')
                tag, size = h & 0x3FF, (h >> 20) & 0xFFF
                i += 4
                if size == 0xFFF:
                    size = int.from_bytes(data[i:i + 4], 'little')
                    i += 4
                if tag == 67:           # HWPTAG_PARA_TEXT
                    t = _hwp_para_text(data[i:i + size]).strip()
                    if t:
                        lines.append(t)
                i += size
    return '\n'.join(lines)


def attachment_text(path: Path) -> str:
    ext = path.suffix.lower()
    head = path.read_bytes()[:8]
    real = _guess_ext(head)
    if path.stat().st_size < 300 and not real:
        return ''                # 학교가 첨부 대신 올려 둔 짧은 안내문("This attachment …"): 읽을 내용이 없음
    if real == '.hwp' and ext in ('.hwpx', '.docx', '.xlsx', '.pptx'):
        ext = '.hwp'            # 이름은 hwpx 인데 실제로는 예전 hwp 형식
    elif real == '.pdf':
        ext = '.pdf'
    elif ext == '.hwp' and real == '.zip':
        ext = '.hwpx'
    if ext == '.hwpx':
        return text_hwpx(path)
    if ext == '.docx':
        return text_docx(path)
    if ext == '.pdf':
        return text_pdf(path)
    if ext == '.hwp':
        return text_hwp(path)
    if ext == '.xlsx':
        return text_xlsx(path)
    if ext == '.pptx':
        return text_pptx(path)
    if ext == '.txt':
        return path.read_text(encoding='utf-8', errors='replace')
    return ''


def tidy(text: str, limit: int = 6000) -> str:
    lines = [re.sub(r'[ \t ]+', ' ', l).strip() for l in scrub(text or '').splitlines()]
    out, prev = [], None
    for l in lines:
        if l and l != prev:
            out.append(l)
        prev = l
    return '\n'.join(out)[:limit]


# ------------------------------------------------------------------
# 이미지 글자 읽기 (비전 모델)
# ------------------------------------------------------------------
def image_tiles(path: Path, max_ratio: float = 1.6) -> list[bytes]:
    """세로로 아주 긴 포스터는 겹치게 잘라서 읽는다(작은 글자가 뭉개지지 않게). Pillow 가 없으면 통째로."""
    data = path.read_bytes()
    try:
        from PIL import Image            # pip install pillow (선택)
    except ImportError:
        return [data]
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception:
        return [data]
    w, h = im.size
    if h <= w * max_ratio:
        return [data]
    step, size = int(w * 1.1), int(w * 1.3)
    tiles = []
    for top in range(0, h, step):
        box = im.crop((0, top, w, min(top + size, h))).convert('RGB')
        buf = io.BytesIO()
        box.save(buf, 'PNG')
        tiles.append(buf.getvalue())
        if top + size >= h:
            break
    return tiles[:8]


def is_tiny_image(path: Path) -> bool:
    """버튼·아이콘·구분선처럼 작은 이미지: 파일이 12KB 미만이거나, 가로 200px·세로 120px 미만"""
    try:
        if path.stat().st_size < 12 * 1024:
            return True
        from PIL import Image
        with Image.open(path) as im:
            w, h = im.size
        return w < 200 or h < 120
    except ImportError:
        return False
    except Exception:
        return False


def ocr_image(ai, path: Path) -> str:
    """ai: gongji_pipeline.Ollama (비전 모델). 이미지(조각)마다 글자를 옮겨 적게 하고 이어 붙인다."""
    parts = []
    for tile in image_tiles(path):
        b64 = base64.b64encode(tile).decode('ascii')
        parts.append(ai.chat_text(OCR_SYSTEM, '이 이미지에 적힌 글자를 그대로 옮겨 적어 줘.', images=[b64]).strip())
    return '\n'.join(p for p in parts if p)


def file_hash(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()[:16]


# ------------------------------------------------------------------
# 공지 1건: 이미지·첨부를 받아 글로 (결과는 media/<id>/read.json 에 저장해 두고 다시 쓰기)
# ------------------------------------------------------------------
def read_notice_media(raw: dict, vision=None, want_images: bool = True, want_files: bool = True,
                      log=print) -> dict:
    """돌려주는 값: {'text': 합친 글, 'sources': [{'kind': 'poster'|'file', 'name', 'chars'}], 'errors': [...]}
    vision: 이미지를 읽을 Ollama 클라이언트(없으면 이미지는 건너뜀)"""
    folder = MEDIA_DIR / _safe(str(raw.get('id')))
    folder.mkdir(parents=True, exist_ok=True)
    memo_path = folder / 'read.json'
    memo = _load_json(memo_path)
    vkey = getattr(vision, 'model', None)
    texts, sources, errors = [], [], []
    seen_text: set[str] = set()

    def remember():
        _save_json(memo_path, memo)

    def read_image(p: Path, label: str):
        if is_tiny_image(p):
            return
        key = f'img:{p.name}:{file_hash(p)}:{vkey}'
        if key not in memo:
            if not vision:
                return
            memo[key] = tidy(ocr_image(vision, p), 3000)
            remember()
        if memo[key] and memo[key] not in seen_text:
            seen_text.add(memo[key])
            texts.append(f'[{label}]\n{memo[key]}')
            sources.append({'kind': 'poster', 'name': label, 'chars': len(memo[key])})

    def read_file(p: Path, depth: int = 0):
        ext = p.suffix.lower()
        if ext in IMAGE_EXT:
            return read_image(p, f'첨부 이미지: {p.name}')
        if ext == '.zip' and depth == 0:
            for q in unzip_files(p, folder):
                read_file(q, 1)
            return
        if ext not in TEXT_EXT:
            errors.append(f'{p.name}: 읽을 수 없는 형식')
            return
        key = f'file:{p.name}:{file_hash(p)}'
        if key not in memo:
            try:
                memo[key] = tidy(attachment_text(p), 3000)
            except Exception as e:              # 손상된 파일, 필요한 라이브러리 없음 등
                errors.append(f'{p.name}: {e}')
                return
            remember()
        t = memo[key]
        if ext == '.pdf' and len(re.sub(r'\s', '', t)) < 50:
            # 글자가 거의 없는 pdf 는 스캔본 → 쪽 이미지를 비전 모델로
            for q in pdf_images(p, folder):
                read_image(q, f'첨부 {p.name} 이미지')
            return
        if t:
            texts.append(f'[첨부: {p.name}]\n{t}')
            sources.append({'kind': 'file', 'name': p.name, 'chars': len(t)})

    if want_images:
        for i, url in enumerate((raw.get('imgs') or [])[:6]):
            try:
                p = download(url, folder, f'image{i + 1}')
            except Exception as e:
                errors.append(f'이미지 {i + 1} 받기 실패: {e}')
                continue
            if p:
                read_image(p, f'본문 이미지 {i + 1}')
    if want_files:
        for f in file_list(raw):
            try:
                p = download(f['url'], folder, f.get('name') or f'file{f.get("seq", "")}')
            except Exception as e:
                errors.append(f'첨부 {f.get("name") or f.get("seq")} 받기 실패: {e}')
                continue
            if p:
                read_file(p)
    return {'text': tidy('\n\n'.join(texts), 6000), 'sources': sources, 'errors': errors}
