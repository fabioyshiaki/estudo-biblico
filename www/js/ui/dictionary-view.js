import { store } from '../core/store.js';
import { parseBibleReference } from '../core/bible-refs.js';
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
  extractFsCodeFromElement,
  getFileNameFromPath
} from '../formats/fs-internal-lookup.js';
import {
  isUgntMorphCode,
  isBhsMorphCode,
  isAnyMorphCode,
  expandMorphologyLookupCandidates,
  buildUgntMorphFallbackHtml
} from '../formats/morph-mapper.js';
import { resolveDictionaryImageUrl } from '../formats/media-cache.js';
import { ensureCompanionStyles } from '../formats/companion-dicts.js';
import { openModalShell, closeModal } from './nav-modal.js';
import { appLogger } from '../core/logger.js';

const LOADING_DEBOUNCE_MS = 160;

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
let imageRenderSeq = 0;
let loadingTimer = null;
let readerEventsBound = false;

let selectionBarEl = null;
let selectionHandlers = {
  onLookup: null,
  onLookupAll: null
};
let currentSelectedText = '';

function clearPendingLoadingTimer() {
  if (loadingTimer !== null) {
    window.clearTimeout(loadingTimer);
    loadingTimer = null;
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractRows(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.rows)) return res.rows;
  if (res && Array.isArray(res.results)) return res.results;
  return [];
}

function getModuleOriginLabel(mod, fallbackPath = '') {
  if (mod) {
    return mod.abbr || mod.title || mod.sourceFileName || mod.fileName || getFileNameFromPath(mod.path) || '';
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

async function hydrateDictionaryImages(rootEl, modulePath, entry, seq) {
  if (!rootEl || !modulePath) return;
  const imgs = Array.from(rootEl.querySelectorAll('img[data-dct-img-src]'));
  if (!imgs.length) return;

  const modName = getFileNameFromPath(modulePath) || modulePath;
  const contextRaw = (entry && (entry.raw || entry.html)) || '';

  for (const img of imgs) {
    if (seq !== imageRenderSeq) return;
    const rawSrc = img.getAttribute('data-dct-img-src') || '';
    const fallbackUrl = img.getAttribute('data-dct-img-fallback') || '';
    const picEl = img.closest('.dct-pic');

    try {
      const res = await resolveDictionaryImageUrl(modulePath, rawSrc, {
        contextRaw,
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

      img.onload = () => img.classList.remove('is-loading');
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
      const reason = err && err.message ? err.message : 'erro inesperado';
      img.classList.remove('is-loading');
      appLogger.error('DICT_IMG', `Exceção ao carregar imagem (${rawSrc}) em ${modName}: ${reason}`, err);
      showImageErrorHint(picEl, rawSrc, reason);
    }
  }
}

function renderEmpty({ title, message, showSourcesButton = true }) {
  clearPendingLoadingTimer();
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

function mapInternalRow(row, modulePath, fallbackWord = '') {
  if (!row) return null;
  const word = String(row.word || row.WORD || fallbackWord).trim();
  const html = String(row.data || row.DATA || row.content || row.html || '').trim();
  if (!word && !html) return null;
  return {
    word: word || fallbackWord,
    html,
    raw: html,
    modulePath,
    sourceFileName: getFileNameFromPath(modulePath)
  };
}

async function queryInternalEntry(modulePath, rawWord, delta = 0) {
  const cleanWord = String(rawWord || '').trim();

  if (delta !== 0) {
    if (!cleanWord) {
      const sqlFirst = 'SELECT word, data FROM dictionary ORDER BY UPPER(TRIM(word)) ASC, word ASC LIMIT 1';
      const rowsFirst = extractRows(await nativeBridge.queryModule(modulePath, sqlFirst, []));
      return rowsFirst.length > 0 ? mapInternalRow(rowsFirst[0], modulePath) : null;
    }

    const curWord = cleanWord.toUpperCase();
    const sql = delta > 0
      ? 'SELECT word, data FROM dictionary WHERE UPPER(TRIM(word)) > ? ORDER BY UPPER(TRIM(word)) ASC, word ASC LIMIT 1'
      : 'SELECT word, data FROM dictionary WHERE UPPER(TRIM(word)) < ? ORDER BY UPPER(TRIM(word)) DESC, word DESC LIMIT 1';
    const rows = extractRows(await nativeBridge.queryModule(modulePath, sql, [curWord]));
    return rows.length > 0 ? mapInternalRow(rows[0], modulePath) : null;
  }

  if (!cleanWord) {
    const sqlFirst = 'SELECT word, data FROM dictionary ORDER BY UPPER(TRIM(word)) ASC, word ASC LIMIT 1';
    const rowsFirst = extractRows(await nativeBridge.queryModule(modulePath, sqlFirst, []));
    return rowsFirst.length > 0 ? mapInternalRow(rowsFirst[0], modulePath) : null;
  }

  const upperWord = cleanWord.toUpperCase();
  const sql =
    'SELECT word, data FROM dictionary ' +
    'WHERE UPPER(TRIM(word)) = ? OR UPPER(TRIM(word)) LIKE ? ' +
    'ORDER BY CASE WHEN UPPER(TRIM(word)) = ? THEN 0 ELSE 1 END, LENGTH(word) ASC, UPPER(TRIM(word)) ASC, word ASC LIMIT 1';
  const params = [upperWord, `${upperWord}%`, upperWord];
  const rows = extractRows(await nativeBridge.queryModule(modulePath, sql, params));
  return rows.length > 0 ? mapInternalRow(rows[0], modulePath, cleanWord) : null;
}

async function fetchFirstEntryForModule(mod) {
  if (!mod || !mod.path) return null;

  if (isInternalDictModule(mod)) {
    return queryInternalEntry(mod.path, '', 0);
  }

  const adapter = getAdapterForModule(mod) || myswordDictionaryAdapter;
  if (adapter && typeof adapter.getFirstEntry === 'function') {
    const first = await adapter.getFirstEntry(mod.path);
    if (first) {
      return {
        ...first,
        modulePath: mod.path,
        sourceFileName: getModuleOriginLabel(mod, mod.path)
      };
    }
  }

  try {
    const sql = 'SELECT word FROM dictionary ORDER BY UPPER(TRIM(word)) ASC, word ASC LIMIT 1';
    const rows = extractRows(await nativeBridge.queryModule(mod.path, sql, []));
    const firstWord = rows.length > 0 ? String(rows[0].word || rows[0].WORD || '').trim() : '';
    if (firstWord) {
      const entry = await myswordDictionaryAdapter.getEntry(mod.path, firstWord, currentSearchOptions);
      if (entry) {
        return {
          ...entry,
          modulePath: mod.path,
          sourceFileName: getModuleOriginLabel(mod, mod.path)
        };
      }
    }
  } catch (err) {
    appLogger.warn('DICT_FIRST', `Falha no fallback do primeiro verbete em ${getModuleOriginLabel(mod, mod.path)}`, err);
  }

  return null;
}

async function fetchAdjacentEntryForModule(mod, curWord, delta) {
  if (!mod || !mod.path) return null;
  const step = Number(delta) || 1;

  if (isInternalDictModule(mod)) {
    return queryInternalEntry(mod.path, curWord, step);
  }

  const adapter = getAdapterForModule(mod) || myswordDictionaryAdapter;
  if (adapter && typeof adapter.getAdjacentEntry === 'function') {
    const adj = await adapter.getAdjacentEntry(mod.path, curWord, step);
    if (adj) {
      return {
        ...adj,
        modulePath: mod.path,
        sourceFileName: getModuleOriginLabel(mod, mod.path)
      };
    }
  }

  try {
    const clean = String(curWord || '').trim();
    const sql = clean
      ? (step > 0
          ? 'SELECT word FROM dictionary WHERE UPPER(TRIM(word)) > ? ORDER BY UPPER(TRIM(word)) ASC, word ASC LIMIT 1'
          : 'SELECT word FROM dictionary WHERE UPPER(TRIM(word)) < ? ORDER BY UPPER(TRIM(word)) DESC, word DESC LIMIT 1')
      : 'SELECT word FROM dictionary ORDER BY UPPER(TRIM(word)) ASC, word ASC LIMIT 1';
    const params = clean ? [clean.toUpperCase()] : [];
    const rows = extractRows(await nativeBridge.queryModule(mod.path, sql, params));
    const nextWord = rows.length > 0 ? String(rows[0].word || rows[0].WORD || '').trim() : '';
    if (nextWord) {
      const entry = await myswordDictionaryAdapter.getEntry(mod.path, nextWord, currentSearchOptions);
      if (entry) {
        return {
          ...entry,
          modulePath: mod.path,
          sourceFileName: getModuleOriginLabel(mod, mod.path)
        };
      }
    }
  } catch (err) {
    appLogger.warn('DICT_STEP', `Falha ao navegar verbete em ${getModuleOriginLabel(mod, mod.path)}`, err);
  }

  return null;
}

function renderEntry({ resetScroll = true } = {}) {
  clearPendingLoadingTimer();
  const container = document.getElementById('reader-content');
  if (!container) return;

  ensureCompanionStyles();
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
  const matchedMod = entryPath ? (modulesList.find((m) => m.path === entryPath) || active) : null;
  const modLabel = currentEntry.isSyntheticMorph
    ? (currentEntry.sourceFileName || 'Decodificador morfológico (UGNT)')
    : getModuleOriginLabel(matchedMod, entryPath);
  const mappedLine = currentEntry.mappedFromCode
    ? `<div class="dict-entry-mapped" style="font-size:0.82em;opacity:0.72;margin-top:2px;">Código do módulo: <code>${escapeHtml(currentEntry.mappedFromCode)}</code> &rarr; <strong>${escapeHtml(currentEntry.word || '')}</strong></div>`
    : '';
  const dirAttr = currentEntry.isRtl ? ' dir="rtl"' : '';
  const imgSeq = ++imageRenderSeq;

  container.innerHTML = `
    <article class="dict-entry-card">
      <header class="dict-entry-header">
        <span class="dict-entry-mod">${escapeHtml(modLabel)}</span>
        <h1 class="dict-entry-word">${escapeHtml(currentEntry.word || '')}</h1>
        ${mappedLine}
      </header>
      <div class="dict-entry-body"${dirAttr}>${currentEntry.html || ''}</div>
    </article>
  `;

  const cardEl = container.querySelector('.dict-entry-card');
  if (cardEl && entryPath && !currentEntry.isSyntheticMorph) {
    hydrateDictionaryImages(cardEl, entryPath, currentEntry, imgSeq);
  }

  if (resetScroll && scrollBox) {
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
    sourceModulePath = '',
    silentNotFound = false
  } = {}
) {
  const seq = ++renderSeq;
  clearPendingLoadingTimer();

  const rawStr = String(rawTerm || '').trim();
  const fsCode = normalizeFsCode(rawStr);
  const wordCandidate = String(matchedWord || rawStr).trim();
  const isUgnt = !fsCode && isUgntMorphCode(wordCandidate);
  const isBhs = !fsCode && isBhsMorphCode(wordCandidate);
  const isMorph = !fsCode && (isAnyMorphCode(wordCandidate) || String(moduleHint || '').trim().toLowerCase() === 'morph');

  const term = fsCode
    ? fsCode
    : isUgnt
      ? wordCandidate.replace(/^<WT/i, '').replace(/>$/i, '').replace(/·/g, '.').toUpperCase()
      : isBhs
        ? wordCandidate.replace(/^<WT/i, '').replace(/>$/i, '')
        : normalizeLookupTerm(wordCandidate);
  if (!term) return null;

  const effectiveModuleHint = moduleHint || (isMorph ? 'morph' : '');

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

  if (store.getActiveMode() === 'dictionary' && !silentNotFound) {
    loadingTimer = window.setTimeout(() => {
      loadingTimer = null;
      if (seq !== renderSeq || store.getActiveMode() !== 'dictionary') return;
      renderEmpty({
        title: 'Consultando verbete...',
        message: `Buscando "${term}"...`,
        showSourcesButton: false
      });
    }, LOADING_DEBOUNCE_MS);
  }

  let entry = null;

  // 1. Se for código FS..., consulta a tabela `dictionary` interna respeitando modulePath quando fallbackAll=false
  if (fsCode) {
    if (modulePath && !fallbackAll) {
      const modObj = modulesList.find((m) => m.path === modulePath);
      if (isInternalDictModule(modObj)) {
        try {
          entry = await queryInternalEntry(modulePath, fsCode, 0);
          if (seq !== renderSeq) return null;
        } catch (err) {
          appLogger.warn('DICT_ENTRY', `Falha ao abrir "${fsCode}" no dicionário interno`, err);
        }
      }
    } else {
      const internalHit = await lookupFsInModule(sourceModulePath || activeModulePath, fsCode);
      if (seq !== renderSeq) return null;
      if (internalHit) {
        const hitPath = internalHit.modulePath || sourceModulePath || activeModulePath;
        const originFile = internalHit.sourceFileName || getFileNameFromPath(hitPath);
        entry = {
          word: internalHit.word || fsCode,
          html: internalHit.html,
          raw: internalHit.html,
          modulePath: hitPath,
          sourceFileName: originFile
        };
        if (hitPath) {
          activeModulePath = hitPath;
          store.setActiveDictionary(hitPath, { silent: true });
        }
      }
    }
  }

  // 2. Consulta o módulo alvo ou os dicionários configurados no aplicativo (com mapeamento morfológico)
  if (!entry && modulesList.length > 0) {
    const lookupOpts = {
      ...currentSearchOptions,
      moduleHint: effectiveModuleHint,
      activePath: modulePath || (active ? active.path : '')
    };

    if (modulePath) {
      const modObj = modulesList.find((m) => m.path === modulePath);
      if (isInternalDictModule(modObj)) {
        try {
          entry = await queryInternalEntry(modulePath, term, 0);
          if (seq !== renderSeq) return null;
        } catch (err) {
          appLogger.warn('DICT_ENTRY', `Falha ao abrir "${term}" no dicionário interno`, err);
        }
      } else {
        const directTerms = isMorph ? expandMorphologyLookupCandidates(term) : [term];
        for (const candidateTerm of directTerms) {
          if (seq !== renderSeq) return null;
          try {
            const directEntry = await myswordDictionaryAdapter.getEntry(modulePath, candidateTerm, lookupOpts);
            if (seq !== renderSeq) return null;
            if (directEntry) {
              const entryWord = String(directEntry.word || candidateTerm).trim();
              entry = {
                ...directEntry,
                modulePath,
                sourceFileName: getModuleOriginLabel(modObj, modulePath),
                mappedFromCode: entryWord.toUpperCase() !== term.toUpperCase() ? term : ''
              };
              break;
            }
          } catch (err) {
            appLogger.warn('DICT_ENTRY', `Falha ao abrir "${candidateTerm}" no módulo selecionado`, err);
            break;
          }
        }
      }
    }

    if (!entry && !fsCode && (fallbackAll || !modulePath)) {
      const externalDicts = modulesList.filter((m) => !isInternalDictModule(m));
      const lookupRes = await lookupExactAcrossDictionaries(externalDicts, term, lookupOpts);
      if (seq !== renderSeq) return null;

      if (lookupRes && lookupRes.entry) {
        const foundPath = (lookupRes.module && lookupRes.module.path) || '';
        const entryWord = String(lookupRes.entry.word || lookupRes.matchedCode || term).trim();
        entry = {
          ...lookupRes.entry,
          modulePath: foundPath,
          sourceFileName: getModuleOriginLabel(lookupRes.module, foundPath),
          mappedFromCode: entryWord.toUpperCase() !== term.toUpperCase() ? term : ''
        };
        if (foundPath) {
          activeModulePath = foundPath;
          store.setActiveDictionary(foundPath, { silent: true });
        }
      }
    }
  }

  clearPendingLoadingTimer();

  // 3A. Fallback informativo caso seja código FS sem entrada no banco
  if (!entry && fsCode && !silentNotFound) {
    entry = {
      word: fsCode,
      html: formatFsFallbackHtml(fsCode, sourceModulePath || modulePath || activeModulePath),
      raw: '',
      modulePath: sourceModulePath || modulePath || activeModulePath,
      sourceFileName: getFileNameFromPath(sourceModulePath || modulePath || activeModulePath)
    };
  }

  // 3B. Fallback analítico em português caso seja código UGNT raro ausente nos dicionários .dct
  if (!entry && isUgnt && !silentNotFound) {
    const morphHtml = buildUgntMorphFallbackHtml(term, expandMorphologyLookupCandidates(term));
    if (morphHtml) {
      entry = {
        word: term,
        html: morphHtml,
        raw: '',
        modulePath: '',
        sourceFileName: 'Decodificador morfológico (UGNT)',
        isSyntheticMorph: true
      };
    }
  }

  if (!entry) {
    if (!silentNotFound) {
      const searchedAll = Boolean(fallbackAll && !modulePath);
      const targetName = getModuleOriginLabel(targetMod, modulePath || activeModulePath) || 'módulo selecionado';
      const notFoundMsg = searchedAll
        ? `Não foi encontrado verbete para "${term}" nos dicionários carregados.`
        : `Não foi encontrado verbete para "${term}" em ${targetName}.`;

      if (store.getActiveMode() === 'dictionary') {
        renderEmpty({
          title: 'Verbete não encontrado',
          message: notFoundMsg,
          showSourcesButton: false
        });
      } else {
        callbacks.onToast(`Verbete "${term}" não encontrado.`);
      }
      emitMetaChange();
    }
    return null;
  }

  currentQuery = entry.word || term;

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
    renderEntry({ resetScroll: true });
  } else {
    emitMetaChange();
  }
  return entry;
}

export async function stepDictionaryEntry(delta) {
  const active = getActiveModule();
  if (!active) return;

  const curWord = currentEntry && !currentEntry.isSyntheticMorph ? currentEntry.word : currentQuery;
  try {
    const nextEntry = await fetchAdjacentEntryForModule(active, curWord, Number(delta) || 1);
    if (nextEntry) {
      currentEntry = nextEntry;
      currentQuery = nextEntry.word || currentQuery;
      if (store.getActiveMode() === 'dictionary') {
        renderEntry({ resetScroll: true });
      } else {
        emitMetaChange();
      }
    } else {
      callbacks.onToast(Number(delta) < 0 ? 'Já está no primeiro verbete.' : 'Já está no último verbete.');
    }
  } catch (err) {
    appLogger.warn('DICT_STEP', 'Falha ao navegar entre verbetes do dicionário', err);
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

  if (currentEntry && (currentEntry.modulePath === active.path || currentEntry.isSyntheticMorph)) {
    renderEntry({ resetScroll: false });
    return;
  }

  const targetTerm = currentQuery || currentFilterTerm || '';
  if (targetTerm) {
    const found = await openDictionaryEntry(targetTerm, {
      modulePath: active.path,
      sourceModulePath: isInternalDictModule(active) ? active.path : '',
      pushHistory: false,
      fallbackAll: false,
      directWord: true,
      silentNotFound: true
    });
    if (found) return;
  }

  try {
    const first = await fetchFirstEntryForModule(active);
    if (first) {
      currentEntry = first;
      currentQuery = first.word || '';
      renderEntry({ resetScroll: true });
      return;
    }
  } catch (err) {
    appLogger.warn('DICT_FIRST', 'Falha ao carregar primeiro verbete do dicionário', err);
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
  {
    matchedWord = '',
    keepTerm = true,
    keepFilterTerm = false,
    clearFilter = false,
    pushHistory = true,
    render = true
  } = {}
) {
  if (!modulePath) return;
  activeModulePath = modulePath;
  store.setActiveDictionary(modulePath, { silent: true });
  if (clearFilter) currentFilterTerm = '';
  currentEntry = null;

  const modObj = modulesList.find((m) => m.path === modulePath) || { path: modulePath };
  const termToOpen = matchedWord || (keepTerm ? (currentQuery || currentFilterTerm) : '');

  if (termToOpen) {
    const opened = await openDictionaryEntry(termToOpen, {
      modulePath,
      sourceModulePath: isInternalDictModule(modObj) ? modulePath : '',
      matchedWord,
      keepFilterTerm,
      pushHistory,
      fallbackAll: false,
      directWord: Boolean(matchedWord),
      silentNotFound: !matchedWord
    });

    if (opened) return;

    // Se o usuário trocou de dicionário e o termo anterior não existe no novo dicionário,
    // abre diretamente o início do novo dicionário sem ficar travado.
    if (!matchedWord) {
      currentQuery = '';
      if (render && store.getActiveMode() === 'dictionary') {
        callbacks.onToast(`"${termToOpen}" não existe em ${getModuleOriginLabel(modObj, modulePath)}.`);
        await loadFirstOrCurrentEntry();
      } else {
        emitMetaChange();
      }
      return;
    }
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

export function renderDictionaryView({ resetScroll = true } = {}) {
  renderEntry({ resetScroll });
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
        const upperQ = cleanQ.toUpperCase();
        const sql = cleanQ
          ? 'SELECT word FROM dictionary WHERE UPPER(TRIM(word)) LIKE ? ORDER BY CASE WHEN UPPER(TRIM(word)) LIKE ? THEN 0 ELSE 1 END, LENGTH(word) ASC, UPPER(TRIM(word)) ASC, word ASC LIMIT 120'
          : 'SELECT word FROM dictionary ORDER BY UPPER(TRIM(word)) ASC, word ASC LIMIT 120';
        const params = cleanQ ? [`%${upperQ}%`, `${upperQ}%`] : [];
        const rows = extractRows(await nativeBridge.queryModule(active.path, sql, params));
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

function bindReaderEvents() {
  if (readerEventsBound) return;
  const container = document.getElementById('reader-content');
  if (!container) return;
  readerEventsBound = true;

  container.addEventListener('click', (ev) => {
    if (store.getActiveMode() !== 'dictionary') return;

    const imgEl = ev.target.closest('img.dct-img');
    if (imgEl && !imgEl.classList.contains('is-loading') && (imgEl.currentSrc || imgEl.src)) {
      ev.stopPropagation();
      openImageLightbox(imgEl.currentSrc || imgEl.src, imgEl.alt || (currentEntry ? currentEntry.word : ''));
      return;
    }

    const fnBtn = ev.target.closest('.v-fn-btn');
    if (fnBtn && currentEntry && Array.isArray(currentEntry.footnotes)) {
      ev.stopPropagation();
      const fnIdx = Number(fnBtn.getAttribute('data-fn-idx'));
      const noteText = currentEntry.footnotes[fnIdx];
      if (noteText) {
        callbacks.onOpenFootnote(currentEntry.word || 'Nota', noteText);
      }
      return;
    }

    const bibleLink = ev.target.closest('[data-bible-ref]');
    if (bibleLink) {
      ev.preventDefault();
      ev.stopPropagation();
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
        ev.preventDefault();
        ev.stopPropagation();
        const active = getActiveModule();
        openDictionaryEntry(term, {
          moduleHint: modHint,
          sourceModulePath: active ? active.path : '',
          pushHistory: true,
          fallbackAll: true
        });
      }
      return;
    }

    const fsTag = ev.target.closest('[data-fs], [data-fl], [data-figure], fl');
    if (fsTag) {
      const code = extractFsCodeFromElement(fsTag);
      if (code) {
        ev.stopPropagation();
        const active = getActiveModule();
        openDictionaryEntry(code, {
          moduleHint: 'fs',
          sourceModulePath: active ? active.path : '',
          pushHistory: true,
          fallbackAll: true
        });
        return;
      }
    }

    const strongEl = ev.target.closest('[data-strong]');
    if (strongEl && strongEl.dataset.strong) {
      ev.stopPropagation();
      openDictionaryEntry(strongEl.dataset.strong, {
        moduleHint: 'strong',
        pushHistory: true,
        fallbackAll: true
      });
      return;
    }

    const morphEl = ev.target.closest('[data-morph]');
    if (morphEl && morphEl.dataset.morph) {
      ev.stopPropagation();
      openDictionaryEntry(morphEl.dataset.morph, {
        moduleHint: 'morph',
        pushHistory: true,
        fallbackAll: true
      });
      return;
    }

    const lnEl = ev.target.closest('[data-ln]');
    if (lnEl && lnEl.dataset.ln) {
      const firstDomain = String(lnEl.dataset.ln).split(',')[0].trim();
      if (firstDomain) {
        ev.stopPropagation();
        openDictionaryEntry(firstDomain, {
          moduleHint: 'louw',
          pushHistory: true,
          fallbackAll: true
        });
      }
      return;
    }

    const bdbEl = ev.target.closest('[data-bdb]');
    if (bdbEl && bdbEl.dataset.bdb) {
      ev.stopPropagation();
      openDictionaryEntry(bdbEl.dataset.bdb, {
        moduleHint: 'bdb',
        pushHistory: true,
        fallbackAll: true
      });
      return;
    }

    const twotEl = ev.target.closest('[data-twot]');
    if (twotEl && twotEl.dataset.twot) {
      ev.stopPropagation();
      openDictionaryEntry(twotEl.dataset.twot, {
        moduleHint: 'twot',
        pushHistory: true,
        fallbackAll: true
      });
      return;
    }

    const gkEl = ev.target.closest('[data-gk], [data-hgk]');
    if (gkEl) {
      const code = gkEl.dataset.gk || gkEl.dataset.hgk || '';
      if (code) {
        ev.stopPropagation();
        openDictionaryEntry(code, {
          moduleHint: 'gk',
          pushHistory: true,
          fallbackAll: true
        });
      }
    }
  });
}

export function initDictionaryView(opts = {}) {
  callbacks = { ...callbacks, ...opts };
  ensureCompanionStyles();
  bindReaderEvents();
  syncDictionaryModules(store.getDictionaries());
}
