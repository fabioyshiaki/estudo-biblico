import { nativeBridge } from '../bridge/native-bridge.js';

const IDB_NAME = 'estudo_biblico_media_cache';
const IDB_VERSION = 1;
const IDB_STORE = 'images';
const SQLITE_HEX_CHUNK = 250000;

let idbPromise = null;
const memoryUrlCache = new Map();
const schemaCache = new Map();
const dataIndexCache = new Map();

function quoteIdent(name) {
  return `"${String(name || '').replace(/"/g, '""')}"`;
}

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

async function readIdbRecord(key) {
  const db = await openMediaDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (err) {
      resolve(null);
    }
  });
}

async function writeIdbDataUrl(key, dataUrl) {
  const db = await openMediaDb();
  if (!db || !dataUrl) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({
        key,
        dataUrl,
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
  const clean = String(hexStr || '').replace(/\s+/g, '');
  const len = Math.floor(clean.length / 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16) || 0;
  }
  return bytes;
}

function uint8ToBase64(bytes) {
  const chunkSize = 0x8000;
  const parts = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode.apply(null, slice));
  }
  return btoa(parts.join(''));
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    } catch (err) {
      resolve('');
    }
  });
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

async function resolveDataTableSchema(modulePath) {
  if (schemaCache.has(modulePath)) {
    return schemaCache.get(modulePath);
  }

  try {
    const tblRes = await nativeBridge.queryModule(
      modulePath,
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    const tables = (Array.isArray(tblRes && tblRes.rows) ? tblRes.rows : [])
      .map((r) => String(getRowField(r, 'name') || ''))
      .filter(Boolean);

    const preferred = ['data', 'images', 'media', 'blobs', 'files'];
    let tableName = '';
    for (const p of preferred) {
      const hit = tables.find((t) => t.toLowerCase() === p);
      if (hit) {
        tableName = hit;
        break;
      }
    }

    if (!tableName) {
      const empty = { hasData: false };
      schemaCache.set(modulePath, empty);
      return empty;
    }

    const colRes = await nativeBridge.queryModule(
      modulePath,
      `PRAGMA table_info(${quoteIdent(tableName)})`
    );
    const cols = (Array.isArray(colRes && colRes.rows) ? colRes.rows : [])
      .map((r) => String(getRowField(r, 'name') || ''))
      .filter(Boolean);

    const findCol = (names) => {
      for (const n of names) {
        const hit = cols.find((c) => c.toLowerCase() === n);
        if (hit) return hit;
      }
      return '';
    };

    const idCol = findCol(['id', 'name', 'key', 'img_id']);
    const fileCol = findCol(['filename', 'file', 'file_name', 'fname']);
    const blobCol = findCol(['content', 'data', 'image', 'blob', 'img', 'bytes']);

    const matchCols = [];
    if (idCol) matchCols.push(idCol);
    if (fileCol && fileCol.toLowerCase() !== idCol.toLowerCase()) matchCols.push(fileCol);

    if (!blobCol || !matchCols.length) {
      const empty = { hasData: false, reason: `Colunas não encontradas em ${tableName}` };
      schemaCache.set(modulePath, empty);
      return empty;
    }

    const schema = {
      hasData: true,
      tableName,
      qTable: quoteIdent(tableName),
      qBlob: quoteIdent(blobCol),
      matchCols,
      qMatchCols: matchCols.map(quoteIdent)
    };
    schemaCache.set(modulePath, schema);
    return schema;
  } catch (err) {
    const empty = { hasData: false, reason: err && err.message ? err.message : 'Erro ao inspecionar tabela data' };
    schemaCache.set(modulePath, empty);
    return empty;
  }
}

function buildWhereClause(schema, term) {
  const clauses = schema.qMatchCols.map((c) => `${c} = ? COLLATE NOCASE`);
  const params = schema.qMatchCols.map(() => term);
  return { whereSql: clauses.join(' OR '), params };
}

async function getModuleDataIndex(modulePath, schema) {
  if (dataIndexCache.has(modulePath)) {
    return dataIndexCache.get(modulePath);
  }

  try {
    const selectCols = schema.qMatchCols.join(', ');
    const res = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${selectCols} FROM ${schema.qTable}`
    );
    const rows = Array.isArray(res && res.rows) ? res.rows : [];
    const ids = [];
    const byLower = new Map();

    for (const r of rows) {
      const vals = schema.matchCols
        .map((c) => String(getRowField(r, c.toLowerCase()) || '').trim())
        .filter(Boolean);
      if (!vals.length) continue;
      const primary = vals[0];
      ids.push(primary);
      for (const v of vals) {
        if (!byLower.has(v.toLowerCase())) {
          byLower.set(v.toLowerCase(), primary);
        }
      }
    }

    const info = { ids, byLower };
    dataIndexCache.set(modulePath, info);
    return info;
  } catch (err) {
    const empty = { ids: [], byLower: new Map() };
    dataIndexCache.set(modulePath, empty);
    return empty;
  }
}

function findRescuedDataId(baseName, indexInfo, contextRaw) {
  if (!baseName || !indexInfo) return '';

  const exact = indexInfo.byLower.get(baseName.toLowerCase());
  if (exact) return exact;

  // Recupera nomes traduzidos por engano no HTML (ex.: Beemote-1.jpg -> Behemoth-1.jpg, Lebre-1.jpg -> Hare-1.jpg)
  const suffixMatch = /-(\d+)\.[a-z0-9]+$/i.exec(baseName);
  const numSuffix = suffixMatch ? suffixMatch[1] : '';
  const ctxLower = String(contextRaw || '').toLowerCase();

  if (numSuffix && ctxLower && indexInfo.ids.length) {
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

async function readEmbeddedImageDataUrl(modulePath, schema, dataKey) {
  const { whereSql, params } = buildWhereClause(schema, dataKey);

  const lenRes = await nativeBridge.queryModule(
    modulePath,
    `SELECT length(${schema.qBlob}) AS len FROM ${schema.qTable} WHERE ${whereSql} LIMIT 1`,
    params
  );
  const row = lenRes && Array.isArray(lenRes.rows) ? lenRes.rows[0] : null;
  if (!row) return { url: '', found: false, error: '' };

  const totalBytes = Number(getRowField(row, 'len')) || 0;
  if (totalBytes <= 0) return { url: '', found: true, error: 'BLOB vazio no banco' };

  let hexFull = '';
  if (totalBytes <= SQLITE_HEX_CHUNK) {
    const res = await nativeBridge.queryModule(
      modulePath,
      `SELECT hex(${schema.qBlob}) AS h FROM ${schema.qTable} WHERE ${whereSql} LIMIT 1`,
      params
    );
    const hRow = res && Array.isArray(res.rows) ? res.rows[0] : null;
    hexFull = String(getRowField(hRow, 'h') || '');
  } else {
    const parts = [];
    for (let offset = 1; offset <= totalBytes; offset += SQLITE_HEX_CHUNK) {
      const chunkLen = Math.min(SQLITE_HEX_CHUNK, totalBytes - offset + 1);
      const res = await nativeBridge.queryModule(
        modulePath,
        `SELECT hex(substr(${schema.qBlob}, ${offset}, ${chunkLen})) AS h FROM ${schema.qTable} WHERE ${whereSql} LIMIT 1`,
        params
      );
      const hRow = res && Array.isArray(res.rows) ? res.rows[0] : null;
      parts.push(String(getRowField(hRow, 'h') || ''));
    }
    hexFull = parts.join('');
  }

  if (!hexFull) return { url: '', found: true, error: 'hex(content) retornou vazio' };

  const bytes = hexToUint8Array(hexFull);
  if (!bytes.length) return { url: '', found: true, error: 'Falha ao decodificar bytes hex' };

  const mime = detectImageMime(dataKey, bytes);
  const b64 = uint8ToBase64(bytes);
  return { url: `data:${mime};base64,${b64}`, found: true, error: '' };
}

function normalizeDownloadUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return '';

  const wikiFile = /wikimedia\.org\/wiki\/File:([^?#]+)/i.exec(url)
    || /wikipedia\.org\/wiki\/File:([^?#]+)/i.exec(url);
  if (wikiFile && wikiFile[1]) {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${wikiFile[1]}?width=900`;
  }
  return url;
}

async function fetchAndCacheExternalImage(rawUrl) {
  const downloadUrl = normalizeDownloadUrl(rawUrl);
  if (!downloadUrl) return { url: '', error: '' };

  const cacheKey = `ext::${downloadUrl}`;
  if (memoryUrlCache.has(cacheKey)) {
    return { url: memoryUrlCache.get(cacheKey), error: '' };
  }

  // 1. Verifica cache salvo no dispositivo (IndexedDB)
  const saved = await readIdbRecord(cacheKey);
  if (saved) {
    let url = '';
    if (typeof saved.dataUrl === 'string' && saved.dataUrl) {
      url = saved.dataUrl;
    } else if (saved.blob instanceof Blob) {
      url = await blobToDataUrl(saved.blob);
    }
    if (url) {
      memoryUrlCache.set(cacheKey, url);
      return { url, error: '' };
    }
  }

  // 2. Baixa e salva permanentemente em IndexedDB
  try {
    const resp = await fetch(downloadUrl, { mode: 'cors' });
    if (resp.ok) {
      const blob = await resp.blob();
      if (blob && blob.size && (!blob.type || blob.type.startsWith('image/'))) {
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl) {
          await writeIdbDataUrl(cacheKey, dataUrl);
          memoryUrlCache.set(cacheKey, dataUrl);
          return { url: dataUrl, error: '' };
        }
      }
    }
  } catch (err) {
    // Se CORS bloquear o fetch, devolve URL direta para o <img> tentar exibir
    return { url: downloadUrl, error: '' };
  }

  return { url: downloadUrl, error: '' };
}

export async function resolveDictionaryImageUrl(modulePath, rawSrc, options = {}) {
  const src = String(rawSrc || '').trim();
  if (!src) return { url: '', error: 'src vazio' };

  if (/^data:image\//i.test(src)) {
    return { url: src, error: '' };
  }

  if (/^https?:\/\//i.test(src)) {
    return fetchAndCacheExternalImage(src);
  }

  const baseName = src.split('/').pop().trim();
  const memKey = `mod::${modulePath}::${baseName.toLowerCase()}`;
  if (memoryUrlCache.has(memKey)) {
    return { url: memoryUrlCache.get(memKey), error: '' };
  }

  let lastError = '';

  if (modulePath) {
    const schema = await resolveDataTableSchema(modulePath);
    if (schema.hasData) {
      // 1. Busca direta no SQLite (não depende de carregar lista inteira da tabela data)
      try {
        const direct = await readEmbeddedImageDataUrl(modulePath, schema, baseName);
        if (direct.url) {
          memoryUrlCache.set(memKey, direct.url);
          return { url: direct.url, error: '' };
        }
        if (direct.error) lastError = direct.error;
      } catch (err) {
        lastError = err && err.message ? err.message : 'Erro SQL ao ler imagem';
      }

      // 2. Se não encontrou pelo nome exato, tenta resgatar nomes traduzidos (ex.: Beemote-1.jpg -> Behemoth-1.jpg)
      try {
        const idxInfo = await getModuleDataIndex(modulePath, schema);
        const rescuedId = findRescuedDataId(baseName, idxInfo, options.contextRaw || '');
        if (rescuedId && rescuedId.toLowerCase() !== baseName.toLowerCase()) {
          const rescuedKey = `mod::${modulePath}::${rescuedId.toLowerCase()}`;
          if (memoryUrlCache.has(rescuedKey)) {
            const cached = memoryUrlCache.get(rescuedKey);
            memoryUrlCache.set(memKey, cached);
            return { url: cached, error: '' };
          }
          const rescued = await readEmbeddedImageDataUrl(modulePath, schema, rescuedId);
          if (rescued.url) {
            memoryUrlCache.set(rescuedKey, rescued.url);
            memoryUrlCache.set(memKey, rescued.url);
            return { url: rescued.url, error: '' };
          }
          if (rescued.error) lastError = rescued.error;
        }
      } catch (err) {
        if (!lastError) lastError = err && err.message ? err.message : 'Erro ao buscar índice de imagens';
      }
    } else if (schema.reason) {
      lastError = schema.reason;
    }
  }

  // 3. Fallback externo (Wikimedia) com cache local
  if (options.fallbackUrl) {
    const ext = await fetchAndCacheExternalImage(options.fallbackUrl);
    if (ext.url) {
      memoryUrlCache.set(memKey, ext.url);
      return ext;
    }
  }

  return { url: '', error: lastError || 'Imagem não encontrada na tabela data' };
}

export function clearMediaIndexCache(modulePath) {
  if (modulePath) {
    schemaCache.delete(modulePath);
    dataIndexCache.delete(modulePath);
  } else {
    schemaCache.clear();
    dataIndexCache.clear();
  }
}
