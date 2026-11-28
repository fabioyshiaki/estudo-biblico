import { nativeBridge } from '../bridge/native-bridge.js';
import { formatMySwordDictionaryData } from './mysword-dictionary.js';
import { getBookName, formatReference } from '../core/canon.js';
import { appLogger } from '../core/logger.js';

const schemaCache = new Map();
const passagePresenceCache = new Map();
const PRESENCE_CACHE_LIMIT = 40;

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

function toInt(val, fallback = 0) {
  const n = Math.trunc(Number(val));
  return Number.isFinite(n) ? n : fallback;
}

function normalizePassage(book, chapter, verse = 1) {
  return {
    book: Math.max(1, toInt(book, 1)),
    chapter: Math.max(0, toInt(chapter, 1)),
    verse: Math.max(1, toInt(verse, 1))
  };
}

function classifyEntry(book, chapter, chapterEnd, fromVerse, toVerse) {
  const b = toInt(book, 1);
  const c = toInt(chapter, 0);
  const cEnd = toInt(chapterEnd, 0) > c ? toInt(chapterEnd, 0) : c;
  const fv = Math.max(0, toInt(fromVerse, 0));
  const rawTv = Math.max(0, toInt(toVerse, 0));
  const tv = fv > 0 ? (rawTv >= fv ? rawTv : fv) : 0;
  const bookName = getBookName(b);

  if (c <= 0) {
    return {
      book: b,
      chapter: 0,
      chapterEnd: 0,
      fromVerse: 0,
      toVerse: 0,
      scopeKind: 'bookIntro',
      badge: 'Introdução do Livro',
      label: `Introdução — ${bookName}`,
      shortLabel: 'Introdução',
      spanSize: 100000
    };
  }

  if (cEnd > c) {
    const startPart = fv > 0 ? `${c}:${fv}` : `${c}`;
    const endPart = rawTv > 0 ? `${cEnd}:${rawTv}` : `${cEnd}`;
    return {
      book: b,
      chapter: c,
      chapterEnd: cEnd,
      fromVerse: fv,
      toVerse: rawTv,
      scopeKind: 'multiChapter',
      badge: 'Capítulos',
      label: `${bookName} ${startPart}–${endPart}`,
      shortLabel: `${startPart}–${endPart}`,
      spanSize: (cEnd - c + 1) * 1000
    };
  }

  if (fv <= 0) {
    return {
      book: b,
      chapter: c,
      chapterEnd: c,
      fromVerse: 0,
      toVerse: 0,
      scopeKind: 'chapter',
      badge: 'Capítulo',
      label: `${bookName} ${c} (Capítulo)`,
      shortLabel: `Cap. ${c}`,
      spanSize: 999
    };
  }

  if (tv > fv) {
    return {
      book: b,
      chapter: c,
      chapterEnd: c,
      fromVerse: fv,
      toVerse: tv,
      scopeKind: 'range',
      badge: 'Porção',
      label: `${formatReference(b, c, fv)}–${tv}`,
      shortLabel: `${fv}–${tv}`,
      spanSize: tv - fv + 1
    };
  }

  return {
    book: b,
    chapter: c,
    chapterEnd: c,
    fromVerse: fv,
    toVerse: fv,
    scopeKind: 'verse',
    badge: 'Versículo',
    label: formatReference(b, c, fv),
    shortLabel: `v. ${fv}`,
    spanSize: 1
  };
}

function entryCoversPassage(meta, book, chapter, verse) {
  if (!meta || meta.book !== book) return false;
  if (meta.chapter <= 0) return false;

  if (meta.chapterEnd > meta.chapter) {
    if (chapter < meta.chapter || chapter > meta.chapterEnd) return false;
    if (chapter > meta.chapter && chapter < meta.chapterEnd) return true;
    if (chapter === meta.chapter) return meta.fromVerse <= 0 || verse >= meta.fromVerse;
    if (chapter === meta.chapterEnd) return meta.toVerse <= 0 || verse <= meta.toVerse;
    return false;
  }

  if (meta.chapter !== chapter) return false;
  if (meta.fromVerse <= 0) return true;
  return meta.fromVerse <= verse && meta.toVerse >= verse;
}

function sortMatchedEntries(entries) {
  const kindOrder = {
    chapter: 0,
    multiChapter: 1,
    range: 2,
    verse: 3,
    bookIntro: 4
  };
  return entries.slice().sort((a, b) => {
    const ka = kindOrder[a.scopeKind] ?? 9;
    const kb = kindOrder[b.scopeKind] ?? 9;
    if (ka !== kb) return ka - kb;
    if (a.fromVerse !== b.fromVerse) return a.fromVerse - b.fromVerse;
    if (b.spanSize !== a.spanSize) return b.spanSize - a.spanSize;
    return a.toVerse - b.toVerse;
  });
}

function formatCommentaryRow(row) {
  const meta = classifyEntry(
    getRowField(row, 'book'),
    getRowField(row, 'chapter'),
    getRowField(row, 'chapterend'),
    getRowField(row, 'fromverse'),
    getRowField(row, 'toverse')
  );
  const raw = String(getRowField(row, 'data') || '');
  const parsed = formatMySwordDictionaryData(raw);

  return {
    ...meta,
    raw,
    html: parsed.html,
    footnotes: parsed.footnotes,
    hasImages: parsed.hasImages,
    isRtl: parsed.isRtl
  };
}

async function resolveCommentarySchema(modulePath) {
  if (schemaCache.has(modulePath)) {
    return schemaCache.get(modulePath);
  }

  const tablesRes = await nativeBridge.queryModule(
    modulePath,
    "SELECT name FROM sqlite_master WHERE type='table'"
  );
  const tableNames = (Array.isArray(tablesRes && tablesRes.rows) ? tablesRes.rows : [])
    .map((r) => String(getRowField(r, 'name') || ''))
    .filter(Boolean);

  const preferredTables = ['commentary', 'commentaries', 'comments', 'notes', 'biblecommentary'];
  let tableName = '';
  for (const pref of preferredTables) {
    const hit = tableNames.find((t) => t.toLowerCase() === pref);
    if (hit) {
      tableName = hit;
      break;
    }
  }
  if (!tableName) {
    tableName = tableNames.find((t) => !/^(?:details|info|sqlite_|android_metadata|books)/i.test(t)) || '';
  }
  if (!tableName) {
    throw new Error('Tabela de comentários não encontrada no módulo.');
  }

  const infoRes = await nativeBridge.queryModule(
    modulePath,
    `PRAGMA table_info(${quoteIdent(tableName)})`
  );
  const cols = (Array.isArray(infoRes && infoRes.rows) ? infoRes.rows : [])
    .map((r) => String(getRowField(r, 'name') || ''))
    .filter(Boolean);

  const pickCol = (candidates) => {
    for (const c of candidates) {
      const hit = cols.find((col) => col.toLowerCase() === c);
      if (hit) return hit;
    }
    return '';
  };

  const bookCol = pickCol(['book', 'book_number', 'bookid', 'b']);
  const chapterCol = pickCol(['chapter', 'chapterbegin', 'fromchapter', 'from_chapter', 'c']);
  const chapterEndCol = pickCol(['chapterend', 'tochapter', 'to_chapter', 'endchapter']);
  const fromVerseCol = pickCol(['fromverse', 'from_verse', 'verse', 'beginverse', 'startverse', 'v']);
  const toVerseCol = pickCol(['toverse', 'to_verse', 'endverse', 'verseend']);
  const dataCol = pickCol(['data', 'comments', 'comment', 'text', 'content', 'body', 'note']);

  if (!bookCol || !chapterCol || !fromVerseCol || !dataCol) {
    throw new Error(`Colunas de comentário não identificadas na tabela ${tableName}.`);
  }

  const schema = {
    tableName,
    qTable: quoteIdent(tableName),
    qBook: quoteIdent(bookCol),
    qChapter: quoteIdent(chapterCol),
    qChapterEnd: chapterEndCol ? quoteIdent(chapterEndCol) : '',
    qFromVerse: quoteIdent(fromVerseCol),
    qToVerse: toVerseCol ? quoteIdent(toVerseCol) : '',
    qData: quoteIdent(dataCol)
  };
  schemaCache.set(modulePath, schema);
  return schema;
}

function buildSelectCols(s, includeData = true) {
  const cols = [
    `CAST(${s.qBook} AS INTEGER) AS book`,
    `CAST(${s.qChapter} AS INTEGER) AS chapter`,
    s.qChapterEnd ? `CAST(${s.qChapterEnd} AS INTEGER) AS chapterEnd` : '0 AS chapterEnd',
    `CAST(COALESCE(${s.qFromVerse}, 0) AS INTEGER) AS fromVerse`,
    s.qToVerse ? `CAST(COALESCE(${s.qToVerse}, 0) AS INTEGER) AS toVerse` : '0 AS toVerse'
  ];
  if (includeData) {
    cols.push(`${s.qData} AS data`);
  }
  return cols.join(', ');
}

function buildPassageWhereSql(s, book, chapter, verse) {
  const b = book;
  const c = chapter;
  const v = verse;
  const fvExpr = `CAST(COALESCE(${s.qFromVerse}, 0) AS INTEGER)`;

  if (s.qChapterEnd) {
    const cStartExpr = `CAST(COALESCE(${s.qChapter}, 0) AS INTEGER)`;
    const cEndExpr = `CASE WHEN ${s.qChapterEnd} IS NULL OR CAST(${s.qChapterEnd} AS INTEGER) <= 0 OR CAST(${s.qChapterEnd} AS INTEGER) < ${cStartExpr} THEN ${cStartExpr} ELSE CAST(${s.qChapterEnd} AS INTEGER) END`;
    return (
      `CAST(${s.qBook} AS INTEGER) = ${b} ` +
      `AND ${cStartExpr} > 0 ` +
      `AND ${cStartExpr} <= ${c} ` +
      `AND ${cEndExpr} >= ${c}`
    );
  }

  if (s.qToVerse) {
    const tvExpr = `CASE WHEN ${s.qToVerse} IS NULL OR CAST(${s.qToVerse} AS INTEGER) <= 0 OR CAST(${s.qToVerse} AS INTEGER) < ${fvExpr} THEN ${fvExpr} ELSE CAST(${s.qToVerse} AS INTEGER) END`;
    return (
      `CAST(${s.qBook} AS INTEGER) = ${b} ` +
      `AND CAST(${s.qChapter} AS INTEGER) = ${c} ` +
      `AND (${fvExpr} <= 0 OR (${fvExpr} <= ${v} AND ${tvExpr} >= ${v}))`
    );
  }

  return (
    `CAST(${s.qBook} AS INTEGER) = ${b} ` +
    `AND CAST(${s.qChapter} AS INTEGER) = ${c} ` +
    `AND (${fvExpr} <= 0 OR ${fvExpr} = ${v})`
  );
}

export const myswordCommentaryAdapter = {
  formatId: 'mysword_cmt',
  resourceKind: 'commentary',
  label: 'Comentário Bíblico MySword (.cmt.mybible)',
  extensions: ['.cmt.mybible'],

  clearCache(modulePath) {
    if (modulePath) {
      schemaCache.delete(modulePath);
    } else {
      schemaCache.clear();
    }
  },

  async getAvailableBooks(modulePath) {
    const s = await resolveCommentarySchema(modulePath);
    const res = await nativeBridge.queryModule(
      modulePath,
      `SELECT DISTINCT CAST(${s.qBook} AS INTEGER) AS book FROM ${s.qTable} ` +
        `WHERE CAST(${s.qBook} AS INTEGER) > 0 ORDER BY book ASC`
    );
    return (Array.isArray(res && res.rows) ? res.rows : [])
      .map((r) => toInt(getRowField(r, 'book'), 0))
      .filter((b) => b > 0);
  },

  async getChaptersForBook(modulePath, book) {
    const s = await resolveCommentarySchema(modulePath);
    const b = Math.max(1, toInt(book, 1));
    const res = await nativeBridge.queryModule(
      modulePath,
      `SELECT DISTINCT CAST(${s.qChapter} AS INTEGER) AS chapter FROM ${s.qTable} ` +
        `WHERE CAST(${s.qBook} AS INTEGER) = ${b} AND CAST(${s.qChapter} AS INTEGER) > 0 ` +
        `ORDER BY chapter ASC`
    );
    return (Array.isArray(res && res.rows) ? res.rows : [])
      .map((r) => toInt(getRowField(r, 'chapter'), 0))
      .filter((c) => c > 0);
  },

  // Retorna todos os comentários que cobrem a passagem ativa (capítulo, porção de versículos e versículo exato)
  async getEntriesForPassage(modulePath, book, chapter, verse = 1) {
    const s = await resolveCommentarySchema(modulePath);
    const p = normalizePassage(book, chapter, verse);
    if (p.chapter <= 0) {
      const intro = await this.getBookIntro(modulePath, p.book);
      return intro ? [intro] : [];
    }

    const whereSql = buildPassageWhereSql(s, p.book, p.chapter, p.verse);
    const res = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${buildSelectCols(s, true)} FROM ${s.qTable} ` +
        `WHERE ${whereSql} ` +
        `ORDER BY CAST(COALESCE(${s.qFromVerse}, 0) AS INTEGER) ASC LIMIT 40`
    );

    const rows = Array.isArray(res && res.rows) ? res.rows : [];
    const matched = [];

    for (const row of rows) {
      const formatted = formatCommentaryRow(row);
      if (!entryCoversPassage(formatted, p.book, p.chapter, p.verse)) continue;
      if (!formatted.html && !formatted.raw.trim()) continue;
      matched.push(formatted);
    }

    return sortMatchedEntries(matched);
  },

  async getBookIntro(modulePath, book) {
    const s = await resolveCommentarySchema(modulePath);
    const b = Math.max(1, toInt(book, 1));
    const res = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${buildSelectCols(s, true)} FROM ${s.qTable} ` +
        `WHERE CAST(${s.qBook} AS INTEGER) = ${b} AND CAST(COALESCE(${s.qChapter}, 0) AS INTEGER) = 0 ` +
        `LIMIT 1`
    );
    const row = res && Array.isArray(res.rows) ? res.rows[0] : null;
    if (!row) return null;
    const formatted = formatCommentaryRow(row);
    return formatted.html || formatted.raw.trim() ? formatted : null;
  },

  async hasBookIntro(modulePath, book) {
    const s = await resolveCommentarySchema(modulePath);
    const b = Math.max(1, toInt(book, 1));
    const res = await nativeBridge.queryModule(
      modulePath,
      `SELECT 1 AS ok FROM ${s.qTable} ` +
        `WHERE CAST(${s.qBook} AS INTEGER) = ${b} AND CAST(COALESCE(${s.qChapter}, 0) AS INTEGER) = 0 ` +
        `LIMIT 1`
    );
    return Boolean(res && Array.isArray(res.rows) && res.rows.length > 0);
  },

  // Lista leve (sem ler Data) de todas as seções/versículos comentados no capítulo ativo
  async getChapterSections(modulePath, book, chapter) {
    const s = await resolveCommentarySchema(modulePath);
    const p = normalizePassage(book, chapter, 1);
    if (p.chapter <= 0) return [];

    const chapterFilter = s.qChapterEnd
      ? `CAST(${s.qChapter} AS INTEGER) <= ${p.chapter} AND CASE WHEN ${s.qChapterEnd} IS NULL OR CAST(${s.qChapterEnd} AS INTEGER) <= 0 THEN CAST(${s.qChapter} AS INTEGER) ELSE CAST(${s.qChapterEnd} AS INTEGER) END >= ${p.chapter}`
      : `CAST(${s.qChapter} AS INTEGER) = ${p.chapter}`;

    const res = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${buildSelectCols(s, false)} FROM ${s.qTable} ` +
        `WHERE CAST(${s.qBook} AS INTEGER) = ${p.book} AND CAST(${s.qChapter} AS INTEGER) > 0 AND (${chapterFilter}) ` +
        `ORDER BY CAST(COALESCE(${s.qFromVerse}, 0) AS INTEGER) ASC LIMIT 300`
    );

    const rows = Array.isArray(res && res.rows) ? res.rows : [];
    const seen = new Set();
    const list = [];

    for (const row of rows) {
      const meta = classifyEntry(
        getRowField(row, 'book'),
        getRowField(row, 'chapter'),
        getRowField(row, 'chapterend'),
        getRowField(row, 'fromverse'),
        getRowField(row, 'toverse')
      );
      const key = `${meta.chapter}:${meta.chapterEnd}:${meta.fromVerse}:${meta.toVerse}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(meta);
    }

    return list.sort((a, b) => {
      if (a.fromVerse !== b.fromVerse) return a.fromVerse - b.fromVerse;
      return b.toVerse - a.toVerse;
    });
  },

  // Abre uma seção específica escolhida na barra de seções do capítulo
  async getSectionByRange(modulePath, book, chapter, fromVerse = 0, toVerse = 0) {
    const s = await resolveCommentarySchema(modulePath);
    const b = Math.max(1, toInt(book, 1));
    const c = Math.max(0, toInt(chapter, 1));
    const fv = Math.max(0, toInt(fromVerse, 0));
    const tv = Math.max(0, toInt(toVerse, 0));

    const tvClause = s.qToVerse && tv > 0
      ? ` AND (CAST(COALESCE(${s.qToVerse}, 0) AS INTEGER) = ${tv} OR CAST(COALESCE(${s.qToVerse}, 0) AS INTEGER) = 0)`
      : '';

    const res = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${buildSelectCols(s, true)} FROM ${s.qTable} ` +
        `WHERE CAST(${s.qBook} AS INTEGER) = ${b} ` +
        `AND CAST(COALESCE(${s.qChapter}, 0) AS INTEGER) = ${c} ` +
        `AND CAST(COALESCE(${s.qFromVerse}, 0) AS INTEGER) = ${fv}${tvClause} ` +
        `LIMIT 5`
    );
    const rows = Array.isArray(res && res.rows) ? res.rows : [];
    return rows.map(formatCommentaryRow).filter((it) => Boolean(it.html || it.raw.trim()));
  },

  // Verifica rapidamente (LIMIT 1 sem ler Data) se este comentário cobre a passagem ativa
  async hasEntryForPassage(modulePath, book, chapter, verse = 1) {
    const s = await resolveCommentarySchema(modulePath);
    const p = normalizePassage(book, chapter, verse);
    if (p.chapter <= 0) return null;

    const whereSql = buildPassageWhereSql(s, p.book, p.chapter, p.verse);
    const res = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${buildSelectCols(s, false)} FROM ${s.qTable} ` +
        `WHERE ${whereSql} ` +
        `ORDER BY CAST(COALESCE(${s.qFromVerse}, 0) AS INTEGER) DESC LIMIT 6`
    );

    const rows = Array.isArray(res && res.rows) ? res.rows : [];
    for (const row of rows) {
      const meta = classifyEntry(
        getRowField(row, 'book'),
        getRowField(row, 'chapter'),
        getRowField(row, 'chapterend'),
        getRowField(row, 'fromverse'),
        getRowField(row, 'toverse')
      );
      if (entryCoversPassage(meta, p.book, p.chapter, p.verse)) {
        return meta;
      }
    }
    return null;
  },

  // Navega para a seção anterior ou seguinte dentro do comentário (pulando versículos vazios)
  async getAdjacentSection(modulePath, book, chapter, fromVerse = 0, direction = 1) {
    const s = await resolveCommentarySchema(modulePath);
    const b = Math.max(1, toInt(book, 1));
    const c = Math.max(0, toInt(chapter, 1));
    const fv = Math.max(0, toInt(fromVerse, 0));
    const isNext = Number(direction) >= 0;

    const bExpr = `CAST(${s.qBook} AS INTEGER)`;
    const cExpr = `CAST(COALESCE(${s.qChapter}, 0) AS INTEGER)`;
    const fvExpr = `CAST(COALESCE(${s.qFromVerse}, 0) AS INTEGER)`;

    const cmpSql = isNext
      ? `(${bExpr} > ${b} OR (${bExpr} = ${b} AND (${cExpr} > ${c} OR (${cExpr} = ${c} AND ${fvExpr} > ${fv}))))`
      : `(${bExpr} < ${b} OR (${bExpr} = ${b} AND (${cExpr} < ${c} OR (${cExpr} = ${c} AND ${fvExpr} < ${fv}))))`;

    const orderDir = isNext ? 'ASC' : 'DESC';

    const res = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${buildSelectCols(s, false)} FROM ${s.qTable} ` +
        `WHERE ${bExpr} > 0 AND ${cExpr} > 0 AND ${cmpSql} ` +
        `ORDER BY ${bExpr} ${orderDir}, ${cExpr} ${orderDir}, ${fvExpr} ${orderDir} LIMIT 1`
    );

    const row = res && Array.isArray(res.rows) ? res.rows[0] : null;
    if (!row) return null;

    return classifyEntry(
      getRowField(row, 'book'),
      getRowField(row, 'chapter'),
      getRowField(row, 'chapterend'),
      getRowField(row, 'fromverse'),
      getRowField(row, 'toverse')
    );
  }
};

export function clearCommentaryLookupCache() {
  passagePresenceCache.clear();
}

function buildPresenceCacheKey(commentaries, book, chapter, verse) {
  const sig = (Array.isArray(commentaries) ? commentaries : [])
    .map((m) => m.path)
    .sort()
    .join('|');
  return `${book}:${chapter}:${verse}::${sig}`;
}

function sortPresenceMatches(list, origOrderMap) {
  const kindPri = { verse: 0, range: 1, chapter: 2, multiChapter: 3, bookIntro: 4 };
  return list.slice().sort((a, b) => {
    const favDiff = Number(Boolean(b.module && b.module.isFavorite)) - Number(Boolean(a.module && a.module.isFavorite));
    if (favDiff !== 0) return favDiff;

    const pa = kindPri[a.scopeKind] ?? 9;
    const pb = kindPri[b.scopeKind] ?? 9;
    if (pa !== pb) return pa - pb;

    return (origOrderMap.get(a.module.path) ?? 999999) - (origOrderMap.get(b.module.path) ?? 999999);
  });
}

function storePresenceCache(commentaries, book, chapter, verse, finalSorted) {
  const key = buildPresenceCacheKey(commentaries, book, chapter, verse);
  if (passagePresenceCache.size >= PRESENCE_CACHE_LIMIT) {
    const oldestKey = passagePresenceCache.keys().next().value;
    if (oldestKey !== undefined) passagePresenceCache.delete(oldestKey);
  }
  passagePresenceCache.set(
    key,
    finalSorted.map((it) => ({
      path: it.module.path,
      scopeKind: it.scopeKind,
      badge: it.badge,
      shortLabel: it.shortLabel,
      label: it.label
    }))
  );
}

function hydrateNativeCoverageMatches(commentaries, rawMatches) {
  const list = Array.isArray(commentaries) ? commentaries : [];
  const rows = Array.isArray(rawMatches) ? rawMatches : [];
  if (!list.length || !rows.length) return [];

  const byPath = new Map(list.map((m) => [m.path, m]));
  const origOrder = new Map(list.map((m, idx) => [m.path, idx]));
  const hydrated = [];

  for (const item of rows) {
    const mod = byPath.get(item && item.path);
    if (!mod) continue;
    const meta = classifyEntry(
      item.book,
      item.chapter,
      item.chapterEnd,
      item.fromVerse,
      item.toVerse
    );
    hydrated.push({
      module: mod,
      scopeKind: meta.scopeKind,
      badge: meta.badge,
      shortLabel: meta.shortLabel,
      label: meta.label
    });
  }

  return sortPresenceMatches(hydrated, origOrder);
}

function sleepAbortable(ms, signal) {
  return new Promise((resolve) => {
    if (signal && signal.aborted) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      resolve();
    };
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export function getCachedCommentariesForPassage(commentaries, book, chapter, verse = 1) {
  const list = Array.isArray(commentaries) ? commentaries : [];
  if (!list.length) return [];
  const p = normalizePassage(book, chapter, verse);
  const key = buildPresenceCacheKey(list, p.book, p.chapter, p.verse);
  if (!passagePresenceCache.has(key)) return null;

  const cached = passagePresenceCache.get(key);
  const byPath = new Map(list.map((m) => [m.path, m]));
  const origOrder = new Map(list.map((m, idx) => [m.path, idx]));

  const hydrated = cached
    .map((item) => {
      const fresh = byPath.get(item.path);
      if (!fresh) return null;
      return {
        module: fresh,
        scopeKind: item.scopeKind,
        badge: item.badge,
        shortLabel: item.shortLabel,
        label: item.label
      };
    })
    .filter(Boolean);

  return sortPresenceMatches(hydrated, origOrder);
}

/**
 * Consulta instantânea (~1-5ms) no índice global SQLite nativo (CommentaryIndexDb).
 * Se o índice já estiver pronto, grava no cache em memória e devolve a lista completa.
 */
export async function queryNativeCommentariesForPassage(commentaries, book, chapter, verse = 1) {
  const list = Array.isArray(commentaries) ? commentaries : [];
  if (!list.length) {
    return { supported: true, ready: true, indexing: false, indexedCount: 0, totalCount: 0, matches: [] };
  }
  if (!nativeBridge.isNative() || typeof nativeBridge.queryCommentaryCoverage !== 'function') {
    return { supported: false, ready: false, indexing: false, indexedCount: 0, totalCount: list.length, matches: [] };
  }

  const p = normalizePassage(book, chapter, verse);
  if (p.chapter <= 0) {
    return { supported: true, ready: true, indexing: false, indexedCount: list.length, totalCount: list.length, matches: [] };
  }

  try {
    const res = await nativeBridge.queryCommentaryCoverage(p.book, p.chapter, p.verse);
    if (!res || !Array.isArray(res.matches)) {
      return { supported: false, ready: false, indexing: false, indexedCount: 0, totalCount: list.length, matches: [] };
    }

    const hydrated = hydrateNativeCoverageMatches(list, res.matches);
    const totalCount = Number(res.totalCount) || list.length;
    const indexedCount = res.ready ? totalCount : Math.min(totalCount, Number(res.indexedCount) || 0);

    if (res.ready) {
      storePresenceCache(list, p.book, p.chapter, p.verse, hydrated);
    }

    return {
      supported: true,
      ready: Boolean(res.ready),
      indexing: Boolean(res.indexing),
      indexedCount,
      totalCount,
      matches: hydrated
    };
  } catch (err) {
    appLogger.warn('CMT_INDEX', 'Índice nativo indisponível; usando varredura de contingência', err);
    return { supported: false, ready: false, indexing: false, indexedCount: 0, totalCount: list.length, matches: [] };
  }
}

async function runWithConcurrency(items, concurrency, workerFn, signal) {
  const limit = Math.max(1, Math.min(Number(concurrency) || 4, items.length || 1));
  let cursor = 0;

  async function next() {
    while (cursor < items.length) {
      if (signal && signal.aborted) return;
      const idx = cursor++;
      await workerFn(items[idx], idx);
    }
  }

  const workers = [];
  for (let i = 0; i < limit; i++) {
    workers.push(next());
  }
  await Promise.all(workers);
}

export async function findCommentariesForPassage(commentaries, book, chapter, verse = 1, options = {}) {
  const list = Array.isArray(commentaries) ? commentaries : [];
  if (!list.length) return [];

  const p = normalizePassage(book, chapter, verse);
  const signal = options.signal || null;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  const cached = getCachedCommentariesForPassage(list, p.book, p.chapter, p.verse);
  if (cached) {
    if (onProgress && (!signal || !signal.aborted)) {
      onProgress(list.length, list.length, cached);
    }
    return cached;
  }

  // 1. Caminho principal: índice nativo único (instantâneo quando pronto; acompanha a indexação única na 1ª vez)
  const nativeFirst = await queryNativeCommentariesForPassage(list, p.book, p.chapter, p.verse);
  if (signal && signal.aborted) return [];

  if (nativeFirst.supported) {
    if (nativeFirst.ready) {
      if (onProgress) {
        onProgress(nativeFirst.totalCount, nativeFirst.totalCount, nativeFirst.matches);
      }
      return nativeFirst.matches;
    }

    if (onProgress) {
      onProgress(nativeFirst.indexedCount, nativeFirst.totalCount, nativeFirst.matches);
    }

    if (!nativeFirst.indexing && typeof nativeBridge.syncCommentaryIndex === 'function') {
      nativeBridge.syncCommentaryIndex().catch(() => {});
    }

    let latest = nativeFirst;
    for (let attempt = 0; attempt < 260; attempt++) {
      await sleepAbortable(220, signal);
      if (signal && signal.aborted) return [];

      const poll = await queryNativeCommentariesForPassage(list, p.book, p.chapter, p.verse);
      if (signal && signal.aborted) return [];
      if (!poll.supported) break;

      latest = poll;
      if (onProgress) {
        onProgress(poll.indexedCount, poll.totalCount, poll.matches);
      }
      if (poll.ready) {
        return poll.matches;
      }
      if (!poll.indexing && attempt >= 4) {
        break;
      }
    }

    if (latest.ready) {
      return latest.matches;
    }
  }

  // 2. Fallback para navegador Web ou builds sem o índice nativo compilado
  const origOrder = new Map(list.map((m, idx) => [m.path, idx]));
  const prioritized = list.slice().sort((a, b) => {
    const aAct = a.path === options.activePath ? 1 : 0;
    const bAct = b.path === options.activePath ? 1 : 0;
    if (bAct !== aAct) return bAct - aAct;
    return Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite));
  });

  const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 4, 4));
  const matches = [];
  let scanned = 0;
  let errorCount = 0;
  let firstError = null;

  await runWithConcurrency(
    prioritized,
    concurrency,
    async (mod) => {
      if (signal && signal.aborted) return;
      let added = false;
      try {
        const hit = await myswordCommentaryAdapter.hasEntryForPassage(mod.path, p.book, p.chapter, p.verse);
        if (hit && (!signal || !signal.aborted)) {
          matches.push({
            module: mod,
            scopeKind: hit.scopeKind,
            badge: hit.badge,
            shortLabel: hit.shortLabel,
            label: hit.label
          });
          added = true;
        }
      } catch (err) {
        errorCount++;
        if (!firstError) {
          firstError = {
            module: mod.fileName || mod.abbr || mod.path,
            message: err && err.message ? err.message : String(err)
          };
        }
      } finally {
        scanned++;
        if (onProgress && (!signal || !signal.aborted)) {
          if (added || scanned === prioritized.length || scanned % 6 === 0) {
            onProgress(scanned, prioritized.length, sortPresenceMatches(matches, origOrder));
          }
        }
      }
    },
    signal
  );

  if (signal && signal.aborted) return [];

  if (errorCount > 0) {
    appLogger.warn(
      'CMT_FILTER',
      `${errorCount} de ${prioritized.length} comentário(s) falharam ao verificar ${formatReference(p.book, p.chapter, p.verse)}`,
      { firstError }
    );
  }

  const finalSorted = sortPresenceMatches(matches, origOrder);

  if (errorCount < prioritized.length) {
    storePresenceCache(list, p.book, p.chapter, p.verse, finalSorted);
  }

  return finalSorted;
}
