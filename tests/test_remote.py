# -*- coding: utf-8 -*-
"""보정표 원격 가져오기(구글 문서 docx · 드라이브 · 시트 · 깃허브 · 내 컴퓨터 파일) 시험.  실행: python -m unittest tests.test_remote
인터넷에는 접속하지 않는다 (받기 함수를 가짜로 바꿔 끼워서 시험)."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'pipeline'))
import remote as R  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def _p(text):
    parts = str(text).split('\n')
    runs = '<w:br/>'.join(f'<w:r><w:t xml:space="preserve">{escape(x)}</w:t></w:r>' for x in parts)
    return f'<w:p>{runs}</w:p>'


def _tbl(rows, nested=None):
    out = '<w:tbl>'
    for ri, row in enumerate(rows):
        out += '<w:tr>'
        for ci, c in enumerate(row):
            inner = _p(c)
            if nested is not None and (ri, ci) == (0, 0):
                inner += nested
            out += f'<w:tc>{inner}</w:tc>'
        out += '</w:tr>'
    return out + '</w:tbl>'


def make_docx(*blocks):
    """blocks: 문단(글자) 또는 표(줄 목록) 또는 (표, 겹친 표)"""
    body = ''
    for b in blocks:
        if isinstance(b, str):
            body += _p(b)
        elif isinstance(b, tuple):
            body += _tbl(b[0], _tbl(b[1]))
        else:
            body += _tbl(b)
    xml = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {NS}><w:body>{body}</w:body></w:document>'
    buf = BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        z.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
        z.writestr('word/document.xml', xml)
    return buf.getvalue()


HEADER = ['대상', '항목', '값', '메모']


class Urls(unittest.TestCase):
    def test_google_doc(self):
        k, c = R.to_candidates('https://docs.google.com/document/d/1AbC_dEf-123/edit?usp=sharing')
        self.assertEqual(k, 'gdoc')
        self.assertEqual(c[0], 'https://docs.google.com/document/d/1AbC_dEf-123/export?format=docx')
        self.assertIn('drive.google.com/uc?export=download&id=1AbC_dEf-123', c[1])    # 드라이브에 올린 docx 대비

    def test_drive_file_forms(self):
        for u in ['https://drive.google.com/file/d/XYZ789/view?usp=sharing', 'https://drive.google.com/open?id=XYZ789', 'https://drive.google.com/uc?export=download&id=XYZ789']:
            k, c = R.to_candidates(u)
            self.assertEqual((k, c), ('gdrive', ['https://drive.google.com/uc?export=download&id=XYZ789']), u)

    def test_sheet_and_github_and_other(self):
        k, c = R.to_candidates('https://docs.google.com/spreadsheets/d/SHEET1/edit#gid=77')
        self.assertEqual((k, c), ('sheet', ['https://docs.google.com/spreadsheets/d/SHEET1/export?format=csv&gid=77']))
        k, c = R.to_candidates('https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?gid=0&single=true')
        self.assertTrue(k == 'sheet' and c[0].endswith('&output=csv'))
        k, c = R.to_candidates('https://github.com/alex/gongji/blob/main/data/fix.csv?plain=1')
        self.assertEqual((k, c), ('github', ['https://raw.githubusercontent.com/alex/gongji/main/data/fix.csv']))
        self.assertEqual(R.to_candidates('https://example.com/a.csv'), ('other', ['https://example.com/a.csv']))

    def test_local_file_and_empty(self):
        self.assertEqual(R.to_candidates(r'G:\내 드라이브\보정표.docx'), ('file', [r'G:\내 드라이브\보정표.docx']))
        self.assertEqual(R.to_candidates('  '), ('none', []))


class Parsing(unittest.TestCase):
    def test_docx_uses_only_the_table_with_a_header(self):
        data = make_docx('보정표 안내 문단', [['설명', '내용'], ['하나', '둘']],
                         [HEADER, ['장학', '마감', '2026-11-20 17:00', '공지에 잘못 적힘'], ['', '알림', '이번 주 금요일 휴강', '']])
        rows = R.parse_rows(data)
        self.assertEqual(rows[0], HEADER)
        self.assertEqual(rows[1], ['장학', '마감', '2026-11-20 17:00', '공지에 잘못 적힘'])
        self.assertEqual(len(rows), 3)
        self.assertNotIn(['하나', '둘', '', ''], rows)

    def test_docx_without_any_header_uses_all_tables(self):
        rows = R.parse_rows(make_docx([['장학', '숨김', '예', '']], [['식당', '메모', '휴무', '']]))
        self.assertEqual([r[0] for r in rows], ['장학', '식당'])

    def test_docx_cell_with_line_break_and_empty_rows(self):
        rows = R.parse_rows(make_docx([HEADER, ['', '', '', ''], ['공모전', '메모', '첫 줄\n둘째 줄', '']]))
        self.assertEqual(rows[1][2], '첫 줄\n둘째 줄')
        self.assertEqual(len(rows), 2)                        # 빈 줄은 건너뜀

    def test_nested_table_is_ignored(self):
        rows = R.parse_rows(make_docx(([HEADER, ['A', '메모', 'x', '']], [['속', '항목', '표', '']])))
        self.assertEqual([r[0] for r in rows], ['대상', 'A'])

    def test_cells_are_trimmed_to_four_columns_and_length(self):
        rows = R.parse_rows(make_docx([HEADER + ['다섯째'], ['A', '메모', 'v' * 900, '', 'x']]))
        self.assertTrue(all(len(r) == 4 for r in rows))
        self.assertEqual(len(rows[1][2]), R.MAX_CELL)

    def test_csv_tsv_json_and_cp949(self):
        self.assertEqual(R.parse_rows('대상,항목,값,메모\n장학,마감,"2026-11-20, 17:00",\n'.encode('utf-8-sig'))[1][2], '2026-11-20, 17:00')
        self.assertEqual(R.parse_rows('대상\t항목\t값\t메모\n장학\t숨김\t예\t'.encode('utf-8'))[1][:3], ['장학', '숨김', '예'])
        self.assertEqual(R.parse_rows(json.dumps({'rows': [['장학', '포인트', '30', '']]}).encode())[0][2], '30')
        self.assertEqual(R.parse_rows('장학,메모,한글'.encode('cp949'))[0][2], '한글')

    def test_broken_inputs_raise_friendly_errors(self):
        with self.assertRaises(R.RemoteError):
            R.parse_rows(b'PK\x03\x04 not really a zip')
        buf = BytesIO()
        with zipfile.ZipFile(buf, 'w') as z:
            z.writestr('hello.txt', 'x')
        with self.assertRaises(R.RemoteError):
            R.parse_rows(buf.getvalue())                       # zip 이지만 docx 가 아님
        with self.assertRaises(R.RemoteError):
            R.parse_rows(b'\xff\xfe\x00\x81bad')               # 어느 인코딩도 아님
        with self.assertRaises(R.RemoteError):
            R.parse_rows(json.dumps({'rows': 'x'}).encode())
        with self.assertRaises(R.RemoteError):
            R.parse_rows(('\n'.join(f'a{i},메모,v,' for i in range(R.MAX_ROWS + 5))).encode())

    def test_works_with_a_real_word_file_when_python_docx_is_installed(self):
        try:
            import docx
        except ImportError:
            self.skipTest('python-docx 가 없음 (선택 사항)')
        d = docx.Document()
        d.add_paragraph('안내')
        t = d.add_table(rows=2, cols=4)
        for i, v in enumerate(HEADER):
            t.rows[0].cells[i].text = v
        for i, v in enumerate(['장학', '마감', '2026-11-20', '확인']):
            t.rows[1].cells[i].text = v
        buf = BytesIO()
        d.save(buf)
        rows = R.parse_rows(buf.getvalue())
        self.assertEqual(rows[1], ['장학', '마감', '2026-11-20', '확인'])


class Reading(unittest.TestCase):
    def test_html_login_page_gives_sharing_hint(self):
        get = lambda url: b'<!DOCTYPE html><html>login</html>'
        with self.assertRaises(R.RemoteError) as cm:
            R.read_source('https://docs.google.com/document/d/ID/edit', get)
        self.assertIn('공유', str(cm.exception))

    def test_second_candidate_is_tried_when_first_fails(self):
        calls = []

        def get(url):
            calls.append(url)
            if 'export?format=docx' in url:
                raise R.RemoteError('HTTP 400')
            return make_docx([HEADER, ['A', '메모', 'x', '']])
        kind, data = R.read_source('https://docs.google.com/document/d/ID/edit', get)
        self.assertEqual(kind, 'gdoc')
        self.assertEqual(len(calls), 2)
        self.assertEqual(R.parse_rows(data)[1][0], 'A')

    def test_local_file(self):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        f = tmp / '보정표.docx'
        f.write_bytes(make_docx([HEADER, ['A', '메모', 'x', '']]))
        kind, data = R.read_source(str(f))
        self.assertEqual(kind, 'file')
        with self.assertRaises(R.RemoteError):
            R.read_source(str(tmp / '없는파일.docx'))


class Sync(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.good = make_docx([HEADER, ['장학', '마감', '2026-11-20 17:00', ''], ['# 설명', '', '', ''], ['', '알림', '금요일 휴강', '']])
        self.cfg = {'remote': {'overrides': 'https://docs.google.com/document/d/ID/edit'}}
        self.out = self.tmp / 'overrides.json'

    def run_sync(self, get):
        return R.sync_overrides(self.cfg, self.tmp, get)

    def test_writes_overrides_json(self):
        msg = self.run_sync(lambda u: self.good)
        self.assertIn('구글 문서', msg)
        self.assertIn('2건', msg)                              # 마감 1 + 알림 1 ('#' 설명 줄과 머리줄은 세지 않음)
        j = json.loads(self.out.read_text(encoding='utf-8'))
        self.assertEqual(j['source'], 'gdoc')
        self.assertEqual(j['rows'][1], ['장학', '마감', '2026-11-20 17:00', ''])
        self.assertNotIn('docs.google.com', self.out.read_text(encoding='utf-8'))   # 문서 주소는 공개 저장소에 올라가지 않는다

    def test_unchanged_content_does_not_rewrite(self):
        self.run_sync(lambda u: self.good)
        before = self.out.stat().st_mtime_ns
        msg = self.run_sync(lambda u: self.good)
        self.assertIn('바뀐 내용 없음', msg)
        self.assertEqual(self.out.stat().st_mtime_ns, before)

    def test_failure_keeps_previous_good_file(self):
        self.run_sync(lambda u: self.good)
        before = self.out.read_text(encoding='utf-8')

        def down(u):
            raise R.RemoteError('연결 실패')
        msg = self.run_sync(down)
        self.assertIn('이전에 받아 둔 보정표를 계속', msg)
        self.assertEqual(self.out.read_text(encoding='utf-8'), before)
        self.assertFalse((self.tmp / 'overrides.json.tmp').exists())

    def test_failure_without_previous_file_creates_nothing(self):
        def down(u):
            raise R.RemoteError('HTTP 403')
        msg = self.run_sync(down)
        self.assertIn('보정표 없이', msg)
        self.assertFalse(self.out.exists())

    def test_html_response_does_not_overwrite(self):
        self.run_sync(lambda u: self.good)
        before = self.out.read_text(encoding='utf-8')
        msg = self.run_sync(lambda u: b'<html>sign in</html>')
        self.assertIn('공유 설정', msg)
        self.assertEqual(self.out.read_text(encoding='utf-8'), before)

    def test_no_url_is_a_no_op_and_keeps_hand_made_file(self):
        self.out.write_text('{"rows":[["손으로","메모","만든",""]]}', encoding='utf-8')
        self.assertIsNone(R.sync_overrides({'remote': {'overrides': ''}}, self.tmp, lambda u: self.fail('접속하면 안 됨')))
        self.assertIsNone(R.sync_overrides({}, self.tmp, lambda u: self.fail('접속하면 안 됨')))
        self.assertIn('손으로', self.out.read_text(encoding='utf-8'))

    def test_sheet_csv_source(self):
        self.cfg['remote']['overrides'] = 'https://docs.google.com/spreadsheets/d/S/edit#gid=0'
        msg = self.run_sync(lambda u: '대상,항목,값,메모\n장학,숨김,예,\n'.encode('utf-8'))
        self.assertIn('구글 시트', msg)

    @unittest.skipUnless(shutil.which('node'), 'node 가 없음')
    def test_rows_are_understood_by_the_web_app_parser(self):
        """docx → data/overrides.json → 웹앱(JS)의 보정표 읽기가 같은 규칙으로 읽는다 (끝에서 끝까지)"""
        self.run_sync(lambda u: self.good)
        script = ("const O=require(process.argv[1]);const j=JSON.parse(require('fs').readFileSync(process.argv[2],'utf8'));"
                  "const p=O.parseOverrides(j.rows);console.log(JSON.stringify({rules:p.rules.map(r=>[r.target,r.field,r.value]),banner:p.banner,errors:p.errors.length}));")
        r = subprocess.run(['node', '-e', script, str(ROOT / 'js' / 'overrides.js'), str(self.out)], capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(r.returncode, 0, r.stderr)
        got = json.loads(r.stdout)
        self.assertEqual(got['rules'], [['장학', 'deadline', '2026-11-20T17:00']])
        self.assertEqual(got['banner'], '금요일 휴강')
        self.assertEqual(got['errors'], 0)


if __name__ == '__main__':
    unittest.main()
