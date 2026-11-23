// 시간표 화면의 '이수 내역'과 '수강신청 추천' 화면. 계산은 js/plan.js, 여기서는 그리기와 입력만 한다.
// app.js 가 mount(deps) 로 필요한 도구(저장소·문구·시간표 등)를 넘겨준다.
(function (root) {
  'use strict';
  const P = root.GongjiPlan;
  const DAYS = [1, 2, 3, 4, 5];
  const KINDS = ['전필', '전선', '기초', '심화', '소양', '일선', '교직'];

  function mount(deps) {
    const { h, store, toast } = deps;
    const T = () => deps.t();
    const $ = (s) => document.querySelector(s);
    const TT = root.GONGJI_TIMETABLE || null;
    const REQ = root.GONGJI_GRADREQ || null;
    const groups = P.groupOffered(TT);
    let catalog = null;
    const cat = () => (catalog = catalog || P.buildCatalog(TT, root.GONGJI_COURSES));

    const st = {
      sub: ['week', 'history', 'plan'].includes(store.get('ttSub', 'week')) ? store.get('ttSub', 'week') : 'week',
      history: P.cleanHistory(store.get('history', [])),
      req: store.get('gradReq', null) || {},
      prefs: Object.assign({ target: null, grades: [], include: { major: true, general: true, elearn: true, live: true }, avoid: [], takenNow: true, semesters: null, locked: [], excluded: [] },
        store.get('planPrefs', null) || {}),
      paste: null,
      result: null
    };
    const save = () => {
      store.set('history', st.history);
      store.set('gradReq', st.req);
      store.set('planPrefs', st.prefs);
      if (deps.onChange) deps.onChange();
    };

    // ---------- 공통 계산 ----------
    const dept = () => String(st.req.dept || (deps.getProfile().dept) || deps.getDept() || '').trim();
    const requirement = () => P.requirement(dept(), REQ, st.req);
    const totalsNow = () => P.totals(st.history);
    const leftNow = () => P.remaining(requirement(), totalsNow());
    const myGrade = () => deps.getProfile().grade || null;
    const semLeft = () => {
      const v = Number(st.prefs.semesters);
      if (v >= 1 && v <= 12) return v;
      return P.semestersLeft(myGrade(), deps.now) || null;
    };
    const kindLabel = (k) => (T().kindLabel && T().kindLabel[k]) || k || '';
    const termName = (term) => {
      const m = /^(\d{4})-(1|2|S|W)$/.exec(term || '');
      return m ? T().termName(m[1], m[2]) : T().histTermNone;
    };
    const slotText = (slots) => slots.map(([d, a, b]) => `${deps.dayName(d)} ${a}–${b}`).join(', ');

    // 학기 선택지: 지금부터 6년 전까지 (최근 학기가 위)
    function termOptions() {
      const cur = P.currentTerm(deps.now);
      const out = [];
      for (let y = cur.year; y >= cur.year - 6; y--) {
        for (const t of ['W', '2', 'S', '1']) {
          const key = `${y}-${t}`;
          if (P.termKey(key) > P.termKey(`${cur.year}-${cur.term}`)) continue;
          out.push(key);
        }
      }
      return out;
    }

    // ---------- 보기 전환 (이번 학기 · 이수 내역 · 수강신청 추천) ----------
    function setSub(sub) {
      st.sub = sub;
      store.set('ttSub', sub);
      render();
    }
    function renderTabs() {
      const panel = $('#timetable-panel');
      panel.dataset.sub = st.sub;
      document.querySelectorAll('#tt-sub [data-sub]').forEach((b) => {
        const on = b.dataset.sub === st.sub;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
      });
      $('#history-view').hidden = st.sub !== 'history';
      $('#plan-view').hidden = st.sub !== 'plan';
    }

    // ---------- 이수 내역 ----------
    function meter(label, done, need, extra) {
      const pct = need ? Math.min(100, Math.round((done / need) * 100)) : 0;
      return h('div', { class: 'meter' + (need && done >= need ? ' is-done' : '') },
        h('div', { class: 'meter-head' },
          h('span', { class: 'meter-label' }, label),
          h('span', { class: 'meter-num' }, h('strong', null, String(done)), need !== null && need !== undefined ? ` / ${need}` : '')),
        need ? h('div', { class: 'meter-bar', role: 'presentation' }, h('i', { style: `width:${pct}%` })) : null,
        extra || null);
    }

    function renderSummary() {
      const Tx = T();
      const req = requirement();
      const tot = totalsNow();
      const left = leftNow();
      const pct = req.total ? Math.min(100, Math.round((tot.total / req.total) * 100)) : 0;
      const head = h('div', { class: 'plan-hero has-ring' },
        req.total ? ring(pct, `${pct}%`) : null,
        h('div', null,
          h('p', { class: 'plan-kicker' }, [req.dept, req.mode === 'transfer' ? Tx.reqModeTransfer : ''].filter(Boolean).join(' · ') || Tx.histTitle),
          h('p', { class: 'plan-big' }, left.total !== null ? Tx.histLeft(left.total) : Tx.histLeftUnknown),
          h('p', { class: 'plan-side' }, [Tx.histDone(tot.total), (() => { const v = P.gpa(st.history); return v ? Tx.gpaHero(v.gpa.toFixed(2)) : ''; })()].filter(Boolean).join(' · '))));
      const meters = h('div', { class: 'meters' },
        meter(Tx.areaTotal, tot.total, req.total),
        meter(Tx.areaMajor, tot.major, req.major),
        meter(Tx.areaGeneral, tot.general, req.general,
          req.gen ? h('p', { class: 'meter-sub' }, ['기초', '심화', '소양'].map((g) => `${Tx.genLabel[g]} ${tot.gen[g]}/${req.gen[g]}`).join(' · ')) : null));
      return [head, meters, renderRoadmap(left), renderRequired()];
    }

    // 원형 진행 표시 (SVG). 처음 그릴 때 0 에서 값까지 차오른다
    function ring(pct, label) {
      const r = 42;
      const c = 2 * Math.PI * r;
      const wrap = h('div', { class: 'ring', role: 'img', 'aria-label': label });
      wrap.innerHTML = `<svg viewBox="0 0 100 100"><circle class="ring-bg" cx="50" cy="50" r="${r}"/><circle class="ring-fg" cx="50" cy="50" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}"/></svg><span>${label}</span>`;
      const fg = wrap.querySelector('.ring-fg');
      requestAnimationFrame(() => requestAnimationFrame(() => { fg.style.strokeDashoffset = String((c * (1 - pct / 100)).toFixed(1)); }));
      return wrap;
    }

    // 남은 전공필수: 요람의 내 학과 전공필수 중 이수 내역에 없는 과목. 이번 학기에 열렸으면 눌러서 추천에 고정
    function renderRequired() {
      const Tx = T();
      const C = root.GongjiCurriculum;
      const d = C && C.findDept ? C.findDept(dept(), root.GONGJI_COURSES) : null;
      if (!d) return null;
      const left = P.requiredLeft(d.courses, st.history);
      const offered = (name) => groups.find((g) => P.normName(g.name) === P.normName(name) && P.deptMatch(g.dept, dept()))
        || groups.find((g) => P.normName(g.name) === P.normName(name));
      return h('section', { class: 'req-left' },
        h('div', { class: 'road-head' }, h('h3', null, Tx.reqLeftTitle, left.length ? h('span', { class: 'group-count' }, ` ${left.length}`) : null),
          h('p', { class: 'fine' }, left.length ? Tx.reqLeftHelp : Tx.reqLeftNone)),
        left.length ? h('ul', { class: 'req-chips' }, left.map((x) => {
          const g = offered(x.name);
          return h('li', null, h('button', {
            type: 'button', class: 'req-chip' + (g ? '' : ' is-off'), disabled: g ? null : true,
            title: g ? Tx.palPin : Tx.reqNotOffered,
            onclick: () => { if (g) { setSub('plan'); api.pin(g.key); } }
          }, h('strong', null, x.name), h('small', null, [x.term, `${x.credit}${Tx.creditUnit}`, g ? '' : Tx.reqNotOffered].filter(Boolean).join(' · '))));
        })) : null);
    }

    // 졸업 로드맵: 남은 학점을 남은 학기에 나눈 막대
    function renderRoadmap(left) {
      const Tx = T();
      const sem = semLeft();
      const plan = P.roadmap(left, sem, P.nextTerm(deps.now));
      if (!plan.length) return null;
      const max = Math.max(...plan.map((x) => x.credits), 1);
      return h('section', { class: 'roadmap' },
        h('div', { class: 'road-head' }, h('h3', null, Tx.roadTitle), h('p', { class: 'fine' }, Tx.roadHelp(sem))),
        h('ol', { class: 'road-list' }, plan.map((x, i) => h('li', { style: `--i:${i}` },
          h('span', { class: 'road-term' }, termName(x.term)),
          h('span', { class: 'road-bar', style: `--w:${(x.credits / max) * 100}%` },
            x.major ? h('i', { class: 'm', style: `flex:${x.major}` }) : null,
            x.general ? h('i', { class: 'g', style: `flex:${x.general}` }) : null,
            x.free ? h('i', { class: 'f', style: `flex:${x.free}` }) : null),
          h('span', { class: 'road-num' }, h('strong', null, String(x.credits)), ` ${Tx.planBy(x.major, x.general, x.free)}`)))),
        h('ul', { class: 'road-legend' },
          h('li', { class: 'm' }, Tx.areaMajor), h('li', { class: 'g' }, Tx.areaGeneral), h('li', { class: 'f' }, Tx.roadFree)));
    }

    function renderReq() {
      const Tx = T();
      const req = requirement();
      const num = (key, label, value) => h('label', { class: 'req-field' },
        h('span', null, label),
        h('input', {
          type: 'number', min: '0', max: '300', step: '1', inputmode: 'numeric', value: value === null || value === undefined ? '' : String(value),
          onchange: (e) => {
            const v = e.target.value.trim();
            if (v === '') delete st.req[key]; else st.req[key] = Number(v);
            save(); render();
          }
        }));
      const setMode = (mode) => { st.req = { dept: st.req.dept, mode }; save(); render(); };
      const edited = Object.keys(req.edited).length > 0;
      return h('details', { class: 'plan-box req-box', open: !req.found || req.mode === 'transfer' || edited ? true : null },
        h('summary', null, h('span', null, Tx.reqTitle),
          h('small', null, !req.found ? Tx.reqNoDeptShort : req.mode === 'transfer' ? Tx.reqSourceTransfer(req.dept) : Tx.reqSource(req.dept))),
        h('div', { class: 'seg req-mode', role: 'group' },
          ['regular', 'transfer'].map((m) => h('button', { type: 'button', 'aria-pressed': String(req.mode === m), onclick: () => setMode(m) },
            m === 'transfer' ? Tx.reqModeTransfer : Tx.reqModeRegular))),
        req.mode === 'transfer' ? h('p', { class: 'help' }, Tx.reqTransferHelp) : null,
        !req.found ? h('p', { class: 'help warn-note' }, Tx.reqNoDept) : null,
        h('div', { class: 'req-grid' },
          h('label', { class: 'req-field wide' },
            h('span', null, Tx.reqDept),
            h('input', { type: 'text', list: 'dept-list', value: dept(), placeholder: Tx.profileDeptPh || '',
              onchange: (e) => { st.req.dept = e.target.value.trim(); save(); render(); } })),
          num('total', req.mode === 'transfer' ? Tx.reqTotalTransfer : Tx.reqTotal, req.total),
          num('major', Tx.reqMajor, req.major),
          num('general', Tx.reqGeneral, req.general)),
        edited ? h('button', { type: 'button', class: 'link-btn', onclick: () => { st.req = { dept: st.req.dept, mode: req.mode }; save(); render(); } }, Tx.reqReset) : null);
    }

    function addItems(items) {
      const before = st.history.length;
      st.history = P.cleanHistory(st.history.concat(items.map((x, i) => Object.assign({ id: 'h' + Date.now().toString(36) + i }, x))));
      save();
      return st.history.length - before;
    }

    function renderAdd() {
      const Tx = T();
      const terms = termOptions();
      const cur = P.currentTerm(deps.now);
      const form = h('form', { class: 'hist-form', onsubmit: (e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const name = f.elements.name.value.trim();
        const credit = Number(f.elements.credit.value);
        if (!name || !(credit > 0)) { toast(Tx.histBadInput); return; }
        const hit = cat().byName.get(P.normName(name));
        const n = addItems([{ name, credit, kind: f.elements.kind.value, term: f.elements.term.value, code: hit ? hit.code : '', grade: f.elements.grade.value }]);
        if (!n) { toast(Tx.histDup); return; }
        f.elements.name.value = '';
        render();
        const again = $('#hist-name'); if (again) again.focus();
      } },
        h('label', { class: 'wide' }, h('span', null, Tx.histName),
          h('input', { type: 'text', name: 'name', id: 'hist-name', list: 'hist-names', autocomplete: 'off', maxlength: '60', required: true,
            oninput: (e) => {
              const hit = cat().byName.get(P.normName(e.target.value));
              if (!hit) return;
              const f = e.target.form;
              if (hit.credit) f.elements.credit.value = String(hit.credit);
              const k = P.cleanKind(hit.kind);
              if (KINDS.includes(k)) f.elements.kind.value = k;
            } })),
        h('label', null, h('span', null, Tx.histKind),
          h('select', { name: 'kind' }, KINDS.map((k) => h('option', { value: k }, kindLabel(k))))),
        h('label', null, h('span', null, Tx.histCredit),
          h('input', { type: 'number', name: 'credit', min: '0.5', max: '9', step: '0.5', value: '3', inputmode: 'decimal', required: true })),
        h('label', null, h('span', null, Tx.histTerm),
          h('select', { name: 'term' }, h('option', { value: '' }, Tx.histTermNone),
            terms.map((x) => h('option', { value: x, selected: x === `${cur.year}-${cur.term}` ? true : null }, termName(x))))),
        h('label', null, h('span', null, Tx.histGrade),
          h('select', { name: 'grade' }, h('option', { value: '' }, Tx.gradeNone), P.GRADES.map((g) => h('option', { value: g }, g)))),
        h('button', { type: 'submit', class: 'btn primary' }, Tx.histAdd));
      const names = h('datalist', { id: 'hist-names' }, cat().names.slice(0, 0));
      // 자동완성 후보: 내 학과 요람 과목 + 교양 + 개설 과목 (많으면 느려서 앞 600개)
      const opts = [];
      const seen = new Set();
      const C = root.GongjiCurriculum;
      if (C) for (const s of C.suggestions(dept(), root.GONGJI_COURSES)) { if (!seen.has(s.name)) { seen.add(s.name); opts.push(s.name); } }
      for (const g of groups) if (!seen.has(g.name)) { seen.add(g.name); opts.push(g.name); }
      names.replaceChildren(...opts.slice(0, 600).map((n) => h('option', { value: n })));
      return [form, names];
    }

    function fromTimetable() {
      const Tx = T();
      const cur = P.currentTerm(deps.now);
      const names = [...new Set(deps.getTimetable().map((c) => c.name).filter(Boolean))];
      if (!names.length) { toast(Tx.histFromTtNone); return; }
      const items = names.map((name) => {
        const hit = cat().byName.get(P.normName(name));
        return { name, credit: hit ? Number(hit.credit) || 3 : 3, kind: hit ? P.cleanKind(hit.kind) : '전선', code: hit ? hit.code : '', term: `${cur.year}-${cur.term}` };
      });
      const n = addItems(items);
      toast(n ? Tx.histFromTtDone(n) : Tx.histDup);
      render();
    }

    function renderPaste() {
      const Tx = T();
      const box = h('details', { class: 'plan-box paste-box', open: st.paste ? true : null },
        h('summary', null, h('span', null, Tx.histPasteTitle)),
        h('p', { class: 'help' }, Tx.histPasteHelp),
        h('textarea', { id: 'hist-paste', rows: '5', spellcheck: 'false', placeholder: Tx.histPastePh }),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn small', onclick: () => {
            st.paste = P.parsePaste($('#hist-paste').value, cat());
            render();
            const d = document.querySelector('.paste-box'); if (d) d.open = true;
          } }, Tx.histPasteRead)));
      if (st.paste) {
        const r = st.paste;
        box.append(h('p', { class: 'fine' }, Tx.histPastePreview(r.items.length, r.failed, r.skipped)));
        if (r.items.length) {
          box.append(h('ul', { class: 'paste-list' }, r.items.map((x) => h('li', null,
            h('span', { class: 'pl-name' }, x.name), h('span', { class: 'pl-meta' }, [kindLabel(x.kind), `${x.credit}`, termName(x.term)].filter(Boolean).join(' · '))))));
          box.append(h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn small primary', onclick: () => {
              const n = addItems(r.items);
              st.paste = null;
              toast(Tx.histAdded(n));
              render();
            } }, Tx.histPasteAdd(r.items.length)),
            h('button', { type: 'button', class: 'btn small', onclick: () => { st.paste = null; render(); } }, Tx.cancel || '×')));
        }
      }
      return box;
    }

    function renderTerms() {
      const Tx = T();
      if (!st.history.length) return h('p', { class: 'empty' }, Tx.histEmpty);
      return h('div', { class: 'terms' }, P.byTerm(st.history).map((g) => h('section', { class: 'term' },
        h('h4', { class: 'term-head' }, h('span', null, termName(g.term)),
          h('span', { class: 'term-sum' }, [Tx.histCredits(g.credits), (() => { const v = P.gpa(g.items); return v ? Tx.gpaLabel(v.gpa.toFixed(2)) : ''; })()].filter(Boolean).join(' · '))),
        h('ul', { class: 'term-list' }, g.items.map((x) => h('li', null,
          h('span', { class: 'tl-name' }, x.name),
          h('span', { class: 'tl-kind' }, kindLabel(x.kind)),
          h('select', { class: 'tl-grade', 'aria-label': `${x.name} ${Tx.histGrade}`, onchange: (e) => {
            st.history = st.history.map((y) => (y === x ? Object.assign({}, y, { grade: e.target.value }) : y));
            st.history = P.cleanHistory(st.history);
            save(); render();
          } }, h('option', { value: '' }, '—'), P.GRADES.concat('F').map((gr) => h('option', { value: gr, selected: x.grade === gr ? true : null }, gr))),
          h('span', { class: 'tl-credit' }, String(x.credit)),
          h('button', { type: 'button', class: 'icon-x', 'aria-label': `${x.name} ${Tx.histRemove}`, title: Tx.histRemove, onclick: () => {
            const before = st.history;
            st.history = st.history.filter((y) => y !== x);
            save(); render();
            toast(Tx.histRemoved(x.name), { label: Tx.undo, run: () => { st.history = before; save(); render(); } });
          } }, '×')))))));
    }

    function renderHistory() {
      const Tx = T();
      const box = $('#history-view');
      box.replaceChildren(
        h('div', { class: 'plan-head' }, h('h2', null, Tx.histTitle), h('p', { class: 'help' }, Tx.histHelp)),
        ...renderSummary(),
        renderReq(),
        h('section', { class: 'plan-box add-box' },
          h('div', { class: 'add-head' }, h('h3', null, Tx.histAddTitle),
            h('button', { type: 'button', class: 'btn small', onclick: fromTimetable }, Tx.histFromTt)),
          ...renderAdd()),
        renderPaste(),
        renderTerms());
    }

    // ---------- 수강신청 추천 ----------
    function takenSet() {
      const s = new Set();
      for (const x of st.history) { if (x.code) s.add(x.code); s.add(P.normName(x.name)); }
      if (st.prefs.takenNow) for (const c of deps.getTimetable()) s.add(P.normName(c.name));
      return s;
    }
    function deptCourses() {
      const C = root.GongjiCurriculum;
      const s = new Set();
      const d = C && C.findDept ? C.findDept(dept(), root.GONGJI_COURSES) : null;
      if (d) for (const [, , name] of d.courses) s.add(P.normName(name));
      return s;
    }
    function nextGrade() {
      const g = myGrade();
      if (!g) return null;
      return P.currentTerm(deps.now).term === '2' ? Math.min(4, g + 1) : g;
    }
    function defaultTarget() {
      const left = leftNow();
      const pc = P.pace(left.total, semLeft(), 21);
      return pc.per ? Math.max(3, Math.min(21, pc.per)) : 18;
    }

    // 추천: 세 가지 안(균형 · 공강 최대 · 늦게 시작)을 함께 계산하고, 고른 안을 보여 준다
    function run() {
      const left = leftNow();
      st.alts = P.alternatives({
        groups, taken: takenSet(), left, target: Number(st.prefs.target) || defaultTarget(),
        grades: st.prefs.grades, dept: dept(), deptCourses: deptCourses(), myGrade: nextGrade(),
        include: st.prefs.include, avoidDays: st.prefs.avoid, locked: st.prefs.locked, excluded: st.prefs.excluded
      });
      const pick = st.alts.find((a) => a.key === st.altKey) || st.alts[0];
      st.altKey = pick.key;
      st.result = pick.result;
      renderPlan();
    }
    function runSoon() {
      st.busy = true;
      renderPlan();
      setTimeout(() => { st.busy = false; run(); }, 30);
    }

    function chipToggle(label, on, onclick, extra) {
      return h('button', { type: 'button', class: 'chip small' + (extra ? ' ' + extra : ''), 'aria-pressed': String(!!on), onclick }, label);
    }

    function renderPlanForm() {
      const Tx = T();
      const p = st.prefs;
      const left = leftNow();
      const sem = semLeft();
      const pc = P.pace(left.total, sem, 21);
      const nt = P.nextTerm(deps.now);
      const [ny, nterm] = nt.split('-');
      const setPref = (patch) => { Object.assign(st.prefs, patch); save(); renderPlan(); };
      const allGrades = !p.grades || !p.grades.length;
      return h('div', { class: 'plan-form' },
        h('div', { class: 'plan-hero' },
          h('div', null,
            h('p', { class: 'plan-kicker' }, Tx.planNext(Tx.termName(ny, nterm))),
            h('p', { class: 'plan-big' }, left.total !== null && sem ? Tx.planPace(left.total, sem, pc.per) : Tx.histLeftUnknown)),
          pc.over ? h('p', { class: 'plan-side warn-note' }, Tx.planPaceOver) : null,
          (() => {
            const q = P.split(left, Number(p.target) || defaultTarget());
            return left.major !== null || left.general !== null ? h('p', { class: 'plan-split' }, Tx.planSplit(Number(p.target) || defaultTarget(), q.major, q.general)) : null;
          })()),
        h('div', { class: 'plan-fields' },
          h('label', { class: 'req-field' }, h('span', null, Tx.planTarget),
            h('input', { type: 'number', min: '1', max: '24', step: '1', inputmode: 'numeric', value: String(Number(p.target) || defaultTarget()),
              onchange: (e) => setPref({ target: Number(e.target.value) || null }) })),
          h('label', { class: 'req-field' }, h('span', null, Tx.planSemesters),
            h('input', { type: 'number', min: '1', max: '12', step: '1', inputmode: 'numeric', value: sem ? String(sem) : '',
              onchange: (e) => setPref({ semesters: Number(e.target.value) || null, target: null }) }))),
        h('div', { class: 'plan-row' }, h('span', { class: 'plan-row-label' }, Tx.planGrades),
          h('div', { class: 'chips' },
            chipToggle(Tx.planGradeAll, allGrades, () => setPref({ grades: [] })),
            [1, 2, 3, 4].map((g) => chipToggle(Tx.gradeN(g), !allGrades && p.grades.includes(g), () => {
              const set = new Set(allGrades ? [] : p.grades);
              if (set.has(g)) set.delete(g); else set.add(g);
              setPref({ grades: [...set].sort() });
            })))),
        h('div', { class: 'plan-row' }, h('span', { class: 'plan-row-label' }, Tx.planInclude),
          h('div', { class: 'chips' },
            ['major', 'general', 'elearn', 'live'].map((k) => chipToggle(Tx['planInc_' + k], p.include[k] !== false, () => {
              setPref({ include: Object.assign({}, p.include, { [k]: p.include[k] === false }) });
            })))),
        h('div', { class: 'plan-row' }, h('span', { class: 'plan-row-label' }, Tx.planAvoid),
          h('div', { class: 'chips' },
            DAYS.map((d) => chipToggle(deps.dayName(d), p.avoid.includes(d), () => {
              const set = new Set(p.avoid);
              if (set.has(d)) set.delete(d); else set.add(d);
              setPref({ avoid: [...set] });
            })))),
        h('label', { class: 'toggle' },
          h('input', { type: 'checkbox', checked: p.takenNow ? true : null, onchange: (e) => setPref({ takenNow: e.target.checked }) }),
          h('span', null, Tx.planTakenNow)),
        !dept() ? h('p', { class: 'help warn-note' }, Tx.planNeedDept) : null,
        h('button', { type: 'button', class: 'btn primary plan-run', onclick: runSoon, disabled: st.busy ? true : null }, st.busy ? Tx.altComputing : Tx.planRun));
    }

    // 고른 분반을 요일×시간 격자로 (월~금, 수업이 있는 시간대만)
    function miniGrid(picks) {
      const timed = picks.filter((p) => p.section.t.length);
      if (!timed.length) return null;
      const toMin = (x) => { const [a, b] = x.split(':').map(Number); return a * 60 + b; };
      let lo = 24 * 60;
      let hi = 0;
      for (const p of timed) for (const [, a, b] of p.section.t) { lo = Math.min(lo, toMin(a)); hi = Math.max(hi, toMin(b)); }
      lo = Math.floor(lo / 60) * 60;
      hi = Math.ceil(hi / 60) * 60;
      const days = [...new Set([...DAYS, ...timed.flatMap((p) => p.section.t.map((x) => x[0]))])].sort((a, b) => (a || 7) - (b || 7));
      const span = hi - lo;
      const hours = [];
      for (let m = lo; m < hi; m += 60) hours.push(m / 60);
      return h('div', { class: 'mini-tt', style: `--cols:${days.length};--rows:${hours.length}` },
        h('div', { class: 'mini-head' }, h('span'), days.map((d) => h('span', null, deps.dayName(d)))),
        h('div', { class: 'mini-body' },
          h('div', { class: 'mini-hours' }, hours.map((x) => h('span', null, String(x)))),
          days.map((d) => h('div', { class: 'mini-col' },
            timed.flatMap((p) => p.section.t.filter((x) => x[0] === d).map(([, a, b]) => h('div', {
              class: 'mini-class' + (p.section.mode === 'live' ? ' live' : ''),
              style: `top:${((toMin(a) - lo) / span) * 100}%;height:${((toMin(b) - toMin(a)) / span) * 100}%;--c:${deps.classColor(p.group.name)}`,
              title: `${p.group.name} ${a}–${b}`
            }, h('b', null, p.group.name), h('small', null, `${a}–${b}`))))))));
    }

    function renderResult() {
      const Tx = T();
      const r = st.result;
      if (!r) return null;
      const p = st.prefs;
      if (!r.picks.length) return h('div', { class: 'plan-result' }, h('p', { class: 'empty' }, Tx.planNone));
      const elearn = r.picks.filter((x) => !x.section.t.length).length;
      const setLocked = (key, s) => {
        const others = p.locked.filter((x) => x.key !== key);
        st.prefs.locked = s === null ? others : others.concat({ key, s });
        save(); run();
      };
      const rows = r.picks.map((x) => {
        const g = x.group;
        const sec = x.section;
        const when = sec.mode === 'elearn' ? Tx.planModeElearn : slotText(sec.t);
        const room = [...new Set(sec.t.map((y) => y[3]).filter(Boolean))].join(', ');
        const isLocked = p.locked.some((y) => y.key === x.key);
        return h('li', { class: 'pr' + (isLocked ? ' is-locked' : '') },
          h('div', { class: 'pr-main' },
            h('p', { class: 'pr-name' }, g.name, isLocked ? h('span', { class: 'pr-lock' }, Tx.planLocked) : null),
            h('p', { class: 'pr-meta' }, [kindLabel(g.kind), `${g.credit}${Tx.creditUnit}`, Tx.planGradeN(g.grade), g.area === 'major' ? g.dept : ''].filter(Boolean).join(' · ')),
            h('p', { class: 'pr-when' },
              h('span', { class: 'pr-sec' }, Tx.planSection(sec.s)), ' ', when,
              sec.mode === 'live' ? h('span', { class: 'pr-mode' }, Tx.planModeLive) : null,
              room && sec.mode === '' ? h('span', { class: 'pr-room' }, room) : null)),
          h('div', { class: 'pr-actions' },
            x.alts.length ? h('select', { 'aria-label': Tx.planAlts(x.alts.length), onchange: (e) => { if (e.target.value) setLocked(x.key, e.target.value); } },
              h('option', { value: '' }, Tx.planAlts(x.alts.length)),
              x.alts.map((s) => h('option', { value: s.s }, `${Tx.planSection(s.s)} · ${s.mode === 'elearn' ? Tx.planModeElearn : slotText(s.t)}`))) : null,
            h('button', { type: 'button', class: 'btn small', 'aria-pressed': String(isLocked), onclick: () => setLocked(x.key, isLocked ? null : sec.s) }, isLocked ? Tx.planUnlock : Tx.planLock),
            h('button', { type: 'button', class: 'btn small', onclick: () => {
              st.prefs.excluded = [...new Set(p.excluded.concat(x.key))];
              st.prefs.locked = p.locked.filter((y) => y.key !== x.key);
              save(); run();
            } }, Tx.planExclude)));
      });
      const altTabs = st.alts ? h('div', { class: 'alt-tabs', role: 'tablist', 'aria-label': Tx.altTitle }, st.alts.map((a) => {
        const r2 = a.result;
        const wk = a.days.filter((d) => d >= 1 && d <= 5).length;
        const sub = a.key === 'freeDay' ? (a.free && a.free.length ? Tx.altFree(a.free.map((d) => deps.dayName(d)).join('·')) : Tx.altNoFree)
          : a.key === 'lateStart' ? (a.ok === false ? Tx.altShort : a.start !== null ? Tx.altStart(`${String(Math.floor(a.start / 60)).padStart(2, '0')}:${String(a.start % 60).padStart(2, '0')}`) : Tx.planModeElearn)
            : Tx.altBalanced;
        return h('button', { type: 'button', role: 'tab', class: 'alt-tab', 'aria-selected': String(a.key === st.altKey),
          onclick: () => { st.altKey = a.key; st.result = a.result; renderPlan(); } },
          h('span', { class: 'alt-name' }, Tx['alt_' + a.key]),
          h('strong', null, `${r2.credits}${Tx.creditUnit}`, h('small', null, ` · ${Tx.altDays(wk)}`)),
          h('span', { class: 'alt-sub' }, sub));
      })) : null;
      return h('div', { class: 'plan-result' },
        altTabs,
        h('div', { class: 'pr-summary' },
          h('p', { class: 'pr-total' }, h('strong', null, String(r.credits)), ` / ${r.target}${Tx.creditUnit}`),
          h('p', { class: 'pr-by' }, Tx.planBy(r.byArea.major, r.byArea.general, r.byArea.free)),
          r.short ? h('p', { class: 'help warn-note' }, Tx.planShort(r.short)) : null),
        miniGrid(r.picks),
        elearn ? h('p', { class: 'fine' }, Tx.planElearnNote(elearn)) : null,
        h('ul', { class: 'pr-list' }, rows),
        h('div', { class: 'row pr-foot' },
          h('button', { type: 'button', class: 'btn', onclick: () => {
            const classes = P.toClasses(r.picks).map((c, i) => Object.assign({ id: 'p' + Date.now().toString(36) + i }, c, c.room ? {} : { room: undefined }));
            deps.setTimetable(classes, Tx.planToTtDone(r.picks.length));
          } }, Tx.planToTt),
          root.GongjiTTImage ? h('button', { type: 'button', class: 'btn', onclick: () => {
            const alt = (st.alts || []).find((a) => a.key === st.altKey);
            const [ny, nt] = P.nextTerm(deps.now).split('-');
            const el = r.picks.filter((x) => !x.section.t.length).map((x) => x.group.name);
            root.GongjiTTImage.download(P.toClasses(r.picks), {
              kicker: Tx.planTitle, title: Tx.termName(ny, nt), sub: `${r.credits}${Tx.creditUnit}${alt ? ' · ' + Tx['alt_' + alt.key] : ''}`,
              note: el.length ? Tx.ttImageElearn(el.join(', ')) : '', dayName: deps.dayName, colorOf: deps.classColor,
              dark: document.documentElement.dataset.theme === 'dark', filename: `gongji-plan-${ny}-${nt}.png`
            }).then((ok) => { if (ok) toast(Tx.ttImageDone); });
          } }, Tx.ttImage) : null,
          p.excluded.length ? h('button', { type: 'button', class: 'link-btn', onclick: () => { st.prefs.excluded = []; save(); run(); } },
            `${Tx.planExcluded(p.excluded.length)} · ${Tx.planClearExcluded}`) : null));
    }

    function renderPlan() {
      const Tx = T();
      const box = $('#plan-view');
      if (!groups.length) {
        box.replaceChildren(h('div', { class: 'plan-head' }, h('h2', null, Tx.planTitle)), h('p', { class: 'empty' }, Tx.planNoData));
        return;
      }
      const m = (TT && TT.meta) || {};
      box.replaceChildren(
        h('div', { class: 'plan-head' }, h('h2', null, Tx.planTitle), h('p', { class: 'help' }, Tx.planHelp)),
        h('div', { class: 'plan-cols' }, renderPlanForm(), renderResult() || h('div', { class: 'plan-result plan-empty' }, h('p', null, Tx.planHint))),
        h('p', { class: 'fine plan-data' }, Tx.planData(m.year || '', m.termName || '', (TT.courses || []).length, m.live || 0, m.elearn || 0)),
        h('p', { class: 'fine' }, Tx.planDataNote));
    }

    function render() {
      renderTabs();
      if (st.sub === 'history') renderHistory();
      if (st.sub === 'plan') { if (st.result) run(); else renderPlan(); }
    }

    document.querySelectorAll('#tt-sub [data-sub]').forEach((b) => {
      b.addEventListener('click', () => setSub(b.dataset.sub));
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const list = [...document.querySelectorAll('#tt-sub [data-sub]')];
        const i = list.indexOf(b) + (e.key === 'ArrowRight' ? 1 : -1);
        const next = list[(i + list.length) % list.length];
        next.focus();
        setSub(next.dataset.sub);
      });
    });

    const api = {
      render,
      setSub,
      // 빠른 실행에서 과목 찾기 (이름에 검색어가 든 과목, 내 학과 먼저)
      findCourses(q, limit) {
        const n = P.normName(q);
        if (!n) return [];
        const mine = (g) => (P.deptMatch(g.dept, dept()) ? 0 : 1);
        return groups.filter((g) => P.normName(g.name).includes(n))
          .sort((a, b) => mine(a) - mine(b) || (P.normName(a.name).startsWith(n) ? 0 : 1) - (P.normName(b.name).startsWith(n) ? 0 : 1) || a.name.localeCompare(b.name))
          .slice(0, limit || 5)
          .map((g) => ({ key: g.key, name: g.name, sub: [kindLabel(g.kind), `${g.credit}${T().creditUnit}`, g.dept, T().planAlts ? `${g.sections.length}${T().secUnit}` : ''].filter(Boolean).join(' · ') }));
      },
      // 과목을 추천에 고정하고 추천 화면으로
      pin(key) {
        const g = groups.find((x) => x.key === key);
        if (!g) return;
        st.prefs.locked = st.prefs.locked.filter((x) => x.key !== key).concat({ key, s: g.sections[0].s });
        st.prefs.excluded = st.prefs.excluded.filter((x) => x !== key);
        save();
        setSub('plan');
        run();
      },
      progress() {
        const req = requirement();
        const tot = totalsNow();
        const left = leftNow();
        return { total: req.total, done: tot.total, left, dept: req.dept, count: st.history.length, mode: req.mode };
      },
      // 백업 파일에 넣고 불러올 값
      values: () => ({ history: st.history, gradReq: st.req, planPrefs: st.prefs }),
      load(v) {
        if (Array.isArray(v.history)) st.history = P.cleanHistory(v.history);
        if (v.gradReq && typeof v.gradReq === 'object') st.req = v.gradReq;
        if (v.planPrefs && typeof v.planPrefs === 'object') st.prefs = Object.assign(st.prefs, v.planPrefs);
        save();
        render();
      }
    };
    return api;
  }

  root.GongjiPlanUI = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
