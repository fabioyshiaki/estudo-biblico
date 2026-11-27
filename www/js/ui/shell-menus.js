import { nativeBridge } from '../bridge/native-bridge.js';
import { store } from '../core/store.js';
import { eventBus, EVENTS } from '../core/events.js';
import { formatReference } from '../core/canon.js';
import {
  normalizeLookupTerm,
  normalizeDictSearchOptions
} from '../formats/mysword-dictionary.js';
import {
  findDictionariesWithTerm,
  getCachedDictionariesWithTerm
} from '../formats/dictionary-lookup.js';
import {
  findCommentariesForPassage,
  getCachedCommentariesForPassage
} from '../formats/mysword-commentary.js';

const RECENT_STORAGE_KEY = 'estudo_biblico_recent_mods_v1';
const MAX_RECENT = 14;

let recentMap = loadRecents();
let activePopoverCleanup = null;

function normalizeKind(kind) {
  if (kind === 'dictionary' || kind === 'commentary') return kind;
  return 'bible';
}

function loadRecents() {
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return { bible: [], commentary: [], dictionary: [] };
    const parsed = JSON.parse(raw);
    return {
      bible: Array.isArray(parsed && parsed.bible) ? parsed.bible.slice(0, MAX_RECENT) : [],
      commentary: Array.isArray(parsed && parsed.commentary) ? parsed.commentary.slice(0, MAX_RECENT) : [],
      dictionary: Array.isArray(parsed && parsed.dictionary) ? parsed.dictionary.slice(0, MAX_RECENT) : []
    };
  } catch (err) {
    return { bible: [], commentary: [], dictionary: [] };
  }
}

function saveRecents() {
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentMap));
  } catch (err) {
    // Ignora se localStorage estiver indisponível
  }
}

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
  const hay = normalizeSearch(
    `${mod.abbr || ''} ${mod.title || ''} ${mod.language || ''} ${mod.fileName || ''}`
  );
  return terms.every((t) => hay.includes(t));
}

function getModuleSortBy() {
  return store.getPrefs().bibleSortBy === 'title' ? 'title' : 'abbr';
}

function getModulePrimaryLabel(mod) {
  if (!mod) return '';
  if (getModuleSortBy() === 'title') {
    return mod.title || mod.abbr || mod.fileName || '';
  }
  return mod.abbr || mod.title || mod.fileName || '';
}

function getModuleSecondaryLabel(mod) {
  if (!mod) return '';
  const primary = getModulePrimaryLabel(mod);
  const other = getModuleSortBy() === 'title' ? (mod.abbr || '') : (mod.title || '');
  return other && other !== primary ? other : '';
}

function getModuleTooltip(mod) {
  if (!mod) return '';
  const primary = getModulePrimaryLabel(mod);
  const secondary = getModuleSecondaryLabel(mod);
  return secondary ? `${primary} — ${secondary}` : primary;
}

export function recordRecentModule(kind, modulePath) {
  const k = normalizeKind(kind);
  const p = String(modulePath || '').trim();
  if (!p) return;
  const current = Array.isArray(recentMap[k]) ? recentMap[k] : [];
  recentMap[k] = [p, ...current.filter((x) => x !== p)].slice(0, MAX_RECENT);
  saveRecents();
}

export function getQuickModulesList(kind, modules, activePath = '', maxItems = 8) {
  const k = normalizeKind(kind);
  const list = Array.isArray(modules) ? modules : [];
  if (!list.length) return [];

  const byPath = new Map(list.map((m) => [m.path, m]));
  const picked = [];
  const seen = new Set();
  if (activePath) seen.add(activePath);

  const pushIfNew = (mod) => {
    if (!mod || !mod.path || seen.has(mod.path)) return;
    seen.add(mod.path);
    picked.push(mod);
  };

  // 1. Favoritos primeiro
  for (const mod of list) {
    if (picked.length >= maxItems) break;
    if (mod.isFavorite) pushIfNew(mod);
  }

  // 2. Recentes usados
  for (const p of recentMap[k] || []) {
    if (picked.length >= maxItems) break;
    pushIfNew(byPath.get(p));
  }

  // 3. Completa com os primeiros da lista
  for (const mod of list) {
    if (picked.length >= maxItems) break;
    pushIfNew(mod);
  }

  return picked;
}

export function renderQuickTabs(containerEl, kind, modules, activePath, onSelect) {
  if (!containerEl) return;
  const quick = getQuickModulesList(kind, modules, activePath, 8);
  if (!quick.length) {
    containerEl.innerHTML = '';
    return;
  }

  containerEl.innerHTML = quick.map((m) => {
    const label = getModulePrimaryLabel(m);
    return (
      `<button type="button" class="ms-quick-tab" data-quick-path="${escapeHtml(m.path)}" title="${escapeHtml(getModuleTooltip(m))}">` +
        escapeHtml(label) +
      '</button>'
    );
  }).join('');

  containerEl.onclick = (ev) => {
    const btn = ev.target.closest('[data-quick-path]');
    if (!btn) return;
    const path = btn.getAttribute('data-quick-path') || '';
    if (path && typeof onSelect === 'function') {
      onSelect(path);
    }
  };
}

export function closeShellPopover() {
  if (typeof activePopoverCleanup === 'function') {
    try {
      activePopoverCleanup();
    } catch (err) {
      // Ignora erro na limpeza
    }
    activePopoverCleanup = null;
  }
}

function createAnchoredPopover({ anchorEl, align = 'left', width = 320, maxHeightRatio = 0.84 }) {
  closeShellPopover();

  const backdrop = document.createElement('div');
  backdrop.className = 'ms-popover-backdrop';
  backdrop.setAttribute('data-bref-skip', '1');

  const panel = document.createElement('div');
  panel.className = 'ms-popover-panel';
  panel.setAttribute('role', 'menu');
  panel.setAttribute('data-bref-skip', '1');

  const vw = window.innerWidth || 360;
  const vh = window.innerHeight || 640;
  const topbar = document.getElementById('topbar');
  const topRect = topbar ? topbar.getBoundingClientRect() : null;
  const anchorRect = anchorEl ? anchorEl.getBoundingClientRect() : null;

  const panelW = Math.min(width, vw - 12);
  const top = Math.max(44, Math.round(topRect ? topRect.bottom : (anchorRect ? anchorRect.bottom : 48)));
  const maxH = Math.max(200, Math.min(Math.round(vh * maxHeightRatio), vh - top - 10));

  let left = 6;
  if (align === 'right') {
    left = Math.max(6, vw - panelW - 6);
  } else if (anchorRect) {
    left = Math.max(6, Math.min(Math.round(anchorRect.left), vw - panelW - 6));
  }

  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  panel.style.width = `${panelW}px`;
  panel.style.maxHeight = `${maxH}px`;

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  let extraCleanup = null;

  const close = () => {
    if (typeof extraCleanup === 'function') {
      try {
        extraCleanup();
      } catch (err) {
        // Ignora erro
      }
      extraCleanup = null;
    }
    backdrop.remove();
    panel.remove();
    window.removeEventListener('keydown', onKey);
    activePopoverCleanup = null;
  };

  const onKey = (ev) => {
    if (ev.key === 'Escape') close();
  };

  backdrop.addEventListener('click', close);
  window.addEventListener('keydown', onKey);
  activePopoverCleanup = close;

  return {
    panel,
    close,
    setCleanup(fn) {
      extraCleanup = fn;
    }
  };
}

export function openViewsDropdown({
  anchorEl,
  onSelectMode,
  onOpenMaps,
  onOpenUnifiedSearch,
  onOpenBibleSearch,
  onOpenDictTerms,
  onOpenSettings,
  onOpenLogs,
  onQuickSelectBible,
  onQuickSelectCommentary,
  onQuickSelectDict
} = {}) {
  const pop = createAnchoredPopover({ anchorEl, align: 'left', width: 290 });
  const mode = store.getActiveMode();
  const isBible = mode === 'bible';
  const isCmt = mode === 'commentary';
  const isDict = mode === 'dictionary';

  const activeBible = store.getActiveBible();
  const activeCmt = store.getActiveCommentary();
  const activeDict = store.getActiveDictionary();

  let quickList = [];
  let quickActivePath = '';
  let quickTitle = '';

  if (isDict) {
    quickList = getQuickModulesList('dictionary', store.getDictionaries(), '', 7);
    quickActivePath = activeDict ? activeDict.path : '';
    quickTitle = 'Dicionários rápidos';
  } else if (isCmt) {
    quickList = getQuickModulesList('commentary', store.getCommentaries(), '', 7);
    quickActivePath = activeCmt ? activeCmt.path : '';
    quickTitle = 'Comentários rápidos';
  } else {
    quickList = getQuickModulesList('bible', store.getBibles(), '', 7);
    quickActivePath = activeBible ? activeBible.path : '';
    quickTitle = 'Bíblias rápidas';
  }

  const quickRowsHtml = quickList.map((m) => {
    const isAct = m.path === quickActivePath;
    const primary = getModulePrimaryLabel(m);
    const secondary = getModuleSecondaryLabel(m);
    return `
      <div class="ms-dropdown-row${isAct ? ' is-active' : ''}">
        <button type="button" class="ms-dropdown-btn" data-drawer-mod="${escapeHtml(m.path)}">
          <span class="ms-dropdown-text">
            <span class="ms-dropdown-title">${escapeHtml(primary)}</span>
            ${secondary ? `<span class="ms-dropdown-sub">${escapeHtml(secondary)}</span>` : ''}
          </span>
        </button>
      </div>
    `;
  }).join('');

  pop.panel.innerHTML = `
    <div class="ms-popover-list">
      <div class="ms-dropdown-row${isBible ? ' is-active' : ''}">
        <button type="button" class="ms-dropdown-btn" data-drawer-act="bible">
          <span class="ms-res-badge ms-res-badge--bible">&#10013;</span>
          <span class="ms-dropdown-title">Bíblias</span>
        </button>
      </div>
      <div class="ms-dropdown-row${isCmt ? ' is-active' : ''}">
        <button type="button" class="ms-dropdown-btn" data-drawer-act="commentary">
          <span class="ms-res-badge ms-res-badge--commentary">C</span>
          <span class="ms-dropdown-title">Comentários</span>
        </button>
      </div>
      <div class="ms-dropdown-row${isDict ? ' is-active' : ''}">
        <button type="button" class="ms-dropdown-btn" data-drawer-act="dictionary">
          <span class="ms-res-badge ms-res-badge--dict">D</span>
          <span class="ms-dropdown-title">Dicionários</span>
        </button>
      </div>
      <div class="ms-dropdown-row">
        <button type="button" class="ms-dropdown-btn" data-drawer-act="maps">
          <span class="ms-res-badge ms-res-badge--map">M</span>
          <span class="ms-dropdown-title">Mapas e Atlas</span>
        </button>
      </div>
      <div class="ms-dropdown-row">
        <button type="button" class="ms-dropdown-btn" data-drawer-act="unified-search">
          <span class="ms-res-badge" style="background:var(--bg-subtle);color:var(--ms-arrow-blue);">&#128269;</span>
          <span class="ms-dropdown-title">Pesquisa Unificada</span>
        </button>
      </div>
      <div class="ms-dropdown-row">
        <button type="button" class="ms-dropdown-btn" data-drawer-act="dict-terms">
          <span class="ms-res-badge" style="background:var(--bg-subtle);color:var(--ms-bar-fg);">&#9776;</span>
          <span class="ms-dropdown-title">Termos do Dicionário</span>
        </button>
      </div>
      <div class="ms-dropdown-row">
        <button type="button" class="ms-dropdown-btn" data-drawer-act="settings">
          <span class="ms-res-badge" style="background:var(--bg-subtle);color:var(--ms-bar-fg);">&#9881;</span>
          <span class="ms-dropdown-title">Configurações e Fontes</span>
        </button>
      </div>
      <div class="ms-dropdown-row">
        <button type="button" class="ms-dropdown-btn" data-drawer-act="logs">
          <span class="ms-res-badge" style="background:var(--bg-subtle);color:var(--ms-bar-muted);">!</span>
          <span class="ms-dropdown-title">Logs de Diagnóstico</span>
        </button>
      </div>

      ${quickList.length ? `<div class="ms-drawer-sep"></div><div class="ms-drawer-section-label">${escapeHtml(quickTitle)}</div>${quickRowsHtml}` : ''}
    </div>
  `;

  pop.panel.addEventListener('click', (ev) => {
    const actBtn = ev.target.closest('[data-drawer-act]');
    if (actBtn) {
      const act = actBtn.getAttribute('data-drawer-act');
      pop.close();
      if (act === 'bible' && onSelectMode) onSelectMode('bible');
      if (act === 'commentary' && onSelectMode) onSelectMode('commentary');
      if (act === 'dictionary' && onSelectMode) onSelectMode('dictionary');
      if (act === 'maps' && typeof onOpenMaps === 'function') onOpenMaps();
      if (act === 'unified-search') {
        if (typeof onOpenUnifiedSearch === 'function') onOpenUnifiedSearch(mode);
        else if (typeof onOpenBibleSearch === 'function') onOpenBibleSearch();
      }
      if (act === 'dict-terms' && onOpenDictTerms) onOpenDictTerms();
      if (act === 'settings' && onOpenSettings) onOpenSettings();
      if (act === 'logs' && onOpenLogs) onOpenLogs();
      return;
    }

    const modBtn = ev.target.closest('[data-drawer-mod]');
    if (modBtn) {
      const path = modBtn.getAttribute('data-drawer-mod') || '';
      pop.close();
      if (isDict && onQuickSelectDict) onQuickSelectDict(path);
      else if (isCmt && onQuickSelectCommentary) onQuickSelectCommentary(path);
      else if (onQuickSelectBible) onQuickSelectBible(path);
    }
  });
}

export function openModuleDropdown({
  kind = 'bible',
  anchorEl,
  filterTerm = '',
  searchOptions = null,
  passage = null,
  onSelect,
  onOpenSources
} = {}) {
  const normKind = normalizeKind(kind);
  const isDict = normKind === 'dictionary';
  const isCmt = normKind === 'commentary';

  const cleanFilter = isDict ? normalizeLookupTerm(filterTerm) : '';
  const effectiveOpts = isDict
    ? normalizeDictSearchOptions(searchOptions || {})
    : null;

  const hasPassageFilter = Boolean(
    isCmt &&
    passage &&
    Number(passage.book) > 0 &&
    Number(passage.chapter) > 0
  );
  const pBook = hasPassageFilter ? Number(passage.book) : 1;
  const pChapter = hasPassageFilter ? Number(passage.chapter) : 1;
  const pVerse = hasPassageFilter ? (Number(passage.verse) || 1) : 1;
  const passageLabel = hasPassageFilter ? formatReference(pBook, pChapter, pVerse) : '';

  const pop = createAnchoredPopover({ anchorEl, align: 'left', width: 340, maxHeightRatio: 0.86 });

  const getAll = () => {
    if (isDict) return store.getDictionaries();
    if (isCmt) return store.getCommentaries();
    return store.getBibles();
  };
  const getActive = () => {
    if (isDict) return store.getActiveDictionary();
    if (isCmt) return store.getActiveCommentary();
    return store.getActiveBible();
  };

  const singularLabel = isDict ? 'dicionário' : (isCmt ? 'comentário' : 'Bíblia');
  const pluralLabel = isDict ? 'dicionário(s)' : (isCmt ? 'comentário(s)' : 'Bíblia(s)');

  const initialList = getAll();
  if (!initialList.length) {
    pop.panel.innerHTML = `
      <div class="ms-popover-empty">
        <p style="margin:0 0 10px;">Nenhum ${isDict ? 'dicionário' : (isCmt ? 'comentário' : 'módulo bíblico')} registrado.</p>
        <button type="button" class="primary-btn" id="ms-pop-go-sources">Configurar Fontes</button>
      </div>
    `;
    pop.panel.querySelector('#ms-pop-go-sources')?.addEventListener('click', () => {
      pop.close();
      if (onOpenSources) onOpenSources();
    });
    return;
  }

  let searchQuery = '';
  const hasAutoFilter = Boolean(cleanFilter || hasPassageFilter);
  let filterEnabled = hasAutoFilter;
  let scanController = null;
  let scanDone = 0;
  let scanTotal = initialList.length;
  let isScanning = false;
  let matchedEntries = [];

  if (filterEnabled && isDict) {
    const targetPool = effectiveOpts.favoritesOnly
      ? initialList.filter((m) => m.isFavorite)
      : initialList;
    scanTotal = targetPool.length;
    const cached = getCachedDictionariesWithTerm(initialList, cleanFilter, effectiveOpts);
    if (cached) {
      matchedEntries = cached;
      scanDone = scanTotal;
      isScanning = false;
    } else if (scanTotal > 0) {
      isScanning = true;
    }
  } else if (filterEnabled && hasPassageFilter) {
    scanTotal = initialList.length;
    const cached = getCachedCommentariesForPassage(initialList, pBook, pChapter, pVerse);
    if (cached) {
      matchedEntries = cached;
      scanDone = scanTotal;
      isScanning = false;
    } else if (scanTotal > 0) {
      isScanning = true;
    }
  }

  pop.panel.innerHTML = `
    <div class="ms-popover-search">
      <div class="ms-popover-input-box">
        <input
          type="search"
          class="ms-popover-input"
          id="ms-pop-input"
          placeholder="Filtrar ${singularLabel}..."
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
        />
        <button type="button" class="ms-popover-clear hidden" id="ms-pop-clear" aria-label="Limpar">&times;</button>
      </div>
      <div class="ms-popover-meta">
        <span id="ms-pop-meta"></span>
        ${hasAutoFilter ? '<button type="button" class="ms-popover-toggle-btn" id="ms-pop-toggle-filter"></button>' : ''}
      </div>
    </div>
    <div class="ms-popover-list" id="ms-pop-list"></div>
    <div class="ms-popover-footer">
      <span style="font-size:11.5px;color:var(--ms-bar-muted);">★ fixa no topo e nas abas rápidas</span>
      <button type="button" class="ms-popover-toggle-btn" id="ms-pop-sources">Fontes</button>
    </div>
  `;

  const inputEl = pop.panel.querySelector('#ms-pop-input');
  const clearBtn = pop.panel.querySelector('#ms-pop-clear');
  const metaEl = pop.panel.querySelector('#ms-pop-meta');
  const toggleBtn = pop.panel.querySelector('#ms-pop-toggle-filter');
  const listEl = pop.panel.querySelector('#ms-pop-list');

  function getFreshMatches() {
    const all = getAll();
    const byPath = new Map(all.map((m) => [m.path, m]));
    const origOrder = new Map(all.map((m, idx) => [m.path, idx]));
    const pri = isCmt
      ? { verse: 0, range: 1, chapter: 2, multiChapter: 3, bookIntro: 4 }
      : { exact: 0, prefix: 1, title: 2, body: 3 };

    return matchedEntries
      .map((item) => {
        const fresh = byPath.get(item.module.path);
        if (!fresh) return null;
        return { ...item, module: fresh };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const favDiff = Number(Boolean(b.module.isFavorite)) - Number(Boolean(a.module.isFavorite));
        if (favDiff !== 0) return favDiff;
        const ka = isCmt ? a.scopeKind : a.matchType;
        const kb = isCmt ? b.scopeKind : b.matchType;
        const pDiff = (pri[ka] ?? 9) - (pri[kb] ?? 9);
        if (pDiff !== 0) return pDiff;
        return (origOrder.get(a.module.path) ?? 999999) - (origOrder.get(b.module.path) ?? 999999);
      });
  }

  function scrollActiveIntoView() {
    window.requestAnimationFrame(() => {
      const actRow = listEl && listEl.querySelector('.ms-dropdown-row.is-active');
      if (actRow) {
        actRow.scrollIntoView({ behavior: 'auto', block: 'center' });
      }
    });
  }

  function renderRows() {
    const all = getAll();
    const active = getActive();
    const sortLabel = getModuleSortBy() === 'title' ? 'Descrição' : 'Abreviação';
    const freshMatches = filterEnabled ? getFreshMatches() : [];
    const matchByPath = new Map(freshMatches.map((it) => [it.module.path, it]));
    const baseItems = filterEnabled ? freshMatches.map((it) => it.module) : all;

    const norm = normalizeSearch(searchQuery);
    const terms = norm ? norm.split(/\s+/).filter(Boolean) : [];
    const filtered = baseItems.filter((m) => matchesModuleQuery(m, terms));

    clearBtn?.classList.toggle('hidden', !searchQuery.length);

    if (toggleBtn) {
      if (filterEnabled) {
        toggleBtn.textContent = `Ver todos (${all.length})`;
      } else {
        toggleBtn.textContent = isCmt ? `Só ${passageLabel}` : `Só "${cleanFilter}"`;
      }
    }

    if (metaEl) {
      if (filterEnabled) {
        const targetLabel = isCmt ? passageLabel : `"${cleanFilter}"`;
        if (isScanning) {
          metaEl.textContent = `Verificando ${scanDone}/${scanTotal} • ${freshMatches.length} em ${targetLabel}`;
        } else {
          const hiddenCount = Math.max(0, all.length - freshMatches.length);
          metaEl.textContent = isCmt
            ? `${freshMatches.length} cobrem ${passageLabel} (${hiddenCount} oculto(s))`
            : `${freshMatches.length} com "${cleanFilter}" (${hiddenCount} oculto(s))`;
        }
      } else {
        metaEl.textContent = terms.length
          ? `${filtered.length} de ${all.length} • Ordem: ${sortLabel}`
          : `${all.length} ${pluralLabel} • Ordem: ${sortLabel}`;
      }
    }

    if (!listEl) return;

    if (!filtered.length) {
      if (filterEnabled && isScanning) {
        const scanningMsg = isCmt
          ? `Verificando comentários em ${escapeHtml(passageLabel)} (${scanDone}/${scanTotal})...`
          : `Procurando "${escapeHtml(cleanFilter)}" (${scanDone}/${scanTotal})...`;
        listEl.innerHTML = `<div class="ms-popover-empty">${scanningMsg}</div>`;
        return;
      }
      if (filterEnabled && !terms.length) {
        const noneMsg = isCmt
          ? `Nenhum comentário cobre ${escapeHtml(passageLabel)}.`
          : `Nenhum dicionário contém "${escapeHtml(cleanFilter)}".`;
        listEl.innerHTML = `
          <div class="ms-popover-empty">
            <p style="margin:0 0 8px;">${noneMsg}</p>
            <button type="button" class="ms-popover-toggle-btn" id="ms-pop-show-all">Ver todos (${all.length})</button>
          </div>
        `;
        listEl.querySelector('#ms-pop-show-all')?.addEventListener('click', () => {
          filterEnabled = false;
          renderRows();
          scrollActiveIntoView();
        });
        return;
      }
      listEl.innerHTML = `<div class="ms-popover-empty">Nenhum módulo encontrado.</div>`;
      return;
    }

    listEl.innerHTML = filtered.map((m) => {
      const isAct = active && active.path === m.path;
      const primary = getModulePrimaryLabel(m);
      const secondary = getModuleSecondaryLabel(m);
      const hitInfo = filterEnabled ? matchByPath.get(m.path) : null;
      const extraMeta = [m.language, m.hasStrongs ? 'Strong' : ''].filter(Boolean).join(' • ');

      let hitLineHtml = '';
      if (hitInfo) {
        hitLineHtml = isCmt
          ? `<span class="ms-dropdown-hit">${escapeHtml(hitInfo.badge)} • ${escapeHtml(hitInfo.label)}</span>`
          : `<span class="ms-dropdown-hit">Verbete: ${escapeHtml(hitInfo.word)}</span>`;
      }

      return `
        <div class="ms-dropdown-row${isAct ? ' is-active' : ''}">
          <button type="button" class="ms-dropdown-btn" data-pop-select="${escapeHtml(m.path)}">
            <span class="ms-dropdown-text">
              <span class="ms-dropdown-title">${escapeHtml(primary)}</span>
              ${hitLineHtml}
              ${secondary ? `<span class="ms-dropdown-sub">${escapeHtml(secondary)}</span>` : ''}
              ${extraMeta ? `<span class="ms-dropdown-sub" style="opacity:0.78;">${escapeHtml(extraMeta)}</span>` : ''}
            </span>
          </button>
          <button
            type="button"
            class="ms-dropdown-star${m.isFavorite ? ' is-fav' : ''}"
            data-pop-fav-id="${m.id}"
            data-pop-fav-next="${m.isFavorite ? '0' : '1'}"
            aria-label="Favoritar módulo"
          >${m.isFavorite ? '&#9733;' : '&#9734;'}</button>
        </div>
      `;
    }).join('');
  }

  if (isScanning) {
    scanController = new AbortController();
    const signal = scanController.signal;
    pop.setCleanup(() => {
      if (scanController) {
        scanController.abort();
        scanController = null;
      }
    });

    const active = getActive();
    const scanPromise = isCmt
      ? findCommentariesForPassage(getAll(), pBook, pChapter, pVerse, {
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
      : findDictionariesWithTerm(getAll(), cleanFilter, {
          ...effectiveOpts,
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
        });

    scanPromise
      .then((finalList) => {
        if (signal.aborted) return;
        isScanning = false;
        scanDone = scanTotal;
        matchedEntries = finalList;
        renderRows();
        if (!searchQuery.trim() && filterEnabled) scrollActiveIntoView();
      })
      .catch(() => {
        if (signal.aborted) return;
        isScanning = false;
        renderRows();
      });
  }

  inputEl?.addEventListener('input', () => {
    searchQuery = inputEl.value || '';
    renderRows();
    if (listEl) listEl.scrollTop = 0;
  });

  clearBtn?.addEventListener('click', () => {
    searchQuery = '';
    if (inputEl) {
      inputEl.value = '';
      inputEl.focus();
    }
    renderRows();
    scrollActiveIntoView();
  });

  toggleBtn?.addEventListener('click', () => {
    filterEnabled = !filterEnabled;
    renderRows();
    if (!searchQuery.trim()) scrollActiveIntoView();
  });

  pop.panel.querySelector('#ms-pop-sources')?.addEventListener('click', () => {
    pop.close();
    if (onOpenSources) onOpenSources();
  });

  listEl?.addEventListener('click', async (ev) => {
    const favBtn = ev.target.closest('[data-pop-fav-id]');
    if (favBtn) {
      try {
        const res = await nativeBridge.setModuleFavorite(
          Number(favBtn.dataset.popFavId),
          favBtn.dataset.popFavNext === '1'
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

    const selBtn = ev.target.closest('[data-pop-select]');
    if (selBtn) {
      const selectedPath = selBtn.getAttribute('data-pop-select') || '';
      const freshMatches = filterEnabled ? getFreshMatches() : [];
      const matchInfo = filterEnabled
        ? freshMatches.find((item) => item.module.path === selectedPath)
        : null;

      pop.close();
      if (typeof onSelect === 'function') {
        onSelect(selectedPath, {
          matchedWord: isDict && matchInfo ? matchInfo.word : '',
          keepFilterTerm: Boolean(isDict && filterEnabled && matchInfo),
          matchInfo: matchInfo || null
        });
      }
    }
  });

  renderRows();
  if (!isScanning) scrollActiveIntoView();
}

export function openOverflowDropdown({ anchorEl, onOpenSettings, onOpenLogs } = {}) {
  const pop = createAnchoredPopover({ anchorEl, align: 'right', width: 260 });

  function render() {
    const prefs = store.getPrefs();
    const sortBy = prefs.bibleSortBy === 'title' ? 'title' : 'abbr';
    const themes = [
      { id: 'paper', label: 'Papel' },
      { id: 'light', label: 'Claro' },
      { id: 'sepia', label: 'Sépia' },
      { id: 'dark', label: 'Noturno' }
    ];

    pop.panel.innerHTML = `
      <div class="ms-popover-list">
        <div class="ms-drawer-section-label">Tema rápido</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;padding:4px 12px 10px;">
          ${themes.map((t) => (
            `<button type="button" class="ms-popover-toggle-btn" data-ov-theme="${t.id}" style="${prefs.theme === t.id ? 'background:var(--accent);color:#fff;border-color:var(--accent);' : ''}">${t.label}</button>`
          )).join('')}
        </div>

        <div class="ms-drawer-sep"></div>
        <div class="ms-drawer-section-label">Exibir módulos por</div>
        <div style="display:flex;gap:6px;padding:4px 12px 10px;">
          <button type="button" class="ms-popover-toggle-btn" data-ov-sort="abbr" style="${sortBy === 'abbr' ? 'background:var(--accent);color:#fff;border-color:var(--accent);' : ''}">Abreviação</button>
          <button type="button" class="ms-popover-toggle-btn" data-ov-sort="title" style="${sortBy === 'title' ? 'background:var(--accent);color:#fff;border-color:var(--accent);' : ''}">Descrição</button>
        </div>

        <div class="ms-drawer-sep"></div>
        <div class="ms-dropdown-row">
          <div style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:8px 12px;font-size:13.5px;">
            <span>Fonte (${prefs.fontSize}px)</span>
            <span style="display:inline-flex;gap:6px;">
              <button type="button" class="ms-popover-toggle-btn" id="ov-font-dec">A-</button>
              <button type="button" class="ms-popover-toggle-btn" id="ov-font-inc">A+</button>
            </span>
          </div>
        </div>

        <div class="ms-dropdown-row">
          <button type="button" class="ms-dropdown-btn" data-ov-toggle="showStrongs">
            <span class="ms-dropdown-title">${prefs.showStrongs ? '&#10003; ' : ''}Códigos Strong</span>
          </button>
        </div>
        <div class="ms-dropdown-row">
          <button type="button" class="ms-dropdown-btn" data-ov-toggle="showMorph">
            <span class="ms-dropdown-title">${prefs.showMorph ? '&#10003; ' : ''}Morfologia</span>
          </button>
        </div>
        <div class="ms-dropdown-row">
          <button type="button" class="ms-dropdown-btn" data-ov-toggle="justifyText">
            <span class="ms-dropdown-title">${prefs.justifyText ? '&#10003; ' : ''}Texto justificado</span>
          </button>
        </div>

        <div class="ms-drawer-sep"></div>
        <div class="ms-dropdown-row">
          <button type="button" class="ms-dropdown-btn" id="ov-open-sources">
            <span class="ms-dropdown-title">Configurações e Fontes</span>
          </button>
        </div>
        <div class="ms-dropdown-row">
          <button type="button" class="ms-dropdown-btn" id="ov-open-logs">
            <span class="ms-dropdown-title">Logs de Diagnóstico</span>
          </button>
        </div>
      </div>
    `;

    pop.panel.querySelectorAll('[data-ov-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.updatePrefs({ theme: btn.getAttribute('data-ov-theme') });
        render();
      });
    });

    pop.panel.querySelectorAll('[data-ov-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.updatePrefs({ bibleSortBy: btn.getAttribute('data-ov-sort') });
        render();
      });
    });

    pop.panel.querySelector('#ov-font-dec')?.addEventListener('click', () => {
      store.updatePrefs({ fontSize: Math.max(14, store.getPrefs().fontSize - 1) });
      render();
    });

    pop.panel.querySelector('#ov-font-inc')?.addEventListener('click', () => {
      store.updatePrefs({ fontSize: Math.min(32, store.getPrefs().fontSize + 1) });
      render();
    });

    pop.panel.querySelectorAll('[data-ov-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-ov-toggle');
        const cur = store.getPrefs();
        store.updatePrefs({ [key]: !cur[key] });
        render();
      });
    });

    pop.panel.querySelector('#ov-open-sources')?.addEventListener('click', () => {
      pop.close();
      if (onOpenSettings) onOpenSettings();
    });

    pop.panel.querySelector('#ov-open-logs')?.addEventListener('click', () => {
      pop.close();
      if (onOpenLogs) onOpenLogs();
    });
  }

  render();
}
