import {
  isLinguisticClauseHtml,
  formatLinguisticClauseHtml
} from './linguistic-bh.js';
import {
  isSupFontInterlinear,
  formatSupFontInterlinear
} from './interlinear-sup.js';

const RE_HEBREW = /[\u0590-\u05FF\u0700-\u074F]/;
const RE_ANCIENT = /[\u0590-\u05FF\u0700-\u074F\u0370-\u03FF\u1F00-\u1FFF]/;
const RE_LATIN = /[A-Za-z\u00C0-\u024F]/;
const RE_INTERLINEAR_Q = /<Q(?:\s+[^>]*)?>[\s\S]*?(?:<\/Q>|<q>)/;
const RE_INTERLINEAR_LAYER = /<(?:H|G|X|E)(?:\s+[^>]*)?>/;
const RE_STRUCTURED_ROW = /<R(?:\s+[^>]*)?>[\s\S]*?<T1(?:\s+[^>]*)?>/;
const RE_PAIR_TAG = /<(heb|grk|gk|arm|orig)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>\s*<(hbint|grint|gkint|arint|int|trans)(?:\s+[^>]*)?>([\s\S]*?)<\/\3>/gi;
const RE_ANCIENT_RUN = /([\u0590-\u05FF\u0700-\u074F\u0370-\u03FF\u1F00-\u1FFF][\u0590-\u05FF\u0700-\u074F\u0370-\u03FF\u1F00-\u1FFF\u0001\u0003\u00040-9\s\u05BE\u05C0\u05C3\u05F3\u05F4׃:־'’·;,.-]*[\u0590-\u05FF\u0700-\u074F\u0370-\u03FF\u1F00-\u1FFF\u05C3:]|[\u0590-\u05FF\u0700-\u074F\u0370-\u03FF\u1F00-\u1FFF]+)/g;

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanText(str) {
  return String(str || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripAllTagsKeepSpaces(str) {
  return cleanText(String(str || '').replace(/<\/?[a-zA-Z][^>]*>/g, ''));
}

function formatClauseInlineHtml(raw) {
  let safe = escapeHtml(String(raw || ''));
  safe = safe
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;(?:i|em)&gt;/gi, '<em>')
    .replace(/&lt;\/(?:i|em)&gt;/gi, '</em>')
    .replace(/&lt;(?:b|strong)&gt;/gi, '<strong>')
    .replace(/&lt;\/(?:b|strong)&gt;/gi, '</strong>')
    .replace(/&lt;u&gt;/gi, '<u>')
    .replace(/&lt;\/u&gt;/gi, '</u>')
    .replace(/&lt;\/?[a-zA-Z][a-zA-Z0-9_:-]*(?:[\s=](?:(?!&gt;|&lt;).)*)?\/?&gt;/g, '');

  return safe
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/(?:<br>\s*)+$/, '')
    .replace(/^(?:<br>\s*)+/, '')
    .trim();
}

export function hasHebrewScript(str) {
  return RE_HEBREW.test(String(str || ''));
}

export function isBilingualAncientText(str) {
  const s = String(str || '');
  const plain = s.replace(/<[^>]*>/g, ' ');
  if (
    isLinguisticClauseHtml(s) ||
    isSupFontInterlinear(s) ||
    RE_STRUCTURED_ROW.test(s)
  ) {
    return true;
  }
  if (RE_INTERLINEAR_Q.test(s)) {
    return RE_ANCIENT.test(plain) || RE_INTERLINEAR_LAYER.test(s);
  }
  return RE_ANCIENT.test(plain) && RE_LATIN.test(plain);
}

function wordCount(str) {
  const clean = cleanText(str).replace(/[\u0001\u0003\u0004]\d+[\u0001\u0003\u0004]/g, '');
  return clean ? clean.split(/\s+/).filter(Boolean).length : 0;
}

function renderWordCard(orig, gloss) {
  const origClean = cleanText(orig);
  const glossClean = cleanText(gloss);
  const origDir = hasHebrewScript(origClean) ? ' dir="rtl"' : '';
  const origHtml = origClean
    ? `<span class="il-orig"${origDir}>${escapeHtml(origClean)}</span>`
    : '<span class="il-orig il-orig-empty">&middot;</span>';
  const glossHtml = glossClean
    ? `<span class="il-gloss" dir="ltr">${escapeHtml(glossClean)}</span>`
    : '';
  return `<span class="il-word">${origHtml}${glossHtml}</span>`;
}

function renderHeaderOrig(text) {
  const clean = cleanText(text);
  if (!clean) return '';
  const dirAttr = hasHebrewScript(clean) ? ' dir="rtl"' : '';
  return `<div class="il-header-orig"${dirAttr}>${escapeHtml(clean)}</div>`;
}

function renderFlow(cards, isRtl) {
  if (!cards.length) return '';
  return `<div class="il-flow" dir="${isRtl ? 'rtl' : 'ltr'}">${cards.join('')}</div>`;
}

function parseInterlinearQBlocks(rawHtml, verseNum) {
  const blockRegex = /<Q(?:\s+[^>]*)?>([\s\S]*?)(?:<\/Q>|<q>)/g;
  const fieldRegex = /<H(?:\s+[^>]*)?>([\s\S]*?)(?:<\/H>|<h>)|<G(?:\s+[^>]*)?>([\s\S]*?)(?:<\/G>|<g>)|<X(?:\s+[^>]*)?>([\s\S]*?)(?:<\/X>|<x>)|<E(?:\s+[^>]*)?>([\s\S]*?)(?:<\/E>|<e>)|<T(?:\s+[^>]*)?>([\s\S]*?)(?:<\/T>|<t>)/g;

  const items = [];
  let hasH = false;
  let blockMatch;

  while ((blockMatch = blockRegex.exec(rawHtml)) !== null) {
    const inner = blockMatch[1] || '';
    const orig = [];
    const translit = [];
    const gloss = [];
    fieldRegex.lastIndex = 0;
    let fm;

    while ((fm = fieldRegex.exec(inner)) !== null) {
      if (fm[1] !== undefined) {
        hasH = true;
        orig.push(stripAllTagsKeepSpaces(fm[1]));
      } else if (fm[2] !== undefined) {
        orig.push(stripAllTagsKeepSpaces(fm[2]));
      } else if (fm[3] !== undefined) {
        translit.push(stripAllTagsKeepSpaces(fm[3]));
      } else if (fm[4] !== undefined) {
        gloss.push(stripAllTagsKeepSpaces(fm[4]));
      } else if (fm[5] !== undefined) {
        gloss.push(stripAllTagsKeepSpaces(fm[5]));
      }
    }

    // Fallback para módulos <Q>texto<X>...<x><T>...<t><q> sem <H>/<G>
    if (!orig.length) {
      fieldRegex.lastIndex = 0;
      const leftover = inner.replace(fieldRegex, '');
      const plainOrig = stripAllTagsKeepSpaces(leftover);
      if (plainOrig) {
        if (hasHebrewScript(plainOrig)) hasH = true;
        orig.push(plainOrig);
      }
    }

    if (orig.length || translit.length || gloss.length) {
      items.push({ orig, translit, gloss });
    }
  }

  if (!items.length) return '';

  // Bloco paralelo de versículo inteiro: <Q>Português<E>Hebraico/Grego<e><q> (ex.: IMSo)
  if (items.length === 1 && !items[0].translit.length) {
    const topText = items[0].orig.filter(Boolean).join(' ');
    const bottomText = items[0].gloss.filter(Boolean).join(' ');
    if (
      topText &&
      bottomText &&
      RE_LATIN.test(topText) &&
      !RE_ANCIENT.test(topText) &&
      RE_ANCIENT.test(bottomText)
    ) {
      const ancientIsRtl = hasHebrewScript(bottomText);
      const ancientCls = ancientIsRtl ? 'v-rtl' : 'v-ltr';
      const ancientDir = ancientIsRtl ? 'rtl' : 'ltr';
      return (
        `<span class="v-ltr" dir="ltr">${escapeHtml(topText)}</span>` +
        '<span class="v-parallel-sep"></span>' +
        `<span class="${ancientCls}" dir="${ancientDir}">${escapeHtml(bottomText)}</span>`
      );
    }
  }

  const isRtl = hasH || hasHebrewScript(rawHtml);
  const maxX = Math.max(0, ...items.map((it) => it.translit.length));
  const maxE = Math.max(0, ...items.map((it) => it.gloss.length));
  const stacks = [];

  if (verseNum) {
    stacks.push(`<span class="il-vnum">${verseNum}</span>`);
  }

  for (const it of items) {
    const lines = [];
    const origText = it.orig.filter(Boolean).join(' ');
    const origDir = hasHebrewScript(origText) ? ' dir="rtl"' : '';
    lines.push(
      origText
        ? `<span class="il-orig"${origDir}>${escapeHtml(origText)}</span>`
        : '<span class="il-orig il-orig-empty">&middot;</span>'
    );

    for (let i = 0; i < maxX; i++) {
      const val = it.translit[i] || '';
      const cls = i === 0 ? 'il-translit' : 'il-translit il-translit-2';
      lines.push(`<span class="${cls}" dir="ltr">${val ? escapeHtml(val) : '&nbsp;'}</span>`);
    }

    for (let i = 0; i < maxE; i++) {
      const val = it.gloss[i] || '';
      const cls = i === 0 ? 'il-gloss-lit' : 'il-gloss-ctx';
      lines.push(`<span class="${cls}" dir="ltr">${val ? escapeHtml(val) : '&nbsp;'}</span>`);
    }

    stacks.push(`<span class="il-stack">${lines.join('')}</span>`);
  }

  const blocks = [];
  const firstQ = rawHtml.search(/<Q(?:\s+[^>]*)?>/);
  if (firstQ > 0) {
    const headerText = stripAllTagsKeepSpaces(rawHtml.slice(0, firstQ));
    if (headerText) blocks.push(renderHeaderOrig(headerText));
  }

  blocks.push(`<div class="il-flow il-q-flow" dir="${isRtl ? 'rtl' : 'ltr'}">${stacks.join('')}</div>`);
  return `<div class="il-block il-q-block">${blocks.join('')}</div>`;
}

function parseStructuredRows(rawHtml) {
  const firstRowIdx = rawHtml.search(/<R(?:\s+[^>]*)?>/);
  if (firstRowIdx < 0) return '';

  const blocks = [];
  const headerText = stripAllTagsKeepSpaces(rawHtml.slice(0, firstRowIdx));
  if (headerText) blocks.push(renderHeaderOrig(headerText));

  const rowRegex = /<R(?:\s+[^>]*)?>([\s\S]*?)(?:<\/R>|<r>)/g;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(rawHtml)) !== null) {
    const rowContent = rowMatch[1] || '';
    const cells = new Map();
    const cellRegex = /<T(\d)(?:\s+[^>]*)?>([\s\S]*?)(?:<\/T\1>|<t>)/g;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      cells.set(cellMatch[1], cellMatch[2] || '');
    }

    const cardParts = [];
    const t1Raw = cells.get('1') || '';

    if (t1Raw) {
      const pairs = [];
      let rtlDetected = hasHebrewScript(t1Raw);
      RE_PAIR_TAG.lastIndex = 0;
      let pairMatch;

      while ((pairMatch = RE_PAIR_TAG.exec(t1Raw)) !== null) {
        const orig = stripAllTagsKeepSpaces(pairMatch[2]);
        const gloss = stripAllTagsKeepSpaces(pairMatch[4]);
        if (orig || gloss) {
          if (hasHebrewScript(orig)) rtlDetected = true;
          pairs.push(renderWordCard(orig, gloss));
        }
      }

      if (pairs.length) {
        cardParts.push(renderFlow(pairs, rtlDetected));
      } else {
        const fallbackT1 = buildFromTokens(tokenizeInline(t1Raw), false);
        if (fallbackT1) cardParts.push(fallbackT1);
      }
    }

    const transParts = [];
    for (const key of ['2', '3', '4']) {
      if (!cells.has(key)) continue;
      const html = formatClauseInlineHtml(cells.get(key));
      if (html) transParts.push(`<div class="il-trans il-trans-${key}">${html}</div>`);
    }

    if (transParts.length) {
      cardParts.push(`<div class="il-trans-list">${transParts.join('')}</div>`);
    }
    if (cardParts.length) {
      blocks.push(`<div class="il-clause-card">${cardParts.join('')}</div>`);
    }
  }

  return blocks.length ? `<div class="il-block">${blocks.join('')}</div>` : '';
}

function tokenizeInline(rawHtml) {
  const normalized = String(rawHtml || '')
    .replace(/<\/?(?:i|em|b|strong|u|sup|sub)>/gi, '')
    .replace(/<(?:br|p|div|tr|td|th|table|tbody|thead|tfoot|li|CM|CL|CI|PI\d?|PF\d?)(?:\s+[^>]*)?\/?>/gi, '\u0002')
    .replace(/<\/(?:p|div|tr|td|th|table|tbody|thead|tfoot|li|span|font|q|a)>/gi, '\u0002')
    .replace(/<(?:span|font|q|a)(?:\s+[^>]*)?>/gi, '\u0002')
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9_:-]*(?:[\s=][^>]*)?\/?>/g, '\u0002')
    .replace(/\n+/g, '\u0002');

  const rawSegments = normalized.split('\u0002').map(cleanText).filter(Boolean);
  const tokens = [];

  for (const seg of rawSegments) {
    const hasAnc = RE_ANCIENT.test(seg);
    const hasLat = RE_LATIN.test(seg);

    if (hasAnc && !hasLat) {
      tokens.push({ kind: 'ancient', text: seg });
      continue;
    }
    if (!hasAnc && hasLat) {
      tokens.push({ kind: 'latin', text: seg });
      continue;
    }
    if (!hasAnc && !hasLat) {
      tokens.push({ kind: 'other', text: seg });
      continue;
    }

    let lastIdx = 0;
    RE_ANCIENT_RUN.lastIndex = 0;
    let m;
    while ((m = RE_ANCIENT_RUN.exec(seg)) !== null) {
      if (m.index > lastIdx) {
        const before = cleanText(seg.slice(lastIdx, m.index));
        if (before) tokens.push({ kind: RE_LATIN.test(before) ? 'latin' : 'other', text: before });
      }
      tokens.push({ kind: 'ancient', text: cleanText(m[0]) });
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < seg.length) {
      const tail = cleanText(seg.slice(lastIdx));
      if (tail) tokens.push({ kind: RE_LATIN.test(tail) ? 'latin' : 'other', text: tail });
    }
  }

  return tokens;
}

function buildFromTokens(tokens, wrapOuter = true) {
  const blocks = [];
  let flowCards = [];
  let flowRtl = false;

  const isLongAncient = (txt) => wordCount(txt) >= 4;
  const isLongLatin = (txt) => wordCount(txt) >= 6 || (/[.!?¶"“”]/.test(txt) && wordCount(txt) >= 4);

  function flushFlow() {
    if (flowCards.length) {
      blocks.push(renderFlow(flowCards, flowRtl));
      flowCards = [];
      flowRtl = false;
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const cur = tokens[i];
    const next = tokens[i + 1];
    if (cur.kind === 'other') continue;

    if (cur.kind === 'ancient' && isLongAncient(cur.text)) {
      flushFlow();
      blocks.push(renderHeaderOrig(cur.text));
      continue;
    }

    if (cur.kind === 'ancient' && next && next.kind === 'latin' && !isLongLatin(next.text)) {
      if (hasHebrewScript(cur.text)) flowRtl = true;
      flowCards.push(renderWordCard(cur.text, next.text));
      i++;
      continue;
    }

    if (cur.kind === 'ancient') {
      if (hasHebrewScript(cur.text)) flowRtl = true;
      flowCards.push(renderWordCard(cur.text, ''));
      continue;
    }

    flushFlow();
    blocks.push(`<div class="il-clause">${escapeHtml(cur.text)}</div>`);
  }

  flushFlow();
  const inner = blocks.join('');
  return wrapOuter ? `<div class="il-block">${inner}</div>` : inner;
}

export function formatInterlinearHtml(rawHtml, verseNum = null) {
  if (isLinguisticClauseHtml(rawHtml)) {
    const bhHtml = formatLinguisticClauseHtml(rawHtml);
    if (bhHtml) return bhHtml;
  }

  if (RE_INTERLINEAR_Q.test(rawHtml)) {
    const qHtml = parseInterlinearQBlocks(rawHtml, verseNum);
    if (qHtml) return qHtml;
  }

  if (RE_STRUCTURED_ROW.test(rawHtml)) {
    const structured = parseStructuredRows(rawHtml);
    if (structured) return structured;
  }

  if (isSupFontInterlinear(rawHtml)) {
    const supHtml = formatSupFontInterlinear(rawHtml, verseNum);
    if (supHtml) return supHtml;
  }

  if (RE_PAIR_TAG.test(rawHtml)) {
    RE_PAIR_TAG.lastIndex = 0;
    const cards = [];
    let isRtl = false;
    let m;
    while ((m = RE_PAIR_TAG.exec(rawHtml)) !== null) {
      const orig = stripAllTagsKeepSpaces(m[2]);
      const gloss = stripAllTagsKeepSpaces(m[4]);
      if (hasHebrewScript(orig)) isRtl = true;
      if (orig || gloss) cards.push(renderWordCard(orig, gloss));
    }
    if (cards.length) {
      return `<div class="il-block">${renderFlow(cards, isRtl)}</div>`;
    }
  }

  return buildFromTokens(tokenizeInline(rawHtml), true);
}
