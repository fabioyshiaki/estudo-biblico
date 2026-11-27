import { nativeBridge } from '../bridge/native-bridge.js';
import { appLogger } from '../core/logger.js';

const fsEntryCache = new Map();

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

function getSqlCapablePlugins() {
  const list = [];
  if (nativeBridge && typeof nativeBridge === 'object') {
    list.push(nativeBridge);
  }
  if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) {
    const p = window.Capacitor.Plugins;
    if (p.BibleCore && !list.includes(p.BibleCore)) list.push(p.BibleCore);
    if (p.MapReader && !list.includes(p.MapReader)) list.push(p.MapReader);
  }
  return list;
}

async function queryModuleDictionaryTable(modulePath, fsCode) {
  if (!modulePath || !fsCode) return null;

  const sql =
    'SELECT word, data FROM dictionary ' +
    'WHERE UPPER(TRIM(word)) = ? OR UPPER(TRIM(word)) LIKE ? ' +
    'ORDER BY CASE WHEN UPPER(TRIM(word)) = ? THEN 0 ELSE 1 END, relativeorder ASC, rowid ASC LIMIT 1';
  const params = [fsCode, `${fsCode}%`, fsCode];

  for (const target of getSqlCapablePlugins()) {
    const fnNames = ['query', 'rawQuery', 'executeSql', 'execSql', 'select'];
    for (const fnName of fnNames) {
      if (typeof target[fnName] !== 'function') continue;
      try {
        const res = await target[fnName]({
          path: modulePath,
          modulePath,
          sql,
          query: sql,
          params,
          args: params
        });

        const rows = Array.isArray(res)
          ? res
          : Array.isArray(res && res.rows)
            ? res.rows
            : Array.isArray(res && res.results)
              ? res.results
              : [];

        if (rows.length > 0) {
          const row = rows[0];
          const word = String(row.word || row.WORD || fsCode).trim();
          const html = String(row.data || row.DATA || row.content || row.html || '').trim();
          if (html) {
            return {
              word,
              html,
              source: 'module-dictionary',
              modulePath
            };
          }
        }
      } catch (err) {
        // Tenta próximo método/plugin disponível
      }
    }
  }

  return null;
}

/**
 * Busca um código FS... (ex.: FS24B, FS184A) primeiro na tabela `dictionary`
 * interna do módulo atual e faz cache por (modulePath::code).
 */
export async function lookupFsInModule(modulePath, rawCode) {
  const code = normalizeFsCode(rawCode);
  if (!code) return null;

  const cacheKey = `${modulePath || 'global'}::${code}`;
  if (fsEntryCache.has(cacheKey)) {
    return fsEntryCache.get(cacheKey);
  }

  if (modulePath) {
    try {
      const hit = await queryModuleDictionaryTable(modulePath, code);
      if (hit) {
        fsEntryCache.set(cacheKey, hit);
        return hit;
      }
    } catch (err) {
      appLogger.warn('FS_LOOKUP', `Falha ao consultar tabela dictionary do módulo para ${code}`, err);
    }
  }

  return null;
}

export function clearFsLookupCache() {
  fsEntryCache.clear();
}
