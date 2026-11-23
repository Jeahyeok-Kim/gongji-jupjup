// 공지 줍줍 수집기 - 팝업
// 위쪽: 자동 수집 상태와 "지금 수집"(백그라운드로 전체 사이트) · 아래 접힌 칸: 사이트 선택, 이 탭에서 직접 수집, 학기 자료, 고급 설정
const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);
const fmtTime = (t) => new Date(t).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const KIND_NAME = { notices: '공지', lectures: '강의 시간표', reference: '학교 기본 정보' };
const siteName = (host) => globalThis.KKU_SITES.find((s) => s.host === host)?.name ?? host;

let tab = null;
let currentHost = '';
let boards = [];
let pageReady = false;
let clearArmed = false;

// ---------- 저장된 자료 ----------
async function loadStored() {
  const all = await chrome.storage.local.get(null);
  const notices = [];
  let lectures = 0;
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith('n:')) notices.push(value);
    else if (key.startsWith('lec:')) lectures += value?.rows?.length ?? 0;
  }
  return { notices, lectures, hasRef: !!(all['ref:kku'] || all['ref:rule']) };
}

const shortDate = (ymd) => { const [, m, d] = String(ymd).split('-').map(Number); return `${m}월 ${d}일`; };

async function renderCounts() {
  const { notices, lectures, hasRef } = await loadStored();
  const s = await globalThis.kkuSettings();
  const since = globalThis.kkuSince(s.keepMonths);
  const inWindow = notices.filter((n) => !n?.date || String(n.date).slice(0, 10) >= since).length;
  $('keepInfo').textContent = `최근 ${s.keepMonths === 12 ? '1년' : s.keepMonths + '개월'} · ${shortDate(since)} 이후 글 ${inWindow.toLocaleString('ko-KR')}건`;
  const parts = [`공지 ${notices.length.toLocaleString('ko-KR')}건`];
  if (lectures) parts.push(`강의 ${lectures.toLocaleString('ko-KR')}과목`);
  parts.push(hasRef ? '학교 기본 정보 있음' : '학교 기본 정보 없음');
  $('counts').textContent = '모아 둔 자료: ' + parts.join(' · ');
  $('export').disabled = notices.length === 0;
  $('lecExport').disabled = lectures === 0;
  $('sendNow').disabled = notices.length === 0 && lectures === 0 && !hasRef;
}

// ---------- 위쪽 상태 ----------
async function renderHero() {
  const s = await globalThis.kkuSettings();
  const { job, lastRun, delivery, crawlState } = await chrome.storage.local.get(['job', 'lastRun', 'delivery', 'crawlState']);
  $('auto').checked = s.auto;
  $('autoHint').textContent = s.auto ? `${s.intervalHours}시간마다 새 글만 받아요` : '꺼져 있어요. 직접 눌러야 수집합니다';

  renderTitles(lastRun);
  if (lastRun) {
    const errs = (lastRun.results ?? []).filter((r) => r.error);
    $('lastRun').textContent = `${fmtTime(lastRun.at)} · 새 글 ${lastRun.added}건` + (errs.length ? ` · 실패 ${errs.length}곳` : '');
    $('lastRun').title = (lastRun.results ?? []).map((r) => `${siteName(r.host)}: ${r.error ?? (r.stopped ? '중지' : `새 글 ${r.added}건`)}`).join('\n');
  } else {
    $('lastRun').textContent = '아직 없음';
  }

  if (delivery?.items?.length) {
    const text = delivery.items.map((it) => {
      const how = it.via === 'server' ? '서버로 보냄' : it.via === 'download' ? '다운로드 폴더에 저장' : `실패(${it.error})`;
      return `${KIND_NAME[it.kind]} ${how}`;
    }).join(', ');
    $('delivery').textContent = `${fmtTime(delivery.at)} · ${text}`;
  } else {
    $('delivery').textContent = '아직 없음';
  }

  const running = !!job;
  $('collectNow').hidden = running;
  $('cancel').hidden = !running;
  $('progress').hidden = !running;
  if (running) {
    const total = job.results.length + job.queue.length + (job.host ? 1 : 0);
    const done = job.results.length;
    const p = crawlState?.host === job.host && crawlState?.running ? crawlState : null;
    const detail = p?.current ? ` · ${p.current}${p.progress?.total ? ` ${p.progress.seen}/${p.progress.total}` : ''}` : '';
    $('progressText').textContent = job.host ? `${siteName(job.host)} 수집 중 (${done + 1}/${total})${detail}` : '다음 사이트를 여는 중';
    $('progressBar').style.width = `${Math.round(((done + (p ? 0.5 : 0.1)) / Math.max(1, total)) * 100)}%`;
  }
}

// 마지막 수집에서 새로 받은 글 제목 (최대 5개)
function renderTitles(lastRun) {
  const titles = lastRun?.titles ?? [];
  $('titlesBox').hidden = titles.length === 0;
  if (!titles.length) return;
  $('titlesHead').textContent = `새로 받은 공지 ${lastRun.added}건`;
  const ul = $('titles');
  ul.replaceChildren(...titles.slice(0, 5).map((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    li.title = t;
    return li;
  }));
  if (lastRun.added > 5) {
    const li = document.createElement('li');
    li.className = 'more';
    li.textContent = `외 ${lastRun.added - Math.min(5, titles.length)}건`;
    ul.append(li);
  }
}

const shortTime = (s) => (s || '').replace(/^\d{4}-/, '').replace('-', '/');

// 서버 상태: 켜짐/꺼짐, 처리 중인 단계와 진행(12/40), 웹 앱 데이터 건수·기준 시각
let serverTimer = null;
async function renderServer() {
  const res = await send({ type: 'pingServer' }).catch(() => ({ ok: false }));
  const info = res?.info ?? {};
  const dot = document.querySelector('#server .dot');
  const busy = !!(res?.ok && (info.busy || info.waiting));
  dot.className = 'dot ' + (res?.ok ? (busy ? 'busy' : 'on') : 'off');
  $('serverText').textContent = res?.ok ? '켜짐' : '꺼짐 (파일로 저장해요)';
  $('openApp').disabled = !res?.ok;

  let text = '서버가 켜지면 보여요';
  const pr = info.progress;
  $('appProgress').hidden = !(res?.ok && info.busy && pr?.total);
  if (res?.ok) {
    if (info.busy) {
      text = pr?.total ? `AI 정리 중 · ${pr.stage} ${pr.done}/${pr.total}` : `처리 중${pr?.stage ? ' · ' + pr.stage : ''}`;
      if (pr?.total) $('appBar').style.width = `${Math.round((pr.done / pr.total) * 100)}%`;
    } else if (info.waiting) {
      text = '곧 정리를 시작해요 (1분 안)';
    } else if (info.data) {
      text = `공지 ${info.data.count.toLocaleString('ko-KR')}건 · ${shortTime(info.data.generatedAt)} 기준`;
      if (info.last && info.last.code !== 0) text += ' · 마지막 처리 실패';
    } else {
      text = '아직 만든 데이터가 없어요';
    }
  }
  $('appInfo').textContent = text;
  $('appInfo').title = info.last ? `마지막 처리: ${info.last.at} (${info.last.code === 0 ? '성공' : '종료 코드 ' + info.last.code}) · 기록 logs/${info.last.log}` : '';
  // 처리 중이면 팝업을 열어 둔 동안 2초마다 다시 확인
  clearTimeout(serverTimer);
  if (busy) serverTimer = setTimeout(renderServer, 2000);
}

function heroStatus(text, isError) {
  const el = $('heroStatus');
  el.className = 'status' + (isError ? ' error' : '');
  el.textContent = text ?? '';
}

// ---------- 수집할 사이트 ----------
async function renderSites() {
  const s = await globalThis.kkuSettings();
  const box = $('sites');
  box.replaceChildren();
  for (const site of globalThis.KKU_SITES) {
    const label = document.createElement('label');
    label.className = 'check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!s.sites[site.host];
    input.addEventListener('change', async () => {
      const cur = await globalThis.kkuSettings();
      await saveSettings({ sites: { ...cur.sites, [site.host]: input.checked } });
    });
    const name = document.createElement('span');
    name.textContent = site.name;
    const note = document.createElement('small');
    note.textContent = site.login ? '로그인 필요' : `게시판 ${(globalThis.KKU_BOARDS[site.host] ?? []).filter((b) => !b.off).length}개`;
    label.append(input, name, note);
    box.append(label);
  }
}

async function saveSettings(patch) {
  const cur = await globalThis.kkuSettings();
  await chrome.storage.local.set({ settings: { ...cur, ...patch } });
}

// ---------- 이 탭에서 직접 수집 ----------
async function renderBoards() {
  const { notices } = await loadStored();
  const counts = new Map();
  for (const n of notices) counts.set(`${n.host}:${n.menu}`, (counts.get(`${n.host}:${n.menu}`) ?? 0) + 1);
  const box = $('boards');
  box.replaceChildren();
  for (const b of boards) {
    const label = document.createElement('label');
    label.className = 'board';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = String(b.menu);
    input.checked = !b.off;
    const name = document.createElement('span');
    name.textContent = b.name;
    if (b.note) name.title = b.note;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${counts.get(`${currentHost}:${b.menu}`) ?? 0}건`;
    label.append(input, name, count);
    box.append(label);
  }
}

function renderTabState(state) {
  const status = $('status');
  status.className = 'status';
  const mine = state && state.host === currentHost ? state : null;
  const running = !!mine?.running;
  $('start').disabled = running || !pageReady;
  $('stop').hidden = !running;
  if (!mine) { status.textContent = pageReady ? '' : '이 탭을 새로고침(F5)한 뒤 다시 열어 주세요.'; return; }
  if (mine.error) { status.classList.add('error'); status.textContent = mine.error; return; }
  const lines = [];
  for (const r of mine.results ?? []) lines.push(r.skipped ? `${r.name}: ${r.skipped}` : `${r.name}: 새 글 ${r.added}건 (확인 ${r.seen}건)`);
  if (running && mine.current) {
    const p = mine.progress;
    lines.push(p?.total ? `수집 중: ${mine.current} ${p.seen}/${p.total}` : `수집 중: ${mine.current}`);
  }
  if (mine.finished) lines.push('완료했습니다.');
  if (mine.stopped) lines.push('중지했습니다.');
  status.textContent = lines.join('\n');
}

async function pingPage() {
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'ping' });
    return !!res?.ok;
  } catch {
    return false;
  }
}

async function onStart() {
  const menus = [...document.querySelectorAll('#boards input:checked')].map((i) => Number(i.value));
  if (menus.length === 0) { $('status').textContent = '수집할 게시판을 선택하세요.'; return; }
  const s = await globalThis.kkuSettings();
  const opts = { full: $('full').checked, newsLimit: Number($('newsLimit').value) || 300, since: globalThis.kkuSince(s.keepMonths) };
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'start', menus, opts });
    if (!res?.ok) $('status').textContent = res?.error ?? '시작하지 못했습니다.';
  } catch {
    $('status').textContent = '이 탭을 새로고침(F5)한 뒤 다시 열어 주세요.';
  }
}

async function onStop() {
  try { await chrome.tabs.sendMessage(tab.id, { type: 'stop' }); } catch { /* 탭이 닫힌 경우 무시 */ }
}

// ---------- 강의 시간표 ----------
async function renderLectures() {
  const all = await chrome.storage.local.get(null);
  const terms = Object.entries(all).filter(([k]) => k.startsWith('lec:')).map(([, v]) => v);
  $('lecSummary').textContent = terms.length
    ? terms.map((t) => `${t.year}년 ${t.term === 'B01011' ? '1학기' : t.term === 'B01012' ? '2학기' : t.term} · ${t.rows.length}개 과목 (${fmtTime(t.collectedAt)})`).join('\n')
    : '아직 받은 강의 시간표가 없습니다.';
  const st = all['kis:status'];
  const box = $('lecStatus');
  box.className = 'status' + (st?.state === 'error' ? ' error' : '');
  box.textContent = st ? st.message : '';
}

// ---------- 지우기 ----------
async function onClear() {
  if (!clearArmed) {
    clearArmed = true;
    $('clear').textContent = '정말 지울까요? 한 번 더 누르세요';
    setTimeout(() => { clearArmed = false; $('clear').textContent = '모은 자료 지우기'; }, 4000);
    return;
  }
  clearArmed = false;
  $('clear').textContent = '모은 자료 지우기';
  // 설정은 남기고 모은 자료와 진행 기록만 지운다
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => /^(n:|s:|lec:|ref:|auto:|kis:)/.test(k) || ['crawlState', 'refState', 'lastRun', 'delivery', 'pending', 'badgeSeen'].includes(k));
  await chrome.storage.local.remove(keys);
  await refreshAll();
}

async function refreshAll() {
  await Promise.all([renderHero(), renderCounts(), renderLectures()]);
  if (boards.length) await renderBoards();
}

async function init() {
  $('ver').textContent = 'v' + globalThis.KKU_VERSION;
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  tab = active ?? null;
  try { currentHost = new URL(tab?.url ?? '').host; } catch { currentHost = ''; }
  boards = globalThis.KKU_BOARDS[currentHost] ?? [];
  $('site').textContent = currentHost && (boards.length || ['rule.konkuk.ac.kr', 'kis.kku.ac.kr'].includes(currentHost)) ? currentHost : '학교 사이트를 열지 않아도 수집해요';

  const s = await globalThis.kkuSettings();
  $('interval').value = String(s.intervalHours);
  $('keepMonths').value = String(s.keepMonths === 12 ? 12 : 6);
  $('keepMonths').addEventListener('change', async () => {
    await saveSettings({ keepMonths: Number($('keepMonths').value) });
    // 다음 전달 때 새 보관 기간으로 다시 보내도록 표시 (서버가 그 기간만큼 웹 앱에 남긴다)
    const { pending = {} } = await chrome.storage.local.get('pending');
    await chrome.storage.local.set({ pending: { ...pending, notices: true } });
    await renderCounts();
  });
  $('serverUrl').value = s.server;
  $('notify').checked = s.notify !== false;
  $('notify').addEventListener('change', async () => { await saveSettings({ notify: $('notify').checked }); });
  $('openApp').addEventListener('click', async () => { await send({ type: 'openApp' }); window.close(); });

  $('auto').addEventListener('change', async () => { await saveSettings({ auto: $('auto').checked }); });
  $('interval').addEventListener('change', async () => { await saveSettings({ intervalHours: Number($('interval').value) }); });
  $('serverUrl').addEventListener('change', async () => { await saveSettings({ server: $('serverUrl').value.trim() }); await renderServer(); });
  $('collectNow').addEventListener('click', async () => {
    heroStatus('');
    const res = await send({ type: 'collectNow' });
    if (!res?.ok) heroStatus(res?.error ?? '시작하지 못했습니다.', true);
  });
  $('cancel').addEventListener('click', () => send({ type: 'cancel' }));
  $('sendNow').addEventListener('click', async () => {
    heroStatus('보내는 중…');
    const res = await send({ type: 'deliverNow' });
    const items = res?.delivery?.items ?? [];
    heroStatus(items.length ? '' : '보낼 자료가 없습니다.');
    await renderServer();
  });
  $('export').addEventListener('click', () => send({ type: 'export', kind: 'notices' }));
  $('lecExport').addEventListener('click', () => send({ type: 'export', kind: 'lectures' }));
  $('clear').addEventListener('click', onClear);

  await renderSites();
  await refreshAll();
  renderServer();
  send({ type: 'seen' }).catch(() => {});

  await initReference(tab, currentHost);      // 학교 기본 정보 (reference-popup.js)

  if (currentHost === 'kis.kku.ac.kr') {
    $('kis').hidden = false;
    $('semBox').open = true;
    $('lecFetch').addEventListener('click', async () => {
      try { await chrome.tabs.sendMessage(tab.id, { type: 'kisFetch' }); } catch { $('lecStatus').textContent = '이 탭을 새로고침(F5)한 뒤 다시 눌러 주세요.'; }
    });
  }
  if (currentHost === 'rule.konkuk.ac.kr') $('semBox').open = true;

  if (boards.length) {
    $('tabBox').hidden = false;
    $('start').addEventListener('click', onStart);
    $('stop').addEventListener('click', onStop);
    pageReady = await pingPage();
    const { crawlState } = await chrome.storage.local.get('crawlState');
    renderTabState(crawlState ?? null);
  }

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes.job || changes.lastRun || changes.delivery || changes.settings || changes.crawlState) await renderHero();
    if (changes.crawlState && boards.length) {
      renderTabState(changes.crawlState.newValue ?? null);
      if (changes.crawlState.newValue && !changes.crawlState.newValue.running) { await renderBoards(); await renderCounts(); }
    }
    if (changes.lastRun || changes.delivery) await renderCounts();
    if (Object.keys(changes).some((k) => k.startsWith('lec:') || k === 'kis:status')) { await renderLectures(); await renderCounts(); }
    if (changes.settings) await renderSites();
  });
}

init();
