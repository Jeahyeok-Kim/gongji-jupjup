// KU 공지 수집기 - 콘텐츠 스크립트
// 학교 사이트 탭 안에서 실행됩니다. 사용자의 브라우저가 평소 게시판을 볼 때와 같은 요청으로
// 공개 게시글을 읽어 chrome.storage.local 에 저장합니다. (로그인 필요한 게시판은 대상이 아닙니다.)
(() => {
  const BOARDS = globalThis.KKU_BOARDS?.[location.host] ?? [];
  const PAGE_SIZE = 50;
  const DELAY_MS = 400; // 요청 사이 간격 (학교 서버 부하 방지)
  const MAX_TEXT = 8000;

  let running = false;
  let abortFlag = false;

  class BlockedError extends Error {}

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const isBlocked = (text) => typeof text === 'string' && text.includes('웹방화벽에 의해 차단');

  async function setState(patch) {
    const { crawlState = {} } = await chrome.storage.local.get('crawlState');
    await chrome.storage.local.set({ crawlState: { ...crawlState, ...patch, updatedAt: Date.now() } });
  }

  async function withRetry(fn, tries = 3) {
    let lastError;
    for (let i = 0; i < tries; i++) {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof BlockedError) throw e; // 차단은 재시도하지 않음
        lastError = e;
        await sleep(800 * (i + 1));
      }
    }
    throw lastError;
  }

  // 메뉴 페이지의 검색 폼(#sendForm)에서 게시판 파라미터를 읽는다.
  async function fetchBoardParams(menu) {
    return withRetry(async () => {
      const res = await fetch(`/cms/FR_CON/index.do?MENU_ID=${menu}`, { credentials: 'same-origin' });
      const html = await res.text();
      if (isBlocked(html)) throw new BlockedError();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const form = doc.querySelector('#sendForm');
      if (!form) return null;
      const params = new URLSearchParams();
      form.querySelectorAll('input,select').forEach((el) => {
        if (el.name) params.set(el.name, el.value);
      });
      return params.get('BOARD_SEQ') ? params : null;
    });
  }

  async function fetchPage(params, pageNo) {
    return withRetry(async () => {
      const body = new URLSearchParams(params);
      body.set('pagePerCnt', String(PAGE_SIZE));
      body.set('pageNo', String(pageNo));
      const res = await fetch('/ajax/FR_SVC/BBSViewList2.do', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: body.toString()
      });
      const text = await res.text();
      if (isBlocked(text)) throw new BlockedError();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('게시판 응답이 JSON 형식이 아닙니다.');
      }
      return json?.data?.list ?? [];
    });
  }

  const decode = (s) =>
    s ? (new DOMParser().parseFromString(String(s), 'text/html').documentElement.textContent ?? '') : '';

  // 본문 HTML -> 줄바꿈이 보존된 텍스트 + 이미지 주소 목록
  function parseBody(html) {
    if (!html) return { text: '', imgs: [] };
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style').forEach((el) => el.remove());
    const imgs = [...doc.querySelectorAll('img')]
      .map((img) => img.getAttribute('src'))
      .filter(Boolean)
      .map((src) => {
        try {
          return new URL(src, location.origin).href;
        } catch {
          return src;
        }
      });
    doc.querySelectorAll('br').forEach((el) => el.replaceWith('\n'));
    doc.querySelectorAll('p,div,tr,li,h1,h2,h3,h4,h5,h6').forEach((el) => el.append('\n'));
    doc.querySelectorAll('td,th').forEach((el) => el.append(' | '));
    const text = (doc.body?.textContent ?? '')
      .replace(/ /g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, MAX_TEXT);
    return { text, imgs };
  }

  // 작성자 개인 식별자(REG_USER_ID 등)는 저장하지 않는다.
  function toNotice(n, board, site, boardSeq) {
    const { text, imgs } = parseBody(n.CONTENTS);
    return {
      id: `${site}-${boardSeq}-${n.BBS_SEQ}`,
      host: location.host,
      site: Number(site),
      board: Number(boardSeq),
      menu: board.menu,
      boardName: board.name,
      bbsSeq: n.BBS_SEQ,
      subject: decode(n.SUBJECT).trim(),
      date: String(n.WRITE_DATE ?? '').replace(/\./g, '-'),
      dept: n.DEPT_NM ?? null,
      hits: n.HITS ?? 0,
      pinned: n.TOP_NOTICE_YN === 'Y',
      isNew: n.NEW_YN === 'Y',
      text,
      imgs,
      fileCnt: n.FILE_CNT ?? 0,
      fileName: n.FILE_ORG_NM ?? null,
      // 첨부파일 내려받기 주소 (학교 사이트의 fileDown() 과 같은 주소). 파이프라인이 받아서 글자를 읽는다.
      files: Array.from({ length: Math.min(Number(n.FILE_CNT) || 0, 10) }, (_, i) => ({
        seq: i + 1,
        name: i === 0 ? (n.FILE_ORG_NM ?? null) : null,
        url: `${location.origin}/ajaxFile/FR_SVC/FileDown.do?BOARD_SEQ=${boardSeq}&SITE_NO=${site}&BBS_SEQ=${n.BBS_SEQ}&FILE_SEQ=${i + 1}`
      })),
      link:
        `${location.origin}/cms/FR_CON/BoardView.do?MENU_ID=${board.menu}&CONTENTS_NO=&SITE_NO=${site}` +
        `&P_TAB_NO=&TAB_NO=&BOARD_SEQ=${boardSeq}&BOARD_CATEGORY_NO=&BBS_SEQ=${n.BBS_SEQ}&pageNo=1`,
      externalLink: n.LINK_URL_YN === 'Y' ? (n.LINK_URL ?? null) : null,
      collectedAt: Date.now()
    };
  }

  const storageKey = (notice) => `n:${notice.id}`;

  async function crawlBoard(board, opts) {
    const params = await fetchBoardParams(board.menu);
    if (!params) return { menu: board.menu, name: board.name, skipped: '게시판 정보를 찾지 못함' };
    const site = params.get('SITE_NO');
    const boardSeq = params.get('BOARD_SEQ');
    const limit = board.news ? opts.newsLimit : Infinity;

    let page = 1;
    let seen = 0;
    let added = 0;
    let total = 0;

    while (!abortFlag) {
      const list = await fetchPage(params, page);
      if (page === 1) total = list[0]?.RNUM_DESC ?? 0;
      if (list.length === 0) break;

      // 최대 건수 제한이 있으면 남은 개수만큼만 처리한다.
      const items = list.slice(0, Math.max(0, limit - seen)).map((n) => toNotice(n, board, site, boardSeq));
      if (items.length === 0) break;
      const known = await chrome.storage.local.get(items.map(storageKey));
      const fresh = opts.full ? items : items.filter((it) => !(storageKey(it) in known));
      if (fresh.length > 0) {
        await chrome.storage.local.set(Object.fromEntries(fresh.map((it) => [storageKey(it), it])));
      }
      seen += items.length;
      added += fresh.length;
      await setState({ current: board.name, progress: { menu: board.menu, seen, total, added } });

      // 증분 수집: 한 페이지가 전부 이미 아는 글이면 더 볼 필요가 없다.
      if (!opts.full && fresh.length === 0) break;
      if (seen >= limit || list.length < PAGE_SIZE) break;
      page += 1;
      await sleep(DELAY_MS);
    }

    await chrome.storage.local.set({
      [`s:${site}:${boardSeq}`]: { host: location.host, menu: board.menu, name: board.name, total, lastSyncAt: Date.now() }
    });
    return { menu: board.menu, name: board.name, total, seen, added };
  }

  async function run(menus, opts) {
    running = true;
    abortFlag = false;
    const selected = BOARDS.filter((b) => menus.includes(b.menu));
    const results = [];
    await setState({
      running: true,
      finished: false,
      stopped: false,
      error: null,
      host: location.host,
      current: null,
      progress: null,
      results,
      startedAt: Date.now()
    });
    try {
      for (const board of selected) {
        if (abortFlag) break;
        results.push(await crawlBoard(board, opts));
        await setState({ results: [...results] });
        await sleep(DELAY_MS);
      }
      await setState({ finished: !abortFlag, stopped: abortFlag });
    } catch (e) {
      const message =
        e instanceof BlockedError
          ? '학교 방화벽이 요청을 차단했습니다. 잠시 뒤 다시 시도하세요.'
          : String(e?.message ?? e);
      await setState({ error: message });
    } finally {
      running = false;
      await setState({ running: false, current: null });
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'ping') {
      sendResponse({ ok: true, host: location.host, running });
    } else if (msg?.type === 'start') {
      if (running) {
        sendResponse({ ok: false, error: '이미 수집 중입니다.' });
      } else {
        run(msg.menus ?? [], { full: !!msg.opts?.full, newsLimit: Number(msg.opts?.newsLimit) || 300 });
        sendResponse({ ok: true });
      }
    } else if (msg?.type === 'stop') {
      abortFlag = true;
      sendResponse({ ok: true });
    }
    return false;
  });

  // 테스트용 노출 (확장 환경에서는 격리된 월드라 페이지에서 접근할 수 없음)
  globalThis.__kkuCrawler = { crawlBoard, parseBody, toNotice, run };
})();
