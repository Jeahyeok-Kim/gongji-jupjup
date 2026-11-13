# -*- coding: utf-8 -*-
"""백업·복원·게시 시험 (임시 폴더에서만 동작, 내 데이터는 건드리지 않음)
실행: python -m unittest tests.test_backup_publish"""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'pipeline'))
import backup  # noqa: E402
import publish  # noqa: E402
import settings as cfg  # noqa: E402

NOTICES_JS = ('(function (root) {\n  const DATA = /*JSON-START*/'
              + json.dumps({'meta': {'source': 'pipeline', 'generatedAt': '2026-11-13 14:41'},
                            'categories': [], 'notices': [{'id': 'a', 'title': '가'}, {'id': 'b', 'title': '나'}]}, ensure_ascii=False)
              + '/*JSON-END*/;\n  root.GONGJI_DATA = DATA;\n})(globalThis);\n')
GLOSSARY_JS = ('(function (root) {\n  const GLOSSARY = /*JSON-START*/'
               + json.dumps({'계절학기': {'ko': '방학 중 수업'}}, ensure_ascii=False) + '/*JSON-END*/;\n})(globalThis);\n')
CAL_JS = ('(function (root) {\n  const CAL = /*JSON-START*/'
          + json.dumps({'generatedAt': '2026-11-13', 'items': []}) + '/*JSON-END*/;\n})(globalThis);\n')


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.root = self.tmp / 'proj'
        self.mirror = self.tmp / 'drive'
        files = {
            'collected/공지/학사공지.json': '{"notices": {"1": {"id": "1"}}}',
            'collected/reference.json': '{"calendar": []}',
            'pipeline/cache/1.json': '{"v": 2}',
            'pipeline/reference/translations.json': '{"a": "b"}',
            'pipeline/reference/files/yoram.pdf': 'PDF',            # 기본으로는 백업에서 뺌
            'pipeline/media/n1/poster.png': 'PNG',                  # 기본으로는 백업에서 뺌
            'pipeline/regulations.json': '{"items": []}',
            'data/notices.js': NOTICES_JS,
            'data/calendar.js': CAL_JS,
        }
        for rel, text in files.items():
            p = self.root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text, encoding='utf-8')
        (self.root / 'settings.json').write_text(json.dumps({'backupDir': str(self.mirror), 'backupKeep': 2}), encoding='utf-8')
        for obj, name, val in [(backup, 'ROOT', self.root), (backup, 'BACKUP_DIR', self.root / 'backups'),
                               (cfg, 'SETTINGS_PATH', self.root / 'settings.json'),
                               (publish, 'ROOT', self.root), (publish, 'DATA_DIR', self.root / 'data')]:
            patcher = mock.patch.object(obj, name, val)
            patcher.start()
            self.addCleanup(patcher.stop)


class BackupTests(Base):
    def test_create_excludes_media_and_copies_to_mirror(self):
        z = backup.create()
        names = zipfile.ZipFile(z).namelist()
        self.assertIn('collected/공지/학사공지.json', names)
        self.assertIn('pipeline/cache/1.json', names)
        self.assertIn('data/notices.js', names)
        self.assertFalse([n for n in names if 'media' in n or n.endswith('yoram.pdf')])
        self.assertTrue((self.mirror / z.name).is_file())          # 구글 드라이브 같은 사본 폴더에도 한 부

    def test_with_media_option(self):
        names = zipfile.ZipFile(backup.create(with_media=True)).namelist()
        self.assertIn('pipeline/media/n1/poster.png', names)

    def test_keeps_only_newest_n(self):
        for label in ('a', 'b', 'c'):
            backup.create(label=label)
        self.assertEqual(len(list((self.root / 'backups').glob('*.zip'))), 2)      # backupKeep = 2
        self.assertEqual(len(list(self.mirror.glob('*.zip'))), 2)

    def test_restore_returns_to_backup_state(self):
        z = backup.create()
        coll = self.root / 'collected' / '공지'
        (coll / '학사공지.json').write_text('{"notices": {}}', encoding='utf-8')       # 백업 뒤에 바뀐 것
        (coll / '새게시판.json').write_text('{}', encoding='utf-8')                      # 백업 뒤에 생긴 것
        (self.root / 'pipeline' / 'cache' / '1.json').unlink()                          # 백업 뒤에 사라진 것
        res = backup.restore(z)
        self.assertEqual(json.loads((coll / '학사공지.json').read_text(encoding='utf-8'))['notices']['1']['id'], '1')
        self.assertFalse((coll / '새게시판.json').exists())
        self.assertTrue((self.root / 'pipeline' / 'cache' / '1.json').is_file())
        self.assertTrue((self.root / 'pipeline' / 'media' / 'n1' / 'poster.png').is_file())     # 백업에 없던 폴더는 그대로
        self.assertTrue((self.root / 'pipeline' / 'reference' / 'files' / 'yoram.pdf').is_file())
        self.assertIn('복원전', res['safety'])                                            # 복원 전 상태도 백업됨
        self.assertTrue(list((self.root / 'backups').glob('*복원전*.zip')))

    def test_restore_latest_when_no_file_given(self):
        backup.create(label='x')
        (self.root / 'pipeline' / 'cache' / '1.json').unlink()
        backup.restore()
        self.assertTrue((self.root / 'pipeline' / 'cache' / '1.json').is_file())

    def test_restore_rejects_unsafe_paths(self):
        evil = self.tmp / 'evil.zip'
        with zipfile.ZipFile(evil, 'w') as z:
            z.writestr('collected/ok.json', '{}')
            z.writestr('../escaped.txt', 'x')
            z.writestr('/abs.txt', 'x')
            z.writestr('other/random.txt', 'x')                    # 백업 대상이 아닌 곳
        res = backup.restore(evil)
        self.assertEqual((res['restored'], res['skipped']), (1, 3))
        self.assertFalse((self.tmp / 'escaped.txt').exists())
        self.assertFalse((self.root / 'other').exists())

    def test_restore_rejects_unrelated_zip(self):
        junk = self.tmp / 'junk.zip'
        with zipfile.ZipFile(junk, 'w') as z:
            z.writestr('hello.txt', 'x')
        with self.assertRaises(ValueError):
            backup.restore(junk)

    def test_auto_backup_once_a_day(self):
        self.assertIsNotNone(backup.auto_backup())
        self.assertIsNone(backup.auto_backup())                     # 방금 했으니 건너뜀
        (self.root / 'settings.json').write_text(json.dumps({'autoBackup': False}), encoding='utf-8')
        for f in (self.root / 'backups').glob('*.zip'):
            f.unlink()
        self.assertIsNone(backup.auto_backup())                     # 설정이 꺼져 있으면 안 함


class PublishTests(Base):
    def test_json_mirrors_and_version(self):
        v = publish.write_json_mirrors()
        self.assertEqual((v['generatedAt'], v['count']), ('2026-11-13 14:41', 2))
        d = self.root / 'data'
        self.assertEqual(len(json.loads((d / 'notices.json').read_text(encoding='utf-8'))['notices']), 2)
        self.assertEqual(json.loads((d / 'calendar.json').read_text(encoding='utf-8'))['generatedAt'], '2026-11-13')
        self.assertEqual(json.loads((d / 'version.json').read_text(encoding='utf-8'))['count'], 2)

    def test_glossary_json_ics_feed_and_stamp(self):
        d = self.root / 'data'
        (d / 'glossary.js').write_text(GLOSSARY_JS, encoding='utf-8')
        v1 = publish.write_json_mirrors()
        self.assertEqual(json.loads((d / 'glossary.json').read_text(encoding='utf-8'))['계절학기']['ko'], '방학 중 수업')
        self.assertEqual(len(v1['glossaryGeneratedAt']), 10)
        ics = (d / 'gongji.ics').read_text(encoding='utf-8')
        self.assertTrue(ics.startswith('BEGIN:VCALENDAR') and ics.rstrip().endswith('END:VCALENDAR'))
        self.assertFalse((d / 'gongji.ics.tmp').exists())
        # 내용이 같으면 표시도 같고(웹앱이 다시 받지 않음), 내용이 바뀌면 달라진다
        self.assertEqual(publish.write_json_mirrors()['glossaryGeneratedAt'], v1['glossaryGeneratedAt'])
        (d / 'glossary.js').write_text(GLOSSARY_JS.replace('방학 중 수업', '방학에 듣는 수업'), encoding='utf-8')
        self.assertNotEqual(publish.write_json_mirrors()['glossaryGeneratedAt'], v1['glossaryGeneratedAt'])
        self.assertEqual(json.loads((d / 'version.json').read_text(encoding='utf-8'))['glossaryGeneratedAt'],
                         publish.write_json_mirrors()['glossaryGeneratedAt'])

    def test_no_glossary_file_is_fine(self):
        v = publish.write_json_mirrors()
        self.assertNotIn('glossaryGeneratedAt', v)
        self.assertFalse((self.root / 'data' / 'glossary.json').exists())

    def test_broken_glossary_does_not_stop_publishing(self):
        d = self.root / 'data'
        (d / 'glossary.js').write_text('깨진 파일', encoding='utf-8')
        v = publish.write_json_mirrors()
        self.assertEqual(v['count'], 2)
        self.assertTrue((d / 'notices.json').is_file() and (d / 'version.json').is_file())

    def test_broken_ics_does_not_stop_publishing(self):
        with mock.patch.object(publish.ics_feed, 'write_feed', side_effect=ValueError('x')):
            v = publish.write_json_mirrors()
        self.assertEqual(v['count'], 2)
        self.assertTrue((self.root / 'data' / 'version.json').is_file())

    def test_publish_to_folder(self):
        notes = publish.publish({'publish': {'folder': str(self.mirror / 'web')}})
        self.assertTrue((self.mirror / 'web' / 'notices.json').is_file())
        self.assertTrue((self.mirror / 'web' / 'version.json').is_file())
        self.assertTrue((self.mirror / 'web' / 'gongji.ics').is_file(), '구독용 일정 파일도 같이 올라가야 함')
        self.assertTrue(any('복사' in n for n in notes))

    def test_publish_without_target_says_so(self):
        notes = publish.publish({'publish': {}})
        self.assertTrue(any('올리는 곳' in n for n in notes))

    def test_git_not_a_repo(self):
        publish.write_json_mirrors()
        self.assertIn('git 저장소가 아닙니다', publish.publish_git(self.root))

    @unittest.skipUnless(shutil.which('git'), 'git 이 없습니다')
    def test_git_commits_only_when_data_changed(self):
        run = lambda *a: subprocess.run(['git', '-C', str(self.root), *a], capture_output=True, text=True, check=True)
        run('init'); run('config', 'user.email', 't@t'); run('config', 'user.name', 't')
        publish.write_json_mirrors()
        first = publish.publish_git(self.root)                       # 저장소에 원격이 없어 push 는 실패하지만 커밋은 된다
        self.assertIn('push', first)
        self.assertIn('데이터 갱신', run('log', '--oneline').stdout)
        self.assertIn('바뀐 데이터가 없어', publish.publish_git(self.root))


class SettingsTests(Base):
    def test_defaults_and_notes_ignored(self):
        (self.root / 'settings.json').write_text(json.dumps({'_설명': 'x', 'publish': {'git': True}}), encoding='utf-8')
        s = cfg.load()
        self.assertTrue(s['publish']['git'])
        self.assertEqual(s['publish']['folder'], '')
        self.assertEqual(s['backupKeep'], 10)
        self.assertNotIn('_설명', s)

    def test_broken_file_falls_back(self):
        (self.root / 'settings.json').write_text('{깨진', encoding='utf-8')
        self.assertEqual(cfg.load()['backupKeep'], 10)


if __name__ == '__main__':
    unittest.main()
