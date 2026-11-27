import { nativeBridge } from '../bridge/native-bridge.js';
import { store } from './store.js';
import { eventBus, EVENTS } from './events.js';
import {
  initReaderView,
  renderReader,
  stepBible,
  stepBook,
  stepChapter
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
  initSelectionLookupBar
} from '../ui/dictionary-view.js';
import {
  openBiblePickerModal,
  openDictionaryPickerModal,
  openLocationPickerModal,
  openFootnoteModal
} from '../ui/nav-modal.js';
import { openSettingsModal } from '../ui/sources-modal.js';

let toastTimer = null;
let savedBibleScrollTop = 0;
let pendingScrollVerse = null;
let suppressModeAutoLoad = false;

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
    onNavigateBible: ({ book, chapter, verse }) => {
      pendingScrollVerse = verse || 1;
      const curState = store.getState();
      const sameChapter = curState.book === book && curState.chapter === chapter;
      if (store.getActiveMode() !== 'bible') {
        if (!sameChapter) {
          suppressModeAutoLoad = true;
          store.setActiveMode('bible');
          suppressModeAutoLoad = false;
          store.setLocation(book, chapter);
        } else {
          store.setActiveMode('bible');
        }
      } else if (!sameChapter) {
        store.setLocation(book, chapter);
      } else {
        const vTarget = pendingScrollVerse;
        pendingScrollVerse = null;
        renderReader({ resetScroll: false, scrollToVerse: vTarget });
      }
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
