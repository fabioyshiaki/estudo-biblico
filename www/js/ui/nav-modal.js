import { nativeBridge } from '../bridge/native-bridge.js';
import { store } from '../core/store.js';
import { eventBus, EVENTS } from '../core/events.js';
import { getBookMeta } from '../core/canon.js';
import { loadBooksForBible, loadChaptersForBible } from './reader-view.js';

let activeKeyHandler = null;

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

function scrollChildToTop(scrollContainer, targetEl, extraTopOffset = 12) {
  if (!scrollContainer || !targetEl) return;
  const containerRect = scrollContainer.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  const nextTop = scrollContainer.scrollTop + (targetRect.top - containerRect.top) - extraTopOffset;
  scrollContainer.scrollTop = Math.max(0, Math.round(nextTop));
}

export function closeModal() {
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

export function openDictionaryPickerModal({ onOpenSources } = {}) {
  openModulePickerModal({
    title: 'Selecionar Dicionário',
    emptyTitle: 'Nenhum Dicionário registrado',
    emptyDesc: 'Adicione um arquivo .dct.mybible ou uma pasta em Configurações → Fontes.',
    unitLabel: 'Dicionário(s)',
    getList: () => store.getDictionaries(),
    getActive: () => store.getActiveDictionary(),
    onSelect: (path) => store.setActiveDictionary(path),
    onOpenSources
  });
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
