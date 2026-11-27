import { closeModal } from './nav-modal.js';
import { eventBus, EVENTS } from '../core/events.js';
import { formatReference } from '../core/canon.js';
import { appLogger } from '../core/logger.js';
import { getAllKnownPlaces } from '../formats/map-gazetteer.js';
import {
  BASE_MAP_LAYERS,
  isMapReaderAvailable,
  getMapDirectory,
  pickMapDirectory,
  setMapDirectory,
  listMapModules,
  getMapModuleIndex,
  getMapEntry,
  searchMaps,
  resolveMapsForMarker,
  resolveOverlaysForPlace,
  isTocTitle,
  isValidGeoBounds,
  isPointInBounds,
  getSavedActiveMapModulePath,
  setSavedActiveMapModulePath,
  getSavedMapUiPrefs,
  saveMapUiPrefs
} from '../formats/map-service.js';

const LEAFLET_FALLBACK_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_FALLBACK_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';

let leafletLoadPromise = null;

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
  if (!mod) return 'Atlas';
  return mod.title || mod.name || mod.abbreviation || mod.fileName || 'Atlas';
}

function formatCoord(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return '';
  const ns = la >= 0 ? 'N' : 'S';
  const ew = ln >= 0 ? 'E' : 'O';
  return `${Math.abs(la).toFixed(4)}°${ns}, ${Math.abs(ln).toFixed(4)}°${ew}`;
}

function ensureLeafletLoaded(timeoutMs = 4500) {
  if (typeof window !== 'undefined' && window.L) {
    return Promise.resolve(window.L);
  }
  if (leafletLoadPromise) {
    return leafletLoadPromise;
  }

  leafletLoadPromise = new Promise((resolve) => {
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const timer = window.setTimeout(() => {
      finish(window.L || null);
    }, timeoutMs);

    // Aguarda breve janela caso o <script async> de index.html esteja finalizando
    let polls = 0;
    const pollId = window.setInterval(() => {
      polls += 1;
      if (window.L) {
        window.clearInterval(pollId);
        window.clearTimeout(timer);
        finish(window.L);
        return;
      }
      if (polls === 6) {
        // Injeta fallback jsDelivr caso unpkg não tenha respondido
        if (!document.querySelector('link[data-leaflet-fallback]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = LEAFLET_FALLBACK_CSS;
          link.setAttribute('data-leaflet-fallback', '1');
          document.head.appendChild(link);
        }
        if (!document.querySelector('script[data-leaflet-fallback]')) {
          const script = document.createElement('script');
          script.src = LEAFLET_FALLBACK_JS;
          script.async = true;
          script.setAttribute('data-leaflet-fallback', '1');
          script.onload = () => {
            window.clearInterval(pollId);
            window.clearTimeout(timer);
            finish(window.L || null);
          };
          script.onerror = () => {
            window.clearInterval(pollId);
            window.clearTimeout(timer);
            finish(window.L || null);
          };
          document.head.appendChild(script);
        }
      }
      if (polls > 40) {
        window.clearInterval(pollId);
        window.clearTimeout(timer);
        finish(window.L || null);
      }
    }, 100);
  });

  return leafletLoadPromise.then((L) => {
    if (!L) leafletLoadPromise = null;
    return L;
  });
}

export function openMapViewerModal({
  markerInfo = null,
  initialModulePath = '',
  onMapsDirectoryChanged = null
} = {}) {
  closeModal();

  const root = document.getElementById('modal-root');
  if (!root) return;

  const savedPrefs = getSavedMapUiPrefs();
  const allPlaces = getAllKnownPlaces();
  const defaultJerusalem = allPlaces.find((p) => p.name === 'Jerusalém') || {
    name: 'Jerusalém',
    lat: 31.7781,
    lng: 35.2353,
    info: 'Cidade de Davi e sede do Templo (Judeia)'
  };

  let uiPrefs = { ...savedPrefs };
  let dirPath = '';
  let modules = [];
  let activeModulePath = initialModulePath || getSavedActiveMapModulePath();
  let activeIndex = [];
  let currentOverlayEntry = null;
  let recommendedMaps = [];

  let activePins = (markerInfo && Array.isArray(markerInfo.locations) && markerInfo.locations.length)
    ? markerInfo.locations.slice()
    : [defaultJerusalem];
  let focusedPin = activePins[0] || defaultJerusalem;

  let openDrawer = ''; // '' | 'places' | 'maps' | 'folder'
  let showLayersPopover = false;
  let infoCardMode = ''; // '' | 'map' | 'location'
  let viewMode = 'geo'; // 'geo' | 'image'
  let placeFilterText = '';
  let mapFilterText = '';
  let globalSearchResults = null;

  let leafletMap = null;
  let baseTileLayer = null;
  let imageOverlayLayer = null;
  let activePinsLayer = null;
  let allPinsLayer = null;
  let leafletUnavailable = false;

  // Estado de zoom/pan para modo imagem pura (ou fallback offline)
  let rawZoom = 1;
  let rawPanX = 0;
  let rawPanY = 0;

  let isClosed = false;
  let keyHandler = null;

  function cleanupAndClose() {
    isClosed = true;
    if (keyHandler) {
      window.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    if (leafletMap) {
      try {
        leafletMap.remove();
      } catch (err) {
        // Ignora erro na desmontagem
      }
      leafletMap = null;
    }
    closeModal();
  }

  keyHandler = (ev) => {
    if (ev.key === 'Escape') {
      if (infoCardMode) {
        infoCardMode = '';
        renderInfoCard();
      } else if (showLayersPopover) {
        showLayersPopover = false;
        renderLayersPopover();
      } else if (openDrawer) {
        openDrawer = '';
        renderDrawersAndResize();
      } else {
        cleanupAndClose();
      }
    }
  };
  window.addEventListener('keydown', keyHandler);

  function getActiveModule() {
    if (!modules.length) return null;
    return modules.find((m) => m.path === activeModulePath) || modules[0];
  }

  function getActiveBaseLayerConfig() {
    return BASE_MAP_LAYERS.find((l) => l.id === uiPrefs.baseLayerId) || BASE_MAP_LAYERS[0];
  }

  function renderShell() {
    root.innerHTML = `
      <div class="map-viewer-backdrop" id="map-viewer-backdrop" role="dialog" aria-modal="true" aria-label="Aplicativo de Mapas Bíblicos" data-bref-skip="1">
        <header class="map-viewer-header">
          <button type="button" class="map-hdr-btn" id="map-btn-close" aria-label="Voltar para a Bíblia" title="Voltar">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          <div class="map-hdr-titles">
            <h1 class="map-hdr-title" id="map-hdr-title">Mapas Bíblicos</h1>
            <span class="map-hdr-sub" id="map-hdr-sub">Carregando mapa interativo...</span>
          </div>

          <button type="button" class="map-hdr-btn" id="map-btn-places" title="Buscar localizações bíblicas">
            &#128205; Locais
          </button>

          <button type="button" class="map-hdr-btn" id="map-btn-index" title="Escolher mapa histórico para sobrepor">
            &#9776; Mapas
          </button>

          <button type="button" class="map-hdr-btn" id="map-btn-folder" title="Escolher pasta dos módulos de mapa">
            &#128193; Pasta
          </button>
        </header>

        <section class="map-verse-strip hidden" id="map-verse-strip"></section>
        <section class="map-drawer hidden" id="map-drawer"></section>

        <main class="map-main-area" id="map-main-area">
          <div class="map-leaflet-host" id="map-leaflet-host"></div>

          <div class="map-raw-stage hidden" id="map-raw-stage"></div>

          <div class="map-float-left" id="map-float-left">
            <div class="map-float-stack">
              <button type="button" class="map-float-btn" id="map-zoom-in" aria-label="Aumentar zoom" title="Aumentar zoom">+</button>
              <button type="button" class="map-float-btn" id="map-zoom-out" aria-label="Diminuir zoom" title="Diminuir zoom">&minus;</button>
            </div>
            <button type="button" class="map-float-single" id="map-focus-pin" aria-label="Centralizar no pino" title="Centralizar no local marcado">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
              </svg>
            </button>
          </div>

          <div class="map-float-right" id="map-float-right">
            <button type="button" class="map-float-single" id="map-layers-btn" aria-label="Camadas do mapa" title="Camadas e pinos">
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
              </svg>
            </button>
          </div>

          <div class="map-layers-popover hidden" id="map-layers-popover"></div>

          <div class="map-opacity-bar hidden" id="map-opacity-bar">
            <button type="button" class="map-opacity-toggle" id="map-overlay-toggle" title="Mostrar ou ocultar sobreposição do mapa">Mapa ON</button>
            <input
              type="range"
              class="map-opacity-slider"
              id="map-opacity-slider"
              min="0"
              max="100"
              step="1"
              value="${Math.round(uiPrefs.overlayOpacity * 100)}"
              aria-label="Transparência da sobreposição do mapa"
            />
            <span class="map-opacity-val" id="map-opacity-val">${Math.round(uiPrefs.overlayOpacity * 100)}%</span>
          </div>

          <div class="map-info-card hidden" id="map-info-card"></div>
        </main>

        <footer class="map-bottom-bar" id="map-bottom-bar">
          <button type="button" class="map-bottom-back" id="map-bottom-back" aria-label="Voltar" title="Voltar">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>

          <div class="map-attrib-text" id="map-attrib-text">Leaflet • OpenStreetMap</div>

          <button type="button" class="map-ctrl-btn hidden" id="map-mode-toggle" title="Alternar entre Mapa Interativo e Imagem Pura">Imagem</button>
        </footer>
      </div>
    `;

    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');

    document.getElementById('map-btn-close')?.addEventListener('click', cleanupAndClose);
    document.getElementById('map-bottom-back')?.addEventListener('click', cleanupAndClose);

    document.getElementById('map-btn-places')?.addEventListener('click', () => {
      showLayersPopover = false;
      openDrawer = openDrawer === 'places' ? '' : 'places';
      renderDrawersAndResize();
    });

    document.getElementById('map-btn-index')?.addEventListener('click', () => {
      showLayersPopover = false;
      openDrawer = openDrawer === 'maps' ? '' : 'maps';
      renderDrawersAndResize();
    });

    document.getElementById('map-btn-folder')?.addEventListener('click', () => {
      showLayersPopover = false;
      openDrawer = openDrawer === 'folder' ? '' : 'folder';
      renderDrawersAndResize();
    });

    document.getElementById('map-layers-btn')?.addEventListener('click', () => {
      showLayersPopover = !showLayersPopover;
      renderLayersPopover();
    });

    document.getElementById('map-zoom-in')?.addEventListener('click', () => {
      if (viewMode === 'image') {
        setRawZoom(rawZoom + 0.5);
      } else if (leafletMap) {
        leafletMap.zoomIn();
      }
    });

    document.getElementById('map-zoom-out')?.addEventListener('click', () => {
      if (viewMode === 'image') {
        setRawZoom(rawZoom - 0.5);
      } else if (leafletMap) {
        leafletMap.zoomOut();
      }
    });

    document.getElementById('map-focus-pin')?.addEventListener('click', () => {
      if (viewMode === 'image') {
        resetRawTransform();
      } else {
        focusMapOnPinsAndOverlay({ preferPin: true });
      }
    });

    document.getElementById('map-overlay-toggle')?.addEventListener('click', () => {
      uiPrefs = saveMapUiPrefs({ overlayVisible: !uiPrefs.overlayVisible });
      applyOverlayToLeaflet();
      syncOpacityBar();
    });

    document.getElementById('map-opacity-slider')?.addEventListener('input', (ev) => {
      const pct = Number(ev.target.value);
      const nextOp = Math.max(0, Math.min(1, pct / 100));
      uiPrefs = saveMapUiPrefs({
        overlayOpacity: nextOp,
        overlayVisible: nextOp > 0
      });
      if (imageOverlayLayer && typeof imageOverlayLayer.setOpacity === 'function') {
        imageOverlayLayer.setOpacity(uiPrefs.overlayVisible ? uiPrefs.overlayOpacity : 0);
      }
      syncOpacityBar();
    });

    document.getElementById('map-mode-toggle')?.addEventListener('click', () => {
      if (leafletUnavailable) {
        eventBus.emit(EVENTS.TOAST, 'Mapa base indisponível offline; exibindo imagem do módulo.');
        return;
      }
      viewMode = viewMode === 'geo' ? 'image' : 'geo';
      syncViewMode();
    });
  }

  function updateHeader() {
    const titleEl = document.getElementById('map-hdr-title');
    const subEl = document.getElementById('map-hdr-sub');
    const placesBtn = document.getElementById('map-btn-places');
    const idxBtn = document.getElementById('map-btn-index');
    const dirBtn = document.getElementById('map-btn-folder');

    if (titleEl) {
      if (focusedPin && focusedPin.name) {
        titleEl.textContent = focusedPin.name;
      } else if (currentOverlayEntry && currentOverlayEntry.title) {
        titleEl.textContent = currentOverlayEntry.title;
      } else {
        titleEl.textContent = 'Mapas Bíblicos';
      }
    }

    if (subEl) {
      const parts = [];
      if (markerInfo && markerInfo.book) {
        parts.push(formatReference(markerInfo.book, markerInfo.chapter, markerInfo.verse));
      }
      if (currentOverlayEntry && currentOverlayEntry.title) {
        parts.push(currentOverlayEntry.title);
      } else if (modules.length) {
        parts.push(`${modules.length} atlas disponíveis`);
      } else {
        parts.push('Mapa base OpenStreetMap');
      }
      subEl.textContent = parts.join(' • ');
    }

    if (placesBtn) placesBtn.classList.toggle('is-active', openDrawer === 'places');
    if (idxBtn) idxBtn.classList.toggle('is-active', openDrawer === 'maps');
    if (dirBtn) dirBtn.classList.toggle('is-active', openDrawer === 'folder');
  }

  function renderVerseStrip() {
    const strip = document.getElementById('map-verse-strip');
    if (!strip) return;

    const showPinsRow = activePins.length > 0 && Boolean(markerInfo || activePins.length > 1 || focusedPin);
    const showRecsRow = recommendedMaps.length > 0;

    if (!showPinsRow && !showRecsRow) {
      strip.classList.add('hidden');
      strip.innerHTML = '';
      return;
    }

    strip.classList.remove('hidden');
    const refTxt = (markerInfo && markerInfo.book)
      ? formatReference(markerInfo.book, markerInfo.chapter, markerInfo.verse)
      : 'Local';

    const pinsHtml = showPinsRow
      ? (
        '<div class="map-verse-row">' +
          `<span class="map-verse-tag">${escapeHtml(refTxt)}:</span>` +
          activePins.map((loc, idx) => {
            const isCur = focusedPin && focusedPin.name === loc.name;
            return (
              `<button type="button" class="map-loc-pill${isCur ? ' is-active' : ''}" data-pin-idx="${idx}">` +
                `&#128205; ${escapeHtml(loc.name)}` +
              '</button>'
            );
          }).join('') +
        '</div>'
      )
      : '';

    const recsHtml = showRecsRow
      ? (
        '<div class="map-verse-row">' +
          '<span class="map-verse-tag">Sobreposição:</span>' +
          `<button type="button" class="map-rec-chip${!currentOverlayEntry ? ' is-active' : ''}" data-map-rec-clear="1">Nenhuma</button>` +
          recommendedMaps.map((m, idx) => {
            const isCur = Boolean(
              currentOverlayEntry &&
              currentOverlayEntry.modulePath === m.modulePath &&
              (
                (Number(m.rowid) > 0 && Number(currentOverlayEntry.rowid) === Number(m.rowid)) ||
                (m.title && currentOverlayEntry.title && m.title.toLowerCase() === currentOverlayEntry.title.toLowerCase())
              )
            );
            const titleTooltip = m.moduleTitle ? `${m.title} (${m.moduleTitle})` : m.title;
            return (
              `<button type="button" class="map-rec-chip${isCur ? ' is-active' : ''}" data-map-rec-idx="${idx}" title="${escapeHtml(titleTooltip)}">` +
                escapeHtml(m.title) +
              '</button>'
            );
          }).join('') +
        '</div>'
      )
      : '';

    strip.innerHTML = `${pinsHtml}${recsHtml}`;

    strip.querySelectorAll('[data-pin-idx]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.getAttribute('data-pin-idx'));
        const loc = activePins[idx];
        if (!loc) return;
        focusedPin = loc;
        renderVerseStrip();
        updateHeader();
        renderActivePinsOnLeaflet();
        if (leafletMap && viewMode === 'geo') {
          leafletMap.setView([loc.lat, loc.lng], Math.max(leafletMap.getZoom(), 6), { animate: true });
        }
        if (infoCardMode === 'location') renderInfoCard();
      });
    });

    strip.querySelector('[data-map-rec-clear]')?.addEventListener('click', () => {
      clearOverlay();
    });

    strip.querySelectorAll('[data-map-rec-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-map-rec-idx'));
        const item = recommendedMaps[idx];
        if (!item) return;
        loadOverlayEntry({
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
        <div class="map-verse-tag">Pasta dos arquivos de mapa (apenas módulos de mapa válidos são carregados):</div>
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
            await reloadModules({ notifyParent: true });
          }
        } catch (err) {
          eventBus.emit(EVENTS.TOAST, err && err.message ? err.message : 'Seleção de pasta cancelada.');
        }
      });

      drawer.querySelector('#map-refresh-dir-btn')?.addEventListener('click', async () => {
        await reloadModules({ notifyParent: true });
        eventBus.emit(EVENTS.TOAST, `${modules.length} módulo(s) de mapa válido(s).`);
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
          await reloadModules({ notifyParent: true });
        } catch (err) {
          eventBus.emit(EVENTS.TOAST, err && err.message ? err.message : 'Caminho inválido.');
        }
      });
      return;
    }

    if (openDrawer === 'places') {
      const q = normalizeAscii(placeFilterText).trim();
      const filteredPlaces = allPlaces.filter((p) => {
        if (!q) return true;
        return normalizeAscii(`${p.name} ${p.info || ''} ${(p.aliases || []).join(' ')}`).includes(q);
      });

      const itemsHtml = filteredPlaces.slice(0, 50).map((p, idx) => {
        const isCur = focusedPin && focusedPin.name === p.name;
        return (
          `<button type="button" class="map-index-item${isCur ? ' is-active' : ''}" data-place-pos="${idx}">` +
            `<span>&#128205; ${escapeHtml(p.name)}</span>` +
            `<span class="map-index-sub">${escapeHtml(formatCoord(p.lat, p.lng))}</span>` +
          '</button>'
        );
      }).join('');

      drawer.innerHTML = `
        <div class="map-drawer-row">
          <input
            type="search"
            class="map-text-input"
            id="map-place-search-input"
            value="${escapeHtml(placeFilterText)}"
            placeholder="Buscar cidade, monte, rio ou região bíblica..."
            autocomplete="off"
          />
        </div>
        <div class="map-index-list" id="map-places-list">
          ${itemsHtml || '<div style="font-size:13px;color:var(--map-muted);padding:6px;">Nenhum local encontrado.</div>'}
        </div>
      `;

      const placeInput = drawer.querySelector('#map-place-search-input');
      placeInput?.addEventListener('input', () => {
        placeFilterText = placeInput.value || '';
        renderDrawer();
      });

      drawer.querySelector('#map-places-list')?.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-place-pos]');
        if (!btn) return;
        const pos = Number(btn.getAttribute('data-place-pos'));
        const place = filteredPlaces[pos];
        if (!place) return;

        openDrawer = '';
        focusedPin = place;
        if (!activePins.some((p) => p.name === place.name)) {
          activePins = [place];
        }
        renderDrawersAndResize();
        renderActivePinsOnLeaflet();
        if (leafletMap && viewMode === 'geo') {
          leafletMap.setView([place.lat, place.lng], 6, { animate: true });
        }

        // Busca automaticamente mapas históricos compatíveis com o local escolhido
        const recs = await resolveOverlaysForPlace(place);
        if (isClosed) return;
        recommendedMaps = recs;
        renderVerseStrip();
        if (recs.length) {
          const best = recs[0];
          await loadOverlayEntry({
            modulePath: best.modulePath,
            id: best.id,
            rowid: best.rowid,
            title: best.title
          });
        }
      });
      return;
    }

    // Gaveta de Mapas Históricos para Sobreposição
    if (!modules.length) {
      drawer.innerHTML = `
        <div class="map-verse-tag">Nenhum módulo de mapa encontrado na pasta atual.</div>
        <div class="map-drawer-row">
          <button type="button" class="primary-btn" id="map-no-mod-folder">Escolher pasta de mapas</button>
        </div>
      `;
      drawer.querySelector('#map-no-mod-folder')?.addEventListener('click', () => {
        openDrawer = 'folder';
        renderDrawersAndResize();
      });
      return;
    }

    const atlasOptionsHtml = modules.map((m) => {
      const geoTag = m.hasGeoBounds ? ' • Geo' : '';
      const label = `${getModuleDisplayName(m)} (${m.mapCount || 0}${geoTag})`;
      return `<option value="${escapeHtml(m.path)}"${m.path === activeModulePath ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

    const cleanQ = normalizeAscii(mapFilterText).trim();
    const listItems = Array.isArray(globalSearchResults)
      ? globalSearchResults
      : activeIndex
          .filter((it) => it.hasImage !== false && !isTocTitle(it.title))
          .filter((it) => !cleanQ || normalizeAscii(`${it.title} ${it.tags || ''}`).includes(cleanQ))
          .map((it) => ({
            ...it,
            modulePath: activeModulePath,
            moduleTitle: ''
          }));

    const itemsHtml = listItems.length
      ? listItems.map((it, idx) => {
          const isCur = Boolean(
            currentOverlayEntry &&
            currentOverlayEntry.modulePath === it.modulePath &&
            Number(currentOverlayEntry.rowid) === Number(it.rowid)
          );
          const subTag = it.moduleTitle || (isValidGeoBounds(it.bounds) ? 'Georreferenciado' : 'Atlas');
          return (
            `<button type="button" class="map-index-item${isCur ? ' is-active' : ''}" data-map-idx-pos="${idx}">` +
              `<span>${escapeHtml(it.title || it.id || `Mapa ${it.rowid}`)}</span>` +
              `<span class="map-index-sub">${escapeHtml(subTag)}</span>` +
            '</button>'
          );
        }).join('')
      : '<div style="font-size:13px;color:var(--map-muted);padding:8px 2px;">Nenhum mapa de imagem encontrado para este filtro.</div>';

    drawer.innerHTML = `
      <select class="map-select" id="map-atlas-select" aria-label="Escolher módulo de atlas">
        ${atlasOptionsHtml}
      </select>
      <form class="map-drawer-row" id="map-idx-search-form">
        <input
          type="search"
          class="map-text-input"
          id="map-idx-search-input"
          value="${escapeHtml(mapFilterText)}"
          placeholder="Filtrar mapas ou buscar em todos os atlas..."
          autocomplete="off"
        />
        <button type="submit" class="secondary-btn">Todos</button>
        ${currentOverlayEntry ? '<button type="button" class="secondary-btn" id="map-clear-overlay-btn">Remover</button>' : ''}
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
      if (!isClosed) renderDrawer();
    });

    const searchInput = drawer.querySelector('#map-idx-search-input');
    searchInput?.addEventListener('input', () => {
      mapFilterText = searchInput.value || '';
      globalSearchResults = null;
      renderDrawer();
    });

    drawer.querySelector('#map-idx-search-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const q = searchInput ? searchInput.value.trim() : '';
      mapFilterText = q;
      if (!q) {
        globalSearchResults = null;
        renderDrawer();
        return;
      }
      globalSearchResults = await searchMaps(q, { limit: 35 });
      if (!isClosed) renderDrawer();
    });

    drawer.querySelector('#map-clear-overlay-btn')?.addEventListener('click', () => {
      openDrawer = '';
      clearOverlay();
      renderDrawersAndResize();
    });

    drawer.querySelector('#map-index-list')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-map-idx-pos]');
      if (!btn) return;
      const pos = Number(btn.getAttribute('data-map-idx-pos'));
      const chosen = listItems[pos];
      if (!chosen) return;
      openDrawer = '';
      renderDrawersAndResize();
      loadOverlayEntry({
        modulePath: chosen.modulePath || activeModulePath,
        id: chosen.id,
        rowid: chosen.rowid,
        title: chosen.title
      });
    });
  }

  function renderDrawersAndResize() {
    updateHeader();
    renderVerseStrip();
    renderDrawer();
    renderLayersPopover();
    window.requestAnimationFrame(() => {
      if (leafletMap) leafletMap.invalidateSize();
    });
  }

  function renderLayersPopover() {
    const pop = document.getElementById('map-layers-popover');
    const btn = document.getElementById('map-layers-btn');
    if (btn) btn.classList.toggle('is-active', showLayersPopover);
    if (!pop) return;

    if (!showLayersPopover) {
      pop.classList.add('hidden');
      pop.innerHTML = '';
      return;
    }

    pop.classList.remove('hidden');
    const baseBtns = BASE_MAP_LAYERS.map((layer) => (
      `<button type="button" class="map-layer-opt${layer.id === uiPrefs.baseLayerId ? ' is-active' : ''}" data-base-layer="${layer.id}">` +
        `<span>${layer.id === uiPrefs.baseLayerId ? '&#9679;' : '&#9675;'}</span>` +
        `<span>${escapeHtml(layer.name)}</span>` +
      '</button>'
    )).join('');

    pop.innerHTML = `
      <div class="map-layers-heading">Mapa Base</div>
      ${baseBtns}
      <div class="map-layers-heading" style="margin-top:6px;">Marcadores</div>
      <button type="button" class="map-layer-opt${uiPrefs.showAllPins ? ' is-active' : ''}" id="map-toggle-all-pins">
        <span>${uiPrefs.showAllPins ? '&#9745;' : '&#9744;'}</span>
        <span>Mostrar todos os locais (${allPlaces.length})</span>
      </button>
    `;

    pop.querySelectorAll('[data-base-layer]').forEach((optBtn) => {
      optBtn.addEventListener('click', () => {
        const nextId = optBtn.getAttribute('data-base-layer');
        uiPrefs = saveMapUiPrefs({ baseLayerId: nextId });
        applyBaseLayerToLeaflet();
        updateAttributionBar();
        renderLayersPopover();
      });
    });

    pop.querySelector('#map-toggle-all-pins')?.addEventListener('click', () => {
      uiPrefs = saveMapUiPrefs({ showAllPins: !uiPrefs.showAllPins });
      renderAllPlacesLayer();
      renderLayersPopover();
    });
  }

  function syncOpacityBar() {
    const bar = document.getElementById('map-opacity-bar');
    const toggleBtn = document.getElementById('map-overlay-toggle');
    const slider = document.getElementById('map-opacity-slider');
    const valEl = document.getElementById('map-opacity-val');

    const hasImg = Boolean(
      currentOverlayEntry &&
      Array.isArray(currentOverlayEntry.images) &&
      currentOverlayEntry.images.length > 0
    );

    if (!bar) return;
    bar.classList.toggle('hidden', !hasImg || viewMode !== 'geo');

    const pct = Math.round(uiPrefs.overlayOpacity * 100);
    if (toggleBtn) {
      toggleBtn.textContent = uiPrefs.overlayVisible ? 'Mapa ON' : 'Mapa OFF';
      toggleBtn.classList.toggle('is-active', uiPrefs.overlayVisible);
    }
    if (slider) {
      slider.value = String(pct);
    }
    if (valEl) {
      valEl.textContent = `${pct}%`;
    }
  }

  function updateAttributionBar() {
    const attribEl = document.getElementById('map-attrib-text');
    const modeBtn = document.getElementById('map-mode-toggle');
    const hasImg = Boolean(
      currentOverlayEntry &&
      Array.isArray(currentOverlayEntry.images) &&
      currentOverlayEntry.images.length > 0
    );

    if (modeBtn) {
      modeBtn.classList.toggle('hidden', !hasImg);
      modeBtn.textContent = viewMode === 'geo' ? 'Imagem' : 'Mapa';
      modeBtn.classList.toggle('is-active', viewMode === 'image');
    }

    if (!attribEl) return;

    const baseCfg = getActiveBaseLayerConfig();
    const parts = [];
    if (!leafletUnavailable && viewMode === 'geo') {
      parts.push('Leaflet');
    }
    if (currentOverlayEntry) {
      const srcLabel = currentOverlayEntry.attribution || currentOverlayEntry.title || 'Sobreposição';
      parts.push(`Sobreposição: ${escapeHtml(srcLabel)}`);
      parts.push('<button type="button" class="map-attrib-link" data-info-open="map">(Mapa Info)</button>');
    }
    if (focusedPin) {
      parts.push('<button type="button" class="map-attrib-link" data-info-open="location">(Informação de localização)</button>');
    }
    if (!leafletUnavailable && viewMode === 'geo') {
      parts.push(baseCfg.attribution);
    }

    attribEl.innerHTML = parts.join(' &bull; ');
    attribEl.querySelectorAll('[data-info-open]').forEach((b) => {
      b.addEventListener('click', () => {
        const nextMode = b.getAttribute('data-info-open');
        infoCardMode = infoCardMode === nextMode ? '' : nextMode;
        renderInfoCard();
      });
    });
  }

  function renderInfoCard() {
    const card = document.getElementById('map-info-card');
    if (!card) return;

    if (!infoCardMode) {
      card.classList.add('hidden');
      card.innerHTML = '';
      return;
    }

    let heading = '';
    let bodyHtml = '';

    if (infoCardMode === 'location' && focusedPin) {
      heading = focusedPin.name;
      bodyHtml = `
        <div>${escapeHtml(focusedPin.info || 'Localização bíblica cadastrada no atlas.')}</div>
        <div style="margin-top:6px;font-size:12px;color:var(--map-muted);">
          Coordenadas: ${escapeHtml(formatCoord(focusedPin.lat, focusedPin.lng))}
        </div>
      `;
    } else if (infoCardMode === 'map' && currentOverlayEntry) {
      const b = currentOverlayEntry.resolvedBounds;
      const geoStatus = b && b.exact
        ? 'Coordenadas geográficas exatas (tabela map do módulo)'
        : 'Enquadramento estimado automaticamente pelo título do mapa';
      heading = currentOverlayEntry.title || 'Informações do Mapa';
      bodyHtml = `
        ${currentOverlayEntry.attribution ? `<div style="margin-bottom:4px;">${escapeHtml(currentOverlayEntry.attribution)}</div>` : ''}
        <div style="font-size:12px;color:var(--map-muted);">${escapeHtml(geoStatus)}</div>
        ${b ? `<div style="margin-top:4px;font-size:11.5px;color:var(--map-muted);">Limites: S ${b.south.toFixed(2)}° • O ${b.west.toFixed(2)}° • N ${b.north.toFixed(2)}° • L ${b.east.toFixed(2)}°</div>` : ''}
      `;
    } else {
      card.classList.add('hidden');
      return;
    }

    card.classList.remove('hidden');
    card.innerHTML = `
      <div class="map-info-card-head">
        <strong>${escapeHtml(heading)}</strong>
        <button type="button" class="map-ctrl-btn" id="map-info-close">&times;</button>
      </div>
      ${bodyHtml}
    `;
    card.querySelector('#map-info-close')?.addEventListener('click', () => {
      infoCardMode = '';
      renderInfoCard();
    });
  }

  function applyBaseLayerToLeaflet() {
    if (!leafletMap || !window.L) return;
    if (baseTileLayer) {
      try {
        leafletMap.removeLayer(baseTileLayer);
      } catch (err) {
        // Ignora
      }
      baseTileLayer = null;
    }

    const cfg = getActiveBaseLayerConfig();
    if (!cfg || !cfg.url) return;

    const opts = {
      maxZoom: cfg.maxZoom || 18,
      attribution: cfg.attribution || ''
    };
    if (cfg.subdomains) {
      opts.subdomains = cfg.subdomains;
    }
    baseTileLayer = window.L.tileLayer(cfg.url, opts).addTo(leafletMap);
  }

  function createPinIcon(isSecondary = false) {
    if (!window.L) return null;
    return window.L.divIcon({
      className: 'map-bible-pin',
      html: `<div class="map-bible-pin-dot${isSecondary ? ' map-bible-pin-dot--secondary' : ''}"></div>`,
      iconSize: isSecondary ? [10, 10] : [14, 14],
      iconAnchor: isSecondary ? [5, 5] : [7, 7]
    });
  }

  function renderActivePinsOnLeaflet() {
    if (!leafletMap || !window.L) return;
    if (activePinsLayer) {
      activePinsLayer.clearLayers();
    } else {
      activePinsLayer = window.L.layerGroup().addTo(leafletMap);
    }

    for (const loc of activePins) {
      if (!Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lng))) continue;
      const marker = window.L.marker([loc.lat, loc.lng], {
        icon: createPinIcon(false),
        zIndexOffset: 500
      });
      marker.bindTooltip(escapeHtml(loc.name), {
        permanent: true,
        direction: 'bottom',
        offset: [0, 7],
        className: 'map-pin-tooltip'
      });
      marker.on('click', () => {
        focusedPin = loc;
        infoCardMode = 'location';
        updateHeader();
        renderVerseStrip();
        renderInfoCard();
      });
      marker.addTo(activePinsLayer);
    }
  }

  function renderAllPlacesLayer() {
    if (!leafletMap || !window.L) return;
    if (allPinsLayer) {
      allPinsLayer.clearLayers();
    } else {
      allPinsLayer = window.L.layerGroup().addTo(leafletMap);
    }

    if (!uiPrefs.showAllPins) return;

    const activeNames = new Set(activePins.map((p) => p.name));
    for (const place of allPlaces) {
      if (activeNames.has(place.name)) continue;
      const m = window.L.marker([place.lat, place.lng], {
        icon: createPinIcon(true),
        zIndexOffset: 100
      });
      m.bindTooltip(escapeHtml(place.name), {
        direction: 'top',
        offset: [0, -6],
        className: 'map-pin-tooltip'
      });
      m.on('click', () => {
        focusedPin = place;
        infoCardMode = 'location';
        updateHeader();
        renderInfoCard();
      });
      m.addTo(allPinsLayer);
    }
  }

  function applyOverlayToLeaflet() {
    if (!leafletMap || !window.L) return;
    if (imageOverlayLayer) {
      try {
        leafletMap.removeLayer(imageOverlayLayer);
      } catch (err) {
        // Ignora
      }
      imageOverlayLayer = null;
    }

    if (!currentOverlayEntry || !Array.isArray(currentOverlayEntry.images) || !currentOverlayEntry.images.length) {
      return;
    }

    const img = currentOverlayEntry.images[0];
    const b = currentOverlayEntry.resolvedBounds;
    if (!img || !img.url || !isValidGeoBounds(b)) return;

    const bounds = [[b.south, b.west], [b.north, b.east]];
    imageOverlayLayer = window.L.imageOverlay(img.url, bounds, {
      opacity: uiPrefs.overlayVisible ? uiPrefs.overlayOpacity : 0,
      interactive: false
    }).addTo(leafletMap);
  }

  function focusMapOnPinsAndOverlay({ preferPin = false } = {}) {
    if (!leafletMap || !window.L) return;

    if (preferPin && focusedPin && Number.isFinite(Number(focusedPin.lat))) {
      leafletMap.setView([focusedPin.lat, focusedPin.lng], 6, { animate: true });
      return;
    }

    const b = currentOverlayEntry && currentOverlayEntry.resolvedBounds;
    if (b && isValidGeoBounds(b)) {
      if (focusedPin && isPointInBounds(focusedPin.lat, focusedPin.lng, b)) {
        const spanLat = b.north - b.south;
        const spanLng = b.east - b.west;
        if (spanLat > 16 || spanLng > 22) {
          leafletMap.setView([focusedPin.lat, focusedPin.lng], 5, { animate: false });
        } else {
          leafletMap.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [18, 18], maxZoom: 9 });
        }
        return;
      }
      if (!markerInfo) {
        leafletMap.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [18, 18], maxZoom: 9 });
        return;
      }
    }

    if (activePins.length > 1) {
      const latLngs = activePins
        .filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
        .map((p) => [p.lat, p.lng]);
      if (latLngs.length > 1) {
        leafletMap.fitBounds(latLngs, { padding: [46, 46], maxZoom: 8 });
        return;
      }
    }

    if (focusedPin && Number.isFinite(Number(focusedPin.lat))) {
      leafletMap.setView([focusedPin.lat, focusedPin.lng], 6, { animate: false });
    }
  }

  function clearOverlay() {
    currentOverlayEntry = null;
    applyOverlayToLeaflet();
    if (viewMode === 'image' && !leafletUnavailable) {
      viewMode = 'geo';
    }
    syncViewMode();
    updateHeader();
    renderVerseStrip();
    syncOpacityBar();
    updateAttributionBar();
    if (infoCardMode === 'map') {
      infoCardMode = '';
      renderInfoCard();
    }
  }

  // Palco de Imagem Pura (usado no botão "Imagem" ou se Leaflet estiver offline)
  function applyRawTransform() {
    const imgEl = document.getElementById('map-raw-img');
    const stageEl = document.getElementById('map-raw-stage');
    if (!imgEl || !stageEl) return;
    if (rawZoom <= 1.02) {
      rawZoom = 1;
      rawPanX = 0;
      rawPanY = 0;
    } else {
      const maxX = Math.max(0, (stageEl.clientWidth * (rawZoom - 1)) / 2 + 120);
      const maxY = Math.max(0, (stageEl.clientHeight * (rawZoom - 1)) / 2 + 120);
      rawPanX = Math.max(-maxX, Math.min(maxX, rawPanX));
      rawPanY = Math.max(-maxY, Math.min(maxY, rawPanY));
    }
    imgEl.style.transform = `translate3d(${rawPanX.toFixed(1)}px, ${rawPanY.toFixed(1)}px, 0) scale(${rawZoom.toFixed(3)})`;
  }

  function setRawZoom(next) {
    rawZoom = Math.max(1, Math.min(6, Number(next) || 1));
    applyRawTransform();
  }

  function resetRawTransform() {
    rawZoom = 1;
    rawPanX = 0;
    rawPanY = 0;
    applyRawTransform();
  }

  function renderRawImageStage() {
    const rawStage = document.getElementById('map-raw-stage');
    if (!rawStage) return;
    const img = currentOverlayEntry && currentOverlayEntry.images && currentOverlayEntry.images[0];
    if (!img || !img.url) {
      rawStage.innerHTML = '<div style="padding:20px;text-align:center;color:var(--map-muted);">Selecione um mapa no botão <strong>&#9776; Mapas</strong>.</div>';
      return;
    }
    rawStage.innerHTML = `<img id="map-raw-img" class="map-stage-img" src="${escapeHtml(img.url)}" alt="${escapeHtml(currentOverlayEntry.title || 'Mapa')}" draggable="false" />`;
    resetRawTransform();

    let dragging = false;
    let pinching = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let startPanX = 0;
    let startPanY = 0;
    let pinchDist = 0;
    let pinchScale = 1;
    let lastTap = 0;

    rawStage.ontouchstart = (ev) => {
      if (ev.touches.length === 2) {
        ev.preventDefault();
        dragging = false;
        pinching = true;
        pinchDist = Math.hypot(
          ev.touches[1].clientX - ev.touches[0].clientX,
          ev.touches[1].clientY - ev.touches[0].clientY
        );
        pinchScale = rawZoom;
      } else if (ev.touches.length === 1) {
        const now = Date.now();
        if (now - lastTap < 280) {
          ev.preventDefault();
          lastTap = 0;
          setRawZoom(rawZoom > 1.2 ? 1 : 2.5);
          return;
        }
        lastTap = now;
        pinching = false;
        dragging = true;
        dragStartX = ev.touches[0].clientX;
        dragStartY = ev.touches[0].clientY;
        startPanX = rawPanX;
        startPanY = rawPanY;
      }
    };

    rawStage.ontouchmove = (ev) => {
      if (pinching && ev.touches.length === 2) {
        ev.preventDefault();
        const dist = Math.hypot(
          ev.touches[1].clientX - ev.touches[0].clientX,
          ev.touches[1].clientY - ev.touches[0].clientY
        );
        if (pinchDist > 0) setRawZoom(pinchScale * (dist / pinchDist));
      } else if (dragging && ev.touches.length === 1 && rawZoom > 1.02) {
        ev.preventDefault();
        rawPanX = startPanX + (ev.touches[0].clientX - dragStartX);
        rawPanY = startPanY + (ev.touches[0].clientY - dragStartY);
        applyRawTransform();
      }
    };

    rawStage.ontouchend = () => {
      dragging = false;
      pinching = false;
    };
  }

  function syncViewMode() {
    const host = document.getElementById('map-leaflet-host');
    const rawStage = document.getElementById('map-raw-stage');
    const rightCtrl = document.getElementById('map-float-right');

    const isImg = viewMode === 'image';
    if (host) host.classList.toggle('hidden', isImg);
    if (rawStage) rawStage.classList.toggle('hidden', !isImg);
    if (rightCtrl) rightCtrl.classList.toggle('hidden', isImg);

    if (isImg) {
      showLayersPopover = false;
      renderLayersPopover();
      renderRawImageStage();
    } else if (leafletMap) {
      window.requestAnimationFrame(() => leafletMap.invalidateSize());
    }

    syncOpacityBar();
    updateAttributionBar();
  }

  async function loadOverlayEntry({ modulePath, id = '', rowid = -1, title = '' }) {
    if (!modulePath) return;
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

      if (!entry || !Array.isArray(entry.images) || !entry.images.length) {
        eventBus.emit(EVENTS.TOAST, 'Esta entrada não contém imagem de mapa para sobrepor.');
        return;
      }

      currentOverlayEntry = entry;
      if (!uiPrefs.overlayVisible) {
        uiPrefs = saveMapUiPrefs({ overlayVisible: true });
      }

      applyOverlayToLeaflet();
      if (viewMode === 'image') {
        renderRawImageStage();
      } else {
        focusMapOnPinsAndOverlay({ preferPin: false });
      }

      updateHeader();
      renderVerseStrip();
      syncOpacityBar();
      updateAttributionBar();
      if (infoCardMode === 'map') renderInfoCard();
    } catch (err) {
      if (isClosed) return;
      appLogger.error('MAP_OVERLAY', 'Falha ao carregar imagem de sobreposição', err);
      eventBus.emit(EVENTS.TOAST, err && err.message ? err.message : 'Erro ao abrir mapa.');
    }
  }

  async function initLeafletEngine() {
    const L = await ensureLeafletLoaded();
    if (isClosed) return;

    const host = document.getElementById('map-leaflet-host');
    if (!L || !host) {
      leafletUnavailable = true;
      viewMode = 'image';
      syncViewMode();
      return;
    }

    leafletMap = L.map(host, {
      center: [focusedPin.lat, focusedPin.lng],
      zoom: 6,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false
    });

    leafletMap.on('click', () => {
      if (showLayersPopover) {
        showLayersPopover = false;
        renderLayersPopover();
      }
      if (infoCardMode) {
        infoCardMode = '';
        renderInfoCard();
      }
    });

    applyBaseLayerToLeaflet();
    renderActivePinsOnLeaflet();
    renderAllPlacesLayer();
    applyOverlayToLeaflet();
    focusMapOnPinsAndOverlay({ preferPin: false });
    updateAttributionBar();
  }

  async function reloadModules({ notifyParent = false } = {}) {
    if (!isMapReaderAvailable()) {
      modules = [];
      updateHeader();
      renderVerseStrip();
      updateAttributionBar();
      return;
    }

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
      activeIndex = [];
      recommendedMaps = [];
      clearOverlay();
      if (openDrawer === 'folder' || openDrawer === 'maps') renderDrawer();
      return;
    }

    if (!modules.some((m) => m.path === activeModulePath)) {
      activeModulePath = modules[0].path;
      setSavedActiveMapModulePath(activeModulePath);
    }

    activeIndex = await getMapModuleIndex(activeModulePath);
    if (isClosed) return;

    const targetMarker = markerInfo || {
      book: 0,
      chapter: 0,
      verse: 0,
      nativeMaps: [],
      locations: activePins
    };
    recommendedMaps = await resolveMapsForMarker(targetMarker);
    if (isClosed) return;

    updateHeader();
    renderVerseStrip();
    if (openDrawer === 'folder' || openDrawer === 'maps') renderDrawer();

    // Carrega automaticamente a melhor sobreposição histórica disponível
    if (recommendedMaps.length) {
      const best = recommendedMaps[0];
      await loadOverlayEntry({
        modulePath: best.modulePath,
        id: best.id,
        rowid: best.rowid,
        title: best.title
      });
    } else if (activeIndex.length) {
      const firstImgMap = activeIndex.find((it) => it.hasImage !== false && !isTocTitle(it.title));
      if (firstImgMap) {
        await loadOverlayEntry({
          modulePath: activeModulePath,
          id: firstImgMap.id,
          rowid: firstImgMap.rowid,
          title: firstImgMap.title
        });
      }
    }
  }

  renderShell();
  updateHeader();
  renderVerseStrip();
  syncOpacityBar();
  updateAttributionBar();

  Promise.all([
    initLeafletEngine(),
    reloadModules({ notifyParent: false })
  ]).catch((err) => {
    if (isClosed) return;
    appLogger.error('MAP_INIT', 'Erro ao inicializar aplicativo de mapas', err);
    eventBus.emit(EVENTS.TOAST, err && err.message ? err.message : 'Erro ao inicializar mapas.');
  });
}
