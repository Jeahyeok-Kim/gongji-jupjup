// 빠른 실행 (Ctrl+K / ⌘K): 화면 이동·설정 바꾸기·공지·과목을 한 칸에서 찾아 바로 실행한다.
// 리니어·노션·맥 스포트라이트 같은 '명령 팔레트'. 무엇을 보여 줄지는 app.js 가 items(query) 로 넘겨준다.
(function (root) {
  'use strict';

  function mount(deps) {
    const { h } = deps;
    const T = () => deps.t();
    let groups = [];
    let flat = [];
    let active = 0;
    let lastFocus = null;

    const input = h('input', {
      type: 'search', id: 'pal-q', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'go',
      role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'pal-list', 'aria-autocomplete': 'list'
    });
    const list = h('div', { id: 'pal-list', class: 'pal-list', role: 'listbox' });
    const hint = h('p', { class: 'pal-hint' });
    const dlg = h('dialog', { id: 'palette', class: 'palette', 'aria-label': '' },
      h('div', { class: 'pal-search' },
        h('span', { class: 'pal-icon', 'aria-hidden': 'true' }),
        input,
        h('kbd', { class: 'pal-esc' }, 'Esc')),
      list, hint);
    dlg.querySelector('.pal-icon').innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
    document.body.append(dlg);

    function render() {
      const Tx = T();
      groups = deps.items(input.value.trim()).filter((g) => g.items.length);
      flat = groups.flatMap((g) => g.items);
      if (active >= flat.length) active = Math.max(0, flat.length - 1);
      let k = 0;
      list.replaceChildren(...(flat.length ? groups.map((g) => h('section', { class: 'pal-group' },
        h('h3', null, g.title),
        g.items.map((it) => {
          const i = k++;
          return h('button', {
            type: 'button', role: 'option', id: 'pal-o' + i, class: 'pal-item' + (i === active ? ' is-active' : ''), 'aria-selected': String(i === active),
            onmousemove: () => { if (active !== i) { active = i; mark(); } },
            onclick: () => run(it)
          },
          h('span', { class: 'pal-glyph i-' + (it.icon || 'go'), 'aria-hidden': 'true' }),
          h('span', { class: 'pal-text' }, h('span', { class: 'pal-label' }, it.label), it.sub ? h('small', null, it.sub) : null),
          it.kbd ? h('kbd', null, it.kbd) : null);
        }))) : [h('p', { class: 'pal-empty' }, Tx.palEmpty)]));
      input.setAttribute('aria-activedescendant', flat.length ? 'pal-o' + active : '');
      hint.textContent = Tx.palHint;
    }
    function mark() {
      list.querySelectorAll('.pal-item').forEach((el, i) => {
        el.classList.toggle('is-active', i === active);
        el.setAttribute('aria-selected', String(i === active));
      });
      input.setAttribute('aria-activedescendant', flat.length ? 'pal-o' + active : '');
      const el = list.querySelector('.pal-item.is-active');
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
    function run(it) {
      close();
      setTimeout(() => it.run(), 0);
    }
    function open(q) {
      if (dlg.open) return;
      lastFocus = document.activeElement;
      dlg.setAttribute('aria-label', T().palTitle);
      input.placeholder = T().palPlaceholder;
      input.value = q || '';
      active = 0;
      render();
      dlg.showModal();
      input.focus();
    }
    function close() {
      if (dlg.open) dlg.close();
    }
    dlg.addEventListener('close', () => { if (lastFocus && lastFocus.focus) lastFocus.focus(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    input.addEventListener('input', () => { active = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(1, flat.length); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + flat.length) % Math.max(1, flat.length); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (flat[active]) run(flat[active]); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }      // 검색 칸의 Esc 는 글자 지우기 대신 바로 닫기
    });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (dlg.open) close(); else open();
      }
    });
    return { open, close, isOpen: () => dlg.open };
  }

  root.GongjiPalette = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
