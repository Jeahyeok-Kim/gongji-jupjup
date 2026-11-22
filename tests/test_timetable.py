# -*- coding: utf-8 -*-
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'pipeline'))
import build_timetable as bt  # noqa: E402


class ParseSlotsTest(unittest.TestCase):
    def test_different_times_per_day(self):
        s = bt.parse_slots(' 월0900-1030(인문사회관 101), 목1330-1500(인문사회관 305)')
        self.assertEqual(s, [[1, '09:00', '10:30', '인문사회관 101'], [4, '13:30', '15:00', '인문사회관 305']])

    def test_room_with_parentheses_and_missing_room(self):
        s = bt.parse_slots('화1030-1200(국제교육관 406)(b-가나), 금1800-2100')
        self.assertEqual([x[0] for x in s], [2, 5])
        self.assertEqual(s[1][3], '')

    def test_online_and_empty(self):
        self.assertEqual(bt.parse_slots(' 금1800-2100(실시간온라인)')[0][1:3], ['18:00', '21:00'])
        self.assertEqual(bt.parse_slots(''), [])
        self.assertEqual(bt.parse_slots('월1500-1400(오류)'), [])


class BuildTest(unittest.TestCase):
    def test_build_skips_without_time_and_dedupes(self):
        rows = [
            {'n': '디지털논리회로', 't': '월1000-1130(공학관 1), 목1300-1430(공학관 1)', 'd': '컴퓨터공학과', 'k': '전필', 'y': '2', 'c': 3, 'h': 'A', 's': '01'},
            {'n': '디지털논리회로', 't': '월1000-1130(공학관 1), 목1300-1430(공학관 1)', 'd': '컴퓨터공학과', 'k': '전필', 'y': '2', 'c': 3, 'h': 'A', 's': '01'},
            {'n': '현장실습', 't': '', 'h': 'B', 's': '01'},
        ]
        r = bt.build([{'year': '2026', 'term': 'B01012', 'collectedAt': 1, 'rows': rows}])
        self.assertEqual(r['meta']['count'], 1)
        self.assertEqual(r['meta']['skipped'], 1)
        self.assertEqual(r['meta']['termName'], '2학기')
        self.assertEqual(len(r['courses'][0]['t']), 2)

    def test_prefers_regular_semester_over_small_seasonal(self):
        row = lambda i: {'n': f'과목{i}', 't': '월1000-1130', 's': '01', 'h': str(i)}
        regular = {'year': '2026', 'term': 'B01012', 'collectedAt': 1, 'rows': [row(i) for i in range(60)]}
        seasonal = {'year': '2026', 'term': 'B01015', 'collectedAt': 9, 'rows': [row(1)]}
        self.assertEqual(bt.build([regular, seasonal])['meta']['term'], 'B01012', '나중에 받았어도 계절학기 1과목은 고르지 않음')
        self.assertEqual(bt.build([seasonal])['meta']['term'], 'B01015', '그것밖에 없으면 그것')
        self.assertEqual(bt.build([regular, seasonal], 'B01015')['meta']['count'], 1, '학기를 정하면 그대로')

    def test_small_other_term_does_not_overwrite(self):
        import json, tempfile
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / 'timetable.js'
            big = bt.build([{'year': '2026', 'term': 'B01012', 'collectedAt': 1,
                             'rows': [{'n': f'과목{i}', 't': '월1000-1130', 's': '01', 'h': str(i)} for i in range(80)]}])
            out.write_text(bt.HEADER + 'window.GONGJI_TIMETABLE = ' + json.dumps(big, ensure_ascii=False) + ';\n', encoding='utf-8')
            small = {'year': '2026', 'term': 'B01015', 'count': 1}
            self.assertEqual(bt.keep_existing(out, small)['count'], 80)
            self.assertIsNone(bt.keep_existing(out, {'year': '2026', 'term': 'B01012', 'count': 3}), '같은 학기면 덮어씀')
            self.assertIsNone(bt.keep_existing(out, {'year': '2027', 'term': 'B01011', 'count': 70}), '다른 학기라도 크면 덮어씀')
            inp = Path(d) / 'kku-lectures-x.json'
            inp.write_text(json.dumps({'terms': [{'year': '2026', 'term': 'B01015', 'collectedAt': 9,
                                                  'rows': [{'n': '계절', 't': '화0900-1200', 's': '01'}]}]}), encoding='utf-8')
            self.assertEqual(bt.main([str(inp), '--out', str(out)]), 0)
            self.assertIn('"count":80', out.read_text(encoding='utf-8').replace(' ', ''), '기존 시간표 유지')
            self.assertEqual(bt.main([str(inp), '--out', str(out), '--force']), 0)
            self.assertIn('"count":1', out.read_text(encoding='utf-8').replace(' ', ''))

    def test_unknown_term_raises(self):
        with self.assertRaises(ValueError):
            bt.build([{'term': 'B01012', 'rows': []}], 'X')


if __name__ == '__main__':
    unittest.main()
