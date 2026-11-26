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
  --ucrt-ref-proph-fg: #9d176b;
  --ucrt-ref-proph-bg: rgba(157, 23, 107, 0.10);
  --ucrt-ref-contrast-fg: #b42318;
  --ucrt-ref-contrast-bg: rgba(180, 35, 24, 0.10);
  --ucrt-ref-type-fg: #0e7490;
  --ucrt-ref-type-bg: rgba(14, 116, 144, 0.10);
  --ucrt-ref-quote-fg: #4338ca;
  --ucrt-ref-quote-bg: rgba(67, 56, 202, 0.10);
  --ucrt-strong-fg: #2b4c9b;
  --ucrt-strong-bg: rgba(43, 76, 155, 0.10);
  --ucrt-fs-fg: #0f7068;
  --ucrt-fs-bg: rgba(15, 112, 104, 0.10);
  --ucrt-flag-fg: #5c5346;
  --ucrt-flag-bg: rgba(92, 83, 70, 0.12);
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
  --ucrt-ref-proph-fg: #a21caf;
  --ucrt-ref-proph-bg: rgba(162, 28, 175, 0.10);
  --ucrt-ref-contrast-fg: #b91c1c;
  --ucrt-ref-contrast-bg: rgba(185, 28, 28, 0.10);
  --ucrt-ref-type-fg: #0e7490;
  --ucrt-ref-type-bg: rgba(14, 116, 144, 0.10);
  --ucrt-ref-quote-fg: #4338ca;
  --ucrt-ref-quote-bg: rgba(67, 56, 202, 0.10);
  --ucrt-strong-fg: #2648a1;
  --ucrt-strong-bg: rgba(38, 72, 161, 0.10);
  --ucrt-fs-fg: #0d736b;
  --ucrt-fs-bg: rgba(13, 115, 107, 0.10);
  --ucrt-flag-fg: #475569;
  --ucrt-flag-bg: rgba(71, 85, 105, 0.12);
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
  --ucrt-ref-proph-fg: #941b66;
  --ucrt-ref-proph-bg: rgba(148, 27, 102, 0.11);
  --ucrt-ref-contrast-fg: #a6261d;
  --ucrt-ref-contrast-bg: rgba(166, 38, 29, 0.11);
  --ucrt-ref-type-fg: #126a80;
  --ucrt-ref-type-bg: rgba(18, 106, 128, 0.11);
  --ucrt-ref-quote-fg: #3f36ad;
  --ucrt-ref-quote-bg: rgba(63, 54, 173, 0.10);
  --ucrt-strong-fg: #2d4c8f;
  --ucrt-strong-bg: rgba(45, 76, 143, 0.10);
  --ucrt-fs-fg: #156960;
  --ucrt-fs-bg: rgba(21, 105, 96, 0.11);
  --ucrt-flag-fg: #5e4f3c;
  --ucrt-flag-bg: rgba(94, 79, 60, 0.13);
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
  --ucrt-ref-proph-fg: #f472c4;
  --ucrt-ref-proph-bg: rgba(244, 114, 196, 0.14);
  --ucrt-ref-contrast-fg: #fb7185;
  --ucrt-ref-contrast-bg: rgba(251, 113, 133, 0.14);
  --ucrt-ref-type-fg: #38bdf8;
  --ucrt-ref-type-bg: rgba(56, 189, 248, 0.14);
  --ucrt-ref-quote-fg: #a5b4fc;
  --ucrt-ref-quote-bg: rgba(165, 180, 252, 0.14);
  --ucrt-strong-fg: #93b4ff;
  --ucrt-strong-bg: rgba(147, 180, 255, 0.13);
  --ucrt-fs-fg: #5cd6c9;
  --ucrt-fs-bg: rgba(92, 214, 201, 0.13);
  --ucrt-flag-fg: #cbd5e1;
  --ucrt-flag-bg: rgba(203, 213, 225, 0.14);
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

.verse-text .ucrt-ref--proph {
  color: var(--ucrt-ref-proph-fg);
  background: var(--ucrt-ref-proph-bg);
}

.verse-text .ucrt-ref--contrast {
  color: var(--ucrt-ref-contrast-fg);
  background: var(--ucrt-ref-contrast-bg);
}

.verse-text .ucrt-ref--type {
  color: var(--ucrt-ref-type-fg);
  background: var(--ucrt-ref-type-bg);
}

.verse-text .ucrt-ref--quote {
  color: var(--ucrt-ref-quote-fg);
  background: var(--ucrt-ref-quote-bg);
}

.verse-text .ucrt-flag {
  display: inline-block;
  padding: 0 4px;
  margin: 0 1px;
  border-radius: 3px;
  background: var(--ucrt-flag-bg);
  color: var(--ucrt-flag-fg);
  font-family: var(--font-ui);
  font-size: 0.74em;
  font-weight: 700;
  line-height: 1.35;
  vertical-align: baseline;
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

const UCRT_BOOK_CODES =
  '(?:[123]\\s*)?(?:' +
  'Gên|Gn|Gen|Êx|Ex|Exo|Lv|Lev|Nm|Num|Dt|Deu|Js|Jos|Jz|Jdg|Rt|Rth|' +
  'Sm|Sam|Rs|Ki|Cr|Ch|Ed|Ezr|Ne|Neh|Et|Est|Jó|Job|Sl|Ps|Psa|Pv|Pro|' +
  'Ec|Ecc|Ct|Son|Is|Isa|Jr|Jer|Lm|Lam|Ez|Eze|Dn|Dan|Os|Hos|Jl|Joe|' +
  'Am|Amo|Ob|Oba|Jn|Jon|Mq|Mic|Na|Nah|Hc|Hab|Sf|Zep|Ag|Hag|Zc|Zec|Ml|Mal|' +
  'Mt|Mat|Mc|Mar|Lc|Luk|Jo|Joh|At|Act|Rm|Rom|Co|Gl|Gal|Ef|Eph|Fp|Php|' +
  'Cl|Col|Ts|Th|Tm|Ti|Tt|Tit|Fm|Phm|Hb|Heb|Tg|Jas|Pe|Jd|Jud|Ap|Rev' +
  ')\\.?';

const UCRT_PLAIN_SYM_TOKEN = '(?:&lt;rp\\s+|&lt;a\\s+|=&gt;|&gt;|[+*%=#$])';
const UCRT_PLAIN_REF_RE = new RegExp(
  `(^|[\\s(\\[;,])((?:${UCRT_PLAIN_SYM_TOKEN}){0,5})(${UCRT_BOOK_CODES}\\s+\\d+:\\d+(?:\\s*[-–—]\\s*\\d+(?::\\d+)?)?(?:\\s*,\\s*\\d+(?:\\s*[-–—]\\s*\\d+)?)*)(?=$|[\\s.,;:()\\]])`,
  'g'
);

const UCRT_TAG_SYM_TOKEN = '(?:\\u0005LT(?:rp|a)\\u0006\\s+|\\u0005GT\\u0006|=&gt;|&gt;|[+*%=#$])';

function ensureUcrtStyles() {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(UCRT_STYLE_ID);
  if (existing) {
    existing.textContent = UCRT_CSS;
    return;
  }
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
  if (!clean || clean.length > 95) return false;
  if (!/^(?:c\.?\s*)?(?:A\.?\s*M\.?|A\.?\s*C\.?|D\.?\s*C\.?|B\.?\s*C\.?|A\.?\s*D\.?|An\.?\s*Ex\.?\s*Is\.?)\s*\d/i.test(clean)) {
    return false;
  }
  if (/<(?:R|VD|AV|BG|ST|WORD)>/i.test(clean) || /\d+:\d+/.test(clean)) {
    return false;
  }
  return true;
}

function isStandaloneVerseRef(str) {
  const clean = cleanSpaces(String(str || '').replace(/<[^>]*>/g, ''));
  return /^(?:[123]\s*)?[A-Za-zÀ-ÿ]{2,5}\.?\s+\d+:\d+$/.test(clean);
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

function decodeSymbolForLogic(symHtml) {
  return String(symHtml || '')
    .replace(/\u0005GT\u0006/g, '>')
    .replace(/\u0005LT(rp|a)\u0006/g, '<$1')
    .replace(/&gt;/gi, '>')
    .replace(/&lt;/gi, '<');
}

function recordUcrtSymbols(symPlain, symbolsUsed, defaultSymbol = '') {
  const s = String(symPlain || '').trim();
  if (!s) {
    if (defaultSymbol) symbolsUsed.add(defaultSymbol);
    return;
  }
  if (s.includes('%')) symbolsUsed.add('%');
  if (s.includes('$')) symbolsUsed.add('$');
  if (s.includes('=>')) {
    symbolsUsed.add('=>');
  } else if (s.includes('=')) {
    symbolsUsed.add('=');
  }
  if (s.includes('<rp')) symbolsUsed.add('<rp');
  if (s.includes('<a')) symbolsUsed.add('<a');
  if (s.includes('>') && !s.includes('=>')) symbolsUsed.add('>');
  if (s.includes('#')) symbolsUsed.add('#');
  if (s.includes('+')) symbolsUsed.add('+');
  if (s.includes('**')) {
    symbolsUsed.add('**');
  } else if (s.includes('*')) {
    symbolsUsed.add('*');
  }
  if (s.includes('+*') || s.includes('*+') || s.includes('+**')) {
    symbolsUsed.add('+*');
  }
}

function classifyUcrtRef(symPlain, tagModifier = '') {
  if (tagModifier === 'bg') return 'bg';
  const s = String(symPlain || '');
  if (s.includes('%')) return 'contrast';
  if (s.includes('$')) return 'proph';
  if (s.includes('=')) return 'type';
  if (s.includes('>') || s.includes('<a') || s.includes('<rp') || s.includes('#')) return 'quote';
  if (s.includes('+')) return 'av';
  if (s.includes('*')) return 'vd';
  return tagModifier || 'r';
}

function buildRefSpanHtml(symRaw, refText, tagModifier, symbolsUsed) {
  const symPlain = decodeSymbolForLogic(symRaw);
  const symDisplay = escapeHtml(symPlain);
  const defaultSym = tagModifier === 'bg' ? 'BG' : tagModifier === 'vd' ? '*' : tagModifier === 'av' ? '+' : '';
  recordUcrtSymbols(symPlain, symbolsUsed, defaultSym);
  if (tagModifier === 'bg') symbolsUsed.add('BG');
  const cssMod = classifyUcrtRef(symPlain, tagModifier);
  return `<span class="ucrt-ref ucrt-ref--${cssMod}" data-ref="${refText}">${symDisplay}${refText}</span>`;
}

function transformPlainTextSegments(html, transformFn) {
  const parts = String(html || '').split(/(<[^>]+>)/g);
  let skipDepth = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (part.startsWith('<')) {
      if (/^<span\b[^>]*\bucrt-(?:ref|strong|fs|flag)\b/i.test(part)) {
        skipDepth++;
      } else if (skipDepth > 0 && /^<span\b/i.test(part)) {
        skipDepth++;
      } else if (skipDepth > 0 && /^<\/span>/i.test(part)) {
        skipDepth--;
      }
      continue;
    }
    if (skipDepth === 0) {
      parts[i] = transformFn(part);
    }
  }
  return parts.join('');
}

function formatUcrtBody(rawBody, symbolsUsed) {
  let refCount = 0;

  // Protege entidades/símbolos literais da UCRT (&gt;, &lt;a, &lt;rp, <a, <rp) antes de escapar HTML
  const protectedRaw = String(rawBody || '')
    .replace(/&(?:amp;)?gt;/gi, '\u0005GT\u0006')
    .replace(/&(?:amp;)?lt;(rp|a)(?=\s)/gi, '\u0005LT$1\u0006')
    .replace(/(^|[\s,;(\[])<(rp|a)(?=\s+(?:[123]\s*)?[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ<])/g, '$1\u0005LT$2\u0006');

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

  // Referências com tags conhecidas (<VD>, <AV>, <BG>, <R>), aceitando combinações de símbolos antes da tag
  const replaceRefTag = (tagName, tagModifier) => {
    const re = new RegExp(
      `((?:${UCRT_TAG_SYM_TOKEN}){0,5})\\s*&lt;${tagName}&gt;([\\s\\S]*?)&lt;\\/?${tagName}&gt;`,
      'gi'
    );
    safe = safe.replace(re, (_, symRaw, refRaw) => {
      const refText = cleanSpaces(refRaw);
      if (!refText) return '';
      refCount++;
      return buildRefSpanHtml(symRaw || '', refText, tagModifier, symbolsUsed);
    });
  };

  replaceRefTag('VD', 'vd');
  replaceRefTag('AV', 'av');
  replaceRefTag('BG', 'bg');
  replaceRefTag('R', 'r');

  // Remove quaisquer outras tags customizadas desconhecidas
  safe = safe.replace(
    /&lt;\/?[a-zA-Z][a-zA-Z0-9_:*.-]*(?:[\s=](?:(?!&gt;|&lt;).)*)?\/?&gt;/g,
    ''
  );

  // Restaura marcadores literais protegidos (> , <a , <rp)
  safe = safe
    .replace(/\u0005GT\u0006/g, '&gt;')
    .replace(/\u0005LT(rp|a)\u0006/g, '&lt;$1');

  // Captura referências bíblicas restantes em texto puro (com símbolos $, %, =, >, *+, +$, %+*, ou sem tag)
  safe = transformPlainTextSegments(safe, (chunk) => {
    let out = chunk.replace(UCRT_PLAIN_REF_RE, (full, lead, symRaw, refRaw) => {
      const refText = cleanSpaces(refRaw);
      if (!refText) return full;
      refCount++;
      return `${lead}${buildRefSpanHtml(symRaw || '', refText, '', symbolsUsed)}`;
    });

    // Destaca códigos de Figuras de Linguagem (FS148, FS16, FS171G2)
    out = out.replace(/(^|[\s(;,])(FS\d+[A-Z0-9]*)\b/g, (_, lead, fsCode) => {
      symbolsUsed.add('FS');
      return `${lead}<span class="ucrt-fs">${fsCode}</span>`;
    });

    return out;
  });

  // Destaca marcadores curtos g / h / n logo após uma referência (ex.: Tg 1:23 g, Ap 22:6 g, n)
  safe = safe.replace(
    /(<span class="ucrt-ref\b[^>]*>[\s\S]*?<\/span>)\s+((?:g|h|n)(?:\s*,\s*(?:g|h|n))?)(?=$|[\s.,;:()\]])/g,
    (_, refSpan, flagsRaw) => {
      const flags = flagsRaw.split(/\s*,\s*/).filter(Boolean);
      const renderedFlags = flags
        .map((f) => {
          symbolsUsed.add(f);
          const title = f === 'g'
            ? 'Mesma palavra no grego original'
            : f === 'h'
              ? 'Mesma palavra no hebraico original'
              : 'Há nota explicativa nesta passagem';
          return `<span class="ucrt-flag" title="${title}">${f}</span>`;
        })
        .join('');
      return `${refSpan} ${renderedFlags}`;
    }
  );

  // Detecta se a caixa é composta quase só por referências
  const plainWithoutRefs = safe
    .replace(/<span class="ucrt-(?:ref|flag)\b[\s\S]*?<\/span>/g, '')
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
    lines.push('• [Verde] * — Referência muito clara, com conexão imediata ao versículo.');
  }
  if (symbolsUsed.has('**')) {
    lines.push('• [Verde] ** — Referência muito significativa e criticamente clara.');
  }
  if (symbolsUsed.has('+')) {
    lines.push('• [Âmbar] + — "Encontre mais aqui": ponto principal com mais referências sobre o tema.');
  }
  if (symbolsUsed.has('+*')) {
    lines.push('• [Âmbar] +* / *+ / +** — Referência clara que também serve como ponto principal de aprofundamento.');
  }
  if (symbolsUsed.has('$')) {
    lines.push('• [Magenta] $ — Cumprimento de profecia (pode combinar com * e +).');
  }
  if (symbolsUsed.has('%')) {
    lines.push('• [Vermelho] % — Contraste ou aspecto oposto ao assunto (pode combinar com + e *).');
  }
  if (symbolsUsed.has('=') || symbolsUsed.has('=>')) {
    lines.push('• [Ciano] = / => — Tipo ou antítipo (=> confirmado pela própria Escritura).');
  }
  if (symbolsUsed.has('>')) {
    lines.push('• [Índigo] > — Citação direta entre o Antigo e o Novo Testamento.');
  }
  if (symbolsUsed.has('<a')) {
    lines.push('• [Índigo] <a — Alusão a outra passagem bíblica.');
  }
  if (symbolsUsed.has('<rp')) {
    lines.push('• [Índigo] <rp — Citação do Pentateuco nos livros proféticos.');
  }
  if (symbolsUsed.has('#')) {
    lines.push('• [Índigo] # — Passagem paralela estrita.');
  }
  if (symbolsUsed.has('BG')) {
    lines.push('• [Violeta] nota — Referência acompanhada de nota explicativa importante na UCRT.');
  }
  if (symbolsUsed.has('g')) {
    lines.push('• [Etiqueta] g — Mesma palavra no grego original.');
  }
  if (symbolsUsed.has('h')) {
    lines.push('• [Etiqueta] h — Mesma palavra no hebraico original.');
  }
  if (symbolsUsed.has('n')) {
    lines.push('• [Etiqueta] n — Há uma nota explicativa na passagem indicada.');
  }
  if (symbolsUsed.has('+S#')) {
    lines.push('• [Azul] +S# — Número Strong com todas as ocorrências relevantes/paralelas.');
  }
  if (symbolsUsed.has('*S#')) {
    lines.push('• [Azul] *S# — Número Strong com todas as ocorrências da palavra original.');
  }
  if (symbolsUsed.has('S#')) {
    lines.push('• [Azul] S# — Número lexical da Concordância de Strong (hebraico/grego).');
  }
  if (symbolsUsed.has('FS')) {
    lines.push('• [Verde-petróleo] FS — Figura de Linguagem (classificação de E. W. Bullinger).');
  }
  if (hasChrono) {
    lines.push('• [Cronologia] A.M. = Ano do Mundo; A.C. = Antes de Cristo; AD = Depois de Cristo; An. Ex. Is. = Anos desde o Êxodo.');
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

    if (!keyword && isStandaloneVerseRef(boxInner)) {
      if (!vtRef) vtRef = cleanSpaces(boxInner.replace(/<[^>]*>/g, ''));
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
    if (isStandaloneVerseRef(leftoverRaw)) {
      if (!vtRef) vtRef = cleanSpaces(leftoverRaw.replace(/<[^>]*>/g, ''));
    } else if (isChronologyText(leftoverRaw)) {
      chronos.push(cleanSpaces(leftoverRaw).replace(/\.$/, ''));
    } else {
      const leftoverFormatted = formatUcrtBody(leftoverRaw, symbolsUsed);
      if (leftoverFormatted.html) {
        boxCards.push(
          `<div class="ucrt-box"><div class="ucrt-box-plain">${leftoverFormatted.html}</div></div>`
        );
      }
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
