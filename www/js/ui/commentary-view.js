import { store } from '../core/store.js';
import { getBookName, formatReference } from '../core/canon.js';
import { myswordCommentaryAdapter } from '../formats/mysword-commentary.js';
import { appLogger } from '../core/logger.js';

const SHORT_BOOK_ABBR = [
  '',
  'Gn', 'Êx', 'Lv', 'Nm', 'Dt', 'Js', 'Jz', 'Rt', '1Sm', '2Sm',
  '1Rs', '2Rs', '1Cr', '2Cr', 'Ed', 'Ne', 'Et', 'Jó', 'Sl', 'Pv',
  'Ec', 'Ct', 'Is', 'Jr', 'Lm', 'Ez', 'Dn', 'Os', 'Jl', 'Am',
  'Ob', 'Jn', 'Mq', 'Na', 'Hc', 'Sf', 'Ag', 'Zc', 'Ml',
  'Mt', 'Mc', 'Lc', 'Jo', 'At', 'Rm', '1Co', '2Co', 'Gl', 'Ef',
  'Fp', 'Cl', '1Ts', '2Ts', '1Tm', '2Tm', 'Tt', 'Fm', 'Hb', 'Tg',
  '1Pe', '2Pe', '1Jo', '2Jo', '3Jo', 'Jd', 'Ap'
];

const LOADING_DEBOUNCE_MS = 160;

let callbacks = {
  onOpenSources: () => {},
  onOpenLogs: () => {},
  onOpenFootnote: () => {},
  onToast: () => {},
  onNavigateBible: () => {},
  onLookupDictionary: () => {},
  onOpenCommentaryPicker: () => {},
  onStateMetaChange: () => {}
};

let renderSeq = 0;
let loadingTimer = null;
let currentSections = [];
let activeSectionKey = '';
let currentMeta = {
  activeModule: null,
  book: 1,
  chapter: 1,
  verse: 1,
  refShort: 'Gn 1:1'
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCompactRef(bookId, chapter, verse = 1) {
  const b = Number(bookId) || 1;
  const abbr = SHORT_BOOK_ABBR[b] || getBookName(b).slice(0, 4);
  const c = Number(chapter) || 1;
  const v = Number(verse) || 1;
  return `${abbr} ${c}:${v}`;
}

function getPreferredModuleTitle(mod, fallback = 'Comentário') {
  if (!mod) return fallback;
  const sortBy = store.getPrefs().bibleSortBy === 'title' ? 'title' : 'abbr';
  return sortBy === 'title'
    ? (mod.title || mod.abbr || mod.fileName || fallback)
    : (mod.abbr || mod.title || mod.fileName || fallback);
}

function getSectionKey(sec) {
  if (!sec) return '';
  return `${sec.book || 0}:${sec.chapter || 0}:${sec.fromVerse || 0}-${sec.toVerse || 0}:${sec.isIntro ? 'intro' : 'body'}`;
}

function formatSectionPillLabel(sec) {
  if (!sec) return '';
  if (sec.isIntro || Number(sec.chapter) <= 0) return 'Introdução';
  const from = Number(sec.fromVerse) || 0;
  const to = Number(sec.toVerse) || from;
  if (from <= 0) return `Cap. ${sec.chapter}`;
  if (to > from) return `${from}–${to}`;
  return `v. ${from}`;
}

function formatSectionHeading(sec) {
  if (!sec) return '';
  const bookName = getBookName(sec.book || 1);
  if (sec.isIntro || Number(sec.chapter) <= 0) {
    return `${bookName} — Introdução`;
  }
  const from = Number(sec.fromVerse) || 0;
  const to = Number(sec.toVerse) || from;
  if (from <= 0) return `${bookName} ${sec.chapter}`;
  if (to > from) return `${bookName} ${sec.chapter}:${from}–${to}`;
  return `${bookName} ${sec.chapter}:${from}`;
}

function formatScopeTag(sec) {
  if (!sec) return '';
  if (sec.isIntro || Number(sec.chapter) <= 0) return 'Livro';
  const from = Number(sec.fromVerse) || 0;
  const to = Number(sec.toVerse) || from;
  if (from <= 0) return 'Capítulo';
  if (to > from) return 'Porção';
  return 'Versículo';
}

function clearPendingLoadingTimer() {
  if (loadingTimer !== null) {
    window.clearTimeout(loadingTimer);
    loadingTimer = null;
  }
}

function emitMeta(activeMod, book, chapter, verse) {
  const refShort = formatCompactRef(book, chapter, verse);
  currentMeta = {
    activeModule: activeMod || null,
    book,
    chapter,
    verse,
    refShort
  };
  callbacks.onStateMetaChange({ ...currentMeta });
}

function renderEmpty({ title, message, showSourcesBtn = true }) {
  clearPendingLoadingTimer();
  const container = document.getElementById('reader-content');
  if (!container) return;
  container.classList.remove('has-interlinear');
  currentSections = [];
  activeSectionKey = '';

  container.innerHTML = `
    <div class="empty-state">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      ${showSourcesBtn ? '<div class="empty-state-actions"><button type="button" class="primary-btn" id="cmt-empty-sources">Abrir Configurações e Fontes</button></div>' : ''}
    </div>
  `;

  container.querySelector('#cmt-empty-sources')?.addEventListener('click', () => {
    callbacks.onOpenSources();
  });
}

function renderLoadingPlaceholder(book, chapter, verse) {
  const container = document.getElementById('reader-content');
  if (!container) return;
  container.classList.remove('has-interlinear');
  const refLabel = formatReference(book, chapter, verse);
  container.innerHTML = `
    <div class="cmt-loading-box">
      <span>Carregando comentário de <strong>${escapeHtml(refLabel)}</strong>...</span>
    </div>
  `;
}

function renderCommentaryCard(mod, book, chapter, verse, sections, selectedSec, { resetScroll = true } = {}) {
  clearPendingLoadingTimer();
  const container = document.getElementById('reader-content');
  if (!container) return;
  container.classList.remove('has-interlinear');

  const modShort = getPreferredModuleTitle(mod, 'Comentário');
  const modFull = mod.title || modShort;
  const refHeader = formatReference(book, chapter, verse);

  const pillsHtml = sections.length > 1
    ? (
      '<div class="cmt-pills-bar" role="tablist" aria-label="Seções do comentário">' +
        sections.map((sec, idx) => {
          const isCur = getSectionKey(sec) === activeSectionKey;
          return (
            `<button type="button" class="cmt-pill${isCur ? ' is-active' : ''}" data-cmt-sec-idx="${idx}">` +
              escapeHtml(formatSectionPillLabel(sec)) +
            '</button>'
          );
        }).join('') +
      '</div>'
    )
    : '';

  let bodyHtml = '';
  if (!selectedSec) {
    bodyHtml = `
      <div class="cmt-card">
        <div class="cmt-empty-passage">
          <p style="margin:0 0 10px;">Este comentário não possui anotações específicas para <strong>${escapeHtml(refHeader)}</strong>.</p>
          <button type="button" class="secondary-btn" id="cmt-btn-pick-other">Ver outros comentários para esta passagem</button>
        </div>
      </div>
    `;
  } else {
    const secHeading = formatSectionHeading(selectedSec);
    const scopeTag = formatScopeTag(selectedSec);
    const contentHtml = selectedSec.html || selectedSec.data || selectedSec.content || '<p>Sem conteúdo textual.</p>';

    bodyHtml = `
      <article class="cmt-card">
        <header class="cmt-card-head">
          <h2 class="cmt-card-heading">${escapeHtml(secHeading)}</h2>
          <span class="cmt-scope-badge">${escapeHtml(scopeTag)}</span>
        </header>
        <div class="cmt-card-modline">${escapeHtml(modFull)}</div>
        <div class="cmt-entry-body">${contentHtml}</div>
      </article>
    `;
  }

  container.innerHTML = `
    <div class="cmt-shell">
      <div class="cmt-context-bar">
        <div class="cmt-context-info">
          <span class="cmt-context-ref">${escapeHtml(refHeader)}</span>
          <span class="cmt-context-sub">${escapeHtml(modShort)}${modFull && modFull !== modShort ? ` • ${escapeHtml(modFull)}` : ''}</span>
        </div>
        <div class="cmt-context-actions">
          <button type="button" class="cmt-action-btn" id="cmt-btn-others" title="Escolher outro comentário que cobre esta passagem">Outros</button>
          <button type="button" class="cmt-action-btn" id="cmt-btn-bible" title="Abrir passagem na Bíblia">Ver na Bíblia</button>
        </div>
      </div>
      ${pillsHtml}
      ${bodyHtml}
    </div>
  `;

  if (resetScroll) {
    const scrollBox = document.getElementById('reader-scroll');
    if (scrollBox) {
      scrollBox.scrollTo({ top: 0, behavior: 'auto' });
    }
  }
}

function pickBestSection(sections, verse, explicitSection = null, showIntro = false) {
  if (!Array.isArray(sections) || !sections.length) return null;

  if (showIntro) {
    const intro = sections.find((s) => s.isIntro || Number(s.chapter) <= 0);
    if (intro) return intro;
  }

  if (explicitSection) {
    const expFrom = Number(explicitSection.fromVerse) || 0;
    const expTo = Number(explicitSection.toVerse) || expFrom;
    const exactMatch = sections.find(
      (s) => Number(s.fromVerse) === expFrom && Number(s.toVerse || s.fromVerse) === expTo
    );
    if (exactMatch) return exactMatch;
  }

  const v = Number(verse) || 1;
  // 1. Versículo exato
  const exactVerse = sections.find(
    (s) => !s.isIntro && Number(s.fromVerse) === v && Number(s.toVerse || s.fromVerse) === v
  );
  if (exactVerse) return exactVerse;

  // 2. Porção mais específica que contém o versículo
  const covering = sections
    .filter((s) => {
      if (s.isIntro || Number(s.chapter) <= 0) return false;
      const from = Number(s.fromVerse) || 0;
      const to = Number(s.toVerse) || from;
      return from > 0 && v >= from && v <= to;
    })
    .sort((a, b) => {
      const spanA = (Number(a.toVerse) || Number(a.fromVerse)) - Number(a.fromVerse);
      const spanB = (Number(b.toVerse) || Number(b.fromVerse)) - Number(b.fromVerse);
      return spanA - spanB;
    });
  if (covering.length) return covering[0];

  // 3. Nota de capítulo inteiro
  const chapWide = sections.find((s) => !s.isIntro && Number(s.fromVerse) <= 0);
  if (chapWide) return chapWide;

  return sections[0];
}

async function fetchChapterSections(mod, book, chapter) {
  if (!mod || !mod.path) return [];
  if (typeof myswordCommentaryAdapter.getChapterSections === 'function') {
    const list = await myswordCommentaryAdapter.getChapterSections(mod.path, book, chapter);
    if (Array.isArray(list)) return list;
  }
  if (typeof myswordCommentaryAdapter.getPassageCommentary === 'function') {
    const res = await myswordCommentaryAdapter.getPassageCommentary(mod.path, book, chapter, 1);
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.sections)) return res.sections;
    if (res && (res.html || res.data)) return [res];
  }
  return [];
}

export async function renderCommentaryView({
  resetScroll = true,
  showIntro = false,
  explicitSection = null
} = {}) {
  if (store.getActiveMode() !== 'commentary') return;

  const seq = ++renderSeq;
  const st = store.getState();
  const activeMod = store.getActiveCommentary();
  const book = Number(st.book) || 1;
  const chapter = Number(st.chapter) || 1;
  const verse = Number(st.verse) || 1;

  emitMeta(activeMod, book, chapter, verse);

  if (!activeMod) {
    renderEmpty({
      title: 'Nenhum comentário adicionado',
      message: 'Adicione arquivos .cmt.mybible em Configurações → Fontes para consultar comentários bíblicos.',
      showSourcesBtn: true
    });
    return;
  }

  // Só mostra o cartão de carregamento se a consulta demorar mais de 160ms,
  // evitando o piscar rápido entre uma seção/tela e outra.
  clearPendingLoadingTimer();
  loadingTimer = window.setTimeout(() => {
    if (seq === renderSeq && store.getActiveMode() === 'commentary') {
      renderLoadingPlaceholder(book, chapter, verse);
    }
  }, LOADING_DEBOUNCE_MS);

  try {
    const sections = await fetchChapterSections(activeMod, book, chapter);
    if (seq !== renderSeq || store.getActiveMode() !== 'commentary') return;

    clearPendingLoadingTimer();
    currentSections = Array.isArray(sections) ? sections : [];

    let selected = null;
    if (!showIntro && !explicitSection && activeSectionKey) {
      const stillInChapter = currentSections.find((s) => getSectionKey(s) === activeSectionKey);
      if (stillInChapter) {
        const from = Number(stillInChapter.fromVerse) || 0;
        const to = Number(stillInChapter.toVerse) || from;
        if (from <= 0 || (verse >= from && verse <= to)) {
          selected = stillInChapter;
        }
      }
    }

    if (!selected) {
      selected = pickBestSection(currentSections, verse, explicitSection, showIntro);
    }

    activeSectionKey = selected ? getSectionKey(selected) : '';
    renderCommentaryCard(activeMod, book, chapter, verse, currentSections, selected, { resetScroll });
  } catch (err) {
    if (seq !== renderSeq || store.getActiveMode() !== 'commentary') return;
    clearPendingLoadingTimer();
    appLogger.error('COMMENTARY_VIEW', 'Erro ao carregar comentário', err);
    renderEmpty({
      title: 'Erro ao ler comentário',
      message: err && err.message ? err.message : String(err),
      showSourcesBtn: false
    });
  }
}

export async function stepCommentarySection(delta) {
  if (store.getActiveMode() !== 'commentary') return;
  const step = Number(delta) || 0;
  if (!step) return;

  const activeMod = store.getActiveCommentary();
  if (!activeMod) return;

  const st = store.getState();
  const book = Number(st.book) || 1;
  const chapter = Number(st.chapter) || 1;
  const verse = Number(st.verse) || 1;

  if (!currentSections.length) {
    await renderCommentaryView({ resetScroll: true });
    return;
  }

  const curIdx = currentSections.findIndex((s) => getSectionKey(s) === activeSectionKey);
  const nextIdx = (curIdx >= 0 ? curIdx : 0) + step;

  if (nextIdx >= 0 && nextIdx < currentSections.length) {
    const targetSec = currentSections[nextIdx];
    activeSectionKey = getSectionKey(targetSec);
    const targetVerse = Number(targetSec.fromVerse) > 0 ? Number(targetSec.fromVerse) : verse;
    store.setActiveVerse(targetVerse, { silent: true });
    emitMeta(activeMod, book, chapter, targetVerse);
    renderCommentaryCard(activeMod, book, chapter, targetVerse, currentSections, targetSec, { resetScroll: true });
    return;
  }

  // Avança ou retrocede capítulo quando atingir a extremidade das seções do capítulo atual
  const nextChapter = step > 0 ? chapter + 1 : Math.max(1, chapter - 1);
  if (nextChapter === chapter && step < 0) return;

  activeSectionKey = '';
  store.setLocation(book, nextChapter, 1);
}

export function getCommentaryViewState() {
  return { ...currentMeta };
}

export function initCommentaryView(opts = {}) {
  callbacks = { ...callbacks, ...opts };

  const container = document.getElementById('reader-content');
  if (!container) return;

  container.addEventListener('click', (ev) => {
    if (store.getActiveMode() !== 'commentary') return;

    const pillBtn = ev.target.closest('[data-cmt-sec-idx]');
    if (pillBtn) {
      ev.stopPropagation();
      const idx = Number(pillBtn.getAttribute('data-cmt-sec-idx'));
      const sec = currentSections[idx];
      if (!sec) return;
      const activeMod = store.getActiveCommentary();
      const st = store.getState();
      const targetVerse = Number(sec.fromVerse) > 0 ? Number(sec.fromVerse) : (Number(st.verse) || 1);
      activeSectionKey = getSectionKey(sec);
      store.setActiveVerse(targetVerse, { silent: true });
      emitMeta(activeMod, st.book || 1, st.chapter || 1, targetVerse);
      renderCommentaryCard(activeMod, st.book || 1, st.chapter || 1, targetVerse, currentSections, sec, { resetScroll: true });
      return;
    }

    if (ev.target.closest('#cmt-btn-others') || ev.target.closest('#cmt-btn-pick-other')) {
      ev.stopPropagation();
      callbacks.onOpenCommentaryPicker();
      return;
    }

    if (ev.target.closest('#cmt-btn-bible')) {
      ev.stopPropagation();
      const st = store.getState();
      callbacks.onNavigateBible({
        book: Number(st.book) || 1,
        chapter: Number(st.chapter) || 1,
        verse: Number(st.verse) || 1
      });
      return;
    }

    const strongEl = ev.target.closest('[data-strong]');
    if (strongEl && strongEl.dataset.strong) {
      ev.stopPropagation();
      callbacks.onLookupDictionary(strongEl.dataset.strong, { moduleHint: 'strong' });
    }
  });
}
