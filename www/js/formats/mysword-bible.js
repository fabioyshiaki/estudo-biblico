import { nativeBridge } from '../bridge/native-bridge.js';
import {
  hasHebrewScript,
  isBilingualAncientText,
  formatInterlinearHtml
} from './interlinear.js';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripTagsPlain(str) {
  return String(str || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
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

function decodeCommonEntities(str) {
  return String(str || '')
    .replace(/&(?:amp;)?nbsp;/gi, ' ')
    .replace(/&(?:amp;)?mdash;/gi, '—')
    .replace(/&(?:amp;)?ndash;/gi, '–')
    .replace(/&(?:amp;)?hellip;/gi, '…')
    .replace(/&(?:amp;)?ldquo;/gi, '“')
    .replace(/&(?:amp;)?rdquo;/gi, '”')
    .replace(/&(?:amp;)?lsquo;/gi, '‘')
    .replace(/&(?:amp;)?rsquo;/gi, '’')
    .replace(/&(?:amp;)?laquo;/gi, '«')
    .replace(/&(?:amp;)?raquo;/gi, '»');
}

export function formatMySwordScripture(rawText, options = {}) {
  const showStrongs = Boolean(options.showStrongs);
  const showMorph = Boolean(options.showMorph);

  let text = String(rawText || '').replace(/\r\n/g, '\n');

  // Remove blocos perigosos antes de qualquer conversão
  text = text.replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, '');

  // Extrai títulos de seção (<TS>...</Ts> ou <TS1>...</Ts>)
  const headings = [];
  text = text.replace(/<TS\d?>([\s\S]*?)<\/?Ts\d?>/gi, (_, inner) => {
    const clean = stripTagsPlain(inner);
    if (clean) headings.push(clean);
    return '';
  });

  // Extrai notas de rodapé (<RF>...</Rf>) usando marcador numérico neutro
  const footnotes = [];
  text = text.replace(/<RF(?:\s+[^>]*)?>([\s\S]*?)<\/?Rf>/gi, (_, inner) => {
    const clean = stripTagsPlain(inner);
    if (!clean) return '';
    const idx = footnotes.length;
    footnotes.push(clean);
    return `\u0001${idx}\u0001`;
  });

  // Remove referências cruzadas e tags customizadas com "=" (ex.: <v=Gn 1:1>, <RX ...>)
  text = text
    .replace(/<RX(?:(?!>|<).)*>/gi, '')
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9_:-]*=(?:(?!>|<).)*\/?>/g, '');

  // Captura ou remove códigos Strong (<WG>/<WH>) e Morfologia (<WT>)
  const strongTokens = [];
  if (showStrongs) {
    text = text.replace(/<W([GH])(\d+[a-z]?)>/gi, (_, lang, code) => {
      const idx = strongTokens.length;
      strongTokens.push(`${lang.toUpperCase()}${code}`);
      return `\u0003${idx}\u0003`;
    });
  } else {
    text = text.replace(/<W[GH]\d+[a-z]?>/gi, '');
  }

  const morphTokens = [];
  if (showMorph) {
    text = text.replace(/<WT([^<>]+)>/gi, (_, morph) => {
      const clean = String(morph || '').trim();
      if (!clean) return '';
      const idx = morphTokens.length;
      morphTokens.push(clean);
      return `\u0004${idx}\u0004`;
    });
  } else {
    text = text.replace(/<WT[^<>]+>/gi, '');
  }

  let safe = '';

  if (isBilingualAncientText(text)) {
    // Modo bilíngue/interlinear: língua antiga (hebraico, aramaico, grego) acima da tradução
    safe = formatInterlinearHtml(decodeCommonEntities(text));
  } else {
    safe = escapeHtml(text);

    // Selos de módulos paralelos customizados (ex.: <SELOACF>ACF</seloacf>, <SELOKJF>KJF</selokjf>)
    safe = safe.replace(
      /&lt;SELO[A-Za-z0-9_-]*(?:\s+(?:(?!&gt;|&lt;).)*)?&gt;([\s\S]*?)&lt;\/?SELO[A-Za-z0-9_-]*&gt;/gi,
      (_, inner) => {
        const label = stripEscapedTags(inner);
        if (!label) return '';
        return `<span class="v-parallel-sep"></span><span class="v-badge">${label}</span> `;
      }
    );

    // Referência embutida de módulos customizados (ex.: <VT>Gn 1:1<vt>)
    safe = safe.replace(
      /&lt;VT(?:\s+(?:(?!&gt;|&lt;).)*)?&gt;([\s\S]*?)&lt;\/?VT&gt;/gi,
      (_, inner) => {
        const refText = stripEscapedTags(inner);
        return refText ? `<span class="v-ref-tag">${refText}</span>` : '';
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

    // Remove qualquer tag customizada restante (com espaço ou "=")
    safe = safe.replace(
      /&lt;\/?[a-zA-Z][a-zA-Z0-9_:-]*(?:[\s=](?:(?!&gt;|&lt;).)*)?\/?&gt;/g,
      ''
    );

    safe = decodeCommonEntities(safe)
      .replace(/\n+/g, '<br>')
      .replace(/(?:<br>\s*)+<span class="v-parallel-sep"><\/span>/g, '<span class="v-parallel-sep"></span>')
      .replace(/(<br>\s*){3,}/g, '<br><br>')
      .replace(/^(?:<span class="v-parallel-sep"><\/span>|<br>\s*)+/, '')
      .replace(/(<br>\s*)+$/, '')
      .trim();

    if (hasHebrewScript(safe)) {
      safe = `<span class="v-rtl" dir="rtl">${safe}</span>`;
    }
  }

  // Restaura Strong, Morfologia e Notas de rodapé
  safe = safe.replace(/\u0003(\d+)\u0003/g, (_, idxStr) => {
    const code = strongTokens[Number(idxStr)] || '';
    return code ? `<span class="v-strong" data-strong="${code}">${code}</span>` : '';
  });

  safe = safe.replace(/\u0004(\d+)\u0004/g, (_, idxStr) => {
    const morph = morphTokens[Number(idxStr)] || '';
    return morph ? `<span class="v-morph" data-morph="${escapeHtml(morph)}">${escapeHtml(morph)}</span>` : '';
  });

  safe = safe.replace(/\u0001(\d+)\u0001/g, (_, idxStr) => {
    const idx = Number(idxStr);
    return `<button type="button" class="v-fn-btn" data-fn-idx="${idx}" aria-label="Ver nota de rodapé">*</button>`;
  });

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
      const parsed = formatMySwordScripture(raw, options);
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

// FIM mysword-bible.js
