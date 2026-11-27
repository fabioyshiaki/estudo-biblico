import { closeModal } from './nav-modal.js';
import { eventBus, EVENTS } from '../core/events.js';
import { formatReference } from '../core/canon.js';
import { appLogger } from '../core/logger.js';
import {
  isMapReaderAvailable,
  getMapDirectory,
  pickMapDirectory,
  setMapDirectory,
  listMapModules,
  getMapModuleIndex,
  getMapEntry,
  searchMaps,
  resolveMapsForMarker,
  parseInternalMapHref,
  getSavedActiveMapModulePath,
  setSavedActiveMapModulePath
} from '../formats/map-service.js';

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

function sanitizeMapHtml(rawHtml) {
  return String(rawHtml || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*["'][^"']*["']/gi, '');
}

function getModuleDisplayName(mod) {
  if (!mod) return 'Atlas';
  return mod.title || mod.name || mod.abbreviation || mod.fileName || 'Atlas';
}

export function openMapViewerModal({
  markerInfo = null,
  initialModulePath = '',
  initialQuery = '',
  onMapsDirectoryChanged = null
} = {}) {
  closeModal();

  const root = document.getElementById('modal-root');
  if (!root) return;

  let dirPath = '';
  let modules = [];
  let activeModulePath = initialModulePath || getSavedActiveMapModulePath();
  let activeIndex = [];
  let currentEntry = null;
  let activeImageIdx = 0;
  let recommendedMaps = [];
  let openDrawer = ''; // '' | 'index' | 'folder'
  let indexFilterText = initialQuery || '';
  let globalSearchResults = null;
  let loadingText = 'Carregando atlas de mapas...';
  let errorText = '';

  // Estado do zoom e arraste no palco do mapa
  let zoomScale = 1;
  let panX = 0;
  let panY = 0;

  let keyHandler = null;
  let isClosed = false;

  function cleanupAndClose() {
    isClosed = true;
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

  function getActiveModule() {
    if (!modules.length) return null;
    return modules.find((m) => m.path === activeModulePath) || modules[0];
  }

  function resetTransform() {
    zoomScale = 1;
    panX = 0;
    panY = 0;
    applyStageTransform();
  }

  function clampPan(stageEl) {
    if (!stageEl || zoomScale <= 1.01) {
      panX = 0;
      panY = 0;
      return;
    }
    const maxX = Math.max(0, (stageEl.clientWidth * (zoomScale - 1)) / 2 + 120);
    const maxY = Math.max(0, (stageEl.clientHeight * (zoomScale - 1)) / 2 + 120);
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
  }

  function applyStageTransform() {
    const imgEl = document.getElementById('map-stage-img');
    const stageEl = document.getElementById('map-stage');
    const badgeEl = document.getElementById('map-zoom-badge');
    const resetBtn = document.getElementById('map-btn-zoom-reset');

    clampPan(stageEl);
    if (imgEl) {
      imgEl.style.transform = `translate3d(${panX.toFixed(1)}px, ${panY.toFixed(1)}px, 0) scale(${zoomScale.toFixed(3)})`;
    }
    const pct = `${Math.round(zoomScale * 100)}%`;
    if (badgeEl) {
      badgeEl.textContent = pct;
      badgeEl.style.opacity = zoomScale > 1.02 ? '1' : '0.68';
    }
    if (resetBtn) {
      resetBtn.textContent = pct;
    }
  }

  function setZoom(nextScale) {
    zoomScale = Math.max(1, Math.min(6, Number(nextScale) || 1));
    if (zoomScale <= 1.03) {
      zoomScale = 1;
      panX = 0;
      panY = 0;
    }
    applyStageTransform();
  }

  function renderShell() {
    root.innerHTML = `
      <div class="map-viewer-backdrop" id="map-viewer-backdrop" role="dialog" aria-modal="true" aria-label="Leitor de Mapas" data-bref-skip="1">
        <header class="map-viewer-header">
          <button type="button" class="map-hdr-btn" id="map-btn-close" aria-label="Fechar mapas" title="Voltar">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          <div class="map-hdr-titles">
            <h1 class="map-hdr-title" id="map-hdr-title">Atlas e Mapas</h1>
            <span class="map-hdr-sub" id="map-hdr-sub">Carregando...</span>
          </div>

          <button type="button" class="map-hdr-btn" id="map-btn-index" title="Escolher atlas e lista de mapas">
            &#9776; Índice
          </button>

          <button type="button" class="map-hdr-btn" id="map-btn-folder" title="Escolher pasta dos arquivos de mapa">
            &#128193; Pasta
          </button>
        </header>

        <section class="map-verse-strip hidden" id="map-verse-strip"></section>
        <section class="map-drawer hidden" id="map-drawer"></section>

        <main class="map-main-area" id="map-main-area"></main>

        <footer class="map-bottom-bar" id="map-bottom-bar">
          <div class="map-bar-group">
            <button type="button" class="map-ctrl-btn" id="map-btn-prev" title="Mapa anterior">&larr;</button>
            <button type="button" class="map-ctrl-btn" id="map-btn-next" title="Próximo mapa">&rarr;</button>
          </div>

          <div class="map-bar-group">
            <button type="button" class="map-ctrl-btn" id="map-btn-zoom-out" title="Diminuir zoom">&minus;</button>
            <button type="button" class="map-ctrl-btn" id="map-btn-zoom-reset" title="Resetar zoom">100%</button>
            <button type="button" class="map-ctrl-btn" id="map-btn-zoom-in" title="Aumentar zoom">+</button>
          </div>

          <div class="map-bar-group">
            <button type="button" class="map-ctrl-btn" id="map-btn-foot-close">Fechar</button>
          </div>
        </footer>
      </div>
    `;

    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');

    document.getElementById('map-btn-close')?.addEventListener('click', cleanupAndClose);
    document.getElementById('map-btn-foot-close')?.addEventListener('click', cleanupAndClose);

    document.getElementById('map-btn-index')?.addEventListener('click', () => {
      openDrawer = openDrawer === 'index' ? '' : 'index';
      renderHeaderAndDrawers();
    });

    document.getElementById('map-btn-folder')?.addEventListener('click', () => {
      openDrawer = openDrawer === 'folder' ? '' : 'folder';
      renderHeaderAndDrawers();
    });

    document.getElementById('map-btn-prev')?.addEventListener('click', () => stepMapInAtlas(-1));
    document.getElementById('map-btn-next')?.addEventListener('click', () => stepMapInAtlas(1));
    document.getElementById('map-btn-zoom-out')?.addEventListener('click', () => setZoom(zoomScale - 0.5));
    document.getElementById('map-btn-zoom-in')?.addEventListener('click', () => setZoom(zoomScale + 0.6));
    document.getElementById('map-btn-zoom-reset')?.addEventListener('click', resetTransform);
  }

  function updateHeader() {
    const titleEl = document.getElementById('map-hdr-title');
    const subEl = document.getElementById('map-hdr-sub');
    const idxBtn = document.getElementById('map-btn-index');
    const dirBtn = document.getElementById('map-btn-folder');

    const activeMod = getActiveModule();
    if (titleEl) {
      titleEl.textContent = currentEntry && currentEntry.title
        ? currentEntry.title
        : (activeMod ? getModuleDisplayName(activeMod) : 'Atlas e Mapas');
    }
    if (subEl) {
      const modName = activeMod ? getModuleDisplayName(activeMod) : 'Nenhum atlas carregado';
      const refPart = markerInfo
        ? `${formatReference(markerInfo.book, markerInfo.chapter, markerInfo.verse)} • `
        : '';
      subEl.textContent = `${refPart}${modName}`;
    }
    if (idxBtn) idxBtn.classList.toggle('is-active', openDrawer === 'index');
    if (dirBtn) dirBtn.classList.toggle('is-active', openDrawer === 'folder');
  }

  function renderVerseStrip() {
    const strip = document.getElementById('map-verse-strip');
    if (!strip) return;

    const locs = (markerInfo && Array.isArray(markerInfo.locations)) ? markerInfo.locations : [];
    if (!markerInfo || (!locs.length && !recommendedMaps.length)) {
      strip.classList.add('hidden');
      strip.innerHTML = '';
      return;
    }

    strip.classList.remove('hidden');
    const refTxt = formatReference(markerInfo.book, markerInfo.chapter, markerInfo.verse);

    const locsHtml = locs.length
      ? (
        '<div class="map-verse-row">' +
          `<span class="map-verse-tag">${escapeHtml(refTxt)}:</span>` +
          locs.map((l) => (
            `<button type="button" class="map-loc-pill" data-map-loc-search="${escapeHtml(l.name)}">&#128205; ${escapeHtml(l.name)}</button>`
          )).join('') +
        '</div>'
      )
      : '';

    const recsHtml = recommendedMaps.length
      ? (
        '<div class="map-verse-row">' +
          '<span class="map-verse-tag">Mapas:</span>' +
          recommendedMaps.map((m, idx) => {
            const isCur = Boolean(
              currentEntry &&
              currentEntry.modulePath === m.modulePath &&
              (
                (Number(m.rowid) > 0 && Number(currentEntry.rowid) === Number(m.rowid)) ||
                (m.id && currentEntry.id && m.id.toLowerCase() === currentEntry.id.toLowerCase()) ||
                (m.title && currentEntry.title && m.title.toLowerCase() === currentEntry.title.toLowerCase())
              )
            );
            const modShort = m.moduleTitle ? ` (${m.moduleTitle})` : '';
            return (
              `<button type="button" class="map-rec-chip${isCur ? ' is-active' : ''}" data-map-rec-idx="${idx}" title="${escapeHtml(`${m.title}${modShort}`)}">` +
                escapeHtml(m.title) +
              '</button>'
            );
          }).join('') +
        '</div>'
      )
      : '';

    strip.innerHTML = `${locsHtml}${recsHtml}`;

    strip.querySelectorAll('[data-map-loc-search]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const term = btn.getAttribute('data-map-loc-search') || '';
        if (!term) return;
        indexFilterText = term;
        openDrawer = 'index';
        globalSearchResults = await searchMaps(term, { limit: 25 });
        if (!isClosed) renderHeaderAndDrawers();
      });
    });

    strip.querySelectorAll('[data-map-rec-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-map-rec-idx'));
        const item = recommendedMaps[idx];
        if (!item) return;
        openDrawer = '';
        loadSpecificEntry({
          modulePath: item.modulePath,
          id: item.id,
          rowid: item.rowid,
          title: item.title
        });
      });
    });
  }

  function renderDrawer() {
    const drawer = document.getElementById('map-drawer');
    if (!drawer) return;

    if (!openDrawer) {
      drawer.classList.add('hidden');
      drawer.innerHTML = '';
      return;
    }

    drawer.classList.remove('hidden');

    if (openDrawer === 'folder') {
      drawer.innerHTML = `
        <div class="map-verse-tag">Pasta atual dos arquivos de mapa (.bok.mybible / .map.mybible):</div>
        <div class="map-path-box">${escapeHtml(dirPath || 'Nenhuma pasta configurada')}</div>
        <div class="map-drawer-row">
          <button type="button" class="primary-btn" id="map-pick-dir-btn">Escolher pasta (Android)</button>
          <button type="button" class="secondary-btn" id="map-refresh-dir-btn">Reverificar (${modules.length} atlas)</button>
        </div>
        <form class="map-drawer-row" id="map-manual-dir-form">
          <input
            type="text"
            class="map-text-input"
            id="map-manual-dir-input"
            value="${escapeHtml(dirPath)}"
            placeholder="/storage/emulated/0/mysword/books"
            autocomplete="off"
            spellcheck="false"
          />
          <button type="submit" class="secondary-btn">Salvar caminho</button>
        </form>
      `;

      drawer.querySelector('#map-pick-dir-btn')?.addEventListener('click', async () => {
        try {
          const res = await pickMapDirectory();
          if (res && res.path) {
            dirPath = res.path;
            eventBus.emit(EVENTS.TOAST, `Pasta de mapas definida: ${dirPath}`);
            await reloadModulesAndRefresh({ notifyParent: true });
          }
        } catch (err) {
          eventBus.emit(EVENTS.TOAST, err && err.message ? err.message : 'Seleção de pasta cancelada.');
        }
      });

      drawer.querySelector('#map-refresh-dir-btn')?.addEventListener('click', async () => {
        await reloadModulesAndRefresh({ notifyParent: true });
        eventBus.emit(EVENTS.TOAST, `${modules.length} arquivo(s) de mapa encontrado(s).`);
      });

      drawer.querySelector('#map-manual-dir-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const inp = drawer.querySelector('#map-manual-dir-input');
        const nextPath = inp ? inp.value.trim() : '';
        if (!nextPath) return;
        try {
          const res = await setMapDirectory(nextPath);
          dirPath = (res && res.path) || nextPath;
          eventBus.emit(EVENTS.TOAST, 'Pasta de mapas atualizada.');
          await reloadModulesAndRefresh({ notifyParent: true });
        } catch (err) {
          eventBus.emit(EVENTS.TOAST, err && err.message ? err.message : 'Não foi possível usar o caminho informado.');
        }
      });
      return;
    }

    // Gaveta de Índice e Busca de Mapas
    const atlasOptionsHtml = modules.map((m) => {
      const label = `${getModuleDisplayName(m)} (${m.mapCount || 0})`;
      return `<option value="${escapeHtml(m.path)}"${m.path === activeModulePath ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

    const cleanQ = normalizeAscii(indexFilterText).trim();
    const listItems = Array.isArray(globalSearchResults)
      ? globalSearchResults
      : activeIndex
          .filter((it) => !cleanQ || normalizeAscii(`${it.title} ${it.tags || ''}`).includes(cleanQ))
          .map((it) => ({
            ...it,
            modulePath: activeModulePath,
            moduleTitle: ''
          }));

    const itemsHtml = listItems.length
      ? listItems.map((it, idx) => {
          const isCur = Boolean(
            currentEntry &&
            currentEntry.modulePath === it.modulePath &&
            Number(currentEntry.rowid) === Number(it.rowid)
          );
          return (
            `<button type="button" class="map-index-item${isCur ? ' is-active' : ''}" data-map-idx-pos="${idx}">` +
              `<span>${escapeHtml(it.title || it.id || `Mapa ${it.rowid}`)}</span>` +
              (it.moduleTitle ? `<span class="map-index-sub">${escapeHtml(it.moduleTitle)}</span>` : '') +
            '</button>'
          );
        }).join('')
      : '<div style="font-size:13px;color:var(--map-muted);padding:8px 2px;">Nenhum mapa encontrado para este filtro.</div>';

    drawer.innerHTML = `
      ${modules.length ? `
        <select class="map-select" id="map-atlas-select" aria-label="Escolher módulo de atlas">
          ${atlasOptionsHtml}
        </select>
      ` : ''}
      <form class="map-drawer-row" id="map-idx-search-form">
        <input
          type="search"
          class="map-text-input"
          id="map-idx-search-input"
          value="${escapeHtml(indexFilterText)}"
          placeholder="Filtrar índice ou buscar em todos os atlas..."
          autocomplete="off"
        />
        <button type="submit" class="secondary-btn">Todos</button>
        ${globalSearchResults ? '<button type="button" class="secondary-btn" id="map-idx-clear-global">Índice</button>' : ''}
      </form>
      <div class="map-index-list" id="map-index-list">${itemsHtml}</div>
    `;

    drawer.querySelector('#map-atlas-select')?.addEventListener('change', async (ev) => {
      const nextPath = ev.target.value;
      if (!nextPath || nextPath === activeModulePath) return;
      activeModulePath = nextPath;
      setSavedActiveMapModulePath(nextPath);
      globalSearchResults = null;
      activeIndex = await getMapModuleIndex(nextPath);
      if (isClosed) return;
      renderDrawer();
      if (activeIndex.length) {
        const firstNonToc = activeIndex.find((it) => {
          const n = normalizeAscii(it.title);
          return !n.includes('indice dos mapas') && n !== 'table of contents';
        }) || activeIndex[0];
        await loadSpecificEntry({
          modulePath: nextPath,
          id: firstNonToc.id,
          rowid: firstNonToc.rowid,
          title: firstNonToc.title
        });
      }
    });

    const searchInput = drawer.querySelector('#map-idx-search-input');
    searchInput?.addEventListener('input', () => {
      indexFilterText = searchInput.value || '';
      globalSearchResults = null;
      renderDrawer();
    });

    drawer.querySelector('#map-idx-search-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const q = searchInput ? searchInput.value.trim() : '';
      indexFilterText = q;
      if (!q) {
        globalSearchResults = null;
        renderDrawer();
        return;
      }
      globalSearchResults = await searchMaps(q, { limit: 35 });
      if (!isClosed) renderDrawer();
    });

    drawer.querySelector('#map-idx-clear-global')?.addEventListener('click', () => {
      globalSearchResults = null;
      indexFilterText = '';
      renderDrawer();
    });

    drawer.querySelector('#map-index-list')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-map-idx-pos]');
      if (!btn) return;
      const pos = Number(btn.getAttribute('data-map-idx-pos'));
      const chosen = listItems[pos];
      if (!chosen) return;
      openDrawer = '';
      loadSpecificEntry({
        modulePath: chosen.modulePath || activeModulePath,
        id: chosen.id,
        rowid: chosen.rowid,
        title: chosen.title
      });
    });
  }

  function renderHeaderAndDrawers() {
    updateHeader();
    renderVerseStrip();
    renderDrawer();
    syncBottomButtons();
  }

  function syncBottomButtons() {
    const prevBtn = document.getElementById('map-btn-prev');
    const nextBtn = document.getElementById('map-btn-next');
    const zOut = document.getElementById('map-btn-zoom-out');
    const zIn = document.getElementById('map-btn-zoom-in');
    const zReset = document.getElementById('map-btn-zoom-reset');

    const hasImages = Boolean(currentEntry && Array.isArray(currentEntry.images) && currentEntry.images.length > 0);
    const curPos = currentEntry && activeIndex.length
      ? activeIndex.findIndex((it) => Number(it.rowid) === Number(currentEntry.rowid))
      : -1;

    if (prevBtn) prevBtn.disabled = curPos <= 0;
    if (nextBtn) nextBtn.disabled = curPos < 0 || curPos >= activeIndex.length - 1;
    if (zOut) zOut.disabled = !hasImages;
    if (zIn) zIn.disabled = !hasImages;
    if (zReset) zReset.disabled = !hasImages;
  }

  function bindTouchGestures(stageEl) {
    if (!stageEl) return;

    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let startPanX = 0;
    let startPanY = 0;

    let pinching = false;
    let pinchStartDist = 0;
    let pinchStartScale = 1;

    let lastTapTs = 0;

    const getTouchDist = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    stageEl.addEventListener('touchstart', (ev) => {
      if (ev.touches.length === 2) {
        ev.preventDefault();
        dragging = false;
        pinching = true;
        pinchStartDist = getTouchDist(ev.touches[0], ev.touches[1]);
        pinchStartScale = zoomScale;
        return;
      }

      if (ev.touches.length === 1) {
        const now = Date.now();
        if (now - lastTapTs < 290) {
          ev.preventDefault();
          lastTapTs = 0;
          if (zoomScale > 1.2) {
            resetTransform();
          } else {
            setZoom(2.4);
          }
          return;
        }
        lastTapTs = now;

        pinching = false;
        dragging = true;
        dragStartX = ev.touches[0].clientX;
        dragStartY = ev.touches[0].clientY;
        startPanX = panX;
        startPanY = panY;
      }
    }, { passive: false });

    stageEl.addEventListener('touchmove', (ev) => {
      if (pinching && ev.touches.length === 2) {
        ev.preventDefault();
        const dist = getTouchDist(ev.touches[0], ev.touches[1]);
        if (pinchStartDist > 0) {
          const next = pinchStartScale * (dist / pinchStartDist);
          setZoom(next);
        }
        return;
      }

      if (dragging && ev.touches.length === 1 && zoomScale > 1.02) {
        ev.preventDefault();
        panX = startPanX + (ev.touches[0].clientX - dragStartX);
        panY = startPanY + (ev.touches[0].clientY - dragStartY);
        applyStageTransform();
      }
    }, { passive: false });

    stageEl.addEventListener('touchend', (ev) => {
      if (ev.touches.length === 1) {
        pinching = false;
        dragging = true;
        dragStartX = ev.touches[0].clientX;
        dragStartY = ev.touches[0].clientY;
        startPanX = panX;
        startPanY = panY;
      } else if (ev.touches.length === 0) {
        pinching = false;
        dragging = false;
      }
    });

    stageEl.addEventListener('touchcancel', () => {
      pinching = false;
      dragging = false;
    });

    // Suporte a roda do mouse / arraste desktop caso aberto em navegador
    stageEl.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const delta = ev.deltaY < 0 ? 0.35 : -0.35;
      setZoom(zoomScale + delta);
    }, { passive: false });
  }

  function renderMainArea() {
    const main = document.getElementById('map-main-area');
    if (!main) return;

    if (!isMapReaderAvailable()) {
      main.innerHTML = `
        <div class="map-empty-box">
          <h2>Leitor de Mapas disponível no Android</h2>
          <p>O plugin nativo de leitura de mapas SQLite funciona no aplicativo Android instalado no dispositivo.</p>
        </div>
      `;
      syncBottomButtons();
      return;
    }

    if (loadingText) {
      main.innerHTML = `
        <div class="map-empty-box">
          <p>${escapeHtml(loadingText)}</p>
        </div>
      `;
      syncBottomButtons();
      return;
    }

    if (errorText) {
      main.innerHTML = `
        <div class="map-empty-box">
          <h2>Não foi possível abrir o mapa</h2>
          <p>${escapeHtml(errorText)}</p>
          <button type="button" class="secondary-btn" id="map-err-open-folder">Escolher pasta de mapas</button>
        </div>
      `;
      main.querySelector('#map-err-open-folder')?.addEventListener('click', () => {
        openDrawer = 'folder';
        renderHeaderAndDrawers();
      });
      syncBottomButtons();
      return;
    }

    if (!modules.length) {
      main.innerHTML = `
        <div class="map-empty-box">
          <h2>Nenhum arquivo de mapa encontrado</h2>
          <p>Pasta atual: <strong>${escapeHtml(dirPath || 'Não configurada')}</strong>.<br/>Escolha a pasta onde estão seus arquivos de mapa (.bok.mybible ou .map.mybible).</p>
          <button type="button" class="primary-btn" id="map-empty-pick-dir">Escolher pasta de mapas</button>
        </div>
      `;
      main.querySelector('#map-empty-pick-dir')?.addEventListener('click', () => {
        openDrawer = 'folder';
        renderHeaderAndDrawers();
      });
      syncBottomButtons();
      return;
    }

    if (!currentEntry) {
      main.innerHTML = `
        <div class="map-empty-box">
          <h2>Selecione um mapa</h2>
          <p>Toque em <strong>&#9776; Índice</strong> no topo para escolher um atlas ou mapa.</p>
        </div>
      `;
      syncBottomButtons();
      return;
    }

    const images = Array.isArray(currentEntry.images) ? currentEntry.images : [];

    if (images.length > 0) {
      const safeIdx = Math.max(0, Math.min(activeImageIdx, images.length - 1));
      const activeImg = images[safeIdx];

      const switcherHtml = images.length > 1
        ? (
          '<div class="map-img-switcher">' +
            images.map((im, idx) => (
              `<button type="button" class="map-rec-chip${idx === safeIdx ? ' is-active' : ''}" data-map-img-idx="${idx}">` +
                escapeHtml(im.fileName || `Mapa ${idx + 1}`) +
              '</button>'
            )).join('') +
          '</div>'
        )
        : '';

      main.innerHTML = `
        ${switcherHtml}
        <div class="map-stage" id="map-stage">
          <img
            class="map-stage-img"
            id="map-stage-img"
            src="${escapeHtml(activeImg.url)}"
            alt="${escapeHtml(currentEntry.title || activeImg.fileName || 'Mapa bíblico')}"
            draggable="false"
          />
          <div class="map-zoom-badge" id="map-zoom-badge">100%</div>
        </div>
      `;

      main.querySelectorAll('[data-map-img-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          activeImageIdx = Number(btn.getAttribute('data-map-img-idx')) || 0;
          resetTransform();
          renderMainArea();
        });
      });

      const stageEl = main.querySelector('#map-stage');
      bindTouchGestures(stageEl);
      resetTransform();
      syncBottomButtons();
      return;
    }

    // Página HTML (ex.: Índice dos Mapas / Table of Contents sem imagem direta)
    const safeHtml = sanitizeMapHtml(currentEntry.content || '');
    main.innerHTML = `
      <div class="map-html-scroll">
        <div class="map-html-content" id="map-html-content">${safeHtml || '<p>Sem conteúdo visual nesta entrada.</p>'}</div>
      </div>
    `;

    main.querySelector('#map-html-content')?.addEventListener('click', (ev) => {
      const link = ev.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      const parsed = parseInternalMapHref(href);
      if (parsed) {
        ev.preventDefault();
        loadSpecificEntry({
          modulePath: currentEntry.modulePath || activeModulePath,
          rowid: parsed.rowid || -1,
          title: parsed.title || ''
        });
      }
    });

    syncBottomButtons();
  }

  async function loadSpecificEntry({ modulePath, id = '', rowid = -1, title = '' }) {
    if (!modulePath) return;
    loadingText = 'Abrindo mapa...';
    errorText = '';
    renderMainArea();

    try {
      if (modulePath !== activeModulePath) {
        activeModulePath = modulePath;
        setSavedActiveMapModulePath(modulePath);
        activeIndex = await getMapModuleIndex(modulePath);
      } else if (!activeIndex.length) {
        activeIndex = await getMapModuleIndex(modulePath);
      }

      const entry = await getMapEntry({ modulePath, id, rowid, title });
      if (isClosed) return;

      loadingText = '';
      if (!entry) {
        errorText = 'Entrada de mapa não encontrada neste arquivo.';
        currentEntry = null;
      } else {
        currentEntry = entry;
        activeImageIdx = 0;
      }

      renderHeaderAndDrawers();
      renderMainArea();
    } catch (err) {
      if (isClosed) return;
      appLogger.error('MAP_OPEN', 'Falha ao abrir entrada de mapa', err);
      loadingText = '';
      errorText = err && err.message ? err.message : 'Erro ao carregar o mapa.';
      renderHeaderAndDrawers();
      renderMainArea();
    }
  }

  async function stepMapInAtlas(delta) {
    if (!activeIndex.length || !currentEntry) return;
    const curPos = activeIndex.findIndex((it) => Number(it.rowid) === Number(currentEntry.rowid));
    if (curPos < 0) return;
    const nextPos = curPos + Number(delta || 0);
    if (nextPos < 0 || nextPos >= activeIndex.length) return;

    const target = activeIndex[nextPos];
    await loadSpecificEntry({
      modulePath: activeModulePath,
      id: target.id,
      rowid: target.rowid,
      title: target.title
    });
  }

  async function reloadModulesAndRefresh({ notifyParent = false } = {}) {
    loadingText = 'Verificando arquivos de mapa...';
    errorText = '';
    renderMainArea();

    const dirInfo = await getMapDirectory();
    dirPath = dirInfo.path || '';
    const listed = await listMapModules({ forceRefresh: true });
    if (isClosed) return;

    dirPath = listed.dirPath || dirPath;
    modules = listed.modules || [];

    if (notifyParent && typeof onMapsDirectoryChanged === 'function') {
      onMapsDirectoryChanged({ dirPath, modules });
    }

    if (!modules.length) {
      loadingText = '';
      currentEntry = null;
      activeIndex = [];
      recommendedMaps = [];
      renderHeaderAndDrawers();
      renderMainArea();
      return;
    }

    if (!modules.some((m) => m.path === activeModulePath)) {
      activeModulePath = modules[0].path;
      setSavedActiveMapModulePath(activeModulePath);
    }

    if (markerInfo) {
      recommendedMaps = await resolveMapsForMarker(markerInfo);
      if (isClosed) return;
    }

    if (recommendedMaps.length) {
      const best = recommendedMaps[0];
      openDrawer = '';
      await loadSpecificEntry({
        modulePath: best.modulePath,
        id: best.id,
        rowid: best.rowid,
        title: best.title
      });
      return;
    }

    activeIndex = await getMapModuleIndex(activeModulePath);
    if (isClosed) return;

    if (activeIndex.length) {
      const firstMap = activeIndex.find((it) => {
        const n = normalizeAscii(it.title);
        return !n.includes('indice dos mapas') && n !== 'table of contents';
      }) || activeIndex[0];
      openDrawer = '';
      await loadSpecificEntry({
        modulePath: activeModulePath,
        id: firstMap.id,
        rowid: firstMap.rowid,
        title: firstMap.title
      });
    } else {
      loadingText = '';
      renderHeaderAndDrawers();
      renderMainArea();
    }
  }

  renderShell();
  renderHeaderAndDrawers();
  renderMainArea();

  if (isMapReaderAvailable()) {
    reloadModulesAndRefresh({ notifyParent: false }).catch((err) => {
      if (isClosed) return;
      appLogger.error('MAP_INIT', 'Erro ao inicializar leitor de mapas', err);
      loadingText = '';
      errorText = err && err.message ? err.message : 'Erro ao carregar os mapas.';
      renderHeaderAndDrawers();
      renderMainArea();
    });
  }
}
