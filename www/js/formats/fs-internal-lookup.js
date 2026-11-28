import { nativeBridge } from '../bridge/native-bridge.js';
import { store } from '../core/store.js';
import { appLogger } from '../core/logger.js';

const fsEntryCache = new Map();
const internalDictModulesCache = new Map();

export function normalizeFsCode(rawCode) {
  const clean = String(rawCode || '')
    .replace(/<\/?fl>/gi, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim()
    .toUpperCase();
  const match = /^FS\d+[A-Z0-9]*$/i.exec(clean);
  return match ? match[0].toUpperCase() : '';
}

export function extractFsCodeFromElement(el) {
  if (!el || typeof el.getAttribute !== 'function') return '';
  const directAttr =
    el.getAttribute('data-fs') ||
    el.getAttribute('data-fl') ||
    el.getAttribute('data-figure') ||
    el.getAttribute('href') ||
    '';
  const fromAttr = normalizeFsCode(directAttr);
  if (fromAttr) return fromAttr;

  const txt = String(el.textContent || '').trim();
  if (/^FS\d+[A-Z0-9]*$/i.test(txt)) {
    return normalizeFsCode(txt);
  }
  return '';
}

export function getFileNameFromPath(filePath) {
  const raw = String(filePath || '').trim();
  if (!raw) return '';
  const parts = raw.split(/[\\/]/);
  return parts[parts.length - 1] || raw;
}

function extractRowsFromQueryResult(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.rows)) return res.rows;
  if (res && Array.isArray(res.results)) return res.results;
  return [];
}

async function moduleHasInternalDictionary(mod) {
  if (!mod || !mod.path) return false;
  if (internalDictModulesCache.has(mod.path)) {
    return internalDictModulesCache.get(mod.path);
  }

  try {
    const sql =
      "SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND LOWER(name) = 'dictionary' LIMIT 1";
    const res = await nativeBridge.queryModule(mod.path, sql, []);
    const rows = extractRowsFromQueryResult(res);
    const hasDict = rows.length > 0;
    internalDictModulesCache.set(mod.path, hasDict);
    return hasDict;
  } catch (err) {
    internalDictModulesCache.set(mod.path, false);
    return false;
  }
}

/**
 * Vasculha todos os módulos de Bíblia e Comentário carregados e retorna
 * aqueles que possuem tabela `dictionary` interna, formatados como dicionários
 * exibindo o nome do arquivo de origem.
 */
export async function discoverInternalDictionaryModules() {
  const state = store.getState ? store.getState() : {};
  const bibles = Array.isArray(state.bibles) ? state.bibles : (store.getBibles ? store.getBibles() : []);
  const commentaries = Array.isArray(state.commentaries)
    ? state.commentaries
    : (store.getCommentaries ? store.getCommentaries() : []);

  const candidates = [...bibles, ...commentaries];
  const seen = new Set();
  const uniqueCandidates = [];

  for (const mod of candidates) {
    if (!mod || !mod.path || seen.has(mod.path)) continue;
    seen.add(mod.path);
    uniqueCandidates.push(mod);
  }

  const discovered = [];
  const batchSize = 6;

  for (let i = 0; i < uniqueCandidates.length; i += batchSize) {
    const chunk = uniqueCandidates.slice(i, i + batchSize);
    const checks = await Promise.all(
      chunk.map(async (mod) => ({
        mod,
        hasDict: await moduleHasInternalDictionary(mod)
      }))
    );

    for (const item of checks) {
      if (!item.hasDict) continue;
      const fileName = item.mod.fileName || getFileNameFromPath(item.mod.path);
      const baseTitle = item.mod.title || item.mod.abbr || fileName;
      discovered.push({
        ...item.mod,
        id: `internal_dict::${item.mod.path}`,
        fileName,
        sourceFileName: fileName,
        isInternalDictionary: true,
        resourceKind: 'dictionary',
        abbr: fileName,
        title: `${baseTitle} [${fileName}]`,
        description: `Dicionário interno de ${fileName}`
      });
    }
  }

  return discovered;
}

async function queryModuleDictionaryTable(modulePath, fsCode) {
  if (!modulePath || !fsCode) return null;

  const sql =
    'SELECT word, data FROM dictionary ' +
    'WHERE UPPER(TRIM(word)) = ? OR UPPER(TRIM(word)) LIKE ? ' +
    'ORDER BY CASE WHEN UPPER(TRIM(word)) = ? THEN 0 ELSE 1 END, relativeorder ASC, rowid ASC LIMIT 1';
  const params = [fsCode, `${fsCode}%`, fsCode];

  const res = await nativeBridge.queryModule(modulePath, sql, params);
  const rows = extractRowsFromQueryResult(res);

  if (rows.length > 0) {
    const row = rows[0];
    const word = String(row.word || row.WORD || fsCode).trim();
    const html = String(row.data || row.DATA || row.content || row.html || '').trim();
    if (html) {
      return {
        word,
        html,
        source: 'module-dictionary',
        modulePath,
        sourceFileName: getFileNameFromPath(modulePath)
      };
    }
  }

  return null;
}

/**
 * Busca um código FS... (ex.: FS24B, FS184A, FS96C1) na tabela `dictionary`
 * do módulo de origem e, se não achar, vasculha os demais módulos com
 * dicionário interno (Bíblias e Comentários).
 */
export async function lookupFsInModule(modulePath, rawCode) {
  const code = normalizeFsCode(rawCode);
  if (!code) return null;

  const cacheKey = `${modulePath || 'all'}::${code}`;
  if (fsEntryCache.has(cacheKey)) {
    return fsEntryCache.get(cacheKey);
  }

  const orderedPaths = [];
  if (modulePath) {
    orderedPaths.push(modulePath);
  }

  const internalModules = await discoverInternalDictionaryModules();
  for (const mod of internalModules) {
    if (mod.path && !orderedPaths.includes(mod.path)) {
      orderedPaths.push(mod.path);
    }
  }

  for (const candidatePath of orderedPaths) {
    try {
      const hit = await queryModuleDictionaryTable(candidatePath, code);
      if (hit) {
        fsEntryCache.set(cacheKey, hit);
        return hit;
      }
    } catch (err) {
      appLogger.warn('FS_LOOKUP', `Falha ao consultar tabela dictionary em ${getFileNameFromPath(candidatePath)} para ${code}`, err);
    }
  }

  return null;
}

export function clearFsLookupCache() {
  fsEntryCache.clear();
  internalDictModulesCache.clear();
}
