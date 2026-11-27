import { appLogger } from '../core/logger.js';
import {
  detectLocationsInVerse,
  getPeriodQueriesForBook,
  estimateBoundsForMapTitle
} from './map-gazetteer.js';

const PREF_ACTIVE_ATLAS_KEY = 'estudo_biblico_active_map_module_v1';
const PREF_MAP_UI_KEY = 'estudo_biblico_map_ui_prefs_v2';

export const BASE_MAP_LAYERS = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18
  },
  {
    id: 'voyager',
    name: 'Carto Claro',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  },
  {
    id: 'satellite',
    name: 'Satélite (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 18
  },
  {
    id: 'topo',
    name: 'Relevo (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 12
  },
  {
    id: 'offline',
    name: 'Sem mapa base (Offline)',
    url: '',
    attribution: 'Modo Offline',
    maxZoom: 18
  }
];

let cachedModules = null;
let cachedDirPath = '';
const mapIndexCache = new Map();
const chapterNativeCache = new Map();

function getMapPlugin() {
  if (typeof window === 'undefined') return null;
  const cap = window.Capacitor;
  if (!cap || !cap.Plugins || !cap.Plugins.MapReader) return null;
  return cap.Plugins.MapReader;
}

export function isMapReaderAvailable() {
  return Boolean(getMapPlugin());
}

export function convertLocalFileToSrc(filePath) {
  if (!filePath) return '';
  if (typeof window !== 'undefined' && window.Capacitor && typeof window.Capacitor.convertFileSrc === 'function') {
    return window.Capacitor.convertFileSrc(filePath);
  }
  return filePath;
}

export function clearMapServiceCache() {
  cachedModules = null;
  cachedDirPath = '';
  mapIndexCache.clear();
  chapterNativeCache.clear();
}

export function getSavedActiveMapModulePath() {
  try {
    return window.localStorage.getItem(PREF_ACTIVE_ATLAS_KEY) || '';
  } catch (err) {
    return '';
  }
}

export function setSavedActiveMapModulePath(modulePath) {
  try {
    if (modulePath) {
      window.localStorage.setItem(PREF_ACTIVE_ATLAS_KEY, String(modulePath));
    } else {
      window.localStorage.removeItem(PREF_ACTIVE_ATLAS_KEY);
    }
  } catch (err) {
    // Ignora caso localStorage esteja indisponível
  }
}

export function getSavedMapUiPrefs() {
  const defaults = {
    baseLayerId: 'osm',
    overlayOpacity: 0.78,
    overlayVisible: true,
    showAllPins: false
  };
  try {
    const raw = window.localStorage.getItem(PREF_MAP_UI_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const op = Number(parsed && parsed.overlayOpacity);
    const baseLayerId = BASE_MAP_LAYERS.some((l) => l.id === (parsed && parsed.baseLayerId))
      ? parsed.baseLayerId
      : defaults.baseLayerId;
    return {
      baseLayerId,
      overlayOpacity: Number.isFinite(op) ? Math.max(0, Math.min(1, op)) : defaults.overlayOpacity,
      overlayVisible: parsed && typeof parsed.overlayVisible === 'boolean' ? parsed.overlayVisible : defaults.overlayVisible,
      showAllPins: Boolean(parsed && parsed.showAllPins)
    };
  } catch (err) {
    return defaults;
  }
}

export function saveMapUiPrefs(partial = {}) {
  const next = { ...getSavedMapUiPrefs(), ...partial };
  try {
    window.localStorage.setItem(PREF_MAP_UI_KEY, JSON.stringify(next));
  } catch (err) {
    // Ignora erro de persistência
  }
  return next;
}

export async function getMapDirectory() {
  const plugin = getMapPlugin();
  if (!plugin) return { path: '', treeUri: '' };
  const res = await plugin.getMapDirectory();
  cachedDirPath = (res && res.path) || '';
  return {
    path: cachedDirPath,
    treeUri: (res && res.treeUri) || ''
  };
}

export async function pickMapDirectory() {
  const plugin = getMapPlugin();
  if (!plugin) {
    throw new Error('Seletor de pasta de mapas disponível apenas no aplicativo Android.');
  }
  const res = await plugin.pickMapDirectory();
  clearMapServiceCache();
  cachedDirPath = (res && res.path) || '';
  return res;
}

export async function setMapDirectory(path) {
  const plugin = getMapPlugin();
  if (!plugin) {
    throw new Error('Configuração de pasta de mapas disponível apenas no aplicativo Android.');
  }
  const res = await plugin.setMapDirectory({ path: String(path || '').trim() });
  clearMapServiceCache();
  cachedDirPath = (res && res.path) || '';
  return res;
}

export async function listMapModules({ forceRefresh = false } = {}) {
  const plugin = getMapPlugin();
  if (!plugin) {
    return { dirPath: '', modules: [] };
  }
  if (!forceRefresh && Array.isArray(cachedModules)) {
    return { dirPath: cachedDirPath, modules: cachedModules };
  }

  try {
    const res = await plugin.listMapModules();
    cachedDirPath = (res && res.dirPath) || '';
    cachedModules = Array.isArray(res && res.modules) ? res.modules : [];
    return { dirPath: cachedDirPath, modules: cachedModules };
  } catch (err) {
    appLogger.error('MAP_LIST', 'Erro ao listar módulos de mapas', err);
    return { dirPath: cachedDirPath, modules: [] };
  }
}

export async function getMapModuleIndex(modulePath) {
  if (!modulePath) return [];
  if (mapIndexCache.has(modulePath)) {
    return mapIndexCache.get(modulePath);
  }
  const plugin = getMapPlugin();
  if (!plugin) return [];

  try {
    const res = await plugin.getMapIndex({ modulePath });
    const items = Array.isArray(res && res.items) ? res.items : [];
    mapIndexCache.set(modulePath, items);
    return items;
  } catch (err) {
    appLogger.error('MAP_INDEX', `Erro ao carregar índice do atlas: ${modulePath}`, err);
    return [];
  }
}

export function isValidGeoBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') return false;
  const s = Number(bounds.south);
  const w = Number(bounds.west);
  const n = Number(bounds.north);
  const e = Number(bounds.east);
  if (![s, w, n, e].every(Number.isFinite)) return false;
  if (s < -90 || n > 90 || w < -180 || e > 180) return false;
  return (n - s) > 0.0005 && (e - w) > 0.0005;
}

export function isPointInBounds(lat, lng, bounds) {
  if (!isValidGeoBounds(bounds)) return false;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  return la >= bounds.south && la <= bounds.north && ln >= bounds.west && ln <= bounds.east;
}

export function resolveEntryBounds(entryOrItem) {
  if (entryOrItem && isValidGeoBounds(entryOrItem.bounds)) {
    return {
      south: Number(entryOrItem.bounds.south),
      west: Number(entryOrItem.bounds.west),
      north: Number(entryOrItem.bounds.north),
      east: Number(entryOrItem.bounds.east),
      exact: true,
      estimated: false
    };
  }
  const est = estimateBoundsForMapTitle(entryOrItem && (entryOrItem.title || entryOrItem.id || ''));
  return {
    south: est.south,
    west: est.west,
    north: est.north,
    east: est.east,
    exact: false,
    estimated: true
  };
}

export async function getMapEntry({ modulePath, id = '', rowid = -1, title = '' }) {
  const plugin = getMapPlugin();
  if (!plugin || !modulePath) return null;

  const entry = await plugin.getMapEntry({
    modulePath,
    id: String(id || ''),
    rowid: Number(rowid) > 0 ? Number(rowid) : -1,
    title: String(title || '')
  });

  if (!entry) return null;

  const images = (Array.isArray(entry.images) ? entry.images : []).map((img) => ({
    ...img,
    url: convertLocalFileToSrc(img.filePath)
  }));

  const resolvedBounds = resolveEntryBounds(entry);

  return {
    ...entry,
    images,
    resolvedBounds
  };
}

export async function searchMaps(query, { modulePath = '', limit = 20 } = {}) {
  const plugin = getMapPlugin();
  const clean = String(query || '').trim();
  if (!plugin || !clean) return [];

  try {
    const res = await plugin.searchMaps({
      query: clean,
      modulePath: modulePath || '',
      limit
    });
    return Array.isArray(res && res.results) ? res.results : [];
  } catch (err) {
    appLogger.warn('MAP_SEARCH', `Falha ao pesquisar "${clean}" nos mapas`, err);
    return [];
  }
}

function normalizeAscii(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isTocTitle(title) {
  const norm = normalizeAscii(title);
  return norm.includes('indice dos mapas') || norm === 'table of contents' || norm === 'contents';
}

/**
 * Carrega todos os marcadores de localização/mapa de um capítulo bíblico.
 * Mantém os pinos de localizações bíblicas ativos mesmo sem módulos externos instalados,
 * e mescla vínculos exatos da tabela `mapverse` quando houver atlas com essa tabela.
 */
export async function loadMapMarkersForChapter(book, chapter, verses = []) {
  const resultMap = new Map();
  const plugin = getMapPlugin();
  const cacheKey = `${book}:${chapter}`;
  let nativeByVerse = chapterNativeCache.get(cacheKey);

  if (!nativeByVerse) {
    nativeByVerse = {};
    if (plugin) {
      const { modules } = await listMapModules();
      const hasAnyMapVerse = modules.some((m) => Boolean(m && m.hasMapVerse));
      if (hasAnyMapVerse) {
        try {
          const res = await plugin.getChapterMapMarkers({ book: Number(book), chapter: Number(chapter) });
          nativeByVerse = (res && res.verses && typeof res.verses === 'object') ? res.verses : {};
        } catch (err) {
          appLogger.warn('MAP_CHAPTER', `Erro ao consultar mapverse para ${book}:${chapter}`, err);
        }
      }
    }
    chapterNativeCache.set(cacheKey, nativeByVerse);
    if (chapterNativeCache.size > 40) {
      const oldest = chapterNativeCache.keys().next().value;
      if (oldest !== undefined) chapterNativeCache.delete(oldest);
    }
  }

  for (const vObj of Array.isArray(verses) ? verses : []) {
    const vNum = Number(vObj && vObj.verse);
    if (!vNum) continue;

    const nativeMaps = Array.isArray(nativeByVerse[String(vNum)])
      ? nativeByVerse[String(vNum)]
      : [];
    const locations = detectLocationsInVerse(vObj.html || vObj.text || '');

    if (nativeMaps.length || locations.length) {
      resultMap.set(vNum, {
        book: Number(book),
        chapter: Number(chapter),
        verse: vNum,
        nativeMaps,
        locations
      });
    }
  }

  return resultMap;
}

/**
 * Monta o HTML do botão de pino de localização exibido no final do versículo.
 */
export function buildVerseMapPinHtml(verseNum, markerInfo) {
  if (!markerInfo) return '';
  const locNames = (markerInfo.locations || []).map((l) => l.name);
  const nativeTitles = (markerInfo.nativeMaps || []).map((m) => m.title).filter(Boolean);

  const labelParts = [];
  if (locNames.length) labelParts.push(`Localizações: ${locNames.join(', ')}`);
  if (nativeTitles.length) labelParts.push(`Mapas: ${nativeTitles.slice(0, 2).join(', ')}`);
  const titleAttr = labelParts.join(' • ') || 'Abrir no mapa';

  const count = Math.max(locNames.length, nativeTitles.length);
  const safeTitle = titleAttr
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return (
    `<button type="button" class="v-map-pin-btn" data-map-verse="${Number(verseNum)}" title="${safeTitle}" aria-label="${safeTitle}">` +
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">' +
        '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>' +
      '</svg>' +
      (count > 1 ? `<span class="v-map-pin-count">${count}</span>` : '') +
    '</button>'
  );
}

/**
 * Retorna os mapas de imagem sobreponíveis recomendados para um versículo ou local.
 * Prioriza: (1) vínculo exato `mapverse`, (2) cobertura geográfica real via tabela `map`,
 * (3) correspondência de nome/período nos títulos dos atlas.
 */
export async function resolveMapsForMarker(markerInfo) {
  const { modules } = await listMapModules();
  if (!modules.length) return [];

  const scored = [];
  const seenKey = new Set();

  const pushCandidate = (item, score) => {
    const key = `${item.modulePath}::${item.rowid || item.id || item.title}`;
    const existing = seenKey.has(key);
    if (existing) return;
    seenKey.add(key);
    scored.push({ ...item, score });
  };

  for (const nm of (markerInfo && markerInfo.nativeMaps) || []) {
    pushCandidate(nm, 120);
  }

  const locations = (markerInfo && markerInfo.locations) || [];
  const primaryLoc = locations[0] || null;
  const locQueries = [];
  for (const loc of locations) {
    locQueries.push(loc.name);
    for (const q of loc.queries || []) {
      if (!locQueries.includes(q)) locQueries.push(q);
    }
  }
  const periodQueries = markerInfo && markerInfo.book
    ? getPeriodQueriesForBook(markerInfo.book, markerInfo.chapter)
    : [];

  const activePath = getSavedActiveMapModulePath();

  await Promise.all(modules.map(async (mod) => {
    const indexItems = await getMapModuleIndex(mod.path);
    const modBonus = mod.path === activePath ? 8 : 0;

    for (const item of indexItems) {
      if (!item.title || isTocTitle(item.title)) continue;
      if (item.hasImage === false) continue;

      const hay = normalizeAscii(`${item.title} ${item.tags || ''}`);
      let score = 0;
      let matchedReason = '';

      // Pontuação geográfica real quando o módulo possui tabela `map` com bounds
      if (primaryLoc && isValidGeoBounds(item.bounds)) {
        if (isPointInBounds(primaryLoc.lat, primaryLoc.lng, item.bounds)) {
          const span = Math.abs(item.bounds.north - item.bounds.south) * Math.abs(item.bounds.east - item.bounds.west);
          // Prefere mapas com cobertura mais focada na região, mas mantém mapas amplos na lista
          const focusBonus = span < 20 ? 30 : (span < 180 ? 20 : 12);
          score += 65 + focusBonus;
          matchedReason = `Cobre ${primaryLoc.name}`;
        }
      }

      for (let i = 0; i < locQueries.length; i++) {
        const needle = normalizeAscii(locQueries[i]);
        if (needle.length >= 3 && hay.includes(needle)) {
          score += Math.max(12, 40 - i * 2);
          if (!matchedReason) matchedReason = locQueries[i];
        }
      }

      for (let i = 0; i < periodQueries.length; i++) {
        const needle = normalizeAscii(periodQueries[i]);
        if (needle.length >= 3 && hay.includes(needle)) {
          score += Math.max(6, 20 - i * 2);
          if (!matchedReason) matchedReason = periodQueries[i];
        }
      }

      if (score > 0) {
        pushCandidate({
          id: item.id,
          rowid: item.rowid,
          title: item.title,
          modulePath: mod.path,
          moduleTitle: mod.title || mod.name || mod.fileName,
          hasExactBounds: isValidGeoBounds(item.bounds),
          bounds: item.bounds || null,
          sourceType: matchedReason ? 'location' : 'period',
          matchedReason
        }, score + modBonus);
      }
    }
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 22);
}

/**
 * Busca sobreposições de mapa recomendadas para uma única localização geográfica.
 */
export async function resolveOverlaysForPlace(place) {
  if (!place) return [];
  return resolveMapsForMarker({
    book: 0,
    chapter: 0,
    verse: 0,
    nativeMaps: [],
    locations: [place]
  });
}

/**
 * Interpreta links internos do HTML de mapas MySword:
 * - #d2&popup=2 -> rowid = 2
 * - #j Título do Mapa -> title = "Título do Mapa"
 */
export function parseInternalMapHref(rawHref) {
  const href = String(rawHref || '').trim();
  if (!href) return null;

  const dMatch = /^#d(\d+)/i.exec(href);
  if (dMatch) {
    return { rowid: Number(dMatch[1]) };
  }

  const jMatch = /^#j\s*(.+)$/i.exec(href);
  if (jMatch) {
    return { title: jMatch[1].trim() };
  }

  return null;
}
