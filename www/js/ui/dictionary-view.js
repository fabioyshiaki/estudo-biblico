import { store } from '../core/store.js';
import { nativeBridge } from '../bridge/native-bridge.js';
import { getAdapterForModule } from '../formats/format-registry.js';
import {
  myswordDictionaryAdapter,
  normalizeLookupTerm,
  normalizeDictSearchOptions
} from '../formats/mysword-dictionary.js';
import { lookupExactAcrossDictionaries } from '../formats/dictionary-lookup.js';
import {
  lookupFsInModule,
  normalizeFsCode,
  getFileNameFromPath
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

function getModuleOriginLabel(mod, fallbackPath = '') {
  if (mod) {
    return mod.sourceFileName || mod.fileName || getFileNameFromPath(mod.path) || mod.title || mod.abbr || '';
  }
  return getFileNameFromPath(fallbackPath);
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

function isInternalDictModule(mod) {
  return Boolean(mod && (mod.isInternalDictionary || mod.resourceKind !== 'dictionary'));
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
  const modName = getFileNameFromPath(sourceModulePath) || 'módulo atual';
  return `
    <p><strong>Código de estudo:</strong> ${escapeHtml(fsCode)}</p>
    <p>Este código figura no texto do módulo (<strong>${escapeHtml(modName)}</strong>) e não possui verbete completo na tabela <code>dictionary</code> interna nem nos dicionários carregados.</p>
  `;
}

async function queryInternalEntry(modulePath, rawWord, delta = 0) {
  const cleanWord = String(rawWord || '').trim();
  const fsCode = normalizeFsCode(cleanWord);

  if (delta !== 0) {
    const curWord = cleanWord.toUpperCase();
    const sql = delta > 0
      ? 'SELECT word, data FROM dictionary WHERE UPPER(TRIM(word)) > ? ORDER BY relativeorder ASC, rowid ASC LIMIT 1'
      : 'SELECT word, data FROM dictionary WHERE UPPER(TRIM(word)) < ? ORDER BY relativeorder DESC, rowid DESC LIMIT 1';
    const res = await nativeBridge.queryModule(modulePath, sql, [curWord]);
    const rows = Array.isArray(res) ? res : (Array.isArray(res && res.rows) ? res.rows : []);
    if (rows.length > 0) {
      return {
        word: String(rows[0].word || rows[0].WORD || '').trim(),
        html: String(rows[0].data || rows[0].DATA || '').trim(),
        modulePath,
        sourceFileName: getFileNameFromPath(modulePath)
      };
    }
    return null;
  }

  if (fsCode) {
    return lookupFsInModule(modulePath, fsCode);
  }

  if (!cleanWord) {
    const sqlFirst = 'SELECT word, data FROM dictionary ORDER BY relativeorder ASC, rowid ASC LIMIT 1';
    const resFirst = await nativeBridge.queryModule(modulePath, sqlFirst, []);
    const rowsFirst = Array.isArray(resFirst) ? resFirst : (Array.isArray(resFirst && resFirst.rows) ? resFirst.rows : []);
    if (rowsFirst.length > 0) {
      return {
        word: String(rowsFirst[0].word || rowsFirst[0].WORD || '').trim(),
        html: String(rowsFirst[0].data || rowsFirst[0].DATA || '').trim(),
        modulePath,
        sourceFileName: getFileNameFromPath(modulePath)
      };
    }
    return null;
  }

  const sql =
    'SELECT word, data FROM dictionary ' +
    'WHERE UPPER(TRIM(word)) = ? OR UPPER(TRIM(word)) LIKE ? ' +
    'ORDER BY CASE WHEN UPPER(TRIM(word)) = ? THEN 0 ELSE 1 END, relativeorder ASC, rowid ASC LIMIT 1';
  const params = [cleanWord.toUpperCase(), `${cleanWord.toUpperCase()}%`, cleanWord.toUpperCase()];
  const res = await nativeBridge.queryModule(modulePath, sql, params);
  const rows = Array.isArray(res) ? res : (Array.isArray(res && res.rows) ? res.rows : []);
  if (rows.length > 0) {
    return {
      word: String(rows[0].word || rows[0].WORD || cleanWord).trim(),
      html: String(rows[0].data || rows[0].DATA || '').trim(),
      modulePath,
      sourceFileName: getFileNameFromPath(modulePath)
    };
  }
  return null;
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
    const activeName = getModuleOriginLabel(active, activeModulePath);
    renderEmpty({
      title: 'Dicionário pronto',
      message: `Módulo selecionado: ${activeName || 'Dicionário'}. Use a barra superior ou a pesquisa para abrir um verbete ou código FS.`,
      showSourcesButton: false
    });
    emitMetaChange();
    return;
  }

  const scrollBox = document.getElementById('reader-scroll');
  const entryPath = currentEntry.modulePath || (active ? active.path : '');
  const matchedMod = modulesList.find((m) => m.path === entryPath) || active;
  const modLabel = getModuleOriginLabel(matchedMod, entryPath);

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
  const wordCandidate = matchedWord || rawStr;
  const term = fsCode || normalizeLookupTerm(wordCandidate);
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

  // 1. Se for código FS..., consulta a tabela `dictionary` interna do módulo de origem e demais módulos internos
  if (fsCode) {
    const internalHit = await lookupFsInModule(sourceModulePath || activeModulePath, fsCode);
    if (seq !== renderSeq) return null;
    if (internalHit) {
      const hitPath = internalHit.modulePath || sourceModulePath || activeModulePath;
      const originFile = internalHit.sourceFileName || getFileNameFromPath(hitPath);
      entry = {
        word: internalHit.word || fsCode,
        html: internalHit.html,
        modulePath: hitPath,
        sourceFileName: originFile
      };
      if (hitPath) {
        activeModulePath = hitPath;
        store.setActiveDictionary(hitPath, { silent: true });
      }
    }
  }

  // 2. Consulta o módulo alvo ou os dicionários configurados no aplicativo
  if (!entry && modulesList.length > 0) {
    const lookupOpts = {
      ...currentSearchOptions,
      moduleHint,
      activePath: modulePath || (active ? active.path : '')
    };

    if (modulePath) {
      const modObj = modulesList.find((m) => m.path === modulePath);
      if (isInternalDictModule(modObj)) {
        try {
          entry = await queryInternalEntry(modulePath, term, 0);
        } catch (err) {
          appLogger.warn('DICT_ENTRY', `Falha ao abrir "${term}" no dicionário interno`, err);
        }
      } else {
        try {
          const directEntry = await myswordDictionaryAdapter.getEntry(modulePath, term, lookupOpts);
          if (seq !== renderSeq) return null;
          if (directEntry) {
            entry = {
              ...directEntry,
              modulePath,
              sourceFileName: getModuleOriginLabel(modObj, modulePath)
            };
          }
        } catch (err) {
          appLogger.warn('DICT_ENTRY', `Falha ao abrir "${term}" no módulo selecionado`, err);
        }
      }
    }

    if (!entry && !fsCode && (fallbackAll || !modulePath || directWord)) {
      const externalDicts = modulesList.filter((m) => !isInternalDictModule(m));
      const lookupRes = await lookupExactAcrossDictionaries(externalDicts, term, lookupOpts);
      if (seq !== renderSeq) return null;

      if (lookupRes && lookupRes.entry) {
        const foundPath = (lookupRes.module && lookupRes.module.path) || '';
        entry = {
          ...lookupRes.entry,
          modulePath: foundPath,
          sourceFileName: getModuleOriginLabel(lookupRes.module, foundPath)
        };
        if (foundPath) {
          activeModulePath = foundPath;
          store.setActiveDictionary(foundPath, { silent: true });
        }
      }
    }
  }

  // 3. Fallback informativo caso seja código FS sem entrada no banco
  if (!entry && fsCode) {
    entry = {
      word: fsCode,
      html: formatFsFallbackHtml(fsCode, sourceModulePath),
      modulePath: sourceModulePath || activeModulePath,
      sourceFileName: getFileNameFromPath(sourceModulePath || activeModulePath)
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

  const curWord = currentEntry ? currentEntry.word : currentQuery;
  if (isInternalDictModule(active)) {
    const nextInternal = await queryInternalEntry(active.path, curWord, Number(delta) || 1);
    if (nextInternal) {
      currentEntry = nextInternal;
      currentQuery = nextInternal.word || currentQuery;
      if (store.getActiveMode() === 'dictionary') {
        renderEntry();
      } else {
        emitMetaChange();
      }
    }
    return;
  }

  const adapter = getAdapterForModule(active);
  if (!adapter || typeof adapter.getAdjacentEntry !== 'function') return;

  const nextEntry = await adapter.getAdjacentEntry(active.path, curWord, Number(delta) || 1);
  if (nextEntry) {
    currentEntry = {
      ...nextEntry,
      modulePath: active.path,
      sourceFileName: getModuleOriginLabel(active, active.path)
    };
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
      message: 'Adicione arquivos .dct.mybible ou módulos com dicionário interno em Configurações → Fontes.',
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
      sourceModulePath: isInternalDictModule(active) ? active.path : '',
      pushHistory: false,
      fallbackAll: false,
      directWord: true
    });
    return;
  }

  if (isInternalDictModule(active)) {
    const firstInternal = await queryInternalEntry(active.path, '', 0);
    if (firstInternal) {
      currentEntry = firstInternal;
      currentQuery = firstInternal.word || '';
      renderEntry();
      return;
    }
  }

  const adapter = getAdapterForModule(active);
  if (adapter && typeof adapter.getFirstEntry === 'function') {
    const first = await adapter.getFirstEntry(active.path);
    if (first) {
      currentEntry = {
        ...first,
        modulePath: active.path,
        sourceFileName: getModuleOriginLabel(active, active.path)
      };
      currentQuery = first.word || '';
      renderEntry();
      return;
    }
  }

  renderEmpty({
    title: 'Dicionário pronto',
    message: `Dicionário ativo: ${getModuleOriginLabel(active, active.path)}.`,
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

  const modObj = modulesList.find((m) => m.path === modulePath);
  const termToOpen = matchedWord || (keepTerm ? (currentQuery || currentFilterTerm) : '');
  if (termToOpen) {
    await openDictionaryEntry(termToOpen, {
      modulePath,
      sourceModulePath: isInternalDictModule(modObj) ? modulePath : '',
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

  const originLabel = getModuleOriginLabel(active, active.path);
  const modal = openModalShell({ title: `Termos — ${originLabel}` });
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
      const cleanQ = String(q || '').trim();
      if (isInternalDictModule(active)) {
        const sql = cleanQ
          ? 'SELECT word FROM dictionary WHERE UPPER(TRIM(word)) LIKE ? ORDER BY relativeorder ASC, rowid ASC LIMIT 120'
          : 'SELECT word FROM dictionary ORDER BY relativeorder ASC, rowid ASC LIMIT 120';
        const params = cleanQ ? [`%${cleanQ.toUpperCase()}%`] : [];
        const res = await nativeBridge.queryModule(active.path, sql, params);
        const rows = Array.isArray(res) ? res : (Array.isArray(res && res.rows) ? res.rows : []);
        if (!resultsBox) return;
        if (!rows.length) {
          resultsBox.innerHTML = '<div style="padding:8px;color:var(--text-muted);">Nenhum termo encontrado.</div>';
          return;
        }
        resultsBox.innerHTML = rows.map((r) => {
          const wordStr = String(r.word || r.WORD || '').trim();
          return `<button type="button" class="map-index-item" data-dict-word="${escapeHtml(wordStr)}"><span>${escapeHtml(wordStr)}</span></button>`;
        }).join('');
        return;
      }

      const items = await myswordDictionaryAdapter.searchEntries(active.path, cleanQ || 'a', {
        ...currentSearchOptions,
        limit: 120
      });
      if (!resultsBox) return;
      if (!Array.isArray(items) || !items.length) {
        resultsBox.innerHTML = '<div style="padding:8px;color:var(--text-muted);">Nenhum termo encontrado.</div>';
        return;
      }
      resultsBox.innerHTML = items.map((it) => {
        const wordStr = typeof it === 'string' ? it : (it.word || '');
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
      sourceModulePath: isInternalDictModule(active) ? active.path : '',
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
