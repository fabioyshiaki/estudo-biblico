import { nativeBridge } from '../bridge/native-bridge.js';
import { parseBibleReference } from '../core/bible-refs.js';

const schemaCache = new Map();
const initialsCache = new Map();

export const DEFAULT_DICT_SEARCH_OPTIONS = Object.freeze({
  matchMode: 'contains',   // 'contains' | 'startsWith' | 'exact'
  accentSensitive: false,  // false = ignora acentos; true = diferencia com/sem acento
  caseSensitive: false,    // false = ignora maiúsculas; true = diferencia maiúsculas/minúsculas
  searchBody: false,       // false = títulos/sinônimos; true = busca também nas definições
  searchAltWords: true,    // true = inclui sinônimos (alt_words)
  exactPhrase: false,      // false = todas as palavras (qualquer ordem); true = frase exata
  favoritesOnly: false     // true = restringe busca global e filtro de dicionários aos favoritos
});

export function normalizeDictSearchOptions(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const mode = src.matchMode === 'exact' || src.matchMode === 'startsWith'
    ? src.matchMode
    : 'contains';

  return {
    matchMode: mode,
    accentSensitive: Boolean(src.accentSensitive),
    caseSensitive: Boolean(src.caseSensitive),
    searchBody: Boolean(src.searchBody),
    searchAltWords: src.searchAltWords !== false,
    exactPhrase: Boolean(src.exactPhrase),
    favoritesOnly: Boolean(src.favoritesOnly)
  };
}

const INITIAL_ACCENT_GROUPS = {
  A: ['A', 'Á', 'À', 'Â', 'Ã', 'Ä', 'Å', 'a', 'á', 'à', 'â', 'ã', 'ä', 'å'],
  C: ['C', 'Ç', 'c', 'ç'],
  E: ['E', 'É', 'È', 'Ê', 'Ë', 'e', 'é', 'è', 'ê', 'ë'],
  I: ['I', 'Í', 'Ì', 'Î', 'Ï', 'i', 'í', 'ì', 'î', 'ï'],
  N: ['N', 'Ñ', 'n', 'ñ'],
  O: ['O', 'Ó', 'Ò', 'Ô', 'Õ', 'Ö', 'o', 'ó', 'ò', 'ô', 'õ', 'ö'],
  U: ['U', 'Ú', 'Ù', 'Û', 'Ü', 'u', 'ú', 'ù', 'û', 'ü'],
  Y: ['Y', 'Ý', 'Ÿ', 'y', 'ý', 'ÿ']
};

const VOWEL_SET = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

const VOWEL_VARIANTS = {
  a: ['a', 'á', 'à', 'â', 'ã', 'Á', 'À', 'Â', 'Ã'],
  e: ['e', 'é', 'ê', 'É', 'Ê'],
  i: ['i', 'í', 'Í'],
  o: ['o', 'ó', 'ô', 'õ', 'Ó', 'Ô', 'Õ'],
  u: ['u', 'ú', 'ü', 'Ú']
};

const NAMED_ENTITIES = {
  nbsp: ' ', middot: '·', mdash: '—', ndash: '–', hellip: '…',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', laquo: '«', raquo: '»',
  copy: '©', reg: '®', trade: '™', deg: '°', plusmn: '±', sect: '§',
  para: '¶', bull: '•', ordf: 'ª', ordm: 'º', iquest: '¿', iexcl: '¡',
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
  yacute: 'ý', Yacute: 'Ý', yuml: 'ÿ', szlig: 'ß',
  aelig: 'æ', AElig: 'Æ', oelig: 'œ', OElig: 'Œ'
};

const RE_RTL_SCRIPT = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F]/;
const RE_COMBINING_MARKS = /[\u0300-\u036f\u0591-\u05C7\u0730-\u074A]/g;

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

function buildLikeClause(colSql, needsEscape, useNoCase = true) {
  const esc = needsEscape ? " ESCAPE '\\'" : '';
  const col = useNoCase ? ' COLLATE NOCASE' : '';
  return `${colSql} LIKE ?${esc}${col}`;
}

function decodeNumericEntities(str) {
  return String(str || '')
    .replace(/&#(\d+);/g, (match, dec) => {
      const code = Number(dec);
      if (code === 39) return "'";
      if (!Number.isFinite(code) || code < 128 || code > 0x10FFFF) return match;
      try {
        return String.fromCodePoint(code);
      } catch (err) {
        return match;
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      const code = parseInt(hex, 16);
      if (code === 0x27) return "'";
      if (!Number.isFinite(code) || code < 128 || code > 0x10FFFF) return match;
      try {
        return String.fromCodePoint(code);
      } catch (err) {
        return match;
      }
    });
}

function decodeCommonEntities(str) {
  return String(str || '').replace(/&(?:amp;)?([a-zA-Z]+);/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)) {
      return NAMED_ENTITIES[name];
    }
    const lower = name.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower)) {
      return NAMED_ENTITIES[lower];
    }
    return match;
  });
}

function safeDecodeUri(str) {
  try {
    return decodeURIComponent(str);
  } catch (err) {
    return str;
  }
}

function stripTagsPlain(str) {
  return decodeCommonEntities(
    decodeNumericEntities(String(str || ''))
      .replace(/<\/?(?:p|div|br|li|tr|h[1-6])(?:\s+[^>]*)?>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function getRowField(row, targetLower) {
  if (!row || typeof row !== 'object') return undefined;
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === targetLower) return row[key];
  }
  return undefined;
}

function extractAttrLabel(attrStr) {
  if (!attrStr) return '';
  const m = /\bq\s*=\s*(?:'([^']*)'|"([^"]*)"|([^>]+))/i.exec(attrStr);
  const raw = m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
  return decodeCommonEntities(decodeNumericEntities(raw)).trim();
}

function normalizeInitialBucket(rawChar) {
  const ch = String(rawChar || '').trim();
  if (!ch) return '';
  if (/^[0-9]$/.test(ch)) return '0-9';

  const baseLatin = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/^[A-Z]$/.test(baseLatin)) return baseLatin;

  const baseScript = ch.normalize('NFD').replace(RE_COMBINING_MARKS, '');
  if (baseScript && /[\p{L}]/u.test(baseScript)) {
    return baseScript.charAt(0).toUpperCase();
  }
  return '#';
}

export function normalizeLookupTerm(rawTerm) {
  return String(rawTerm || '')
    .replace(/^[\s.,;:!?()[\]{}"'“”‘’«»—–\-]+|[\s.,;:!?()[\]{}"'“”‘’«»—–\-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildLookupCandidates(rawTerm, options = {}) {
  const clean = normalizeLookupTerm(rawTerm);
  if (!clean) return [];

  const accentSensitive = Boolean(options.accentSensitive);
  const list = [];
  const push = (v) => {
    const t = String(v || '').trim();
    if (t && !list.includes(t)) list.push(t);
  };

  push(clean);

  const strongMatch = /^([GH])\s*0*(\d+)([a-z]?)$/i.exec(clean);
  if (strongMatch) {
    const prefix = strongMatch[1].toUpperCase();
    const num = strongMatch[2];
    const suffix = strongMatch[3] || '';
    push(`${prefix}${num}${suffix}`);
    if (num.length < 4) push(`${prefix}${num.padStart(4, '0')}${suffix}`);
    if (num.length < 5) push(`${prefix}${num.padStart(5, '0')}${suffix}`);
    push(`${num}${suffix}`);
  }

  if (!accentSensitive) {
    const noAccents = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (noAccents && noAccents !== clean) {
      push(noAccents);
    }

    const noMarks = clean.normalize('NFD').replace(RE_COMBINING_MARKS, '');
    if (noMarks && noMarks !== clean) {
      push(noMarks);
    }
  }

  return list;
}

function foldForMatch(str, opts) {
  let out = String(str || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!opts.accentSensitive) {
    out = out.normalize('NFD').replace(RE_COMBINING_MARKS, '').normalize('NFC');
  }
  if (!opts.caseSensitive) {
    out = out.toLowerCase();
  }
  return out;
}

function splitSearchTokens(cleanQuery, opts) {
  if (opts.exactPhrase) return [cleanQuery];
  const parts = cleanQuery.split(/\s+/).filter(Boolean);
  return parts.length ? parts : [cleanQuery];
}

function testTokenInText(foldedText, foldedToken, matchMode, isWholeField = false) {
  if (!foldedText || !foldedToken) return false;

  if (matchMode === 'exact') {
    if (isWholeField) return foldedText === foldedToken;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(foldedToken)}(?![\\p{L}\\p{N}])`, 'u');
    return re.test(foldedText);
  }

  if (matchMode === 'startsWith') {
    if (isWholeField) return foldedText.startsWith(foldedToken);
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(foldedToken)}`, 'u');
    return re.test(foldedText);
  }

  return foldedText.includes(foldedToken);
}

function matchEntryTitle(word, altWords, rawQuery, opts) {
  const clean = normalizeLookupTerm(rawQuery);
  if (!clean) return null;

  const isStrong = /^[GH]\s*0*\d+[a-z]?$/i.test(clean);
  const foldedWord = foldForMatch(word, opts);
  const tokens = splitSearchTokens(clean, opts);
  const foldedTokens = tokens.map((t) => foldForMatch(t, opts)).filter(Boolean);
  if (!foldedTokens.length) return null;

  if (isStrong) {
    const strongCands = buildLookupCandidates(clean, { accentSensitive: opts.accentSensitive })
      .map((c) => foldForMatch(c, opts));
    if (strongCands.includes(foldedWord)) {
      return 'exact';
    }
    if (opts.matchMode === 'exact') {
      return null;
    }
  }

  const singleOrPhrase = foldedTokens.length === 1;

  if (singleOrPhrase) {
    const needle = foldedTokens[0];
    if (foldedWord === needle) return 'exact';

    if (opts.matchMode === 'exact') {
      const subParts = String(word || '').split(/[,;(/]+/).map((p) => foldForMatch(p, opts)).filter(Boolean);
      if (subParts.includes(needle)) return 'exact';
    } else if (opts.matchMode === 'startsWith') {
      if (foldedWord.startsWith(needle)) return 'prefix';
    } else {
      if (foldedWord.startsWith(needle)) return 'prefix';
      if (foldedWord.includes(needle)) return 'title';
    }
  } else {
    const allMatch = foldedTokens.every((tok) => testTokenInText(foldedWord, tok, opts.matchMode, false));
    if (allMatch) {
      return foldedWord.startsWith(foldedTokens[0]) ? 'prefix' : 'title';
    }
  }

  if (opts.searchAltWords && altWords) {
    const altParts = String(altWords).split(/[,;]+/).map((p) => p.trim()).filter(Boolean);
    for (const part of altParts) {
      const foldedPart = foldForMatch(part, opts);
      if (!foldedPart) continue;

      if (singleOrPhrase) {
        const needle = foldedTokens[0];
        if (foldedPart === needle) return 'exact';
        if (opts.matchMode === 'startsWith' && foldedPart.startsWith(needle)) return 'prefix';
        if (opts.matchMode === 'contains' && foldedPart.includes(needle)) return 'title';
      } else {
        const allAlt = foldedTokens.every((tok) => testTokenInText(foldedPart, tok, opts.matchMode, false));
        if (allAlt) return 'title';
      }
    }
  }

  return null;
}

function matchEntryBody(rawData, rawQuery, opts) {
  const plain = stripTagsPlain(rawData).replace(/\n+/g, ' ');
  if (!plain) return false;

  const clean = normalizeLookupTerm(rawQuery);
  const foldedPlain = foldForMatch(plain, opts);
  const tokens = splitSearchTokens(clean, opts);
  const foldedTokens = tokens.map((t) => foldForMatch(t, opts)).filter(Boolean);
  if (!foldedTokens.length) return false;

  if (foldedTokens.length === 1 && /^[GH]\s*0*\d+[a-z]?$/i.test(clean)) {
    const cands = buildLookupCandidates(clean, { accentSensitive: opts.accentSensitive })
      .map((c) => foldForMatch(c, opts));
    return cands.some((c) => testTokenInText(foldedPlain, c, opts.matchMode, false));
  }

  return foldedTokens.every((tok) => testTokenInText(foldedPlain, tok, opts.matchMode, false));
}

function buildTokenLikePatterns(rawToken, opts) {
  const token = String(rawToken || '').normalize('NFC').trim();
  if (!token) return { patterns: [], needsEscape: false };

  const needsEscape = /[\\%_]/.test(token);

  // 1. Código Strong -> testa variações com e sem zeros à esquerda
  if (/^[GH]\s*0*\d+[a-z]?$/i.test(token)) {
    const cands = buildLookupCandidates(token, { accentSensitive: opts.accentSensitive });
    return {
      patterns: cands.map((c) => (needsEscape ? escapeLikeStr(c) : c)),
      needsEscape
    };
  }

  // 2. Diferenciar acentos ATIVO
  if (opts.accentSensitive) {
    if (opts.caseSensitive) {
      return {
        patterns: [needsEscape ? escapeLikeStr(token) : token],
        needsEscape
      };
    }

    // SQLite LIKE não ignora maiúscula/minúscula em letras não-ASCII (Á vs á): usa '_' nessas letras e filtra exato no JS
    let pat = '';
    let hasSolidAscii = false;
    for (const ch of token) {
      if (ch.charCodeAt(0) <= 127) {
        if (/[A-Za-z0-9]/.test(ch)) hasSolidAscii = true;
        pat += needsEscape ? escapeLikeChar(ch) : ch;
      } else {
        pat += '_';
      }
    }

    if (hasSolidAscii) {
      return { patterns: [pat], needsEscape };
    }

    const variants = [];
    const addV = (v) => {
      if (v && !variants.includes(v)) variants.push(needsEscape ? escapeLikeStr(v) : v);
    };
    addV(token);
    addV(token.toLowerCase());
    addV(token.toUpperCase());
    if (token.length > 1) {
      addV(token.charAt(0).toUpperCase() + token.slice(1).toLowerCase());
    }
    return { patterns: variants, needsEscape };
  }

  // 3. Ignorar acentos em alfabetos não-latinos (grego, hebraico, siríaco)
  const hasNonLatin = /[\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF\u0700-\u074F]/.test(token);
  if (hasNonLatin) {
    const cands = buildLookupCandidates(token, { accentSensitive: false });
    return {
      patterns: cands.map((c) => (needsEscape ? escapeLikeStr(c) : c)),
      needsEscape
    };
  }

  // 4. Ignorar acentos em alfabeto latino SEM usar replace() no SQL
  const stripped = token.normalize('NFD').replace(RE_COMBINING_MARKS, '');
  let solidOthers = 0;
  let nonInitC = 0;
  let nCount = 0;

  for (let i = 0; i < stripped.length; i++) {
    const lower = stripped[i].toLowerCase();
    if (VOWEL_SET.has(lower)) continue;
    if (lower === 'c' && i > 0) {
      nonInitC++;
      continue;
    }
    if (lower === 'n') {
      nCount++;
      continue;
    }
    if (/[a-z0-9]/i.test(lower)) {
      solidOthers++;
    }
  }

  // Caso comum: há consoantes/dígitos estáveis (ex.: "amor" -> "_m_r", "abraao" -> "_br___", "fe" -> "f_", "coracao" -> "c_r____")
  if (solidOthers >= 1) {
    let pat = '';
    for (let i = 0; i < stripped.length; i++) {
      const ch = stripped[i];
      const lower = ch.toLowerCase();
      if (VOWEL_SET.has(lower)) {
        pat += '_';
      } else if (lower === 'c' && i > 0) {
        pat += '_';
      } else if (lower === 'n' && solidOthers >= 2) {
        pat += '_';
      } else {
        pat += needsEscape ? escapeLikeChar(ch) : ch;
      }
    }
    return { patterns: [pat], needsEscape };
  }

  // Sem consoantes estáveis além de 'c' não-inicial (ex.: "acao" -> "_c__", "_ç__", "_Ç__")
  if (nonInitC === 1 && nCount === 0) {
    const parts = [];
    for (const cVar of ['c', 'ç', 'Ç']) {
      let pat = '';
      for (let i = 0; i < stripped.length; i++) {
        const ch = stripped[i];
        const lower = ch.toLowerCase();
        if (VOWEL_SET.has(lower)) pat += '_';
        else if (lower === 'c' && i > 0) pat += cVar;
        else pat += needsEscape ? escapeLikeChar(ch) : ch;
      }
      parts.push(pat);
    }
    return { patterns: parts, needsEscape };
  }

  // Sem consoantes estáveis além de 'n' (ex.: "ano" / "año")
  if (nCount === 1 && nonInitC === 0) {
    const parts = [];
    for (const nVar of ['n', 'ñ', 'Ñ']) {
      let pat = '';
      for (let i = 0; i < stripped.length; i++) {
        const ch = stripped[i];
        const lower = ch.toLowerCase();
        if (VOWEL_SET.has(lower)) pat += '_';
        else if (lower === 'n') pat += nVar;
        else pat += needsEscape ? escapeLikeChar(ch) : ch;
      }
      parts.push(pat);
    }
    return { patterns: parts, needsEscape };
  }

  // Palavras só com vogais (ex.: "eu", "ai", "oi", "aí"): gera base + variantes com 1 acento
  const vowelForms = [];
  const pushForm = (v) => {
    const safe = needsEscape ? escapeLikeStr(v) : v;
    if (safe && !vowelForms.includes(safe)) vowelForms.push(safe);
  };
  pushForm(stripped);
  for (let i = 0; i < stripped.length && vowelForms.length < 12; i++) {
    const lower = stripped[i].toLowerCase();
    const vars = VOWEL_VARIANTS[lower];
    if (!vars) continue;
    for (const v of vars) {
      if (vowelForms.length >= 12) break;
      pushForm(stripped.slice(0, i) + v + stripped.slice(i + 1));
    }
  }
  return { patterns: vowelForms, needsEscape };
}

function buildColumnFilterForTokens(colSql, tokens, opts, mode) {
  const tokenClauses = [];
  const params = [];
  const isStrongSingle = tokens.length === 1 && /^[GH]\s*0*\d+[a-z]?$/i.test(tokens[0]);

  for (const tok of tokens) {
    const { patterns, needsEscape } = buildTokenLikePatterns(tok, opts);
    if (!patterns.length) continue;

    const subParts = [];
    for (const pat of patterns) {
      if (isStrongSingle && mode === 'exact') {
        subParts.push(`${colSql} = ? COLLATE NOCASE`);
        params.push(tok.indexOf('\\') >= 0 ? pat.replace(/\\([%_\\])/g, '$1') : pat);
      } else if (tokens.length === 1 && mode === 'startsWith') {
        subParts.push(buildLikeClause(colSql, needsEscape, true));
        params.push(`${pat}%`);
      } else {
        subParts.push(buildLikeClause(colSql, needsEscape, true));
        params.push(`%${pat}%`);
      }
    }

    if (subParts.length === 1) {
      tokenClauses.push(subParts[0]);
    } else if (subParts.length > 1) {
      tokenClauses.push(`(${subParts.join(' OR ')})`);
    }
  }

  if (!tokenClauses.length) return null;
  return {
    sql: tokenClauses.length === 1 ? tokenClauses[0] : `(${tokenClauses.join(' AND ')})`,
    params
  };
}

function buildTitlePreFilterSql(schema, rawQuery, opts) {
  const clean = normalizeLookupTerm(rawQuery);
  const tokens = splitSearchTokens(clean, opts);
  const wordFilter = buildColumnFilterForTokens(schema.qWord, tokens, opts, opts.matchMode);

  if (!opts.searchAltWords || !schema.qAlt) {
    return wordFilter || { sql: '1=0', params: [] };
  }

  // Em alt_words os sinônimos vêm separados por vírgula, então usa pré-filtro 'contains' e valida exato no JS
  const altFilter = buildColumnFilterForTokens(schema.qAlt, tokens, opts, 'contains');
  if (!wordFilter) return altFilter || { sql: '1=0', params: [] };
  if (!altFilter) return wordFilter;

  return {
    sql: `(${wordFilter.sql} OR ${altFilter.sql})`,
    params: [...wordFilter.params, ...altFilter.params]
  };
}

function buildBodyPreFilterSql(schema, rawQuery, opts) {
  const clean = normalizeLookupTerm(rawQuery);
  const tokens = splitSearchTokens(clean, opts);
  return buildColumnFilterForTokens(schema.qData, tokens, opts, 'contains');
}

function findMatchRangeInPlain(plain, rawQuery, opts) {
  const clean = normalizeLookupTerm(rawQuery);
  if (!plain || !clean) return null;

  const tokens = splitSearchTokens(clean, opts);
  const firstTok = tokens[0] || clean;
  const targetFold = foldForMatch(firstTok, opts);
  if (!targetFold) return null;

  const normChars = [];
  const origIdxMap = [];
  for (let i = 0; i < plain.length; i++) {
    let piece = plain[i];
    if (!opts.accentSensitive) {
      piece = piece.normalize('NFD').replace(RE_COMBINING_MARKS, '');
    }
    if (!opts.caseSensitive) {
      piece = piece.toLowerCase();
    }
    for (let j = 0; j < piece.length; j++) {
      normChars.push(piece[j]);
      origIdxMap.push(i);
    }
  }

  const foldedJoined = normChars.join('');
  let matchPos = -1;
  const matchLen = targetFold.length;

  if (opts.matchMode === 'exact') {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(targetFold)}(?![\\p{L}\\p{N}])`, 'u');
    const m = re.exec(foldedJoined);
    if (m) matchPos = m.index;
  } else if (opts.matchMode === 'startsWith') {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(targetFold)}`, 'u');
    const m = re.exec(foldedJoined);
    if (m) matchPos = m.index;
  } else {
    matchPos = foldedJoined.indexOf(targetFold);
  }

  if (matchPos < 0) return null;

  const origStart = origIdxMap[matchPos] ?? 0;
  const lastNormIdx = Math.min(origIdxMap.length - 1, matchPos + matchLen - 1);
  let origEnd = (origIdxMap[lastNormIdx] ?? origStart) + 1;
  while (origEnd < plain.length && /[\u0300-\u036f\u0591-\u05C7\u0730-\u074A]/.test(plain[origEnd])) {
    origEnd++;
  }
  return { start: origStart, end: origEnd };
}

function buildSnippetData(rawData, rawQuery, opts) {
  const plain = stripTagsPlain(rawData).replace(/\n+/g, ' ');
  if (!plain) return { snippet: '', snippetHtml: '' };

  const range = findMatchRangeInPlain(plain, rawQuery, opts);
  if (!range) {
    const shortText = plain.slice(0, 145) + (plain.length > 145 ? '…' : '');
    return { snippet: shortText, snippetHtml: escapeHtml(shortText) };
  }

  const start = Math.max(0, range.start - 48);
  const end = Math.min(plain.length, range.end + 92);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < plain.length ? '…' : '';

  const before = plain.slice(start, range.start);
  const hit = plain.slice(range.start, range.end);
  const after = plain.slice(range.end, end);

  const snippet = `${prefix}${before}${hit}${after}${suffix}`.trim();
  const snippetHtml =
    `${prefix}${escapeHtml(before)}<mark class="dct-hit">${escapeHtml(hit)}</mark>${escapeHtml(after)}${suffix}`;

  return { snippet, snippetHtml };
}

function cleanLabel(str) {
  return stripTagsPlain(str).replace(/\s+/g, ' ').trim();
}

function makeBibleLink(parsed, label) {
  return {
    kind: 'bible',
    target: `${parsed.book}.${parsed.chapter}.${parsed.verse}`,
    moduleHint: '',
    label
  };
}

function classifyHrefLink(hrefRaw, labelText) {
  const decoded = safeDecodeUri(
    decodeCommonEntities(decodeNumericEntities(String(hrefRaw || '')))
  ).trim();
  const label = cleanLabel(labelText) || decoded;

  if (/^(?:https?:|mailto:|wiki\/)/i.test(decoded)) {
    return null;
  }

  if (/^(?:tw:\/\/bible|bible:)/i.test(decoded)) {
    const parsedUri = parseBibleReference(decoded, { allowChapterOnly: true });
    if (parsedUri) return makeBibleLink(parsedUri, label);
  }

  const hadHash = decoded.startsWith('#');
  const core = hadHash ? decoded.slice(1).trim() : decoded;
  if (!core) return null;

  const explicitPrefix = /^(?:rx|b|v)[\s.:_-]*(.+)$/i.exec(core);
  if (explicitPrefix && explicitPrefix[1]) {
    const parsedExplicit = parseBibleReference(explicitPrefix[1].trim(), { allowChapterOnly: true });
    if (parsedExplicit) {
      return makeBibleLink(parsedExplicit, label);
    }
  }

  if (hadHash && /^\d{1,2}[.:_-]\d{1,3}[.:_-]\d{1,3}/.test(core)) {
    const parsedNum = parseBibleReference(core, { allowChapterOnly: true });
    if (parsedNum) return makeBibleLink(parsedNum, label);
  }

  const strongMatch = /^s\s*([GH]\d+[a-z]?)$/i.exec(core);
  if (strongMatch) {
    return {
      kind: 'strong',
      target: strongMatch[1].toUpperCase(),
      moduleHint: '',
      label
    };
  }

  const morphMatch = /^m\s*(.+)$/i.exec(core);
  if (morphMatch) {
    return {
      kind: 'morph',
      target: morphMatch[1].trim(),
      moduleHint: '',
      label
    };
  }

  const modDictMatch = /^d-([^\s]+)\s+(.+)$/i.exec(core);
  if (modDictMatch) {
    const target = modDictMatch[2].trim();
    const modHint = modDictMatch[1].trim();
    const parsedTextual = parseBibleReference(target, { allowChapterOnly: false, allowNumeric: false });
    if (parsedTextual) return makeBibleLink(parsedTextual, label);
    return {
      kind: 'term',
      target,
      moduleHint: modHint,
      label
    };
  }

  const directTextBible = parseBibleReference(core, { allowChapterOnly: false, allowNumeric: false });
  if (directTextBible) {
    return makeBibleLink(directTextBible, label);
  }

  let dictTarget = '';
  if (!hadHash && /^d(?:\s+|(?=[^\s-]))/i.test(core)) {
    dictTarget = core.replace(/^d\s*/i, '').trim();
  } else if (hadHash && /^d(?:\s+|(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9]))/.test(core)) {
    dictTarget = core.replace(/^d\s*/, '').trim();
  } else if (hadHash) {
    dictTarget = core;
  }

  if (dictTarget) {
    const parsedTargetBible = parseBibleReference(dictTarget, { allowChapterOnly: false, allowNumeric: false });
    if (parsedTargetBible) return makeBibleLink(parsedTargetBible, label);

    const parsedLabelBible = parseBibleReference(label, { allowChapterOnly: false, allowNumeric: false });
    if (parsedLabelBible) return makeBibleLink(parsedLabelBible, label);

    return {
      kind: 'term',
      target: dictTarget,
      moduleHint: '',
      label
    };
  }

  const fallbackLabelBible = parseBibleReference(label, { allowChapterOnly: false, allowNumeric: false });
  if (fallbackLabelBible) {
    return makeBibleLink(fallbackLabelBible, label);
  }

  return null;
}

export function formatMySwordDictionaryData(rawData) {
  let text = decodeNumericEntities(String(rawData || '').replace(/\r\n/g, '\n'));

  text = text.replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, '');

  const footnotes = [];
  const footnoteLabels = [];
  text = text.replace(/<RF(\s+[^>]*)?>([\s\S]*?)<\/?Rf>/gi, (_, attrs, inner) => {
    const clean = stripTagsPlain(inner);
    if (!clean) return '';
    const idx = footnotes.length;
    footnotes.push(clean);
    footnoteLabels.push(extractAttrLabel(attrs) || '*');
    return `\u0001${idx}\u0001`;
  });

  const imageTokens = [];
  text = text.replace(/<img\b([^>]*)>/gi, (full, attrs, offset, fullStr) => {
    const srcMatch = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs || '');
    const altMatch = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs || '');
    const src = decodeCommonEntities(decodeNumericEntities((srcMatch && (srcMatch[1] ?? srcMatch[2] ?? srcMatch[3])) || '')).trim();
    if (!src) return '';

    const alt = decodeCommonEntities(decodeNumericEntities((altMatch && (altMatch[1] ?? altMatch[2])) || '')).trim();

    const afterSlice = fullStr.slice(offset + full.length, offset + full.length + 500);
    const wikiFileMatch = /href\s*=\s*["'](https?:\/\/(?:commons\.wikimedia\.org|en\.wikipedia\.org)\/wiki\/File:[^"']+)["']/i.exec(afterSlice);
    const fallbackUrl = wikiFileMatch ? wikiFileMatch[1] : '';

    const idx = imageTokens.length;
    imageTokens.push({ src, alt, fallbackUrl });
    return `\u0006${idx}\u0006`;
  });

  text = text.replace(
    /<a\b[^>]*\bhref\s*=\s*(?:"r\s+([^"]*)"|'r\s+([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
    (_, dbl, sgl, labelRaw) => {
      const noteRaw = dbl !== undefined ? dbl : sgl;
      const clean = stripTagsPlain(safeDecodeUri(noteRaw || ''));
      if (!clean) return '';
      const label = cleanLabel(labelRaw).replace(/^\[|\]$/g, '') || '*';
      const idx = footnotes.length;
      footnotes.push(clean);
      footnoteLabels.push(label);
      return `\u0001${idx}\u0001`;
    }
  );

  const linkTokens = [];
  const pushLinkToken = (linkObj) => {
    const idx = linkTokens.length;
    linkTokens.push(linkObj);
    return `\u0005${idx}\u0005`;
  };

  text = text.replace(
    /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi,
    (_, dbl, sgl, bare, inner) => {
      if (/\u0006\d+\u0006/.test(inner)) {
        return inner;
      }
      const href = dbl ?? sgl ?? bare ?? '';
      const parsed = classifyHrefLink(href, inner);
      if (parsed) return pushLinkToken(parsed);
      return cleanLabel(inner);
    }
  );

  text = text.replace(/<W([GH])(\d[^<>]*)>/gi, (_, lang, rest) => {
    const num = String(rest || '').replace(/\uFF0B/g, '+').trim();
    if (!num || num === '0') return '';
    const code = `${lang.toUpperCase()}${num}`;
    return ` ${pushLinkToken({ kind: 'strong', target: code, moduleHint: '', label: code })}`;
  });

  text = text.replace(/<WT([^<>]+)>/gi, (_, morphRaw) => {
    const code = String(morphRaw || '').replace(/\s+l="[^"]*"/gi, '').trim();
    if (!code) return '';
    return ` ${pushLinkToken({ kind: 'morph', target: code, moduleHint: '', label: code })}`;
  });

  text = text.replace(/<RX\s*([^<>]+)>/gi, (_, refRaw) => {
    const ref = String(refRaw || '').trim();
    if (!ref) return '';
    const parsed = parseBibleReference(ref, { allowChapterOnly: true });
    if (parsed) return pushLinkToken(makeBibleLink(parsed, ref));
    return pushLinkToken({ kind: 'bible', target: ref, moduleHint: '', label: ref });
  });

  text = text
    .replace(/<(p|div)\b[^>]*class\s*=\s*["'][^"']*\binfo\b[^"']*["'][^>]*>/gi, '\u0007INFO_OPEN\u0007')
    .replace(/<(p|div)\b[^>]*class\s*=\s*["'][^"']*\bdefinition\b[^"']*["'][^>]*>/gi, '\u0007DEF_OPEN\u0007');

  let safe = escapeHtml(text);

  safe = safe
    .replace(/\u0007INFO_OPEN\u0007/g, '<div class="dct-info">')
    .replace(/\u0007DEF_OPEN\u0007/g, '<div class="dct-definition">')
    .replace(/&lt;TS\d?&gt;([\s\S]*?)&lt;\/?Ts\d?&gt;/gi, '<h4 class="dct-subhead">$1</h4>')
    .replace(/&lt;FR&gt;/g, '<span class="v-red">')
    .replace(/&lt;\/?Fr&gt;|&lt;\/FR&gt;/g, '</span>')
    .replace(/&lt;FI&gt;/g, '<em class="v-italic">')
    .replace(/&lt;\/?Fi&gt;|&lt;\/FI&gt;/g, '</em>')
    .replace(/&lt;FO&gt;/g, '<span class="v-quote">')
    .replace(/&lt;\/?Fo&gt;|&lt;\/FO&gt;/g, '</span>')
    .replace(/&lt;FU&gt;/g, '<u>')
    .replace(/&lt;\/?Fu&gt;|&lt;\/FU&gt;/g, '</u>')
    .replace(/&lt;CM&gt;|&lt;CL&gt;|&lt;CI&gt;/gi, '<br>')
    .replace(/&lt;PI\d?&gt;|&lt;PF\d?&gt;/gi, '<br><span class="v-indent"></span>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;hr\s*\/?&gt;/gi, '<hr class="dct-hr">')
    .replace(/&lt;(p|div|blockquote|ul|ol|li|table|thead|tbody|tr|td|th|h[1-6])(?:\s+(?:(?!&gt;|&lt;).)*)?&gt;/gi, '<$1>')
    .replace(/&lt;\/(p|div|blockquote|ul|ol|li|table|thead|tbody|tr|td|th|h[1-6])&gt;/gi, '</$1>')
    .replace(/&lt;(b|strong|i|em|u|sup|sub)&gt;/gi, '<$1>')
    .replace(/&lt;\/(b|strong|i|em|u|sup|sub)&gt;/gi, '</$1>')
    .replace(/&lt;\/?[a-zA-Z][a-zA-Z0-9_:*.-]*(?:[\s=](?:(?!&gt;|&lt;).)*)?\/?&gt;/g, '');

  safe = safe.replace(/<div class="dct-info">([\s\S]*?)<\/p>/gi, '<div class="dct-info">$1</div>');

  safe = decodeCommonEntities(safe)
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>')
    .replace(/(<br>\s*){3,}/g, '<br><br>')
    .replace(/^(?:<br>\s*)+/, '')
    .replace(/(<br>\s*)+$/, '')
    .trim();

  safe = safe.replace(/(?:<p>\s*)?\u0006(\d+)\u0006(?:\s*<\/p>)?/g, (_, idxStr) => {
    const img = imageTokens[Number(idxStr)];
    if (!img) return '';
    const fbAttr = img.fallbackUrl ? ` data-dct-img-fallback="${escapeHtml(img.fallbackUrl)}"` : '';
    return (
      '<figure class="dct-pic" data-bref-skip="1">' +
        `<img class="dct-img is-loading" data-dct-img-src="${escapeHtml(img.src)}"${fbAttr} alt="${escapeHtml(img.alt)}" />` +
      '</figure>'
    );
  });

  safe = safe.replace(/\u0005(\d+)\u0005/g, (_, idxStr) => {
    const link = linkTokens[Number(idxStr)];
    if (!link) return '';
    const labelHtml = escapeHtml(link.label);
    if (link.kind === 'bible') {
      return `<button type="button" class="dct-link dct-link--bible" data-bible-ref="${escapeHtml(link.target)}">${labelHtml}</button>`;
    }
    const modAttr = link.moduleHint ? ` data-dct-module="${escapeHtml(link.moduleHint)}"` : '';
    const extraCls = link.kind === 'strong'
      ? 'dct-link--strong'
      : link.kind === 'morph'
        ? 'dct-link--morph'
        : 'dct-link--term';
    return `<button type="button" class="dct-link ${extraCls}" data-dct-lookup="${escapeHtml(link.target)}"${modAttr}>${labelHtml}</button>`;
  });

  safe = safe.replace(/\u0001(\d+)\u0001/g, (_, idxStr) => {
    const idx = Number(idxStr);
    const label = footnoteLabels[idx] || '*';
    return `<button type="button" class="v-fn-btn" data-fn-idx="${idx}" aria-label="Ver nota">${escapeHtml(label)}</button>`;
  });

  return {
    html: safe,
    footnotes,
    hasImages: imageTokens.length > 0,
    isRtl: RE_RTL_SCRIPT.test(safe) && !/[A-Za-zÀ-ÿ]{12,}/.test(stripTagsPlain(rawData))
  };
}

async function resolveSchema(modulePath) {
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

  const preferredTables = ['dictionary', 'dict', 'entries', 'topics', 'lexicon'];
  let tableName = '';
  for (const pref of preferredTables) {
    const found = tableNames.find((t) => t.toLowerCase() === pref);
    if (found) {
      tableName = found;
      break;
    }
  }
  if (!tableName) {
    tableName = tableNames.find((t) => !/^(?:details|info|data|verse|sqlite_|android_metadata)/i.test(t)) || '';
  }
  if (!tableName) {
    throw new Error('Tabela de dicionário não encontrada no módulo.');
  }

  const infoRes = await nativeBridge.queryModule(
    modulePath,
    `PRAGMA table_info(${quoteIdent(tableName)})`
  );
  const cols = (Array.isArray(infoRes && infoRes.rows) ? infoRes.rows : [])
    .map((r) => String(getRowField(r, 'name') || ''))
    .filter(Boolean);

  const pickCol = (candidates, fallbackIdx) => {
    for (const c of candidates) {
      const found = cols.find((col) => col.toLowerCase() === c);
      if (found) return found;
    }
    return cols[fallbackIdx] || '';
  };

  const wordCol = pickCol(['word', 'topic', 'key', 'term', 'entry', 'strong', 'subject'], 0);
  const dataCol = pickCol(['data', 'definition', 'content', 'text', 'body', 'meaning'], 1);
  const altCol = cols.find((col) => col.toLowerCase() === 'alt_words') || '';

  if (!wordCol || !dataCol) {
    throw new Error(`Colunas do dicionário não identificadas na tabela ${tableName}.`);
  }

  const schema = {
    tableName,
    wordCol,
    dataCol,
    altCol,
    qTable: quoteIdent(tableName),
    qWord: quoteIdent(wordCol),
    qData: quoteIdent(dataCol),
    qAlt: altCol ? quoteIdent(altCol) : ''
  };
  schemaCache.set(modulePath, schema);
  return schema;
}

function buildStartsWithFilter(schema, startsWithRaw) {
  const bucket = String(startsWithRaw || '').trim();
  if (!bucket) return null;

  const firstExpr = `SUBSTR(LTRIM(${schema.qWord}), 1, 1)`;

  if (bucket === '0-9') {
    return {
      sql: `${firstExpr} IN ('0','1','2','3','4','5','6','7','8','9')`,
      params: []
    };
  }

  const upper = bucket.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(INITIAL_ACCENT_GROUPS, upper)) {
    const chars = INITIAL_ACCENT_GROUPS[upper];
    const placeholders = chars.map(() => '?').join(', ');
    return {
      sql: `${firstExpr} IN (${placeholders})`,
      params: chars
    };
  }

  return {
    sql: `${firstExpr} = ? COLLATE NOCASE`,
    params: [bucket]
  };
}

export const myswordDictionaryAdapter = {
  formatId: 'mysword_dct',
  resourceKind: 'dictionary',
  label: 'Dicionário MySword (.dct.mybible)',
  extensions: ['.dct.mybible'],

  clearCache(modulePath) {
    if (modulePath) {
      schemaCache.delete(modulePath);
      initialsCache.delete(modulePath);
    } else {
      schemaCache.clear();
      initialsCache.clear();
    }
  },

  async getEntryCount(modulePath) {
    const s = await resolveSchema(modulePath);
    const res = await nativeBridge.queryModule(
      modulePath,
      `SELECT COUNT(*) AS total FROM ${s.qTable}`
    );
    const row = res && Array.isArray(res.rows) ? res.rows[0] : null;
    return Number(getRowField(row, 'total')) || 0;
  },

  async getEntryInitials(modulePath) {
    if (initialsCache.has(modulePath)) {
      return initialsCache.get(modulePath);
    }

    const s = await resolveSchema(modulePath);
    const res = await nativeBridge.queryModule(
      modulePath,
      `SELECT DISTINCT SUBSTR(LTRIM(${s.qWord}), 1, 1) AS ch ` +
        `FROM ${s.qTable} ` +
        `WHERE ${s.qWord} IS NOT NULL AND TRIM(${s.qWord}) <> '' ` +
        `LIMIT 160`
    );
    const rows = Array.isArray(res && res.rows) ? res.rows : [];
    const seen = new Set();

    for (const r of rows) {
      const bucket = normalizeInitialBucket(getRowField(r, 'ch'));
      if (bucket && bucket !== '#') seen.add(bucket);
    }

    const list = Array.from(seen).sort((a, b) => {
      if (a === '0-9') return -1;
      if (b === '0-9') return 1;
      const aLat = /^[A-Z]$/.test(a);
      const bLat = /^[A-Z]$/.test(b);
      if (aLat && !bLat) return -1;
      if (!aLat && bLat) return 1;
      return a.localeCompare(b, 'pt-BR');
    });

    initialsCache.set(modulePath, list);
    return list;
  },

  async getEntryListPage(modulePath, options = {}) {
    const s = await resolveSchema(modulePath);
    const limit = Math.max(20, Math.min(Math.trunc(Number(options.limit) || 150), 300));
    const offset = Math.max(0, Math.trunc(Number(options.offset) || 0));
    const search = normalizeLookupTerm(options.search || '');
    const startsWith = String(options.startsWith || '').trim();
    const includeTotal = options.includeTotal !== undefined ? Boolean(options.includeTotal) : offset === 0;
    const accentSensitive = Boolean(options.accentSensitive);

    const whereParts = [`${s.qWord} IS NOT NULL`, `TRIM(${s.qWord}) <> ''`];
    const whereParams = [];

    if (startsWith) {
      const sw = buildStartsWithFilter(s, startsWith);
      if (sw) {
        whereParts.push(sw.sql);
        whereParams.push(...sw.params);
      }
    }

    const searchOpts = {
      matchMode: 'contains',
      accentSensitive,
      caseSensitive: false,
      searchAltWords: true,
      exactPhrase: false
    };

    if (search) {
      const filter = buildTitlePreFilterSql(s, search, searchOpts);
      whereParts.push(filter.sql);
      whereParams.push(...filter.params);
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const selectCols = s.qAlt
      ? `${s.qWord} AS word, ${s.qAlt} AS altWords`
      : `${s.qWord} AS word`;

    const orderSql = search
      ? `ORDER BY LENGTH(${s.qWord}) ASC, ${s.qWord} COLLATE NOCASE ASC`
      : `ORDER BY ${s.qWord} COLLATE NOCASE ASC`;

    if (search) {
      // Filtra exato no JS para eliminar falsos positivos dos curingas de acento
      const listRes = await nativeBridge.queryModule(
        modulePath,
        `SELECT ${selectCols} FROM ${s.qTable} ${whereSql} ${orderSql} LIMIT 400`,
        whereParams
      );
      const rows = Array.isArray(listRes && listRes.rows) ? listRes.rows : [];
      const matched = [];

      for (const r of rows) {
        const w = String(getRowField(r, 'word') || '').trim();
        const alt = s.qAlt ? String(getRowField(r, 'altwords') || '').trim() : '';
        if (!w) continue;
        const kind = matchEntryTitle(w, alt, search, searchOpts);
        if (!kind) continue;
        matched.push({ word: w, altWords: alt, kind });
      }

      const pri = { exact: 0, prefix: 1, title: 2 };
      matched.sort((a, b) => {
        const d = (pri[a.kind] ?? 9) - (pri[b.kind] ?? 9);
        if (d !== 0) return d;
        if (a.word.length !== b.word.length) return a.word.length - b.word.length;
        return a.word.localeCompare(b.word, 'pt-BR');
      });

      const sliced = matched.slice(offset, offset + limit).map(({ word, altWords }) => ({ word, altWords }));
      return {
        items: sliced,
        total: matched.length,
        hasMore: offset + limit < matched.length
      };
    }

    const fetchLimit = limit + 1;
    const listRes = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${selectCols} FROM ${s.qTable} ${whereSql} ${orderSql} LIMIT ${fetchLimit} OFFSET ${offset}`,
      whereParams
    );

    const rows = Array.isArray(listRes && listRes.rows) ? listRes.rows : [];
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const items = sliced
      .map((r) => ({
        word: String(getRowField(r, 'word') || '').trim(),
        altWords: s.qAlt ? String(getRowField(r, 'altwords') || '').trim() : ''
      }))
      .filter((it) => Boolean(it.word));

    let total = null;
    if (includeTotal) {
      const cntRes = await nativeBridge.queryModule(
        modulePath,
        `SELECT COUNT(*) AS total FROM ${s.qTable} ${whereSql}`,
        whereParams
      );
      const cntRow = cntRes && Array.isArray(cntRes.rows) ? cntRes.rows[0] : null;
      total = Number(getRowField(cntRow, 'total')) || 0;
    }

    return { items, total, hasMore };
  },

  async getEntryList(modulePath, options = {}) {
    const page = await this.getEntryListPage(modulePath, {
      limit: options.limit,
      offset: options.offset,
      search: options.prefix || options.search || '',
      startsWith: options.startsWith || '',
      includeTotal: false
    });
    return page.items.map((it) => it.word);
  },

  async findQuickMatch(modulePath, rawQuery, rawOptions = {}) {
    const s = await resolveSchema(modulePath);
    const clean = normalizeLookupTerm(rawQuery);
    if (!clean) return null;

    const opts = normalizeDictSearchOptions(rawOptions);
    const isStrongCode = /^[GH]\s*0*\d+[a-z]?$/i.test(clean);
    const isLouwNida = /^\d{1,2}\.\d{1,3}$/.test(clean);

    const titleOpts = (isStrongCode || isLouwNida)
      ? { ...opts, matchMode: 'exact' }
      : opts;

    const selectTitle = s.qAlt
      ? `${s.qWord} AS word, ${s.qAlt} AS altWords`
      : `${s.qWord} AS word`;

    const pre = buildTitlePreFilterSql(s, clean, titleOpts);
    const titleRes = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${selectTitle} FROM ${s.qTable} WHERE ${pre.sql} ORDER BY LENGTH(${s.qWord}) ASC LIMIT 40`,
      pre.params
    );

    const priority = { exact: 0, prefix: 1, title: 2 };
    let bestTitleHit = null;

    for (const row of (titleRes && titleRes.rows) || []) {
      const w = String(getRowField(row, 'word') || '').trim();
      const alt = s.qAlt ? String(getRowField(row, 'altwords') || '').trim() : '';
      if (!w) continue;

      const kind = matchEntryTitle(w, alt, clean, titleOpts);
      if (!kind) continue;

      if (!bestTitleHit || (priority[kind] ?? 9) < (priority[bestTitleHit.matchType] ?? 9)) {
        bestTitleHit = { word: w, matchType: kind };
        if (kind === 'exact') return bestTitleHit;
      }
    }

    if (bestTitleHit) return bestTitleHit;

    if (opts.searchBody && clean.length >= 2) {
      const bf = buildBodyPreFilterSql(s, clean, opts);
      if (bf) {
        const bodyRes = await nativeBridge.queryModule(
          modulePath,
          `SELECT ${s.qWord} AS word, ${s.qData} AS data FROM ${s.qTable} ` +
            `WHERE ${bf.sql} ORDER BY ${s.qWord} COLLATE NOCASE ASC LIMIT 16`,
          bf.params
        );
        for (const row of (bodyRes && bodyRes.rows) || []) {
          const w = String(getRowField(row, 'word') || '').trim();
          const data = String(getRowField(row, 'data') || '');
          if (!w) continue;
          if (matchEntryBody(data, clean, opts)) {
            return { word: w, matchType: 'body' };
          }
        }
      }
    }

    return null;
  },

  async getEntry(modulePath, rawTerm, rawOptions = {}) {
    const s = await resolveSchema(modulePath);
    const clean = normalizeLookupTerm(rawTerm);
    if (!clean) return null;

    const opts = normalizeDictSearchOptions({
      ...rawOptions,
      matchMode: 'exact'
    });

    const selectCols = s.qAlt
      ? `${s.qWord} AS word, ${s.qData} AS data, ${s.qAlt} AS altWords`
      : `${s.qWord} AS word, ${s.qData} AS data`;

    const candidates = buildLookupCandidates(clean, { accentSensitive: opts.accentSensitive });
    const placeholders = candidates.map(() => '?').join(', ');
    const directRes = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${selectCols} FROM ${s.qTable} WHERE ${s.qWord} IN (${placeholders}) COLLATE NOCASE LIMIT 10`,
      candidates
    );

    let chosenRow = null;
    for (const row of (directRes && directRes.rows) || []) {
      const w = String(getRowField(row, 'word') || '').trim();
      const alt = s.qAlt ? String(getRowField(row, 'altwords') || '').trim() : '';
      if (matchEntryTitle(w, alt, clean, opts) === 'exact') {
        chosenRow = row;
        break;
      }
    }

    if (!chosenRow) {
      const pre = buildTitlePreFilterSql(s, clean, opts);
      const foldRes = await nativeBridge.queryModule(
        modulePath,
        `SELECT ${selectCols} FROM ${s.qTable} WHERE ${pre.sql} ORDER BY LENGTH(${s.qWord}) ASC LIMIT 40`,
        pre.params
      );
      for (const row of (foldRes && foldRes.rows) || []) {
        const w = String(getRowField(row, 'word') || '').trim();
        const alt = s.qAlt ? String(getRowField(row, 'altwords') || '').trim() : '';
        if (matchEntryTitle(w, alt, clean, opts) === 'exact') {
          chosenRow = row;
          break;
        }
      }
    }

    if (!chosenRow) return null;

    const word = String(getRowField(chosenRow, 'word') || '');
    const raw = String(getRowField(chosenRow, 'data') || '');
    const parsed = formatMySwordDictionaryData(raw);

    return {
      word,
      raw,
      html: parsed.html,
      footnotes: parsed.footnotes,
      hasImages: parsed.hasImages,
      isRtl: parsed.isRtl
    };
  },

  async getFirstEntry(modulePath) {
    const s = await resolveSchema(modulePath);
    const res = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${s.qWord} AS word, ${s.qData} AS data FROM ${s.qTable} ` +
        `ORDER BY ${s.qWord} COLLATE NOCASE ASC LIMIT 1`
    );
    const row = res && Array.isArray(res.rows) ? res.rows[0] : null;
    if (!row) return null;

    const word = String(getRowField(row, 'word') || '');
    const raw = String(getRowField(row, 'data') || '');
    const parsed = formatMySwordDictionaryData(raw);

    return {
      word,
      raw,
      html: parsed.html,
      footnotes: parsed.footnotes,
      hasImages: parsed.hasImages,
      isRtl: parsed.isRtl
    };
  },

  async getAdjacentEntry(modulePath, currentWord, direction = 1) {
    const s = await resolveSchema(modulePath);
    const word = String(currentWord || '').trim();
    if (!word) return this.getFirstEntry(modulePath);

    const isNext = Number(direction) >= 0;
    const op = isNext ? '>' : '<';
    const order = isNext ? 'ASC' : 'DESC';

    const res = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${s.qWord} AS word, ${s.qData} AS data FROM ${s.qTable} ` +
        `WHERE ${s.qWord} ${op} ? COLLATE NOCASE ` +
        `ORDER BY ${s.qWord} COLLATE NOCASE ${order} LIMIT 1`,
      [word]
    );
    const row = res && Array.isArray(res.rows) ? res.rows[0] : null;
    if (!row) return null;

    const foundWord = String(getRowField(row, 'word') || '');
    const raw = String(getRowField(row, 'data') || '');
    const parsed = formatMySwordDictionaryData(raw);

    return {
      word: foundWord,
      raw,
      html: parsed.html,
      footnotes: parsed.footnotes,
      hasImages: parsed.hasImages,
      isRtl: parsed.isRtl
    };
  },

  async searchEntries(modulePath, rawQuery, rawOptions = {}) {
    const s = await resolveSchema(modulePath);
    const clean = normalizeLookupTerm(rawQuery);
    if (!clean) return [];

    const limit = Math.max(1, Math.min(Math.trunc(Number(rawOptions.limit) || 40), 120));
    const opts = normalizeDictSearchOptions(rawOptions);
    const results = [];
    const seen = new Set();

    const selectCols = s.qAlt
      ? `${s.qWord} AS word, ${s.qData} AS data, ${s.qAlt} AS altWords`
      : `${s.qWord} AS word, ${s.qData} AS data`;

    const pre = buildTitlePreFilterSql(s, clean, opts);
    const fetchCap = Math.min(320, Math.max(limit * 4, 80));

    const titleRes = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${selectCols} FROM ${s.qTable} WHERE ${pre.sql} ` +
        `ORDER BY LENGTH(${s.qWord}) ASC, ${s.qWord} COLLATE NOCASE ASC LIMIT ${fetchCap}`,
      pre.params
    );

    const titleMatches = [];
    for (const row of (titleRes && titleRes.rows) || []) {
      const w = String(getRowField(row, 'word') || '').trim();
      const key = w.toLowerCase();
      if (!w || seen.has(key)) continue;

      const alt = s.qAlt ? String(getRowField(row, 'altwords') || '').trim() : '';
      const matchType = matchEntryTitle(w, alt, clean, opts);
      if (!matchType) continue;

      seen.add(key);
      const rawData = String(getRowField(row, 'data') || '');
      const snip = buildSnippetData(rawData, clean, opts);
      titleMatches.push({
        word: w,
        matchType,
        snippet: snip.snippet,
        snippetHtml: snip.snippetHtml
      });
    }

    const matchOrder = { exact: 0, prefix: 1, title: 2, body: 3 };
    titleMatches.sort((a, b) => {
      const d = (matchOrder[a.matchType] ?? 9) - (matchOrder[b.matchType] ?? 9);
      if (d !== 0) return d;
      if (a.word.length !== b.word.length) return a.word.length - b.word.length;
      return a.word.localeCompare(b.word, 'pt-BR');
    });

    for (const item of titleMatches) {
      if (results.length >= limit) break;
      results.push(item);
    }

    if (opts.searchBody && results.length < limit && clean.length >= 2) {
      const remaining = limit - results.length;
      const bodyFetchCap = Math.min(200, Math.max(remaining * 4, 48));
      const bf = buildBodyPreFilterSql(s, clean, opts);

      if (bf) {
        const bodyRes = await nativeBridge.queryModule(
          modulePath,
          `SELECT ${s.qWord} AS word, ${s.qData} AS data FROM ${s.qTable} ` +
            `WHERE ${bf.sql} ` +
            `ORDER BY ${s.qWord} COLLATE NOCASE ASC LIMIT ${bodyFetchCap}`,
          bf.params
        );

        for (const row of (bodyRes && bodyRes.rows) || []) {
          if (results.length >= limit) break;
          const w = String(getRowField(row, 'word') || '').trim();
          const key = w.toLowerCase();
          if (!w || seen.has(key)) continue;

          const rawData = String(getRowField(row, 'data') || '');
          if (!matchEntryBody(rawData, clean, opts)) continue;

          seen.add(key);
          const snip = buildSnippetData(rawData, clean, opts);
          results.push({
            word: w,
            matchType: 'body',
            snippet: snip.snippet,
            snippetHtml: snip.snippetHtml
          });
        }
      }
    }

    return results;
  }
};
