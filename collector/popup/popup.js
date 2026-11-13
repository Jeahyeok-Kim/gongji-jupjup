// KU 공지 수집기 - 팝업
const $ = (id) => document.getElementById(id);

let tab = null;
let currentHost = '';
let boards = [];
let pageReady = false;
let clearArmed = false;

async function loadStored() {
  const all = await chrome.storage.local.get(null);
  const notices = [];
  const syncs = [];
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith('n:')) notices.push(value);
    else if (key.startsWith('s:')) syncs.push(value);
  }
  return { notices, syncs };
}

function countByBoard(notices) {
  const counts = new Map();
  for (const n of notices) {
    const k = `${n.host}:${n.menu}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

async function renderBoards() {
  const { notices } = await loadStored();
  const counts = countByBoard(notices);
  const host = currentHost;
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
    count.textContent = `저장 ${counts.get(`${host}:${b.menu}`) ?? 0}건`;
    label.append(input, name, count);
    box.append(label);
  }
}

async function renderSummary() {
  const { notices, syncs } = await loadStored();
  const last = syncs.reduce((m, s) => Math.max(m, s.lastSyncAt ?? 0), 0);
  $('summary').textContent = notices.length
    ? `저장된 공지 ${notices.length}건 · 마지막 수집 ${new Date(last).toLocaleString('ko-KR')}`
    : '저장된 공지가 없습니다.';
  $('export').disabled = notices.length === 0;
}

function renderState(state) {
  const status = $('status');
  status.className = 'status';
  const running = !!state?.running;
  $('start').disabled = running || !pageReady;
  $('stop').hidden = !running;
  if (!state) {
    status.textContent = '';
    return;
  }
  if (state.error) {
    status.classList.add('error');
    status.textContent = state.error;
    return;
  }
  const lines = [];
  for (const r of state.results ?? []) {
    lines.push(r.skipped ? `- ${r.name}: ${r.skipped}` : `- ${r.name}: 신규 ${r.added}건 (확인 ${r.seen}건)`);
  }
  if (running && state.current) {
    const p = state.progress;
    lines.push(p ? `수집 중: ${state.current} ${p.seen}/${p.total}` : `수집 중: ${state.current}`);
  }
  if (state.finished) lines.push('완료되었습니다.');
  if (state.stopped) lines.push('중지되었습니다.');
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
  if (menus.length === 0) {
    $('status').textContent = '수집할 게시판을 선택하세요.';
    return;
  }
  const opts = { full: $('full').checked, newsLimit: Number($('newsLimit').value) || 300 };
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'start', menus, opts });
    if (!res?.ok) $('status').textContent = res?.error ?? '시작하지 못했습니다.';
  } catch {
    $('status').textContent = '이 탭을 새로고침(F5)한 뒤 다시 열어 주세요.';
  }
}

async function onStop() {
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'stop' });
  } catch {
    /* 탭이 닫힌 경우 무시 */
  }
}

async function onExport() {
  const { notices, syncs } = await loadStored();
  notices.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.bbsSeq - a.bbsSeq));
  const payload = {
    schema: 1,
    generator: 'kku-collector 0.3.0',
    generatedAt: new Date().toISOString(),
    boards: syncs,
    count: notices.length,
    notices
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kku-notices-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function onClear() {
  if (!clearArmed) {
    clearArmed = true;
    $('clear').textContent = '정말 삭제? 한 번 더 누르세요';
    setTimeout(() => {
      clearArmed = false;
      $('clear').textContent = '저장 데이터 삭제';
    }, 4000);
    return;
  }
  clearArmed = false;
  $('clear').textContent = '저장 데이터 삭제';
  await chrome.storage.local.clear();
  await renderBoards();
  await renderSummary();
  renderState(null);
}

async function init() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  tab = active ?? null;
  let host = '';
  try {
    host = new URL(tab?.url ?? '').host;
  } catch {
    host = '';
  }
  currentHost = host;
  boards = globalThis.KKU_BOARDS[host] ?? [];
  $('site').textContent = host;

  $('export').addEventListener('click', onExport);
  $('clear').addEventListener('click', onClear);
  await renderSummary();

  await initReference(tab, host);   // 학교 기본 정보 (reference-popup.js)

  if (boards.length === 0) {
    if (host !== 'rule.konkuk.ac.kr') $('unsupported').hidden = false;
    return;
  }

  $('collect').hidden = false;
  $('start').addEventListener('click', onStart);
  $('stop').addEventListener('click', onStop);
  await renderBoards();

  pageReady = await pingPage();
  if (!pageReady) $('status').textContent = '이 탭을 새로고침(F5)한 뒤 다시 열어 주세요.';

  const { crawlState } = await chrome.storage.local.get('crawlState');
  renderState(crawlState ?? null);
  if (!pageReady) $('start').disabled = true;

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes.crawlState) {
      renderState(changes.crawlState.newValue ?? null);
      if (changes.crawlState.newValue && !changes.crawlState.newValue.running) {
        await renderBoards();
        await renderSummary();
      }
    }
  });
}

init();
