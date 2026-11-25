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
    const currentLang = () => (deps.getLang ? deps.getLang() : deps.lang) || 'ko';
    const Tx = new Proxy({}, {
      get: (_, prop) => {
        const tr = (deps.t && deps.t()) || {};
        return tr[prop];
      }
    });
    const $ = (s) => document.querySelector(s);
    const TT = root.GONGJI_TIMETABLE || null;
    const REQ = root.GONGJI_GRADREQ || null;
    const CU = root.GongjiCurriculum || null;
    const groups = P.groupOffered(TT);
    let catalog = null;
    const cat = () => (catalog = catalog || P.buildCatalog(TT, root.GONGJI_COURSES));

    const curTermKey = `${P.currentTerm(deps.now).year}-${P.currentTerm(deps.now).term}`;
    const st = {
      sub: ['week', 'history', 'plan'].includes(store.get('ttSub', 'week')) ? store.get('ttSub', 'week') : 'week',
      history: P.cleanHistory(store.get('history', [])),
      req: store.get('gradReq', null) || {},
      transferred: (store.get('transferredCourses', []) || []).filter((x) => x && x.name),
      prefs: Object.assign({ target: null, grades: [], include: { major: true, general: true, elearn: true, live: true }, avoid: [], takenNow: true, semesters: null, locked: [], excluded: [] },
        store.get('planPrefs', null) || {}),
      lastTerm: store.get('histLastTerm', curTermKey),
      paste: null,
      result: null
    };
    const save = () => {
      store.set('history', st.history);
      store.set('gradReq', st.req);
      store.set('transferredCourses', st.transferred);
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
      const Tx = T();

      const majorReqDone = (st.history || []).filter((x) => x.kind === '전필').reduce((s, x) => s + (Number(x.credit) || 0), 0);
      const majorElectDone = (st.history || []).filter((x) => x.kind === '전선').reduce((s, x) => s + (Number(x.credit) || 0), 0);
      const reqMajorReq = req.majorReq || 0;

      if (req.mode === 'transfer') {
        const trMajorCredits = (st.transferred || []).reduce((s, x) => s + (Number(x.credit) || 0), 0);
        const trMajorReqDone = (st.transferred || []).filter((x) => x.kind === '전필').reduce((s, x) => s + (Number(x.credit) || 0), 0);
        const effectiveMajorReqDone = majorReqDone + trMajorReqDone;

        const targetFree = (req.general !== null && req.general !== undefined) ? req.general : Math.max(0, (req.total || 66) - (req.major || 0));
        const freeDone = Math.max(0, tot.total - Math.min(tot.major, req.major || 0));
        const items = [
          {
            label: reqMajorReq > 0 ? (Tx.kindLabel ? Tx.kindLabel.전필 : '전공필수') : (Tx.kindLabel ? `${Tx.kindLabel.전필} (학과)` : '전공필수 (학과)'),
            done: effectiveMajorReqDone,
            need: reqMajorReq || null,
            tag: reqMajorReq > 0 ? (effectiveMajorReqDone >= reqMajorReq ? (trMajorReqDone > 0 ? `${Tx.gbTagDone || '완료 ✓'} (${Tx.trRecognizedShort || '전적대 인정'})` : (Tx.gbTagDone || '완료 ✓')) : (Tx.gbTagShort ? Tx.gbTagShort(reqMajorReq - effectiveMajorReqDone) : `${reqMajorReq - effectiveMajorReqDone}학점 부족`)) : (Tx.reqNoDuty || '의무 없음'),
            ok: reqMajorReq > 0 ? effectiveMajorReqDone >= reqMajorReq : true
          },
          {
            label: Tx.gbItemTrMajor || '전적대 전공 인정 (최대 15학점)',
            done: trMajorCredits,
            need: 15,
            tag: trMajorCredits >= 15 ? `15${Tx.creditUnit || '학점'} ${Tx.gbTagDone || '완료 ✓'}` : trMajorCredits > 0 ? (Tx.gbTagRecognized ? Tx.gbTagRecognized(trMajorCredits) : `${trMajorCredits}${Tx.creditUnit || '학점'} 인정`) : (Tx.trNoCourses || '인정 과목 미등록'),
            ok: trMajorCredits > 0
          },
          {
            label: Tx.gbItemKkuMajor ? Tx.gbItemKkuMajor(req.major || 0) : `건국대 전공 이수 (${req.major || 0}학점)`,
            done: tot.major,
            need: req.major,
            tag: (tot.major >= (req.major || 0)) ? (Tx.gbTagDone || '완료 ✓') : (Tx.gbTagShort ? Tx.gbTagShort((req.major || 0) - tot.major) : `${(req.major || 0) - tot.major}학점 부족`),
            ok: tot.major >= (req.major || 0)
          },
          {
            label: targetFree > 0 ? (Tx.gbItemKkuFree ? Tx.gbItemKkuFree(targetFree) : `건국대 자유·다전공 이수 (${targetFree}학점)`) : (Tx.areaFree || '자유·다전공 이수'),
            done: freeDone,
            need: targetFree > 0 ? targetFree : null,
            tag: targetFree === 0 ? (Tx.gbTagNoFreeNeeded || '자유 불필요 (전공 100%)') : (freeDone >= targetFree ? (Tx.gbTagDone || '완료 ✓') : (Tx.gbTagShort ? Tx.gbTagShort(targetFree - freeDone) : `${targetFree - freeDone}학점 부족`)),
            ok: targetFree === 0 || freeDone >= targetFree
          },
          {
            label: Tx.gbItemTrTotal ? Tx.gbItemTrTotal(req.total || 66) : `편입 총 이수 (${req.total || 66}학점)`,
            done: tot.total,
            need: req.total || 66,
            tag: (tot.total >= (req.total || 66)) ? (Tx.gbTagDone || '완료 ✓') : (Tx.gbTagShort ? Tx.gbTagShort((req.total || 66) - tot.total) : `${(req.total || 66) - tot.total}학점 부족`),
            ok: tot.total >= (req.total || 66)
          },
          {
            label: Tx.gbItemGenExempt || '교양 영역별 필수',
            done: tot.general,
            need: null,
            tag: Tx.gbTagExempt || '면제 ✓ (의무 없음)',
            ok: true,
            isExempt: true
          }
        ];

        return h('div', { class: 'grad-breakdown-card is-transfer-mode' },
          h('div', { class: 'gbc-head' },
            h('h4', null, Tx.gradBreakdownTitle || '📊 영역별 세부 졸업요건 이수율'),
            h('span', { class: 'gbc-sub' }, Tx.gradBreakdownSubTransfer || '편입생: 기초·심화·KU소양 필수 면제 · 주전공 및 다전공·자유 학점 충족 여부')
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
                it.isExempt ? h('span', { class: 'exempt-text' }, Tx.gbExemptEarned ? Tx.gbExemptEarned(it.done) : `이수 ${it.done}학점 (자유 학점으로 인정)`)
                  : [h('strong', null, `${it.done}${Tx.creditUnit || '학점'}`), it.need ? h('span', null, ` / ${it.need}${Tx.creditUnit || '학점'}`) : null]
              )
            );
          }))
        );
      }

      const items = [
        {
          label: Tx.kindLabel ? Tx.kindLabel.전필 : '전공필수',
          done: majorReqDone,
          need: reqMajorReq,
          tag: majorReqDone >= reqMajorReq ? (Tx.gbTagDone || '완료 ✓') : (Tx.gbTagShort ? Tx.gbTagShort(reqMajorReq - majorReqDone) : `${reqMajorReq - majorReqDone}학점 부족`),
          ok: majorReqDone >= reqMajorReq
        },
        {
          label: Tx.kindLabel ? Tx.kindLabel.전선 : '전공선택',
          done: majorElectDone,
          need: req.major ? Math.max(0, req.major - reqMajorReq) : null,
          tag: Tx.kindLabel ? Tx.kindLabel.전선 : '전공선택',
          ok: req.major ? majorElectDone >= Math.max(0, req.major - reqMajorReq) : true
        },
        {
          label: Tx.kindLabel ? Tx.kindLabel.기초 : '기초교양',
          done: tot.gen['기초'] || 0,
          need: req.gen ? req.gen['기초'] : 14,
          tag: (tot.gen['기초'] || 0) >= (req.gen ? req.gen['기초'] : 14) ? (Tx.gbTagDone || '완료 ✓') : (Tx.gbTagShort ? Tx.gbTagShort((req.gen ? req.gen['기초'] : 14) - (tot.gen['기초'] || 0)) : `${(req.gen ? req.gen['기초'] : 14) - (tot.gen['기초'] || 0)}학점 부족`),
          ok: (tot.gen['기초'] || 0) >= (req.gen ? req.gen['기초'] : 14)
        },
        {
          label: Tx.kindLabel ? Tx.kindLabel.심화 : '심화교양',
          done: tot.gen['심화'] || 0,
          need: req.gen ? req.gen['심화'] : 8,
          tag: (tot.gen['심화'] || 0) >= (req.gen ? req.gen['심화'] : 8) ? (Tx.gbTagDone || '완료 ✓') : (Tx.gbTagShort ? Tx.gbTagShort((req.gen ? req.gen['심화'] : 8) - (tot.gen['심화'] || 0)) : `${(req.gen ? req.gen['심화'] : 8) - (tot.gen['심화'] || 0)}학점 부족`),
          ok: (tot.gen['심화'] || 0) >= (req.gen ? req.gen['심화'] : 8)
        },
        {
          label: Tx.kindLabel ? Tx.kindLabel.소양 : 'KU소양',
          done: tot.gen['소양'] || 0,
          need: req.gen ? req.gen['소양'] : 9,
          tag: (tot.gen['소양'] || 0) >= (req.gen ? req.gen['소양'] : 9) ? (Tx.gbTagDone || '완료 ✓') : (Tx.gbTagShort ? Tx.gbTagShort((req.gen ? req.gen['소양'] : 9) - (tot.gen['소양'] || 0)) : `${(req.gen ? req.gen['소양'] : 9) - (tot.gen['소양'] || 0)}학점 부족`),
          ok: (tot.gen['소양'] || 0) >= (req.gen ? req.gen['소양'] : 9)
        }
      ];

      return h('div', { class: 'grad-breakdown-card' },
        h('div', { class: 'gbc-head' },
          h('h4', null, Tx.gradBreakdownTitle || '📊 영역별 세부 졸업요건 이수율'),
          h('span', { class: 'gbc-sub' }, Tx.gradBreakdownSubRegular || '전필·교양 필수 영역별 충족 여부')
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
              h('strong', null, `${it.done}${Tx.creditUnit || '학점'}`),
              it.need ? h('span', null, ` / ${it.need}${Tx.creditUnit || '학점'}`) : null
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
          h('p', { class: 'plan-kicker' }, [(window.GongjiDeptI18n && window.GongjiDeptI18n.formatDept) ? window.GongjiDeptI18n.formatDept(req.dept, currentLang()) : req.dept, req.mode === 'transfer' ? Tx.reqModeTransfer : ''].filter(Boolean).join(' · ') || Tx.histTitle),
          h('p', { class: 'plan-big' }, left.total !== null ? Tx.histLeft(left.total) : Tx.histLeftUnknown),
          h('p', { class: 'plan-side' }, [Tx.histDone(tot.total), (() => { const v = P.gpa(st.history); return v ? Tx.gpaHero(v.gpa.toFixed(2)) : ''; })()].filter(Boolean).join(' · '))));

      let meters;
      if (req.mode === 'transfer') {
        const freeReq = Math.max(0, (req.total || 66) - (req.major || 0));
        const freeDone = Math.max(0, tot.total - Math.min(tot.major, req.major || 0));
        const extraMajor = Math.max(0, tot.major - (req.major || 0));
        const freeBreakdown = [
          tot.general ? `${Tx.areaGenLabel || '교양'} ${tot.general}` : '',
          tot.free ? `${Tx.areaElectLabel || '일선'} ${tot.free}` : '',
          extraMajor ? `${Tx.areaExtraMajor || '초과전공'} ${extraMajor}` : ''
        ].filter(Boolean).join(' · ');

        meters = h('div', { class: 'meters' },
          meter(Tx.areaTotal, tot.total, req.total),
          meter(Tx.areaMajorMin || '전공 최소', tot.major, req.major),
          meter(Tx.areaFree || '자유(교양·일선)', freeDone, freeReq,
            freeBreakdown ? h('p', { class: 'meter-sub' }, freeBreakdown + (Tx.creditUnit || '학점')) : null));
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

    // 남은 전공필수: 요람의 내 학과 전공필수 중 이수 내역 및 전적대 인정에 없는 과목. 이번 학기에 열렸으면 눌러서 추천에 고정
    function renderRequired() {
      const Tx = T();
      const C = root.GongjiCurriculum;
      const d = C && C.findDept ? C.findDept(dept(), root.GONGJI_COURSES) : null;
      if (!d) return null;
      const allDone = (st.history || []).concat(st.transferred || []);
      const left = P.requiredLeft(d.courses, allDone);
      const offered = (name) => groups.find((g) => P.normName(g.name) === P.normName(name) && P.deptMatch(g.dept, dept()))
        || groups.find((g) => P.normName(g.name) === P.normName(name));

      const trReqDone = (st.transferred || []).filter((tr) => d.courses.some(([, , name, kind]) => kind === '전필' && P.normName(name) === P.normName(tr.name)));

      return h('section', { class: 'req-left' },
        h('div', { class: 'road-head' },
          h('h3', null, Tx.reqLeftTitle, left.length ? h('span', { class: 'group-count' }, ` ${left.length}`) : null),
          h('p', { class: 'fine' }, left.length ? Tx.reqLeftHelp : Tx.reqLeftNone),
          trReqDone.length ? h('div', { class: 'tr-req-done-pill' }, `🎓 전적대 전필 인정 완료: ${trReqDone.map((x) => x.name).join(', ')} (재수강 불가)`) : null),
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
      const num = (id, key, label, value, onLiveInput, onCommit) => h('label', { class: 'req-field' },
        h('span', null, label),
        h('input', {
          id: id || null,
          type: 'number', min: '0', max: '300', step: '1', inputmode: 'numeric',
          value: value === null || value === undefined ? '' : String(value),
          oninput: (e) => {
            const raw = e.target.value.trim();
            const v = raw === '' ? null : Number(raw);
            if (onLiveInput) onLiveInput(v, e);
          },
          onchange: (e) => {
            const raw = e.target.value.trim();
            const v = raw === '' ? null : Number(raw);
            if (onCommit) {
              onCommit(v, e);
            } else {
              if (v === null) delete st.req[key]; else st.req[key] = v;
              save(); render();
            }
          }
        }));

      const setMode = (mode) => {
        const curDept = st.req.dept;
        st.req = { dept: curDept, mode };
        if (mode === 'transfer') {
          st.req.total = 66;
          const trCredits = (st.transferred || []).reduce((s, x) => s + (Number(x.credit) || 0), 0);
          if (trCredits > 0) {
            st.req.major = Math.max(0, 66 - trCredits);
            st.req.general = Math.min(66, trCredits);
          } else {
            st.req.major = 66;
            st.req.general = 0;
          }
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

      const transferPresets = req.mode === 'transfer' ? h('div', { class: 'req-presets-wrapper' },
        h('div', { class: 'req-preset-group' },
          h('span', { class: 'req-preset-group-title' }, Tx.reqPresetSingleTitle || '📌 단일전공 기준 (기본 66학점)'),
          h('div', { class: 'req-presets-bar' },
            h('button', {
              type: 'button',
              class: 'req-preset-chip' + (req.total === 66 && req.major === 66 && (req.general === 0 || !req.general) ? ' is-active' : ''),
              onclick: () => applyPreset(66, 66, 0)
            }, Tx.reqPreset66 || '⚡ 0학점 인정 (비동일계: 전공 66)'),
            h('button', {
              type: 'button',
              class: 'req-preset-chip' + (req.total === 66 && req.major === 60 && req.general === 6 ? ' is-active' : ''),
              onclick: () => applyPreset(66, 60, 6)
            }, Tx.reqPreset60 || '⚡ 6학점 인정 (전공 60 + 자유 6)'),
            h('button', {
              type: 'button',
              class: 'req-preset-chip' + (req.total === 66 && req.major === 57 && req.general === 9 ? ' is-active' : ''),
              onclick: () => applyPreset(66, 57, 9)
            }, Tx.reqPreset57 || '⚡ 9학점 인정 (전공 57 + 자유 9)'),
            h('button', {
              type: 'button',
              class: 'req-preset-chip' + (req.total === 66 && req.major === 51 && req.general === 15 ? ' is-active' : ''),
              onclick: () => applyPreset(66, 51, 15)
            }, Tx.reqPreset51 || '⚡ 15학점 인정 (동일계 최대: 전공 51 + 자유 15)')
          )
        ),
        h('div', { class: 'req-preset-group' },
          h('span', { class: 'req-preset-group-title' }, Tx.reqPresetMultiTitle || '🎓 다전공(복수전공)·융합전공·부전공 기준 (확장 학점)'),
          h('div', { class: 'req-presets-bar' },
            h('button', {
              type: 'button',
              class: 'req-preset-chip' + (req.total === 87 && req.major === 51 && req.general === 36 ? ' is-active' : ''),
              onclick: () => applyPreset(87, 51, 36)
            }, Tx.reqPresetDouble || '🎓 다전공(복수전공) 기준 (총 87: 주전공 51 + 제2전공 36)'),
            h('button', {
              type: 'button',
              class: 'req-preset-chip' + (req.total === 75 && req.major === 51 && req.general === 24 ? ' is-active' : ''),
              onclick: () => applyPreset(75, 51, 24)
            }, Tx.reqPresetConvergence || '🧬 융합·연계전공 기준 (총 75: 주전공 51 + 융합전공 24)'),
            h('button', {
              type: 'button',
              class: 'req-preset-chip' + (req.total === 72 && req.major === 51 && req.general === 21 ? ' is-active' : ''),
              onclick: () => applyPreset(72, 51, 21)
            }, Tx.reqPresetMinor || '📘 부전공 기준 (총 72: 주전공 51 + 부전공 21)')
          )
        )
      ) : null;

      const updateBalanceIndicator = () => {
        const barEl = $('#req-balance-indicator');
        if (!barEl) return;
        const totEl = $('#req-input-total');
        const majEl = $('#req-input-major');
        const genEl = $('#req-input-general');
        const curTot = totEl ? (Number(totEl.value) || 0) : (req.total || 66);
        const curMaj = majEl ? (Number(majEl.value) || 0) : (req.major || 0);
        const curGen = genEl ? (Number(genEl.value) || 0) : (req.general || 0);
        const sum = curMaj + curGen;
        const diff = curTot - sum;
        barEl.className = 'req-balance-status ' + (diff === 0 ? 'is-balanced' : diff > 0 ? 'is-under' : 'is-over');
        if (diff === 0) {
          barEl.innerHTML = `<span class="rbs-icon">✓</span><span class="rbs-text">${Tx.reqBalanceMatched ? Tx.reqBalanceMatched(curMaj, curGen, curTot) : `학점 배분 일치: 전공(${curMaj}) + 자유·다전공(${curGen}) = 총 ${curTot}학점`}</span>`;
        } else if (diff > 0) {
          barEl.innerHTML = `<span class="rbs-icon">💡</span><span class="rbs-text">${Tx.reqBalanceUnder ? Tx.reqBalanceUnder(curMaj, curGen, sum, curTot, diff) : `전공(${curMaj}) + 자유·다전공(${curGen}) = ${sum}학점 · 총 목표(${curTot}학점) 대비 ${diff}학점 여유`}</span>`;
        } else {
          barEl.innerHTML = `<span class="rbs-icon">⚠️</span><span class="rbs-text">${Tx.reqBalanceOver ? Tx.reqBalanceOver(curMaj, curGen, sum, curTot, -diff) : `전공(${curMaj}) + 자유·다전공(${curGen}) = ${sum}학점 · 총 목표(${curTot}학점)보다 ${-diff}학점 초과`}</span>`;
        }
      };

      const reqInputs = req.mode === 'transfer' ? [
        num('req-input-total', 'total', Tx.reqTotalTransfer || '편입 후 이수할 학점', req.total,
          (v) => {
            st.req.total = v === null ? 66 : v;
            save();
            updateBalanceIndicator();
          },
          (v) => {
            st.req.total = v === null ? 66 : v;
            save(); render();
          }
        ),
        num('req-input-major', 'major', Tx.reqMajorTransfer || '전공 최소 학점', req.major,
          (v) => {
            st.req.major = v === null ? 0 : v;
            save();
            updateBalanceIndicator();
          },
          (v) => {
            st.req.major = v;
            save(); render();
          }
        ),
        num('req-input-general', 'general', Tx.reqGeneralTransfer || '자유·다전공 학점 (교양/일선/제2전공)', req.general,
          (v) => {
            st.req.general = v === null ? 0 : v;
            save();
            updateBalanceIndicator();
          },
          (v) => {
            st.req.general = v;
            save(); render();
          }
        )
      ] : [
        num('req-input-total', 'total', Tx.reqTotal, req.total),
        num('req-input-major', 'major', Tx.reqMajor, req.major),
        num('req-input-general', 'general', Tx.reqGeneral, req.general)
      ];

      let balanceBar = null;
      if (req.mode === 'transfer') {
        const curMaj = st.req.major !== undefined && st.req.major !== null ? st.req.major : (req.major || 0);
        const curGen = st.req.general !== undefined && st.req.general !== null ? st.req.general : (req.general || 0);
        const curTot = (st.req.total !== undefined && st.req.total !== null ? st.req.total : (req.total || 66)) || 66;
        const sum = curMaj + curGen;
        const diff = curTot - sum;

        if (diff === 0) {
          balanceBar = h('div', { id: 'req-balance-indicator', class: 'req-balance-status is-balanced' },
            h('span', { class: 'rbs-icon' }, '✓'),
            h('span', { class: 'rbs-text' }, Tx.reqBalanceMatched ? Tx.reqBalanceMatched(curMaj, curGen, curTot) : `학점 배분 일치: 전공(${curMaj}) + 자유·다전공(${curGen}) = 총 ${curTot}학점`)
          );
        } else if (diff > 0) {
          balanceBar = h('div', { id: 'req-balance-indicator', class: 'req-balance-status is-under' },
            h('span', { class: 'rbs-icon' }, '💡'),
            h('span', { class: 'rbs-text' }, Tx.reqBalanceUnder ? Tx.reqBalanceUnder(curMaj, curGen, sum, curTot, diff) : `전공(${curMaj}) + 자유·다전공(${curGen}) = ${sum}학점 · 총 목표(${curTot}학점) 대비 ${diff}학점 여유`),
            h('button', {
              type: 'button',
              class: 'rbs-action-btn',
              onclick: () => {
                st.req.general = curGen + diff;
                save(); render();
                toast(Tx.reqBalanceAutoDist ? Tx.reqBalanceAutoDist(diff) : `잔여 ${diff}학점을 자유·다전공 학점에 배분했습니다. (총 ${curTot}학점)`);
              }
            }, Tx.reqBalanceAutoDist ? Tx.reqBalanceAutoDist(diff) : `⚖️ 잔여 ${diff}학점을 자유·다전공에 자동 배분`)
          );
        } else {
          balanceBar = h('div', { id: 'req-balance-indicator', class: 'req-balance-status is-over' },
            h('span', { class: 'rbs-icon' }, '⚠️'),
            h('span', { class: 'rbs-text' }, Tx.reqBalanceOver ? Tx.reqBalanceOver(curMaj, curGen, sum, curTot, -diff) : `전공(${curMaj}) + 자유·다전공(${curGen}) = ${sum}학점 · 총 목표(${curTot}학점)보다 ${-diff}학점 초과`),
            h('button', {
              type: 'button',
              class: 'rbs-action-btn',
              onclick: () => {
                st.req.total = sum;
                save(); render();
                toast(Tx.reqBalanceAutoFit ? Tx.reqBalanceAutoFit(sum) : `편입 후 총 이수학점을 ${sum}학점으로 맞췄습니다.`);
              }
            }, Tx.reqBalanceAutoFit ? Tx.reqBalanceAutoFit(sum) : `🎯 총 이수학점을 ${sum}학점으로 맞추기`)
          );
        }
      }

      const onDeptInput = (inputEl) => {
        const val = inputEl.value.trim();
        const box = inputEl.form ? inputEl.form.querySelector('#dept-suggest-box') : document.getElementById('dept-suggest-box');
        if (!box) return;
        if (!val) {
          box.hidden = true;
          box.replaceChildren();
          return;
        }
        const hits = (P.searchDepts ? P.searchDepts(val, REQ, currentLang()) : []).slice(0, 8);
        if (!hits.length) {
          box.hidden = true;
          box.replaceChildren();
          return;
        }

        box.replaceChildren(...hits.map((hit, idx) => h('li', {
          class: 'dept-suggest-item' + (idx === 0 ? ' is-active' : ''),
          'data-dept': hit.name,
          onmousedown: (ev) => {
            ev.preventDefault();
            inputEl.value = hit.name;
            box.hidden = true;
            commitDept(hit.name);
          }
        },
          h('strong', { class: 'dsi-name' }, hit.displayName),
          hit.subText ? h('span', { class: 'dsi-sub' }, hit.subText) : null
        )));
        box.hidden = false;
      };

      const commitDept = (val) => {
        const v = String(val || '').trim();
        if (!v) {
          st.req.dept = '';
          save(); render();
          return;
        }
        const resolved = (P.resolveDept ? P.resolveDept(v, REQ) : v) || v;
        st.req.dept = resolved;
        const curLang = currentLang();
        const DI18n = window.GongjiDeptI18n || root.GongjiDeptI18n;
        const resolvedDisplay = (DI18n && DI18n.formatDept) ? DI18n.formatDept(resolved, curLang) : resolved;
        const inputEl = document.getElementById('req-dept-input');
        if (inputEl && inputEl.value !== resolvedDisplay) inputEl.value = resolvedDisplay;
        save();
        render();
        if (resolved && resolved !== v) {
          toast(Tx.deptAutoResolved ? Tx.deptAutoResolved(v, resolvedDisplay) : `'${v}' → [${resolvedDisplay}] 학과로 자동 완성되었습니다.`);
        }
      };

      const onDeptBlur = (inputEl) => {
        setTimeout(() => {
          const box = inputEl.form ? inputEl.form.querySelector('#dept-suggest-box') : document.getElementById('dept-suggest-box');
          if (box) box.hidden = true;
          if (inputEl.value.trim()) {
            commitDept(inputEl.value);
          }
        }, 220);
      };

      const onDeptKeydown = (e) => {
        const box = e.target.form ? e.target.form.querySelector('#dept-suggest-box') : document.getElementById('dept-suggest-box');
        if (!box || box.hidden) {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitDept(e.target.value);
          }
          return;
        }
        const items = Array.from(box.querySelectorAll('.dept-suggest-item'));
        if (!items.length) return;
        const activeIdx = items.findIndex((el) => el.classList.contains('is-active'));
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = activeIdx < items.length - 1 ? activeIdx + 1 : 0;
          items.forEach((el, i) => el.classList.toggle('is-active', i === next));
          items[next].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = activeIdx > 0 ? activeIdx - 1 : items.length - 1;
          items.forEach((el, i) => el.classList.toggle('is-active', i === prev));
          items[prev].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const sel = activeIdx >= 0 ? items[activeIdx] : items[0];
          if (sel) {
            const targetDept = sel.getAttribute('data-dept');
            e.target.value = targetDept;
            box.hidden = true;
            commitDept(targetDept);
          } else {
            commitDept(e.target.value);
          }
        } else if (e.key === 'Escape') {
          box.hidden = true;
        }
      };

      const deptDisplay = (window.GongjiDeptI18n ? window.GongjiDeptI18n.formatDept(req.dept, deps.lang) : req.dept) || req.dept;
      return h('details', { class: 'plan-box req-box', open: !req.found || req.mode === 'transfer' || edited ? true : null },
        h('summary', null, h('span', null, Tx.reqTitle),
          h('small', null, !req.found ? Tx.reqNoDeptShort : req.mode === 'transfer' ? Tx.reqSourceTransfer(deptDisplay) : Tx.reqSource(deptDisplay))),
        h('div', { class: 'seg req-mode', role: 'group' },
          ['regular', 'transfer'].map((m) => h('button', { type: 'button', 'aria-pressed': String(req.mode === m), onclick: () => setMode(m) },
            m === 'transfer' ? Tx.reqModeTransfer : Tx.reqModeRegular))),
        req.mode === 'transfer' ? h('p', { class: 'help' }, Tx.reqTransferHelp) : null,
        transferPresets,
        !req.found ? h('p', { class: 'help warn-note' }, Tx.reqNoDept) : null,
        h('div', { class: 'req-grid' },
          h('div', { class: 'req-field wide dept-field-wrap' },
            h('label', { for: 'req-dept-input' }, Tx.reqDept),
            h('div', { class: 'dept-input-container' },
              h('input', {
                type: 'text',
                id: 'req-dept-input',
                class: 'dept-input-name',
                value: (window.GongjiDeptI18n ? window.GongjiDeptI18n.formatDept(dept(), currentLang()) : dept()) || dept(),
                placeholder: Tx.profileDeptPh || '학과명 입력 (예: 컴퓨터공학과, 컴공, Computer, CS)',
                autocomplete: 'off',
                oninput: (e) => onDeptInput(e.target),
                onfocus: (e) => onDeptInput(e.target),
                onkeydown: (e) => onDeptKeydown(e),
                onblur: (e) => onDeptBlur(e.target),
                onchange: (e) => commitDept(e.target.value)
              }),
              h('ul', { id: 'dept-suggest-box', class: 'dept-suggest-box', hidden: true })
            )
          ),
          ...reqInputs),
        balanceBar,
        edited ? h('button', { type: 'button', class: 'link-btn', onclick: () => {
          st.req = { dept: st.req.dept, mode: req.mode };
          if (req.mode === 'transfer') {
            st.req.total = 66;
            const trCredits = (st.transferred || []).reduce((s, x) => s + (Number(x.credit) || 0), 0);
            if (trCredits > 0) {
              st.req.major = Math.max(0, 66 - trCredits);
              st.req.general = trCredits;
            } else {
              st.req.major = 66;
              st.req.general = 0;
            }
          }
          save(); render();
        } }, Tx.reqReset) : null);
    }

    // 전적대 전공 인정 교과목 관리 (편입생 전용: 최대 15학점 · 건국대학교 규정상 재수강 불가)
    function renderTransferredManager() {
      const Tx = T();
      const req = requirement();
      if (req.mode !== 'transfer' && (!st.transferred || !st.transferred.length)) return null;

      const list = st.transferred || [];
      const totalTrCredits = list.reduce((s, x) => s + (Number(x.credit) || 0), 0);
      const isMax15 = totalTrCredits >= 15;
      const curTot = st.req.total || req.total || 66;
      const neededMajor = Math.max(0, curTot - totalTrCredits);

      const removeCourse = (name) => {
        st.transferred = (st.transferred || []).filter((x) => P.normName(x.name) !== P.normName(name));
        const newCredits = st.transferred.reduce((s, x) => s + (Number(x.credit) || 0), 0);
        st.req.major = Math.max(0, curTot - newCredits);
        st.req.general = Math.min(curTot, newCredits);
        save();
        render();
        toast(`[${name}] 인정 과목이 삭제되었습니다. (전공 ${st.req.major} · 자유 ${st.req.general} 자동 갱신)`);
      };

      const addCourse = (e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const name = (f.elements.trName.value || '').trim();
        const credit = Number(f.elements.trCredit.value) || 3;
        const kind = f.elements.trKind.value || '전선';
        if (!name) { toast('과목명을 입력해 주세요.'); return; }
        if (st.transferred.some((x) => P.normName(x.name) === P.normName(name))) {
          toast('이미 등록된 전적대 인정 과목입니다.');
          return;
        }
        if (totalTrCredits + credit > 15) {
          toast(`알림: 전적대 전공 인정은 통상 최대 15학점까지 권장됩니다. (현재 누적: ${totalTrCredits + credit}학점)`);
        }
        st.transferred.push({ name, credit, kind });
        const newCredits = st.transferred.reduce((s, x) => s + (Number(x.credit) || 0), 0);
        st.req.major = Math.max(0, curTot - newCredits);
        st.req.general = Math.min(curTot, newCredits);
        save();
        render();
        toast(`[${name}] (${credit}학점 · ${kind}) 인정 등록 완료! (건국대 전공 ${st.req.major} · 자유 ${st.req.general} 자동 연동)`);
      };

      // 전체 카탈로그 및 내 학과 과목 후보 구성 (내 학과 요람 과목 우선)
      const CU = root.GongjiCurriculum;
      const myDept = dept();
      const myDeptObj = CU && CU.findDept ? CU.findDept(myDept, root.GONGJI_COURSES) : null;
      const myCourses = (myDeptObj && myDeptObj.courses) || [];
      const allCatalog = Array.from(cat().byName.values());

      // 통합 과목 사전 (이름 -> { name, credit, kind, dept, term, prof })
      const catalogMap = new Map();
      const profDict = root.GONGJI_PROFESSORS || {};
      const ttList = (root.GONGJI_TIMETABLE && root.GONGJI_TIMETABLE.courses) || [];

      function resolveProf(name) {
        if (profDict[`${name}:01`]) return profDict[`${name}:01`];
        for (const [k, p] of Object.entries(profDict)) {
          if (k.startsWith(`${name}:`) && p) return p;
        }
        const hit = ttList.find((c) => c.n === name && c.p);
        return (hit && hit.p) || '';
      }

      // 1. 내 학과 요람 과목 등록 (컴퓨터공학과 1~4학년 전 과목 우선)
      for (const [term, kind, name, credit] of myCourses) {
        const norm = P.normName(name);
        catalogMap.set(norm, {
          name,
          credit: Number(credit) || 3,
          kind: kind === '전필' ? '전필' : '전선',
          dept: myDept,
          term,
          prof: resolveProf(name)
        });
      }

      // 2. 전체 카탈로그 등록
      for (const c of allCatalog) {
        const norm = P.normName(c.name);
        if (!catalogMap.has(norm)) {
          catalogMap.set(norm, {
            name: c.name,
            credit: Number(c.credit) || 3,
            kind: P.cleanKind(c.kind) === '전필' ? '전필' : '전선',
            dept: c.dept || '',
            term: c.term || '',
            prof: resolveProf(c.name)
          });
        }
      }

      // datalist 옵션 (모든 과목 포함, 내 학과 과목 최상단)
      const datalistOptions = Array.from(catalogMap.values()).map((c) => h('option', { value: c.name }));

      function onNameInput(inputEl) {
        const val = (inputEl.value || '').trim();
        const form = inputEl.form;
        if (!form) return;
        const creditSel = form.elements.trCredit;
        const kindSel = form.elements.trKind;
        const hintEl = form.querySelector('#tr-auto-hint');
        const suggestBox = form.querySelector('#tr-suggest-box');

        // 1. 완벽 일치 체크 및 학점/이수구분 자동 반영
        const exactHit = catalogMap.get(P.normName(val));
        if (exactHit) {
          if (creditSel && exactHit.credit) creditSel.value = String(exactHit.credit);
          if (kindSel && exactHit.kind) kindSel.value = exactHit.kind;
          if (hintEl) {
            hintEl.hidden = false;
            hintEl.innerHTML = `✓ <strong>${exactHit.name}</strong> (${exactHit.dept ? exactHit.dept + ' · ' : ''}${exactHit.term ? exactHit.term + ' · ' : ''}${exactHit.credit}학점 ${exactHit.kind === '전필' ? '전공필수' : '전공선택'}${exactHit.prof ? ' · ' + exactHit.prof + ' 교수' : ''}) 정보가 자동 선택되었습니다.`;
          }
        } else if (hintEl) {
          hintEl.hidden = true;
        }

        // 2. 입력 검색어에 따른 추천 목록 (한글 퍼지 + 오타 허용 매칭)
        if (!val) {
          if (suggestBox) suggestBox.hidden = true;
          return;
        }

        const candidates = [];
        for (const [norm, c] of catalogMap.entries()) {
          let score = CU && CU.matchCourseName ? CU.matchCourseName(val, c.name) : 0;
          if (score <= 0) {
            if (norm.startsWith(P.normName(val))) score = 70;
            else if (norm.includes(P.normName(val))) score = 50;
          }
          if (score > 0) {
            if (c.dept && myDept && (c.dept.includes(myDept) || myDept.includes(c.dept))) score += 40;
            if (c.kind === '전필') score += 15;
            candidates.push({ c, score });
          }
        }

        candidates.sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name, 'ko'));
        const topMatches = candidates.slice(0, 8);

        if (!topMatches.length || !suggestBox) {
          if (suggestBox) suggestBox.hidden = true;
          return;
        }

        suggestBox.hidden = false;
        suggestBox.replaceChildren(...topMatches.map(({ c }, idx) => {
          const meta = [c.dept, c.term, `${c.credit}학점`, c.kind === '전필' ? '전공필수' : '전공선택', c.prof ? `${c.prof} 교수` : ''].filter(Boolean).join(' · ');
          return h('li', {
            class: 'tmc-suggest-item' + (idx === 0 ? ' is-active' : ''),
            'data-name': c.name,
            onpointerdown: (ev) => {
              ev.preventDefault();
              inputEl.value = c.name;
              if (creditSel) creditSel.value = String(c.credit);
              if (kindSel) kindSel.value = c.kind;
              if (hintEl) {
                hintEl.hidden = false;
                hintEl.innerHTML = `✓ <strong>${c.name}</strong> (${meta}) 자동 선택됨`;
              }
              suggestBox.hidden = true;
              inputEl.focus();
            }
          },
            h('div', { class: 'tmc-si-head' },
              h('strong', { class: 'tmc-si-name' }, c.name),
              c.kind === '전필' ? h('span', { class: 'tmc-si-badge req' }, '전필') : null,
              c.prof ? h('span', { class: 'tmc-si-badge prof' }, `${c.prof} 교수`) : null
            ),
            h('div', { class: 'tmc-si-meta' }, meta)
          );
        }));
      }

      return h('section', { class: 'plan-box transferred-mgr-card' },
        h('div', { class: 'tmc-head' },
          h('div', { class: 'tmc-title-group' },
            h('div', { class: 'tmc-icon-badge' }, '🎓'),
            h('div', null,
              h('h3', null, Tx.tmcTitle || '전적대 전공 인정 교과목 관리'),
              h('p', { class: 'tmc-sub' },
                Tx.tmcSub || '전적대에서 인정받은 전공 학점만큼 건국대에서 이수할 전공 의무가 줄어들고(66 - 인정학점), 그만큼 자유 학점(교양·일선)을 들을 수 있습니다. 인정받은 과목은 건국대 학칙상 재수강(중복 수강신청)할 수 없습니다.'
              )
            )
          ),
          h('div', { class: 'tmc-badges' },
            h('span', { class: 'tmc-badge-credits ' + (isMax15 ? 'is-full' : totalTrCredits > 0 ? 'is-part' : '') },
              (Tx.tmcCreditsBadge ? Tx.tmcCreditsBadge(totalTrCredits, 15) : `${totalTrCredits} / 15학점 인정`) + (isMax15 ? (Tx.tmcMaxLimit || ' (최대 한도)') : '')
            ),
            h('span', { class: 'tmc-badge-lock' }, Tx.tmcNoRetake || '건국대 재수강 불가 🚫')
          )
        ),
        h('div', { class: 'tmc-calc-guide' },
          h('div', { class: 'tmc-guide-main' },
            h('span', { class: 'tmc-guide-tag' }, Tx.tmcCalcGuideTag || '학점 연동 현황'),
            h('span', { class: 'tmc-guide-text' },
              Tx.tmcCalcGuideText
                ? Tx.tmcCalcGuideText(totalTrCredits, neededMajor)
                : (totalTrCredits > 0
                    ? `전적대 전공 ${totalTrCredits}학점 인정 → 건국대 이수 필요: 전공 최소 ${neededMajor}학점 + 자유(교양·일선) ${totalTrCredits}학점`
                    : `현재 인정 과목 없음 → 건국대 이수 필요: 전공 66학점 전체 이수 (비동일계 편입 기본)`)
            )
          ),
          h('p', { class: 'tmc-guide-sub' },
            Tx.tmcCalcGuideSub || '※ 학생마다 인정받은 과목과 학점이 다릅니다. (예: 6학점 인정 시 나머지 9학점은 전공을 더 들어 전공 60 + 자유 6, 15학점 인정 시 전공 51 + 자유 15) 심사받은 실제 과목을 아래에서 직접 등록하면 졸업 기준 및 수강신청 추천에 자동 반영됩니다.'
          )
        ),
        list.length ? h('div', { class: 'tmc-chips-wrap' },
          h('p', { class: 'tmc-chips-title' }, Tx.tmcChipsTitle ? Tx.tmcChipsTitle(list.length, totalTrCredits) : `인정된 전공 과목 목록 (${list.length}과목 · 총 ${totalTrCredits}학점)`),
          h('div', { class: 'tmc-chips-grid' }, list.map((item) => h('div', { class: 'tm-chip' },
            h('div', { class: 'tm-chip-info' },
              h('strong', { class: 'tm-chip-name' }, item.name),
              h('span', { class: 'tm-chip-meta' }, `${item.credit}${Tx.creditUnit || '학점'} · ${item.kind === '전필' ? (Tx.kindLabel && Tx.kindLabel.전필 || '전공필수') : (Tx.kindLabel && Tx.kindLabel.전선 || '전공선택')}`),
              h('span', { class: 'tm-chip-lock' }, Tx.tmcNoRetake || '재수강 불가 🚫')
            ),
            h('button', {
              type: 'button',
              class: 'tm-chip-del',
              'aria-label': `${item.name} ${Tx.histRemove || '삭제'}`,
              title: `${item.name} ${Tx.histRemove || '삭제'}`,
              onclick: () => removeCourse(item.name)
            }, '✕')
          )))
        ) : h('div', { class: 'tmc-empty' },
          h('p', null, Tx.tmcEmpty || '등록된 전적대 인정 과목이 없습니다. 전적대 학점 인정 심사를 거쳐 전공으로 인정받은 과목이 있다면 아래에서 직접 추가해 주세요.')
        ),
        h('form', { class: 'tmc-add-form', onsubmit: addCourse },
          h('span', { class: 'tmc-form-label' }, Tx.tmcAddLabel || '과목 직접 추가:'),
          h('div', { class: 'tmc-input-wrap' },
            h('input', {
              type: 'text',
              name: 'trName',
              id: 'tr-custom-input',
              placeholder: Tx.tmcPlaceholder || '과목명 입력 (예: 컴퓨터구조, 소프트웨어공학, 자료구조)',
              required: true,
              autocomplete: 'off',
              class: 'tmc-input-name',
              oninput: (e) => onNameInput(e.target),
              onfocus: (e) => onNameInput(e.target),
              onkeydown: (e) => {
                const sb = e.target.form && e.target.form.querySelector('#tr-suggest-box');
                if (!sb || sb.hidden) return;
                const items = Array.from(sb.querySelectorAll('.tmc-suggest-item'));
                if (!items.length) return;
                const activeIdx = items.findIndex((el) => el.classList.contains('is-active'));
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const next = activeIdx < items.length - 1 ? activeIdx + 1 : 0;
                  items.forEach((el, i) => el.classList.toggle('is-active', i === next));
                  items[next].scrollIntoView({ block: 'nearest' });
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  const prev = activeIdx > 0 ? activeIdx - 1 : items.length - 1;
                  items.forEach((el, i) => el.classList.toggle('is-active', i === prev));
                  items[prev].scrollIntoView({ block: 'nearest' });
                } else if (e.key === 'Enter') {
                  if (activeIdx >= 0 && items[activeIdx]) {
                    e.preventDefault();
                    items[activeIdx].dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
                  }
                } else if (e.key === 'Escape') {
                  sb.hidden = true;
                }
              },
              onblur: (e) => {
                setTimeout(() => {
                  const sb = e.target.form && e.target.form.querySelector('#tr-suggest-box');
                  if (sb) sb.hidden = true;
                }, 220);
              }
            }),
            h('ul', { id: 'tr-suggest-box', class: 'tmc-suggest-box', hidden: true })
          ),
          h('select', { name: 'trCredit', id: 'tr-credit-select', class: 'tmc-select' },
            [3, 2, 1, 4].map((c) => h('option', { value: String(c) }, `${c}${Tx.creditUnit || '학점'}`))
          ),
          h('select', { name: 'trKind', id: 'tr-kind-select', class: 'tmc-select' },
            h('option', { value: '전선' }, Tx.kindLabel && Tx.kindLabel.전선 || '전공선택'),
            h('option', { value: '전필' }, Tx.kindLabel && Tx.kindLabel.전필 || '전공필수')
          ),
          h('button', { type: 'submit', class: 'btn primary small tmc-add-btn' }, Tx.tmcAddBtn || '+ 인정 등록'),
          h('div', { id: 'tr-auto-hint', class: 'tmc-auto-hint', hidden: true })
        )
      );
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

      const suggestBox = h('ul', { id: 'hist-name-suggest', class: 'pf-dept-suggest', role: 'listbox', hidden: true });
      const applyHistSelection = (itemName, inputEl) => {
        if (!inputEl) return;
        inputEl.value = itemName;
        suggestBox.hidden = true;
        const hit = cat().byName.get(P.normName(itemName));
        if (!hit) return;
        const f = inputEl.form;
        if (hit.credit && f && f.elements.credit) f.elements.credit.value = String(hit.credit);
        const k = P.cleanKind(hit.kind);
        if (KINDS.includes(k) && f && f.elements.kind) f.elements.kind.value = k;
        if (f && f.elements.kind) f.elements.kind.dispatchEvent(new Event('change', { bubbles: true }));
      };

      function updateSuggestions(query, inputEl) {
        const q = P.normName(query || '');
        const items = [];
        if (!q) {
          for (const n of allCourseNames.slice(0, 12)) {
            const hit = cat().byName.get(P.normName(n));
            items.push({ name: n, meta: hit ? `${kindLabel(P.cleanKind(hit.kind))} · ${hit.credit}${Tx.creditUnit || ''}` : '' });
          }
        } else {
          const candidates = [];
          for (const item of allCatalog) {
            let score = CU && CU.matchCourseName ? CU.matchCourseName(query, item.name) : 0;
            if (score <= 0) {
              const norm = P.normName(item.name);
              if (norm.startsWith(q)) score = 80;
              else if (norm.includes(q)) score = 60;
            }
            if (score > 0) {
              if (item.dept && dept() && (item.dept.includes(dept()) || dept().includes(item.dept))) score += 40;
              candidates.push({ name: item.name, score, item });
            }
          }
          candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));
          const seenN = new Set();
          for (const c of candidates) {
            if (seenN.has(c.name)) continue;
            seenN.add(c.name);
            items.push({ name: c.name, meta: `${kindLabel(P.cleanKind(c.item.kind))} · ${c.item.credit}${Tx.creditUnit || ''}` });
            if (items.length >= 12) break;
          }
        }
        if (!items.length) {
          suggestBox.hidden = true;
          suggestBox.replaceChildren();
          return;
        }
        suggestBox.replaceChildren(...items.map((it) => h('li', {
          role: 'option',
          class: 'pf-dept-opt',
          onmousedown: (ev) => {
            ev.preventDefault();
            applyHistSelection(it.name, inputEl);
          }
        },
          h('div', { style: 'font-weight:700;' }, it.name),
          it.meta ? h('div', { style: 'font-size:11.5px;color:var(--muted);margin-top:2px;' }, it.meta) : null
        )));
        suggestBox.hidden = false;
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
          h('div', { class: 'pf-dept-wrap' },
            h('input', { type: 'text', name: 'name', id: 'hist-name', autocomplete: 'off', maxlength: '60', required: true,
              oninput: (e) => {
                const val = e.target.value;
                updateSuggestions(val, e.target);
                const hit = cat().byName.get(P.normName(val));
                if (!hit) return;
                const f = e.target.form;
                if (hit.credit && f.elements.credit) f.elements.credit.value = String(hit.credit);
                const k = P.cleanKind(hit.kind);
                if (KINDS.includes(k) && f.elements.kind) {
                  f.elements.kind.value = k;
                  f.elements.kind.dispatchEvent(new Event('change', { bubbles: true }));
                }
              },
              onfocus: (e) => updateSuggestions(e.target.value, e.target),
              onkeydown: (e) => { if (e.key === 'Escape') suggestBox.hidden = true; },
              onblur: () => { setTimeout(() => { suggestBox.hidden = true; }, 180); } }),
            suggestBox)),
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

      return [form];
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

    function openCourseEditDialog(courseItem) {
      const Tx = T();
      const existing = document.querySelector('.course-edit-modal-backdrop');
      if (existing) existing.remove();

      const terms = termOptions();
      const allKinds = KINDS;

      let backdrop = null;

      const onSave = (e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const newName = (f.elements.editName.value || '').trim();
        const newTerm = f.elements.editTerm.value;
        const newKind = f.elements.editKind.value;
        const newCredit = Number(f.elements.editCredit.value) || 3;
        const newGrade = f.elements.editGrade.value;

        if (!newName) { toast('과목명을 입력해 주세요.'); return; }
        if (newCredit <= 0) { toast('학점은 0보다 커야 합니다.'); return; }

        st.history = st.history.map((y) => {
          if (y === courseItem || (y.id && y.id === courseItem.id)) {
            return Object.assign({}, y, {
              name: newName,
              term: newTerm,
              kind: newKind,
              credit: newCredit,
              grade: newGrade
            });
          }
          return y;
        });
        st.history = P.cleanHistory(st.history);
        save();
        render();
        if (backdrop) backdrop.remove();
        toast(`[${newName}] 과목 정보가 수정되었습니다.`);
      };

      const onDelete = () => {
        if (!confirm(`[${courseItem.name}] 과목을 이수 내역에서 삭제하시겠습니까?`)) return;
        st.history = st.history.filter((y) => y !== courseItem && (!y.id || y.id !== courseItem.id));
        save();
        render();
        if (backdrop) backdrop.remove();
        toast(`[${courseItem.name}] 과목이 삭제되었습니다.`);
      };

      backdrop = h('div', {
        class: 'course-edit-modal-backdrop',
        onclick: (ev) => { if (ev.target === backdrop) backdrop.remove(); }
      },
        h('form', { class: 'course-edit-modal-card', onsubmit: onSave },
          h('div', { class: 'cem-head' },
            h('h3', { class: 'cem-title' }, Tx.cemTitle || `✏️ 과목 정보 수정`),
            h('button', {
              type: 'button',
              class: 'icon-x',
              title: Tx.close || '닫기',
              onclick: () => backdrop.remove()
            }, '×')
          ),
          h('div', { class: 'cem-fields' },
            h('div', { class: 'cem-field-group' },
              h('label', null, Tx.cemName || '과목명'),
              h('input', {
                type: 'text',
                name: 'editName',
                value: courseItem.name,
                required: true,
                maxlength: '60',
                placeholder: Tx.cemName || '과목명'
              })
            ),
            h('div', { class: 'cem-field-group' },
              h('label', null, Tx.cemTerm || '이수 학기 (학기 변경 시 해당 학기로 바로 이동)'),
              h('select', { name: 'editTerm' },
                h('option', { value: '', selected: !courseItem.term ? true : null }, Tx.cemTermUnknown || '학기 모름'),
                terms.map((t) => h('option', {
                  value: t,
                  selected: courseItem.term === t ? true : null
                }, termName(t)))
              )
            ),
            h('div', { class: 'cem-row' },
              h('div', { class: 'cem-field-group' },
                h('label', null, Tx.cemKind || '이수구분'),
                h('select', { name: 'editKind' },
                  allKinds.map((k) => h('option', {
                    value: k,
                    selected: courseItem.kind === k ? true : null
                  }, kindLabel(k)))
                )
              ),
              h('div', { class: 'cem-field-group' },
                h('label', null, Tx.cemCredit || '학점'),
                h('input', {
                  type: 'number',
                  name: 'editCredit',
                  min: '0.5',
                  max: '9',
                  step: '0.5',
                  value: String(courseItem.credit || 3),
                  required: true
                })
              )
            ),
            h('div', { class: 'cem-field-group' },
              h('label', null, Tx.cemGrade || '취득 성적'),
              h('select', { name: 'editGrade' },
                h('option', { value: '', selected: !courseItem.grade ? true : null }, Tx.cemGradeNone || '— (미입력/재학 중)'),
                P.GRADES.concat('F').map((g) => h('option', {
                  value: g,
                  selected: courseItem.grade === g ? true : null
                }, g))
              )
            )
          ),
          h('div', { class: 'cem-actions' },
            h('button', {
              type: 'button',
              class: 'btn small',
              style: 'margin-right: auto; color: var(--danger, #ef4444); border-color: rgba(239, 68, 68, 0.3);',
              onclick: onDelete
            }, Tx.cemDelete || '과목 삭제'),
            h('button', {
              type: 'button',
              class: 'btn small',
              onclick: () => backdrop.remove()
            }, Tx.cancel || '취소'),
            h('button', {
              type: 'submit',
              class: 'btn small primary'
            }, Tx.cemSave || '수정 저장')
          )
        )
      );

      document.body.appendChild(backdrop);
    }

    function renderTerms() {
      const Tx = T();
      if (!st.history.length) return h('p', { class: 'empty' }, Tx.histEmpty);
      return h('div', { class: 'terms' }, P.byTerm(st.history).map((g) => h('section', {
        class: 'term',
        ondragover: (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          e.currentTarget.classList.add('term-drop-active');
        },
        ondragleave: (e) => {
          e.currentTarget.classList.remove('term-drop-active');
        },
        ondrop: (e) => {
          e.preventDefault();
          e.currentTarget.classList.remove('term-drop-active');
          const targetIdOrName = e.dataTransfer.getData('text/plain');
          const hit = st.history.find(y => (y.id && y.id === targetIdOrName) || y.name === targetIdOrName);
          if (hit && hit.term !== g.term) {
            hit.term = g.term;
            save(); render();
            toast(`[${hit.name}] 과목이 ${termName(g.term)}(으)로 이동되었습니다.`);
          }
        }
      },
        h('h4', { class: 'term-head' }, h('span', null, termName(g.term)),
          h('span', { class: 'term-sum' }, [Tx.histCredits(g.credits), (() => { const v = P.gpa(g.items); return v ? Tx.gpaLabel(v.gpa.toFixed(2)) : ''; })()].filter(Boolean).join(' · '))),
        h('ul', { class: 'term-list' }, g.items.map((x) => h('li', {
          draggable: 'true',
          ondragstart: (e) => {
            e.dataTransfer.setData('text/plain', x.id || x.name);
            e.dataTransfer.effectAllowed = 'move';
          }
        },
          h('span', {
            class: 'tl-name',
            title: '클릭하여 과목 정보(학기·학점·이수구분) 수정',
            style: 'cursor: pointer;',
            onclick: () => openCourseEditDialog(x)
          }, x.name),
          h('span', { class: 'tl-kind' }, kindLabel(x.kind)),
          h('select', { class: 'tl-grade', 'aria-label': `${x.name} ${Tx.histGrade}`, onchange: (e) => {
            st.history = st.history.map((y) => (y === x ? Object.assign({}, y, { grade: e.target.value }) : y));
            st.history = P.cleanHistory(st.history);
            save(); render();
          } }, h('option', { value: '' }, '—'), P.GRADES.concat('F').map((gr) => h('option', { value: gr, selected: x.grade === gr ? true : null }, gr))),
          h('span', { class: 'tl-credit' }, String(x.credit)),
          h('div', { class: 'tl-actions' },
            h('button', {
              type: 'button',
              class: 'tl-edit-btn',
              'aria-label': `${x.name} 수정`,
              title: `${x.name} 수정 (학기 이동, 학점, 이수구분 변경)`,
              onclick: () => openCourseEditDialog(x)
            }, '✏️'),
            h('button', {
              type: 'button',
              class: 'icon-x',
              'aria-label': `${x.name} ${Tx.histRemove}`,
              title: Tx.histRemove,
              onclick: () => {
                const before = st.history;
                st.history = st.history.filter((y) => y !== x);
                save(); render();
                toast(Tx.histRemoved(x.name), { label: Tx.undo, run: () => { st.history = before; save(); render(); } });
              }
            }, '×')
          )
        ))))));
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

      const sim = P.simGpa(curCredits, curGpa, rem, target);
      const neededGpa = sim.neededGpa;
      const maxRounded = sim.maxRounded;
      const neededStr = neededGpa.toFixed(2);
      const targetStr = target.toFixed(2);
      const maxStr = maxRounded.toFixed(2);

      let resultBadge = '';
      let resultClass = '';
      let resultDesc = '';

      const Tx = T();
      switch (sim.status) {
        case 'achieved':
          resultClass = 'is-achieved';
          resultBadge = Tx.gpaSimDoneBadge || '🎉 목표 달성 완료';
          resultDesc = Tx.gpaSimDoneDesc ? Tx.gpaSimDoneDesc(targetStr) : `축하합니다! 이미 목표 평점(${targetStr})을 달성했습니다. 현재 성적을 잘 유지해보세요!`;
          break;
        case 'all-aplus':
          resultClass = 'is-all-aplus';
          resultBadge = Tx.gpaSimAllAplusBadge || '🔥 전과목 A+(4.5) 필수';
          resultDesc = Tx.gpaSimAllAplusDesc ? Tx.gpaSimAllAplusDesc(rem, targetStr) : `남은 ${rem}학점을 전과목 A+(4.5) 만점으로 이수해야 졸업 평점 ${targetStr} 달성이 가능합니다. (단 1과목도 감점 허용 불가)`;
          break;
        case 'extreme':
          resultClass = 'is-extreme';
          resultBadge = Tx.gpaSimExtremeBadge ? Tx.gpaSimExtremeBadge(neededStr) : `🔥 극상 난이도 (평균 ${neededStr})`;
          resultDesc = Tx.gpaSimExtremeDesc ? Tx.gpaSimExtremeDesc(rem, neededStr, targetStr) : `남은 ${rem}학점을 거의 전과목 A+(4.5) 수준(평균 ${neededStr})으로 이수해야 졸업 평점 ${targetStr}에 도달합니다. 1과목이라도 A0(4.0) 이하를 받으면 달성이 어려워질 수 있습니다.`;
          break;
        case 'challenging':
          resultClass = 'is-challenging';
          resultBadge = Tx.gpaSimChallengingBadge ? Tx.gpaSimChallengingBadge(neededStr) : `⚡ 고득점 필요 (평균 ${neededStr})`;
          resultDesc = Tx.gpaSimChallengingDesc ? Tx.gpaSimChallengingDesc(rem, neededStr, targetStr) : `남은 ${rem}학점 동안 A+ 및 A0 위주(평균 ${neededStr})의 최상위 성적이 필요합니다. 졸업 평점 ${targetStr} 달성을 위해 B+ 이하 과목을 최소화하세요.`;
          break;
        case 'possible':
          resultClass = 'is-possible';
          resultBadge = Tx.gpaSimPossibleBadge ? Tx.gpaSimPossibleBadge(neededStr) : `🎯 달성 가능 (평균 ${neededStr})`;
          resultDesc = Tx.gpaSimNeedDesc ? Tx.gpaSimNeedDesc(rem, neededStr, targetStr) : `남은 ${rem}학점 동안 평균 ${neededStr} 이상(A0·B+ 위주)을 취득하면 졸업 평점 ${targetStr}에 도달합니다!`;
          break;
        case 'comfortable':
          resultClass = 'is-comfortable';
          resultBadge = Tx.gpaSimComfortableBadge ? Tx.gpaSimComfortableBadge(neededStr) : `✨ 안정권 (평균 ${neededStr})`;
          resultDesc = Tx.gpaSimComfortableDesc ? Tx.gpaSimComfortableDesc(rem, neededStr, targetStr) : `남은 ${rem}학점 동안 평균 ${neededStr} 이상을 유지하면 여유롭게 목표 평점(${targetStr})을 달성할 수 있습니다.`;
          break;
        default:
          resultClass = 'is-impossible';
          resultBadge = Tx.gpaSimHardBadge ? Tx.gpaSimHardBadge(maxStr) : `⚠️ 목표 조정 필요 (최대 ${maxStr})`;
          resultDesc = Tx.gpaSimHardDesc ? Tx.gpaSimHardDesc(rem, maxStr) : `남은 ${rem}학점을 모두 A+(4.5) 받아도 취득 가능한 최고 졸업 평점은 ${maxStr}입니다. 목표 평점을 ${maxStr} 이하로 조정해보세요.`;
          break;
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
        renderTransferredManager(),
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
      // 전적대 전공 인정과목은 이미 이수 완료된 상태이며 건국대학교 규정상 재수강 불가 -> 추천에서 100% 영구 제외!
      for (const x of (st.transferred || [])) { if (x.code) s.add(x.code); s.add(P.normName(x.name)); }
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
      setTimeout(() => {
        try { run(); } finally { st.busy = false; renderPlan(); }
      }, 20);
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

      const freeLabel = currentLang() === 'en' ? 'Free' : currentLang() === 'zh' ? '空课' : currentLang() === 'ja' ? '空き' : '공강';
      const elLabel = currentLang() === 'en' ? '💻 Unscheduled e-Learning:' : currentLang() === 'zh' ? '💻 课表外网络课程:' : currentLang() === 'ja' ? '💻 時間割外eラーニング:' : '💻 시간표 외 이러닝:';
      const profTitle = (p) => (currentLang() === 'en' ? `Prof. ${p}` : currentLang() === 'zh' || currentLang() === 'ja' ? `${p} 教授` : `${p} 교수`);

      const gridEl = h('div', { class: 'mini-tt', style: `--cols:${days.length};--rows:${hours.length}` },
        h('div', { class: 'mini-head' }, h('span'), days.map((d) => h('span', null, deps.dayName(d)))),
        h('div', { class: 'mini-body' },
          h('div', { class: 'mini-hours' }, hours.map((x) => h('span', null, String(x)))),
          days.map((d) => {
            const dayClasses = timed.flatMap((p) => p.section.t.filter((x) => x[0] === d).map(([, a, b]) => ({ p, a, b })));
            return h('div', { class: 'mini-col' + (!dayClasses.length ? ' is-free-col' : '') },
              !dayClasses.length ? h('span', { class: 'mini-free-label' }, freeLabel) : null,
              dayClasses.map(({ p, a, b }) => {
                const durMin = toMin(b) - toMin(a);
                const isShort = durMin <= 60;
                const isTiny = durMin <= 30;
                const profText = p.section.prof ? profTitle(p.section.prof) : '';
                return h('div', {
                  class: 'mini-class' + (p.section.mode === 'live' ? ' live' : '') + (isShort ? ' is-short-slot' : ''),
                  style: `top:${((toMin(a) - lo) / span) * 100}%;height:${((toMin(b) - toMin(a)) / span) * 100}%;--c:${deps.classColor(p.group.name)}`,
                  title: `${p.group.name} ${a}–${b}${profText ? ` (${profText})` : ''}`
                },
                  h('b', null, p.group.name),
                  (!isShort && p.section.prof) ? h('span', { class: 'mini-prof', style: 'font-size:10px;display:block;opacity:.85;font-weight:600;' }, p.section.prof) : null,
                  !isTiny ? h('small', null, `${a}–${b}`) : null
                );
              }));
          })));

      const elearnChips = elearns.length ? h('div', { class: 'mini-elearn-wrap' },
        h('span', { class: 'mini-el-label' }, elLabel),
        h('div', { class: 'mini-el-chips' }, elearns.map((p) =>
          h('span', { class: 'mini-el-chip', style: `--c:${deps.classColor(p.group.name)}` },
            `📖 ${p.group.name}`, p.section.prof ? ` (${profTitle(p.section.prof)})` : ''
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
        const CR = window.GongjiCampusRoute;
        const DI18n = window.GongjiDeptI18n;
        const lang = currentLang();
        const profTitle = (pr) => (lang === 'en' ? `Prof. ${pr}` : lang === 'zh' || lang === 'ja' ? `${pr} 教授` : `${pr} 교수`);
        const room = [...new Set(sec.t.map((y) => y[3]).filter(Boolean))].map((rm) => (CR && CR.formatRoom) ? CR.formatRoom(rm, lang) : rm).join(', ');
        const courseName = (DI18n && DI18n.formatCourse) ? DI18n.formatCourse(g.name, lang) : g.name;
        const deptName = (g.area === 'major' && g.dept) ? ((DI18n && DI18n.formatDept) ? DI18n.formatDept(g.dept, lang) : g.dept) : '';
        const isLocked = p.locked.some((y) => y.key === x.key);
        return h('li', { class: 'pr' + (isLocked ? ' is-locked' : '') },
          h('div', { class: 'pr-main' },
            h('p', { class: 'pr-name' }, courseName, isLocked ? h('span', { class: 'pr-lock' }, Tx.planLocked) : null),
            h('p', { class: 'pr-meta' }, [kindLabel(g.kind), `${g.credit}${Tx.creditUnit}`, Tx.planGradeN(g.grade), deptName].filter(Boolean).join(' · ')),
            h('p', { class: 'pr-when' },
              sec.prof ? h('span', { class: 'pr-prof', style: 'font-weight:600;margin-right:6px;color:var(--text);' }, profTitle(sec.prof)) : null,
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
          sub = elearnCount ? (Tx.altSmartMixSub ? Tx.altSmartMixSub(elearnCount) : `이러닝 ${elearnCount}과목`) : Tx.altBalanced;
        } else if (a.key === 'balanced') {
          sub = (a.quality && a.quality.lunchBreak) ? (Tx.altLunchBreak || '점심시간 확보') : Tx.altBalanced;
        }
        return h('button', { type: 'button', role: 'tab', class: 'alt-tab', 'aria-selected': String(a.key === st.altKey),
          onclick: () => { st.altKey = a.key; st.result = a.result; renderPlan(); } },
          h('span', { class: 'alt-name' }, Tx['alt_' + a.key] || a.title || a.key),
          h('strong', null, `${r2.credits}${Tx.creditUnit}`, h('small', null, ` · ${Tx.altDays(wk)}`)),
          h('span', { class: 'alt-sub' }, sub));
      })) : null;
      const lang = currentLang();
      const simRoutes = (P.analyzeRoutes && P.analyzeRoutes(r.picks, lang)) || [];
      const CR = window.GongjiCampusRoute;
      const routeSummaryEl = simRoutes.length ? h('div', { class: 'plan-route-box' },
        h('div', { class: 'prb-head' },
          h('strong', null, lang === 'en' ? `🚶 Consecutive Class Walk Check (${simRoutes.length})`
            : lang === 'zh' ? `🚶 连堂步行换教室模拟 (${simRoutes.length}处)`
            : lang === 'ja' ? `🚶 連続授業の移動シミュレーション (${simRoutes.length}件)`
            : `🚶 연강 이동 동선 시뮬레이션 (${simRoutes.length}건)`)
        ),
        h('div', { class: 'prb-list' }, simRoutes.map((sr) => {
          const rA = (CR && CR.formatRoom) ? CR.formatRoom(sr.prev.room, lang) : sr.prev.room;
          const rB = (CR && CR.formatRoom) ? CR.formatRoom(sr.next.room, lang) : sr.next.room;
          const lvl = sr.route.level === 'danger' ? 'is-danger' : sr.route.level === 'warning' ? 'is-warn' : 'is-safe';
          return h('div', { class: `prb-item ${lvl}` },
            h('span', { class: 'prb-day' }, deps.dayName(sr.day)),
            h('span', { class: 'prb-path' }, `${rA} ➔ ${rB}`),
            h('span', { class: 'prb-status' }, `${sr.route.statusText} (${sr.route.walkMin}${lang === 'en' ? 'm' : '분'})`)
          );
        }))
      ) : null;

      return h('div', { class: 'plan-result' },
        altTabs,
        h('div', { class: 'pr-summary' },
          h('p', { class: 'pr-total' }, h('strong', null, String(r.credits)), ` / ${r.target}${Tx.creditUnit}`),
          h('p', { class: 'pr-by' }, Tx.planBy(r.byArea.major, r.byArea.general, r.byArea.free)),
          r.short ? h('p', { class: 'help warn-note' }, Tx.planShort(r.short)) : null),
        miniGrid(r.picks),
        routeSummaryEl,
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
      values: () => ({ history: st.history, gradReq: st.req, transferredCourses: st.transferred, planPrefs: st.prefs }),
      load(v) {
        if (Array.isArray(v.history)) st.history = P.cleanHistory(v.history);
        if (v.gradReq && typeof v.gradReq === 'object') st.req = v.gradReq;
        if (Array.isArray(v.transferredCourses)) st.transferred = v.transferredCourses;
        if (v.planPrefs && typeof v.planPrefs === 'object') st.prefs = Object.assign(st.prefs, v.planPrefs);
        save();
        render();
      }
    };
    return api;
  }

  root.GongjiPlanUI = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
