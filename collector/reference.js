// KU 공지 수집기 - 학교 기본 정보 (학사일정·요람·안내 페이지·규정)
// 공지처럼 자주 바뀌지 않아서 학기마다 한 번 받으면 된다. 이 탭의 브라우저가 평소처럼 페이지를 읽는다.
(() => {
  const REF = globalThis.KKU_REFERENCE;
  if (!REF) return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let busy = false;

  async function setRefState(patch) {
    const { refState = {} } = await chrome.storage.local.get('refState');
    await chrome.storage.local.set({ refState: { ...refState, ...patch, updatedAt: Date.now() } });
  }

  // HTML → 줄바꿈이 살아 있는 글자
  function htmlToText(html) {
    const doc = typeof html === 'string' ? new DOMParser().parseFromString(html, 'text/html') : html;
    doc.querySelectorAll('script,style,noscript').forEach((el) => el.remove());
    doc.querySelectorAll('br').forEach((el) => el.replaceWith('\n'));
    doc.querySelectorAll('p,div,tr,li,h1,h2,h3,h4,h5,h6,dt,dd').forEach((el) => el.append('\n'));
    doc.querySelectorAll('td,th').forEach((el) => el.append(' | '));
    return (doc.body?.textContent ?? '')
      .replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
  }

  async function postJson(url, params) {
    const res = await fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: new URLSearchParams(params)
    });
    const text = await res.text();
    if (text.includes('웹방화벽에 의해 차단')) throw new Error('학교 방화벽이 요청을 차단했습니다. 잠시 뒤 다시 시도하세요.');
    return JSON.parse(text);
  }

  async function getDoc(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }

  // ---------- www.kku.ac.kr ----------
  async function collectKku(report) {
    const out = { calendar: [], yoram: [], pages: [] };
    // 1) 학사일정: 올해와 내년
    const y = new Date().getFullYear();
    for (const year of [y - 1, y, y + 1]) {
      report(`학사일정 ${year}년`);
      const data = await postJson('/ajax/FR_SCH_SVC/ScheduleListData.do', { SCH_YEAR: year, SCH_SITE_NO: REF.scheduleSiteNo });
      for (const x of data?.data ?? []) {
        out.calendar.push({ start: x.START_DAY, end: x.END_DAY, title: String(x.SUBJECT ?? '').trim(), type: x.SCH_TYPE ?? null });
      }
      await sleep(300);
    }
    // 2) 요람: 게시판 글 목록에서 최근 3개 학년도의 PDF 주소
    report('요람');
    const menuDoc = await getDoc(`/cms/FR_CON/index.do?MENU_ID=${REF.yoramMenu}`);
    const form = menuDoc.querySelector('#sendForm');
    if (form) {
      const params = {};
      form.querySelectorAll('input,select').forEach((el) => { if (el.name) params[el.name] = el.value; });
      params.pageNo = '1';
      params.pagePerCnt = '10';
      const list = (await postJson('/ajax/FR_SVC/BBSViewList2.do', params))?.data?.list ?? [];
      for (const r of list.slice(0, 3)) {
        const year = Number(String(r.SUBJECT).match(/(20\d\d)/)?.[1]) || null;
        out.yoram.push({
          year, subject: String(r.SUBJECT).trim(), date: String(r.WRITE_DATE ?? '').replace(/\./g, '-'),
          files: Array.from({ length: Number(r.FILE_CNT) || 0 }, (_, i) => ({
            name: i === 0 ? r.FILE_ORG_NM ?? null : null,
            url: `${location.origin}/ajaxFile/FR_SVC/FileDown.do?BOARD_SEQ=${params.BOARD_SEQ}&SITE_NO=${params.SITE_NO}&BBS_SEQ=${r.BBS_SEQ}&FILE_SEQ=${i + 1}`
          }))
        });
      }
    }
    // 3) 안내 페이지 본문
    for (const p of REF.pages) {
      report(`안내 페이지: ${p.name}`);
      const doc = await getDoc(`/cms/FR_CON/index.do?MENU_ID=${p.menu}`);
      const box = doc.querySelector('.page_conts_wrap .conts_inner') || doc.querySelector('.page_conts_wrap');
      if (!box) continue;
      const links = [...box.querySelectorAll('a[href]')]
        .map((a) => ({ text: a.textContent.trim(), url: new URL(a.getAttribute('href'), location.origin).href }))
        .filter((l) => /\.(pdf|hwp|hwpx|docx|xlsx)(\?|$)|FileDown|PdfView/i.test(l.url));
      out.pages.push({ menu: p.menu, name: p.name, url: `${location.origin}/cms/FR_CON/index.do?MENU_ID=${p.menu}`,
                       text: htmlToText(box.innerHTML).slice(0, 30000), links });
      await sleep(400);
    }
    return out;
  }

  // ---------- rule.konkuk.ac.kr ----------
  const lawKey = (name) => String(name ?? '').replace(/^\s*[\d-]+\s+/, '').replace(/\s+/g, '');

  async function collectRules(report) {
    report('규정 목록');
    const res = await fetch('/lmxsrv/law/lawTree.do?LAWGROUP=1&SEQ_TARGET=0&MODE=srvlist&TREE_SEARCH_BOOL=y', { credentials: 'same-origin' });
    const html = await res.text();
    const nodes = [];
    for (const m of html.matchAll(/\{"lawgroup"[^{}]*\}/g)) {
      try { nodes.push(JSON.parse(m[0])); } catch { /* 형식이 다른 조각은 건너뜀 */ }
    }
    const want = new Set(REF.rules.map(lawKey));
    const laws = nodes.filter((n) => n.typeCode === '1301' && String(n.folder) === '0' && want.has(lawKey(n.name)));
    const out = [];
    for (const [i, n] of laws.entries()) {
      report(`규정 ${i + 1}/${laws.length}: ${n.name}`);
      const doc = await getDoc(`/lmxsrv/law/lawFullContent.do?SEQ=${n.id}&SEQ_HISTORY=${n.hseq}`);
      out.push({ seq: n.id, hseq: n.hseq, name: String(n.name).replace(/^\s*[\d-]+\s+/, ''), code: String(n.name).match(/^\s*([\d-]+)\s/)?.[1] ?? null,
                 url: `${location.origin}/lmxsrv/law/lawDetail.do?SEQ=${n.id}&LAWGROUP=1&PAGE=1`, text: htmlToText(doc) });
      await sleep(500);
    }
    const missing = REF.rules.filter((r) => !laws.some((n) => lawKey(n.name) === lawKey(r)));
    return { rules: out, missing };
  }

  async function run() {
    busy = true;
    const report = (current) => setRefState({ running: true, current, error: null, host: location.host });
    try {
      if (location.host === 'rule.konkuk.ac.kr') {
        const { rules, missing } = await collectRules(report);
        await chrome.storage.local.set({ 'ref:rule': { collectedAt: Date.now(), rules, missing } });
      } else {
        const kku = await collectKku(report);
        await chrome.storage.local.set({ 'ref:kku': { collectedAt: Date.now(), ...kku } });
      }
      await setRefState({ running: false, current: null, finished: true });
    } catch (e) {
      await setRefState({ running: false, current: null, error: String(e?.message ?? e) });
    } finally {
      busy = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'refPing') {
      sendResponse({ ok: true, host: location.host, busy });
    } else if (msg?.type === 'refStart') {
      if (busy) sendResponse({ ok: false, error: '이미 받는 중입니다.' });
      else { run(); sendResponse({ ok: true }); }
    }
    return false;
  });
})();
