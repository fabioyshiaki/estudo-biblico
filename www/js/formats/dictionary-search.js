import { nativeBridge } from '../bridge/native-bridge.js';
import {
  normalizeLookupTerm,
  buildLookupCandidates
} from './mysword-dictionary.js';
import { appLogger } from '../core/logger.js';

const dictSchemaCache = new Map();

export const DICT_TARGET_FIELDS = Object.freeze([
  { id: 'word_alt', label: 'Títulos e sinônimos' },
  { id: 'word', label: 'Somente títulos' },
  { id: 'word_body', label: 'Títulos e texto' },
  { id: 'body', label: 'Somente no texto' },
  { id: 'strong', label: 'Strong (H/G)' },
  { id: 'raw', label: 'Todos os dados (bruto)' }
]);

export const DICT_SEARCH_TYPES = Object.freeze({
  contains: { id: 'contains', label: 'Parte da palavra', matchMode: 'contains', logic: 'and' },
  exactWord: { id: 'exactWord', label: 'Palavra exata', matchMode: 'exact', logic: 'and' },
  startsWith: { id: 'startsWith', label: 'Começa com', matchMode: 'startsWith', logic: 'and' },
  phrase: { id: 'phrase', label: 'Frase exata', matchMode: 'contains', logic: 'phrase' },
  anyWord: { id: 'anyWord', label: 'Qualquer palavra (OU)', matchMode: 'contains', logic: 'or' }
});

export const DEFAULT_UNIFIED_DICT_OPTIONS = Object.freeze({
  searchType: 'contains',  // 'contains' | 'exactWord' | 'startsWith' | 'phrase' | 'anyWord'
  matchMode: 'contains',
  logic: 'and',
  targetField: 'word_alt', // 'word_alt' | 'word' | 'word_body' | 'body' | 'strong' | 'raw'
  limit: 500,
  accentSensitive: false,
  caseSensitive: false,
  useRegex: false,
  searchAltWords: true,
  favoritesOnly: false
});

export function normalizeUnifiedDictOptions(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};

  let searchType = Object.prototype.hasOwnProperty.call(DICT_SEARCH_TYPES, src.searchType)
    ? src.searchType
    : 'contains';
  const preset = DICT_SEARCH_TYPES[searchType];

  const validTargets = new Set(DICT_TARGET_FIELDS.map((f) => f.id));
  const targetField = validTargets.has(src.targetField) ? src.targetField : 'word_alt';

  const rawLimit = Math.trunc(Number(src.limit));
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1
    ? Math.min(rawLimit, 10000)
    : 500;

  return {
    searchType,
    matchMode: preset.matchMode,
    logic: preset.logic,
    targetField,
    limit,
    accentSensitive: Boolean(src.accentSensitive),
    caseSensitive: Boolean(src.caseSensitive),
    useRegex: Boolean(src.useRegex),
    searchAltWords: src.searchAltWords !== false,
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

function parseDictQuery(rawQuery, opts) {
  const input = String(rawQuery || '').trim();
  if (!input) {
    return { raw: '', include: [], exclude: [], autoStrong: false, effectiveTarget: opts.targetField, regexLiteralOnly: false };
  }

  if (opts.useRegex) {
    return {
      raw: input,
      include: [input],
      exclude: [],
      autoStrong: false,
      effectiveTarget: opts.targetField,
      regexLiteralOnly: !RE_REGEX_META.test(input)
    };
  }

  if (opts.logic === 'phrase') {
    const cleanPhrase = input.replace(/^["“”]+|["“”]+$/g, '').trim();
    const isStrong = Boolean(cleanPhrase && RE_STRONG_CODE.test(cleanPhrase));
    return {
      raw: input,
      include: cleanPhrase ? [cleanPhrase] : [],
      exclude: [],
      autoStrong: isStrong && (opts.targetField === 'word_alt' || opts.targetField === 'word'),
      effectiveTarget: opts.targetField,
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
  return {
    raw: input,
    include,
    exclude,
    autoStrong: allStrong && (opts.targetField === 'word_alt' || opts.targetField === 'word'),
    effectiveTarget: opts.targetField,
    regexLiteralOnly: false
  };
}

function buildSqlPatternsForToken(rawToken, opts) {
  const token = String(rawToken || '').normalize('NFC').trim();
  if (!token) return { patterns: [], needsEscape: false };

  if (RE_STRONG_CODE.test(token)) {
    return {
      patterns: buildLookupCandidates(token, { accentSensitive: opts.accentSensitive }),
      needsEscape: false
    };
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

function buildColumnTokensWhere(colSql, parsedQuery, opts, startsWithAllowed = false) {
  if (opts.useRegex && !parsedQuery.regexLiteralOnly) {
    return null;
  }

  const tokenGroups = [];
  const params = [];

  for (const rawTok of parsedQuery.include) {
    const subWords = RE_STRONG_CODE.test(rawTok)
      ? [rawTok]
      : rawTok.split(/\s+/).filter(Boolean);

    const subClauses = [];
    const subParams = [];

    for (const sw of subWords) {
      const { patterns, needsEscape } = buildSqlPatternsForToken(sw, opts);
      if (!patterns.length) continue;

      const usePrefix = startsWithAllowed && parsedQuery.include.length === 1 && subWords.length === 1 && opts.matchMode === 'startsWith';
      if (patterns.length === 1) {
        subClauses.push(buildLikeClause(colSql, needsEscape));
        subParams.push(usePrefix ? `${patterns[0]}%` : `%${patterns[0]}%`);
      } else {
        const orList = patterns.map(() => buildLikeClause(colSql, needsEscape));
        subClauses.push(`(${orList.join(' OR ')})`);
        for (const p of patterns) subParams.push(usePrefix ? `${p}%` : `%${p}%`);
      }
    }

    if (subClauses.length) {
      tokenGroups.push(subClauses.length === 1 ? subClauses[0] : `(${subClauses.join(' AND ')})`);
      params.push(...subParams);
    }
  }

  if (!tokenGroups.length) return null;
  const joiner = opts.logic === 'or' ? ' OR ' : ' AND ';
  return {
    sql: tokenGroups.length === 1 ? tokenGroups[0] : `(${tokenGroups.join(joiner)})`,
    params
  };
}

function buildDictWhereSql(schema, parsedQuery, opts) {
  if (opts.useRegex && !parsedQuery.regexLiteralOnly) {
    return { sql: '1=1', params: [] };
  }

  const target = opts.targetField;
  const cols = [];
  if (target === 'word') {
    cols.push({ sql: schema.qWord, prefix: true });
  } else if (target === 'word_alt') {
    cols.push({ sql: schema.qWord, prefix: true });
    if (opts.searchAltWords && schema.qAlt) cols.push({ sql: schema.qAlt, prefix: false });
  } else if (target === 'body') {
    cols.push({ sql: schema.qData, prefix: false });
  } else {
    // 'word_body' | 'strong' | 'raw'
    cols.push({ sql: schema.qWord, prefix: false });
    if (opts.searchAltWords && schema.qAlt) cols.push({ sql: schema.qAlt, prefix: false });
    cols.push({ sql: schema.qData, prefix: false });
  }

  const parts = [];
  const params = [];
  for (const c of cols) {
    const grp = buildColumnTokensWhere(c.sql, parsedQuery, opts, c.prefix);
    if (grp) {
      parts.push(grp.sql);
      params.push(...grp.params);
    }
  }

  if (!parts.length) return { sql: '1=1', params: [] };
  return {
    sql: parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`,
    params
  };
}

function testTokenInText(rawText, foldedText, rawToken, opts, isWholeTitle = false) {
  if (!rawText) return false;

  if (opts.useRegex) {
    try {
      const flags = opts.caseSensitive ? 'u' : 'iu';
      if (new RegExp(rawToken, flags).test(rawText)) return true;
      if (!opts.accentSensitive && foldedText && foldedText !== rawText) {
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
    if (isWholeTitle) {
      if (foldedText === foldedToken) return true;
      const subParts = String(rawText).split(/[,;(/]+/).map((p) => foldString(p, opts).trim()).filter(Boolean);
      return subParts.includes(foldedToken);
    }
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(foldedToken)}(?![\\p{L}\\p{N}])`, 'u');
    return re.test(foldedText);
  }

  if (opts.matchMode === 'startsWith') {
    if (isWholeTitle) return foldedText.startsWith(foldedToken);
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(foldedToken)}`, 'u');
    return re.test(foldedText);
  }

  return foldedText.includes(foldedToken);
}

function extractStrongCodes(word, altWords, rawData) {
  const codes = new Set();
  const addFrom = (txt) => {
    const s = String(txt || '');
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
  };
  addFrom(word);
  addFrom(altWords);
  addFrom(rawData);
  return Array.from(codes);
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

function buildHighlightedSnippet(displayText, tokens, opts, maxChars = 220) {
  if (!displayText) return { html: '', hitCount: 1 };
  const ranges = collectHighlightRanges(displayText, tokens, opts);
  const hitCount = Math.max(1, ranges.length);

  let winStart = 0;
  let winEnd = displayText.length;
  if (displayText.length > maxChars) {
    if (ranges.length) {
      winStart = Math.max(0, ranges[0][0] - 58);
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

function evaluateDictRow(word, altWords, rawData, parsedQuery, opts) {
  const target = opts.targetField;
  const plainBody = stripTagsPlain(rawData);

  if (target === 'strong') {
    const codes = extractStrongCodes(word, altWords, rawData);
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

    const matched = parsedQuery.include.filter(hasCode).map((t) => normalizeStrongCode(t) || t.toUpperCase());
    const preview = plainBody.length > 220 ? `${plainBody.slice(0, 220)}…` : plainBody;
    return {
      matchType: 'exact',
      matchLabel: 'Strong',
      matchedBadges: matched,
      snippetHtml: escapeHtml(preview),
      plainText: plainBody,
      hitCount: matched.length || 1,
      isRtl: RE_RTL_SCRIPT.test(plainBody) && !/[A-Za-zÀ-ÿ]{10,}/.test(plainBody)
    };
  }

  const foldedWord = foldString(word, opts).trim();
  const isSingle = parsedQuery.include.length === 1;

  // Verifica Strong exato no título (ex.: H430 <-> H0430)
  let strongTitleExact = false;
  if (isSingle && RE_STRONG_CODE.test(parsedQuery.include[0])) {
    const cands = buildLookupCandidates(parsedQuery.include[0], { accentSensitive: opts.accentSensitive })
      .map((c) => foldString(c, opts).trim());
    strongTitleExact = cands.includes(foldedWord);
  }

  const checkField = (rawField, wholeTitle) => {
    if (!rawField) return false;
    const folded = foldString(rawField, opts);
    const incOk = opts.logic === 'or'
      ? parsedQuery.include.some((t) => testTokenInText(rawField, folded, t, opts, wholeTitle))
      : parsedQuery.include.every((t) => testTokenInText(rawField, folded, t, opts, wholeTitle));
    if (!incOk) return false;
    if (parsedQuery.exclude.length) {
      const excHit = parsedQuery.exclude.some((t) => testTokenInText(rawField, folded, t, opts, false));
      if (excHit) return false;
    }
    return true;
  };

  let matchType = '';
  let matchLabel = '';

  const allowTitle = target === 'word' || target === 'word_alt' || target === 'word_body' || target === 'raw';
  const allowAlt = opts.searchAltWords && altWords && (target === 'word_alt' || target === 'word_body' || target === 'raw');
  const allowBody = target === 'word_body' || target === 'body' || target === 'raw';

  if (allowTitle && (strongTitleExact || checkField(word, isSingle))) {
    const singleFold = isSingle ? foldString(parsedQuery.include[0], opts).trim() : '';
    if (strongTitleExact || (isSingle && foldedWord === singleFold)) {
      matchType = 'exact';
      matchLabel = 'Exato';
    } else if (isSingle && singleFold && foldedWord.startsWith(singleFold)) {
      matchType = 'prefix';
      matchLabel = 'Início';
    } else {
      matchType = 'title';
      matchLabel = 'Título';
    }
  } else if (allowAlt) {
    const altParts = String(altWords).split(/[,;]+/).map((p) => p.trim()).filter(Boolean);
    const hitAlt = altParts.some((part) => checkField(part, isSingle)) || checkField(altWords, false);
    if (hitAlt) {
      matchType = 'title';
      matchLabel = 'Sinônimo';
    }
  }

  if (!matchType && allowBody) {
    const bodyTarget = target === 'raw' ? decodeEntities(String(rawData || '')) : plainBody;
    if (checkField(bodyTarget, false)) {
      matchType = 'body';
      matchLabel = target === 'raw' ? 'Bruto' : 'No texto';
    }
  }

  // Checa exclusão global quando busca inclui texto
  if (matchType && allowBody && parsedQuery.exclude.length) {
    const foldedPlain = foldString(plainBody, opts);
    if (parsedQuery.exclude.some((t) => testTokenInText(plainBody, foldedPlain, t, opts, false))) {
      return null;
    }
  }

  if (!matchType) return null;

  const snippetSource = target === 'raw' && matchType === 'body'
    ? decodeEntities(String(rawData || '')).replace(/\s+/g, ' ').trim()
    : plainBody;
  const hl = buildHighlightedSnippet(snippetSource, parsedQuery.include, opts, 220);

  return {
    matchType,
    matchLabel,
    matchedBadges: [matchLabel],
    snippetHtml: hl.html,
    plainText: plainBody,
    hitCount: hl.hitCount,
    isRtl: RE_RTL_SCRIPT.test(plainBody) && !/[A-Za-zÀ-ÿ]{10,}/.test(plainBody)
  };
}

async function resolveDictSchema(modulePath) {
  if (dictSchemaCache.has(modulePath)) {
    return dictSchemaCache.get(modulePath);
  }

  const tablesRes = await nativeBridge.queryModule(
    modulePath,
    "SELECT name FROM sqlite_master WHERE type='table'"
  );
  const tableNames = (Array.isArray(tablesRes && tablesRes.rows) ? tablesRes.rows : [])
    .map((r) => String(getRowField(r, 'name') || ''))
    .filter(Boolean);

  const preferred = ['dictionary', 'dict', 'entries', 'topics', 'lexicon'];
  let tableName = '';
  for (const pref of preferred) {
    const hit = tableNames.find((t) => t.toLowerCase() === pref);
    if (hit) { tableName = hit; break; }
  }
  if (!tableName) {
    tableName = tableNames.find((t) => !/^(?:details|info|data|verse|sqlite_|android_metadata)/i.test(t)) || '';
  }
  if (!tableName) throw new Error('Tabela de dicionário não encontrada.');

  const infoRes = await nativeBridge.queryModule(
    modulePath,
    `PRAGMA table_info(${quoteIdent(tableName)})`
  );
  const cols = (Array.isArray(infoRes && infoRes.rows) ? infoRes.rows : [])
    .map((r) => String(getRowField(r, 'name') || ''))
    .filter(Boolean);

  const pick = (cands, fallbackIdx) => {
    for (const c of cands) {
      const hit = cols.find((col) => col.toLowerCase() === c);
      if (hit) return hit;
    }
    return cols[fallbackIdx] || '';
  };

  const wordCol = pick(['word', 'topic', 'key', 'term', 'entry', 'strong', 'subject'], 0);
  const dataCol = pick(['data', 'definition', 'content', 'text', 'body', 'meaning'], 1);
  const altCol = cols.find((col) => col.toLowerCase() === 'alt_words') || '';
  if (!wordCol || !dataCol) throw new Error(`Colunas do dicionário não identificadas em ${tableName}.`);

  const schema = {
    tableName,
    qTable: quoteIdent(tableName),
    qWord: quoteIdent(wordCol),
    qData: quoteIdent(dataCol),
    qAlt: altCol ? quoteIdent(altCol) : ''
  };
  dictSchemaCache.set(modulePath, schema);
  return schema;
}

export function clearUnifiedDictSearchCache() {
  dictSchemaCache.clear();
}

export async function searchDictionaryModule(dictMod, rawQuery, rawOptions = {}, context = {}) {
  if (!dictMod || !dictMod.path) {
    return { items: [], totalOccurrences: 0, byModule: [], truncated: false, effectiveTarget: 'word_alt', searchedCount: 0 };
  }

  const opts = normalizeUnifiedDictOptions(rawOptions);
  const parsedQuery = parseDictQuery(rawQuery, opts);
  if (!parsedQuery.include.length) {
    return { items: [], totalOccurrences: 0, byModule: [], truncated: false, effectiveTarget: opts.targetField, searchedCount: 1 };
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
    ? Math.max(1, Math.min(Math.trunc(Number(context.maxResults)), 10000))
    : opts.limit;

  const schema = await resolveDictSchema(dictMod.path);
  const whereObj = buildDictWhereSql(schema, parsedQuery, opts);
  const selectCols = schema.qAlt
    ? `${schema.qWord} AS word, ${schema.qData} AS data, ${schema.qAlt} AS altWords`
    : `${schema.qWord} AS word, ${schema.qData} AS data`;

  const items = [];
  const seen = new Set();
  const PAGE_ROWS = 400;
  let offset = 0;
  let pageCount = 0;
  let truncated = false;
  let keepReading = true;

  while (keepReading) {
    if (signal && signal.aborted) {
      return { items: [], totalOccurrences: 0, byModule: [], truncated: false, effectiveTarget: opts.targetField, searchedCount: 1 };
    }

    const res = await nativeBridge.queryModule(
      dictMod.path,
      `SELECT ${selectCols} FROM ${schema.qTable} ` +
        `WHERE ${whereObj.sql} ` +
        `ORDER BY LENGTH(${schema.qWord}) ASC, ${schema.qWord} COLLATE NOCASE ASC ` +
        `LIMIT ${PAGE_ROWS} OFFSET ${offset}`,
      whereObj.params
    );

    if (signal && signal.aborted) {
      return { items: [], totalOccurrences: 0, byModule: [], truncated: false, effectiveTarget: opts.targetField, searchedCount: 1 };
    }

    const rows = Array.isArray(res && res.rows) ? res.rows : [];
    pageCount++;
    if (rows.length < PAGE_ROWS) {
      keepReading = false;
    } else {
      offset += rows.length;
    }

    for (const row of rows) {
      const word = String(getRowField(row, 'word') || '').trim();
      if (!word) continue;
      const key = word.toLowerCase();
      if (seen.has(key)) continue;

      const altWords = schema.qAlt ? String(getRowField(row, 'altwords') || '').trim() : '';
      const rawData = String(getRowField(row, 'data') || '');
      const hit = evaluateDictRow(word, altWords, rawData, parsedQuery, opts);
      if (!hit) continue;

      if (items.length >= maxResults) {
        truncated = true;
        keepReading = false;
        break;
      }

      seen.add(key);
      items.push({
        kind: 'dictionary',
        module: dictMod,
        word,
        altWords,
        refLabel: word,
        matchType: hit.matchType,
        matchLabel: hit.matchLabel,
        matchedBadges: hit.matchedBadges,
        snippetHtml: hit.snippetHtml,
        plainText: hit.plainText,
        hitCount: hit.hitCount,
        isRtl: hit.isRtl
      });
    }

    if (onProgress && (!signal || !signal.aborted)) {
      onProgress(pageCount, items.length);
    }

    // Limite de segurança para buscas Regex em dicionários gigantes
    if (offset >= 25000) {
      truncated = truncated || keepReading;
      break;
    }
  }

  const priority = { exact: 0, prefix: 1, title: 2, body: 3 };
  items.sort((a, b) => {
    const d = (priority[a.matchType] ?? 9) - (priority[b.matchType] ?? 9);
    if (d !== 0) return d;
    if (a.word.length !== b.word.length) return a.word.length - b.word.length;
    return a.word.localeCompare(b.word, 'pt-BR');
  });

  const totalOccurrences = items.reduce((acc, it) => acc + (it.hitCount || 1), 0);

  return {
    items,
    totalOccurrences,
    byModule: items.length ? [{ path: dictMod.path, module: dictMod, count: items.length }] : [],
    truncated,
    effectiveTarget: opts.targetField,
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

export async function searchAcrossDictionariesUnified(dictionaries, rawQuery, rawOptions = {}, context = {}) {
  const opts = normalizeUnifiedDictOptions(rawOptions);
  const allList = Array.isArray(dictionaries) ? dictionaries : [];
  const targets = opts.favoritesOnly
    ? allList.filter((m) => Boolean(m && m.isFavorite))
    : allList;

  if (!targets.length) {
    return { items: [], totalOccurrences: 0, byModule: [], truncated: false, effectiveTarget: opts.targetField, searchedCount: 0 };
  }

  const signal = context.signal || null;
  const onProgress = typeof context.onProgress === 'function' ? context.onProgress : null;
  const maxTotal = context.maxTotal !== undefined
    ? Math.max(1, Math.min(Math.trunc(Number(context.maxTotal)), 10000))
    : opts.limit;
  const perDictMax = Math.max(3, Math.min(Number(context.perDictMax) || 12, maxTotal));
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

  await runWithConcurrency(
    ordered,
    concurrency,
    async (mod, modIdx) => {
      if (signal && signal.aborted) return;
      try {
        const res = await searchDictionaryModule(mod, rawQuery, opts, {
          maxResults: perDictMax,
          signal
        });
        if (signal && signal.aborted) return;
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
    return { items: [], totalOccurrences: 0, byModule: [], truncated: false, effectiveTarget: opts.targetField, searchedCount: scanned };
  }

  if (errorCount > 0) {
    appLogger.warn(
      'DICT_UNIFIED_ALL',
      `${errorCount} de ${ordered.length} dicionário(s) falharam ao buscar "${rawQuery}"`,
      { firstError, options: opts }
    );
  }

  const priority = { exact: 0, prefix: 1, title: 2, body: 3 };
  collected.sort((a, b) => {
    const pDiff = (priority[a.matchType] ?? 9) - (priority[b.matchType] ?? 9);
    if (pDiff !== 0) return pDiff;
    if (a.modIdx !== b.modIdx) return a.modIdx - b.modIdx;
    return a.word.localeCompare(b.word, 'pt-BR');
  });

  const truncated = collected.length > maxTotal;
  const finalItems = truncated ? collected.slice(0, maxTotal) : collected;

  const modCounts = new Map();
  let totalOccurrences = 0;
  for (const it of finalItems) {
    totalOccurrences += it.hitCount || 1;
    const p = it.module.path;
    const prev = modCounts.get(p);
    if (prev) prev.count++;
    else modCounts.set(p, { path: p, module: it.module, count: 1 });
  }

  const byModule = Array.from(modCounts.values()).sort((a, b) => b.count - a.count);

  return {
    items: finalItems,
    totalOccurrences,
    byModule,
    truncated,
    effectiveTarget: opts.targetField,
    autoStrong: Boolean(normalizeLookupTerm(rawQuery) && RE_STRONG_CODE.test(normalizeLookupTerm(rawQuery))),
    searchedCount: ordered.length
  };
}
