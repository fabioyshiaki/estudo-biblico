import { nativeBridge } from '../bridge/native-bridge.js';
import { store } from '../core/store.js';
import { eventBus, EVENTS } from '../core/events.js';
import { appLogger } from '../core/logger.js';
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

function formatLogClock(ts) {
  try {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch (err) {
    return '';
  }
}

async function copyTextSafe(text) {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    // Segue para fallback de textarea no WebView
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

function getKindMeta(kind) {
  if (kind === 'dictionary') {
    return {
      resourceKind: 'dictionary',
      formatId: 'mysword_dct',
      extLabel: '.dct.mybible',
      pluralLabel: 'Dicionário(s)',
      browserTitle: 'Navegador manual (Dicionários MySword .dct.mybible)'
    };
  }
  return {
    resourceKind: 'bible',
    formatId: 'mysword_bbl',
    extLabel: '.bbl.mybible',
    pluralLabel: 'Bíblia(s)',
    browserTitle: 'Navegador manual (Bíblias MySword .bbl.mybible)'
  };
}

export function openSettingsModal({ initialTab = 'sources', initialKind = null } = {}) {
  let activeTab = initialTab;
  let browserKind = initialKind === 'dictionary'
    ? 'dictionary'
    : (initialKind === 'bible' ? 'bible' : (store.getActiveMode() === 'dictionary' ? 'dictionary' : 'bible'));
  let browserOpen = false;
  let browserRoots = [];
  let browserDir = null;
  let recursiveFlag = false;
  let busy = false;
  let logFilter = 'all'; // 'all' | 'error' | 'warn'

  const initStats = appLogger.getStats();
  const errLabel = initStats.errors > 0 ? ` (${initStats.errors})` : '';

  const modal = openModalShell({
    title: 'Configurações',
    tabsHtml: `
      <button type="button" class="modal-tab ${activeTab === 'sources' ? 'active' : ''}" data-cfg-tab="sources">Fontes</button>
      <button type="button" class="modal-tab ${activeTab === 'reading' ? 'active' : ''}" data-cfg-tab="reading">Leitura</button>
      <button type="button" class="modal-tab ${activeTab === 'logs' ? 'active' : ''}" data-cfg-tab="logs" id="cfg-tab-logs">Logs${errLabel}</button>
    `
  });
  if (!modal || !modal.body) return;

  function syncTabs() {
    modal.sheet.querySelectorAll('[data-cfg-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.cfgTab === activeTab);
    });
    const logTabBtn = modal.sheet.querySelector('#cfg-tab-logs');
    if (logTabBtn) {
      const st = appLogger.getStats();
      logTabBtn.textContent = st.errors > 0 ? `Logs (${st.errors})` : 'Logs';
    }
  }

  async function openBrowserAt(path, forcedKind = null) {
    if (forcedKind) {
      browserKind = forcedKind;
    }
    const meta = getKindMeta(browserKind);
    busy = true;
    renderCurrentTab();
    try {
      if (!browserRoots.length) {
        const resRoots = await nativeBridge.getStorageRoots();
        browserRoots = Array.isArray(resRoots && resRoots.roots) ? resRoots.roots : [];
      }
      const targetPath = path || (browserRoots[0] && browserRoots[0].path) || '/storage/emulated/0';
      browserDir = await nativeBridge.listDirectory(targetPath, meta.formatId);
      browserOpen = true;
    } catch (err) {
      eventBus.emit(EVENTS.TOAST, err.message || 'Não foi possível abrir a pasta.');
    } finally {
      busy = false;
      renderCurrentTab();
    }
  }

  async function authorizeSource(path, mode) {
    const meta = getKindMeta(browserKind);
    busy = true;
    renderCurrentTab();
    try {
      const res = await nativeBridge.addSource({
        path,
        mode,
        recursive: mode === 'folder' ? recursiveFlag : false,
        resourceKind: meta.resourceKind,
        formatId: meta.formatId
      });
      store.clearStructureCache();
      store.setSourcesAndModules(res.sources, res.modules);
      const count = Number(res.addedCount) || 0;
      eventBus.emit(EVENTS.TOAST, count > 0
        ? `${count} ${meta.pluralLabel} autorizado(s) em modo somente leitura.`
        : `Fonte salva, mas nenhum ${meta.extLabel} válido foi encontrado nela.`);
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
    const meta = getKindMeta(browserKind);
    const parts = [];

    if (isNative && !state.hasStoragePermission) {
      parts.push(`
        <div class="settings-card">
          <div class="row-title">Permissão de acesso aos arquivos</div>
          <p class="row-sub" style="margin: 6px 0 12px;">
            Necessária apenas para abrir suas Bíblias e Dicionários diretamente em modo somente leitura, sem duplicar arquivos.
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
          <button type="button" class="${browserOpen && browserKind === 'bible' ? 'primary-btn' : 'secondary-btn'}" id="btn-browse-bibles" ${busy ? 'disabled' : ''}>
            + Bíblias (.bbl)
          </button>
          <button type="button" class="${browserOpen && browserKind === 'dictionary' ? 'primary-btn' : 'secondary-btn'}" id="btn-browse-dicts" ${busy ? 'disabled' : ''}>
            + Dicionários (.dct)
          </button>
          ${browserOpen ? `<button type="button" class="secondary-btn" id="btn-close-browser" ${busy ? 'disabled' : ''}>Fechar</button>` : ''}
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

      const iconChar = browserKind === 'dictionary' ? '&#128213;' : '&#128214;';
      const filesHtml = (browserDir && browserDir.files || []).map((f) => `
        <div class="browser-item">
          <div class="row-main">
            <div class="row-title">${iconChar} ${escapeHtml(f.name)}</div>
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
          <div class="section-label">${escapeHtml(meta.browserTitle)}</div>
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
            ${!dirsHtml && !filesHtml && !busy ? `<p class="row-sub">Nenhuma subpasta ou arquivo ${escapeHtml(meta.extLabel)} neste diretório.</p>` : ''}
          </div>
        </div>
      `);
    }

    if (state.sources.length) {
      const listHtml = state.sources.map((s) => {
        const unitLabel = s.resourceKind === 'dictionary'
          ? 'Dicionário(s)'
          : (s.resourceKind === 'mixed' ? 'Módulo(s)' : 'Bíblia(s)');
        return `
          <div class="source-card">
            <div class="row-main">
              <div class="row-title">${escapeHtml(s.label)}</div>
              <div class="row-sub">
                ${s.sourceMode === 'folder' ? (s.recursive ? 'Pasta (+ subpastas)' : 'Pasta única') : 'Arquivo único'}
                • ${s.moduleCount} ${unitLabel}
              </div>
              <div class="row-sub">${escapeHtml(s.path)}</div>
            </div>
            <button type="button" class="danger-btn" data-remove-source="${s.id}" ${busy ? 'disabled' : ''}>
              Remover
            </button>
          </div>
        `;
      }).join('');
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

    modal.body.querySelector('#btn-browse-bibles')?.addEventListener('click', () => {
      openBrowserAt(browserDir ? browserDir.currentPath : '', 'bible');
    });

    modal.body.querySelector('#btn-browse-dicts')?.addEventListener('click', () => {
      openBrowserAt(browserDir ? browserDir.currentPath : '', 'dictionary');
    });

    modal.body.querySelector('#btn-close-browser')?.addEventListener('click', () => {
      browserOpen = false;
      renderSourcesTab();
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
    const sortBy = prefs.bibleSortBy === 'title' ? 'title' : 'abbr';
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
          <span>Organizar módulos por</span>
          <div class="browser-actions" style="margin: 0;">
            <button type="button" class="${sortBy === 'abbr' ? 'primary-btn' : 'secondary-btn'}" data-set-bible-sort="abbr">Abreviação</button>
            <button type="button" class="${sortBy === 'title' ? 'primary-btn' : 'secondary-btn'}" data-set-bible-sort="title">Descrição</button>
          </div>
        </div>
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
        <div class="setting-row">
          <label for="chk-morph">Exibir morfologia (se o módulo possuir)</label>
          <input type="checkbox" id="chk-morph" ${prefs.showMorph ? 'checked' : ''} />
        </div>
      </div>
    `;

    modal.body.querySelectorAll('[data-set-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.updatePrefs({ theme: btn.dataset.setTheme });
        renderReadingTab();
      });
    });

    modal.body.querySelectorAll('[data-set-bible-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.updatePrefs({ bibleSortBy: btn.dataset.setBibleSort });
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

    modal.body.querySelector('#chk-morph')?.addEventListener('change', (ev) => {
      store.updatePrefs({ showMorph: Boolean(ev.target.checked) });
    });
  }

  function renderLogsTab() {
    const stats = appLogger.getStats();
    const items = appLogger.getLogs({ level: logFilter });

    const levelColor = (lvl) => {
      if (lvl === 'error') return 'var(--text-red-letter, #c62828)';
      if (lvl === 'warn') return '#b26a00';
      return 'var(--accent)';
    };

    const listHtml = items.length
      ? items.map((it) => `
          <div style="padding:10px 12px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-app);margin-bottom:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:4px;font-family:var(--font-ui);font-size:11.5px;">
              <span style="font-weight:700;color:${levelColor(it.level)};">[${escapeHtml(it.level.toUpperCase())}] ${escapeHtml(it.scope)}</span>
              <span style="color:var(--text-muted);">${escapeHtml(formatLogClock(it.ts))}</span>
            </div>
            <div style="font-family:var(--font-ui);font-size:13px;font-weight:600;color:var(--text-main);word-break:break-word;">
              ${escapeHtml(it.message)}
            </div>
            ${it.detail ? `<pre style="margin:6px 0 0;padding:8px;border-radius:6px;background:var(--bg-surface);border:1px solid var(--border);font-size:11.5px;line-height:1.4;white-space:pre-wrap;word-break:break-word;color:var(--text-muted);max-height:220px;overflow:auto;">${escapeHtml(it.detail)}</pre>` : ''}
          </div>
        `).join('')
      : '<p class="row-sub" style="margin:8px 0;">Nenhum log registrado neste filtro. Quando ocorrer um erro no app, ele aparecerá salvo aqui automaticamente.</p>';

    modal.body.innerHTML = `
      <div class="settings-card">
        <div class="row-title">Registro de erros e diagnóstico</div>
        <p class="row-sub" style="margin: 4px 0 10px;">
          Salvo automaticamente no dispositivo (${stats.total} registro(s) • ${stats.errors} erro(s) • ${stats.warns} aviso(s)).
        </p>
        <div class="browser-actions" style="margin-bottom:8px;">
          <button type="button" class="primary-btn" id="btn-copy-logs" ${items.length ? '' : 'disabled'}>Copiar logs</button>
          <button type="button" class="secondary-btn" id="btn-refresh-logs">Atualizar</button>
          <button type="button" class="danger-btn" id="btn-clear-logs" ${stats.total ? '' : 'disabled'}>Limpar</button>
        </div>
        <div class="browser-actions" style="margin:0;">
          <button type="button" class="${logFilter === 'all' ? 'primary-btn' : 'secondary-btn'}" data-log-filter="all">Todos (${stats.total})</button>
          <button type="button" class="${logFilter === 'error' ? 'primary-btn' : 'secondary-btn'}" data-log-filter="error">Erros (${stats.errors})</button>
          <button type="button" class="${logFilter === 'warn' ? 'primary-btn' : 'secondary-btn'}" data-log-filter="warn">Avisos (${stats.warns})</button>
        </div>
      </div>

      <div id="logs-list-box">${listHtml}</div>
    `;

    modal.body.querySelector('#btn-copy-logs')?.addEventListener('click', async () => {
      const report = appLogger.formatLogsForShare({ level: logFilter, maxItems: 80 });
      const ok = await copyTextSafe(report);
      if (ok) {
        eventBus.emit(EVENTS.TOAST, 'Logs copiados! Agora é só colar na conversa.');
      } else {
        // Fallback visual: abre caixa selecionável caso o WebView bloqueie cópia automática
        const box = modal.body.querySelector('#logs-list-box');
        if (box) {
          box.innerHTML =
            '<p class="row-sub" style="margin:0 0 6px;">Selecione e copie o texto abaixo:</p>' +
            `<textarea style="width:100%;min-height:260px;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg-app);color:var(--text-main);font-family:monospace;font-size:12px;" readonly>${escapeHtml(report)}</textarea>`;
        }
      }
    });

    modal.body.querySelector('#btn-refresh-logs')?.addEventListener('click', () => {
      syncTabs();
      renderLogsTab();
    });

    modal.body.querySelector('#btn-clear-logs')?.addEventListener('click', () => {
      appLogger.clearLogs();
      syncTabs();
      renderLogsTab();
      eventBus.emit(EVENTS.TOAST, 'Logs limpos.');
    });

    modal.body.querySelectorAll('[data-log-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        logFilter = btn.dataset.logFilter || 'all';
        renderLogsTab();
      });
    });
  }

  function renderCurrentTab() {
    syncTabs();
    if (activeTab === 'sources') renderSourcesTab();
    else if (activeTab === 'reading') renderReadingTab();
    else renderLogsTab();
  }

  modal.sheet.querySelectorAll('[data-cfg-tab]').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      activeTab = tabBtn.dataset.cfgTab;
      renderCurrentTab();
    });
  });

  renderCurrentTab();
}
