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

const SQL_ACCENT_FOLD_MAP = [
  ['á', 'a'], ['à', 'a'], ['â', 'a'], ['ã', 'a'], ['ä', 'a'], ['å', 'a'],
  ['Á', 'a'], ['À', 'a'], ['Â', 'a'], ['Ã', 'a'], ['Ä', 'a'], ['Å', 'a'],
  ['é', 'e'], ['è', 'e'], ['ê', 'e'], ['ë', 'e'],
  ['É', 'e'], ['È', 'e'], ['Ê', 'e'], ['Ë', 'e'],
  ['í', 'i'], ['ì', 'i'], ['î', 'i'], ['ï', 'i'],
  ['Í', 'i'], ['Ì', 'i'], ['Î', 'i'], ['Ï', 'i'],
  ['ó', 'o'], ['ò', 'o'], ['ô', 'o'], ['õ', 'o'], ['ö', 'o'],
  ['Ó', 'o'], ['Ò', 'o'], ['Ô', 'o'], ['Õ', 'o'], ['Ö', 'o'],
  ['ú', 'u'], ['ù', 'u'], ['û', 'u'], ['ü', 'u'],
  ['Ú', 'u'], ['Ù', 'u'], ['Û', 'u'], ['Ü', 'u'],
  ['ç', 'c'], ['Ç', 'c'], ['ñ', 'n'], ['Ñ', 'n'], ['ý', 'y'], ['Ý', 'y']
];

const SQL_ACCENT_CASE_MAP = [
  ['Á', 'á'], ['À', 'à'], ['Â', 'â'], ['Ã', 'ã'], ['Ä', 'ä'],
  ['É', 'é'], ['È', 'è'], ['Ê', 'ê'], ['Ë', 'ë'],
  ['Í', 'í'], ['Ì', 'ì'], ['Î', 'î'], ['Ï', 'ï'],
  ['Ó', 'ó'], ['Ò', 'ò'], ['Ô', 'ô'], ['Õ', 'õ'], ['Ö', 'ö'],
  ['Ú', 'ú'], ['Ù', 'ù'], ['Û', 'û'], ['Ü', 'ü'],
  ['Ç', 'ç'], ['Ñ', 'ñ'], ['Ý', 'ý']
];

const PT_SHORT_VARIANTS = {
  a: ['a', 'á', 'à', 'â', 'ã'],
  e: ['e', 'é', 'ê'],
  i: ['i', 'í'],
  o: ['o', 'ó', 'ô', 'õ'],
  u: ['u', 'ú'],
  c: ['c', 'ç'],
  n: ['n', 'ñ']
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

function escapeLike(str) {
  return String(str || '').replace(/[\\%_]/g, '\\$&');
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

function buildSqlFoldExpr(colExpr, accentSensitive) {
  const map = accentSensitive ? SQL_ACCENT_CASE_MAP : SQL_ACCENT_FOLD_MAP;
  let expr = `lower(${colExpr})`;
  for (const [from, to] of map) {
    expr = `replace(${expr}, '${from}', '${to}')`;
  }
  return expr;
}

function foldSqlParam(str, accentSensitive) {
  let out = String(str || '').normalize('NFC');
  if (!accentSensitive) {
    out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
  }
  return out.toLowerCase();
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

  // 1. Correspondência exata de código Strong (ex.: H430 <-> H0430)
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

  // 2. Testa no título principal (`word`)
  if (singleOrPhrase) {
    const needle = foldedTokens[0];
    if (foldedWord === needle) return 'exact';

    if (opts.matchMode === 'exact') {
      // No modo exato, também aceita palavra inteira se o título tiver subtítulo separado por vírgula/parêntese
      const subParts = String(word || '').split(/[,;(/]+/).map((p) => foldForMatch(p, opts)).filter(Boolean);
      if (subParts.includes(needle)) return 'exact';
    } else if (opts.matchMode === 'startsWith') {
      if (foldedWord.startsWith(needle)) return 'prefix';
    } else {
      if (foldedWord.startsWith(needle)) return 'prefix';
      if (foldedWord.includes(needle)) return 'title';
    }
  } else {
    // Múltiplas palavras (todas devem aparecer no título)
    const allMatch = foldedTokens.every((tok) => testTokenInText(foldedWord, tok, opts.matchMode, false));
    if (allMatch) {
      return foldedWord.startsWith(foldedTokens[0]) ? 'prefix' : 'title';
    }
  }

  // 3. Testa nos sinônimos (`alt_words`), se habilitado
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

function expandShortAccentVariants(token, maxOut = 8) {
  const base = token.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let results = [''];
  for (const ch of base) {
    const opts = PT_SHORT_VARIANTS[ch] || [ch];
    const next = [];
    for (const prefix of results) {
      for (const c of opts) {
        next.push(prefix + c);
        if (next.length >= maxOut) break;
      }
      if (next.length >= maxOut) break;
    }
    results = next;
  }
  return results;
}

function buildBodyPreFilterSql(colSql, token, opts) {
  const cleanTok = String(token || '').trim();
  if (!cleanTok) return null;

  // Se tiver acento ou for busca sensível a acento
  if (opts.accentSensitive) {
    if (opts.caseSensitive) {
      return {
        sql: `instr(${colSql}, ?) > 0`,
        params: [cleanTok]
      };
    }
    const variants = [];
    const addV = (v) => {
      if (v && !variants.includes(v)) variants.push(v);
    };
    addV(cleanTok);
    addV(cleanTok.toLowerCase());
    addV(cleanTok.toUpperCase());
    if (cleanTok.length > 1) {
      addV(cleanTok.charAt(0).toUpperCase() + cleanTok.slice(1).toLowerCase());
    }
    return {
      sql: `(${variants.map(() => `${colSql} LIKE ? ESCAPE '\\'`).join(' OR ')})`,
      params: variants.map((v) => `%${escapeLike(v)}%`)
    };
  }

  // Sem diferenciar acentos: substitui letras acentuáveis por '_' quando há base suficiente
  const stripped = cleanTok.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let solidCount = 0;
  let wildcardPat = '';
  for (const ch of stripped) {
    const lower = ch.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(PT_SHORT_VARIANTS, lower)) {
      wildcardPat += '_';
    } else {
      if (/[a-z0-9]/i.test(ch)) solidCount++;
      wildcardPat += escapeLike(ch);
    }
  }

  if (solidCount >= 2 || (solidCount >= 1 && stripped.length >= 4)) {
    return {
      sql: `${colSql} LIKE ? ESCAPE '\\'`,
      params: [`%${wildcardPat}%`]
    };
  }

  // Palavras muito curtas ou só vogais (ex.: "fe", "jo", "pao"): usa variantes acentuadas comuns
  const variants = expandShortAccentVariants(stripped, 8);
  const allForms = [];
  for (const v of variants) {
    if (!allForms.includes(v)) allForms.push(v);
    const cap = v.charAt(0).toUpperCase() + v.slice(1);
    if (cap !== v && !allForms.includes(cap)) allForms.push(cap);
  }
  const capped = allForms.slice(0, 10);
  return {
    sql: `(${capped.map(() => `${colSql} LIKE ? ESCAPE '\\'`).join(' OR ')})`,
    params: capped.map((v) => `%${escapeLike(v)}%`)
  };
}

function buildTitlePreFilterSql(schema, rawQuery, opts) {
  const clean = normalizeLookupTerm(rawQuery);
  const tokens = splitSearchTokens(clean, opts);
  const hasNonLatin = /[\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF\u0700-\u074F]/.test(clean);

  // Para grego/hebraico/siríaco sem acentos, faz busca direta com candidatos sem marcas
  if (hasNonLatin) {
    const cands = buildLookupCandidates(clean, { accentSensitive: opts.accentSensitive });
    const cols = [schema.qWord];
    if (opts.searchAltWords && schema.qAlt) cols.push(schema.qAlt);
    const clauses = [];
    const params = [];

    for (const col of cols) {
      for (const c of cands) {
        const esc = escapeLike(c);
        const pat = opts.matchMode === 'startsWith' ? `${esc}%` : `%${esc}%`;
        clauses.push(`${col} LIKE ? ESCAPE '\\' COLLATE NOCASE`);
        params.push(pat);
      }
    }
    return { sql: `(${clauses.join(' OR ')})`, params };
  }

  const wordExpr = buildSqlFoldExpr(schema.qWord, opts.accentSensitive);
  const altExpr = opts.searchAltWords && schema.qAlt
    ? buildSqlFoldExpr(schema.qAlt, opts.accentSensitive)
    : '';

  const buildTokenGroup = (colExpr) => {
    const subClauses = [];
    const subParams = [];

    if (tokens.length === 1 && /^[GH]\s*0*\d+[a-z]?$/i.test(tokens[0])) {
      const strongCands = buildLookupCandidates(tokens[0], { accentSensitive: opts.accentSensitive })
        .map((c) => foldSqlParam(c, opts.accentSensitive));
      const parts = [];
      for (const sc of strongCands) {
        const esc = escapeLike(sc);
        if (opts.matchMode === 'exact') {
          parts.push(`${colExpr} = ?`);
          subParams.push(sc);
        } else if (opts.matchMode === 'startsWith') {
          parts.push(`${colExpr} LIKE ? ESCAPE '\\'`);
          subParams.push(`${esc}%`);
        } else {
          parts.push(`${colExpr} LIKE ? ESCAPE '\\'`);
          subParams.push(`%${esc}%`);
        }
      }
      return { sql: `(${parts.join(' OR ')})`, params: subParams };
    }

    for (const tok of tokens) {
      const foldedTok = foldSqlParam(tok, opts.accentSensitive);
      const esc = escapeLike(foldedTok);
      if (tokens.length === 1 && opts.matchMode === 'startsWith') {
        subClauses.push(`${colExpr} LIKE ? ESCAPE '\\'`);
        subParams.push(`${esc}%`);
      } else {
        subClauses.push(`${colExpr} LIKE ? ESCAPE '\\'`);
        subParams.push(`%${esc}%`);
      }
    }

    return { sql: `(${subClauses.join(' AND ')})`, params: subParams };
  };

  const wordGrp = buildTokenGroup(wordExpr);
  if (!altExpr) return wordGrp;

  const altGrp = buildTokenGroup(altExpr);
  return {
    sql: `(${wordGrp.sql} OR ${altGrp.sql})`,
    params: [...wordGrp.params, ...altGrp.params]
  };
}

function findMatchRangeInPlain(plain, rawQuery, opts) {
  const clean = normalizeLookupTerm(rawQuery);
  if (!plain || !clean) return null;

  const tokens = splitSearchTokens(clean, opts);
  const firstTok = tokens[0] || clean;
  const targetFold = foldForMatch(firstTok, opts);
  if (!targetFold) return null;

  // Mapeia posição no texto normalizado de volta para o índice real em `plain`
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
  let matchLen = targetFold.length;

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

    if (search) {
      const filter = buildTitlePreFilterSql(s, search, {
        matchMode: 'contains',
        accentSensitive,
        caseSensitive: false,
        searchAltWords: true,
        exactPhrase: false
      });
      whereParts.push(filter.sql);
      whereParams.push(...filter.params);
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const selectCols = s.qAlt
      ? `${s.qWord} AS word, ${s.qAlt} AS altWords`
      : `${s.qWord} AS word`;

    let orderSql;
    const queryParams = [...whereParams];
    if (search) {
      const foldedExpr = buildSqlFoldExpr(s.qWord, accentSensitive);
      const foldedSearch = foldSqlParam(search, accentSensitive);
      orderSql =
        `ORDER BY CASE WHEN ${foldedExpr} = ? THEN 0 ` +
        `WHEN ${foldedExpr} LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END, ` +
        `LENGTH(${s.qWord}) ASC, ${s.qWord} COLLATE NOCASE ASC`;
      queryParams.push(foldedSearch, `${escapeLike(foldedSearch)}%`);
    } else {
      orderSql = `ORDER BY ${s.qWord} COLLATE NOCASE ASC`;
    }

    const fetchLimit = limit + 1;
    const listRes = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${selectCols} FROM ${s.qTable} ${whereSql} ${orderSql} LIMIT ${fetchLimit} OFFSET ${offset}`,
      queryParams
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

  // Consulta rápida respeitando todas as opções de busca (usada no filtro de dicionários)
  async findQuickMatch(modulePath, rawQuery, rawOptions = {}) {
    const s = await resolveSchema(modulePath);
    const clean = normalizeLookupTerm(rawQuery);
    if (!clean) return null;

    const opts = normalizeDictSearchOptions(rawOptions);
    const isStrongCode = /^[GH]\s*0*\d+[a-z]?$/i.test(clean);
    const isLouwNida = /^\d{1,2}\.\d{1,3}$/.test(clean);

    // Para Strong ou Louw-Nida no filtro de dicionários, força correspondência exata no título
    const titleOpts = (isStrongCode || isLouwNida)
      ? { ...opts, matchMode: 'exact' }
      : opts;

    // 1. Verifica títulos (e sinônimos, se ativo) sem ler a coluna `data`
    const selectTitle = s.qAlt
      ? `${s.qWord} AS word, ${s.qAlt} AS altWords`
      : `${s.qWord} AS word`;

    const pre = buildTitlePreFilterSql(s, clean, titleOpts);
    const titleRes = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${selectTitle} FROM ${s.qTable} WHERE ${pre.sql} ORDER BY LENGTH(${s.qWord}) ASC LIMIT 24`,
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

    // 2. Opcional: verifica no corpo da definição somente quando "No texto" estiver ativo
    if (opts.searchBody && clean.length >= 2) {
      const tokens = splitSearchTokens(clean, opts);
      const tokenClauses = [];
      const tokenParams = [];

      for (const tok of tokens) {
        const bf = buildBodyPreFilterSql(s.qData, tok, opts);
        if (bf) {
          tokenClauses.push(bf.sql);
          tokenParams.push(...bf.params);
        }
      }

      if (tokenClauses.length) {
        const bodyRes = await nativeBridge.queryModule(
          modulePath,
          `SELECT ${s.qWord} AS word, ${s.qData} AS data FROM ${s.qTable} ` +
            `WHERE ${tokenClauses.join(' AND ')} ORDER BY ${s.qWord} COLLATE NOCASE ASC LIMIT 12`,
          tokenParams
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

    // 1. Tenta correspondência direta rápida por candidatos
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

    // 2. Se não achou na busca direta (ex.: "abraao" -> "Abraão" ou sinônimo), usa busca dobrada por acento
    if (!chosenRow) {
      const pre = buildTitlePreFilterSql(s, clean, opts);
      const foldRes = await nativeBridge.queryModule(
        modulePath,
        `SELECT ${selectCols} FROM ${s.qTable} WHERE ${pre.sql} ORDER BY LENGTH(${s.qWord}) ASC LIMIT 20`,
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

    // 1. Busca em títulos e sinônimos com validação Unicode exata
    const pre = buildTitlePreFilterSql(s, clean, opts);
    const fetchCap = Math.min(240, Math.max(limit * 3, 60));
    const foldedExpr = buildSqlFoldExpr(s.qWord, opts.accentSensitive);
    const firstTokenFolded = foldSqlParam(splitSearchTokens(clean, opts)[0] || clean, opts.accentSensitive);

    const titleRes = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${selectCols} FROM ${s.qTable} WHERE ${pre.sql} ` +
        `ORDER BY CASE WHEN ${foldedExpr} = ? THEN 0 ` +
        `WHEN ${foldedExpr} LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END, ` +
        `LENGTH(${s.qWord}) ASC, ${s.qWord} COLLATE NOCASE ASC LIMIT ${fetchCap}`,
      [...pre.params, firstTokenFolded, `${escapeLike(firstTokenFolded)}%`]
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

    // 2. Busca no corpo das definições (ignorando tags HTML), se "No texto" estiver ativo
    if (opts.searchBody && results.length < limit && clean.length >= 2) {
      const remaining = limit - results.length;
      const bodyFetchCap = Math.min(200, Math.max(remaining * 4, 48));
      const tokens = splitSearchTokens(clean, opts);
      const tokenClauses = [];
      const tokenParams = [];

      for (const tok of tokens) {
        const bf = buildBodyPreFilterSql(s.qData, tok, opts);
        if (bf) {
          tokenClauses.push(bf.sql);
          tokenParams.push(...bf.params);
        }
      }

      if (tokenClauses.length) {
        const bodyRes = await nativeBridge.queryModule(
          modulePath,
          `SELECT ${s.qWord} AS word, ${s.qData} AS data FROM ${s.qTable} ` +
            `WHERE ${tokenClauses.join(' AND ')} ` +
            `ORDER BY ${s.qWord} COLLATE NOCASE ASC LIMIT ${bodyFetchCap}`,
          tokenParams
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
