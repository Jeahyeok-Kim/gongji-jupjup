# -*- coding: utf-8 -*-
"""규칙으로 하는 1차 정리 (AI 없이)

새 공지가 들어왔는데 AI(Ollama)가 꺼져 있거나 이번 실행의 시간 예산을 다 썼을 때도 공지가 바로 웹 앱에 보이도록,
본문에서 규칙으로 찾을 수 있는 것만 뽑는다. 이렇게 만든 공지에는 aiPending: true 가 붙고,
다음 실행에서 AI가 돌면 정밀 해독 결과로 바뀐다 (규칙 결과는 AI 답 저장소에 남기지 않음).

찾는 것
  마감   '마감·까지·기간·접수·신청·제출·모집' 이 들어간 줄의 날짜. '~' 로 이어진 기간이면 끝 날짜, 시각이 없으면 23:59
  혜택   '지급·지원·장학금·상금·포인트·혜택·제공' 이 들어간 줄의 원화 금액 또는 다드림 포인트
  분류   제목 낱말 → 게시판 이름 (gongji_pipeline.refine_category 와 같은 규칙)
  요약   찾은 값만으로 summarize.compose 가 같은 모양의 한국어 두 문장을 만든다 (다른 언어는 비워 두고 웹 앱이 핵심 정보로 보여 줌)
찾은 값마다 그 값이 적힌 원문 줄을 근거(evidence)로 남긴다.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta

import gongji_pipeline as gp
import summarize

DEADLINE_WORDS = ('마감', '까지', '기간', '접수', '신청', '제출', '모집', '지원')
SKIP_LINE_WORDS = ('발표', '결과', '면접', '행사일', '교육일', '일시', '활동기간', '운영기간', '수업')
BENEFIT_WORDS = ('지급', '지원금', '장학금', '상금', '포인트', '혜택', '제공', '시상', '활동비', '수당', '사례')
POINTS_RE = re.compile(r'(?:다드림|비교과|마일리지)?\s*포인트\s*[:：]?\s*(\d{1,4})\s*(?:점|포인트|P)?|(\d{1,4})\s*(?:점|P)\s*(?:의\s*)?(?:다드림|비교과)?\s*포인트')
MAX_BENEFIT_LEN = 60


def _lines(text: str) -> list[str]:
    out = []
    for line in (text or '').splitlines():
        line = line.strip(' \t|·-')
        if line:
            out.extend(gp.split_long_line(line))
    return out


def _to_dt(d: dict, posted: str) -> str | None:
    """dates_in 결과 하나 → 'YYYY-MM-DDTHH:MM' (연도가 없으면 작성일 기준, 작성일보다 한참 앞이면 다음 해)"""
    p = datetime.fromisoformat(posted + 'T00:00')
    y = d['y'] or p.year
    hh, mm = (d['hh'], d['mm']) if d['hh'] is not None else (23, 59)
    try:
        dt = datetime(y, d['m'], d['d'], hh, mm)
    except ValueError:
        return None
    if not d['y'] and dt < p - timedelta(days=7):
        try:
            dt = dt.replace(year=dt.year + 1)
        except ValueError:
            return None
    if dt < p - timedelta(days=7) or dt - p > timedelta(days=200):
        return None                     # 작성일과 너무 먼 날짜는 마감으로 보지 않는다
    return dt.strftime('%Y-%m-%dT%H:%M')


def find_deadline(text: str, posted: str) -> tuple[str | None, str | None]:
    """마감 일시와 그 근거 줄. 못 찾으면 (None, None)"""
    best = None
    lines = _lines(text)
    for i, line in enumerate(lines):
        if not any(w in line for w in DEADLINE_WORDS) or any(w in line for w in SKIP_LINE_WORDS):
            continue
        # '신청 기간: 11. 23.(월) 10:00 ~' 다음 줄에 끝 날짜가 이어지는 경우 두 줄을 붙여서 본다
        t = max(line.rfind('~'), line.rfind('∼'))
        if t >= 0 and i + 1 < len(lines) and not [d for d in gp.dates_in(line) if d['pos'] > t]:
            line = line + ' ' + lines[i + 1]
        ds = gp.dates_in(line)
        if not ds:
            continue
        pick = None
        tilde = line.find('~') if '~' in line else line.find('∼')
        if tilde >= 0:
            after = [d for d in ds if d['pos'] > tilde]
            pick = after[0] if after else None
        if pick is None:
            until = line.find('까지')
            before = [d for d in ds if until < 0 or d['pos'] < until]
            pick = (before or ds)[-1]
        if pick and not pick['y']:
            # '2026. 11. 3.(화) ~ 11. 20.(금)' 처럼 끝 날짜에 연도가 없으면 앞 날짜의 연도를 쓴다
            years = [d['y'] for d in ds if d['y'] and d['pos'] < pick['pos']]
            if years:
                pick = {**pick, 'y': years[-1]}
        dt = _to_dt(pick, posted) if pick else None
        if not dt:
            continue
        score = 2 if ('마감' in line or '까지' in line or tilde >= 0) else 1
        if not best or score > best[0]:
            best = (score, dt, line)
        if score == 2:
            break
    return (best[1], best[2]) if best else (None, None)


def find_benefit(text: str) -> dict | None:
    """{'ko': 짧은 혜택 글, 'points': n, 'won': n, 'prize': n, 'line': 근거 줄} 또는 None"""
    for line in _lines(text):
        if not any(w in line for w in BENEFIT_WORDS):
            continue
        points = 0
        m = POINTS_RE.search(line)
        if m and ('포인트' in line):
            points = int(m[1] or m[2] or 0)
        won = gp.won_from_text(line) or 0
        odd = won > 100_000_000
        if odd:
            won = 0                      # '3,000,000만원' 같은 오타는 금액으로 세지 않는다 (글은 그대로 보여 줌)
        if not points and not won and not odd:
            continue
        prize = won if any(w in line for w in ('상금', '시상', '대상', '최우수', '우수상')) else 0
        label = re.sub(r'^\s*(?:[\d]+[.)]|[가-하][.)]|[-*•※○●◦▶]+)\s*', '', line)
        label = re.sub(r'^\s*(?:혜택|지원\s*내용|지원\s*혜택|시상|특전)\s*[:：]\s*', '', label).strip()
        if len(label) > MAX_BENEFIT_LEN:
            label = label[:MAX_BENEFIT_LEN - 1].rstrip() + '…'
        return {'ko': label, 'points': points, 'won': 0 if prize else won, 'prize': prize, 'line': line}
    return None


def extract(raw: dict, posted: str, text: str) -> dict:
    """AI 답과 같은 모양(clean_extraction 결과)의 dict"""
    title = gp._s(raw.get('subject') or raw.get('title'))
    board = gp._s(raw.get('boardName'))
    deadline, dl_line = find_deadline(text, posted)
    b = find_benefit(text)
    evidence = {}
    if dl_line:
        evidence['deadline'] = dl_line
    benefit = None
    if b:
        evidence['benefit'] = b.pop('line')
        benefit = b
    category = gp.refine_category('etc', board, title, benefit)
    return {'deadline': deadline, 'events': [], 'benefit': benefit, 'eligibility': None, 'category': category,
            'hours': None, 'evidence': evidence, 'summary': ''}


def build_notice(raw: dict, glossary: dict, regs: dict, today=None, media: dict | None = None) -> dict:
    """AI 없이 만든 웹 앱용 공지 1건 (process_notice 결과와 같은 모양 + aiPending)"""
    title = gp._s(raw.get('subject') or raw.get('title'))
    text = gp._s(raw.get('text'))
    posted = gp.norm_date(gp._s(raw.get('date'))) or (today or datetime.now().date()).isoformat()
    status = gp.body_status(raw)
    sources = (media or {}).get('sources') or []
    body = text if status == 'text' else ''
    if media and media.get('text'):
        body = (body + '\n\n' + media['text']).strip()
        if status == 'image':
            status = 'poster' if any(x['kind'] == 'poster' for x in sources) else 'file'
    readable = status != 'image'
    ex = extract(raw, posted, body) if readable else {
        'deadline': None, 'events': [], 'benefit': None, 'eligibility': None, 'hours': None, 'evidence': {},
        'category': gp.refine_category('etc', gp._s(raw.get('boardName')), title, None)}
    label = next((c['label']['ko'] for c in gp.CATEGORIES if c['id'] == ex['category']), '')
    summary = {'ko': summarize.compose(ex, label)} if readable else dict(gp.IMAGE_SUMMARY)
    benefit = None
    if ex['benefit']:
        b = ex['benefit']
        benefit = {'text': {'ko': b['ko']}, 'points': b['points'], 'won': b['won']}
        if b['prize']:
            benefit['prize'] = b['prize']
    reg_item = gp.find_regulation(title, body if readable else '', regs)
    return {
        'id': raw.get('id'),
        'boardName': gp._s(raw.get('boardName')),
        'link': raw.get('externalLink') or raw.get('link'),
        'date': posted,
        'hits': int(raw.get('hits') or 0),
        'bodyStatus': status,
        'title': title,
        'titleTr': {},
        'category': ex['category'],
        'deadline': ex['deadline'],
        'benefit': benefit,
        'eligibility': None,
        'events': [],
        'hours': None,
        'evidence': ex['evidence'],
        'evidenceVerified': True if ex['evidence'] else None,
        'readFrom': [{'kind': x['kind'], 'name': x['name']} for x in sources] if (media and media.get('text')) else [],
        'summary': summary,
        'terms': gp.find_terms(title, body, glossary),
        'regulation': gp.regulation_for_output(reg_item, regs),
        'aiPending': True,
    }
