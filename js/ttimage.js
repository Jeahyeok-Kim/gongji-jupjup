// 시간표를 이미지(PNG)로 저장: 에브리타임처럼 친구에게 보내거나 휴대폰 배경으로 쓸 수 있게.
// 캔버스에 직접 그린다 (밖으로 보내는 것 없음). classes: [{ name, day, start, end, room }]
(function (root) {
  'use strict';
  const FONT = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
  const toMin = (hm) => { const [a, b] = String(hm).split(':').map(Number); return a * 60 + (b || 0); };

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // 한글은 글자 단위로 잘라 줄을 나눈다 (최대 lines 줄, 넘치면 …)
  function wrap(ctx, text, width, lines) {
    const out = [];
    let cur = '';
    for (const ch of String(text)) {
      if (ctx.measureText(cur + ch).width > width && cur) {
        out.push(cur);
        cur = ch;
        if (out.length === lines) break;
      } else cur += ch;
    }
    if (out.length < lines && cur) out.push(cur);
    if (out.length === lines && out.join('').length < String(text).length) out[lines - 1] = out[lines - 1].slice(0, -1) + '…';
    return out;
  }

  function draw(classes, opt) {
    const o = opt || {};
    const all = classes || [];
    const list = all.filter((c) => c && !c.elearn && c.start && c.end && Number.isInteger(c.day));
    const elearnList = all.filter((c) => c && (c.elearn || c.m === 'elearn' || !c.start));
    const weekend = list.some((c) => c.day === 6 || c.day === 0);
    const days = weekend ? [1, 2, 3, 4, 5, 6, 0] : [1, 2, 3, 4, 5];
    let lo = 9 * 60;
    let hi = 18 * 60;
    if (list.length) {
      lo = Math.min(...list.map((c) => toMin(c.start)));
      hi = Math.max(...list.map((c) => toMin(c.end)));
      lo = Math.floor(lo / 60) * 60;
      hi = Math.max(lo + 4 * 60, Math.ceil(hi / 60) * 60);
    }
    const rows = (hi - lo) / 60;
    const W = 1080;
    const pad = 56;
    const head = 190;
    const colHead = 64;
    const hourH = Math.max(70, Math.min(96, 860 / rows));
    const timeW = 56;
    const elearnH = elearnList.length ? (64 + Math.ceil(elearnList.length / 2) * 40) : 0;
    const foot = (o.note ? 90 : 60) + (elearnH ? elearnH + 20 : 0);
    const H = head + colHead + rows * hourH + foot + pad;
    const dpr = 2;
    const cv = document.createElement('canvas');
    cv.width = W * dpr;
    cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const dark = !!o.dark;
    const C = dark
      ? { bg: '#0f1114', card: '#1a1d21', line: '#2a2f35', text: '#eceff2', muted: '#a7afb9', faint: '#7a838d', accent: '#36ad6d' }
      : { bg: '#f2f4f6', card: '#ffffff', line: '#e5e8eb', text: '#191f28', muted: '#4e5968', faint: '#8b95a1', accent: '#0c7a45' };
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    // 제목
    ctx.fillStyle = C.muted;
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(o.kicker || '', pad, 78);
    ctx.fillStyle = C.text;
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText(o.title || '', pad, 140);
    if (o.sub) {
      ctx.fillStyle = C.muted;
      ctx.font = `600 26px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(o.sub, W - pad, 140);
      ctx.textAlign = 'left';
    }
    // 판
    const gx = pad;
    const gy = head;
    const gw = W - pad * 2;
    const gh = colHead + rows * hourH;
    ctx.fillStyle = C.card;
    rrect(ctx, gx, gy, gw, gh, 28);
    ctx.fill();
    const colW = (gw - timeW) / days.length;
    ctx.font = `700 24px ${FONT}`;
    ctx.textAlign = 'center';
    days.forEach((d, i) => {
      ctx.fillStyle = d === 0 ? '#e0303b' : d === 6 ? '#2f64cf' : C.muted;
      ctx.fillText(o.dayName ? o.dayName(d) : String(d), gx + timeW + colW * i + colW / 2, gy + 42);
    });
    ctx.textAlign = 'right';
    ctx.font = `500 18px ${FONT}`;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1.5;
    for (let r = 0; r <= rows; r++) {
      const y = gy + colHead + r * hourH;
      ctx.beginPath(); ctx.moveTo(gx + 18, y); ctx.lineTo(gx + gw - 18, y); ctx.stroke();
      if (r < rows) { ctx.fillStyle = C.faint; ctx.fillText(String(lo / 60 + r), gx + timeW - 12, y + 26); }
    }
    for (let i = 1; i < days.length; i++) {
      const x = gx + timeW + colW * i;
      ctx.beginPath(); ctx.moveTo(x, gy + colHead); ctx.lineTo(x, gy + gh - 16); ctx.stroke();
    }
    ctx.textAlign = 'left';
    // 수업
    for (const c of list) {
      const i = days.indexOf(c.day);
      if (i < 0) continue;
      const x = gx + timeW + colW * i + 5;
      const y = gy + colHead + ((toMin(c.start) - lo) / 60) * hourH + 3;
      const h = ((toMin(c.end) - toMin(c.start)) / 60) * hourH - 6;
      const w = colW - 10;
      ctx.fillStyle = o.colorOf ? o.colorOf(c.name) : '#cfe0ff';
      rrect(ctx, x, y, w, h, 12);
      ctx.fill();
      ctx.fillStyle = 'rgba(28,36,32,.28)';
      rrect(ctx, x, y, 6, h, 3);
      ctx.fill();
      ctx.fillStyle = '#1c2420';
      ctx.font = `700 20px ${FONT}`;
      const lines = wrap(ctx, c.name, w - 24, h > 110 ? 3 : 2);
      lines.forEach((ln, k) => ctx.fillText(ln, x + 14, y + 28 + k * 25));
      ctx.font = `500 15px ${FONT}`;
      ctx.fillStyle = '#3f4b44';
      const ty = y + 28 + lines.length * 25;
      if (ty + 4 < y + h) ctx.fillText(`${c.start}–${c.end}`, x + 14, ty);
      const prof = c.prof || c.p || '';
      const subInfo = [prof ? `${prof} 교수` : '', c.room].filter(Boolean).join(' · ');
      if (subInfo && ty + 22 < y + h) ctx.fillText(wrap(ctx, subInfo, w - 24, 1)[0] || '', x + 14, ty + 20);
    }
    // 아래: 이러닝 & 메모 & 이름표
    let curY = gy + gh + 20;
    if (elearnList.length) {
      ctx.fillStyle = C.card;
      rrect(ctx, gx, curY, gw, elearnH, 20);
      ctx.fill();
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = C.accent;
      ctx.font = `700 19px ${FONT}`;
      ctx.fillText(`💻 이러닝 · 온라인 강좌 (${elearnList.length})`, gx + 24, curY + 34);

      const itemW = (gw - 48) / 2;
      elearnList.forEach((ec, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const ix = gx + 24 + col * itemW;
        const iy = curY + 66 + row * 38;
        const pStr = ec.prof || ec.p ? ` (${ec.prof || ec.p} 교수)` : '';
        ctx.fillStyle = C.text;
        ctx.font = `600 17px ${FONT}`;
        ctx.fillText(wrap(ctx, `• ${ec.name}${pStr}`, itemW - 16, 1)[0] || '', ix, iy);
      });
      curY += elearnH + 20;
    }

    if (o.note) {
      ctx.fillStyle = C.muted;
      ctx.font = `500 22px ${FONT}`;
      ctx.fillText(wrap(ctx, o.note, gw, 1)[0] || '', pad, curY + 28);
    }
    ctx.font = `800 26px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = C.text;
    const brandY = H - pad + 8;
    ctx.fillText('공지 ', W - pad - ctx.measureText('줍줍').width, brandY);
    ctx.fillStyle = C.accent;
    ctx.fillText('줍줍', W - pad, brandY);
    ctx.textAlign = 'left';
    return cv;
  }

  async function download(classes, opt) {
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { /* 기기 글꼴로 그림 */ }
    const cv = draw(classes, opt);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    if (!blob) return false;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (opt && opt.filename) || 'gongji-timetable.png';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  }

  root.GongjiTTImage = { draw, download };
})(typeof window !== 'undefined' ? window : globalThis);
