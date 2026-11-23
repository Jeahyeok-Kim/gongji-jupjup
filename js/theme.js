// 공지 줍줍 화면 모드(라이트·다크·자동)와 글자 크기 (화면 문구와 상관없는 작은 모듈)
// - index.html 맨 위의 짧은 스크립트가 화면을 그리기 전에 처음 값을 정해 두고, 여기서는 바꾸기와 저장을 맡는다.
// - 자동: 기기(운영체제·브라우저) 설정을 따르고, 기기 설정이 바뀌면 같이 바뀐다.
(function (root) {
  'use strict';

  const doc = root.document;
  const mq = root.matchMedia ? root.matchMedia('(prefers-color-scheme: dark)') : null;
  const KEYS = { theme: 'gongji:theme', fontScale: 'gongji:fontScale' };
  const THEMES = ['auto', 'light', 'dark'];
  const FONTS = ['sm', 'md', 'lg'];
  const COLORS = { light: '#ffffff', dark: '#1a1d21' };    // 주소창·상태 표시줄 색 (위쪽 막대와 같은 흰 면)

  function read(key, allowed, fallback) {
    try {
      const v = JSON.parse(root.localStorage.getItem(KEYS[key]));
      return allowed.includes(v) ? v : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { root.localStorage.setItem(KEYS[key], JSON.stringify(value)); } catch (e) { /* 저장 못 해도 이번 방문에는 적용됨 */ }
  }

  let pref = read('theme', THEMES, 'auto');
  let font = read('fontScale', FONTS, 'md');
  const systemDark = () => !!(mq && mq.matches);
  const effective = () => (pref === 'auto' ? (systemDark() ? 'dark' : 'light') : pref);

  function apply(animate) {
    if (!doc) return;
    const el = doc.documentElement;
    if (animate) { el.classList.add('theme-anim'); setTimeout(() => el.classList.remove('theme-anim'), 400); }
    const eff = effective();
    el.dataset.theme = eff;
    el.dataset.themePref = pref;
    el.dataset.fs = font;
    const meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = COLORS[eff];
    doc.dispatchEvent(new CustomEvent('gongji:theme', { detail: { pref, effective: eff, font } }));
  }

  function setTheme(next) {
    if (!THEMES.includes(next)) return;
    pref = next;
    write('theme', pref);
    apply(true);
  }
  // 해·달 버튼: 지금 보이는 모드의 반대로 (자동이었다면 지금 보이는 모드 기준으로 고정)
  const toggle = () => setTheme(effective() === 'dark' ? 'light' : 'dark');
  function setFont(next) {
    if (!FONTS.includes(next)) return;
    font = next;
    write('fontScale', font);
    apply(false);
  }

  if (mq) {
    const onChange = () => { if (pref === 'auto') apply(false); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }
  if (doc) apply(false);

  root.GongjiTheme = { get: () => pref, effective, font: () => font, setTheme, toggle, setFont, THEMES, FONTS };
})(typeof window !== 'undefined' ? window : globalThis);
