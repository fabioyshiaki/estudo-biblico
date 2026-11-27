import { store } from '../core/store.js';
import { eventBus, EVENTS } from '../core/events.js';
import { getAdapterForModule } from '../formats/format-registry.js';
import {
  normalizeLookupTerm,
  normalizeDictSearchOptions
} from '../formats/mysword-dictionary.js';
import {
  lookupDictionaryEntry,
  searchDictionaryTerms
} from '../formats/dictionary-lookup.js';
import {
  lookupFsInModule,
  normalizeFsCode
} from '../formats/fs-internal-lookup.js';
import { openModalShell, closeModal } from './nav-modal.js';
import { appLogger } from '../core/logger.js';

let callbacks = {
  onOpenSources: () => {},
  onOpenLogs: () => {},
  onOpenFootnote: () => {},
  onToast: () => {},
  onStateMetaChange: () => {},
  onNavigateBible: () => {}
};

let modulesList = [];
let activeModulePath = '';
let currentEntry = null;
let currentQuery = '';
let currentFilterTerm = '';
let currentSearchOptions = normalizeDictSearchOptions();
let entryHistory = [];
let renderSeq = 0;

let selectionBarEl = null;
let selectionHandlers = {
  onLookup: null,
  onLookupAll: null
};
let currentSelectedText = '';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getActiveModule() {
  if (!modulesList.length) return null;
  if (activeModulePath) {
    const found = modulesList.find((m) => m.path === activeModulePath);
    if (found) return found;
  }
  const stored = store.getActiveDictionary();
  if (stored) {
    const foundStored = modulesList.find((m) => m.path === stored.path);
    if (foundStored) return foundStored;
  }
  return modulesList[0];
}

function emitMetaChange() {
  const active = getActiveModule();
  callbacks.onStateMetaChange({
    activeModule: active || null,
    activeModulePath: active ? active.path : '',
    entryWord: currentEntry ? currentEntry.word : '',
    query: currentQuery,
    filterTerm: currentFilterTerm,
    searchOptions: { ...currentSearchOptions },
    currentEntry
  });
}

function renderEmpty({ title, message, showSourcesButton = true }) {
  const container = document.getElementById('reader-content');
  if (!container) return;
  container.classList.remove('has-interlinear');
  container.innerHTML = `
    <div class="empty-state">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      ${showSourcesButton ? '<div class="empty-state-actions"><button type="button" class="primary-btn" id="dict-empty-sources">Abrir Configurações e Fontes</button></div>' : ''}
    </div>
  `;
  container.querySelector('#dict-empty-sources')?.addEventListener('click', () => {
    callbacks.onOpenSources();
  });
}

function formatFsFallbackHtml(fsCode, sourceModulePath) {
  const modName = sourceModulePath ? sourceModulePath.split('/').pop() : 'módulo atual';
  return `
    <p><strong>Código de estudo:</strong> ${escapeHtml(fsCode)}</p>
    <p>Este código figura no texto do módulo (<strong>${escapeHtml(modName)}</strong>) e não possui verbete completo na tabela <code>dictionary</code> interna nem nos dicionários externos carregados.</p>
  `;
}

function renderEntry() {
  const container = document.getElementById('reader-content');
  if (!container) return;
  container.classList.remove('has-interlinear');

  const active = getActiveModule();
  if (!active && !currentEntry) {
    renderEmpty({
      title: 'Nenhum dicionário disponível',
      message: 'Adicione arquivos .dct.mybible ou módulos com dicionário interno em Configurações → Fontes.',
      showSourcesButton: true
    });
    emitMetaChange();
    return;
  }

  if (!currentEntry) {
    renderEmpty({
      title: 'Dicionário pronto',
      message: `Módulo selecionado: ${active ? (active.title || active.abbr) : 'Dicionário'}. Use a barra superior ou a pesquisa para abrir um verbete ou código FS.`,
      showSourcesButton: false
    });
    emitMetaChange();
    return;
  }

  const scrollBox = document.getElementById('reader-scroll');
  const modLabel = active ? (active.title || active.abbr || active.fileName) : 'Módulo interno';

  container.innerHTML = `
    <article class="dict-entry-card">
      <header class="dict-entry-header">
        <span class="dict-entry-mod">${escapeHtml(modLabel)}</span>
        <h1 class="dict-entry-word">${escapeHtml(currentEntry.word || '')}</h1>
      </header>
      <div class="dict-entry-body">${currentEntry.html || ''}</div>
    </article>
  `;

  if (scrollBox) {
    scrollBox.scrollTo({ top: 0, behavior: 'auto' });
  }
  emitMetaChange();
}

export async function openDictionaryEntry(
  rawTerm,
  {
    modulePath = '',
    moduleHint = '',
    matchedWord = '',
    keepFilterTerm = false,
    clearFilter = false,
    pushHistory = true,
    fallbackAll = true,
    directWord = false,
    sourceModulePath = ''
  } = {}
) {
  const seq = ++renderSeq;
  const rawStr = String(rawTerm || '').trim();
  const fsCode = normalizeFsCode(rawStr);
  const term = fsCode || normalizeLookupTerm(rawStr);
  if (!term) return null;

  if (clearFilter) {
    currentFilterTerm = '';
  } else if (keepFilterTerm) {
    currentFilterTerm = term;
  }

  currentQuery = term;
  const active = getActiveModule();
  const targetMod = modulePath
    ? (modulesList.find((m) => m.path === modulePath) || { path: modulePath })
    : active;

  if (targetMod && targetMod.path) {
    activeModulePath = targetMod.path;
    store.setActiveDictionary(targetMod.path, { silent: true });
  }

  if (store.getActiveMode() === 'dictionary') {
    renderEmpty({
      title: 'Consultando verbete...',
      message: `Buscando "${term}"...`,
      showSourcesButton: false
    });
  }

  let entry = null;

  // 1. Se for código FS..., tenta primeiro na tabela `dictionary` interna do próprio módulo
  if (fsCode) {
    const internalHit = await lookupFsInModule(sourceModulePath || activeModulePath, fsCode);
    if (seq !== renderSeq) return null;
    if (internalHit) {
      entry = {
        word: internalHit.word || fsCode,
        html: internalHit.html,
        modulePath: internalHit.modulePath || activeModulePath
      };
    }
  }

  // 2. Consulta dicionários configurados no aplicativo
  if (!entry && modulesList.length > 0) {
    const lookupRes = await lookupDictionaryEntry(modulesList, term, {
      preferredModulePath: modulePath || (active ? active.path : ''),
      moduleHint,
      matchedWord,
      fallbackAll,
      directWord
    });
    if (seq !== renderSeq) return null;

    if (lookupRes && lookupRes.entry) {
      entry = lookupRes.entry;
      if (lookupRes.module && lookupRes.module.path) {
        activeModulePath = lookupRes.module.path;
        store.setActiveDictionary(lookupRes.module.path, { silent: true });
      }
    }
  }

  // 3. Fallback informativo caso seja código FS sem entrada no banco
  if (!entry && fsCode) {
    entry = {
      word: fsCode,
      html: formatFsFallbackHtml(fsCode, sourceModulePath),
      modulePath: activeModulePath
    };
  }

  if (!entry) {
    if (store.getActiveMode() === 'dictionary') {
      renderEmpty({
        title: 'Verbete não encontrado',
        message: `Não foi encontrado verbete para "${term}" no módulo selecionado.`,
        showSourcesButton: false
      });
    } else {
      callbacks.onToast(`Verbete "${term}" não encontrado.`);
    }
    emitMetaChange();
    return null;
  }

  if (
    pushHistory &&
    (!currentEntry ||
      currentEntry.word !== entry.word ||
      currentEntry.modulePath !== (entry.modulePath || activeModulePath))
  ) {
    entryHistory.push({
      word: entry.word,
      modulePath: entry.modulePath || activeModulePath
    });
    if (entryHistory.length > 30) entryHistory.shift();
  }

  currentEntry = entry;
  if (store.getActiveMode() === 'dictionary') {
    renderEntry();
  } else {
    emitMetaChange();
  }
  return entry;
}

export async function stepDictionaryEntry(delta) {
  const active = getActiveModule();
  if (!active) return;

  const adapter = getAdapterForModule(active);
  if (!adapter || typeof adapter.getAdjacentEntry !== 'function') return;

  const curWord = currentEntry ? currentEntry.word : currentQuery;
  const nextEntry = await adapter.getAdjacentEntry(active.path, curWord, Number(delta) || 1);
  if (nextEntry) {
    currentEntry = nextEntry;
    currentQuery = nextEntry.word || currentQuery;
    if (store.getActiveMode() === 'dictionary') {
      renderEntry();
    } else {
      emitMetaChange();
    }
  }
}

export async function loadFirstOrCurrentEntry() {
  const active = getActiveModule();
  if (!active) {
    renderEmpty({
      title: 'Nenhum dicionário disponível',
      message: 'Adicione arquivos .dct.mybible ou módulos com dicionário em Configurações → Fontes.',
      showSourcesButton: true
    });
    emitMetaChange();
    return;
  }

  if (currentEntry && currentEntry.modulePath === active.path) {
    renderEntry();
    return;
  }

  const targetTerm = currentQuery || currentFilterTerm || '';
  if (targetTerm) {
    await openDictionaryEntry(targetTerm, {
      modulePath: active.path,
      pushHistory: false,
      fallbackAll: false,
      directWord: true
    });
    return;
  }

  const adapter = getAdapterForModule(active);
  if (adapter && typeof adapter.getFirstEntry === 'function') {
    const first = await adapter.getFirstEntry(active.path);
    if (first) {
      currentEntry = first;
      currentQuery = first.word || '';
      renderEntry();
      return;
    }
  }

  renderEmpty({
    title: 'Dicionário pronto',
    message: `Dicionário ativo: ${active.title || active.abbr || active.fileName}.`,
    showSourcesButton: false
  });
  emitMetaChange();
}

export async function setActiveDictionaryModule(
  modulePath,
  { matchedWord = '', keepTerm = true, clearFilter = false, pushHistory = true, render = true } = {}
) {
  if (!modulePath) return;
  activeModulePath = modulePath;
  store.setActiveDictionary(modulePath, { silent: true });
  if (clearFilter) currentFilterTerm = '';
  currentEntry = null;

  const termToOpen = matchedWord || (keepTerm ? (currentQuery || currentFilterTerm) : '');
  if (termToOpen) {
    await openDictionaryEntry(termToOpen, {
      modulePath,
      matchedWord,
      keepFilterTerm,
      pushHistory,
      fallbackAll: false,
      directWord: Boolean(matchedWord)
    });
    return;
  }

  if (render && store.getActiveMode() === 'dictionary') {
    await loadFirstOrCurrentEntry();
  } else {
    emitMetaChange();
  }
}

export function syncDictionaryModules(dicts) {
  modulesList = Array.isArray(dicts) ? dicts.slice() : [];
  if (!modulesList.length) {
    activeModulePath = '';
    currentEntry = null;
    emitMetaChange();
    return;
  }
  if (!activeModulePath || !modulesList.some((m) => m.path === activeModulePath)) {
    const stored = store.getActiveDictionary();
    activeModulePath = stored && modulesList.some((m) => m.path === stored.path)
      ? stored.path
      : modulesList[0].path;
  }
  emitMetaChange();
}

export function renderDictionaryView() {
  renderEntry();
}

export function getDictionaryViewState() {
  const active = getActiveModule();
  return {
    activeModule: active || null,
    activeModulePath: active ? active.path : '',
    currentEntry,
    query: currentQuery,
    filterTerm: currentFilterTerm,
    searchOptions: { ...currentSearchOptions }
  };
}

export async function openActiveDictionaryTerms() {
  const active = getActiveModule();
  if (!active) {
    callbacks.onToast('Nenhum dicionário selecionado.');
    return;
  }

  const modal = openModalShell({ title: `Termos — ${active.title || active.abbr || active.fileName}` });
  if (!modal || !modal.body) return;

  modal.body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <input type="search" class="map-text-input" id="dict-terms-filter" placeholder="Filtrar termos..." autocomplete="off" />
      <div id="dict-terms-results" class="map-index-list">Carregando termos...</div>
    </div>
  `;

  const input = modal.body.querySelector('#dict-terms-filter');
  const resultsBox = modal.body.querySelector('#dict-terms-results');

  const loadList = async (q = '') => {
    try {
      const items = await searchDictionaryTerms(active.path, q, { limit: 120 });
      if (!resultsBox) return;
      if (!Array.isArray(items) || !items.length) {
        resultsBox.innerHTML = '<div style="padding:8px;color:var(--text-muted);">Nenhum termo encontrado.</div>';
        return;
      }
      resultsBox.innerHTML = items.map((w) => {
        const wordStr = typeof w === 'string' ? w : (w.word || '');
        return `<button type="button" class="map-index-item" data-dict-word="${escapeHtml(wordStr)}"><span>${escapeHtml(wordStr)}</span></button>`;
      }).join('');
    } catch (err) {
      appLogger.warn('DICT_TERMS', 'Falha ao listar termos do dicionário', err);
    }
  };

  resultsBox?.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-dict-word]');
    if (!btn) return;
    const word = btn.getAttribute('data-dict-word') || '';
    if (!word) return;
    closeModal();
    if (store.getActiveMode() !== 'dictionary') {
      store.setActiveMode('dictionary');
    }
    await openDictionaryEntry(word, {
      modulePath: active.path,
      pushHistory: true,
      fallbackAll: false,
      directWord: true
    });
  });

  input?.addEventListener('input', () => {
    loadList(input.value || '');
  });

  await loadList('');
}

function hideSelectionBar() {
  currentSelectedText = '';
  if (selectionBarEl) {
    selectionBarEl.classList.add('hidden');
  }
}

function ensureSelectionBar() {
  if (selectionBarEl) return selectionBarEl;
  const bar = document.createElement('div');
  bar.id = 'selection-lookup-bar';
  bar.className = 'selection-lookup-bar hidden';
  bar.setAttribute('data-bref-skip', '1');
  bar.innerHTML = `
    <button type="button" class="selection-lookup-btn" id="sel-btn-lookup">Dicionário</button>
    <button type="button" class="selection-lookup-btn" id="sel-btn-lookup-all">Todos os dic.</button>
  `;
  document.body.appendChild(bar);

  bar.querySelector('#sel-btn-lookup')?.addEventListener('click', () => {
    const term = currentSelectedText;
    hideSelectionBar();
    if (term && typeof selectionHandlers.onLookup === 'function') {
      selectionHandlers.onLookup(term);
    }
  });

  bar.querySelector('#sel-btn-lookup-all')?.addEventListener('click', () => {
    const term = currentSelectedText;
    hideSelectionBar();
    if (term && typeof selectionHandlers.onLookupAll === 'function') {
      selectionHandlers.onLookupAll(term);
    }
  });

  selectionBarEl = bar;
  return bar;
}

export function initSelectionLookupBar(opts = {}) {
  selectionHandlers = { ...selectionHandlers, ...opts };
  const bar = ensureSelectionBar();

  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection ? window.getSelection() : null;
    const txt = sel && !sel.isCollapsed ? String(sel.toString() || '').trim() : '';
    if (!txt || txt.length > 60) {
      hideSelectionBar();
      return;
    }
    currentSelectedText = txt;
    const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const rect = range ? range.getBoundingClientRect() : null;
    if (!rect || (!rect.width && !rect.height)) {
      hideSelectionBar();
      return;
    }
    const top = Math.max(54, Math.round(rect.top - 44));
    const left = Math.max(8, Math.min(window.innerWidth - 180, Math.round(rect.left)));
    bar.style.top = `${top}px`;
    bar.style.left = `${left}px`;
    bar.classList.remove('hidden');
  });
}

export function initDictionaryView(opts = {}) {
  callbacks = { ...callbacks, ...opts };
  syncDictionaryModules(store.getDictionaries());
}
