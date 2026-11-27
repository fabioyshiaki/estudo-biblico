import { openModalShell, closeModal } from './nav-modal.js';
import {
  myswordDictionaryAdapter,
  normalizeLookupTerm
} from '../formats/mysword-dictionary.js';

const TERMS_STYLE_ID = 'dct-terms-modal-styles';
const PAGE_SIZE = 150;

const TERMS_MODAL_CSS = `
.dct-terms-sticky {
  position: sticky;
  top: 0;
  z-index: 4;
  padding-bottom: 8px;
  margin-bottom: 8px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
}

.dct-terms-initials {
  display: flex;
  flex-wrap: nowrap;
  gap: 5px;
  overflow-x: auto;
  padding: 6px 0 4px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.dct-terms-initials::-webkit-scrollbar {
  display: none;
}

.dct-initial-chip {
  flex: 0 0 auto;
  min-width: 32px;
  height: 30px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-app);
  color: var(--text-main);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.dct-initial-chip.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #ffffff;
}

.dct-terms-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dct-term-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-app);
  color: var(--text-main);
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.dct-term-row:active {
  background: var(--accent-soft);
}

.dct-term-row.is-current {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.dct-term-main {
  min-width: 0;
  flex: 1 1 auto;
}

.dct-term-word {
  font-family: var(--font-ui);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-main);
  word-break: break-word;
}

.dct-term-row.is-current .dct-term-word {
  color: var(--accent);
  font-weight: 700;
}

.dct-term-alt {
  margin-top: 2px;
  font-family: var(--font-ui);
  font-size: 12px;
  line-height: 1.3;
  color: var(--text-muted);
  word-break: break-word;
}

.dct-term-side {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  font-family: var(--font-ui);
  color: var(--text-muted);
}

.dct-term-badge {
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--accent);
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.3;
}

.dct-terms-footer {
  margin-top: 12px;
  display: flex;
  justify-content: center;
}
`;

function ensureTermsModalStyles() {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(TERMS_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = TERMS_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = TERMS_MODAL_CSS;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function openDictionaryTermsModal({
  dictionaryModule,
  currentWord = '',
  onSelectTerm = null
} = {}) {
  if (!dictionaryModule || !dictionaryModule.path) return;

  ensureTermsModalStyles();

  const modLabel = dictionaryModule.abbr || dictionaryModule.title || dictionaryModule.fileName || 'Dicionário';
  const modal = openModalShell({ title: `Termos — ${modLabel}` });
  if (!modal || !modal.body) return;

  const currentLower = String(currentWord || '').trim().toLowerCase();
  let searchQuery = '';
  let selectedInitial = '';
  let items = [];
  let totalFiltered = 0;
  let totalAll = null;
  let offset = 0;
  let hasMore = false;
  let loading = false;
  let requestSeq = 0;
  let searchTimer = null;

  modal.body.innerHTML = `
    <div class="dct-terms-sticky" id="dct-terms-sticky">
      <div class="search-input-box">
        <input
          type="search"
          id="dct-terms-search"
          class="search-input"
          placeholder="Procurar termo em ${escapeHtml(modLabel)}..."
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
        />
        <button type="button" id="dct-terms-clear" class="search-clear-btn hidden" aria-label="Limpar busca">&times;</button>
      </div>
      <div class="dct-terms-initials" id="dct-terms-initials"></div>
      <div class="picker-meta" id="dct-terms-meta">Carregando índice de termos...</div>
    </div>
    <div class="dct-terms-list" id="dct-terms-list"></div>
    <div class="dct-terms-footer" id="dct-terms-footer"></div>
  `;

  const inputEl = modal.body.querySelector('#dct-terms-search');
  const clearBtn = modal.body.querySelector('#dct-terms-clear');
  const initialsEl = modal.body.querySelector('#dct-terms-initials');
  const metaEl = modal.body.querySelector('#dct-terms-meta');
  const listEl = modal.body.querySelector('#dct-terms-list');
  const footerEl = modal.body.querySelector('#dct-terms-footer');

  function isAlive() {
    return Boolean(listEl && document.body.contains(listEl));
  }

  function updateMeta() {
    if (!metaEl) return;
    if (loading && !items.length) {
      metaEl.textContent = 'Carregando termos...';
      return;
    }

    const totalNum = totalFiltered || items.length;
    const parts = [];
    if (searchQuery.trim()) {
      parts.push(`${totalNum} encontrado(s) para "${searchQuery.trim()}"`);
    } else if (selectedInitial) {
      parts.push(`${totalNum} termo(s) com "${selectedInitial}"`);
    } else {
      parts.push(`${totalNum} termo(s)`);
    }

    if (items.length < totalNum) {
      parts.push(`exibindo ${items.length}`);
    }
    if (totalAll !== null && (searchQuery.trim() || selectedInitial)) {
      parts.push(`total: ${totalAll}`);
    }

    metaEl.textContent = parts.join(' • ');
  }

  function buildItemRowHtml(item) {
    const isCurrent = Boolean(currentLower && item.word.toLowerCase() === currentLower);
    const altHtml = item.altWords
      ? `<div class="dct-term-alt">${escapeHtml(item.altWords)}</div>`
      : '';
    const badgeHtml = isCurrent ? '<span class="dct-term-badge">Aberto</span>' : '';

    return (
      `<button type="button" class="dct-term-row${isCurrent ? ' is-current' : ''}" data-term-word="${escapeHtml(item.word)}">` +
        '<div class="dct-term-main">' +
          `<div class="dct-term-word">${escapeHtml(item.word)}</div>` +
          altHtml +
        '</div>' +
        `<span class="dct-term-side">${badgeHtml}<span>&rsaquo;</span></span>` +
      '</button>'
    );
  }

  function updateFooter() {
    if (!footerEl) return;
    if (loading && items.length > 0) {
      footerEl.innerHTML = '<span class="picker-meta">Carregando mais termos...</span>';
      return;
    }
    if (hasMore) {
      footerEl.innerHTML = '<button type="button" class="secondary-btn" id="dct-terms-more">Carregar mais termos</button>';
      footerEl.querySelector('#dct-terms-more')?.addEventListener('click', () => {
        loadPage(false);
      });
      return;
    }
    footerEl.innerHTML = '';
  }

  function renderInitialsBar(initials) {
    if (!initialsEl) return;
    if (!Array.isArray(initials) || initials.length <= 1) {
      initialsEl.innerHTML = '';
      return;
    }

    const chips = [
      `<button type="button" class="dct-initial-chip${!selectedInitial ? ' active' : ''}" data-init-bucket="">Todos</button>`,
      ...initials.map((ch) => (
        `<button type="button" class="dct-initial-chip${selectedInitial === ch ? ' active' : ''}" data-init-bucket="${escapeHtml(ch)}">${escapeHtml(ch)}</button>`
      ))
    ];
    initialsEl.innerHTML = chips.join('');
  }

  async function loadPage(reset = false) {
    if (!isAlive()) return;
    if (!reset && (loading || !hasMore)) return;

    const mySeq = reset ? ++requestSeq : requestSeq;
    loading = true;

    if (reset) {
      offset = 0;
      items = [];
      hasMore = false;
      if (listEl) listEl.innerHTML = '';
      modal.body.scrollTop = 0;
    }

    updateMeta();
    updateFooter();

    try {
      const cleanSearch = normalizeLookupTerm(searchQuery);
      const page = await myswordDictionaryAdapter.getEntryListPage(dictionaryModule.path, {
        limit: PAGE_SIZE,
        offset,
        search: cleanSearch,
        startsWith: selectedInitial,
        includeTotal: reset
      });

      if (!isAlive() || mySeq !== requestSeq) return;

      const batch = Array.isArray(page && page.items) ? page.items : [];
      if (reset && typeof page.total === 'number') {
        totalFiltered = page.total;
        if (!cleanSearch && !selectedInitial) {
          totalAll = page.total;
        }
      }

      hasMore = Boolean(page && page.hasMore);
      offset += batch.length;
      items.push(...batch);

      if (listEl) {
        if (!items.length) {
          const msg = cleanSearch
            ? `Nenhum termo encontrado para "${escapeHtml(cleanSearch)}" neste dicionário.`
            : 'Nenhum termo encontrado neste filtro.';
          listEl.innerHTML = `<div class="picker-empty">${msg}</div>`;
        } else if (reset) {
          listEl.innerHTML = batch.map(buildItemRowHtml).join('');
        } else if (batch.length) {
          listEl.insertAdjacentHTML('beforeend', batch.map(buildItemRowHtml).join(''));
        }
      }
    } catch (err) {
      if (!isAlive() || mySeq !== requestSeq) return;
      if (listEl && !items.length) {
        listEl.innerHTML = `<div class="picker-empty">${escapeHtml(err && err.message ? err.message : 'Erro ao listar termos do dicionário.')}</div>`;
      }
    } finally {
      if (isAlive() && mySeq === requestSeq) {
        loading = false;
        updateMeta();
        updateFooter();
      }
    }
  }

  inputEl?.addEventListener('input', (ev) => {
    searchQuery = ev.target.value || '';
    clearBtn?.classList.toggle('hidden', !searchQuery.length);
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      loadPage(true);
    }, 180);
  });

  clearBtn?.addEventListener('click', () => {
    searchQuery = '';
    if (inputEl) {
      inputEl.value = '';
      inputEl.focus();
    }
    clearBtn.classList.add('hidden');
    loadPage(true);
  });

  initialsEl?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-init-bucket]');
    if (!btn) return;
    const nextBucket = btn.getAttribute('data-init-bucket') || '';
    if (nextBucket === selectedInitial) return;
    selectedInitial = nextBucket;
    initialsEl.querySelectorAll('.dct-initial-chip').forEach((chip) => {
      chip.classList.toggle('active', (chip.getAttribute('data-init-bucket') || '') === selectedInitial);
    });
    loadPage(true);
  });

  listEl?.addEventListener('click', (ev) => {
    const row = ev.target.closest('[data-term-word]');
    if (!row) return;
    const chosenWord = row.getAttribute('data-term-word') || '';
    if (!chosenWord) return;
    closeModal();
    if (typeof onSelectTerm === 'function') {
      onSelectTerm(chosenWord);
    }
  });

  modal.body.addEventListener('scroll', () => {
    if (loading || !hasMore) return;
    const remaining = modal.body.scrollHeight - modal.body.scrollTop - modal.body.clientHeight;
    if (remaining < 260) {
      loadPage(false);
    }
  });

  // Carrega a barra de iniciais em paralelo com a primeira página de termos
  myswordDictionaryAdapter.getEntryInitials(dictionaryModule.path)
    .then((initials) => {
      if (isAlive()) renderInitialsBar(initials);
    })
    .catch(() => {
      // Se falhar, mantém a lista funcionando normalmente sem barra de letras
    });

  loadPage(true);
}
