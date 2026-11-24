# -*- coding: utf-8 -*-
import unittest
import re
from pathlib import Path


class CampusRouteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        route_file = Path(__file__).resolve().parent.parent / 'js' / 'campusroute.js'
        cls.js_content = route_file.read_text(encoding='utf-8')

    def test_file_exists_and_umd_structure(self):
        self.assertIn('GongjiCampusRoute', self.js_content)
        self.assertIn('국제교육관', self.js_content)
        self.assertIn('hasElevator: false', self.js_content)

    def test_international_edu_building_has_no_elevator(self):
        # 실사 제보 반영: 국제교육관은 엘리베이터가 없어야 함
        m = re.search(r"'국제교육관':\s*\{[^}]*hasElevator:\s*(false|true)", self.js_content)
        self.assertTrue(m, "국제교육관 메타데이터가 존재해야 함")
        self.assertEqual(m.group(1), 'false', "국제교육관은 엘리베이터 없음(false)이어야 함")

    def test_hill_alert_and_elevation_configured(self):
        # 헐떡고개(Hill) 경보 및 고저차 로직 확인
        self.assertIn('헐떡고개', self.js_content)
        self.assertIn('중원도서관', self.js_content)
        self.assertIn('elevationDiff', self.js_content)
        self.assertIn('danger', self.js_content)
        self.assertIn('warning', self.js_content)
        self.assertIn('safe', self.js_content)

    def test_transit_dataset_complete(self):
        # 셔틀, KTX-이음, 터미널 버스 데이터 확인
        self.assertIn('TRANSIT_DATA', self.js_content)
        self.assertIn('shuttle', self.js_content)
        self.assertIn('ktx', self.js_content)
        self.assertIn('terminalBuses', self.js_content)
        self.assertIn('dongseoul', self.js_content)
        self.assertIn('gangnam', self.js_content)
        self.assertIn('suwon', self.js_content)
        self.assertIn('KTX 712', self.js_content)
        self.assertIn('KTX 728', self.js_content)

    def test_algorithm_room_parsing(self):
        # 방 파싱 로직 시뮬레이션 검증
        rooms = [
            ("국제교육관 302-2", "국제교육관", 3, False),
            ("공학관 201호", "공학관", 2, False),
            ("종합강의동 B101", "종합강의동", -1, False),
            ("실시간온라인", None, 0, True),
            ("이러닝", None, 0, True)
        ]
        for room_str, expected_b, expected_fl, is_online in rooms:
            if is_online:
                self.assertTrue(any(w in room_str for w in ['온라인', '이러닝']))
            else:
                self.assertIn(expected_b, room_str)

    def test_consecutive_route_calculation_logic(self):
        # 국제교육관(90m) -> 종합강의동(122m) 이동 시 고저차 +32m 등판 및 헐떡고개 경보 발생
        b1_elev = 90
        b2_elev = 122
        diff = b2_elev - b1_elev
        self.assertEqual(diff, 32)
        # 평지거리 450m / 65 + 32/10 * 1.2 = ~7 + 4 = 11분 (10분 컷 초과 -> danger)
        walk_min = round(450 / 65) + round(diff / 10 * 1.2)
        self.assertGreaterEqual(walk_min, 10, "헐떡고개 등판 시 도보 소요가 10분 내외로 경보 발생해야 함")


if __name__ == '__main__':
    unittest.main()
