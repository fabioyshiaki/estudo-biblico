import {
  myswordDictionaryAdapter,
  normalizeLookupTerm,
  DEFAULT_DICT_SEARCH_OPTIONS,
  normalizeDictSearchOptions
} from '../formats/mysword-dictionary.js';
import {
  lookupExactAcrossDictionaries,
  searchAcrossDictionaries,
  findDictionariesWithTerm,
  getCachedDictionariesWithTerm
} from '../formats/dictionary-lookup.js';
import { parseBibleReference } from '../core/bible-refs.js';
import { resolveDictionaryImageUrl } from '../formats/media-cache.js';
import { ensureCompanionStyles } from '../formats/companion-dicts.js';
import { openDictionaryTermsModal } from './dictionary-terms-modal.js';
import { appLogger } from '../core/logger.js';

const SEARCH_OPTS_STORAGE_KEY = 'estudo_biblico_dct_search_opts_v1';

function loadSavedSearchOptions() {
  try {
    const raw = window.localStorage.getItem(SEARCH_OPTS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DICT_SEARCH_OPTIONS };
    return normalizeDictSearchOptions(JSON.parse(raw));
  } catch (err) {
    return { ...DEFAULT_DICT_SEARCH_OPTIONS };
  }
}

function saveSearchOptions(opts) {
  try {
    window.localStorage.setItem(SEARCH_OPTS_STORAGE_KEY, JSON.stringify(opts));
  } catch (err) {
    // Ignora caso localStorage esteja indisponível
  }
}

const viewState = {
  dictionaries: [],
  activeModulePath: '',
  currentEntry: null,
  query: '',
  filterTerm: '',
  searchOptions: loadSavedSearchOptions(),
  searchPanelOpen: false,
  optionsOpen: false,
  searchScope: 'current', // 'current' | 'all'
  mode: 'entry',          // 'entry' | 'results' | 'loading' | 'empty' | 'error'
  statusText: '',
  results: [],
  history: [],            // [{ modulePath, word, filterTerm }]
  activeAbort: null
};

let imageRenderSeq = 0;
let isSteppingDict = false;

let callbacks = {
  onOpenSources: () => {},
  onOpenLogs: () => {},
  onOpenFootnote: () => {},
  onNavigateBible: () => {},
  onStateMetaChange: () => {},
  onToast: () => {}
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getActiveModule() {
  if (!viewState.dictionaries.length) return null;
  const found = viewState.dictionaries.find((m) => m.path === viewState.activeModulePath);
  if (found) return found;
  viewState.activeModulePath = viewState.dictionaries[0].path;
  return viewState.dictionaries[0];
}

function getModuleLabel(mod) {
  if (!mod) return 'Dicionário';
  return mod.title || mod.abbr || mod.fileName || 'Dicionário';
}

function shouldShowHeaderPanel() {
  return Boolean(
    viewState.searchPanelOpen ||
    viewState.mode === 'results' ||
    viewState.mode === 'error'
  );
}

function getActiveOptionLabels(opts) {
  const tags = [];
  if (opts.matchMode === 'exact') tags.push('Palavra exata');
  else if (opts.matchMode === 'startsWith') tags.push('Começa com');
  if (opts.accentSensitive) tags.push('Com acento');
  if (opts.caseSensitive) tags.push('Maiúsculas (Aa)');
  if (opts.searchBody) tags.push('No texto');
  if (!opts.searchAltWords) tags.push('Sem sinônimos');
  if (opts.exactPhrase) tags.push('Frase exata');
  if (opts.favoritesOnly) tags.push('Só favoritos ★');
  return tags;
}

function cancelOngoingSearch() {
  if (viewState.activeAbort) {
    viewState.activeAbort.abort();
    viewState.activeAbort = null;
  }
}

function notifyMeta() {
  const mod = getActiveModule();
  callbacks.onStateMetaChange({
    activeModule: mod,
    entryWord: viewState.currentEntry ? viewState.currentEntry.word : '',
    query: viewState.query,
    filterTerm: viewState.filterTerm,
    searchOptions: { ...viewState.searchOptions },
    searchPanelOpen: shouldShowHeaderPanel(),
    historyLength: viewState.history.length
  });
}

function pushHistorySnapshot() {
  if (!viewState.activeModulePath || !viewState.currentEntry || !viewState.currentEntry.word) {
    return;
  }
  const prev = viewState.history[viewState.history.length - 1];
  if (
    prev &&
    prev.modulePath === viewState.activeModulePath &&
    prev.word.toLowerCase() === viewState.currentEntry.word.toLowerCase()
  ) {
    return;
  }
  viewState.history.push({
    modulePath: viewState.activeModulePath,
    word: viewState.currentEntry.word,
    filterTerm: viewState.filterTerm
  });
  if (viewState.history.length > 40) {
    viewState.history.shift();
  }
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

async function hydrateDictionaryImages(rootEl, modulePath, rawContext, seq) {
  if (!rootEl || !modulePath) return;
  const imgs = Array.from(rootEl.querySelectorAll('img[data-dct-img-src]'));
  if (!imgs.length) return;

  const modName = modulePath.split(/[\\/]/).pop() || modulePath;

  for (const img of imgs) {
    if (seq !== imageRenderSeq) return;
    const rawSrc = img.getAttribute('data-dct-img-src') || '';
    const fallbackUrl = img.getAttribute('data-dct-img-fallback') || '';
    const picEl = img.closest('.dct-pic');

    try {
      const res = await resolveDictionaryImageUrl(modulePath, rawSrc, {
        contextRaw: rawContext || '',
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
        appLogger.warn('DICT_IMG', `Imagem não carregada (${rawSrc}) em ${modName}: ${errReason}`, {
          module: modName,
          src: rawSrc,
          fallbackUrl
        });
        showImageErrorHint(picEl, rawSrc, errReason);
        continue;
      }

      img.onload = () => {
        img.classList.remove('is-loading');
      };
      img.onerror = () => {
        img.classList.remove('is-loading');
        appLogger.warn('DICT_IMG', `Falha ao decodificar imagem (${rawSrc}) no WebView`, {
          module: modName,
          src: rawSrc,
          urlPreview: String(resolvedUrl).slice(0, 90)
        });
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
      appLogger.error('DICT_IMG', `Exceção ao carregar imagem (${rawSrc}) em ${modName}: ${reason}`, err);
      showImageErrorHint(picEl, rawSrc, reason);
    }
  }
}

export function initDictionaryView(userCallbacks = {}) {
  callbacks = { ...callbacks, ...userCallbacks };
  ensureCompanionStyles();
}

export function syncDictionaryModules(modules = []) {
  viewState.dictionaries = Array.isArray(modules) ? modules.slice() : [];
  if (!viewState.dictionaries.length) {
    viewState.activeModulePath = '';
    viewState.currentEntry = null;
  } else if (!viewState.dictionaries.some((m) => m.path === viewState.activeModulePath)) {
    viewState.activeModulePath = viewState.dictionaries[0].path;
    viewState.currentEntry = null;
  }
  notifyMeta();
}

export function getDictionaryViewState() {
  return {
    dictionaries: viewState.dictionaries,
    activeModule: getActiveModule(),
    activeModulePath: viewState.activeModulePath,
    currentEntry: viewState.currentEntry,
    query: viewState.query,
    filterTerm: viewState.filterTerm,
    searchBody: viewState.searchOptions.searchBody,
    searchOptions: { ...viewState.searchOptions },
    searchPanelOpen: shouldShowHeaderPanel(),
    historyLength: viewState.history.length
  };
}

export function isDictionarySearchBarOpen() {
  return shouldShowHeaderPanel();
}

export function toggleDictionarySearchBar(forceOpen = null) {
  const nextOpen = typeof forceOpen === 'boolean'
    ? forceOpen
    : !shouldShowHeaderPanel();

  viewState.searchPanelOpen = nextOpen;

  // Se o usuário pediu para fechar estando na tela de resultados e há um verbete aberto, retorna ao verbete
  if (!nextOpen && (viewState.mode === 'results' || viewState.mode === 'error') && viewState.currentEntry) {
    viewState.mode = 'entry';
    viewState.statusText = '';
    notifyMeta();
    renderDictionaryView({ resetScroll: false });
    return;
  }

  const headerZone = document.getElementById('dct-header-zone');
  if (headerZone) {
    headerZone.classList.toggle('is-collapsed', !shouldShowHeaderPanel());
    if (nextOpen) {
      const scrollBox = document.getElementById('reader-scroll');
      if (scrollBox) scrollBox.scrollTo({ top: 0, behavior: 'smooth' });
      window.requestAnimationFrame(() => {
        headerZone.querySelector('#dct-search-input')?.focus();
      });
    }
    notifyMeta();
  } else {
    notifyMeta();
    renderDictionaryView({ resetScroll: nextOpen });
  }
}

export function openActiveDictionaryTerms() {
  const mod = getActiveModule();
  if (!mod) {
    callbacks.onToast('Nenhum dicionário selecionado.');
    return;
  }

  openDictionaryTermsModal({
    dictionaryModule: mod,
    currentWord: viewState.currentEntry ? viewState.currentEntry.word : '',
    onSelectTerm: (chosenWord) => {
      openDictionaryEntry(chosenWord, {
        modulePath: mod.path,
        pushHistory: true,
        fallbackAll: false,
        directWord: true
      });
    }
  });
}

export async function setActiveDictionaryModule(modulePath, options = {}) {
  const target = viewState.dictionaries.find((m) => m.path === modulePath);
  if (!target) return false;

  const previousWord = viewState.currentEntry ? viewState.currentEntry.word : '';
  viewState.activeModulePath = target.path;

  if (options.matchedWord) {
    await openDictionaryEntry(options.matchedWord, {
      modulePath: target.path,
      pushHistory: options.pushHistory !== false,
      fallbackAll: false,
      keepFilterTerm: Boolean(options.keepFilterTerm),
      directWord: true,
      render: options.render !== false
    });
    return true;
  }

  const termToKeep = viewState.filterTerm || previousWord;
  if (options.keepTerm && termToKeep) {
    await openDictionaryEntry(termToKeep, {
      modulePath: target.path,
      pushHistory: false,
      fallbackAll: false,
      keepFilterTerm: Boolean(viewState.filterTerm),
      render: options.render !== false
    });
    return true;
  }

  if (options.clearFilter) {
    viewState.filterTerm = '';
    viewState.query = '';
  }

  viewState.currentEntry = null;
  if (options.render !== false) {
    await loadFirstOrCurrentEntry();
  } else {
    notifyMeta();
  }
  return true;
}

export async function stepDictionaryModule(delta) {
  const list = viewState.dictionaries;
  if (list.length < 2 || isSteppingDict) return;

  const activeFilter = normalizeLookupTerm(viewState.filterTerm);

  if (activeFilter) {
    isSteppingDict = true;
    try {
      const searchOpts = { ...viewState.searchOptions };
      if (searchOpts.favoritesOnly && !list.some((m) => m.isFavorite)) {
        callbacks.onToast('Nenhum dicionário marcado como favorito.');
        return;
      }

      let matches = getCachedDictionariesWithTerm(list, activeFilter, searchOpts);
      if (!matches) {
        callbacks.onToast(`Verificando dicionários com "${activeFilter}"...`);
        matches = await findDictionariesWithTerm(list, activeFilter, {
          ...searchOpts,
          activePath: viewState.activeModulePath,
          concurrency: 4
        });
      }

      if (!matches.length) {
        callbacks.onToast(`Nenhum dicionário contém "${activeFilter}" com os filtros atuais.`);
        return;
      }

      if (matches.length === 1) {
        const only = matches[0];
        if (only.module.path === viewState.activeModulePath) {
          callbacks.onToast(`Apenas este dicionário contém "${activeFilter}".`);
          return;
        }
        await openDictionaryEntry(only.word, {
          modulePath: only.module.path,
          pushHistory: false,
          fallbackAll: false,
          keepFilterTerm: true,
          directWord: true
        });
        return;
      }

      const curIdx = matches.findIndex((item) => item.module.path === viewState.activeModulePath);
      const nextIdx = curIdx < 0
        ? (delta >= 0 ? 0 : matches.length - 1)
        : (curIdx + delta + matches.length) % matches.length;
      const nextMatch = matches[nextIdx];

      await openDictionaryEntry(nextMatch.word, {
        modulePath: nextMatch.module.path,
        pushHistory: false,
        fallbackAll: false,
        keepFilterTerm: true,
        directWord: true
      });
    } catch (err) {
      appLogger.error('DICT_STEP', `Erro ao alternar dicionário para "${activeFilter}"`, err);
      callbacks.onToast('Erro ao alternar dicionário. Verifique Configurações → Logs.');
    } finally {
      isSteppingDict = false;
    }
    return;
  }

  const pool = viewState.searchOptions.favoritesOnly
    ? list.filter((m) => m.isFavorite)
    : list;
  if (pool.length < 2) {
    if (viewState.searchOptions.favoritesOnly) {
      callbacks.onToast('Menos de 2 dicionários marcados como favoritos.');
    }
    return;
  }

  const idx = Math.max(0, pool.findIndex((m) => m.path === viewState.activeModulePath));
  const nextIdx = (idx + delta + pool.length) % pool.length;
  await setActiveDictionaryModule(pool[nextIdx].path, { keepTerm: true, render: true });
}

export async function loadFirstOrCurrentEntry() {
  const mod = getActiveModule();
  if (!mod) {
    viewState.mode = 'empty';
    renderDictionaryView();
    return;
  }

  if (viewState.currentEntry) {
    viewState.mode = 'entry';
    renderDictionaryView();
    return;
  }

  viewState.mode = 'loading';
  viewState.statusText = `Abrindo ${getModuleLabel(mod)}...`;
  renderDictionaryView();

  try {
    const first = await myswordDictionaryAdapter.getFirstEntry(mod.path);
    viewState.currentEntry = first;
    viewState.mode = first ? 'entry' : 'empty';
    viewState.statusText = first ? '' : 'Nenhum verbete encontrado neste dicionário.';
  } catch (err) {
    const msg = err && err.message ? err.message : 'Erro ao ler dicionário.';
    appLogger.error('DICT_LOAD', `Falha ao abrir primeiro verbete de ${getModuleLabel(mod)}: ${msg}`, err);
    viewState.currentEntry = null;
    viewState.mode = 'error';
    viewState.statusText = msg;
  }

  notifyMeta();
  renderDictionaryView({ resetScroll: true });
}

export async function openDictionaryEntry(rawTerm, options = {}) {
  const clean = normalizeLookupTerm(rawTerm);
  if (!clean) {
    await loadFirstOrCurrentEntry();
    return false;
  }

  if (!viewState.dictionaries.length) {
    callbacks.onToast('Nenhum dicionário instalado. Adicione uma pasta em Configurações.');
    viewState.mode = 'empty';
    renderDictionaryView();
    return false;
  }

  cancelOngoingSearch();
  const controller = new AbortController();
  viewState.activeAbort = controller;

  if (options.pushHistory !== false && viewState.currentEntry) {
    pushHistorySnapshot();
  }

  if (options.keepFilterTerm && viewState.filterTerm) {
    viewState.query = viewState.filterTerm;
  } else {
    viewState.query = clean;
    viewState.filterTerm = clean;
  }

  viewState.mode = 'loading';
  viewState.statusText = `Procurando "${clean}"...`;
  renderDictionaryView();

  const preferredMod = options.modulePath
    ? viewState.dictionaries.find((m) => m.path === options.modulePath)
    : getActiveModule();

  const lookupOpts = options.directWord
    ? { accentSensitive: false, caseSensitive: false, searchAltWords: true, favoritesOnly: false }
    : { ...viewState.searchOptions };

  try {
    if (options.moduleHint) {
      const exactHinted = await lookupExactAcrossDictionaries(viewState.dictionaries, clean, {
        ...lookupOpts,
        activePath: preferredMod ? preferredMod.path : '',
        moduleHint: options.moduleHint,
        signal: controller.signal
      });
      if (controller.signal.aborted) return false;
      if (exactHinted) {
        viewState.activeModulePath = exactHinted.module.path;
        viewState.currentEntry = exactHinted.entry;
        viewState.mode = 'entry';
        viewState.searchPanelOpen = false;
        viewState.statusText = '';
        notifyMeta();
        renderDictionaryView({ resetScroll: true });
        return true;
      }
    }

    if (preferredMod) {
      const exactHere = await myswordDictionaryAdapter.getEntry(preferredMod.path, clean, lookupOpts);
      if (controller.signal.aborted) return false;
      if (exactHere) {
        viewState.activeModulePath = preferredMod.path;
        viewState.currentEntry = exactHere;
        viewState.mode = 'entry';
        viewState.searchPanelOpen = false;
        viewState.statusText = '';
        notifyMeta();
        renderDictionaryView({ resetScroll: true });
        return true;
      }
    }

    if (options.fallbackAll !== false) {
      const exactAny = await lookupExactAcrossDictionaries(viewState.dictionaries, clean, {
        ...lookupOpts,
        activePath: preferredMod ? preferredMod.path : '',
        moduleHint: options.moduleHint || '',
        signal: controller.signal
      });
      if (controller.signal.aborted) return false;
      if (exactAny) {
        viewState.activeModulePath = exactAny.module.path;
        viewState.currentEntry = exactAny.entry;
        viewState.mode = 'entry';
        viewState.searchPanelOpen = false;
        viewState.statusText = '';
        notifyMeta();
        renderDictionaryView({ resetScroll: true });
        return true;
      }
    }

    await searchDictionaryTerm(clean, {
      scope: options.fallbackAll !== false ? 'all' : 'current'
    });
    return false;
  } catch (err) {
    if (controller.signal.aborted) return false;
    const msg = err && err.message ? err.message : 'Erro ao consultar dicionário.';
    appLogger.error('DICT_OPEN', `Falha ao abrir verbete "${clean}": ${msg}`, {
      module: preferredMod ? (preferredMod.fileName || preferredMod.abbr) : '',
      options: lookupOpts,
      error: err
    });
    viewState.mode = 'error';
    viewState.searchPanelOpen = true;
    viewState.statusText = msg;
    notifyMeta();
    renderDictionaryView();
    return false;
  }
}

export async function searchDictionaryTerm(rawQuery, options = {}) {
  const clean = normalizeLookupTerm(rawQuery);
  if (!clean) {
    viewState.query = '';
    viewState.filterTerm = '';
    callbacks.onToast('Digite ou selecione uma palavra para buscar.');
    return;
  }

  if (!viewState.dictionaries.length) {
    callbacks.onToast('Nenhum dicionário instalado.');
    viewState.mode = 'empty';
    renderDictionaryView();
    return;
  }

  cancelOngoingSearch();
  const controller = new AbortController();
  viewState.activeAbort = controller;

  const scope = options.scope || viewState.searchScope || 'current';
  const mergedOpts = normalizeDictSearchOptions({
    ...viewState.searchOptions,
    ...(options.searchBody !== undefined ? { searchBody: Boolean(options.searchBody) } : {})
  });

  viewState.query = clean;
  viewState.filterTerm = clean;
  viewState.searchScope = scope;
  viewState.searchOptions = mergedOpts;
  viewState.searchPanelOpen = true;
  saveSearchOptions(mergedOpts);

  const activeMod = getActiveModule();
  const targetCount = scope === 'all'
    ? (mergedOpts.favoritesOnly
      ? viewState.dictionaries.filter((m) => m.isFavorite).length
      : viewState.dictionaries.length)
    : 1;

  if (scope === 'all' && mergedOpts.favoritesOnly && targetCount === 0) {
    viewState.results = [];
    viewState.mode = 'results';
    viewState.statusText = 'Nenhum dicionário marcado como favorito. Desative "Só favoritos ★" ou favorite dicionários no seletor.';
    notifyMeta();
    renderDictionaryView({ resetScroll: true });
    return;
  }

  viewState.mode = 'loading';
  viewState.results = [];
  viewState.statusText = scope === 'all'
    ? `Buscando "${clean}" em ${targetCount} dicionário(s)...`
    : `Buscando "${clean}" em ${getModuleLabel(activeMod)}...`;
  renderDictionaryView();

  try {
    if (scope === 'all') {
      const hits = await searchAcrossDictionaries(viewState.dictionaries, clean, {
        ...mergedOpts,
        activePath: viewState.activeModulePath,
        perDictLimit: 3,
        maxTotal: 60,
        concurrency: 4,
        signal: controller.signal,
        onProgress: (done, total, foundCount) => {
          const statusEl = document.getElementById('dct-loading-status');
          if (statusEl) {
            statusEl.textContent =
              `Buscando "${clean}" (${done}/${total} dicionários · ${foundCount} encontrado(s))...`;
          }
        }
      });
      if (controller.signal.aborted) return;

      viewState.results = hits;
      viewState.mode = 'results';
      const scopeLabel = mergedOpts.favoritesOnly ? 'nos favoritos' : 'em todos os dicionários';
      viewState.statusText = hits.length
        ? `${hits.length} resultado(s) para "${clean}" ${scopeLabel}`
        : `Nenhum resultado para "${clean}" ${scopeLabel} com os filtros ativos.`;
    } else {
      const hits = await myswordDictionaryAdapter.searchEntries(activeMod.path, clean, {
        ...mergedOpts,
        limit: 50
      });
      if (controller.signal.aborted) return;

      viewState.results = hits.map((h) => ({
        module: activeMod,
        word: h.word,
        matchType: h.matchType,
        snippet: h.snippet,
        snippetHtml: h.snippetHtml || ''
      }));
      viewState.mode = 'results';
      viewState.statusText = hits.length
        ? `${hits.length} resultado(s) para "${clean}" em ${getModuleLabel(activeMod)}`
        : `Nenhum resultado para "${clean}" em ${getModuleLabel(activeMod)} com os filtros ativos.`;
    }

    notifyMeta();
    renderDictionaryView({ resetScroll: true });
  } catch (err) {
    if (controller.signal.aborted) return;
    const msg = err && err.message ? err.message : 'Falha ao buscar nos dicionários.';
    appLogger.error('DICT_SEARCH', `Erro na busca "${clean}" (${scope}): ${msg}`, {
      module: activeMod ? (activeMod.fileName || activeMod.abbr) : '',
      options: mergedOpts,
      error: err
    });
    viewState.mode = 'error';
    viewState.statusText = msg;
    notifyMeta();
    renderDictionaryView();
  }
}

export async function stepDictionaryEntry(direction) {
  const mod = getActiveModule();
  if (!mod) return;
  const curWord = viewState.currentEntry ? viewState.currentEntry.word : '';

  try {
    const nextEntry = await myswordDictionaryAdapter.getAdjacentEntry(mod.path, curWord, direction);
    if (!nextEntry) {
      callbacks.onToast(direction < 0 ? 'Já está no primeiro verbete.' : 'Já está no último verbete.');
      return;
    }
    viewState.currentEntry = nextEntry;
    viewState.mode = 'entry';
    viewState.searchPanelOpen = false;
    viewState.query = '';
    viewState.filterTerm = '';
    notifyMeta();
    renderDictionaryView({ resetScroll: true });
  } catch (err) {
    appLogger.error('DICT_ADJ', `Erro ao avançar verbete em ${getModuleLabel(mod)}`, err);
    callbacks.onToast('Não foi possível avançar o verbete.');
  }
}

export async function goBackDictionaryHistory() {
  if (!viewState.history.length) return false;
  const prev = viewState.history.pop();
  if (!prev) return false;

  viewState.filterTerm = prev.filterTerm || '';
  await openDictionaryEntry(prev.word, {
    modulePath: prev.modulePath,
    pushHistory: false,
    fallbackAll: false,
    keepFilterTerm: Boolean(prev.filterTerm),
    directWord: true
  });
  return true;
}

export function canGoBackDictionaryHistory() {
  return viewState.history.length > 0;
}

function rerenderHeaderOnly() {
  const headerZone = document.getElementById('dct-header-zone');
  if (!headerZone) {
    renderDictionaryView({ resetScroll: false });
    return;
  }
  headerZone.classList.toggle('is-collapsed', !shouldShowHeaderPanel());
  headerZone.innerHTML = `${buildToolbarHtml()}${buildOptionsSectionHtml()}`;
  bindHeaderEvents(headerZone);
}

function updateSearchOptionsAndRefresh(nextPartial, headerZone) {
  const input = headerZone ? headerZone.querySelector('#dct-search-input') : null;
  if (input) {
    viewState.query = input.value || '';
  }

  viewState.searchOptions = normalizeDictSearchOptions({
    ...viewState.searchOptions,
    ...nextPartial
  });
  saveSearchOptions(viewState.searchOptions);
  notifyMeta();

  if (viewState.mode === 'results' && normalizeLookupTerm(viewState.query)) {
    searchDictionaryTerm(viewState.query, { scope: viewState.searchScope });
  } else {
    rerenderHeaderOnly();
  }
}

function buildToolbarHtml() {
  const backDisabled = viewState.history.length ? '' : ' disabled';
  const activeTags = getActiveOptionLabels(viewState.searchOptions);
  const optsBtnCls = viewState.optionsOpen || activeTags.length ? ' is-active' : '';
  const badgeHtml = activeTags.length
    ? `<span class="dct-opts-badge">${activeTags.length}</span>`
    : '';

  return (
    '<form class="dct-toolbar" id="dct-search-form">' +
      `<button type="button" class="dct-action-btn" id="dct-btn-back"${backDisabled} aria-label="Voltar ao verbete anterior">&larr; Voltar</button>` +
      '<button type="button" class="dct-action-btn" id="dct-btn-terms" aria-label="Ver lista de todos os termos do dicionário">&#9776; Termos</button>' +
      `<input type="search" class="dct-search-input" id="dct-search-input" value="${escapeHtml(viewState.query)}" placeholder="Buscar verbete, Strong (H430, G976) ou palavra..." autocomplete="off" />` +
      '<button type="submit" class="dct-action-btn is-primary" id="dct-btn-search-one">Buscar</button>' +
      '<button type="button" class="dct-action-btn" id="dct-btn-search-all">Em todos</button>' +
      `<button type="button" class="dct-action-btn${optsBtnCls}" id="dct-btn-opts" aria-expanded="${viewState.optionsOpen ? 'true' : 'false'}">&#9881; Opções${badgeHtml}</button>` +
    '</form>'
  );
}

function buildOptionsSectionHtml() {
  const opts = viewState.searchOptions;
  const activeTags = getActiveOptionLabels(opts);

  if (!viewState.optionsOpen) {
    if (!activeTags.length) return '';
    return (
      '<div class="dct-active-filters" id="dct-active-filters">' +
        activeTags.map((label) => `<button type="button" class="dct-filter-pill" data-open-opts="1">${escapeHtml(label)}</button>`).join('') +
      '</div>'
    );
  }

  const modes = [
    { id: 'contains', label: 'Parte da palavra' },
    { id: 'startsWith', label: 'Começa com' },
    { id: 'exact', label: 'Palavra exata' }
  ];

  const toggles = [
    { key: 'accentSensitive', label: 'Diferenciar acentos' },
    { key: 'caseSensitive', label: 'Maiúsculas (Aa)' },
    { key: 'searchBody', label: 'No texto' },
    { key: 'searchAltWords', label: 'Sinônimos' },
    { key: 'exactPhrase', label: 'Frase exata' },
    { key: 'favoritesOnly', label: 'Só favoritos ★' }
  ];

  const resetHtml = activeTags.length
    ? '<button type="button" class="dct-opts-reset" id="dct-btn-reset-opts">Restaurar padrão</button>'
    : '';

  return (
    '<section class="dct-opts-panel" id="dct-opts-panel" aria-label="Opções de busca no dicionário">' +
      '<div class="dct-opts-section">' +
        '<div class="dct-opts-label-row">' +
          '<span class="dct-opts-label">Correspondência</span>' +
          resetHtml +
        '</div>' +
        '<div class="dct-seg-group">' +
          modes.map((m) => (
            `<button type="button" class="dct-seg-btn${opts.matchMode === m.id ? ' is-active' : ''}" data-opt-mode="${m.id}">` +
              escapeHtml(m.label) +
            '</button>'
          )).join('') +
        '</div>' +
      '</div>' +
      '<div class="dct-opts-section">' +
        '<span class="dct-opts-label">Refinamentos</span>' +
        '<div class="dct-opts-chips">' +
          toggles.map((t) => {
            const on = Boolean(opts[t.key]);
            return (
              `<button type="button" class="dct-opt-chip${on ? ' is-active' : ''}" data-opt-toggle="${t.key}" aria-pressed="${on ? 'true' : 'false'}">` +
                `${on ? '&#10003; ' : ''}${escapeHtml(t.label)}` +
              '</button>'
            );
          }).join('') +
        '</div>' +
      '</div>' +
    '</section>'
  );
}

function buildErrorHtml() {
  const restoreBtn = viewState.currentEntry && viewState.currentEntry.word
    ? `<button type="button" class="dct-action-btn is-primary" id="dct-btn-restore-entry">Voltar para "${escapeHtml(viewState.currentEntry.word)}"</button>`
    : '';

  return (
    '<div class="empty-state">' +
      '<h2>Erro na consulta</h2>' +
      `<p>${escapeHtml(viewState.statusText || 'Ocorreu uma falha ao consultar o dicionário.')}</p>` +
      '<div class="empty-state-actions">' +
        restoreBtn +
        '<button type="button" class="dct-action-btn" id="dct-btn-open-logs">Abrir Logs</button>' +
      '</div>' +
    '</div>'
  );
}

function buildResultsHtml() {
  const restoreBtn = viewState.currentEntry && viewState.currentEntry.word
    ? `<button type="button" class="dct-action-btn" id="dct-btn-restore-entry">Voltar para "${escapeHtml(viewState.currentEntry.word)}"</button>`
    : '';

  if (!viewState.results.length) {
    const actions = [];
    if (viewState.searchScope !== 'all') {
      actions.push('<button type="button" class="dct-action-btn is-primary" id="dct-btn-retry-all">Procurar em todos os dicionários</button>');
    }
    if (!viewState.searchOptions.searchBody) {
      actions.push('<button type="button" class="dct-action-btn" id="dct-btn-retry-body">Buscar também no texto</button>');
    }
    if (restoreBtn) {
      actions.push(restoreBtn);
    }
    const actionsHtml = actions.length
      ? `<div class="empty-state-actions">${actions.join('')}</div>`
      : '';

    return (
      '<div class="empty-state">' +
        '<h2>Sem resultados</h2>' +
        `<p>${escapeHtml(viewState.statusText || 'Nenhum verbete encontrado.')}</p>` +
        actionsHtml +
      '</div>'
    );
  }

  const badgeLabels = {
    exact: 'Exato',
    prefix: 'Início',
    title: 'Título',
    body: 'No texto'
  };

  const itemsHtml = viewState.results.map((item, idx) => {
    const modLabel = getModuleLabel(item.module);
    const kindLabel = badgeLabels[item.matchType] || 'Verbete';
    const snipHtml = item.snippetHtml || (item.snippet ? escapeHtml(item.snippet) : '');
    return (
      `<button type="button" class="dct-result-item" data-dct-res-idx="${idx}">` +
        '<div class="dct-result-head">' +
          `<span class="dct-result-word">${escapeHtml(item.word)}</span>` +
          `<span class="dct-result-badge">${escapeHtml(modLabel)} · ${escapeHtml(kindLabel)}</span>` +
        '</div>' +
        (snipHtml ? `<div class="dct-result-snippet">${snipHtml}</div>` : '') +
      '</button>'
    );
  }).join('');

  const topBar =
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:0 2px;">' +
      `<div class="chapter-subtitle" style="margin:0;">${escapeHtml(viewState.statusText)}</div>` +
      (viewState.currentEntry && viewState.currentEntry.word
        ? `<button type="button" class="dct-action-btn" id="dct-btn-restore-entry" style="height:30px;padding:0 10px;font-size:12px;">Voltar para "${escapeHtml(viewState.currentEntry.word)}"</button>`
        : '') +
    '</div>';

  return `${topBar}<div class="dct-results-list">${itemsHtml}</div>`;
}

function buildEntryHtml() {
  const mod = getActiveModule();
  const entry = viewState.currentEntry;
  if (!mod || !entry) {
    return (
      '<div class="empty-state">' +
        '<h2>Leitor de Dicionários</h2>' +
        `<p>${escapeHtml(viewState.statusText || 'Selecione um dicionário ou toque na lupa abaixo para buscar.')}</p>` +
      '</div>'
    );
  }

  const dirAttr = entry.isRtl ? ' dir="rtl"' : '';
  const compareBtn = viewState.dictionaries.length > 1
    ? '<button type="button" class="dct-action-btn" id="dct-btn-compare-all" style="height:30px;padding:0 10px;font-size:12px;">Ver em outros</button>'
    : '';

  return (
    '<section class="dct-entry-card">' +
      '<div class="dct-entry-head">' +
        '<div>' +
          `<h1 class="dct-entry-title">${escapeHtml(entry.word)}</h1>` +
          `<div class="dct-entry-source">${escapeHtml(getModuleLabel(mod))}</div>` +
        '</div>' +
        compareBtn +
      '</div>' +
      `<div class="dct-entry-body" id="dct-entry-body"${dirAttr}>${entry.html}</div>` +
    '</section>'
  );
}

function bindHeaderEvents(headerZone) {
  const form = headerZone.querySelector('#dct-search-form');
  const input = headerZone.querySelector('#dct-search-input');

  if (input) {
    input.addEventListener('input', () => {
      const val = (input.value || '').trim();
      viewState.query = input.value || '';
      if (!val) {
        viewState.filterTerm = '';
        notifyMeta();
      }
    });
  }

  if (form) {
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const term = input ? input.value : '';
      searchDictionaryTerm(term, { scope: 'current' });
    });
  }

  headerZone.querySelector('#dct-btn-back')?.addEventListener('click', () => {
    goBackDictionaryHistory();
  });

  headerZone.querySelector('#dct-btn-terms')?.addEventListener('click', () => {
    openActiveDictionaryTerms();
  });

  headerZone.querySelector('#dct-btn-search-all')?.addEventListener('click', () => {
    const term = input ? input.value : viewState.query;
    searchDictionaryTerm(term, { scope: 'all' });
  });

  headerZone.querySelector('#dct-btn-opts')?.addEventListener('click', () => {
    if (input) viewState.query = input.value || '';
    viewState.optionsOpen = !viewState.optionsOpen;
    rerenderHeaderOnly();
  });

  headerZone.querySelectorAll('[data-open-opts]').forEach((pill) => {
    pill.addEventListener('click', () => {
      if (input) viewState.query = input.value || '';
      viewState.optionsOpen = true;
      rerenderHeaderOnly();
    });
  });

  headerZone.querySelectorAll('[data-opt-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-opt-mode') || 'contains';
      if (mode === viewState.searchOptions.matchMode) return;
      updateSearchOptionsAndRefresh({ matchMode: mode }, headerZone);
    });
  });

  headerZone.querySelectorAll('[data-opt-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-opt-toggle') || '';
      if (!key || !Object.prototype.hasOwnProperty.call(viewState.searchOptions, key)) return;
      updateSearchOptionsAndRefresh({ [key]: !viewState.searchOptions[key] }, headerZone);
    });
  });

  headerZone.querySelector('#dct-btn-reset-opts')?.addEventListener('click', () => {
    updateSearchOptionsAndRefresh({ ...DEFAULT_DICT_SEARCH_OPTIONS }, headerZone);
  });
}

function bindBodyEvents(bodyZone) {
  bodyZone.querySelector('#dct-btn-retry-all')?.addEventListener('click', () => {
    searchDictionaryTerm(viewState.query, { scope: 'all' });
  });

  bodyZone.querySelector('#dct-btn-retry-body')?.addEventListener('click', () => {
    searchDictionaryTerm(viewState.query, {
      scope: viewState.searchScope,
      searchBody: true
    });
  });

  bodyZone.querySelector('#dct-btn-restore-entry')?.addEventListener('click', () => {
    if (viewState.currentEntry) {
      viewState.mode = 'entry';
      viewState.searchPanelOpen = false;
      viewState.statusText = '';
      notifyMeta();
      renderDictionaryView({ resetScroll: false });
    }
  });

  bodyZone.querySelector('#dct-btn-open-logs')?.addEventListener('click', () => {
    callbacks.onOpenLogs();
  });

  bodyZone.querySelector('#dct-btn-compare-all')?.addEventListener('click', () => {
    if (viewState.currentEntry && viewState.currentEntry.word) {
      searchDictionaryTerm(viewState.currentEntry.word, { scope: 'all' });
    }
  });

  bodyZone.querySelector('#dct-btn-open-sources')?.addEventListener('click', () => {
    callbacks.onOpenSources();
  });

  bodyZone.addEventListener('click', (ev) => {
    const imgEl = ev.target.closest('img.dct-img');
    if (imgEl && !imgEl.classList.contains('is-loading') && (imgEl.currentSrc || imgEl.src)) {
      ev.stopPropagation();
      openImageLightbox(imgEl.currentSrc || imgEl.src, imgEl.alt || (viewState.currentEntry && viewState.currentEntry.word) || '');
      return;
    }

    const resBtn = ev.target.closest('[data-dct-res-idx]');
    if (resBtn) {
      const idx = Number(resBtn.getAttribute('data-dct-res-idx'));
      const hit = viewState.results[idx];
      if (hit && hit.module) {
        openDictionaryEntry(hit.word, {
          modulePath: hit.module.path,
          pushHistory: true,
          fallbackAll: false,
          keepFilterTerm: Boolean(viewState.filterTerm),
          directWord: true
        });
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
        openDictionaryEntry(term, {
          moduleHint: modHint,
          pushHistory: true,
          fallbackAll: true
        });
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

    const fnBtn = ev.target.closest('.v-fn-btn');
    if (fnBtn && viewState.currentEntry && Array.isArray(viewState.currentEntry.footnotes)) {
      const idx = Number(fnBtn.getAttribute('data-fn-idx'));
      const noteText = viewState.currentEntry.footnotes[idx];
      if (noteText) {
        callbacks.onOpenFootnote(viewState.currentEntry.word, noteText);
      }
    }
  });
}

export function renderDictionaryView(options = {}) {
  const container = document.getElementById('reader-content');
  const scrollBox = document.getElementById('reader-scroll');
  if (!container) return;

  ensureCompanionStyles();
  const imgSeq = ++imageRenderSeq;
  container.classList.remove('has-interlinear');

  if (!viewState.dictionaries.length) {
    container.innerHTML =
      '<div class="empty-state">' +
        '<h2>Nenhum dicionário carregado</h2>' +
        '<p>Adicione uma pasta ou arquivo de dicionário MySword (.dct.mybible) em Configurações para pesquisar palavras, códigos Strong e termos teológicos.</p>' +
        '<div class="empty-state-actions">' +
          '<button type="button" class="dct-action-btn is-primary" id="dct-btn-open-sources">Abrir Configurações e Fontes</button>' +
        '</div>' +
      '</div>';
    container.querySelector('#dct-btn-open-sources')?.addEventListener('click', () => {
      callbacks.onOpenSources();
    });
    notifyMeta();
    return;
  }

  let bodyHtml = '';
  if (viewState.mode === 'loading') {
    bodyHtml =
      '<div class="empty-state">' +
        `<p id="dct-loading-status">${escapeHtml(viewState.statusText || 'Carregando...')}</p>` +
      '</div>';
  } else if (viewState.mode === 'error') {
    bodyHtml = buildErrorHtml();
  } else if (viewState.mode === 'results') {
    bodyHtml = buildResultsHtml();
  } else {
    bodyHtml = buildEntryHtml();
  }

  const headerCollapsedCls = shouldShowHeaderPanel() ? '' : ' is-collapsed';

  container.innerHTML =
    '<div class="dct-reader">' +
      `<div id="dct-header-zone" class="dct-header-zone${headerCollapsedCls}" style="display:flex;flex-direction:column;gap:10px;">${buildToolbarHtml()}${buildOptionsSectionHtml()}</div>` +
      `<div id="dct-body-zone" style="display:flex;flex-direction:column;gap:12px;">${bodyHtml}</div>` +
    '</div>';

  const headerZone = container.querySelector('#dct-header-zone');
  const bodyZone = container.querySelector('#dct-body-zone');

  if (headerZone) {
    bindHeaderEvents(headerZone);
  }
  if (bodyZone) {
    bindBodyEvents(bodyZone);

    if (viewState.mode === 'entry' && viewState.currentEntry && viewState.currentEntry.hasImages) {
      const mod = getActiveModule();
      if (mod) {
        hydrateDictionaryImages(bodyZone, mod.path, viewState.currentEntry.raw || '', imgSeq);
      }
    }
  }

  if (options.resetScroll && scrollBox) {
    scrollBox.scrollTop = 0;
  }
}

export function initSelectionLookupBar({ onLookup, onLookupAll }) {
  if (typeof document === 'undefined') return;
  let fab = document.getElementById('lookup-fab');
  if (!fab) {
    fab = document.createElement('div');
    fab.id = 'lookup-fab';
    fab.className = 'lookup-fab hidden';
    fab.innerHTML =
      '<span class="lookup-fab-term" id="lookup-fab-term"></span>' +
      '<button type="button" class="lookup-fab-btn hidden" id="lookup-fab-bible">Bíblia</button>' +
      '<button type="button" class="lookup-fab-btn" id="lookup-fab-one">Dicionário</button>' +
      '<button type="button" class="lookup-fab-btn" id="lookup-fab-all">Todos</button>';
    document.body.appendChild(fab);
  }

  let selectedTerm = '';
  let selectedBibleRef = null;
  let hideTimer = null;

  const bibleBtn = fab.querySelector('#lookup-fab-bible');

  const hideFab = () => {
    selectedTerm = '';
    selectedBibleRef = null;
    if (bibleBtn) bibleBtn.classList.add('hidden');
    fab.classList.add('hidden');
  };

  const updateFromSelection = () => {
    const sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      hideFab();
      return;
    }

    const reader = document.getElementById('reader-content');
    const anchor = sel.anchorNode;
    if (!reader || !anchor || !reader.contains(anchor)) {
      hideFab();
      return;
    }

    const clean = normalizeLookupTerm(sel.toString());
    if (!clean || clean.length < 2 || clean.length > 48) {
      hideFab();
      return;
    }

    selectedTerm = clean;
    selectedBibleRef = parseBibleReference(clean, { allowChapterOnly: false, allowNumeric: false });
    if (bibleBtn) {
      bibleBtn.classList.toggle('hidden', !selectedBibleRef);
    }

    const termEl = fab.querySelector('#lookup-fab-term');
    if (termEl) termEl.textContent = clean;
    fab.classList.remove('hidden');
  };

  document.addEventListener('selectionchange', () => {
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(updateFromSelection, 160);
  });

  bibleBtn?.addEventListener('click', () => {
    const target = selectedBibleRef;
    if (!target) return;
    window.getSelection?.()?.removeAllRanges?.();
    hideFab();
    callbacks.onNavigateBible(target);
  });

  fab.querySelector('#lookup-fab-one')?.addEventListener('click', () => {
    const term = selectedTerm;
    if (!term) return;
    window.getSelection?.()?.removeAllRanges?.();
    hideFab();
    if (typeof onLookup === 'function') onLookup(term);
  });

  fab.querySelector('#lookup-fab-all')?.addEventListener('click', () => {
    const term = selectedTerm;
    if (!term) return;
    window.getSelection?.()?.removeAllRanges?.();
    hideFab();
    if (typeof onLookupAll === 'function') onLookupAll(term);
  });
}
