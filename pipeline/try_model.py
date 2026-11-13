# -*- coding: utf-8 -*-
"""로컬 AI 모델 시험: 예시 공지 1건을 해독·번역해 보고 결과와 걸린 시간을 보여 줍니다.
실제 공지를 처리하기 전에 모델이 잘 도는지, 어떤 모델이 나은지 비교할 때 씁니다.

    python pipeline/try_model.py                 (기본 qwen3:8b)
    python pipeline/try_model.py --model qwen3:4b
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gongji_pipeline as gp  # noqa: E402

# 시험용 예시 공지 (실제 공지가 아니라 형식만 비슷하게 만든 글)
EXAMPLE = {
    'id': 'try-1', 'boardName': '행사안내', 'date': '2026-11-10', 'hits': 0, 'imgs': [], 'fileCnt': 0,
    'subject': "[예시] 비교과 프로그램 '자기소개서 클리닉' 참여자 모집",
    'text': ("취업을 준비하는 재학생을 위해 자기소개서 첨삭 프로그램을 운영합니다.\n"
             "■ 신청 기간: 2026. 11. 10.(화) ~ 11. 16.(월) 23:59\n"
             "■ 일시: 2026. 11. 18.(수) 13:00 ~ 15:00\n"
             "■ 장소: 학생회관 2층 세미나실\n"
             "■ 대상: 재학생 누구나 (선착순 30명)\n"
             "■ 혜택: 참여자 전원 다드림 포인트 20점 지급\n"
             "■ 신청 방법: 비교과 통합관리시스템에서 신청")
}


def main() -> int:
    ap = argparse.ArgumentParser(description='로컬 AI 모델 시험 (예시 공지 1건)')
    ap.add_argument('--model', default='qwen3:8b')
    ap.add_argument('--host', default=None)
    ap.add_argument('--think', action='store_true')
    args = ap.parse_args()
    ai = gp.Ollama(args.model, host=args.host, think=True if args.think else False)
    try:
        if not ai.has_model():
            print(f'모델이 없습니다. 먼저 실행하세요:  ollama pull {args.model}')
            return 2
    except gp.OllamaError as e:
        print(e)
        return 2
    print(f'{args.model} 로 예시 공지를 처리합니다 (처음 한 번은 모델을 불러오느라 더 걸립니다)...')
    t0 = time.time()
    notice, checks = gp.process_notice(EXAMPLE, ai, gp.load_glossary(), gp.load_regulations())
    took = time.time() - t0
    show = {k: notice[k] for k in ('category', 'deadline', 'events', 'hours', 'benefit', 'eligibility', 'summary', 'titleTr', 'terms', 'evidence')}
    print(json.dumps(show, ensure_ascii=False, indent=2))
    print(f'\n걸린 시간 {took:.1f}초 (AI 호출 {ai.calls}번)')
    print('버린 값:', ', '.join(checks.get('dropped', [])) or '없음')
    expect = {'deadline': '2026-11-16T23:59', 'category': 'dadream', 'points': 20}
    got = {'deadline': notice['deadline'], 'category': notice['category'],
           'points': (notice['benefit'] or {}).get('points')}
    ok = sum(expect[k] == got[k] for k in expect)
    print(f'기본 점검 {ok}/{len(expect)} 맞음: 마감 {got["deadline"]}, 분류 {got["category"]}, 포인트 {got["points"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
