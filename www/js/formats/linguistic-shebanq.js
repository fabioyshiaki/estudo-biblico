const RE_HEBREW = /[\u0590-\u05FF\u0700-\u074F\uFB1D-\uFB4F]/;
const RE_SHEBANQ = /\u300C\s*<w>[\s\S]*?<w>[\s\S]*?\u300D/i;
const RE_RECORD = /\u300C([\s\S]*?)\u300D/g;
const RE_BRACKET_MARKER = /^<([^<>]+)>$/;

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

export function isShebanqBhsText(str) {
  return RE_SHEBANQ.test(String(str || ''));
}

function parseFreqAndLex(rawField) {
  const txt = cleanText(rawField);
  if (!txt) return { freq: '', consLex: '' };

  const [leftPart, rightPart] = txt.split(/[\uFF5C|]/);
  const freq = cleanText(leftPart || '').replace(/\uFF0F/g, '/');
  const consLex = cleanText(rightPart || '');
  return { freq, consLex };
}

function renderGloss(rawGloss) {
  const txt = cleanText(rawGloss);
  if (!txt) {
    return '<span class="shb-gloss" dir="ltr">&nbsp;</span>';
  }

  const markerMatch = RE_BRACKET_MARKER.exec(txt);
  if (markerMatch) {
    return `<span class="shb-gloss is-gram" dir="ltr">[${escapeHtml(markerMatch[1])}]</span>`;
  }

  return `<span class="shb-gloss" dir="ltr">${escapeHtml(txt)}</span>`;
}

function renderMorpheme(item) {
  const origDir = RE_HEBREW.test(item.surfaceDisplay) ? 'rtl' : 'ltr';
  const origHtml = item.surfaceDisplay
    ? `<span class="shb-orig" dir="${origDir}">${escapeHtml(item.surfaceDisplay)}</span>`
    : '<span class="shb-orig is-elided" dir="ltr" title="Morfema elidido">&middot;</span>';

  const translitHtml = item.translit
    ? `<span class="shb-translit" dir="ltr">${escapeHtml(item.translit)}</span>`
    : '<span class="shb-translit is-empty" dir="ltr">&nbsp;</span>';

  const glossHtml = renderGloss(item.gloss);

  const extraHtml = item.extra
    ? `<span class="shb-extra" dir="ltr">${escapeHtml(item.extra)}</span>`
    : '';

  const lemmaDir = RE_HEBREW.test(item.lemma) ? 'rtl' : 'ltr';
  const lemmaHtml = item.lemma
    ? `<span class="shb-lemma" dir="${lemmaDir}">${escapeHtml(item.lemma)}</span>`
    : '';
  const freqHtml = item.freq
    ? `<span class="shb-freq" dir="ltr">${escapeHtml(item.freq)}</span>`
    : '';

  const metaHtml = (lemmaHtml || freqHtml)
    ? `<div class="shb-meta">${lemmaHtml}${freqHtml}</div>`
    : '';

  const attrs = [
    item.wordId ? `data-word-id="${escapeHtml(item.wordId)}"` : '',
    item.lemma ? `data-lemma="${escapeHtml(item.lemma)}"` : ''
  ].filter(Boolean).join(' ');

  return (
    `<div class="shb-morph"${attrs ? ` ${attrs}` : ''}>` +
      origHtml +
      translitHtml +
      glossHtml +
      extraHtml +
      metaHtml +
    '</div>'
  );
}

export function formatShebanqBhsHtml(rawHtml, verseNum = null) {
  const source = String(rawHtml || '');
  const groups = [];
  let currentGroup = [];
  let isRtlVerse = false;

  RE_RECORD.lastIndex = 0;
  let m;
  while ((m = RE_RECORD.exec(source)) !== null) {
    const inner = m[1] || '';
    const parts = inner.split(/<w>/i);
    if (parts.length < 11) continue;

    const wordId = cleanText(parts[1]);
    const translit = cleanText(parts[2]);
    const gloss = cleanText(parts[3]);
    const extra = cleanText(parts[4]);
    const { freq, consLex } = parseFreqAndLex(parts[6]);
    const lemma = cleanText(parts[5]) || consLex;
    const surface = cleanText(parts[10]);
    const rawTrailer = String(parts[11] || '');
    const endsWord = rawTrailer.length > 0;
    const visibleTrailer = cleanText(rawTrailer);

    let surfaceDisplay = surface;
    if (visibleTrailer) {
      surfaceDisplay = rawTrailer.startsWith(' ')
        ? `${surface} ${visibleTrailer}`.trim()
        : `${surface}${visibleTrailer}`;
    }

    if (RE_HEBREW.test(surfaceDisplay) || RE_HEBREW.test(lemma)) {
      isRtlVerse = true;
    }

    currentGroup.push({
      wordId,
      translit,
      gloss,
      extra,
      lemma,
      freq,
      surfaceDisplay
    });

    if (endsWord) {
      groups.push(currentGroup);
      currentGroup = [];
    }
  }

  if (currentGroup.length) {
    groups.push(currentGroup);
  }

  if (!groups.length) return '';

  const cards = [];
  if (verseNum) {
    cards.push(`<span class="il-vnum">${verseNum}</span>`);
  }

  for (const grp of groups) {
    const multiClass = grp.length > 1 ? ' is-compound' : '';
    cards.push(
      `<div class="shb-word${multiClass}" dir="${isRtlVerse ? 'rtl' : 'ltr'}">` +
        grp.map(renderMorpheme).join('') +
      '</div>'
    );
  }

  return (
    '<div class="il-block il-q-block shb-block">' +
      `<div class="il-flow il-q-flow shb-flow" dir="${isRtlVerse ? 'rtl' : 'ltr'}">${cards.join('')}</div>` +
    '</div>'
  );
}

// FIM linguistic-shebanq.js
