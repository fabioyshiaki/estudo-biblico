import { openModalShell, closeModal } from './nav-modal.js';
import { store } from '../core/store.js';
import { appLogger } from '../core/logger.js';
import {
  BIBLE_SCOPE_GROUPS,
  DEFAULT_BIBLE_SEARCH_OPTIONS,
  normalizeBibleSearchOptions,
  searchBibleModule,
  searchAcrossBibles
} from '../formats/bible-search.js';

const OPTS_STORAGE_KEY = 'estudo_biblico_bible_search_opts_v1';
const HIST_STORAGE_KEY = 'estudo_biblico_bible_search_hist_v1';
const MAX_HISTORY = 12;
const RENDER_CHUNK = 80;

const TARGET_FIELDS = [
  { id: 'text', label: 'Texto bíblico' },
  { id: 'strong', label: 'Strong (H/G)' },
  { id: 'morph', label: 'Morfologia' },
  { id: 'notes', label: 'Notas e títulos' },
  { id: 'redLetter', label: 'Palavras de Jesus' },
  { id: 'all', label: 'Todos os dados' }
];

const MATCH_MODES = [
  { id: 'contains', label: 'Parte da palavra' },
  { id: 'startsWith', label: 'Começa com' },
  { id: 'exact', label: 'Palavra exata' }
];

const LOGIC_MODES = [
  { id: 'and', label: 'Todas (E)' },
  { id: 'or', label: 'Qualquer (OU)' },
  { id: 'phrase', label: 'Frase exata' }
];

const TOGGLE_OPTIONS = [
  { key: 'accentSensitive', label: 'Diferenciar acentos' },
  { key: 'caseSensitive', label: 'Maiúsculas (Aa)' },
  { key: 'useRegex', label: 'Regex' },
  { key: 'favoritesOnly', label: 'Só favoritas ★' }
];

const TARGET_LABELS = {
  text: 'Texto bíblico',
  strong: 'Strong',
  morph: 'Morfologia',
  notes: 'Notas/Títulos',
  redLetter: 'Palavras de Jesus',
  all: 'Todos os dados'
};

let savedOptions = loadSavedOptions();
let recentHistory = loadRecentHistory();

// Mantém a última busca aberta em memória para voltar aos resultados sem reconsultar o SQLite
let sessionState = {
  query: '',
  mode: 'single', // 'single' | 'all'
  biblePath: '',
  results: null,  // { items, totalOccurrences, byBook, truncated, effectiveTarget, autoStrong, searchedCount }
  selectedBook: 0
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
    // Ignora se localStorage estiver indisponível
  }
}

function loadRecentHistory() {
  try {
    const raw = window.localStorage.getItem(HIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string' && s.trim()).slice(0, MAX_HISTORY) : [];
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
    // Ignora se localStorage estiver indisponível
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

function getActiveOptionTags(opts) {
  const tags = [];
  if (opts.targetField !== 'text') tags.push(TARGET_LABELS[opts.targetField] || opts.targetField);
  if (opts.scope !== 'all') {
    const grp = BIBLE_SCOPE_GROUPS[opts.scope];
    if (grp) tags.push(grp.label);
  }
  if (opts.matchMode === 'exact') tags.push('Palavra exata');
  else if (opts.matchMode === 'startsWith') tags.push('Começa com');
  if (opts.logic === 'or') tags.push('Qualquer (OU)');
  else if (opts.logic === 'phrase') tags.push('Frase exata');
  if (opts.accentSensitive) tags.push('Com acento');
  if (opts.caseSensitive) tags.push('Maiúsculas (Aa)');
  if (opts.useRegex) tags.push('Regex');
  if (opts.favoritesOnly) tags.push('Só favoritas ★');
  return tags;
}

export function clearBibleSearchSession() {
  sessionState = {
    query: '',
    mode: 'single',
    biblePath: '',
    results: null,
    selectedBook: 0
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
  const activeBible = store.getActiveBible();
  const allBibles = store.getBibles();

  const modal = openModalShell({ title: 'Pesquisar na Bíblia' });
  if (!modal || !modal.body) return;

  if (!allBibles.length) {
    modal.body.innerHTML = `
      <div class="empty-state">
        <h2>Nenhuma Bíblia instalada</h2>
        <p>Adicione ao menos uma Bíblia (.bbl.mybible) em Configurações → Fontes para pesquisar passagens.</p>
        <div class="empty-state-actions">
          <button type="button" class="primary-btn" id="bsearch-go-sources">Configurar Fontes</button>
        </div>
      </div>
    `;
    modal.body.querySelector('#bsearch-go-sources')?.addEventListener('click', () => {
      closeModal();
      if (typeof onOpenSources === 'function') onOpenSources();
    });
    return;
  }

  const activePath = activeBible ? activeBible.path : allBibles[0].path;
  const cleanInitial = String(initialQuery || '').trim();

  // Reaproveita resultados anteriores da sessão se não veio nova palavra e a Bíblia não mudou
  const reuseSession =
    !cleanInitial &&
    Boolean(sessionState.results) &&
    (sessionState.mode === 'all' || sessionState.biblePath === activePath);

  let queryText = cleanInitial || (reuseSession ? sessionState.query : '');
  let searchMode = reuseSession ? sessionState.mode : 'single';
  let optionsOpen = false;
  let opts = { ...savedOptions };
  let searchResult = reuseSession ? sessionState.results : null;
  let selectedBook = reuseSession ? sessionState.selectedBook : 0;
  let renderedCount = 0;
  let isSearching = false;
  let statusText = '';
  let errorText = '';
  let activeController = null;

  modal.body.innerHTML = `
    <div class="bsearch-sticky" id="bsearch-sticky"></div>
    <div id="bsearch-body"></div>
  `;

  const stickyEl = modal.body.querySelector('#bsearch-sticky');
  const bodyEl = modal.body.querySelector('#bsearch-body');

  function isAlive() {
    return Boolean(bodyEl && document.body.contains(bodyEl));
  }

  function abortOngoing() {
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
  }

  function getFilteredItems() {
    if (!searchResult || !Array.isArray(searchResult.items)) return [];
    if (!selectedBook) return searchResult.items;
    return searchResult.items.filter((it) => it.book === selectedBook);
  }

  function buildStickyHtml() {
    const activeTags = getActiveOptionTags(opts);
    const optsBtnCls = optionsOpen || activeTags.length ? ' is-active' : '';
    const badgeHtml = activeTags.length
      ? `<span class="dct-opts-badge">${activeTags.length}</span>`
      : '';
    const bibleLabel = activeBible ? (activeBible.abbr || activeBible.title) : 'Bíblia';
    const placeholder = opts.targetField === 'strong'
      ? 'Ex.: H430, G26, H430 H1254...'
      : opts.targetField === 'morph'
        ? 'Ex.: V-AAI-3S, N-NSM...'
        : `Buscar em ${bibleLabel}, Strong (H430, G26) ou frase...`;

    let optsHtml = '';
    if (optionsOpen) {
      const resetHtml = activeTags.length
        ? '<button type="button" class="dct-opts-reset" id="bsearch-reset-opts">Restaurar padrão</button>'
        : '';

      const scopeOptionsHtml = Object.values(BIBLE_SCOPE_GROUPS).map((g) => (
        `<option value="${g.id}"${opts.scope === g.id ? ' selected' : ''}>${escapeHtml(g.label)}</option>`
      )).join('');

      optsHtml = `
        <div class="bsearch-opts-panel" id="bsearch-opts-panel">
          <div class="bsearch-opt-group">
            <div class="bsearch-opt-row">
              <span class="bsearch-opt-title">Onde buscar</span>
              ${resetHtml}
            </div>
            <div class="bsearch-chips">
              ${TARGET_FIELDS.map((t) => (
                `<button type="button" class="bsearch-chip${opts.targetField === t.id ? ' is-solid' : ''}" data-bs-target="${t.id}">${escapeHtml(t.label)}</button>`
              )).join('')}
            </div>
          </div>

          <div class="bsearch-opt-group">
            <span class="bsearch-opt-title">Escopo bíblico</span>
            <select class="bsearch-select" id="bsearch-scope-select" aria-label="Escopo bíblico">
              ${scopeOptionsHtml}
            </select>
          </div>

          <div class="bsearch-opt-group">
            <span class="bsearch-opt-title">Correspondência</span>
            <div class="bsearch-chips">
              ${MATCH_MODES.map((m) => (
                `<button type="button" class="bsearch-chip${opts.matchMode === m.id ? ' is-solid' : ''}" data-bs-match="${m.id}">${escapeHtml(m.label)}</button>`
              )).join('')}
            </div>
          </div>

          <div class="bsearch-opt-group">
            <span class="bsearch-opt-title">Combinação de palavras</span>
            <div class="bsearch-chips">
              ${LOGIC_MODES.map((l) => (
                `<button type="button" class="bsearch-chip${opts.logic === l.id ? ' is-solid' : ''}" data-bs-logic="${l.id}">${escapeHtml(l.label)}</button>`
              )).join('')}
            </div>
          </div>

          <div class="bsearch-opt-group">
            <span class="bsearch-opt-title">Refinamentos</span>
            <div class="bsearch-chips">
              ${TOGGLE_OPTIONS.map((t) => {
                const on = Boolean(opts[t.key]);
                return `<button type="button" class="bsearch-chip${on ? ' is-active' : ''}" data-bs-toggle="${t.key}" aria-pressed="${on ? 'true' : 'false'}">${on ? '&#10003; ' : ''}${escapeHtml(t.label)}</button>`;
              }).join('')}
            </div>
          </div>

          <div class="bsearch-hint">
            Dica: use <strong>-palavra</strong> para excluir (ex.: <em>amor -mundo</em>), aspas para frase (<em>"no princípio" Deus</em>) ou códigos Strong (<em>H430</em>, <em>G26</em>).
          </div>
        </div>
      `;
    } else if (activeTags.length) {
      optsHtml = `
        <div class="dct-active-filters" style="margin-top:0;">
          ${activeTags.map((tag) => `<button type="button" class="dct-filter-pill" data-bs-open-opts="1">${escapeHtml(tag)}</button>`).join('')}
        </div>
      `;
    }

    let bookBarHtml = '';
    if (!isSearching && searchResult && Array.isArray(searchResult.byBook) && searchResult.byBook.length > 1) {
      bookBarHtml = `
        <div class="bsearch-book-bar" id="bsearch-book-bar">
          <button type="button" class="bsearch-book-chip${selectedBook === 0 ? ' is-active' : ''}" data-bs-book="0">
            Todos (${searchResult.items.length})
          </button>
          ${searchResult.byBook.map((b) => (
            `<button type="button" class="bsearch-book-chip${selectedBook === b.book ? ' is-active' : ''}" data-bs-book="${b.book}">` +
              `${escapeHtml(b.name)} (${b.count})` +
            '</button>'
          )).join('')}
        </div>
      `;
    }

    return `
      <form class="bsearch-form" id="bsearch-form">
        <div class="bsearch-input-wrap">
          <input
            type="search"
            class="bsearch-input"
            id="bsearch-input"
            value="${escapeHtml(queryText)}"
            placeholder="${escapeHtml(placeholder)}"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          />
          <button type="button" class="bsearch-clear-btn${queryText.length ? '' : ' hidden'}" id="bsearch-clear" aria-label="Limpar busca">&times;</button>
        </div>
        <button type="submit" class="bsearch-btn is-primary" id="bsearch-btn-one">Buscar</button>
        <button type="button" class="bsearch-btn" id="bsearch-btn-all">Todas</button>
        <button type="button" class="bsearch-btn${optsBtnCls}" id="bsearch-btn-opts" aria-expanded="${optionsOpen ? 'true' : 'false'}">&#9881; Opções${badgeHtml}</button>
      </form>
      ${optsHtml}
      ${bookBarHtml}
    `;
  }

  function buildCardHtml(item, idx) {
    const showModBadge = searchMode === 'all' && item.module;
    const modBadge = showModBadge
      ? `<span class="bsearch-badge">${escapeHtml(item.module.abbr || item.module.title)}</span>`
      : '';

    const extraBadges = (Array.isArray(item.matchedBadges) ? item.matchedBadges : []).map((b) => {
      const isStrong = /^[GH]\d+/i.test(b);
      return `<span class="bsearch-badge${isStrong ? ' bsearch-badge--strong' : ''}">${escapeHtml(b)}</span>`;
    }).join('');

    const dirAttr = item.isRtl ? ' dir="rtl"' : '';

    return (
      `<button type="button" class="bsearch-card" data-bs-res-idx="${idx}">` +
        '<div class="bsearch-card-head">' +
          `<span class="bsearch-ref">${escapeHtml(item.refLabel)}</span>` +
          `<span class="bsearch-badges">${extraBadges}${modBadge}</span>` +
        '</div>' +
        `<div class="bsearch-text"${dirAttr}>${item.snippetHtml}</div>` +
      '</button>'
    );
  }

  function renderSticky() {
    if (!stickyEl) return;
    stickyEl.innerHTML = buildStickyHtml();
    bindStickyEvents();
  }

  function renderBody({ resetList = true } = {}) {
    if (!bodyEl) return;

    if (isSearching) {
      bodyEl.innerHTML = `
        <div class="empty-state">
          <p id="bsearch-progress">${escapeHtml(statusText || 'Pesquisando na Bíblia...')}</p>
          <div class="empty-state-actions">
            <button type="button" class="secondary-btn" id="bsearch-cancel">Cancelar</button>
          </div>
        </div>
      `;
      bodyEl.querySelector('#bsearch-cancel')?.addEventListener('click', () => {
        abortOngoing();
        isSearching = false;
        statusText = '';
        renderSticky();
        renderBody();
      });
      return;
    }

    if (errorText) {
      bodyEl.innerHTML = `
        <div class="empty-state">
          <h2>Erro na pesquisa</h2>
          <p>${escapeHtml(errorText)}</p>
          <div class="empty-state-actions">
            <button type="button" class="secondary-btn" id="bsearch-open-logs">Abrir Logs</button>
          </div>
        </div>
      `;
      bodyEl.querySelector('#bsearch-open-logs')?.addEventListener('click', () => {
        closeModal();
        if (typeof onOpenLogs === 'function') onOpenLogs();
      });
      return;
    }

    if (!searchResult) {
      const histHtml = recentHistory.length
        ? `
          <div class="settings-card" style="margin-top:8px;">
            <div class="bsearch-opt-row" style="margin-bottom:6px;">
              <span class="bsearch-opt-title">Pesquisas recentes</span>
              <button type="button" class="dct-opts-reset" id="bsearch-clear-hist">Limpar</button>
            </div>
            <div class="bsearch-history">
              ${recentHistory.map((h) => `<button type="button" class="bsearch-chip" data-bs-hist="${escapeHtml(h)}">${escapeHtml(h)}</button>`).join('')}
            </div>
          </div>
        `
        : '';

      const curBibleName = activeBible ? (activeBible.title || activeBible.abbr) : '';
      bodyEl.innerHTML = `
        <div class="empty-state" style="padding:18px 10px;">
          <h2>Pesquisador Bíblico</h2>
          <p>Pesquise palavras em qualquer idioma (português, grego, hebraico, aramaico, siríaco, inglês), códigos Strong (ex.: H430, G26), morfologia, notas, palavras de Jesus ou qualquer dado de <strong>${escapeHtml(curBibleName)}</strong> ou de todas as Bíblias.</p>
        </div>
        ${histHtml}
      `;

      bodyEl.querySelector('#bsearch-clear-hist')?.addEventListener('click', () => {
        clearSearchHistory();
        renderBody();
      });
      bodyEl.querySelectorAll('[data-bs-hist]').forEach((btn) => {
        btn.addEventListener('click', () => {
          queryText = btn.getAttribute('data-bs-hist') || '';
          runSearch(searchMode);
        });
      });
      return;
    }

    const filtered = getFilteredItems();

    if (!filtered.length) {
      const actions = [];
      if (searchMode !== 'all' && allBibles.length > 1) {
        actions.push('<button type="button" class="primary-btn" id="bsearch-retry-all">Buscar em todas as Bíblias</button>');
      }
      if (opts.targetField !== 'all') {
        actions.push('<button type="button" class="secondary-btn" id="bsearch-retry-raw">Buscar em todos os dados</button>');
      }
      if (opts.scope !== 'all') {
        actions.push('<button type="button" class="secondary-btn" id="bsearch-retry-whole">Buscar na Bíblia inteira</button>');
      }

      bodyEl.innerHTML = `
        <div class="empty-state">
          <h2>Nenhum versículo encontrado</h2>
          <p>${escapeHtml(statusText || `Nenhuma ocorrência encontrada para "${queryText}".`)}</p>
          ${actions.length ? `<div class="empty-state-actions">${actions.join('')}</div>` : ''}
        </div>
      `;

      bodyEl.querySelector('#bsearch-retry-all')?.addEventListener('click', () => runSearch('all'));
      bodyEl.querySelector('#bsearch-retry-raw')?.addEventListener('click', () => {
        opts = normalizeBibleSearchOptions({ ...opts, targetField: 'all' });
        savedOptions = { ...opts };
        persistOptions(opts);
        runSearch(searchMode);
      });
      bodyEl.querySelector('#bsearch-retry-whole')?.addEventListener('click', () => {
        opts = normalizeBibleSearchOptions({ ...opts, scope: 'all' });
        savedOptions = { ...opts };
        persistOptions(opts);
        runSearch(searchMode);
      });
      return;
    }

    if (resetList) {
      renderedCount = Math.min(RENDER_CHUNK, filtered.length);
      const batch = filtered.slice(0, renderedCount);
      const filteredOcc = filtered.reduce((acc, it) => acc + (it.hitCount || 1), 0);
      const sourceInfo = searchMode === 'all'
        ? (opts.favoritesOnly ? `Favoritas (${searchResult.searchedCount || 0})` : `${searchResult.searchedCount || allBibles.length} Bíblia(s)`)
        : (activeBible ? (activeBible.abbr || activeBible.title) : 'Bíblia');

      const autoStrongNote = searchResult.autoStrong ? ' • Strong detectado' : '';
      const truncNote = searchResult.truncated ? ' • limite atingido' : '';

      bodyEl.innerHTML = `
        <div class="bsearch-summary" style="margin-bottom:8px;">
          <span><strong>${filtered.length}</strong> versículo(s) · ${filteredOcc} ocorrência(s)${escapeHtml(autoStrongNote)}${escapeHtml(truncNote)}</span>
          <span>${escapeHtml(sourceInfo)}</span>
        </div>
        <div class="bsearch-results" id="bsearch-results-list">
          ${batch.map((it, idx) => buildCardHtml(it, idx)).join('')}
        </div>
        <div class="bsearch-footer" id="bsearch-footer"></div>
      `;

      bindResultsEvents();
      updateFooter(filtered);
    } else {
      const listEl = bodyEl.querySelector('#bsearch-results-list');
      if (!listEl) return;
      const nextEnd = Math.min(renderedCount + RENDER_CHUNK, filtered.length);
      if (nextEnd <= renderedCount) return;

      const nextBatch = filtered.slice(renderedCount, nextEnd);
      const htmlChunk = nextBatch.map((it, offsetIdx) => buildCardHtml(it, renderedCount + offsetIdx)).join('');
      renderedCount = nextEnd;
      listEl.insertAdjacentHTML('beforeend', htmlChunk);
      updateFooter(filtered);
    }
  }

  function updateFooter(filtered) {
    const footerEl = bodyEl && bodyEl.querySelector('#bsearch-footer');
    if (!footerEl) return;
    if (renderedCount < filtered.length) {
      const rest = filtered.length - renderedCount;
      footerEl.innerHTML = `<button type="button" class="secondary-btn" id="bsearch-more">Mostrar mais (${rest} restante(s))</button>`;
      footerEl.querySelector('#bsearch-more')?.addEventListener('click', () => {
        renderBody({ resetList: false });
      });
    } else {
      footerEl.innerHTML = '';
    }
  }

  function bindResultsEvents() {
    const listEl = bodyEl && bodyEl.querySelector('#bsearch-results-list');
    if (!listEl) return;

    listEl.addEventListener('click', (ev) => {
      const card = ev.target.closest('[data-bs-res-idx]');
      if (!card) return;
      const idx = Number(card.getAttribute('data-bs-res-idx'));
      const filtered = getFilteredItems();
      const item = filtered[idx];
      if (!item) return;

      closeModal();
      if (typeof onNavigateVerse === 'function') {
        onNavigateVerse({
          modulePath: item.module ? item.module.path : activePath,
          book: item.book,
          chapter: item.chapter,
          verse: item.verse
        });
      }
    });
  }

  function applyOptionChange(partial) {
    const input = stickyEl && stickyEl.querySelector('#bsearch-input');
    if (input) queryText = input.value || '';

    opts = normalizeBibleSearchOptions({ ...opts, ...partial });
    savedOptions = { ...opts };
    persistOptions(opts);

    if (searchResult && queryText.trim()) {
      runSearch(searchMode);
    } else {
      renderSticky();
    }
  }

  function bindStickyEvents() {
    const form = stickyEl.querySelector('#bsearch-form');
    const input = stickyEl.querySelector('#bsearch-input');
    const clearBtn = stickyEl.querySelector('#bsearch-clear');

    input?.addEventListener('input', () => {
      queryText = input.value || '';
      clearBtn?.classList.toggle('hidden', !queryText.length);
    });

    clearBtn?.addEventListener('click', () => {
      queryText = '';
      searchResult = null;
      selectedBook = 0;
      errorText = '';
      clearBibleSearchSession();
      renderSticky();
      renderBody();
      stickyEl.querySelector('#bsearch-input')?.focus();
    });

    form?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (input) queryText = input.value || '';
      runSearch('single');
    });

    stickyEl.querySelector('#bsearch-btn-all')?.addEventListener('click', () => {
      if (input) queryText = input.value || '';
      runSearch('all');
    });

    stickyEl.querySelector('#bsearch-btn-opts')?.addEventListener('click', () => {
      if (input) queryText = input.value || '';
      optionsOpen = !optionsOpen;
      renderSticky();
    });

    stickyEl.querySelectorAll('[data-bs-open-opts]').forEach((pill) => {
      pill.addEventListener('click', () => {
        if (input) queryText = input.value || '';
        optionsOpen = true;
        renderSticky();
      });
    });

    stickyEl.querySelector('#bsearch-reset-opts')?.addEventListener('click', () => {
      applyOptionChange({ ...DEFAULT_BIBLE_SEARCH_OPTIONS });
    });

    stickyEl.querySelectorAll('[data-bs-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-bs-target');
        if (val && val !== opts.targetField) applyOptionChange({ targetField: val });
      });
    });

    stickyEl.querySelector('#bsearch-scope-select')?.addEventListener('change', (ev) => {
      const val = ev.target.value;
      if (val && val !== opts.scope) applyOptionChange({ scope: val });
    });

    stickyEl.querySelectorAll('[data-bs-match]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-bs-match');
        if (val && val !== opts.matchMode) applyOptionChange({ matchMode: val });
      });
    });

    stickyEl.querySelectorAll('[data-bs-logic]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-bs-logic');
        if (val && val !== opts.logic) applyOptionChange({ logic: val });
      });
    });

    stickyEl.querySelectorAll('[data-bs-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-bs-toggle');
        if (!key || !Object.prototype.hasOwnProperty.call(opts, key)) return;
        applyOptionChange({ [key]: !opts[key] });
      });
    });

    stickyEl.querySelectorAll('[data-bs-book]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextBook = Number(btn.getAttribute('data-bs-book')) || 0;
        if (nextBook === selectedBook) return;
        selectedBook = nextBook;
        sessionState.selectedBook = selectedBook;
        renderSticky();
        renderBody({ resetList: true });
        modal.body.scrollTop = 0;
      });
    });
  }

  async function runSearch(mode) {
    const clean = String(queryText || '').trim();
    if (!clean) {
      statusText = 'Digite uma palavra, frase ou código Strong para pesquisar.';
      errorText = '';
      searchResult = null;
      renderSticky();
      renderBody();
      return;
    }

    abortOngoing();
    const controller = new AbortController();
    activeController = controller;

    searchMode = mode === 'all' ? 'all' : 'single';
    selectedBook = 0;
    errorText = '';
    isSearching = true;
    pushSearchHistory(clean);

    const curState = store.getState();
    const curBible = store.getActiveBible() || allBibles[0];

    if (searchMode === 'all' && opts.favoritesOnly && !allBibles.some((b) => b.isFavorite)) {
      isSearching = false;
      searchResult = { items: [], totalOccurrences: 0, byBook: [], truncated: false, searchedCount: 0 };
      statusText = 'Nenhuma Bíblia marcada como favorita. Desative "Só favoritas ★" ou favorite Bíblias no seletor.';
      renderSticky();
      renderBody({ resetList: true });
      return;
    }

    statusText = searchMode === 'all'
      ? `Pesquisando "${clean}" em todas as Bíblias...`
      : `Pesquisando "${clean}" em ${curBible.abbr || curBible.title}...`;

    renderSticky();
    renderBody();

    try {
      let res;
      if (searchMode === 'all') {
        res = await searchAcrossBibles(allBibles, clean, opts, {
          activePath: curBible.path,
          currentBook: curState.book,
          currentChapter: curState.chapter,
          perBibleMax: 35,
          maxTotal: 350,
          concurrency: 4,
          signal: controller.signal,
          onProgress: (done, total, found) => {
            if (!isAlive()) {
              controller.abort();
              return;
            }
            const pEl = bodyEl.querySelector('#bsearch-progress');
            if (pEl) {
              pEl.textContent = `Pesquisando "${clean}" (${done}/${total} Bíblias · ${found} versículo(s))...`;
            }
          }
        });
      } else {
        res = await searchBibleModule(curBible, clean, opts, {
          currentBook: curState.book,
          currentChapter: curState.chapter,
          maxResults: 450,
          signal: controller.signal,
          onProgress: (done, total, found) => {
            if (!isAlive()) {
              controller.abort();
              return;
            }
            const pEl = bodyEl.querySelector('#bsearch-progress');
            if (pEl) {
              const pct = Math.round((done / Math.max(1, total)) * 100);
              pEl.textContent = `Pesquisando "${clean}" em ${curBible.abbr || curBible.title} (${pct}% · ${found} versículo(s))...`;
            }
          }
        });
      }

      if (controller.signal.aborted || !isAlive()) return;

      isSearching = false;
      searchResult = res;
      statusText = res.items.length
        ? ''
        : `Nenhuma ocorrência encontrada para "${clean}" com os filtros atuais.`;

      sessionState = {
        query: clean,
        mode: searchMode,
        biblePath: curBible.path,
        results: res,
        selectedBook: 0
      };

      renderSticky();
      renderBody({ resetList: true });
      modal.body.scrollTop = 0;
    } catch (err) {
      if (controller.signal.aborted || !isAlive()) return;
      const msg = err && err.message ? err.message : 'Erro ao pesquisar na Bíblia.';
      appLogger.error('BIBLE_SEARCH', `Falha ao pesquisar "${clean}" (${searchMode}): ${msg}`, {
        bible: curBible ? (curBible.fileName || curBible.abbr) : '',
        options: opts,
        error: err
      });
      isSearching = false;
      searchResult = null;
      errorText = msg;
      renderSticky();
      renderBody();
    }
  }

  // Rolagem infinita dos resultados
  modal.body.addEventListener('scroll', () => {
    if (isSearching || !searchResult) return;
    const filtered = getFilteredItems();
    if (renderedCount >= filtered.length) return;
    const remaining = modal.body.scrollHeight - modal.body.scrollTop - modal.body.clientHeight;
    if (remaining < 260) {
      renderBody({ resetList: false });
    }
  });

  renderSticky();
  renderBody({ resetList: true });

  if (autoRun && queryText.trim()) {
    runSearch('single');
  } else if (!reuseSession) {
    window.requestAnimationFrame(() => {
      stickyEl.querySelector('#bsearch-input')?.focus();
    });
  }
}
