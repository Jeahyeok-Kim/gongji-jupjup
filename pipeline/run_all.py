# -*- coding: utf-8 -*-
"""한 번에 실행: run_pipeline.bat 이 부르는 파일

1) 새로 내보낸 학교 기본 정보(kku-reference-*.json)가 있으면 → 저장소에 합치고 학사일정·요람 쪽수·규정 조문 갱신
2) 새로 내보낸 공지(kku-notices-*.json)를 게시판별 저장소에 합치고(중복 확인, 새 공지만 추가, 바뀐 공지 갱신)
   → 포스터·첨부 읽기 → 로컬 AI 해독·번역 → data/notices.js → 기간 지난 공지 정리
3) settings.json 의 remote.overrides 에 구글 문서(docx) 같은 보정표 주소가 있으면 받아서 data/overrides.json 으로 만듦
4) 끝나면 웹앱이 읽는 JSON 파일(+구글 캘린더 구독용 gongji.ics)을 만들고 settings.json 의 publish 설정대로 올림 (폴더 복사 / git push)
시작할 때 하루에 한 번 자동으로 백업합니다 (backups/ 와 settings.json 의 backupDir).
  --no-backup  백업을 건너뜀      --no-publish  게시를 건너뜀
  --auto       예약 실행용 (질문 없이 진행, 새로 내보낸 파일이 없어도 저장소 기준으로 실행)
추가 옵션은 build_notices.py 로 그대로 넘깁니다 (예: --model qwen3:4b --days 30).
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backup  # noqa: E402
import build_notices  # noqa: E402
import build_reference  # noqa: E402
import publish  # noqa: E402
import remote  # noqa: E402
import store as st  # noqa: E402


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    do_backup, do_publish = '--no-backup' not in argv, '--no-publish' not in argv
    argv = [a for a in argv if a not in ('--no-backup', '--no-publish', '--auto')]
    # run_pipeline.bat 위로 끌어다 놓은 파일(공지·기본 정보 어느 쪽이든, 여러 개도 가능)은 collected 폴더로 옮겨서 함께 합친다
    rest = []
    for a in argv:
        p = Path(a)
        if p.suffix.lower() == '.json' and p.is_file() and p.name.startswith(('kku-notices-', 'kku-reference-')):
            st.STORE_DIR.mkdir(parents=True, exist_ok=True)
            dest = st.STORE_DIR / p.name
            if p.resolve() != dest.resolve():
                shutil.move(str(p), str(dest))
            print(f'받은 파일: {p.name}')
        else:
            rest.append(a)
    argv = rest
    if do_backup:
        print('=== 0. 백업 ===')
        if backup.auto_backup() is None:
            print('  오늘 이미 백업했거나 자동 백업이 꺼져 있습니다 (지금 바로 하려면 backup.bat)')
        print()
    refs = st.find_exports('reference')
    if refs:
        print('=== 1. 학교 기본 정보 갱신 ===')
        build_reference.main([])
        print()
    print('=== 2. 보정표 가져오기 ===')
    try:
        print('  ' + (remote.sync_overrides() or '보정표 주소가 정해져 있지 않아 건너뜁니다 (settings.json 의 remote.overrides)'))
    except Exception as e:  # noqa: BLE001  보정표는 부가 기능이라 어떤 오류도 공지 처리를 막지 않는다
        print(f'  보정표를 건너뜁니다: {e}')
    print()
    print('=== 3. 공지 합치기·해독 ===')
    code = build_notices.main(argv)
    if code == 0 and do_publish:
        print()
        print('=== 4. 웹앱에 올리기 ===')
        for line in publish.publish():
            print('  ' + line)
    return code


if __name__ == '__main__':
    sys.exit(main())
