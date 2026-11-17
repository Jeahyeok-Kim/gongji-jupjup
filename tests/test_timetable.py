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

    def test_unknown_term_raises(self):
        with self.assertRaises(ValueError):
            bt.build([{'term': 'B01012', 'rows': []}], 'X')


if __name__ == '__main__':
    unittest.main()
