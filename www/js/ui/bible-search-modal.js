import { closeModal } from './nav-modal.js';
import { store } from '../core/store.js';
import { eventBus, EVENTS } from '../core/events.js';
import { appLogger } from '../core/logger.js';
import {
  searchBibleModule,
  searchAcrossBibles
} from '../formats/bible-search.js';
import {
  searchCommentaryModule,
  searchAcrossCommentaries
} from '../formats/commentary-search.js';
import {
  searchDictionaryModule,
  searchAcrossDictionariesUnified
} from '../formats/dictionary-search.js';
import {
  ALL_MODULES_VALUE,
  FAV_MODULES_VALUE,
  SEARCH_KIND_META,
  normalizeSearchKind,
  escapeHtml,
  getDefaultOptionsForKind,
  normalizeOptionsForKind,
  loadUnifiedSearchOptions,
  saveUnifiedSearchOptions,
  loadUnifiedHistory,
  pushUnifiedHistory,
  clearUnifiedHistory,
  getModulesForKind,
  getActiveModuleForKind,
  getPreferredLabelForModule,
  syncScopeBooks,
  getHeaderTitleForSearch,
  getActiveFilterSummaryTags,
  buildKindTabsHtml,
  buildUnifiedFiltersHtml
} from './unified-search-config.js';

const RENDER_CHUNK = 80;

function createEmptySession() {
  return {
    query: '',
    targetVal: '',
    results: null,
    groupMode: 'book', // 'book' | 'module'
    selectedGroupVal: '',
    refineQuery: '',
    compactView: false,
    filtersCollapsed: false
  };
}

let sessionByKind = {
  bible: createEmptySession(),
  commentary: createEmptySession(),
  dictionary: createEmptySession()
};

function normalizeAscii(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

async function copyTextSafe(text) {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    // Segue para fallback abaixo
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch (err) {
    return false;
  }
}

export function clearBibleSearchSession() {
  sessionByKind = {
    bible: createEmptySession(),
    commentary: createEmptySession(),
    dictionary: createEmptySession()
  };
}

export function attachBibleSearchToLookupFab({ onSearchBible } = {}) {
  if (typeof document === 'undefined' || typeof onSearchBible !== 'function') return;
  const fab = document.getElementById('lookup-fab');
  if (!fab || fab.querySelector('#lookup-fab-search-bible')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'lookup-fab-search-bible';
  btn.className = 'lookup-fab-btn';
  btn.textContent = 'Na Bíblia';

  const dictOneBtn = fab.querySelector('#lookup-fab-one');
  if (dictOneBtn && dictOneBtn.parentNode === fab) {
    fab.insertBefore(btn, dictOneBtn);
  } else {
    fab.appendChild(btn);
  }

  btn.addEventListener('click', () => {
    const termEl = fab.querySelector('#lookup-fab-term');
    const term = termEl ? (termEl.textContent || '').trim() : '';
    if (!term) return;
    window.getSelection?.()?.removeAllRanges?.();
    fab.classList.add('hidden');
    onSearchBible(term);
  });
}

export function openUnifiedSearchModal({
  initialKind = '',
  initialQuery = '',
  autoRun = false,
  searchAll = false,
  onNavigateVerse = null,
  onNavigateCommentary = null,
  onNavigateDictionary = null,
  onOpenSources = null,
  onOpenLogs = null
} = {}) {
  closeModal();

  const root = document.getElementById('modal-root');
  if (!root) return;

  const curAppState = store.getState();
  let activeKind = normalizeSearchKind(initialKind || store.getActiveMode());

  const cleanInitial = String(initialQuery || '').trim();

  function resolveTargetValForKind(kind, preferredVal = '', forceAll = false) {
    const mods = getModulesForKind(kind);
    const activeMod = getActiveModuleForKind(kind) || mods[0] || null;
    if (forceAll) return ALL_MODULES_VALUE;
    if (preferredVal === ALL_MODULES_VALUE || preferredVal === FAV_MODULES_VALUE) {
      return preferredVal;
    }
    if (preferredVal && mods.some((m) => m.path === preferredVal)) {
      return preferredVal;
    }
    return activeMod ? activeMod.path : ALL_MODULES_VALUE;
  }

  function loadKindState(kind, { overrideQuery = '', forceAll = false, carryQuery = '' } = {}) {
    const k = normalizeSearchKind(kind);
    const sess = sessionByKind[k] || createEmptySession();
    const mods = getModulesForKind(k);

    const canReuse =
      !overrideQuery &&
      Boolean(sess.results) &&
      (
        sess.targetVal === ALL_MODULES_VALUE ||
        sess.targetVal === FAV_MODULES_VALUE ||
        mods.some((m) => m.path === sess.targetVal)
      );

    const loadedOpts = syncScopeBooks(loadUnifiedSearchOptions(k), curAppState.book);
    const nextQuery = overrideQuery || (canReuse ? sess.query : (carryQuery || sess.query || ''));
    const nextTargetVal = resolveTargetValForKind(
      k,
      canReuse ? sess.targetVal : '',
      forceAll
    );

    return {
      queryText: nextQuery,
      targetVal: nextTargetVal,
      opts: loadedOpts,
      filtersCollapsed: canReuse ? Boolean(sess.filtersCollapsed) : false,
      searchResult: canReuse ? sess.results : null,
      groupMode: canReuse ? (sess.groupMode || (k === 'dictionary' ? 'module' : 'book')) : (k === 'dictionary' ? 'module' : 'book'),
      selectedGroupVal: canReuse ? (sess.selectedGroupVal || '') : '',
      refineQuery: canReuse ? (sess.refineQuery || '') : '',
      compactView: canReuse ? Boolean(sess.compactView) : false,
      canReuse
    };
  }

  let initialLoaded = loadKindState(activeKind, {
    overrideQuery: cleanInitial,
    forceAll: Boolean(searchAll)
  });

  let queryText = initialLoaded.queryText;
  let targetVal = initialLoaded.targetVal;
  let opts = initialLoaded.opts;
  let filtersCollapsed = initialLoaded.filtersCollapsed;
  let auxDrawerMode = ''; // '' | 'history' | 'refine' | 'menu'
  let searchResult = initialLoaded.searchResult;
  let groupMode = initialLoaded.groupMode;
  let selectedGroupVal = initialLoaded.selectedGroupVal;
  let refineQuery = initialLoaded.refineQuery;
  let compactView = initialLoaded.compactView;
  let selectionMode = false;
  const checkedKeys = new Set();
  let focusedIdx = searchResult && searchResult.items && searchResult.items.length ? 0 : -1;
  let renderedCount = 0;
  let isSearching = false;
  let statusText = '';
  let errorText = '';
  let activeController = null;

  function abortOngoing() {
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
  }

  let keyHandler = null;

  function cleanupAndClose() {
    abortOngoing();
    persistSessionSnapshot();
    if (keyHandler) {
      window.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    closeModal();
  }

  keyHandler = (ev) => {
    if (ev.key === 'Escape') {
      cleanupAndClose();
    }
  };
  window.addEventListener('keydown', keyHandler);

  function isAlive() {
    return Boolean(document.getElementById('ms-search-backdrop'));
  }

  function getKindModules() {
    return getModulesForKind(activeKind);
  }

  function getKindActiveModule() {
    const mods = getKindModules();
    return getActiveModuleForKind(activeKind) || mods[0] || null;
  }

  function getSelectedModuleObj() {
    if (targetVal === ALL_MODULES_VALUE || targetVal === FAV_MODULES_VALUE) return null;
    const mods = getKindModules();
    return mods.find((m) => m.path === targetVal) || getKindActiveModule();
  }

  function isMultiModuleTarget() {
    return targetVal === ALL_MODULES_VALUE || targetVal === FAV_MODULES_VALUE;
  }

  function persistSessionSnapshot() {
    sessionByKind[activeKind] = {
      query: queryText,
      targetVal,
      results: searchResult,
      groupMode,
      selectedGroupVal,
      refineQuery,
      compactView,
      filtersCollapsed
    };
  }

  function getItemKey(item) {
    const p = item.module ? item.module.path : '';
    if (activeKind === 'dictionary') {
      return `${p}::W::${item.word || item.refLabel || ''}`;
    }
    if (activeKind === 'commentary') {
      return `${p}::C::${item.book}:${item.chapter}:${item.fromVerse || 0}:${item.toVerse || 0}`;
    }
    return `${p}::B::${item.book}:${item.chapter}:${item.verse}`;
  }

  function getFilteredItems() {
    if (!searchResult || !Array.isArray(searchResult.items)) return [];
    let list = searchResult.items;

    if (selectedGroupVal) {
      if (groupMode === 'module' || activeKind === 'dictionary') {
        list = list.filter((it) => it.module && it.module.path === selectedGroupVal);
      } else {
        const wantedBook = Number(selectedGroupVal) || 0;
        if (wantedBook > 0) {
          list = list.filter((it) => it.book === wantedBook);
        }
      }
    }

    const cleanRef = normalizeAscii(refineQuery).trim();
    if (cleanRef) {
      const terms = cleanRef.split(/\s+/).filter(Boolean);
      list = list.filter((it) => {
        const modName = it.module ? getPreferredLabelForModule(it.module, '') : '';
        const hay = normalizeAscii(`${it.refLabel || ''} ${it.altWords || ''} ${modName} ${it.plainText || ''}`);
        return terms.every((t) => hay.includes(t));
      });
    }

    return list;
  }

  function switchKind(nextKind) {
    const targetKind = normalizeSearchKind(nextKind);
    if (targetKind === activeKind) return;

    const qInput = document.getElementById('ms-query-input');
    if (qInput) queryText = qInput.value || '';

    abortOngoing();
    isSearching = false;
    errorText = '';
    statusText = '';
    auxDrawerMode = '';
    selectionMode = false;
    checkedKeys.clear();
    persistSessionSnapshot();

    const carriedQuery = queryText.trim();
    activeKind = targetKind;

    const loaded = loadKindState(activeKind, { carryQuery: carriedQuery });
    queryText = loaded.queryText;
    targetVal = loaded.targetVal;
    opts = loaded.opts;
    filtersCollapsed = loaded.filtersCollapsed;
    searchResult = loaded.searchResult;
    groupMode = loaded.groupMode;
    selectedGroupVal = loaded.selectedGroupVal;
    refineQuery = loaded.refineQuery;
    compactView = loaded.compactView;
    focusedIdx = searchResult && searchResult.items && searchResult.items.length ? 0 : -1;

    syncQueryBarUi();
    renderKindTabs();
    renderFiltersPanel();
    renderActiveSummaryBar();
    renderAuxDrawer();
    renderGroupBar();
    renderResults({ resetList: true });

    const scrollEl = document.getElementById('ms-results-scroll');
    if (scrollEl) scrollEl.scrollTop = 0;
  }

  function syncQueryBarUi() {
    const meta = SEARCH_KIND_META[activeKind];
    const titleEl = document.getElementById('ms-header-title');
    const qInput = document.getElementById('ms-query-input');
    const clearX = document.getElementById('ms-btn-clear-q');

    if (titleEl) {
      titleEl.textContent = getHeaderTitleForSearch(
        activeKind,
        targetVal,
        getKindModules(),
        getKindActiveModule()
      );
    }
    if (qInput) {
      qInput.value = queryText;
      qInput.placeholder = meta.placeholder;
    }
    if (clearX) {
      clearX.classList.toggle('hidden', !queryText.length);
    }
  }

  function renderKindTabs() {
    const tabsEl = document.getElementById('ms-kind-tabs');
    if (!tabsEl) return;
    tabsEl.innerHTML = buildKindTabsHtml(activeKind);
    tabsEl.querySelectorAll('[data-ms-kind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextKind = btn.getAttribute('data-ms-kind');
        if (nextKind) switchKind(nextKind);
      });
    });
  }

  function renderActiveSummaryBar() {
    const bar = document.getElementById('ms-active-summary-bar');
    if (!bar) return;

    if (!filtersCollapsed) {
      bar.classList.add('hidden');
      bar.innerHTML = '';
      return;
    }

    const tags = getActiveFilterSummaryTags(activeKind, opts);
    if (!tags.length) {
      bar.classList.add('hidden');
      bar.innerHTML = '';
      return;
    }

    bar.classList.remove('hidden');
    bar.innerHTML = tags.map((tag) => (
      `<button type="button" class="ms-summary-pill" data-ms-expand-filters="1">${escapeHtml(tag)}</button>`
    )).join('');

    bar.querySelectorAll('[data-ms-expand-filters]').forEach((btn) => {
      btn.addEventListener('click', () => {
        filtersCollapsed = false;
        persistSessionSnapshot();
        renderFiltersPanel();
        renderActiveSummaryBar();
      });
    });
  }

  function renderFiltersPanel() {
    const panel = document.getElementById('ms-filters-panel');
    const collapseBtn = document.getElementById('ms-btn-collapse');
    const footFilterBtn = document.getElementById('ms-foot-filters');
    const titleEl = document.getElementById('ms-header-title');

    const mods = getKindModules();
    if (titleEl) {
      titleEl.textContent = getHeaderTitleForSearch(activeKind, targetVal, mods, getKindActiveModule());
    }
    if (collapseBtn) collapseBtn.innerHTML = filtersCollapsed ? '+' : '&minus;';
    if (footFilterBtn) footFilterBtn.classList.toggle('is-active', !filtersCollapsed);
    if (!panel) return;

    panel.classList.toggle('hidden', filtersCollapsed);
    panel.innerHTML = buildUnifiedFiltersHtml({
      kind: activeKind,
      modules: mods,
      targetVal,
      opts
    });

    bindFilterEvents(panel);
    renderActiveSummaryBar();
  }

  function renderAuxDrawer() {
    const drawer = document.getElementById('ms-aux-drawer');
    const refineBtn = document.getElementById('ms-foot-refine');
    if (refineBtn) refineBtn.classList.toggle('is-active', auxDrawerMode === 'refine' || Boolean(refineQuery));
    if (!drawer) return;

    if (!auxDrawerMode) {
      drawer.classList.add('hidden');
      drawer.innerHTML = '';
      return;
    }

    drawer.classList.remove('hidden');

    if (auxDrawerMode === 'history') {
      const hist = loadUnifiedHistory(activeKind);
      if (!hist.length) {
        drawer.innerHTML = `<div class="ms-status-note" style="margin:0;">Nenhuma pesquisa recente em ${escapeHtml(SEARCH_KIND_META[activeKind].plural)}.</div>`;
        return;
      }
      drawer.innerHTML = `
        <div class="ms-aux-row">
          ${hist.map((h) => `<button type="button" class="ms-aux-chip" data-ms-hist="${escapeHtml(h)}">${escapeHtml(h)}</button>`).join('')}
          <button type="button" class="ms-aux-chip" id="ms-hist-clear" style="color:var(--ms-muted);">Limpar histórico</button>
        </div>
      `;
      drawer.querySelectorAll('[data-ms-hist]').forEach((btn) => {
        btn.addEventListener('click', () => {
          queryText = btn.getAttribute('data-ms-hist') || '';
          syncQueryBarUi();
          auxDrawerMode = '';
          renderAuxDrawer();
          runSearch();
        });
      });
      drawer.querySelector('#ms-hist-clear')?.addEventListener('click', () => {
        clearUnifiedHistory(activeKind);
        renderAuxDrawer();
      });
      return;
    }

    if (auxDrawerMode === 'refine') {
      drawer.innerHTML = `
        <div class="ms-field-inline" style="align-items:center;">
          <span class="ms-field-label" style="padding:0;">Filtrar resultados</span>
          <input
            type="search"
            class="ms-line-input"
            id="ms-refine-input"
            value="${escapeHtml(refineQuery)}"
            placeholder="Digite para filtrar os resultados listados..."
            autocomplete="off"
          />
          <button type="button" class="ms-aux-chip" id="ms-refine-clear">Limpar</button>
        </div>
      `;
      const refInput = drawer.querySelector('#ms-refine-input');
      refInput?.addEventListener('input', () => {
        refineQuery = refInput.value || '';
        focusedIdx = 0;
        persistSessionSnapshot();
        renderResults({ resetList: true });
      });
      drawer.querySelector('#ms-refine-clear')?.addEventListener('click', () => {
        refineQuery = '';
        if (refInput) refInput.value = '';
        focusedIdx = 0;
        persistSessionSnapshot();
        renderResults({ resetList: true });
      });
      refInput?.focus();
      return;
    }

    if (auxDrawerMode === 'menu') {
      drawer.innerHTML = `
        <div class="ms-aux-row">
          <button type="button" class="ms-aux-chip" id="ms-menu-reset">Restaurar padrões</button>
          <button type="button" class="ms-aux-chip" id="ms-menu-clear-res">Limpar resultados</button>
          <button type="button" class="ms-aux-chip" id="ms-menu-sources">Fontes (${escapeHtml(SEARCH_KIND_META[activeKind].plural)})</button>
          <button type="button" class="ms-aux-chip" id="ms-menu-logs">Abrir Logs</button>
        </div>
      `;
      drawer.querySelector('#ms-menu-reset')?.addEventListener('click', () => {
        opts = syncScopeBooks(getDefaultOptionsForKind(activeKind), curAppState.book);
        saveUnifiedSearchOptions(activeKind, opts);
        auxDrawerMode = '';
        renderFiltersPanel();
        renderAuxDrawer();
        if (!searchResult) renderResults({ resetList: true });
      });
      drawer.querySelector('#ms-menu-clear-res')?.addEventListener('click', () => {
        searchResult = null;
        selectedGroupVal = '';
        refineQuery = '';
        focusedIdx = -1;
        checkedKeys.clear();
        sessionByKind[activeKind] = createEmptySession();
        auxDrawerMode = '';
        renderAuxDrawer();
        renderGroupBar();
        renderResults({ resetList: true });
      });
      drawer.querySelector('#ms-menu-sources')?.addEventListener('click', () => {
        const currentKind = activeKind;
        cleanupAndClose();
        if (typeof onOpenSources === 'function') onOpenSources(currentKind);
      });
      drawer.querySelector('#ms-menu-logs')?.addEventListener('click', () => {
        cleanupAndClose();
        if (typeof onOpenLogs === 'function') onOpenLogs();
      });
    }
  }

  function renderGroupBar() {
    const bar = document.getElementById('ms-book-bar');
    if (!bar) return;

    if (isSearching || !searchResult || !Array.isArray(searchResult.items) || !searchResult.items.length) {
      bar.classList.add('hidden');
      bar.innerHTML = '';
      return;
    }

    const byBook = Array.isArray(searchResult.byBook) ? searchResult.byBook : [];
    const byModule = Array.isArray(searchResult.byModule) ? searchResult.byModule : [];

    const hasBooks = activeKind !== 'dictionary' && byBook.length > 1;
    const hasModules = byModule.length > 1;

    if (!hasBooks && !hasModules) {
      bar.classList.add('hidden');
      bar.innerHTML = '';
      return;
    }

    if (activeKind === 'dictionary') {
      groupMode = 'module';
    } else if (groupMode === 'module' && !hasModules) {
      groupMode = 'book';
    } else if (groupMode === 'book' && !hasBooks) {
      groupMode = 'module';
    }

    const toggleModeChip = (hasBooks && hasModules)
      ? `<button type="button" class="ms-book-chip" id="ms-toggle-group-mode" style="border-style:dashed;">${groupMode === 'book' ? 'Por módulo' : 'Por livro'}</button>`
      : '';

    const chipsHtml = groupMode === 'module'
      ? byModule.map((m) => {
          const lbl = getPreferredLabelForModule(m.module, 'Módulo');
          return `<button type="button" class="ms-book-chip${selectedGroupVal === m.path ? ' is-active' : ''}" data-ms-grp="${escapeHtml(m.path)}">${escapeHtml(lbl)} (${m.count})</button>`;
        }).join('')
      : byBook.map((b) => {
          const val = String(b.book);
          return `<button type="button" class="ms-book-chip${selectedGroupVal === val ? ' is-active' : ''}" data-ms-grp="${val}">${escapeHtml(b.name)} (${b.count})</button>`;
        }).join('');

    bar.classList.remove('hidden');
    bar.innerHTML =
      toggleModeChip +
      `<button type="button" class="ms-book-chip${selectedGroupVal === '' ? ' is-active' : ''}" data-ms-grp="">Todos (${searchResult.items.length})</button>` +
      chipsHtml;

    bar.querySelector('#ms-toggle-group-mode')?.addEventListener('click', () => {
      groupMode = groupMode === 'book' ? 'module' : 'book';
      selectedGroupVal = '';
      focusedIdx = 0;
      persistSessionSnapshot();
      renderGroupBar();
      renderResults({ resetList: true });
    });

    bar.querySelectorAll('[data-ms-grp]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextVal = btn.getAttribute('data-ms-grp') || '';
        if (nextVal === selectedGroupVal) return;
        selectedGroupVal = nextVal;
        focusedIdx = 0;
        persistSessionSnapshot();
        renderGroupBar();
        renderResults({ resetList: true });
        const scrollEl = document.getElementById('ms-results-scroll');
        if (scrollEl) scrollEl.scrollTop = 0;
      });
    });
  }

  function syncBottomBarState() {
    const filtered = getFilteredItems();
    const hasItems = filtered.length > 0 && !isSearching;

    const compactBtn = document.getElementById('ms-foot-compact');
    const selAllBtn = document.getElementById('ms-foot-select-all');
    const copyBtn = document.getElementById('ms-foot-copy');
    const openBtn = document.getElementById('ms-foot-open');
    const upBtn = document.getElementById('ms-foot-up');
    const downBtn = document.getElementById('ms-foot-down');
    const selBtn = document.getElementById('ms-foot-selection');
    const cancelBtn = document.getElementById('ms-foot-cancel');

    if (compactBtn) compactBtn.classList.toggle('is-active', compactView);
    if (selAllBtn) selAllBtn.disabled = !hasItems;
    if (copyBtn) copyBtn.disabled = !hasItems;

    const hasChecked = checkedKeys.size > 0;
    const canOpen = hasItems && (hasChecked || (focusedIdx >= 0 && focusedIdx < filtered.length));
    if (openBtn) {
      openBtn.disabled = !canOpen;
      openBtn.textContent = hasChecked ? `Abrir (${checkedKeys.size})` : 'Abrir Seleção';
    }
    if (upBtn) upBtn.disabled = !hasItems || focusedIdx <= 0;
    if (downBtn) downBtn.disabled = !hasItems || focusedIdx >= filtered.length - 1;
    if (selBtn) {
      selBtn.classList.toggle('is-active', selectionMode);
      selBtn.disabled = !hasItems;
    }
    if (cancelBtn) {
      cancelBtn.textContent = isSearching ? 'Parar' : 'Cancelar';
    }
  }

  function buildRowHtml(item, idx) {
    const key = getItemKey(item);
    const isChecked = checkedKeys.has(key);
    const isFocused = idx === focusedIdx;
    const showModBadge = isMultiModuleTarget() && Boolean(item.module);
    const meta = SEARCH_KIND_META[activeKind];

    const modBadge = showModBadge
      ? `<span class="bsearch-badge">${escapeHtml(getPreferredLabelForModule(item.module, meta.singular))}</span>`
      : '';

    const extraBadges = (Array.isArray(item.matchedBadges) ? item.matchedBadges : []).map((b) => {
      const isStrong = /^[GH]\d+/i.test(b);
      let cls = 'bsearch-badge';
      if (isStrong) cls += ' bsearch-badge--strong';
      else if (activeKind === 'commentary') cls += ' bsearch-badge--cmt';
      else if (activeKind === 'dictionary') cls += ' bsearch-badge--dict';
      return `<span class="${cls}">${escapeHtml(b)}</span>`;
    }).join('');

    const checkHtml = selectionMode
      ? `<input type="checkbox" class="ms-row-check" data-ms-check-idx="${idx}" ${isChecked ? 'checked' : ''} tabindex="-1" aria-label="Selecionar ${escapeHtml(item.refLabel)}" />`
      : '';

    const altSubHtml = activeKind === 'dictionary' && item.altWords
      ? `<div class="ms-row-sub">Sinônimos: ${escapeHtml(item.altWords)}</div>`
      : '';

    const dirAttr = item.isRtl ? ' dir="rtl"' : '';
    const rowCls = [
      'ms-result-row',
      isFocused ? 'is-focused' : '',
      selectionMode && isChecked ? 'is-checked' : ''
    ].filter(Boolean).join(' ');

    return (
      `<div class="${rowCls}" role="button" tabindex="0" data-ms-row-idx="${idx}">` +
        checkHtml +
        '<div class="ms-row-content">' +
          '<div class="ms-row-head">' +
            `<span class="ms-row-ref">${escapeHtml(item.refLabel)}</span>` +
            `<span class="ms-row-badges">${extraBadges}${modBadge}</span>` +
          '</div>' +
          altSubHtml +
          (item.snippetHtml ? `<div class="ms-row-text"${dirAttr}>${item.snippetHtml}</div>` : '') +
        '</div>' +
      '</div>'
    );
  }

  function renderResults({ resetList = true } = {}) {
    const container = document.getElementById('ms-results-container');
    if (!container) return;

    const mods = getKindModules();
    const meta = SEARCH_KIND_META[activeKind];

    if (!mods.length) {
      container.innerHTML = `
        <div class="ms-status-note"><strong>${escapeHtml(meta.emptyTitle)}.</strong> ${escapeHtml(meta.emptyDesc)}</div>
        <button type="button" class="primary-btn" id="ms-go-sources">Configurar Fontes</button>
      `;
      container.querySelector('#ms-go-sources')?.addEventListener('click', () => {
        const currentKind = activeKind;
        cleanupAndClose();
        if (typeof onOpenSources === 'function') onOpenSources(currentKind);
      });
      syncBottomBarState();
      return;
    }

    if (isSearching) {
      container.innerHTML = `
        <div class="ms-status-note" id="ms-progress-text">${escapeHtml(statusText || 'Pesquisando...')}</div>
      `;
      syncBottomBarState();
      return;
    }

    if (errorText) {
      container.innerHTML = `
        <div class="ms-status-note" style="color:var(--text-red-letter, #e05252);">${escapeHtml(errorText)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="secondary-btn" id="ms-err-logs">Abrir Logs</button>
        </div>
      `;
      container.querySelector('#ms-err-logs')?.addEventListener('click', () => {
        cleanupAndClose();
        if (typeof onOpenLogs === 'function') onOpenLogs();
      });
      syncBottomBarState();
      return;
    }

    if (!searchResult) {
      container.innerHTML = `
        <div class="ms-status-note">A pesquisa em ${escapeHtml(meta.plural)} é limitada a um resultado de ${escapeHtml(opts.limit)}.</div>
      `;
      syncBottomBarState();
      return;
    }

    const filtered = getFilteredItems();

    if (!filtered.length) {
      container.innerHTML = `
        <div class="ms-status-note">${escapeHtml(statusText || `Nenhum resultado encontrado para "${queryText}".`)}</div>
      `;
      syncBottomBarState();
      return;
    }

    if (focusedIdx < 0 || focusedIdx >= filtered.length) {
      focusedIdx = 0;
    }

    if (resetList) {
      renderedCount = Math.min(RENDER_CHUNK, filtered.length);
      const batch = filtered.slice(0, renderedCount);
      const occ = filtered.reduce((acc, it) => acc + (it.hitCount || 1), 0);

      const extraNotes = [];
      if (activeKind === 'dictionary') {
        const dictCount = new Set(filtered.map((it) => it.module && it.module.path).filter(Boolean)).size;
        if (dictCount > 1) extraNotes.push(`${dictCount} dicionários`);
      } else {
        const bookCount = new Set(filtered.map((it) => it.book).filter(Boolean)).size;
        if (bookCount > 0) extraNotes.push(`${bookCount} livro(s)`);
        if (activeKind === 'bible' && searchResult.intervalType === 'chapter') {
          extraNotes.push(`${searchResult.chapterCount || 0} cap.`);
        }
      }
      if (searchResult.autoStrong) extraNotes.push('Strong detectado');
      if (searchResult.truncated) extraNotes.push(`limite ${opts.limit} atingido`);
      const suffix = extraNotes.length ? ` · ${extraNotes.join(' · ')}` : '';

      container.innerHTML = `
        <div class="ms-status-note">
          <strong>${filtered.length}</strong> ${escapeHtml(meta.unitLabel)} · ${occ} ocorrência(s)${escapeHtml(suffix)}
        </div>
        <div class="ms-results-list${compactView ? ' is-compact' : ''}" id="ms-results-list">
          ${batch.map((it, idx) => buildRowHtml(it, idx)).join('')}
        </div>
        <div class="ms-more-wrap" id="ms-more-wrap"></div>
      `;

      bindResultsListEvents();
      updateMoreButton(filtered);
    } else {
      const listEl = document.getElementById('ms-results-list');
      if (!listEl) return;
      const nextEnd = Math.min(renderedCount + RENDER_CHUNK, filtered.length);
      if (nextEnd <= renderedCount) return;

      const nextBatch = filtered.slice(renderedCount, nextEnd);
      const chunkHtml = nextBatch.map((it, i) => buildRowHtml(it, renderedCount + i)).join('');
      renderedCount = nextEnd;
      listEl.insertAdjacentHTML('beforeend', chunkHtml);
      updateMoreButton(filtered);
    }

    syncBottomBarState();
  }

  function updateMoreButton(filtered) {
    const wrap = document.getElementById('ms-more-wrap');
    if (!wrap) return;
    if (renderedCount < filtered.length) {
      const rem = filtered.length - renderedCount;
      wrap.innerHTML = `<button type="button" class="secondary-btn" id="ms-btn-more">Mostrar mais (${rem} restante(s))</button>`;
      wrap.querySelector('#ms-btn-more')?.addEventListener('click', () => {
        renderResults({ resetList: false });
      });
    } else {
      wrap.innerHTML = '';
    }
  }

  function openItem(item) {
    if (!item) return;
    const kind = activeKind;
    const modPath = item.module ? item.module.path : (getKindActiveModule() ? getKindActiveModule().path : '');
    const currentQuery = queryText;
    const currentOpts = { ...opts };

    cleanupAndClose();

    if (kind === 'dictionary') {
      if (typeof onNavigateDictionary === 'function') {
        onNavigateDictionary({
          modulePath: modPath,
          word: item.word || item.refLabel || '',
          query: currentQuery,
          searchOptions: currentOpts
        });
      }
      return;
    }

    if (kind === 'commentary') {
      if (typeof onNavigateCommentary === 'function') {
        onNavigateCommentary({
          modulePath: modPath,
          book: item.book,
          chapter: item.chapter,
          verse: item.verse || (item.fromVerse > 0 ? item.fromVerse : 1),
          fromVerse: item.fromVerse || 0,
          toVerse: item.toVerse || 0,
          scopeKind: item.scopeKind || 'verse'
        });
      } else if (typeof onNavigateVerse === 'function') {
        onNavigateVerse({
          modulePath: '',
          book: item.book,
          chapter: item.chapter > 0 ? item.chapter : 1,
          verse: item.verse || 1
        });
      }
      return;
    }

    if (typeof onNavigateVerse === 'function') {
      onNavigateVerse({
        modulePath: modPath,
        book: item.book,
        chapter: item.chapter,
        verse: item.verse
      });
    }
  }

  function moveFocus(delta) {
    const filtered = getFilteredItems();
    if (!filtered.length) return;

    const next = Math.max(0, Math.min(filtered.length - 1, focusedIdx + delta));
    if (next === focusedIdx) return;
    focusedIdx = next;

    while (renderedCount <= focusedIdx && renderedCount < filtered.length) {
      renderResults({ resetList: false });
    }

    const listEl = document.getElementById('ms-results-list');
    if (listEl) {
      listEl.querySelectorAll('.ms-result-row.is-focused').forEach((el) => el.classList.remove('is-focused'));
      const rowEl = listEl.querySelector(`.ms-result-row[data-ms-row-idx="${focusedIdx}"]`);
      if (rowEl) {
        rowEl.classList.add('is-focused');
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
    syncBottomBarState();
  }

  function bindResultsListEvents() {
    const listEl = document.getElementById('ms-results-list');
    if (!listEl) return;

    listEl.addEventListener('click', (ev) => {
      const row = ev.target.closest('[data-ms-row-idx]');
      if (!row) return;
      const idx = Number(row.getAttribute('data-ms-row-idx'));
      const filtered = getFilteredItems();
      const item = filtered[idx];
      if (!item) return;

      focusedIdx = idx;

      if (selectionMode) {
        const key = getItemKey(item);
        if (checkedKeys.has(key)) checkedKeys.delete(key);
        else checkedKeys.add(key);

        const isChecked = checkedKeys.has(key);
        row.classList.toggle('is-checked', isChecked);
        const chk = row.querySelector('.ms-row-check');
        if (chk) chk.checked = isChecked;

        listEl.querySelectorAll('.ms-result-row.is-focused').forEach((el) => el.classList.remove('is-focused'));
        row.classList.add('is-focused');
        syncBottomBarState();
        return;
      }

      openItem(item);
    });
  }

  function updateOpts(partial, { reRenderPanel = false } = {}) {
    const next = normalizeOptionsForKind(activeKind, { ...opts, ...partial });
    opts = syncScopeBooks(next, curAppState.book);
    saveUnifiedSearchOptions(activeKind, opts);
    if (reRenderPanel) {
      renderFiltersPanel();
    } else {
      renderActiveSummaryBar();
    }
  }

  function bindFilterEvents(panel) {
    panel.querySelector('#ms-sel-module')?.addEventListener('change', (ev) => {
      targetVal = ev.target.value;
      const titleEl = document.getElementById('ms-header-title');
      if (titleEl) {
        titleEl.textContent = getHeaderTitleForSearch(activeKind, targetVal, getKindModules(), getKindActiveModule());
      }
      persistSessionSnapshot();
    });

    panel.querySelector('#ms-sel-scope')?.addEventListener('change', (ev) => {
      updateOpts({ scope: ev.target.value }, { reRenderPanel: true });
    });

    panel.querySelector('#ms-sel-from')?.addEventListener('change', (ev) => {
      const nextFrom = Number(ev.target.value) || 1;
      const nextTo = Math.max(nextFrom, opts.toBook || 66);
      updateOpts({ scope: 'custom', fromBook: nextFrom, toBook: nextTo }, { reRenderPanel: true });
    });

    panel.querySelector('#ms-sel-to')?.addEventListener('change', (ev) => {
      const nextTo = Number(ev.target.value) || 66;
      const nextFrom = Math.min(opts.fromBook || 1, nextTo);
      updateOpts({ scope: 'custom', fromBook: nextFrom, toBook: nextTo }, { reRenderPanel: true });
    });

    panel.querySelector('#ms-sel-target')?.addEventListener('change', (ev) => {
      updateOpts({ targetField: ev.target.value }, { reRenderPanel: activeKind === 'dictionary' });
    });

    panel.querySelector('#ms-input-limit')?.addEventListener('change', (ev) => {
      const meta = SEARCH_KIND_META[activeKind];
      const val = Math.trunc(Number(ev.target.value));
      const clamped = Number.isFinite(val) && val >= 1 ? Math.min(val, meta.maxLimit) : meta.maxLimit;
      updateOpts({ limit: clamped }, { reRenderPanel: false });
      ev.target.value = String(opts.limit);
      if (!searchResult && !isSearching) {
        renderResults({ resetList: true });
      }
    });

    panel.querySelector('#ms-sel-type')?.addEventListener('change', (ev) => {
      updateOpts({ searchType: ev.target.value }, { reRenderPanel: false });
    });

    panel.querySelector('#ms-sel-interval')?.addEventListener('change', (ev) => {
      updateOpts({ intervalType: ev.target.value }, { reRenderPanel: false });
    });

    panel.querySelector('#ms-sel-block')?.addEventListener('change', (ev) => {
      updateOpts({ blockFilter: ev.target.value }, { reRenderPanel: false });
    });

    panel.querySelector('#ms-chk-regex')?.addEventListener('change', (ev) => {
      updateOpts({ useRegex: Boolean(ev.target.checked) }, { reRenderPanel: false });
    });

    panel.querySelector('#ms-chk-accent')?.addEventListener('change', (ev) => {
      updateOpts({ accentSensitive: Boolean(ev.target.checked) }, { reRenderPanel: false });
    });

    panel.querySelector('#ms-chk-case')?.addEventListener('change', (ev) => {
      updateOpts({ caseSensitive: Boolean(ev.target.checked) }, { reRenderPanel: false });
    });

    panel.querySelector('#ms-chk-alt')?.addEventListener('change', (ev) => {
      updateOpts({ searchAltWords: Boolean(ev.target.checked) }, { reRenderPanel: false });
    });
  }

  function renderShell() {
    const meta = SEARCH_KIND_META[activeKind];

    root.innerHTML = `
      <div class="ms-search-backdrop" id="ms-search-backdrop" role="dialog" aria-modal="true" aria-label="Pesquisa Unificada" data-bref-skip="1">
        <header class="ms-search-header">
          <button type="button" class="ms-header-btn" id="ms-btn-close" aria-label="Fechar pesquisa" title="Voltar">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <h1 class="ms-header-title" id="ms-header-title">${escapeHtml(getHeaderTitleForSearch(activeKind, targetVal, getKindModules(), getKindActiveModule()))}</h1>
          <button type="button" class="ms-header-btn" id="ms-btn-menu" aria-label="Mais opções" title="Mais opções">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="1.8"></circle>
              <circle cx="12" cy="12" r="1.8"></circle>
              <circle cx="12" cy="19" r="1.8"></circle>
            </svg>
          </button>
        </header>

        <div class="ms-kind-tabs" id="ms-kind-tabs" role="tablist" aria-label="Escolher onde pesquisar"></div>

        <form class="ms-query-bar" id="ms-query-form">
          <button type="button" class="ms-collapse-btn" id="ms-btn-collapse" aria-label="Recolher ou expandir filtros" title="Recolher/expandir filtros">
            ${filtersCollapsed ? '+' : '&minus;'}
          </button>
          <div class="ms-input-wrap">
            <input
              type="search"
              class="ms-line-input"
              id="ms-query-input"
              value="${escapeHtml(queryText)}"
              placeholder="${escapeHtml(meta.placeholder)}"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
            />
            <button type="button" class="ms-clear-x${queryText.length ? '' : ' hidden'}" id="ms-btn-clear-q" aria-label="Limpar texto">&times;</button>
          </div>
          <button type="button" class="ms-icon-action" id="ms-btn-history" aria-label="Histórico de pesquisas" title="Pesquisas recentes">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
              <path d="M12 17.5l-6.5-6.5h4.2V5h4.6v6h4.2z"></path>
            </svg>
          </button>
          <button type="submit" class="ms-icon-action" id="ms-btn-run" aria-label="Executar pesquisa" title="Pesquisar">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5"></circle>
              <line x1="20" y1="20" x2="15.2" y2="15.2"></line>
            </svg>
          </button>
        </form>

        <div class="ms-active-summary-bar hidden" id="ms-active-summary-bar"></div>
        <section class="ms-filters-panel${filtersCollapsed ? ' hidden' : ''}" id="ms-filters-panel"></section>
        <section class="ms-aux-drawer hidden" id="ms-aux-drawer"></section>
        <div class="ms-book-bar hidden" id="ms-book-bar"></div>

        <main class="ms-results-scroll" id="ms-results-scroll">
          <div id="ms-results-container"></div>
        </main>

        <footer class="ms-bottom-bar" id="ms-bottom-bar">
          <button type="button" class="ms-foot-icon${compactView ? ' is-active' : ''}" id="ms-foot-compact" title="Alternar lista compacta / texto completo" aria-label="Alternar visualização compacta">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <line x1="4" y1="6" x2="20" y2="6"></line>
              <line x1="4" y1="12" x2="20" y2="12"></line>
              <line x1="4" y1="18" x2="15" y2="18"></line>
            </svg>
          </button>

          <button type="button" class="ms-foot-icon${!filtersCollapsed ? ' is-active' : ''}" id="ms-foot-filters" title="Mostrar ou ocultar filtros" aria-label="Mostrar ou ocultar filtros">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>

          <button type="button" class="ms-foot-icon" id="ms-foot-select-all" title="Selecionar ou desmarcar todos" aria-label="Selecionar todos">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="4" y="4" width="12" height="14" rx="2"></rect>
              <path d="M16 14h4M18 12v4"></path>
            </svg>
          </button>

          <button type="button" class="ms-foot-icon" id="ms-foot-copy" title="Copiar resultados selecionados ou encontrados" aria-label="Copiar resultados">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>

          <button type="button" class="ms-foot-icon" id="ms-foot-refine" title="Filtrar dentro dos resultados" aria-label="Filtrar resultados">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1"></rect>
              <circle cx="11.5" cy="13.5" r="2.5"></circle>
              <line x1="13.5" y1="15.5" x2="16" y2="18"></line>
            </svg>
          </button>

          <button type="button" class="ms-foot-text-btn" id="ms-foot-cancel">Cancelar</button>
          <button type="button" class="ms-foot-text-btn" id="ms-foot-open">Abrir Seleção</button>

          <button type="button" class="ms-foot-arrow" id="ms-foot-up" aria-label="Resultado anterior" title="Resultado anterior">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M12 6.5l6.5 6.5h-4.2v5.5H9.7V13H5.5z"></path>
            </svg>
          </button>
          <button type="button" class="ms-foot-arrow" id="ms-foot-down" aria-label="Próximo resultado" title="Próximo resultado">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M12 17.5l-6.5-6.5h4.2V5.5h4.6V11h4.2z"></path>
            </svg>
          </button>

          <button type="button" class="ms-foot-text-btn" id="ms-foot-selection">Seleção</button>
        </footer>
      </div>
    `;

    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    bindShellEvents();
  }

  function bindShellEvents() {
    document.getElementById('ms-btn-close')?.addEventListener('click', cleanupAndClose);

    document.getElementById('ms-btn-menu')?.addEventListener('click', () => {
      auxDrawerMode = auxDrawerMode === 'menu' ? '' : 'menu';
      renderAuxDrawer();
    });

    document.getElementById('ms-btn-collapse')?.addEventListener('click', () => {
      filtersCollapsed = !filtersCollapsed;
      persistSessionSnapshot();
      renderFiltersPanel();
    });

    const qInput = document.getElementById('ms-query-input');
    const clearX = document.getElementById('ms-btn-clear-q');

    qInput?.addEventListener('input', () => {
      queryText = qInput.value || '';
      clearX?.classList.toggle('hidden', !queryText.length);
    });

    clearX?.addEventListener('click', () => {
      queryText = '';
      if (qInput) {
        qInput.value = '';
        qInput.focus();
      }
      clearX.classList.add('hidden');
    });

    document.getElementById('ms-btn-history')?.addEventListener('click', () => {
      auxDrawerMode = auxDrawerMode === 'history' ? '' : 'history';
      renderAuxDrawer();
    });

    document.getElementById('ms-query-form')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (qInput) queryText = qInput.value || '';
      auxDrawerMode = '';
      renderAuxDrawer();
      runSearch();
    });

    document.getElementById('ms-foot-compact')?.addEventListener('click', () => {
      compactView = !compactView;
      persistSessionSnapshot();
      document.getElementById('ms-results-list')?.classList.toggle('is-compact', compactView);
      syncBottomBarState();
    });

    document.getElementById('ms-foot-filters')?.addEventListener('click', () => {
      filtersCollapsed = !filtersCollapsed;
      persistSessionSnapshot();
      renderFiltersPanel();
    });

    document.getElementById('ms-foot-select-all')?.addEventListener('click', () => {
      const filtered = getFilteredItems();
      if (!filtered.length) return;
      selectionMode = true;
      const allSelected = filtered.every((it) => checkedKeys.has(getItemKey(it)));
      if (allSelected) {
        checkedKeys.clear();
      } else {
        for (const it of filtered) checkedKeys.add(getItemKey(it));
      }
      renderResults({ resetList: true });
    });

    document.getElementById('ms-foot-copy')?.addEventListener('click', async () => {
      const filtered = getFilteredItems();
      if (!filtered.length) return;

      const selectedList = checkedKeys.size > 0
        ? filtered.filter((it) => checkedKeys.has(getItemKey(it)))
        : filtered.slice(0, 120);

      const meta = SEARCH_KIND_META[activeKind];
      const showMod = isMultiModuleTarget();

      const text = selectedList.map((it) => {
        const modTag = showMod && it.module ? ` (${getPreferredLabelForModule(it.module, meta.singular)})` : '';
        const blockTag = activeKind === 'commentary' && it.badge ? ` [${it.badge}]` : '';
        const bodyTxt = it.plainText ? ` — ${it.plainText}` : '';
        return `${it.refLabel}${blockTag}${modTag}${bodyTxt}`;
      }).join('\n');

      const ok = await copyTextSafe(text);
      eventBus.emit(
        EVENTS.TOAST,
        ok
          ? `${selectedList.length} item(ns) copiado(s).`
          : 'Não foi possível copiar os resultados.'
      );
    });

    document.getElementById('ms-foot-refine')?.addEventListener('click', () => {
      auxDrawerMode = auxDrawerMode === 'refine' ? '' : 'refine';
      renderAuxDrawer();
    });

    document.getElementById('ms-foot-cancel')?.addEventListener('click', () => {
      if (isSearching) {
        abortOngoing();
        isSearching = false;
        statusText = 'Pesquisa cancelada.';
        renderGroupBar();
        renderResults({ resetList: true });
      } else {
        cleanupAndClose();
      }
    });

    document.getElementById('ms-foot-open')?.addEventListener('click', () => {
      const filtered = getFilteredItems();
      if (!filtered.length) return;

      let chosen = null;
      if (checkedKeys.size > 0) {
        chosen = filtered.find((it) => checkedKeys.has(getItemKey(it))) || null;
      }
      if (!chosen && focusedIdx >= 0 && focusedIdx < filtered.length) {
        chosen = filtered[focusedIdx];
      }
      if (!chosen) chosen = filtered[0];
      openItem(chosen);
    });

    document.getElementById('ms-foot-up')?.addEventListener('click', () => moveFocus(-1));
    document.getElementById('ms-foot-down')?.addEventListener('click', () => moveFocus(1));

    document.getElementById('ms-foot-selection')?.addEventListener('click', () => {
      selectionMode = !selectionMode;
      if (!selectionMode) checkedKeys.clear();
      renderResults({ resetList: true });
    });

    const scrollEl = document.getElementById('ms-results-scroll');
    scrollEl?.addEventListener('scroll', () => {
      if (isSearching || !searchResult) return;
      const filtered = getFilteredItems();
      if (renderedCount >= filtered.length) return;
      const rem = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      if (rem < 260) {
        renderResults({ resetList: false });
      }
    });
  }

  async function runSearch() {
    const clean = String(queryText || '').trim();
    if (!clean) {
      eventBus.emit(EVENTS.TOAST, 'Digite uma palavra, frase ou código Strong.');
      return;
    }

    const mods = getKindModules();
    const meta = SEARCH_KIND_META[activeKind];
    if (!mods.length) {
      renderResults({ resetList: true });
      return;
    }

    const limInput = document.getElementById('ms-input-limit');
    if (limInput) {
      const v = Math.trunc(Number(limInput.value));
      if (Number.isFinite(v) && v >= 1) {
        opts = syncScopeBooks(
          normalizeOptionsForKind(activeKind, { ...opts, limit: Math.min(v, meta.maxLimit) }),
          curAppState.book
        );
        saveUnifiedSearchOptions(activeKind, opts);
      }
    }

    abortOngoing();
    const controller = new AbortController();
    activeController = controller;

    selectedGroupVal = '';
    refineQuery = '';
    checkedKeys.clear();
    focusedIdx = -1;
    errorText = '';
    isSearching = true;
    pushUnifiedHistory(activeKind, clean);

    const isAll = targetVal === ALL_MODULES_VALUE;
    const isFav = targetVal === FAV_MODULES_VALUE;
    const chosenMod = getSelectedModuleObj();
    const chosenLabel = getPreferredLabelForModule(chosenMod, meta.singular);
    const activeMod = getKindActiveModule();

    if (isFav && !mods.some((m) => m.isFavorite)) {
      isSearching = false;
      searchResult = { items: [], totalOccurrences: 0, byBook: [], byModule: [], truncated: false, searchedCount: 0 };
      statusText = `Nenhum módulo marcado como favorito em ${meta.plural}. Marque estrelas no seletor.`;
      renderGroupBar();
      renderResults({ resetList: true });
      return;
    }

    statusText = isAll
      ? `Pesquisando "${clean}" em ${meta.allLabel.toLowerCase()}...`
      : isFav
        ? `Pesquisando "${clean}" nos favoritos de ${meta.plural}...`
        : `Pesquisando "${clean}" em ${chosenLabel}...`;

    renderGroupBar();
    renderResults({ resetList: true });

    const setProgress = (msg) => {
      if (!isAlive()) {
        controller.abort();
        return;
      }
      const p = document.getElementById('ms-progress-text');
      if (p) p.textContent = msg;
    };

    try {
      let res;

      if (activeKind === 'bible') {
        if (isAll || isFav) {
          res = await searchAcrossBibles(mods, clean, { ...opts, favoritesOnly: isFav }, {
            activePath: activeMod ? activeMod.path : '',
            currentBook: curAppState.book,
            currentChapter: curAppState.chapter,
            perBibleMax: Math.min(80, opts.limit),
            maxTotal: Math.min(opts.limit, 2500),
            concurrency: 4,
            signal: controller.signal,
            onProgress: (done, total, found) => {
              setProgress(`Pesquisando "${clean}" (${done}/${total} Bíblias · ${found} versículo(s))...`);
            }
          });
        } else {
          res = await searchBibleModule(chosenMod, clean, opts, {
            currentBook: curAppState.book,
            currentChapter: curAppState.chapter,
            maxResults: opts.limit,
            signal: controller.signal,
            onProgress: (done, total, found) => {
              const pct = Math.round((done / Math.max(1, total)) * 100);
              setProgress(`Pesquisando "${clean}" em ${chosenLabel} (${pct}% · ${found} versículo(s))...`);
            }
          });
        }
      } else if (activeKind === 'commentary') {
        if (isAll || isFav) {
          res = await searchAcrossCommentaries(mods, clean, { ...opts, favoritesOnly: isFav }, {
            activePath: activeMod ? activeMod.path : '',
            currentBook: curAppState.book,
            currentChapter: curAppState.chapter,
            perCmtMax: Math.min(60, opts.limit),
            maxTotal: Math.min(opts.limit, 2000),
            concurrency: 4,
            signal: controller.signal,
            onProgress: (done, total, found) => {
              setProgress(`Pesquisando "${clean}" (${done}/${total} Comentários · ${found} bloco(s))...`);
            }
          });
        } else {
          res = await searchCommentaryModule(chosenMod, clean, opts, {
            currentBook: curAppState.book,
            currentChapter: curAppState.chapter,
            maxResults: opts.limit,
            signal: controller.signal,
            onProgress: (done, total, found) => {
              const pct = Math.round((done / Math.max(1, total)) * 100);
              setProgress(`Pesquisando "${clean}" em ${chosenLabel} (${pct}% · ${found} bloco(s))...`);
            }
          });
        }
      } else {
        if (isAll || isFav) {
          res = await searchAcrossDictionariesUnified(mods, clean, { ...opts, favoritesOnly: isFav }, {
            activePath: activeMod ? activeMod.path : '',
            perDictMax: Math.min(15, opts.limit),
            maxTotal: Math.min(opts.limit, 1500),
            concurrency: 4,
            signal: controller.signal,
            onProgress: (done, total, found) => {
              setProgress(`Pesquisando "${clean}" (${done}/${total} Dicionários · ${found} verbete(s))...`);
            }
          });
        } else {
          res = await searchDictionaryModule(chosenMod, clean, opts, {
            maxResults: opts.limit,
            signal: controller.signal,
            onProgress: (pages, found) => {
              setProgress(`Pesquisando "${clean}" em ${chosenLabel} (lote ${pages} · ${found} verbete(s))...`);
            }
          });
        }
      }

      if (controller.signal.aborted || !isAlive()) return;

      isSearching = false;
      searchResult = res;
      focusedIdx = res.items.length ? 0 : -1;
      statusText = res.items.length
        ? ''
        : `Nenhum resultado encontrado para "${clean}" com os filtros selecionados.`;

      if (res.items.length > 0 && window.innerHeight < 760) {
        filtersCollapsed = true;
      }

      persistSessionSnapshot();
      renderFiltersPanel();
      renderGroupBar();
      renderResults({ resetList: true });

      const scrollEl = document.getElementById('ms-results-scroll');
      if (scrollEl) scrollEl.scrollTop = 0;
    } catch (err) {
      if (controller.signal.aborted || !isAlive()) return;
      const msg = err && err.message ? err.message : 'Erro ao executar pesquisa.';
      appLogger.error('UNIFIED_SEARCH', `Erro ao pesquisar "${clean}" em ${activeKind}: ${msg}`, {
        kind: activeKind,
        targetVal,
        options: opts,
        error: err
      });
      isSearching = false;
      searchResult = null;
      errorText = msg;
      renderGroupBar();
      renderResults({ resetList: true });
    }
  }

  renderShell();
  renderKindTabs();
  renderFiltersPanel();
  renderAuxDrawer();
  renderGroupBar();
  renderResults({ resetList: true });

  if (autoRun && queryText.trim()) {
    runSearch();
  } else if (!initialLoaded.canReuse) {
    window.requestAnimationFrame(() => {
      document.getElementById('ms-query-input')?.focus();
    });
  }
}

// Alias mantido para compatibilidade direta com importações existentes
export const openBibleSearchModal = openUnifiedSearchModal;
