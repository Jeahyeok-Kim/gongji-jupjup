// 웹앱 설정 (이 파일이 없어도 앱은 동작합니다)
// 서버 자동 갱신: 앱을 열 때와 열어 둔 동안 주기적으로 version.json 을 확인해서, 더 새로운 데이터가 있으면 받아 와서 화면을 바꿉니다.
window.GONGJI_CONFIG = {
  // version.json · notices.json · calendar.json 이 있는 주소.
  // 비워 두면 이 웹앱과 같은 서버의 data/ 폴더 (GitHub Pages 에 올렸다면 그대로 두면 됩니다).
  // 다른 서버를 쓰려면 브라우저 접근(CORS)을 허용하는 주소여야 합니다.
  //   예: 'https://raw.githubusercontent.com/내아이디/공지줍줍/main/data/'
  dataBase: '',
  // 열어 둔 동안 몇 분마다 확인할지 (0 이면 자동 확인을 끔)
  refreshMinutes: 30,
  // 보정표 주소 (수정 가능한 표). 비워 두면 서버의 data/overrides.json 만 읽습니다.
  //   - 구글 문서(docx)로 쓰는 경우: 여기에 적지 않습니다. 브라우저는 구글 문서를 읽을 수 없어서,
  //     settings.json 의 "remote": {"overrides": "문서 주소"} 에 적으면 파이프라인이 받아 data/overrides.json 으로 올려 줍니다.
  //   - 구글 시트: 공유를 '링크가 있는 모든 사용자 - 뷰어'로 바꾸고 편집 화면의 주소를 그대로 붙여 넣기 (브라우저가 직접 읽음)
  //     예: 'https://docs.google.com/spreadsheets/d/시트ID/edit#gid=0'
  //   - 깃허브: CSV 파일 주소 (blob 주소도 됩니다)
  // 표 한 줄 = 대상(공지 id나 제목 일부), 항목(마감·포인트·금액·혜택·메모·숨김·중요·알림), 값, 메모
  overridesUrl: ''
};
