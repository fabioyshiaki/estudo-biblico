import { store } from '../core/store.js';
import { eventBus, EVENTS } from '../core/events.js';
import { getBookName, formatReference } from '../core/canon.js';
import { getAdapterForModule } from '../formats/format-registry.js';
import { nativeBridge } from '../bridge/native-bridge.js';

let callbacks = {
  onOpenSources: () => {},
  onOpenFootnote: () => {},
  onRequestPermission: () => {}
};

let currentVerses = [];
let selectedVerseNum = null;
let renderSeq = 0;

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function loadBooksForBible(bible) {
  if (!bible) return [];
  const cached = store.getCachedBooks(bible.path);
  if (cached) return cached;

  const adapter = getAdapterForModule(bible);
  if (!adapter) return [];
  const books = await adapter.getAvailableBooks(bible.path);
  store.setCachedBooks(bible.path, books);
  return books;
}

export async function loadChaptersForBible(bible, bookId) {
  if (!bible) return [];
  const cached = store.getCachedChapters(bible.path, bookId);
  if (cached) return cached;

  const adapter = getAdapterForModule(bible);
  if (!adapter) return [];
  const chapters = await adapter.getChaptersForBook(bible.path, bookId);
  store.setCachedChapters(bible.path, bookId, chapters);
  return chapters;
}

export function initReaderView(opts = {}) {
  callbacks = { ...callbacks, ...opts };

  const container = document.getElementById('reader-content');
  if (!container) return;

  container.addEventListener('click', (ev) => {
    const fnBtn = ev.target.closest('.v-fn-btn');
    if (fnBtn) {
      ev.stopPropagation();
      const verseEl = fnBtn.closest('.verse-item');
      const verseNum = Number(verseEl && verseEl.dataset.verse);
      const fnIdx = Number(fnBtn.dataset.fnIdx);
      const verseObj = currentVerses.find((v) => v.verse === verseNum);
      if (verseObj && verseObj.footnotes && verseObj.footnotes[fnIdx]) {
        const ref = formatReference(verseObj.book, verseObj.chapter, verseObj.verse);
        callbacks.onOpenFootnote(ref, verseObj.footnotes[fnIdx]);
      }
      return;
    }

    const actionBtn = ev.target.closest('[data-empty-action]');
    if (actionBtn) {
      const action = actionBtn.dataset.emptyAction;
      if (action === 'sources') callbacks.onOpenSources();
      if (action === 'permission') callbacks.onRequestPermission();
      return;
    }

    const verseEl = ev.target.closest('.verse-item');
    if (!verseEl) return;

    const verseNum = Number(verseEl.dataset.verse);
    const alreadySelected = selectedVerseNum === verseNum;
    selectedVerseNum = alreadySelected ? null : verseNum;

    container.querySelectorAll('.verse-item.is-selected').forEach((el) => {
      el.classList.remove('is-selected');
    });

    if (!alreadySelected) {
      verseEl.classList.add('is-selected');
      const verseObj = currentVerses.find((v) => v.verse === verseNum) || null;
      eventBus.emit(EVENTS.VERSE_TAPPED, verseObj);
    } else {
      eventBus.emit(EVENTS.VERSE_TAPPED, null);
    }
  });
}

function updateChrome(bible, bookId, chapter, navLimits = {}) {
  const bibleLabel = document.getElementById('label-active-bible');
  const refLabel = document.getElementById('label-active-ref');
  const metaLabel = document.getElementById('chapter-meta');
  const prevBibleBtn = document.getElementById('btn-prev-bible');
  const nextBibleBtn = document.getElementById('btn-next-bible');
  const prevBookBtn = document.getElementById('btn-prev-book');
  const nextBookBtn = document.getElementById('btn-next-book');
  const prevBtn = document.getElementById('btn-prev-chapter');
  const nextBtn = document.getElementById('btn-next-chapter');

  const bibles = store.getBibles();
  const bibleIdx = bible ? bibles.findIndex((m) => m.path === bible.path) : -1;

  if (bibleLabel) {
    bibleLabel.textContent = bible ? (bible.abbr || bible.title) : 'Sem Bíblia';
  }
  if (refLabel) {
    refLabel.textContent = bible ? formatReference(bookId, chapter) : 'Selecionar';
  }
  if (metaLabel) {
    metaLabel.textContent = bible
      ? `${bible.abbr \vert{}\vert{} bible.title} •${formatReference(bookId, chapter)}`
      : 'Nenhuma fonte configurada';
  }

  if (prevBibleBtn) prevBibleBtn.disabled = bibleIdx <= 0;
  if (nextBibleBtn) nextBibleBtn.disabled = bibleIdx < 0 || bibleIdx >= bibles.length - 1;
  if (prevBookBtn) prevBookBtn.disabled = !bible || Boolean(navLimits.isFirstBook);
  if (nextBookBtn) nextBookBtn.disabled = !bible || Boolean(navLimits.isLastBook);
  if (prevBtn) prevBtn.disabled = !bible || Boolean(navLimits.isFirst);
  if (nextBtn) nextBtn.disabled = !bible || Boolean(navLimits.isLast);
}

function renderEmptyState({ title, message, primaryLabel, primaryAction, secondaryLabel, secondaryAction }) {
  const container = document.getElementById('reader-content');
  if (!container) return;
  container.classList.remove('has-interlinear');
  currentVerses = [];
  selectedVerseNum = null;

  container.innerHTML = `
    <div class="empty-state">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <div class="empty-state-actions">
        ${primaryLabel ? `<button type="button" class="primary-btn" data-empty-action="${primaryAction}">${escapeHtml(primaryLabel)}</button>` : ''}
        ${secondaryLabel ? `<button type="button" class="secondary-btn" data-empty-action="${secondaryAction}">${escapeHtml(secondaryLabel)}</button>` : ''}
      </div>
    </div>
  `;
}

export async function renderReader({ resetScroll = true } = {}) {
  const seq = ++renderSeq;
  const state = store.getState();
  const bible = store.getActiveBible();
  const lockedLimits = { isFirst: true, isLast: true, isFirstBook: true, isLastBook: true };

  if (nativeBridge.isNative() && !state.hasStoragePermission) {
    updateChrome(null, state.book, state.chapter, lockedLimits);
    renderEmptyState({
      title: 'Permissão de leitura necessária',
      message: 'Para abrir suas Bíblias MySword diretamente em modo somente leitura (sem copiar arquivos), conceda acesso aos arquivos do dispositivo. O aplicativo nunca vasculha o armazenamento sozinho.',
      primaryLabel: 'Conceder permissão',
      primaryAction: 'permission',
      secondaryLabel: 'Abrir Configurações',
      secondaryAction: 'sources'
    });
    return;
  }

  if (!bible) {
    updateChrome(null, state.book, state.chapter, lockedLimits);
    renderEmptyState({
      title: 'Nenhuma Bíblia adicionada',
      message: 'Você tem controle total sobre onde o aplicativo lê arquivos. Aponte manualmente um arquivo .bbl.mybible específico ou uma pasta com suas Bíblias MySword.',
      primaryLabel: 'Adicionar Bíblia MySword',
      primaryAction: 'sources'
    });
    return;
  }

  const adapter = getAdapterForModule(bible);
  if (!adapter) {
    updateChrome(bible, state.book, state.chapter, lockedLimits);
    renderEmptyState({
      title: 'Formato não suportado',
      message: `Nenhum adaptador registrado para o formato "${bible.formatId}".`,
      primaryLabel: 'Gerenciar fontes',
      primaryAction: 'sources'
    });
    return;
  }

  try {
    const books = await loadBooksForBible(bible);
    if (seq !== renderSeq) return;

    if (!books.length) {
      updateChrome(bible, state.book, state.chapter, lockedLimits);
      renderEmptyState({
        title: 'Módulo vazio ou ilegível',
        message: `Não foi possível encontrar livros em "${bible.title}". Verifique se o arquivo ainda existe no local autorizado.`,
        primaryLabel: 'Gerenciar fontes',
        primaryAction: 'sources'
      });
      return;
    }

    let targetBook = books.includes(state.book) ? state.book : books[0];
    const chapters = await loadChaptersForBible(bible, targetBook);
    if (seq !== renderSeq) return;

    let targetChapter = chapters.includes(state.chapter)
      ? state.chapter
      : (chapters[0] || 1);

    if (targetBook !== state.book || targetChapter !== state.chapter) {
      store.setLocation(targetBook, targetChapter);
      return;
    }

    const prefs = store.getPrefs();
    const verses = await adapter.getChapterVerses(bible.path, targetBook, targetChapter, {
      showStrongs: prefs.showStrongs,
      showMorph: prefs.showMorph
    });
    if (seq !== renderSeq) return;

    const bookIdx = books.indexOf(targetBook);
    const chapIdx = chapters.indexOf(targetChapter);
    const isFirstBook = bookIdx <= 0;
    const isLastBook = bookIdx < 0 || bookIdx >= books.length - 1;
    const isFirst = isFirstBook && chapIdx <= 0;
    const isLast = isLastBook && (chapIdx < 0 || chapIdx >= chapters.length - 1);

    updateChrome(bible, targetBook, targetChapter, { isFirst, isLast, isFirstBook, isLastBook });
    currentVerses = verses;
    selectedVerseNum = null;

    const hasInterlinear = verses.some((v) => v.html.includes('il-block'));
    const parts = [];
    parts.push(`
      <header class="chapter-header">
        <h1 class="chapter-title">${escapeHtml(getBookName(targetBook))}${targetChapter}</h1>
        <p class="chapter-subtitle">${escapeHtml(bible.title)}</p>
      </header>
      <div class="verse-list">
    `);

    for (const v of verses) {
      if (Array.isArray(v.headings) && v.headings.length > 0) {
        for (const h of v.headings) {
          parts.push(`<h2 class="section-heading">${escapeHtml(h)}</h2>`);
        }
      }
      const isInterlinear = v.html.includes('il-block');
      const isQInterlinear = v.html.includes('il-q-flow');
      const itemClasses = [
        'verse-item',
        isInterlinear ? 'is-interlinear' : '',
        isQInterlinear ? 'is-q-interlinear' : ''
      ].filter(Boolean).join(' ');

      parts.push(
        `<div class="${itemClasses}" data-book="${v.book}" data-chapter="${v.chapter}" data-verse="${v.verse}">` +
          `<span class="verse-num">${v.verse}</span>` +
          `<span class="verse-text">${v.html}</span>` + `</div>` ); }  parts.push('</div>');  const container = document.getElementById('reader-content'); if (container) { container.classList.toggle('has-interlinear', hasInterlinear); container.innerHTML = parts.join(''); }  if (resetScroll) { const scrollBox = document.getElementById('reader-scroll'); if (scrollBox) { scrollBox.scrollTo({ top: 0, behavior: 'auto' }); } } } catch (err) { if (seq !== renderSeq) return; updateChrome(bible, state.book, state.chapter, lockedLimits); renderEmptyState({ title: 'Erro ao ler capítulo', message: err && err.message ? err.message : String(err), primaryLabel: 'Verificar fontes', primaryAction: 'sources' }); } }  export function stepBible(delta) { const bibles = store.getBibles(); if (bibles.length < 2) return;  const active = store.getActiveBible(); const idx = active ? bibles.findIndex((m) => m.path === active.path) : -1; const nextIdx = idx + Number(delta \vert{}\vert{} 0); if (nextIdx < 0 \vert{}\vert{} nextIdx >= bibles.length) return;  store.setActiveModule(bibles[nextIdx].path); }  export async function stepBook(delta) { const bible = store.getActiveBible(); if (!bible) return;  const state = store.getState(); const books = await loadBooksForBible(bible); if (!books.length) return;  const bookIdx = books.indexOf(state.book); if (bookIdx < 0) return;  const nextIdx = bookIdx + Number(delta \vert{}\vert{} 0); if (nextIdx < 0 \vert{}\vert{} nextIdx >= books.length) return;  const nextBook = books[nextIdx]; const nextChapters = await loadChaptersForBible(bible, nextBook); if (!nextChapters.length) return;  store.setLocation(nextBook, nextChapters[0]); }  export async function stepChapter(delta) { const bible = store.getActiveBible(); if (!bible) return;  const state = store.getState(); const books = await loadBooksForBible(bible); if (!books.length) return;  const bookIdx = books.indexOf(state.book); if (bookIdx < 0) return;  const chapters = await loadChaptersForBible(bible, state.book); const chapIdx = chapters.indexOf(state.chapter);  if (delta > 0) { if (chapIdx >= 0 && chapIdx + 1 < chapters.length) { store.setLocation(state.book, chapters[chapIdx + 1]); return; } if (bookIdx + 1 < books.length) { const nextBook = books[bookIdx + 1]; const nextChapters = await loadChaptersForBible(bible, nextBook); if (nextChapters.length) { store.setLocation(nextBook, nextChapters[0]); } } return; }  if (delta < 0) { if (chapIdx > 0) { store.setLocation(state.book, chapters[chapIdx - 1]); return; } if (bookIdx > 0) { const prevBook = books[bookIdx - 1]; const prevChapters = await loadChaptersForBible(bible, prevBook); if (prevChapters.length) { store.setLocation(prevBook, prevChapters[prevChapters.length - 1]); } } } }  // FIM reader-view.js ```  ---  ### Arquivo 3 de 4 *   **Ação:** EDITAR arquivo existente (apague todo o conteúdo atual e cole o código completo abaixo) *   **Caminho completo:** `www/js/core/app.js`  ```javascript import { nativeBridge } from '../bridge/native-bridge.js'; import { store } from './store.js'; import { eventBus, EVENTS } from './events.js'; import { initReaderView, renderReader, stepBible, stepBook, stepChapter } from '../ui/reader-view.js'; import { openBiblePickerModal, openLocationPickerModal, openFootnoteModal } from '../ui/nav-modal.js'; import { openSettingsModal } from '../ui/sources-modal.js';  let toastTimer = null;  function applyVisualPrefs(prefs) { const root = document.documentElement; root.setAttribute('data-theme', prefs.theme \vert{}\vert{} 'paper'); root.style.setProperty('--reader-font-size', `${Number(prefs.fontSize) || 19}px`);
  root.style.setProperty('--reader-line-height', String(Number(prefs.lineHeight) || 1.72));
  root.style.setProperty(
    '--reader-font-family',
    prefs.fontFamily === 'sans' ? 'var(--font-sans)' : 'var(--font-serif)'
  );
  root.style.setProperty('--reader-align', prefs.justifyText ? 'justify' : 'left');
}

function showToast(message) {
  const box = document.getElementById('toast-box');
  if (!box || !message) return;
  box.textContent = String(message);
  box.classList.add('visible');
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    box.classList.remove('visible');
  }, 3200);
}

async function syncPermissionAndData() {
  const perm = await nativeBridge.checkStoragePermission();
  store.setPermission(Boolean(perm && perm.granted));

  const [srcRes, modRes] = await Promise.all([
    nativeBridge.listSources(),
    nativeBridge.listModules('bible')
  ]);

  store.setSourcesAndModules(
    (srcRes && srcRes.sources) || [],
    (modRes && modRes.modules) || []
  );
}

function bindShellEvents() {
  document.getElementById('btn-prev-bible')?.addEventListener('click', () => {
    stepBible(-1);
  });

  document.getElementById('btn-next-bible')?.addEventListener('click', () => {
    stepBible(1);
  });

  document.getElementById('btn-bible-picker')?.addEventListener('click', () => {
    openBiblePickerModal({
      onOpenSources: () => openSettingsModal({ initialTab: 'sources' })
    });
  });

  document.getElementById('btn-prev-book')?.addEventListener('click', () => {
    stepBook(-1);
  });

  document.getElementById('btn-next-book')?.addEventListener('click', () => {
    stepBook(1);
  });

  document.getElementById('btn-nav-picker')?.addEventListener('click', () => {
    openLocationPickerModal();
  });

  document.getElementById('btn-settings')?.addEventListener('click', () => {
    openSettingsModal({ initialTab: 'sources' });
  });

  document.getElementById('btn-prev-chapter')?.addEventListener('click', () => {
    stepChapter(-1);
  });

  document.getElementById('btn-next-chapter')?.addEventListener('click', () => {
    stepChapter(1);
  });
}

function bindStateEvents() {
  eventBus.on(EVENTS.TOAST, showToast);

  eventBus.on(EVENTS.PREFS_CHANGED, (prefs) => {
    applyVisualPrefs(prefs);
    renderReader({ resetScroll: false });
  });

  eventBus.on(EVENTS.SOURCES_UPDATED, () => {
    renderReader({ resetScroll: false });
  });

  eventBus.on(EVENTS.MODULE_CHANGED, () => {
    renderReader({ resetScroll: true });
  });

  eventBus.on(EVENTS.LOCATION_CHANGED, () => {
    renderReader({ resetScroll: true });
  });

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const prev = store.getState().hasStoragePermission;
    const res = await nativeBridge.checkStoragePermission();
    const next = Boolean(res && res.granted);
    if (next !== prev) {
      store.setPermission(next);
      renderReader({ resetScroll: false });
    }
  });
}

async function bootstrap() {
  applyVisualPrefs(store.getPrefs());

  initReaderView({
    onOpenSources: () => openSettingsModal({ initialTab: 'sources' }),
    onOpenFootnote: (ref, text) => openFootnoteModal(ref, text),
    onRequestPermission: async () => {
      await nativeBridge.requestStoragePermission();
      showToast('Conceda o acesso nas configurações do Android e retorne ao app.');
    }
  });

  bindShellEvents();
  bindStateEvents();

  await syncPermissionAndData();
  await renderReader({ resetScroll: true });
}

bootstrap().catch((err) => {
  showToast(err && err.message ? err.message : 'Erro ao iniciar aplicativo.');
  console.error('[app] Falha no bootstrap:', err);
});

// FIM app.js
