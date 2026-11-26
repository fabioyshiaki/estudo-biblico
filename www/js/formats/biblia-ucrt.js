const UCRT_STYLE_ID = 'ucrt-module-styles';

const UCRT_CSS = `
:root,
:root[data-theme="paper"] {
  --ucrt-box-bg: #faf7f0;
  --ucrt-box-border: #e1d8c7;
  --ucrt-accent: #9c4a2b;
  --ucrt-word-bg: #9c4a2b;
  --ucrt-word-fg: #ffffff;
  --ucrt-chrono-bg: #efe5cf;
  --ucrt-chrono-fg: #754b14;
  --ucrt-count-fg: #7d7468;
  --ucrt-ref-r-fg: #1d5fa7;
  --ucrt-ref-r-bg: rgba(29, 95, 167, 0.08);
  --ucrt-ref-vd-fg: #1b7242;
  --ucrt-ref-vd-bg: rgba(27, 114, 66, 0.10);
  --ucrt-ref-av-fg: #a1520b;
  --ucrt-ref-av-bg: rgba(161, 82, 11, 0.11);
  --ucrt-ref-bg-fg: #6b3fa0;
  --ucrt-ref-bg-bg: rgba(107, 63, 160, 0.10);
  --ucrt-strong-fg: #2b4c9b;
  --ucrt-strong-bg: rgba(43, 76, 155, 0.10);
  --ucrt-fs-fg: #0f7068;
  --ucrt-fs-bg: rgba(15, 112, 104, 0.10);
}

:root[data-theme="light"] {
  --ucrt-box-bg: #f8fafc;
  --ucrt-box-border: #dce3ed;
  --ucrt-accent: #9f3e24;
  --ucrt-word-bg: #9f3e24;
  --ucrt-word-fg: #ffffff;
  --ucrt-chrono-bg: #fef3c7;
  --ucrt-chrono-fg: #854d0e;
  --ucrt-count-fg: #64748b;
  --ucrt-ref-r-fg: #1d5bb8;
  --ucrt-ref-r-bg: rgba(29, 91, 184, 0.08);
  --ucrt-ref-vd-fg: #157347;
  --ucrt-ref-vd-bg: rgba(21, 115, 71, 0.10);
  --ucrt-ref-av-fg: #b45309;
  --ucrt-ref-av-bg: rgba(180, 83, 9, 0.11);
  --ucrt-ref-bg-fg: #6d28d9;
  --ucrt-ref-bg-bg: rgba(109, 40, 217, 0.10);
  --ucrt-strong-fg: #2648a1;
  --ucrt-strong-bg: rgba(38, 72, 161, 0.10);
  --ucrt-fs-fg: #0d736b;
  --ucrt-fs-bg: rgba(13, 115, 107, 0.10);
}

:root[data-theme="sepia"] {
  --ucrt-box-bg: #f5ecdc;
  --ucrt-box-border: #d7c7ad;
  --ucrt-accent: #8f4124;
  --ucrt-word-bg: #8f4124;
  --ucrt-word-fg: #ffffff;
  --ucrt-chrono-bg: #eadbbf;
  --ucrt-chrono-fg: #6e4612;
  --ucrt-count-fg: #7a6a55;
  --ucrt-ref-r-fg: #205791;
  --ucrt-ref-r-bg: rgba(32, 87, 145, 0.09);
  --ucrt-ref-vd-fg: #1f6b3e;
  --ucrt-ref-vd-bg: rgba(31, 107, 62, 0.11);
  --ucrt-ref-av-fg: #994e0c;
  --ucrt-ref-av-bg: rgba(153, 78, 12, 0.12);
  --ucrt-ref-bg-fg: #663d94;
  --ucrt-ref-bg-bg: rgba(102, 61, 148, 0.10);
  --ucrt-strong-fg: #2d4c8f;
  --ucrt-strong-bg: rgba(45, 76, 143, 0.10);
  --ucrt-fs-fg: #156960;
  --ucrt-fs-bg: rgba(21, 105, 96, 0.11);
}

:root[data-theme="dark"] {
  --ucrt-box-bg: #171c24;
  --ucrt-box-border: #2c3442;
  --ucrt-accent: #d4714e;
  --ucrt-word-bg: #a94429;
  --ucrt-word-fg: #f8fafc;
  --ucrt-chrono-bg: #2f2618;
  --ucrt-chrono-fg: #f0c274;
  --ucrt-count-fg: #8c96a8;
  --ucrt-ref-r-fg: #7ab8ff;
  --ucrt-ref-r-bg: rgba(122, 184, 255, 0.11);
  --ucrt-ref-vd-fg: #5cd48a;
  --ucrt-ref-vd-bg: rgba(92, 212, 138, 0.12);
  --ucrt-ref-av-fg: #f4b259;
  --ucrt-ref-av-bg: rgba(244, 178, 89, 0.13);
  --ucrt-ref-bg-fg: #c29dff;
  --ucrt-ref-bg-bg: rgba(194, 157, 255, 0.13);
  --ucrt-strong-fg: #93b4ff;
  --ucrt-strong-bg: rgba(147, 180, 255, 0.13);
  --ucrt-fs-fg: #5cd6c9;
  --ucrt-fs-bg: rgba(92, 214, 201, 0.13);
}

.verse-text .ucrt-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 2px;
}

.verse-text .ucrt-header {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.verse-text .ucrt-scripture-line {
  display: block;
  line-height: 1.55;
  color: var(--text-main);
}

.verse-text .ucrt-meta-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-family: var(--font-ui);
}

.verse-text .ucrt-chrono {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.72em;
  font-weight: 600;
  background: var(--ucrt-chrono-bg);
  color: var(--ucrt-chrono-fg);
}

.verse-text .ucrt-boxes {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.verse-text .ucrt-box {
  border: 1px solid var(--ucrt-box-border);
  border-inline-start: 3px solid var(--ucrt-accent);
  border-radius: var(--radius-sm, 8px);
  background: var(--ucrt-box-bg);
  overflow: hidden;
}

.verse-text .ucrt-box-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  list-style: none;
  user-select: none;
  font-family: var(--font-ui);
}

.verse-text .ucrt-box-head::-webkit-details-marker {
  display: none;
}

.verse-text .ucrt-word {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 5px;
  background: var(--ucrt-word-bg);
  color: var(--ucrt-word-fg);
  font-size: 0.78em;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.verse-text .ucrt-box-info {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.70em;
  color: var(--ucrt-count-fg);
  font-variant-numeric: tabular-nums;
}

.verse-text .ucrt-box-info::after {
  content: '▾';
  font-size: 1.05em;
  transition: transform 0.15s ease;
}

.verse-text .ucrt-box:not([open]) .ucrt-box-info::after {
  transform: rotate(-90deg);
}

.verse-text .ucrt-box-body {
  padding: 2px 10px 9px;
  font-size: 0.89em;
  line-height: 1.62;
  color: var(--text-main);
  border-top: 1px solid var(--ucrt-box-border);
}

.verse-text .ucrt-box.is-refs-only .ucrt-box-body {
  padding-top: 6px;
  line-height: 1.78;
}

.verse-text .ucrt-box-plain {
  padding: 7px 10px;
  font-size: 0.89em;
  line-height: 1.6;
}

.verse-text .ucrt-ref {
  display: inline-block;
  padding: 0 5px;
  margin: 1px 1px;
  border-radius: 4px;
  font-family: var(--font-ui);
  font-size: 0.88em;
  font-weight: 600;
  line-height: 1.45;
  white-space: nowrap;
}

.verse-text .ucrt-ref--r {
  color: var(--ucrt-ref-r-fg);
  background: var(--ucrt-ref-r-bg);
}

.verse-text .ucrt-ref--vd {
  color: var(--ucrt-ref-vd-fg);
  background: var(--ucrt-ref-vd-bg);
}

.verse-text .ucrt-ref--av {
  color: var(--ucrt-ref-av-fg);
  background: var(--ucrt-ref-av-bg);
}

.verse-text .ucrt-ref--bg {
  color: var(--ucrt-ref-bg-fg);
  background: var(--ucrt-ref-bg-bg);
}

.verse-text .ucrt-strong-wrap {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  padding: 0 5px;
  margin: 1px 1px;
  border-radius: 4px;
  background: var(--ucrt-strong-bg);
  color: var(--ucrt-strong-fg);
  font-family: var(--font-ui);
  font-size: 0.86em;
  font-weight: 600;
  line-height: 1.45;
}

.verse-text .ucrt-strong-wrap .ucrt-strong {
  font-size: 1em;
  padding: 0;
  margin: 0;
  border: 0;
  background: transparent;
  color: inherit;
}

.verse-text .ucrt-fs {
  display: inline-block;
  padding: 0 5px;
  margin: 0 1px;
  border-radius: 4px;
  background: var(--ucrt-fs-bg);
  color: var(--ucrt-fs-fg);
  font-family: var(--font-ui);
  font-size: 0.85em;
  font-weight: 700;
  line-height: 1.42;
}
`;

function ensureUcrtStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(UCRT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = UCRT_STYLE_ID;
  style.textContent = UCRT_CSS;
  document.head.appendChild(style);
}

function normalizeAscii(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanSpaces(str) {
  return String(str || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isBibliaUcrt(modulePath) {
  const norm = normalizeAscii(modulePath);
  return /\bucrt\b|ultimate[\s_-]*cross[\s_-]*reference/.test(norm);
}

function isChronologyText(str) {
  const clean = cleanSpaces(str);
  if (!clean || clean.length > 48) return false;
  return /^(?:A\.?C\.?|D\.?C\.?|B\.?C\.?|A\.?D\.?|A\.?M\.?|An\.?Ex\.?Is\.?)\s*[\d.,\-–—\s]+$/i.test(clean);
}

function formatInlineScripture(rawText) {
  let safe = escapeHtml(rawText);
  safe = safe
    .replace(/&lt;FR&gt;/g, '<span class="v-red">')
    .replace(/&lt;\/?Fr&gt;|&lt;\/FR&gt;/g, '</span>')
    .replace(/&lt;FI&gt;/g, '<em class="v-italic">')
    .replace(/&lt;\/?Fi&gt;|&lt;\/FI&gt;/g, '</em>')
    .replace(/&lt;FO&gt;/g, '<span class="v-quote">')
    .replace(/&lt;\/?Fo&gt;|&lt;\/FO&gt;/g, '</span>')
    .replace(/&lt;FU&gt;/g, '<u>')
    .replace(/&lt;\/?Fu&gt;|&lt;\/FU&gt;/g, '</u>')
    .replace(/&lt;(?:i|em)&gt;/gi, '<em>')
    .replace(/&lt;\/(?:i|em)&gt;/gi, '</em>')
    .replace(/&lt;(?:b|strong)&gt;/gi, '<strong>')
    .replace(/&lt;\/(?:b|strong)&gt;/gi, '</strong>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;\/?[a-zA-Z][a-zA-Z0-9_:*.-]*(?:[\s=](?:(?!&gt;|&lt;).)*)?\/?&gt;/g, '');

  return safe.replace(/\s+/g, ' ').trim();
}

function formatUcrtBody(rawBody, symbolsUsed) {
  let refCount = 0;

  // Protege marcadores literais da UCRT "<a " (alusão) e "<rp " (citação do Pentateuco)
  const protectedRaw = String(rawBody || '')
    .replace(/(^|[\s,;(\[])<(a|rp)(?=\s)/g, '$1\u0005$2\u0006');

  let safe = escapeHtml(protectedRaw);

  // Formatação inline básica
  safe = safe
    .replace(/&lt;FI&gt;/g, '<em class="v-italic">')
    .replace(/&lt;\/?Fi&gt;|&lt;\/FI&gt;/g, '</em>')
    .replace(/&lt;(?:i|em)&gt;/gi, '<em>')
    .replace(/&lt;\/(?:i|em)&gt;/gi, '</em>')
    .replace(/&lt;(?:b|strong)&gt;/gi, '<strong>')
    .replace(/&lt;\/(?:b|strong)&gt;/gi, '</strong>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>');

  // Códigos Strong com prefixo (+S#, *S#, S#)
  safe = safe.replace(
    /([+*]?S#)\s*&lt;ST&gt;([\s\S]*?)&lt;\/?ST&gt;/gi,
    (_, prefix, codeRaw) => {
      const code = cleanSpaces(codeRaw);
      if (!code) return '';
      symbolsUsed.add(prefix.toUpperCase());
      return `<span class="ucrt-strong-wrap"><span class="ucrt-sym">${prefix}</span><span class="v-strong ucrt-strong" dir="ltr" data-strong="${code}">${code}</span></span>`;
    }
  );

  // Strong avulso <ST>...</st>
  safe = safe.replace(/&lt;ST&gt;([\s\S]*?)&lt;\/?ST&gt;/gi, (_, codeRaw) => {
    const code = cleanSpaces(codeRaw);
    if (!code) return '';
    symbolsUsed.add('S#');
    return `<span class="ucrt-strong-wrap"><span class="v-strong ucrt-strong" dir="ltr" data-strong="${code}">${code}</span></span>`;
  });

  // Helper para referências (<VD>, <AV>, <BG>, <R>)
  const replaceRefTag = (tagName, cssModifier, defaultSymbol) => {
    const re = new RegExp(
      `((?:\\+\\*\\*|\\*\\+|\\+\\*|\\*\\*|\\*|\\+|%|=&gt;|=|&gt;|\\$|#)?)\\s*&lt;${tagName}&gt;([\\s\\S]*?)&lt;\\/?${tagName}&gt;`,
      'gi'
    );
    safe = safe.replace(re, (_, symRaw, refRaw) => {
      const refText = cleanSpaces(refRaw);
      if (!refText) return '';
      refCount++;
      const sym = symRaw || '';
      if (sym) {
        symbolsUsed.add(sym.replace(/&gt;/g, '>'));
      } else if (defaultSymbol) {
        symbolsUsed.add(defaultSymbol);
      }
      return `<span class="ucrt-ref ucrt-ref--${cssModifier}" data-ref="${refText}">${sym}${refText}</span>`;
    });
  };

  replaceRefTag('VD', 'vd', '*');
  replaceRefTag('AV', 'av', '+');
  replaceRefTag('BG', 'bg', 'BG');
  replaceRefTag('R', 'r', '');

  // Remove quaisquer outras tags customizadas desconhecidas
  safe = safe.replace(
    /&lt;\/?[a-zA-Z][a-zA-Z0-9_:*.-]*(?:[\s=](?:(?!&gt;|&lt;).)*)?\/?&gt;/g,
    ''
  );

  // Restaura marcadores literais "<a" e "<rp"
  safe = safe.replace(/\u0005(a|rp)\u0006/g, (_, sym) => {
    symbolsUsed.add(`<${sym}`);
    return `&lt;${sym}`;
  });

  // Destaca códigos de Figuras de Linguagem (FS148, FS16, FS121A3)
  safe = safe.replace(/(^|[\s(;,])(FS\d+[A-Z0-9]*)\b/g, (_, lead, fsCode) => {
    symbolsUsed.add('FS');
    return `${lead}<span class="ucrt-fs">${fsCode}</span>`;
  });

  // Detecta se a caixa é composta quase só por referências
  const plainWithoutRefs = safe
    .replace(/<span class="ucrt-ref[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\s.,;:()\-–—]+/g, '')
    .trim();

  const html = safe
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();

  return {
    html,
    refCount,
    isRefsOnly: refCount > 0 && plainWithoutRefs.length <= 12
  };
}

function buildLegendText(symbolsUsed, hasChrono) {
  const lines = [];
  if (symbolsUsed.has('*')) {
    lines.push('• * (verde): Referência muito clara, com conexão imediata ao versículo.');
  }
  if (symbolsUsed.has('**')) {
    lines.push('• ** (verde): Referência muito significativa e criticamente clara.');
  }
  if (symbolsUsed.has('+')) {
    lines.push('• + (âmbar): "Encontre mais aqui" — aponta para outro ponto principal de referências sobre o mesmo assunto (estudo em camadas).');
  }
  if (symbolsUsed.has('+*') || symbolsUsed.has('*+') || symbolsUsed.has('+**')) {
    lines.push('• +* / *+ / +**: Referência clara que também serve como ponto principal de aprofundamento.');
  }
  if (symbolsUsed.has('BG')) {
    lines.push('• Roxo (nota): Referência acompanhada de nota explicativa importante na UCRT.');
  }
  if (symbolsUsed.has('+S#')) {
    lines.push('• +S#: Número Strong com todas as ocorrências relevantes/paralelas da palavra original.');
  }
  if (symbolsUsed.has('*S#')) {
    lines.push('• *S#: Número Strong com todas as ocorrências da palavra original.');
  }
  if (symbolsUsed.has('S#')) {
    lines.push('• S#: Número lexical da Concordância de Strong (hebraico/grego).');
  }
  if (symbolsUsed.has('FS')) {
    lines.push('• FS (verde-petróleo): Código de Figura de Linguagem segundo E. W. Bullinger (ex.: FS148 = Polissíndeto).');
  }
  if (symbolsUsed.has('%')) {
    lines.push('• %: Referência de contraste ou assunto oposto.');
  }
  if (symbolsUsed.has('=') || symbolsUsed.has('=>')) {
    lines.push('• = / =>: Tipo ou antítipo (=> identificado pela própria Escritura).');
  }
  if (symbolsUsed.has('>')) {
    lines.push('• >: Citação entre o Antigo e o Novo Testamento.');
  }
  if (symbolsUsed.has('<a')) {
    lines.push('• <a: Alusão a outra passagem bíblica.');
  }
  if (symbolsUsed.has('<rp')) {
    lines.push('• <rp: Citação do Pentateuco nos profetas.');
  }
  if (symbolsUsed.has('$')) {
    lines.push('• $: Cumprimento de profecia.');
  }
  if (symbolsUsed.has('#')) {
    lines.push('• #: Passagem paralela estrita.');
  }
  if (hasChrono) {
    lines.push('• A.C. / A.M.: Cronologia bíblica (A.C. = Antes de Cristo; A.M. = Anno Mundi).');
  }
  return lines.join('\n');
}

export function formatUcrtHtml(rawText, options = {}) {
  const source = String(rawText || '').trim();
  if (!source || !/<BOX>/i.test(source)) return '';

  ensureUcrtStyles();

  let working = source;
  const footnotes = Array.isArray(options.footnotes) ? options.footnotes : [];
  const footnoteLabels = Array.isArray(options.footnoteLabels) ? options.footnoteLabels : [];
  const symbolsUsed = new Set();

  // 1. Extrai referência <VT>Gn 1:1<vt>
  let vtRef = '';
  working = working.replace(/<VT(?:\s+[^>]*)?>([\s\S]*?)<\/?VT>/gi, (_, inner) => {
    const clean = cleanSpaces(String(inner || '').replace(/<[^>]*>/g, ''));
    if (clean && !vtRef) vtRef = clean;
    return '';
  });

  // 2. Extrai o texto bíblico principal (<KJF><SELOKJF>KJF</selokjf>...</kjf>)
  let versionBadge = '';
  let scriptureHtml = '';
  const leadMatch = /<([A-Z0-9]{2,8})>\s*<SELO[A-Z0-9_-]*>([\s\S]*?)<\/?SELO[A-Z0-9_-]*>([\s\S]*?)<\/\1>/i.exec(working);
  if (leadMatch) {
    versionBadge = cleanSpaces(String(leadMatch[2] || '').replace(/<[^>]*>/g, ''));
    scriptureHtml = formatInlineScripture(leadMatch[3]);
    working = `${working.slice(0, leadMatch.index)} ${working.slice(leadMatch.index + leadMatch[0].length)}`;
  }

  // 3. Extrai todos os blocos <BOX>...</box>
  const chronos = [];
  const boxCards = [];
  const boxRegex = /<BOX>([\s\S]*?)<\/?box>/gi;
  let bm;

  while ((bm = boxRegex.exec(working)) !== null) {
    let boxInner = String(bm[1] || '').trim();
    if (!boxInner) continue;

    let keyword = '';
    boxInner = boxInner.replace(/<WORD>([\s\S]*?)<\/?word>/i, (_, wRaw) => {
      keyword = cleanSpaces(String(wRaw || '').replace(/<[^>]*>/g, ''));
      return '';
    }).trim();

    if (!keyword && isChronologyText(boxInner)) {
      chronos.push(cleanSpaces(boxInner).replace(/\.$/, ''));
      continue;
    }

    const formatted = formatUcrtBody(boxInner, symbolsUsed);
    if (!keyword && !formatted.html) continue;

    if (keyword) {
      const refLabel = formatted.refCount > 0
        ? `${formatted.refCount} ${formatted.refCount === 1 ? 'ref' : 'refs'}`
        : 'nota';
      const refsOnlyCls = formatted.isRefsOnly ? ' is-refs-only' : '';
      boxCards.push(
        `<details class="ucrt-box${refsOnlyCls}" open>` +
          `<summary class="ucrt-box-head">` +
            `<span class="ucrt-word">${escapeHtml(keyword)}</span>` +
            `<span class="ucrt-box-info">${refLabel}</span>` +
          `</summary>` +
          `<div class="ucrt-box-body">${formatted.html}</div>` +
        `</details>`
      );
    } else {
      boxCards.push(
        `<div class="ucrt-box"><div class="ucrt-box-plain">${formatted.html}</div></div>`
      );
    }
  }

  // Eventual texto restante fora de <BOX>
  const leftoverRaw = working.replace(boxRegex, '').trim();
  if (leftoverRaw) {
    const leftoverFormatted = formatUcrtBody(leftoverRaw, symbolsUsed);
    if (leftoverFormatted.html) {
      boxCards.push(
        `<div class="ucrt-box"><div class="ucrt-box-plain">${leftoverFormatted.html}</div></div>`
      );
    }
  }

  // 4. Adiciona botão interativo "Símbolos" se houver símbolos/cronologia no versículo
  let legendToken = '';
  const legendText = buildLegendText(symbolsUsed, chronos.length > 0);
  if (legendText) {
    const idx = footnotes.length;
    footnotes.push(legendText);
    footnoteLabels.push('Símbolos');
    legendToken = `\u0001${idx}\u0001`;
  }

  // 5. Monta cabeçalho + cartões
  const metaItems = [];
  for (const c of chronos) {
    metaItems.push(`<span class="ucrt-chrono">${escapeHtml(c)}</span>`);
  }
  if (vtRef) {
    metaItems.push(`<span class="v-ref-tag">${escapeHtml(vtRef)}</span>`);
  }
  if (legendToken) {
    metaItems.push(legendToken);
  }

  const badgeHtml = versionBadge ? `<span class="v-badge">${escapeHtml(versionBadge)}</span> ` : '';
  const headerParts = [];
  if (scriptureHtml || badgeHtml) {
    headerParts.push(`<div class="ucrt-scripture-line">${badgeHtml}${scriptureHtml}</div>`);
  }
  if (metaItems.length) {
    headerParts.push(`<div class="ucrt-meta-bar">${metaItems.join('')}</div>`);
  }

  return (
    `<div class="ucrt-wrap" dir="ltr">` +
      (headerParts.length ? `<div class="ucrt-header">${headerParts.join('')}</div>` : '') +
      (boxCards.length ? `<div class="ucrt-boxes">${boxCards.join('')}</div>` : '') +
    `</div>`
  );
}
