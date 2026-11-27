import { nativeBridge } from '../bridge/native-bridge.js';
import { parseBibleReference } from '../core/bible-refs.js';

const schemaCache = new Map();

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

export function normalizeLookupTerm(rawTerm) {
  return String(rawTerm || '')
    .replace(/^[\s.,;:!?()[\]{}"'“”‘’«»—–\-]+|[\s.,;:!?()[\]{}"'“”‘’«»—–\-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildLookupCandidates(rawTerm) {
  const clean = normalizeLookupTerm(rawTerm);
  if (!clean) return [];

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

  const noAccents = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (noAccents && noAccents !== clean) {
    push(noAccents);
  }

  const noMarks = clean.normalize('NFD').replace(/[\u0300-\u036f\u0591-\u05C7\u0730-\u074A]/g, '');
  if (noMarks && noMarks !== clean) {
    push(noMarks);
  }

  return list;
}

function buildSnippet(rawData, query) {
  const plain = stripTagsPlain(rawData).replace(/\n+/g, ' ');
  if (!plain) return '';
  const q = normalizeLookupTerm(query).toLowerCase();
  if (!q) return plain.slice(0, 140) + (plain.length > 140 ? '…' : '');

  const idx = plain.toLowerCase().indexOf(q);
  if (idx < 0) {
    return plain.slice(0, 140) + (plain.length > 140 ? '…' : '');
  }

  const start = Math.max(0, idx - 48);
  const end = Math.min(plain.length, idx + q.length + 88);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < plain.length ? '…' : '';
  return `${prefix}${plain.slice(start, end).trim()}${suffix}`;
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

  // 1. Extrai notas <RF>...</Rf>
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

  // 1b. Extrai imagens <img ... src="..."> (e eventual URL Wikimedia próxima para fallback)
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

  // 1c. Extrai notas embutidas <a href="r ...">[3]</a>
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

  // 2. Converte links internos, Strong, Morfologia e referências <RX> em tokens clicáveis
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

  // 3. Preserva classes estruturais úteis (.info e .definition) antes de escapar HTML
  text = text
    .replace(/<(p|div)\b[^>]*class\s*=\s*["'][^"']*\binfo\b[^"']*["'][^>]*>/gi, '\u0007INFO_OPEN\u0007')
    .replace(/<(p|div)\b[^>]*class\s*=\s*["'][^"']*\bdefinition\b[^"']*["'][^>]*>/gi, '\u0007DEF_OPEN\u0007');

  // 4. Escapa HTML e restaura apenas tags estruturais seguras (sem cores inline fixas)
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

  // 5. Restaura figuras de imagem
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

  // 6. Restaura links clicáveis
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

  // 7. Restaura notas de rodapé
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

export const myswordDictionaryAdapter = {
  formatId: 'mysword_dct',
  resourceKind: 'dictionary',
  label: 'Dicionário MySword (.dct.mybible)',
  extensions: ['.dct.mybible'],

  clearCache(modulePath) {
    if (modulePath) {
      schemaCache.delete(modulePath);
    } else {
      schemaCache.clear();
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

  async getEntryList(modulePath, options = {}) {
    const s = await resolveSchema(modulePath);
    const limit = Math.max(1, Math.min(Number(options.limit) || 120, 400));
    const offset = Math.max(0, Number(options.offset) || 0);
    const prefix = normalizeLookupTerm(options.prefix || '');

    let sql;
    let params;
    if (prefix) {
      sql =
        `SELECT ${s.qWord} AS word FROM ${s.qTable} ` +
        `WHERE ${s.qWord} LIKE ? COLLATE NOCASE ` +
        `ORDER BY CASE WHEN ${s.qWord} = ? COLLATE NOCASE THEN 0 ` +
        `WHEN ${s.qWord} LIKE ? COLLATE NOCASE THEN 1 ELSE 2 END, ` +
        `LENGTH(${s.qWord}) ASC, ${s.qWord} COLLATE NOCASE ASC ` +
        `LIMIT ? OFFSET ?`;
      params = [`%${prefix}%`, prefix, `${prefix}%`, limit, offset];
    } else {
      sql =
        `SELECT ${s.qWord} AS word FROM ${s.qTable} ` +
        `ORDER BY ${s.qWord} COLLATE NOCASE ASC LIMIT ? OFFSET ?`;
      params = [limit, offset];
    }

    const res = await nativeBridge.queryModule(modulePath, sql, params);
    const rows = Array.isArray(res && res.rows) ? res.rows : [];
    return rows.map((r) => String(getRowField(r, 'word') || '')).filter(Boolean);
  },

  // Consulta rápida (LIMIT 1 sem ler coluna data) para filtrar quais dicionários possuem o termo
  async findQuickMatch(modulePath, rawQuery, options = {}) {
    const s = await resolveSchema(modulePath);
    const clean = normalizeLookupTerm(rawQuery);
    if (!clean) return null;

    const searchBody = Boolean(options.searchBody);
    const candidates = buildLookupCandidates(clean);
    const isStrongCode = /^[GH]\s*0*\d+[a-z]?$/i.test(clean);
    const isLouwNida = /^\d{1,2}\.\d{1,3}$/.test(clean);

    // 1. Correspondência exata em word (cobre variações de Strong e sem acentos)
    const placeholders = candidates.map(() => '?').join(', ');
    const exactRes = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${s.qWord} AS word FROM ${s.qTable} ` +
        `WHERE ${s.qWord} IN (${placeholders}) COLLATE NOCASE LIMIT 1`,
      candidates
    );
    const exactRow = exactRes && Array.isArray(exactRes.rows) ? exactRes.rows[0] : null;
    if (exactRow) {
      const w = String(getRowField(exactRow, 'word') || '').trim();
      if (w) return { word: w, matchType: 'exact' };
    }

    // 2. Correspondência exata em sinônimos (alt_words, quando o dicionário possuir)
    if (s.qAlt) {
      const altRes = await nativeBridge.queryModule(
        modulePath,
        `SELECT ${s.qWord} AS word FROM ${s.qTable} ` +
          `WHERE ${s.qAlt} = ? COLLATE NOCASE ` +
          `OR ${s.qAlt} LIKE ? COLLATE NOCASE ` +
          `OR ${s.qAlt} LIKE ? COLLATE NOCASE ` +
          `OR ${s.qAlt} LIKE ? COLLATE NOCASE LIMIT 1`,
        [clean, `${clean},%`, `%, ${clean}`, `%, ${clean},%`]
      );
      const altRow = altRes && Array.isArray(altRes.rows) ? altRes.rows[0] : null;
      if (altRow) {
        const w = String(getRowField(altRow, 'word') || '').trim();
        if (w) return { word: w, matchType: 'exact' };
      }
    }

    // 3. Para Strong ou Louw-Nida, evita falso positivo em títulos parciais (ex.: H430 casando H4300)
    if (!isStrongCode && !isLouwNida) {
      const noAccents = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const hasAltSpell = Boolean(noAccents && noAccents.toLowerCase() !== clean.toLowerCase());

      if (clean.length <= 2) {
        // Termos curtos (ex.: Jó, fé): apenas início de verbete delimitado
        const shortRes = await nativeBridge.queryModule(
          modulePath,
          `SELECT ${s.qWord} AS word FROM ${s.qTable} ` +
            `WHERE ${s.qWord} LIKE ? COLLATE NOCASE ` +
            `OR ${s.qWord} LIKE ? COLLATE NOCASE ` +
            `OR ${s.qWord} LIKE ? COLLATE NOCASE ` +
            `ORDER BY LENGTH(${s.qWord}) ASC LIMIT 1`,
          [`${clean} %`, `${clean},%`, `${clean};%`]
        );
        const shortRow = shortRes && Array.isArray(shortRes.rows) ? shortRes.rows[0] : null;
        if (shortRow) {
          const w = String(getRowField(shortRow, 'word') || '').trim();
          if (w) return { word: w, matchType: 'prefix' };
        }
      } else {
        // Prefixo em word
        const prefSql = hasAltSpell
          ? `SELECT ${s.qWord} AS word FROM ${s.qTable} WHERE ${s.qWord} LIKE ? COLLATE NOCASE OR ${s.qWord} LIKE ? COLLATE NOCASE ORDER BY LENGTH(${s.qWord}) ASC LIMIT 1`
          : `SELECT ${s.qWord} AS word FROM ${s.qTable} WHERE ${s.qWord} LIKE ? COLLATE NOCASE ORDER BY LENGTH(${s.qWord}) ASC LIMIT 1`;
        const prefParams = hasAltSpell ? [`${clean}%`, `${noAccents}%`] : [`${clean}%`];
        const prefRes = await nativeBridge.queryModule(modulePath, prefSql, prefParams);
        const prefRow = prefRes && Array.isArray(prefRes.rows) ? prefRes.rows[0] : null;
        if (prefRow) {
          const w = String(getRowField(prefRow, 'word') || '').trim();
          if (w) return { word: w, matchType: 'prefix' };
        }

        // Contém no título (ou em alt_words)
        const titleClauses = [`${s.qWord} LIKE ? COLLATE NOCASE`];
        const titleParams = [`%${clean}%`];
        if (hasAltSpell) {
          titleClauses.push(`${s.qWord} LIKE ? COLLATE NOCASE`);
          titleParams.push(`%${noAccents}%`);
        }
        if (s.qAlt) {
          titleClauses.push(`${s.qAlt} LIKE ? COLLATE NOCASE`);
          titleParams.push(`%${clean}%`);
        }
        const titleRes = await nativeBridge.queryModule(
          modulePath,
          `SELECT ${s.qWord} AS word FROM ${s.qTable} ` +
            `WHERE ${titleClauses.join(' OR ')} ` +
            `ORDER BY LENGTH(${s.qWord}) ASC LIMIT 1`,
          titleParams
        );
        const titleRow = titleRes && Array.isArray(titleRes.rows) ? titleRes.rows[0] : null;
        if (titleRow) {
          const w = String(getRowField(titleRow, 'word') || '').trim();
          if (w) return { word: w, matchType: 'title' };
        }
      }
    }

    // 4. Opcional: busca no corpo da definição somente quando "No texto" estiver ativo
    if (searchBody && clean.length >= 2) {
      const bodyTerm = isStrongCode ? candidates[0] : clean;
      const bodyRes = await nativeBridge.queryModule(
        modulePath,
        `SELECT ${s.qWord} AS word FROM ${s.qTable} ` +
          `WHERE ${s.qData} LIKE ? COLLATE NOCASE LIMIT 1`,
        [`%${bodyTerm}%`]
      );
      const bodyRow = bodyRes && Array.isArray(bodyRes.rows) ? bodyRes.rows[0] : null;
      if (bodyRow) {
        const w = String(getRowField(bodyRow, 'word') || '').trim();
        if (w) return { word: w, matchType: 'body' };
      }
    }

    return null;
  },

  async getEntry(modulePath, rawTerm) {
    const s = await resolveSchema(modulePath);
    const candidates = buildLookupCandidates(rawTerm);
    if (!candidates.length) return null;

    const placeholders = candidates.map(() => '?').join(', ');
    const res = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${s.qWord} AS word, ${s.qData} AS data FROM ${s.qTable} ` +
        `WHERE ${s.qWord} IN (${placeholders}) COLLATE NOCASE LIMIT 1`,
      candidates
    );
    let row = res && Array.isArray(res.rows) ? res.rows[0] : null;

    if (!row && s.qAlt) {
      const primary = candidates[0];
      const altRes = await nativeBridge.queryModule(
        modulePath,
        `SELECT ${s.qWord} AS word, ${s.qData} AS data FROM ${s.qTable} ` +
          `WHERE ${s.qAlt} = ? COLLATE NOCASE OR ${s.qAlt} LIKE ? COLLATE NOCASE LIMIT 1`,
        [primary, `%${primary}%`]
      );
      row = altRes && Array.isArray(altRes.rows) ? altRes.rows[0] : null;
    }

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

  async searchEntries(modulePath, rawQuery, options = {}) {
    const s = await resolveSchema(modulePath);
    const clean = normalizeLookupTerm(rawQuery);
    if (!clean) return [];

    const limit = Math.max(1, Math.min(Number(options.limit) || 40, 120));
    const searchBody = Boolean(options.searchBody);
    const candidates = buildLookupCandidates(clean);
    const results = [];
    const seen = new Set();

    const placeholders = candidates.map(() => '?').join(', ');
    const exactRes = await nativeBridge.queryModule(
      modulePath,
      `SELECT ${s.qWord} AS word, ${s.qData} AS data FROM ${s.qTable} ` +
        `WHERE ${s.qWord} IN (${placeholders}) COLLATE NOCASE LIMIT 5`,
      candidates
    );
    for (const row of (exactRes && exactRes.rows) || []) {
      const w = String(getRowField(row, 'word') || '');
      const key = w.toLowerCase();
      if (!w || seen.has(key)) continue;
      seen.add(key);
      results.push({
        word: w,
        matchType: 'exact',
        snippet: buildSnippet(getRowField(row, 'data'), clean)
      });
    }

    if (results.length < limit) {
      const whereClause = s.qAlt
        ? `(${s.qWord} LIKE ? COLLATE NOCASE OR ${s.qAlt} LIKE ? COLLATE NOCASE)`
        : `${s.qWord} LIKE ? COLLATE NOCASE`;
      const params = s.qAlt
        ? [`%${clean}%`, `%${clean}%`, `${clean}%`, limit]
        : [`%${clean}%`, `${clean}%`, limit];

      const titleRes = await nativeBridge.queryModule(
        modulePath,
        `SELECT ${s.qWord} AS word, ${s.qData} AS data FROM ${s.qTable} ` +
          `WHERE ${whereClause} ` +
          `ORDER BY CASE WHEN ${s.qWord} LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END, ` +
          `LENGTH(${s.qWord}) ASC, ${s.qWord} COLLATE NOCASE ASC LIMIT ?`,
        params
      );
      for (const row of (titleRes && titleRes.rows) || []) {
        if (results.length >= limit) break;
        const w = String(getRowField(row, 'word') || '');
        const key = w.toLowerCase();
        if (!w || seen.has(key)) continue;
        seen.add(key);
        results.push({
          word: w,
          matchType: w.toLowerCase().startsWith(clean.toLowerCase()) ? 'prefix' : 'title',
          snippet: buildSnippet(getRowField(row, 'data'), clean)
        });
      }
    }

    if (searchBody && results.length < limit && clean.length >= 2) {
      const remaining = limit - results.length;
      const bodyRes = await nativeBridge.queryModule(
        modulePath,
        `SELECT ${s.qWord} AS word, ${s.qData} AS data FROM ${s.qTable} ` +
          `WHERE ${s.qData} LIKE ? COLLATE NOCASE ` +
          `ORDER BY ${s.qWord} COLLATE NOCASE ASC LIMIT ?`,
        [`%${clean}%`, remaining + 10]
      );
      for (const row of (bodyRes && bodyRes.rows) || []) {
        if (results.length >= limit) break;
        const w = String(getRowField(row, 'word') || '');
        const key = w.toLowerCase();
        if (!w || seen.has(key)) continue;
        seen.add(key);
        results.push({
          word: w,
          matchType: 'body',
          snippet: buildSnippet(getRowField(row, 'data'), clean)
        });
      }
    }

    return results;
  }
};
