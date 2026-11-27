import { nativeBridge } from '../bridge/native-bridge.js';
import {
  hasHebrewScript,
  isBilingualAncientText,
  formatInterlinearHtml,
  isReverseInterlinearQ,
  formatReverseInterlinearQHtml
} from './interlinear.js';
import {
  isTothtTaggedText,
  formatTothtHtml
} from './linguistic-totht.js';
import {
  isShebanqBhsText,
  formatShebanqBhsHtml
} from './linguistic-shebanq.js';
import {
  isOpenTextLinguisticHtml,
  formatOpenTextHtml
} from './linguistic-opentext.js';
import {
  isBibliaReveladaOmega,
  processBibliaReveladaOmega
} from './biblia-revelada-omega.js';
import {
  isBibliaUcrt,
  formatUcrtHtml
} from './biblia-ucrt.js';

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

const RE_SELO_TAG = /<SELO[A-Za-z0-9_-]*(?:\s+(?:(?!>|<).)*)?>([\s\S]*?)<\/?SELO[A-Za-z0-9_-]*>/gi;
const RE_SHORT_BIBLE_REF = /^(?:[123]\s*)?[A-Za-zÀ-ÿ]{2,6}\.?\s+\d+[:.]\d+(?:\s*[-–—]\s*\d+)?$/;

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
  const withLex = String(str || '')
    .replace(/<W([GH])(\d[^<>]*)>/gi, (_, lang, num) => ` ${lang.toUpperCase()}${String(num).replace(/\uFF0B/g, '+').trim()} `)
    .replace(/<WT([^<>]+)>/gi, (_, morph) => ` ${String(morph).replace(/\s+l="[^"]*"/gi, '').trim()} `)
    .replace(/<WL([^<>]+)>/gi, (_, lemma) => ` ${String(lemma).trim()} `);

  return decodeCommonEntities(
    decodeNumericEntities(withLex)
      .replace(/<\/?(?:p|div|br|li|h[1-6])(?:\s+[^>]*)?>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function stripEscapedTags(str) {
  return String(str || '')
    .replace(/&lt;(?:(?!&gt;).)*&gt;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getRowField(row, targetLower) {
  if (!row || typeof row !== 'object') return undefined;
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === targetLower) {
      return row[key];
    }
  }
  return undefined;
}

function extractAttrLabel(attrStr) {
  if (!attrStr) return '';
  const m = /\bq\s*=\s*(?:'([^']*)'|"([^"]*)"|([^>]+))/i.exec(attrStr);
  const raw = m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
  return decodeCommonEntities(decodeNumericEntities(raw)).trim();
}

function restoreFootnotes(html, footnoteLabels = []) {
  return String(html || '')
    .replace(/\u0002(\d+)\u0002/g, (_, idxStr) => {
      const idx = Number(idxStr);
      const label = footnoteLabels[idx] || 'Nota de estudo';
      return `<div class="v-ts-note"><button type="button" class="v-fn-btn v-fn-chip" data-fn-idx="${idx}" aria-label="Ver nota de estudo">${escapeHtml(label)}</button></div>`;
    })
    .replace(/\u0001(\d+)\u0001/g, (_, idxStr) => {
      const idx = Number(idxStr);
      const label = footnoteLabels[idx] || '*';
      const extraCls = label.length > 2 ? ' v-fn-chip' : '';
      return `<button type="button" class="v-fn-btn${extraCls}" data-fn-idx="${idx}" aria-label="Ver nota de rodapé">${escapeHtml(label)}</button>`;
    });
}

function applyPilcrowInitialBold(html) {
  return String(html || '')
    .replace(
      /¶\s*((?:<[^>]+>\s*)*)([\s—–\-“”‘’"'(\[«¡¿]*)(\p{L})/gu,
      (_, tags, punct, letter) => `${tags}${punct}<strong class="v-para-initial">${letter}</strong>`
    )
    .replace(/¶\s*/g, '');
}

function formatStandardInlineHtml(rawSegment) {
  let safe = escapeHtml(rawSegment);

  // Referência embutida de módulos customizados (ex.: <VT>Gn 1:1<vt>, <NT>Mt 1:1<nt>, <OT>Gn 1:1<ot>)
  safe = safe.replace(
    /&lt;VT(?:\s+(?:(?!&gt;|&lt;).)*)?&gt;([\s\S]*?)&lt;\/?VT&gt;/gi,
    (_, inner) => {
      const refText = stripEscapedTags(inner);
      return refText ? `<span class="v-ref-tag">${refText}</span>` : '';
    }
  );

  safe = safe.replace(
    /&lt;(NT|OT)(?:\s+(?:(?!&gt;|&lt;).)*)?&gt;([\s\S]*?)&lt;\/?\1&gt;/gi,
    (full, _, inner) => {
      const refText = stripEscapedTags(inner);
      if (RE_SHORT_BIBLE_REF.test(refText)) {
        return `<span class="v-ref-tag">${refText}</span>`;
      }
      return inner;
    }
  );

  // Tags semânticas oficiais do MySword
  safe = safe
    .replace(/&lt;FR&gt;/g, '<span class="v-red">')
    .replace(/&lt;\/?Fr&gt;|&lt;\/FR&gt;/g, '</span>')
    .replace(/&lt;FI&gt;/g, '<em class="v-italic">')
    .replace(/&lt;\/?Fi&gt;|&lt;\/FI&gt;/g, '</em>')
    .replace(/&lt;FO&gt;/g, '<span class="v-quote">')
    .replace(/&lt;\/?Fo&gt;|&lt;\/FO&gt;/g, '</span>')
    .replace(/&lt;FU&gt;/g, '<u>')
    .replace(/&lt;\/?Fu&gt;|&lt;\/FU&gt;/g, '</u>')
    .replace(/&lt;CM&gt;|&lt;CL&gt;|&lt;CI&gt;/gi, '<br>')
    .replace(/&lt;PI\d?&gt;|&lt;PF\d?&gt;/gi, '<br><span class="v-indent"></span>');

  // Tags HTML básicas usadas em módulos MySword
  safe = safe
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;p(?:\s+(?:(?!&gt;|&lt;).)*)?&gt;/gi, '<br>')
    .replace(/&lt;\/p&gt;/gi, '')
    .replace(/&lt;div(?:\s+(?:(?!&gt;|&lt;).)*)?&gt;/gi, '<br>')
    .replace(/&lt;\/div&gt;/gi, '')
    .replace(/&lt;(?:b|strong)&gt;/gi, '<strong>')
    .replace(/&lt;\/(?:b|strong)&gt;/gi, '</strong>')
    .replace(/&lt;(?:i|em)&gt;/gi, '<em>')
    .replace(/&lt;\/(?:i|em)&gt;/gi, '</em>')
    .replace(/&lt;u&gt;/gi, '<u>')
    .replace(/&lt;\/u&gt;/gi, '</u>')
    .replace(/&lt;sup&gt;/gi, '<sup>')
    .replace(/&lt;\/sup&gt;/gi, '</sup>')
    .replace(/&lt;sub&gt;/gi, '<sub>')
    .replace(/&lt;\/sub&gt;/gi, '</sub>');

  // Remove qualquer tag customizada restante (ex.: <wt>, <w*>, </w*>, <Q>, <E>, <C>, <H1>, <h>, <BLN4>, <OHB>)
  safe = safe.replace(
    /&lt;\/?[a-zA-Z][a-zA-Z0-9_:*.-]*(?:[\s=](?:(?!&gt;|&lt;).)*)?\/?&gt;/g,
    ''
  );

  const cleaned = decodeCommonEntities(safe)
    .replace(/\n+/g, '<br>')
    .replace(/(?:<br>\s*)+(<span class="v-ref-tag">)/g, ' $1')
    .replace(/(<br>\s*){3,}/g, '<br><br>')
    .replace(/^(?:<br>\s*)+/, '')
    .replace(/(<br>\s*)+$/, '')
    .trim();

  return applyPilcrowInitialBold(cleaned);
}

function formatParallelSeloHtml(rawText) {
  const matches = [];
  RE_SELO_TAG.lastIndex = 0;
  let m;
  while ((m = RE_SELO_TAG.exec(rawText)) !== null) {
    matches.push({
      start: m.index,
      end: RE_SELO_TAG.lastIndex,
      label: stripTagsPlain(m[1])
    });
  }

  if (!matches.length) return '';

  const blocks = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].start : rawText.length;
    const bodyRaw = rawText.slice(cur.end, nextStart);
    const bodyHtml = formatStandardInlineHtml(bodyRaw);
    if (!cur.label && !bodyHtml) continue;

    const isRtl = hasHebrewScript(bodyHtml);
    const badgeHtml = cur.label ? `<span class="v-badge">${escapeHtml(cur.label)}</span> ` : '';
    const lineHtml = isRtl
      ? `<span class="v-rtl" dir="rtl">${badgeHtml}${bodyHtml}</span>`
      : `<span class="v-ltr" dir="ltr">${badgeHtml}${bodyHtml}</span>`;

    blocks.push(lineHtml);
  }

  return blocks.join('<span class="v-parallel-sep"></span>');
}

export function formatMySwordScripture(rawText, options = {}) {
  const showStrongs = Boolean(options.showStrongs);
  const showMorph = Boolean(options.showMorph);

  // Decodifica entidades numéricas não-ASCII sem abrir brecha de tags
  let text = decodeNumericEntities(String(rawText || '').replace(/\r\n/g, '\n'));

  // Remove blocos perigosos antes de qualquer conversão
  text = text.replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, '');

  // 1. Extrai notas de rodapé (<RF>...</Rf>) ANTES de <TS> para não vazar notas de estudo como título
  const footnotes = [];
  const footnoteLabels = [];
  text = text.replace(/<RF(\s+[^>]*)?>([\s\S]*?)<\/?Rf>/gi, (_, attrs, inner) => {
    const clean = stripTagsPlain(inner);
    if (!clean) return '';
    const idx = footnotes.length;
    footnotes.push(clean);
    footnoteLabels.push(extractAttrLabel(attrs));
    return `\u0001${idx}\u0001`;
  });

  // 1b. Extrai referências/notas embutidas em <a class="ref" href="r...">a</a> (ex.: NAA)
  text = text.replace(
    /(?:<sup>\s*)?(?:<i>\s*)?<a\b[^>]*\bhref\s*=\s*(?:"r([\s\S]*?)"|'r([\s\S]*?)')[^>]*>([\s\S]*?)<\/a>(?:\s*<\/i>)?(?:\s*<\/sup>)?/gi,
    (_, dblContent, sglContent, labelRaw) => {
      const rawContent = dblContent !== undefined ? dblContent : sglContent;
      const clean = stripTagsPlain(rawContent).replace(/^☰\s*/, '').trim();
      if (!clean) return '';
      const label = stripTagsPlain(labelRaw) || '*';
      const idx = footnotes.length;
      footnotes.push(clean);
      footnoteLabels.push(label);
      return `\u0001${idx}\u0001`;
    }
  );

  // 2. Extrai títulos de seção (<TS>...</Ts> ou <TS1>...</Ts>), preservando notas embutidas como botão
  const headings = [];
  text = text.replace(/<TS\d?>([\s\S]*?)<\/?Ts\d?>/gi, (_, inner) => {
    const embeddedTokens = [];
    const withoutTokens = String(inner || '').replace(/\u0001(\d+)\u0001/g, (__, idxStr) => {
      embeddedTokens.push(`\u0002${idxStr}\u0002`);
      return '';
    });

    const clean = stripTagsPlain(withoutTokens)
      .replace(/^(?:\|\||[|•·\-–—])+\s*/, '')
      .replace(/\s*(?:\|\||[|•·\-–—])+$/, '')
      .trim();
    if (clean) headings.push(clean);
    return embeddedTokens.join('');
  });

  // Regra exclusiva para o módulo "Bíblia UCRT" (The Ultimate Cross-Reference Treasury)
  if (isBibliaUcrt(options.modulePath)) {
    const ucrtHtml = formatUcrtHtml(decodeCommonEntities(text), {
      ...options,
      footnotes,
      footnoteLabels
    });
    if (ucrtHtml) {
      return {
        html: restoreFootnotes(ucrtHtml, footnoteLabels),
        headings,
        footnotes
      };
    }
  }

  // Regra exclusiva para o módulo "Bíblia Revelada Ômega"
  let omegaTrailingRef = '';
  if (isBibliaReveladaOmega(options.modulePath)) {
    const omegaRes = processBibliaReveladaOmega(text, options, footnotes, footnoteLabels);
    text = omegaRes.text;
    omegaTrailingRef = omegaRes.trailingRef;
  }

  // Módulos morfológicos completos tipo Tyndale TOTHT
  if (isTothtTaggedText(text)) {
    const tothtHtml = formatTothtHtml(decodeCommonEntities(text), options.verseNum);
    return {
      html: restoreFootnotes(tothtHtml, footnoteLabels),
      headings,
      footnotes
    };
  }

  // Módulos BHS Enhanced / SHEBANQ / Interlinear Br / UnfoldingWord / VIMS
  if (isShebanqBhsText(text)) {
    const shebanqHtml = formatShebanqBhsHtml(decodeCommonEntities(text), options.verseNum);
    return {
      html: restoreFootnotes(shebanqHtml, footnoteLabels),
      headings,
      footnotes
    };
  }

  // Módulos sintáticos OpenText.org (Open Greek New Testament Linguistic Annotations)
  if (isOpenTextLinguisticHtml(text)) {
    const otHtml = formatOpenTextHtml(decodeCommonEntities(text));
    if (otHtml) {
      return {
        html: restoreFootnotes(otHtml, footnoteLabels),
        headings,
        footnotes
      };
    }
  }

  // Módulos interlineares reversos (<Q>INGLÊS<WG...><WT...><E><G>grego<g><e><q>, ex.: IrMS)
  if (isReverseInterlinearQ(text)) {
    const revHtml = formatReverseInterlinearQHtml(decodeCommonEntities(text), options.verseNum);
    if (revHtml) {
      return {
        html: restoreFootnotes(revHtml, footnoteLabels),
        headings,
        footnotes
      };
    }
  }

  // Remove referências cruzadas, marcadores de versículo (<Gn#1#1>, <ot.1.1.1>) e tags customizadas com "="
  text = text
    .replace(/<RX(?:(?!>|<).)*>/gi, '')
    .replace(/<[A-Za-z0-9]{1,8}[#.]\d+[#.]\d+(?:[#.]\d+)*>/g, '')
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9_:-]*=(?:(?!>|<).)*\/?>/g, '');

  // Captura ou remove códigos Strong simples e compostos
  const strongTokens = [];
  if (showStrongs) {
    text = text.replace(/<W([GH])(\d[^<>]*)>/gi, (_, lang, rest) => {
      const cleaned = String(rest).replace(/\uFF0B/g, '+').trim();
      if (!cleaned || cleaned === '0') return '';
      const normalized = `${lang.toUpperCase()}${cleaned}`;
      const idx = strongTokens.length;
      strongTokens.push(normalized);
      return ` \u0003${idx}\u0003`;
    });
  } else {
    text = text.replace(/<W[GH]\d[^<>]*>/gi, '');
  }

  // Captura ou remove tags de Morfologia (<WT...>)
  const morphTokens = [];
  if (showMorph) {
    text = text.replace(/<WT([^<>]+)>/gi, (_, morph) => {
      const clean = String(morph || '').replace(/\s+l="[^"]*"/gi, '').trim();
      if (!clean) return '';
      const idx = morphTokens.length;
      morphTokens.push(clean);
      return ` \u0004${idx}\u0004`;
    });
  } else {
    text = text.replace(/<WT[^<>]+>/gi, '');
  }

  let safe = '';

  // Módulos paralelos com selos (<SELON4>, <SELOTR>, <SELOOHB>, <SELOACF>, etc.)
  RE_SELO_TAG.lastIndex = 0;
  if (RE_SELO_TAG.test(text)) {
    safe = formatParallelSeloHtml(text);
  } else if (isBilingualAncientText(text)) {
    // Desembrulha links <a href='sH...'>palavra</a> para preservar o texto original no interlinear
    const unwrapped = text.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');
    safe = formatInterlinearHtml(decodeCommonEntities(unwrapped), options.verseNum);
  } else {
    safe = formatStandardInlineHtml(text);
    if (hasHebrewScript(safe)) {
      safe = `<span class="v-rtl" dir="rtl">${safe}</span>`;
    }
  }

  // Restaura Strong, Morfologia e Notas de rodapé
  safe = safe.replace(/\u0003(\d+)\u0003/g, (_, idxStr) => {
    const code = strongTokens[Number(idxStr)] || '';
    return code ? `<span class="v-strong" dir="ltr" data-strong="${escapeHtml(code)}">${escapeHtml(code)}</span>` : '';
  });

  safe = safe.replace(/\u0004(\d+)\u0004/g, (_, idxStr) => {
    const morph = morphTokens[Number(idxStr)] || '';
    return morph ? `<span class="v-morph" dir="ltr" data-morph="${escapeHtml(morph)}">${escapeHtml(morph)}</span>` : '';
  });

  safe = restoreFootnotes(safe, footnoteLabels);

  if (omegaTrailingRef) {
    safe += ` <span class="v-ref-tag" data-ref="${escapeHtml(omegaTrailingRef)}">${escapeHtml(omegaTrailingRef)}</span>`;
  }

  return {
    html: safe,
    headings,
    footnotes
  };
}

export const myswordBibleAdapter = {
  formatId: 'mysword_bbl',
  resourceKind: 'bible',
  label: 'Bíblia MySword (.bbl.mybible)',
  extensions: ['.bbl.mybible'],

  async getAvailableBooks(modulePath) {
    const res = await nativeBridge.queryModule(
      modulePath,
      'SELECT DISTINCT Book FROM Bible ORDER BY Book ASC'
    );
    const rows = Array.isArray(res && res.rows) ? res.rows : [];
    return rows
      .map((r) => Number(getRowField(r, 'book')))
      .filter((n) => Number.isFinite(n) && n > 0);
  },

  async getChaptersForBook(modulePath, bookId) {
    const res = await nativeBridge.queryModule(
      modulePath,
      'SELECT DISTINCT Chapter FROM Bible WHERE Book = ? ORDER BY Chapter ASC',
      [Number(bookId)]
    );
    const rows = Array.isArray(res && res.rows) ? res.rows : [];
    return rows
      .map((r) => Number(getRowField(r, 'chapter')))
      .filter((n) => Number.isFinite(n) && n > 0);
  },

  async getChapterVerses(modulePath, bookId, chapter, options = {}) {
    const res = await nativeBridge.queryModule(
      modulePath,
      'SELECT Verse, Scripture FROM Bible WHERE Book = ? AND Chapter = ? ORDER BY Verse ASC',
      [Number(bookId), Number(chapter)]
    );
    const rows = Array.isArray(res && res.rows) ? res.rows : [];

    return rows.map((row) => {
      const verseNum = Number(getRowField(row, 'verse')) || 0;
      const raw = String(getRowField(row, 'scripture') || '');
      const parsed = formatMySwordScripture(raw, {
        ...options,
        modulePath,
        bookId: Number(bookId),
        chapter: Number(chapter),
        verseNum
      });
      return {
        book: Number(bookId),
        chapter: Number(chapter),
        verse: verseNum,
        raw,
        html: parsed.html,
        headings: parsed.headings,
        footnotes: parsed.footnotes
      };
    });
  }
};
