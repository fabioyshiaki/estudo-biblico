import {
  myswordDictionaryAdapter,
  normalizeLookupTerm
} from '../formats/mysword-dictionary.js';
import {
  lookupExactAcrossDictionaries,
  searchAcrossDictionaries,
  parseBibleReference
} from '../formats/dictionary-lookup.js';

const viewState = {
  dictionaries: [],
  activeModulePath: '',
  currentEntry: null,
  query: '',
  searchBody: false,
  searchScope: 'current', // 'current' | 'all'
  mode: 'entry',          // 'entry' | 'results' | 'loading' | 'empty'
  statusText: '',
  results: [],
  history: [],            // [{ modulePath, word }]
  activeAbort: null
};

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
    word: viewState.currentEntry.word
  });
  if (viewState.history.length > 40) {
    viewState.history.shift();
  }
}

export function initDictionaryView(userCallbacks = {}) {
  callbacks = { ...callbacks, ...userCallbacks };
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
    historyLength: viewState.history.length
  };
}

export async function setActiveDictionaryModule(modulePath, options = {}) {
  const target = viewState.dictionaries.find((m) => m.path === modulePath);
  if (!target) return false;

  const previousWord = viewState.currentEntry ? viewState.currentEntry.word : '';
  viewState.activeModulePath = target.path;

  if (options.keepTerm && previousWord) {
    await openDictionaryEntry(previousWord, {
      modulePath: target.path,
      pushHistory: false,
      fallbackAll: false,
      render: options.render !== false
    });
    return true;
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
  if (list.length < 2) return;
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

  viewState.query = clean;
  viewState.mode = 'loading';
  viewState.statusText = `Procurando "${clean}"...`;
  renderDictionaryView();

  const preferredMod = options.modulePath
    ? viewState.dictionaries.find((m) => m.path === options.modulePath)
    : getActiveModule();

  try {
    // 1. Se veio dica explícita de módulo (ex.: d-LouwNida 33.38), tenta primeiro nos módulos que combinam
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

    // 2. Tenta correspondência exata no dicionário preferido/ativo
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

    // 3. Fallback: procura correspondência exata nos demais dicionários
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

    // 4. Não encontrou exato: mostra resultados aproximados (no ativo ou em todos)
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
    viewState.query = nextEntry.word;
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

  await openDictionaryEntry(prev.word, {
    modulePath: prev.modulePath,
    pushHistory: false,
    fallbackAll: false
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
        `<h2>Sem resultados</h2>` +
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
    // 1. Clique em item da lista de resultados
    const resBtn = ev.target.closest('[data-dct-res-idx]');
    if (resBtn) {
      const idx = Number(resBtn.getAttribute('data-dct-res-idx'));
      const hit = viewState.results[idx];
      if (hit && hit.module) {
        openDictionaryEntry(hit.word, {
          modulePath: hit.module.path,
          pushHistory: true,
          fallbackAll: false
        });
      }
      return;
    }

    // 2. Link interno de dicionário → busca recursiva no dicionário
    const dctLink = ev.target.closest('[data-dct-lookup]');
    if (dctLink) {
      const term = dctLink.getAttribute('data-dct-lookup') || '';
      const modHint = dctLink.getAttribute('data-dct-module') || '';
      if (term) {
        openDictionaryEntry(term, {
          moduleHint: modHint,
          pushHistory: true,
          fallbackAll: true
        });
      }
      return;
    }

    // 3. Link de referência bíblica dentro da definição → salta para a Bíblia
    const bibleLink = ev.target.closest('[data-bible-ref]');
    if (bibleLink) {
      const rawRef = bibleLink.getAttribute('data-bible-ref') || bibleLink.textContent || '';
      const parsed = parseBibleReference(rawRef);
      if (parsed) {
        callbacks.onNavigateBible(parsed);
      } else {
        callbacks.onToast(`Referência não reconhecida: ${rawRef}`);
      }
      return;
    }

    // 4. Nota de rodapé dentro da definição
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
      '<button type="button" class="lookup-fab-btn" id="lookup-fab-one">Dicionário</button>' +
      '<button type="button" class="lookup-fab-btn" id="lookup-fab-all">Todos</button>';
    document.body.appendChild(fab);
  }

  let selectedTerm = '';
  let hideTimer = null;

  const hideFab = () => {
    selectedTerm = '';
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
    const termEl = fab.querySelector('#lookup-fab-term');
    if (termEl) termEl.textContent = clean;
    fab.classList.remove('hidden');
  };

  document.addEventListener('selectionchange', () => {
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(updateFromSelection, 160);
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
