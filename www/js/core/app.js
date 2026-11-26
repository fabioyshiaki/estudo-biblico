import { nativeBridge } from '../bridge/native-bridge.js';
import { store } from './store.js';
import { eventBus, EVENTS } from './events.js';
import {
  initReaderView,
  renderReader,
  stepBible,
  stepBook,
  stepChapter
} from '../ui/reader-view.js';
import {
  openBiblePickerModal,
  openLocationPickerModal,
  openFootnoteModal
} from '../ui/nav-modal.js';
import { openSettingsModal } from '../ui/sources-modal.js';

let toastTimer = null;

function applyVisualPrefs(prefs) {
  const root = document.documentElement;
  root.setAttribute('data-theme', prefs.theme || 'paper');
  root.style.setProperty('--reader-font-size', `${Number(prefs.fontSize) || 19}px`);
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
