// 보정표: 수정할 수 있는 표(구글 시트·깃허브 CSV)에 적어 두면 앱이 받아 와서 공지에 덮어쓴다.
// - 마감일이 잘못 읽힌 공지 고치기, 지난 공지 숨기기, 중요 표시, 운영 메모, 긴급 안내 띄우기
// - 표 한 줄 = [대상, 항목, 값, 메모]   대상: 공지 id 또는 제목의 일부 (긴급 안내는 대상 칸을 비워 둠)
// - 브라우저(index.html)와 Node 테스트(tests/overrides.test.js)에서 똑같이 쓴다.
(function (root) {
  'use strict';

  const FIELDS = {
    숨김: 'hide', hide: 'hide', 마감: 'deadline', deadline: 'deadline', 포인트: 'points', points: 'points',
    금액: 'won', won: 'won', 혜택: 'benefit', benefit: 'benefit', 메모: 'note', note: 'note',
    중요: 'pin', pin: 'pin', 알림: 'banner', banner: 'banner'
  };
  const NO = new Set(['아니오', '아니요', 'no', 'n', 'false', '0', 'off', '해제']);

  // ---- CSV 읽기 (큰따옴표, 따옴표 안의 쉼표·줄바꿈, BOM, CRLF) ----
  function parseCSV(text) {
    const src = String(text == null ? '' : text).replace(/^﻿/, '');
    const rows = [];
    let row = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (q) {
        if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === '') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && src[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        rows.push(row); row = [];
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // ---- 주소 바꾸기: 편집용 주소를 받을 수 있는 주소로 ----
  // 반환 kind: sheet(구글 시트 → CSV) · pub(웹에 게시된 시트) · github(raw 로 바꿈) · gdoc/gdrive(브라우저에서는 못 읽음, 파이프라인에서는 읽음) · other
  function toRemoteUrl(input) {
    const url = String(input || '').trim();
    if (!/^https?:\/\//i.test(url)) return { url: '', kind: 'none' };
    let m = /^https?:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[\w-]+\/pub/i.exec(url);
    if (m) return { url: /[?&]output=/.test(url) ? url : url + (url.includes('?') ? '&' : '?') + 'output=csv', kind: 'pub' };
    m = /^https?:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/i.exec(url);
    if (m) {
      const gid = (/[?#&]gid=(\d+)/.exec(url) || [])[1] || '0';
      return { url: `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&gid=${gid}`, kind: 'sheet' };
    }
    m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i.exec(url);
    if (m) return { url: `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3].split('?')[0]}`, kind: 'github' };
    if (/^https?:\/\/docs\.google\.com\/document\/d\//i.test(url)) return { url, kind: 'gdoc' };
    if (/^https?:\/\/drive\.google\.com\//i.test(url)) return { url, kind: 'gdrive' };
    return { url, kind: /raw\.githubusercontent\.com/i.test(url) ? 'github' : 'other' };
  }

  // ---- 표 → 규칙 ----
  function realDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(s);
    if (!m) return false;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] &&
      (!m[4] || (+m[4] < 24 && +m[5] < 60));
  }
  function parseNumber(s) {
    const t = String(s).replace(/[,\s원P포인트점]/gi, '');
    let m = /^(\d+(?:\.\d+)?)만$/.exec(t);
    if (m) return Math.round(parseFloat(m[1]) * 10000);
    m = /^(\d+(?:\.\d+)?)천$/.exec(t);
    if (m) return Math.round(parseFloat(m[1]) * 1000);
    return /^\d+(?:\.\d+)?$/.test(t) ? Math.round(parseFloat(t)) : null;
  }

  function parseOverrides(rows) {
    const rules = [];
    const errors = [];
    let banner = '';
    (rows || []).forEach((raw, i) => {
      const r = (raw || []).map((c) => String(c == null ? '' : c).trim());
      if (!r.some(Boolean) || /^#/.test(r[0])) return;
      if (/^(항목|field)$/i.test(r[1])) return;                    // 제목 줄
      const field = FIELDS[r[1].toLowerCase()] || FIELDS[r[1]];
      const line = i + 1;
      if (!field) { errors.push({ line, reason: `알 수 없는 항목 "${r[1]}"` }); return; }
      let value = r[2];
      if (field === 'banner') {
        if (!value) { errors.push({ line, reason: '알림 문구가 비어 있어요' }); return; }
        banner = value.slice(0, 200);
        return;
      }
      if (!r[0]) { errors.push({ line, reason: '대상이 비어 있어요 (공지 id나 제목 일부)' }); return; }
      if (field === 'hide' || field === 'pin') {
        if (NO.has(value.toLowerCase())) return;                    // "아니오"면 규칙 없음
        value = true;
      } else if (field === 'deadline') {
        value = value.replace(/\./g, '-').replace(/\//g, '-').replace(' ', 'T');
        value = value.replace(/^(\d{4})-(\d{1,2})-(\d{1,2})/, (_, y, mo, d) => `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`);
        if (!realDate(value)) { errors.push({ line, reason: `마감 날짜 형식이 아니에요 "${r[2]}" (예: 2026-11-20 또는 2026-11-20 17:00)` }); return; }
      } else if (field === 'points' || field === 'won') {
        const num = parseNumber(value);
        if (num === null || num < 0 || (field === 'points' ? num > 1000 : num > 1e9)) { errors.push({ line, reason: `숫자가 아니에요 "${r[2]}"` }); return; }
        value = num;
      } else {
        if (!value) { errors.push({ line, reason: `${r[1]} 값이 비어 있어요` }); return; }
        value = value.slice(0, 300);
      }
      rules.push({ target: r[0], field, value, line });
    });
    return { rules, banner, errors };
  }

  // ---- 규칙 → 공지 ----
  const norm = (s) => String(s || '').toLowerCase().replace(/[\s[\]()「」『』"'·\-_/<>]/g, '');

  function matchNotices(notices, target) {
    const byId = notices.filter((n) => n.id === target);
    if (byId.length) return byId;
    const key = norm(target);
    if (key.length < 3) return [];
    return notices.filter((n) => norm(n.title).includes(key));
  }

  function benefitText(b) {
    const parts = [];
    if (b.points) parts.push(`다드림 ${b.points}P`);
    if (b.won) parts.push(`${Number(b.won).toLocaleString('ko-KR')}원`);
    return parts.join(' + ') || '운영자 보정';
  }

  // notices 는 건드리지 않고 새 목록을 돌려준다 (바뀐 공지만 복사본)
  function applyOverrides(notices, parsed) {
    const rules = (parsed && parsed.rules) || [];
    if (!rules.length) return { notices, applied: 0, hidden: 0, unmatched: [] };
    const patches = new Map();            // 공지 → 바뀐 항목들
    const hide = new Set();
    const unmatched = [];
    for (const rule of rules) {
      const hits = matchNotices(notices, rule.target);
      if (!hits.length) { if (!unmatched.includes(rule.target)) unmatched.push(rule.target); continue; }
      for (const n of hits) {
        if (rule.field === 'hide') { hide.add(n); continue; }
        if (!patches.has(n)) patches.set(n, []);
        patches.get(n).push(rule);
      }
    }
    let applied = 0;
    const out = [];
    for (const n of notices) {
      if (hide.has(n)) continue;
      const list = patches.get(n);
      if (!list) { out.push(n); continue; }
      const c = Object.assign({}, n);
      const b = c.benefit ? Object.assign({}, c.benefit) : null;
      let nb = b;
      const done = [];
      for (const r of list) {
        if (r.field === 'deadline') c.deadline = r.value;
        else if (r.field === 'note') c.opNote = r.value;
        else if (r.field === 'pin') c.pinned = true;
        else if (r.field === 'benefit') { nb = nb || {}; nb.text = { ko: r.value }; }
        else if (r.field === 'points') { nb = nb || {}; nb.points = r.value; if (!nb.text) nb.text = { ko: benefitText(nb) }; }
        else if (r.field === 'won') { nb = nb || {}; nb.won = r.value; if (!nb.text) nb.text = { ko: benefitText(nb) }; }
        done.push(r.field);
      }
      if (nb) c.benefit = nb;
      c.overrides = done.filter((v, i, a) => a.indexOf(v) === i);
      applied++;
      out.push(c);
    }
    return { notices: out, applied, hidden: hide.size, unmatched };
  }

  // ---- 받아 오기 (fetchImpl 로 시험할 수 있게) ----
  async function fetchRows(source, o) {
    const opt = o || {};
    const f = opt.fetchImpl || (typeof fetch === 'function' ? fetch : null);
    const target = typeof source === 'string' ? toRemoteUrl(source) : source;
    if (!f || !target.url) return { ok: false, error: 'no-url' };
    if (target.kind === 'gdoc' || target.kind === 'gdrive') return { ok: false, error: 'browser-unsupported', kind: target.kind };
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), opt.timeoutMs || 8000) : null;
    try {
      const res = await f(target.url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      if (!res.ok) return { ok: false, error: 'http-' + res.status };
      const text = await res.text();
      if (/^\s*</.test(text)) return { ok: false, error: 'not-csv' };   // 로그인 화면 같은 HTML
      if (/^\s*\{/.test(text)) {
        const j = JSON.parse(text);
        return Array.isArray(j.rows) ? { ok: true, rows: j.rows, text } : { ok: false, error: 'bad-json' };
      }
      return { ok: true, rows: parseCSV(text), text };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const api = { FIELDS, parseCSV, toRemoteUrl, parseOverrides, matchNotices, applyOverrides, fetchRows };
  root.GongjiOverrides = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
