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

    const curTermKey = `${P.currentTerm(deps.now).year}-${P.currentTerm(deps.now).term}`;
    const st = {
      sub: ['week', 'history', 'plan'].includes(store.get('ttSub', 'week')) ? store.get('ttSub', 'week') : 'week',
      history: P.cleanHistory(store.get('history', [])),
      req: store.get('gradReq', null) || {},
      prefs: Object.assign({ target: null, grades: [], include: { major: true, general: true, elearn: true, live: true }, avoid: [], takenNow: true, semesters: null, locked: [], excluded: [] },
        store.get('planPrefs', null) || {}),
      lastTerm: store.get('histLastTerm', curTermKey),
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

    // 학기 선택지: 다가올 계절/차기 학기부터 6년 전까지 (최근 학기가 위)
    function termOptions() {
      const cur = P.currentTerm(deps.now);
      const out = [];
      // 2학기일 때는 다가올 겨울학기(W) 및 차년도 1학기까지, 1학기일 때는 여름학기(S) 및 2학기까지 미리 선택 가능
      let maxYear = cur.year;
      let maxTerm = cur.term;
      if (cur.term === '2') {
        maxYear = cur.year + 1;
        maxTerm = '1';
      } else {
        maxTerm = '2';
      }
      const maxTermKey = P.termKey(`${maxYear}-${maxTerm}`);

      for (let y = maxYear; y >= cur.year - 6; y--) {
        for (const t of ['W', '2', 'S', '1']) {
          const key = `${y}-${t}`;
          if (P.termKey(key) > maxTermKey) continue;
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

    function renderDetailedBreakdown(tot, req) {
      if (!req || (!req.major && !req.general)) return null;

      const majorReqDone = (st.history || []).filter((x) => x.kind === '전필').reduce((s, x) => s + (Number(x.credit) || 0), 0);
      const majorElectDone = (st.history || []).filter((x) => x.kind === '전선').reduce((s, x) => s + (Number(x.credit) || 0), 0);
      const reqMajorReq = req.majorReq || 0;

      if (req.mode === 'transfer') {
        const freeReq = Math.max(0, (req.total || 66) - (req.major || 0));
        const freeDone = Math.max(0, tot.total - Math.min(tot.major, req.major || 0));
        const items = [
          {
            label: reqMajorReq > 0 ? '전공필수' : '전공필수 (학과)',
            done: majorReqDone,
            need: reqMajorReq || null,
            tag: reqMajorReq > 0 ? (majorReqDone >= reqMajorReq ? '완료 ✓' : `${reqMajorReq - majorReqDone}학점 부족`) : '의무 없음',
            ok: reqMajorReq > 0 ? majorReqDone >= reqMajorReq : true
          },
          {
            label: `전공 이수 (${req.major || 0}학점)`,
            done: tot.major,
            need: req.major,
            tag: (tot.major >= (req.major || 0)) ? '완료 ✓' : `${(req.major || 0) - tot.major}학점 부족`,
            ok: tot.major >= (req.major || 0)
          },
          {
            label: freeReq > 0 ? `자유 이수 (${freeReq}학점)` : '자유 이수',
            done: freeDone,
            need: freeReq > 0 ? freeReq : null,
            tag: freeReq === 0 ? '자유 불필요 (전공 100%)' : (freeDone >= freeReq ? '완료 ✓' : `${freeReq - freeDone}학점 부족`),
            ok: freeReq === 0 || freeDone >= freeReq
          },
          {
            label: `편입 총 이수 (${req.total || 66}학점)`,
            done: tot.total,
            need: req.total || 66,
            tag: (tot.total >= (req.total || 66)) ? '완료 ✓' : `${(req.total || 66) - tot.total}학점 부족`,
            ok: tot.total >= (req.total || 66)
          },
          {
            label: '교양 영역별 필수',
            done: tot.general,
            need: null,
            tag: '면제 ✓ (의무 없음)',
            ok: true,
            isExempt: true
          }
        ];

        return h('div', { class: 'grad-breakdown-card is-transfer-mode' },
          h('div', { class: 'gbc-head' },
            h('h4', null, '📊 영역별 세부 졸업요건 이수율'),
            h('span', { class: 'gbc-sub' }, '편입생: 기초·심화·KU소양 필수 면제 · 전공 및 자유 학점 충족 여부')
          ),
          h('div', { class: 'gbc-grid' }, items.map((it) => {
            const pct = it.need ? Math.min(100, Math.round((it.done / it.need) * 100)) : 100;
            return h('div', { class: `gbc-item ${it.ok ? 'is-fulfilled' : 'is-pending'}` },
              h('div', { class: 'gbc-item-top' },
                h('span', { class: 'gbc-item-label' }, it.label),
                h('span', { class: `gbc-item-badge ${it.ok ? 'ok' : 'warn'}` }, it.tag)
              ),
              h('div', { class: 'gbc-bar' },
                h('div', { class: 'gbc-bar-fill', style: `width:${pct}%;` })
              ),
              h('div', { class: 'gbc-item-nums' },
                it.isExempt ? h('span', { class: 'exempt-text' }, `이수 ${it.done}학점 (자유 학점으로 인정)`)
                  : [h('strong', null, `${it.done}학점`), it.need ? h('span', null, ` / ${it.need}학점`) : null]
              )
            );
          }))
        );
      }

      const items = [
        {
          label: '전공필수',
          done: majorReqDone,
          need: reqMajorReq,
          tag: majorReqDone >= reqMajorReq ? '완료 ✓' : `${reqMajorReq - majorReqDone}학점 부족`,
          ok: majorReqDone >= reqMajorReq
        },
        {
          label: '전공선택',
          done: majorElectDone,
          need: req.major ? Math.max(0, req.major - reqMajorReq) : null,
          tag: '전공선택',
          ok: req.major ? majorElectDone >= Math.max(0, req.major - reqMajorReq) : true
        },
        {
          label: '기초교양',
          done: tot.gen['기초'] || 0,
          need: req.gen ? req.gen['기초'] : 14,
          tag: (tot.gen['기초'] || 0) >= (req.gen ? req.gen['기초'] : 14) ? '완료 ✓' : `${(req.gen ? req.gen['기초'] : 14) - (tot.gen['기초'] || 0)}학점 부족`,
          ok: (tot.gen['기초'] || 0) >= (req.gen ? req.gen['기초'] : 14)
        },
        {
          label: '심화교양',
          done: tot.gen['심화'] || 0,
          need: req.gen ? req.gen['심화'] : 8,
          tag: (tot.gen['심화'] || 0) >= (req.gen ? req.gen['심화'] : 8) ? '완료 ✓' : `${(req.gen ? req.gen['심화'] : 8) - (tot.gen['심화'] || 0)}학점 부족`,
          ok: (tot.gen['심화'] || 0) >= (req.gen ? req.gen['심화'] : 8)
        },
        {
          label: 'KU소양',
          done: tot.gen['소양'] || 0,
          need: req.gen ? req.gen['소양'] : 9,
          tag: (tot.gen['소양'] || 0) >= (req.gen ? req.gen['소양'] : 9) ? '완료 ✓' : `${(req.gen ? req.gen['소양'] : 9) - (tot.gen['소양'] || 0)}학점 부족`,
          ok: (tot.gen['소양'] || 0) >= (req.gen ? req.gen['소양'] : 9)
        }
      ];

      return h('div', { class: 'grad-breakdown-card' },
        h('div', { class: 'gbc-head' },
          h('h4', null, '📊 영역별 세부 졸업요건 이수율'),
          h('span', { class: 'gbc-sub' }, '전필·교양 필수 영역별 충족 여부')
        ),
        h('div', { class: 'gbc-grid' }, items.map((it) => {
          const pct = it.need ? Math.min(100, Math.round((it.done / it.need) * 100)) : 100;
          return h('div', { class: `gbc-item ${it.ok ? 'is-fulfilled' : 'is-pending'}` },
            h('div', { class: 'gbc-item-top' },
              h('span', { class: 'gbc-item-label' }, it.label),
              h('span', { class: `gbc-item-badge ${it.ok ? 'ok' : 'warn'}` }, it.tag)
            ),
            h('div', { class: 'gbc-bar' },
              h('div', { class: 'gbc-bar-fill', style: `width:${pct}%;` })
            ),
            h('div', { class: 'gbc-item-nums' },
              h('strong', null, `${it.done}학점`),
              it.need ? h('span', null, ` / ${it.need}학점`) : null
            )
          );
        }))
      );
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

      let meters;
      if (req.mode === 'transfer') {
        const freeReq = Math.max(0, (req.total || 66) - (req.major || 0));
        const freeDone = Math.max(0, tot.total - Math.min(tot.major, req.major || 0));
        const extraMajor = Math.max(0, tot.major - (req.major || 0));
        const freeBreakdown = [
          tot.general ? `교양 ${tot.general}` : '',
          tot.free ? `일선 ${tot.free}` : '',
          extraMajor ? `초과전공 ${extraMajor}` : ''
        ].filter(Boolean).join(' · ');

        meters = h('div', { class: 'meters' },
          meter(Tx.areaTotal, tot.total, req.total),
          meter('전공 최소', tot.major, req.major),
          meter('자유(교양·일선)', freeDone, freeReq,
            freeBreakdown ? h('p', { class: 'meter-sub' }, freeBreakdown + '학점') : null));
      } else {
        meters = h('div', { class: 'meters' },
          meter(Tx.areaTotal, tot.total, req.total),
          meter(Tx.areaMajor, tot.major, req.major),
          meter(Tx.areaGeneral, tot.general, req.general,
            req.gen ? h('p', { class: 'meter-sub' }, ['기초', '심화', '소양'].map((g) => `${Tx.genLabel[g]} ${tot.gen[g]}/${req.gen[g]}`).join(' · ')) : null));
      }
      return [head, meters, renderDetailedBreakdown(tot, req), renderRoadmap(left), renderRequired()];
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
      const num = (key, label, value, onCustom) => h('label', { class: 'req-field' },
        h('span', null, label),
        h('input', {
          type: 'number', min: '0', max: '300', step: '1', inputmode: 'numeric', value: value === null || value === undefined ? '' : String(value),
          onchange: (e) => {
            const raw = e.target.value.trim();
            const v = raw === '' ? null : Number(raw);
            if (onCustom) {
              onCustom(v);
            } else {
              if (v === null) delete st.req[key]; else st.req[key] = v;
            }
            save(); render();
          }
        }));
      const setMode = (mode) => {
        const curDept = st.req.dept;
        st.req = { dept: curDept, mode };
        if (mode === 'transfer') {
          st.req.total = 66;
        }
        save(); render();
      };
      const edited = Object.keys(req.edited).length > 0;

      const applyPreset = (totVal, majVal, genVal) => {
        st.req.total = totVal;
        st.req.major = majVal;
        st.req.general = genVal;
        save(); render();
      };

      const transferPresets = req.mode === 'transfer' ? h('div', { class: 'req-presets-bar' },
        h('button', {
          type: 'button',
          class: 'req-preset-chip' + (req.major === 51 && req.general === 15 ? ' is-active' : ''),
          onclick: () => applyPreset(66, 51, 15)
        }, Tx.reqPreset51 || '⚡ 전공 51 + 자유 15 (전적대 전공 15학점 인정 시)'),
        h('button', {
          type: 'button',
          class: 'req-preset-chip' + (req.major === 66 && (req.general === 0 || !req.general) ? ' is-active' : ''),
          onclick: () => applyPreset(66, 66, 0)
        }, Tx.reqPreset66 || '⚡ 전공 66 (비동일계 전공 전체 이수)')
      ) : null;

      const reqInputs = req.mode === 'transfer' ? [
        num('total', Tx.reqTotalTransfer || '편입 후 이수할 학점', req.total, (v) => {
          if (v === null) delete st.req.total;
          else {
            st.req.total = v;
            if (st.req.major) st.req.general = Math.max(0, v - st.req.major);
          }
        }),
        num('major', Tx.reqMajorTransfer || '전공 최소 학점', req.major, (v) => {
          if (v === null) delete st.req.major;
          else {
            st.req.major = v;
            const curTot = st.req.total || req.total || 66;
            st.req.general = Math.max(0, curTot - v);
          }
        }),
        num('general', Tx.reqGeneralTransfer || '자유 학점 (교양/일선)', req.general !== null && req.general !== undefined ? req.general : Math.max(0, (req.total || 66) - (req.major || 0)), (v) => {
          if (v === null) delete st.req.general;
          else {
            st.req.general = v;
            const curTot = st.req.total || req.total || 66;
            st.req.major = Math.max(0, curTot - v);
          }
        })
      ] : [
        num('total', Tx.reqTotal, req.total),
        num('major', Tx.reqMajor, req.major),
        num('general', Tx.reqGeneral, req.general)
      ];

      return h('details', { class: 'plan-box req-box', open: !req.found || req.mode === 'transfer' || edited ? true : null },
        h('summary', null, h('span', null, Tx.reqTitle),
          h('small', null, !req.found ? Tx.reqNoDeptShort : req.mode === 'transfer' ? Tx.reqSourceTransfer(req.dept) : Tx.reqSource(req.dept))),
        h('div', { class: 'seg req-mode', role: 'group' },
          ['regular', 'transfer'].map((m) => h('button', { type: 'button', 'aria-pressed': String(req.mode === m), onclick: () => setMode(m) },
            m === 'transfer' ? Tx.reqModeTransfer : Tx.reqModeRegular))),
        req.mode === 'transfer' ? h('p', { class: 'help' }, Tx.reqTransferHelp) : null,
        transferPresets,
        !req.found ? h('p', { class: 'help warn-note' }, Tx.reqNoDept) : null,
        h('div', { class: 'req-grid' },
          h('label', { class: 'req-field wide' },
            h('span', null, Tx.reqDept),
            h('input', { type: 'text', list: 'dept-list', value: dept(), placeholder: Tx.profileDeptPh || '',
              onchange: (e) => { st.req.dept = e.target.value.trim(); save(); render(); } })),
          ...reqInputs),
        edited ? h('button', { type: 'button', class: 'link-btn', onclick: () => {
          st.req = { dept: st.req.dept, mode: req.mode };
          if (req.mode === 'transfer') st.req.total = 66;
          save(); render();
        } }, Tx.reqReset) : null);
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
      const defaultTerm = `${cur.year}-${cur.term}`;
      const curTermVal = (st.lastTerm !== undefined && st.lastTerm !== null) ? st.lastTerm : defaultTerm;

      // 전체 카탈로그(시간표 + 학사요람 전 학과 + 전체 교양) 목록
      const allCatalog = Array.from(cat().byName.values());
      const allCourseNames = [];
      const seen = new Set();
      const addCourse = (name) => {
        const s = String(name || '').trim();
        if (!s || seen.has(s)) return;
        seen.add(s);
        allCourseNames.push(s);
      };

      // 1. 내 학과 요람 과목 우선
      const C = root.GongjiCurriculum;
      if (C) {
        for (const s of C.suggestions(dept(), root.GONGJI_COURSES)) addCourse(s.name);
      }
      // 2. 이번 학기 개설 과목
      for (const g of groups) addCourse(g.name);
      // 3. 전체 요람 과목 (타과 전공, 교양 등 전체)
      for (const c of allCatalog) addCourse(c.name);

      const names = h('datalist', { id: 'hist-names' });
      // 초기 전체 과목 datalist 등록
      names.replaceChildren(...allCourseNames.map((n) => h('option', { value: n })));

      function updateSuggestions(query) {
        const q = P.normName(query || '');
        if (!q) {
          names.replaceChildren(...allCourseNames.slice(0, 500).map((n) => h('option', { value: n })));
          return;
        }
        const prefix = [];
        const contains = [];
        for (const item of allCatalog) {
          const norm = P.normName(item.name);
          if (norm.startsWith(q)) prefix.push(item.name);
          else if (norm.includes(q)) contains.push(item.name);
        }
        const matched = [...new Set([...prefix, ...contains])].slice(0, 150);
        names.replaceChildren(...matched.map((n) => h('option', { value: n })));
      }

      const form = h('form', { class: 'hist-form', onsubmit: (e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const name = f.elements.name.value.trim();
        const credit = Number(f.elements.credit.value);
        if (!name || !(credit > 0)) { toast(Tx.histBadInput); return; }
        const termVal = f.elements.term.value;
        st.lastTerm = termVal;
        store.set('histLastTerm', termVal);
        const hit = cat().byName.get(P.normName(name));
        const n = addItems([{ name, credit, kind: f.elements.kind.value, term: termVal, code: hit ? hit.code : '', grade: f.elements.grade.value }]);
        if (!n) { toast(Tx.histDup); return; }
        f.elements.name.value = '';
        render();
        const again = $('#hist-name'); if (again) again.focus();
      } },
        h('label', { class: 'wide' }, h('span', null, Tx.histName),
          h('input', { type: 'text', name: 'name', id: 'hist-name', list: 'hist-names', autocomplete: 'off', maxlength: '60', required: true,
            oninput: (e) => {
              const val = e.target.value;
              updateSuggestions(val);
              const hit = cat().byName.get(P.normName(val));
              if (!hit) return;
              const f = e.target.form;
              if (hit.credit && f.elements.credit) f.elements.credit.value = String(hit.credit);
              const k = P.cleanKind(hit.kind);
              if (KINDS.includes(k) && f.elements.kind) f.elements.kind.value = k;
            },
            onfocus: (e) => updateSuggestions(e.target.value) })),
        h('label', null, h('span', null, Tx.histKind),
          h('select', { name: 'kind' }, KINDS.map((k) => h('option', { value: k }, kindLabel(k))))),
        h('label', null, h('span', null, Tx.histCredit),
          h('input', { type: 'number', name: 'credit', min: '0.5', max: '9', step: '0.5', value: '3', inputmode: 'decimal', required: true })),
        h('label', null, h('span', null, Tx.histTerm),
          h('select', {
            name: 'term',
            onchange: (e) => {
              st.lastTerm = e.target.value;
              store.set('histLastTerm', st.lastTerm);
            }
          },
            h('option', { value: '', selected: curTermVal === '' ? true : null }, Tx.histTermNone),
            terms.map((x) => h('option', { value: x, selected: x === curTermVal ? true : null }, termName(x))))),
        h('label', null, h('span', null, Tx.histGrade),
          h('select', { name: 'grade' }, h('option', { value: '' }, Tx.gradeNone), P.GRADES.map((g) => h('option', { value: g }, g)))),
        h('button', { type: 'submit', class: 'btn primary' }, Tx.histAdd));

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
          box.append(h('ul', { class: 'paste-list' }, r.items.map((x, idx) => h('li', { class: 'paste-item' },
            h('div', { class: 'paste-item-info' },
              h('span', { class: 'pl-name' }, x.name),
              h('span', { class: 'pl-meta' }, [kindLabel(x.kind), x.credit ? `${x.credit}학점` : '', termName(x.term), x.grade].filter(Boolean).join(' · '))
            ),
            h('button', {
              type: 'button',
              class: 'pl-del-btn',
              title: '이 과목 제외',
              'aria-label': `${x.name} 제외`,
              onclick: () => {
                r.items.splice(idx, 1);
                render();
                const d = document.querySelector('.paste-box'); if (d) d.open = true;
              }
            }, '×')
          ))));
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

    function renderGpaSimulator() {
      const gpaData = P.gpa(st.history);
      if (!gpaData || !gpaData.credits) return null;

      const curGpa = gpaData.gpa;
      const curCredits = gpaData.credits;
      const req = requirement();
      const left = leftNow();
      const defaultRemCredits = Math.max(1, (left && left.total !== null) ? left.total : Math.max(18, (req.total || 66) - totalsNow().total));

      if (!st.gpaSim) {
        st.gpaSim = {
          targetGpa: store.get('sim_target_gpa', 4.0),
          remCredits: store.get('sim_rem_credits', defaultRemCredits)
        };
      }

      const target = Number(st.gpaSim.targetGpa) || 4.0;
      const rem = Math.max(1, Number(st.gpaSim.remCredits) || defaultRemCredits || 18);

      const curSum = curCredits * curGpa;
      const targetSum = (curCredits + rem) * target;
      const neededSum = targetSum - curSum;
      const neededGpa = neededSum / rem;
      const maxPossible = Math.min(4.5, (curSum + rem * 4.5) / (curCredits + rem));

      let resultBadge = '';
      let resultClass = '';
      let resultDesc = '';

      const Tx = T();
      if (neededGpa <= 0) {
        resultClass = 'is-achieved';
        resultBadge = Tx.gpaSimDoneBadge || '🎉 목표 달성 완료';
        resultDesc = Tx.gpaSimDoneDesc ? Tx.gpaSimDoneDesc(target.toFixed(2)) : `축하합니다! 이미 목표 평점(${target.toFixed(2)})을 달성했습니다.`;
      } else if (neededGpa <= 4.50) {
        resultClass = 'is-possible';
        resultBadge = `✨ ${neededGpa.toFixed(2)}`;
        resultDesc = Tx.gpaSimNeedDesc ? Tx.gpaSimNeedDesc(rem, neededGpa.toFixed(2), target.toFixed(2)) : `남은 ${rem}학점 동안 평균 ${neededGpa.toFixed(2)} 이상을 취득하면 졸업 평점 ${target.toFixed(2)}에 도달합니다!`;
      } else {
        resultClass = 'is-impossible';
        resultBadge = Tx.gpaSimHardBadge || '⚠️ 달성 난도 높음';
        resultDesc = Tx.gpaSimHardDesc ? Tx.gpaSimHardDesc(maxPossible.toFixed(2)) : `남은 학점을 모두 A+(4.5) 받아도 최대 ${maxPossible.toFixed(2)}까지 가능합니다. 목표 평점을 조정해보세요.`;
      }

      return h('section', { class: `plan-box gpa-sim-box ${resultClass}` },
        h('div', { class: 'gpa-sim-head' },
          h('div', { class: 'gpa-sim-title-wrap' },
            h('h3', null, Tx.gpaSimTitle || '🎯 목표 졸업 평점 역산기'),
            h('span', { class: 'gpa-sim-subtitle' }, Tx.gpaSimCurGpa ? Tx.gpaSimCurGpa(curGpa.toFixed(2), curCredits) : `현재 누적: ${curGpa.toFixed(2)} (${curCredits}학점 성적 산출 기준)`)
          ),
          h('span', { class: `gpa-sim-badge ${resultClass}` }, resultBadge)
        ),
        h('div', { class: 'gpa-sim-controls' },
          h('label', { class: 'gpa-sim-field' },
            h('span', null, Tx.gpaSimTarget || '목표 평점'),
            h('input', {
              type: 'number',
              step: '0.05',
              min: '1.5',
              max: '4.5',
              value: target.toFixed(2),
              onchange: (e) => {
                st.gpaSim.targetGpa = parseFloat(e.target.value) || 4.0;
                store.set('sim_target_gpa', st.gpaSim.targetGpa);
                render();
              }
            })
          ),
          h('label', { class: 'gpa-sim-field' },
            h('span', null, Tx.gpaSimRem || '남은 학점'),
            h('input', {
              type: 'number',
              step: '1',
              min: '1',
              max: '140',
              value: String(rem),
              onchange: (e) => {
                st.gpaSim.remCredits = parseInt(e.target.value, 10) || 18;
                store.set('sim_rem_credits', st.gpaSim.remCredits);
                render();
              }
            })
          )
        ),
        h('p', { class: 'gpa-sim-desc' }, resultDesc)
      );
    }

    function renderGpaTrendChart(terms) {
      if (!terms || terms.length < 2) return null;
      const data = terms.map((g) => {
        const gpaObj = P.gpa(g.items);
        return {
          term: g.term,
          name: termName(g.term),
          shortName: String(g.term || '').replace(/^[0-9]{2}([0-9]{2})[_-]?([12SWsw])$/, '$1-$2'),
          credits: g.credits,
          gpa: gpaObj ? gpaObj.gpa : null
        };
      }).filter((d) => d.gpa !== null);

      if (data.length < 2) return null;

      const Tx = T();
      const peak = data.reduce((max, d) => (d.gpa > max.gpa ? d : max), data[0]);
      const last = data[data.length - 1];
      const prev = data[data.length - 2];
      const delta = last.gpa - prev.gpa;

      const w = 520;
      const h_svg = 155;
      const padL = 40;
      const padR = 40;
      const padT = 30;
      const padB = 30;
      const chartW = w - padL - padR;
      const chartH = h_svg - padT - padB;

      const getX = (i) => padL + (i * chartW) / (data.length - 1);
      const getY = (val) => padT + chartH - (val / 4.5) * chartH;

      const points = data.map((d, i) => [getX(i), getY(d.gpa)]);
      const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
      const areaD = `${lineD} L ${points[points.length - 1][0].toFixed(1)} ${(padT + chartH).toFixed(1)} L ${points[0][0].toFixed(1)} ${(padT + chartH).toFixed(1)} Z`;

      const guideLevels = [4.5, 4.0, 3.0, 2.0];
      const guidesSvg = guideLevels.map((lvl) => {
        const y = getY(lvl);
        return `<line x1="${padL - 10}" y1="${y}" x2="${w - padR + 10}" y2="${y}" stroke="var(--border-soft)" stroke-dasharray="3,3" stroke-width="1"/>` +
               `<text x="${padL - 14}" y="${y + 3}" font-size="9" text-anchor="end" fill="var(--faint)">${lvl.toFixed(1)}</text>`;
      }).join('');

      const barsSvg = data.map((d, i) => {
        const x = getX(i) - 12;
        const barH = Math.min(chartH * 0.7, (d.credits / 24) * (chartH * 0.7));
        const y = padT + chartH - barH;
        return `<rect x="${x}" y="${y}" width="24" height="${barH}" rx="4" fill="color-mix(in srgb, var(--accent) 10%, transparent)"/>` +
               `<text x="${x + 12}" y="${y - 4}" font-size="9" text-anchor="middle" fill="var(--faint)">${d.credits}학점</text>`;
      }).join('');

      const nodesSvg = data.map((d, i) => {
        const p = points[i];
        const isPeak = d === peak;
        return `<g class="gpa-node">` +
               `<circle cx="${p[0]}" cy="${p[1]}" r="${isPeak ? 5.5 : 4.5}" fill="var(--surface)" stroke="${isPeak ? '#f59e0b' : 'var(--accent)'}" stroke-width="${isPeak ? 3 : 2.5}"/>` +
               `<text x="${p[0]}" y="${p[1] - 8}" font-size="11" font-weight="800" text-anchor="middle" fill="${isPeak ? '#f59e0b' : 'var(--text)'}">${d.gpa.toFixed(2)}</text>` +
               `<text x="${p[0]}" y="${padT + chartH + 18}" font-size="10.5" font-weight="600" text-anchor="middle" fill="var(--text-sub)">${d.shortName || d.name}</text>` +
               `</g>`;
      }).join('');

      const svgContent = `
        <svg viewBox="0 0 ${w} ${h_svg}" class="gpa-trend-svg" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="gpaAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.0"/>
            </linearGradient>
          </defs>
          ${guidesSvg}
          ${barsSvg}
          <path d="${areaD}" fill="url(#gpaAreaGrad)"/>
          <path d="${lineD}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          ${nodesSvg}
        </svg>
      `;

      const card = h('section', { class: 'plan-box gpa-trend-box' },
        h('div', { class: 'gt-head' },
          h('div', { class: 'gt-title-wrap' },
            h('h3', null, Tx.gpaTrendTitle || '📈 학기별 평점 및 학점 추이'),
            h('span', { class: 'gt-subtitle' }, `최근 학기: ${last.name} (${last.gpa.toFixed(2)})`)
          ),
          h('div', { class: 'gt-badges' },
            h('span', { class: 'gt-peak-badge' }, `🏆 ${Tx.gpaPeak || '최고'}: ${peak.shortName || peak.name} ${peak.gpa.toFixed(2)}`),
            h('span', { class: `gt-delta-badge ${delta >= 0 ? 'is-up' : 'is-down'}` },
              delta > 0 ? `▲ +${delta.toFixed(2)} ${Tx.gpaDeltaUp || '상승'}` : delta < 0 ? `▼ ${delta.toFixed(2)} ${Tx.gpaDeltaDown || '하락'}` : '= 유지'
            )
          )
        ),
        h('div', { class: 'gt-chart-wrap', innerHTML: svgContent })
      );

      return card;
    }

    function renderHistory() {
      const Tx = T();
      const box = $('#history-view');
      const terms = P.byTerm(st.history);
      // 빈 칸(null)은 빼고 넣는다: replaceChildren 은 null 을 'null' 글자로 그려 버림
      box.replaceChildren(...[
        h('div', { class: 'plan-head' }, h('h2', null, Tx.histTitle), h('p', { class: 'help' }, Tx.histHelp)),
        ...renderSummary(),
        renderGpaSimulator(),
        renderGpaTrendChart(terms),
        renderReq(),
        h('section', { class: 'plan-box add-box' },
          h('div', { class: 'add-head' }, h('h3', null, Tx.histAddTitle),
            h('button', { type: 'button', class: 'btn small', onclick: fromTimetable }, Tx.histFromTt)),
          ...renderAdd()),
        renderPaste(),
        renderTerms(terms)].filter(Boolean));
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

    // 고른 분반을 요일×시간 격자로 (월~금, 공강 표시 및 이러닝 칩 포함)
    function miniGrid(picks) {
      const timed = picks.filter((p) => p.section.t.length);
      const elearns = picks.filter((p) => !p.section.t.length || p.section.mode === 'elearn');
      if (!timed.length && !elearns.length) return null;
      const toMin = (x) => { const [a, b] = x.split(':').map(Number); return a * 60 + b; };
      let lo = 24 * 60;
      let hi = 0;
      for (const p of timed) for (const [, a, b] of p.section.t) { lo = Math.min(lo, toMin(a)); hi = Math.max(hi, toMin(b)); }
      if (lo >= hi) { lo = 9 * 60; hi = 18 * 60; }
      else {
        lo = Math.floor(lo / 60) * 60;
        hi = Math.ceil(hi / 60) * 60;
      }
      const days = [...new Set([...DAYS, ...timed.flatMap((p) => p.section.t.map((x) => x[0]))])].sort((a, b) => (a || 7) - (b || 7));
      const span = hi - lo || 1;
      const hours = [];
      for (let m = lo; m < hi; m += 60) hours.push(m / 60);

      const gridEl = h('div', { class: 'mini-tt', style: `--cols:${days.length};--rows:${hours.length}` },
        h('div', { class: 'mini-head' }, h('span'), days.map((d) => h('span', null, deps.dayName(d)))),
        h('div', { class: 'mini-body' },
          h('div', { class: 'mini-hours' }, hours.map((x) => h('span', null, String(x)))),
          days.map((d) => {
            const dayClasses = timed.flatMap((p) => p.section.t.filter((x) => x[0] === d).map(([, a, b]) => ({ p, a, b })));
            return h('div', { class: 'mini-col' + (!dayClasses.length ? ' is-free-col' : '') },
              !dayClasses.length ? h('span', { class: 'mini-free-label' }, '공강') : null,
              dayClasses.map(({ p, a, b }) => h('div', {
                class: 'mini-class' + (p.section.mode === 'live' ? ' live' : ''),
                style: `top:${((toMin(a) - lo) / span) * 100}%;height:${((toMin(b) - toMin(a)) / span) * 100}%;--c:${deps.classColor(p.group.name)}`,
                title: `${p.group.name} ${a}–${b}${p.section.prof ? ` (${p.section.prof} 교수)` : ''}`
              }, h('b', null, p.group.name), p.section.prof ? h('span', { class: 'mini-prof', style: 'font-size:10px;display:block;opacity:.85;font-weight:600;' }, p.section.prof) : null, h('small', null, `${a}–${b}`))));
          })));

      const elearnChips = elearns.length ? h('div', { class: 'mini-elearn-wrap' },
        h('span', { class: 'mini-el-label' }, '💻 시간표 외 이러닝:'),
        h('div', { class: 'mini-el-chips' }, elearns.map((p) =>
          h('span', { class: 'mini-el-chip', style: `--c:${deps.classColor(p.group.name)}` },
            `📖 ${p.group.name}`, p.section.prof ? ` (${p.section.prof})` : ''
          )
        ))
      ) : null;

      return h('div', { class: 'mini-grid-container' }, gridEl, elearnChips);
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
              sec.prof ? h('span', { class: 'pr-prof', style: 'font-weight:600;margin-right:6px;color:var(--text);' }, `${sec.prof} 교수`) : null,
              h('span', { class: 'pr-sec' }, Tx.planSection(sec.s)), ' ', when,
              sec.mode === 'live' ? h('span', { class: 'pr-mode' }, Tx.planModeLive) : null,
              room && sec.mode === '' ? h('span', { class: 'pr-room' }, room) : null)),
          h('div', { class: 'pr-actions' },
            x.alts.length ? h('select', { 'aria-label': Tx.planAlts(x.alts.length), onchange: (e) => { if (e.target.value) setLocked(x.key, e.target.value); } },
              h('option', { value: '' }, Tx.planAlts(x.alts.length)),
              x.alts.map((s) => h('option', { value: s.s }, `${Tx.planSection(s.s)}${s.prof ? ` (${s.prof})` : ''} · ${s.mode === 'elearn' ? Tx.planModeElearn : slotText(s.t)}`))) : null,
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
        const elearnCount = r2.picks.filter((x) => !x.section.t.length || x.section.m === 'elearn').length;
        let sub = Tx.altBalanced;
        if (a.key === 'freeDay') {
          sub = (a.free && a.free.length) ? Tx.altFree(a.free.map((d) => deps.dayName(d)).join('·')) : Tx.altNoFree;
        } else if (a.key === 'lateStart') {
          sub = (a.ok === false) ? Tx.altShort : (a.start !== null ? Tx.altStart(`${String(Math.floor(a.start / 60)).padStart(2, '0')}:${String(a.start % 60).padStart(2, '0')}`) : Tx.planModeElearn);
        } else if (a.key === 'smartMix') {
          sub = elearnCount ? `이러닝 ${elearnCount}과목` : Tx.altBalanced;
        } else if (a.key === 'balanced') {
          sub = (a.quality && a.quality.lunchBreak) ? '점심시간 확보' : Tx.altBalanced;
        }
        return h('button', { type: 'button', role: 'tab', class: 'alt-tab', 'aria-selected': String(a.key === st.altKey),
          onclick: () => { st.altKey = a.key; st.result = a.result; renderPlan(); } },
          h('span', { class: 'alt-name' }, Tx['alt_' + a.key] || a.title || a.key),
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
