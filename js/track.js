// 지원 보드: 저장한 공지를 '관심 → 준비 중 → 지원 완료 → 결과' 단계로 옮기며 관리한다 (트렐로·노션 보드 방식).
// 단계마다 준비물 체크리스트와 메모를 둔다. 계산만 하고 화면은 app.js 가 그린다. 브라우저와 Node(테스트) 양쪽에서 동작.
//   track = { [공지 id]: { stage: 'prep'|'done'|'result', checks: [{ t: '자기소개서', d: false }], memo: '', result: ''|'pass'|'fail', at: 시각 } }
//   '관심' 단계는 따로 적지 않는다: 저장(★)했고 track 에 없으면 관심. '지원 완료'는 기존 지원 완료 목록(applied)과 맞춘다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GongjiTrack = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STAGES = ['interest', 'prep', 'done', 'result'];
  const MAX_CHECKS = 20;
  // 자주 쓰는 준비물 (누르면 체크리스트에 바로 들어감)
  const SUGGEST = ['지원서', '자기소개서', '성적증명서', '재학증명서', '통장 사본', '포트폴리오', '추천서', '신분증 사본'];

  const isId = (x) => typeof x === 'string' && x.length > 0 && x.length <= 80;
  const str = (v, n) => String(v === undefined || v === null ? '' : v).slice(0, n);

  function cleanEntry(e) {
    if (!e || typeof e !== 'object') return null;
    const stage = STAGES.includes(e.stage) && e.stage !== 'interest' ? e.stage : null;
    const checks = (Array.isArray(e.checks) ? e.checks : [])
      .filter((c) => c && typeof c.t === 'string' && c.t.trim())
      .slice(0, MAX_CHECKS)
      .map((c) => ({ t: str(c.t.trim(), 40), d: c.d === true }));
    const memo = str(e.memo, 500);
    const result = e.result === 'pass' || e.result === 'fail' ? e.result : '';
    if (!stage && !checks.length && !memo) return null;          // 아무것도 없으면 지운다 (관심 단계로 돌아감)
    return { stage: stage || 'interest', checks, memo, result: stage === 'result' ? result : '', at: Number(e.at) || 0 };
  }

  function cleanTrack(obj) {
    const out = {};
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    for (const [id, e] of Object.entries(obj).slice(0, 400)) {
      if (!isId(id)) continue;
      const c = cleanEntry(e);
      if (c) out[id] = c;
    }
    return out;
  }

  // 공지 하나의 단계: 보드에 적힌 단계 > 지원 완료 목록 > 저장 목록
  function stageOf(id, track, saved, applied) {
    const e = track && track[id];
    if (e && e.stage && e.stage !== 'interest') return e.stage;
    if (applied && applied.includes(id)) return 'done';
    if ((saved && saved.includes(id)) || e) return 'interest';
    return null;
  }

  // 단계 옮기기: 새 track 과 함께 저장·지원 완료 목록도 맞춰 돌려준다 (원본은 건드리지 않음)
  function move(state, id, stage, now) {
    const track = { ...(state.track || {}) };
    let saved = (state.saved || []).slice();
    let applied = (state.applied || []).slice();
    const prev = track[id] || { checks: [], memo: '' };
    if (stage === null) {                                            // 보드에서 빼기 = 저장도 해제
      delete track[id];
      saved = saved.filter((x) => x !== id);
      applied = applied.filter((x) => x !== id);
      return { track, saved, applied };
    }
    if (!STAGES.includes(stage)) return { track, saved, applied };
    if (!saved.includes(id)) saved = saved.concat(id);              // 보드에 있는 공지는 모두 저장 (마감 알림이 오게)
    const done = stage === 'done' || stage === 'result';
    applied = done ? (applied.includes(id) ? applied : applied.concat(id)) : applied.filter((x) => x !== id);
    const next = cleanEntry({ ...prev, stage, at: now ? now.getTime() : Date.now() });
    if (next) track[id] = next; else delete track[id];
    return { track, saved, applied };
  }

  function update(track, id, patch) {
    const t = { ...(track || {}) };
    const e = cleanEntry({ stage: 'interest', checks: [], memo: '', ...(t[id] || {}), ...patch });
    if (e) t[id] = e; else delete t[id];
    return t;
  }
  function addCheck(track, id, text) {
    const t = String(text || '').trim();
    const cur = (track && track[id]) || { checks: [] };
    if (!t || cur.checks.some((c) => c.t === t)) return track;
    return update(track, id, { checks: cur.checks.concat({ t, d: false }) });
  }
  function toggleCheck(track, id, i) {
    const cur = track && track[id];
    if (!cur || !cur.checks[i]) return track;
    return update(track, id, { checks: cur.checks.map((c, k) => (k === i ? { ...c, d: !c.d } : c)) });
  }
  function removeCheck(track, id, i) {
    const cur = track && track[id];
    if (!cur) return track;
    return update(track, id, { checks: cur.checks.filter((_, k) => k !== i) });
  }
  function progress(entry) {
    const cs = (entry && entry.checks) || [];
    return { done: cs.filter((c) => c.d).length, total: cs.length };
  }

  // 보드 칸 나누기: 단계별 공지 목록 (마감 가까운 순, 마감 지난 것은 뒤로)
  function columns(notices, st, now, opt) {
    const o = opt || {};
    const byId = new Map((notices || []).map((n) => [n.id, n]));
    const ids = new Set([...(st.saved || []), ...(st.applied || []), ...Object.keys(st.track || {})]);
    const cols = { interest: [], prep: [], done: [], result: [] };
    for (const id of ids) {
      const n = byId.get(id);
      if (!n) continue;
      const stage = stageOf(id, st.track, st.saved, st.applied);
      if (!stage) continue;
      if (stage === 'done' && o.onlySaved && !(st.saved || []).includes(id) && !(st.track || {})[id]) continue;
      cols[stage].push(n);
    }
    const t = now ? now.getTime() : Date.now();
    const due = (n) => (n.deadline ? new Date(String(n.deadline).replace(' ', 'T')).getTime() : Infinity);
    const key = (n) => { const d = due(n); return d < t ? [1, -d] : [0, d]; };
    for (const k of STAGES) cols[k].sort((a, b) => { const x = key(a); const y = key(b); return x[0] - y[0] || x[1] - y[1]; });
    return cols;
  }

  function summary(cols, now) {
    const t = now ? now.getTime() : Date.now();
    const week = t + 7 * 86400000;
    const active = [...cols.interest, ...cols.prep];
    const dueWeek = active.filter((n) => { if (!n.deadline) return false; const d = new Date(String(n.deadline).replace(' ', 'T')).getTime(); return d >= t && d <= week; }).length;
    return { interest: cols.interest.length, prep: cols.prep.length, done: cols.done.length, result: cols.result.length, dueWeek };
  }

  return { STAGES, SUGGEST, cleanTrack, cleanEntry, stageOf, move, update, addCheck, toggleCheck, removeCheck, progress, columns, summary };
}));
