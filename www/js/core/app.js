import { nativeBridge } from '../bridge/native-bridge.js';
import { store } from './store.js';
import { eventBus, EVENTS } from './events.js';
import { getBookName, formatReference } from './canon.js';
import { appLogger } from './logger.js';
import {
  initGlobalBibleRefs,
  updateBibleBackButton
} from './bible-refs.js';
import { clearCompanionCache } from '../formats/companion-dicts.js';
import { clearMediaIndexCache } from '../formats/media-cache.js';
import { clearDictionaryLookupCache } from '../formats/dictionary-lookup.js';
import { clearBibleSearchCache } from '../formats/bible-search.js';
import { clearUnifiedDictSearchCache } from '../formats/dictionary-search.js';
import { clearCommentarySearchCache } from '../formats/commentary-search.js';
import {
  myswordCommentaryAdapter,
  clearCommentaryLookupCache
} from '../formats/mysword-commentary.js';
import {
  initReaderView,
  renderReader,
  stepChapter,
  loadBooksForBible,
  loadChaptersForBible
} from '../ui/reader-view.js';
import {
  initCommentaryView,
  renderCommentaryView,
  stepCommentarySection,
  getCommentaryViewState
} from '../ui/commentary-view.js';
import {
  initDictionaryView,
  syncDictionaryModules,
  setActiveDictionaryModule,
  loadFirstOrCurrentEntry,
  openDictionaryEntry,
  searchDictionaryTerm,
  stepDictionaryEntry,
  renderDictionaryView,
  initSelectionLookupBar,
  getDictionaryViewState,
  openActiveDictionaryTerms
} from '../ui/dictionary-view.js';
import {
  openUnifiedSearchModal,
  clearBibleSearchSession,
  attachBibleSearchToLookupFab
} from '../ui/bible-search-modal.js';
import {
  openLocationPickerModal,
  openFootnoteModal,
  openModalShell,
  closeModal
} from '../ui/nav-modal.js';
import { openSettingsModal } from '../ui/sources-modal.js';
import {
  recordRecentModule,
  renderQuickTabs,
  closeShellPopover,
  openViewsDropdown,
  openModuleDropdown,
  openOverflowDropdown
} from '../ui/shell-menus.js';

appLogger.installGlobalHandlers();

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

let toastTimer = null;
let savedBibleScrollTop = 0;
let pendingScrollVerse = null;
let suppressModeAutoLoad = false;
let suppressModuleAutoLoad = false;
let suppressLocationAutoLoad = false;
const jumpHistory = [];

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

function getPreferredModuleLabel(mod, fallback = '') {
  if (!mod) return fallback;
  const sortBy = store.getPrefs().bibleSortBy === 'title' ? 'title' : 'abbr';
  return sortBy === 'title'
    ? (mod.title || mod.abbr || mod.fileName || fallback)
    : (mod.abbr || mod.title || mod.fileName || fallback);
}

function applyVisualPrefs(prefs) {
  const root = document.documentElement;
  root.setAttribute('data-theme', prefs.theme || 'paper');
  root.style.setProperty('--reader-font-size', `${Number(prefs.fontSize) || 19}px`);
  root.style.setProperty('--reader-line-height', String(Number(prefs.lineHeight) || 1.72));
  root.style.setProperty(
    '--reader-font-family',
    prefs.fontFamily === 'sans' ? 'var(--font-sans)' : 'var(--font-serif)'
  );
  root.style.setProperty('--reader-align', prefs.justifyText ? 'justify' : 'left');
}

function showToast(message) {
  const box = document.getElementById('toast-box');
  if (!box || !message) return;
  box.textContent = String(message);
  box.classList.add('visible');
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    box.classList.remove('visible');
  }, 3200);
}

function scrollReaderByPage(direction) {
  const scrollBox = document.getElementById('reader-scroll');
  if (!scrollBox) return;
  const step = Math.max(160, Math.round(scrollBox.clientHeight * 0.78));
  scrollBox.scrollBy({
    top: direction >= 0 ? step : -step,
    behavior: 'smooth'
  });
}

function refreshQuickBibleTabs() {
  const bar = document.getElementById('quick-bibles-bar');
  const active = store.getActiveBible();
  renderQuickTabs(bar, 'bible', store.getBibles(), active ? active.path : '', (path) => {
    recordRecentModule('bible', path);
    store.setActiveModule(path);
  });
}

function refreshQuickCommentaryTabs() {
  const bar = document.getElementById('quick-cmts-bar');
  const active = store.getActiveCommentary();
  renderQuickTabs(bar, 'commentary', store.getCommentaries(), active ? active.path : '', (path) => {
    recordRecentModule('commentary', path);
    store.setActiveCommentary(path);
  });
}

function refreshQuickDictionaryTabs() {
  const bar = document.getElementById('quick-dicts-bar');
  const active = store.getActiveDictionary();
  renderQuickTabs(bar, 'dictionary', store.getDictionaries(), active ? active.path : '', (path) => {
    recordRecentModule('dictionary', path);
    store.setActiveDictionary(path, { silent: true });
    setActiveDictionaryModule(path, {
      keepTerm: true,
      render: store.getActiveMode() === 'dictionary'
    });
  });
}

function syncJumpBackButton() {
  const top = jumpHistory.length ? jumpHistory[jumpHistory.length - 1] : null;
  updateBibleBackButton({
    visible: Boolean(top),
    label: top ? top.label : '',
    onBack: () => {
      goBackFromBibleJump();
    },
    onDismiss: () => {
      jumpHistory.length = 0;
    }
  });
}

function pushCurrentBibleJumpOrigin(originVerse = 0) {
  const curState = store.getState();
  const curBible = store.getActiveBible();
  const scrollBox = document.getElementById('reader-scroll');
  const verseNum = Number(originVerse) || curState.verse || 0;

  jumpHistory.push({
    mode: 'bible',
    modulePath: curBible ? curBible.path : '',
    book: curState.book,
    chapter: curState.chapter,
    verse: verseNum,
    scrollTop: scrollBox ? scrollBox.scrollTop : 0,
    label: verseNum
      ? formatReference(curState.book, curState.chapter, verseNum)
      : formatReference(curState.book, curState.chapter)
  });

  if (jumpHistory.length > 25) {
    jumpHistory.shift();
  }
}

function highlightAndScrollToVerse(verseNum, smooth = true) {
  const container = document.getElementById('reader-content');
  if (!container) return false;
  const targetEl = container.querySelector(`.verse-item[data-verse="${Number(verseNum)}"]`);
  if (!targetEl) return false;

  container.querySelectorAll('.verse-item.is-selected, .verse-item.is-jump-target').forEach((el) => {
    el.classList.remove('is-selected', 'is-jump-target');
  });

  targetEl.classList.add('is-selected', 'is-jump-target');
  targetEl.scrollIntoView({
    behavior: smooth ? 'smooth' : 'auto',
    block: 'center'
  });
  return true;
}

function updateCommentaryChrome(meta = {}) {
  const st = store.getState();
  const active = meta.activeModule !== undefined ? meta.activeModule : store.getActiveCommentary();
  const book = meta.book || st.book || 1;
  const chapter = meta.chapter || st.chapter || 1;
  const verse = meta.verse || st.verse || 1;
  const refShort = meta.refShort || formatCompactRef(book, chapter, verse);

  const cmtLabel = document.getElementById('label-active-cmt');
  const refLabel = document.getElementById('label-active-cmt-ref');
  const topPrevSec = document.getElementById('btn-top-prev-cmt-sec');
  const topNextSec = document.getElementById('btn-top-next-cmt-sec');

  if (cmtLabel) {
    cmtLabel.textContent = getPreferredModuleLabel(active, 'Sem Comentário');
  }
  if (refLabel) {
    refLabel.textContent = refShort;
  }
  if (topPrevSec) topPrevSec.disabled = !active;
  if (topNextSec) topNextSec.disabled = !active;

  refreshQuickCommentaryTabs();

  if (store.getActiveMode() === 'commentary') {
    const metaLabel = document.getElementById('chapter-meta');
    const prevBtn = document.getElementById('btn-prev-chapter');
    const nextBtn = document.getElementById('btn-next-chapter');

    if (metaLabel) {
      const modName = getPreferredModuleLabel(active, 'Nenhum comentário');
      metaLabel.textContent = `${modName} • ${formatReference(book, chapter, verse)}`;
    }
    if (prevBtn) prevBtn.disabled = !active;
    if (nextBtn) nextBtn.disabled = !active;
  }
}

function updateDictionaryChrome(meta = {}) {
  const active = meta.activeModule || store.getActiveDictionary();
  const dictLabel = document.getElementById('label-active-dict');
  const entryLabel = document.getElementById('label-active-entry');
  const topPrevEntry = document.getElementById('btn-top-prev-entry');
  const topNextEntry = document.getElementById('btn-top-next-entry');

  if (dictLabel) {
    dictLabel.textContent = getPreferredModuleLabel(active, 'Sem Dicionário');
  }
  if (entryLabel) {
    entryLabel.textContent = meta.entryWord || (active ? 'Termos' : '—');
  }
  if (topPrevEntry) topPrevEntry.disabled = !active;
  if (topNextEntry) topNextEntry.disabled = !active;

  refreshQuickDictionaryTabs();

  if (store.getActiveMode() === 'dictionary') {
    const metaLabel = document.getElementById('chapter-meta');
    const prevBtn = document.getElementById('btn-prev-chapter');
    const nextBtn = document.getElementById('btn-next-chapter');

    if (metaLabel) {
      const modName = getPreferredModuleLabel(active, 'Nenhum dicionário');
      const detail = meta.entryWord || meta.query || '';
      metaLabel.textContent = detail ? `${modName} • ${detail}` : modName;
    }
    if (prevBtn) prevBtn.disabled = !active;
    if (nextBtn) nextBtn.disabled = !active;
  }
}

function syncModeChrome() {
  const mode = store.getActiveMode();
  const isBible = mode === 'bible';
  const isCmt = mode === 'commentary';
  const isDict = mode === 'dictionary';

  closeShellPopover();

  document.getElementById('strip-bible')?.classList.toggle('hidden', !isBible);
  document.getElementById('strip-commentary')?.classList.toggle('hidden', !isCmt);
  document.getElementById('strip-dict')?.classList.toggle('hidden', !isDict);

  const badge = document.getElementById('main-mode-badge');
  if (badge) {
    if (isDict) {
      badge.className = 'ms-res-badge ms-res-badge--dict';
      badge.textContent = 'D';
    } else if (isCmt) {
      badge.className = 'ms-res-badge ms-res-badge--commentary';
      badge.textContent = 'C';
    } else {
      badge.className = 'ms-res-badge ms-res-badge--bible';
      badge.innerHTML = '&#10013;';
    }
  }

  const bibleBtn = document.getElementById('btn-mode-bible');
  const cmtBtn = document.getElementById('btn-mode-commentary');
  const dictBtn = document.getElementById('btn-mode-dictionary');
  const searchDockBtn = document.getElementById('btn-dock-search');
  const indexDockBtn = document.getElementById('btn-dock-index');

  if (bibleBtn) {
    bibleBtn.classList.toggle('is-active', isBible);
    bibleBtn.setAttribute('aria-pressed', String(isBible));
  }
  if (cmtBtn) {
    cmtBtn.classList.toggle('is-active', isCmt);
    cmtBtn.setAttribute('aria-pressed', String(isCmt));
  }
  if (dictBtn) {
    dictBtn.classList.toggle('is-active', isDict);
    dictBtn.setAttribute('aria-pressed', String(isDict));
  }
  if (searchDockBtn) {
    searchDockBtn.title = 'Pesquisa Unificada (Bíblia, Comentário e Dicionário)';
    searchDockBtn.classList.remove('is-active');
  }
  if (indexDockBtn) {
    indexDockBtn.title = isDict ? 'Lista de todos os termos do dicionário' : 'Livros e capítulos';
  }

  if (isDict) {
    updateDictionaryChrome(getDictionaryViewState());
  } else if (isCmt) {
    updateCommentaryChrome(getCommentaryViewState());
  } else {
    refreshQuickBibleTabs();
  }
}

function rememberBibleScrollIfActive() {
  if (store.getActiveMode() === 'bible') {
    const scrollBox = document.getElementById('reader-scroll');
    if (scrollBox) {
      savedBibleScrollTop = scrollBox.scrollTop;
    }
  }
}

function syncDictionariesFromStore() {
  const dicts = store.getDictionaries();
  syncDictionaryModules(dicts);
  const activeDict = store.getActiveDictionary();
  const dState = getDictionaryViewState();
  if (activeDict && dState.activeModulePath !== activeDict.path) {
    setActiveDictionaryModule(activeDict.path, { keepTerm: false, render: false });
  }
  updateDictionaryChrome({ activeModule: activeDict });
}

function openCommentaryPickerFrom(anchorEl = null) {
  const st = store.getState();
  const targetAnchor = anchorEl || document.getElementById('btn-cmt-picker');
  openModuleDropdown({
    kind: 'commentary',
    anchorEl: targetAnchor,
    passage: {
      book: st.book || 1,
      chapter: st.chapter || 1,
      verse: st.verse || 1
    },
    onSelect: (path) => {
      recordRecentModule('commentary', path);
      store.setActiveCommentary(path);
    },
    onOpenSources: () => openSettingsModal({ initialTab: 'sources', initialKind: 'commentary' })
  });
}

async function openCommentaryFromSearch({
  modulePath = '',
  book = 1,
  chapter = 1,
  verse = 1,
  fromVerse = 0,
  toVerse = 0,
  scopeKind = 'verse'
} = {}) {
  rememberBibleScrollIfActive();
  if (store.getActiveMode() === 'bible') {
    pushCurrentBibleJumpOrigin(store.getState().verse || 0);
  }

  const isIntro = scopeKind === 'bookIntro' || Number(chapter) <= 0;
  const safeBook = Number(book) > 0 ? Number(book) : 1;
  const safeChapter = isIntro ? 1 : (Number(chapter) > 0 ? Number(chapter) : 1);
  const safeVerse = isIntro ? 1 : (Number(verse) > 0 ? Number(verse) : (Number(fromVerse) > 0 ? Number(fromVerse) : 1));

  if (store.getActiveMode() !== 'commentary') {
    suppressModeAutoLoad = true;
    store.setActiveMode('commentary');
    suppressModeAutoLoad = false;
  }

  if (modulePath) {
    recordRecentModule('commentary', modulePath);
    store.setActiveCommentary(modulePath, { silent: true });
  }

  suppressLocationAutoLoad = true;
  store.setLocation(safeBook, safeChapter, safeVerse);
  suppressLocationAutoLoad = false;

  syncModeChrome();
  await renderCommentaryView({
    resetScroll: true,
    showIntro: isIntro,
    explicitSection: isIntro
      ? null
      : {
          book: safeBook,
          chapter: safeChapter,
          fromVerse: Number(fromVerse) || 0,
          toVerse: Number(toVerse) || 0
        }
  });
  syncJumpBackButton();
}

async function openDictionaryFromSearch({ modulePath = '', word = '' } = {}) {
  if (!word) return;
  rememberBibleScrollIfActive();
  if (store.getActiveMode() === 'bible') {
    pushCurrentBibleJumpOrigin(store.getState().verse || 0);
  }

  if (store.getActiveMode() !== 'dictionary') {
    suppressModeAutoLoad = true;
    store.setActiveMode('dictionary');
    suppressModeAutoLoad = false;
  }

  if (modulePath) {
    recordRecentModule('dictionary', modulePath);
    store.setActiveDictionary(modulePath, { silent: true });
  }

  syncModeChrome();
  await openDictionaryEntry(word, {
    modulePath: modulePath || '',
    pushHistory: true,
    fallbackAll: !modulePath,
    directWord: true
  });
  syncJumpBackButton();
}

function openUnifiedSearchDialog({
  kind = '',
  initialQuery = '',
  autoRun = false,
  searchAll = false
} = {}) {
  closeShellPopover();
  openUnifiedSearchModal({
    initialKind: kind || store.getActiveMode(),
    initialQuery,
    autoRun,
    searchAll,
    onNavigateVerse: ({ modulePath, book, chapter, verse }) => {
      navigateToBibleReference(
        { book, chapter, verse, preferredModulePath: modulePath || '' },
        { recordHistory: true }
      );
    },
    onNavigateCommentary: (payload) => {
      openCommentaryFromSearch(payload);
    },
    onNavigateDictionary: (payload) => {
      openDictionaryFromSearch(payload);
    },
    onOpenSources: (targetKind) => openSettingsModal({
      initialTab: 'sources',
      initialKind: targetKind || store.getActiveMode()
    }),
    onOpenLogs: () => openSettingsModal({ initialTab: 'logs' })
  });
}

async function openCompanionEntryInDictionary(modulePath, entryWord, originVerse = 0) {
  rememberBibleScrollIfActive();
  if (store.getActiveMode() === 'bible') {
    pushCurrentBibleJumpOrigin(originVerse);
  }

  if (store.getActiveMode() !== 'dictionary') {
    suppressModeAutoLoad = true;
    store.setActiveMode('dictionary');
    suppressModeAutoLoad = false;
  }

  recordRecentModule('dictionary', modulePath);
  syncModeChrome();
  await openDictionaryEntry(entryWord, {
    modulePath,
    pushHistory: true,
    fallbackAll: false,
    directWord: true
  });
  syncJumpBackButton();
}

function handleOpenCompanionGroup({ verseObj, group, refLabel }) {
  if (!group || !group.module || !Array.isArray(group.entries) || !group.entries.length) {
    return;
  }

  const originVerse = verseObj ? Number(verseObj.verse) || 0 : 0;

  if (group.entries.length === 1) {
    openCompanionEntryInDictionary(group.module.path, group.entries[0], originVerse);
    return;
  }

  closeShellPopover();
  const modal = openModalShell({ title: `${group.label} — ${refLabel}` });
  if (!modal || !modal.body) return;

  modal.body.innerHTML =
    '<div class="cmp-modal-list">' +
      group.entries.map((entry, idx) => (
        `<button type="button" class="cmp-modal-item" data-cmp-entry-idx="${idx}">` +
          `<span>${escapeHtml(entry)}</span>` +
          '<span class="cmp-modal-arrow">&rsaquo;</span>' +
        '</button>'
      )).join('') +
    '</div>';

  modal.body.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-cmp-entry-idx]');
    if (!btn) return;
    const idx = Number(btn.getAttribute('data-cmp-entry-idx'));
    const chosen = group.entries[idx];
    if (!chosen) return;
    closeModal();
    openCompanionEntryInDictionary(group.module.path, chosen, originVerse);
  });
}

async function findBibleContainingBook(bookId, preferredModulePath = '') {
  const active = store.getActiveBible();
  const allList = store.getBibles();

  if (preferredModulePath) {
    const preferred = allList.find((m) => m.path === preferredModulePath);
    if (preferred) {
      try {
        const prefBooks = await loadBooksForBible(preferred);
        if (prefBooks.includes(bookId)) {
          return {
            bible: preferred,
            books: prefBooks,
            switched: !active || active.path !== preferred.path
          };
        }
      } catch (err) {
        // Segue para fallback na Bíblia ativa / demais Bíblias
      }
    }
  }

  if (active) {
    const activeBooks = await loadBooksForBible(active);
    if (activeBooks.includes(bookId)) {
      return { bible: active, books: activeBooks, switched: false };
    }
  }

  const allBibles = allList.filter((m) => !active || m.path !== active.path);
  const isOT = bookId <= 39;

  const prioritized = allBibles.slice().sort((a, b) => {
    const aSkip = isOT ? /^nt\b/i.test(a.abbr || '') : /^at\b/i.test(a.abbr || '');
    const bSkip = isOT ? /^nt\b/i.test(b.abbr || '') : /^at\b/i.test(b.abbr || '');
    return Number(aSkip) - Number(bSkip);
  });

  const maxChecks = Math.min(prioritized.length, 25);
  for (let i = 0; i < maxChecks; i++) {
    const mod = prioritized[i];
    try {
      const books = await loadBooksForBible(mod);
      if (books.includes(bookId)) {
        return { bible: mod, books, switched: true };
      }
    } catch (err) {
      // Continua procurando em outra Bíblia
    }
  }

  return null;
}

async function navigateToBibleReference({ book, chapter, verse, preferredModulePath = '' }, options = {}) {
  closeShellPopover();
  closeModal();

  const bibles = store.getBibles();
  if (!bibles.length) {
    showToast('Adicione uma Bíblia (.bbl.mybible) em Configurações → Fontes.');
    return;
  }

  const targetMatch = await findBibleContainingBook(book, preferredModulePath);
  if (!targetMatch) {
    showToast(`Nenhuma Bíblia instalada contém ${getBookName(book)}.`);
    return;
  }

  const targetBible = targetMatch.bible;
  const chapters = await loadChaptersForBible(targetBible, book);
  if (!chapters.length) {
    showToast(`Não foi possível abrir ${getBookName(book)} em ${getPreferredModuleLabel(targetBible, 'Bíblia')}.`);
    return;
  }

  const targetChapter = chapters.includes(chapter) ? chapter : chapters[0];
  const targetVerse = Number(verse) || 1;

  if (options.recordHistory !== false) {
    const activeMode = store.getActiveMode();
    if (activeMode === 'dictionary') {
      const dState = getDictionaryViewState();
      const word = dState.currentEntry ? dState.currentEntry.word : '';
      jumpHistory.push({
        mode: 'dictionary',
        modulePath: dState.activeModulePath || '',
        word,
        label: word ? `Dic: ${word}` : 'Dicionário'
      });
      if (jumpHistory.length > 25) {
        jumpHistory.shift();
      }
    } else if (activeMode === 'commentary') {
      const cState = getCommentaryViewState();
      const cMod = cState.activeModule;
      jumpHistory.push({
        mode: 'commentary',
        modulePath: cMod ? cMod.path : '',
        book: cState.book,
        chapter: cState.chapter,
        verse: cState.verse || 1,
        label: `Com: ${formatCompactRef(cState.book, cState.chapter, cState.verse || 1)}`
      });
      if (jumpHistory.length > 25) {
        jumpHistory.shift();
      }
    } else {
      const curState = store.getState();
      const verseEl = options.sourceEl && options.sourceEl.closest
        ? options.sourceEl.closest('.verse-item')
        : null;
      const originVerse = verseEl ? Number(verseEl.dataset.verse) || 0 : 0;
      const sameTarget =
        !targetMatch.switched &&
        curState.book === book &&
        curState.chapter === targetChapter &&
        originVerse === targetVerse;

      if (!sameTarget) {
        pushCurrentBibleJumpOrigin(originVerse);
      }
    }
  }

  const curState = store.getState();
  const isAlreadyBible = store.getActiveMode() === 'bible';
  const sameModule = !targetMatch.switched;
  const sameChapter = curState.book === book && curState.chapter === targetChapter;

  if (targetMatch.switched) {
    recordRecentModule('bible', targetBible.path);
    showToast(
      `Abrindo ${formatReference(book, targetChapter, targetVerse)} em ${getPreferredModuleLabel(targetBible, 'Bíblia')}`
    );
  }

  if (isAlreadyBible && sameModule && sameChapter) {
    store.setActiveVerse(targetVerse, { silent: true });
    if (!highlightAndScrollToVerse(targetVerse, true)) {
      await renderReader({ resetScroll: false, scrollToVerse: targetVerse });
      highlightAndScrollToVerse(targetVerse, false);
    }
    syncJumpBackButton();
    return;
  }

  if (!isAlreadyBible) {
    suppressModeAutoLoad = true;
    store.setActiveMode('bible');
    suppressModeAutoLoad = false;
  }

  if (targetMatch.switched) {
    suppressModuleAutoLoad = true;
    store.setActiveModule(targetBible.path);
    suppressModuleAutoLoad = false;
  }

  if (!sameChapter || curState.verse !== targetVerse) {
    suppressLocationAutoLoad = true;
    store.setLocation(book, targetChapter, targetVerse);
    suppressLocationAutoLoad = false;
  }

  syncModeChrome();
  pendingScrollVerse = null;
  await renderReader({ resetScroll: false, scrollToVerse: targetVerse });
  highlightAndScrollToVerse(targetVerse, false);
  syncJumpBackButton();
}

async function goBackFromBibleJump() {
  if (!jumpHistory.length) {
    syncJumpBackButton();
    return;
  }

  const prev = jumpHistory.pop();
  syncJumpBackButton();
  if (!prev) return;

  if (prev.mode === 'dictionary') {
    rememberBibleScrollIfActive();
    suppressModeAutoLoad = true;
    store.setActiveMode('dictionary');
    suppressModeAutoLoad = false;
    syncModeChrome();

    if (prev.word && prev.modulePath) {
      await openDictionaryEntry(prev.word, {
        modulePath: prev.modulePath,
        pushHistory: false,
        fallbackAll: false,
        directWord: true
      });
    } else {
      await loadFirstOrCurrentEntry();
    }
    return;
  }

  if (prev.mode === 'commentary') {
    rememberBibleScrollIfActive();
    suppressModeAutoLoad = true;
    store.setActiveMode('commentary');
    suppressModeAutoLoad = false;

    if (prev.modulePath) {
      store.setActiveCommentary(prev.modulePath, { silent: true });
    }
    if (prev.book && prev.chapter) {
      suppressLocationAutoLoad = true;
      store.setLocation(prev.book, prev.chapter, prev.verse || 1);
      suppressLocationAutoLoad = false;
    }

    syncModeChrome();
    await renderCommentaryView({ resetScroll: true });
    return;
  }

  const curState = store.getState();
  const curBible = store.getActiveBible();
  const needModule = Boolean(prev.modulePath && (!curBible || curBible.path !== prev.modulePath));
  const needLoc = curState.book !== prev.book || curState.chapter !== prev.chapter;
  const alreadyBible = store.getActiveMode() === 'bible';

  if (alreadyBible && !needModule && !needLoc) {
    const scrollBox = document.getElementById('reader-scroll');
    if (prev.verse && highlightAndScrollToVerse(prev.verse, true)) {
      store.setActiveVerse(prev.verse, { silent: true });
      return;
    }
    if (scrollBox && typeof prev.scrollTop === 'number') {
      scrollBox.scrollTo({ top: prev.scrollTop, behavior: 'smooth' });
    }
    return;
  }

  if (!alreadyBible) {
    suppressModeAutoLoad = true;
    store.setActiveMode('bible');
    suppressModeAutoLoad = false;
  }
  if (needModule) {
    suppressModuleAutoLoad = true;
    store.setActiveModule(prev.modulePath);
    suppressModuleAutoLoad = false;
  }
  if (needLoc) {
    suppressLocationAutoLoad = true;
    store.setLocation(prev.book, prev.chapter, prev.verse || 1);
    suppressLocationAutoLoad = false;
  }

  syncModeChrome();
  await renderReader({
    resetScroll: false,
    restoreScrollTop: typeof prev.scrollTop === 'number' ? prev.scrollTop : null,
    scrollToVerse: prev.verse || null
  });
}

async function openTermInDictionary(term, { searchAll = false, moduleHint = '' } = {}) {
  const dicts = store.getDictionaries();
  if (!dicts.length) {
    showToast('Adicione um dicionário (.dct.mybible) em Configurações → Fontes.');
    openSettingsModal({ initialTab: 'sources', initialKind: 'dictionary' });
    return;
  }

  if (searchAll) {
    openUnifiedSearchDialog({
      kind: 'dictionary',
      initialQuery: term,
      autoRun: true,
      searchAll: true
    });
    return;
  }

  rememberBibleScrollIfActive();

  if (store.getActiveMode() !== 'dictionary') {
    suppressModeAutoLoad = true;
    store.setActiveMode('dictionary');
    suppressModeAutoLoad = false;
  }

  syncModeChrome();

  await openDictionaryEntry(term, {
    moduleHint,
    pushHistory: true,
    fallbackAll: true
  });
}

async function renderActiveMode({ resetScroll = false } = {}) {
  syncModeChrome();
  const mode = store.getActiveMode();

  if (mode === 'dictionary') {
    await loadFirstOrCurrentEntry();
    return;
  }

  if (mode === 'commentary') {
    await renderCommentaryView({ resetScroll: true });
    return;
  }

  const verseTarget = pendingScrollVerse;
  pendingScrollVerse = null;

  await renderReader({
    resetScroll,
    restoreScrollTop: !resetScroll && !verseTarget ? savedBibleScrollTop : null,
    scrollToVerse: verseTarget
  });
}

async function syncPermissionAndData() {
  const perm = await nativeBridge.checkStoragePermission();
  store.setPermission(Boolean(perm && perm.granted));

  const [srcRes, modRes] = await Promise.all([
    nativeBridge.listSources(),
    nativeBridge.listModules()
  ]);

  store.setSourcesAndModules(
    (srcRes && srcRes.sources) || [],
    (modRes && modRes.modules) || []
  );
  syncDictionariesFromStore();
}

function bindShellEvents() {
  document.getElementById('btn-main-menu')?.addEventListener('click', (ev) => {
    openViewsDropdown({
      anchorEl: ev.currentTarget,
      onSelectMode: (mode) => {
        if (mode !== 'bible') rememberBibleScrollIfActive();
        store.setActiveMode(mode);
      },
      onOpenUnifiedSearch: (kind) => openUnifiedSearchDialog({ kind }),
      onOpenBibleSearch: () => openUnifiedSearchDialog({ kind: 'bible' }),
      onOpenDictTerms: () => {
        if (store.getActiveMode() !== 'dictionary') {
          rememberBibleScrollIfActive();
          store.setActiveMode('dictionary');
        }
        openActiveDictionaryTerms();
      },
      onOpenSettings: () => openSettingsModal({
        initialTab: 'sources',
        initialKind: store.getActiveMode()
      }),
      onOpenLogs: () => openSettingsModal({ initialTab: 'logs' }),
      onQuickSelectBible: (path) => {
        recordRecentModule('bible', path);
        store.setActiveModule(path);
      },
      onQuickSelectCommentary: (path) => {
        recordRecentModule('commentary', path);
        store.setActiveCommentary(path);
      },
      onQuickSelectDict: (path) => {
        recordRecentModule('dictionary', path);
        store.setActiveDictionary(path, { silent: true });
        setActiveDictionaryModule(path, { keepTerm: true, render: true });
      }
    });
  });

  document.getElementById('btn-overflow-menu')?.addEventListener('click', (ev) => {
    openOverflowDropdown({
      anchorEl: ev.currentTarget,
      onOpenSettings: () => openSettingsModal({
        initialTab: 'sources',
        initialKind: store.getActiveMode()
      }),
      onOpenLogs: () => openSettingsModal({ initialTab: 'logs' })
    });
  });

  // Barra superior — modo Bíblia
  document.getElementById('btn-top-prev-chapter')?.addEventListener('click', () => {
    stepChapter(-1);
  });

  document.getElementById('btn-top-next-chapter')?.addEventListener('click', () => {
    stepChapter(1);
  });

  document.getElementById('btn-nav-picker')?.addEventListener('click', () => {
    closeShellPopover();
    openLocationPickerModal();
  });

  document.getElementById('btn-bible-picker')?.addEventListener('click', (ev) => {
    openModuleDropdown({
      kind: 'bible',
      anchorEl: ev.currentTarget,
      onSelect: (path) => {
        recordRecentModule('bible', path);
        store.setActiveModule(path);
      },
      onOpenSources: () => openSettingsModal({ initialTab: 'sources', initialKind: 'bible' })
    });
  });

  // Barra superior — modo Comentários
  document.getElementById('btn-top-prev-cmt-sec')?.addEventListener('click', () => {
    stepCommentarySection(-1);
  });

  document.getElementById('btn-top-next-cmt-sec')?.addEventListener('click', () => {
    stepCommentarySection(1);
  });

  document.getElementById('btn-cmt-nav-picker')?.addEventListener('click', () => {
    closeShellPopover();
    openLocationPickerModal();
  });

  document.getElementById('btn-cmt-picker')?.addEventListener('click', (ev) => {
    openCommentaryPickerFrom(ev.currentTarget);
  });

  // Barra superior — modo Dicionário
  document.getElementById('btn-dict-picker')?.addEventListener('click', (ev) => {
    const dState = getDictionaryViewState();
    openModuleDropdown({
      kind: 'dictionary',
      anchorEl: ev.currentTarget,
      filterTerm: dState.filterTerm || '',
      searchOptions: dState.searchOptions || null,
      onSelect: (modulePath, { matchedWord = '', keepFilterTerm = false } = {}) => {
        recordRecentModule('dictionary', modulePath);
        store.setActiveDictionary(modulePath, { silent: true });
        if (matchedWord) {
          setActiveDictionaryModule(modulePath, {
            matchedWord,
            keepFilterTerm,
            pushHistory: true,
            render: store.getActiveMode() === 'dictionary'
          });
        } else {
          setActiveDictionaryModule(modulePath, {
            keepTerm: false,
            clearFilter: !keepFilterTerm,
            render: store.getActiveMode() === 'dictionary'
          });
        }
      },
      onOpenSources: () => openSettingsModal({ initialTab: 'sources', initialKind: 'dictionary' })
    });
  });

  document.getElementById('btn-top-prev-entry')?.addEventListener('click', () => {
    stepDictionaryEntry(-1);
  });

  document.getElementById('btn-top-next-entry')?.addEventListener('click', () => {
    stepDictionaryEntry(1);
  });

  document.getElementById('btn-dict-terms-top')?.addEventListener('click', () => {
    closeShellPopover();
    openActiveDictionaryTerms();
  });

  // Barra inferior (dock)
  document.getElementById('btn-prev-chapter')?.addEventListener('click', () => {
    const mode = store.getActiveMode();
    if (mode === 'dictionary') {
      stepDictionaryEntry(-1);
    } else if (mode === 'commentary') {
      stepCommentarySection(-1);
    } else {
      stepChapter(-1);
    }
  });

  document.getElementById('btn-next-chapter')?.addEventListener('click', () => {
    const mode = store.getActiveMode();
    if (mode === 'dictionary') {
      stepDictionaryEntry(1);
    } else if (mode === 'commentary') {
      stepCommentarySection(1);
    } else {
      stepChapter(1);
    }
  });

  document.getElementById('btn-dock-search')?.addEventListener('click', () => {
    openUnifiedSearchDialog({ kind: store.getActiveMode() });
  });

  document.getElementById('btn-dock-index')?.addEventListener('click', () => {
    closeShellPopover();
    if (store.getActiveMode() === 'dictionary') {
      openActiveDictionaryTerms();
    } else {
      openLocationPickerModal();
    }
  });

  document.getElementById('btn-settings')?.addEventListener('click', () => {
    closeShellPopover();
    openSettingsModal({
      initialTab: 'sources',
      initialKind: store.getActiveMode()
    });
  });

  document.getElementById('btn-scroll-up')?.addEventListener('click', () => {
    scrollReaderByPage(-1);
  });

  document.getElementById('btn-scroll-down')?.addEventListener('click', () => {
    scrollReaderByPage(1);
  });

  document.getElementById('btn-mode-bible')?.addEventListener('click', () => {
    store.setActiveMode('bible');
  });

  document.getElementById('btn-mode-commentary')?.addEventListener('click', () => {
    rememberBibleScrollIfActive();
    store.setActiveMode('commentary');
  });

  document.getElementById('btn-mode-dictionary')?.addEventListener('click', () => {
    rememberBibleScrollIfActive();
    store.setActiveMode('dictionary');
  });
}

function bindStateEvents() {
  eventBus.on(EVENTS.TOAST, showToast);

  eventBus.on(EVENTS.PREFS_CHANGED, (prefs) => {
    applyVisualPrefs(prefs);
    syncDictionaryModules(store.getDictionaries());
    refreshQuickBibleTabs();
    refreshQuickCommentaryTabs();
    updateDictionaryChrome(getDictionaryViewState());
    updateCommentaryChrome(getCommentaryViewState());

    const mode = store.getActiveMode();
    if (mode === 'dictionary') {
      renderDictionaryView({ resetScroll: false });
    } else if (mode === 'commentary') {
      renderCommentaryView({ resetScroll: false });
    } else {
      renderReader({ resetScroll: false });
    }
  });

  eventBus.on(EVENTS.SOURCES_UPDATED, () => {
    clearCompanionCache();
    clearMediaIndexCache();
    clearDictionaryLookupCache();
    clearBibleSearchCache();
    clearUnifiedDictSearchCache();
    clearCommentarySearchCache();
    clearBibleSearchSession();
    myswordCommentaryAdapter.clearCache();
    clearCommentaryLookupCache();
    syncDictionariesFromStore();
    refreshQuickBibleTabs();
    refreshQuickCommentaryTabs();

    const mode = store.getActiveMode();
    if (mode === 'dictionary') {
      const dState = getDictionaryViewState();
      if (dState.currentEntry) {
        renderDictionaryView({ resetScroll: false });
      } else {
        loadFirstOrCurrentEntry();
      }
    } else if (mode === 'commentary') {
      renderCommentaryView({ resetScroll: false });
    } else {
      renderReader({ resetScroll: false });
    }
  });

  eventBus.on(EVENTS.MODULE_CHANGED, (bibleMod) => {
    savedBibleScrollTop = 0;
    if (bibleMod && bibleMod.path) {
      recordRecentModule('bible', bibleMod.path);
    }
    refreshQuickBibleTabs();
    if (suppressModuleAutoLoad) return;
    if (store.getActiveMode() === 'bible') {
      renderReader({ resetScroll: true });
    }
  });

  eventBus.on(EVENTS.COMMENTARY_CHANGED, (cmtMod) => {
    if (cmtMod && cmtMod.path) {
      recordRecentModule('commentary', cmtMod.path);
    }
    refreshQuickCommentaryTabs();
    if (store.getActiveMode() === 'commentary') {
      renderCommentaryView({ resetScroll: true });
    }
  });

  eventBus.on(EVENTS.DICT_CHANGED, (dictMod) => {
    if (!dictMod) return;
    recordRecentModule('dictionary', dictMod.path);
    setActiveDictionaryModule(dictMod.path, {
      keepTerm: true,
      render: store.getActiveMode() === 'dictionary'
    });
  });

  eventBus.on(EVENTS.MODE_CHANGED, () => {
    syncModeChrome();
    if (suppressModeAutoLoad) return;
    renderActiveMode({ resetScroll: false });
  });

  eventBus.on(EVENTS.LOCATION_CHANGED, () => {
    savedBibleScrollTop = 0;
    if (suppressLocationAutoLoad) return;
    const mode = store.getActiveMode();
    if (mode === 'bible') {
      const verseTarget = pendingScrollVerse;
      pendingScrollVerse = null;
      renderReader({ resetScroll: !verseTarget, scrollToVerse: verseTarget });
    } else if (mode === 'commentary') {
      renderCommentaryView({ resetScroll: true });
    }
  });

  eventBus.on(EVENTS.VERSE_CHANGED, () => {
    if (store.getActiveMode() === 'commentary') {
      renderCommentaryView({ resetScroll: true });
    }
  });

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const prev = store.getState().hasStoragePermission;
    const res = await nativeBridge.checkStoragePermission();
    const next = Boolean(res && res.granted);
    if (next !== prev) {
      store.setPermission(next);
      renderActiveMode({ resetScroll: false });
    }
  });
}

async function bootstrap() {
  applyVisualPrefs(store.getPrefs());

  appLogger.setContextProvider(() => {
    const st = store.getState();
    const bible = store.getActiveBible();
    const cmt = store.getActiveCommentary();
    const dict = store.getActiveDictionary();
    const dState = getDictionaryViewState();
    return {
      'Ambiente nativo': nativeBridge.isNative() ? 'Android (Capacitor)' : 'Navegador Web',
      'Permissão arquivos': st.hasStoragePermission ? 'Concedida' : 'Negada',
      'Modo ativo': store.getActiveMode(),
      'Módulos carregados': `${store.getBibles().length} Bíblia(s), ${store.getCommentaries().length} Comentário(s), ${store.getDictionaries().length} Dicionário(s)`,
      'Bíblia ativa': bible ? `${getPreferredModuleLabel(bible)} (${bible.fileName || ''}) • ${formatReference(st.book, st.chapter, st.verse || 1)}` : 'Nenhuma',
      'Comentário ativo': cmt ? `${getPreferredModuleLabel(cmt)} (${cmt.fileName || ''})` : 'Nenhum',
      'Dicionário ativo': dict ? `${getPreferredModuleLabel(dict)} (${dict.fileName || ''}) • verbete: ${dState.currentEntry ? dState.currentEntry.word : 'nenhum'}` : 'Nenhum',
      'Opções busca dic.': JSON.stringify(dState.searchOptions || {})
    };
  });

  initGlobalBibleRefs({
    onNavigate: (parsed, meta) => {
      navigateToBibleReference(parsed, {
        recordHistory: true,
        sourceEl: meta && meta.sourceEl
      });
    },
    onInvalidRef: (raw) => {
      showToast(`Referência não reconhecida: ${raw}`);
    }
  });

  initReaderView({
    onOpenSources: () => openSettingsModal({ initialTab: 'sources', initialKind: 'bible' }),
    onOpenFootnote: (ref, text) => openFootnoteModal(ref, text),
    onRequestPermission: async () => {
      await nativeBridge.requestStoragePermission();
      showToast('Conceda o acesso nas configurações do Android e retorne ao app.');
    },
    onLookupDictionary: (term, opts) => openTermInDictionary(term, opts),
    onOpenCompanionGroup: (payload) => handleOpenCompanionGroup(payload),
    onBibleChromeUpdated: () => refreshQuickBibleTabs()
  });

  initCommentaryView({
    onOpenSources: () => openSettingsModal({ initialTab: 'sources', initialKind: 'commentary' }),
    onOpenLogs: () => openSettingsModal({ initialTab: 'logs' }),
    onOpenFootnote: (ref, text) => openFootnoteModal(ref, text),
    onToast: showToast,
    onNavigateBible: (parsed) => {
      navigateToBibleReference(parsed, { recordHistory: true });
    },
    onLookupDictionary: (term, opts) => openTermInDictionary(term, opts),
    onOpenCommentaryPicker: () => openCommentaryPickerFrom(),
    onStateMetaChange: (meta) => {
      updateCommentaryChrome(meta);
    }
  });

  initDictionaryView({
    onOpenSources: () => openSettingsModal({ initialTab: 'sources', initialKind: 'dictionary' }),
    onOpenLogs: () => openSettingsModal({ initialTab: 'logs' }),
    onOpenFootnote: (ref, text) => openFootnoteModal(ref, text),
    onToast: showToast,
    onStateMetaChange: (meta) => {
      if (meta && meta.activeModule && meta.activeModule.path) {
        recordRecentModule('dictionary', meta.activeModule.path);
        store.setActiveDictionary(meta.activeModule.path, { silent: true });
      }
      updateDictionaryChrome(meta);
    },
    onNavigateBible: (parsed) => {
      navigateToBibleReference(parsed, { recordHistory: true });
    }
  });

  initSelectionLookupBar({
    onLookup: (term) => openTermInDictionary(term, { searchAll: false }),
    onLookupAll: (term) => openTermInDictionary(term, { searchAll: true })
  });

  attachBibleSearchToLookupFab({
    onSearchBible: (term) => openUnifiedSearchDialog({
      kind: 'bible',
      initialQuery: term,
      autoRun: true
    })
  });

  bindShellEvents();
  bindStateEvents();

  await syncPermissionAndData();
  await renderActiveMode({ resetScroll: true });
}

bootstrap().catch((err) => {
  appLogger.error('BOOTSTRAP', err && err.message ? err.message : 'Erro ao iniciar aplicativo.', err);
  showToast(err && err.message ? err.message : 'Erro ao iniciar aplicativo.');
  console.error('[app] Falha no bootstrap:', err);
});
