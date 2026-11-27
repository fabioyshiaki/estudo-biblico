import { eventBus, EVENTS } from './events.js';

const STORAGE_KEY = 'estudo_biblico_v1_state';

const DEFAULT_PREFS = Object.freeze({
  theme: 'paper',
  fontSize: 19,
  lineHeight: 1.72,
  fontFamily: 'serif',
  justifyText: false,
  showStrongs: false,
  showMorph: false,
  bibleSortBy: 'abbr'
});

function loadPersisted() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    return {};
  }
}

function normalizeMode(mode) {
  if (mode === 'dictionary' || mode === 'commentary') return mode;
  return 'bible';
}

function compareModules(a, b, sortBy) {
  const favDiff = Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite));
  if (favDiff !== 0) return favDiff;

  const primaryA = sortBy === 'title' ? (a.title || a.abbr || '') : (a.abbr || a.title || '');
  const primaryB = sortBy === 'title' ? (b.title || b.abbr || '') : (b.abbr || b.title || '');
  const primaryDiff = String(primaryA).localeCompare(String(primaryB), 'pt-BR', {
    sensitivity: 'base',
    numeric: true
  });
  if (primaryDiff !== 0) return primaryDiff;

  const secondaryA = sortBy === 'title' ? (a.abbr || '') : (a.title || '');
  const secondaryB = sortBy === 'title' ? (b.abbr || '') : (b.title || '');
  return String(secondaryA).localeCompare(String(secondaryB), 'pt-BR', {
    sensitivity: 'base',
    numeric: true
  });
}

const persisted = loadPersisted();

const state = {
  hasStoragePermission: false,
  sources: [],
  modules: [],
  activeMode: normalizeMode(persisted.activeMode),
  activeModulePath: typeof persisted.activeModulePath === 'string' ? persisted.activeModulePath : '',
  activeDictionaryPath: typeof persisted.activeDictionaryPath === 'string' ? persisted.activeDictionaryPath : '',
  activeCommentaryPath: typeof persisted.activeCommentaryPath === 'string' ? persisted.activeCommentaryPath : '',
  book: Number(persisted.book) > 0 ? Number(persisted.book) : 1,
  chapter: Number(persisted.chapter) > 0 ? Number(persisted.chapter) : 1,
  verse: Number(persisted.verse) > 0 ? Number(persisted.verse) : 1,
  prefs: {
    ...DEFAULT_PREFS,
    ...(persisted.prefs && typeof persisted.prefs === 'object' ? persisted.prefs : {})
  },
  booksCache: new Map(),
  chaptersCache: new Map()
};

function persistNow() {
  try {
    const payload = {
      activeMode: state.activeMode,
      activeModulePath: state.activeModulePath,
      activeDictionaryPath: state.activeDictionaryPath,
      activeCommentaryPath: state.activeCommentaryPath,
      book: state.book,
      chapter: state.chapter,
      verse: state.verse,
      prefs: state.prefs
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    // Ignora caso storage esteja indisponível
  }
}

export const store = {
  getState() {
    return state;
  },

  getPrefs() {
    return { ...state.prefs };
  },

  setPermission(granted) {
    state.hasStoragePermission = Boolean(granted);
  },

  getActiveMode() {
    return state.activeMode;
  },

  setActiveMode(mode) {
    const next = normalizeMode(mode);
    if (next === state.activeMode) return;
    state.activeMode = next;
    persistNow();
    eventBus.emit(EVENTS.MODE_CHANGED, next);
  },

  updatePrefs(partial) {
    state.prefs = { ...state.prefs, ...partial };
    persistNow();
    eventBus.emit(EVENTS.PREFS_CHANGED, this.getPrefs());
  },

  setSourcesAndModules(sources, modules) {
    state.sources = Array.isArray(sources) ? sources : [];
    state.modules = Array.isArray(modules) ? modules : [];

    let changed = false;

    const bibles = this.getBibles();
    const bibleExists = bibles.some((m) => m.path === state.activeModulePath);
    if (!bibleExists) {
      state.activeModulePath = bibles.length > 0 ? bibles[0].path : '';
      changed = true;
    }

    const dicts = this.getDictionaries();
    const dictExists = dicts.some((m) => m.path === state.activeDictionaryPath);
    if (!dictExists) {
      state.activeDictionaryPath = dicts.length > 0 ? dicts[0].path : '';
      changed = true;
    }

    const commentaries = this.getCommentaries();
    const cmtExists = commentaries.some((m) => m.path === state.activeCommentaryPath);
    if (!cmtExists) {
      state.activeCommentaryPath = commentaries.length > 0 ? commentaries[0].path : '';
      changed = true;
    }

    if (changed) {
      persistNow();
    }

    eventBus.emit(EVENTS.SOURCES_UPDATED, {
      sources: state.sources,
      modules: state.modules
    });
  },

  setModulesOnly(modules) {
    this.setSourcesAndModules(state.sources, modules);
  },

  getBibles() {
    const sortBy = state.prefs.bibleSortBy === 'title' ? 'title' : 'abbr';
    return state.modules
      .filter((m) => m.resourceKind === 'bible')
      .sort((a, b) => compareModules(a, b, sortBy));
  },

  getActiveBible() {
    const bibles = this.getBibles();
    if (!bibles.length) return null;
    return bibles.find((m) => m.path === state.activeModulePath) || bibles[0];
  },

  setActiveModule(modulePath) {
    if (!modulePath || modulePath === state.activeModulePath) return;
    state.activeModulePath = modulePath;
    persistNow();
    eventBus.emit(EVENTS.MODULE_CHANGED, this.getActiveBible());
  },

  getDictionaries() {
    const sortBy = state.prefs.bibleSortBy === 'title' ? 'title' : 'abbr';
    return state.modules
      .filter((m) => m.resourceKind === 'dictionary')
      .sort((a, b) => compareModules(a, b, sortBy));
  },

  getActiveDictionary() {
    const dicts = this.getDictionaries();
    if (!dicts.length) return null;
    return dicts.find((m) => m.path === state.activeDictionaryPath) || dicts[0];
  },

  setActiveDictionary(modulePath, { silent = false } = {}) {
    if (!modulePath || modulePath === state.activeDictionaryPath) return;
    state.activeDictionaryPath = modulePath;
    persistNow();
    if (!silent) {
      eventBus.emit(EVENTS.DICT_CHANGED, this.getActiveDictionary());
    }
  },

  getCommentaries() {
    const sortBy = state.prefs.bibleSortBy === 'title' ? 'title' : 'abbr';
    return state.modules
      .filter((m) => m.resourceKind === 'commentary')
      .sort((a, b) => compareModules(a, b, sortBy));
  },

  getActiveCommentary() {
    const list = this.getCommentaries();
    if (!list.length) return null;
    return list.find((m) => m.path === state.activeCommentaryPath) || list[0];
  },

  setActiveCommentary(modulePath, { silent = false } = {}) {
    if (!modulePath || modulePath === state.activeCommentaryPath) return;
    state.activeCommentaryPath = modulePath;
    persistNow();
    if (!silent) {
      eventBus.emit(EVENTS.COMMENTARY_CHANGED, this.getActiveCommentary());
    }
  },

  setLocation(book, chapter, verse = 1) {
    const nextBook = Number(book) || 1;
    const nextChapter = Number(chapter) || 1;
    const nextVerse = Number(verse) > 0 ? Math.trunc(Number(verse)) : 1;
    state.book = nextBook;
    state.chapter = nextChapter;
    state.verse = nextVerse;
    persistNow();
    eventBus.emit(EVENTS.LOCATION_CHANGED, {
      book: nextBook,
      chapter: nextChapter,
      verse: nextVerse
    });
  },

  setActiveVerse(verse, { silent = false } = {}) {
    const nextVerse = Number(verse) > 0 ? Math.trunc(Number(verse)) : 1;
    if (nextVerse === state.verse) return;
    state.verse = nextVerse;
    persistNow();
    if (!silent) {
      eventBus.emit(EVENTS.VERSE_CHANGED, {
        book: state.book,
        chapter: state.chapter,
        verse: nextVerse
      });
    }
  },

  getCachedBooks(modulePath) {
    return state.booksCache.get(modulePath) || null;
  },

  setCachedBooks(modulePath, books) {
    state.booksCache.set(modulePath, books);
  },

  getCachedChapters(modulePath, bookId) {
    return state.chaptersCache.get(`${modulePath}::${bookId}`) || null;
  },

  setCachedChapters(modulePath, bookId, chapters) {
    state.chaptersCache.set(`${modulePath}::${bookId}`, chapters);
  },

  clearStructureCache() {
    state.booksCache.clear();
    state.chaptersCache.clear();
  }
};
