import { closeModal } from './nav-modal.js';
import { eventBus, EVENTS } from '../core/events.js';
import { formatReference } from '../core/canon.js';
import { appLogger } from '../core/logger.js';
import {
  isMapReaderAvailable,
  getMapDirectory,
  pickMapDirectory,
  setMapDirectory,
  listPhotoModules,
  getMapModuleIndex,
  getMapEntry,
  searchPhotos,
  resolvePhotosForPlace,
  resolvePhotosForMarker,
  parseInternalMapHref,
  isTocTitle,
  getSavedActivePhotoModulePath,
  setSavedActivePhotoModulePath
} from '../formats/map-service.js';

const GALLERY_PAGE_SIZE = 120;

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

function getModuleDisplayName(mod) {
  if (!mod) return 'Fotos e Ilustrações';
  return mod.title || mod.name || mod.abbreviation || mod.fileName || 'Fotos e Ilustrações';
}

function sanitizeCaptionHtml(rawHtml) {
  const cleaned = String(rawHtml || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*["'][^"']*["']/gi, '')
    .trim();

  const textOnly = cleaned
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return textOnly.length > 0 ? cleaned : '';
}

export function openPhotoViewerModal({
  markerInfo = null,
  initialPlace = null,
  initialQuery = '',
  initialModulePath = '',
  onDirectoryChanged = null,
  onBackToMap = null
} = {}) {
  closeModal();

  const root = document.getElementById('modal-root');
  if (!root) return;

  let dirPath = '';
  let modules = [];
  let activeModulePath = initialModulePath || getSavedActivePhotoModulePath();
  let activeIndex = [];
  let recommendedPhotos = [];
  let currentEntry = null;
  let activeImageIdx = 0;
  let openDrawer = ''; // '' | 'gallery' | 'folder'
  let filterText = initialQuery || '';
  let globalSearchResults = null;
  let visibleListLimit = GALLERY_PAGE_SIZE;
  let showCaption = true;
  let loadingText = 'Carregando fotos e ilustrações...';
  let errorText = '';

  // Estado de zoom e arraste
  let zoomScale = 1;
  let panX = 0;
  let panY = 0;

  let isClosed = false;
  let keyHandler = null;

  function cleanupOnly() {
    isClosed = true;
    if (keyHandler) {
      window.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
  }

  function cleanupAndClose() {
    cleanupOnly();
    closeModal();
  }

  function handleHeaderBack() {
    if (typeof onBackToMap === 'function') {
      cleanupOnly();
      onBackToMap();
      return;
    }
    cleanupAndClose();
  }

  keyHandler = (ev) => {
    if (ev.key === 'Escape') {
      if (openDrawer) {
        openDrawer = '';
        renderHeaderAndDrawers();
      } else {
        handleHeaderBack();
      }
    }
  };
  window.addEventListener('keydown', keyHandler);

  function getActiveModule() {
    if (!modules.length) return null;
    return modules.find((m) => m.path === activeModulePath) || modules[0];
  }

  function getNavigableList() {
    if (recommendedPhotos.length > 0 && currentEntry) {
      const inRecs = recommendedPhotos.some(
        (it) => it.modulePath === currentEntry.modulePath && Number(it.rowid) === Number(currentEntry.rowid)
      );
      if (inRecs) {
        return recommendedPhotos;
      }
    }
    return activeIndex
      .filter((it) => it.hasImage !== false && !isTocTitle(it.title))
      .map((it) => ({ ...it, modulePath: activeModulePath }));
  }

  function resetTransform() {
    zoomScale = 1;
    panX = 0;
    panY = 0;
    applyStageTransform();
  }

  function applyStageTransform() {
    const imgEl = document.getElementById('photo-stage-img');
    const stageEl = document.getElementById('photo-stage');
    const badgeEl = document.getElementById('photo-zoom-badge');
    const resetBtn = document.getElementById('photo-btn-zoom-reset');

    if (zoomScale <= 1.02) {
      zoomScale = 1;
      panX = 0;
      panY = 0;
    } else if (stageEl) {
      const maxX = Math.max(0, (stageEl.clientWidth * (zoomScale - 1)) / 2 + 140);
      const maxY = Math.max(0, (stageEl.clientHeight * (zoomScale - 1)) / 2 + 140);
      panX = Math.max(-maxX, Math.min(maxX, panX));
      panY = Math.max(-maxY, Math.min(maxY, panY));
    }

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
    applyStageTransform();
  }

  function renderShell() {
    const backLabel = typeof onBackToMap === 'function' ? 'Voltar ao mapa' : 'Fechar fotos';
    root.innerHTML = `
      <div class="photo-viewer-backdrop" id="photo-viewer-backdrop" role="dialog" aria-modal="true" aria-label="Fotos e Ilustrações Bíblicas" data-bref-skip="1">
        <header class="map-viewer-header">
          <button type="button" class="map-hdr-btn" id="photo-btn-back" aria-label="${escapeHtml(backLabel)}" title="${escapeHtml(backLabel)}">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          <div class="map-hdr-titles">
            <h1 class="map-hdr-title" id="photo-hdr-title">Fotos e Ilustrações</h1>
            <span class="map-hdr-sub" id="photo-hdr-sub">Carregando...</span>
          </div>

          <button type="button" class="map-hdr-btn" id="photo-btn-gallery" title="Escolher coleção e lista de fotos">
            &#9776; Galeria
          </button>

          <button type="button" class="map-hdr-btn" id="photo-btn-folder" title="Escolher pasta dos módulos">
            &#128193; Pasta
          </button>
        </header>

        <section class="map-verse-strip hidden" id="photo-context-strip"></section>
        <section class="map-drawer hidden" id="photo-drawer"></section>

        <main class="map-main-area" id="photo-main-area"></main>

        <footer class="map-bottom-bar" id="photo-bottom-bar">
          <div class="map-bar-group">
            <button type="button" class="map-ctrl-btn" id="photo-btn-prev" title="Foto anterior">&larr;</button>
            <span class="photo-counter" id="photo-counter">—</span>
            <button type="button" class="map-ctrl-btn" id="photo-btn-next" title="Próxima foto">&rarr;</button>
          </div>

          <div class="map-bar-group">
            <button type="button" class="map-ctrl-btn" id="photo-btn-zoom-out" title="Diminuir zoom">&minus;</button>
            <button type="button" class="map-ctrl-btn" id="photo-btn-zoom-reset" title="Resetar zoom">100%</button>
            <button type="button" class="map-ctrl-btn" id="photo-btn-zoom-in" title="Aumentar zoom">+</button>
          </div>

          <div class="map-bar-group">
            <button type="button" class="map-ctrl-btn hidden" id="photo-btn-caption" title="Mostrar ou ocultar legenda">Legenda</button>
            <button type="button" class="map-ctrl-btn" id="photo-btn-close">Fechar</button>
          </div>
        </footer>
      </div>
    `;

    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');

    document.getElementById('photo-btn-back')?.addEventListener('click', handleHeaderBack);
    document.getElementById('photo-btn-close')?.addEventListener('click', cleanupAndClose);

    document.getElementById('photo-btn-gallery')?.addEventListener('click', () => {
      openDrawer = openDrawer === 'gallery' ? '' : 'gallery';
      renderHeaderAndDrawers();
    });

    document.getElementById('photo-btn-folder')?.addEventListener('click', () => {
      openDrawer = openDrawer === 'folder' ? '' : 'folder';
      renderHeaderAndDrawers();
    });

    document.getElementById('photo-btn-prev')?.addEventListener('click', () => stepPhoto(-1));
    document.getElementById('photo-btn-next')?.addEventListener('click', () => stepPhoto(1));
    document.getElementById('photo-btn-zoom-out')?.addEventListener('click', () => setZoom(zoomScale - 0.5));
    document.getElementById('photo-btn-zoom-in')?.addEventListener('click', () => setZoom(zoomScale + 0.6));
    document.getElementById('photo-btn-zoom-reset')?.addEventListener('click', resetTransform);

    document.getElementById('photo-btn-caption')?.addEventListener('click', () => {
      showCaption = !showCaption;
      renderMainArea();
    });
  }

  function updateHeader() {
    const titleEl = document.getElementById('photo-hdr-title');
    const subEl = document.getElementById('photo-hdr-sub');
    const galBtn = document.getElementById('photo-btn-gallery');
    const dirBtn = document.getElementById('photo-btn-folder');

    const activeMod = getActiveModule();
    if (titleEl) {
      titleEl.textContent = (currentEntry && currentEntry.title)
        ? currentEntry.title
        : (initialPlace && initialPlace.name)
          ? `Fotos — ${initialPlace.name}`
          : 'Fotos e Ilustrações';
    }

    if (subEl) {
      const parts = [];
      if (initialPlace && initialPlace.name) {
        parts.push(initialPlace.name);
      } else if (markerInfo && markerInfo.book) {
        parts.push(formatReference(markerInfo.book, markerInfo.chapter, markerInfo.verse));
      }
      if (activeMod) {
        parts.push(getModuleDisplayName(activeMod));
      } else {
        parts.push('Nenhuma coleção de fotos encontrada');
      }
      subEl.textContent = parts.join(' • ');
    }

    if (galBtn) galBtn.classList.toggle('is-active', openDrawer === 'gallery');
    if (dirBtn) dirBtn.classList.toggle('is-active', openDrawer === 'folder');
  }

  function renderContextStrip() {
    const strip = document.getElementById('photo-context-strip');
    if (!strip) return;

    if (!recommendedPhotos.length) {
      strip.classList.add('hidden');
      strip.innerHTML = '';
      return;
    }

    strip.classList.remove('hidden');
    const tagLabel = (initialPlace && initialPlace.name)
      ? `Fotos de ${initialPlace.name}:`
      : (markerInfo && markerInfo.book)
        ? `${formatReference(markerInfo.book, markerInfo.chapter, markerInfo.verse)}:`
        : 'Relacionadas:';

    strip.innerHTML = `
      <div class="map-verse-row">
        <span class="map-verse-tag">${escapeHtml(tagLabel)}</span>
        ${recommendedPhotos.map((item, idx) => {
          const isCur = Boolean(
            currentEntry &&
            currentEntry.modulePath === item.modulePath &&
            Number(currentEntry.rowid) === Number(item.rowid)
          );
          const tip = item.moduleTitle ? `${item.title} (${item.moduleTitle})` : item.title;
          return (
            `<button type="button" class="map-rec-chip${isCur ? ' is-active' : ''}" data-photo-rec-idx="${idx}" title="${escapeHtml(tip)}">` +
              escapeHtml(item.title) +
            '</button>'
          );
        }).join('')}
      </div>
    `;

    strip.querySelectorAll('[data-photo-rec-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-photo-rec-idx'));
        const item = recommendedPhotos[idx];
        if (!item) return;
        openDrawer = '';
        loadPhotoEntry({
          modulePath: item.modulePath,
          id: item.id,
          rowid: item.rowid,
          title: item.title
        });
      });
    });
  }

  function renderDrawer() {
    const drawer = document.getElementById('photo-drawer');
    if (!drawer) return;

    if (!openDrawer) {
      drawer.classList.add('hidden');
      drawer.innerHTML = '';
      return;
    }

    drawer.classList.remove('hidden');

    if (openDrawer === 'folder') {
      drawer.innerHTML = `
        <div class="map-verse-tag">Pasta dos arquivos de mapas, fotos e ilustrações:</div>
        <div class="map-path-box">${escapeHtml(dirPath || 'Nenhuma pasta configurada')}</div>
        <div class="map-drawer-row">
          <button type="button" class="primary-btn" id="photo-pick-dir-btn">Escolher pasta (Android)</button>
          <button type="button" class="secondary-btn" id="photo-refresh-dir-btn">Reverificar (${modules.length} coleção(ões))</button>
        </div>
        <form class="map-drawer-row" id="photo-manual-dir-form">
          <input
            type="text"
            class="map-text-input"
            id="photo-manual-dir-input"
            value="${escapeHtml(dirPath)}"
            placeholder="/storage/emulated/0/mysword/books"
            autocomplete="off"
            spellcheck="false"
          />
          <button type="submit" class="secondary-btn">Salvar caminho</button>
        </form>
      `;

      drawer.querySelector('#photo-pick-dir-btn')?.addEventListener('click', async () => {
        try {
          const res = await pickMapDirectory();
          if (res && res.path) {
            dirPath = res.path;
            eventBus.emit(EVENTS.TOAST, `Pasta definida: ${dirPath}`);
            await reloadModules({ notifyParent: true });
          }
        } catch (err) {
          eventBus.emit(EVENTS.TOAST, err && err.message ? err.message : 'Seleção de pasta cancelada.');
        }
      });

      drawer.querySelector('#photo-refresh-dir-btn')?.addEventListener('click', async () => {
        await reloadModules({ notifyParent: true });
        eventBus.emit(EVENTS.TOAST, `${modules.length} coleção(ões) de fotos/ilustrações encontrada(s).`);
      });

      drawer.querySelector('#photo-manual-dir-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const inp = drawer.querySelector('#photo-manual-dir-input');
        const nextPath = inp ? inp.value.trim() : '';
        if (!nextPath) return;
        try {
          const res = await setMapDirectory(nextPath);
          dirPath = (res && res.path) || nextPath;
          eventBus.emit(EVENTS.TOAST, 'Pasta atualizada.');
          await reloadModules({ notifyParent: true });
        } catch (err) {
          eventBus.emit(EVENTS.TOAST, err && err.message ? err.message : 'Caminho inválido.');
        }
      });
      return;
    }

    // Gaveta de Galeria (coleções de fotos e ilustrações)
    if (!modules.length) {
      drawer.innerHTML = `
        <div class="map-verse-tag">Nenhuma coleção de fotos ou ilustrações encontrada na pasta atual.</div>
        <div class="map-drawer-row">
          <button type="button" class="primary-btn" id="photo-no-mod-folder">Escolher pasta</button>
        </div>
      `;
      drawer.querySelector('#photo-no-mod-folder')?.addEventListener('click', () => {
        openDrawer = 'folder';
        renderHeaderAndDrawers();
      });
      return;
    }

    const selectOptions = modules.map((m) => {
      const label = `${getModuleDisplayName(m)} (${m.mapCount || m.imageCount || 0})`;
      return `<option value="${escapeHtml(m.path)}"${m.path === activeModulePath ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

    const cleanQ = normalizeAscii(filterText).trim();
    const allFiltered = Array.isArray(globalSearchResults)
      ? globalSearchResults
      : activeIndex
          .filter((it) => it.hasImage !== false && !isTocTitle(it.title))
          .filter((it) => !cleanQ || normalizeAscii(`${it.title} ${it.tags || ''}`).includes(cleanQ))
          .map((it) => ({ ...it, modulePath: activeModulePath, moduleTitle: '' }));

    const displayedItems = allFiltered.slice(0, visibleListLimit);
    const remainingCount = Math.max(0, allFiltered.length - displayedItems.length);

    const itemsHtml = displayedItems.length
      ? displayedItems.map((it, idx) => {
          const isCur = Boolean(
            currentEntry &&
            currentEntry.modulePath === it.modulePath &&
            Number(currentEntry.rowid) === Number(it.rowid)
          );
          return (
            `<button type="button" class="map-index-item${isCur ? ' is-active' : ''}" data-photo-idx-pos="${idx}">` +
              `<span>${escapeHtml(it.title || it.id || `Imagem ${it.rowid}`)}</span>` +
              (it.moduleTitle ? `<span class="map-index-sub">${escapeHtml(it.moduleTitle)}</span>` : '<span class="map-index-sub">Foto</span>') +
            '</button>'
          );
        }).join('')
      : '<div style="font-size:14.5px;color:var(--map-muted);padding:10px 4px;">Nenhuma foto ou ilustração encontrada para este filtro.</div>';

    drawer.innerHTML = `
      <select class="map-select" id="photo-module-select" aria-label="Escolher coleção de fotos e ilustrações">
        ${selectOptions}
      </select>
      <form class="map-drawer-row" id="photo-search-form">
        <input
          type="search"
          class="map-text-input"
          id="photo-search-input"
          value="${escapeHtml(filterText)}"
          placeholder="Filtrar fotos ou ilustrações (ex.: Jerusalem, Babylon, Temple)..."
          autocomplete="off"
        />
        <button type="submit" class="secondary-btn">Todos</button>
        ${globalSearchResults ? '<button type="button" class="secondary-btn" id="photo-clear-global">Índice</button>' : ''}
      </form>
      <div class="map-verse-tag">Mostrando ${displayedItems.length} de ${allFiltered.length} item(ns)</div>
      <div class="map-index-list" id="photo-index-list">${itemsHtml}</div>
      ${remainingCount > 0 ? `<button type="button" class="secondary-btn" id="photo-load-more-btn">Carregar mais (${remainingCount} restantes)</button>` : ''}
    `;

    drawer.querySelector('#photo-module-select')?.addEventListener('change', async (ev) => {
      const nextPath = ev.target.value;
      if (!nextPath || nextPath === activeModulePath) return;
      activeModulePath = nextPath;
      setSavedActivePhotoModulePath(nextPath);
      globalSearchResults = null;
      visibleListLimit = GALLERY_PAGE_SIZE;
      activeIndex = await getMapModuleIndex(nextPath);
      if (isClosed) return;
      renderDrawer();
      const firstImg = activeIndex.find((it) => it.hasImage !== false && !isTocTitle(it.title));
      if (firstImg) {
        await loadPhotoEntry({
          modulePath: nextPath,
          id: firstImg.id,
          rowid: firstImg.rowid,
          title: firstImg.title
        });
      }
    });

    const searchInp = drawer.querySelector('#photo-search-input');
    searchInp?.addEventListener('input', () => {
      filterText = searchInp.value || '';
      globalSearchResults = null;
      visibleListLimit = GALLERY_PAGE_SIZE;
      renderDrawer();
    });

    drawer.querySelector('#photo-search-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const q = searchInp ? searchInp.value.trim() : '';
      filterText = q;
      visibleListLimit = GALLERY_PAGE_SIZE;
      if (!q) {
        globalSearchResults = null;
        renderDrawer();
        return;
      }
      globalSearchResults = await searchPhotos(q, { limit: 60 });
      if (!isClosed) renderDrawer();
    });

    drawer.querySelector('#photo-clear-global')?.addEventListener('click', () => {
      globalSearchResults = null;
      filterText = '';
      visibleListLimit = GALLERY_PAGE_SIZE;
      renderDrawer();
    });

    drawer.querySelector('#photo-load-more-btn')?.addEventListener('click', () => {
      visibleListLimit += GALLERY_PAGE_SIZE;
      renderDrawer();
    });

    drawer.querySelector('#photo-index-list')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-photo-idx-pos]');
      if (!btn) return;
      const pos = Number(btn.getAttribute('data-photo-idx-pos'));
      const chosen = displayedItems[pos];
      if (!chosen) return;
      openDrawer = '';
      loadPhotoEntry({
        modulePath: chosen.modulePath || activeModulePath,
        id: chosen.id,
        rowid: chosen.rowid,
        title: chosen.title
      });
    });
  }

  function syncBottomButtons() {
    const prevBtn = document.getElementById('photo-btn-prev');
    const nextBtn = document.getElementById('photo-btn-next');
    const counterEl = document.getElementById('photo-counter');
    const zOut = document.getElementById('photo-btn-zoom-out');
    const zIn = document.getElementById('photo-btn-zoom-in');
    const zReset = document.getElementById('photo-btn-zoom-reset');
    const capBtn = document.getElementById('photo-btn-caption');

    const hasImages = Boolean(currentEntry && Array.isArray(currentEntry.images) && currentEntry.images.length > 0);
    const navList = getNavigableList();
    const curPos = currentEntry && navList.length
      ? navList.findIndex((it) => it.modulePath === currentEntry.modulePath && Number(it.rowid) === Number(currentEntry.rowid))
      : -1;

    if (prevBtn) prevBtn.disabled = curPos <= 0;
    if (nextBtn) nextBtn.disabled = curPos < 0 || curPos >= navList.length - 1;
    if (counterEl) {
      counterEl.textContent = curPos >= 0 ? `${curPos + 1}/${navList.length}` : '—';
    }
    if (zOut) zOut.disabled = !hasImages;
    if (zIn) zIn.disabled = !hasImages;
    if (zReset) zReset.disabled = !hasImages;

    const captionHtml = currentEntry ? sanitizeCaptionHtml(currentEntry.content) : '';
    if (capBtn) {
      capBtn.classList.toggle('hidden', !captionHtml);
      capBtn.classList.toggle('is-active', Boolean(captionHtml && showCaption));
    }
  }

  function renderHeaderAndDrawers() {
    updateHeader();
    renderContextStrip();
    renderDrawer();
    syncBottomButtons();
  }

  function bindStageGestures(stageEl) {
    if (!stageEl) return;

    let dragging = false;
    let pinching = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let startPanX = 0;
    let startPanY = 0;
    let pinchDist = 0;
    let pinchScale = 1;
    let lastTapTs = 0;

    const getDist = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    stageEl.addEventListener('touchstart', (ev) => {
      if (ev.touches.length === 2) {
        ev.preventDefault();
        dragging = false;
        pinching = true;
        pinchDist = getDist(ev.touches[0], ev.touches[1]);
        pinchScale = zoomScale;
      } else if (ev.touches.length === 1) {
        const now = Date.now();
        if (now - lastTapTs < 280) {
          ev.preventDefault();
          lastTapTs = 0;
          if (zoomScale > 1.2) {
            resetTransform();
          } else {
            setZoom(2.5);
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
        const dist = getDist(ev.touches[0], ev.touches[1]);
        if (pinchDist > 0) setZoom(pinchScale * (dist / pinchDist));
      } else if (dragging && ev.touches.length === 1 && zoomScale > 1.02) {
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

    stageEl.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      setZoom(zoomScale + (ev.deltaY < 0 ? 0.35 : -0.35));
    }, { passive: false });
  }

  function renderMainArea() {
    const main = document.getElementById('photo-main-area');
    if (!main) return;

    if (!isMapReaderAvailable()) {
      main.innerHTML = `
        <div class="photo-empty-box">
          <h2>Fotos e Ilustrações disponíveis no Android</h2>
          <p>A leitura dos arquivos SQLite locais de fotos e ilustrações funciona no aplicativo Android.</p>
        </div>
      `;
      syncBottomButtons();
      return;
    }

    if (loadingText) {
      main.innerHTML = `<div class="photo-empty-box"><p>${escapeHtml(loadingText)}</p></div>`;
      syncBottomButtons();
      return;
    }

    if (errorText) {
      main.innerHTML = `
        <div class="photo-empty-box">
          <h2>Não foi possível abrir a imagem</h2>
          <p>${escapeHtml(errorText)}</p>
          <button type="button" class="secondary-btn" id="photo-err-folder">Escolher pasta</button>
        </div>
      `;
      main.querySelector('#photo-err-folder')?.addEventListener('click', () => {
        openDrawer = 'folder';
        renderHeaderAndDrawers();
      });
      syncBottomButtons();
      return;
    }

    if (!modules.length) {
      main.innerHTML = `
        <div class="photo-empty-box">
          <h2>Nenhuma coleção de fotos ou ilustrações encontrada</h2>
          <p>Pasta atual: <strong>${escapeHtml(dirPath || 'Não configurada')}</strong>.<br/>Aponte para a pasta onde estão seus módulos de fotos/ilustrações (como <em>Bible Maps Location Photos</em>).</p>
          <button type="button" class="primary-btn" id="photo-empty-folder">Escolher pasta</button>
        </div>
      `;
      main.querySelector('#photo-empty-folder')?.addEventListener('click', () => {
        openDrawer = 'folder';
        renderHeaderAndDrawers();
      });
      syncBottomButtons();
      return;
    }

    if (!currentEntry || !Array.isArray(currentEntry.images) || !currentEntry.images.length) {
      main.innerHTML = `
        <div class="photo-empty-box">
          <h2>Selecione uma foto ou ilustração</h2>
          <p>Toque em <strong>&#9776; Galeria</strong> no topo para explorar suas coleções.</p>
        </div>
      `;
      syncBottomButtons();
      return;
    }

    const images = currentEntry.images;
    const safeIdx = Math.max(0, Math.min(activeImageIdx, images.length - 1));
    const activeImg = images[safeIdx];
    const captionHtml = sanitizeCaptionHtml(currentEntry.content);

    const multiBarHtml = images.length > 1
      ? (
        '<div class="photo-multi-bar">' +
          images.map((im, idx) => (
            `<button type="button" class="map-rec-chip${idx === safeIdx ? ' is-active' : ''}" data-photo-img-idx="${idx}">` +
              escapeHtml(im.fileName || `Foto ${idx + 1}`) +
            '</button>'
          )).join('') +
        '</div>'
      )
      : '';

    main.innerHTML = `
      ${multiBarHtml}
      <div class="photo-stage" id="photo-stage">
        <img
          class="map-stage-img"
          id="photo-stage-img"
          src="${escapeHtml(activeImg.url)}"
          alt="${escapeHtml(currentEntry.title || activeImg.fileName || 'Foto bíblica')}"
          draggable="false"
        />
        <div class="photo-zoom-badge" id="photo-zoom-badge">100%</div>
      </div>
      ${captionHtml ? `<div class="photo-caption-box${showCaption ? '' : ' hidden'}" id="photo-caption-box">${captionHtml}</div>` : ''}
    `;

    main.querySelectorAll('[data-photo-img-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeImageIdx = Number(btn.getAttribute('data-photo-img-idx')) || 0;
        resetTransform();
        renderMainArea();
      });
    });

    main.querySelector('#photo-caption-box')?.addEventListener('click', (ev) => {
      const link = ev.target.closest('a[href]');
      if (!link) return;
      const parsed = parseInternalMapHref(link.getAttribute('href') || '');
      if (parsed) {
        ev.preventDefault();
        loadPhotoEntry({
          modulePath: currentEntry.modulePath || activeModulePath,
          rowid: parsed.rowid || -1,
          title: parsed.title || ''
        });
      }
    });

    bindStageGestures(main.querySelector('#photo-stage'));
    resetTransform();
    syncBottomButtons();
  }

  async function loadPhotoEntry({ modulePath, id = '', rowid = -1, title = '' }) {
    if (!modulePath) return;
    loadingText = 'Abrindo imagem...';
    errorText = '';
    renderMainArea();

    try {
      if (modulePath !== activeModulePath) {
        activeModulePath = modulePath;
        setSavedActivePhotoModulePath(modulePath);
        activeIndex = await getMapModuleIndex(modulePath);
      } else if (!activeIndex.length) {
        activeIndex = await getMapModuleIndex(modulePath);
      }

      const entry = await getMapEntry({ modulePath, id, rowid, title });
      if (isClosed) return;

      loadingText = '';
      if (!entry || !Array.isArray(entry.images) || !entry.images.length) {
        errorText = 'Esta entrada não possui imagem disponível.';
        currentEntry = null;
      } else {
        currentEntry = entry;
        activeImageIdx = 0;
      }

      renderHeaderAndDrawers();
      renderMainArea();
    } catch (err) {
      if (isClosed) return;
      appLogger.error('PHOTO_OPEN', 'Erro ao abrir foto/ilustração', err);
      loadingText = '';
      errorText = err && err.message ? err.message : 'Erro ao abrir foto.';
      renderHeaderAndDrawers();
      renderMainArea();
    }
  }

  async function stepPhoto(delta) {
    const navList = getNavigableList();
    if (!navList.length || !currentEntry) return;
    const curPos = navList.findIndex(
      (it) => it.modulePath === currentEntry.modulePath && Number(it.rowid) === Number(currentEntry.rowid)
    );
    if (curPos < 0) return;
    const nextPos = curPos + Number(delta || 0);
    if (nextPos < 0 || nextPos >= navList.length) return;
    const target = navList[nextPos];
    await loadPhotoEntry({
      modulePath: target.modulePath,
      id: target.id,
      rowid: target.rowid,
      title: target.title
    });
  }

  async function reloadModules({ notifyParent = false } = {}) {
    loadingText = 'Verificando coleções de fotos e ilustrações...';
    errorText = '';
    renderMainArea();

    const dirInfo = await getMapDirectory();
    dirPath = dirInfo.path || '';
    const listed = await listPhotoModules({ forceRefresh: true });
    if (isClosed) return;

    dirPath = listed.dirPath || dirPath;
    modules = listed.modules || [];

    if (notifyParent && typeof onDirectoryChanged === 'function') {
      onDirectoryChanged({ dirPath, modules });
    }

    if (!modules.length) {
      loadingText = '';
      currentEntry = null;
      activeIndex = [];
      recommendedPhotos = [];
      renderHeaderAndDrawers();
      renderMainArea();
      return;
    }

    if (!modules.some((m) => m.path === activeModulePath)) {
      activeModulePath = modules[0].path;
      setSavedActivePhotoModulePath(activeModulePath);
    }

    activeIndex = await getMapModuleIndex(activeModulePath);
    if (isClosed) return;

    if (initialPlace) {
      recommendedPhotos = await resolvePhotosForPlace(initialPlace, { limit: 40 });
    } else if (markerInfo) {
      recommendedPhotos = await resolvePhotosForMarker(markerInfo, { limit: 40 });
    } else if (initialQuery) {
      recommendedPhotos = await searchPhotos(initialQuery, { limit: 40 });
    } else {
      recommendedPhotos = [];
    }
    if (isClosed) return;

    if (recommendedPhotos.length) {
      const first = recommendedPhotos[0];
      await loadPhotoEntry({
        modulePath: first.modulePath,
        id: first.id,
        rowid: first.rowid,
        title: first.title
      });
      return;
    }

    const firstImg = activeIndex.find((it) => it.hasImage !== false && !isTocTitle(it.title));
    if (firstImg) {
      await loadPhotoEntry({
        modulePath: activeModulePath,
        id: firstImg.id,
        rowid: firstImg.rowid,
        title: firstImg.title
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
    reloadModules({ notifyParent: false }).catch((err) => {
      if (isClosed) return;
      appLogger.error('PHOTO_INIT', 'Erro ao inicializar fotos e ilustrações', err);
      loadingText = '';
      errorText = err && err.message ? err.message : 'Erro ao carregar fotos.';
      renderHeaderAndDrawers();
      renderMainArea();
    });
  }
}
