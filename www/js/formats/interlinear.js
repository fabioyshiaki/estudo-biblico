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
const RE_REF_EMBED = /<VT(?:\s+[^>]*)?>[\s\S]*?<\/?VT>|<(?:NT|OT)(?:\s+[^>]*)?>\s*(?:[123]\s*)?[A-Za-zÀ-ÿ]{2,6}\.?\s+\d+[:.]\d+(?:\s*[-–—]\s*\d+)?\s*<\/?(?:NT|OT)>/gi;
const RE_PAIR_TAG = /<(heb|grk|gk|arm|orig)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>\s*<(hbint|grint|gkint|arint|int|trans)(?:\s+[^>]*)?>([\s\S]*?)<\/\3>/gi;
const RE_ANCIENT_RUN = /([\u0590-\u05FF\u0700-\u074F\u0370-\u03FF\u1F00-\u1FFF][\u0590-\u05FF\u0700-\u074F\u0370-\u03FF\u1F00-\u1FFF\u0001\u0003\u00040-9\s\u05BE\u05C0\u05C3\u05F3\u05F4׃:־'’·;,.-]*[\u0590-\u05FF\u0700-\u074F\u0370-\u03FF\u1F00-\u1FFF\u05C3:]|[\u0590-\u05FF\u0700-\u074F\u0370-\u03FF\u1F00-\u1FFF]+)/g;
const RE_STRONG_TAG = /<W([GH])(\d[^<>]*)>/gi;
const RE_MORPH_TAG = /<WT([^<>]+)>/gi;

const RESERVED_MULTI_TAGS = new Set([
  'BR', 'HR', 'TR', 'TD', 'TH', 'LI', 'UL', 'OL', 'EM', 'SUP', 'SUB',
  'DIV', 'SPAN', 'FONT', 'FR', 'FI', 'FO', 'FU', 'RF', 'TS', 'TS1',
  'TS2', 'TS3', 'CM', 'CL', 'CI', 'PI', 'PF', 'RX', 'VT', 'NT', 'OT',
  'WG', 'WH', 'WT', 'WL', 'KQ', 'TW', 'CN', 'E1', 'E2', 'V1', 'V2',
  'NB1', 'NB2', 'BOX', 'WORD'
]);

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

function pushUnique(arr, val) {
  if (val && !arr.includes(val)) arr.push(val);
}

function formatClauseInlineHtml(raw) {
  let safe = escapeHtml(String(raw || ''));
  safe = safe
    .replace(/&lt;FR&gt;/g, '<span class="v-red">')
    .replace(/&lt;\/?Fr&gt;|&lt;\/FR&gt;/g, '</span>')
    .replace(/&lt;FI&gt;/g, '<em class="v-italic">')
    .replace(/&lt;\/?Fi&gt;|&lt;\/FI&gt;/g, '</em>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;(?:i|em)&gt;/gi, '<em>')
    .replace(/&lt;\/(?:i|em)&gt;/gi, '</em>')
    .replace(/&lt;(?:b|strong)&gt;/gi, '<strong>')
    .replace(/&lt;\/(?:b|strong)&gt;/gi, '</strong>')
    .replace(/&lt;u&gt;/gi, '<u>')
    .replace(/&lt;\/u&gt;/gi, '</u>')
    .replace(/&lt;\/?[a-zA-Z][a-zA-Z0-9_:*.-]*(?:[\s=](?:(?!&gt;|&lt;).)*)?\/?&gt;/g, '');

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

export function isReverseInterlinearQ(str) {
  const s = String(str || '');
  if (!RE_INTERLINEAR_Q.test(s)) return false;

  const blockRe = /<Q(?:\s+[^>]*)?>([\s\S]*?)(?:<\/Q>|<q>)/g;
  let m;
  while ((m = blockRe.exec(s)) !== null) {
    const inner = m[1] || '';
    const eMatch = /<E(?:\s+[^>]*)?>([\s\S]*?)(?:<\/E>|<e>)/.exec(inner);
    if (!eMatch) continue;
    const eInner = eMatch[1] || '';
    if (/<(G|H)(?:\s+[^>]*)?>[\s\S]*?(?:<\/\1>|<[gh]>)/.test(eInner)) {
      return true;
    }
  }
  return false;
}

export function formatReverseInterlinearQHtml(rawHtml, verseNum = null) {
  const source = String(rawHtml || '')
    .replace(/<KQ>[\s\S]*?<\/?kq>/gi, '')
    .replace(/<RX(?:(?!>|<).)*>/gi, '');

  const blockRe = /<Q(?:\s+[^>]*)?>([\s\S]*?)(?:<\/Q>|<q>)/g;
  const items = [];
  let hasStrong = false;
  let hasMorph = false;
  let bm;

  while ((bm = blockRe.exec(source)) !== null) {
    const inner = bm[1] || '';

    const strongs = [];
    RE_STRONG_TAG.lastIndex = 0;
    let sm;
    while ((sm = RE_STRONG_TAG.exec(inner)) !== null) {
      const num = String(sm[2] || '').replace(/\uFF0B/g, '+').trim();
      if (!num || num === '0') continue;
      pushUnique(strongs, `${sm[1].toUpperCase()}${num}`);
    }

    const morphs = [];
    RE_MORPH_TAG.lastIndex = 0;
    let mm;
    while ((mm = RE_MORPH_TAG.exec(inner)) !== null) {
      const cleanMorph = cleanText(String(mm[1] || '').replace(/\s+l="[^"]*"/gi, ''));
      if (cleanMorph) pushUnique(morphs, cleanMorph);
    }

    const origParts = [];
    const eRe = /<E(?:\s+[^>]*)?>([\s\S]*?)(?:<\/E>|<e>)/g;
    let em;
    while ((em = eRe.exec(inner)) !== null) {
      const eInner = em[1] || '';
      const ghRe = /<(G|H)(?:\s+[^>]*)?>([\s\S]*?)(?:<\/\1>|<[gh]>)/g;
      let ghm;
      let matchedGh = false;
      while ((ghm = ghRe.exec(eInner)) !== null) {
        matchedGh = true;
        const val = stripAllTagsKeepSpaces(ghm[2]);
        if (val) origParts.push(val);
      }
      if (!matchedGh) {
        const fallbackOrig = stripAllTagsKeepSpaces(eInner);
        if (fallbackOrig) origParts.push(fallbackOrig);
      }
    }

    const glossRaw = inner
      .replace(/<E(?:\s+[^>]*)?>[\s\S]*?(?:<\/E>|<e>)/g, ' ')
      .replace(RE_STRONG_TAG, ' ')
      .replace(RE_MORPH_TAG, ' ');
    const gloss = stripAllTagsKeepSpaces(glossRaw);
    const orig = origParts.join(' ');

    if (!gloss && !orig && !strongs.length && !morphs.length) continue;

    if (strongs.length) hasStrong = true;
    if (morphs.length) hasMorph = true;

    const isAllCaps = /[A-ZÀ-Ý]/.test(gloss) && !/[a-zà-ÿ]/.test(gloss);
    items.push({ gloss, isAllCaps, orig, strongs, morphs });
  }

  if (!items.length) return '';

  const cards = [];
  if (verseNum) {
    cards.push(`<span class="il-vnum">${verseNum}</span>`);
  }

  for (const it of items) {
    const lines = [];

    const capsCls = it.isAllCaps ? ' is-allcaps' : '';
    lines.push(
      it.gloss
        ? `<span class="il-rev-en${capsCls}" dir="ltr">${escapeHtml(it.gloss)}</span>`
        : '<span class="il-rev-en is-empty" dir="ltr">&nbsp;</span>'
    );

    const origDir = hasHebrewScript(it.orig) ? ' dir="rtl"' : '';
    lines.push(
      it.orig
        ? `<span class="il-orig"${origDir}>${escapeHtml(it.orig)}</span>`
        : '<span class="il-orig il-orig-empty">&middot;</span>'
    );

    if (hasStrong || hasMorph) {
      const lexRows = [];
      if (hasStrong) {
        if (it.strongs.length) {
          const sTags = it.strongs
            .map((code) => `<span class="v-strong il-rev-tag il-rev-strong" data-strong="${escapeHtml(code)}">${escapeHtml(code)}</span>`)
            .join('');
          lexRows.push(`<div class="il-rev-lex" dir="ltr">${sTags}</div>`);
        } else {
          lexRows.push('<div class="il-rev-lex is-empty" dir="ltr">&nbsp;</div>');
        }
      }

      if (hasMorph) {
        if (it.morphs.length) {
          const mTags = it.morphs
            .map((code) => `<span class="v-morph il-rev-tag il-rev-morph" data-morph="${escapeHtml(code)}">${escapeHtml(code)}</span>`)
            .join('');
          lexRows.push(`<div class="il-rev-lex" dir="ltr">${mTags}</div>`);
        } else {
          lexRows.push('<div class="il-rev-lex is-empty" dir="ltr">&nbsp;</div>');
        }
      }

      lines.push(`<div class="il-rev-lex-block">${lexRows.join('')}</div>`);
    }

    cards.push(`<span class="il-stack il-rev-stack">${lines.join('')}</span>`);
  }

  return (
    '<div class="il-block il-q-block il-rev-block">' +
      `<div class="il-flow il-q-flow il-rev-flow" dir="ltr">${cards.join('')}</div>` +
    '</div>'
  );
}

export function isBilingualAncientText(str) {
  const s = String(str || '');
  const plain = s
    .replace(RE_REF_EMBED, ' ')
    .replace(/<[^>]*>/g, ' ');
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

function appendGapTextToQItems(items, gapRaw) {
  const gap = stripAllTagsKeepSpaces(gapRaw);
  if (!gap) return;

  let rest = gap;
  if (items.length) {
    const leadPunct = /^([,.;:!?»”’)\]]+)(.*)$/.exec(rest);
    if (leadPunct) {
      const last = items[items.length - 1];
      if (last.orig.length) {
        last.orig[last.orig.length - 1] = `${last.orig[last.orig.length - 1]}${leadPunct[1]}`;
      } else {
        last.orig.push(leadPunct[1]);
      }
      rest = cleanText(leadPunct[2]);
    }
  }

  if (rest) {
    items.push({ orig: [rest], translit: [], gloss: [], isLoose: true });
  }
}

function renderMultiSectionQFlow(sectionRaw, badgeLabel, verseNum) {
  const cleanedRaw = String(sectionRaw || '')
    .replace(/^(?:\s*<br\s*\/?>\s*)+/i, '')
    .replace(/(?:\s*<br\s*\/?>\s*)+$/i, '');

  const blockRegex = /<Q(?:\s+[^>]*)?>([\s\S]*?)(?:<\/Q>|<q>)/g;
  const fieldRegex = /<H(?:\s+[^>]*)?>([\s\S]*?)(?:<\/H>|<h>)|<G(?:\s+[^>]*)?>([\s\S]*?)(?:<\/G>|<g>)|<X(?:\s+[^>]*)?>([\s\S]*?)(?:<\/X>|<x>)|<E(?:\s+[^>]*)?>([\s\S]*?)(?:<\/E>|<e>)|<T(?:\s+[^>]*)?>([\s\S]*?)(?:<\/T>|<t>)/g;

  const items = [];
  let hasH = false;
  let lastIndex = 0;
  let blockMatch;

  while ((blockMatch = blockRegex.exec(cleanedRaw)) !== null) {
    if (blockMatch.index > lastIndex) {
      appendGapTextToQItems(items, cleanedRaw.slice(lastIndex, blockMatch.index));
    }

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
      items.push({ orig, translit, gloss, isLoose: false });
    }

    lastIndex = blockRegex.lastIndex;
  }

  if (lastIndex < cleanedRaw.length) {
    appendGapTextToQItems(items, cleanedRaw.slice(lastIndex));
  }

  if (!items.length) return '';

  // Somente o hebraico no texto principal recebe direção RTL
  const isRtl = hasH || items.some((it) => hasHebrewScript(it.orig.join(' ')));
  const maxX = Math.max(0, ...items.map((it) => it.translit.length));
  const maxE = Math.max(0, ...items.map((it) => it.gloss.length));
  const stacks = [];

  if (verseNum) {
    stacks.push(`<span class="il-vnum">${verseNum}</span>`);
  }
  if (badgeLabel) {
    stacks.push(`<span class="il-multi-badge" dir="ltr">${escapeHtml(badgeLabel)}</span>`);
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
      const ancientCls = RE_ANCIENT.test(val) ? ' is-ancient' : '';
      const dirVal = hasHebrewScript(val) ? 'rtl' : 'ltr';
      const cls = i === 0 ? `il-translit${ancientCls}` : `il-translit il-translit-2${ancientCls}`;
      lines.push(`<span class="${cls}" dir="${dirVal}">${val ? escapeHtml(val) : '&nbsp;'}</span>`);
    }

    for (let i = 0; i < maxE; i++) {
      const val = it.gloss[i] || '';
      const dirVal = hasHebrewScript(val) ? 'rtl' : 'ltr';
      const cls = i === 0 ? 'il-gloss-lit' : 'il-gloss-ctx';
      lines.push(`<span class="${cls}" dir="${dirVal}">${val ? escapeHtml(val) : '&nbsp;'}</span>`);
    }

    stacks.push(`<span class="il-stack">${lines.join('')}</span>`);
  }

  const dirStr = isRtl ? 'rtl' : 'ltr';
  const alignCls = isRtl ? 'is-rtl' : 'is-ltr';
  return (
    `<div class="il-multi-sec ${alignCls}" dir="${dirStr}">` +
      `<div class="il-flow il-q-flow il-multi-q-flow" dir="${dirStr}">${stacks.join('')}</div>` +
    '</div>'
  );
}

function parseMultiSectionInterlinear(rawHtml, verseNum) {
  const source = String(rawHtml || '');

  // Mapeia intervalos de <Q>...<q> para não confundir nada interno com etiqueta de seção
  const qRanges = [];
  const qRe = /<Q(?:\s+[^>]*)?>[\s\S]*?(?:<\/Q>|<q>)/g;
  let qm;
  while ((qm = qRe.exec(source)) !== null) {
    qRanges.push([qm.index, qRe.lastIndex]);
  }
  const insideQ = (pos) => qRanges.some(([s, e]) => pos >= s && pos < e);

  const badgeRe = /<([A-Z][A-Z0-9]{1,7})>\s*([^<>]{1,20}?)\s*<\/([A-Za-z][A-Za-z0-9]{1,7})>/g;
  const matches = [];
  let bm;

  while ((bm = badgeRe.exec(source)) !== null) {
    const tag = bm[1];
    const closeTag = bm[3].toUpperCase();
    if (closeTag !== tag) continue;
    if (RESERVED_MULTI_TAGS.has(tag)) continue;
    if (insideQ(bm.index)) continue;

    const label = cleanText(bm[2]);
    if (!label || !label.toUpperCase().startsWith(tag)) continue;

    matches.push({
      start: bm.index,
      end: badgeRe.lastIndex,
      label
    });
  }

  if (matches.length < 2) return '';

  const sections = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].start : source.length;
    const bodyRaw = source.slice(cur.end, nextStart);
    const showVnum = i === 0 ? verseNum : null;

    if (RE_INTERLINEAR_Q.test(bodyRaw)) {
      const qSec = renderMultiSectionQFlow(bodyRaw, cur.label, showVnum);
      if (qSec) sections.push(qSec);
      continue;
    }

    const bodyHtml = formatClauseInlineHtml(bodyRaw);
    if (!bodyHtml) continue;

    // Somente o texto em hebraico fica alinhado à direita (RTL)
    const isRtl = hasHebrewScript(bodyHtml);
    const dirStr = isRtl ? 'rtl' : 'ltr';
    const alignCls = isRtl ? 'is-rtl' : 'is-ltr';
    const hebrewCls = isRtl ? ' is-hebrew' : '';
    const vnumHtml = showVnum ? `<span class="il-vnum">${showVnum}</span> ` : '';
    const badgeHtml = `<span class="il-multi-badge" dir="ltr">${escapeHtml(cur.label)}</span>`;

    sections.push(
      `<div class="il-multi-sec ${alignCls}" dir="${dirStr}">` +
        `${vnumHtml}${badgeHtml}<span class="il-multi-text${hebrewCls}" dir="${dirStr}">${bodyHtml}</span>` +
      '</div>'
    );
  }

  if (!sections.length) return '';
  return `<div class="il-block il-q-block il-multi-block">${sections.join('')}</div>`;
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

  const isRtl = hasH || items.some((it) => hasHebrewScript(it.orig.join(' ')));
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

  if (isReverseInterlinearQ(rawHtml)) {
    const revHtml = formatReverseInterlinearQHtml(rawHtml, verseNum);
    if (revHtml) return revHtml;
  }

  const multiHtml = parseMultiSectionInterlinear(rawHtml, verseNum);
  if (multiHtml) return multiHtml;

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
