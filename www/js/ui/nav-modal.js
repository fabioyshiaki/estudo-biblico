import { nativeBridge } from '../bridge/native-bridge.js';
import { store } from '../core/store.js';
import { eventBus, EVENTS } from '../core/events.js';
import { getBookMeta } from '../core/canon.js';
import { loadBooksForBible, loadChaptersForBible } from './reader-view.js';
import {
  normalizeLookupTerm,
  normalizeDictSearchOptions
} from '../formats/mysword-dictionary.js';
import {
  findDictionariesWithTerm,
  getCachedDictionariesWithTerm
} from '../formats/dictionary-lookup.js';

let activeKeyHandler = null;
let activeCleanup = null;

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeSearch(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function matchesModuleQuery(mod, terms) {
  if (!terms.length) return true;
  const haystack = normalizeSearch(
    `${mod.abbr || ''} ${mod.title || ''} ${mod.language || ''} ${mod.fileName || ''}`
  );
  return terms.every((term) => haystack.includes(term));
}

function buildCompactFilterSummary(opts) {
  const tags = [];
  if (opts.matchMode === 'exact') tags.push('Exata');
  else if (opts.matchMode === 'startsWith') tags.push('Início');
  if (opts.accentSensitive) tags.push('Acento');
  if (opts.caseSensitive) tags.push('Aa');
  if (opts.searchBody) tags.push('No texto');
  if (!opts.searchAltWords) tags.push('Sem sinôn.');
  if (opts.exactPhrase) tags.push('Frase');
  if (opts.favoritesOnly) tags.push('Favoritos ★');
  return tags.join(' · ');
}

function scrollChildToTop(scrollContainer, targetEl, extraTopOffset = 12) {
  if (!scrollContainer || !targetEl) return;
  const containerRect = scrollContainer.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  const nextTop = scrollContainer.scrollTop + (targetRect.top - containerRect.top) - extraTopOffset;
  scrollContainer.scrollTop = Math.max(0, Math.round(nextTop));
}

export function closeModal() {
  if (typeof activeCleanup === 'function') {
    try {
      activeCleanup();
    } catch (err) {
      // Ignora erro na limpeza do modal anterior
    }
    activeCleanup = null;
  }

  const root = document.getElementById('modal-root');
  if (root) {
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '';
  }
  if (activeKeyHandler) {
    window.removeEventListener('keydown', activeKeyHandler);
    activeKeyHandler = null;
  }
}

export function openModalShell({ title, tabsHtml = '' }) {
  closeModal();

  const root = document.getElementById('modal-root');
  if (!root) return null;

  root.innerHTML = `
    <div class="modal-backdrop" data-close-backdrop="true">
      <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="modal-header">
          <h2 class="modal-title">${escapeHtml(title)}</h2>
          <button type="button" class="modal-close" data-close-modal="true" aria-label="Fechar">&times;</button>
        </div>
        ${tabsHtml ? `<div class="modal-tabs">${tabsHtml}</div>` : ''}
        <div class="modal-body" id="modal-body"></div>
      </div>
    </div>
  `;

  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');

  root.querySelector('[data-close-backdrop]')?.addEventListener('click', (ev) => {
    if (ev.target && ev.target.dataset && ev.target.dataset.closeBackdrop) {
      closeModal();
    }
  });
  root.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);

  activeKeyHandler = (ev) => {
    if (ev.key === 'Escape') closeModal();
  };
  window.addEventListener('keydown', activeKeyHandler);

  return {
    root,
    sheet: root.querySelector('.modal-sheet'),
    body: root.querySelector('#modal-body')
  };
}

export function openFootnoteModal(refLabel, text) {
  const modal = openModalShell({ title: `Nota — ${refLabel}` });
  if (!modal || !modal.body) return;

  modal.body.innerHTML = `<div class="footnote-box">${escapeHtml(text)}</div>`;
}

function openModulePickerModal({
  title,
  emptyTitle,
  emptyDesc,
  unitLabel,
  getList,
  getActive,
  onSelect,
  onOpenSources
}) {
  const modal = openModalShell({ title });
  if (!modal || !modal.body) return;

  if (!getList().length) {
    modal.body.innerHTML = `
      <div class="empty-state">
        <h2>${escapeHtml(emptyTitle)}</h2>
        <p>${escapeHtml(emptyDesc)}</p>
        <button type="button" class="primary-btn" id="btn-go-sources">Configurar Fontes</button>
      </div>
    `;
    modal.body.querySelector('#btn-go-sources')?.addEventListener('click', () => {
      closeModal();
      if (onOpenSources) onOpenSources();
    });
    return;
  }

  let searchQuery = '';

  modal.body.innerHTML = `
    <div class="picker-search-wrap" id="mod-search-wrap">
      <div class="search-input-box">
        <input
          type="search"
          id="mod-search-input"
          class="search-input"
          placeholder="Buscar por abreviação, descrição ou arquivo..."
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
        />
        <button type="button" id="mod-search-clear" class="search-clear-btn hidden" aria-label="Limpar busca">&times;</button>
      </div>
      <div class="picker-meta" id="mod-picker-meta"></div>
    </div>
    <div class="module-list" id="mod-picker-list"></div>
    <div style="margin-top: 14px; display: flex; justify-content: flex-end;">
      <button type="button" class="secondary-btn" id="btn-manage-sources">Gerenciar fontes</button>
    </div>
  `;

  const searchWrap = modal.body.querySelector('#mod-search-wrap');
  const inputEl = modal.body.querySelector('#mod-search-input');
  const clearBtn = modal.body.querySelector('#mod-search-clear');
  const metaEl = modal.body.querySelector('#mod-picker-meta');
  const listEl = modal.body.querySelector('#mod-picker-list');

  function scrollActiveToTop() {
    window.requestAnimationFrame(() => {
      const activeRow = listEl && listEl.querySelector('.module-row.active');
      if (!activeRow) return;
      const stickyOffset = (searchWrap ? searchWrap.offsetHeight : 0) + 8;
      scrollChildToTop(modal.body, activeRow, stickyOffset);
    });
  }

  function renderRows() {
    const items = getList();
    const active = getActive();
    const sortBy = store.getPrefs().bibleSortBy === 'title' ? 'title' : 'abbr';
    const sortLabel = sortBy === 'title' ? 'Descrição' : 'Abreviação';

    const norm = normalizeSearch(searchQuery);
    const terms = norm ? norm.split(/\s+/).filter(Boolean) : [];
    const filtered = items.filter((m) => matchesModuleQuery(m, terms));

    clearBtn?.classList.toggle('hidden', !searchQuery.length);

    if (metaEl) {
      metaEl.textContent = terms.length
        ? `${filtered.length} de ${items.length} ${unitLabel} • Ordem: ${sortLabel}`
        : `${items.length} ${unitLabel} • Ordem: ${sortLabel}`;
    }

    if (!listEl) return;

    if (!filtered.length) {
      listEl.innerHTML = `<div class="picker-empty">Nenhum módulo encontrado para "${escapeHtml(searchQuery.trim())}".</div>`;
      return;
    }

    listEl.innerHTML = filtered.map((m) => {
      const isActive = active && active.path === m.path;
      const mainLabel = sortBy === 'title' ? (m.title || m.abbr) : (m.abbr || m.title);
      const secondaryLabel = sortBy === 'title' ? (m.abbr || '') : (m.title || '');
      const extraMeta = [m.language, m.hasStrongs ? 'Strong' : ''].filter(Boolean).join(' • ');
      const fileLine = [m.fileName, extraMeta].filter(Boolean).join(' • ');

      return `
        <div class="module-row ${isActive ? 'active' : ''}">
          <button type="button" class="row-main" data-select-path="${escapeHtml(m.path)}">
            <div class="row-title">${escapeHtml(mainLabel)}</div>
            ${secondaryLabel ? `<div class="row-sub">${escapeHtml(secondaryLabel)}</div>` : ''}
            ${fileLine ? `<div class="row-file">${escapeHtml(fileLine)}</div>` : ''}
          </button>
          <button
            type="button"
            class="fav-btn ${m.isFavorite ? 'is-fav' : ''}"
            data-fav-id="${m.id}"
            data-fav-next="${m.isFavorite ? '0' : '1'}"
            aria-label="Favoritar módulo"
          >${m.isFavorite ? '&#9733;' : '&#9734;'}</button>
        </div>
      `;
    }).join('');
  }

  inputEl?.addEventListener('input', (ev) => {
    searchQuery = ev.target.value || '';
    renderRows();
    if (searchQuery.trim()) {
      modal.body.scrollTop = 0;
    } else {
      scrollActiveToTop();
    }
  });

  clearBtn?.addEventListener('click', () => {
    searchQuery = '';
    if (inputEl) {
      inputEl.value = '';
      inputEl.focus();
    }
    renderRows();
    scrollActiveToTop();
  });

  listEl?.addEventListener('click', async (ev) => {
    const favBtn = ev.target.closest('[data-fav-id]');
    if (favBtn) {
      try {
        const res = await nativeBridge.setModuleFavorite(
          Number(favBtn.dataset.favId),
          favBtn.dataset.favNext === '1'
        );
        if (res && Array.isArray(res.modules)) {
          store.setModulesOnly(res.modules);
        }
        renderRows();
      } catch (err) {
        eventBus.emit(EVENTS.TOAST, err.message || 'Erro ao favoritar módulo.');
      }
      return;
    }

    const selectBtn = ev.target.closest('[data-select-path]');
    if (selectBtn) {
      onSelect(selectBtn.dataset.selectPath);
      closeModal();
    }
  });

  modal.body.querySelector('#btn-manage-sources')?.addEventListener('click', () => {
    closeModal();
    if (onOpenSources) onOpenSources();
  });

  renderRows();
  scrollActiveToTop();
}

export function openBiblePickerModal({ onOpenSources } = {}) {
  openModulePickerModal({
    title: 'Selecionar Bíblia',
    emptyTitle: 'Nenhuma Bíblia registrada',
    emptyDesc: 'Adicione um arquivo .bbl.mybible ou uma pasta em Configurações → Fontes.',
    unitLabel: 'Bíblia(s)',
    getList: () => store.getBibles(),
    getActive: () => store.getActiveBible(),
    onSelect: (path) => store.setActiveModule(path),
    onOpenSources
  });
}

export function openDictionaryPickerModal({
  onOpenSources,
  filterTerm = '',
  searchBody = false,
  searchOptions = null,
  onSelectDictionary = null
} = {}) {
  const cleanFilter = normalizeLookupTerm(filterTerm);
  const effectiveSearchOpts = normalizeDictSearchOptions(
    searchOptions ? searchOptions : { searchBody }
  );

  // Sem termo pesquisado: exibe todos os dicionários normalmente
  if (!cleanFilter) {
    openModulePickerModal({
      title: 'Selecionar Dicionário',
      emptyTitle: 'Nenhum Dicionário registrado',
      emptyDesc: 'Adicione um arquivo .dct.mybible ou uma pasta em Configurações → Fontes.',
      unitLabel: 'Dicionário(s)',
      getList: () => store.getDictionaries(),
      getActive: () => store.getActiveDictionary(),
      onSelect: (path) => {
        if (typeof onSelectDictionary === 'function') {
          onSelectDictionary(path, { matchedWord: '', keepFilterTerm: false });
        } else {
          store.setActiveDictionary(path);
        }
      },
      onOpenSources
    });
    return;
  }

  const allDictsInitial = store.getDictionaries();
  const modal = openModalShell({ title: `Dicionários — "${cleanFilter}"` });
  if (!modal || !modal.body) return;

  if (!allDictsInitial.length) {
    modal.body.innerHTML = `
      <div class="empty-state">
        <h2>Nenhum Dicionário registrado</h2>
        <p>Adicione um arquivo .dct.mybible ou uma pasta em Configurações → Fontes.</p>
        <button type="button" class="primary-btn" id="btn-go-sources">Configurar Fontes</button>
      </div>
    `;
    modal.body.querySelector('#btn-go-sources')?.addEventListener('click', () => {
      closeModal();
      if (onOpenSources) onOpenSources();
    });
    return;
  }

  const targetPoolInitial = effectiveSearchOpts.favoritesOnly
    ? allDictsInitial.filter((m) => m.isFavorite)
    : allDictsInitial;
  const activeFilterSummary = buildCompactFilterSummary(effectiveSearchOpts);

  let searchQuery = '';
  let filterEnabled = true;
  let scanController = null;
  let scanDone = 0;
  let scanTotal = targetPoolInitial.length;
  let isScanning = false;
  let matchedEntries = [];

  const cachedMatches = getCachedDictionariesWithTerm(
    allDictsInitial,
    cleanFilter,
    effectiveSearchOpts
  );
  if (cachedMatches) {
    matchedEntries = cachedMatches;
    scanDone = scanTotal;
    isScanning = false;
  } else if (scanTotal === 0) {
    matchedEntries = [];
    scanDone = 0;
    isScanning = false;
  } else {
    isScanning = true;
  }

  modal.body.innerHTML = `
    <div class="picker-search-wrap" id="mod-search-wrap">
      <div class="search-input-box">
        <input
          type="search"
          id="mod-search-input"
          class="search-input"
          placeholder="Filtrar nome do dicionário..."
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
        />
        <button type="button" id="mod-search-clear" class="search-clear-btn hidden" aria-label="Limpar busca">&times;</button>
      </div>
      <div class="picker-meta" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <span id="mod-picker-meta"></span>
        <button type="button" class="secondary-btn" id="btn-toggle-dict-filter" style="padding:3px 10px;font-size:12px;min-height:28px;">
          Ver todos (${allDictsInitial.length})
        </button>
      </div>
      ${activeFilterSummary ? `<div class="picker-meta" id="mod-filter-summary" style="margin-top:2px;color:var(--accent);">Filtros: ${escapeHtml(activeFilterSummary)}</div>` : ''}
    </div>
    <div class="module-list" id="mod-picker-list"></div>
    <div style="margin-top: 14px; display: flex; justify-content: flex-end;">
      <button type="button" class="secondary-btn" id="btn-manage-sources">Gerenciar fontes</button>
    </div>
  `;

  const searchWrap = modal.body.querySelector('#mod-search-wrap');
  const inputEl = modal.body.querySelector('#mod-search-input');
  const clearBtn = modal.body.querySelector('#mod-search-clear');
  const metaEl = modal.body.querySelector('#mod-picker-meta');
  const summaryEl = modal.body.querySelector('#mod-filter-summary');
  const toggleFilterBtn = modal.body.querySelector('#btn-toggle-dict-filter');
  const listEl = modal.body.querySelector('#mod-picker-list');

  function scrollActiveToTop() {
    window.requestAnimationFrame(() => {
      const activeRow = listEl && listEl.querySelector('.module-row.active');
      if (!activeRow) return;
      const stickyOffset = (searchWrap ? searchWrap.offsetHeight : 0) + 8;
      scrollChildToTop(modal.body, activeRow, stickyOffset);
    });
  }

  function getFreshMatchedEntries() {
    const allDicts = store.getDictionaries();
    const byPath = new Map(allDicts.map((m) => [m.path, m]));
    const origOrder = new Map(allDicts.map((m, idx) => [m.path, idx]));
    const matchPriority = { exact: 0, prefix: 1, title: 2, body: 3 };

    return matchedEntries
      .map((item) => {
        const freshMod = byPath.get(item.module.path);
        if (!freshMod) return null;
        return {
          module: freshMod,
          word: item.word,
          matchType: item.matchType
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const favDiff = Number(Boolean(b.module.isFavorite)) - Number(Boolean(a.module.isFavorite));
        if (favDiff !== 0) return favDiff;
        const pa = matchPriority[a.matchType] ?? 9;
        const pb = matchPriority[b.matchType] ?? 9;
        if (pa !== pb) return pa - pb;
        return (origOrder.get(a.module.path) ?? 999999) - (origOrder.get(b.module.path) ?? 999999);
      });
  }

  function renderRows() {
    const allDicts = store.getDictionaries();
    const active = store.getActiveDictionary();
    const sortBy = store.getPrefs().bibleSortBy === 'title' ? 'title' : 'abbr';
    const sortLabel = sortBy === 'title' ? 'Descrição' : 'Abreviação';

    const freshMatches = getFreshMatchedEntries();
    const matchByPath = new Map(freshMatches.map((item) => [item.module.path, item]));
    const baseItems = filterEnabled ? freshMatches.map((item) => item.module) : allDicts;

    const norm = normalizeSearch(searchQuery);
    const terms = norm ? norm.split(/\s+/).filter(Boolean) : [];
    const filtered = baseItems.filter((m) => matchesModuleQuery(m, terms));

    clearBtn?.classList.toggle('hidden', !searchQuery.length);

    if (summaryEl) {
      summaryEl.classList.toggle('hidden', !filterEnabled);
    }

    if (toggleFilterBtn) {
      toggleFilterBtn.textContent = filterEnabled
        ? `Ver todos (${allDicts.length})`
        : `Só com "${cleanFilter}"`;
    }

    if (metaEl) {
      if (filterEnabled) {
        if (isScanning) {
          metaEl.textContent = `Verificando ${scanDone}/${scanTotal} • ${freshMatches.length} com "${cleanFilter}"`;
        } else {
          const hiddenCount = Math.max(0, allDicts.length - freshMatches.length);
          metaEl.textContent = terms.length
            ? `${filtered.length} de ${freshMatches.length} com "${cleanFilter}"`
            : `${freshMatches.length} com "${cleanFilter}" (${hiddenCount} oculto(s))`;
        }
      } else {
        metaEl.textContent = terms.length
          ? `${filtered.length} de ${allDicts.length} Dicionário(s) • Ordem: ${sortLabel}`
          : `${allDicts.length} Dicionário(s) • Ordem: ${sortLabel}`;
      }
    }

    if (!listEl) return;

    if (!filtered.length) {
      if (filterEnabled && isScanning) {
        listEl.innerHTML = `<div class="picker-empty">Procurando "${escapeHtml(cleanFilter)}" nos dicionários (${scanDone}/${scanTotal})...</div>`;
        return;
      }
      if (filterEnabled && !terms.length) {
        const emptyMsg = effectiveSearchOpts.favoritesOnly && scanTotal === 0
          ? 'Nenhum dicionário marcado como favorito.'
          : `Nenhum dicionário possui "${escapeHtml(cleanFilter)}" com os filtros ativos.`;
        listEl.innerHTML = `
          <div class="picker-empty">
            <p style="margin:0 0 10px;">${emptyMsg}</p>
            <button type="button" class="secondary-btn" id="btn-show-all-empty">Mostrar todos os dicionários</button>
          </div>
        `;
        listEl.querySelector('#btn-show-all-empty')?.addEventListener('click', () => {
          filterEnabled = false;
          renderRows();
          scrollActiveToTop();
        });
        return;
      }
      listEl.innerHTML = `<div class="picker-empty">Nenhum dicionário encontrado para "${escapeHtml(searchQuery.trim())}".</div>`;
      return;
    }

    const matchLabels = {
      exact: 'Exato',
      prefix: 'Início',
      title: 'Título',
      body: 'No texto'
    };

    listEl.innerHTML = filtered.map((m) => {
      const isActive = active && active.path === m.path;
      const mainLabel = sortBy === 'title' ? (m.title || m.abbr) : (m.abbr || m.title);
      const secondaryLabel = sortBy === 'title' ? (m.abbr || '') : (m.title || '');
      const matchInfo = filterEnabled ? matchByPath.get(m.path) : null;
      const matchLine = matchInfo
        ? `Verbete: ${matchInfo.word} (${matchLabels[matchInfo.matchType] || 'Encontrado'})`
        : '';
      const extraMeta = [m.language, m.hasStrongs ? 'Strong' : ''].filter(Boolean).join(' • ');
      const fileLine = [m.fileName, extraMeta].filter(Boolean).join(' • ');

      return `
        <div class="module-row ${isActive ? 'active' : ''}">
          <button type="button" class="row-main" data-select-path="${escapeHtml(m.path)}">
            <div class="row-title">${escapeHtml(mainLabel)}</div>
            ${secondaryLabel ? `<div class="row-sub">${escapeHtml(secondaryLabel)}</div>` : ''}
            ${matchLine ? `<div class="row-file" style="color:var(--accent);font-weight:600;">${escapeHtml(matchLine)}</div>` : ''}
            ${fileLine ? `<div class="row-file">${escapeHtml(fileLine)}</div>` : ''}
          </button>
          <button
            type="button"
            class="fav-btn ${m.isFavorite ? 'is-fav' : ''}"
            data-fav-id="${m.id}"
            data-fav-next="${m.isFavorite ? '0' : '1'}"
            aria-label="Favoritar módulo"
          >${m.isFavorite ? '&#9733;' : '&#9734;'}</button>
        </div>
      `;
    }).join('');
  }

  function startScanIfNeeded() {
    if (!isScanning) return;
    if (scanController) scanController.abort();
    scanController = new AbortController();
    const signal = scanController.signal;
    const active = store.getActiveDictionary();

    activeCleanup = () => {
      if (scanController) {
        scanController.abort();
        scanController = null;
      }
    };

    findDictionariesWithTerm(store.getDictionaries(), cleanFilter, {
      ...effectiveSearchOpts,
      activePath: active ? active.path : '',
      concurrency: 4,
      signal,
      onProgress: (done, total, partial) => {
        if (signal.aborted) return;
        scanDone = done;
        scanTotal = total;
        matchedEntries = partial;
        renderRows();
      }
    })
      .then((finalList) => {
        if (signal.aborted) return;
        isScanning = false;
        scanDone = scanTotal;
        matchedEntries = finalList;
        renderRows();
        if (!searchQuery.trim() && filterEnabled) {
          scrollActiveToTop();
        }
      })
      .catch(() => {
        if (signal.aborted) return;
        isScanning = false;
        renderRows();
      });
  }

  toggleFilterBtn?.addEventListener('click', () => {
    filterEnabled = !filterEnabled;
    renderRows();
    if (!searchQuery.trim()) {
      scrollActiveToTop();
    }
  });

  inputEl?.addEventListener('input', (ev) => {
    searchQuery = ev.target.value || '';
    renderRows();
    if (searchQuery.trim()) {
      modal.body.scrollTop = 0;
    } else {
      scrollActiveToTop();
    }
  });

  clearBtn?.addEventListener('click', () => {
    searchQuery = '';
    if (inputEl) {
      inputEl.value = '';
      inputEl.focus();
    }
    renderRows();
    scrollActiveToTop();
  });

  listEl?.addEventListener('click', async (ev) => {
    const favBtn = ev.target.closest('[data-fav-id]');
    if (favBtn) {
      try {
        const res = await nativeBridge.setModuleFavorite(
          Number(favBtn.dataset.favId),
          favBtn.dataset.favNext === '1'
        );
        if (res && Array.isArray(res.modules)) {
          store.setModulesOnly(res.modules);
        }
        renderRows();
      } catch (err) {
        eventBus.emit(EVENTS.TOAST, err.message || 'Erro ao favoritar módulo.');
      }
      return;
    }

    const selectBtn = ev.target.closest('[data-select-path]');
    if (selectBtn) {
      const selectedPath = selectBtn.dataset.selectPath;
      const freshMatches = getFreshMatchedEntries();
      const matchInfo = filterEnabled
        ? freshMatches.find((item) => item.module.path === selectedPath)
        : null;

      if (typeof onSelectDictionary === 'function') {
        onSelectDictionary(selectedPath, {
          matchedWord: matchInfo ? matchInfo.word : '',
          keepFilterTerm: Boolean(filterEnabled && matchInfo)
        });
      } else {
        store.setActiveDictionary(selectedPath);
      }
      closeModal();
    }
  });

  modal.body.querySelector('#btn-manage-sources')?.addEventListener('click', () => {
    closeModal();
    if (onOpenSources) onOpenSources();
  });

  renderRows();
  if (!isScanning) {
    scrollActiveToTop();
  } else {
    startScanIfNeeded();
  }
}

export async function openLocationPickerModal() {
  const bible = store.getActiveBible();
  if (!bible) {
    eventBus.emit(EVENTS.TOAST, 'Adicione uma Bíblia antes de navegar.');
    return;
  }

  const state = store.getState();
  let activeTab = 'books';
  let chosenBook = state.book;

  const modal = openModalShell({
    title: 'Ir para passagem',
    tabsHtml: `
      <button type="button" class="modal-tab active" data-loc-tab="books">Livros</button>
      <button type="button" class="modal-tab" data-loc-tab="chapters">Capítulos</button>
    `
  });
  if (!modal || !modal.body) return;

  const books = await loadBooksForBible(bible);
  if (!books.length) {
    modal.body.innerHTML = '<p>Nenhum livro encontrado neste módulo.</p>';
    return;
  }
  if (!books.includes(chosenBook)) {
    chosenBook = books[0];
  }

  function syncTabs() {
    modal.sheet.querySelectorAll('[data-loc-tab]').forEach((el) => {
      el.classList.toggle('active', el.dataset.locTab === activeTab);
    });
  }

  function scrollActiveChipToTop() {
    window.requestAnimationFrame(() => {
      const activeChip = modal.body.querySelector('.grid-chip.active');
      if (activeChip) {
        scrollChildToTop(modal.body, activeChip, 12);
      } else {
        modal.body.scrollTop = 0;
      }
    });
  }

  function renderBooks() {
    const groups = [
      { key: 'AT', label: 'Antigo Testamento', items: [] },
      { key: 'NT', label: 'Novo Testamento', items: [] },
      { key: 'DC', label: 'Deuterocanônicos', items: [] },
      { key: 'OUTRO', label: 'Outros livros', items: [] }
    ];

    for (const bookId of books) {
      const meta = getBookMeta(bookId);
      const group = groups.find((g) => g.key === meta.testament) || groups[3];
      group.items.push(meta);
    }

    const html = groups
      .filter((g) => g.items.length > 0)
      .map((g) => `
        <div class="section-label">${escapeHtml(g.label)}</div>
        <div class="book-grid">
          ${g.items.map((b) => `
            <button type="button" class="grid-chip ${b.id === chosenBook ? 'active' : ''}" data-pick-book="${b.id}">
              ${escapeHtml(b.name)}
            </button>
          `).join('')}
        </div>
      `).join('');

    modal.body.innerHTML = html;
    modal.body.querySelectorAll('[data-pick-book]').forEach((btn) => {
      btn.addEventListener('click', () => {
        chosenBook = Number(btn.dataset.pickBook);
        activeTab = 'chapters';
        syncTabs();
        renderChapters();
      });
    });

    scrollActiveChipToTop();
  }

  async function renderChapters() {
    modal.body.innerHTML = '<p>Carregando capítulos...</p>';
    const chapters = await loadChaptersForBible(bible, chosenBook);
    const meta = getBookMeta(chosenBook);

    modal.body.innerHTML = `
      <div class="section-label">${escapeHtml(meta.name)} (${chapters.length} capítulos)</div>
      <div class="chapter-grid">
        ${chapters.map((ch) => `
          <button type="button" class="grid-chip ${chosenBook === state.book && ch === state.chapter ? 'active' : ''}" data-pick-chapter="${ch}">
            ${ch}
          </button>
        `).join('')}
      </div>
    `;

    modal.body.querySelectorAll('[data-pick-chapter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.setLocation(chosenBook, Number(btn.dataset.pickChapter));
        closeModal();
      });
    });

    scrollActiveChipToTop();
  }

  modal.sheet.querySelectorAll('[data-loc-tab]').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      activeTab = tabBtn.dataset.locTab;
      syncTabs();
      if (activeTab === 'books') renderBooks();
      else renderChapters();
    });
  });

  renderBooks();
}
