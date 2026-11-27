import {
  myswordDictionaryAdapter,
  normalizeLookupTerm
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

const viewState = {
  dictionaries: [],
  activeModulePath: '',
  currentEntry: null,
  query: '',
  filterTerm: '',
  searchBody: false,
  searchScope: 'current', // 'current' | 'all'
  mode: 'entry',          // 'entry' | 'results' | 'loading' | 'empty'
  statusText: '',
  results: [],
  history: [],            // [{ modulePath, word, filterTerm }]
  activeAbort: null
};

let imageRenderSeq = 0;
let isSteppingDict = false;

let callbacks = {
  onOpenSources: () => {},
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
  return mod.abbr || mod.title || mod.fileName || 'Dicionário';
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

      const resolvedUrl = res && res.url ? res.url : '';
      if (!resolvedUrl) {
        img.classList.remove('is-loading');
        showImageErrorHint(picEl, rawSrc, res && res.error ? res.error : 'não encontrada');
        continue;
      }

      img.onload = () => {
        img.classList.remove('is-loading');
      };
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
      img.classList.remove('is-loading');
      showImageErrorHint(picEl, rawSrc, err && err.message ? err.message : 'erro inesperado');
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
    searchBody: viewState.searchBody,
    historyLength: viewState.history.length
  };
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
        fallbackAll: false
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

  // Quando há um termo pesquisado ativo, navega apenas entre os dicionários que contêm o termo
  if (activeFilter) {
    isSteppingDict = true;
    try {
      let matches = getCachedDictionariesWithTerm(list, activeFilter, {
        searchBody: viewState.searchBody
      });
      if (!matches) {
        callbacks.onToast(`Verificando dicionários com "${activeFilter}"...`);
        matches = await findDictionariesWithTerm(list, activeFilter, {
          searchBody: viewState.searchBody,
          activePath: viewState.activeModulePath,
          concurrency: 4
        });
      }

      if (!matches.length) {
        callbacks.onToast(`Nenhum dicionário contém "${activeFilter}".`);
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
          keepFilterTerm: true
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
        keepFilterTerm: true
      });
    } finally {
      isSteppingDict = false;
    }
    return;
  }

  const idx = Math.max(0, list.findIndex((m) => m.path === viewState.activeModulePath));
  const nextIdx = (idx + delta + list.length) % list.length;
  await setActiveDictionaryModule(list[nextIdx].path, { keepTerm: true, render: true });
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
    viewState.currentEntry = null;
    viewState.mode = 'empty';
    viewState.statusText = err && err.message ? err.message : 'Erro ao ler dicionário.';
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

  try {
    if (options.moduleHint) {
      const exactHinted = await lookupExactAcrossDictionaries(viewState.dictionaries, clean, {
        activePath: preferredMod ? preferredMod.path : '',
        moduleHint: options.moduleHint,
        signal: controller.signal
      });
      if (controller.signal.aborted) return false;
      if (exactHinted) {
        viewState.activeModulePath = exactHinted.module.path;
        viewState.currentEntry = exactHinted.entry;
        viewState.mode = 'entry';
        viewState.statusText = '';
        notifyMeta();
        renderDictionaryView({ resetScroll: true });
        return true;
      }
    }

    if (preferredMod) {
      const exactHere = await myswordDictionaryAdapter.getEntry(preferredMod.path, clean);
      if (controller.signal.aborted) return false;
      if (exactHere) {
        viewState.activeModulePath = preferredMod.path;
        viewState.currentEntry = exactHere;
        viewState.mode = 'entry';
        viewState.statusText = '';
        notifyMeta();
        renderDictionaryView({ resetScroll: true });
        return true;
      }
    }

    if (options.fallbackAll !== false) {
      const exactAny = await lookupExactAcrossDictionaries(viewState.dictionaries, clean, {
        activePath: preferredMod ? preferredMod.path : '',
        moduleHint: options.moduleHint || '',
        signal: controller.signal
      });
      if (controller.signal.aborted) return false;
      if (exactAny) {
        viewState.activeModulePath = exactAny.module.path;
        viewState.currentEntry = exactAny.entry;
        viewState.mode = 'entry';
        viewState.statusText = '';
        notifyMeta();
        renderDictionaryView({ resetScroll: true });
        return true;
      }
    }

    await searchDictionaryTerm(clean, {
      scope: options.fallbackAll !== false ? 'all' : 'current',
      searchBody: Boolean(options.searchBody)
    });
    return false;
  } catch (err) {
    if (controller.signal.aborted) return false;
    viewState.mode = 'empty';
    viewState.statusText = err && err.message ? err.message : 'Erro ao consultar dicionário.';
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
  const searchBody = options.searchBody !== undefined ? Boolean(options.searchBody) : viewState.searchBody;

  viewState.query = clean;
  viewState.filterTerm = clean;
  viewState.searchScope = scope;
  viewState.searchBody = searchBody;
  viewState.mode = 'loading';
  viewState.results = [];
  viewState.statusText = scope === 'all'
    ? `Buscando "${clean}" em ${viewState.dictionaries.length} dicionário(s)...`
    : `Buscando "${clean}"...`;
  renderDictionaryView();

  try {
    if (scope === 'all') {
      const hits = await searchAcrossDictionaries(viewState.dictionaries, clean, {
        activePath: viewState.activeModulePath,
        searchBody,
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
      viewState.statusText = hits.length
        ? `${hits.length} resultado(s) para "${clean}" em todos os dicionários`
        : `Nenhum resultado para "${clean}" nos dicionários instalados.`;
    } else {
      const mod = getActiveModule();
      const hits = await myswordDictionaryAdapter.searchEntries(mod.path, clean, {
        limit: 50,
        searchBody
      });
      if (controller.signal.aborted) return;

      viewState.results = hits.map((h) => ({
        module: mod,
        word: h.word,
        matchType: h.matchType,
        snippet: h.snippet
      }));
      viewState.mode = 'results';
      viewState.statusText = hits.length
        ? `${hits.length} resultado(s) para "${clean}" em ${getModuleLabel(mod)}`
        : `Nenhum resultado para "${clean}" em ${getModuleLabel(mod)}.`;
    }

    notifyMeta();
    renderDictionaryView({ resetScroll: true });
  } catch (err) {
    if (controller.signal.aborted) return;
    viewState.mode = 'empty';
    viewState.statusText = err && err.message ? err.message : 'Falha ao buscar nos dicionários.';
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
    viewState.query = '';
    viewState.filterTerm = '';
    notifyMeta();
    renderDictionaryView({ resetScroll: true });
  } catch (err) {
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
    keepFilterTerm: Boolean(prev.filterTerm)
  });
  return true;
}

export function canGoBackDictionaryHistory() {
  return viewState.history.length > 0;
}

function buildToolbarHtml() {
  const backDisabled = viewState.history.length ? '' : ' disabled';
  const bodyChecked = viewState.searchBody ? ' checked' : '';
  return (
    '<form class="dct-toolbar" id="dct-search-form">' +
      `<button type="button" class="dct-action-btn" id="dct-btn-back"${backDisabled} aria-label="Voltar ao verbete anterior">&larr; Voltar</button>` +
      '<button type="button" class="dct-action-btn" id="dct-btn-terms" aria-label="Ver lista de todos os termos do dicionário">&#9776; Termos</button>' +
      `<input type="search" class="dct-search-input" id="dct-search-input" value="${escapeHtml(viewState.query)}" placeholder="Buscar verbete, Strong (H430, G976) ou palavra..." autocomplete="off" />` +
      '<button type="submit" class="dct-action-btn is-primary" id="dct-btn-search-one">Buscar</button>' +
      '<button type="button" class="dct-action-btn" id="dct-btn-search-all">Em todos</button>' +
      `<label class="dct-action-btn" style="display:inline-flex;align-items:center;gap:6px;"><input type="checkbox" id="dct-chk-body"${bodyChecked} /> No texto</label>` +
    '</form>'
  );
}

function buildResultsHtml() {
  if (!viewState.results.length) {
    const retryAllBtn = viewState.searchScope !== 'all'
      ? '<div class="empty-state-actions"><button type="button" class="dct-action-btn is-primary" id="dct-btn-retry-all">Procurar em todos os dicionários</button></div>'
      : '';
    return (
      '<div class="empty-state">' +
        '<h2>Sem resultados</h2>' +
        `<p>${escapeHtml(viewState.statusText || 'Nenhum verbete encontrado.')}</p>` +
        retryAllBtn +
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
    return (
      `<button type="button" class="dct-result-item" data-dct-res-idx="${idx}">` +
        '<div class="dct-result-head">' +
          `<span class="dct-result-word">${escapeHtml(item.word)}</span>` +
          `<span class="dct-result-badge">${escapeHtml(modLabel)} · ${escapeHtml(kindLabel)}</span>` +
        '</div>' +
        (item.snippet ? `<div class="dct-result-snippet">${escapeHtml(item.snippet)}</div>` : '') +
      '</button>'
    );
  }).join('');

  return (
    `<div class="chapter-subtitle" style="margin:0 2px;">${escapeHtml(viewState.statusText)}</div>` +
    `<div class="dct-results-list">${itemsHtml}</div>`
  );
}

function buildEntryHtml() {
  const mod = getActiveModule();
  const entry = viewState.currentEntry;
  if (!mod || !entry) {
    return (
      '<div class="empty-state">' +
        '<h2>Leitor de Dicionários</h2>' +
        `<p>${escapeHtml(viewState.statusText || 'Selecione um dicionário ou busque uma palavra acima.')}</p>` +
      '</div>'
    );
  }

  const dirAttr = entry.isRtl ? ' dir="rtl"' : '';
  const compareBtn = viewState.dictionaries.length > 1
    ? '<button type="button" class="dct-action-btn" id="dct-btn-compare-all" style="height:32px;padding:0 10px;font-size:12px;">Ver em outros dicionários</button>'
    : '';

  return (
    '<section class="dct-entry-card">' +
      '<div class="dct-entry-head">' +
        '<div>' +
          `<h1 class="dct-entry-title">${escapeHtml(entry.word)}</h1>` +
          `<div class="dct-entry-source">${escapeHtml(mod.title || getModuleLabel(mod))}</div>` +
        '</div>' +
        compareBtn +
      '</div>' +
      `<div class="dct-entry-body" id="dct-entry-body"${dirAttr}>${entry.html}</div>` +
    '</section>'
  );
}

function bindRenderedEvents(rootEl) {
  const form = rootEl.querySelector('#dct-search-form');
  const input = rootEl.querySelector('#dct-search-input');
  const bodyChk = rootEl.querySelector('#dct-chk-body');

  if (input) {
    input.addEventListener('input', () => {
      const val = (input.value || '').trim();
      if (!val) {
        viewState.query = '';
        viewState.filterTerm = '';
        notifyMeta();
      }
    });
  }

  if (bodyChk) {
    bodyChk.addEventListener('change', () => {
      viewState.searchBody = Boolean(bodyChk.checked);
    });
  }

  if (form) {
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const term = input ? input.value : '';
      searchDictionaryTerm(term, {
        scope: 'current',
        searchBody: Boolean(bodyChk && bodyChk.checked)
      });
    });
  }

  rootEl.querySelector('#dct-btn-terms')?.addEventListener('click', () => {
    openActiveDictionaryTerms();
  });

  rootEl.querySelector('#dct-btn-search-all')?.addEventListener('click', () => {
    const term = input ? input.value : viewState.query;
    searchDictionaryTerm(term, {
      scope: 'all',
      searchBody: Boolean(bodyChk && bodyChk.checked)
    });
  });

  rootEl.querySelector('#dct-btn-retry-all')?.addEventListener('click', () => {
    searchDictionaryTerm(viewState.query, {
      scope: 'all',
      searchBody: true
    });
  });

  rootEl.querySelector('#dct-btn-back')?.addEventListener('click', () => {
    goBackDictionaryHistory();
  });

  rootEl.querySelector('#dct-btn-compare-all')?.addEventListener('click', () => {
    if (viewState.currentEntry && viewState.currentEntry.word) {
      searchDictionaryTerm(viewState.currentEntry.word, {
        scope: 'all',
        searchBody: false
      });
    }
  });

  rootEl.querySelector('#dct-btn-open-sources')?.addEventListener('click', () => {
    callbacks.onOpenSources();
  });

  rootEl.addEventListener('click', (ev) => {
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
          keepFilterTerm: Boolean(viewState.filterTerm)
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
  } else if (viewState.mode === 'results') {
    bodyHtml = buildResultsHtml();
  } else {
    bodyHtml = buildEntryHtml();
  }

  container.innerHTML = `<div class="dct-reader">${buildToolbarHtml()}${bodyHtml}</div>`;
  const rootEl = container.querySelector('.dct-reader');
  if (rootEl) {
    bindRenderedEvents(rootEl);

    if (viewState.mode === 'entry' && viewState.currentEntry && viewState.currentEntry.hasImages) {
      const mod = getActiveModule();
      if (mod) {
        hydrateDictionaryImages(rootEl, mod.path, viewState.currentEntry.raw || '', imgSeq);
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
