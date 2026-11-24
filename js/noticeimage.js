// 건국대학교 GLOCAL캠퍼스 공지 줍줍 — 고해상도 캠퍼스 카드뉴스 스튜디오 (.png)
// 인스타그램 피드/스토리, 에브리타임, 카카오톡 등에 최적화된 Big-Tech 스타일 카드뉴스 생성 엔진
(function (root) {
  'use strict';

  const FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

  // 둥근 사각형 헬퍼
  function rrect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 텍스트 자동 줄바꿈 헬퍼
  function wrapText(ctx, text, maxWidth, maxLines) {
    if (!text) return [];
    const lines = [];
    const rawParagraphs = String(text).split(/\r?\n/);
    for (const para of rawParagraphs) {
      if (!para.trim()) continue;
      const chars = Array.from(para);
      let cur = '';
      for (const ch of chars) {
        if (ctx.measureText(cur + ch).width > maxWidth && cur) {
          lines.push(cur);
          cur = ch;
          if (lines.length === maxLines) break;
        } else {
          cur += ch;
        }
      }
      if (lines.length < maxLines && cur) lines.push(cur);
      if (lines.length >= maxLines) break;
    }
    if (lines.length === maxLines && lines.join('').length < String(text).replace(/\s+/g, ' ').length) {
      lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
    }
    return lines;
  }

  // 다국어/객체 필드 안전 텍스트 변환 헬퍼
  function toText(val, lang) {
    if (!val) return '';
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'number') return String(val);
    if (typeof val === 'object') {
      const l = lang || 'ko';
      if (val[l]) return toText(val[l], lang);
      if (val.text) return toText(val.text, lang);
      if (val.summary) return toText(val.summary, lang);
      if (val.ko) return toText(val.ko, lang);
      if (val.en) return toText(val.en, lang);
      if (val.raw) return toText(val.raw, lang);
      for (const k of Object.keys(val)) {
        if (typeof val[k] === 'string' && val[k].trim()) return val[k].trim();
      }
    }
    return '';
  }

  // AI 요약 문장을 3개의 핵심 포인트로 정제하는 헬퍼
  function extractThreePoints(summaryText, notice, lang) {
    const raw = toText(summaryText, lang);
    if (!raw) return ['공지 본문을 확인해 주세요.', '자세한 요강은 원문을 참조하세요.', '지원 기간을 놓치지 마세요.'];
    const s = raw.trim();
    // 마침표나 줄바꿈으로 분리
    let parts = s.split(/(?<=[.?!])\s+|\r?\n+/).map(p => toText(p, lang).trim()).filter(p => p.length > 5);
    if (parts.length === 0) parts = [s];
    if (parts.length === 1) {
      const chunks = parts[0].split(/,\s*/);
      if (chunks.length >= 2) parts = chunks;
    }
    const points = [];
    for (let i = 0; i < Math.min(3, parts.length); i++) {
      let p = parts[i].replace(/^[0-9]+[.)]\s*/, '').replace(/^[•\-*]\s*/, '');
      if (p.length > 60) p = p.slice(0, 58) + '…';
      points.push(p);
    }
    while (points.length < 3) {
      if (points.length === 1 && notice && notice.deadline) {
        points.push(`접수 마감 기한은 ${String(notice.deadline).slice(0, 10)}까지입니다.`);
      } else if (notice && notice.benefit) {
        const ben = toText(notice.benefit.text || notice.benefit, lang);
        if (ben) points.push(`지원 혜택: ${ben}`);
        else points.push('공지 본문에서 상세 지원 혜택을 확인하세요.');
      } else {
        points.push('세부 자격 요건 및 신청 방법은 공지 원문을 확인해 주세요.');
      }
    }
    return points.slice(0, 3);
  }

  // 1. 고화질 카드뉴스 캔버스 렌더러
  function renderCardCanvas(notice, opt) {
    const o = opt || {};
    const n = notice || {};
    const I = root.GONGJI_I18N || {};
    const L = root.GONGJI_LOGIC || {};
    const S = root.GONGJI_SUMMARY || {};
    const lang = o.lang || 'ko';
    const now = o.now || new Date();
    const ratio = o.ratio === 'square' ? 'square' : 'feed'; // feed: 4:5 (1080x1350), square: 1:1 (1080x1080)
    const theme = o.theme === 'white' ? 'white' : 'dark';  // dark (기본) | white

    const W = 1080;
    const H = ratio === 'square' ? 1080 : 1350;
    const pad = 64;
    const innerW = W - pad * 2; // 952

    const title = toText(typeof o.titleOf === 'function' ? o.titleOf(n) : n.title, lang) || '공지 안내';
    const board = toText(typeof o.boardsOf === 'function' ? o.boardsOf(n) : n.boardName, lang) || '학교 공지';
    const cat = toText(typeof o.catLabel === 'function' ? o.catLabel(n.category) : n.category, lang) || '공지';

    // 마감 및 D-Day 계산
    const expired = n.deadline ? (L.isExpired ? L.isExpired(n, now) : new Date(n.deadline) < now) : false;
    const days = n.deadline ? (L.daysLeft ? L.daysLeft(n.deadline, now) : null) : null;
    let ddayText = '상시 / 별도안내';
    let ddayColor = theme === 'dark' ? '#94a3b8' : '#64748b';
    let ddayBg = theme === 'dark' ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.12)';

    if (n.deadline) {
      if (expired) {
        ddayText = '마감 완료';
        ddayColor = '#94a3b8';
        ddayBg = 'rgba(148, 163, 184, 0.15)';
      } else if (days === 0) {
        ddayText = '🚨 오늘 마감 D-DAY';
        ddayColor = '#f87171';
        ddayBg = 'rgba(239, 68, 68, 0.2)';
      } else if (days !== null && days <= 3) {
        ddayText = `⏳ D-${days} 마감임박`;
        ddayColor = '#fbbf24';
        ddayBg = 'rgba(245, 158, 11, 0.2)';
      } else if (days !== null) {
        ddayText = `D-${days}`;
        ddayColor = '#34d399';
        ddayBg = 'rgba(16, 185, 129, 0.2)';
      }
    }

    const deadlineStr = n.deadline
      ? (I.formatDateTime ? I.formatDateTime(L.parseLocal ? L.parseLocal(n.deadline) : new Date(n.deadline), lang) : String(n.deadline))
      : '기한 명시 없음 (상시/추후공지)';

    const rawBenefit = n.benefit ? (n.benefit.text || n.benefit) : '';
    const benefitStr = toText(rawBenefit, lang) || '공지 본문 참조';

    const rawEligibility = n.eligibility || '';
    const eligibilityStr = toText(rawEligibility, lang) || '재학생 전체 또는 상세 요건 참조';

    // AI 요약
    const sm = S.pick ? S.pick(n, lang) : { text: n.summary || '' };
    const rawSummary = toText(sm && sm.text ? sm.text : (n.aiSummary || n.body || title), lang);
    const threePoints = extractThreePoints(rawSummary, n, lang);

    // 캔버스 생성
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');

    // ------------------ 배경 렌더링 ------------------
    if (theme === 'dark') {
      const bgGrad = ctx.createLinearGradient(0, 0, W, H);
      bgGrad.addColorStop(0, '#09110d');
      bgGrad.addColorStop(0.4, '#0e1813');
      bgGrad.addColorStop(1, '#0b130f');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // 우측 상단 에메랄드 오로라 글로우
      const glowTop = ctx.createRadialGradient(W - 120, 100, 20, W - 120, 100, 520);
      glowTop.addColorStop(0, 'rgba(16, 185, 129, 0.24)');
      glowTop.addColorStop(0.6, 'rgba(16, 185, 129, 0.05)');
      glowTop.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = glowTop;
      ctx.fillRect(0, 0, W, H);

      // 좌측 하단 은은한 앰버/틸 글로우
      const glowBottom = ctx.createRadialGradient(100, H - 120, 20, 100, H - 120, 450);
      glowBottom.addColorStop(0, 'rgba(5, 150, 105, 0.16)');
      glowBottom.addColorStop(1, 'rgba(5, 150, 105, 0)');
      ctx.fillStyle = glowBottom;
      ctx.fillRect(0, 0, W, H);

      // 외곽 프레임 라인
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 2;
      rrect(ctx, 24, 24, W - 48, H - 48, 36);
      ctx.stroke();
    } else {
      // 화이트 테마
      const bgGrad = ctx.createLinearGradient(0, 0, W, H);
      bgGrad.addColorStop(0, '#ffffff');
      bgGrad.addColorStop(0.7, '#f8fafc');
      bgGrad.addColorStop(1, '#f1f5f9');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // 우측 상단 산뜻한 민트 글로우
      const glowTop = ctx.createRadialGradient(W - 100, 80, 20, W - 100, 80, 480);
      glowTop.addColorStop(0, 'rgba(16, 185, 129, 0.12)');
      glowTop.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = glowTop;
      ctx.fillRect(0, 0, W, H);

      // 외곽 프레임 라인
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.07)';
      ctx.lineWidth = 2;
      rrect(ctx, 24, 24, W - 48, H - 48, 36);
      ctx.stroke();
    }

    let curY = pad + 12;

    // ------------------ 1. 상단 브랜딩 바 ------------------
    // 건국대 GLOCAL 공지 줍줍 앱 아이콘
    const iconSize = 48;
    ctx.fillStyle = '#10b981';
    rrect(ctx, pad, curY, iconSize, iconSize, 14);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `900 24px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('拾', pad + iconSize / 2, curY + 33);
    ctx.textAlign = 'left';

    // 서비스 타이틀
    ctx.fillStyle = theme === 'dark' ? '#ffffff' : '#0f172a';
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText('건국대 공지 줍줍', pad + 62, curY + 28);

    ctx.fillStyle = theme === 'dark' ? '#6ee7b7' : '#059669';
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText('GLOCAL CAMPUS · OFFICIAL BRIEFING', pad + 63, curY + 46);

    // 우측 카드뉴스 뱃지
    const badgeText = 'CARD NEWS';
    ctx.font = `700 13px ${FONT}`;
    const badgeW = ctx.measureText(badgeText).width + 36;
    const badgeX = W - pad - badgeW;
    ctx.fillStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    rrect(ctx, badgeX, curY + 6, badgeW, 36, 18);
    ctx.fill();

    // 깜빡이는 녹색 라이브 인디케이터 점
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(badgeX + 16, curY + 24, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = theme === 'dark' ? '#e2e8f0' : '#334155';
    ctx.fillText(badgeText, badgeX + 26, curY + 29);

    // 구분선
    curY += 72;
    ctx.strokeStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, curY);
    ctx.lineTo(W - pad, curY);
    ctx.stroke();

    curY += 32;

    // ------------------ 2. 카테고리 & D-Day 칩 ------------------
    let chipX = pad;

    // 카테고리 칩
    ctx.font = `700 15px ${FONT}`;
    const catW = ctx.measureText(cat).width + 32;
    ctx.fillStyle = theme === 'dark' ? 'rgba(16, 185, 129, 0.22)' : 'rgba(16, 185, 129, 0.12)';
    rrect(ctx, chipX, curY, catW, 38, 10);
    ctx.fill();
    ctx.strokeStyle = theme === 'dark' ? 'rgba(52, 211, 153, 0.45)' : 'rgba(16, 185, 129, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = theme === 'dark' ? '#34d399' : '#047857';
    ctx.fillText(cat, chipX + 16, curY + 24);
    chipX += catW + 12;

    // D-Day 칩
    const ddayW = ctx.measureText(ddayText).width + 32;
    ctx.fillStyle = ddayBg;
    rrect(ctx, chipX, curY, ddayW, 38, 10);
    ctx.fill();
    ctx.strokeStyle = ddayColor;
    ctx.stroke();
    ctx.fillStyle = ddayColor;
    ctx.fillText(ddayText, chipX + 16, curY + 24);
    chipX += ddayW + 12;

    // 게시판 칩
    if (chipX + 120 < W - pad) {
      const boardW = Math.min(ctx.measureText(board).width + 30, W - pad - chipX);
      ctx.fillStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';
      rrect(ctx, chipX, curY, boardW, 38, 10);
      ctx.fill();
      ctx.fillStyle = theme === 'dark' ? '#94a3b8' : '#64748b';
      const cleanBoard = wrapText(ctx, board, boardW - 24, 1)[0] || board;
      ctx.fillText(cleanBoard, chipX + 14, curY + 24);
    }

    curY += 56;

    // ------------------ 3. 헤드라인 제목 ------------------
    ctx.fillStyle = theme === 'dark' ? '#ffffff' : '#0f172a';
    ctx.font = `800 38px ${FONT}`;
    const maxTitleLines = ratio === 'square' ? 2 : 3;
    const titleLines = wrapText(ctx, title, innerW, maxTitleLines);
    titleLines.forEach((tl, idx) => {
      ctx.fillText(tl, pad, curY + 40 + idx * 52);
    });

    curY += titleLines.length * 52 + 20;

    // ------------------ 4. 핵심 혜택 스포트라이트 박스 ------------------
    const hasHighlight = !!benefitStr && benefitStr !== '공지 본문 참조';
    const highlightH = 92;
    if (hasHighlight) {
      if (theme === 'dark') {
        const hGrad = ctx.createLinearGradient(pad, curY, pad + innerW, curY + highlightH);
        hGrad.addColorStop(0, 'rgba(16, 185, 129, 0.22)');
        hGrad.addColorStop(1, 'rgba(6, 95, 70, 0.25)');
        ctx.fillStyle = hGrad;
        rrect(ctx, pad, curY, innerW, highlightH, 18);
        ctx.fill();
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
        rrect(ctx, pad, curY, innerW, highlightH, 18);
        ctx.fill();
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 스포트라이트 라벨
      ctx.fillStyle = theme === 'dark' ? '#6ee7b7' : '#059669';
      ctx.font = `700 13px ${FONT}`;
      ctx.fillText('🎁 핵심 혜택 및 지원 가치', pad + 24, curY + 30);

      // 스포트라이트 텍스트
      ctx.fillStyle = theme === 'dark' ? '#ffffff' : '#065f46';
      ctx.font = `800 24px ${FONT}`;
      const benFit = wrapText(ctx, benefitStr, innerW - 48, 1)[0] || benefitStr;
      ctx.fillText(benFit, pad + 24, curY + 66);

      curY += highlightH + 24;
    }

    // ------------------ 5. 2x2 핵심 정보 그리드 ------------------
    const gridCols = 2;
    const gridGap = 16;
    const boxW = (innerW - gridGap) / 2;
    const boxH = ratio === 'square' ? 78 : 88;

    const metaCards = [
      { label: '접수 마감', icon: '⏰', val: deadlineStr },
      { label: '지원 대상', icon: '👥', val: eligibilityStr },
      { label: '지원 혜택', icon: '🎁', val: benefitStr },
      { label: '주관 부서', icon: '🏢', val: board }
    ];

    metaCards.forEach((card, idx) => {
      const col = idx % gridCols;
      const row = Math.floor(idx / gridCols);
      const bx = pad + col * (boxW + gridGap);
      const by = curY + row * (boxH + gridGap);

      // 박스 배경
      ctx.fillStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.04)' : '#f1f5f9';
      rrect(ctx, bx, by, boxW, boxH, 16);
      ctx.fill();
      ctx.strokeStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 라벨
      ctx.fillStyle = theme === 'dark' ? '#6ee7b7' : '#059669';
      ctx.font = `700 13px ${FONT}`;
      ctx.fillText(`${card.icon} ${card.label}`, bx + 20, by + 28);

      // 값
      ctx.fillStyle = theme === 'dark' ? '#f1f5f9' : '#1e293b';
      ctx.font = `600 16px ${FONT}`;
      const fitText = wrapText(ctx, card.val, boxW - 40, 1)[0] || card.val;
      ctx.fillText(fitText, bx + 20, by + (boxH >= 88 ? 58 : 54));
    });

    curY += (boxH + gridGap) * 2 + 10;

    // ------------------ 6. AI 3-Point 핵심 체크 브리핑 박스 ------------------
    const remainingH = H - pad - curY - 76; // 푸터 높이 고려 잔여 공간
    const summaryH = Math.max(ratio === 'square' ? 180 : 230, remainingH);

    ctx.fillStyle = theme === 'dark' ? '#121e17' : '#f8fafc';
    rrect(ctx, pad, curY, innerW, summaryH, 20);
    ctx.fill();
    ctx.strokeStyle = theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 좌측 에메랄드 강조 바
    ctx.fillStyle = '#10b981';
    rrect(ctx, pad, curY, 6, summaryH, 3);
    ctx.fill();

    // 요약 헤더
    ctx.fillStyle = theme === 'dark' ? '#34d399' : '#047857';
    ctx.font = `800 16px ${FONT}`;
    ctx.fillText('✨ AI 30초 핵심 브리핑', pad + 26, curY + 36);

    // 3개 포인트 리스트
    const pointIcons = ['1️⃣', '2️⃣', '3️⃣'];
    const maxPoints = ratio === 'square' ? 2 : 3;
    const ptStep = ratio === 'square' ? 56 : 52;

    for (let i = 0; i < maxPoints; i++) {
      const pt = threePoints[i] || '';
      const py = curY + 76 + i * ptStep;

      // 번호 뱃지 아이콘
      ctx.font = `700 15px ${FONT}`;
      ctx.fillStyle = theme === 'dark' ? '#6ee7b7' : '#059669';
      ctx.fillText(pointIcons[i], pad + 24, py);

      // 본문 문장
      ctx.font = `500 16px ${FONT}`;
      ctx.fillStyle = theme === 'dark' ? '#e2e8f0' : '#334155';
      const cleanPt = wrapText(ctx, pt, innerW - 80, 1)[0] || pt;
      ctx.fillText(cleanPt, pad + 60, py);
    }

    // ------------------ 7. 하단 푸터 ------------------
    const footerY = H - pad + 16;
    ctx.strokeStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, footerY - 28);
    ctx.lineTo(W - pad, footerY - 28);
    ctx.stroke();

    ctx.fillStyle = theme === 'dark' ? '#94a3b8' : '#64748b';
    ctx.font = `500 14px ${FONT}`;
    ctx.fillText('📌 원문 공지 확인 및 지원은 건국대 공지 줍줍(gongji-jupjup)에서 제공됩니다.', pad, footerY - 6);

    const todayStr = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    ctx.fillStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.4)';
    ctx.font = `600 13px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`카드 발행일 ${todayStr}`, W - pad, footerY - 6);
    ctx.textAlign = 'left';

    return cv;
  }

  // 캔버스 Blob 변환 헬퍼
  function toBlob(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }

  // 파일 다운로드
  async function downloadNoticeCard(notice, opt) {
    try {
      const cv = renderCardCanvas(notice, opt);
      const safeTitle = (notice.title || '공지')
        .replace(/[\/\\:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 24);
      const filename = `공지줍줍_카드뉴스_${safeTitle}.png`;

      const blob = await toBlob(cv);
      if (!blob) throw new Error('Blob creation failed');

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 500);

      return true;
    } catch (err) {
      console.error('downloadNoticeCard error:', err);
      return false;
    }
  }

  // 클립보드 이미지 복사
  async function copyNoticeCardImage(notice, opt) {
    try {
      const cv = renderCardCanvas(notice, opt);
      const blob = await toBlob(cv);
      if (!blob) throw new Error('Blob creation failed');

      if (navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new window.ClipboardItem({ 'image/png': blob })
        ]);
        return { success: true, method: 'clipboard' };
      }
      return { success: false, error: 'ClipboardItem not supported' };
    } catch (err) {
      console.warn('copyNoticeCardImage failed:', err);
      return { success: false, error: err };
    }
  }

  // 모바일 공유 및 클립보드 공유 복합 핸들러
  async function shareNoticeCard(notice, opt) {
    const o = opt || {};
    try {
      const cv = renderCardCanvas(notice, o);
      const safeTitle = (notice.title || '공지')
        .replace(/[\/\\:*?"<>|]/g, '_')
        .slice(0, 24);
      const filename = `공지줍줍_카드뉴스_${safeTitle}.png`;
      const blob = await toBlob(cv);
      if (!blob) throw new Error('Blob creation failed');

      const file = new File([blob], filename, { type: 'image/png' });

      // 모바일 웹 공유 API 파일 전송 지원 여부 확인
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `[건국대 공지 줍줍] ${notice.title || ''}`,
          text: `건국대 공지 카드뉴스: ${notice.title || ''}\n자세히 보기: ${location.origin}${location.pathname}#/n/${notice.id}`
        });
        return { success: true, method: 'share' };
      }

      // 클립보드 이미지 복사 지원 시 복사
      const clipRes = await copyNoticeCardImage(notice, o);
      if (clipRes.success) {
        return { success: true, method: 'clipboard' };
      }

      // 지원되지 않으면 자동 다운로드
      const downloaded = await downloadNoticeCard(notice, o);
      return { success: downloaded, method: 'download' };
    } catch (err) {
      console.error('shareNoticeCard error:', err);
      return { success: false, error: err };
    }
  }

  // ------------------ 3. 카드뉴스 스튜디오 모달 팝업 ------------------
  function openNoticeCardModal(notice, opt) {
    const o = Object.assign({ ratio: 'feed', theme: 'dark' }, opt || {});
    const n = notice || {};

    let modal = document.getElementById('notice-card-modal');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'notice-card-modal';
      modal.className = 'notice-card-modal';
      document.body.appendChild(modal);
    }

    const safeTitle = (n.title || '공지').slice(0, 20);

    const updatePreview = () => {
      const cv = renderCardCanvas(n, o);
      const dataUrl = cv.toDataURL('image/png');
      const img = modal.querySelector('.ncm-preview-img');
      if (img) img.src = dataUrl;
    };

    modal.innerHTML = `
      <div class="ncm-wrap">
        <div class="ncm-head">
          <div class="ncm-title-area">
            <h3>🖼️ 공지 카드뉴스 스튜디오</h3>
            <p class="ncm-sub">인스타 피드·에브리타임·카카오톡 공유에 최적화된 고해상도 카드뉴스</p>
          </div>
          <button type="button" class="ncm-close-btn" aria-label="닫기">✕</button>
        </div>

        <div class="ncm-toolbar">
          <div class="ncm-seg-group" role="radiogroup" aria-label="카드뉴스 비율">
            <span class="ncm-seg-label">비율</span>
            <button type="button" class="ncm-seg-btn ${o.ratio === 'feed' ? 'is-active' : ''}" data-ratio="feed">📱 피드 (4:5)</button>
            <button type="button" class="ncm-seg-btn ${o.ratio === 'square' ? 'is-active' : ''}" data-ratio="square">⬛ 정방형 (1:1)</button>
          </div>
          <div class="ncm-seg-group" role="radiogroup" aria-label="카드뉴스 테마">
            <span class="ncm-seg-label">테마</span>
            <button type="button" class="ncm-seg-btn ${o.theme === 'dark' ? 'is-active' : ''}" data-theme="dark">🌌 다크 에메랄드</button>
            <button type="button" class="ncm-seg-btn ${o.theme === 'white' ? 'is-active' : ''}" data-theme="white">☀️ 클린 화이트</button>
          </div>
        </div>

        <div class="ncm-preview-scroll">
          <div class="ncm-img-wrap">
            <img src="" alt="${safeTitle}" class="ncm-preview-img" />
          </div>
        </div>

        <div class="ncm-actions">
          <button type="button" class="btn primary ncm-btn-download">💾 이미지 저장 (.png)</button>
          <button type="button" class="btn ncm-btn-copy">📋 이미지 복사</button>
          <button type="button" class="btn ncm-btn-share">📤 바로 공유</button>
          <button type="button" class="btn ncm-btn-close">닫기</button>
        </div>
      </div>
    `;

    // 초기 프리뷰 렌더
    updatePreview();

    const triggerToast = (msg) => {
      if (typeof window.toast === 'function') window.toast(msg);
      else if (typeof window.showToast === 'function') window.showToast(msg);
      else if (typeof root.toast === 'function') root.toast(msg);
      else alert(msg);
    };

    const close = () => {
      if (modal.open) modal.close();
    };

    // 닫기 이벤트 바인딩
    modal.querySelector('.ncm-close-btn').onclick = close;
    modal.querySelector('.ncm-btn-close').onclick = close;

    // 비율 변경 툴바 버튼
    modal.querySelectorAll('[data-ratio]').forEach((btn) => {
      btn.onclick = () => {
        modal.querySelectorAll('[data-ratio]').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        o.ratio = btn.dataset.ratio;
        updatePreview();
      };
    });

    // 테마 변경 툴바 버튼
    modal.querySelectorAll('[data-theme]').forEach((btn) => {
      btn.onclick = () => {
        modal.querySelectorAll('[data-theme]').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        o.theme = btn.dataset.theme;
        updatePreview();
      };
    });

    // 다운로드 버튼
    modal.querySelector('.ncm-btn-download').onclick = async () => {
      const ok = await downloadNoticeCard(n, o);
      if (ok) {
        triggerToast('🖼️ 고해상도 카드뉴스 이미지가 다운로드되었습니다!');
      } else {
        triggerToast('이미지 저장에 실패했습니다. 다시 시도해 주세요.');
      }
    };

    // 클립보드 이미지 복사 버튼
    modal.querySelector('.ncm-btn-copy').onclick = async () => {
      const res = await copyNoticeCardImage(n, o);
      if (res.success) {
        triggerToast('📋 카드뉴스 이미지가 클립보드에 복사되었어요! 카톡이나 에브리타임에 바로 붙여넣기(Ctrl+V)하세요!');
      } else {
        // 복사 실패 시 다운로드로 안내
        await downloadNoticeCard(n, o);
        triggerToast('클립보드 직접 복사를 지원하지 않는 환경이어서 이미지 파일로 다운로드되었습니다.');
      }
    };

    // 바로 공유 버튼
    modal.querySelector('.ncm-btn-share').onclick = async () => {
      const res = await shareNoticeCard(n, o);
      if (res.success) {
        if (res.method === 'clipboard') {
          triggerToast('📋 카드뉴스 이미지가 클립보드에 복사되었습니다! 카톡이나 에타에 붙여넣으세요.');
        } else if (res.method === 'download') {
          triggerToast('🖼️ 카드뉴스 이미지가 다운로드되었습니다.');
        } else {
          triggerToast('📤 카드뉴스가 공유되었습니다!');
        }
      } else {
        triggerToast('공유를 완료하지 못했습니다.');
      }
    };

    // ESC 및 바깥 클릭 시 닫기
    modal.onclick = (e) => {
      if (e.target === modal) close();
    };

    modal.showModal();
  }

  root.GongjiNoticeImage = {
    renderCardCanvas,
    downloadNoticeCard,
    copyNoticeCardImage,
    shareNoticeCard,
    openNoticeCardModal
  };

})(typeof window !== 'undefined' ? window : globalThis);
