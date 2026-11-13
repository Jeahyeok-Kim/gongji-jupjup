# -*- coding: utf-8 -*-
"""크롬 확장이 모은 '학교 기본 정보'(학사일정·요람·규정·안내 페이지)로 공지 줍줍의 기준 자료를 갱신합니다.

    python pipeline/build_reference.py                      (공지줍줍·다운로드 폴더의 최신 kku-reference-*.json)
    python pipeline/build_reference.py kku-reference-2026-11-13.json

하는 일
1) 학사일정 → data/calendar.js (웹 앱 '학사일정'에 표시)
2) 최신 학사요람 PDF를 받아 쪽마다 글자를 뽑고, pipeline/regulations.json 의 요람 문장이 몇 쪽에 있는지 다시 찾음
   (문장이 바뀌어 못 찾으면 알려 주고 예전 값을 그대로 둠)
3) 규정정보시스템 조문 → regulations.json 의 rule 항목을 최신 조문으로 바꿈 (조 번호·문장·확인 날짜)
4) 안내 페이지(주요 전화번호 등) → pipeline/reference/pages.json
번역: Ollama가 켜져 있으면 바뀐 조문과 학사일정 이름을 영어·중국어·일본어로 번역(저장해 두고 다시 쓰기), 꺼져 있으면 한국어만.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gongji_pipeline as gp  # noqa: E402
import media as md  # noqa: E402
import store as st  # noqa: E402

REF_DIR = gp.PIPELINE_DIR / 'reference'
REGS_PATH = gp.PIPELINE_DIR / 'regulations.json'
CAL_PATH = gp.ROOT / 'data' / 'calendar.js'

TR_SYSTEM = """너는 대학 학사 규정과 학사일정을 외국인 유학생에게 전하는 번역가다.
주어진 한국어 문장 목록을 영어(en), 중국어 간체(zh), 일본어(ja)로 번역한다. 뜻을 더하거나 빼지 않고, 숫자는 그대로 둔다.
목록의 순서와 개수를 그대로 지킨다."""


# ------------------------------------------------------------------
# 규정 조문 다루기
# ------------------------------------------------------------------
ART_RE = re.compile(r'제\s*(\d+)\s*조(?:\s*의\s*(\d+))?\s*\(([^)]{1,40})\)')
NOTE_RE = re.compile(r'\((?:개정|신설|전문개정|단서 신설|단서신설|본조신설|제목개정|삭제)[^()]*(?:\([^()]*\)[^()]*)*\)')


def law_key(name: str) -> str:
    """'2-1-1 건국대학교 학칙' → '건국대학교학칙' (앞 번호와 띄어쓰기를 빼고 비교)"""
    return gp.squash(re.sub(r'^\s*[\d-]+\s+', '', name or ''))


def articles(text: str) -> dict[str, tuple[str, str]]:
    """조문 제목 → (조 번호, 본문). 같은 제목이 또 나오면(부칙 등) 처음 것을 쓴다."""
    ms = list(ART_RE.finditer(text or ''))
    out = {}
    for i, m in enumerate(ms):
        body = text[m.end(): ms[i + 1].start() if i + 1 < len(ms) else len(text)]
        no = m[1] + (f'의{m[2]}' if m[2] else '')
        out.setdefault(gp.squash(m[3]), (no, body))
    return out


def article_quote(body: str, find: str | None = None, limit: int = 320) -> str:
    """조문 본문에서 보여 줄 문단: find 가 든 항(①②…), 없으면 첫 항. 개정 연혁 표시는 지운다."""
    body = re.sub(r'\s+', ' ', body or '').strip()
    body = re.split(r'\s*제\s*\d+\s*(?:절|장)\s', body)[0]          # 다음 절·장 제목 앞까지
    paras = [p.strip() for p in re.split(r'(?=[①②③④⑤⑥⑦⑧⑨⑩])', body) if p.strip()]
    pick = paras[0] if paras else ''
    if find:
        for p in paras:
            if gp.squash(find) in gp.squash(p):
                pick = p
                break
    pick = NOTE_RE.sub('', pick)
    pick = re.sub(r'\s*제\s*\d+\s*조\s*$', '', pick)      # 뒤에 붙은 삭제된 조 번호
    pick = re.sub(r'\s+', ' ', pick).strip()
    if len(pick) > limit:
        cut = max(pick.rfind('. ', 0, limit), pick.rfind('다.', 0, limit) + 1)
        pick = pick[:cut + 1].strip() if cut > limit // 3 else pick[:limit].rstrip() + '…'
    return pick


def resolve_rules(regs: dict, rules: list[dict], today: str, log=print) -> list[dict]:
    """regulations.json 의 rule 항목을 모아 온 최신 조문으로 채운다. 번역이 필요한 항목 목록을 돌려준다."""
    by_name = {law_key(r['name']): r for r in rules}
    need_tr = []
    for it in regs['items']:
        ref = it.get('rule')
        if not ref:
            continue
        law = by_name.get(law_key(ref['law']))
        if not law:
            log(f'  ! 규정을 받지 못함: {ref["law"]} ({it["id"]})')
            continue
        arts = articles(law['text'])
        hit = arts.get(gp.squash(ref['article']))
        if not hit:
            log(f'  ! 조문을 찾지 못함: {ref["law"]} ({ref["article"]}) ({it["id"]})')
            continue
        no, body = hit
        quote = article_quote(body, ref.get('find'))
        if not quote:
            continue
        changed = quote != ref.get('quote')
        ref.update({'no': no, 'quote': quote, 'checked': today,
                    'url': law.get('url') or f'https://rule.konkuk.ac.kr/lmxsrv/law/lawDetail.do?SEQ={law.get("seq")}&LAWGROUP=1&PAGE=1'})
        h = hashlib.sha1(quote.encode('utf-8')).hexdigest()[:12]
        if changed or ref.get('trFor') != h or not ref.get('tr'):
            ref['trFor'] = h
            ref.pop('tr', None)
            need_tr.append(ref)
        log(f'  · {it["id"]}: {ref["law"]} 제{no}조({ref["article"]}){" (바뀜)" if changed else ""}')
    return need_tr


# ------------------------------------------------------------------
# 요람
# ------------------------------------------------------------------
def yoram_pages(entry: dict) -> tuple[int, list[str]] | None:
    """요람 글에서 PDF를 받아 쪽마다 글자를 뽑는다 (pipeline/reference/yoram_연도.json 에 저장)"""
    year = int(entry.get('year') or 0)
    cache = REF_DIR / f'yoram_{year}.json'
    if cache.exists():
        return year, json.loads(cache.read_text(encoding='utf-8'))
    pdf = next((f for f in entry.get('files', []) if (f.get('name') or '').lower().endswith('.pdf')), None) \
        or (entry.get('files') or [None])[0]
    if not pdf:
        return None
    path = md.download(pdf['url'], REF_DIR / 'files', pdf.get('name') or f'yoram_{year}.pdf', timeout=180)
    from pypdf import PdfReader   # pip install pypdf
    pages = [(p.extract_text() or '') for p in PdfReader(str(path)).pages]
    cache.write_text(json.dumps(pages, ensure_ascii=False), encoding='utf-8')
    return year, pages


def printed_page(text: str, pdf_no: int) -> int:
    """쪽 아래·위의 '- 16 -' 같은 쪽 번호. 없으면 PDF 쪽 번호."""
    nums = [int(x) for x in re.findall(r'-\s*(\d{1,3})\s*-', text or '')]
    near = [n for n in nums if 0 < pdf_no - n <= 20]
    return near[0] if near else pdf_no


def resolve_yoram(regs: dict, year: int, pages: list[str], log=print) -> int:
    sq = [gp.squash(p) for p in pages]
    found = 0
    for it in regs['items']:
        if not it.get('quote'):
            continue
        key = gp.squash(it.get('find') or it['quote'])[:40]
        hits = [i for i, t in enumerate(sq) if key in t]
        if not hits:
            log(f'  ! {year}학년도 요람에서 문장을 찾지 못함: {it["id"]} (예전 값 유지, 요람 문장이 바뀌었는지 확인 필요)')
            continue
        page = printed_page(pages[hits[0]], hits[0] + 1)
        if page != it.get('page'):
            log(f'  · {it["id"]}: {it.get("page")}쪽 → {page}쪽')
        it['page'] = page
        it['pdfPage'] = hits[0] + 1
        found += 1
    regs['year'] = year
    regs['source'] = f'{year}학년도 학사요람 · 학사 안내'
    regs['sourceTr'] = {'en': f'{year} Academic Handbook · Academic Guide', 'zh': f'{year}学年度学事要览 · 学事指南',
                        'ja': f'{year}年度 学事要覧 · 学事案内'}
    return found


# ------------------------------------------------------------------
# 학사일정
# ------------------------------------------------------------------
def build_calendar(items: list[dict], tr: dict) -> dict:
    out = []
    for x in items:
        s, e = gp.norm_date(x.get('start')), gp.norm_date(x.get('end') or x.get('start'))
        title = re.sub(r'\s+', ' ', x.get('title') or '').strip()
        if not (s and e and title):
            continue
        out.append({'start': s, 'end': e, 'title': {'ko': title, **tr.get(title, {})}})
    out.sort(key=lambda x: (x['start'], x['end']))
    uniq = []
    for x in out:
        if not uniq or (uniq[-1]['start'], uniq[-1]['title']['ko']) != (x['start'], x['title']['ko']):
            uniq.append(x)
    return {'generatedAt': date.today().isoformat(), 'items': uniq}


def write_calendar_js(path: Path, data: dict) -> None:
    body = ('// 학사일정 (크롬 확장으로 모은 학교 연간주요일정, pipeline/build_reference.py 가 만든 파일)\n'
            '(function (root) {\n  const CAL = /*JSON-START*/' + json.dumps(data, ensure_ascii=False, indent=1) +
            '/*JSON-END*/;\n  root.GONGJI_CALENDAR = CAL;\n'
            "  if (typeof module !== 'undefined' && module.exports) module.exports = CAL;\n"
            "})(typeof window !== 'undefined' ? window : globalThis);\n")
    path.write_text(body, encoding='utf-8')


# ------------------------------------------------------------------
# 번역 (선택)
# ------------------------------------------------------------------
def translate_list(ai, texts: list[str]) -> list[dict] | None:
    if not ai or not texts:
        return None
    cache_path = REF_DIR / 'translations.json'
    cache = json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() else {}
    todo = [t for t in texts if t not in cache]
    for i in range(0, len(todo), 12):
        part = todo[i:i + 12]
        schema = {'type': 'object', 'properties': {l: {'type': 'array', 'items': {'type': 'string'}} for l in gp.LANGS},
                  'required': list(gp.LANGS)}
        raw = ai.chat_json(TR_SYSTEM, json.dumps(part, ensure_ascii=False), schema, num_predict=4096)
        for j, t in enumerate(part):
            got = {l: (raw.get(l) or [])[j] if j < len(raw.get(l) or []) else '' for l in gp.LANGS}
            if all(got.values()):
                cache[t] = {l: gp.fix_currency(t, v, l) for l, v in got.items()}
        cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding='utf-8')
    return [cache.get(t) for t in texts]


def find_latest() -> Path | None:
    files = []
    for d in (gp.ROOT, Path.home() / 'Downloads'):
        if d.is_dir():
            files += [f for f in d.glob('kku-reference-*.json') if f.is_file()]
    return max(files, key=lambda f: f.stat().st_mtime) if files else None


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description='크롬 확장이 모은 학교 기본 정보로 학사일정·요람 쪽수·규정 조문을 갱신')
    ap.add_argument('input', nargs='?')
    ap.add_argument('--model', default=os.environ.get('GONGJI_MODEL', 'qwen3:8b'))
    ap.add_argument('--host', default=None)
    ap.add_argument('--no-translate', action='store_true')
    ap.add_argument('--no-archive', action='store_true')
    ap.add_argument('--regs', default=str(REGS_PATH))
    ap.add_argument('--calendar', default=str(CAL_PATH))
    args = ap.parse_args(argv)
    paths = [Path(args.input)] if args.input else st.find_exports('reference')
    ref = st.load_reference()
    if not paths and not (ref.get('rules') or ref.get('calendar')):
        print('kku-reference-날짜.json 파일을 찾지 못했습니다. 크롬 확장에서 "학교 기본 정보"를 받아 내보내세요.')
        return 1
    if paths:
        ref, stats = st.merge_reference_files(paths, ref)
        st.save_reference(ref)
        print(f'기본 정보 파일 {stats["files"]}개를 저장소(collected/reference.json)에 합침: 새 학사일정 {stats["calendar"]}개, '
              f'요람 {stats["yoram"]}개, 바뀐 안내 페이지 {stats["pages"]}개, 새 규정 {stats["rules"]}개, 개정된 규정 {stats["rulesChanged"]}개')
        if not args.no_archive:
            moved = st.archive([p for p in paths if p.name.startswith('kku-reference-')])
            if moved:
                print(f'  합친 파일 {len(moved)}개는 collected/원본 폴더로 옮겼습니다.')
    else:
        print('새로 내보낸 기본 정보가 없어 저장소에 있는 정보로 갱신합니다.')
    REF_DIR.mkdir(parents=True, exist_ok=True)
    regs_path = Path(args.regs)
    regs = json.loads(regs_path.read_text(encoding='utf-8'))
    today = date.today().isoformat()

    ai = None
    if not args.no_translate:
        cand = gp.Ollama(args.model, host=args.host)
        if cand.alive() and cand.has_model():
            ai = cand
        else:
            print('Ollama가 꺼져 있어 새 조문·일정 이름은 한국어로만 둡니다. (나중에 Ollama를 켜고 다시 실행하면 번역)')

    # 1) 요람
    yoram = sorted(ref.get('yoram') or [], key=lambda x: int(x.get('year') or 0), reverse=True)
    if yoram:
        print(f'요람: {yoram[0].get("subject")}')
        try:
            got = yoram_pages(yoram[0])
        except Exception as e:     # 받기 실패, pypdf 없음 등
            print(f'  ! 요람 PDF를 읽지 못했습니다: {e}')
            got = None
        if got:
            n = resolve_yoram(regs, *got)
            print(f'  요람 문장 {n}개 위치 확인 ({got[0]}학년도, {len(got[1])}쪽)')
    else:
        print('요람 정보가 없습니다 (확장에서 www.kku.ac.kr 탭으로 기본 정보를 받으세요).')

    # 2) 규정
    rules = ref.get('rules') or []
    if rules:
        print(f'규정 {len(rules)}개로 조문 갱신:')
        need = resolve_rules(regs, rules, today)
        if need:
            trs = translate_list(ai, [r['quote'] for r in need])
            for r, t in zip(need, trs or []):
                if t:
                    r['tr'] = t
            print(f'  새로 번역할 조문 {len(need)}개' + (' → 번역함' if trs else ' (번역은 Ollama가 켜져 있을 때)'))
    else:
        print('규정 정보가 없습니다 (확장에서 rule.konkuk.ac.kr 탭으로 기본 정보를 받으세요).')
    regs['checked'] = today
    regs_path.write_text(json.dumps(regs, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'→ {regs_path} 갱신')

    # 3) 학사일정
    cal_items = ref.get('calendar') or []
    if cal_items:
        titles = sorted({re.sub(r'\s+', ' ', x.get('title') or '').strip() for x in cal_items} - {''})
        trs = translate_list(ai, titles) or []
        tr = {t: v for t, v in zip(titles, trs) if v}
        data = build_calendar(cal_items, tr)
        write_calendar_js(Path(args.calendar), data)
        print(f'학사일정 {len(data["items"])}개 → {args.calendar}')

    # 4) 안내 페이지
    if ref.get('pages'):
        (REF_DIR / 'pages.json').write_text(json.dumps(ref['pages'], ensure_ascii=False, indent=1), encoding='utf-8')
        print(f'안내 페이지 {len(ref["pages"])}개 → pipeline/reference/pages.json')
    print('\n완료. 공지 데이터에 새 규정을 반영하려면 run_pipeline.bat 을 다시 실행하세요 (AI는 다시 부르지 않음).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
