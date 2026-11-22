# -*- coding: utf-8 -*-
"""수신 서버(pipeline/receiver.py) 시험: python -m unittest tests/test_receiver.py"""
import json
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'pipeline'))
import receiver  # noqa: E402


def call(url, data=None, headers=None, method=None):
    body = None if data is None else (data if isinstance(data, bytes) else json.dumps(data).encode('utf-8'))
    req = urllib.request.Request(url, data=body, headers=headers or {}, method=method or ('POST' if body is not None else 'GET'))
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)


NOTICES = {'schema': 1, 'generator': 'test', 'notices': [{'id': '2-1-1', 'subject': '장학 신청 안내', 'text': '본문'}]}


class ReceiverTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / 'css').mkdir()
        (self.root / 'index.html').write_text('<!doctype html><title>t</title>', encoding='utf-8')
        (self.root / 'css' / 'style.css').write_text('body{}', encoding='utf-8')
        (self.root / 'settings.json').write_text('{"secret": 1}', encoding='utf-8')
        self.runner = receiver.Runner(self.root, debounce=0.2, command=[sys.executable, '-c', 'print("ran")'])
        self.httpd = receiver.make_server(0, self.root, self.runner)
        self.base = f'http://127.0.0.1:{self.httpd.server_address[1]}'
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.tmp.cleanup()

    def wait_runs(self, n, limit=5.0):
        t0 = time.time()
        while time.time() - t0 < limit:
            st = self.runner.status()
            if st['runs'] >= n and not st['busy'] and not st['waiting']:
                return st
            time.sleep(0.05)
        self.fail(f'파이프라인이 {n}번 돌지 않았습니다: {self.runner.status()}')

    def test_status_says_who_it_is(self):
        code, body, _ = call(self.base + '/status')
        self.assertEqual(code, 200)
        info = json.loads(body)
        self.assertEqual(info['app'], 'gongji-jupjup')
        self.assertFalse(info['busy'])

    def test_ingest_saves_file_and_runs_pipeline_once(self):
        for _ in range(3):        # 짧은 사이에 여러 번 와도 한 번만 실행
            code, body, _ = call(self.base + '/ingest?kind=notices', NOTICES, {'Content-Type': 'application/json'})
            self.assertEqual(code, 200, body)
        files = sorted((self.root / 'collected').glob('kku-notices-*.json'))
        self.assertEqual(len(files), 3)
        self.assertEqual(json.loads(files[0].read_text(encoding='utf-8'))['notices'][0]['id'], '2-1-1')
        st = self.wait_runs(1)
        self.assertEqual(st['runs'], 1)
        self.assertEqual(st['last']['code'], 0)
        log = next((self.root / 'logs').glob('server-*.log')).read_text(encoding='utf-8')
        self.assertIn('ran', log)

    def test_extension_origin_allowed_and_cors_header(self):
        code, _, headers = call(self.base + '/ingest?kind=notices', NOTICES,
                                {'Content-Type': 'application/json', 'Origin': 'chrome-extension://abcdef'})
        self.assertEqual(code, 200)
        self.assertEqual(headers.get('Access-Control-Allow-Origin'), 'chrome-extension://abcdef')

    def test_web_page_origin_rejected(self):
        code, _, _ = call(self.base + '/ingest?kind=notices', NOTICES, {'Content-Type': 'application/json', 'Origin': 'https://evil.example'})
        self.assertEqual(code, 403)
        code, _, _ = call(self.base + '/ingest?kind=notices', method='OPTIONS', headers={'Origin': 'http://localhost:3000'})
        self.assertEqual(code, 403)
        self.assertFalse((self.root / 'collected').exists())

    def test_bad_payloads_rejected(self):
        cases = [
            ('notices', b'not json'),
            ('notices', json.dumps({'notices': 'x'}).encode()),
            ('notices', json.dumps({'notices': [{'subject': 'id 없음'}]}).encode()),
            ('lectures', json.dumps({'kind': 'other', 'terms': []}).encode()),
            ('reference', json.dumps({'calendar': []}).encode()),
            ('../../etc', json.dumps(NOTICES).encode()),
        ]
        for kind, raw in cases:
            code, _, _ = call(self.base + f'/ingest?kind={kind}', raw, {'Content-Type': 'application/json'})
            self.assertEqual(code, 400, kind)
        self.assertFalse((self.root / 'collected').exists())

    def test_lectures_and_reference_accepted(self):
        lec = {'schema': 1, 'kind': 'kku-lectures', 'terms': [{'year': '2026', 'term': 'B01012', 'rows': [{'n': '자료구조'}]}]}
        ref = {'schema': 1, 'kind': 'kku-reference', 'calendar': [{'start': '2026-12-14'}], 'rules': []}
        self.assertEqual(call(self.base + '/ingest?kind=lectures', lec)[0], 200)
        self.assertEqual(call(self.base + '/ingest?kind=reference', ref)[0], 200)
        self.assertEqual(len(list((self.root / 'collected').glob('kku-lectures-*.json'))), 1)
        self.assertEqual(len(list((self.root / 'collected').glob('kku-reference-*.json'))), 1)

    def test_static_preview_only_serves_web_app_files(self):
        code, body, headers = call(self.base + '/')
        self.assertEqual(code, 200)
        self.assertIn(b'<title>t</title>', body)
        self.assertIn('text/html', headers['Content-Type'])
        self.assertEqual(call(self.base + '/css/style.css')[0], 200)
        for bad in ('/settings.json', '/pipeline/receiver.py', '/css/../settings.json', '/%2e%2e/settings.json', '/collected/x.json'):
            self.assertEqual(call(self.base + bad)[0], 404, bad)

    def test_run_requested_while_busy_runs_again_after(self):
        self.runner.command = [sys.executable, '-c', 'import time; time.sleep(0.6)']
        call(self.base + '/ingest?kind=notices', NOTICES)
        t0 = time.time()
        while not self.runner.status()['busy'] and time.time() - t0 < 3:
            time.sleep(0.02)
        call(self.base + '/ingest?kind=notices', NOTICES)     # 실행 중에 들어옴 → 끝난 뒤 한 번 더
        self.wait_runs(2, limit=8)

    def test_status_shows_stage_progress_and_data(self):
        (self.root / 'data').mkdir()
        (self.root / 'data' / 'version.json').write_text('{"generatedAt": "2026-11-22 09:10", "count": 232}', encoding='utf-8')
        script = ("import time\nprint('=== 3. 공지 합치기·해독 ===')\nprint('[1/4] 학사 | 장학')\nprint('[2/4] 학사 | 수강')\n"
                  "time.sleep(1.0)\nprint('[4/4] 끝')")
        self.runner.command = [sys.executable, '-c', script]
        call(self.base + '/ingest?kind=notices', NOTICES)
        t0, seen = time.time(), None
        while time.time() - t0 < 5:
            info = json.loads(call(self.base + '/status')[1])
            if info['progress'] and info['progress']['done'] == 2:
                seen = info
                break
            time.sleep(0.05)
        self.assertIsNotNone(seen, '실행 중 진행이 보이지 않음')
        self.assertEqual(seen['progress'], {'stage': '공지 합치기·해독', 'done': 2, 'total': 4})
        self.assertEqual(seen['data'], {'count': 232, 'generatedAt': '2026-11-22 09:10'})
        st = self.wait_runs(1)
        self.assertIsNone(st['progress'], '끝나면 진행 표시를 지움')
        log = next((self.root / 'logs').glob('server-*.log')).read_text(encoding='utf-8')
        self.assertIn('[4/4] 끝', log, '출력은 그대로 기록에 남김')

    def _with_ask(self, fn):
        self.httpd.shutdown(); self.httpd.server_close()
        self.httpd = receiver.make_server(0, self.root, self.runner, ask_fn=fn)
        self.base = f'http://127.0.0.1:{self.httpd.server_address[1]}'
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def test_ask_same_origin_only_and_shape(self):
        seen = {}
        def fake(q, lang, notices):
            seen.update(q=q, lang=lang, n=len(notices))
            return {'answer': '[1] 국가장학금은 11월 30일까지예요.', 'used': ['a'], 'model': 'fake', 'seconds': 0.1}
        self._with_ask(fake)
        body = {'q': '이번 주 장학금', 'lang': 'ko', 'notices': [{'no': 1, 'id': 'a', 'title': '국가장학금'}]}
        host = self.base.split('//')[1]
        code, raw, _ = call(self.base + '/ask', body, {'Content-Type': 'application/json', 'Origin': 'http://' + host})
        self.assertEqual(code, 200, raw)
        self.assertEqual(json.loads(raw)['used'], ['a'])
        self.assertEqual(seen, {'q': '이번 주 장학금', 'lang': 'ko', 'n': 1})
        self.assertEqual(call(self.base + '/ask', body, {'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(call(self.base + '/ask', body, {'Origin': 'chrome-extension://abc'})[0], 403, '확장도 /ask 는 못 씀')
        self.assertEqual(call(self.base + '/ask', {'q': '', 'notices': []})[0], 400)
        self.assertEqual(call(self.base + '/ask', {'q': 'x', 'notices': [{'no': 1}]})[0], 400)
        def down(q, lang, notices):
            raise RuntimeError('Ollama 응답 없음')
        self._with_ask(down)
        self.assertEqual(call(self.base + '/ask', body)[0], 503)

    def test_ask_ai_maps_numbers_and_drops_unknown(self):
        class FakeAI:
            model = 'fake'
            def chat_json(self, system, user, schema, num_predict=0):
                assert '[2] 해외 연수' in user and '마감: 2026-11-30T23:59' in user
                return {'answer': '<think>음</think>해외 연수 [2]가 있어요. [9]', 'used': [2, 7]}
        notices = [{'no': 1, 'id': 'a', 'title': '장학'}, {'no': 2, 'id': 'b', 'title': '해외 연수', 'deadline': '2026-11-30T23:59'}]
        r = receiver.ask_ai('해외', 'ko', notices, ai=FakeAI())
        self.assertEqual(r['used'], ['b'])
        self.assertEqual(r['answer'], '해외 연수 [2]가 있어요.')

    def test_mine_and_reminders(self):
        (self.root / 'data').mkdir(exist_ok=True)
        notices = {'meta': {}, 'categories': [], 'notices': [
            {'id': 'a', 'title': '오늘 마감 장학', 'deadline': '2026-11-19T18:00'},
            {'id': 'b', 'title': '내일 마감 특강', 'deadline': '2026-11-20T23:59'},
            {'id': 'c', 'title': '다음 주 마감', 'deadline': '2026-11-26T23:59'},
            {'id': 'd', 'title': '지원 완료', 'deadline': '2026-11-19T23:59'},
            {'id': 'e', 'title': '이미 지난 시각', 'deadline': '2026-11-19T09:00'}]}
        (self.root / 'data' / 'notices.js').write_text('window.GONGJI_DATA = /*JSON-START*/' + json.dumps(notices, ensure_ascii=False) + '/*JSON-END*/;', encoding='utf-8')
        host = self.base.split('//')[1]
        code, _, _ = call(self.base + '/mine', {'saved': ['a', 'b', 'c', 'd', 'e'], 'applied': ['d']}, {'Origin': 'http://' + host})
        self.assertEqual(code, 200)
        self.assertEqual(call(self.base + '/mine', {'saved': ['a']}, {'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(call(self.base + '/mine', {'saved': 'a'})[0], 400)
        code, raw, headers = call(self.base + '/reminders?now=2026-11-19T10:00', headers={'Origin': 'chrome-extension://abc'})
        items = json.loads(raw)['items']
        self.assertEqual([(x['id'], x['days']) for x in items], [('a', 0), ('b', 1)])
        self.assertEqual(headers.get('Access-Control-Allow-Origin'), 'chrome-extension://abc')

    def test_disabled_runner_only_saves(self):
        self.runner.enabled = False
        code, body, _ = call(self.base + '/ingest?kind=notices', NOTICES)
        self.assertEqual(code, 200)
        self.assertFalse(json.loads(body)['queued'])
        time.sleep(0.4)
        self.assertEqual(self.runner.status()['runs'], 0)


if __name__ == '__main__':
    unittest.main()
