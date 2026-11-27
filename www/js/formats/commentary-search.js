import { nativeBridge } from '../bridge/native-bridge.js';
import { getBookName, formatReference } from '../core/canon.js';
import { appLogger } from '../core/logger.js';
import { BIBLE_SCOPE_GROUPS } from './bible-search.js';

const cmtSchemaCache = new Map();

export const CMT_TARGET_FIELDS = Object.freeze([
  { id: 'text', label: 'Texto do comentário' },
  { id: 'strong', label: 'Strong (H/G)' },
  { id: 'refs', label: 'Referências bíblicas' },
  { id: 'notes', label: 'Notas e títulos' },
  { id: 'all', label: 'Todos os dados (bruto)' }
]);

export const CMT_BLOCK_FILTERS = Object.freeze({
  all: { id: 'all', label: 'Todos os blocos' },
  bookIntro: { id: 'bookIntro', label: 'Somente Introduções' },
  chapter: { id: 'chapter', label: 'Somente Capítulos' },
  range: { id: 'range', label: 'Somente Porções' },
  verse: { id: 'verse', label: 'Somente Versículos' }
});

export const CMT_SEARCH_TYPES = Object.freeze({
  standard: { id: 'standard', label: 'Padrão', matchMode: 'contains', logic: 'and' },
  exactWord: { id: 'exactWord', label: 'Palavra exata', matchMode: 'exact', logic: 'and' },
  startsWith: { id: 'startsWith', label: 'Começa com', matchMode: 'startsWith', logic: 'and' },
  phrase: { id: 'phrase', label: 'Frase exata', matchMode: 'contains', logic: 'phrase' },
  anyWord: { id: 'anyWord', label: 'Qualquer palavra (OU)', matchMode: 'contains', logic: 'or' }
});

export const DEFAULT_CMT_SEARCH_OPTIONS = Object.freeze({
  searchType: 'standard',
  matchMode: 'contains',
  logic: 'and',
  blockFilter: 'all',    // 'all' | 'bookIntro' | 'chapter' | 'range' | 'verse'
  targetField: 'text',   // 'text' | 'strong' | 'refs' | 'notes' | 'all'
  scope: 'all',          // chaves de BIBLE_SCOPE_GROUPS
  fromBook: 1,
  toBook: 66,
  limit: 1000,
  accentSensitive: false,
  caseSensitive: false,
  useRegex: false,
  favoritesOnly: false
});

export function normalizeCmtSearchOptions(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};

  const searchType = Object.prototype.hasOwnProperty.call(CMT_SEARCH_TYPES, src.searchType)
    ? src.searchType
    : 'standard';
  const preset = CMT_SEARCH_TYPES[searchType];

  const blockFilter = Object.prototype.hasOwnProperty.call(CMT_BLOCK_FILTERS, src.blockFilter)
    ? src.blockFilter
    : 'all';

  const validTargets = new Set(CMT_TARGET_FIELDS.map((t) => t.id));
  const targetField = validTargets.has(src.targetField) ? src.targetField : 'text';

  const scope = Object.prototype.hasOwnProperty.call(BIBLE_SCOPE_GROUPS, src.scope)
    ? src.scope
    : 'all';

  const rawFrom = Math.trunc(Number(src.fromBook));
  const rawTo = Math.trunc(Number(src.toBook));
  const fromBook = Number.isFinite(rawFrom) && rawFrom >= 1 && rawFrom <= 66 ? rawFrom : 1;
  const toBook = Number.isFinite(rawTo) && rawTo >= 1 && rawTo <= 66 ? rawTo : 66;

  const rawLimit = Math.trunc(Number(src.limit));
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1
    ? Math.min(rawLimit, 20000)
    : 1000;

  return {
    searchType,
    matchMode: preset.matchMode,
    logic: preset.logic,
    blockFilter,
    targetField,
    scope,
    fromBook,
    toBook,
    limit,
    accentSensitive: Boolean(src.accentSensitive),
    caseSensitive: Boolean(src.caseSensitive),
    useRegex: Boolean(src.useRegex),
    favoritesOnly: Boolean(src.favoritesOnly)
  };
}

const NAMED_ENTITIES = {
  nbsp: ' ', middot: '·', mdash: '—', ndash: '–', hellip: '…',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', laquo: '«', raquo: '»',
  aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å',
  Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Euml: 'Ë',
  iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
  Iacute: 'Í', Igrave: 'Ì', Icirc: 'Î', Iuml: 'Ï',
  oacute: 'ó', ograve: 'ò', ocirc: 'ô', otilde: 'õ', ouml: 'ö',
  Oacute: 'Ó', Ograve: 'Ò', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö',
  uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
  Uacute: 'Ú', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü',
  ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ', Ntilde: 'Ñ',
  yacute: 'ý', Yacute: 'Ý', yuml: 'ÿ', szlig: 'ß'
};

const LATIN_VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);
const LATIN_VOWEL_VARIANTS = {
  a: ['a', 'á', 'à', 'â', 'ã', 'Á', 'À', 'Â', 'Ã'],
  e: ['e', 'é', 'ê', 'É', 'Ê'],
  i: ['i', 'í', 'Í'],
  o: ['o', 'ó', 'ô', 'õ', 'Ó', 'Ô', 'Õ'],
  u: ['u', 'ú', 'ü', 'Ú']
};
const GREEK_VOWEL_BASE = new Set(['α', 'ε', 'η', 'ι', 'ο', 'υ', 'ω', 'ρ']);

const RE_COMBINING_MARKS = /[\u0300-\u036f\u0591-\u05C7\u0730-\u074A\u064B-\u065F\u0670]/g;
const RE_IS_COMBINING_MARK = /[\u0300-\u036f\u0591-\u05C7\u0730-\u074A\u064B-\u065F\u0670]/;
const RE_RTL_SCRIPT = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F]/;
const RE_STRONG_CODE = /^([GH])\s*0*(\d+)([a-z]?)$/i;
const RE_REGEX_META = /[.*+?^${}()|[\]\\]/;

function quoteIdent(name) {
  return `"${String(name || '').replace(/"/g, '""')}"`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeLikeChar(ch) {
  if (ch === '%' || ch === '_' || ch === '\\') return `\\${ch}`;
  return ch;
}

function escapeLikeStr(str) {
  return String(str || '').replace(/[\\%_]/g, '\\$&');
}

function buildLikeClause(colSql, needsEscape) {
  const esc = needsEscape ? " ESCAPE '\\'" : '';
  return `${colSql} LIKE ?${esc} COLLATE NOCASE`;
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

function decodeEntities(str) {
  return String(str || '')
    .replace(/&#(\d+);/g, (m, dec) => {
      const code = Number(dec);
      if (code === 39) return "'";
      if (!Number.isFinite(code) || code < 32 || code > 0x10FFFF) return m;
      try { return String.fromCodePoint(code); } catch (e) { return m; }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => {
      const code = parseInt(hex, 16);
      if (code === 0x27) return "'";
      if (!Number.isFinite(code) || code < 32 || code > 0x10FFFF) return m;
      try { return String.fromCodePoint(code); } catch (e) { return m; }
    })
    .replace(/&(?:amp;)?([a-zA-Z]+);/g, (m, name) => {
      if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)) return NAMED_ENTITIES[name];
      const lower = name.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower)) return NAMED_ENTITIES[lower];
      return m;
    });
}

function stripTagsPlain(str) {
  return decodeEntities(String(str || ''))
    .replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(?:p|div|br|li|tr|td|th|h[1-6]|CM|CL|CI|PI\d?|PF\d?)[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStrongCode(raw) {
  const m = RE_STRONG_CODE.exec(String(raw || '').trim());
  if (!m) return '';
  return `${m[1].toUpperCase()}${Number(m[2])}${(m[3] || '').toLowerCase()}`;
}

function buildStrongLikePatterns(rawCode) {
  const m = RE_STRONG_CODE.exec(String(rawCode || '').trim());
  if (!m) return [];
  const prefix = m[1].toUpperCase();
  const num = String(Number(m[2]));
  const suffix = m[3] || '';
  const set = new Set([`${prefix}${num}${suffix}`]);
  if (num.length < 4) set.add(`${prefix}${num.padStart(4, '0')}${suffix}`);
  if (num.length < 5) set.add(`${prefix}${num.padStart(5, '0')}${suffix}`);
  return Array.from(set);
}

function classifyBlock(book, chapter, chapterEnd, fromVerse, toVerse) {
  const b = toInt(book, 1);
  const c = toInt(chapter, 0);
  const cEnd = toInt(chapterEnd, 0) > c ? toInt(chapterEnd, 0) : c;
  const fv = Math.max(0, toInt(fromVerse, 0));
  const rawTv = Math.max(0, toInt(toVerse, 0));
  const tv = fv > 0 ? (rawTv >= fv ? rawTv : fv) : 0;
  const bookName = getBookName(b);

  if (c <= 0) {
    return {
      book: b, chapter: 0, chapterEnd: 0, fromVerse: 0, toVerse: 0,
      scopeKind: 'bookIntro', badge: 'Introdução', refLabel: `Introdução — ${bookName}`, bookName
    };
  }
  if (cEnd > c) {
    const startPart = fv > 0 ? `${c}:${fv}` : `${c}`;
    const endPart = rawTv > 0 ? `${cEnd}:${rawTv}` : `${cEnd}`;
    return {
      book: b, chapter: c, chapterEnd: cEnd, fromVerse: fv, toVerse: rawTv,
      scopeKind: 'chapter', badge: 'Capítulos', refLabel: `${bookName} ${startPart}–${endPart}`, bookName
    };
  }
  if (fv <= 0) {
    return {
      book: b, chapter: c, chapterEnd: c, fromVerse: 0, toVerse: 0,
      scopeKind: 'chapter', badge: 'Capítulo', refLabel: `${bookName} ${c}`, bookName
    };
  }
  if (tv > fv) {
    return {
      book: b, chapter: c, chapterEnd: c, fromVerse: fv, toVerse: tv,
      scopeKind: 'range', badge: 'Porção', refLabel: `${formatReference(b, c, fv)}–${tv}`, bookName
    };
  }
  return {
    book: b, chapter: c, chapterEnd: c, fromVerse: fv, toVerse: fv,
    scopeKind: 'verse', badge: 'Versículo', refLabel: formatReference(b, c, fv), bookName
  };
}

function foldChar(ch, opts) {
  let piece = ch;
  if (!opts.accentSensitive) {
    piece = piece.normalize('NFD').replace(RE_COMBINING_MARKS, '');
  }
  if (!opts.caseSensitive) {
    piece = piece.toLowerCase();
  }
  if (!opts.caseSensitive || !opts.accentSensitive) {
    piece = piece.replace(/ς/g, 'σ');
  }
  return piece;
}

function foldString(str, opts) {
  let out = String(str || '').normalize('NFC');
  if (!opts.accentSensitive) {
    out = out.normalize('NFD').replace(RE_COMBINING_MARKS, '').normalize('NFC');
  }
  if (!opts.caseSensitive) {
    out = out.toLowerCase();
  }
  if (!opts.caseSensitive || !opts.accentSensitive) {
    out = out.replace(/ς/g, 'σ');
  }
  return out;
}

function parseCmtQuery(rawQuery, opts) {
  const input = String(rawQuery || '').trim();
  if (!input) {
    return { raw: '', include: [], exclude: [], autoStrong: false, effectiveTarget: opts.targetField, regexLiteralOnly: false };
  }

  if (opts.useRegex) {
    const isSimpleStrong = RE_STRONG_CODE.test(input);
    const autoStrong = isSimpleStrong && opts.targetField === 'text';
    return {
      raw: input,
      include: [input],
      exclude: [],
      autoStrong,
      effectiveTarget: autoStrong ? 'strong' : opts.targetField,
      regexLiteralOnly: !RE_REGEX_META.test(input)
    };
  }

  if (opts.logic === 'phrase') {
    const cleanPhrase = input.replace(/^["“”]+|["“”]+$/g, '').trim();
    const isStrong = Boolean(cleanPhrase && RE_STRONG_CODE.test(cleanPhrase));
    const autoStrong = isStrong && opts.targetField === 'text';
    return {
      raw: input,
      include: cleanPhrase ? [cleanPhrase] : [],
      exclude: [],
      autoStrong,
      effectiveTarget: autoStrong ? 'strong' : opts.targetField,
      regexLiteralOnly: false
    };
  }

  const include = [];
  const exclude = [];
  const tokenRe = /([-!])?(?:"([^"]+)"|'([^']+)'|(\S+))/g;
  let m;

  while ((m = tokenRe.exec(input)) !== null) {
    const neg = Boolean(m[1]);
    const val = String(m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (!val) continue;
    if (!neg && /^(?:AND|E|OR|OU|\|)$/i.test(val) && include.length > 0) continue;

    if (neg) {
      if (!exclude.includes(val)) exclude.push(val);
    } else if (!include.includes(val)) {
      include.push(val);
    }
  }

  const allStrong = include.length > 0 && include.every((t) => RE_STRONG_CODE.test(t));
  const autoStrong = allStrong && opts.targetField === 'text';

  return {
    raw: input,
    include,
    exclude,
    autoStrong,
    effectiveTarget: autoStrong ? 'strong' : opts.targetField,
    regexLiteralOnly: false
  };
}

function buildSqlPatternsForToken(rawToken, effectiveTarget, opts) {
  const token = String(rawToken || '').normalize('NFC').trim();
  if (!token) return { patterns: [], needsEscape: false };

  if (effectiveTarget === 'strong' && RE_STRONG_CODE.test(token)) {
    return { patterns: buildStrongLikePatterns(token), needsEscape: false };
  }

  const needsEscape = /[\\%_]/.test(token);

  if (opts.accentSensitive) {
    if (opts.caseSensitive) {
      return { patterns: [needsEscape ? escapeLikeStr(token) : token], needsEscape };
    }
    let pat = '';
    let hasAscii = false;
    for (const ch of token) {
      if (ch.charCodeAt(0) <= 127) {
        if (/[A-Za-z0-9]/.test(ch)) hasAscii = true;
        pat += needsEscape ? escapeLikeChar(ch) : ch;
      } else {
        pat += '_';
      }
    }
    if (hasAscii) return { patterns: [pat], needsEscape };

    const vars = [];
    const addV = (v) => {
      const safe = needsEscape ? escapeLikeStr(v) : v;
      if (safe && !vars.includes(safe)) vars.push(safe);
    };
    addV(token);
    addV(token.toLowerCase());
    addV(token.toUpperCase());
    if (token.length > 1) addV(token.charAt(0).toUpperCase() + token.slice(1).toLowerCase());
    return { patterns: vars, needsEscape };
  }

  if (/[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F]/.test(token)) {
    const stripped = token.normalize('NFD').replace(RE_COMBINING_MARKS, '').trim();
    const chars = Array.from(stripped).filter((c) => !/\s/.test(c));
    if (!chars.length) return { patterns: [], needsEscape: false };
    return { patterns: [chars.slice(0, 8).map((c) => (needsEscape ? escapeLikeChar(c) : c)).join('%')], needsEscape };
  }

  if (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(token)) {
    const stripped = token.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const chars = Array.from(stripped);
    let solid = 0;
    let pat = '';
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (i === 0 || GREEK_VOWEL_BASE.has(ch) || ch === 'σ' || ch === 'ς') {
        pat += '_';
      } else if (/[\u0370-\u03FF]/.test(ch)) {
        solid++;
        pat += ch;
      } else {
        pat += needsEscape ? escapeLikeChar(ch) : ch;
      }
    }
    return solid >= 1 ? { patterns: [pat], needsEscape } : { patterns: [], needsEscape: false };
  }

  const stripped = token.normalize('NFD').replace(RE_COMBINING_MARKS, '');
  let solidOthers = 0;
  let nonInitC = 0;
  let nCount = 0;

  for (let i = 0; i < stripped.length; i++) {
    const lower = stripped[i].toLowerCase();
    if (LATIN_VOWELS.has(lower)) continue;
    if (lower === 'c' && i > 0) { nonInitC++; continue; }
    if (lower === 'n') { nCount++; continue; }
    if (/[a-z0-9]/i.test(lower)) solidOthers++;
  }

  if (solidOthers >= 1) {
    let pat = '';
    for (let i = 0; i < stripped.length; i++) {
      const ch = stripped[i];
      const lower = ch.toLowerCase();
      if (LATIN_VOWELS.has(lower) || (lower === 'c' && i > 0) || (lower === 'n' && solidOthers >= 2)) {
        pat += '_';
      } else {
        pat += needsEscape ? escapeLikeChar(ch) : ch;
      }
    }
    return { patterns: [pat], needsEscape };
  }

  if (nonInitC === 1 && nCount === 0) {
    return {
      patterns: ['c', 'ç', 'Ç'].map((cVar) => {
        let pat = '';
        for (let i = 0; i < stripped.length; i++) {
          const ch = stripped[i];
          const lower = ch.toLowerCase();
          if (LATIN_VOWELS.has(lower)) pat += '_';
          else if (lower === 'c' && i > 0) pat += cVar;
          else pat += needsEscape ? escapeLikeChar(ch) : ch;
        }
        return pat;
      }),
      needsEscape
    };
  }

  if (nCount === 1 && nonInitC === 0) {
    return {
      patterns: ['n', 'ñ', 'Ñ'].map((nVar) => {
        let pat = '';
        for (let i = 0; i < stripped.length; i++) {
          const ch = stripped[i];
          const lower = ch.toLowerCase();
          if (LATIN_VOWELS.has(lower)) pat += '_';
          else if (lower === 'n') pat += nVar;
          else pat += needsEscape ? escapeLikeChar(ch) : ch;
        }
        return pat;
      }),
      needsEscape
    };
  }

  const vowelForms = [];
  const pushForm = (v) => {
    const safe = needsEscape ? escapeLikeStr(v) : v;
    if (safe && !vowelForms.includes(safe)) vowelForms.push(safe);
  };
  pushForm(stripped);
  for (let i = 0; i < stripped.length && vowelForms.length < 12; i++) {
    const vars = LATIN_VOWEL_VARIANTS[stripped[i].toLowerCase()];
    if (!vars) continue;
    for (const v of vars) {
      if (vowelForms.length >= 12) break;
      pushForm(stripped.slice(0, i) + v + stripped.slice(i + 1));
    }
  }
  return { patterns: vowelForms, needsEscape };
}

function buildSqlWhereForCmt(schema, parsedQuery, opts) {
  const clauses = [];
  const params = [];

  if (opts.blockFilter === 'bookIntro') {
    clauses.push(`CAST(COALESCE(${schema.qChapter}, 0) AS INTEGER) = 0`);
  } else if (opts.blockFilter === 'chapter') {
    clauses.push(`CAST(COALESCE(${schema.qChapter}, 0) AS INTEGER) > 0`);
    clauses.push(`CAST(COALESCE(${schema.qFromVerse}, 0) AS INTEGER) = 0`);
  } else if (opts.blockFilter === 'range') {
    clauses.push(`CAST(COALESCE(${schema.qChapter}, 0) AS INTEGER) > 0`);
    clauses.push(`CAST(COALESCE(${schema.qFromVerse}, 0) AS INTEGER) > 0`);
    if (schema.qToVerse) {
      clauses.push(`CAST(COALESCE(${schema.qToVerse}, 0) AS INTEGER) > CAST(COALESCE(${schema.qFromVerse}, 0) AS INTEGER)`);
    } else {
      clauses.push('1=0');
    }
  } else if (opts.blockFilter === 'verse') {
    clauses.push(`CAST(COALESCE(${schema.qChapter}, 0) AS INTEGER) > 0`);
    clauses.push(`CAST(COALESCE(${schema.qFromVerse}, 0) AS INTEGER) > 0`);
    if (schema.qToVerse) {
      clauses.push(`(CAST(COALESCE(${schema.qToVerse}, 0) AS INTEGER) = 0 OR CAST(COALESCE(${schema.qToVerse}, 0) AS INTEGER) = CAST(COALESCE(${schema.qFromVerse}, 0) AS INTEGER))`);
    }
  }

  if (!parsedQuery.include.length || (opts.useRegex && !parsedQuery.regexLiteralOnly)) {
    return { sql: clauses.length ? clauses.join(' AND ') : '1=1', params };
  }

  const tokenGroups = [];
  const tokenParams = [];

  for (const rawTok of parsedQuery.include) {
    const subWords = parsedQuery.effectiveTarget === 'strong'
      ? [rawTok]
      : rawTok.split(/\s+/).filter(Boolean);

    const subClauses = [];
    const subParams = [];

    for (const sw of subWords) {
      const { patterns, needsEscape } = buildSqlPatternsForToken(sw, parsedQuery.effectiveTarget, opts);
      if (!patterns.length) continue;

      if (patterns.length === 1) {
        subClauses.push(buildLikeClause(schema.qData, needsEscape));
        subParams.push(`%${patterns[0]}%`);
      } else {
        const orList = patterns.map(() => buildLikeClause(schema.qData, needsEscape));
        subClauses.push(`(${orList.join(' OR ')})`);
        for (const p of patterns) subParams.push(`%${p}%`);
      }
    }

    if (subClauses.length) {
      tokenGroups.push(subClauses.length === 1 ? subClauses[0] : `(${subClauses.join(' AND ')})`);
      tokenParams.push(...subParams);
    }
  }

  if (tokenGroups.length) {
    const joiner = opts.logic === 'or' ? ' OR ' : ' AND ';
    clauses.push(tokenGroups.length === 1 ? tokenGroups[0] : `(${tokenGroups.join(joiner)})`);
    params.push(...tokenParams);
  }

  return { sql: clauses.length ? clauses.join(' AND ') : '1=1', params };
}

function extractNotesAndHeadings(rawData) {
  const s = decodeEntities(String(rawData || ''));
  const parts = [];
  let m;
  const patterns = [
    /<TS\d?>([\s\S]*?)<\/?Ts\d?>/gi,
    /<RF(?:\s+[^>]*)?>([\s\S]*?)<\/?Rf>/gi,
    /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi
  ];
  for (const re of patterns) {
    while ((m = re.exec(s)) !== null) {
      const clean = stripTagsPlain(m[1]);
      if (clean) parts.push(clean);
    }
  }
  return parts.join(' • ').trim();
}

function extractBibleRefsText(rawData) {
  const s = decodeEntities(String(rawData || ''));
  const parts = [];
  let m;

  const rxRe = /<RX\s+([^<>]+)>/gi;
  while ((m = rxRe.exec(s)) !== null) {
    if (m[1]) parts.push(m[1].trim());
  }

  const aRe = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = aRe.exec(s)) !== null) {
    const href = String(m[1] || '').trim();
    if (/^(?:#?(?:b|rx|v)\b|tw:\/\/bible|bible:|#\d{1,2}[.:_-]\d{1,3})/i.test(href)) {
      const txt = stripTagsPlain(m[2]);
      if (txt) parts.push(txt);
      else parts.push(href);
    }
  }

  // Também captura referências textuais comuns caso o comentário não tenha links <a>
  if (!parts.length) {
    const plain = stripTagsPlain(s);
    const refRe = /\b(?:[123]\s*)?[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]{1,15}\.?\s+\d{1,3}:\d{1,3}(?:[-–]\d{1,3})?/g;
    while ((m = refRe.exec(plain)) !== null) {
      parts.push(m[0]);
    }
  }

  return parts.join(' · ').trim();
}

function extractStrongCodes(rawData) {
  const s = String(rawData || '');
  const codes = new Set();
  let m;
  const wTagRe = /<W([GH])([^<>]+)>/gi;
  while ((m = wTagRe.exec(s)) !== null) {
    const lang = m[1].toUpperCase();
    const body = String(m[2] || '').replace(/\uFF0B/g, '+');
    const numRe = /\b0*(\d+[a-z]?)\b/gi;
    let nm;
    while ((nm = numRe.exec(body)) !== null) {
      const norm = normalizeStrongCode(`${lang}${nm[1]}`);
      if (norm) codes.add(norm);
    }
  }
  const looseRe = /(?<![A-Za-z0-9])([GH])0*(\d{1,5}[a-z]?)(?![A-Za-z0-9])/gi;
  while ((m = looseRe.exec(s)) !== null) {
    const norm = normalizeStrongCode(`${m[1]}${m[2]}`);
    if (norm) codes.add(norm);
  }
  return Array.from(codes);
}

function testTokenInText(targetText, foldedText, rawToken, opts) {
  if (!targetText) return false;

  if (opts.useRegex) {
    try {
      const flags = opts.caseSensitive ? 'u' : 'iu';
      if (new RegExp(rawToken, flags).test(targetText)) return true;
      if (!opts.accentSensitive && foldedText && foldedText !== targetText) {
        const foldedPat = RE_REGEX_META.test(rawToken) ? rawToken : foldString(rawToken, opts);
        return new RegExp(foldedPat, flags).test(foldedText);
      }
      return false;
    } catch (err) {
      return false;
    }
  }

  const foldedToken = foldString(rawToken, opts);
  if (!foldedToken || !foldedText) return false;

  if (opts.matchMode === 'exact') {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(foldedToken)}(?![\\p{L}\\p{N}])`, 'u');
    return re.test(foldedText);
  }
  if (opts.matchMode === 'startsWith') {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(foldedToken)}`, 'u');
    return re.test(foldedText);
  }
  return foldedText.includes(foldedToken);
}

function collectHighlightRanges(displayText, tokens, opts) {
  if (!displayText || !tokens.length) return [];

  if (opts.useRegex) {
    const ranges = [];
    try {
      const re = new RegExp(tokens[0], opts.caseSensitive ? 'gu' : 'giu');
      let m;
      let guard = 0;
      while ((m = re.exec(displayText)) !== null && guard < 40) {
        guard++;
        if (m[0].length === 0) { re.lastIndex++; continue; }
        ranges.push([m.index, m.index + m[0].length]);
      }
    } catch (err) {
      return [];
    }
    if (ranges.length || opts.accentSensitive || RE_REGEX_META.test(tokens[0])) return ranges;
  }

  const normChars = [];
  const origIdxMap = [];
  for (let i = 0; i < displayText.length; i++) {
    const piece = foldChar(displayText[i], opts);
    for (let j = 0; j < piece.length; j++) {
      normChars.push(piece[j]);
      origIdxMap.push(i);
    }
  }
  const foldedJoined = normChars.join('');
  const rawRanges = [];

  for (const tok of tokens) {
    const foldedTok = foldString(tok, opts);
    if (!foldedTok) continue;

    let pattern = escapeRegExp(foldedTok);
    if (!opts.useRegex && opts.matchMode === 'exact') {
      pattern = `(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`;
    } else if (!opts.useRegex && opts.matchMode === 'startsWith') {
      pattern = `(?<![\\p{L}\\p{N}])${pattern}`;
    }

    const re = new RegExp(pattern, 'gu');
    let m;
    let guard = 0;
    while ((m = re.exec(foldedJoined)) !== null && guard < 40) {
      guard++;
      const origStart = origIdxMap[m.index] ?? 0;
      const lastNorm = Math.min(origIdxMap.length - 1, m.index + m[0].length - 1);
      let origEnd = (origIdxMap[lastNorm] ?? origStart) + 1;
      while (origEnd < displayText.length && RE_IS_COMBINING_MARK.test(displayText[origEnd])) {
        origEnd++;
      }
      rawRanges.push([origStart, origEnd]);
    }
  }

  if (!rawRanges.length) return [];
  rawRanges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [rawRanges[0]];
  for (let i = 1; i < rawRanges.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = rawRanges[i];
    if (cur[0] <= prev[1]) prev[1] = Math.max(prev[1], cur[1]);
    else merged.push(cur);
  }
  return merged;
}

function buildHighlightedSnippet(displayText, tokens, opts, maxChars = 260) {
  const ranges = collectHighlightRanges(displayText, tokens, opts);
  const hitCount = Math.max(1, ranges.length);

  let winStart = 0;
  let winEnd = displayText.length;
  if (displayText.length > maxChars) {
    if (ranges.length) {
      winStart = Math.max(0, ranges[0][0] - 65);
      winEnd = Math.min(displayText.length, winStart + maxChars);
      if (winStart > 0) {
        const sp = displayText.indexOf(' ', winStart);
        if (sp > winStart && sp < ranges[0][0]) winStart = sp + 1;
      }
    } else {
      winEnd = maxChars;
    }
  }

  const prefix = winStart > 0 ? '…' : '';
  const suffix = winEnd < displayText.length ? '…' : '';
  let html = prefix;
  let cursor = winStart;

  for (const [s, e] of ranges) {
    if (e <= winStart || s >= winEnd) continue;
    const cs = Math.max(s, winStart);
    const ce = Math.min(e, winEnd);
    if (cs > cursor) html += escapeHtml(displayText.slice(cursor, cs));
    html += `<mark class="bsearch-hit">${escapeHtml(displayText.slice(cs, ce))}</mark>`;
    cursor = ce;
  }
  if (cursor < winEnd) html += escapeHtml(displayText.slice(cursor, winEnd));
  html += suffix;

  return { html, hitCount };
}

function evaluateCmtRow(rawData, parsedQuery, opts, blockMeta) {
  const target = parsedQuery.effectiveTarget;
  const plainText = stripTagsPlain(rawData);

  if (target === 'strong') {
    const codes = extractStrongCodes(rawData);
    if (!codes.length) return null;

    const hasCode = (wantedRaw) => {
      const norm = normalizeStrongCode(wantedRaw) || wantedRaw.toUpperCase();
      if (opts.matchMode === 'contains' && !RE_STRONG_CODE.test(wantedRaw)) {
        return codes.some((c) => c.includes(norm));
      }
      return codes.includes(norm);
    };

    const incOk = opts.logic === 'or'
      ? parsedQuery.include.some(hasCode)
      : parsedQuery.include.every(hasCode);
    if (!incOk) return null;
    if (parsedQuery.exclude.length && parsedQuery.exclude.some(hasCode)) return null;

    const matchedCodes = parsedQuery.include.filter(hasCode).map((t) => normalizeStrongCode(t) || t.toUpperCase());
    const preview = plainText.length > 260 ? `${plainText.slice(0, 260)}…` : plainText;

    return {
      snippetHtml: escapeHtml(preview),
      plainText,
      matchedBadges: [blockMeta.badge, ...matchedCodes],
      hitCount: matchedCodes.length || 1,
      isRtl: RE_RTL_SCRIPT.test(plainText) && !/[A-Za-zÀ-ÿ]{10,}/.test(plainText)
    };
  }

  let targetText = '';
  let extraBadge = '';

  if (target === 'notes') {
    targetText = extractNotesAndHeadings(rawData);
    extraBadge = 'Nota/Título';
  } else if (target === 'refs') {
    targetText = extractBibleRefsText(rawData);
    extraBadge = 'Referência';
  } else if (target === 'all') {
    targetText = decodeEntities(String(rawData || ''))
      .replace(/<W([GH])([^<>]+)>/gi, ' $1$2 ')
      .replace(/<WT([^<>]+)>/gi, ' $1 ')
      .replace(/<RX\s+([^<>]+)>/gi, ' $1 ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } else {
    targetText = plainText;
  }

  if (!targetText) return null;

  const folded = foldString(targetText, opts);
  const incOk = opts.logic === 'or'
    ? parsedQuery.include.some((t) => testTokenInText(targetText, folded, t, opts))
    : parsedQuery.include.every((t) => testTokenInText(targetText, folded, t, opts));
  if (!incOk) return null;

  if (parsedQuery.exclude.length && parsedQuery.exclude.some((t) => testTokenInText(targetText, folded, t, opts))) {
    return null;
  }

  const hl = buildHighlightedSnippet(targetText, parsedQuery.include, opts, 260);
  const badges = [blockMeta.badge];
  if (extraBadge) badges.push(extraBadge);

  return {
    snippetHtml: hl.html,
    plainText: plainText || targetText,
    matchedBadges: badges,
    hitCount: hl.hitCount,
    isRtl: RE_RTL_SCRIPT.test(targetText) && !/[A-Za-zÀ-ÿ]{10,}/.test(targetText)
  };
}

async function resolveCmtSchema(modulePath) {
  if (cmtSchemaCache.has(modulePath)) {
    return cmtSchemaCache.get(modulePath);
  }

  const tablesRes = await nativeBridge.queryModule(
    modulePath,
    "SELECT name FROM sqlite_master WHERE type='table'"
  );
  const tableNames = (Array.isArray(tablesRes && tablesRes.rows) ? tablesRes.rows : [])
    .map((r) => String(getRowField(r, 'name') || ''))
    .filter(Boolean);

  const preferred = ['commentary', 'commentaries', 'comments', 'notes', 'biblecommentary'];
  let tableName = '';
  for (const pref of preferred) {
    const hit = tableNames.find((t) => t.toLowerCase() === pref);
    if (hit) { tableName = hit; break; }
  }
  if (!tableName) {
    tableName = tableNames.find((t) => !/^(?:details|info|sqlite_|android_metadata|books)/i.test(t)) || '';
  }
  if (!tableName) throw new Error('Tabela de comentários não encontrada.');

  const infoRes = await nativeBridge.queryModule(
    modulePath,
    `PRAGMA table_info(${quoteIdent(tableName)})`
  );
  const cols = (Array.isArray(infoRes && infoRes.rows) ? infoRes.rows : [])
    .map((r) => String(getRowField(r, 'name') || ''))
    .filter(Boolean);

  const pick = (cands) => {
    for (const c of cands) {
      const hit = cols.find((col) => col.toLowerCase() === c);
      if (hit) return hit;
    }
    return '';
  };

  const bookCol = pick(['book', 'book_number', 'bookid', 'b']);
  const chapterCol = pick(['chapter', 'chapterbegin', 'fromchapter', 'from_chapter', 'c']);
  const chapterEndCol = pick(['chapterend', 'tochapter', 'to_chapter', 'endchapter']);
  const fromVerseCol = pick(['fromverse', 'from_verse', 'verse', 'beginverse', 'startverse', 'v']);
  const toVerseCol = pick(['toverse', 'to_verse', 'endverse', 'verseend']);
  const dataCol = pick(['data', 'comments', 'comment', 'text', 'content', 'body', 'note']);

  if (!bookCol || !chapterCol || !fromVerseCol || !dataCol) {
    throw new Error(`Colunas de comentário não identificadas em ${tableName}.`);
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
  cmtSchemaCache.set(modulePath, schema);
  return schema;
}

function resolveScopeRanges(opts, context = {}) {
  const curBook = Number(context.currentBook) || 1;
  const curChapter = Number(context.currentChapter) || 1;

  if (opts.scope === 'currentChapter' && opts.blockFilter !== 'bookIntro') {
    return { batches: [[curBook, curBook]], fixedChapter: curChapter };
  }
  if (opts.scope === 'currentBook' || opts.scope === 'currentChapter') {
    return { batches: [[curBook, curBook]], fixedChapter: null };
  }

  let minB = 1;
  let maxB = 66;
  if (opts.scope === 'custom') {
    minB = Math.min(opts.fromBook, opts.toBook);
    maxB = Math.max(opts.fromBook, opts.toBook);
  } else {
    const grp = BIBLE_SCOPE_GROUPS[opts.scope] || BIBLE_SCOPE_GROUPS.all;
    minB = grp.minBook || 1;
    maxB = grp.maxBook || 66;
  }

  const batches = [];
  for (let start = minB; start <= maxB; start += 6) {
    batches.push([start, Math.min(maxB, start + 5)]);
  }
  return { batches, fixedChapter: null };
}

export function clearCommentarySearchCache() {
  cmtSchemaCache.clear();
}

export async function searchCommentaryModule(cmtMod, rawQuery, rawOptions = {}, context = {}) {
  if (!cmtMod || !cmtMod.path) {
    return { items: [], totalOccurrences: 0, byBook: [], byModule: [], truncated: false, effectiveTarget: 'text', searchedCount: 0 };
  }

  const opts = normalizeCmtSearchOptions(rawOptions);
  const parsedQuery = parseCmtQuery(rawQuery, opts);
  if (!parsedQuery.include.length) {
    return { items: [], totalOccurrences: 0, byBook: [], byModule: [], truncated: false, effectiveTarget: parsedQuery.effectiveTarget, searchedCount: 1 };
  }

  if (opts.useRegex) {
    try {
      new RegExp(parsedQuery.include[0], opts.caseSensitive ? 'u' : 'iu');
    } catch (err) {
      throw new Error(`Expressão regular inválida: ${err.message || err}`);
    }
  }

  const signal = context.signal || null;
  const onProgress = typeof context.onProgress === 'function' ? context.onProgress : null;
  const maxResults = context.maxResults !== undefined
    ? Math.max(1, Math.min(Math.trunc(Number(context.maxResults)), 20000))
    : opts.limit;

  const schema = await resolveCmtSchema(cmtMod.path);
  const whereObj = buildSqlWhereForCmt(schema, parsedQuery, opts);
  const scopeInfo = resolveScopeRanges(opts, context);

  const selectCols = [
    `CAST(${schema.qBook} AS INTEGER) AS book`,
    `CAST(COALESCE(${schema.qChapter}, 0) AS INTEGER) AS chapter`,
    schema.qChapterEnd ? `CAST(COALESCE(${schema.qChapterEnd}, 0) AS INTEGER) AS chapterEnd` : '0 AS chapterEnd',
    `CAST(COALESCE(${schema.qFromVerse}, 0) AS INTEGER) AS fromVerse`,
    schema.qToVerse ? `CAST(COALESCE(${schema.qToVerse}, 0) AS INTEGER) AS toVerse` : '0 AS toVerse',
    `${schema.qData} AS data`
  ].join(', ');

  const items = [];
  const bookCounts = new Map();
  let totalOccurrences = 0;
  let truncated = false;
  const PAGE_ROWS = 400;

  for (let i = 0; i < scopeInfo.batches.length; i++) {
    if (signal && signal.aborted) {
      return { items: [], totalOccurrences: 0, byBook: [], byModule: [], truncated: false, effectiveTarget: parsedQuery.effectiveTarget, searchedCount: 1 };
    }

    const [bStart, bEnd] = scopeInfo.batches[i];
    const scopeSql = scopeInfo.fixedChapter !== null
      ? `CAST(${schema.qBook} AS INTEGER) = ${bStart} AND CAST(COALESCE(${schema.qChapter}, 0) AS INTEGER) = ${scopeInfo.fixedChapter}`
      : `CAST(${schema.qBook} AS INTEGER) BETWEEN ${bStart} AND ${bEnd}`;

    let offset = 0;
    let keepReading = true;

    while (keepReading) {
      if (signal && signal.aborted) {
        return { items: [], totalOccurrences: 0, byBook: [], byModule: [], truncated: false, effectiveTarget: parsedQuery.effectiveTarget, searchedCount: 1 };
      }

      const res = await nativeBridge.queryModule(
        cmtMod.path,
        `SELECT ${selectCols} FROM ${schema.qTable} ` +
          `WHERE ${scopeSql} AND (${whereObj.sql}) ` +
          `ORDER BY CAST(${schema.qBook} AS INTEGER) ASC, CAST(COALESCE(${schema.qChapter}, 0) AS INTEGER) ASC, CAST(COALESCE(${schema.qFromVerse}, 0) AS INTEGER) ASC ` +
          `LIMIT ${PAGE_ROWS} OFFSET ${offset}`,
        whereObj.params
      );

      if (signal && signal.aborted) {
        return { items: [], totalOccurrences: 0, byBook: [], byModule: [], truncated: false, effectiveTarget: parsedQuery.effectiveTarget, searchedCount: 1 };
      }

      const rows = Array.isArray(res && res.rows) ? res.rows : [];
      if (rows.length < PAGE_ROWS) {
        keepReading = false;
      } else {
        offset += rows.length;
      }

      for (const row of rows) {
        const blockMeta = classifyBlock(
          getRowField(row, 'book'),
          getRowField(row, 'chapter'),
          getRowField(row, 'chapterend'),
          getRowField(row, 'fromverse'),
          getRowField(row, 'toverse')
        );
        if (blockMeta.book <= 0) continue;

        const rawData = String(getRowField(row, 'data') || '');
        const hit = evaluateCmtRow(rawData, parsedQuery, opts, blockMeta);
        if (!hit) continue;

        if (items.length >= maxResults) {
          truncated = true;
          keepReading = false;
          break;
        }

        totalOccurrences += hit.hitCount;
        bookCounts.set(blockMeta.book, (bookCounts.get(blockMeta.book) || 0) + 1);

        items.push({
          kind: 'commentary',
          module: cmtMod,
          book: blockMeta.book,
          chapter: blockMeta.chapter,
          chapterEnd: blockMeta.chapterEnd,
          fromVerse: blockMeta.fromVerse,
          toVerse: blockMeta.toVerse,
          verse: blockMeta.fromVerse > 0 ? blockMeta.fromVerse : 1,
          scopeKind: blockMeta.scopeKind,
          badge: blockMeta.badge,
          refLabel: blockMeta.refLabel,
          bookName: blockMeta.bookName,
          snippetHtml: hit.snippetHtml,
          plainText: hit.plainText,
          matchedBadges: hit.matchedBadges,
          hitCount: hit.hitCount,
          isRtl: hit.isRtl
        });
      }
    }

    if (onProgress && (!signal || !signal.aborted)) {
      onProgress(i + 1, scopeInfo.batches.length, items.length);
    }

    if (truncated) break;
  }

  const byBook = Array.from(bookCounts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([book, count]) => ({ book, name: getBookName(book), count }));

  return {
    items,
    totalOccurrences,
    byBook,
    byModule: items.length ? [{ path: cmtMod.path, module: cmtMod, count: items.length }] : [],
    truncated,
    effectiveTarget: parsedQuery.effectiveTarget,
    autoStrong: parsedQuery.autoStrong,
    searchedCount: 1
  };
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
  for (let i = 0; i < limit; i++) workers.push(next());
  await Promise.all(workers);
}

export async function searchAcrossCommentaries(commentaries, rawQuery, rawOptions = {}, context = {}) {
  const opts = normalizeCmtSearchOptions(rawOptions);
  const allList = Array.isArray(commentaries) ? commentaries : [];
  const targets = opts.favoritesOnly
    ? allList.filter((m) => Boolean(m && m.isFavorite))
    : allList;

  if (!targets.length) {
    return { items: [], totalOccurrences: 0, byBook: [], byModule: [], truncated: false, effectiveTarget: opts.targetField, searchedCount: 0 };
  }

  const signal = context.signal || null;
  const onProgress = typeof context.onProgress === 'function' ? context.onProgress : null;
  const maxTotal = context.maxTotal !== undefined
    ? Math.max(1, Math.min(Math.trunc(Number(context.maxTotal)), 20000))
    : Math.min(opts.limit, 2500);
  const perCmtMax = Math.max(10, Math.min(Number(context.perCmtMax) || 50, maxTotal));
  const concurrency = Math.max(1, Math.min(Number(context.concurrency) || 4, 4));

  const activePath = context.activePath || '';
  const ordered = targets.slice().sort((a, b) => {
    const aAct = a.path === activePath ? 1 : 0;
    const bAct = b.path === activePath ? 1 : 0;
    if (bAct !== aAct) return bAct - aAct;
    return Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite));
  });

  const collected = [];
  let scanned = 0;
  let errorCount = 0;
  let firstError = null;
  let effectiveTarget = opts.targetField;
  let autoStrong = false;

  await runWithConcurrency(
    ordered,
    concurrency,
    async (mod, modIdx) => {
      if (signal && signal.aborted) return;
      try {
        const res = await searchCommentaryModule(mod, rawQuery, opts, {
          currentBook: context.currentBook,
          currentChapter: context.currentChapter,
          maxResults: perCmtMax,
          signal
        });
        if (signal && signal.aborted) return;
        effectiveTarget = res.effectiveTarget || effectiveTarget;
        if (res.autoStrong) autoStrong = true;
        for (const it of res.items) {
          collected.push({ ...it, modIdx });
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
          onProgress(scanned, ordered.length, collected.length);
        }
      }
    },
    signal
  );

  if (signal && signal.aborted) {
    return { items: [], totalOccurrences: 0, byBook: [], byModule: [], truncated: false, effectiveTarget, searchedCount: scanned };
  }

  if (errorCount > 0) {
    appLogger.warn(
      'CMT_SEARCH_ALL',
      `${errorCount} de ${ordered.length} comentário(s) falharam ao buscar "${rawQuery}"`,
      { firstError, options: opts }
    );
  }

  collected.sort((a, b) => {
    if (a.book !== b.book) return a.book - b.book;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    if (a.fromVerse !== b.fromVerse) return a.fromVerse - b.fromVerse;
    return a.modIdx - b.modIdx;
  });

  const truncated = collected.length > maxTotal;
  const finalItems = truncated ? collected.slice(0, maxTotal) : collected;

  const bookCounts = new Map();
  const modCounts = new Map();
  let totalOccurrences = 0;

  for (const it of finalItems) {
    totalOccurrences += it.hitCount || 1;
    bookCounts.set(it.book, (bookCounts.get(it.book) || 0) + 1);
    const p = it.module.path;
    const prev = modCounts.get(p);
    if (prev) prev.count++;
    else modCounts.set(p, { path: p, module: it.module, count: 1 });
  }

  const byBook = Array.from(bookCounts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([book, count]) => ({ book, name: getBookName(book), count }));
  const byModule = Array.from(modCounts.values()).sort((a, b) => b.count - a.count);

  return {
    items: finalItems,
    totalOccurrences,
    byBook,
    byModule,
    truncated,
    effectiveTarget,
    autoStrong,
    searchedCount: ordered.length
  };
}
