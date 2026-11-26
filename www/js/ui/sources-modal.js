import { nativeBridge } from '../bridge/native-bridge.js';
import { store } from '../core/store.js';
import { eventBus, EVENTS } from '../core/events.js';
import { openModalShell } from './nav-modal.js';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  const num = Number(bytes) || 0;
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export function openSettingsModal({ initialTab = 'sources' } = {}) {
  let activeTab = initialTab;
  let browserOpen = false;
  let browserRoots = [];
  let browserDir = null;
  let recursiveFlag = false;
  let busy = false;

  const modal = openModalShell({
    title: 'Configurações',
    tabsHtml: `
      <button type="button" class="modal-tab ${activeTab === 'sources' ? 'active' : ''}" data-cfg-tab="sources">Fontes</button>
      <button type="button" class="modal-tab ${activeTab === 'reading' ? 'active' : ''}" data-cfg-tab="reading">Leitura</button>
    `
  });
  if (!modal || !modal.body) return;

  function syncTabs() {
    modal.sheet.querySelectorAll('[data-cfg-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.cfgTab === activeTab);
    });
  }

  async function openBrowserAt(path) {
    busy = true;
    renderCurrentTab();
    try {
      if (!browserRoots.length) {
        const resRoots = await nativeBridge.getStorageRoots();
        browserRoots = Array.isArray(resRoots && resRoots.roots) ? resRoots.roots : [];
      }
      const targetPath = path || (browserRoots[0] && browserRoots[0].path) || '/storage/emulated/0';
      browserDir = await nativeBridge.listDirectory(targetPath, 'mysword_bbl');
      browserOpen = true;
    } catch (err) {
      eventBus.emit(EVENTS.TOAST, err.message || 'Não foi possível abrir a pasta.');
    } finally {
      busy = false;
      renderCurrentTab();
    }
  }

  async function authorizeSource(path, mode) {
    busy = true;
    renderCurrentTab();
    try {
      const res = await nativeBridge.addSource({
        path,
        mode,
        recursive: mode === 'folder' ? recursiveFlag : false,
        resourceKind: 'bible',
        formatId: 'mysword_bbl'
      });
      store.clearStructureCache();
      store.setSourcesAndModules(res.sources, res.modules);
      const count = Number(res.addedCount) || 0;
      eventBus.emit(EVENTS.TOAST, count > 0
        ? `${count} Bíblia(s) autorizada(s) em modo somente leitura.`
        : 'Fonte salva, mas nenhum .bbl.mybible válido foi encontrado nela.');
      browserOpen = false;
    } catch (err) {
      eventBus.emit(EVENTS.TOAST, err.message || 'Falha ao adicionar fonte.');
    } finally {
      busy = false;
      renderCurrentTab();
    }
  }

  function renderSourcesTab() {
    const state = store.getState();
    const isNative = nativeBridge.isNative();
    const parts = [];

    if (isNative && !state.hasStoragePermission) {
      parts.push(`
        <div class="settings-card">
          <div class="row-title">Permissão de acesso aos arquivos</div>
          <p class="row-sub" style="margin: 6px 0 12px;">
            Necessária apenas para abrir suas Bíblias diretamente em modo somente leitura, sem duplicar arquivos.
          </p>
          <div class="browser-actions">
            <button type="button" class="primary-btn" id="btn-req-perm">Conceder permissão</button>
            <button type="button" class="secondary-btn" id="btn-recheck-perm">Verificar agora</button>
          </div>
        </div>
      `);
    }

    parts.push(`
      <div class="settings-card">
        <div class="row-title">Fontes autorizadas (Lista Branca)</div>
        <p class="row-sub" style="margin: 4px 0 12px;">
          O aplicativo lê apenas arquivos e pastas listados abaixo. Nenhum arquivo original é alterado.
        </p>
        <div class="browser-actions">
          <button type="button" class="primary-btn" id="btn-toggle-browser" ${busy ? 'disabled' : ''}>
            ${browserOpen ? 'Fechar navegador' : '+ Adicionar arquivo ou pasta'}
          </button>
          ${state.sources.length ? `<button type="button" class="secondary-btn" id="btn-refresh-sources" ${busy ? 'disabled' : ''}>Reverificar</button>` : ''}
        </div>
      </div>
    `);

    if (browserOpen) {
      const rootBtns = browserRoots.map((r) => `
        <button type="button" class="secondary-btn" data-root-path="${escapeHtml(r.path)}">
          ${escapeHtml(r.name)}
        </button>
      `).join('');

      const dirsHtml = (browserDir && browserDir.directories || []).map((d) => `
        <button type="button" class="browser-item" data-open-dir="${escapeHtml(d.path)}">
          <span class="row-main">
            <span class="row-title">&#128193; ${escapeHtml(d.name)}</span>
          </span>
          <span class="row-sub">Abrir &rsaquo;</span>
        </button>
      `).join('');

      const filesHtml = (browserDir && browserDir.files || []).map((f) => `
        <div class="browser-item">
          <div class="row-main">
            <div class="row-title">&#128214; ${escapeHtml(f.name)}</div>
            <div class="row-sub">${formatBytes(f.sizeBytes)} • Somente leitura</div>
          </div>
          <button type="button" class="primary-btn" data-add-file="${escapeHtml(f.path)}" ${busy ? 'disabled' : ''}>
            Adicionar
          </button>
        </div>
      `).join('');

      const curPath = (browserDir && browserDir.currentPath) || '';
      const parentPath = (browserDir && browserDir.parentPath) || '';

      parts.push(`
        <div class="settings-card">
          <div class="section-label">Navegador manual (Bíblias MySword .bbl.mybible)</div>
          <div class="browser-roots">${rootBtns}</div>
          <div class="browser-path">${escapeHtml(curPath)}</div>
          <label class="browser-check">
            <input type="checkbox" id="chk-recursive" ${recursiveFlag ? 'checked' : ''} />
            <span>Incluir subpastas ao autorizar a pasta inteira</span>
          </label>
          <div class="browser-actions">
            ${parentPath && parentPath !== curPath ? `<button type="button" class="secondary-btn" id="btn-dir-up">&uarr; Subir pasta</button>` : ''}
            <button type="button" class="primary-btn" id="btn-add-folder" ${busy ? 'disabled' : ''}>
              Autorizar esta pasta
            </button>
          </div>
          ${busy ? '<p class="row-sub">Carregando...</p>' : ''}
          <div class="browser-list">
            ${dirsHtml}
            ${filesHtml}
            ${!dirsHtml && !filesHtml && !busy ? '<p class="row-sub">Nenhuma subpasta ou arquivo .bbl.mybible neste diretório.</p>' : ''}
          </div>
        </div>
      `);
    }

    if (state.sources.length) {
      const listHtml = state.sources.map((s) => `
        <div class="source-card">
          <div class="row-main">
            <div class="row-title">${escapeHtml(s.label)}</div>
            <div class="row-sub">
              ${s.sourceMode === 'folder' ? (s.recursive ? 'Pasta (+ subpastas)' : 'Pasta única') : 'Arquivo único'}
              • ${s.moduleCount} Bíblia(s)
            </div>
            <div class="row-sub">${escapeHtml(s.path)}</div>
          </div>
          <button type="button" class="danger-btn" data-remove-source="${s.id}" ${busy ? 'disabled' : ''}>
            Remover
          </button>
        </div>
      `).join('');
      parts.push(`<div class="section-label">Fontes ativas (${state.sources.length})</div><div class="source-list">${listHtml}</div>`);
    } else {
      parts.push('<p class="row-sub">Nenhuma fonte adicionada ainda.</p>');
    }

    modal.body.innerHTML = parts.join('');
    bindSourcesEvents();
  }

  function bindSourcesEvents() {
    modal.body.querySelector('#btn-req-perm')?.addEventListener('click', async () => {
      await nativeBridge.requestStoragePermission();
      eventBus.emit(EVENTS.TOAST, 'Ative a permissão nas configurações do Android e volte ao app.');
    });

    modal.body.querySelector('#btn-recheck-perm')?.addEventListener('click', async () => {
      const res = await nativeBridge.checkStoragePermission();
      store.setPermission(Boolean(res && res.granted));
      eventBus.emit(EVENTS.TOAST, res && res.granted ? 'Permissão confirmada.' : 'Permissão ainda não concedida.');
      renderSourcesTab();
    });

    modal.body.querySelector('#btn-toggle-browser')?.addEventListener('click', () => {
      if (browserOpen) {
        browserOpen = false;
        renderSourcesTab();
      } else {
        openBrowserAt(browserDir ? browserDir.currentPath : '');
      }
    });

    modal.body.querySelector('#btn-refresh-sources')?.addEventListener('click', async () => {
      busy = true;
      renderSourcesTab();
      try {
        const res = await nativeBridge.refreshSources();
        store.clearStructureCache();
        store.setSourcesAndModules(res.sources, res.modules);
        eventBus.emit(EVENTS.TOAST, 'Fontes autorizadas reverificadas.');
      } catch (err) {
        eventBus.emit(EVENTS.TOAST, err.message || 'Erro ao reverificar fontes.');
      } finally {
        busy = false;
        renderSourcesTab();
      }
    });

    modal.body.querySelectorAll('[data-root-path]').forEach((btn) => {
      btn.addEventListener('click', () => openBrowserAt(btn.dataset.rootPath));
    });

    modal.body.querySelector('#btn-dir-up')?.addEventListener('click', () => {
      if (browserDir && browserDir.parentPath) openBrowserAt(browserDir.parentPath);
    });

    modal.body.querySelector('#chk-recursive')?.addEventListener('change', (ev) => {
      recursiveFlag = Boolean(ev.target.checked);
    });

    modal.body.querySelector('#btn-add-folder')?.addEventListener('click', () => {
      if (browserDir && browserDir.currentPath) {
        authorizeSource(browserDir.currentPath, 'folder');
      }
    });

    modal.body.querySelectorAll('[data-open-dir]').forEach((btn) => {
      btn.addEventListener('click', () => openBrowserAt(btn.dataset.openDir));
    });

    modal.body.querySelectorAll('[data-add-file]').forEach((btn) => {
      btn.addEventListener('click', () => authorizeSource(btn.dataset.addFile, 'file'));
    });

    modal.body.querySelectorAll('[data-remove-source]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        busy = true;
        renderSourcesTab();
        try {
          const res = await nativeBridge.removeSource(Number(btn.dataset.removeSource));
          store.clearStructureCache();
          store.setSourcesAndModules(res.sources, res.modules);
          eventBus.emit(EVENTS.TOAST, 'Fonte removida da lista (arquivos originais preservados).');
        } catch (err) {
          eventBus.emit(EVENTS.TOAST, err.message || 'Erro ao remover fonte.');
        } finally {
          busy = false;
          renderSourcesTab();
        }
      });
    });
  }

  function renderReadingTab() {
    const prefs = store.getPrefs();
    const themes = [
      { id: 'paper', label: 'Papel' },
      { id: 'light', label: 'Claro' },
      { id: 'sepia', label: 'Sépia' },
      { id: 'dark', label: 'Noturno' }
    ];

    modal.body.innerHTML = `
      <div class="settings-card">
        <div class="row-title">Tema de leitura</div>
        <div class="theme-grid">
          ${themes.map((t) => `
            <button type="button" class="theme-chip ${prefs.theme === t.id ? 'active' : ''}" data-set-theme="${t.id}">
              ${t.label}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="settings-card">
        <div class="setting-row">
          <span>Tamanho da fonte (${prefs.fontSize}px)</span>
          <div class="browser-actions" style="margin: 0;">
            <button type="button" class="secondary-btn" id="btn-font-dec">A-</button>
            <button type="button" class="secondary-btn" id="btn-font-inc">A+</button>
          </div>
        </div>
        <div class="setting-row">
          <span>Tipografia</span>
          <div class="browser-actions" style="margin: 0;">
            <button type="button" class="${prefs.fontFamily === 'serif' ? 'primary-btn' : 'secondary-btn'}" data-set-font="serif">Serifa</button>
            <button type="button" class="${prefs.fontFamily === 'sans' ? 'primary-btn' : 'secondary-btn'}" data-set-font="sans">Sem serifa</button>
          </div>
        </div>
        <div class="setting-row">
          <label for="chk-justify">Texto justificado</label>
          <input type="checkbox" id="chk-justify" ${prefs.justifyText ? 'checked' : ''} />
        </div>
        <div class="setting-row">
          <label for="chk-strongs">Exibir códigos Strong (se o módulo possuir)</label>
          <input type="checkbox" id="chk-strongs" ${prefs.showStrongs ? 'checked' : ''} />
        </div>
      </div>
    `;

    modal.body.querySelectorAll('[data-set-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.updatePrefs({ theme: btn.dataset.setTheme });
        renderReadingTab();
      });
    });

    modal.body.querySelector('#btn-font-dec')?.addEventListener('click', () => {
      store.updatePrefs({ fontSize: Math.max(14, prefs.fontSize - 1) });
      renderReadingTab();
    });

    modal.body.querySelector('#btn-font-inc')?.addEventListener('click', () => {
      store.updatePrefs({ fontSize: Math.min(32, prefs.fontSize + 1) });
      renderReadingTab();
    });

    modal.body.querySelectorAll('[data-set-font]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.updatePrefs({ fontFamily: btn.dataset.setFont });
        renderReadingTab();
      });
    });

    modal.body.querySelector('#chk-justify')?.addEventListener('change', (ev) => {
      store.updatePrefs({ justifyText: Boolean(ev.target.checked) });
    });

    modal.body.querySelector('#chk-strongs')?.addEventListener('change', (ev) => {
      store.updatePrefs({ showStrongs: Boolean(ev.target.checked) });
    });
  }

  function renderCurrentTab() {
    if (activeTab === 'sources') renderSourcesTab();
    else renderReadingTab();
  }

  modal.sheet.querySelectorAll('[data-cfg-tab]').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      activeTab = tabBtn.dataset.cfgTab;
      syncTabs();
      renderCurrentTab();
    });
  });

  renderCurrentTab();
}
