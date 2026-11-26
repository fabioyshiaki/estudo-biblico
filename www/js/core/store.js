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

function compareBibles(a, b, sortBy) {
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
  activeModulePath: typeof persisted.activeModulePath === 'string' ? persisted.activeModulePath : '',
  book: Number(persisted.book) > 0 ? Number(persisted.book) : 1,
  chapter: Number(persisted.chapter) > 0 ? Number(persisted.chapter) : 1,
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
      activeModulePath: state.activeModulePath,
      book: state.book,
      chapter: state.chapter,
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

  updatePrefs(partial) {
    state.prefs = { ...state.prefs, ...partial };
    persistNow();
    eventBus.emit(EVENTS.PREFS_CHANGED, this.getPrefs());
  },

  setSourcesAndModules(sources, modules) {
    state.sources = Array.isArray(sources) ? sources : [];
    state.modules = Array.isArray(modules) ? modules : [];

    const bibles = this.getBibles();
    const stillExists = bibles.some((m) => m.path === state.activeModulePath);

    if (!stillExists) {
      state.activeModulePath = bibles.length > 0 ? bibles[0].path : '';
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
      .sort((a, b) => compareBibles(a, b, sortBy));
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

  setLocation(book, chapter) {
    const nextBook = Number(book) || 1;
    const nextChapter = Number(chapter) || 1;
    state.book = nextBook;
    state.chapter = nextChapter;
    persistNow();
    eventBus.emit(EVENTS.LOCATION_CHANGED, { book: nextBook, chapter: nextChapter });
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
