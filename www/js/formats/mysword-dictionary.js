import { nativeBridge } from '../bridge/native-bridge.js';

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

  // Variações de códigos Strong (ex.: H430, H0430, H00430, 430)
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

  // Sem acentos latinos (útil para buscas em dicionários sem acentuação)
  const noAccents = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (noAccents && noAccents !== clean) {
    push(noAccents);
  }

  // Sem niqqud/cantilação hebraica ou acentos politônicos gregos
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

function classifyHrefLink(hrefRaw, labelText) {
  const href = decodeCommonEntities(decodeNumericEntities(String(hrefRaw || ''))).trim();
  const label = cleanLabel(labelText) || href;

  // Referência bíblica: b40.1.1 ou b1.1.1-5
  const bibleMatch = /^b\s*(.+)$/i.exec(href);
  if (bibleMatch) {
    return {
      kind: 'bible',
      target: bibleMatch[1].trim(),
      moduleHint: '',
      label
    };
  }

  // Código Strong: sH430 ou sG976
  const strongMatch = /^s\s*([GH]\d+[a-z]?)$/i.exec(href);
  if (strongMatch) {
    return {
      kind: 'strong',
      target: strongMatch[1].toUpperCase(),
      moduleHint: '',
      label
    };
  }

  // Morfologia: mN-NSF
  const morphMatch = /^m\s*(.+)$/i.exec(href);
  if (morphMatch) {
    return {
      kind: 'morph',
      target: morphMatch[1].trim(),
      moduleHint: '',
      label
    };
  }

  // Link para outro dicionário específico: d-Strong H430 ou d-LouwNida 33.38
  const modDictMatch = /^d-([^\s]+)\s+(.+)$/i.exec(href);
  if (modDictMatch) {
    return {
      kind: 'term',
      target: modDictMatch[2].trim(),
      moduleHint: modDictMatch[1].trim(),
      label
    };
  }

  // Link para verbete no dicionário atual: dPalavra ou #Palavra
  const dictMatch = /^(?:d|#)([\s\S]+)$/i.exec(href);
  if (dictMatch) {
    return {
      kind: 'term',
      target: dictMatch[1].trim(),
      moduleHint: '',
      label
    };
  }

  return null;
}

function cleanLabel(str) {
  return stripTagsPlain(str).replace(/\s+/g, ' ').trim();
}

export function formatMySwordDictionaryData(rawData) {
  let text = decodeNumericEntities(String(rawData || '').replace(/\r\n/g, '\n'));

  // Remove blocos perigosos
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

  text = text.replace(/<RX\s+([^<>]+)>/gi, (_, refRaw) => {
    const ref = String(refRaw || '').trim();
    if (!ref) return '';
    return pushLinkToken({ kind: 'bible', target: ref, moduleHint: '', label: ref });
  });

  // 3. Escapa HTML e restaura apenas tags estruturais seguras (sem cores inline fixas)
  let safe = escapeHtml(text);

  safe = safe
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

  safe = decodeCommonEntities(safe)
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>')
    .replace(/(<br>\s*){3,}/g, '<br><br>')
    .replace(/^(?:<br>\s*)+/, '')
    .replace(/(<br>\s*)+$/, '')
    .trim();

  // 4. Restaura links clicáveis
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

  // 5. Restaura notas de rodapé
  safe = safe.replace(/\u0001(\d+)\u0001/g, (_, idxStr) => {
    const idx = Number(idxStr);
    const label = footnoteLabels[idx] || '*';
    return `<button type="button" class="v-fn-btn" data-fn-idx="${idx}" aria-label="Ver nota">${escapeHtml(label)}</button>`;
  });

  return {
    html: safe,
    footnotes,
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
    tableName = tableNames.find((t) => !/^(?:details|info|sqlite_|android_metadata)/i.test(t)) || '';
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

  if (!wordCol || !dataCol) {
    throw new Error(`Colunas do dicionário não identificadas na tabela ${tableName}.`);
  }

  const schema = {
    tableName,
    wordCol,
    dataCol,
    qTable: quoteIdent(tableName),
    qWord: quoteIdent(wordCol),
    qData: quoteIdent(dataCol)
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

    // 1. Busca exata nas variações (Strong, acentos, etc.)
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

    // 2. Busca por prefixo ou trecho no título do verbete
    if (results.length < limit) {
      const titleRes = await nativeBridge.queryModule(
        modulePath,
        `SELECT ${s.qWord} AS word, ${s.qData} AS data FROM ${s.qTable} ` +
          `WHERE ${s.qWord} LIKE ? COLLATE NOCASE ` +
          `ORDER BY CASE WHEN ${s.qWord} LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END, ` +
          `LENGTH(${s.qWord}) ASC, ${s.qWord} COLLATE NOCASE ASC LIMIT ?`,
        [`%${clean}%`, `${clean}%`, limit]
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

    // 3. Busca opcional dentro do texto das definições
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
