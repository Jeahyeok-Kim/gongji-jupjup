// 공지 줍줍 수집기 - 서비스 워커 (백그라운드)
// 하는 일
//  1) 정해진 간격(기본 6시간)마다, 또는 팝업의 "지금 수집"을 누르면: 학교 사이트를 백그라운드 탭으로 하나씩 열어
//     그 탭의 콘텐츠 스크립트가 새 글만 받게 하고, 끝나면 탭을 닫는다. (평소에 학교 사이트를 열었을 때도 때가 됐으면 그 탭에서 받는다)
//  2) 새로 모인 자료(공지·강의 시간표·학교 기본 정보)를 내 컴퓨터의 수신 서버(pipeline/receiver.py)로 보낸다.
//     서버가 꺼져 있으면 다운로드 폴더에 kku-종류-날짜.json 으로 저장한다 (run_pipeline.bat 이 찾아 쓴다).
//  3) 자동 수집으로 새 공지를 받으면 제목 몇 개를 알림으로 보여 주고, 서버가 AI 정리를 끝내 웹 앱에 반영되면 한 번 더 알린다.
// 서비스 워커는 30초쯤 쉬면 꺼지므로 진행 상태는 전부 chrome.storage.local 에 둔다 (job · lastRun · delivery · pending).
importScripts('config.js');

const JOB_MAX_MS = 25 * 60 * 1000;        // 한 번의 수집이 이보다 오래 걸리면 멈춘 것으로 본다
const SITE_MAX_MS = 15 * 60 * 1000;       // 사이트 하나에 쓰는 최대 시간
const KINDS = ['notices', 'lectures', 'reference'];
const WATCH_MAX_MS = 60 * 60 * 1000;      // 서버 처리 완료를 기다리는 최대 시간
const NOTE_ID = 'gongji-new';

const getLocal = (keys) => chrome.storage.local.get(keys);
const setLocal = (obj) => chrome.storage.local.set(obj);
const errText = (e) => String(e?.message ?? e);

// 작업 상태를 바꾸는 일은 한 번에 하나씩 (탭 닫힘·수집 끝·감시 알람이 동시에 와도 꼬이지 않게)
let chain = Promise.resolve();
const serial = (fn) => (chain = chain.then(fn, fn).catch((e) => console.warn('공지 줍줍 수집기:', e)));

// ---------- 예약 ----------
async function schedule() {
  const s = await kkuSettings();
  await chrome.alarms.clear('auto');
  if (s.auto) await chrome.alarms.create('auto', { delayInMinutes: 1, periodInMinutes: s.intervalHours * 60 });
}

async function isDue(host) {
  const s = await kkuSettings();
  const key = host ? `auto:${host}` : 'lastRun';
  const got = (await getLocal(key))[key];
  const last = host ? got ?? 0 : got?.at ?? 0;
  return Date.now() - last >= s.intervalHours * 3600000 * 0.9;
}

// ---------- 배지 ----------
async function refreshBadge() {
  const { job, lastRun, badgeSeen } = await getLocal(['job', 'lastRun', 'badgeSeen']);
  let text = '';
  let color = '#14804a';
  if (job) text = '…';
  else if (lastRun?.results?.some((r) => r.error)) { text = '!'; color = '#c5362e'; }
  else if (lastRun?.added > 0 && (badgeSeen ?? 0) < lastRun.at) text = lastRun.added > 99 ? '99+' : String(lastRun.added);
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
}

// ---------- 수집 작업 ----------
async function startJob(reason) {
  const { job } = await getLocal('job');
  if (job && Date.now() - job.startedAt < JOB_MAX_MS) return { ok: false, error: '이미 수집 중입니다.' };
  const s = await kkuSettings();
  const queue = KKU_SITES.filter((x) => s.sites[x.host]).map((x) => x.host);
  if (queue.length === 0) return { ok: false, error: '수집할 사이트를 하나 이상 켜 주세요.' };
  await setLocal({ job: { reason, queue, host: null, tabId: null, keepTab: false, started: false, startedAt: Date.now(), siteStartedAt: 0, results: [] } });
  await refreshBadge();
  await nextSite();
  return { ok: true };
}

async function nextSite() {
  const { job } = await getLocal('job');
  if (!job) return;
  const host = job.queue.shift();
  if (!host) { await finishJob(job); return; }
  const site = KKU_SITES.find((x) => x.host === host);
  try {
    const tab = await chrome.tabs.create({ url: site.url, active: false });
    Object.assign(job, { host, tabId: tab.id, keepTab: false, started: false, siteStartedAt: Date.now() });
    await setLocal({ job });
    await chrome.alarms.create('watchdog', { delayInMinutes: 2 });
  } catch (e) {
    job.results.push({ host, added: 0, error: errText(e) });
    await setLocal({ job });
    await nextSite();
  }
}

// 한 사이트가 끝남 (콘텐츠 스크립트가 crawlState 를 running:false 로 바꿨을 때)
async function siteDone(cs) {
  const added = (cs.results ?? []).reduce((sum, r) => sum + (r.added || 0), 0);
  const titles = (cs.results ?? []).flatMap((r) => r.titles ?? []).slice(0, 8);
  await setLocal({ [`auto:${cs.host}`]: Date.now() });
  if (added > 0) await markPending('notices', false);
  const { job } = await getLocal('job');
  if (!job || job.host !== cs.host) {
    // 팝업의 "이 탭에서 직접 수집"으로 받은 경우: 작업 없이 전달만 예약
    if (added > 0) await chrome.alarms.create('deliver', { delayInMinutes: 0.5 });
    return;
  }
  job.results.push({ host: cs.host, added, titles, error: cs.error ?? null, stopped: !!cs.stopped });
  await releaseTab(job);
  await nextSite();
}

// 작업에서 탭을 떼어 낸 뒤(저장 먼저) 닫는다: 닫힘 이벤트가 이 탭을 '사용자가 닫은 탭'으로 오해하지 않게
async function releaseTab(job) {
  const { tabId, keepTab } = job;
  Object.assign(job, { host: null, tabId: null });
  await setLocal({ job });
  if (!keepTab && tabId != null) {
    try { await chrome.tabs.remove(tabId); } catch { /* 이미 닫힘 */ }
  }
}

async function failSite(message) {
  const { job } = await getLocal('job');
  if (!job || !job.host) return;
  job.results.push({ host: job.host, added: 0, error: message });
  await releaseTab(job);
  await nextSite();
}

async function finishJob(job) {
  await chrome.alarms.clear('watchdog');
  const added = job.results.reduce((sum, r) => sum + (r.added || 0), 0);
  const titles = job.results.flatMap((r) => r.titles ?? []).slice(0, 8);
  await setLocal({ lastRun: { at: Date.now(), reason: job.reason, results: job.results, added, titles } });
  await chrome.storage.local.remove('job');
  const { pending = {} } = await getLocal('pending');
  let delivery = null;
  if (KINDS.some((k) => pending[k])) delivery = await deliver(false);
  await refreshBadge();
  // 직접 누른 수집은 팝업을 보고 있으니 알리지 않는다
  if (added > 0 && job.reason !== 'manual') await notifyNew(added, titles, delivery);
}

// ---------- 알림 ----------
async function notifyNew(added, titles, delivery) {
  const s = await kkuSettings();
  if (!s.notify || !chrome.notifications) return;
  const toServer = delivery?.items?.some((it) => it.kind === 'notices' && it.via === 'server');
  const lines = titles.slice(0, 3).map((t) => '· ' + (t.length > 38 ? t.slice(0, 37) + '…' : t));
  if (added > lines.length && lines.length) lines.push(`외 ${added - lines.length}건`);
  try {
    await chrome.notifications.create(NOTE_ID, {
      type: 'basic', iconUrl: 'icons/icon-128.png', priority: 0,
      title: `새 공지 ${added}건을 받았어요`,
      message: lines.join('\n') || '팝업에서 확인하세요.',
      contextMessage: toServer ? '내 컴퓨터에서 AI가 정리하는 중 · 끝나면 다시 알려 드려요' : '공지 줍줍 수집기'
    });
  } catch (e) { console.warn('공지 줍줍 수집기: 알림 실패', e); }
  if (toServer) await watchServer();
}

// 서버가 받은 자료를 다 처리할 때까지 1분마다 확인 → 웹 앱에 반영되면 알림을 바꾼다
async function watchServer() {
  const ping = await pingServer();
  await setLocal({ serverWatch: { since: ping.info?.runs ?? 0, at: Date.now() } });
  await chrome.alarms.create('serverWatch', { delayInMinutes: 1, periodInMinutes: 1 });
}

async function checkServerWatch() {
  const { serverWatch } = await getLocal('serverWatch');
  const stop = async () => { await chrome.alarms.clear('serverWatch'); await chrome.storage.local.remove('serverWatch'); };
  if (!serverWatch || Date.now() - serverWatch.at > WATCH_MAX_MS) { await stop(); return; }
  const ping = await pingServer();
  if (!ping.ok) return;                                   // 잠깐 꺼졌을 수 있으니 다음에 다시
  const info = ping.info;
  if (info.busy || info.waiting || (info.runs ?? 0) <= serverWatch.since) return;
  await stop();
  const ok = info.last?.code === 0;
  try {
    await chrome.notifications.create(NOTE_ID, {
      type: 'basic', iconUrl: 'icons/icon-128.png', priority: 0,
      title: ok ? '웹 앱에 새 공지를 반영했어요' : '공지 정리 중 문제가 있었어요',
      message: ok ? `지금 웹 앱에 공지 ${info.data?.count ?? ''}건이 있어요. 눌러서 열기` : `서버 기록(logs/${info.last?.log ?? ''})을 확인해 주세요.`,
      contextMessage: '공지 줍줍'
    });
  } catch { /* 알림이 꺼져 있음 */ }
}

// 웹 앱 열기: 내 컴퓨터 서버가 켜져 있으면 방금 갱신된 웹 앱을, 아니면 팝업 화면을 연다
async function openWebApp() {
  const s = await kkuSettings();
  const ping = await pingServer();
  const url = ping.ok ? `${s.server.replace(/\/+$/, '')}/#/home` : chrome.runtime.getURL('popup/popup.html');
  await chrome.tabs.create({ url });
}

async function cancelJob() {
  const { job } = await getLocal('job');
  if (!job) return;
  if (job.tabId != null) {
    try { await chrome.tabs.sendMessage(job.tabId, { type: 'stop' }); } catch { /* 탭이 없음 */ }
  }
  if (job.host) job.results.push({ host: job.host, added: 0, error: null, stopped: true });
  job.queue = [];
  await releaseTab(job);
  await finishJob(job);
}

// 멈춘 사이트 정리: 응답이 없거나(로그인 화면 등) 너무 오래 걸리면 다음 사이트로 넘어간다
async function watchdog() {
  const { job, crawlState } = await getLocal(['job', 'crawlState']);
  if (!job) return;
  if (!job.host) { await nextSite(); return; }
  const now = Date.now();
  if (!job.started) { await failSite('사이트가 응답하지 않습니다 (로그인이 필요하거나 접속이 막혔을 수 있어요).'); return; }
  const active = crawlState?.host === job.host && now - (crawlState.updatedAt ?? 0) < 90000;
  if (active && now - job.siteStartedAt < SITE_MAX_MS) { await chrome.alarms.create('watchdog', { delayInMinutes: 2 }); return; }
  await failSite('수집이 너무 오래 걸려 중단했습니다.');
}

// ---------- 전달 ----------
async function markPending(kind, scheduleNow = true) {
  const { pending = {}, job } = await getLocal(['pending', 'job']);
  pending[kind] = true;
  await setLocal({ pending });
  if (scheduleNow && !job) await chrome.alarms.create('deliver', { delayInMinutes: 0.5 });
}

function toDataUrl(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return 'data:application/json;base64,' + btoa(bin);
}

async function downloadJson(kind, body) {
  const day = new Date().toISOString().slice(0, 10);
  await chrome.downloads.download({ url: toDataUrl(body), filename: `kku-${kind}-${day}.json`, conflictAction: 'overwrite', saveAs: false });
}

const countOf = (kind, p) => (kind === 'notices' ? p.count : kind === 'lectures' ? p.terms.reduce((n, t) => n + (t.rows?.length ?? 0), 0) : (p.calendar.length + p.rules.length));

// force: 바뀐 것이 없어도 가진 자료를 모두 보낸다 (팝업의 "지금 보내기"). only: 그 종류만. downloadOnly: 서버를 거치지 않고 파일로만.
async function deliver(force, only = null, downloadOnly = false) {
  const { pending = {} } = await getLocal('pending');
  const s = await kkuSettings();
  const items = [];
  for (const kind of KINDS) {
    if (only ? kind !== only : !(force || pending[kind])) continue;
    const payload = await kkuPayload(kind);
    if (!payload) { pending[kind] = false; continue; }
    const body = JSON.stringify(payload);
    let via = null;
    let error = null;
    if (!downloadOnly) {
      try {
        const res = await fetch(`${s.server}/ingest?kind=${kind}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gongji-Collector': KKU_VERSION }, body, signal: AbortSignal.timeout(30000)
        });
        if (res.ok) via = 'server';
        else error = `서버 응답 ${res.status}`;
      } catch {
        error = '내 컴퓨터 서버가 꺼져 있어요';
      }
    }
    if (!via) {
      try { await downloadJson(kind, body); via = 'download'; } catch (e) { error = errText(e); }
    }
    items.push({ kind, via, error: via ? null : error, note: via === 'download' && !downloadOnly ? error : null, count: countOf(kind, payload) });
    if (via) pending[kind] = false;
  }
  const out = { at: Date.now(), items };
  if (items.length) await setLocal({ pending, delivery: out });
  else await setLocal({ pending });
  return out;
}

async function pingServer() {
  const s = await kkuSettings();
  try {
    const res = await fetch(`${s.server}/status`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { ok: false };
    const info = await res.json();
    return { ok: info?.app === 'gongji-jupjup', info };
  } catch {
    return { ok: false };
  }
}

// ---------- 이벤트 (모두 맨 위에서 등록) ----------
chrome.runtime.onInstalled.addListener(async () => { await schedule(); await refreshBadge(); });
chrome.runtime.onStartup.addListener(async () => { await schedule(); await refreshBadge(); });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'auto') {
    const s = await kkuSettings();
    if (s.auto && (await isDue(null))) await serial(() => startJob('auto'));
  } else if (alarm.name === 'watchdog') {
    await serial(watchdog);
  } else if (alarm.name === 'serverWatch') {
    await checkServerWatch();
  } else if (alarm.name === 'deliver') {
    const { job } = await getLocal('job');
    if (!job) await deliver(false);
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  if (changes.settings || changes.autoCollect) await schedule();
  const cs = changes.crawlState?.newValue;
  // 수집이 끝난 순간(running 이 true → false)만 처리한다
  if (cs && !cs.running && changes.crawlState.oldValue?.running && (cs.finished || cs.stopped || cs.error)) await serial(() => siteDone(cs));
  const keys = Object.keys(changes);
  if (keys.some((k) => k.startsWith('lec:'))) await markPending('lectures');
  if (keys.includes('ref:kku') || keys.includes('ref:rule')) await markPending('reference');
});

chrome.notifications?.onClicked.addListener(async (id) => {
  if (id !== NOTE_ID) return;
  await chrome.notifications.clear(id);
  await setLocal({ badgeSeen: Date.now() });
  await refreshBadge();
  await openWebApp();
});

// 백그라운드로 연 탭을 사용자가 닫으면 그 사이트는 건너뛴다
chrome.tabs.onRemoved.addListener((tabId) => serial(async () => {
  const { job } = await getLocal('job');
  if (!job || job.tabId !== tabId) return;
  if (job.keepTab) { await failSite('수집하던 탭이 닫혔습니다.'); return; }
  job.tabId = null;          // 이미 닫힌 탭이라 다시 닫지 않는다
  await setLocal({ job });
  await failSite('수집하던 탭이 닫혔습니다.');
}));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'hello') {
        const s = await kkuSettings();
        const { job } = await getLocal('job');
        const tabId = sender.tab?.id;
        if (job && tabId != null && tabId === job.tabId && msg.host === job.host) {
          await serial(async () => {
            const cur = (await getLocal('job')).job;
            if (cur && cur.tabId === tabId) { cur.started = true; await setLocal({ job: cur }); }
          });
          sendResponse({ run: true, newsLimit: s.newsLimit });
        } else if (!job && s.auto && s.sites[msg.host] && tabId != null && (await isDue(msg.host))) {
          // 평소에 학교 사이트를 열었고 수집할 때가 됐다 → 이 탭에서 조용히 새 글만 받는다 (탭은 닫지 않음)
          const now = Date.now();
          await setLocal({ job: { reason: 'visit', queue: [], host: msg.host, tabId, keepTab: true, started: true, startedAt: now, siteStartedAt: now, results: [] } });
          await chrome.alarms.create('watchdog', { delayInMinutes: 2 });
          await refreshBadge();
          sendResponse({ run: true, newsLimit: s.newsLimit });
        } else {
          sendResponse({ run: false });
        }
      } else if (msg?.type === 'collectNow') {
        let res;
        await serial(async () => { res = await startJob('manual'); });
        sendResponse(res);
      } else if (msg?.type === 'cancel') {
        await serial(cancelJob);
        sendResponse({ ok: true });
      } else if (msg?.type === 'deliverNow') {
        sendResponse({ ok: true, delivery: await deliver(true) });
      } else if (msg?.type === 'export') {
        sendResponse({ ok: true, delivery: await deliver(true, msg.kind, true) });
      } else if (msg?.type === 'openApp') {
        await openWebApp();
        sendResponse({ ok: true });
      } else if (msg?.type === 'pingServer') {
        sendResponse(await pingServer());
      } else if (msg?.type === 'seen') {
        await setLocal({ badgeSeen: Date.now() });
        await refreshBadge();
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: '알 수 없는 요청' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: errText(e) });
    }
  })();
  return true;      // 비동기로 답한다
});
