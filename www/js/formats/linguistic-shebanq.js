const RE_HEBREW = /[\u0590-\u05FF\u0700-\u074F\uFB1D-\uFB4F]/;
const RE_SHEBANQ = /\u300C(?:\s*\u300E[^\u300E\u300F]*\u300F)?\s*<w>[\s\S]*?<w>[\s\S]*?\u300D/i;
const RE_RECORD = /\u300C([\s\S]*?)\u300D/g;
const RE_BRACKET_MARKER = /^<([^<>]+)>$/;
const RE_BHSE_LEX = /<(S1H|S2H|BDB|TWOT|GES)\.?([^<>]+)>/gi;

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

function parseBhseLexicals(rawLexField) {
  const strongs = [];
  const seen = new Set();
  const str = String(rawLexField || '');

  RE_BHSE_LEX.lastIndex = 0;
  let match;
  while ((match = RE_BHSE_LEX.exec(str)) !== null) {
    const tag = match[1].toUpperCase();
    const val = cleanText(match[2]);
    if (!val) continue;

    // Mantém apenas Strongs numéricos (descarta prefixos como S1Hb, S1Hha, S1Hv)
    if ((tag === 'S1H' || tag === 'S2H') && /^\d+[a-z]?$/i.test(val)) {
      const code = `H${val}`;
      if (!seen.has(code)) {
        seen.add(code);
        strongs.push(code);
      }
    }
  }
  return strongs;
}

function parseShebanqRecord(inner) {
  const parts = inner.split(/<w>/i);

  // Formato BHSE v5: 「『<BHS...><KJV...>』<w>id<w>tr<w>gloss<w>SHE<w>lemma<w>surface<w>trailer<w>《lex》」
  const isBhseV5 =
    parts.length >= 8 &&
    parts.length < 11 &&
    (inner.includes('\u300E') || inner.includes('\u300A'));

  if (isBhseV5) {
    const wordId = cleanText(parts[1]);
    const translit = cleanText(parts[2]);
    const gloss = cleanText(parts[3]);
    const sheRaw = cleanText(parts[4]);
    const lemma = cleanText(parts[5]);
    const surface = cleanText(parts[6]);
    const rawTrailer = String(parts[7] || '');
    const lexField = String(parts[8] || '');

    // Se surface vier vazio (registro oculto no VerseRules), ignora
    if (!surface && !lemma && !gloss) return null;

    const endsWord = rawTrailer.length > 0;
    const visibleTrailer = cleanText(rawTrailer);
    let surfaceDisplay = surface || lemma;
    if (visibleTrailer) {
      surfaceDisplay = rawTrailer.startsWith(' ')
        ? `${surfaceDisplay} ${visibleTrailer}`.trim()
        : `${surfaceDisplay}${visibleTrailer}`;
    }

    const strongs = parseBhseLexicals(lexField);
    const sheCode = /^SHE[1-9]\d*$/i.test(sheRaw) ? sheRaw.toUpperCase() : '';

    return {
      wordId,
      translit,
      gloss,
      extra: '',
      lemma: lemma && lemma !== surface ? lemma : '',
      freq: strongs.length ? '' : sheCode,
      strongs,
      surfaceDisplay,
      endsWord
    };
  }

  // Formato SHEBANQ v4 original (11+ campos)
  if (parts.length < 11) return null;

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

  return {
    wordId,
    translit,
    gloss,
    extra,
    lemma,
    freq,
    strongs: [],
    surfaceDisplay,
    endsWord
  };
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

  if (/^\[[^\]]+\]$/.test(txt)) {
    return `<span class="shb-gloss is-gram" dir="ltr">${escapeHtml(txt)}</span>`;
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

  const strongsHtml = (item.strongs && item.strongs.length)
    ? `<div class="shb-strongs" dir="ltr">${item.strongs
        .map((code) => `<span class="v-strong shb-strong" data-strong="${escapeHtml(code)}">${escapeHtml(code)}</span>`)
        .join('')}</div>`
    : '';

  const freqHtml = item.freq
    ? `<span class="shb-freq" dir="ltr">${escapeHtml(item.freq)}</span>`
    : '';

  const metaHtml = (lemmaHtml || strongsHtml || freqHtml)
    ? `<div class="shb-meta">${lemmaHtml}${strongsHtml}${freqHtml}</div>`
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
  // Limpa eventuais marcadores Ketib/Qere (<KQ>...<kq>) sem vazar tags
  const source = String(rawHtml || '').replace(/<KQ>[\s\S]*?<\/?kq>/gi, '');
  const groups = [];
  let currentGroup = [];
  let isRtlVerse = false;

  RE_RECORD.lastIndex = 0;
  let m;
  while ((m = RE_RECORD.exec(source)) !== null) {
    const parsed = parseShebanqRecord(m[1] || '');
    if (!parsed) continue;

    if (RE_HEBREW.test(parsed.surfaceDisplay) || RE_HEBREW.test(parsed.lemma)) {
      isRtlVerse = true;
    }

    currentGroup.push(parsed);

    if (parsed.endsWord) {
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
