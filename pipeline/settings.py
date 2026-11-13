# -*- coding: utf-8 -*-
"""내 설정 파일(settings.json) 읽기. 없으면 기본값을 쓴다.

settings.example.json 을 settings.json 으로 복사해서 고친다 (settings.json 은 내 PC 경로가 들어 있어 공개 저장소에 올리지 않음).
  backupDir   백업 사본을 한 번 더 둘 폴더. 구글 드라이브 데스크톱 앱의 동기화 폴더를 적으면 자동으로 드라이브에도 백업된다.
  backupKeep  백업을 몇 개까지 남길지 (오래된 것부터 지움)
  autoBackup  run_pipeline 을 실행할 때 하루에 한 번 자동으로 백업할지
  publish     데이터를 웹앱이 읽는 곳에 올리는 방법: folder(폴더로 복사) / git(커밋하고 push → GitHub Pages)
  remote      보정표를 가져올 곳. overrides 에 구글 문서·드라이브 파일·구글 시트·깃허브 주소 또는 내 컴퓨터의 docx/csv 경로를 적는다
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SETTINGS_PATH = ROOT / 'settings.json'

DEFAULTS = {
    'backupDir': '',
    'backupKeep': 10,
    'autoBackup': True,
    'publish': {'folder': '', 'git': False},
    'remote': {'overrides': ''},
}


def load(path: Path | None = None) -> dict:
    path = Path(path or SETTINGS_PATH)
    out = json.loads(json.dumps(DEFAULTS))
    if not path.is_file():
        return out
    try:
        user = json.loads(path.read_text(encoding='utf-8-sig'))
    except ValueError as e:
        print(f'  ! settings.json 을 읽지 못해 기본값을 씁니다: {e}')
        return out
    if not isinstance(user, dict):
        return out
    for k, v in user.items():
        if k.startswith('_'):                      # "_설명" 같은 메모 칸은 무시
            continue
        if isinstance(out.get(k), dict) and isinstance(v, dict):
            out[k].update(v)
        else:
            out[k] = v
    return out
