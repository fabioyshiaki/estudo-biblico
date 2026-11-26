import { nativeBridge } from '../bridge/native-bridge.js';
import {
  hasHebrewScript,
  isBilingualAncientText,
  formatInterlinearHtml
} from './interlinear.js';
import {
  isTothtTaggedText,
  formatTothtHtml
} from './linguistic-totht.js';
import {
  isShebanqBhsText,
  formatShebanqBhsHtml
} from './linguistic-shebanq.js';

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
      const extraCls = footnoteLabels[idx] ? ' v-fn-chip' : '';
      return `<button type="button" class="v-fn-btn${extraCls}" data-fn-idx="${idx}" aria-label="Ver nota de rodapé">${escapeHtml(label)}</button>`;
    });
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
    return `\u0001
