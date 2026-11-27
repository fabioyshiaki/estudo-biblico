import { nativeBridge } from '../bridge/native-bridge.js';
import { store } from './store.js';
import { eventBus, EVENTS } from './events.js';
import { getBookName, formatReference } from './canon.js';
import {
  initGlobalBibleRefs,
  updateBibleBackButton
} from './bible-refs.js';
import {
  initReaderView,
  renderReader,
  stepBible,
  stepBook,
  stepChapter,
  loadBooksForBible,
  loadChaptersForBible
} from '../ui/reader-view.js';
import {
  initDictionaryView,
  syncDictionaryModules,
  setActiveDictionaryModule,
  stepDictionaryModule,
  loadFirstOrCurrentEntry,
  openDictionaryEntry,
  searchDictionaryTerm,
  stepDictionaryEntry,
  renderDictionaryView,
  initSelectionLookupBar,
  getDictionaryViewState
} from '../ui/dictionary-view.js';
import {
  openBiblePickerModal,
  openDictionaryPickerModal,
  openLocationPickerModal,
  openFootnoteModal,
  closeModal
} from '../ui/nav-modal.js';
import { openSettingsModal } from '../ui/sources-modal.js';

let toastTimer = null;
let savedBibleScrollTop = 0;
let pendingScrollVerse = null;
let suppressModeAutoLoad = false;
let suppressModuleAutoLoad = false;
let suppressLocationAutoLoad = false;
const jumpHistory = [];

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

function updateDictionaryChrome(meta = {}) {
  const dicts = store.getDictionaries();
  const active = meta.activeModule || store.getActiveDictionary();
  const idx = active ? dicts.findIndex((m) => m.path === active.path) : -1;

  const dictLabel = document.getElementById('label-active-dict');
  const prevDictBtn = document.getElementById('btn-prev-dict');
  const nextDictBtn = document.getElementById('btn-next-dict');

  if (dictLabel) {
    dictLabel.textContent = active ? (active.abbr || active.title) : 'Sem Dicionário';
  }
  if (prevDictBtn) prevDictBtn.disabled = dicts.length < 2 || idx < 0;
  if (nextDictBtn) nextDictBtn.disabled = dicts.length < 2 || idx < 0;

  if (store.getActiveMode() === 'dictionary') {
    const metaLabel = document.getElementById('chapter-meta');
    const prevBtn = document.getElementById('btn-prev-chapter');
    const nextBtn = document.getElementById('btn-next-chapter');

    if (metaLabel) {
      const modName = active ? (active.abbr || active.title) : 'Nenhum dicionário';
      const detail = meta.entryWord || meta.query || '';
      metaLabel.textContent = detail ? `${modName} • ${detail}` : modName;
    }
    if (prevBtn) prevBtn.disabled = !active;
    if (nextBtn) nextBtn.disabled = !active;
  }
}

function syncModeChrome() {
  const mode = store.getActiveMode();
  const isDict = mode === 'dictionary';

  document.getElementById('nav-group-bible')?.classList.toggle('hidden', isDict);
  document.getElementById('nav-group-book')?.classList.toggle('hidden', isDict);
  document.getElementById('nav-group-dict')?.classList.toggle('hidden', !isDict);

  const bibleBtn = document.getElementById('btn-mode-bible');
  const dictBtn = document.getElementById('btn-mode-dictionary');

  if (bibleBtn) {
    bibleBtn.classList.toggle('is-active', !isDict);
    bibleBtn.setAttribute('aria-selected', String(!isDict));
  }
  if (dictBtn) {
    dictBtn.classList.toggle('is-active', isDict);
    dictBtn.setAttribute('aria-selected', String(isDict));
  }

  if (isDict) {
    updateDictionaryChrome();
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
  if (activeDict) {
    setActiveDictionaryModule(activeDict.path, { keepTerm: false, render: false });
  }
  updateDictionaryChrome({ activeModule: activeDict });
}

async function findBibleContainingBook(bookId) {
  const active = store.getActiveBible();
  if (active) {
    const activeBooks = await loadBooksForBible(active);
    if (activeBooks.includes(bookId)) {
      return { bible: active, books: activeBooks, switched: false };
    }
  }

  const allBibles = store.getBibles().filter((m) => !active || m.path !== active.path);
  const isOT = bookId <= 39;

  // Prioriza Bíblias que não parecem restritas ao testamento oposto
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

async function navigateToBibleReference({ book, chapter, verse }, options = {}) {
  closeModal();

  const bibles = store.getBibles();
  if (!bibles.length) {
    showToast('Adicione uma Bíblia (.bbl.mybible) em Configurações → Fontes.');
    return;
  }

  const targetMatch = await findBibleContainingBook(book);
  if (!targetMatch) {
    showToast(`Nenhuma Bíblia instalada contém ${getBookName(book)}.`);
    return;
  }

  const targetBible = targetMatch.bible;
  const chapters = await loadChaptersForBible(targetBible, book);
  if (!chapters.length) {
    showToast(`Não foi possível abrir ${getBookName(book)} em ${targetBible.abbr || targetBible.title}.`);
    return;
  }

  const targetChapter = chapters.includes(chapter) ? chapter : chapters[0];
  const targetVerse = Number(verse) || 1;

  // Registra ponto de retorno no histórico de saltos
  if (options.recordHistory !== false) {
    if (store.getActiveMode() === 'dictionary') {
      const dState = getDictionaryViewState();
      const word = dState.currentEntry ? dState.currentEntry.word : '';
      jumpHistory.push({
        mode: 'dictionary',
        modulePath: dState.activeModulePath || '',
        word,
        label: word ? `Dic: ${word}` : 'Dicionário'
      });
    } else {
      const curState = store.getState();
      const curBible = store.getActiveBible();
      const scrollBox = document.getElementById('reader-scroll');
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
        jumpHistory.push({
          mode: 'bible',
          modulePath: curBible ? curBible.path : '',
          book: curState.book,
          chapter: curState.chapter,
          verse: originVerse,
          scrollTop: scrollBox ? scrollBox.scrollTop : 0,
          label: originVerse
            ? formatReference(curState.book, curState.chapter, originVerse)
            : formatReference(curState.book, curState.chapter)
        });
      }
    }

    if (jumpHistory.length > 25) {
      jumpHistory.shift();
    }
  }

  const curState = store.getState();
  const isAlreadyBible = store.getActiveMode() === 'bible';
  const sameModule = !targetMatch.switched;
  const sameChapter = curState.book === book && curState.chapter === targetChapter;

  if (targetMatch.switched) {
    showToast(
      `Abrindo ${formatReference(book, targetChapter, targetVerse)} em ${targetBible.abbr || targetBible.title}`
    );
  }

  // Mesmo módulo e mesmo capítulo já na tela: rola imediatamente sem recarregar SQLite
  if (isAlreadyBible && sameModule && sameChapter) {
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

  if (!sameChapter) {
    suppressLocationAutoLoad = true;
    store.setLocation(book, targetChapter);
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
        fallbackAll: false
      });
    } else {
      await loadFirstOrCurrentEntry();
    }
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
    store.setLocation(prev.book, prev.chapter);
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

  rememberBibleScrollIfActive();

  if (store.getActiveMode() !== 'dictionary') {
    suppressModeAutoLoad = true;
    store.setActiveMode('dictionary');
    suppressModeAutoLoad = false;
  }

  if (searchAll) {
    await searchDictionaryTerm(term, { scope: 'all', searchBody: false });
  } else {
    await openDictionaryEntry(term, {
      moduleHint,
      pushHistory: true,
      fallbackAll: true
    });
  }
}

async function renderActiveMode({ resetScroll = false } = {}) {
  syncModeChrome();
  if (store.getActiveMode() === 'dictionary') {
    await loadFirstOrCurrentEntry();
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
  document.getElementById('btn-prev-bible')?.addEventListener('click', () => {
    stepBible(-1);
  });

  document.getElementById('btn-next-bible')?.addEventListener('click', () => {
    stepBible(1);
  });

  document.getElementById('btn-bible-picker')?.addEventListener('click', () => {
    openBiblePickerModal({
      onOpenSources: () => openSettingsModal({ initialTab: 'sources', initialKind: 'bible' })
    });
  });

  document.getElementById('btn-prev-book')?.addEventListener('click', () => {
    stepBook(-1);
  });

  document.getElementById('btn-next-book')?.addEventListener('click', () => {
    stepBook(1);
  });

  document.getElementById('btn-nav-picker')?.addEventListener('click', () => {
    openLocationPickerModal();
  });

  document.getElementById('btn-prev-dict')?.addEventListener('click', () => {
    stepDictionaryModule(-1);
  });

  document.getElementById('btn-next-dict')?.addEventListener('click', () => {
    stepDictionaryModule(1);
  });

  document.getElementById('btn-dict-picker')?.addEventListener('click', () => {
    openDictionaryPickerModal({
      onOpenSources: () => openSettingsModal({ initialTab: 'sources', initialKind: 'dictionary' })
    });
  });

  document.getElementById('btn-mode-bible')?.addEventListener('click', () => {
    store.setActiveMode('bible');
  });

  document.getElementById('btn-mode-dictionary')?.addEventListener('click', () => {
    rememberBibleScrollIfActive();
    store.setActiveMode('dictionary');
  });

  document.getElementById('btn-settings')?.addEventListener('click', () => {
    openSettingsModal({
      initialTab: 'sources',
      initialKind: store.getActiveMode() === 'dictionary' ? 'dictionary' : 'bible'
    });
  });

  document.getElementById('btn-prev-chapter')?.addEventListener('click', () => {
    if (store.getActiveMode() === 'dictionary') {
      stepDictionaryEntry(-1);
    } else {
      stepChapter(-1);
    }
  });

  document.getElementById('btn-next-chapter')?.addEventListener('click', () => {
    if (store.getActiveMode() === 'dictionary') {
      stepDictionaryEntry(1);
    } else {
      stepChapter(1);
    }
  });
}

function bindStateEvents() {
  eventBus.on(EVENTS.TOAST, showToast);

  eventBus.on(EVENTS.PREFS_CHANGED, (prefs) => {
    applyVisualPrefs(prefs);
    syncDictionaryModules(store.getDictionaries());
    if (store.getActiveMode() === 'dictionary') {
      renderDictionaryView({ resetScroll: false });
    } else {
      renderReader({ resetScroll: false });
    }
  });

  eventBus.on(EVENTS.SOURCES_UPDATED, () => {
    syncDictionariesFromStore();
    if (store.getActiveMode() === 'dictionary') {
      loadFirstOrCurrentEntry();
    } else {
      renderReader({ resetScroll: false });
    }
  });

  eventBus.on(EVENTS.MODULE_CHANGED, () => {
    savedBibleScrollTop = 0;
    if (suppressModuleAutoLoad) return;
    if (store.getActiveMode() === 'bible') {
      renderReader({ resetScroll: true });
    }
  });

  eventBus.on(EVENTS.DICT_CHANGED, (dictMod) => {
    if (!dictMod) return;
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
    if (store.getActiveMode() === 'bible') {
      const verseTarget = pendingScrollVerse;
      pendingScrollVerse = null;
      renderReader({ resetScroll: !verseTarget, scrollToVerse: verseTarget });
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
    onLookupDictionary: (term, opts) => openTermInDictionary(term, opts)
  });

  initDictionaryView({
    onOpenSources: () => openSettingsModal({ initialTab: 'sources', initialKind: 'dictionary' }),
    onOpenFootnote: (ref, text) => openFootnoteModal(ref, text),
    onToast: showToast,
    onStateMetaChange: (meta) => {
      if (meta && meta.activeModule && meta.activeModule.path) {
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

  bindShellEvents();
  bindStateEvents();

  await syncPermissionAndData();
  await renderActiveMode({ resetScroll: true });
}

bootstrap().catch((err) => {
  showToast(err && err.message ? err.message : 'Erro ao iniciar aplicativo.');
  console.error('[app] Falha no bootstrap:', err);
});
