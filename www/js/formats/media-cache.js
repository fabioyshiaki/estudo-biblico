import { nativeBridge } from '../bridge/native-bridge.js';

const IDB_NAME = 'estudo_biblico_media_cache';
const IDB_VERSION = 1;
const IDB_STORE = 'images';
const SQLITE_HEX_CHUNK = 600000;

let idbPromise = null;
const memoryUrlCache = new Map();
const dataIndexCache = new Map();

function getRowField(row, targetLower) {
  if (!row || typeof row !== 'object') return undefined;
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === targetLower) return row[key];
  }
  return undefined;
}

function openMediaDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (idbPromise) return idbPromise;

  idbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (err) {
      resolve(null);
    }
  });
  return idbPromise;
}

async function readIdbBlob(key) {
  const db = await openMediaDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => {
        const rec = req.result;
        resolve(rec && rec.blob instanceof Blob ? rec.blob : null);
      };
      req.onerror = () => resolve(null);
    } catch (err) {
      resolve(null);
    }
  });
}

async function writeIdbBlob(key, blob) {
  const db = await openMediaDb();
  if (!db || !(blob instanceof Blob)) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({
        key,
        blob,
        savedAt: Date.now()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (err) {
      resolve();
    }
  });
}

function hexToUint8Array(hexStr) {
  const clean = String(hexStr || '').trim();
  const len = Math.floor(clean.length / 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16) || 0;
  }
  return bytes;
}

function detectImageMime(fileName, bytes) {
  if (bytes && bytes.length >= 4) {
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
      return 'image/webp';
    }
  }
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

async function getModuleDataIndex(modulePath) {
  if (dataIndexCache.has(modulePath)) {
    return dataIndexCache.get(modulePath);
  }

  try {
    const tableCheck = await nativeBridge.queryModule(
      modulePath,
      "SELECT name FROM sqlite_master WHERE type='table' AND lower(name)='data' LIMIT 1"
    );
    const hasData = Array.isArray(tableCheck && tableCheck.rows) && tableCheck.rows.length > 0;
    if (!hasData) {
      const empty = { hasData: false, ids: [], byLower: new Map() };
      dataIndexCache.set(modulePath, empty);
      return empty;
    }

    const res = await nativeBridge.queryModule(
      modulePath,
      'SELECT id, filename FROM data'
    );
    const rows = Array.isArray(res && res.rows) ? res.rows : [];
    const ids = [];
    const byLower = new Map();

    for (const r of rows) {
      const id = String(getRowField(r, 'id') || '').trim();
      const fn = String(getRowField(r, 'filename') || '').trim();
      const primary = id || fn;
      if (!primary) continue;
      ids.push(primary);
      if (id) byLower.set(id.toLowerCase(), id);
      if (fn && !byLower.has(fn.toLowerCase())) byLower.set(fn.toLowerCase(), id || fn);
    }

    const info = { hasData: true, ids, byLower };
    dataIndexCache.set(modulePath, info);
    return info;
  } catch (err) {
    const empty = { hasData: false, ids: [], byLower: new Map() };
    dataIndexCache.set(modulePath, empty);
    return empty;
  }
}

function findRescuedDataId(rawSrc, indexInfo, contextRaw) {
  if (!indexInfo || !indexInfo.hasData) return '';

  const baseName = String(rawSrc || '').split('/').pop().trim();
  if (!baseName) return '';

  const exact = indexInfo.byLower.get(baseName.toLowerCase());
  if (exact) return exact;

  // Recupera nomes traduzidos por engano no HTML (ex.: Beemote-1.jpg -> Behemoth-1.jpg, Lebre-1.jpg -> Hare-1.jpg)
  const suffixMatch = /-(\d+)\.[a-z0-9]+$/i.exec(baseName);
  const numSuffix = suffixMatch ? suffixMatch[1] : '';
  const ctxLower = String(contextRaw || '').toLowerCase();

  if (numSuffix && ctxLower) {
    const suffixRe = new RegExp(`-${numSuffix}\\.[a-z0-9]+$`, 'i');
    const sameNum = indexInfo.ids.filter((id) => suffixRe.test(id));
    let bestId = '';
    let bestScore = 0;

    for (const id of sameNum) {
      const stem = id.replace(suffixRe, '').toLowerCase();
      if (stem.length < 3) continue;

      let score = 0;
      const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`/wiki/${escapedStem}(?:[_(/"']|\\b)`, 'i').test(ctxLower)) {
        score += 100 + stem.length;
      } else if (new RegExp(`file:[^"']*${escapedStem}`, 'i').test(ctxLower)) {
        score += 75 + stem.length;
      } else if (new RegExp(`\\b${escapedStem}\\b`, 'i').test(ctxLower)) {
        score += 40 + stem.length;
      }

      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    if (bestId) return bestId;
  }

  return '';
}

async function readEmbeddedImageBlob(modulePath, dataId) {
  const lenRes = await nativeBridge.queryModule(
    modulePath,
    'SELECT length(content) AS len FROM data WHERE id = ? COLLATE NOCASE OR filename = ? COLLATE NOCASE LIMIT 1',
    [dataId, dataId]
  );
  const row = lenRes && Array.isArray(lenRes.rows) ? lenRes.rows[0] : null;
  const totalBytes = Number(getRowField(row, 'len')) || 0;
  if (totalBytes <= 0) return null;

  let hexFull = '';
  if (totalBytes <= SQLITE_HEX_CHUNK) {
    const res = await nativeBridge.queryModule(
      modulePath,
      'SELECT hex(content) AS h FROM data WHERE id = ? COLLATE NOCASE OR filename = ? COLLATE NOCASE LIMIT 1',
      [dataId, dataId]
    );
    const hRow = res && Array.isArray(res.rows) ? res.rows[0] : null;
    hexFull = String(getRowField(hRow, 'h') || '');
  } else {
    const parts = [];
    for (let offset = 1; offset <= totalBytes; offset += SQLITE_HEX_CHUNK) {
      const res = await nativeBridge.queryModule(
        modulePath,
        'SELECT hex(substr(content, ?, ?)) AS h FROM data WHERE id = ? COLLATE NOCASE OR filename = ? COLLATE NOCASE LIMIT 1',
        [offset, SQLITE_HEX_CHUNK, dataId, dataId]
      );
      const hRow = res && Array.isArray(res.rows) ? res.rows[0] : null;
      parts.push(String(getRowField(hRow, 'h') || ''));
    }
    hexFull = parts.join('');
  }

  if (!hexFull) return null;
  const bytes = hexToUint8Array(hexFull);
  if (!bytes.length) return null;

  const mime = detectImageMime(dataId, bytes);
  return new Blob([bytes], { type: mime });
}

function normalizeDownloadUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return '';

  // Converte página File: da Wikimedia Commons em endpoint direto da imagem
  const wikiFile = /wikimedia\.org\/wiki\/File:([^?#]+)/i.exec(url)
    || /wikipedia\.org\/wiki\/File:([^?#]+)/i.exec(url);
  if (wikiFile && wikiFile[1]) {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${wikiFile[1]}?width=900`;
  }
  return url;
}

async function fetchAndCacheExternalImage(rawUrl) {
  const downloadUrl = normalizeDownloadUrl(rawUrl);
  if (!downloadUrl) return '';

  const cacheKey = `ext::${downloadUrl}`;
  if (memoryUrlCache.has(cacheKey)) {
    return memoryUrlCache.get(cacheKey);
  }

  // 1. Verifica primeiro se já foi baixada anteriormente e salva no dispositivo (IndexedDB)
  const savedBlob = await readIdbBlob(cacheKey);
  if (savedBlob) {
    const objUrl = URL.createObjectURL(savedBlob);
    memoryUrlCache.set(cacheKey, objUrl);
    return objUrl;
  }

  // 2. Baixa uma única vez e grava permanentemente no dispositivo
  try {
    const resp = await fetch(downloadUrl, { mode: 'cors' });
    if (!resp.ok) return '';
    const blob = await resp.blob();
    if (!blob || !blob.size || (blob.type && !blob.type.startsWith('image/'))) {
      return '';
    }
    await writeIdbBlob(cacheKey, blob);
    const objUrl = URL.createObjectURL(blob);
    memoryUrlCache.set(cacheKey, objUrl);
    return objUrl;
  } catch (err) {
    return '';
  }
}

export async function resolveDictionaryImageUrl(modulePath, rawSrc, options = {}) {
  const src = String(rawSrc || '').trim();
  if (!src) return '';

  if (/^data:image\//i.test(src)) {
    return src;
  }

  // Imagem externa http/https -> baixa uma vez e mantém salva no dispositivo
  if (/^https?:\/\//i.test(src)) {
    const cachedUrl = await fetchAndCacheExternalImage(src);
    return cachedUrl || src;
  }

  // Imagem embutida na tabela `data` do módulo .dct.mybible
  const memKey = `mod::${modulePath}::${src.toLowerCase()}`;
  if (memoryUrlCache.has(memKey)) {
    return memoryUrlCache.get(memKey);
  }

  if (modulePath) {
    const indexInfo = await getModuleDataIndex(modulePath);
    const matchedId = findRescuedDataId(src, indexInfo, options.contextRaw || '');
    if (matchedId) {
      const idbKey = `mod::${modulePath}::${matchedId.toLowerCase()}`;
      if (memoryUrlCache.has(idbKey)) {
        const existing = memoryUrlCache.get(idbKey);
        memoryUrlCache.set(memKey, existing);
        return existing;
      }

      try {
        const blob = await readEmbeddedImageBlob(modulePath, matchedId);
        if (blob) {
          const objUrl = URL.createObjectURL(blob);
          memoryUrlCache.set(idbKey, objUrl);
          memoryUrlCache.set(memKey, objUrl);
          return objUrl;
        }
      } catch (err) {
        // Segue para fallback externo se existir
      }
    }
  }

  // Fallback opcional: se não existir no BLOB local, tenta baixar da URL de crédito da Wikimedia e salva no dispositivo
  if (options.fallbackUrl) {
    const extUrl = await fetchAndCacheExternalImage(options.fallbackUrl);
    if (extUrl) {
      memoryUrlCache.set(memKey, extUrl);
      return extUrl;
    }
  }

  return '';
}

export function clearMediaIndexCache(modulePath) {
  if (modulePath) {
    dataIndexCache.delete(modulePath);
  } else {
    dataIndexCache.clear();
  }
}
