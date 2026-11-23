// 공지 줍줍 수집기 - 이음교육시스템(im.kku.ac.kr) 콘텐츠 스크립트
// 내가 이음에 로그인한 브라우저 탭 안에서, 평소 게시판을 볼 때와 같은 요청으로 공지 글을 읽어 저장합니다.
// - 로그인 정보(쿠키)는 브라우저가 알아서 붙이며, 확장은 읽지도 저장하지도 않습니다.
// - 화면 위쪽의 내 이름·학번, 글 작성자는 저장하지 않습니다.
// - 첨부파일은 파일 이름만 적어 두고 내려받지 않습니다.
// - 저장한 글에는 private:true 표시가 붙고, 파이프라인은 기본적으로 이 글을 공개 데이터에서 제외합니다.
(() => {
  const BOARDS = globalThis.KKU_BOARDS?.[location.host] ?? [];
  const DELAY_MS = 500;
  const MAX_PAGES = 30;
  const MAX_TEXT = 8000;
  const LIST_PATH = '/ko/community/community/notice/list/';

  let running = false;
  let abortFlag = false;
  class LoginError extends Error {}

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function setState(patch) {
    const { crawlState = {} } = await chrome.storage.local.get('crawlState');
    await chrome.storage.local.set({ crawlState: { ...crawlState, ...patch, updatedAt: Date.now() } });
  }

  async function getHtml(path, tries = 3) {
    let last;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(path, { credentials: 'same-origin' });
        if (res.redirected && /login|sso/i.test(res.url)) throw new LoginError();
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (e) {
        if (e instanceof LoginError) throw e;
        last = e;
        await sleep(800 * (i + 1));
      }
    }
    throw last;
  }

  const toDoc = (html) => new DOMParser().parseFromString(html, 'text/html');
  const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const dateOf = (el) => String(el?.getAttribute('datetime') || el?.textContent || '').trim().slice(0, 10).replace(/\./g, '-');
  const idOf = (href) => (String(href ?? '').match(/\/notice\/view\/(\d+)/) || [])[1] || null;

  // 목록 한 쪽 -> [{id, subject, date, hits, pinned}]
  function parseList(html) {
    const doc = toDoc(html);
    const rows = [...doc.querySelectorAll('ul.black > li.tbody, li.tbody')];
    const out = [];
    for (const li of rows) {
      const a = li.querySelector('span.title a[href*="/notice/view/"]') || li.querySelector('a[href*="/notice/view/"]');
      const id = idOf(a?.getAttribute('href'));
      if (!id) continue;
      out.push({
        id,
        subject: clean(a.textContent),
        date: dateOf(li.querySelector('span.reg_date time, time')),
        hits: Number(clean(li.querySelector('span.hit')?.textContent).replace(/\D/g, '')) || 0,
        pinned: li.classList.contains('notice')
      });
    }
    return out;
  }

  // 본문 HTML -> 줄바꿈이 보존된 텍스트
  function bodyText(el) {
    if (!el) return '';
    const copy = el.cloneNode(true);
    copy.querySelectorAll('script,style').forEach((x) => x.remove());
    copy.querySelectorAll('br').forEach((x) => x.replaceWith('\n'));
    copy.querySelectorAll('p,div,tr,li,h1,h2,h3,h4,h5,h6').forEach((x) => x.append('\n'));
    copy.querySelectorAll('td,th').forEach((x) => x.append(' | '));
    return (copy.textContent ?? '')
      .replace(/ /g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, MAX_TEXT);
  }

  // 글 보기 화면 -> {subject, date, hits, text, attachments}. 작성자·내 정보는 읽지 않는다.
  function parseDetail(html) {
    const doc = toDoc(html);
    const post = doc.querySelector('article[data-role="post"]') || doc;
    return {
      subject: clean(post.querySelector('h5')?.textContent),
      date: dateOf(post.querySelector('li.date time')),
      hits: Number(clean(post.querySelector('li.hit')?.textContent).replace(/\D/g, '')) || 0,
      text: bodyText(post.querySelector('div.content')),
      attachments: [...post.querySelectorAll('div[data-module="attachment"] a.file')]
        .map((a) => clean(a.textContent))
        .filter(Boolean)
        .slice(0, 10)
    };
  }

  function toNotice(item, detail, board) {
    return {
      id: `im-notice-${item.id}`,
      host: location.host,
      site: 0,
      board: 0,
      menu: board.menu,
      boardName: board.name,
      bbsSeq: Number(item.id),
      subject: detail.subject || item.subject,
      date: detail.date || item.date,
      dept: null,
      hits: detail.hits || item.hits,
      pinned: item.pinned,
      isNew: false,
      text: detail.text,
      imgs: [],
      fileCnt: 0,
      fileName: detail.attachments[0] ?? null,
      files: [],
      attachments: detail.attachments,
      private: true,
      link: `${location.origin}/ko/community/community/notice/view/${item.id}?p=1`,
      externalLink: null,
      collectedAt: Date.now()
    };
  }

  const storageKey = (n) => `n:${n.id}`;

  async function crawlBoard(board, opts) {
    let page = 1;
    let seen = 0;
    let added = 0;
    const done = new Set();
    let stopped = false;
    const titles = [];

    const since = opts.since || '';            // 보관 기간 첫날 (이보다 오래된 글은 본문을 받지 않고 멈춤)
    while (!abortFlag && page <= MAX_PAGES && !stopped) {
      const list = parseList(await getHtml(`${LIST_PATH}${page}`));
      const tooOld = (it) => !!since && !it.pinned && !!it.date && it.date < since;
      const items = list.filter((it) => !done.has(it.id) && !tooOld(it));
      const older = list.some(tooOld);
      // 끝: 고정글만 반복되거나(새 글 없음) 남은 글이 모두 보관 기간보다 오래됨
      if (list.length === 0 || items.length === 0) break;
      items.forEach((it) => done.add(it.id));

      const known = await chrome.storage.local.get(items.map((it) => `n:im-notice-${it.id}`));
      let freshInPage = 0;
      for (const it of items) {
        if (abortFlag) break;
        seen += 1;
        if (!opts.full && `n:im-notice-${it.id}` in known) continue;
        const detail = parseDetail(await getHtml(`/ko/community/community/notice/view/${it.id}?p=1`));
        const notice = toNotice(it, detail, board);
        await chrome.storage.local.set({ [storageKey(notice)]: notice });
        added += 1;
        freshInPage += 1;
        if (titles.length < 5 && notice.subject) titles.push(notice.subject);
        await setState({ current: board.name, progress: { menu: board.menu, seen, total: null, added } });
        await sleep(DELAY_MS);
      }
      // 증분 수집: 한 쪽이 전부 이미 아는 글(고정글 제외)이면 더 볼 필요가 없다.
      const normal = items.filter((it) => !it.pinned);
      if (!opts.full && freshInPage === 0 && normal.length > 0) stopped = true;
      if (older) stopped = true;                          // 보관 기간보다 오래된 글까지 왔다
      page += 1;
      await sleep(DELAY_MS);
    }

    await chrome.storage.local.set({
      [`s:im:${board.menu}`]: { host: location.host, menu: board.menu, name: board.name, total: seen, lastSyncAt: Date.now() }
    });
    return { menu: board.menu, name: board.name, total: seen, seen, added, titles };
  }

  async function run(menus, opts) {
    running = true;
    abortFlag = false;
    const selected = BOARDS.filter((b) => menus.includes(b.menu));
    const results = [];
    await setState({
      running: true, finished: false, stopped: false, error: null,
      host: location.host, current: null, progress: null, results, startedAt: Date.now()
    });
    try {
      for (const board of selected) {
        if (abortFlag) break;
        results.push(await crawlBoard(board, opts));
        await setState({ results: [...results] });
      }
      await setState({ finished: !abortFlag, stopped: abortFlag });
    } catch (e) {
      await setState({
        error: e instanceof LoginError ? '이음에 로그인한 뒤 다시 시도하세요.' : String(e?.message ?? e)
      });
    } finally {
      running = false;
      await setState({ running: false, current: null });
    }
    return results;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'ping') {
      sendResponse({ ok: true, host: location.host, running });
    } else if (msg?.type === 'start') {
      if (running) sendResponse({ ok: false, error: '이미 수집 중입니다.' });
      else {
        run(msg.menus ?? [], { full: !!msg.opts?.full, since: String(msg.opts?.since || '') });
        sendResponse({ ok: true });
      }
    } else if (msg?.type === 'stop') {
      abortFlag = true;
      sendResponse({ ok: true });
    }
    return false;
  });


  // 서비스 워커(background.js)에 "이 탭이 준비됐다"고 알린다. 자동 수집 차례면(백그라운드로 연 탭이거나, 수집할 때가 된 평소 방문)
  // 워커가 run 을 돌려주고, 이 탭에서 새 글만 받는다. 끝나면 워커가 결과를 내 컴퓨터로 전달한다.
  async function hello() {
    if (window !== window.top || running || BOARDS.length === 0) return;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'hello', host: location.host });
      if (res?.run && !running) await run(BOARDS.filter((b) => !b.off).map((b) => b.menu), { full: false, since: String(res.since || '') });
    } catch {
      /* 확장을 다시 불러온 직후 등: 다음 방문 때 다시 시도 */
    }
  }
  setTimeout(hello, 1500);

  globalThis.__imCrawler = { parseList, parseDetail, toNotice, crawlBoard };
})();
