const RE_HEBREW = /[\u0590-\u05FF\u0700-\u074F]/;
const RE_TOTHT = /<(?:Hb|Gr|Gk)>[\s\S]*?<\/(?:Hb|Gr|Gk)>[\s\S]*?<T>[\s\S]*?<(?:Lemma|Tr)>/i;
const RE_WORD_ENTRY = /<(Hb|Gr|Gk)>([\s\S]*?)<\/\1>(?:\s*<W>([^<]*)<\/W>)?((?:\s*<WT[^>]+>)*)\s*<T>([\s\S]*?)<\/T>/gi;
const RE_PUNCT_TR = /^(?:link|verseend|para|section|separate)$/i;
const RE_PUNCT_LEMMA = /^[-:¦PS]$/;

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

export function isTothtTaggedText(str) {
  return RE_TOTHT.test(String(str || ''));
}

function renderOriginalWord(rawInner, isRtl) {
  const parts = String(rawInner || '').split(/(<Pr>[\s\S]*?<\/Pr>)/gi);
  const html = parts.map((chunk) => {
    const prMatch = /^<Pr>([\s\S]*?)<\/Pr>$/i.exec(chunk);
    if (prMatch) {
      const sep = cleanText(prMatch[1]) || '·';
      return `<span class="tt-pr">${escapeHtml(sep)}</span>`;
    }
    const stripped = chunk.replace(/<[^>]*>/g, '');
    return escapeHtml(stripped);
  }).join('');

  return `<span class="tt-orig" dir="${isRtl ? 'rtl' : 'ltr'}">${html}</span>`;
}

function renderMorphology(wtBlock) {
  if (!wtBlock) return '';
  const codes = [];
  const rx = /<WT([^>]+)>/gi;
  let m;
  while ((m = rx.exec(wtBlock)) !== null) {
    const clean = cleanText(m[1]).replace(/\s+l="[^"]*"/gi, '').trim();
    if (clean) codes.push(clean);
  }
  if (!codes.length) return '';

  const text = codes.join(' ');
  return `<div class="tt-morph" dir="ltr" data-morph="${escapeHtml(text)}">${escapeHtml(text)}</div>`;
}

function renderStrongs(tInner) {
  const cutIdx = tInner.search(/<(?:Lemma|Tr)>/i);
  const strongArea = cutIdx >= 0 ? tInner.slice(0, cutIdx) : tInner;
  const groups = strongArea.split('«');
  const renderedGroups = [];

  for (const grp of groups) {
    const badges = [];
    const rx = /<W([HG])(\d+[a-zA-Z]*)>/gi;
    let m;
    while ((m = rx.exec(grp)) !== null) {
      const lang = m[1].toUpperCase();
      const rawNum = m[2];
      const numVal = parseInt(rawNum, 10);
      if (!numVal) continue;

      const code = `${lang}${rawNum}`;
      let kindClass = 'is-root';
      if (numVal >= 9014 && numVal <= 9018) {
        kindClass = 'is-punct';
      } else if (numVal >= 9000) {
        kindClass = 'is-ext';
      }

      badges.push(
        `<span class="tt-strong ${kindClass}" data-strong="${escapeHtml(code)}">${escapeHtml(code)}</span>`
      );
    }
    if (badges.length) {
      renderedGroups.push(badges.join(''));
    }
  }

  if (!renderedGroups.length) return '';
  return `<div class="tt-strongs" dir="ltr">${renderedGroups.join('<span class="tt-arrow">&laquo;</span>')}</div>`;
}

function extractIndexedParts(blockHtml, prefix) {
  const items = [];
  const rx = new RegExp(`<${prefix}(\\d+)>([\\s\\S]*?)<\\/${prefix}\\1>`, 'gi');
  let m;
  while ((m = rx.exec(blockHtml)) !== null) {
    const idx = Number(m[1]) || 1;
    const text = cleanText(m[2].replace(/<[^>]*>/g, ''));
    if (text) items.push({ idx, text });
  }
  return items;
}

function formatGlossHtml(rawText) {
  const txt = cleanText(rawText);
  const secIdx = txt.indexOf('§');
  if (secIdx < 0) {
    return escapeHtml(txt.replace(/_/g, ' '));
  }

  const head = txt.slice(0, secIdx).replace(/_+$/g, '').replace(/_/g, ' ').trim();
  const tail = txt
    .slice(secIdx)
    .replace(/^§(\d+)_?/, '§$1 ')
    .replace(/_/g, ' ')
    .replace(/,(?!\s)/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const headHtml = head ? `<span class="tt-gloss-main">${escapeHtml(head)}</span>` : '';
  const tailHtml = tail ? ` <span class="tt-gloss-sense">${escapeHtml(tail)}</span>` : '';
  return `${headHtml}${tailHtml}`.trim();
}

function renderLemmas(tInner, trItems) {
  const match = /<Lemma>([\s\S]*?)<\/Lemma>/i.exec(tInner);
  if (!match) return '';

  const items = extractIndexedParts(match[1], 'L');
  if (!items.length) return '';

  const htmlParts = items.map((it, pos) => {
    const pairedTr = trItems[pos] ? trItems[pos].text : '';
    const isPunct = RE_PUNCT_TR.test(pairedTr) || RE_PUNCT_LEMMA.test(it.text);
    const colorCls = isPunct ? 'is-punct' : `tt-c${((it.idx - 1) % 6) + 1}`;
    const isHeb = RE_HEBREW.test(it.text);
    const dirAttr = isHeb ? ' dir="rtl"' : ' dir="ltr"';
    const scriptCls = isHeb ? ' is-hebrew' : '';

    return `<span class="tt-seg ${colorCls}${scriptCls}"${dirAttr}>${escapeHtml(it.text)}</span>`;
  });

  return `<div class="tt-lemmas" dir="ltr">${htmlParts.join('<span class="tt-sep">|</span>')}</div>`;
}

function renderTranslations(trItems) {
  if (!trItems.length) return '';

  const htmlParts = trItems.map((it) => {
    const isPunct = RE_PUNCT_TR.test(it.text);
    const colorCls = isPunct ? 'is-punct' : `tt-c${((it.idx - 1) % 6) + 1}`;
    const inner = isPunct ? escapeHtml(it.text) : formatGlossHtml(it.text);
    return `<span class="tt-seg ${colorCls}" dir="ltr">${inner}</span>`;
  });

  return `<div class="tt-glosses" dir="ltr">${htmlParts.join('<span class="tt-sep">|</span>')}</div>`;
}

export function formatTothtHtml(rawHtml, verseNum = null) {
  const source = String(rawHtml || '');
  const cards = [];
  let isRtlVerse = false;

  if (verseNum) {
    cards.push(`<span class="il-vnum">${verseNum}</span>`);
  }

  RE_WORD_ENTRY.lastIndex = 0;
  let m;
  while ((m = RE_WORD_ENTRY.exec(source)) !== null) {
    const langTag = (m[1] || '').toLowerCase();
    const wordInner = m[2] || '';
    const wordNum = cleanText(m[3] || '');
    const wtBlock = m[4] || '';
    const tInner = m[5] || '';

    const isRtlWord = langTag === 'hb' || RE_HEBREW.test(wordInner);
    if (isRtlWord) isRtlVerse = true;

    const trMatch = /<Tr>([\s\S]*?)<\/Tr>/i.exec(tInner);
    const trItems = trMatch ? extractIndexedParts(trMatch[1], 'T') : [];

    const headHtml =
      '<div class="tt-head">' +
        renderOriginalWord(wordInner, isRtlWord) +
        (wordNum ? `<span class="tt-wnum" dir="ltr">(${escapeHtml(wordNum)})</span>` : '') +
      '</div>';

    const morphHtml = renderMorphology(wtBlock);
    const strongsHtml = renderStrongs(tInner);
    const lemmasHtml = renderLemmas(tInner, trItems);
    const glossesHtml = renderTranslations(trItems);

    cards.push(
      '<div class="tt-card">' +
        headHtml +
        morphHtml +
        strongsHtml +
        lemmasHtml +
        glossesHtml +
      '</div>'
    );
  }

  if (cards.length <= (verseNum ? 1 : 0)) return '';

  return (
    '<div class="il-block il-q-block tt-block">' +
      `<div class="il-flow il-q-flow tt-flow" dir="${isRtlVerse ? 'rtl' : 'ltr'}">${cards.join('')}</div>` +
    '</div>'
  );
}

// FIM linguistic-totht.js
