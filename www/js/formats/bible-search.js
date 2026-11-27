import { nativeBridge } from '../bridge/native-bridge.js';
import { getBookName, formatReference } from '../core/canon.js';
import { appLogger } from '../core/logger.js';

const bibleSchemaCache = new Map();

export const BIBLE_SCOPE_GROUPS = Object.freeze({
  all: { id: 'all', label: 'Toda Bíblia', minBook: 1, maxBook: 66 },
  ot: { id: 'ot', label: 'Antigo Testamento', minBook: 1, maxBook: 39 },
  nt: { id: 'nt', label: 'Novo Testamento', minBook: 40, maxBook: 66 },
  currentBook: { id: 'currentBook', label: 'Livro atual', dynamic: true },
  currentChapter: { id: 'currentChapter', label: 'Capítulo atual', dynamic: true },
  pentateuch: { id: 'pentateuch', label: 'Pentateuco (Gn–Dt)', minBook: 1, maxBook: 5 },
  historical: { id: 'historical', label: 'Históricos (Js–Et)', minBook: 6, maxBook: 17 },
  poetic: { id: 'poetic', label: 'Poéticos (Jó–Ct)', minBook: 18, maxBook: 22 },
  majorProphets: { id: 'majorProphets', label: 'Profetas Maiores (Is–Dn)', minBook: 23, maxBook: 27 },
  minorProphets: { id: 'minorProphets', label: 'Profetas Menores (Os–Ml)', minBook: 28, maxBook: 39 },
  gospels: { id: 'gospels', label: 'Evangelhos (Mt–Jo)', minBook: 40, maxBook: 43 },
  acts: { id: 'acts', label: 'Atos', minBook: 44, maxBook: 44 },
  pauline: { id: 'pauline', label: 'Epístolas Paulinas (Rm–Fm)', minBook: 45, maxBook: 57 },
  general: { id: 'general', label: 'Epístolas Gerais (Hb–Jd)', minBook: 58, maxBook: 65 },
  revelation: { id: 'revelation', label: 'Apocalipse', minBook: 66, maxBook: 66 },
  custom: { id: 'custom', label: 'Personalizado (De / Até)', dynamic: true }
});

export const BIBLE_SEARCH_TYPES = Object.freeze({
  standard: { id: 'standard', label: 'Padrão', matchMode: 'contains', logic: 'and' },
  exactWord: { id: 'exactWord', label: 'Palavra exata', matchMode: 'exact', logic: 'and' },
  startsWith: { id: 'startsWith', label: 'Começa com', matchMode: 'startsWith', logic: 'and' },
  phrase: { id: 'phrase', label: 'Frase exata', matchMode: 'contains', logic: 'phrase' },
  anyWord: { id: 'anyWord', label: 'Qualquer palavra (OU)', matchMode: 'contains', logic: 'or' }
});

export const BIBLE_INTERVAL_TYPES = Object.freeze({
  verse: { id: 'verse', label: 'Versículo' },
  chapter: { id: 'chapter', label: 'Capítulo' },
  book: { id: 'book', label: 'Livro' }
});

export const DEFAULT_BIBLE_SEARCH_OPTIONS = Object.freeze({
  searchType: 'standard',  // 'standard' | 'exactWord' | 'startsWith' | 'phrase' | 'anyWord'
  matchMode: 'contains',   // 'contains' | 'startsWith' | 'exact'
  logic: 'and',            // 'and' | 'or' | 'phrase'
  intervalType: 'verse',   // 'verse' | 'chapter' | 'book'
  targetField: 'text',     // 'text' | 'strong' | 'morph' | 'notes' | 'redLetter' | 'all'
  scope: 'all',            // chaves de BIBLE_SCOPE_GROUPS
  fromBook: 1,
  toBook: 66,
  limit: 100000,
  accentSensitive: false,
  caseSensitive: false,
  useRegex: false,
  favoritesOnly: false
});

export function normalizeBibleSearchOptions(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};

  let searchType = Object.prototype.hasOwnProperty.call(BIBLE_SEARCH_TYPES, src.searchType)
    ? src.searchType
    : '';

  let matchMode = src.matchMode === 'exact' || src.matchMode === 'startsWith'
    ? src.matchMode
    : 'contains';
  let logic = src.logic === 'or' || src.logic === 'phrase'
    ? src.logic
    : 'and';

  if (searchType) {
    const preset = BIBLE_SEARCH_TYPES[searchType];
    matchMode = preset.matchMode;
    logic = preset.logic;
  } else {
    if (logic === 'phrase') searchType = 'phrase';
    else if (logic === 'or') searchType = 'anyWord';
    else if (matchMode === 'exact') searchType = 'exactWord';
    else if (matchMode === 'startsWith') searchType = 'startsWith';
    else searchType = 'standard';
  }

  const intervalType = Object.prototype.hasOwnProperty.call(BIBLE_INTERVAL_TYPES, src.intervalType)
    ? src.intervalType
    : 'verse';

  const validTargets = new Set(['text', 'strong', 'morph', 'notes', 'redLetter', 'all']);
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
    ? Math.min(rawLimit, 100000)
    : 100000;

  return {
    searchType,
    matchMode,
    logic,
    intervalType,
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

function decodeNumericEntities(str) {
  return String(str || '')
    .replace(/&#(\d+);/g, (m, dec) => {
      const code = Number(dec);
      if (code === 39) return "'";
      if (!Number.isFinite(code) || code < 32 || code > 0x10FFFF) return m;
      try {
        return String.fromCodePoint(code);
      } catch (err) {
        return m;
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => {
      const code = parseInt(hex, 16);
      if (code === 0x27) return "'";
      if (!Number.isFinite(code) || code < 32 || code > 0x10FFFF) return m;
      try {
        return String.fromCodePoint(code);
      } catch (err) {
        return m;
      }
    });
}

function decodeCommonEntities(str) {
  return String(str || '').replace(/&(?:amp;)?([a-zA-Z]+);/g, (m, name) => {
    if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)) {
      return NAMED_ENTITIES[name];
    }
    const lower = name.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower)) {
      return NAMED_ENTITIES[lower];
    }
    return m;
  });
}

function decodeEntities(str) {
  return decodeCommonEntities(decodeNumericEntities(str));
}

export function normalizeStrongCode(raw) {
  const m = RE_STRONG_CODE.exec(String(raw || '').trim());
  if (!m) return '';
  const prefix = m[1].toUpperCase();
  const num = String(Number(m[2]));
  const suffix = (m[3] || '').toLowerCase();
  return `${prefix}${num}${suffix}`;
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

export function parseBibleSearchQuery(rawQuery, opts) {
  const input = String(rawQuery || '').trim();
  if (!input) {
    return {
      raw: '',
      include: [],
      exclude: [],
      autoStrong: false,
      effectiveTarget: opts.targetField,
      regexLiteralOnly: false
    };
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
    const isAllStrong = Boolean(cleanPhrase && RE_STRONG_CODE.test(cleanPhrase));
    return {
      raw: input,
      include: cleanPhrase ? [cleanPhrase] : [],
      exclude: [],
      autoStrong: isAllStrong && opts.targetField === 'text',
      effectiveTarget: isAllStrong && opts.targetField === 'text' ? 'strong' : opts.targetField,
      regexLiteralOnly: false
    };
  }

  const include = [];
  const exclude = [];
  const tokenRe = /([-!])?(?:"([^"]+)"|'([^']+)'|(\S+))/g;
  let match;

  while ((match = tokenRe.exec(input)) !== null) {
    const neg = Boolean(match[1]);
    const val = String(match[2] ?? match[3] ?? match[4] ?? '').trim();
    if (!val) continue;
    if (!neg && /^(?:AND|E)$/i.test(val) && include.length > 0) continue;
    if (!neg && /^(?:OR|OU|\|)$/i.test(val) && include.length > 0) continue;

    if (neg) {
      if (!exclude.includes(val)) exclude.push(val);
    } else {
      if (!include.includes(val)) include.push(val);
    }
  }

  const allIncludeAreStrong = include.length > 0 && include.every((t) => RE_STRONG_CODE.test(t));
  const autoStrong = allIncludeAreStrong && opts.targetField === 'text';

  return {
    raw: input,
    include,
    exclude,
    autoStrong,
    effectiveTarget: autoStrong ? 'strong' : opts.targetField,
    regexLiteralOnly: false
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

function extractCleanVerseText(rawScripture) {
  let s = decodeEntities(String(rawScripture || '').replace(/\r\n/g, '\n'));
  s = s
    .replace(/<RF(?:\s+[^>]*)?>[\s\S]*?<\/?Rf>/gi, ' ')
    .replace(/<TS\d?>[\s\S]*?<\/?Ts\d?>/gi, ' ')
    .replace(/<W[GH][^<>]*>/gi, ' ')
    .replace(/<WT[^<>]*>/gi, ' ')
    .replace(/<RX\s+[^<>]*>/gi, ' ')
    .replace(/<a\b[^>]*class\s*=\s*["'][^"']*(?:strong|morph)[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, ' ')
    .replace(/<\/?(?:p|div|br|li|tr|td|th|h[1-6]|CM|CL|CI|PI\d?|PF\d?)[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');

  return s.replace(/\s+/g, ' ').trim();
}

function extractRedLetterText(rawScripture) {
  const s = decodeEntities(String(rawScripture || ''));
  const parts = [];
  const re = /<FR>([\s\S]*?)<\/?Fr>/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    const clean = extractCleanVerseText(m[1]);
    if (clean) parts.push(clean);
  }
  return parts.join(' ').trim();
}

function extractNotesAndTitlesText(rawScripture) {
  const s = decodeEntities(String(rawScripture || ''));
  const parts = [];
  let m;

  const tsRe = /<TS\d?>([\s\S]*?)<\/?Ts\d?>/gi;
  while ((m = tsRe.exec(s)) !== null) {
    const clean = extractCleanVerseText(m[1]);
    if (clean) parts.push(clean);
  }

  const rfRe = /<RF(?:\s+[^>]*)?>([\s\S]*?)<\/?Rf>/gi;
  while ((m = rfRe.exec(s)) !== null) {
    const clean = extractCleanVerseText(m[1]);
    if (clean) parts.push(clean);
  }

  return parts.join(' • ').trim();
}

function extractStrongCodes(rawScripture) {
  const s = String(rawScripture || '');
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

function extractMorphText(rawScripture) {
  const s = decodeEntities(String(rawScripture || ''));
  const parts = [];
  let m;

  const wtRe = /<WT([^<>]+)>/gi;
  while ((m = wtRe.exec(s)) !== null) {
    const val = String(m[1] || '').trim();
    if (val) parts.push(val);
  }

  const mAttrRe = /\bdata-morph\s*=\s*["']([^"']+)["']/gi;
  while ((m = mAttrRe.exec(s)) !== null) {
    if (m[1]) parts.push(m[1].trim());
  }

  const mHrefRe = /\bhref\s*=\s*["']#?m([^"']+)["']/gi;
  while ((m = mHrefRe.exec(s)) !== null) {
    if (m[1]) parts.push(m[1].trim());
  }

  return parts.join(' ').trim();
}

function extractAllRawReadableText(rawScripture) {
  const s = decodeEntities(String(rawScripture || '').replace(/\r\n/g, '\n'));
  const expanded = s
    .replace(/<W([GH])([^<>]+)>/gi, ' $1$2 ')
    .replace(/<WT([^<>]+)>/gi, ' $1 ')
    .replace(/<RX\s+([^<>]+)>/gi, ' $1 ')
    .replace(/<[^>]*>/g, ' ');
  return expanded.replace(/\s+/g, ' ').trim();
}

function buildSqlPatternsForToken(rawToken, effectiveTarget, opts) {
  const token = String(rawToken || '').normalize('NFC').trim();
  if (!token) return { patterns: [], needsEscape: false };

  if (effectiveTarget === 'strong' && RE_STRONG_CODE.test(token)) {
    return {
      patterns: buildStrongLikePatterns(token),
      needsEscape: false
    };
  }

  const needsEscape = /[\\%_]/.test(token);

  if (opts.accentSensitive) {
    if (opts.caseSensitive) {
      return {
        patterns: [needsEscape ? escapeLikeStr(token) : token],
        needsEscape
      };
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
    const sample = chars.slice(0, 8).map((c) => (needsEscape ? escapeLikeChar(c) : c));
    return { patterns: [sample.join('%')], needsEscape };
  }

  if (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(token)) {
    const stripped = token.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const chars = Array.from(stripped);
    let solidCount = 0;
    let pat = '';
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (i === 0 || GREEK_VOWEL_BASE.has(ch) || ch === 'σ' || ch === 'ς') {
        pat += '_';
      } else if (/[\u0370-\u03FF]/.test(ch)) {
        solidCount++;
        pat += ch;
      } else {
        pat += needsEscape ? escapeLikeChar(ch) : ch;
      }
    }
    if (solidCount >= 1) {
      return { patterns: [pat], needsEscape };
    }
    return { patterns: [], needsEscape: false };
  }

  const stripped = token.normalize('NFD').replace(RE_COMBINING_MARKS, '');
  let solidOthers = 0;
  let nonInitC = 0;
  let nCount = 0;

  for (let i = 0; i < stripped.length; i++) {
    const lower = stripped[i].toLowerCase();
    if (LATIN_VOWELS.has(lower)) continue;
    if (lower === 'c' && i > 0) {
      nonInitC++;
      continue;
    }
    if (lower === 'n') {
      nCount++;
      continue;
    }
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
    const parts = [];
    for (const cVar of ['c', 'ç', 'Ç']) {
      let pat = '';
      for (let i = 0; i < stripped.length; i++) {
        const ch = stripped[i];
        const lower = ch.toLowerCase();
        if (LATIN_VOWELS.has(lower)) pat += '_';
        else if (lower === 'c' && i > 0) pat += cVar;
        else pat += needsEscape ? escapeLikeChar(ch) : ch;
      }
      parts.push(pat);
    }
    return { patterns: parts, needsEscape };
  }

  if (nCount === 1 && nonInitC === 0) {
    const parts = [];
    for (const nVar of ['n', 'ñ', 'Ñ']) {
      let pat = '';
      for (let i = 0; i < stripped.length; i++) {
        const ch = stripped[i];
        const lower = ch.toLowerCase();
        if (LATIN_VOWELS.has(lower)) pat += '_';
        else if (lower === 'n') pat += nVar;
        else pat += needsEscape ? escapeLikeChar(ch) : ch;
      }
      parts.push(pat);
    }
    return { patterns: parts, needsEscape };
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

function buildSqlWhereForQuery(schema, parsedQuery, opts, useBroadIntervalOr = false) {
  const clauses = [];
  const params = [];

  if (parsedQuery.effectiveTarget === 'redLetter') {
    clauses.push(`${schema.qScripture} LIKE ? COLLATE NOCASE`);
    params.push('%<FR>%');
  } else if (parsedQuery.effectiveTarget === 'morph') {
    clauses.push(`(${schema.qScripture} LIKE ? COLLATE NOCASE OR ${schema.qScripture} LIKE ? COLLATE NOCASE)`);
    params.push('%<WT%', '%morph%');
  } else if (parsedQuery.effectiveTarget === 'notes') {
    clauses.push(`(${schema.qScripture} LIKE ? COLLATE NOCASE OR ${schema.qScripture} LIKE ? COLLATE NOCASE)`);
    params.push('%<RF%', '%<TS%');
  }

  if (!parsedQuery.include.length) {
    return {
      sql: clauses.length ? clauses.join(' AND ') : '1=1',
      params
    };
  }

  // Em modo Regex com metacaracteres, faz varredura do escopo sem pré-filtro LIKE;
  // se for texto literal sem metacaracteres, aproveita o pré-filtro LIKE para velocidade.
  if (opts.useRegex && !parsedQuery.regexLiteralOnly) {
    return {
      sql: clauses.length ? clauses.join(' AND ') : '1=1',
      params
    };
  }

  const termsToIndex = useBroadIntervalOr
    ? [...parsedQuery.include, ...parsedQuery.exclude]
    : parsedQuery.include;

  const tokenGroups = [];
  const tokenParams = [];

  for (const rawTok of termsToIndex) {
    const subWords = parsedQuery.effectiveTarget === 'strong'
      ? [rawTok]
      : rawTok.split(/\s+/).filter(Boolean);

    const subClauses = [];
    const subParams = [];

    for (const sw of subWords) {
      const { patterns, needsEscape } = buildSqlPatternsForToken(sw, parsedQuery.effectiveTarget, opts);
      if (!patterns.length) continue;

      if (patterns.length === 1) {
        subClauses.push(buildLikeClause(schema.qScripture, needsEscape));
        subParams.push(`%${patterns[0]}%`);
      } else {
        const orList = patterns.map(() => buildLikeClause(schema.qScripture, needsEscape));
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
    const joiner = (opts.logic === 'or' || useBroadIntervalOr) ? ' OR ' : ' AND ';
    clauses.push(tokenGroups.length === 1 ? tokenGroups[0] : `(${tokenGroups.join(joiner)})`);
    params.push(...tokenParams);
  }

  return {
    sql: clauses.length ? clauses.join(' AND ') : '1=1',
    params
  };
}

function testTokenAgainstText(targetText, foldedText, rawToken, opts) {
  if (!targetText) return false;

  if (opts.useRegex) {
    try {
      const flags = opts.caseSensitive ? 'u' : 'iu';
      const re = new RegExp(rawToken, flags);
      if (re.test(targetText)) return true;
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
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        ranges.push([m.index, m.index + m[0].length]);
      }
    } catch (err) {
      return [];
    }
    if (ranges.length || opts.accentSensitive) return ranges;
    // Se regex literal sem acento não casou direto no texto acentuado, cai para destaque com mapa de acentos
    if (RE_REGEX_META.test(tokens[0])) return [];
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
      while (origEnd < displayText.length && RE_COMBINING_MARKS.test(displayText[origEnd])) {
        RE_COMBINING_MARKS.lastIndex = 0;
        origEnd++;
      }
      RE_COMBINING_MARKS.lastIndex = 0;
      rawRanges.push([origStart, origEnd]);
    }
  }

  if (!rawRanges.length) return [];

  rawRanges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [rawRanges[0]];
  for (let i = 1; i < rawRanges.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = rawRanges[i];
    if (cur[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], cur[1]);
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

function buildHighlightedHtml(displayText, tokens, opts, maxChars = 280) {
  const ranges = collectHighlightRanges(displayText, tokens, opts);
  const hitCount = Math.max(1, ranges.length);

  let winStart = 0;
  let winEnd = displayText.length;

  if (displayText.length > maxChars) {
    if (ranges.length) {
      winStart = Math.max(0, ranges[0][0] - 70);
      winEnd = Math.min(displayText.length, winStart + maxChars);
      if (winStart > 0) {
        const spacePos = displayText.indexOf(' ', winStart);
        if (spacePos > winStart && spacePos < ranges[0][0]) {
          winStart = spacePos + 1;
        }
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
    if (cs > cursor) {
      html += escapeHtml(displayText.slice(cursor, cs));
    }
    html += `<mark class="bsearch-hit">${escapeHtml(displayText.slice(cs, ce))}</mark>`;
    cursor = ce;
  }

  if (cursor < winEnd) {
    html += escapeHtml(displayText.slice(cursor, winEnd));
  }
  html += suffix;

  return { html, hitCount };
}

function inspectVerseTokens(rawScripture, parsedQuery, opts) {
  const target = parsedQuery.effectiveTarget;

  if (target === 'strong') {
    const verseStrongs = extractStrongCodes(rawScripture);
    if (!verseStrongs.length) return null;

    const hasCode = (wantedRaw) => {
      const wanted = normalizeStrongCode(wantedRaw) || wantedRaw.toUpperCase();
      if (opts.matchMode === 'contains' && !RE_STRONG_CODE.test(wantedRaw)) {
        return verseStrongs.some((c) => c.includes(wanted));
      }
      return verseStrongs.includes(wanted);
    };

    const matchedIncIdx = [];
    for (let i = 0; i < parsedQuery.include.length; i++) {
      if (hasCode(parsedQuery.include[i])) matchedIncIdx.push(i);
    }
    const matchedExc = parsedQuery.exclude.some(hasCode);
    if (!matchedIncIdx.length && !matchedExc) return null;

    const matchedCodes = matchedIncIdx.map((i) => normalizeStrongCode(parsedQuery.include[i]) || parsedQuery.include[i].toUpperCase());
    const cleanText = extractCleanVerseText(rawScripture);
    const displayText = cleanText || extractAllRawReadableText(rawScripture);
    const preview = displayText.length > 260 ? `${displayText.slice(0, 260)}…` : displayText;

    return {
      matchedIncIdx,
      matchedExc,
      snippetHtml: escapeHtml(preview),
      plainText: cleanText || displayText,
      matchedBadges: matchedCodes,
      hitCount: matchedCodes.length || 1,
      isRtl: RE_RTL_SCRIPT.test(displayText) && !/[A-Za-zÀ-ÿ]{10,}/.test(displayText)
    };
  }

  let targetText = '';
  let badgeContext = '';

  if (target === 'redLetter') {
    targetText = extractRedLetterText(rawScripture);
    badgeContext = 'Palavras de Jesus';
  } else if (target === 'notes') {
    targetText = extractNotesAndTitlesText(rawScripture);
    badgeContext = 'Nota/Título';
  } else if (target === 'morph') {
    targetText = extractMorphText(rawScripture);
    badgeContext = 'Morfologia';
  } else if (target === 'all') {
    targetText = extractAllRawReadableText(rawScripture);
  } else {
    targetText = extractCleanVerseText(rawScripture);
  }

  if (!targetText) return null;

  const foldedTarget = foldString(targetText, opts);
  const matchedIncIdx = [];
  const matchedTokens = [];

  for (let i = 0; i < parsedQuery.include.length; i++) {
    const tok = parsedQuery.include[i];
    if (testTokenAgainstText(targetText, foldedTarget, tok, opts)) {
      matchedIncIdx.push(i);
      matchedTokens.push(tok);
    }
  }

  const matchedExc = parsedQuery.exclude.some((tok) =>
    testTokenAgainstText(targetText, foldedTarget, tok, opts)
  );

  if (!matchedIncIdx.length && !matchedExc) return null;

  const hl = matchedTokens.length
    ? buildHighlightedHtml(targetText, matchedTokens, opts, 280)
    : { html: escapeHtml(targetText.slice(0, 260)), hitCount: 0 };

  const cleanVerse = target === 'text' ? targetText : extractCleanVerseText(rawScripture);

  return {
    matchedIncIdx,
    matchedExc,
    snippetHtml: hl.html,
    plainText: cleanVerse || targetText,
    matchedBadges: badgeContext ? [badgeContext] : [],
    hitCount: hl.hitCount || 1,
    isRtl: RE_RTL_SCRIPT.test(targetText) && !/[A-Za-zÀ-ÿ]{10,}/.test(targetText)
  };
}

async function resolveBibleSchema(modulePath) {
  if (bibleSchemaCache.has(modulePath)) {
    return bibleSchemaCache.get(modulePath);
  }

  const tablesRes = await nativeBridge.queryModule(
    modulePath,
    "SELECT name FROM sqlite_master WHERE type='table'"
  );
  const tableNames = (Array.isArray(tablesRes && tablesRes.rows) ? tablesRes.rows : [])
    .map((r) => String(getRowField(r, 'name') || ''))
    .filter(Boolean);

  const tableName = tableNames.find((t) => t.toLowerCase() === 'bible')
    || tableNames.find((t) => !/^(?:details|info|sqlite_|android_metadata)/i.test(t))
    || '';

  if (!tableName) {
    throw new Error('Tabela Bible não encontrada no módulo.');
  }

  const infoRes = await nativeBridge.queryModule(
    modulePath,
    `PRAGMA table_info(${quoteIdent(tableName)})`
  );
  const cols = (Array.isArray(infoRes && infoRes.rows) ? infoRes.rows : [])
    .map((r) => String(getRowField(r, 'name') || ''))
    .filter(Boolean);

  const pick = (cands, idx) => {
    for (const c of cands) {
      const hit = cols.find((col) => col.toLowerCase() === c);
      if (hit) return hit;
    }
    return cols[idx] || '';
  };

  const bookCol = pick(['book', 'book_number', 'b'], 0);
  const chapterCol = pick(['chapter', 'c'], 1);
  const verseCol = pick(['verse', 'v'], 2);
  const scriptureCol = pick(['scripture', 'text', 'content', 'data'], 3);

  if (!bookCol || !chapterCol || !verseCol || !scriptureCol) {
    throw new Error(`Colunas bíblicas não identificadas em ${tableName}.`);
  }

  const schema = {
    tableName,
    qTable: quoteIdent(tableName),
    qBook: quoteIdent(bookCol),
    qChapter: quoteIdent(chapterCol),
    qVerse: quoteIdent(verseCol),
    qScripture: quoteIdent(scriptureCol)
  };
  bibleSchemaCache.set(modulePath, schema);
  return schema;
}

function resolveScopeBookRanges(opts, context = {}) {
  const curBook = Number(context.currentBook) || 1;
  const curChapter = Number(context.currentChapter) || 1;

  if (opts.scope === 'currentChapter') {
    return {
      batches: [[curBook, curBook]],
      fixedChapter: curChapter
    };
  }

  if (opts.scope === 'currentBook') {
    return {
      batches: [[curBook, curBook]],
      fixedChapter: null
    };
  }

  let minB = 1;
  let maxB = 66;

  if (opts.scope === 'custom') {
    minB = Math.min(opts.fromBook, opts.toBook);
    maxB = Math.max(opts.fromBook, opts.toBook);
  } else {
    const group = BIBLE_SCOPE_GROUPS[opts.scope] || BIBLE_SCOPE_GROUPS.all;
    minB = group.minBook || 1;
    maxB = group.maxBook || 66;
  }

  // Blocos de 6 livros evitam sobrecarga do CursorWindow mesmo em limites altos (até 100000)
  const batches = [];
  const step = 6;
  for (let start = minB; start <= maxB; start += step) {
    batches.push([start, Math.min(maxB, start + step - 1)]);
  }

  return {
    batches,
    fixedChapter: null
  };
}

function finalizeIntervalGroups(groupsMap, requiredCount, limit) {
  const accepted = [];
  let truncated = false;

  for (const grp of groupsMap.values()) {
    if (grp.excluded) continue;
    if (grp.foundIndices.size < requiredCount) continue;

    for (const item of grp.items) {
      if (accepted.length >= limit) {
        truncated = true;
        break;
      }
      accepted.push(item);
    }
    if (truncated) break;
  }

  return { items: accepted, truncated };
}

export function clearBibleSearchCache() {
  bibleSchemaCache.clear();
}

export async function searchBibleModule(bibleMod, rawQuery, rawOptions = {}, context = {}) {
  if (!bibleMod || !bibleMod.path) {
    return {
      items: [],
      totalOccurrences: 0,
      byBook: [],
      chapterCount: 0,
      truncated: false,
      effectiveTarget: 'text',
      intervalType: 'verse'
    };
  }

  const opts = normalizeBibleSearchOptions(rawOptions);
  const parsedQuery = parseBibleSearchQuery(rawQuery, opts);
  if (!parsedQuery.include.length) {
    return {
      items: [],
      totalOccurrences: 0,
      byBook: [],
      chapterCount: 0,
      truncated: false,
      effectiveTarget: parsedQuery.effectiveTarget,
      intervalType: opts.intervalType
    };
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
    ? Math.max(1, Math.min(Math.trunc(Number(context.maxResults)), 100000))
    : opts.limit;

  const isMultiIntervalMode =
    !opts.useRegex &&
    opts.logic === 'and' &&
    (opts.intervalType === 'chapter' || opts.intervalType === 'book') &&
    (parsedQuery.include.length > 1 || parsedQuery.exclude.length > 0);

  const schema = await resolveBibleSchema(bibleMod.path);
  const whereObj = buildSqlWhereForQuery(schema, parsedQuery, opts, isMultiIntervalMode);
  const scopeInfo = resolveScopeBookRanges(opts, context);

  const items = [];
  const intervalGroups = new Map();
  let truncated = false;
  const PAGE_ROWS = 750;

  for (let i = 0; i < scopeInfo.batches.length; i++) {
    if (signal && signal.aborted) {
      return {
        items: [],
        totalOccurrences: 0,
        byBook: [],
        chapterCount: 0,
        truncated: false,
        effectiveTarget: parsedQuery.effectiveTarget,
        intervalType: opts.intervalType
      };
    }

    const [bStart, bEnd] = scopeInfo.batches[i];
    const scopeSql = scopeInfo.fixedChapter !== null
      ? `${schema.qBook} = ${bStart} AND ${schema.qChapter} = ${scopeInfo.fixedChapter}`
      : `${schema.qBook} BETWEEN ${bStart} AND ${bEnd}`;

    let batchOffset = 0;
    let keepReadingBatch = true;

    while (keepReadingBatch) {
      if (signal && signal.aborted) return { items: [], totalOccurrences: 0, byBook: [], chapterCount: 0, truncated: false, effectiveTarget: parsedQuery.effectiveTarget, intervalType: opts.intervalType };

      const res = await nativeBridge.queryModule(
        bibleMod.path,
        `SELECT ${schema.qBook} AS book, ${schema.qChapter} AS chapter, ${schema.qVerse} AS verse, ${schema.qScripture} AS scripture ` +
          `FROM ${schema.qTable} ` +
          `WHERE ${scopeSql} AND (${whereObj.sql}) ` +
          `ORDER BY ${schema.qBook} ASC, ${schema.qChapter} ASC, ${schema.qVerse} ASC ` +
          `LIMIT ${PAGE_ROWS} OFFSET ${batchOffset}`,
        whereObj.params
      );

      if (signal && signal.aborted) return { items: [], totalOccurrences: 0, byBook: [], chapterCount: 0, truncated: false, effectiveTarget: parsedQuery.effectiveTarget, intervalType: opts.intervalType };

      const rows = Array.isArray(res && res.rows) ? res.rows : [];
      if (rows.length < PAGE_ROWS) {
        keepReadingBatch = false;
      } else {
        batchOffset += rows.length;
      }

      for (const row of rows) {
        const book = Number(getRowField(row, 'book')) || 0;
        const chapter = Number(getRowField(row, 'chapter')) || 0;
        const verse = Number(getRowField(row, 'verse')) || 0;
        const scripture = String(getRowField(row, 'scripture') || '');
        if (!book || !chapter || !verse) continue;

        const info = inspectVerseTokens(scripture, parsedQuery, opts);
        if (!info) continue;

        if (isMultiIntervalMode) {
          const gKey = opts.intervalType === 'chapter' ? `${book}:${chapter}` : `${book}`;
          let grp = intervalGroups.get(gKey);
          if (!grp) {
            grp = { foundIndices: new Set(), excluded: false, items: [] };
            intervalGroups.set(gKey, grp);
          }
          if (info.matchedExc) {
            grp.excluded = true;
          }
          for (const idx of info.matchedIncIdx) {
            grp.foundIndices.add(idx);
          }
          if (info.matchedIncIdx.length > 0 && !grp.excluded) {
            grp.items.push({
              module: bibleMod,
              book,
              chapter,
              verse,
              refLabel: formatReference(book, chapter, verse),
              bookName: getBookName(book),
              snippetHtml: info.snippetHtml,
              plainText: info.plainText,
              matchedBadges: info.matchedBadges,
              hitCount: info.hitCount,
              isRtl: info.isRtl
            });
          }
          continue;
        }

        // Modo Versículo (ou OU / Frase / Regex)
        if (info.matchedExc) continue;
        const includeOk = opts.logic === 'or'
          ? info.matchedIncIdx.length > 0
          : info.matchedIncIdx.length === parsedQuery.include.length;
        if (!includeOk) continue;

        if (items.length >= maxResults) {
          truncated = true;
          keepReadingBatch = false;
          break;
        }

        items.push({
          module: bibleMod,
          book,
          chapter,
          verse,
          refLabel: formatReference(book, chapter, verse),
          bookName: getBookName(book),
          snippetHtml: info.snippetHtml,
          plainText: info.plainText,
          matchedBadges: info.matchedBadges,
          hitCount: info.hitCount,
          isRtl: info.isRtl
        });
      }
    }

    if (onProgress && (!signal || !signal.aborted)) {
      const curCount = isMultiIntervalMode
        ? Array.from(intervalGroups.values()).reduce(
          (acc, g) => acc + (!g.excluded && g.foundIndices.size >= parsedQuery.include.length ? g.items.length : 0),
          0
        )
        : items.length;
      onProgress(i + 1, scopeInfo.batches.length, curCount);
    }

    if (truncated) break;
  }

  let finalItems = items;
  if (isMultiIntervalMode) {
    const resolved = finalizeIntervalGroups(intervalGroups, parsedQuery.include.length, maxResults);
    finalItems = resolved.items;
    truncated = resolved.truncated;
  }

  const bookCounts = new Map();
  const chapterSet = new Set();
  let totalOccurrences = 0;

  for (const it of finalItems) {
    totalOccurrences += it.hitCount || 1;
    bookCounts.set(it.book, (bookCounts.get(it.book) || 0) + 1);
    chapterSet.add(`${it.book}:${it.chapter}`);
  }

  const byBook = Array.from(bookCounts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([book, count]) => ({
      book,
      name: getBookName(book),
      count
    }));

  return {
    items: finalItems,
    totalOccurrences,
    byBook,
    chapterCount: chapterSet.size,
    truncated,
    effectiveTarget: parsedQuery.effectiveTarget,
    autoStrong: parsedQuery.autoStrong,
    intervalType: opts.intervalType
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
  for (let i = 0; i < limit; i++) {
    workers.push(next());
  }
  await Promise.all(workers);
}

export async function searchAcrossBibles(bibles, rawQuery, rawOptions = {}, context = {}) {
  const opts = normalizeBibleSearchOptions(rawOptions);
  const allList = Array.isArray(bibles) ? bibles : [];
  const targets = opts.favoritesOnly
    ? allList.filter((m) => Boolean(m && m.isFavorite))
    : allList;

  if (!targets.length) {
    return {
      items: [],
      totalOccurrences: 0,
      byBook: [],
      chapterCount: 0,
      truncated: false,
      effectiveTarget: opts.targetField,
      intervalType: opts.intervalType,
      searchedCount: 0
    };
  }

  const signal = context.signal || null;
  const onProgress = typeof context.onProgress === 'function' ? context.onProgress : null;
  const maxTotal = context.maxTotal !== undefined
    ? Math.max(1, Math.min(Math.trunc(Number(context.maxTotal)), 100000))
    : Math.min(opts.limit, 2000);
  const perBibleMax = Math.max(10, Math.min(Number(context.perBibleMax) || 60, maxTotal));
  const concurrency = Math.max(1, Math.min(Number(context.concurrency) || 4, 4));

  const activePath = context.activePath || '';
  const ordered = targets.slice().sort((a, b) => {
    const aAct = a.path === activePath ? 1 : 0;
    const bAct = b.path === activePath ? 1 : 0;
    if (bAct !== aAct) return bAct - aAct;
    const favDiff = Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite));
    if (favDiff !== 0) return favDiff;
    return 0;
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
        const res = await searchBibleModule(mod, rawQuery, opts, {
          currentBook: context.currentBook,
          currentChapter: context.currentChapter,
          maxResults: perBibleMax,
          signal
        });
        if (signal && signal.aborted) return;
        effectiveTarget = res.effectiveTarget || effectiveTarget;
        if (res.autoStrong) autoStrong = true;

        for (const item of res.items) {
          collected.push({ ...item, modIdx });
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
    return {
      items: [],
      totalOccurrences: 0,
      byBook: [],
      chapterCount: 0,
      truncated: false,
      effectiveTarget,
      intervalType: opts.intervalType,
      searchedCount: scanned
    };
  }

  if (errorCount > 0) {
    appLogger.warn(
      'BIBLE_SEARCH_ALL',
      `${errorCount} de ${ordered.length} Bíblia(s) falharam ao buscar "${rawQuery}"`,
      { firstError, options: opts }
    );
  }

  collected.sort((a, b) => {
    if (a.book !== b.book) return a.book - b.book;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    if (a.verse !== b.verse) return a.verse - b.verse;
    return a.modIdx - b.modIdx;
  });

  const truncated = collected.length > maxTotal;
  const finalItems = truncated ? collected.slice(0, maxTotal) : collected;

  const bookCounts = new Map();
  const chapterSet = new Set();
  let totalOccurrences = 0;

  for (const it of finalItems) {
    totalOccurrences += it.hitCount || 1;
    bookCounts.set(it.book, (bookCounts.get(it.book) || 0) + 1);
    chapterSet.add(`${it.book}:${it.chapter}`);
  }

  const byBook = Array.from(bookCounts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([book, count]) => ({
      book,
      name: getBookName(book),
      count
    }));

  return {
    items: finalItems,
    totalOccurrences,
    byBook,
    chapterCount: chapterSet.size,
    truncated,
    effectiveTarget,
    autoStrong,
    intervalType: opts.intervalType,
    searchedCount: ordered.length
  };
}
