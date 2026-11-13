// 팝업: 학교 기본 정보 받기·내보내기
const REF_HOSTS = ['www.kku.ac.kr', 'rule.konkuk.ac.kr'];

async function renderRefSummary() {
  const { 'ref:kku': kku, 'ref:rule': rule } = await chrome.storage.local.get(['ref:kku', 'ref:rule']);
  const when = (t) => new Date(t).toLocaleDateString('ko-KR');
  const lines = [];
  if (kku) {
    const y = kku.yoram?.[0]?.year;
    lines.push(`학사일정 ${kku.calendar?.length ?? 0}개 · 요람 ${y ? y + '학년도' : '없음'} · 안내 페이지 ${kku.pages?.length ?? 0}개 (${when(kku.collectedAt)})`);
  } else lines.push('학사일정·요람: 아직 받지 않음');
  if (rule) {
    lines.push(`규정 ${rule.rules?.length ?? 0}개 (${when(rule.collectedAt)})` + (rule.missing?.length ? ` · 못 찾음: ${rule.missing.join(', ')}` : ''));
  } else lines.push('규정: 아직 받지 않음');
  document.getElementById('refSummary').textContent = lines.join('\n');
  document.getElementById('refExport').disabled = !kku && !rule;
}

function renderRefState(st) {
  const box = document.getElementById('refStatus');
  box.className = 'status';
  document.getElementById('refStart').disabled = !!st?.running;
  if (!st) { box.textContent = ''; return; }
  if (st.error) { box.classList.add('error'); box.textContent = st.error; return; }
  box.textContent = st.running ? `받는 중: ${st.current ?? ''}` : (st.finished ? '받았습니다.' : '');
}

async function exportReference() {
  const { 'ref:kku': kku, 'ref:rule': rule } = await chrome.storage.local.get(['ref:kku', 'ref:rule']);
  const payload = {
    schema: 1, kind: 'kku-reference', generator: 'kku-collector 0.3.0', generatedAt: new Date().toISOString(),
    calendar: kku?.calendar ?? [], yoram: kku?.yoram ?? [], pages: kku?.pages ?? [],
    rules: rule?.rules ?? [], collected: { kku: kku?.collectedAt ?? null, rule: rule?.collectedAt ?? null }
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `kku-reference-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function initReference(tab, host) {
  const start = document.getElementById('refStart');
  document.getElementById('refExport').addEventListener('click', exportReference);
  await renderRefSummary();
  const { refState } = await chrome.storage.local.get('refState');
  renderRefState(refState ?? null);
  if (!REF_HOSTS.includes(host)) {
    start.disabled = true;
    start.title = 'www.kku.ac.kr 또는 rule.konkuk.ac.kr 탭에서 열어 주세요';
  } else {
    start.textContent = host === 'rule.konkuk.ac.kr' ? '학칙·규정 받기' : '학사일정·요람·안내 받기';
    start.addEventListener('click', async () => {
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'refStart' });
        if (!res?.ok) renderRefState({ error: res?.error ?? '시작하지 못했습니다.' });
      } catch {
        renderRefState({ error: '이 탭을 새로고침(F5)한 뒤 다시 열어 주세요.' });
      }
    });
  }
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes.refState) renderRefState(changes.refState.newValue ?? null);
    if (changes['ref:kku'] || changes['ref:rule']) await renderRefSummary();
  });
}
