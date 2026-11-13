# -*- coding: utf-8 -*-
"""구글 캘린더 구독용 일정 파일(gongji.ics) 시험.  실행: python -m unittest tests.test_ics_feed"""
import json
import shutil
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'pipeline'))
import ics_feed as F  # noqa: E402

DOC = {
    'meta': {'generatedAt': '2026-11-13 15:24', 'source': 'pipeline'},
    'categories': [{'id': 'contest', 'label': {'ko': '공모전·대외활동'}}],
    'notices': [
        {'id': 'a-1', 'title': '장학금 신청, 안내; 필독', 'link': 'https://example.com/a?x=1&y=2', 'category': 'contest',
         'deadline': '2026-11-20T23:59', 'summary': {'ko': '첫 줄\n둘째 줄, 쉼표'}, 'events': [
             {'date': '2026-11-18', 'start': '14:00', 'end': '15:30'}]},
        {'id': 'a-2', 'title': '날짜만 있는 마감', 'deadline': '2026-11-25', 'events': []},
        {'id': 'a-3', 'title': '한 달 전에 끝난 공지', 'deadline': '2026-10-01T23:59', 'events': []},
        {'id': 'a-4', 'title': '마감 없음', 'deadline': None, 'events': []},
        {'title': 'id 없음', 'deadline': '2026-11-20T10:00'},
    ],
}
CAL = {'generatedAt': '2026-11-13', 'items': [
    {'start': '2026-12-14', 'end': '2026-12-18', 'title': {'ko': '기말고사'}},
    {'start': '2026-03-02', 'end': '2026-03-02', 'title': {'ko': '지난 학기 개강'}},
]}


def unfold(text: str) -> str:
    return text.replace('\r\n ', '')


class TextRules(unittest.TestCase):
    def test_escape(self):
        self.assertEqual(F.esc('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne')
        self.assertEqual(F.esc(None), '')

    def test_fold_keeps_75_bytes_and_roundtrips(self):
        for line in ['SUMMARY:' + '가' * 80, 'DESCRIPTION:' + 'abc ' * 60, 'X:짧음', 'Y:' + '한a' * 70]:
            out = F.fold(line)
            for part in out.split('\r\n'):
                self.assertLessEqual(len(part.encode('utf-8')), 75, part)
            self.assertEqual(unfold(out), line)          # 이어 붙이면 원래대로 (글자가 깨지거나 사라지지 않음)


class Feed(unittest.TestCase):
    def feed(self, **kw):
        return F.build_feed(DOC, CAL, today=kw.get('today'))

    def test_structure(self):
        t = self.feed()
        self.assertTrue(t.startswith('BEGIN:VCALENDAR\r\n') and t.endswith('END:VCALENDAR\r\n'))
        self.assertEqual(t.count('BEGIN:VEVENT'), t.count('END:VEVENT'))
        for line in t.split('\r\n'):
            self.assertLessEqual(len(line.encode('utf-8')), 75)
        self.assertIn('X-WR-TIMEZONE:Asia/Seoul', t)

    def test_deadline_time_is_converted_from_korean_time_to_utc(self):
        t = unfold(self.feed())
        self.assertIn('UID:a-1-deadline@gongji-jupjup', t)
        self.assertIn('DTSTART:20261120T145900Z', t)      # 23:59 KST = 14:59 UTC
        self.assertIn('DTEND:20261120T152900Z', t)

    def test_event_time_range(self):
        t = unfold(self.feed())
        self.assertIn('UID:a-1-event0@gongji-jupjup', t)
        self.assertIn('DTSTART:20261118T050000Z', t)      # 14:00 KST
        self.assertIn('DTEND:20261118T063000Z', t)        # 15:30 KST

    def test_date_only_deadline_is_all_day(self):
        t = unfold(self.feed())
        self.assertIn('DTSTART;VALUE=DATE:20261125', t)
        self.assertIn('DTEND;VALUE=DATE:20261126', t)     # 종일 일정의 끝은 다음 날

    def test_text_is_escaped_and_not_split_wrongly(self):
        t = unfold(self.feed())
        self.assertIn('SUMMARY:[마감] 장학금 신청\\, 안내\\; 필독', t)
        self.assertIn('DESCRIPTION:첫 줄\\n둘째 줄\\, 쉼표\\nhttps://example.com/a?x=1&y=2', t)
        self.assertIn('CATEGORIES:공모전·대외활동', t)

    def test_old_missing_and_idless_notices_are_left_out(self):
        t = unfold(self.feed())
        self.assertNotIn('a-3', t)          # 한 달 전에 끝남
        self.assertNotIn('a-4', t)          # 마감 없음
        self.assertNotIn('id 없음', t)

    def test_academic_calendar_all_day_range(self):
        t = unfold(self.feed())
        self.assertIn('SUMMARY:[학사] 기말고사', t)
        self.assertIn('DTSTART;VALUE=DATE:20261214', t)
        self.assertIn('DTEND;VALUE=DATE:20261219', t)     # 12/18 까지 → 끝은 12/19
        self.assertNotIn('지난 학기 개강', t)

    def test_same_input_gives_same_file(self):
        self.assertEqual(self.feed(), self.feed())        # 깃에 쓸데없는 변경이 생기지 않음

    def test_uids_are_unique(self):
        uids = [ln for ln in unfold(self.feed()).split('\r\n') if ln.startswith('UID:')]
        self.assertEqual(len(uids), len(set(uids)))
        self.assertEqual(len(uids), 4)      # 마감 2 + 행사 1 + 학사 1

    def test_parses_with_a_real_icalendar_library_when_available(self):
        try:
            import icalendar
        except ImportError:
            self.skipTest('icalendar 가 없음 (선택 사항)')
        cal = icalendar.Calendar.from_ical(self.feed().encode('utf-8'))
        events = list(cal.walk('VEVENT'))
        self.assertEqual(len(events), 4)
        first = [e for e in events if str(e['UID']).startswith('a-1-deadline')][0]
        self.assertEqual(first['DTSTART'].dt.isoformat(), '2026-11-20T14:59:00+00:00')

    def test_bad_values_do_not_crash(self):
        doc = {'meta': {}, 'notices': [{'id': 'x', 'title': 't', 'deadline': '내일까지', 'events': [None, {'date': 'bad'}, {'date': '2026-11-20', 'start': '99:99'}]}]}
        F.build_feed(doc, {'items': [{'start': 'x', 'end': 'y', 'title': 'z'}, {'start': '2026-12-02', 'end': '2026-12-01', 'title': 'rev'}]})


class WriteFile(unittest.TestCase):
    def test_write_feed_reads_json_files(self):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        (tmp / 'notices.json').write_text(json.dumps(DOC, ensure_ascii=False), encoding='utf-8')
        (tmp / 'calendar.json').write_text(json.dumps(CAL, ensure_ascii=False), encoding='utf-8')
        self.assertEqual(F.write_feed(tmp, today=date(2026, 11, 13)), 4)
        self.assertTrue((tmp / 'gongji.ics').is_file())
        self.assertFalse((tmp / 'gongji.ics.tmp').exists())
        # 학사일정 파일이 없어도 만들어진다
        (tmp / 'calendar.json').unlink()
        self.assertEqual(F.write_feed(tmp, today=date(2026, 11, 13)), 3)


if __name__ == '__main__':
    unittest.main()
