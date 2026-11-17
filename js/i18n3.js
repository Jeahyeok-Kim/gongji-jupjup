// 화면 문구 추가분 3 (필터 접기 · 오늘 화면에서 넘어온 조건 · 오늘 내 수업 · 맨 위로 · 시간표 다듬기)
// js/i18n2.js 뒤에 불러와서 같은 문구 표(I.T)에 이어 붙입니다. 네 언어가 같은 항목을 가져야 합니다 (tests/i18n.test.js 가 확인).
(function (root) {
  'use strict';
  if (!root.GongjiI18n && typeof require === 'function') { require('./i18n.js'); require('./i18n2.js'); }
  const I = root.GongjiI18n;

  const ADD = {
    ko: {
      filterToggle: '필터', filterToggleAria: (n) => (n ? `필터·정렬 (적용 ${n}개)` : '필터·정렬'),
      dueNote: { today: '오늘 마감인 공지만 보는 중', soon: '3일 안에 마감되는 공지만 보는 중', new: '새로 올라온 공지만 보는 중' },
      dueClear: '전체 보기',
      todayClasses: '오늘 내 수업', todayNoClass: '오늘은 수업이 없어요.',
      nextClass: (d, s, n) => `다음 수업: ${d} ${s} ${n}`,
      freeGap: (a, b) => `공강 ${a}–${b}`,
      classNow: '수업 중', classNext: '다음', seeTimetable: '시간표 보기',
      toTop: '맨 위로',
      removeAll: (n) => `모두 삭제 (${n}칸)`,
      clearedTimetable: (n) => `수업 ${n}칸을 모두 지웠어요`,
      daysHint: '(시간이 같은 요일은 함께 고를 수 있어요)',
      aiPendingBadge: 'AI 정리 전', aiPendingNote: '방금 들어온 공지라 아직 AI가 읽지 않았어요. 본문에서 규칙으로 찾은 마감·혜택만 먼저 보여 드려요. 곧 자세한 정리와 번역으로 바뀌어요.'
    },
    en: {
      filterToggle: 'Filter', filterToggleAria: (n) => (n ? `Filter & sort (${n} active)` : 'Filter & sort'),
      dueNote: { today: 'Showing only notices due today', soon: 'Showing only notices due within 3 days', new: 'Showing only new notices' },
      dueClear: 'Show all',
      todayClasses: 'My classes today', todayNoClass: 'No classes today.',
      nextClass: (d, s, n) => `Next class: ${d} ${s} ${n}`,
      freeGap: (a, b) => `Free ${a}–${b}`,
      classNow: 'Now', classNext: 'Next', seeTimetable: 'Open timetable',
      toTop: 'Back to top',
      removeAll: (n) => `Remove all (${n})`,
      clearedTimetable: (n) => `Removed all ${n} class slots`,
      daysHint: '(days with the same time can be picked together)',
      aiPendingBadge: 'Not yet AI-read', aiPendingNote: 'This notice just arrived and the AI has not read it yet. Only the deadline and benefit found by rules are shown for now; a full summary and translation will replace it soon.'
    },
    zh: {
      filterToggle: '筛选', filterToggleAria: (n) => (n ? `筛选和排序(已用${n}项)` : '筛选和排序'),
      dueNote: { today: '只显示今天截止的公告', soon: '只显示3天内截止的公告', new: '只显示新公告' },
      dueClear: '查看全部',
      todayClasses: '今天的课', todayNoClass: '今天没有课。',
      nextClass: (d, s, n) => `下一节课:${d} ${s} ${n}`,
      freeGap: (a, b) => `空课 ${a}–${b}`,
      classNow: '上课中', classNext: '下一节', seeTimetable: '查看课表',
      toTop: '回到顶部',
      removeAll: (n) => `全部删除(${n}节)`,
      clearedTimetable: (n) => `已删除全部 ${n} 个时段`,
      daysHint: '(时间相同的星期可以一起选)',
      aiPendingBadge: '待AI整理', aiPendingNote: '这是刚发布的公告,AI还没有读取。目前只显示按规则找到的截止日期和福利,稍后会换成完整的摘要和翻译。'
    },
    ja: {
      filterToggle: '絞り込み', filterToggleAria: (n) => (n ? `絞り込み・並べ替え(適用${n}件)` : '絞り込み・並べ替え'),
      dueNote: { today: '今日締切のお知らせだけ表示中', soon: '3日以内に締切のお知らせだけ表示中', new: '新着のお知らせだけ表示中' },
      dueClear: 'すべて見る',
      todayClasses: '今日の授業', todayNoClass: '今日は授業がありません。',
      nextClass: (d, s, n) => `次の授業:${d} ${s} ${n}`,
      freeGap: (a, b) => `空きコマ ${a}–${b}`,
      classNow: '授業中', classNext: '次', seeTimetable: '時間割を見る',
      toTop: 'ページの先頭へ',
      removeAll: (n) => `すべて削除(${n}コマ)`,
      clearedTimetable: (n) => `授業${n}コマをすべて削除しました`,
      daysHint: '(同じ時間の曜日はまとめて選べます)',
      aiPendingBadge: 'AI整理前', aiPendingNote: '届いたばかりのお知らせで、まだAIが読んでいません。ルールで見つけた締切と特典だけを先に表示しています。まもなく詳しい要約と翻訳に置き換わります。'
    }
  };

  for (const lang of Object.keys(ADD)) Object.assign(I.T[lang], ADD[lang]);
  I.EXTRA_KEYS = (I.EXTRA_KEYS || []).concat(Object.keys(ADD.ko));
})(typeof window !== 'undefined' ? window : globalThis);
