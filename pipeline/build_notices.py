# -*- coding: utf-8 -*-
"""수집한 공지를 로컬 AI로 해독해서 웹 앱용 data/notices.js 를 만듭니다.

사용법 (공지줍줍 폴더에서):
    python pipeline/build_notices.py kku-notices-2026-11-20.json
    python pipeline/build_notices.py kku-notices-2026-11-20.json --model qwen3:8b --days 60

준비물:
    1) Ollama 설치 후 모델 받기:  ollama pull qwen3:8b
    2) 크롬 확장(collector 폴더)으로 공지를 모아 JSON으로 내보내기

AI 답은 공지마다 pipeline/cache 에 저장해 둡니다. 제목·본문·지시문이 같으면 AI를 다시 부르지 않고,
검사 규칙만 바뀌었을 때도 저장된 AI 답에 새 규칙을 적용하므로 빨리 끝납니다.
중간에 멈춰도 다시 실행하면 이어서 처리합니다.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gongji_pipeline as gp  # noqa: E402
import media as md  # noqa: E402
import rules  # noqa: E402
import store as st  # noqa: E402


def parse_args(argv=None):
    ap = argparse.ArgumentParser(description='수집한 공지 JSON을 로컬 AI로 해독해 data/notices.js 를 만듭니다.')
    ap.add_argument('input', nargs='?', help='크롬 확장에서 내보낸 kku-notices-날짜.json (생략하면 공지줍줍·collected·다운로드 폴더의 내보내기 파일을 모두 저장소에 합침)')
    ap.add_argument('--model', default=os.environ.get('GONGJI_MODEL', 'qwen3:8b'), help='Ollama 모델 이름 (기본 qwen3:8b)')
    ap.add_argument('--host', default=None, help='Ollama 주소 (기본 http://localhost:11434)')
    ap.add_argument('--days', type=int, default=60, help='최근 며칠 안에 올라온 공지만 처리 (0이면 전부, 기본 60)')
    ap.add_argument('--limit', type=int, default=0, help='최대 몇 건까지 처리할지 (0이면 제한 없음)')
    ap.add_argument('--out', default=str(gp.ROOT / 'data' / 'notices.js'), help='결과 파일 (기본 data/notices.js)')
    ap.add_argument('--no-cache', action='store_true', help='저장해 둔 AI 답을 쓰지 않고 모두 다시 처리')
    ap.add_argument('--keep-days', type=int, default=30, help='마감 후 며칠이 지나면 저장소에서 지울지 (기본 30, 0이면 지우지 않음)')
    ap.add_argument('--no-archive', action='store_true', help='합친 내보내기 파일을 collected/원본 으로 옮기지 않음')
    ap.add_argument('--offline', action='store_true', help='AI를 부르지 않고 저장된 AI 답에 검사 규칙만 다시 적용 (Ollama 꺼져 있어도 됨)')
    ap.add_argument('--vision-model', default=os.environ.get('GONGJI_VISION_MODEL', 'qwen2.5vl:7b'),
                    help='포스터 이미지를 읽을 Ollama 비전 모델 (기본 qwen2.5vl:7b)')
    ap.add_argument('--no-media', action='store_true', help='포스터 이미지·첨부파일을 읽지 않음')
    ap.add_argument('--with-news', action='store_true', help='투데이뉴스(보도 기사)도 처리')
    ap.add_argument('--with-private', action='store_true', help='이음교육시스템처럼 로그인해야 보이는 글도 처리 (공개 사이트에 올리면 로그인 없이 누구나 보게 되니 주의)')
    ap.add_argument('--timeout', type=int, default=240, help='AI 답 한 번을 기다리는 최대 시간(초, 기본 240)')
    ap.add_argument('--think', action='store_true', help='모델의 생각(thinking) 모드를 켬 (더 느림)')
    ap.add_argument('--max-minutes', type=float, default=0, help='AI를 쓰는 시간 상한(분). 넘으면 남은 새 공지는 규칙으로 먼저 정리하고 다음 실행에서 AI로 처리 (0이면 제한 없음)')
    ap.add_argument('--today', default=None, help='기준 날짜 YYYY-MM-DD (시험용)')
    return ap.parse_args(argv)


def safe_name(s: str) -> str:
    return re.sub(r'[^A-Za-z0-9._-]', '_', s)


def needs_media(raw: dict) -> bool:
    """본문이 이미지뿐이거나, 본문이 짧거나 '첨부'를 가리키는데 첨부파일이 있는 공지"""
    status = gp.body_status(raw)
    if status == 'image':
        return bool(raw.get('imgs') or md.file_list(raw))
    text = raw.get('text') or ''
    return bool(md.file_list(raw)) and (len(text) < 400 or '첨부' in text)


def read_all_media(targets: list[dict], args, ai, use_vision: bool = True) -> dict:
    """use_vision=False: 이미지 모델을 부르지 않는다 (예전에 읽어 둔 포스터 글자와 첨부파일 글자는 그대로 씀)"""
    todo = [r for r in targets if needs_media(r)]
    if not todo:
        return {}
    vision = None
    if not args.offline and use_vision:
        v = gp.Ollama(args.vision_model, host=args.host, think=None, timeout=args.timeout)
        try:
            if v.has_model():
                vision = v
            else:
                print(f'이미지를 읽을 모델 {args.vision_model} 이(가) 없어 포스터는 건너뜁니다. 받으려면:  ollama pull {args.vision_model}')
        except gp.OllamaError as e:
            print(e)
    print(f'포스터 이미지·첨부파일 읽기: {len(todo)}건' + (f' (이미지는 {args.vision_model})' if vision else ''))
    out = {}
    t0 = time.time()
    for i, raw in enumerate(todo, 1):
        t1 = time.time()
        try:
            res = md.read_notice_media(raw, vision=vision)
        except gp.OllamaError as e:
            print(f'  [{i}/{len(todo)}] {raw.get("subject", "")[:40]}  실패: {e}')
            if e.kind == 'down':
                print('  Ollama가 응답하지 않아 이미지 읽기를 멈춥니다. 첨부파일만 읽은 결과로 계속합니다.')
                vision = None
            continue
        except Exception as e:      # 깨진 파일 등 예상 못 한 오류: 그 공지만 건너뜀
            print(f'  [{i}/{len(todo)}] {raw.get("subject", "")[:40]}  건너뜀: {type(e).__name__}: {e}')
            continue
        out[raw['id']] = res
        what = ', '.join(f"{'포스터' if x['kind'] == 'poster' else x['name'][:20]} {x['chars']}자" for x in res['sources']) or '읽은 글 없음'
        err = f"  ({'; '.join(res['errors'])[:120]})" if res['errors'] else ''
        print(f'  [{i}/{len(todo)}] {raw.get("subject", "")[:40]}  {time.time() - t1:.1f}초  {what}{err}')
    got = sum(1 for r in out.values() if r['text'])
    print(f'이미지·첨부에서 글을 읽은 공지 {got}/{len(todo)}건 ({(time.time() - t0) / 60:.1f}분)\n')
    return out


def merge_duplicates(targets: list[dict]) -> tuple[list[dict], int]:
    """같은 공지가 여러 게시판에 올라온 경우(제목·날짜가 같음) 하나만 남기고 다른 게시판 이름을 alsoIn 에 적는다."""
    keep, by_key, dup = [], {}, 0
    for r in targets:
        key = (gp.squash(r.get('subject')).lower(), r.get('date'))
        first = by_key.get(key)
        if first is None:
            by_key[key] = r
            keep.append(r)
            continue
        dup += 1
        if len(r.get('text') or '') > len(first.get('text') or ''):     # 본문이 더 긴 쪽을 대표로
            r = dict(r, alsoIn=sorted(set(first.get('alsoIn', []) + [first.get('boardName')])))
            keep[keep.index(first)] = r
            by_key[key] = r
        else:
            first['alsoIn'] = sorted(set(first.get('alsoIn', []) + [r.get('boardName')]))
    return keep, dup


def title_key(subject: str | None) -> str:
    """제목에서 글자·숫자만 남긴 것 (띄어쓰기·괄호·이모지·따옴표가 달라도 같은 제목으로 보기 위해)"""
    return re.sub(r'[^0-9a-z가-힣]', '', (subject or '').lower())


def merge_reposts(targets: list[dict]) -> tuple[list[dict], int]:
    """같은 제목으로 다시 올린 글(설문 재공지, 알바 재모집 등)은 가장 최근 글 하나만 남긴다.
    targets 는 최신순으로 정렬돼 있어야 한다. 제목이 너무 짧으면(8자 미만) 우연히 같을 수 있어 합치지 않는다."""
    keep, seen, dup = [], {}, 0
    for r in targets:
        key = title_key(r.get('subject'))
        first = seen.get(key) if len(key) >= 8 else None
        if first is None:
            seen[key] = r
            keep.append(r)
            continue
        dup += 1
        also = set(first.get('alsoIn', [])) | {r.get('boardName')}
        also.discard(first.get('boardName'))
        if also:
            first['alsoIn'] = sorted(also)
    return keep, dup


def gather(args) -> list[dict] | None:
    """내보낸 JSON(여러 개)을 수집 저장소(collected/notices.json)에 합치고, 합친 공지 전체를 돌려준다."""
    paths = [Path(args.input)] if args.input else st.find_exports('notices')
    store = st.load_notices()
    if not paths and not store['notices']:
        print('kku-notices-날짜.json 파일을 찾지 못했습니다. 크롬 확장에서 공지를 모아 JSON으로 내보내세요.')
        return None
    if paths:
        store, stats = st.merge_notice_files(paths, store)
        st.save_notices(store)
        print(f'수집 파일 {stats["files"]}개를 저장소에 합침 → 새 공지 {stats["added"]}건, 내용이 바뀐 공지 {stats["updated"]}건'
              f' (저장소 전체 {len(store["notices"])}건)')
        if stats['byBoard']:
            print('  새 공지: ' + ', '.join(f'{k} {v}' for k, v in sorted(stats['byBoard'].items(), key=lambda kv: -kv[1])))
        if not args.no_archive:
            moved = st.archive([p for p in paths if p.name.startswith('kku-notices-')])
            if moved:
                print(f'  합친 파일 {len(moved)}개는 collected/원본 폴더로 옮겼습니다.')
    else:
        print(f'새로 내보낸 파일이 없어 저장소의 공지 {len(store["notices"])}건으로 처리합니다.')
    return gp.dedupe_notices(st.store_as_export(store)['notices'])


def main(argv=None) -> int:
    args = parse_args(argv)
    today = date.fromisoformat(args.today) if args.today else date.today()

    collected = gather(args)
    if collected is None:
        return 1
    glossary = gp.load_glossary()
    regs = gp.load_regulations()

    # 1) 처리할 공지 고르기
    skipped = {}
    skipped_old = 0
    targets = []
    since = today - timedelta(days=args.days) if args.days > 0 else None
    for raw in collected:
        reason = gp.skip_reason(raw, with_news=args.with_news, with_private=args.with_private)
        if reason:
            skipped[reason] = skipped.get(reason, 0) + 1
            continue
        posted = gp.norm_date(raw.get('date'))
        if since and posted and date.fromisoformat(posted) < since:
            skipped_old += 1
            continue
        targets.append(raw)
    targets.sort(key=lambda r: r.get('date') or '', reverse=True)
    targets, dup = merge_duplicates(targets)
    if dup:
        skipped['여러 게시판에 같은 공지'] = dup
    targets, reposts = merge_reposts(targets)
    if reposts:
        skipped['같은 제목 재게시'] = reposts
    if args.limit > 0:
        targets = targets[:args.limit]

    why = ', '.join([f'오래된 글 {skipped_old}건'] + [f'{k} {v}건' for k, v in skipped.items()])
    print(f'수집한 공지 {len(collected)}건 → 처리할 공지 {len(targets)}건 ({why} 제외)')
    if not targets:
        print('처리할 공지가 없습니다. --days 값을 늘려 보세요.')
        return 1

    # 2) Ollama 확인: 꺼져 있거나 모델이 없어도 멈추지 않는다. 저장된 AI 답 → 직전 결과 → 규칙 정리 순서로 채운다.
    ai = gp.Ollama(args.model, host=args.host, think=True if args.think else False, timeout=args.timeout)
    ai_on = not args.offline
    if ai_on:
        try:
            model = gp.pick_model(args.model, ai.installed_models())
            if model is None:
                print(f'Ollama에 쓸 수 있는 글 모델이 없습니다. 먼저 실행하세요:  ollama pull {args.model}')
                ai_on = False
            elif model != args.model:
                print(f'Ollama에 {args.model} 이(가) 없어 {model} 을(를) 대신 씁니다. (원래 모델을 쓰려면: ollama pull {args.model})')
                ai.model = model
        except gp.OllamaError as e:
            print(e)
            ai_on = False
        if not ai_on:
            print('→ AI 없이 진행합니다: 저장된 AI 답과 직전 결과를 쓰고, 새 공지는 규칙으로 먼저 정리합니다 (aiPending).')
    if ai_on:
        print(f'모델: {ai.model} @ {ai.host}' + (f' · AI 시간 상한 {args.max_minutes:g}분' if args.max_minutes > 0 else ''))
    no_ai = gp.NoAI(ai.model)

    # 3) 포스터 이미지·첨부파일 읽기 (먼저 몰아서 한다: 비전 모델과 글 모델을 번갈아 올리면 그래픽 메모리가 모자라 느려짐)
    media_by_id = {}
    if not args.no_media:
        media_by_id = read_all_media(targets, args, ai, use_vision=ai_on)

    # 직전 결과: 실패한 공지는 직전에 만든 결과를 그대로 유지
    previous = {}
    try:
        previous = {n['id']: n for n in gp.read_notices_js(Path(args.out)).get('notices', [])}
    except (OSError, ValueError, KeyError):
        pass
    kept_previous = 0
    by_rules = 0                 # AI 없이 규칙으로 먼저 정리한 새 공지
    budget_note = False

    # 4) 한 건씩 처리 (저장해 둔 AI 답이 있으면 재사용)
    gp.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    out_notices, failed, from_cache = [], [], 0
    dropped_total, image_only, fixed_total = 0, 0, 0
    quality = {'retried': 0, 'draft': 0, 'composed': 0, 'translationLost': 0}      # 요약 품질 검사 결과

    def tally(checks):
        sm = str(checks.get('summary') or '')
        for k in ('retried', 'draft', 'composed'):
            quality[k] += sm.startswith(k)
        quality['translationLost'] += bool(checks.get('translationLost'))

    t_start = time.time()

    def rule_notice(raw):
        n = rules.build_notice(raw, glossary, regs, today, media=media_by_id.get(raw['id']))
        if raw.get('alsoIn'):
            n['alsoIn'] = [b for b in raw['alsoIn'] if b and b != n['boardName']]
        return n

    for i, raw in enumerate(targets, 1):
        title = (raw.get('subject') or '').strip()
        cache_file = gp.CACHE_DIR / (safe_name(str(raw['id'])) + '.json')
        label = f'[{i}/{len(targets)}] {raw.get("boardName", "")} | {title[:40]}'
        cache = {}
        if not args.no_cache and cache_file.exists():
            try:
                old = json.loads(cache_file.read_text(encoding='utf-8'))
                if old.get('v') == 2:
                    cache = old.get('ai', {})
            except (OSError, json.JSONDecodeError):
                cache = {}
        t0 = time.time()
        if ai_on and args.max_minutes > 0 and t0 - t_start > args.max_minutes * 60:
            ai_on = False
            budget_note = True
            print(f'AI 시간 상한({args.max_minutes:g}분)이 지나 남은 새 공지는 규칙으로 먼저 정리합니다.')
        try:
            notice, checks = gp.process_notice(raw, ai if ai_on else no_ai, glossary, regs, today, cache=cache,
                                               media=media_by_id.get(raw['id']))
        except gp.OllamaError as e:
            old = previous.get(raw['id'])
            usable_old = old if old and not (ai_on and old.get('aiPending')) else None
            if e.kind != 'skip':
                print(f'{label}  실패: {e}' + (' → 직전 결과 유지' if usable_old else ' → 규칙으로 정리'))
                failed.append(raw['id'])
            if usable_old or (old and not ai_on):
                out_notices.append(old)
                kept_previous += 1
            else:
                out_notices.append(rule_notice(raw))
                by_rules += 1
            if e.kind == 'down' and ai_on:
                ai_on = False
                print('Ollama 서버가 응답하지 않아 남은 공지는 저장된 AI 답·직전 결과·규칙 정리로 채웁니다.')
                print('Ollama를 다시 켠 뒤 다시 실행하면 처리하지 못한 공지만 AI로 처리합니다.')
            continue
        finally:
            if cache:
                cache_file.write_text(json.dumps({'v': 2, 'id': raw['id'], 'ai': cache}, ensure_ascii=False, indent=1),
                                      encoding='utf-8')
        if raw.get('alsoIn'):
            notice['alsoIn'] = [b for b in raw['alsoIn'] if b and b != notice['boardName']]
        out_notices.append(notice)
        dropped = checks.get('dropped', [])
        dropped_total += len(dropped)
        image_only += notice['bodyStatus'] == 'image'
        fixed = checks.get('fixed', [])
        fixed_total += len(fixed)
        tally(checks)
        note = (f'  버린 값: {", ".join(dropped)}' if dropped else '') + (f'  고친 값: {", ".join(fixed)}' if fixed else '')
        if str(checks.get('summary', '')).startswith(('retried', 'draft', 'composed')):
            note += f'  요약 {checks["summary"]}'
        if checks.get('cached'):
            from_cache += 1
            print(f'{label}  (저장된 AI 답 사용){note}')
        else:
            print(f'{label}  {time.time() - t0:.1f}초{note}')

    if not out_notices:
        print('결과가 없어 파일을 쓰지 않았습니다.')
        return 3

    # 5) 파일 쓰기
    out_notices.sort(key=lambda n: n.get('date') or '', reverse=True)
    data = {
        'meta': {
            'source': 'pipeline',
            'generatedAt': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'model': ai.model if ai.calls else (args.model if args.offline else ai.model),
            'note': 'AI가 만든 요약·번역입니다. 근거 문장이 원문에 없는 값은 버렸습니다.',
            'stats': {
                'collected': len(collected), 'processed': len(out_notices), 'fromCache': from_cache,
                'failed': len(failed), 'imageOnly': image_only, 'droppedValues': dropped_total,
                'summaryRetried': quality['retried'], 'summaryDraft': quality['draft'], 'summaryComposed': quality['composed'],
                'translationLost': quality['translationLost'], 'aiPending': by_rules,
            },
        },
        'categories': gp.CATEGORIES,
        'notices': out_notices,
    }
    backup = gp.write_notices_js(Path(args.out), data)

    # 6) 저장소 정리: 마감 후 keep_days 일, 마감을 모르면 올린 뒤 180일이 지난 공지를 지움
    if args.keep_days > 0 and not args.input:
        store = st.load_notices()
        known = {n['id']: n.get('deadline') for n in out_notices}
        gone = st.prune(store, known, today, keep_days=args.keep_days)
        if gone:
            st.save_notices(store)
            for nid in gone:      # 그 공지의 AI 답·내려받은 파일도 정리
                try:
                    (gp.CACHE_DIR / (safe_name(str(nid)) + '.json')).unlink(missing_ok=True)
                except OSError:
                    pass
                shutil.rmtree(md.MEDIA_DIR / md._safe(str(nid)), ignore_errors=True)
            print(f'  기간이 지난 공지 {len(gone)}건을 저장소에서 지웠습니다 (마감 후 {args.keep_days}일, 마감을 모르면 올린 뒤 180일).')
    took = time.time() - t_start
    print()
    print(f'완료: {args.out} 에 공지 {len(out_notices)}건 저장 ({took / 60:.1f}분, AI 호출 {ai.calls}번)')
    print(f'  저장된 AI 답 재사용 {from_cache}건 · 실패 {len(failed)}건 · 본문 확인 불가 {image_only}건 · 근거가 맞지 않아 버린 값 {dropped_total}개 · 규칙으로 고친 값 {fixed_total}개')
    print(f'  요약 품질 검사: 다시 써서 통과 {quality["retried"]}건 · 초안으로 대체 {quality["draft"]}건 · 확인된 정보로 직접 만든 요약 {quality["composed"]}건 · 번역에서 날짜·금액이 빠져 숨겨질 요약 {quality["translationLost"]}건')
    if kept_previous:
        print(f'  AI 답이 없어 직전 결과를 그대로 쓴 공지 {kept_previous}건' + (' (Ollama를 켜고 실행하면 새로 처리)' if args.offline else ''))
    if by_rules:
        print(f'  AI 없이 규칙으로 먼저 정리한 새 공지 {by_rules}건 (다음 실행에서 AI가 정밀 해독' + (', 시간 상한 때문' if budget_note else '') + ')')
    if failed:
        print(f'  실패한 {len(failed)}건은 같은 명령을 한 번 더 실행하면 다시 시도합니다.')
    if backup:
        print(f'  기존 샘플 데이터는 {backup.name} 로 백업했습니다.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
