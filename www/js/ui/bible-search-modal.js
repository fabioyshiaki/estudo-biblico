import { closeModal } from './nav-modal.js';
import { store } from '../core/store.js';
import { eventBus, EVENTS } from '../core/events.js';
import { getBookName } from '../core/canon.js';
import { appLogger } from '../core/logger.js';
import {
  BIBLE_SCOPE_GROUPS,
  BIBLE_SEARCH_TYPES,
  BIBLE_INTERVAL_TYPES,
  DEFAULT_BIBLE_SEARCH_OPTIONS,
  normalizeBibleSearchOptions,
  searchBibleModule,
  searchAcrossBibles
} from '../formats/bible-search.js';

const OPTS_STORAGE_KEY = 'estudo_biblico_bible_search_opts_v2';
const HIST_STORAGE_KEY = 'estudo_biblico_bible_search_hist_v1';
const MAX_HISTORY = 16;
const RENDER_CHUNK = 80;
const ALL_BIBLES_VALUE = '__ALL_BIBLES__';
const FAV_BIBLES_VALUE = '__FAV_BIBLES__';

const TARGET_FIELDS = [
  { id: 'text', label: 'Texto bíblico' },
  { id: 'strong', label: 'Strong (H/G)' },
  { id: 'morph', label: 'Morfologia' },
  { id: 'notes', label: 'Notas e títulos' },
  { id: 'redLetter', label: 'Palavras de Jesus' },
  { id: 'all', label: 'Todos os dados' }
];

let savedOptions = loadSavedOptions();
let recentHistory = loadRecentHistory();

let sessionState = {
  query: '',
  targetBibleVal: '',
  results: null,
  selectedBook: 0,
  refineQuery: '',
  compactView: false,
  filtersCollapsed: false
};

function loadSavedOptions() {
  try {
    const raw = window.localStorage.getItem(OPTS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BIBLE_SEARCH_OPTIONS };
    return normalizeBibleSearchOptions(JSON.parse(raw));
  } catch (err) {
    return { ...DEFAULT_BIBLE_SEARCH_OPTIONS };
  }
}

function persistOptions(opts) {
  try {
    window.localStorage.setItem(OPTS_STORAGE_KEY, JSON.stringify(opts));
  } catch (err) {
    // Ignora caso localStorage esteja indisponível
  }
}

function loadRecentHistory() {
  try {
    const raw = window.localStorage.getItem(HIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s) => typeof s === 'string' && s.trim()).slice(0, MAX_HISTORY)
      : [];
  } catch (err) {
    return [];
  }
}

function pushSearchHistory(term) {
  const clean = String(term || '').trim();
  if (!clean) return;
  recentHistory = [clean, ...recentHistory.filter((t) => t.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_HISTORY);
  try {
    window.localStorage.setItem(HIST_STORAGE_KEY, JSON.stringify(recentHistory));
  } catch (err) {
    // Ignora erro
  }
}

function clearSearchHistory() {
  recentHistory = [];
  try {
    window.localStorage.removeItem(HIST_STORAGE_KEY);
  } catch (err) {
    // Ignora erro
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeAscii(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getPreferredBibleLabel(mod, fallback = 'Bíblia') {
  if (!mod) return fallback;
  const sortBy = store.getPrefs().bibleSortBy === 'title' ? 'title' : 'abbr';
  return sortBy === 'title'
    ? (mod.title || mod.abbr || mod.fileName || fallback)
    : (mod.abbr || mod.title || mod.fileName || fallback);
}

function getBibleOptionLabel(mod) {
  if (!mod) return 'Bíblia';
  const sortBy = store.getPrefs().bibleSortBy === 'title' ? 'title' : 'abbr';
  const primary = getPreferredBibleLabel(mod, 'Bíblia');
  const secondary = sortBy === 'title' ? (mod.abbr || '') : (mod.title || '');
  if (secondary && secondary !== primary) {
    return `${primary} — ${secondary}`;
  }
  return primary;
}

async function copyTextSafe(text) {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    // Fallback abaixo
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

function buildBookOptionsHtml(selectedId) {
  const parts = [];
  for (let id = 1; id <= 66; id++) {
    parts.push(`<option value="${id}"${id === selectedId ? ' selected' : ''}>${escapeHtml(getBookName(id))}</option>`);
  }
  return parts.join('');
}

function syncFromToForScope(opts, currentBook) {
  if (opts.scope === 'custom') return opts;
  if (opts.scope === 'currentBook' || opts.scope === 'currentChapter') {
    const b = Number(currentBook) >= 1 && Number(currentBook) <= 66 ? Number(currentBook) : 1;
    return { ...opts, fromBook: b, toBook: b };
  }
  const grp = BIBLE_SCOPE_GROUPS[opts.scope] || BIBLE_SCOPE_GROUPS.all;
  return {
    ...opts,
    fromBook: grp.minBook || 1,
    toBook: grp.maxBook || 66
  };
}

export function clearBibleSearchSession() {
  sessionState = {
    query: '',
    targetBibleVal: '',
    results: null,
    selectedBook: 0,
    refineQuery: '',
    compactView: false,
    filtersCollapsed: false
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

export function openBibleSearchModal({
  initialQuery = '',
  autoRun = false,
  onNavigateVerse = null,
  onOpenSources = null,
  onOpenLogs = null
} = {}) {
  closeModal();

  const root = document.getElementById('modal-root');
  if (!root) return;

  const allBibles = store.getBibles();
  const activeBible = store.getActiveBible() || allBibles[0] || null;
  const curState = store.getState();

  const cleanInitial = String(initialQuery || '').trim();
  const defaultBibleVal = activeBible ? activeBible.path : ALL_BIBLES_VALUE;

  const canReuse =
    !cleanInitial &&
    Boolean(sessionState.results) &&
    (
      sessionState.targetBibleVal === ALL_BIBLES_VALUE ||
      sessionState.targetBibleVal === FAV_BIBLES_VALUE ||
      allBibles.some((b) => b.path === sessionState.targetBibleVal)
    );

  let queryText = cleanInitial || (canReuse ? sessionState.query : '');
  let targetBibleVal = canReuse && sessionState.targetBibleVal
    ? sessionState.targetBibleVal
    : defaultBibleVal;
  let opts = syncFromToForScope({ ...savedOptions }, curState.book);
  let filtersCollapsed = canReuse ? Boolean(sessionState.filtersCollapsed) : false;
  let auxDrawerMode = ''; // '' | 'history' | 'refine' | 'menu'
  let searchResult = canReuse ? sessionState.results : null;
  let selectedBook = canReuse ? sessionState.selectedBook : 0;
  let refineQuery = canReuse ? sessionState.refineQuery : '';
  let compactView = canReuse ? Boolean(sessionState.compactView) : false;
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

  function getSelectedBibleObj() {
    if (targetBibleVal === ALL_BIBLES_VALUE || targetBibleVal === FAV_BIBLES_VALUE) return null;
    return allBibles.find((b) => b.path === targetBibleVal) || activeBible;
  }

  function getHeaderTitle() {
    if (!allBibles.length) return 'Pesquisar Bíblia';
    if (targetBibleVal === ALL_BIBLES_VALUE) return 'Pesquisar Todas as Bíblias';
    if (targetBibleVal === FAV_BIBLES_VALUE) return 'Pesquisar Bíblias Favoritas';
    const b = getSelectedBibleObj();
    return b ? `Pesquisar ${getPreferredBibleLabel(b, 'Bíblia')}` : 'Pesquisar Bíblia';
  }

  function getItemKey(item) {
    const p = item.module ? item.module.path : '';
    return `${p}::${item.book}:${item.chapter}:${item.verse}`;
  }

  function getFilteredItems() {
    if (!searchResult || !Array.isArray(searchResult.items)) return [];
    let list = searchResult.items;
    if (selectedBook) {
      list = list.filter((it) => it.book === selectedBook);
    }
    const cleanRef = normalizeAscii(refineQuery).trim();
    if (cleanRef) {
      const terms = cleanRef.split(/\s+/).filter(Boolean);
      list = list.filter((it) => {
        const hay = normalizeAscii(`${it.refLabel} ${it.plainText || ''}`);
        return terms.every((t) => hay.includes(t));
      });
    }
    return list;
  }

  function persistSessionSnapshot() {
    sessionState = {
      query: queryText,
      targetBibleVal,
      results: searchResult,
      selectedBook,
      refineQuery,
      compactView,
      filtersCollapsed
    };
  }

  function renderShell() {
    root.innerHTML = `
      <div class="ms-search-backdrop" id="ms-search-backdrop" role="dialog" aria-modal="true" aria-label="Pesquisar na Bíblia" data-bref-skip="1">
        <header class="ms-search-header">
          <button type="button" class="ms-header-btn" id="ms-btn-close" aria-label="Fechar pesquisa" title="Voltar à Bíblia">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <h1 class="ms-header-title" id="ms-header-title">${escapeHtml(getHeaderTitle())}</h1>
          <button type="button" class="ms-header-btn" id="ms-btn-menu" aria-label="Mais opções" title="Mais opções">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="1.8"></circle>
              <circle cx="12" cy="12" r="1.8"></circle>
              <circle cx="12" cy="19" r="1.8"></circle>
            </svg>
          </button>
        </header>

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
              placeholder="Palavra, frase, Strong (H430, G26) ou regex..."
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

          <button type="button" class="ms-foot-icon" id="ms-foot-copy" title="Copiar versículos selecionados ou encontrados" aria-label="Copiar resultados">
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

  function renderFiltersPanel() {
    const panel = document.getElementById('ms-filters-panel');
    const collapseBtn = document.getElementById('ms-btn-collapse');
    const footFilterBtn = document.getElementById('ms-foot-filters');
    const titleEl = document.getElementById('ms-header-title');

    if (titleEl) titleEl.textContent = getHeaderTitle();
    if (collapseBtn) collapseBtn.innerHTML = filtersCollapsed ? '+' : '&minus;';
    if (footFilterBtn) footFilterBtn.classList.toggle('is-active', !filtersCollapsed);
    if (!panel) return;

    panel.classList.toggle('hidden', filtersCollapsed);

    const favCount = allBibles.filter((b) => b.isFavorite).length;
    const bibleOptionsHtml = [
      ...allBibles.map((b) => {
        const label = getBibleOptionLabel(b);
        return `<option value="${escapeHtml(b.path)}"${targetBibleVal === b.path ? ' selected' : ''}>${escapeHtml(label)}</option>`;
      }),
      `<option value="${ALL_BIBLES_VALUE}"${targetBibleVal === ALL_BIBLES_VALUE ? ' selected' : ''}>Todas as Bíblias (${allBibles.length})</option>`,
      `<option value="${FAV_BIBLES_VALUE}"${targetBibleVal === FAV_BIBLES_VALUE ? ' selected' : ''}>Só Favoritas ★ (${favCount})</option>`
    ].join('');

    const scopeOptionsHtml = Object.values(BIBLE_SCOPE_GROUPS).map((g) => (
      `<option value="${g.id}"${opts.scope === g.id ? ' selected' : ''}>${escapeHtml(g.label)}</option>`
    )).join('');

    const targetFieldHtml = TARGET_FIELDS.map((t) => (
      `<option value="${t.id}"${opts.targetField === t.id ? ' selected' : ''}>${escapeHtml(t.label)}</option>`
    )).join('');

    const typeOptionsHtml = Object.values(BIBLE_SEARCH_TYPES).map((t) => (
      `<option value="${t.id}"${opts.searchType === t.id ? ' selected' : ''}>${escapeHtml(t.label)}</option>`
    )).join('');

    const intervalOptionsHtml = Object.values(BIBLE_INTERVAL_TYPES).map((it) => (
      `<option value="${it.id}"${opts.intervalType === it.id ? ' selected' : ''}>${escapeHtml(it.label)}</option>`
    )).join('');

    panel.innerHTML = `
      <div class="ms-grid-2">
        <div class="ms-spinner-wrap">
          <select class="ms-select" id="ms-sel-bible" aria-label="Selecionar Bíblia para pesquisa">
            ${bibleOptionsHtml}
          </select>
        </div>
        <div class="ms-field-inline">
          <span class="ms-field-label">De</span>
          <div class="ms-spinner-wrap">
            <select class="ms-select" id="ms-sel-from" aria-label="Livro inicial">
              ${buildBookOptionsHtml(opts.fromBook)}
            </select>
          </div>
        </div>
      </div>

      <div class="ms-grid-2">
        <div class="ms-spinner-wrap">
          <select class="ms-select" id="ms-sel-scope" aria-label="Intervalo de livros">
            ${scopeOptionsHtml}
          </select>
        </div>
        <div class="ms-field-inline">
          <span class="ms-field-label">Até</span>
          <div class="ms-spinner-wrap">
            <select class="ms-select" id="ms-sel-to" aria-label="Livro final">
              ${buildBookOptionsHtml(opts.toBook)}
            </select>
          </div>
        </div>
      </div>

      <div class="ms-grid-2">
        <div class="ms-field-inline">
          <span class="ms-field-label">Onde</span>
          <div class="ms-spinner-wrap">
            <select class="ms-select" id="ms-sel-target" aria-label="Camada de pesquisa">
              ${targetFieldHtml}
            </select>
          </div>
        </div>
        <div class="ms-field-inline">
          <span class="ms-field-label">Limitar</span>
          <input
            type="number"
            class="ms-limit-input"
            id="ms-input-limit"
            min="1"
            max="100000"
            inputmode="numeric"
            value="${escapeHtml(opts.limit)}"
            aria-label="Limite de resultados"
          />
        </div>
      </div>

      <div class="ms-field-inline">
        <span class="ms-field-label">Tipo</span>
        <div class="ms-spinner-wrap">
          <select class="ms-select" id="ms-sel-type" aria-label="Tipo de pesquisa">
            ${typeOptionsHtml}
          </select>
        </div>
      </div>

      <div class="ms-field-inline">
        <span class="ms-field-label">Tipo de intervalo</span>
        <div class="ms-spinner-wrap">
          <select class="ms-select" id="ms-sel-interval" aria-label="Tipo de intervalo">
            ${intervalOptionsHtml}
          </select>
        </div>
      </div>

      <div class="ms-checks-row">
        <label class="ms-check-label">
          <input type="checkbox" id="ms-chk-regex" ${opts.useRegex ? 'checked' : ''} />
          <span>Pesquisa padrão SQLite regexp</span>
        </label>
        <label class="ms-check-label">
          <input type="checkbox" id="ms-chk-accent" ${opts.accentSensitive ? 'checked' : ''} />
          <span>Acentos</span>
        </label>
        <label class="ms-check-label">
          <input type="checkbox" id="ms-chk-case" ${opts.caseSensitive ? 'checked' : ''} />
          <span>Aa</span>
        </label>
      </div>
    `;

    bindFilterEvents(panel);
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
      if (!recentHistory.length) {
        drawer.innerHTML = '<div class="ms-status-note" style="margin:0;">Nenhuma pesquisa recente salva ainda.</div>';
        return;
      }
      drawer.innerHTML = `
        <div class="ms-aux-row">
          ${recentHistory.map((h) => `<button type="button" class="ms-aux-chip" data-ms-hist="${escapeHtml(h)}">${escapeHtml(h)}</button>`).join('')}
          <button type="button" class="ms-aux-chip" id="ms-hist-clear" style="color:var(--ms-muted);">Limpar histórico</button>
        </div>
      `;
      drawer.querySelectorAll('[data-ms-hist]').forEach((btn) => {
        btn.addEventListener('click', () => {
          queryText = btn.getAttribute('data-ms-hist') || '';
          const inp = document.getElementById('ms-query-input');
          if (inp) inp.value = queryText;
          document.getElementById('ms-btn-clear-q')?.classList.toggle('hidden', !queryText.length);
          auxDrawerMode = '';
          renderAuxDrawer();
          runSearch();
        });
      });
      drawer.querySelector('#ms-hist-clear')?.addEventListener('click', () => {
        clearSearchHistory();
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
            placeholder="Digite para filtrar os versículos listados..."
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
          <button type="button" class="ms-aux-chip" id="ms-menu-sources">Fontes</button>
          <button type="button" class="ms-aux-chip" id="ms-menu-logs">Abrir Logs</button>
        </div>
      `;
      drawer.querySelector('#ms-menu-reset')?.addEventListener('click', () => {
        opts = syncFromToForScope({ ...DEFAULT_BIBLE_SEARCH_OPTIONS }, curState.book);
        savedOptions = { ...opts };
        persistOptions(opts);
        auxDrawerMode = '';
        renderFiltersPanel();
        renderAuxDrawer();
        if (!searchResult) renderResults({ resetList: true });
      });
      drawer.querySelector('#ms-menu-clear-res')?.addEventListener('click', () => {
        searchResult = null;
        selectedBook = 0;
        refineQuery = '';
        focusedIdx = -1;
        checkedKeys.clear();
        clearBibleSearchSession();
        auxDrawerMode = '';
        renderAuxDrawer();
        renderBookBar();
        renderResults({ resetList: true });
      });
      drawer.querySelector('#ms-menu-sources')?.addEventListener('click', () => {
        cleanupAndClose();
        if (typeof onOpenSources === 'function') onOpenSources();
      });
      drawer.querySelector('#ms-menu-logs')?.addEventListener('click', () => {
        cleanupAndClose();
        if (typeof onOpenLogs === 'function') onOpenLogs();
      });
    }
  }

  function renderBookBar() {
    const bar = document.getElementById('ms-book-bar');
    if (!bar) return;

    if (isSearching || !searchResult || !Array.isArray(searchResult.byBook) || searchResult.byBook.length <= 1) {
      bar.classList.add('hidden');
      bar.innerHTML = '';
      return;
    }

    bar.classList.remove('hidden');
    bar.innerHTML =
      `<button type="button" class="ms-book-chip${selectedBook === 0 ? ' is-active' : ''}" data-ms-book="0">Todos (${searchResult.items.length})</button>` +
      searchResult.byBook.map((b) => (
        `<button type="button" class="ms-book-chip${selectedBook === b.book ? ' is-active' : ''}" data-ms-book="${b.book}">${escapeHtml(b.name)} (${b.count})</button>`
      )).join('');

    bar.querySelectorAll('[data-ms-book]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextBook = Number(btn.getAttribute('data-ms-book')) || 0;
        if (nextBook === selectedBook) return;
        selectedBook = nextBook;
        focusedIdx = 0;
        persistSessionSnapshot();
        renderBookBar();
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
    const isMultiBible = targetBibleVal === ALL_BIBLES_VALUE || targetBibleVal === FAV_BIBLES_VALUE;

    const modBadge = isMultiBible && item.module
      ? `<span class="bsearch-badge">${escapeHtml(getPreferredBibleLabel(item.module, 'Bíblia'))}</span>`
      : '';

    const extraBadges = (Array.isArray(item.matchedBadges) ? item.matchedBadges : []).map((b) => {
      const isStrong = /^[GH]\d+/i.test(b);
      return `<span class="bsearch-badge${isStrong ? ' bsearch-badge--strong' : ''}">${escapeHtml(b)}</span>`;
    }).join('');

    const checkHtml = selectionMode
      ? `<input type="checkbox" class="ms-row-check" data-ms-check-idx="${idx}" ${isChecked ? 'checked' : ''} tabindex="-1" aria-label="Selecionar ${escapeHtml(item.refLabel)}" />`
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
          `<div class="ms-row-text"${dirAttr}>${item.snippetHtml}</div>` +
        '</div>' +
      '</div>'
    );
  }

  function renderResults({ resetList = true } = {}) {
    const container = document.getElementById('ms-results-container');
    if (!container) return;

    if (!allBibles.length) {
      container.innerHTML = `
        <div class="ms-status-note">Nenhuma Bíblia instalada. Adicione uma pasta ou arquivo .bbl.mybible em Configurações → Fontes.</div>
        <button type="button" class="primary-btn" id="ms-go-sources">Configurar Fontes</button>
      `;
      container.querySelector('#ms-go-sources')?.addEventListener('click', () => {
        cleanupAndClose();
        if (typeof onOpenSources === 'function') onOpenSources();
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
        <div class="ms-status-note">A pesquisa é limitada a um resultado de ${escapeHtml(opts.limit)}.</div>
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
      const bookCount = new Set(filtered.map((it) => it.book)).size;
      const extraNotes = [];
      if (searchResult.autoStrong) extraNotes.push('Strong detectado');
      if (searchResult.intervalType === 'chapter') extraNotes.push(`${searchResult.chapterCount || 0} cap.`);
      if (searchResult.intervalType === 'book') extraNotes.push(`${bookCount} livro(s)`);
      if (searchResult.truncated) extraNotes.push(`limite ${opts.limit} atingido`);
      const suffix = extraNotes.length ? ` • ${extraNotes.join(' • ')}` : '';

      container.innerHTML = `
        <div class="ms-status-note">
          <strong>${filtered.length}</strong> versículo(s) · ${occ} ocorrência(s) · ${bookCount} livro(s)${escapeHtml(suffix)}
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

  function openItemInBible(item) {
    if (!item) return;
    persistSessionSnapshot();
    cleanupAndClose();
    if (typeof onNavigateVerse === 'function') {
      onNavigateVerse({
        modulePath: item.module ? item.module.path : (activeBible ? activeBible.path : ''),
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

      openItemInBible(item);
    });
  }

  function bindFilterEvents(panel) {
    panel.querySelector('#ms-sel-bible')?.addEventListener('change', (ev) => {
      targetBibleVal = ev.target.value;
      const titleEl = document.getElementById('ms-header-title');
      if (titleEl) titleEl.textContent = getHeaderTitle();
      persistSessionSnapshot();
    });

    panel.querySelector('#ms-sel-scope')?.addEventListener('change', (ev) => {
      const nextScope = ev.target.value;
      opts = syncFromToForScope(normalizeBibleSearchOptions({ ...opts, scope: nextScope }), curState.book);
      savedOptions = { ...opts };
      persistOptions(opts);
      renderFiltersPanel();
    });

    panel.querySelector('#ms-sel-from')?.addEventListener('change', (ev) => {
      const nextFrom = Number(ev.target.value) || 1;
      const nextTo = Math.max(nextFrom, opts.toBook);
      opts = normalizeBibleSearchOptions({ ...opts, scope: 'custom', fromBook: nextFrom, toBook: nextTo });
      savedOptions = { ...opts };
      persistOptions(opts);
      renderFiltersPanel();
    });

    panel.querySelector('#ms-sel-to')?.addEventListener('change', (ev) => {
      const nextTo = Number(ev.target.value) || 66;
      const nextFrom = Math.min(opts.fromBook, nextTo);
      opts = normalizeBibleSearchOptions({ ...opts, scope: 'custom', fromBook: nextFrom, toBook: nextTo });
      savedOptions = { ...opts };
      persistOptions(opts);
      renderFiltersPanel();
    });

    panel.querySelector('#ms-sel-target')?.addEventListener('change', (ev) => {
      opts = normalizeBibleSearchOptions({ ...opts, targetField: ev.target.value });
      savedOptions = { ...opts };
      persistOptions(opts);
    });

    panel.querySelector('#ms-input-limit')?.addEventListener('change', (ev) => {
      const val = Math.trunc(Number(ev.target.value));
      const clamped = Number.isFinite(val) && val >= 1 ? Math.min(val, 100000) : 100000;
      opts = normalizeBibleSearchOptions({ ...opts, limit: clamped });
      ev.target.value = String(clamped);
      savedOptions = { ...opts };
      persistOptions(opts);
      if (!searchResult && !isSearching) {
        renderResults({ resetList: true });
      }
    });

    panel.querySelector('#ms-sel-type')?.addEventListener('change', (ev) => {
      opts = normalizeBibleSearchOptions({ ...opts, searchType: ev.target.value });
      savedOptions = { ...opts };
      persistOptions(opts);
    });

    panel.querySelector('#ms-sel-interval')?.addEventListener('change', (ev) => {
      opts = normalizeBibleSearchOptions({ ...opts, intervalType: ev.target.value });
      savedOptions = { ...opts };
      persistOptions(opts);
    });

    panel.querySelector('#ms-chk-regex')?.addEventListener('change', (ev) => {
      opts = normalizeBibleSearchOptions({ ...opts, useRegex: Boolean(ev.target.checked) });
      savedOptions = { ...opts };
      persistOptions(opts);
    });

    panel.querySelector('#ms-chk-accent')?.addEventListener('change', (ev) => {
      opts = normalizeBibleSearchOptions({ ...opts, accentSensitive: Boolean(ev.target.checked) });
      savedOptions = { ...opts };
      persistOptions(opts);
    });

    panel.querySelector('#ms-chk-case')?.addEventListener('change', (ev) => {
      opts = normalizeBibleSearchOptions({ ...opts, caseSensitive: Boolean(ev.target.checked) });
      savedOptions = { ...opts };
      persistOptions(opts);
    });
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

      const isMulti = targetBibleVal === ALL_BIBLES_VALUE || targetBibleVal === FAV_BIBLES_VALUE;
      const text = selectedList.map((it) => {
        const modTag = isMulti && it.module ? ` (${getPreferredBibleLabel(it.module, 'Bíblia')})` : '';
        return `${it.refLabel}${modTag} — ${it.plainText || ''}`;
      }).join('\n');

      const ok = await copyTextSafe(text);
      eventBus.emit(
        EVENTS.TOAST,
        ok
          ? `${selectedList.length} versículo(s) copiado(s).`
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
        renderBookBar();
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
      openItemInBible(chosen);
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

    const limInput = document.getElementById('ms-input-limit');
    if (limInput) {
      const v = Math.trunc(Number(limInput.value));
      if (Number.isFinite(v) && v >= 1) {
        opts = normalizeBibleSearchOptions({ ...opts, limit: Math.min(v, 100000) });
        savedOptions = { ...opts };
        persistOptions(opts);
      }
    }

    abortOngoing();
    const controller = new AbortController();
    activeController = controller;

    selectedBook = 0;
    refineQuery = '';
    checkedKeys.clear();
    focusedIdx = -1;
    errorText = '';
    isSearching = true;
    pushSearchHistory(clean);

    const isAll = targetBibleVal === ALL_BIBLES_VALUE;
    const isFav = targetBibleVal === FAV_BIBLES_VALUE;
    const chosenBible = getSelectedBibleObj();
    const chosenLabel = getPreferredBibleLabel(chosenBible, 'Bíblia');

    if (isFav && !allBibles.some((b) => b.isFavorite)) {
      isSearching = false;
      searchResult = { items: [], totalOccurrences: 0, byBook: [], chapterCount: 0, truncated: false, searchedCount: 0 };
      statusText = 'Nenhuma Bíblia marcada como favorita. Marque estrelas no seletor de Bíblias.';
      renderBookBar();
      renderResults({ resetList: true });
      return;
    }

    statusText = isAll
      ? `Pesquisando "${clean}" em todas as Bíblias...`
      : isFav
        ? `Pesquisando "${clean}" nas Bíblias favoritas...`
        : `Pesquisando "${clean}" em ${chosenLabel}...`;

    renderBookBar();
    renderResults({ resetList: true });

    try {
      let res;
      if (isAll || isFav) {
        const multiOpts = { ...opts, favoritesOnly: isFav };
        res = await searchAcrossBibles(allBibles, clean, multiOpts, {
          activePath: activeBible ? activeBible.path : '',
          currentBook: curState.book,
          currentChapter: curState.chapter,
          perBibleMax: Math.min(80, opts.limit),
          maxTotal: Math.min(opts.limit, 2500),
          concurrency: 4,
          signal: controller.signal,
          onProgress: (done, total, found) => {
            if (!isAlive()) {
              controller.abort();
              return;
            }
            const p = document.getElementById('ms-progress-text');
            if (p) p.textContent = `Pesquisando "${clean}" (${done}/${total} Bíblias · ${found} versículo(s))...`;
          }
        });
      } else {
        res = await searchBibleModule(chosenBible, clean, opts, {
          currentBook: curState.book,
          currentChapter: curState.chapter,
          maxResults: opts.limit,
          signal: controller.signal,
          onProgress: (done, total, found) => {
            if (!isAlive()) {
              controller.abort();
              return;
            }
            const pct = Math.round((done / Math.max(1, total)) * 100);
            const p = document.getElementById('ms-progress-text');
            if (p) {
              p.textContent = `Pesquisando "${clean}" em ${chosenLabel} (${pct}% · ${found} versículo(s))...`;
            }
          }
        });
      }

      if (controller.signal.aborted || !isAlive()) return;

      isSearching = false;
      searchResult = res;
      focusedIdx = res.items.length ? 0 : -1;
      statusText = res.items.length
        ? ''
        : `Nenhum versículo encontrado para "${clean}" com os filtros selecionados.`;

      if (res.items.length > 0 && window.innerHeight < 760) {
        filtersCollapsed = true;
      }

      persistSessionSnapshot();
      renderFiltersPanel();
      renderBookBar();
      renderResults({ resetList: true });

      const scrollEl = document.getElementById('ms-results-scroll');
      if (scrollEl) scrollEl.scrollTop = 0;
    } catch (err) {
      if (controller.signal.aborted || !isAlive()) return;
      const msg = err && err.message ? err.message : 'Erro ao executar pesquisa bíblica.';
      appLogger.error('BIBLE_SEARCH', `Erro ao pesquisar "${clean}": ${msg}`, {
        targetBibleVal,
        options: opts,
        error: err
      });
      isSearching = false;
      searchResult = null;
      errorText = msg;
      renderBookBar();
      renderResults({ resetList: true });
    }
  }

  renderShell();
  renderFiltersPanel();
  renderAuxDrawer();
  renderBookBar();
  renderResults({ resetList: true });

  if (autoRun && queryText.trim()) {
    runSearch();
  } else if (!canReuse) {
    window.requestAnimationFrame(() => {
      document.getElementById('ms-query-input')?.focus();
    });
  }
}
