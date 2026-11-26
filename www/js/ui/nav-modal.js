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

export function openBiblePickerModal({ onOpenSources } = {}) {
  const modal = openModalShell({ title: 'Selecionar Bíblia' });
  if (!modal || !modal.body) return;

  function renderList() {
    const bibles = store.getBibles();
    const active = store.getActiveBible();

    if (!bibles.length) {
      modal.body.innerHTML = `
        <div class="empty-state">
          <h2>Nenhuma Bíblia registrada</h2>
          <p>Adicione um arquivo .bbl.mybible ou uma pasta em Configurações → Fontes.</p>
          <button type="button" class="primary-btn" id="btn-go-sources">Configurar Fontes</button>
        </div>
      `;
      modal.body.querySelector('#btn-go-sources')?.addEventListener('click', () => {
        closeModal();
        if (onOpenSources) onOpenSources();
      });
      return;
    }

    const rows = bibles.map((m) => {
      const isActive = active && active.path === m.path;
      const metaParts = [m.abbr, m.language, m.hasStrongs ? 'Strong' : ''].filter(Boolean).join(' • ');
      return `
        <div class="module-row ${isActive ? 'active' : ''}">
          <button type="button" class="row-main" data-select-path="${escapeHtml(m.path)}">
            <div class="row-title">${escapeHtml(m.title)}</div>
            <div class="row-sub">${escapeHtml(metaParts || m.fileName)}</div>
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

    modal.body.innerHTML = `
      <div class="module-list">${rows}</div>
      <div style="margin-top: 14px; display: flex; justify-content: flex-end;">
        <button type="button" class="secondary-btn" id="btn-manage-sources">Gerenciar fontes</button>
      </div>
    `;

    modal.body.querySelectorAll('[data-select-path]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.setActiveModule(btn.dataset.selectPath);
        closeModal();
      });
    });

    modal.body.querySelectorAll('[data-fav-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await nativeBridge.setModuleFavorite(
            Number(btn.dataset.favId),
            btn.dataset.favNext === '1'
          );
          if (res && Array.isArray(res.modules)) {
            store.setModulesOnly(res.modules);
          }
          renderList();
        } catch (err) {
          eventBus.emit(EVENTS.TOAST, err.message || 'Erro ao favoritar módulo.');
        }
      });
    });

    modal.body.querySelector('#btn-manage-sources')?.addEventListener('click', () => {
      closeModal();
      if (onOpenSources) onOpenSources();
    });
  }

  renderList();
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
