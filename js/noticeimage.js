// 건국대학교 GLOCAL캠퍼스 공지 줍줍 — 공지 요약 카드뉴스 이미지(.png) 생성기
// 인스타그램 스토리, 에브리타임, 카카오톡 등에 바로 공유하거나 갤러리에 저장할 수 있는 고해상도 카드뉴스
(function (root) {
  'use strict';

  const FONT = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y + w, x, y, r);
    ctx.closePath();
  }

  function wrapText(ctx, text, maxWidth, maxLines) {
    if (!text) return [];
    const lines = [];
    // 문단 분리
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

  // 카드 캔버스 드로잉
  function renderCardCanvas(notice, opt) {
    const o = opt || {};
    const n = notice || {};
    const I = root.GONGJI_I18N || {};
    const L = root.GONGJI_LOGIC || {};
    const S = root.GONGJI_SUMMARY || {};
    const lang = o.lang || 'ko';
    const now = o.now || new Date();

    const title = (typeof o.titleOf === 'function' ? o.titleOf(n) : n.title) || '공지 안내';
    const board = (typeof o.boardsOf === 'function' ? o.boardsOf(n) : n.boardName) || '학교 공지';
    const cat = (typeof o.catLabel === 'function' ? o.catLabel(n.category) : n.category) || '공지';

    // 마감 및 D-Day
    const expired = n.deadline ? L.isExpired ? L.isExpired(n, now) : new Date(n.deadline) < now : false;
    const days = n.deadline ? (L.daysLeft ? L.daysLeft(n.deadline, now) : null) : null;
    let ddayText = '마감 없음';
    let ddayColor = '#64748b';
    if (n.deadline) {
      if (expired) {
        ddayText = '마감 완료';
        ddayColor = '#64748b';
      } else if (days === 0) {
        ddayText = '오늘 마감!';
        ddayColor = '#ef4444';
      } else if (days !== null && days <= 3) {
        ddayText = `D-${days} 마감임박`;
        ddayColor = '#f59e0b';
      } else if (days !== null) {
        ddayText = `D-${days}`;
        ddayColor = '#10b981';
      }
    }

    // 일시 및 포맷
    const deadlineStr = n.deadline ? (I.formatDateTime ? I.formatDateTime(L.parseLocal ? L.parseLocal(n.deadline) : new Date(n.deadline), lang) : n.deadline) : '기한 명시 없음 (상시/추후안내)';
    const benefitStr = (n.benefit && n.benefit.text) ? n.benefit.text : (n.benefit || '공지 본문 참조');
    const eligibilityStr = n.eligibility || '전체 재학생 또는 상세 요건 참조';

    // AI 요약텍스트
    const sm = S.pick ? S.pick(n, lang) : { text: n.summary || '' };
    const summaryText = (sm && sm.text) ? sm.text : (n.aiSummary || n.body || '본문 요약이 제공되지 않는 공지입니다. 자세한 내용은 원문 공지를 확인해 주세요.');

    // 치수 및 레이아웃 설정
    const W = 720;
    const pad = 44;
    const innerW = W - pad * 2;
    const dpr = 2;

    // 가상 컨텍스트로 높이 계산
    const dummyCv = document.createElement('canvas');
    const dctx = dummyCv.getContext('2d');

    // 제목 라인
    dctx.font = `800 28px ${FONT}`;
    const titleLines = wrapText(dctx, title, innerW, 3);
    const titleH = titleLines.length * 40;

    // 요약 라인
    dctx.font = `500 17px ${FONT}`;
    const summaryLines = wrapText(dctx, summaryText, innerW - 36, 6);
    const summaryBoxH = 68 + summaryLines.length * 28;

    // 전체 높이 산출
    const headerH = 90;
    const tagsH = 46;
    const metaBoxH = 176;
    const footerH = 80;
    const gap = 20;

    const H = pad + headerH + tagsH + titleH + gap + metaBoxH + gap + summaryBoxH + gap + footerH + pad;

    const cv = document.createElement('canvas');
    cv.width = W * dpr;
    cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);

    // 1. 세련된 배경 (딥그린 & 다크 그라데이션)
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#0c1511');
    bgGrad.addColorStop(0.5, '#111c16');
    bgGrad.addColorStop(1, '#0e1813');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 은은한 글로우 효과 (우측 상단 에메랄드 원)
    const glowGrad = ctx.createRadialGradient(W - 60, 60, 10, W - 60, 60, 320);
    glowGrad.addColorStop(0, 'rgba(16, 185, 129, 0.16)');
    glowGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, W, H);

    let curY = pad;

    // 2. 상단 헤더 브랜딩
    // 로고 아이콘
    ctx.fillStyle = '#10b981';
    rrect(ctx, pad, curY + 4, 32, 32, 8);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `900 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('拾', pad + 16, curY + 26);
    ctx.textAlign = 'left';

    // 상단 텍스트
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 19px ${FONT}`;
    ctx.fillText('공지 줍줍', pad + 42, curY + 22);

    ctx.fillStyle = '#6ee7b7';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText('건국대학교 GLOCAL캠퍼스', pad + 42, curY + 38);

    // 우측 워터마크 라벨
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = `600 13px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('CAMPUS BRIEFING CARD', W - pad, curY + 28);
    ctx.textAlign = 'left';

    // 헤더 하단 얇은 라인
    curY += 56;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, curY);
    ctx.lineTo(W - pad, curY);
    ctx.stroke();

    curY += 24;

    // 3. 태그 영역 (카테고리 + D-Day + 게시판)
    let tagX = pad;

    // 카테고리 칩
    ctx.font = `700 13px ${FONT}`;
    const catW = ctx.measureText(cat).width + 24;
    ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
    rrect(ctx, tagX, curY, catW, 28, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.stroke();
    ctx.fillStyle = '#34d399';
    ctx.fillText(cat, tagX + 12, curY + 19);
    tagX += catW + 8;

    // D-Day 칩
    const ddayW = ctx.measureText(ddayText).width + 24;
    ctx.fillStyle = ddayColor === '#ef4444' ? 'rgba(239, 68, 68, 0.18)' : ddayColor === '#f59e0b' ? 'rgba(245, 158, 11, 0.18)' : 'rgba(16, 185, 129, 0.18)';
    rrect(ctx, tagX, curY, ddayW, 28, 6);
    ctx.fill();
    ctx.strokeStyle = ddayColor;
    ctx.stroke();
    ctx.fillStyle = ddayColor === '#64748b' ? '#cbd5e1' : ddayColor;
    ctx.fillText(ddayText, tagX + 12, curY + 19);
    tagX += ddayW + 8;

    // 게시판 칩
    const boardW = ctx.measureText(board).width + 22;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    rrect(ctx, tagX, curY, boardW, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(board, tagX + 11, curY + 19);

    curY += 40;

    // 4. 제목 출력
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 27px ${FONT}`;
    titleLines.forEach((tl, idx) => {
      ctx.fillText(tl, pad, curY + 28 + idx * 40);
    });

    curY += titleH + 18;

    // 5. 핵심 메타 정보 카드 박스 (마감/혜택/대상)
    ctx.fillStyle = '#17241e';
    rrect(ctx, pad, curY, innerW, metaBoxH, 16);
    ctx.fill();
    ctx.strokeStyle = '#273b30';
    ctx.lineWidth = 1;
    ctx.stroke();

    const drawMetaRow = (label, icon, val, yOffset) => {
      ctx.fillStyle = '#6ee7b7';
      ctx.font = `700 13px ${FONT}`;
      ctx.fillText(`${icon} ${label}`, pad + 18, curY + yOffset);

      ctx.fillStyle = '#f1f5f9';
      ctx.font = `600 15px ${FONT}`;
      const textWidth = innerW - 130;
      const fitVal = wrapText(ctx, val, textWidth, 1)[0] || '';
      ctx.fillText(fitVal, pad + 116, curY + yOffset);
    };

    drawMetaRow('마감일시', '⏰', deadlineStr, 38);
    drawMetaRow('지원혜택', '🎁', benefitStr, 82);
    drawMetaRow('지원대상', '👥', eligibilityStr, 126);
    drawMetaRow('주관게시판', '🏢', board, 170);

    curY += metaBoxH + 20;

    // 6. AI 3줄 핵심 요약 박스
    ctx.fillStyle = '#141e19';
    rrect(ctx, pad, curY, innerW, summaryBoxH, 16);
    ctx.fill();
    ctx.strokeStyle = '#1e3328';
    ctx.stroke();

    // 좌측 에메랄드 액센트 바
    ctx.fillStyle = '#10b981';
    rrect(ctx, pad, curY, 5, summaryBoxH, 3);
    ctx.fill();

    // 요약 헤더
    ctx.fillStyle = '#34d399';
    ctx.font = `800 14px ${FONT}`;
    ctx.fillText('✨ AI 핵심 요약', pad + 20, curY + 30);

    // 요약 문장들
    ctx.fillStyle = '#cbd5e1';
    ctx.font = `500 16px ${FONT}`;
    summaryLines.forEach((sl, idx) => {
      ctx.fillText(sl, pad + 20, curY + 62 + idx * 28);
    });

    curY += summaryBoxH + 24;

    // 7. 하단 푸터 영역
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(pad, curY);
    ctx.lineTo(W - pad, curY);
    ctx.stroke();

    curY += 24;

    ctx.fillStyle = '#94a3b8';
    ctx.font = `500 13px ${FONT}`;
    ctx.fillText('📌 원문 확인 및 상세 지원은 건국대 공지 줍줍 웹앱에서 제공됩니다.', pad, curY + 16);

    const todayStr = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = `500 12px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`카드 발행일 ${todayStr} · gongji-jupjup`, W - pad, curY + 16);
    ctx.textAlign = 'left';

    return cv;
  }

  // 캔버스 Blob 변환 헬퍼
  function toBlob(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }

  // 1. 이미지 다운로드
  async function downloadNoticeCard(notice, opt) {
    try {
      const cv = renderCardCanvas(notice, opt);
      const safeTitle = (notice.title || '공지')
        .replace(/[\/\\:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 24);
      const filename = `공지줍줍_${safeTitle}.png`;

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

  // 2. 이미지 클립보드 복사 또는 네이티브 공유
  async function shareNoticeCard(notice, opt) {
    const o = opt || {};
    try {
      const cv = renderCardCanvas(notice, o);
      const safeTitle = (notice.title || '공지')
        .replace(/[\/\\:*?"<>|]/g, '_')
        .slice(0, 24);
      const filename = `공지줍줍_${safeTitle}.png`;
      const blob = await toBlob(cv);
      if (!blob) throw new Error('Blob creation failed');

      const file = new File([blob], filename, { type: 'image/png' });

      // 모바일 웹 공유 API 파일 전송 지원 여부 확인
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `[공지줍줍] ${notice.title || ''}`,
          text: `건국대 공지 요약 카드: ${notice.title || ''}\n자세히 보기: ${location.origin}${location.pathname}#/n/${notice.id}`
        });
        return { success: true, method: 'share' };
      }

      // 클립보드 이미지 복사 지원 시 복사
      if (navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([
            new window.ClipboardItem({ 'image/png': blob })
          ]);
          return { success: true, method: 'clipboard' };
        } catch (clipErr) {
          console.warn('Clipboard write image failed, falling back to download:', clipErr);
        }
      }

      // 지원되지 않으면 자동 다운로드
      const downloaded = await downloadNoticeCard(notice, o);
      return { success: downloaded, method: 'download' };
    } catch (err) {
      console.error('shareNoticeCard error:', err);
      return { success: false, error: err };
    }
  }

  // 3. 카드뉴스 미리보기 모달 팝업
  function openNoticeCardModal(notice, opt) {
    const o = opt || {};
    const n = notice || {};
    const cv = renderCardCanvas(n, o);

    let modal = document.getElementById('notice-card-modal');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'notice-card-modal';
      modal.className = 'notice-card-modal';
      document.body.appendChild(modal);
    }

    const dataUrl = cv.toDataURL('image/png');
    const safeTitle = (n.title || '공지').slice(0, 20);

    const T = (root.GONGJI_I18N && root.GONGJI_I18N.t) ? root.GONGJI_I18N.t() : {};
    const saveLabel = T.cardNewsSave || '💾 이미지 저장 (.png)';
    const shareLabel = T.cardNewsShare || '📤 공유하기';
    const closeLabel = T.close || '닫기';

    modal.innerHTML = `
      <div class="ncm-wrap">
        <div class="ncm-head">
          <h3>🖼️ 공지 카드뉴스</h3>
          <button type="button" class="ncm-close-btn" aria-label="${closeLabel}">✕</button>
        </div>
        <div class="ncm-preview-scroll">
          <img src="${dataUrl}" alt="${safeTitle}" class="ncm-preview-img" />
        </div>
        <div class="ncm-actions">
          <button type="button" class="btn primary ncm-btn-download">${saveLabel}</button>
          <button type="button" class="btn ncm-btn-share">${shareLabel}</button>
          <button type="button" class="btn ncm-btn-close">${closeLabel}</button>
        </div>
      </div>
    `;

    const close = () => {
      if (modal.open) modal.close();
    };

    modal.querySelector('.ncm-close-btn').onclick = close;
    modal.querySelector('.ncm-btn-close').onclick = close;

    modal.querySelector('.ncm-btn-download').onclick = async () => {
      await downloadNoticeCard(n, o);
      if (typeof root.showToast === 'function') {
        root.showToast('공지 카드 이미지가 저장되었습니다!');
      }
    };

    modal.querySelector('.ncm-btn-share').onclick = async () => {
      const res = await shareNoticeCard(n, o);
      if (res.success) {
        if (typeof root.showToast === 'function') {
          if (res.method === 'clipboard') root.showToast('이미지가 클립보드에 복사되었습니다! 원하는 곳에 붙여넣으세요.');
          else if (res.method === 'download') root.showToast('이미지가 다운로드되었습니다.');
          else root.showToast('공지 카드가 공유되었습니다!');
        }
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
    shareNoticeCard,
    openNoticeCardModal
  };

})(typeof window !== 'undefined' ? window : globalThis);
