import { store } from '../core/store.js';
import { eventBus, EVENTS } from '../core/events.js';
import { getBookName, formatReference } from '../core/canon.js';
import { getAdapterForModule } from '../formats/format-registry.js';
import { nativeBridge } from '../bridge/native-bridge.js';
import {
  loadCompanionRefsForChapter,
  buildCompanionBarHtml
} from '../formats/companion-dicts.js';
import {
  loadMapMarkersForChapter,
  buildVerseMapPinHtml
} from '../formats/map-service.js';

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

let callbacks = {
  onOpenSources: () => {},
  onOpenFootnote: () => {},
  onRequestPermission: () => {},
  onLookupDictionary: () => {},
  onOpenCompanionGroup: () => {},
  onOpenVerseMap: () => {},
  onBibleChromeUpdated: () => {}
};

let currentVerses = [];
let currentCompanionMap = new Map();
let currentMapMarkers = new Map();
let selectedVerseNum = null;
let renderSeq = 0;

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCompactRef(bookId, chapter, verse = 0) {
  const b = Number(bookId) || 1;
  const abbr = SHORT_BOOK_ABBR[b] || getBookName(b).slice(0, 4);
  const vNum = Number(verse) || 0;
  return vNum > 0 ? `${abbr} ${chapter}:${vNum}` : `${abbr} ${chapter}`;
}

function getPreferredBibleLabel(bible) {
  if (!bible) return 'Sem Bíblia';
  const sortBy = store.getPrefs().bibleSortBy === 'title' ? 'title' : 'abbr';
  return sortBy === 'title'
    ? (bible.title || bible.abbr || bible.fileName || 'Sem Bíblia')
    : (bible.abbr || bible.title || bible.fileName || 'Sem Bíblia');
}

export async function loadBooksForBible(bible) {
  if (!bible) return [];
  const cached = store.getCachedBooks(bible.path);
  if (cached) return cached;

  const adapter = getAdapterForModule(bible);
  if (!adapter) return [];
  const books = await adapter.getAvailableBooks(bible.path);
  store.setCachedBooks(bible.path, books);
  return books;
}

export async function loadChaptersForBible(bible, bookId) {
  if (!bible) return [];
  const cached = store.getCachedChapters(bible.path, bookId);
  if (cached) return cached;

  const adapter = getAdapterForModule(bible);
  if (!adapter) return [];
  const chapters = await adapter.getChaptersForBook(bible.path, bookId);
  store.setCachedChapters(bible.path, bookId, chapters);
  return chapters;
}

export function initReaderView(opts = {}) {
  callbacks = { ...callbacks, ...opts };

  const container = document.getElementById('reader-content');
  if (!container) return;

  container.addEventListener('click', (ev) => {
    if (store.getActiveMode() !== 'bible') return;

    const fnBtn = ev.target.closest('.v-fn-btn');
    if (fnBtn) {
      ev.stopPropagation();
      const verseEl = fnBtn.closest('.verse-item');
      const verseNum = Number(verseEl && verseEl.dataset.verse);
      const fnIdx = Number(fnBtn.dataset.fnIdx);
      const verseObj = currentVerses.find((v) => v.verse === verseNum);
      if (verseObj && verseObj.footnotes && verseObj.footnotes[fnIdx]) {
        const ref = formatReference(verseObj.book, verseObj.chapter, verseObj.verse);
        callbacks.onOpenFootnote(ref, verseObj.footnotes[fnIdx]);
      }
      return;
    }

    // Símbolo de localização no mapa (pino azul no final do versículo)
    const mapPinBtn = ev.target.closest('.v-map-pin-btn');
    if (mapPinBtn) {
      ev.stopPropagation();
      const vNum = Number(mapPinBtn.dataset.mapVerse);
      const markerInfo = currentMapMarkers.get(vNum);
      if (markerInfo) {
        callbacks.onOpenVerseMap(markerInfo);
      }
      return;
    }

    // Símbolos dos dicionários ilustrados (_br): Animais, Plantas e Objetos
    const cmpBtn = ev.target.closest('.v-companion-btn');
    if (cmpBtn) {
      ev.stopPropagation();
      const vNum = Number(cmpBtn.dataset.cmpVerse);
      const cat = cmpBtn.dataset.cmpCat || '';
      const groups = currentCompanionMap.get(vNum) || [];
      const group = groups.find((g) => g.category === cat);
      if (group) {
        const curState = store.getState();
        const verseObj = currentVerses.find((v) => v.verse === vNum) || {
          book: curState.book,
          chapter: curState.chapter,
          verse: vNum
        };
        const refLabel = formatReference(verseObj.book, verseObj.chapter, verseObj.verse);
        callbacks.onOpenCompanionGroup({ verseObj, group, refLabel });
      }
      return;
    }

    // Busca direta Bíblia -> Dicionário com 1 toque em tags léxicas
    const strongEl = ev.target.closest('[data-strong]');
    if (strongEl && strongEl.dataset.strong) {
      ev.stopPropagation();
      callbacks.onLookupDictionary(strongEl.dataset.strong, { moduleHint: 'strong' });
      return;
    }

    const morphEl = ev.target.closest('[data-morph]');
    if (morphEl && morphEl.dataset.morph) {
      ev.stopPropagation();
      callbacks.onLookupDictionary(morphEl.dataset.morph, { moduleHint: 'morph' });
      return;
    }

    const lnEl = ev.target.closest('[data-ln]');
    if (lnEl && lnEl.dataset.ln) {
      ev.stopPropagation();
      const firstDomain = String(lnEl.dataset.ln).split(',')[0].trim();
      if (firstDomain) {
        callbacks.onLookupDictionary(firstDomain, { moduleHint: 'louw' });
      }
      return;
    }

    const bdbEl = ev.target.closest('[data-bdb]');
    if (bdbEl && bdbEl.dataset.bdb) {
      ev.stopPropagation();
      callbacks.onLookupDictionary(bdbEl.dataset.bdb, { moduleHint: 'bdb' });
      return;
    }

    const twotEl = ev.target.closest('[data-twot]');
    if (twotEl && twotEl.dataset.twot) {
      ev.stopPropagation();
      callbacks.onLookupDictionary(twotEl.dataset.twot, { moduleHint: 'twot' });
      return;
    }

    const gkEl = ev.target.closest('[data-gk], [data-hgk]');
    if (gkEl) {
      const code = gkEl.dataset.gk || gkEl.dataset.hgk || '';
      if (code) {
        ev.stopPropagation();
        callbacks.onLookupDictionary(code, { moduleHint: 'gk' });
        return;
      }
    }

    const actionBtn = ev.target.closest('[data-empty-action]');
    if (actionBtn) {
      const action = actionBtn.dataset.emptyAction;
      if (action === 'sources') callbacks.onOpenSources();
      if (action === 'permission') callbacks.onRequestPermission();
      return;
    }

    const sel = window.getSelection ? window.getSelection() : null;
    if (sel && !sel.isCollapsed && sel.toString().trim()) {
      return;
    }

    const verseEl = ev.target.closest('.verse-item');
    if (!verseEl) return;

    const verseNum = Number(verseEl.dataset.verse);
    const alreadySelected = selectedVerseNum === verseNum;
    selectedVerseNum = alreadySelected ? null : verseNum;

    container.querySelectorAll('.verse-item.is-selected').forEach((el) => {
      el.classList.remove('is-selected');
    });

    const curState = store.getState();
    const refLabel = document.getElementById('label-active-ref');
    const firstVerseNum = currentVerses[0] ? currentVerses[0].verse : 1;

    if (!alreadySelected) {
      verseEl.classList.add('is-selected');
      store.setActiveVerse(verseNum, { silent: true });
      if (refLabel) {
        refLabel.textContent = formatCompactRef(curState.book, curState.chapter, verseNum);
      }
      const verseObj = currentVerses.find((v) => v.verse === verseNum) || null;
      eventBus.emit(EVENTS.VERSE_TAPPED, verseObj);
    } else {
      store.setActiveVerse(firstVerseNum, { silent: true });
      if (refLabel) {
        refLabel.textContent = formatCompactRef(curState.book, curState.chapter, firstVerseNum);
      }
      eventBus.emit(EVENTS.VERSE_TAPPED, null);
    }
  });
}

function updateChrome(bible, bookId, chapter, navLimits = {}, verseFocus = 1) {
  const bibleLabel = document.getElementById('label-active-bible');
  const refLabel = document.getElementById('label-active-ref');
  const metaLabel = document.getElementById('chapter-meta');
  const topPrevBtn = document.getElementById('btn-top-prev-chapter');
  const topNextBtn = document.getElementById('btn-top-next-chapter');
  const prevBtn = document.getElementById('btn-prev-chapter');
  const nextBtn = document.getElementById('btn-next-chapter');

  const activeLabel = getPreferredBibleLabel(bible);

  if (bibleLabel) {
    bibleLabel.textContent = activeLabel;
  }
  if (refLabel) {
    refLabel.textContent = bible ? formatCompactRef(bookId, chapter, verseFocus) : 'Selecionar';
  }
  if (metaLabel && store.getActiveMode() === 'bible') {
    metaLabel.textContent = bible
      ? `${activeLabel} • ${formatReference(bookId, chapter)}`
      : 'Nenhuma fonte configurada';
  }

  const disablePrev = !bible || Boolean(navLimits.isFirst);
  const disableNext = !bible || Boolean(navLimits.isLast);

  if (topPrevBtn) topPrevBtn.disabled = disablePrev;
  if (topNextBtn) topNextBtn.disabled = disableNext;
  if (store.getActiveMode() === 'bible') {
    if (prevBtn) prevBtn.disabled = disablePrev;
    if (nextBtn) nextBtn.disabled = disableNext;
  }

  callbacks.onBibleChromeUpdated({ bible, bookId, chapter });
}

function renderEmptyState({ title, message, primaryLabel, primaryAction, secondaryLabel, secondaryAction }) {
  const container = document.getElementById('reader-content');
  if (!container) return;
  container.classList.remove('has-interlinear');
  currentVerses = [];
  currentCompanionMap = new Map();
  currentMapMarkers = new Map();
  selectedVerseNum = null;

  container.innerHTML = `
    <div class="empty-state">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <div class="empty-state-actions">
        ${primaryLabel ? `<button type="button" class="primary-btn" data-empty-action="${primaryAction}">${escapeHtml(primaryLabel)}</button>` : ''}
        ${secondaryLabel ? `<button type="button" class="secondary-btn" data-empty-action="${secondaryAction}">${escapeHtml(secondaryLabel)}</button>` : ''}
      </div>
    </div>
  `;
}

export async function renderReader({ resetScroll = true, restoreScrollTop = null, scrollToVerse = null } = {}) {
  if (store.getActiveMode() !== 'bible') return;

  const seq = ++renderSeq;
  const state = store.getState();
  const bible = store.getActiveBible();
  const lockedLimits = { isFirst: true, isLast: true, isFirstBook: true, isLastBook: true };

  if (nativeBridge.isNative() && !state.hasStoragePermission) {
    updateChrome(null, state.book, state.chapter, lockedLimits, 0);
    renderEmptyState({
      title: 'Permissão de leitura necessária',
      message: 'Para abrir suas Bíblias MySword diretamente em modo somente leitura (sem copiar arquivos), conceda acesso aos arquivos do dispositivo. O aplicativo nunca vasculha o armazenamento sozinho.',
      primaryLabel: 'Conceder permissão',
      primaryAction: 'permission',
      secondaryLabel: 'Abrir Configurações',
      secondaryAction: 'sources'
    });
    return;
  }

  if (!bible) {
    updateChrome(null, state.book, state.chapter, lockedLimits, 0);
    renderEmptyState({
      title: 'Nenhuma Bíblia adicionada',
      message: 'Você tem controle total sobre onde o aplicativo lê arquivos. Aponte manualmente um arquivo .bbl.mybible específico ou uma pasta com suas Bíblias MySword.',
      primaryLabel: 'Adicionar Bíblia MySword',
      primaryAction: 'sources'
    });
    return;
  }

  const adapter = getAdapterForModule(bible);
  if (!adapter) {
    updateChrome(bible, state.book, state.chapter, lockedLimits, 0);
    renderEmptyState({
      title: 'Formato não suportado',
      message: `Nenhum adaptador registrado para o formato "${bible.formatId}".`,
      primaryLabel: 'Gerenciar fontes',
      primaryAction: 'sources'
    });
    return;
  }

  try {
    const books = await loadBooksForBible(bible);
    if (seq !== renderSeq || store.getActiveMode() !== 'bible') return;

    if (!books.length) {
      updateChrome(bible, state.book, state.chapter, lockedLimits, 0);
      renderEmptyState({
        title: 'Módulo vazio ou ilegível',
        message: `Não foi possível encontrar livros em "${bible.title}". Verifique se o arquivo ainda existe no local autorizado.`,
        primaryLabel: 'Gerenciar fontes',
        primaryAction: 'sources'
      });
      return;
    }

    let targetBook = books.includes(state.book) ? state.book : books[0];
    const chapters = await loadChaptersForBible(bible, targetBook);
    if (seq !== renderSeq || store.getActiveMode() !== 'bible') return;

    let targetChapter = chapters.includes(state.chapter)
      ? state.chapter
      : (chapters[0] || 1);

    if (targetBook !== state.book || targetChapter !== state.chapter) {
      store.setLocation(targetBook, targetChapter);
      return;
    }

    const prefs = store.getPrefs();
    const [verses, companionMap] = await Promise.all([
      adapter.getChapterVerses(bible.path, targetBook, targetChapter, {
        showStrongs: prefs.showStrongs,
        showMorph: prefs.showMorph
      }),
      loadCompanionRefsForChapter(store.getDictionaries(), targetBook, targetChapter)
        .catch(() => new Map())
    ]);
    if (seq !== renderSeq || store.getActiveMode() !== 'bible') return;

    const mapMarkers = await loadMapMarkersForChapter(targetBook, targetChapter, verses)
      .catch(() => new Map());
    if (seq !== renderSeq || store.getActiveMode() !== 'bible') return;

    const bookIdx = books.indexOf(targetBook);
    const chapIdx = chapters.indexOf(targetChapter);
    const isFirstBook = bookIdx <= 0;
    const isLastBook = bookIdx < 0 || bookIdx >= books.length - 1;
    const isFirst = isFirstBook && chapIdx <= 0;
    const isLast = isLastBook && (chapIdx < 0 || chapIdx >= chapters.length - 1);

    const firstVerseInChap = verses[0] ? verses[0].verse : 1;
    const requestedVerse = Number(scrollToVerse) || 0;
    const storedVerse = Number(state.verse) || firstVerseInChap;
    const hasStoredVerse = verses.some((v) => v.verse === storedVerse);
    const activeVerseNum = requestedVerse > 0
      ? requestedVerse
      : (hasStoredVerse ? storedVerse : firstVerseInChap);

    if (activeVerseNum !== state.verse) {
      store.setActiveVerse(activeVerseNum, { silent: true });
    }

    updateChrome(bible, targetBook, targetChapter, { isFirst, isLast, isFirstBook, isLastBook }, activeVerseNum);

    currentVerses = verses;
    selectedVerseNum = requestedVerse > 0
      ? requestedVerse
      : (activeVerseNum > firstVerseInChap ? activeVerseNum : null);
    currentCompanionMap = companionMap || new Map();
    currentMapMarkers = mapMarkers || new Map();

    const hasInterlinear = verses.some((v) => v.html.includes('il-block'));
    const parts = [];
    parts.push(`
      <header class="chapter-header">
        <h1 class="chapter-title">${escapeHtml(getBookName(targetBook))} ${targetChapter}</h1>
      </header>
      <div class="verse-list">
    `);

    for (const v of verses) {
      if (Array.isArray(v.headings) && v.headings.length > 0) {
        for (const h of v.headings) {
          parts.push(`<h2 class="section-heading">${escapeHtml(h)}</h2>`);
        }
      }
      const isInterlinear = v.html.includes('il-block');
      const isQInterlinear = v.html.includes('il-q-flow');
      const hasBlockContent =
        isInterlinear ||
        v.html.includes('v-rtl') ||
        v.html.includes('v-parallel-sep') ||
        v.html.includes('ucrt-');
      const hasRtlContent =
        !isInterlinear &&
        v.html.includes('v-rtl') &&
        !v.html.includes('v-ltr');

      const itemClasses = [
        'verse-item',
        isInterlinear ? 'is-interlinear' : '',
        isQInterlinear ? 'is-q-interlinear' : '',
        hasBlockContent ? 'has-block-content' : '',
        hasRtlContent ? 'has-rtl-content' : ''
      ].filter(Boolean).join(' ');

      const companionGroups = currentCompanionMap.get(v.verse) || [];
      const companionHtml = buildCompanionBarHtml(v.verse, companionGroups);
      const mapMarker = currentMapMarkers.get(v.verse) || null;
      const mapPinHtml = buildVerseMapPinHtml(v.verse, mapMarker);

      parts.push(
        `<div class="${itemClasses}" data-book="${v.book}" data-chapter="${v.chapter}" data-verse="${v.verse}">` +
          `<span class="verse-num">${v.verse}</span>` +
          `<span class="verse-text">${v.html}</span>` +
          companionHtml +
          mapPinHtml +
        '</div>'
      );
    }

    parts.push('</div>');

    const container = document.getElementById('reader-content');
    if (container) {
      container.classList.toggle('has-interlinear', hasInterlinear);
      container.innerHTML = parts.join('');
    }

    const scrollBox = document.getElementById('reader-scroll');
    if (requestedVerse > 0 && container) {
      const targetVerseEl = container.querySelector(`.verse-item[data-verse="${requestedVerse}"]`);
      if (targetVerseEl) {
        selectedVerseNum = requestedVerse;
        targetVerseEl.classList.add('is-selected');
        targetVerseEl.scrollIntoView({ behavior: 'auto', block: 'center' });
        return;
      }
    }

    if (selectedVerseNum && container) {
      const activeVerseEl = container.querySelector(`.verse-item[data-verse="${selectedVerseNum}"]`);
      if (activeVerseEl) {
        activeVerseEl.classList.add('is-selected');
      }
    }

    if (typeof restoreScrollTop === 'number' && scrollBox) {
      scrollBox.scrollTop = Math.max(0, restoreScrollTop);
    } else if (resetScroll && scrollBox) {
      scrollBox.scrollTo({ top: 0, behavior: 'auto' });
    }
  } catch (err) {
    if (seq !== renderSeq || store.getActiveMode() !== 'bible') return;
    updateChrome(bible, state.book, state.chapter, lockedLimits, 0);
    renderEmptyState({
      title: 'Erro ao ler capítulo',
      message: err && err.message ? err.message : String(err),
      primaryLabel: 'Verificar fontes',
      primaryAction: 'sources'
    });
  }
}

export function stepBible(delta) {
  const bibles = store.getBibles();
  if (bibles.length < 2) return;

  const active = store.getActiveBible();
  const idx = active ? bibles.findIndex((m) => m.path === active.path) : -1;
  const nextIdx = idx + Number(delta || 0);
  if (nextIdx < 0 || nextIdx >= bibles.length) return;

  store.setActiveModule(bibles[nextIdx].path);
}

export async function stepBook(delta) {
  const bible = store.getActiveBible();
  if (!bible) return;

  const state = store.getState();
  const books = await loadBooksForBible(bible);
  if (!books.length) return;

  const bookIdx = books.indexOf(state.book);
  if (bookIdx < 0) return;

  const nextIdx = bookIdx + Number(delta || 0);
  if (nextIdx < 0 || nextIdx >= books.length) return;

  const nextBook = books[nextIdx];
  const nextChapters = await loadChaptersForBible(bible, nextBook);
  if (!nextChapters.length) return;

  store.setLocation(nextBook, nextChapters[0]);
}

export async function stepChapter(delta) {
  const bible = store.getActiveBible();
  if (!bible) return;

  const state = store.getState();
  const books = await loadBooksForBible(bible);
  if (!books.length) return;

  const bookIdx = books.indexOf(state.book);
  if (bookIdx < 0) return;

  const chapters = await loadChaptersForBible(bible, state.book);
  const chapIdx = chapters.indexOf(state.chapter);

  if (delta > 0) {
    if (chapIdx >= 0 && chapIdx + 1 < chapters.length) {
      store.setLocation(state.book, chapters[chapIdx + 1]);
      return;
    }
    if (bookIdx + 1 < books.length) {
      const nextBook = books[bookIdx + 1];
      const nextChapters = await loadChaptersForBible(bible, nextBook);
      if (nextChapters.length) {
        store.setLocation(nextBook, nextChapters[0]);
      }
    }
    return;
  }

  if (delta < 0) {
    if (chapIdx > 0) {
      store.setLocation(state.book, chapters[chapIdx - 1]);
      return;
    }
    if (bookIdx > 0) {
      const prevBook = books[bookIdx - 1];
      const prevChapters = await loadChaptersForBible(bible, prevBook);
      if (prevChapters.length) {
        store.setLocation(prevBook, prevChapters[prevChapters.length - 1]);
      }
    }
  }
}
