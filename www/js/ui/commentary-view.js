import { store } from '../core/store.js';
import { getBookName, formatReference } from '../core/canon.js';
import { parseBibleReference } from '../core/bible-refs.js';
import { appLogger } from '../core/logger.js';
import { myswordCommentaryAdapter } from '../formats/mysword-commentary.js';
import { resolveDictionaryImageUrl } from '../formats/media-cache.js';
import { ensureCompanionStyles } from '../formats/companion-dicts.js';

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

const cmtState = {
  entries: [],
  chapterSections: [],
  hasIntro: false,
  showingIntro: false,
  explicitSection: null, // { book, chapter, fromVerse, toVerse } | null
  currentCursor: null    // { book, chapter, fromVerse }
};

let renderSeq = 0;
let imageRenderSeq = 0;
let loadingTimer = null;

let callbacks = {
  onOpenSources: () => {},
  onOpenLogs: () => {},
  onOpenFootnote: () => {},
  onNavigateBible: () => {},
  onLookupDictionary: () => {},
  onOpenCommentaryPicker: () => {},
  onStateMetaChange: () => {},
  onToast: () => {}
};

function clearPendingLoadingTimer() {
  if (loadingTimer !== null) {
    window.clearTimeout(loadingTimer);
    loadingTimer = null;
  }
}

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

function getPreferredLabel(mod, fallback = 'Comentário') {
  if (!mod) return fallback;
  const sortBy = store.getPrefs().bibleSortBy === 'title' ? 'title' : 'abbr';
  return sortBy === 'title'
    ? (mod.title || mod.abbr || mod.fileName || fallback)
    : (mod.abbr || mod.title || mod.fileName || fallback);
}

function getSourceLine(mod) {
  if (!mod) return 'Comentário';
  const sortBy = store.getPrefs().bibleSortBy === 'title' ? 'title' : 'abbr';
  const primary = getPreferredLabel(mod, 'Comentário');
  const secondary = sortBy === 'title' ? (mod.abbr || '') : (mod.title || '');
  return secondary && secondary !== primary ? `${primary} • ${secondary}` : primary;
}

function openImageLightbox(src, altText) {
  if (typeof document === 'undefined' || !src) return;

  const existing = document.getElementById('dct-lightbox');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'dct-lightbox';
  overlay.className = 'dct-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', altText || 'Imagem ampliada');

  const img = document.createElement('img');
  img.src = src;
  img.alt = altText || '';
  overlay.appendChild(img);

  const close = () => {
    overlay.remove();
    window.removeEventListener('keydown', onKey);
  };

  const onKey = (ev) => {
    if (ev.key === 'Escape') close();
  };

  overlay.addEventListener('click', close);
  window.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
}

function showImageErrorHint(picEl, rawSrc, reason) {
  if (!picEl) return;
  picEl.innerHTML =
    '<figcaption class="dct-info" style="margin:4px 6px;text-align:left;">' +
      `Imagem não carregada (${escapeHtml(rawSrc)}): ${escapeHtml(reason || 'erro desconhecido')}` +
    '</figcaption>';
}

async function hydrateCommentaryImages(rootEl, modulePath, entries, seq) {
  if (!rootEl || !modulePath) return;
  const cards = Array.from(rootEl.querySelectorAll('.cmt-entry-card[data-cmt-entry-idx]'));
  if (!cards.length) return;

  const modName = modulePath.split(/[\\/]/).pop() || modulePath;

  for (const card of cards) {
    const entryIdx = Number(card.getAttribute('data-cmt-entry-idx'));
    const entry = entries[entryIdx];
    if (!entry || !entry.hasImages) continue;

    const imgs = Array.from(card.querySelectorAll('img[data-dct-img-src]'));
    for (const img of imgs) {
      if (seq !== imageRenderSeq) return;
      const rawSrc = img.getAttribute('data-dct-img-src') || '';
      const fallbackUrl = img.getAttribute('data-dct-img-fallback') || '';
      const picEl = img.closest('.dct-pic');

      try {
        const res = await resolveDictionaryImageUrl(modulePath, rawSrc, {
          contextRaw: entry.raw || '',
          fallbackUrl
        });
        if (seq !== imageRenderSeq) return;

        const resolvedUrl = typeof res === 'string'
          ? res
          : (res && res.url ? res.url : '');
        const errReason = res && typeof res === 'object' && res.error
          ? res.error
          : 'não encontrada';

        if (!resolvedUrl) {
          img.classList.remove('is-loading');
          appLogger.warn('CMT_IMG', `Imagem não carregada (${rawSrc}) em ${modName}: ${errReason}`, {
            module: modName,
            src: rawSrc,
            fallbackUrl
          });
          showImageErrorHint(picEl, rawSrc, errReason);
          continue;
        }

        img.onload = () => img.classList.remove('is-loading');
        img.onerror = () => {
          img.classList.remove('is-loading');
          showImageErrorHint(picEl, rawSrc, 'falha ao decodificar no WebView');
        };
        img.src = resolvedUrl;
        if (img.complete && img.naturalWidth > 0) {
          img.classList.remove('is-loading');
        }
      } catch (err) {
        if (seq !== imageRenderSeq) return;
        const reason = err && err.message ? err.message : 'erro inesperado';
        img.classList.remove('is-loading');
        appLogger.error('CMT_IMG', `Exceção ao carregar imagem (${rawSrc}) em ${modName}: ${reason}`, err);
        showImageErrorHint(picEl, rawSrc, reason);
      }
    }
  }
}

function sectionMatchesVerse(sec, chapter, verse) {
  if (!sec) return false;
  if (sec.chapterEnd > sec.chapter) {
    if (chapter < sec.chapter || chapter > sec.chapterEnd) return false;
    if (chapter > sec.chapter && chapter < sec.chapterEnd) return true;
    if (chapter === sec.chapter) return sec.fromVerse <= 0 || verse >= sec.fromVerse;
    if (chapter === sec.chapterEnd) return sec.toVerse <= 0 || verse <= sec.toVerse;
    return false;
  }
  if (sec.chapter !== chapter) return false;
  if (sec.fromVerse <= 0) return true;
  return sec.fromVerse <= verse && sec.toVerse >= verse;
}

function notifyMeta(mod, book, chapter, verse) {
  const refShort = formatCompactRef(book, chapter, verse);
  callbacks.onStateMetaChange({
    activeModule: mod,
    book,
    chapter,
    verse,
    refShort,
    entryCount: cmtState.entries.length,
    showingIntro: cmtState.showingIntro
  });
}

function buildContextBarHtml(mod, book, chapter, verse) {
  const refFull = cmtState.showingIntro
    ? `Introdução — ${getBookName(book)}`
    : formatReference(book, chapter, verse);
  const introBtnHtml = cmtState.hasIntro
    ? `<button type="button" class="cmt-mini-btn${cmtState.showingIntro ? ' is-active' : ''}" id="cmt-btn-intro">Introdução</button>`
    : '';
  const allCmtsCount = store.getCommentaries().length;
  const othersBtnHtml = allCmtsCount > 1
    ? '<button type="button" class="cmt-mini-btn" id="cmt-btn-others">Outros</button>'
    : '';

  return (
    '<div class="cmt-context-bar">' +
      '<div class="cmt-context-ref">' +
        `<span class="cmt-context-title">${escapeHtml(refFull)}</span>` +
        `<span class="cmt-context-sub">${escapeHtml(getSourceLine(mod))}</span>` +
      '</div>' +
      '<div class="cmt-context-actions">' +
        introBtnHtml +
        othersBtnHtml +
        '<button type="button" class="cmt-mini-btn" id="cmt-btn-open-bible">Ver na Bíblia</button>' +
      '</div>' +
    '</div>'
  );
}

function buildSectionsStripHtml(chapter, verse) {
  const sections = cmtState.chapterSections;
  if (!sections.length) return '';

  const chipsHtml = sections.map((sec, idx) => {
    let isActive = false;
    if (!cmtState.showingIntro) {
      if (cmtState.explicitSection) {
        isActive =
          cmtState.explicitSection.chapter === sec.chapter &&
          cmtState.explicitSection.fromVerse === sec.fromVerse &&
          cmtState.explicitSection.toVerse === sec.toVerse;
      } else {
        isActive = sectionMatchesVerse(sec, chapter, verse);
      }
    }
    return (
      `<button type="button" class="cmt-section-chip${isActive ? ' is-active' : ''}" data-cmt-sec-idx="${idx}" title="${escapeHtml(sec.label)}">` +
        escapeHtml(sec.shortLabel) +
      '</button>'
    );
  }).join('');

  return `<div class="cmt-sections-strip" id="cmt-sections-strip">${chipsHtml}</div>`;
}

function buildEntriesCardsHtml(entries) {
  return entries.map((entry, idx) => {
    const dirAttr = entry.isRtl ? ' dir="rtl"' : '';
    const badgeCls = `cmt-scope-badge cmt-scope-badge--${entry.scopeKind || 'verse'}`;
    return (
      `<section class="cmt-entry-card" data-cmt-entry-idx="${idx}">` +
        '<div class="cmt-entry-head">' +
          `<h2 class="cmt-entry-ref">${escapeHtml(entry.label)}</h2>` +
          `<span class="${badgeCls}">${escapeHtml(entry.badge)}</span>` +
        '</div>' +
        `<div class="cmt-entry-body"${dirAttr}>${entry.html}</div>` +
      '</section>'
    );
  }).join('');
}

function buildFallbackHtml(mod, book, chapter, verse) {
  const refLabel = formatReference(book, chapter, verse);
  const sections = cmtState.chapterSections;
  const hasOtherCmts = store.getCommentaries().length > 1;

  const actions = [];
  if (hasOtherCmts) {
    actions.push('<button type="button" class="primary-btn" id="cmt-fb-others">Ver outros comentários desta passagem</button>');
  }
  if (cmtState.hasIntro && !cmtState.showingIntro) {
    actions.push(`<button type="button" class="secondary-btn" id="cmt-fb-intro">Ler introdução de ${escapeHtml(getBookName(book))}</button>`);
  }
  actions.push('<button type="button" class="secondary-btn" id="cmt-fb-prev">&larr; Seção anterior</button>');
  actions.push('<button type="button" class="secondary-btn" id="cmt-fb-next">Próxima seção &rarr;</button>');

  const chapterChipsHtml = sections.length
    ? (
      `<p style="margin:12px 0 4px;">Seções disponíveis em <strong>${escapeHtml(getBookName(book))} ${chapter}</strong> neste comentário:</p>` +
      '<div class="cmt-fallback-chips">' +
        sections.map((sec, idx) => (
          `<button type="button" class="cmt-section-chip" data-cmt-sec-idx="${idx}">${escapeHtml(sec.shortLabel)}</button>`
        )).join('') +
      '</div>'
    )
    : `<p style="margin:10px 0 0;">Este módulo também não possui comentários registrados para o capítulo ${chapter} de ${escapeHtml(getBookName(book))}.</p>`;

  return (
    '<div class="cmt-fallback-box">' +
      `<h2>Sem comentário em ${escapeHtml(refLabel)}</h2>` +
      `<p><strong>${escapeHtml(getPreferredLabel(mod))}</strong> não possui bloco cobrindo diretamente ${escapeHtml(refLabel)} (nem por versículo, porção ou capítulo).</p>` +
      `<div class="empty-state-actions" style="justify-content:flex-start;">${actions.join('')}</div>` +
      chapterChipsHtml +
    '</div>'
  );
}

function bindCommentaryEvents(rootEl, mod, book, chapter, verse) {
  rootEl.querySelector('#cmt-btn-intro')?.addEventListener('click', () => {
    renderCommentaryView({
      resetScroll: true,
      showIntro: !cmtState.showingIntro
    });
  });

  rootEl.querySelector('#cmt-fb-intro')?.addEventListener('click', () => {
    renderCommentaryView({ resetScroll: true, showIntro: true });
  });

  rootEl.querySelector('#cmt-btn-others')?.addEventListener('click', () => {
    callbacks.onOpenCommentaryPicker();
  });

  rootEl.querySelector('#cmt-fb-others')?.addEventListener('click', () => {
    callbacks.onOpenCommentaryPicker();
  });

  rootEl.querySelector('#cmt-btn-open-bible')?.addEventListener('click', () => {
    callbacks.onNavigateBible({ book, chapter, verse });
  });

  rootEl.querySelector('#cmt-fb-prev')?.addEventListener('click', () => {
    stepCommentarySection(-1);
  });

  rootEl.querySelector('#cmt-fb-next')?.addEventListener('click', () => {
    stepCommentarySection(1);
  });

  rootEl.querySelector('#cmt-btn-open-sources')?.addEventListener('click', () => {
    callbacks.onOpenSources();
  });

  rootEl.querySelector('#cmt-btn-open-logs')?.addEventListener('click', () => {
    callbacks.onOpenLogs();
  });

  rootEl.addEventListener('click', (ev) => {
    const secBtn = ev.target.closest('[data-cmt-sec-idx]');
    if (secBtn) {
      const idx = Number(secBtn.getAttribute('data-cmt-sec-idx'));
      const sec = cmtState.chapterSections[idx];
      if (sec) {
        const nextVerse = sec.fromVerse > 0 ? sec.fromVerse : 1;
        store.setActiveVerse(nextVerse, { silent: true });
        renderCommentaryView({
          resetScroll: true,
          explicitSection: {
            book: sec.book,
            chapter: sec.chapter,
            fromVerse: sec.fromVerse,
            toVerse: sec.toVerse
          }
        });
      }
      return;
    }

    const imgEl = ev.target.closest('img.dct-img');
    if (imgEl && !imgEl.classList.contains('is-loading') && (imgEl.currentSrc || imgEl.src)) {
      ev.stopPropagation();
      openImageLightbox(imgEl.currentSrc || imgEl.src, imgEl.alt || formatReference(book, chapter, verse));
      return;
    }

    const fnBtn = ev.target.closest('.v-fn-btn');
    if (fnBtn) {
      const card = fnBtn.closest('.cmt-entry-card[data-cmt-entry-idx]');
      const entryIdx = card ? Number(card.getAttribute('data-cmt-entry-idx')) : 0;
      const fnIdx = Number(fnBtn.getAttribute('data-fn-idx'));
      const entry = cmtState.entries[entryIdx];
      const noteText = entry && Array.isArray(entry.footnotes) ? entry.footnotes[fnIdx] : '';
      if (noteText) {
        callbacks.onOpenFootnote(entry.label || formatReference(book, chapter, verse), noteText);
      }
      return;
    }

    const bibleLink = ev.target.closest('[data-bible-ref]');
    if (bibleLink) {
      const attrRaw = bibleLink.getAttribute('data-bible-ref') || '';
      const textRaw = (bibleLink.textContent || '').trim();
      const parsed =
        parseBibleReference(attrRaw, { allowChapterOnly: true }) ||
        parseBibleReference(textRaw, { allowChapterOnly: false, allowNumeric: false });
      if (parsed) {
        callbacks.onNavigateBible(parsed);
      } else {
        callbacks.onToast(`Referência não reconhecida: ${attrRaw || textRaw}`);
      }
      return;
    }

    const dctLink = ev.target.closest('[data-dct-lookup]');
    if (dctLink) {
      const term = (dctLink.getAttribute('data-dct-lookup') || '').trim();
      const modHint = (dctLink.getAttribute('data-dct-module') || '').trim();
      const labelTxt = (dctLink.textContent || '').trim();

      const isExplicitBible = /^#?(?:rx|b|v)[\s.:_-]*(?:\d|[A-Za-zÀ-ÿ])|^tw:\/\/bible|^bible:/i.test(term);
      const bibleTarget = isExplicitBible
        ? parseBibleReference(term, { allowChapterOnly: true })
        : (!modHint
          ? (parseBibleReference(term, { allowChapterOnly: false, allowNumeric: false })
            || parseBibleReference(labelTxt, { allowChapterOnly: false, allowNumeric: false }))
          : null);

      if (bibleTarget) {
        ev.preventDefault();
        ev.stopPropagation();
        callbacks.onNavigateBible(bibleTarget);
        return;
      }

      if (term) {
        callbacks.onLookupDictionary(term, {
          moduleHint: modHint,
          sourceModulePath: mod && mod.path ? mod.path : ''
        });
      }
    }
  });
}

export function initCommentaryView(userCallbacks = {}) {
  callbacks = { ...callbacks, ...userCallbacks };
  ensureCompanionStyles();
}

export function getCommentaryViewState() {
  const st = store.getState();
  return {
    activeModule: store.getActiveCommentary(),
    book: st.book,
    chapter: st.chapter,
    verse: st.verse || 1,
    entries: cmtState.entries,
    showingIntro: cmtState.showingIntro
  };
}

export async function renderCommentaryView({
  resetScroll = true,
  explicitSection = null,
  showIntro = false
} = {}) {
  if (store.getActiveMode() !== 'commentary') {
    clearPendingLoadingTimer();
    return;
  }

  const seq = ++renderSeq;
  const imgSeq = ++imageRenderSeq;
  const container = document.getElementById('reader-content');
  const scrollBox = document.getElementById('reader-scroll');
  if (!container) return;

  clearPendingLoadingTimer();
  ensureCompanionStyles();
  container.classList.remove('has-interlinear');

  const st = store.getState();
  const book = st.book || 1;
  const chapter = st.chapter || 1;
  const verse = st.verse || 1;
  const mod = store.getActiveCommentary();

  if (!mod) {
    cmtState.entries = [];
    cmtState.chapterSections = [];
    cmtState.hasIntro = false;
    cmtState.showingIntro = false;
    cmtState.explicitSection = null;
    cmtState.currentCursor = null;

    container.innerHTML =
      '<div class="empty-state">' +
        '<h2>Nenhum comentário carregado</h2>' +
        '<p>Adicione um arquivo ou pasta de comentários MySword (.cmt.mybible) em Configurações → Fontes para ler os comentários sincronizados com a passagem bíblica ativa.</p>' +
        '<div class="empty-state-actions">' +
          '<button type="button" class="primary-btn" id="cmt-btn-open-sources">Adicionar Comentários (.cmt)</button>' +
        '</div>' +
      '</div>';
    container.querySelector('#cmt-btn-open-sources')?.addEventListener('click', () => {
      callbacks.onOpenSources();
    });
    notifyMeta(null, book, chapter, verse);
    return;
  }

  cmtState.showingIntro = Boolean(showIntro);
  cmtState.explicitSection = explicitSection ? { ...explicitSection } : null;

  loadingTimer = window.setTimeout(() => {
    loadingTimer = null;
    if (seq !== renderSeq || store.getActiveMode() !== 'commentary') return;
    container.innerHTML =
      '<div class="empty-state">' +
        `<p>Carregando comentário de ${escapeHtml(formatReference(book, chapter, verse))}...</p>` +
      '</div>';
  }, LOADING_DEBOUNCE_MS);

  try {
    const [entriesRaw, sections, hasIntro] = await Promise.all([
      showIntro
        ? myswordCommentaryAdapter.getBookIntro(mod.path, book).then((r) => (r ? [r] : []))
        : explicitSection
          ? myswordCommentaryAdapter.getSectionByRange(
              mod.path,
              explicitSection.book,
              explicitSection.chapter,
              explicitSection.fromVerse,
              explicitSection.toVerse
            )
          : myswordCommentaryAdapter.getEntriesForPassage(mod.path, book, chapter, verse),
      myswordCommentaryAdapter.getChapterSections(mod.path, book, chapter).catch(() => []),
      myswordCommentaryAdapter.hasBookIntro(mod.path, book).catch(() => false)
    ]);

    if (seq !== renderSeq || store.getActiveMode() !== 'commentary') return;
    clearPendingLoadingTimer();

    const entries = Array.isArray(entriesRaw) ? entriesRaw : [];
    cmtState.entries = entries;
    cmtState.chapterSections = Array.isArray(sections) ? sections : [];
    cmtState.hasIntro = Boolean(hasIntro);

    if (entries.length) {
      const last = entries[entries.length - 1];
      cmtState.currentCursor = {
        book: last.book || book,
        chapter: last.chapter || chapter,
        fromVerse: last.fromVerse || 0
      };
    } else {
      cmtState.currentCursor = { book, chapter, fromVerse: verse };
    }

    const bodyHtml = entries.length
      ? buildEntriesCardsHtml(entries)
      : buildFallbackHtml(mod, book, chapter, verse);

    container.innerHTML =
      '<div class="cmt-reader">' +
        buildContextBarHtml(mod, book, chapter, verse) +
        buildSectionsStripHtml(chapter, verse) +
        bodyHtml +
      '</div>';

    const rootEl = container.querySelector('.cmt-reader');
    if (rootEl) {
      bindCommentaryEvents(rootEl, mod, book, chapter, verse);

      const activeChip = rootEl.querySelector('.cmt-section-chip.is-active');
      if (activeChip && typeof activeChip.scrollIntoView === 'function') {
        activeChip.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
      }

      if (entries.some((e) => e.hasImages)) {
        hydrateCommentaryImages(rootEl, mod.path, entries, imgSeq);
      }
    }

    notifyMeta(mod, book, chapter, verse);
    if (resetScroll && scrollBox) {
      scrollBox.scrollTop = 0;
    }
  } catch (err) {
    if (seq !== renderSeq || store.getActiveMode() !== 'commentary') return;
    clearPendingLoadingTimer();
    const msg = err && err.message ? err.message : 'Erro ao consultar comentário.';
    appLogger.error('CMT_LOAD', `Falha ao abrir comentário (${getPreferredLabel(mod)}) em ${formatReference(book, chapter, verse)}: ${msg}`, err);

    container.innerHTML =
      '<div class="empty-state">' +
        '<h2>Erro ao ler comentário</h2>' +
        `<p>${escapeHtml(msg)}</p>` +
        '<div class="empty-state-actions">' +
          '<button type="button" class="secondary-btn" id="cmt-btn-open-logs">Abrir Logs</button>' +
          '<button type="button" class="secondary-btn" id="cmt-btn-open-sources">Verificar Fontes</button>' +
        '</div>' +
      '</div>';
    container.querySelector('#cmt-btn-open-logs')?.addEventListener('click', () => callbacks.onOpenLogs());
    container.querySelector('#cmt-btn-open-sources')?.addEventListener('click', () => callbacks.onOpenSources());
    notifyMeta(mod, book, chapter, verse);
  }
}

export async function stepCommentarySection(direction = 1) {
  const mod = store.getActiveCommentary();
  if (!mod) return;

  const st = store.getState();
  const cursor = cmtState.currentCursor || {
    book: st.book || 1,
    chapter: st.chapter || 1,
    fromVerse: st.verse || 1
  };

  try {
    const next = await myswordCommentaryAdapter.getAdjacentSection(
      mod.path,
      cursor.book,
      cursor.chapter,
      cursor.fromVerse,
      direction
    );

    if (!next) {
      callbacks.onToast(direction < 0 ? 'Já está na primeira seção deste comentário.' : 'Já está na última seção deste comentário.');
      return;
    }

    const nextVerse = next.fromVerse > 0 ? next.fromVerse : 1;
    const sameChapter = next.book === st.book && next.chapter === st.chapter;

    if (sameChapter) {
      store.setActiveVerse(nextVerse, { silent: true });
      await renderCommentaryView({
        resetScroll: true,
        explicitSection: {
          book: next.book,
          chapter: next.chapter,
          fromVerse: next.fromVerse,
          toVerse: next.toVerse
        }
      });
    } else {
      store.setLocation(next.book, next.chapter, nextVerse);
    }
  } catch (err) {
    appLogger.error('CMT_STEP', `Erro ao avançar seção em ${getPreferredLabel(mod)}`, err);
    callbacks.onToast('Não foi possível avançar a seção do comentário.');
  }
}
