# -*- coding: utf-8 -*-
"""공지 요약을 모두 같은 모양으로 만들기: 문체 규칙 · 품질 검사 · 다시 쓰기 · 마지막 수단(정보로 직접 문장 만들기)

로컬 AI(작은 모델)는 공지마다 요약 모양이 들쭉날쭉하다 (제목을 그대로 베끼거나, 너무 짧거나, 마감일이 빠짐).
그래서 요약을 '검사'한다:
  1) 프롬프트에 문체·순서 규칙과 예시를 넣어 처음부터 같은 모양으로 쓰게 하고
  2) 결과가 규칙을 어기면(비었음·너무 짧음·제목 베끼기·형식 깨짐·마감일/포인트 빠짐) 이유를 알려 주고 한 번 다시 쓰게 하고
  3) 그래도 안 되면 AI가 뽑아 둔 '근거 확인된 정보'(대상·혜택·마감·행사)로 문장을 직접 만든다.
번역도 같은 방식으로 날짜·금액이 빠졌는지 본다 (웹앱의 js/summary.js 와 같은 규칙).
"""
from __future__ import annotations

import json
import re

# ---------------------------------------------------------------
# 1. 문체 규칙 (추출 프롬프트와 다시 쓰기 프롬프트가 같이 쓴다)
# ---------------------------------------------------------------
STYLE = """summary 쓰는 법 (모든 공지의 요약이 같은 모양이 되게):
- 해요체(~해요, ~예요)로 정확히 두 문장, 합쳐서 80~140자로 쓴다.
- 첫 문장은 이 공지가 무엇인지 쉬운 말로 쓴다. 제목을 그대로 베끼지 않는다.
- 둘째 문장은 공지에 적힌 것만 '대상 → 마감일 → 혜택(금액·포인트) → 행사 일시' 순서로 쓴다. 마감일은 'M월 D일'로 꼭 넣고, 숫자는 공지에 적힌 그대로 쓴다.
- 목록·기호·따옴표·줄바꿈 없이 한 문단으로 쓴다. 공지에 없는 말은 지어내지 않는다.
모양 예 (○ 자리의 내용은 공지에서 가져온다. 예시 문장을 베끼지 않는다):
· ○○ 프로그램 참여자를 뽑는 공지예요. 재학생이 ○월 ○일까지 신청하면 다드림 포인트 ○점을 받아요.
· ○○ 수강신청을 안내하는 공지예요. 재학생과 휴학생이 ○월 ○일 ○시까지 종합정보시스템에서 신청해요."""

SUMMARY_SYSTEM = """너는 건국대학교 GLOCAL캠퍼스 공지를 쉬운 한국어로 요약하는 도우미다.
'확인된 정보'에 있는 값만 쓰고, 없는 정보는 쓰지 않는다. 아래 문체 규칙을 지켜 summary 한 개만 쓴다.

""" + STYLE

SUMMARY_SCHEMA = {'type': 'object', 'properties': {'summary': {'type': 'string'}}, 'required': ['summary']}

MIN_LEN = 14          # 공백·부호를 뺀 글자 수가 이보다 짧으면 요약으로 보지 않는다 (웹앱 js/summary.js 와 같은 값)
MAX_CHARS = 220
MAX_SENTENCES = 3


# ---------------------------------------------------------------
# 2. 글자 도우미
# ---------------------------------------------------------------
def norm(s) -> str:
    """비교용: 공백·문장부호·기호를 없애고 소문자로"""
    return re.sub(r'[\s\W_]+', '', str(s or '').lower(), flags=re.UNICODE)


def clean(text) -> str:
    """AI가 붙이기 쉬운 장식(따옴표, 글머리 기호, 마크다운, 줄바꿈)을 걷어 낸 한 문단"""
    s = str(text or '').strip()
    s = re.sub(r'\*\*|__|`', '', s)
    s = re.sub(r'^\s*(?:[-*•·]|\d+[.)])\s+', '', s, flags=re.M)
    s = re.sub(r'\s*\n+\s*', ' ', s).strip()
    s = s.strip('"\'“”‘’「」『』 ')
    return re.sub(r'\s{2,}', ' ', s)


def sentence_count(s: str) -> int:
    return max(1, len(re.findall(r'[.!?。](?:\s|$)', s.strip() + ' ')))


def _last_hangul(word: str) -> str | None:
    for ch in reversed(word):
        if '가' <= ch <= '힣':
            return ch
    return None


def iyo(word: str) -> str:
    """받침이 있으면 '이에요', 없으면 '예요' ('재학생' → 예요, '장학금' → 이에요)"""
    ch = _last_hangul(word)
    return '이에요' if ch and (ord(ch) - 0xAC00) % 28 else '예요'


def _md(date_str: str) -> tuple[int, int] | None:
    m = re.match(r'^\d{4}-(\d{2})-(\d{2})', date_str or '')
    return (int(m.group(1)), int(m.group(2))) if m else None


def _hm(date_str: str) -> str:
    m = re.search(r'[T ](\d{2}):(\d{2})$', date_str or '')
    return f'{int(m.group(1))}시' + (f' {int(m.group(2))}분' if m.group(2) != '00' else '') if m and (m.group(1), m.group(2)) != ('23', '59') else ''


# ---------------------------------------------------------------
# 3. 검사
# ---------------------------------------------------------------
def problem(summary: str, title: str, ex: dict) -> str | None:
    """한국어 요약이 쓸 만하지 않은 이유 (쓸 만하면 None).
    empty 비었음 · short 너무 짧음 · long 너무 김 · format 목록·기호가 섞임 · title 제목 베끼기 · deadline 마감일 빠짐 · points 포인트 숫자 빠짐"""
    s = str(summary or '').strip()
    n = norm(s)
    if not n:
        return 'empty'
    if len(n) < MIN_LEN:
        return 'short'
    if len(s) > MAX_CHARS or sentence_count(s) > MAX_SENTENCES:
        return 'long'
    if '\n' in s or '**' in s or re.match(r'^\s*(?:[-*•·#]|\d+[.)])\s', s):
        return 'format'
    nt = norm(title)
    if nt and (n == nt or n in nt or (nt in n and len(n) - len(nt) < 8)):
        return 'title'
    md = _md(ex.get('deadline') or '')
    if md and not re.search(rf'(?<!\d)0?{md[1]}\s*일', s):
        return 'deadline'
    b = ex.get('benefit') or {}
    pts = b.get('points') if isinstance(b, dict) else None
    if pts and not re.search(rf'(?<!\d){pts}(?!\d)', s.replace(',', '')):
        return 'points'
    return None


MONEY_WORD = re.compile(r'won|krw|韩元|韓元|ウォン|원|万|萬|million|thousand', re.I)


def lost_facts(ko: str, tr: str) -> list[str]:
    """한국어 요약의 연도·날짜의 '일'·금액이 번역에서 빠졌는지 (웹앱 js/summary.js 의 lostFacts 와 같은 규칙)"""
    text = re.sub(r'(\d),(?=\d{3})', r'\1', str(tr or ''))
    src = str(ko or '')
    lost: list[str] = []
    for y in re.findall(r'20\d{2}', src):
        if y not in text:
            lost.append(y)
    for m in re.finditer(r'(\d{1,2})월\s*(\d{1,2})일', src):
        if not re.search(rf'(?:^|\D){m.group(2)}(?:\D|$)', text):
            lost.append(m.group(0))
    if re.search(r'[\d만천억]\s*원', src) and not MONEY_WORD.search(text):
        lost.append('금액')
    return list(dict.fromkeys(lost))


# ---------------------------------------------------------------
# 4. 마지막 수단: 확인된 정보로 직접 문장 만들기
# ---------------------------------------------------------------
def compose(ex: dict, category_label: str = '') -> str:
    """AI 요약을 못 쓸 때, 근거가 확인된 값만으로 같은 모양(첫 문장 + 둘째 문장)의 요약을 만든다."""
    label = (category_label or '').strip()
    first = f'{label} 관련 공지예요.' if label and label != '기타' else '학교에서 알리는 공지예요.'
    who = ben = when = ''
    if ex.get('eligibility'):
        e = str(ex['eligibility']).strip().rstrip('.')
        who = f'대상은 {e}{iyo(e)}'
    b = ex.get('benefit') or {}
    if isinstance(b, dict) and b.get('ko'):
        t = str(b['ko']).strip().rstrip('.')
        ben = f'혜택은 {t}{iyo(t)}'
    md = _md(ex.get('deadline') or '')
    if md:
        t = _hm(ex['deadline'])
        when = f'신청은 {md[0]}월 {md[1]}일{(" " + t) if t else ""}까지예요'
    elif ex.get('events'):
        ev = ex['events'][0]
        d = _md(ev.get('date') or '')
        if d:
            when = f'행사는 {d[0]}월 {d[1]}일 {ev.get("start", "")}에 열려요'.replace('  ', ' ')
    info = [x for x in (who, ben, when) if x]
    if len(info) > 2:                         # 문장은 최대 3개 (첫 문장 + 정보 2개): 대상을 빼고 혜택과 마감을 남긴다
        info = [ben, when]
    return first + (' ' + '. '.join(info) + '.' if info else ' 자세한 내용은 원문을 확인해 주세요.')


# ---------------------------------------------------------------
# 5. 다시 쓰기
# ---------------------------------------------------------------
def facts_for_prompt(ex: dict) -> dict:
    b = ex.get('benefit') or {}
    return {k: v for k, v in {
        '마감': ex.get('deadline'),
        '행사': [f"{e.get('date')} {e.get('start')}~{e.get('end')}" for e in ex.get('events') or []] or None,
        '혜택': b.get('ko') if isinstance(b, dict) else None,
        '포인트': (b.get('points') if isinstance(b, dict) else None) or None,
        '금액(원)': (b.get('won') if isinstance(b, dict) else None) or None,
        '상금(원)': (b.get('prize') if isinstance(b, dict) else None) or None,
        '대상': ex.get('eligibility'),
    }.items() if v}


REASON_TEXT = {
    'empty': '요약이 비어 있었다', 'short': '요약이 너무 짧았다', 'long': '요약이 너무 길었다(두 문장으로)',
    'format': '목록이나 기호가 섞여 있었다', 'title': '제목을 거의 그대로 베꼈다',
    'deadline': '확인된 마감일이 요약에 없었다', 'points': '확인된 포인트 숫자가 요약에 없었다',
    'error': '요약을 받지 못했다',
}


def summary_user_message(title: str, board: str, posted: str, ex: dict, text: str, bad: str, why: str) -> str:
    facts = json.dumps(facts_for_prompt(ex), ensure_ascii=False)
    body = (text or '')[:1500] or '(본문 없음)'
    prev = f'\n앞선 요약(고쳐 쓸 것): {bad}\n고칠 점: {REASON_TEXT.get(why, why)}' if bad else ''
    return f'작성일: {posted}\n게시판: {board}\n제목: {title}\n확인된 정보(JSON): {facts}\n본문 앞부분:\n{body}{prev}'


def _write(ask, part: str, title: str, board: str, posted: str, ex: dict, text: str, bad: str, why: str, guard) -> str:
    """AI에게 요약을 쓰게 하고(ask), 장식을 걷어 내고, 원문에 없는 숫자가 든 문장을 지운다(guard). AI 호출이 실패하면 None"""
    try:
        raw = ask(part, SUMMARY_SYSTEM, summary_user_message(title, board, posted, ex, text, bad, why), SUMMARY_SCHEMA)
    except RuntimeError as e:
        if getattr(e, 'kind', '') == 'down':          # 서버가 꺼진 것은 이 공지 하나의 문제가 아니므로 위로 알린다
            raise
        return None
    out = clean(raw.get('summary') if isinstance(raw, dict) else '')
    return clean(guard(out)) if guard else out


def build_summary(ask, draft: str, title: str, board: str, posted: str, text: str, ex: dict,
                  category_label: str, checks: dict, guard=None) -> str:
    """모든 공지의 요약을 같은 문체로 만든다.
       1) 전용 요약 호출(문체 규칙 + 확인된 정보)  →  2) 검사에서 걸리면 이유를 알려 한 번 다시 쓰게 함
       3) 그래도 안 되면 추출 단계의 초안이 검사를 통과하면 그것  →  4) 마지막으로 확인된 정보로 직접 문장 만들기
    ask(part, system, user, schema) 는 AI 호출(저장해 둔 답이 있으면 그것)이고 dict 를 돌려준다.
    checks['summary'] 에 어떻게 만들었는지 적는다: ok / retried(이유) / draft(이유) / composed(이유)"""
    cand = _write(ask, 'summary', title, board, posted, ex, text, '', '', guard)
    why = 'error' if cand is None else problem(cand, title, ex)
    if not why:
        checks['summary'] = 'ok'
        return cand
    if cand is not None:                              # AI 호출 자체가 실패한 경우(시간 초과 등)에는 같은 요청을 되풀이하지 않는다
        retry = _write(ask, 'summary2', title, board, posted, ex, text, cand, why, guard)
        if retry and not problem(retry, title, ex):
            checks['summary'] = f'retried({why})'
            return retry
    old = clean(guard(clean(draft)) if guard else clean(draft))
    if old and not problem(old, title, ex):
        checks['summary'] = f'draft({why})'
        return old
    checks['summary'] = f'composed({why})'
    return compose(ex, category_label)
