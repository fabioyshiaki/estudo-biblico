import { appLogger } from '../core/logger.js';
import {
  detectLocationsInVerse,
  getPeriodQueriesForBook,
  estimateBoundsForMapTitle
} from './map-gazetteer.js';

const PREF_ACTIVE_ATLAS_KEY = 'estudo_biblico_active_map_module_v1';
const PREF_ACTIVE_PHOTO_KEY = 'estudo_biblico_active_photo_module_v1';
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

// Termos de busca em inglês/português para encontrar fotos em acervos internacionais (ex.: Bible Maps Location Photos)
const PHOTO_PLACE_TERMS = {
  'jerusalem': ['Jerusalem', 'Jerusalém', 'Temple Mount', 'City of David'],
  'belem': ['Bethlehem', 'Belém'],
  'nazare': ['Nazareth', 'Nazaré'],
  'cafarnaum': ['Capernaum', 'Cafarnaum'],
  'betsaida': ['Bethsaida', 'Betsaida'],
  'cana': ['Cana', 'Caná'],
  'corazim': ['Chorazin', 'Korazim', 'Corazim'],
  'magdala': ['Magdala'],
  'naim': ['Nain', 'Naim'],
  'tiberiades': ['Tiberias', 'Tiberíades'],
  'gadara': ['Gadara', 'Gerasa', 'Jerash'],
  'betania': ['Bethany', 'Betânia'],
  'emaus': ['Emmaus', 'Emaús'],
  'getsemani': ['Gethsemane', 'Getsêmani'],
  'golgota': ['Golgotha', 'Calvary', 'Gólgota'],
  'siloe': ['Siloam', 'Siloé'],
  'jerico': ['Jericho', 'Jericó'],
  'hebrom': ['Hebron', 'Hebrom', 'Mamre'],
  'betel': ['Bethel', 'Betel'],
  'siquem': ['Shechem', 'Sychar', 'Siquém'],
  'berseba': ['Beersheba', 'Beer-sheba', 'Berseba'],
  'silo': ['Shiloh', 'Siló'],
  'gilgal': ['Gilgal'],
  'gibeom': ['Gibeon', 'Gibeah', 'Gibeom'],
  'rama': ['Ramah', 'Arimathea', 'Ramá'],
  'mispa': ['Mizpah', 'Mispá'],
  'megido': ['Megiddo', 'Armageddon', 'Megido'],
  'jezreel': ['Jezreel'],
  'da': ['Dan', 'Tel Dan'],
  'hazor': ['Hazor'],
  'laquis': ['Lachish', 'Laquis'],
  'en-gedi': ['En-gedi', 'Engedi', 'Ein Gedi'],
  'gaza': ['Gaza'],
  'asdode': ['Ashdod', 'Azotus', 'Asdode'],
  'ascalom': ['Ashkelon', 'Ascalon', 'Ascalom'],
  'ecrom': ['Ekron', 'Ecrom'],
  'gate': ['Gath', 'Gate'],
  'jope': ['Joppa', 'Jaffa', 'Jope'],
  'lida': ['Lydda', 'Lod', 'Lida'],
  'cesareia': ['Caesarea', 'Cesareia'],
  'tiro': ['Tyre', 'Tiro'],
  'sidom': ['Sidon', 'Sidom'],
  'damasco': ['Damascus', 'Damasco'],
  'samaria': ['Samaria', 'Sebaste'],
  'sodoma': ['Sodom', 'Sodoma'],
  'ur': ['Ur'],
  'hara': ['Haran', 'Harran', 'Harã'],
  'canaa': ['Canaan', 'Canaã'],
  'egito': ['Egypt', 'Egito'],
  'gosen': ['Goshen', 'Gósen'],
  'menfis': ['Memphis', 'Mênfis'],
  'sinai': ['Sinai', 'Horeb'],
  'cades-barneia': ['Kadesh-barnea', 'Kadesh', 'Cades'],
  'midia': ['Midian', 'Midiã'],
  'edom': ['Edom', 'Seir', 'Bozrah', 'Petra'],
  'moabe': ['Moab', 'Moabe'],
  'amom': ['Ammon', 'Rabbah', 'Amman'],
  'gileade': ['Gilead', 'Gileade'],
  'basa': ['Bashan', 'Basã'],
  'babilonia': ['Babylon', 'Babel', 'Babilônia'],
  'ninive': ['Nineveh', 'Nínive'],
  'assiria': ['Assyria', 'Assíria'],
  'persia': ['Persia', 'Susa', 'Persepolis', 'Pérsia'],
  'carquemis': ['Carchemish', 'Carquemis'],
  'ararate': ['Ararat', 'Ararate'],
  'mesopotamia': ['Mesopotamia', 'Mesopotâmia'],
  'siria': ['Syria', 'Aram', 'Síria'],
  'fenicia': ['Phoenicia', 'Fenícia'],
  'arabia': ['Arabia', 'Arábia'],
  'etiopia': ['Ethiopia', 'Cush', 'Etiópia'],
  'libia': ['Libya', 'Cyrene', 'Líbia'],
  'tarsis': ['Tarshish', 'Társis'],
  'galileia': ['Galilee', 'Galileia'],
  'judeia': ['Judea', 'Judaea', 'Judeia'],
  'pereia': ['Perea', 'Pereia'],
  'decapolis': ['Decapolis', 'Decápolis'],
  'idumeia': ['Idumea', 'Idumeia'],
  'antioquia': ['Antioch', 'Antioquia'],
  'tarso': ['Tarsus', 'Tarso'],
  'chipre': ['Cyprus', 'Salamis', 'Paphos', 'Chipre'],
  'perge': ['Perga', 'Pamphylia', 'Attalia', 'Perge'],
  'iconio': ['Iconium', 'Icônio'],
  'listra': ['Lystra', 'Derbe', 'Listra'],
  'galacia': ['Galatia', 'Phrygia', 'Galácia'],
  'troade': ['Troas', 'Trôade'],
  'macedonia': ['Macedonia', 'Neapolis', 'Macedônia'],
  'filipos': ['Philippi', 'Filipos'],
  'tessalonica': ['Thessalonica', 'Berea', 'Tessalônica'],
  'atenas': ['Athens', 'Greece', 'Achaia', 'Atenas'],
  'corinto': ['Corinth', 'Cenchreae', 'Corinto'],
  'efeso': ['Ephesus', 'Éfeso'],
  'esmirna': ['Smyrna', 'Esmirna'],
  'pergamo': ['Pergamum', 'Pergamos', 'Pérgamo'],
  'tiatira': ['Thyatira', 'Tiatira'],
  'sardes': ['Sardis', 'Sardes'],
  'filadelfia': ['Philadelphia', 'Filadélfia'],
  'laodiceia': ['Laodicea', 'Laodiceia'],
  'patmos': ['Patmos'],
  'colossos': ['Colossae', 'Hierapolis', 'Colossos'],
  'mileto': ['Miletus', 'Mileto'],
  'asia': ['Asia'],
  'capadocia': ['Cappadocia', 'Bithynia', 'Cilicia', 'Lycia', 'Capadócia'],
  'creta': ['Crete', 'Creta'],
  'malta': ['Malta', 'Melita'],
  'siracusa': ['Syracuse', 'Rhegium', 'Puteoli', 'Siracusa'],
  'roma': ['Rome', 'Italy', 'Roma'],
  'alexandria': ['Alexandria'],
  'rio jordao': ['Jordan River', 'Jordan', 'Jordão'],
  'rio eufrates': ['Euphrates', 'Eufrates'],
  'rio tigre': ['Tigris', 'Tigre'],
  'rio nilo': ['Nile', 'Nilo'],
  'mar vermelho': ['Red Sea', 'Mar Vermelho'],
  'mar morto': ['Dead Sea', 'Salt Sea', 'Mar Morto'],
  'mar da galileia': ['Sea of Galilee', 'Gennesaret', 'Galilee', 'Tiberias'],
  'monte das oliveiras': ['Mount of Olives', 'Olivet', 'Oliveiras'],
  'monte carmelo': ['Mount Carmel', 'Carmel', 'Carmelo'],
  'monte hermom': ['Mount Hermon', 'Hermon', 'Hermom'],
  'monte tabor': ['Mount Tabor', 'Tabor'],
  'monte nebo': ['Mount Nebo', 'Nebo', 'Pisgah'],
  'monte siao': ['Mount Zion', 'Zion', 'Moriah', 'Sião'],
  'libano': ['Lebanon', 'Líbano']
};

let cachedAllVisualModules = null;
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
  cachedAllVisualModules = null;
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

export function getSavedActivePhotoModulePath() {
  try {
    return window.localStorage.getItem(PREF_ACTIVE_PHOTO_KEY) || '';
  } catch (err) {
    return '';
  }
}

export function setSavedActivePhotoModulePath(modulePath) {
  try {
    if (modulePath) {
      window.localStorage.setItem(PREF_ACTIVE_PHOTO_KEY, String(modulePath));
    } else {
      window.localStorage.removeItem(PREF_ACTIVE_PHOTO_KEY);
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
    throw new Error('Seletor de pasta disponível apenas no aplicativo Android.');
  }
  const res = await plugin.pickMapDirectory();
  clearMapServiceCache();
  cachedDirPath = (res && res.path) || '';
  return res;
}

export async function setMapDirectory(path) {
  const plugin = getMapPlugin();
  if (!plugin) {
    throw new Error('Configuração de pasta disponível apenas no aplicativo Android.');
  }
  const res = await plugin.setMapDirectory({ path: String(path || '').trim() });
  clearMapServiceCache();
  cachedDirPath = (res && res.path) || '';
  return res;
}

export async function listAllVisualModules({ forceRefresh = false } = {}) {
  const plugin = getMapPlugin();
  if (!plugin) {
    return { dirPath: '', modules: [] };
  }
  if (!forceRefresh && Array.isArray(cachedAllVisualModules)) {
    return { dirPath: cachedDirPath, modules: cachedAllVisualModules };
  }

  try {
    const res = await plugin.listMapModules();
    cachedDirPath = (res && res.dirPath) || '';
    cachedAllVisualModules = Array.isArray(res && res.modules) ? res.modules : [];
    return { dirPath: cachedDirPath, modules: cachedAllVisualModules };
  } catch (err) {
    appLogger.error('MAP_LIST', 'Erro ao listar módulos visuais', err);
    return { dirPath: cachedDirPath, modules: [] };
  }
}

/**
 * Retorna exclusivamente módulos cartográficos (mapas/atlas),
 * excluindo coleções de fotos e ilustrações (como Bible Maps Location Photos).
 */
export async function listMapModules({ forceRefresh = false } = {}) {
  const { dirPath, modules } = await listAllVisualModules({ forceRefresh });
  return {
    dirPath,
    modules: modules.filter((m) => (m && m.moduleKind ? m.moduleKind !== 'photo' : true))
  };
}

/**
 * Retorna exclusivamente módulos de fotos, ilustrações, gravuras e diagramas.
 */
export async function listPhotoModules({ forceRefresh = false } = {}) {
  const { dirPath, modules } = await listAllVisualModules({ forceRefresh });
  return {
    dirPath,
    modules: modules.filter((m) => m && m.moduleKind === 'photo')
  };
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
    appLogger.error('MAP_INDEX', `Erro ao carregar índice do módulo visual: ${modulePath}`, err);
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

export async function searchMaps(query, { modulePath = '', limit = 20, kind = 'map' } = {}) {
  const plugin = getMapPlugin();
  const clean = String(query || '').trim();
  if (!plugin || !clean) return [];

  try {
    const res = await plugin.searchMaps({
      query: clean,
      modulePath: modulePath || '',
      kind: kind || '',
      limit
    });
    return Array.isArray(res && res.results) ? res.results : [];
  } catch (err) {
    appLogger.warn('MAP_SEARCH', `Falha ao pesquisar "${clean}" nos módulos visuais`, err);
    return [];
  }
}

export async function searchPhotos(query, { modulePath = '', limit = 40 } = {}) {
  return searchMaps(query, { modulePath, limit, kind: 'photo' });
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

export function getPhotoSearchTermsForPlace(placeOrName) {
  const name = typeof placeOrName === 'string'
    ? placeOrName
    : (placeOrName && placeOrName.name) || '';
  const key = normalizeAscii(name).trim();
  const out = [];
  const pushUnique = (t) => {
    const clean = String(t || '').trim();
    if (!clean) return;
    if (!out.some((x) => normalizeAscii(x) === normalizeAscii(clean))) {
      out.push(clean);
    }
  };

  if (key && PHOTO_PLACE_TERMS[key]) {
    for (const term of PHOTO_PLACE_TERMS[key]) {
      pushUnique(term);
    }
  }
  pushUnique(name);
  if (placeOrName && Array.isArray(placeOrName.aliases)) {
    for (const a of placeOrName.aliases) {
      pushUnique(a);
    }
  }
  return out;
}

/**
 * Carrega todos os marcadores de localização/mapa de um capítulo bíblico.
 */
export async function loadMapMarkersForChapter(book, chapter, verses = []) {
  const resultMap = new Map();
  const plugin = getMapPlugin();
  const cacheKey = `${book}:${chapter}`;
  let nativeByVerse = chapterNativeCache.get(cacheKey);

  if (!nativeByVerse) {
    nativeByVerse = {};
    if (plugin) {
      const { modules } = await listAllVisualModules();
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

    const allNative = Array.isArray(nativeByVerse[String(vNum)])
      ? nativeByVerse[String(vNum)]
      : [];
    const nativeMaps = allNative.filter((item) => !item.moduleKind || item.moduleKind !== 'photo');
    const nativePhotos = allNative.filter((item) => item.moduleKind === 'photo');
    const locations = detectLocationsInVerse(vObj.html || vObj.text || '');

    if (nativeMaps.length || nativePhotos.length || locations.length) {
      resultMap.set(vNum, {
        book: Number(book),
        chapter: Number(chapter),
        verse: vNum,
        nativeMaps,
        nativePhotos,
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
 * Retorna apenas mapas cartográficos (nunca fotos) recomendados para sobreposição.
 */
export async function resolveMapsForMarker(markerInfo) {
  const { modules } = await listMapModules();
  if (!modules.length) return [];

  const scored = [];
  const seenKey = new Set();

  const pushCandidate = (item, score) => {
    const key = `${item.modulePath}::${item.rowid || item.id || item.title}`;
    if (seenKey.has(key)) return;
    seenKey.add(key);
    scored.push({ ...item, score });
  };

  for (const nm of (markerInfo && markerInfo.nativeMaps) || []) {
    if (nm.moduleKind === 'photo') continue;
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

      if (primaryLoc && isValidGeoBounds(item.bounds)) {
        if (isPointInBounds(primaryLoc.lat, primaryLoc.lng, item.bounds)) {
          const span = Math.abs(item.bounds.north - item.bounds.south) * Math.abs(item.bounds.east - item.bounds.west);
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
 * Busca fotos e ilustrações correspondentes a um local ou lista de locais bíblicos
 * em todos os módulos classificados como "photo" (ex.: Bible Maps Location Photos).
 */
export async function resolvePhotosForPlace(placeOrName, { limit = 30 } = {}) {
  const { modules } = await listPhotoModules();
  if (!modules.length) return [];

  const terms = getPhotoSearchTermsForPlace(placeOrName);
  if (!terms.length) return [];

  const normTerms = terms.map((t) => normalizeAscii(t)).filter((t) => t.length >= 2);
  const scored = [];
  const seen = new Set();

  await Promise.all(modules.map(async (mod) => {
    const items = await getMapModuleIndex(mod.path);
    const modTitle = mod.title || mod.name || mod.fileName;

    for (const item of items) {
      if (!item.title || isTocTitle(item.title) || item.hasImage === false) continue;
      const titleNorm = normalizeAscii(item.title).trim();
      const tagsNorm = normalizeAscii(item.tags || '').trim();

      let score = 0;
      for (let i = 0; i < normTerms.length; i++) {
        const needle = normTerms[i];
        const weight = i === 0 ? 1.15 : 1.0;

        if (titleNorm === needle) {
          score = Math.max(score, Math.round(110 * weight));
        } else if (titleNorm.startsWith(`${needle} `) || titleNorm.startsWith(`${needle},`) || titleNorm.startsWith(`${needle}-`)) {
          score = Math.max(score, Math.round(92 * weight));
        } else if (needle.length >= 4 && titleNorm.includes(needle)) {
          score = Math.max(score, Math.round(68 * weight));
        } else if (needle.length >= 4 && tagsNorm.includes(needle)) {
          score = Math.max(score, Math.round(45 * weight));
        }
      }

      if (score > 0) {
        const key = `${mod.path}::${item.rowid || item.id || item.title}`;
        if (!seen.has(key)) {
          seen.add(key);
          scored.push({
            id: item.id,
            rowid: item.rowid,
            title: item.title,
            modulePath: mod.path,
            moduleTitle: modTitle,
            score
          });
        }
      }
    }
  }));

  scored.sort((a, b) => (b.score - a.score) || a.title.localeCompare(b.title));
  return scored.slice(0, limit);
}

export async function resolvePhotosForMarker(markerInfo, { limit = 30 } = {}) {
  const results = [];
  const seen = new Set();

  const pushUnique = (item) => {
    const key = `${item.modulePath}::${item.rowid || item.id || item.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(item);
  };

  for (const np of (markerInfo && markerInfo.nativePhotos) || []) {
    pushUnique(np);
  }

  const locs = (markerInfo && markerInfo.locations) || [];
  for (const loc of locs) {
    const hits = await resolvePhotosForPlace(loc, { limit });
    for (const h of hits) {
      pushUnique(h);
    }
  }

  return results.slice(0, limit);
}

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
