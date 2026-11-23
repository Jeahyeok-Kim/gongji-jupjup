# -*- coding: utf-8 -*-
"""파이프라인 테스트 (실제 AI 없이 '가짜 Ollama 서버'로 전체 흐름을 확인)

실행: python -m unittest tests/test_pipeline.py -v   (공지줍줍 폴더에서)
"""
import contextlib
import io
import json
import re
import urllib.parse
import zipfile
import shutil
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'pipeline'))
import gongji_pipeline as gp  # noqa: E402
import media as md  # noqa: E402
import store as st  # noqa: E402
import build_notices  # noqa: E402
import answer_key  # noqa: E402

COLLECTED = {
    'schema': 1,
    'notices': [
        {   # A: 글로 된 학사 공지. AI가 '대상' 근거를 지어내면 버려져야 함
            'id': 'www.kku.ac.kr-1-101', 'boardName': '학사공지', 'subject': '2026학년도 동계 계절학기 수강신청 안내',
            'date': '2026-11-09', 'hits': 812, 'imgs': [], 'fileCnt': 0, 'link': 'https://www.kku.ac.kr/notice/101',
            'text': '2026학년도 동계 계절학기 수강신청을 아래와 같이 안내합니다.\n1. 신청 기간: 2026. 11. 23.(월) 10:00 ~\n 11. 27.(금) 17:00\n'
                    '2. 신청 대상: 재학생 및 휴학생\n3. 신청 방법: 종합정보시스템\n※ 휴학생은 최대 3학점까지 신청할 수 있습니다.'
        },
        {   # B: 비교과 행사. 금액은 본문에 없으므로 버려져야 하고, 잘못된 행사 시간도 버려져야 함
            'id': 'www.kku.ac.kr-2-202', 'boardName': '행사안내', 'subject': '비교과 프로그램 자기소개서 클리닉 참여자 모집',
            'date': '2026-11-10', 'hits': 433, 'imgs': [], 'fileCnt': 0, 'link': 'https://www.kku.ac.kr/notice/202',
            'text': '비교과 프로그램 참여자를 모집합니다.\n신청 마감: 11월 16일(월)\n일시: 2026. 11. 18.(수) 13:00~15:00\n장소: 학생회관\n'
                    '참여자 전원 다드림 포인트 20점 지급\n대상: 재학생 누구나'
        },
        {   # C: 본문이 이미지뿐인 공지
            'id': 'www.kku.ac.kr-3-303', 'boardName': '외부행사/공모전', 'subject': '지역 관광 콘텐츠 공모전 안내',
            'date': '2026-11-08', 'hits': 205, 'text': '', 'imgs': ['{HOST}/media/poster.png'], 'fileCnt': 0,
            'link': 'https://www.kku.ac.kr/notice/303'
        },
        {   # D: 개인정보 가능성 → 제외
            'id': 'www.kku.ac.kr-4-404', 'boardName': '장학공지', 'subject': '2026학년도 2학기 장학생 선발 결과 발표(합격자 명단)',
            'date': '2026-11-11', 'hits': 999, 'text': '합격자 명단은 첨부파일을 확인하세요. ' * 3, 'imgs': [], 'fileCnt': 1
        },
        {   # E: 오래된 글 → 제외
            'id': 'www.kku.ac.kr-5-505', 'boardName': '일반공지', 'subject': '2025학년도 1학기 안내',
            'date': '2025-01-02', 'hits': 1, 'text': '오래된 공지입니다. ' * 10, 'imgs': [], 'fileCnt': 0
        },
    ]
}

EXTRACT = {
    '2026학년도 동계 계절학기 수강신청 안내': {
        'deadline': '2026-11-27 17:00', 'deadline_lines': ['신청 기간: 2026. 11. 23.(월) 10:00 ~ 11. 27.(금) 17:00'],
        'events': [], 'benefit': '', 'benefit_lines': [], 'points': 0, 'won': 0, 'prize': 0,
        'eligibility': '재학생 및 휴학생', 'eligibility_lines': ['신청 대상: 재학생, 휴학생 모두 가능'],   # 지어낸 문장
        'category': 'academic', 'hours': 0.5,
        'summary': '겨울 계절학기 수강신청은 11월 23일부터 27일 17시까지입니다.'
    },
    '비교과 프로그램 자기소개서 클리닉 참여자 모집': {
        'deadline': '2026-11-16', 'deadline_lines': ['신청 마감: 11월 16일(월)'],
        'events': [
            {'date': '2026-11-18', 'start': '13:00', 'end': '15:00', 'lines': ['일시: 2026. 11. 18.(수) 13:00~15:00']},
            {'date': '2026-11-19', 'start': '15:00', 'end': '14:00', 'lines': ['일시: 2026. 11. 18.(수) 13:00~15:00']},
        ],
        'benefit': '다드림 포인트 20점', 'benefit_lines': ['참여자 전원 다드림 포인트 20점 지급'],
        'points': 20, 'won': 50000, 'prize': 0,     # won 은 본문에 없는 숫자
        'eligibility': '재학생 누구나', 'eligibility_lines': ['대상: 재학생 누구나'],
        'category': 'dadream', 'hours': 3, 'summary': '자기소개서를 첨삭받는 비교과 프로그램입니다.'
    },
    '지역 관광 콘텐츠 공모전 안내': {
        'deadline': '2026-12-10', 'deadline_lines': ['마감 12월 10일'], 'events': [],
        'benefit': '상금 100만 원', 'benefit_lines': ['상금 100만 원'], 'points': 0, 'won': 0, 'prize': 1000000,
        'eligibility': '', 'eligibility_lines': [], 'category': 'contest', 'hours': 6, 'summary': '공모전입니다.'
    },
}

# 요약 전용 호출의 가짜 답: 첫 답은 일부러 규칙을 어기고(마감일 빠짐·너무 짧음), '앞선 요약' 이 붙은 다시 쓰기 요청에는 좋은 답을 준다
SUMMARY_FIRST = {
    '2026학년도 동계 계절학기 수강신청 안내': '겨울 계절학기 수강신청을 안내하는 공지예요. 재학생과 휴학생이 11월 27일 17시까지 신청해요.',
    '비교과 프로그램 자기소개서 클리닉 참여자 모집': '자기소개서를 첨삭받는 비교과 프로그램이에요. 재학생이면 누구나 참여할 수 있어요.',
    '지역 관광 콘텐츠 공모전 안내': '공모전이에요.',
}
SUMMARY_REWRITE = {
    '비교과 프로그램 자기소개서 클리닉 참여자 모집':
        '자기소개서 클리닉에 참여할 사람을 뽑는 공지예요. 재학생이 11월 16일까지 신청하면 다드림 포인트 20점을 받아요.',
    '지역 관광 콘텐츠 공모전 안내':
        '지역 관광 콘텐츠 공모전을 안내하는 공지예요. 12월 10일까지 접수하면 상금 100만 원을 받을 수 있어요.',
}


def _zip(files: dict) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        for k, v in files.items():
            z.writestr(k, v)
    return buf.getvalue()


HWPX = _zip({'Contents/section0.xml': '<hs:sec xmlns:hs="h" xmlns:hp="p"><hp:p><hp:run><hp:t>신청 기간: 2026. 11. 20.(금)까지</hp:t></hp:run></hp:p>'
                                     '<hp:p><hp:run><hp:t>장학금액: 300,000원</hp:t></hp:run></hp:p></hs:sec>'})
DOCX = _zip({'word/document.xml': '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>참가 대상: 재학생</w:t></w:r></w:p></w:body></w:document>'})
PNG = b'\x89PNG\r\n\x1a\n' + b'0' * 20000      # 포스터 크기 (12KB 미만은 아이콘으로 보고 건너뜀)
MEDIA_FILES = {'poster.png': PNG, 'a.hwpx': HWPX, 'b.docx': DOCX}
MEDIA_NAMES = {'a.hwpx': '장학 안내문.hwpx', 'b.docx': '참가 요강.docx'}


class FakeOllama(BaseHTTPRequestHandler):
    """Ollama 흉내: /api/tags, /api/chat"""
    requests = []

    def log_message(self, *a):
        pass

    def _send(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        try:
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass    # 시간 초과로 상대가 먼저 끊은 경우

    def do_GET(self):
        if self.path == '/api/tags':
            self._send({'models': [{'name': 'fake:latest'}, {'name': 'qwen2.5vl:7b'}]})
        elif self.path.startswith('/media/'):
            name = self.path.split('/media/', 1)[1].split('?')[0]
            data = MEDIA_FILES.get(name)
            if data is None:
                return self._send({'error': 'not found'}, 404)
            self.send_response(200)
            self.send_header('Content-Type', 'application/download')
            self.send_header('Content-Disposition', "attachment;filename=\"" + urllib.parse.quote(MEDIA_NAMES.get(name, name)) + "\"")
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            self._send({'error': 'not found'}, 404)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])).decode('utf-8'))
        FakeOllama.requests.append(body)
        system, user = body['messages'][0]['content'], body['messages'][1]['content']
        if body['messages'][1].get('images'):          # 포스터 글자 읽기 (비전 모델)
            assert body['model'] == 'qwen2.5vl:7b'
            return self._send({'model': body['model'], 'done': True, 'message': {
                'role': 'assistant', 'content': '지역 관광 콘텐츠 공모전\n접수 마감 12월 10일\n대상 상금 100만 원'}})
        assert body['stream'] is False and isinstance(body['format'], dict)
        if '느린 공지' in user:
            import time
            time.sleep(1.5)        # AI가 멈춘 상황 흉내
        if '정보를 뽑는' in system:
            lines = {}
            for l in user.splitlines():
                m = re.match(r'\[(\d+)\] (.*)', l)
                if m:
                    lines[int(m[1])] = m[2]
            content = json.loads(json.dumps(EXTRACT[lines[0]], ensure_ascii=False))

            def to_idx(quotes):   # 문장 → 그 문장이 있는 줄 번호 (없으면 엉뚱한 번호 99)
                out = []
                for q in quotes:
                    hit = [[i] for i, l in lines.items() if gp.squash(q) in gp.squash(l)]
                    hit += [[i, i + 1] for i in lines if i + 1 in lines
                            and gp.squash(q) in gp.squash(lines[i] + lines[i + 1])]   # 두 줄에 걸친 문장
                    out.extend(hit[0] if hit else [99])
                return out
            for k in ('deadline_lines', 'benefit_lines', 'eligibility_lines'):
                content[k] = to_idx(content[k])
            for ev in content['events']:
                ev['lines'] = to_idx(ev['lines'])
        elif '요약하는' in system:
            title = re.search(r'^제목: (.*)$', user, re.M).group(1)
            table = SUMMARY_REWRITE if '앞선 요약' in user else SUMMARY_FIRST
            content = {'summary': table[title]}
        else:
            items = json.loads(user.split('번역할 내용(JSON):\n', 1)[1])
            content = {lang: {k: (f'[{lang}] {v}' if v else '') for k, v in items.items()} for lang in ('en', 'zh', 'ja')}
        self._send({'model': body['model'], 'message': {'role': 'assistant', 'content': json.dumps(content, ensure_ascii=False)},
                    'done': True})


class PipelineBase(unittest.TestCase):
    """가짜 Ollama 서버와 임시 폴더 준비 (시험 묶음들이 함께 씀)"""

    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(('127.0.0.1', 0), FakeOllama)
        cls.host = f'http://127.0.0.1:{cls.server.server_port}'
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.orig_cache, self.orig_media = gp.CACHE_DIR, md.MEDIA_DIR
        self.orig_store = (st.STORE_DIR, st.ARCHIVE_DIR, st.NOTICE_DIR, st.REFERENCE_PATH)
        gp.CACHE_DIR = self.tmp / 'cache'
        md.MEDIA_DIR = self.tmp / 'media'
        st.STORE_DIR = self.tmp / 'collected'          # 실제 저장소를 건드리지 않게
        st.ARCHIVE_DIR, st.NOTICE_DIR = st.STORE_DIR / '원본', st.STORE_DIR / '공지'
        st.REFERENCE_PATH = st.STORE_DIR / 'reference.json'
        self.input = self.tmp / 'kku-notices.json'
        self.input.write_text(json.dumps(COLLECTED, ensure_ascii=False).replace('{HOST}', self.host), encoding='utf-8')
        self.out = self.tmp / 'notices.js'
        shutil.copyfile(ROOT / 'data' / 'notices.sample.js' if (ROOT / 'data' / 'notices.sample.js').exists()
                        else ROOT / 'data' / 'notices.js', self.out)   # 샘플 파일 위에 덮어쓰는 상황
        FakeOllama.requests.clear()

    def tearDown(self):
        gp.CACHE_DIR, md.MEDIA_DIR = self.orig_cache, self.orig_media
        st.STORE_DIR, st.ARCHIVE_DIR, st.NOTICE_DIR, st.REFERENCE_PATH = self.orig_store
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_build(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = build_notices.main([str(self.input), '--model', 'fake', '--host', self.host,
                                       '--out', str(self.out), '--today', '2026-11-12'])
        return code, buf.getvalue()


class PipelineTest(PipelineBase):
    def test_end_to_end(self):
        code, log = self.run_build()
        self.assertEqual(code, 0, log)
        data = gp.read_notices_js(self.out)
        by = {n['id']: n for n in data['notices']}
        self.assertEqual(set(by), {'www.kku.ac.kr-1-101', 'www.kku.ac.kr-2-202', 'www.kku.ac.kr-3-303'})
        self.assertEqual(data['meta']['source'], 'pipeline')
        self.assertTrue((self.tmp / 'notices.sample.js').exists(), '샘플 백업이 있어야 함')

        a = by['www.kku.ac.kr-1-101']
        self.assertEqual(a['deadline'], '2026-11-27T17:00')
        self.assertIsNone(a['eligibility'], '지어낸 근거 문장은 버려져야 함')
        self.assertTrue(a['evidenceVerified'])
        self.assertEqual(a['regulation']['page'], 12)
        self.assertIn('계절학기', a['terms'])
        self.assertIn('휴학', a['terms'])
        self.assertTrue(a['titleTr']['en'].startswith('[en] '))
        self.assertEqual(a['link'], 'https://www.kku.ac.kr/notice/101')

        b = by['www.kku.ac.kr-2-202']
        self.assertEqual(b['deadline'], '2026-11-16T23:59')
        self.assertEqual(b['events'], [{'date': '2026-11-18', 'start': '13:00', 'end': '15:00'}])
        self.assertEqual(b['hours'], 2.0, '행사 시간으로 계산')
        self.assertEqual(b['benefit']['points'], 20)
        self.assertIsNone(b['benefit']['won'], '근거 문장에 없는 금액은 버려야 함')
        self.assertEqual(b['category'], 'dadream')
        self.assertIn('비교과', b['terms'])
        self.assertIn('다드림 포인트', b['terms'])
        self.assertEqual(b['eligibility']['zh'], '[zh] 재학생 누구나')

        c = by['www.kku.ac.kr-3-303']
        self.assertEqual(c['bodyStatus'], 'poster', '포스터 글자를 읽어서 처리')
        self.assertEqual(c['deadline'], '2026-12-10T23:59')
        self.assertEqual(c['benefit']['prize'], 1000000)
        self.assertEqual(c['readFrom'], [{'kind': 'poster', 'name': '본문 이미지 1'}])
        self.assertEqual(c['category'], 'contest')

        # 요약: 모든 공지가 같은 문체(해요체)이고, 확인된 마감일이 들어 있고, 부족했던 요약은 다시 써서 통과
        for n in (a, b, c):
            self.assertEqual(gp.summarize.problem(n['summary']['ko'], n['title'], {'deadline': n['deadline'], 'benefit': n['benefit']}), None)
        self.assertIn('11월 16일', b['summary']['ko'])
        self.assertIn('20점', b['summary']['ko'])
        self.assertIn('12월 10일', c['summary']['ko'])
        self.assertTrue(b['summary']['en'].startswith('[en] '))
        st_ = data['meta']['stats']
        self.assertEqual((st_['summaryRetried'], st_['summaryDraft'], st_['summaryComposed'], st_['translationLost']), (2, 0, 0, 0))

        # 원문 전체를 결과 파일에 넣지 않았는지 (본문의 다른 문장이 없어야 함)
        self.assertNotIn('종합정보시스템', self.out.read_text(encoding='utf-8'))

        # 두 번째 실행은 저장된 결과를 써서 AI를 다시 부르지 않음
        calls = len(FakeOllama.requests)
        code, log = self.run_build()
        self.assertEqual(code, 0)
        self.assertEqual(len(FakeOllama.requests), calls)
        self.assertIn('저장된 AI 답 사용', log)

    def test_no_vision_model_keeps_image_only(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            build_notices.main([str(self.input), '--model', 'fake', '--host', self.host, '--vision-model', 'none:1b',
                                '--out', str(self.out), '--today', '2026-11-12'])
        self.assertIn('ollama pull none:1b', buf.getvalue())
        c = {n['id']: n for n in gp.read_notices_js(self.out)['notices']}['www.kku.ac.kr-3-303']
        self.assertEqual(c['bodyStatus'], 'image')
        self.assertEqual(c['summary']['ko'], gp.IMAGE_SUMMARY['ko'])

    def test_attachments(self):
        raw = {'id': 'att-1', 'text': '', 'imgs': [], 'fileCnt': 2,
               'files': [{'seq': 1, 'url': self.host + '/media/a.hwpx'}, {'seq': 2, 'url': self.host + '/media/b.docx'},
                         {'seq': 3, 'url': self.host + '/media/없음.pdf'}]}
        res = md.read_notice_media(raw, vision=None)
        self.assertIn('신청 기간: 2026. 11. 20.(금)까지', res['text'])
        self.assertIn('참가 대상: 재학생', res['text'])
        self.assertEqual([x['name'] for x in res['sources']], ['장학 안내문.hwpx', '참가 요강.docx'], '한글 파일 이름 그대로')
        self.assertTrue(any('받기 실패' in e for e in res['errors']))
        self.assertTrue((md.MEDIA_DIR / 'att-1' / '장학 안내문.hwpx').exists())
        # 두 번째는 다시 받지 않고 저장된 결과
        res2 = md.read_notice_media(dict(raw, files=raw['files'][:2]), vision=None)
        self.assertEqual(res2['text'], res['text'])

    def test_store_merge_and_prune(self):
        from datetime import date
        a = self.tmp / 'kku-notices-2026-11-01.json'
        b = self.tmp / 'kku-notices-2026-11-10.json'
        n1 = {'id': 'x-1', 'boardName': '학사공지', 'subject': '수강신청 안내', 'date': '2026-11-01', 'text': '본문', 'collectedAt': 1}
        n2 = {'id': 'x-2', 'boardName': '장학공지', 'subject': '장학 안내', 'date': '2026-05-01', 'text': '본문', 'collectedAt': 1}
        a.write_text(json.dumps({'notices': [n1, n2]}, ensure_ascii=False), encoding='utf-8')
        b.write_text(json.dumps({'notices': [dict(n1, text='고친 본문', collectedAt=2),
                                             {'id': 'x-3', 'boardName': '학사공지', 'subject': '새 공지', 'date': '2026-11-09',
                                              'text': '본문', 'collectedAt': 2}]}, ensure_ascii=False), encoding='utf-8')
        store, stats = st.merge_notice_files([a, b])
        self.assertEqual((stats['added'], stats['updated']), (3, 1))
        self.assertEqual(store['notices']['x-1']['text'], '고친 본문', '더 최근에 모은 내용으로')
        st.save_notices(store)
        self.assertEqual(sorted(p.name for p in st.NOTICE_DIR.glob('*.json')), ['_지운목록.json', '장학공지.json', '학사공지.json'])
        # 보관 기간(기본 6개월 → 2026-06-10 이후)은 마감이 지나도 남기고, 그보다 오래되고 마감을 모르는 공지만 지움
        gone = st.prune(store, {'x-1': '2026-11-05T23:59', 'x-3': None}, date(2026, 12, 10))
        self.assertEqual(gone, ['x-2'])
        self.assertIn('x-1', store['notices'], '마감이 지나도 보관 기간 안이면 남김 (지난 공지 다시 보기)')
        st.save_notices(store)
        since = st.months_ago(date(2026, 12, 10), 6)
        store2, stats2 = st.merge_notice_files([a, b], st.load_notices(), since=since)
        self.assertEqual(sorted(store2['notices']), ['x-1', 'x-3'])
        self.assertEqual(stats2['skippedRemoved'], 1, '보관 기간보다 오래된 공지는 다시 들어오지 않음')
        # 보관 기간을 1년으로 늘리면 그 안의 지운 공지는 되살린다
        store3, stats3 = st.merge_notice_files([a], st.load_notices(), since=st.months_ago(date(2026, 12, 10), 12))
        self.assertEqual(stats3['restored'], 1)
        self.assertIn('x-2', store3['notices'])
        self.assertNotIn('x-2', store3['removed'])
        moved = st.archive([a, b])
        self.assertEqual(len(moved), 2)
        self.assertFalse(a.exists())

    def test_duplicates_across_boards(self):
        rows = [{'id': '1', 'boardName': '학사공지', 'subject': '예비군 훈련 안내', 'date': '2026-11-01', 'text': '짧음'},
                {'id': '2', 'boardName': '일반공지', 'subject': '예비군 훈련  안내', 'date': '2026-11-01', 'text': '더 긴 본문입니다'},
                {'id': '3', 'boardName': '일반공지', 'subject': '다른 공지', 'date': '2026-11-01', 'text': ''}]
        keep, dup = build_notices.merge_duplicates(rows)
        self.assertEqual(dup, 1)
        self.assertEqual([r['id'] for r in keep], ['2', '3'])
        self.assertEqual(keep[0]['alsoIn'], ['학사공지'])

    def test_reposts_keep_latest(self):
        # 같은 제목으로 다시 올린 글은 최신 하나만. 짧은 제목은 우연히 같을 수 있어 합치지 않는다.
        rows = [{'id': '3', 'boardName': '일반공지', 'subject': "🧑\u200d🏫[재택근무] '설탭'과 함께 성장", 'date': '2026-11-10'},
                {'id': '2', 'boardName': '아르바이트', 'subject': '[재택근무] 설탭 과 함께 성장', 'date': '2026-10-20'},
                {'id': '1', 'boardName': '일반공지', 'subject': '[재택근무] 설탭과 함께 성장', 'date': '2026-10-01'},
                {'id': '5', 'boardName': '일반공지', 'subject': '안내', 'date': '2026-10-01'},
                {'id': '4', 'boardName': '학사공지', 'subject': '안내', 'date': '2026-09-01'}]
        keep, dup = build_notices.merge_reposts(rows)
        self.assertEqual(dup, 2)
        self.assertEqual([r['id'] for r in keep], ['3', '5', '4'])
        self.assertEqual(keep[0]['alsoIn'], ['아르바이트'])

    def test_hwp_surrogates_and_placeholder(self):
        # 이모지(서로게이트 쌍)가 든 hwp 글자는 한 글자로 합치고, 짧은 안내문 첨부는 읽을 것이 없다고 본다
        rec = ('가' + '\U0001F600' + '나').encode('utf-16-le')
        self.assertEqual(md._hwp_para_text(rec), '가😀나')
        self.assertEqual(md.scrub('가\ud800나'), '가나')
        f = md.MEDIA_DIR / 'ph.hwpx'
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(b'This attachment is not available.')
        self.assertEqual(md.attachment_text(f), '')

    def test_broken_memo_is_rebuilt(self):
        # 이전 실행이 저장 도중 끊겨 빈 파일이 남아도 멈추지 않고 다시 읽음
        raw = {'id': 'att-2', 'text': '', 'imgs': [], 'fileCnt': 1, 'files': [{'seq': 1, 'url': self.host + '/media/a.hwpx'}]}
        folder = md.MEDIA_DIR / 'att-2'
        folder.mkdir(parents=True)
        (folder / 'read.json').write_text('', encoding='utf-8')
        (folder / 'index.json').write_text('{"끊긴', encoding='utf-8')
        res = md.read_notice_media(raw, vision=None)
        self.assertIn('장학금액: 300,000원', res['text'])
        self.assertTrue(json.loads((folder / 'read.json').read_text(encoding='utf-8')))

    def test_tiny_images_skipped(self):
        p = self.tmp / 'icon.png'
        p.write_bytes(b'\x89PNG\r\n\x1a\n' + b'0' * 500)
        self.assertTrue(md.is_tiny_image(p))

    def test_old_records_get_file_urls(self):
        raw = {'host': 'www.kku.ac.kr', 'site': 2, 'board': 27, 'bbsSeq': 120877, 'fileCnt': 2, 'fileName': 'a.pdf'}
        fl = md.file_list(raw)
        self.assertEqual(fl[1]['url'], 'https://www.kku.ac.kr/ajaxFile/FR_SVC/FileDown.do?BOARD_SEQ=27&SITE_NO=2&BBS_SEQ=120877&FILE_SEQ=2')
        self.assertEqual(fl[0]['name'], 'a.pdf')

    def test_timeout_skips_one_notice(self):
        # 한 공지에서 AI가 멈춰도 그 공지만 실패로 두고 나머지는 계속 처리
        data = json.loads(self.input.read_text(encoding='utf-8'))
        slow = dict(data['notices'][0], id='slow-1', subject='느린 공지 안내')
        data['notices'].append(slow)
        EXTRACT['느린 공지 안내'] = EXTRACT['2026학년도 동계 계절학기 수강신청 안내']
        self.input.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = build_notices.main([str(self.input), '--model', 'fake', '--host', self.host, '--timeout', '1',
                                       '--out', str(self.out), '--today', '2026-11-12'])
        log = buf.getvalue()
        self.assertEqual(code, 0, log)
        self.assertIn('느린 공지 안내  실패: 응답 시간 초과', log)
        by = {n['id']: n for n in gp.read_notices_js(self.out)['notices']}
        self.assertEqual(set(by), {'www.kku.ac.kr-1-101', 'www.kku.ac.kr-2-202', 'www.kku.ac.kr-3-303', 'slow-1'})
        self.assertTrue(by['slow-1'].get('aiPending'), '멈춘 공지는 빠지지 않고 규칙 정리로 먼저 보임')
        self.assertFalse(by['www.kku.ac.kr-1-101'].get('aiPending'))

    def test_answer_key(self):
        self.run_build()
        key = self.tmp / 'key.csv'
        with contextlib.redirect_stdout(io.StringIO()):
            answer_key.main(['make', str(self.input), '--n', '30', '--out', str(key), '--today', '2026-11-12'])
        import csv
        with key.open(encoding='utf-8-sig') as f:
            rows = list(csv.reader(f))
        self.assertEqual(len(rows) - 1, 2, '글로 된 공지 2건만 뽑힘 (이미지·개인정보 제외)')
        answers = {'www.kku.ac.kr-1-101': ['2026-11-27 17:00', '', '', 'academic'],
                   'www.kku.ac.kr-2-202': ['2026-11-16', '20', '', 'dadream']}
        for r in rows[1:]:
            r[4:8] = answers[r[0]]
        with key.open('w', encoding='utf-8-sig', newline='') as f:
            csv.writer(f).writerows(rows)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            answer_key.main(['check', '--key', str(key), '--notices', str(self.out)])
        self.assertIn('전체: 8/8 (100%)', buf.getvalue())


class RuleTest(unittest.TestCase):
    def test_numbers(self):
        self.assertTrue(gp.number_in_text(20, '참여자 다드림 포인트 20점'))
        self.assertFalse(gp.number_in_text(20, '2026학년도 안내'))
        self.assertTrue(gp.number_in_text(500000, '1인당 500,000원'))
        self.assertTrue(gp.number_in_text(500000, '1인당 50만 원'))
        self.assertFalse(gp.number_in_text(700000, '1인당 500,000원'))

    def test_dates(self):
        self.assertEqual(gp.norm_datetime('2026-11-20'), '2026-11-20T23:59')
        self.assertEqual(gp.norm_datetime('2026-11-20 9:05'), '2026-11-20T09:05')
        self.assertIsNone(gp.norm_datetime('2026-13-01'))
        self.assertIsNone(gp.norm_datetime('11월 20일'))
        self.assertEqual(gp.fix_year('2026-01-10T17:00', '2026-12-20'), '2027-01-10T17:00')
        self.assertEqual(gp.fix_year('2026-11-20T17:00', '2026-11-10'), '2026-11-20T17:00')

    def test_evidence(self):
        self.assertTrue(gp.verify_evidence('신청 기간: 2026. 11. 23.(월)\n10:00', '신청 기간:2026.11.23.(월) 10:00'))
        self.assertFalse(gp.verify_evidence('신청 기간: 11월 23일', '신청 기간: 11월 24일'))
        self.assertFalse(gp.verify_evidence('본문', ''))

    def test_regulation_and_terms(self):
        regs = gp.load_regulations()
        self.assertEqual(gp.find_regulation('2027학년도 1학기 복학 신청 안내', '', regs)['id'], 'return')
        self.assertEqual(gp.find_regulation('학사경고 예방 상담', '', regs)['id'], 'probation')
        self.assertIsNone(gp.find_regulation('전과목 성적 공개 안내', '', regs), '전과목은 전과가 아님')
        self.assertIsNone(gp.find_regulation('취업 특강', '휴학 관련 문의는 1회만 언급', regs))
        glossary = gp.load_glossary()
        self.assertEqual(gp.find_terms('TOPIK 대비 특강', '', glossary), ['특강', 'TOPIK'])

    def test_lines_and_dates(self):
        lines = gp.numbered_lines('제목', '1. 신청 기간: 2026. 11. 23.(월) ~\n\n 11. 27.(금) 17:00\n가' * 1)
        self.assertEqual(lines, ['제목', '1. 신청 기간: 2026. 11. 23.(월) ~', '11. 27.(금) 17:00', '가'])
        self.assertEqual(gp.pick_lines(lines, [1, 2]), lines[1] + '\n' + lines[2])
        self.assertIsNone(gp.pick_lines(lines, [9]), '없는 줄 번호')
        self.assertIsNone(gp.pick_lines(lines, []))
        self.assertTrue(gp.date_in_text('2026-11-27', '11. 27.(금) 17:00'))
        self.assertTrue(gp.date_in_text('2026-10-20', '2026. 10. 2.(금) ~ 10. 20.(화) 23:59까지'))
        self.assertFalse(gp.date_in_text('2026-11-28', '11. 27.(금) 17:00'), '날짜가 근거 줄과 다르면 버림')
        long = '가나다 ' * 100
        self.assertTrue(all(len(x) <= 180 for x in gp.split_long_line(long)))

    def test_news_deadline_dropped(self):
        # 보도 기사에 AI가 마감일을 지어내도, 근거 줄에 그 날짜가 없으면 버려짐
        lines = gp.numbered_lines('학과, 공모전 대상 수상', '지난 10월 3일 열린 공모전에서 대상을 받았다.')
        checks = {}
        ex = gp.clean_extraction({'deadline': '2026-11-20', 'deadline_lines': [1]}, lines, '2026-11-01', checks)
        self.assertIsNone(ex['deadline'])
        self.assertIn('deadline(근거 줄에 날짜 없음)', checks['dropped'])

    def test_summary_numbers(self):
        src = '6. 장학금액: 500,000원\n신청기간: 10. 20.까지'
        checks = {}
        self.assertEqual(gp.check_summary('10월 20일까지 신청해요. 50만 원을 받아요.', src, checks),
                         '10월 20일까지 신청해요. 50만 원을 받아요.')
        self.assertEqual(gp.check_summary('10월 20일까지 신청해요. 70만 원을 받아요.', src, checks), '10월 20일까지 신청해요.')
        self.assertIn('summary(원문에 없는 숫자)', checks['dropped'])

    def test_currency(self):
        self.assertEqual(gp.fix_currency('50만 원', '50万円の奨学金', 'ja'), '50万ウォンの奨学金')
        self.assertEqual(gp.fix_currency('50만 원', '50万日元奖学金', 'zh'), '50万韩元奖学金')
        self.assertEqual(gp.fix_currency('500,000원', '500,000 yen', 'en'), '500,000 won')
        self.assertEqual(gp.fix_currency('1만 엔', '1万円', 'ja'), '1万円', '원래 엔이면 그대로')

    def test_skip_boards(self):
        self.assertEqual(gp.skip_reason({'boardName': 'Q&A', 'subject': '문의'}), '학생 대상 아님')
        self.assertEqual(gp.skip_reason({'boardName': '투데이뉴스', 'subject': '수상'}), '보도 기사')
        self.assertIsNone(gp.skip_reason({'boardName': '투데이뉴스', 'subject': '수상'}, with_news=True))
        self.assertEqual(gp.skip_reason({'boardName': '아르바이트', 'subject': 'TEST'}), '시험 글')
        self.assertIsNone(gp.skip_reason({'boardName': '장학공지', 'subject': '다자녀장학 신청 안내'}))

    def test_range_deadline(self):
        q = '가. 희망근로지 신청기간 : 2026. 10. 30.(금) 09:00 ~ 11. 12.(목) 18:00'
        self.assertEqual(gp.fix_range_deadline('2026-10-30T23:59', q), '2026-11-12T18:00')
        self.assertEqual(gp.fix_range_deadline('2026-10-24T23:59', '1. 지원서접수기간: 10월 24일(토) ~ 11월 2일(일) 까지'),
                         '2026-11-02T23:59')
        self.assertEqual(gp.fix_range_deadline('2026-12-20T23:59', '신청: 2026. 12. 20. ~ 1. 5.'), '2027-01-05T23:59')
        self.assertEqual(gp.fix_range_deadline('2026-11-12T18:00', q), '2026-11-12T18:00', '이미 끝 날짜면 그대로')
        self.assertEqual(gp.fix_range_deadline('2026-11-03T23:59', '일시: 2026. 11. 3.(화) 14:00 ~ 17:00'),
                         '2026-11-03T23:59', '같은 날 시각 범위는 그대로')

    def test_money_and_points(self):
        lines = ['다자녀장학', '6. 장학금액: 500,000원(등록금성)', '창업마일리지 200점 부여', '대상 상금 300만원']
        ch = {}
        ex = gp.clean_extraction({'benefit': '500,000원', 'benefit_lines': [1], 'won': 0}, lines, '2026-10-02', ch)
        self.assertEqual(ex['benefit']['won'], 500000, 'AI가 금액을 비워도 혜택 글에서 읽음')
        ex = gp.clean_extraction({'benefit': '창업마일리지 200점', 'benefit_lines': [2], 'points': 200}, lines, '2026-10-02', ch)
        self.assertIsNone(ex['benefit']['points'], '다드림 포인트가 아니면 버림')
        ex = gp.clean_extraction({'benefit': '대상 상금 300만원', 'benefit_lines': [3]}, lines, '2026-10-02', ch)
        self.assertEqual((ex['benefit']['won'], ex['benefit']['prize']), (None, 3000000), '상금은 prize')

    def test_category_rules(self):
        self.assertEqual(gp.refine_category('etc', '아르바이트', '홀서빙 구합니다', None), 'career')
        self.assertEqual(gp.refine_category('etc', '일반공지', '2027학년도 1학기 모시래ㆍ해오름 관생모집', None), 'dorm')
        self.assertEqual(gp.refine_category('contest', '학사공지', '수기 공모전', {'points': 30}), 'dadream')
        self.assertEqual(gp.refine_category('academic', '학사공지', '수강신청', None), 'academic')

    def test_translated_numbers(self):
        ko = '2026년 10월 20일까지 신청할 수 있어요. 장학금은 500,000원이에요.'
        ja = '2026年10月20日まで申請できます。支援額は50,000ウォンです。'
        self.assertEqual(gp.check_translated_numbers(ko, ja), '2026年10月20日まで申請できます。')
        self.assertEqual(gp.check_translated_numbers('50만 원', '50万ウォン'), '50万ウォン')
        self.assertEqual(gp.check_translated_numbers(ko, 'Apply by October 20, 2026. The amount is 500,000 won.'),
                         'Apply by October 20, 2026. The amount is 500,000 won.')

    def test_wrong_deadline_sentence(self):
        wrong, right = '2026-10-30T23:59', '2026-11-12T18:00'
        self.assertEqual(gp.drop_wrong_date('마감일은 10월 30일입니다. 시간당 12,790원을 받아요.', wrong, right),
                         '시간당 12,790원을 받아요.')
        self.assertEqual(gp.drop_wrong_date('The deadline is October 30. You get 12,790 won per hour.', wrong, right),
                         'You get 12,790 won per hour.')
        self.assertEqual(gp.drop_wrong_date('10월 30일부터 11월 12일까지 신청해요.', wrong, right), '10월 30일부터 11월 12일까지 신청해요.')

    def test_body_status(self):
        self.assertEqual(gp.body_status({'text': '짧음', 'imgs': ['a.jpg']}), 'image')
        self.assertEqual(gp.body_status({'text': '짧음', 'fileCnt': 2}), 'image')
        self.assertEqual(gp.body_status({'text': '가' * 50, 'imgs': ['a.jpg']}), 'text')


# ------------------------------------------------------------------
# 요약 문체 통일 · 품질 검사 · 번역 보정 (가짜 AI 호출을 직접 넣어서 시험)
# ------------------------------------------------------------------
import summarize as sm  # noqa: E402

EX = {'deadline': '2026-11-16T23:59', 'benefit': {'ko': '다드림 포인트 20점', 'points': 20, 'won': None},
      'eligibility': '재학생 누구나', 'events': [{'date': '2026-11-18', 'start': '13:00', 'end': '15:00'}]}
TITLE = '비교과 프로그램 자기소개서 클리닉 참여자 모집'
GOOD = '자기소개서 클리닉에 참여할 사람을 뽑는 공지예요. 재학생이 11월 16일까지 신청하면 다드림 포인트 20점을 받아요.'


class Script:
    """ask(part, system, user, schema) 흉내: 미리 정한 답을 차례로 돌려주고, 부른 기록을 남긴다. 예외 객체면 그것을 던진다."""
    def __init__(self, *answers):
        self.answers, self.calls = list(answers), []

    def __call__(self, part, system, user, schema):
        self.calls.append((part, user))
        a = self.answers.pop(0)
        if isinstance(a, Exception):
            raise a
        return a


def S(text):
    return {'summary': text}


class SummaryRuleTest(unittest.TestCase):
    def test_problem_kinds(self):
        P = lambda s, ex=EX, t=TITLE: sm.problem(s, t, ex)   # noqa: E731
        self.assertIsNone(P(GOOD))
        self.assertEqual(P(''), 'empty')
        self.assertEqual(P('  \n '), 'empty')
        self.assertEqual(P('공모전이에요.'), 'short')
        self.assertEqual(P(GOOD * 3), 'long')
        self.assertEqual(P('가나다. ' * 4 + '라마바사아자차카타파하'), 'long')           # 문장 수가 많음
        self.assertEqual(P('- ' + GOOD), 'format')
        self.assertEqual(P(GOOD.replace('. ', '.\n')), 'format')
        self.assertEqual(P('**' + GOOD + '**'), 'format')
        self.assertEqual(P(TITLE + '입니다'), 'title')                                      # 제목 베끼기
        self.assertEqual(P('자기소개서 클리닉에 참여할 사람을 뽑는 공지예요. 재학생이 신청하면 다드림 포인트 20점을 받아요.'), 'deadline')
        self.assertEqual(P('자기소개서 클리닉에 참여할 사람을 뽑는 공지예요. 재학생이 11월 16일까지 신청하면 포인트를 받아요.'), 'points')
        # 마감이 없는 공지는 마감일을 요구하지 않는다
        self.assertIsNone(P('자기소개서 클리닉에 참여할 사람을 뽑는 공지예요. 재학생이면 누구나 참여해요.', {'deadline': None, 'benefit': None}))
        # '1일' 과 '16일' 을 헷갈리지 않는다
        self.assertEqual(P('자기소개서 클리닉에 참여할 사람을 뽑는 공지예요. 재학생이 11월 6일까지 신청하면 다드림 포인트 20점을 받아요.'), 'deadline')

    def test_iyo_and_clean(self):
        self.assertEqual(sm.iyo('재학생'), '이에요')
        self.assertEqual(sm.iyo('학교'), '예요')
        self.assertEqual(sm.iyo('장학금 100만 원'), '이에요')
        self.assertEqual(sm.iyo('abc'), '예요')
        self.assertEqual(sm.clean('"**첫 줄이에요.**\n- 둘째 줄이에요."'), '첫 줄이에요. 둘째 줄이에요.')

    def test_compose_always_passes_the_check(self):
        for ex in (EX, {'deadline': '2026-11-16T23:59', 'benefit': None, 'eligibility': None, 'events': []},
                   {'deadline': None, 'benefit': None, 'eligibility': None, 'events': []},
                   {'deadline': None, 'benefit': None, 'eligibility': '재학생', 'events': [{'date': '2026-11-18', 'start': '13:00'}]},
                   {'deadline': '2026-11-16T17:30', 'benefit': {'ko': '상금 100만 원', 'points': None, 'won': None, 'prize': 1000000},
                    'eligibility': '재학생 누구나', 'events': []}):
            text = sm.compose(ex, '다드림 포인트')
            self.assertEqual(sm.problem(text, '전혀 다른 제목의 공지', ex), None, text)
            self.assertLessEqual(sm.sentence_count(text), sm.MAX_SENTENCES, text)
        self.assertIn('11월 16일까지', sm.compose(EX))
        self.assertIn('원문을 확인', sm.compose({'deadline': None, 'benefit': None, 'eligibility': None, 'events': []}))
        self.assertIn('17시 30분', sm.compose({'deadline': '2026-11-16T17:30', 'events': []}))
        self.assertNotIn('23시', sm.compose(EX), '23:59 는 "그날 끝"이라 시각을 말하지 않음')

    def test_lost_facts(self):
        ko = '2026년 11월 16일까지 신청하면 장학금 50만 원을 받아요.'
        self.assertEqual(sm.lost_facts(ko, 'Apply by Nov 16, 2026 to get 500,000 won.'), [])
        self.assertEqual(sm.lost_facts(ko, 'Apply by Nov 16 to get 500,000 won.'), ['2026'])
        self.assertEqual(sm.lost_facts(ko, 'Apply this month, 2026, for a scholarship of 500,000 won.'), ['11월 16일'])
        self.assertEqual(sm.lost_facts(ko, 'Apply by Nov 16, 2026 for a scholarship.'), ['금액'])
        self.assertEqual(sm.lost_facts('11월 6일까지', 'Until Nov 16'), ['11월 6일'])        # 16 속의 6 은 6일이 아님
        self.assertEqual(sm.lost_facts('', 'anything'), [])


class BuildSummaryTest(unittest.TestCase):
    def build(self, ask, draft='', ex=EX, guard=None):
        checks = {}
        out = sm.build_summary(ask, draft, TITLE, '행사안내', '2026-11-10', '본문', ex, '다드림 포인트', checks, guard=guard)
        return out, checks

    def test_good_first_answer_is_used_as_is(self):
        ask = Script(S(GOOD))
        out, checks = self.build(ask)
        self.assertEqual((out, checks['summary'], len(ask.calls)), (GOOD, 'ok', 1))
        self.assertEqual(ask.calls[0][0], 'summary')
        self.assertIn('확인된 정보(JSON)', ask.calls[0][1])
        self.assertIn('다드림 포인트 20점', ask.calls[0][1])        # 확인된 정보가 프롬프트에 들어감

    def test_bad_first_answer_is_rewritten_once_with_the_reason(self):
        ask = Script(S('공모전이에요.'), S(GOOD))
        out, checks = self.build(ask)
        self.assertEqual(out, GOOD)
        self.assertEqual(checks['summary'], 'retried(short)')
        self.assertEqual([c[0] for c in ask.calls], ['summary', 'summary2'])
        self.assertIn('앞선 요약(고쳐 쓸 것): 공모전이에요.', ask.calls[1][1])
        self.assertIn(sm.REASON_TEXT['short'], ask.calls[1][1])

    def test_two_bad_answers_fall_back_to_a_good_draft(self):
        draft = GOOD.replace('자기소개서 클리닉에 참여할 사람을 뽑는 공지예요', '자기소개서를 첨삭해 주는 프로그램이에요')
        ask = Script(S('짧아요.'), S(TITLE))
        out, checks = self.build(ask, draft=draft)
        self.assertEqual(out, draft)
        self.assertEqual(checks['summary'], 'draft(short)')

    def test_everything_bad_composes_from_verified_facts(self):
        ask = Script(S(''), S('여전히 짧아요'))
        out, checks = self.build(ask, draft='초안도 짧아요')
        self.assertEqual(checks['summary'], 'composed(empty)')
        self.assertIsNone(sm.problem(out, TITLE, EX))
        self.assertIn('11월 16일', out)
        self.assertIn('다드림 포인트 20점', out)         # 문장은 세 개까지라서 대상은 빠지고 혜택과 마감이 남는다

    def test_ai_failure_does_not_repeat_the_same_request(self):
        for kind in ('timeout', 'bad'):
            err = gp.OllamaError('멈춤', kind)
            ask = Script(err)
            out, checks = self.build(ask)
            self.assertEqual(len(ask.calls), 1, kind)                    # 시간 초과인데 또 부르면 공지 하나가 몇 분씩 걸림
            self.assertEqual(checks['summary'], 'composed(error)')
            self.assertIsNone(sm.problem(out, TITLE, EX))

    def test_server_down_is_not_swallowed(self):
        with self.assertRaises(gp.OllamaError) as cm:
            self.build(Script(gp.OllamaError('꺼짐', 'down')))
        self.assertEqual(cm.exception.kind, 'down')

    def test_guard_removes_made_up_sentences_before_the_check(self):
        made_up = GOOD + ' 신청비는 5만 원이에요.'
        guard = lambda t: t.replace(' 신청비는 5만 원이에요.', '')                    # noqa: E731
        out, checks = self.build(Script(S(made_up)), guard=guard)
        self.assertEqual((out, checks['summary']), (GOOD, 'ok'))

    def test_ai_answer_decoration_is_removed(self):
        out, _ = self.build(Script(S('"' + GOOD + '"')))
        self.assertEqual(out, GOOD)
        out, _ = self.build(Script({'unexpected': 1}, S(GOOD)))                   # summary 키가 없는 답
        self.assertEqual(out, GOOD)

    def test_system_prompt_carries_the_style_rules(self):
        self.assertIn('해요체', sm.SUMMARY_SYSTEM)
        self.assertIn('마감일', sm.SUMMARY_SYSTEM)
        self.assertEqual(sm.SUMMARY_SCHEMA['required'], ['summary'])


class TranslationFixTest(unittest.TestCase):
    KO = '2026년 11월 16일까지 신청하면 장학금 50만 원을 받아요.'
    ITEMS = {'title': '제목', 'summary': KO, 'benefit': '', 'eligibility': ''}

    def tr(self, **over):
        base = {'en': 'Apply by Nov 16, 2026 for 500,000 won.', 'zh': '2026年11月16日前申请可获得50万韩元。',
                'ja': '2026年11月16日までに申請すると50万ウォンがもらえます。'}
        base.update(over)
        return {l: {'title': 'T', 'summary': v, 'benefit': '', 'eligibility': ''} for l, v in base.items()}

    def again(self, **over):
        t = self.tr(**over)
        return {l: dict(v) for l, v in t.items()}

    def test_nothing_lost_makes_no_call(self):
        ask, checks, tr = Script(), {}, self.tr()
        gp.fix_translation(ask, tr, self.ITEMS, [], {}, checks)
        self.assertEqual((ask.calls, checks), ([], {}))

    def test_lost_date_is_retranslated_once(self):
        tr, checks = self.tr(en='Apply soon for a scholarship of 500,000 won.'), {}
        fixed = {l: {'title': 'T', 'summary': v['summary'], 'benefit': '', 'eligibility': ''} for l, v in self.tr().items()}
        ask = Script(fixed)
        gp.fix_translation(ask, tr, self.ITEMS, [], {}, checks)
        self.assertEqual([c[0] for c in ask.calls], ['translate2'])
        self.assertIn('앞선 번역에서 다음 값이 빠졌다', ask.calls[0][1])
        self.assertIn('en:', ask.calls[0][1])
        self.assertEqual(tr['en']['summary'], 'Apply by Nov 16, 2026 for 500,000 won.')
        self.assertEqual(checks['translationRetried'], ['en'])
        self.assertNotIn('translationLost', checks)

    def test_still_lost_is_recorded_for_the_web_app(self):
        tr, checks = self.tr(ja='まもなく申請できます。'), {}
        ask = Script({'en': {}, 'zh': {}, 'ja': {'summary': 'もうすぐ締め切りです。', 'title': 'T', 'benefit': '', 'eligibility': ''}})
        gp.fix_translation(ask, tr, self.ITEMS, [], {}, checks)
        self.assertEqual(checks['translationLost'], ['ja'])
        self.assertEqual(checks['translationRetried'], ['ja'])

    def test_failed_retry_keeps_the_old_translation_and_marks_it(self):
        for kind in ('timeout', 'bad'):
            tr, checks = self.tr(zh='请尽快申请。'), {}
            gp.fix_translation(Script(gp.OllamaError('x', kind)), tr, self.ITEMS, [], {}, checks)
            self.assertEqual(tr['zh']['summary'], '请尽快申请。')
            self.assertEqual(checks['translationLost'], ['zh'])

    def test_server_down_is_not_swallowed(self):
        with self.assertRaises(gp.OllamaError):
            gp.fix_translation(Script(gp.OllamaError('x', 'down')), self.tr(en='soon'), self.ITEMS, [], {}, {})

    def test_empty_summary_is_skipped(self):
        ask, checks = Script(), {}
        gp.fix_translation(ask, self.tr(en=''), {**self.ITEMS, 'summary': ''}, [], {}, checks)
        self.assertEqual((ask.calls, checks), ([], {}))


class PrivateNoticeTest(unittest.TestCase):
    def test_private_notice_skipped_by_default(self):
        raw = {'boardName': '이음교육시스템 공지', 'subject': '장학 안내', 'private': True}
        self.assertIsNotNone(gp.skip_reason(raw))
        self.assertIsNone(gp.skip_reason(raw, with_private=True))


if __name__ == '__main__':
    unittest.main()


class NoAITest(PipelineBase):
    """AI(Ollama)가 꺼져 있거나 시간 상한을 넘겨도 새 공지가 규칙 정리로 바로 보이고, AI가 돌아오면 정밀 해독으로 바뀐다"""

    def build(self, *extra, host=None):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = build_notices.main([str(self.input), '--model', 'fake', '--host', host or self.host,
                                       '--out', str(self.out), '--today', '2026-11-12', '--no-archive', *extra])
        return code, buf.getvalue()

    def test_ollama_down_uses_rules_then_ai_replaces(self):
        code, log = self.build(host='http://127.0.0.1:9')          # 아무도 듣지 않는 포트
        self.assertEqual(code, 0, log)
        self.assertIn('AI 없이 진행합니다', log)
        data = gp.read_notices_js(self.out)
        by = {n['id']: n for n in data['notices']}
        self.assertEqual(set(by), {'www.kku.ac.kr-1-101', 'www.kku.ac.kr-2-202', 'www.kku.ac.kr-3-303'})
        self.assertTrue(all(n.get('aiPending') for n in by.values()))
        self.assertEqual(data['meta']['stats']['aiPending'], 3)
        a, b, c = by['www.kku.ac.kr-1-101'], by['www.kku.ac.kr-2-202'], by['www.kku.ac.kr-3-303']
        self.assertEqual(a['deadline'], '2026-11-27T17:00', '줄이 나뉜 기간의 끝 날짜')
        self.assertTrue(gp.verify_evidence(COLLECTED['notices'][0]['text'], a['evidence']['deadline']))
        self.assertEqual(b['deadline'], '2026-11-16T23:59')
        self.assertEqual(b['benefit']['points'], 20)
        self.assertEqual(b['category'], 'dadream')
        self.assertIn('11월 16일', b['summary']['ko'])
        self.assertEqual(c['bodyStatus'], 'image', 'AI가 없으면 포스터를 읽지 않음')
        self.assertEqual(c['category'], 'contest')
        self.assertEqual(FakeOllama.requests, [])
        # AI가 돌아오면 규칙 결과를 정밀 해독으로 바꾼다
        code, log = self.build()
        self.assertEqual(code, 0, log)
        by = {n['id']: n for n in gp.read_notices_js(self.out)['notices']}
        self.assertFalse(any(n.get('aiPending') for n in by.values()))
        self.assertTrue(by['www.kku.ac.kr-2-202']['titleTr']['en'].startswith('[en] '))

    def test_time_budget_rules_rest(self):
        code, log = self.build('--max-minutes', '0.00001', '--no-media')
        self.assertEqual(code, 0, log)
        self.assertIn('AI 시간 상한', log)
        ns = gp.read_notices_js(self.out)['notices']
        self.assertEqual(len(ns), 3)
        self.assertEqual(sum(1 for n in ns if n.get('aiPending')), 2, '첫 공지만 AI, 나머지는 규칙')

    def test_missing_model_falls_back(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = build_notices.main([str(self.input), '--model', 'qwen3:8b', '--host', self.host, '--no-media',
                                       '--out', str(self.out), '--today', '2026-11-12', '--no-archive'])
        log = buf.getvalue()
        self.assertEqual(code, 0, log)
        self.assertIn('fake:latest 을(를) 대신 씁니다', log)
        self.assertEqual(gp.read_notices_js(self.out)['meta']['model'], 'fake:latest')


class PickModelTest(unittest.TestCase):
    def test_choices(self):
        self.assertEqual(gp.pick_model('qwen3:8b', ['qwen3:8b', 'gemma3:4b']), 'qwen3:8b')
        self.assertEqual(gp.pick_model('qwen3', ['qwen3:latest']), 'qwen3:latest')
        self.assertEqual(gp.pick_model('qwen3:8b', ['qwen2.5vl:7b', 'qwen3:4b']), 'qwen3:4b', '같은 계열')
        self.assertEqual(gp.pick_model('qwen3:8b', ['qwen2.5vl:7b', 'llama3.1:8b', 'gemma3:12b']), 'gemma3:12b', '추천 순서')
        self.assertEqual(gp.pick_model('qwen3:8b', ['qwen2.5vl:7b', 'nomic-embed-text:latest']), None, '비전·임베딩 모델은 고르지 않음')
        self.assertEqual(gp.pick_model('qwen3:8b', []), None)


class RulesTest(unittest.TestCase):
    def test_deadline_patterns(self):
        import rules
        f = rules.find_deadline
        self.assertEqual(f('신청 마감: 11월 16일(월)', '2026-11-10')[0], '2026-11-16T23:59')
        self.assertEqual(f('접수기간 : 2026. 11. 3.(화) ~ 11. 20.(금) 18:00까지', '2026-11-02')[0], '2026-11-20T18:00')
        self.assertEqual(f('모집기간: 12/20 ~ 1/5', '2026-12-15')[0], '2027-01-05T23:59', '해를 넘기는 기간')
        self.assertEqual(f('일시: 2026. 11. 18.(수) 13:00~15:00\n장소: 학생회관', '2026-11-10')[0], None, '행사 일시는 마감이 아님')
        self.assertEqual(f('2024. 3. 2.까지 제출', '2026-11-10')[0], None, '작성일과 너무 먼 날짜')
        self.assertEqual(f('가. 사전 등록 기간: 2026. 11. 9.(월) ~ 15.(일)\n나. 등록 방법: 학사정보시스템', '2026-11-05')[0], '2026-11-15T23:59', '끝 날짜가 날만 있음')
        self.assertEqual(f('신청기간: 11. 28.(토) ~ 3.(목) 18:00', '2026-11-25')[0], '2026-12-03T18:00', '끝 날이 작으면 다음 달')
        self.assertEqual(f('나. 근로기간: 2027. 1. 1.(금) ~ 2027. 2. 22.(월)', '2026-11-01')[0], None, '근로 기간은 마감이 아님')
        self.assertEqual(f('2) 수강 기간: 2026년 11월 2일(월) ~ 12월 11일(금)', '2026-11-01')[0], None, '수강 기간은 마감이 아님')
        self.assertEqual(f('수강신청 기간: 11. 16.(월) ~ 11. 20.(금)', '2026-11-10')[0], '2026-11-20T23:59', '수강신청 기간은 마감')
        self.assertEqual(f('접수기간 : 2026. 11. 3.(화) ~ 11. 20.(금)', '2026-11-02')[0], '2026-11-20T23:59', '월. 일 끝 날짜는 그대로')

    def test_benefit_patterns(self):
        import rules
        b = rules.find_benefit('참여자 전원 다드림 포인트 20점 지급')
        self.assertEqual((b['points'], b['won'], b['prize']), (20, 0, 0))
        b = rules.find_benefit('3. 시상: 대상 상금 100만원')
        self.assertEqual((b['ko'], b['prize']), ('대상 상금 100만원', 1000000))
        b = rules.find_benefit('※ 장학금 300,000원 지급')
        self.assertEqual(b['won'], 300000)
        self.assertIsNone(rules.find_benefit('혜택: 수료증 발급'), '숫자가 없으면 지어내지 않음')

    def test_cross_check_flags_different_deadline(self):
        import rules
        raw = {'id': 'x', 'subject': '장학 신청', 'date': '2026-11-10', 'text': '1. 신청 기간: 11. 10.(화) ~ 11. 20.(금)까지\n2. 결과 발표: 11. 30.'}
        same = {'bodyStatus': 'text', 'date': '2026-11-10', 'deadline': '2026-11-20T18:00', 'evidence': {}}
        self.assertIsNone(rules.cross_check(same, raw), '날짜가 같으면 시각이 달라도 표시하지 않음')
        other = dict(same, deadline='2026-11-30T23:59', evidence={'deadline': '2. 결과 발표: 11. 30.'})
        chk = rules.cross_check(other, raw)
        self.assertEqual((chk['deadline'], chk['kind']), ('2026-11-20T23:59', 'differs'))
        self.assertIn('신청 기간', chk['line'])
        missing = dict(same, deadline=None)
        self.assertEqual(rules.cross_check(missing, raw)['kind'], 'missing')
        seen = dict(same, deadline='2026-11-10T23:59', evidence={'deadline': '신청 기간: 11. 10.(화) ~ 11. 20.(금)까지'})
        self.assertIsNone(rules.cross_check(seen, raw), 'AI가 같은 줄을 근거로 고른 값이면 다시 묻지 않음')
        weak = {'id': 'y', 'date': '2026-11-10', 'text': '모집 기간 11. 12. ~ 11. 19.'}
        self.assertIsNone(rules.cross_check(dict(same, deadline=None), weak), "'마감·까지'가 없는 줄은 믿지 않음")
        self.assertIsNone(rules.cross_check(dict(same, bodyStatus='image'), raw))


class MediaReuseTest(PipelineBase):
    def test_poster_text_reused_without_vision(self):
        # 이미지 모델로 한 번 읽어 둔 포스터 글자는 Ollama가 꺼져 있어도 다시 쓴다 → 저장된 AI 답도 그대로 맞아떨어진다
        code, log = self.run_build()
        self.assertEqual(code, 0, log)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = build_notices.main([str(self.input), '--model', 'fake', '--host', 'http://127.0.0.1:9',
                                       '--out', str(self.out), '--today', '2026-11-12', '--no-archive'])
        self.assertEqual(code, 0, buf.getvalue())
        by = {n['id']: n for n in gp.read_notices_js(self.out)['notices']}
        c = by['www.kku.ac.kr-3-303']
        self.assertEqual(c['bodyStatus'], 'poster')
        self.assertFalse(c.get('aiPending'), '저장된 AI 답으로 처리')
        self.assertIn('저장된 AI 답 사용', buf.getvalue())

    def test_typo_amount_not_scored(self):
        import rules
        b = rules.find_benefit('지원금액: 3,000,000만원(1명 기준)')
        self.assertEqual((b['ko'], b['won']), ('지원금액: 3,000,000만원(1명 기준)', 0))


class KeepWindowTest(PipelineBase):
    """보관 기간: 한 학기 이상(기본 6개월) 공지를 남기고, 확장 팝업에서 고른 기간을 따른다"""

    def build(self, *extra):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = build_notices.main([str(self.input), '--model', 'fake', '--host', 'http://127.0.0.1:9', '--no-media',
                                       '--out', str(self.out), '--today', '2026-11-12', '--no-archive', *extra])
        return code, buf.getvalue()

    def test_month_math(self):
        from datetime import date
        self.assertEqual(st.months_ago(date(2026, 11, 23), 6), date(2026, 5, 23))
        self.assertEqual(st.months_ago(date(2026, 8, 31), 6), date(2026, 2, 28), '그 달에 없는 날은 마지막 날')
        self.assertEqual(st.months_ago(date(2026, 1, 15), 6), date(2025, 7, 15), '해를 넘김')
        self.assertEqual(st.months_ago(date(2026, 11, 23), 12), date(2025, 11, 23))
        self.assertEqual([st.keep_months(v) for v in (3, '12', None, 99)], [6, 12, 6, 24], '6개월(한 학기)보다 짧게는 안 함')

    def test_prune_rules(self):
        from datetime import date
        store = {'notices': {
            'old-open': {'id': 'old-open', 'date': '2026-01-10'},
            'old-done': {'id': 'old-done', 'date': '2026-01-10'},
            'old-unknown': {'id': 'old-unknown', 'date': '2026-01-10'},
            'recent-done': {'id': 'recent-done', 'date': '2026-09-01'},
            'no-date': {'id': 'no-date'}}, 'removed': {}}
        dls = {'old-open': '2027-01-31T23:59', 'old-done': '2026-02-01T23:59', 'recent-done': '2026-09-10T18:00'}
        self.assertEqual(st.prune(dict(store, notices=dict(store['notices'])), dls, date(2026, 11, 12), since=None), [],
                         '기간 제한이 없으면 지우지 않음')
        gone = st.prune(store, dls, date(2026, 11, 12), since=date(2026, 5, 12))
        self.assertEqual(sorted(gone), ['old-done', 'old-unknown'])
        self.assertEqual(sorted(store['notices']), ['no-date', 'old-open', 'recent-done'], '마감이 남은 오래된 공지는 남김')
        self.assertEqual(sorted(store['removed']), ['old-done', 'old-unknown'])

    def test_default_six_months_and_meta(self):
        code, log = self.build()
        self.assertEqual(code, 0, log)
        self.assertIn('보관 기간: 최근 6개월 (한 학기 이상) · 기본 → 2026-05-12 이후', log)
        data = gp.read_notices_js(self.out)
        self.assertEqual(data['meta']['keep'], {'months': 6, 'days': None, 'since': '2026-05-12'})
        self.assertNotIn('www.kku.ac.kr-5-505', {n['id'] for n in data['notices']}, '2025년 글은 보관 기간 밖')

    def test_period_from_extension_and_overrides(self):
        data = json.loads(self.input.read_text(encoding='utf-8'))
        data['period'] = {'months': 12, 'since': '2025-11-12'}
        self.input.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        code, log = self.build()
        self.assertEqual(code, 0, log)
        self.assertEqual(gp.read_notices_js(self.out)['meta']['keep']['since'], '2025-11-12', '확장 팝업에서 고른 1년')
        self.assertEqual(st.load_notices()['period'], {'months': 12, 'since': '2025-11-12'}, '다음 실행도 같은 기간')
        code, log = self.build('--months', '9')
        self.assertEqual(gp.read_notices_js(self.out)['meta']['keep']['months'], 9, '명령줄이 우선')
        code, log = self.build('--days', '0')
        self.assertEqual(code, 0, log)
        ids = {n['id'] for n in gp.read_notices_js(self.out)['notices']}
        self.assertIn('www.kku.ac.kr-5-505', ids, '기간 제한 없음이면 오래된 글도')

    def test_old_notice_with_open_deadline_stays(self):
        code, log = self.build()
        self.assertEqual(code, 0, log)
        data = gp.read_notices_js(self.out)
        old = dict(data['notices'][0], id='www.kku.ac.kr-5-505', deadline='2026-12-01T23:59')
        data['notices'].append(old)
        gp.write_notices_js(self.out, data)
        code, log = self.build()
        self.assertEqual(code, 0, log)
        self.assertIn('www.kku.ac.kr-5-505', {n['id'] for n in gp.read_notices_js(self.out)['notices']},
                      '보관 기간보다 먼저 올라왔어도 마감이 남았으면 처리')

    def test_media_budget_defers_posters(self):
        # 이미지 모델 시간 상한을 넘기면 남은 포스터는 다음 실행으로 미루고, 그 공지는 이번에 규칙으로 정리한다
        import itertools
        args = build_notices.parse_args([str(self.input), '--model', 'fake', '--host', self.host, '--out', str(self.out)])
        raw = next(n for n in json.loads(self.input.read_text(encoding='utf-8'))['notices'] if n['id'] == 'www.kku.ac.kr-3-303')
        twin = dict(raw, id='www.kku.ac.kr-3-304')
        ai = gp.Ollama('fake', host=self.host)
        tick = itertools.count(0, 100)
        with contextlib.redirect_stdout(io.StringIO()) as buf:
            out, later = build_notices.read_all_media([raw, twin], args, ai, budget_s=150, clock=lambda: next(tick))
        self.assertIn('포스터', ' '.join(x['kind'] == 'poster' and '포스터' or '' for x in out[raw['id']]['sources']))
        self.assertEqual(later, {'www.kku.ac.kr-3-304'}, buf.getvalue())
        self.assertIn('다음 실행에서 읽습니다', buf.getvalue())
