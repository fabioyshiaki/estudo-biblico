import { nativeBridge } from '../bridge/native-bridge.js';

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

function getRowField(row, targetLower) {
  if (!row || typeof row !== 'object') return undefined;
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === targetLower) {
      return row[key];
    }
  }
  return undefined;
}

export function formatMySwordScripture(rawText, options = {}) {
  const showStrongs = Boolean(options.showStrongs);
  const showMorph = Boolean(options.showMorph);

  let text = String(rawText || '').replace(/\r\n/g, '\n');

  // Remove blocos perigosos antes de qualquer conversão
  text = text.replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, '');

  // Extrai títulos de seção (<TS>...</Ts> ou <TS1>...</Ts>)
  const headings = [];
  text = text.replace(/<TS\d?>([\s\S]*?)<Ts>/gi, (_, inner) => {
    const clean = stripTagsPlain(inner);
    if (clean) headings.push(clean);
    return '';
  });

  // Extrai notas de rodapé (<RF>...</Rf>)
  const footnotes = [];
  text = text.replace(/<RF(?:\s+[^>]*)?>([\s\S]*?)<Rf>/gi, (_, inner) => {
    const clean = stripTagsPlain(inner);
    if (!clean) return '';
    const idx = footnotes.length;
    footnotes.push(clean);
    return `\u0001FN_${idx}\u0001`;
  });

  // Escapa HTML bruto para evitar quebra de DOM ou injeção
  let safe = escapeHtml(text);

  // Tags semânticas do MySword
  safe = safe
    .replace(/&lt;FR&gt;/g, '<span class="v-red">')
    .replace(/&lt;Fr&gt;/g, '</span>')
    .replace(/&lt;FI&gt;/g, '<em class="v-italic">')
    .replace(/&lt;Fi&gt;/g, '</em>')
    .replace(/&lt;FO&gt;/g, '<span class="v-quote">')
    .replace(/&lt;Fo&gt;/g, '</span>')
    .replace(/&lt;FU&gt;/g, '<u>')
    .replace(/&lt;Fu&gt;/g, '</u>')
    .replace(/&lt;CM&gt;|&lt;CL&gt;/gi, '<br>')
    .replace(/&lt;PI\d?&gt;|&lt;PF\d?&gt;/gi, '<br><span class="v-indent"></span>');

  // Tags HTML simples comuns em módulos MySword (ex.: Bíblias paralelas com <br> e <b>)
  safe = safe
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;p(?:\s+[^&]*)?&gt;/gi, '<br>')
    .replace(/&lt;\/p&gt;/gi, '')
    .replace(/&lt;b&gt;/gi, '<strong>')
    .replace(/&lt;\/b&gt;/gi, '</strong>')
    .replace(/&lt;i&gt;/gi, '<em>')
    .replace(/&lt;\/i&gt;/gi, '</em>')
    .replace(/&lt;sup&gt;/gi, '<sup>')
    .replace(/&lt;\/sup&gt;/gi, '</sup>')
    .replace(/&lt;sub&gt;/gi, '<sub>')
    .replace(/&lt;\/sub&gt;/gi, '</sub>')
    .replace(/&lt;\/?font(?:\s+[^&]*)?&gt;/gi, '');

  // Códigos Strong (<WG...>, <WH...>) e Morfologia (<WT...>)
  if (showStrongs) {
    safe = safe.replace(
      /&lt;W([GH])(\d+[a-z]?)&gt;/gi,
      (_, lang, code) =>
        `<span class="v-strong" data-strong="${lang.toUpperCase()}${code}">${lang.toUpperCase()}${code}</span>`
    );
  } else {
    safe = safe.replace(/&lt;W[GH]\d+[a-z]?&gt;/gi, '');
  }

  if (showMorph) {
    safe = safe.replace(
      /&lt;WT([^&]+)&gt;/gi,
      (_, morph) => `<span class="v-morph" data-morph="${morph}">${morph}</span>`
    );
  } else {
    safe = safe.replace(/&lt;WT[^&]+&gt;/gi, '');
  }

  // Referências cruzadas (<RX ...>) e demais tags curtas não mapeadas do MySword
  safe = safe
    .replace(/&lt;RX[^&]*&gt;/gi, '')
    .replace(/&lt;\/?[A-Z]{1,3}\d?(?:\s+[^&]*)?&gt;/g, '');

  // Preserva quebras de linha reais e limpa excessos de <br>
  safe = safe
    .replace(/\n+/g, '<br>')
    .replace(/(<br>\s*){3,}/g, '<br><br>')
    .replace(/^(<br>\s*)+/, '')
    .replace(/(<br>\s*)+$/, '')
    .trim();

  // Restaura botões discretos de notas de rodapé
  safe = safe.replace(/\u0001FN_(\d+)\u0001/g, (_, idxStr) => {
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
