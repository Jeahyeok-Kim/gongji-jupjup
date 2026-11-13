# -*- coding: utf-8 -*-
"""공지 줍줍 파이프라인 공용 코드

크롬 확장으로 수집한 공지(JSON) → 규칙 + 로컬 AI(Ollama에서 돌리는 Qwen) → 웹 앱이 읽는 data/notices.js

- Python 표준 라이브러리만 씁니다 (pip 설치 필요 없음).
- AI가 틀릴 때를 대비한 안전장치:
  1) 공지에 없는 값은 비워 둔다 (프롬프트로 지시)
  2) 본문 줄마다 번호를 붙여 주고, AI는 근거를 '줄 번호'로 답한다. 근거 문장은 AI가 쓴 글이 아니라
     원문의 그 줄을 그대로 가져오므로 지어낸 인용이 들어갈 수 없다.
  3) 마감·행사 날짜는 근거 줄에 그 월·일 숫자가 있어야, 금액·포인트는 근거 줄에 그 숫자가 있어야 남긴다.
     요약에 원문에 없는 숫자가 있으면 그 문장을 지운다.
  4) 학사 규정은 AI가 만들지 않고, 요람 원문 문장을 미리 골라 둔 목록(regulations.json)에서 키워드로 찾는다
  5) 용어 풀이도 AI가 고르지 않고, 용어집 단어가 공지에 실제로 나오는지 문자열 탐색으로 찾는다
"""
from __future__ import annotations

import hashlib
import socket
import json
import os
import re
import shutil
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

import summarize  # 같은 폴더: 요약 문체 통일과 품질 검사

ROOT = Path(__file__).resolve().parent.parent
PIPELINE_DIR = ROOT / 'pipeline'
CACHE_DIR = PIPELINE_DIR / 'cache'
LANGS = ('en', 'zh', 'ja')
# 모든 호출에 같은 문맥 길이를 쓴다. 호출마다 다르면 Ollama가 모델을 매번 다시 올려서 2배쯤 느려진다.
NUM_CTX = 8192

# 혜택 종류 분류표 (웹 앱의 샘플 데이터와 같은 목록)
CATEGORIES = [
    {'id': 'dadream',     'label': {'ko': '다드림 포인트',   'en': 'Dadream Points',        'zh': 'Dadream积分',  'ja': 'ダドリームポイント'}},
    {'id': 'scholarship', 'label': {'ko': '장학',           'en': 'Scholarships',          'zh': '奖学金',       'ja': '奨学金'}},
    {'id': 'dorm',        'label': {'ko': '기숙사',         'en': 'Dormitory',             'zh': '宿舍',         'ja': '寮'}},
    {'id': 'global',      'label': {'ko': '교환·해외',       'en': 'Exchange & Abroad',     'zh': '交换·海外',    'ja': '交換留学・海外'}},
    {'id': 'career',      'label': {'ko': '취업·창업',       'en': 'Jobs & Startups',       'zh': '就业·创业',    'ja': '就職・起業'}},
    {'id': 'contest',     'label': {'ko': '공모전·대외활동', 'en': 'Contests & Activities', 'zh': '比赛·校外活动', 'ja': 'コンテスト・課外活動'}},
    {'id': 'academic',    'label': {'ko': '학사',           'en': 'Academic Affairs',      'zh': '学务',         'ja': '学事'}},
    {'id': 'event',       'label': {'ko': '행사·특강',       'en': 'Events & Lectures',     'zh': '活动·讲座',    'ja': 'イベント・特別講義'}},
    {'id': 'etc',         'label': {'ko': '기타',           'en': 'Other',                 'zh': '其他',         'ja': 'その他'}},
]
CATEGORY_IDS = [c['id'] for c in CATEGORIES]

# 개인정보가 담길 수 있는 글은 처리하지 않는다 (기획서: 합격자 발표 같은 글 제외)
EXCLUDE_TITLE_WORDS = ('합격자', '명단', '결과 발표', '결과발표', '당첨자', '선정 결과', '선발 결과', '최종 결과')
# 학생이 신청할 공지가 아닌 게시판 (개인 문의, 교직원용, 업체 입찰, 교직원 채용)
EXCLUDE_BOARDS = {'Q&A': '개인 문의', '교직원 자료실': '교직원용', '입찰공지': '업체 입찰', '채용공지': '교직원 채용'}
# 이미 끝난 일을 알리는 보도 기사. 신청할 것이 없어서 기본으로 뺀다 (--with-news 로 포함)
NEWS_BOARDS = {'투데이뉴스'}

IMAGE_SUMMARY = {
    'ko': '본문이 이미지나 첨부파일로만 올라와 내용을 읽지 못했습니다. 원문을 확인해 주세요.',
    'en': 'The notice body is only an image or attachment, so it could not be read. Please check the original.',
    'zh': '公告正文仅为图片或附件,无法读取。请查看原文。',
    'ja': '本文が画像または添付ファイルのみのため読み取れませんでした。原文をご確認ください。',
}


# ------------------------------------------------------------------
# 1. 문자열 도우미
# ------------------------------------------------------------------
def squash(s: str | None) -> str:
    """공백·줄바꿈을 모두 지운 문자열 (띄어쓰기가 달라도 같은 문장으로 보기 위해)"""
    return re.sub(r'\s+', '', s or '')


def verify_evidence(body: str | None, quote: str | None) -> bool:
    """AI가 인용한 문장이 원문에 실제로 있는가? (띄어쓰기·줄바꿈 차이는 무시)"""
    if not body or not quote or not squash(quote):
        return False
    return squash(quote) in squash(body)


def number_in_text(n: int | None, text: str | None) -> bool:
    """숫자 n 이 글 안에 그대로 적혀 있는가? 500000 → '500,000' / '500000' / '50만' 중 하나.
    앞뒤에 다른 숫자가 붙은 경우(예: 20 과 2026)는 같은 숫자로 보지 않는다."""
    if n is None or not text:
        return False
    t = squash(text)
    cands = {str(n), f'{n:,}'}
    if n >= 10000 and n % 10000 == 0:
        cands |= {f'{n // 10000}만', f'{n // 10000:,}만'}
    for c in cands:
        if re.search(r'(?<![\d,])' + re.escape(c) + r'(?![\d,])', t):
            return True
    return False


def numbers_in(text: str | None) -> set[int]:
    """글에 나오는 숫자 모음 ('500,000' → 500000, '2026. 11. 20.' → 2026, 11, 20)"""
    return {int(x.replace(',', '')) for x in re.findall(r'\d[\d,]*\d|\d', text or '') if x.replace(',', '').isdigit()}


def date_in_text(d: str | None, text: str | None) -> bool:
    """'2026-11-20' 의 월(11)과 일(20)이 글에 숫자로 적혀 있는가?"""
    if not d or not text:
        return False
    nums = numbers_in(text)
    return int(d[5:7]) in nums and int(d[8:10]) in nums


def split_long_line(line: str, limit: int = 180) -> list[str]:
    """한 줄이 너무 길면(줄바꿈 없는 공지) 문장 끝이나 띄어쓰기에서 나눈다."""
    if len(line) <= limit:
        return [line]
    out = []
    for sent in re.split(r'(?<=[.!?。])\s+', line):
        while len(sent) > limit:
            cut = sent.rfind(' ', 0, limit)
            cut = cut if cut > limit // 2 else limit
            out.append(sent[:cut].strip())
            sent = sent[cut:].strip()
        if sent:
            out.append(sent)
    return out


def numbered_lines(title: str, text: str | None) -> list[str]:
    """0번 줄은 제목, 1번부터 본문 (빈 줄은 빼고 긴 줄은 나눔)"""
    lines = [title]
    for raw in (text or '').splitlines():
        raw = raw.strip()
        if raw:
            lines.extend(split_long_line(raw))
    return lines


def pick_lines(lines: list[str], idxs) -> str | None:
    """AI가 고른 줄 번호(최대 3개) → 원문 그 줄들. 번호가 하나라도 틀리면 None"""
    if not isinstance(idxs, list) or not idxs:
        return None
    out = []
    for i in idxs[:3]:
        if isinstance(i, float) and i.is_integer():
            i = int(i)
        if not isinstance(i, int) or isinstance(i, bool) or not (0 <= i < len(lines)):
            return None
        q = lines[i] if len(lines[i]) <= 240 else lines[i][:239] + '…'
        if q not in out:
            out.append(q)
    return '\n'.join(out)


def check_summary(summary: str, source: str, checks: dict) -> str:
    """요약 문장 가운데 원문에 없는 숫자(금액·날짜·인원 등)가 있는 문장은 지운다."""
    keep = []
    for sent in re.split(r'(?<=[.!?。])\s+', (summary or '').strip()):
        ok = True
        for m in re.finditer(r'(\d[\d,]*)\s*(만)?', sent):
            digits = m[1].rstrip(',').replace(',', '')
            if not digits.isdigit():
                continue
            n = int(digits)
            if not (number_in_text(n * 10000 if m[2] else n, source) or number_in_text(n, source)):
                ok = False
                break
        if ok:
            keep.append(sent)
        elif sent:
            checks.setdefault('dropped', []).append('summary(원문에 없는 숫자)')
    return ' '.join(keep).strip()


def fix_currency(ko: str, text: str, lang: str) -> str:
    """'50만 원'을 '50万円'(엔)처럼 다른 나라 돈으로 옮기는 번역 실수를 바로잡는다."""
    if not text or '원' not in (ko or '') or '엔' in (ko or ''):
        return text
    if lang == 'ja':
        text = re.sub(r'(\d[\d,.]*\s*万?)\s*円', r'\1ウォン', text)
    elif lang == 'zh':
        text = re.sub(r'(\d[\d,.]*\s*万?)\s*(?:日元|日圆|円)', r'\1韩元', text)
    elif lang == 'en':
        text = re.sub(r'(\d[\d,.]*)\s*yen\b', r'\1 won', text, flags=re.I)
    return text


DATE_IN_TEXT = re.compile(
    r"(?:(?P<y>20\d{2}|'\d{2})\s*[.년/-]\s*)?(?P<m>1[0-2]|0?[1-9])\s*[.월/]\s*(?P<d>3[01]|[12]\d|0?[1-9])(?!\d)\s*일?\.?"
    r"\s*(?:\([^)]{1,4}\))?\s*(?:(?P<hh>[01]?\d|2[0-3])\s*(?::|시)\s*(?P<mm>[0-5]\d)?)?")


def dates_in(text: str) -> list[dict]:
    """글에 나오는 날짜(와 시각)를 순서대로: '2026. 10. 30.(금) 09:00', '11월 2일(일)', '10/27' 등"""
    out = []
    for m in DATE_IN_TEXT.finditer(text or ''):
        y = m['y']
        y = (2000 + int(y[1:])) if y and y.startswith("'") else (int(y) if y else None)
        out.append({'pos': m.start(), 'y': y, 'm': int(m['m']), 'd': int(m['d']),
                    'hh': int(m['hh']) if m['hh'] else None, 'mm': int(m['mm']) if m['mm'] else 0})
    return out


def fix_range_deadline(dl: str, quote: str) -> str:
    """'신청기간: 10. 30.(금) ~ 11. 12.(목) 18:00' 에서 AI가 시작일(10/30)을 마감으로 고르면 끝(11/12 18:00)으로 고친다."""
    if not dl or '~' not in (quote or ''):
        return dl
    ds = dates_in(quote)
    m0, d0 = int(dl[5:7]), int(dl[8:10])
    for i, a in enumerate(ds):
        if (a['m'], a['d']) != (m0, d0):
            continue
        tilde = quote.find('~', a['pos'])
        nxt = ds[i + 1] if i + 1 < len(ds) else None
        if tilde < 0 or not nxt or nxt['pos'] < tilde:
            return dl
        y = nxt['y'] or (int(dl[:4]) + (1 if nxt['m'] < m0 else 0))
        hh, mm = (nxt['hh'], nxt['mm']) if nxt['hh'] is not None else (23, 59)
        try:
            datetime(y, nxt['m'], nxt['d'], hh, mm)
        except ValueError:
            return dl
        return f"{y:04d}-{nxt['m']:02d}-{nxt['d']:02d}T{hh:02d}:{mm:02d}"
    return dl


def amounts_in(text: str) -> set[int]:
    """'500,000원' → 500000, '50만 원' → 500000, '2,500만원' → 25000000, '50万' → 500000 (그냥 숫자도 포함)"""
    out = set()
    for m in re.finditer(r'(\d[\d,]*(?:\.\d+)?)\s*(만|万)?', text or ''):
        raw = m[1].rstrip(',').replace(',', '')
        try:
            v = float(raw)
        except ValueError:
            continue
        out.add(int(v) if v.is_integer() else v)
        if m[2]:
            out.add(int(round(v * 10000)))
    return out


def won_from_text(text: str) -> int | None:
    """혜택 글에 적힌 원화 금액 하나 (여러 개면 가장 큰 것)"""
    vals = []
    for m in re.finditer(r'(\d[\d,]*)\s*(만)?\s*원', text or ''):
        raw = m[1].rstrip(',').replace(',', '')
        if raw.isdigit():
            vals.append(int(raw) * (10000 if m[2] else 1))
    vals = [v for v in vals if v >= 1000]
    return max(vals) if vals else None


BOARD_CATEGORY = {'장학공지': 'scholarship', '취업/창업': 'career', '아르바이트': 'career', '채용공지': 'career',
                  '외부행사/공모전': 'contest', '사회봉사': 'contest', '학사공지': 'academic', '행사안내': 'event'}
TITLE_CATEGORY = [(('기숙사', '관생', '생활관'), 'dorm'), (('교환학생', '해외', '유학', '국제교류'), 'global'),
                  (('장학',), 'scholarship'), (('공모전', '경진대회', '서포터즈', '봉사', '대외활동'), 'contest'),
                  (('채용', '취업', '창업', '인턴', '현장실습', '아르바이트'), 'career'),
                  (('특강', '워크숍', '설명회', '포럼', '교육', '프로그램'), 'event')]


def refine_category(cat: str, board: str, title: str, benefit: dict | None) -> str:
    """AI 분류를 규칙으로 보정: 다드림 포인트가 확인되면 dadream, AI가 '기타'라고 하면 제목 낱말 → 게시판 순으로 정함"""
    if benefit and benefit.get('points'):
        return 'dadream'
    if cat != 'etc':
        return cat
    for words, c in TITLE_CATEGORY:
        if any(w in title for w in words):
            return c
    return BOARD_CATEGORY.get(board, 'etc')


MONTH_NAMES = {m: i + 1 for i, m in enumerate(
    ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'])}


def date_numbers(text: str) -> set[int]:
    """숫자 + 영어 달 이름(October → 10)"""
    nums = numbers_in(text)
    for w in re.findall(r'[A-Za-z]+', text or ''):
        w = w.lower()
        for name, n in MONTH_NAMES.items():
            if len(w) >= 3 and name.startswith(w):
                nums.add(n)
    return nums


def drop_wrong_date(text: str, wrong: str, right: str) -> str:
    """요약에 AI가 잘못 고른 날짜(wrong)만 있고 바른 날짜(right)는 없는 문장을 지운다."""
    if not text or not wrong or wrong[:10] == (right or '')[:10]:
        return text
    wm, wd, rd = int(wrong[5:7]), int(wrong[8:10]), int(right[8:10])
    sents = re.split(r'(?<=[.!?。！？])\s*', text)
    keep = [s for s in sents if s and not ({wm, wd} <= date_numbers(s) and rd not in date_numbers(s))]
    return ''.join(x if re.search(r'[。！？]$', x) else x + ' ' for x in keep).strip()


SCHOOL_NAMES = {'en': ('Konkuk University', r'(?:Kookmin|Kongju|Konyang|Kunkook|Geonguk|Kunkuk|Gunguk)\s+University'),
                'zh': ('建国大学', r'国民大学|建國大學|公州大学'),
                'ja': ('建国大学', r'国民大学|建國大學|公州大学')}


def fix_school_name(ko: str, text: str, lang: str) -> str:
    """'건국대'를 다른 대학 이름으로 옮기는 번역 실수를 바로잡는다 (예: Kookmin University)"""
    if not text or '건국' not in (ko or '') or lang not in SCHOOL_NAMES:
        return text
    right, wrong = SCHOOL_NAMES[lang]
    return re.sub(wrong, right, text)


def check_translated_numbers(ko: str, text: str) -> str:
    """번역문의 숫자(금액·날짜)가 한국어 원문에 없는 문장은 지운다. 예: 50만 원 → 5万ウォン"""
    if not text:
        return text
    allowed = amounts_in(ko)
    sents = re.split(r'(?<=[.!?。！？])\s*', text)
    keep = [s for s in sents if s and all(v in allowed for v in amounts_in(s) if v >= 32)]
    return ''.join(x if re.search(r'[。！？]$', x) else x + ' ' for x in keep).strip()


DT_RE = re.compile(r'^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?$')
TIME_RE = re.compile(r'^(\d{1,2}):(\d{2})$')


def norm_datetime(s: str | None, default_time: str = '23:59') -> str | None:
    """'2026-11-20', '2026-11-20 17:00', '2026-11-20T17:00' → '2026-11-20T17:00' (잘못된 날짜는 None)"""
    if not s:
        return None
    m = DT_RE.match(str(s).strip())
    if not m:
        return None
    y, mo, d = int(m[1]), int(m[2]), int(m[3])
    if m[4] is not None:
        hh, mm = int(m[4]), int(m[5])
    else:
        hh, mm = (int(x) for x in default_time.split(':'))
    try:
        datetime(y, mo, d, hh, mm)
    except ValueError:
        return None
    return f'{y:04d}-{mo:02d}-{d:02d}T{hh:02d}:{mm:02d}'


def norm_date(s: str | None) -> str | None:
    v = norm_datetime(s, '00:00')
    return v[:10] if v else None


def norm_time(s: str | None) -> str | None:
    m = TIME_RE.match(str(s or '').strip())
    if not m:
        return None
    hh, mm = int(m[1]), int(m[2])
    if hh > 23 or mm > 59:
        return None
    return f'{hh:02d}:{mm:02d}'


def fix_year(dt_str: str | None, posted: str) -> str | None:
    """연말 공지에서 AI가 다음 해 날짜를 올해로 적는 실수를 바로잡는다.
    작성일보다 7일 넘게 앞선 날짜면 1년 뒤로 옮겨 보고, 그래도 이상하면 버린다."""
    if not dt_str:
        return None
    d = datetime.fromisoformat(dt_str if 'T' in dt_str else dt_str + 'T00:00')
    p = datetime.fromisoformat(posted + 'T00:00')
    if d < p - timedelta(days=7):
        try:
            d2 = d.replace(year=d.year + 1)
        except ValueError:
            return None
        if d2 - p > timedelta(days=200):
            return None
        return d2.strftime('%Y-%m-%dT%H:%M') if 'T' in dt_str else d2.strftime('%Y-%m-%d')
    return dt_str


def body_status(raw: dict) -> str:
    """본문이 글자로 충분히 있으면 'text', 거의 없고 이미지·첨부만 있으면 'image'"""
    text = squash(raw.get('text'))
    if len(text) >= 40:
        return 'text'
    if raw.get('imgs') or (raw.get('fileCnt') or 0) > 0:
        return 'image'
    return 'text'


def is_excluded(title: str) -> bool:
    return any(w in (title or '') for w in EXCLUDE_TITLE_WORDS)


def skip_reason(raw: dict, with_news: bool = False) -> str | None:
    """처리하지 않을 공지면 이유를, 처리할 공지면 None"""
    board = (raw.get('boardName') or '').strip()
    title = (raw.get('subject') or raw.get('title') or '').strip()
    if is_excluded(title):
        return '개인정보 가능성'
    if board in EXCLUDE_BOARDS:
        return '학생 대상 아님'
    if board in NEWS_BOARDS and not with_news:
        return '보도 기사'
    if squash(title).lower() in ('test', '테스트', '시험'):
        return '시험 글'
    return None


# ------------------------------------------------------------------
# 2. 용어집·규정 (사람이 만든 목록에서 문자열 탐색으로 찾기)
# ------------------------------------------------------------------
def load_marked_json(path: Path, start='/*JSON-START*/', end='/*JSON-END*/'):
    s = Path(path).read_text(encoding='utf-8')
    i, j = s.find(start), s.find(end)
    if i < 0 or j < 0:
        raise ValueError(f'{path} 에서 {start} ~ {end} 표시를 찾지 못했습니다.')
    return json.loads(s[i + len(start):j])


def load_glossary(path: Path | None = None) -> dict:
    return load_marked_json(path or ROOT / 'data' / 'glossary.js')


def load_regulations(path: Path | None = None) -> dict:
    return json.loads(Path(path or PIPELINE_DIR / 'regulations.json').read_text(encoding='utf-8'))


def find_terms(title: str, text: str, glossary: dict, limit: int = 6) -> list[str]:
    hay = squash(title) + squash(text)
    return [k for k in glossary if squash(k) in hay][:limit]


def _usable(it: dict) -> bool:
    """요람 문장이 있거나, 규정 조문을 받아 둔 항목만 연결한다"""
    return bool(it.get('quote') or (it.get('rule') or {}).get('quote'))


def find_regulation(title: str, text: str, regs: dict) -> dict | None:
    """제목에 키워드가 있으면 우선, 없으면 본문에 2번 이상 나오는 키워드로 규정을 찾는다."""
    st, sx = squash(title), squash(text)
    items = [it for it in regs['items'] if _usable(it)]
    for it in items:
        if any(squash(k) in st for k in it['keywords']):
            return it
    for it in items:
        if any(sx.count(squash(k)) >= 2 for k in it['keywords']):
            return it
    return None


def regulation_for_output(it: dict | None, regs: dict) -> dict | None:
    if not it:
        return None
    out = {'id': it['id'], 'title': it['title']}
    if it.get('quote'):
        out.update({'quote': it['quote'], 'tr': it.get('tr', {}), 'source': regs['source'],
                    'sourceTr': regs['sourceTr'], 'page': it['page'], 'year': regs['year']})
    r = it.get('rule') or {}
    if r.get('quote'):
        out['rule'] = {k: r[k] for k in ('law', 'no', 'article', 'quote', 'tr', 'url', 'checked') if r.get(k)}
    return out


# ------------------------------------------------------------------
# 3. 로컬 AI (Ollama) 호출
# ------------------------------------------------------------------
class OllamaError(RuntimeError):
    """kind: 'down'(서버에 연결 안 됨) / 'timeout'(답이 너무 오래 걸림) / 'bad'(이상한 답)"""
    def __init__(self, msg: str, kind: str = 'bad'):
        super().__init__(msg)
        self.kind = kind


def _is_timeout(e: Exception) -> bool:
    r = getattr(e, 'reason', e)
    return isinstance(r, (TimeoutError, socket.timeout)) or 'timed out' in str(r).lower()


class Ollama:
    """Ollama 서버(기본 http://localhost:11434)의 /api/chat 을 부르는 작은 클라이언트"""

    def __init__(self, model: str, host: str | None = None, think: bool | None = False, timeout: int = 240):
        host = host or os.environ.get('OLLAMA_HOST') or 'http://localhost:11434'
        if not host.startswith('http'):
            host = 'http://' + host
        self.host = host.rstrip('/')
        self.model = model
        self.think = think
        self.timeout = timeout
        self.calls = 0
        self.seconds = 0.0

    def _request(self, path: str, body: dict | None = None, timeout: int | None = None) -> dict:
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(self.host + path, data=data,
                                     headers={'Content-Type': 'application/json'},
                                     method='GET' if body is None else 'POST')
        with urllib.request.urlopen(req, timeout=timeout or self.timeout) as r:
            return json.loads(r.read().decode('utf-8'))

    def installed_models(self) -> list[str]:
        try:
            return [m.get('name', '') for m in self._request('/api/tags', timeout=10).get('models', [])]
        except (urllib.error.URLError, OSError) as e:
            raise OllamaError(f'Ollama 서버({self.host})에 연결하지 못했습니다. Ollama를 실행했는지 확인하세요. ({e})', 'down')

    def has_model(self) -> bool:
        names = self.installed_models()
        want = self.model if ':' in self.model else self.model + ':latest'
        return want in names or self.model in names

    def alive(self) -> bool:
        try:
            self.installed_models()
            return True
        except OllamaError:
            return False

    def chat_text(self, system: str, user: str, images: list[str] | None = None, num_ctx: int = NUM_CTX,
                  num_predict: int = 2048) -> str:
        """글로 답을 받는다 (이미지 글자 읽기용). images: base64 로 바꾼 이미지 목록"""
        msg = {'role': 'user', 'content': user}
        if images:
            msg['images'] = images
        body = {'model': self.model, 'messages': [{'role': 'system', 'content': system}, msg], 'stream': False,
                'options': {'temperature': 0, 'num_ctx': num_ctx, 'num_predict': num_predict, 'repeat_penalty': 1.1},
                'keep_alive': '10m'}
        for attempt in range(2):
            t0 = time.time()
            try:
                resp = self._request('/api/chat', body)
            except urllib.error.HTTPError as e:
                raise OllamaError(f'Ollama 오류 {e.code}: {e.read().decode("utf-8", "replace")[:300]}')
            except (urllib.error.URLError, OSError) as e:
                if _is_timeout(e) and attempt == 0 and self.alive():
                    continue
                raise OllamaError(f'Ollama 응답 없음: {e}', 'timeout' if _is_timeout(e) else 'down')
            finally:
                self.calls += 1
                self.seconds += time.time() - t0
            return (resp.get('message') or {}).get('content', '') or ''
        raise OllamaError(f'응답 시간 초과({self.timeout}초)', 'timeout')

    def chat_json(self, system: str, user: str, schema: dict, num_ctx: int = NUM_CTX, num_predict: int = 1536) -> dict:
        """JSON 스키마에 맞춘 답을 받는다. 답이 끝없이 길어지는 것을 막으려고 num_predict 로 길이를 제한하고,
        시간 초과나 JSON이 아닌 답이면 온도를 조금 올려 한 번 더 시도한다."""
        body = {
            'model': self.model,
            'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}],
            'format': schema,           # 구조화된 출력: 이 JSON 스키마에 맞춰서만 답하게 함
            'stream': False,
            'options': {'temperature': 0, 'num_ctx': num_ctx, 'num_predict': num_predict, 'repeat_penalty': 1.1},
            'keep_alive': '10m',
        }
        if self.think is not None:
            body['think'] = self.think
        last = 'AI 답을 받지 못했습니다'
        for attempt in range(3):
            if attempt:
                body['options']['temperature'] = 0.3   # 같은 실수를 되풀이하지 않게 조금 다르게
            t0 = time.time()
            try:
                resp = self._request('/api/chat', body)
            except urllib.error.HTTPError as e:
                msg = e.read().decode('utf-8', 'replace')
                if 'think' in body and 'think' in msg.lower():
                    body.pop('think')       # 생각 모드 옵션을 모르는 모델이면 빼고 다시
                    continue
                raise OllamaError(f'Ollama 오류 {e.code}: {msg[:300]}')
            except (urllib.error.URLError, OSError) as e:
                if _is_timeout(e):
                    last = f'응답 시간 초과({self.timeout}초)'
                    if not self.alive():
                        raise OllamaError(f'Ollama 서버({self.host})가 응답하지 않습니다: {e}', 'down')
                    if attempt >= 1:
                        raise OllamaError(last, 'timeout')
                    continue
                raise OllamaError(f'Ollama 서버({self.host})에 연결하지 못했습니다: {e}', 'down')
            finally:
                self.calls += 1
                self.seconds += time.time() - t0
            content = (resp.get('message') or {}).get('content', '')
            try:
                return json.loads(content)
            except json.JSONDecodeError as e:
                last = f'AI 답을 JSON으로 읽지 못했습니다: {e}'
        raise OllamaError(last, 'bad')


# ------------------------------------------------------------------
# 4. 프롬프트와 출력 형식
# ------------------------------------------------------------------
EXTRACT_SYSTEM = """너는 건국대학교 GLOCAL캠퍼스 공지를 읽고 정보를 뽑는 도우미다. 아래 규칙을 반드시 지켜라.
1. 공지 본문의 각 줄 앞에는 [번호]가 붙어 있다([0]은 제목). 공지에 적힌 내용만 쓴다. 적혀 있지 않은 항목은 문자열은 "" (빈 문자열), 숫자는 0, 목록은 [] 로 둔다. 추측하지 않는다.
2. *_lines 와 events[].lines 에는 그 값이 적힌 줄의 번호를 1~3개 쓴다. 근거 줄을 댈 수 없으면 그 값을 비운다.
3. 날짜는 작성일을 기준으로 연도를 정해 YYYY-MM-DD, 시각은 24시간제 HH:MM 으로 쓴다. deadline 은 학생이 신청·접수·제출해야 하는 마감 일시이고, 마감 시각이 없으면 날짜만 쓴다.
4. events 는 학생이 직접 참석하는 행사·교육·상담의 날짜와 시작·끝 시각이다. 끝 시각이 적혀 있지 않으면 그 행사는 넣지 않는다.
5. 이미 끝난 일을 알리는 글(수상 소식, 행사 성료 등)은 deadline 과 events 를 비운다.
6. benefit 은 학생이 받는 혜택을 짧게, 금액은 원문 표기 그대로 쓴다(예: 500,000원). points 는 다드림 포인트 같은 포인트 숫자, won 은 참여자 모두가 받는 확정 금액(원), prize 는 상금처럼 뽑혀야 받는 금액(원)이다.
7. eligibility 는 지원·참여할 수 있는 대상을 짧게 쓴다.
8. category 는 혜택 종류다: dadream(다드림·비교과 포인트), scholarship(장학금), dorm(기숙사), global(교환학생·해외·국제교류), career(취업·창업·채용·인턴), contest(공모전·대외활동·봉사), academic(학사 일정·수강·졸업·학적), event(행사·특강·교육), etc(그 밖).
9. hours 는 학생이 신청하고 참여하는 데 드는 예상 시간(시간 단위, 0.5 단위)이다. 알 수 없으면 0.
10. summary 는 한국어가 서툰 학생도 이해하도록 쉬운 한국어 2문장 이내로 쓴다. 마감일과 혜택이 있으면 꼭 넣고, 숫자는 원문에 적힌 것만 쓴다."""

_LINES = {'type': 'array', 'items': {'type': 'integer'}, 'maxItems': 3}
EXTRACT_SCHEMA = {
    'type': 'object',
    'properties': {
        'deadline': {'type': 'string'},
        'deadline_lines': _LINES,
        'events': {
            'type': 'array',
            'maxItems': 5,
            'items': {
                'type': 'object',
                'properties': {
                    'date': {'type': 'string'}, 'start': {'type': 'string'},
                    'end': {'type': 'string'}, 'lines': _LINES,
                },
                'required': ['date', 'start', 'end', 'lines'],
            },
        },
        'benefit': {'type': 'string'},
        'benefit_lines': _LINES,
        'points': {'type': 'integer'},
        'won': {'type': 'integer'},
        'prize': {'type': 'integer'},
        'eligibility': {'type': 'string'},
        'eligibility_lines': _LINES,
        'category': {'type': 'string', 'enum': CATEGORY_IDS},
        'hours': {'type': 'number'},
        'summary': {'type': 'string'},
    },
    'required': ['deadline', 'deadline_lines', 'events', 'benefit', 'benefit_lines', 'points', 'won',
                 'prize', 'eligibility', 'eligibility_lines', 'category', 'hours', 'summary'],
}

TRANSLATE_SYSTEM = """너는 대학 공지를 외국인 유학생에게 전하는 번역가다.
주어진 한국어 항목(title, summary, benefit, eligibility)을 영어(en), 중국어 간체(zh), 일본어(ja)로 번역한다.
- 용어집에 나온 학교 용어는 반드시 용어집의 번역어를 쓴다.
- 숫자, 날짜, 시각은 그대로 둔다. 내용을 더하거나 빼지 않는다.
- summary 는 한국어의 문장 수와 순서를 그대로 지킨다. 문장을 줄이거나 합치지 않고, 날짜·금액·포인트를 하나도 빠뜨리지 않는다.
- 문체: 영어는 쉬운 현재형 평서문, 중국어는 간체 서면어(您 같은 높임말은 쓰지 않음), 일본어는 です・ます体로 통일한다.
- '원'은 한국 돈이다. en 은 'won'(예: 500,000 won), zh 는 '韩元', ja 는 'ウォン'으로 쓴다. 엔(円)이나 달러로 바꾸지 않는다.
- 사람 이름, 학과 이름, 행사 이름은 뜻을 살려 옮기되 모르면 한국어 발음대로 쓴다.
- 빈 문자열("")인 항목은 빈 문자열로 둔다."""

_TR_FIELDS = ('title', 'summary', 'benefit', 'eligibility')
_TR_LANG = {'type': 'object', 'properties': {f: {'type': 'string'} for f in _TR_FIELDS}, 'required': list(_TR_FIELDS)}
TRANSLATE_SCHEMA = {'type': 'object', 'properties': {l: _TR_LANG for l in LANGS}, 'required': list(LANGS)}


MEDIA_NOTE = '(본문 일부는 포스터 이미지와 첨부파일에서 읽은 글이다. [본문 이미지], [첨부: 파일명] 표시 아래가 그 내용이다)\n'


def extract_user_message(lines: list[str], board: str, posted: str, readable: bool, note: str = '') -> str:
    if not readable:
        return (f'작성일: {posted}\n게시판: {board}\n[0] {lines[0]}\n'
                '(본문을 읽을 수 없음. 제목만 보고 category 만 고르고 나머지 항목은 모두 비워 둘 것)')
    body = '\n'.join(f'[{i}] {l}' for i, l in enumerate(lines))
    return f'작성일: {posted}\n게시판: {board}\n{note}{body}'


def translate_user_message(items: dict, terms: list[str], glossary: dict, note: str = '') -> str:
    lines = []
    for k in terms:
        if glossary[k].get('prompt') is False:     # 화면 풀이용 용어 (번역은 규칙으로 바로잡음)
            continue
        tr = glossary[k].get('tr', {})
        lines.append(f"- {k} → en: {tr.get('en', '')} / zh: {tr.get('zh', '')} / ja: {tr.get('ja', '')}")
    gloss = '\n'.join(lines) if lines else '(없음)'
    extra = f'\n\n{note}' if note else ''
    return f'용어집 (반드시 이 번역어를 사용):\n{gloss}\n\n번역할 내용(JSON):\n{json.dumps(items, ensure_ascii=False)}{extra}'


# ------------------------------------------------------------------
# 5. AI 답 검사 (안전장치)
# ------------------------------------------------------------------
def _s(v) -> str:
    return v.strip() if isinstance(v, str) else ''


def _n(v) -> int | None:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def clean_extraction(raw: dict, lines: list[str], posted: str, checks: dict) -> dict:
    """AI 답을 검사한다. 근거 줄 번호가 틀리거나, 근거 줄에 그 날짜·숫자가 없으면 값을 버린다.
    lines: numbered_lines() 로 만든 원문 줄 목록"""
    dropped = checks.setdefault('dropped', [])
    evidence = {}

    # 마감: 근거 줄에 마감 날짜의 월·일이 있어야 함
    deadline = None
    dl = norm_datetime(_s(raw.get('deadline')))
    if dl:
        q = pick_lines(lines, raw.get('deadline_lines'))
        if not q:
            dropped.append('deadline(근거 없음)')
        elif not date_in_text(dl[:10], q):
            dropped.append('deadline(근거 줄에 날짜 없음)')
        else:
            fixed = fix_range_deadline(dl, q)
            if fixed != dl:
                checks.setdefault('fixed', []).append('deadline(기간 시작일 → 끝 날짜)')
                checks['wrong_deadline'] = dl
            deadline = fix_year(fixed, posted)
            if deadline:
                evidence['deadline'] = q
            else:
                dropped.append('deadline(날짜 이상)')

    # 행사 일시: 근거 줄에 날짜와 시작 시각(시)이 있어야 함
    events = []
    ev_quote = None
    for ev in (raw.get('events') or [])[:5]:
        if not isinstance(ev, dict):
            continue
        d, s, e = norm_date(_s(ev.get('date'))), norm_time(_s(ev.get('start'))), norm_time(_s(ev.get('end')))
        if not (d and s and e):
            dropped.append('event(시각 빠짐)')
            continue
        if s >= e:
            dropped.append('event(시각 순서 오류)')
            continue
        q = pick_lines(lines, ev.get('lines'))
        hh = int(s[:2])
        if not q or not date_in_text(d, q) or not ({hh, hh - 12} & numbers_in(q)):
            dropped.append('event(근거 없음)')
            continue
        d = fix_year(d, posted)
        if not d:
            dropped.append('event(날짜 이상)')
            continue
        if {'date': d, 'start': s, 'end': e} not in events:
            events.append({'date': d, 'start': s, 'end': e})
        ev_quote = ev_quote or q
    events.sort(key=lambda x: (x['date'], x['start']))
    if ev_quote:
        evidence['events'] = ev_quote

    # 혜택: 근거 줄이 맞아야 하고, 금액·포인트 숫자는 근거 줄에 있어야 함
    benefit = None
    b_text = _s(raw.get('benefit'))
    if b_text:
        q = pick_lines(lines, raw.get('benefit_lines'))
        if q:
            benefit = {'ko': b_text, 'points': None, 'won': None, 'prize': None}
            for key in ('points', 'won', 'prize'):
                n = _n(raw.get(key))
                if n is None:
                    continue
                if number_in_text(n, q):
                    benefit[key] = n
                else:
                    dropped.append(f'{key}(근거 줄에 숫자 없음)')
            # 포인트는 다드림(비교과) 포인트만. 창업 마일리지 같은 다른 점수는 빼기
            if benefit['points'] and not re.search(r'다드림|dp|DP|비교과', b_text + q):
                benefit['points'] = None
                dropped.append('points(다드림 포인트 아님)')
            # AI가 금액을 비워 두었어도 혜택 글과 근거 줄에 같은 금액이 있으면 채움.
            # 상금·시상처럼 뽑혀야 받는 돈은 prize, 그 밖(장학금·지원금·활동비)은 won
            if not benefit['won'] and not benefit['prize']:
                w = won_from_text(b_text)
                if w and number_in_text(w, q):
                    key = 'prize' if re.search(r'상금|시상|대상|최우수|우수상|입상', b_text + q) else 'won'
                    benefit[key] = w
                    checks.setdefault('fixed', []).append(f'{key}(혜택 글에서 금액 읽음)')
            evidence['benefit'] = q
        else:
            dropped.append('benefit(근거 없음)')

    # 대상
    eligibility = None
    e_text = _s(raw.get('eligibility'))
    if e_text:
        q = pick_lines(lines, raw.get('eligibility_lines'))
        if q:
            eligibility = e_text
            evidence['eligibility'] = q
        else:
            dropped.append('eligibility(근거 없음)')

    # 분류
    category = raw.get('category') if raw.get('category') in CATEGORY_IDS else 'etc'

    # 예상 소요 시간: 행사가 있으면 행사 시간을 직접 계산, 없으면 AI 추정(0.5시간 단위로 반올림)
    if events:
        minutes = 0
        for ev in events:
            sh, sm = map(int, ev['start'].split(':'))
            eh, em = map(int, ev['end'].split(':'))
            minutes += (eh * 60 + em) - (sh * 60 + sm)
        hours = max(0.5, round(minutes / 30) / 2)
    else:
        try:
            h = float(raw.get('hours') or 0)
        except (TypeError, ValueError):
            h = 0
        hours = round(min(max(h, 0), 40) * 2) / 2 or None

    summary = check_summary(_s(raw.get('summary')), '\n'.join(lines), checks)

    return {
        'deadline': deadline, 'events': events, 'benefit': benefit, 'eligibility': eligibility,
        'category': category, 'hours': hours, 'summary': summary, 'evidence': evidence,
    }


def clean_translation(raw: dict, items: dict, checks: dict) -> dict:
    """번역이 비었거나 형식이 틀리면 한국어 원문으로 채우고, 돈 단위 실수를 바로잡는다."""
    out = {}
    for lang in LANGS:
        part = raw.get(lang) if isinstance(raw.get(lang), dict) else {}
        out[lang] = {}
        for f in _TR_FIELDS:
            v = fix_school_name(items.get(f, ''), fix_currency(items.get(f, ''), _s(part.get(f)), lang), lang)
            if f in ('summary', 'benefit') and v:
                checked = check_translated_numbers(items.get(f, ''), v)
                if checked != v:
                    checks.setdefault('dropped', []).append(f'{lang}.{f}(번역 숫자 다름)')
                    v = checked
            if items.get(f) and not v:
                checks.setdefault('untranslated', []).append(f'{lang}.{f}')
                v = items[f]
            out[lang][f] = v if items.get(f) else ''
    return out


# ------------------------------------------------------------------
# 5-2. 번역에서 날짜·금액이 빠졌는지 검사
# ------------------------------------------------------------------
def fix_translation(ask, tr: dict, items: dict, terms: list[str], glossary: dict, checks: dict) -> None:
    """번역된 요약에서 한국어 요약의 연도·날짜·금액이 빠졌으면 한 번 다시 번역시킨다 (tr 를 직접 고침).
    그래도 빠져 있는 언어는 checks['translationLost'] 에 적는다 → 웹앱은 그 요약을 숨기고 핵심 정보 칸을 보여 준다.
    ask(part, system, user, schema) 는 AI 호출(저장해 둔 답이 있으면 그것)."""
    ko = items.get('summary') or ''
    if not ko:
        return
    bad = {l: summarize.lost_facts(ko, tr[l]['summary']) for l in LANGS}
    bad = {l: v for l, v in bad.items() if v}
    if not bad:
        return
    note = '앞선 번역에서 다음 값이 빠졌다: ' + '; '.join(f"{l}: {', '.join(v)}" for l, v in bad.items()) \
        + '. summary 의 모든 문장과 날짜·금액을 빠뜨리지 말고 다시 번역하라.'
    try:
        raw = ask('translate2', TRANSLATE_SYSTEM, translate_user_message(items, terms, glossary, note), TRANSLATE_SCHEMA)
        again = clean_translation(raw if isinstance(raw, dict) else {}, items, {})
    except OllamaError as e:
        if e.kind == 'down':
            raise
        again = None
    still = []
    for l, lost in bad.items():
        if again is not None and len(summarize.lost_facts(ko, again[l]['summary'])) < len(lost):
            tr[l]['summary'] = again[l]['summary']          # 덜 빠진 쪽을 쓴다
        if summarize.lost_facts(ko, tr[l]['summary']):
            still.append(l)
    checks['translationRetried'] = sorted(bad)
    if still:
        checks['translationLost'] = still


# ------------------------------------------------------------------
# 6. 공지 한 건 처리
# ------------------------------------------------------------------
def call_key(model: str, system: str, schema: dict, user: str) -> str:
    """같은 모델·같은 지시·같은 입력이면 같은 키 → 저장해 둔 AI 답을 다시 쓴다"""
    return hashlib.sha1(json.dumps([model, system, schema, user], ensure_ascii=False).encode('utf-8')).hexdigest()


def _ask(ai: Ollama, cache: dict | None, part: str, system: str, user: str, schema: dict, **kw) -> tuple[dict, bool]:
    key = call_key(ai.model, system, schema, user)
    hit = (cache or {}).get(part)
    if isinstance(hit, dict) and hit.get('key') == key:
        return hit.get('raw') or {}, True
    raw = ai.chat_json(system, user, schema, **kw)
    if cache is not None:
        cache[part] = {'key': key, 'raw': raw}
    return raw, False


def process_notice(raw: dict, ai: Ollama, glossary: dict, regs: dict, today: date | None = None,
                   cache: dict | None = None, media: dict | None = None) -> tuple[dict, dict]:
    """수집한 공지 1건 → 웹 앱용 공지 1건. 두 번째 값은 검사 기록(버린 값 등).
    cache: 이 공지의 저장된 AI 답 {extract: {key, raw}, translate: {key, raw}} (새 답을 받으면 여기에 채움).
    AI 답 자체를 저장하므로, 검사 규칙만 바뀌었을 때는 AI를 다시 부르지 않고 규칙만 다시 적용한다."""
    title = _s(raw.get('subject') or raw.get('title'))
    text = _s(raw.get('text'))
    board = _s(raw.get('boardName'))
    posted = norm_date(_s(raw.get('date'))) or (today or date.today()).isoformat()
    status = body_status(raw)
    checks: dict = {}

    ai_text = text[:6000] if status == 'text' else ''
    # 포스터 이미지·첨부파일에서 읽은 글: 본문이 없으면 본문 대신, 본문이 짧으면 본문 뒤에 붙임
    sources = (media or {}).get('sources') or []
    if media and media.get('text'):
        if status == 'image':
            ai_text = media['text'][:6000]
            status = 'poster' if any(x['kind'] == 'poster' for x in sources) else 'file'
        else:
            ai_text = (ai_text + '\n\n' + media['text'])[:6000]
    readable = status != 'image'
    lines = numbered_lines(title, ai_text)

    raw_ex, hit1 = _ask(ai, cache, 'extract', EXTRACT_SYSTEM, extract_user_message(lines, board, posted, readable, MEDIA_NOTE if sources and media.get('text') else ''),
                        EXTRACT_SCHEMA, num_ctx=NUM_CTX, num_predict=1536 if readable else 512)
    ex = clean_extraction(raw_ex if isinstance(raw_ex, dict) else {}, lines, posted, checks)
    ex['category'] = refine_category(ex['category'], board, title, ex['benefit'] if readable else None)

    if not readable:
        # 본문을 못 읽은 공지는 분류만 쓰고 나머지는 비운다 (제목만으로 추측하지 않기)
        ex.update({'deadline': None, 'events': [], 'benefit': None, 'eligibility': None, 'hours': None, 'evidence': {}})
        checks['dropped'] = []
        summary_ko = IMAGE_SUMMARY['ko']
        sum_hits = []
    else:
        # 요약을 전용 호출로 모두 같은 문체로 쓰고, 검사에서 걸리면 한 번 다시 쓰게 한다 (그래도 안 되면 초안 → 직접 만든 문장)
        label = next((c['label']['ko'] for c in CATEGORIES if c['id'] == ex['category']), '')
        sum_hits = []

        def ask_summary(part, system, user, schema):
            raw_s, hit_s = _ask(ai, cache, part, system, user, schema, num_ctx=NUM_CTX, num_predict=400)
            sum_hits.append(hit_s)
            return raw_s
        summary_ko = summarize.build_summary(ask_summary, ex['summary'], title, board, posted, ai_text, ex, label, checks,
                                             guard=lambda t: check_summary(t, '\n'.join(lines), checks))

    terms = find_terms(title, ai_text, glossary)
    items = {
        'title': title,
        'summary': summary_ko if readable else '',
        'benefit': ex['benefit']['ko'] if ex['benefit'] else '',
        'eligibility': ex['eligibility'] or '',
    }
    raw_tr, hit2 = _ask(ai, cache, 'translate', TRANSLATE_SYSTEM, translate_user_message(items, terms, glossary),
                        TRANSLATE_SCHEMA, num_ctx=NUM_CTX, num_predict=2048)
    tr = clean_translation(raw_tr if isinstance(raw_tr, dict) else {}, items, checks)
    tr_hits = []
    if readable:
        def ask_translate(part, system, user, schema):
            raw_t, hit_t = _ask(ai, cache, part, system, user, schema, num_ctx=NUM_CTX, num_predict=2048)
            tr_hits.append(hit_t)
            return raw_t
        fix_translation(ask_translate, tr, items, terms, glossary, checks)
    checks['cached'] = hit1 and hit2 and all(sum_hits) and all(tr_hits)

    if not readable:
        summary = dict(IMAGE_SUMMARY)
    else:
        summary = {'ko': summary_ko, **{l: tr[l]['summary'] for l in LANGS}}
        if checks.get('wrong_deadline') and ex['deadline']:
            summary = {l: drop_wrong_date(v, checks['wrong_deadline'], ex['deadline']) or (title if l == 'ko' else
                       tr[l]['title']) for l, v in summary.items()}

    benefit = None
    if ex['benefit']:
        b = ex['benefit']
        benefit = {'text': {'ko': b['ko'], **{l: tr[l]['benefit'] for l in LANGS}},
                   'points': b['points'], 'won': b['won']}
        if b['prize']:
            benefit['prize'] = b['prize']

    eligibility = {'ko': ex['eligibility'], **{l: tr[l]['eligibility'] for l in LANGS}} if ex['eligibility'] else None

    reg_item = find_regulation(title, ai_text, regs) if readable else find_regulation(title, '', regs)

    notice = {
        'id': raw.get('id'),
        'boardName': board,
        'link': raw.get('externalLink') or raw.get('link'),
        'date': posted,
        'hits': int(raw.get('hits') or 0),
        'bodyStatus': status,
        'title': title,
        'titleTr': {l: tr[l]['title'] or title for l in LANGS},
        'category': ex['category'],
        'deadline': ex['deadline'],
        'benefit': benefit,
        'eligibility': eligibility,
        'events': ex['events'],
        'hours': ex['hours'],
        'evidence': ex['evidence'],
        'evidenceVerified': True if ex['evidence'] else None,
        'readFrom': [{'kind': x['kind'], 'name': x['name']} for x in sources] if (media and media.get('text')) else [],
        'summary': summary,
        'terms': terms,
        'regulation': regulation_for_output(reg_item, regs),
    }
    return notice, checks


# ------------------------------------------------------------------
# 7. 파일 읽고 쓰기
# ------------------------------------------------------------------
def load_collected(path: Path) -> list[dict]:
    """크롬 확장에서 내보낸 JSON ({notices: [...]} 또는 [...])"""
    data = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    return dedupe_notices(data.get('notices', []) if isinstance(data, dict) else data)


def dedupe_notices(notices: list) -> list[dict]:
    seen, out = set(), []
    for n in notices:
        if not isinstance(n, dict) or not n.get('id') or n['id'] in seen:
            continue
        seen.add(n['id'])
        out.append(n)
    return out


NOTICES_HEADER = """// 공지 줍줍 데이터 파일 (파이프라인이 자동으로 만든 파일입니다. 직접 고치지 마세요)
// 만든 방법: python pipeline/build_notices.py 수집파일.json
// - 요약·번역·분류는 로컬 AI가 만들었고, 근거 문장이 원문에 없는 값은 버렸습니다.
// - 원문 전체는 넣지 않았습니다 (근거 문장만 짧게 인용).
"""


def write_notices_js(path: Path, data: dict) -> Path | None:
    """data/notices.js 쓰기. 기존 파일이 샘플이면 data/notices.sample.js 로 한 번 백업한다."""
    path = Path(path)
    backup = None
    if path.exists():
        old = path.read_text(encoding='utf-8')
        if "source: 'sample'" in old:
            backup = path.with_name('notices.sample.js')
            if not backup.exists():
                shutil.copyfile(path, backup)
            else:
                backup = None
    body = ('(function (root) {\n  const DATA = /*JSON-START*/' + json.dumps(data, ensure_ascii=False, indent=1) +
            '/*JSON-END*/;\n\n  root.GONGJI_DATA = DATA;\n'
            "  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;\n"
            "})(typeof window !== 'undefined' ? window : globalThis);\n")
    tmp = path.with_suffix('.js.tmp')
    tmp.write_text(NOTICES_HEADER + body, encoding='utf-8')
    os.replace(tmp, path)
    return backup


def read_notices_js(path: Path) -> dict:
    return load_marked_json(path)
