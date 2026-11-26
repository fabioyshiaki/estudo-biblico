const RE_HEBREW = /[\u0590-\u05FF\u0700-\u074F\uFB1D-\uFB4F]/;
const RE_SHEBANQ = /\u300C(?:\s*\u300E[^\u300E\u300F]*\u300F)?\s*<w>[\s\S]*?<w>[\s\S]*?\u300D/i;
const RE_INTERLINEAR_MN = /\u300C\s*<Mn>[\s\S]*?<\/Mn>[\s\S]*?\u300D/i;
const RE_RECORD = /\u300C([\s\S]*?)\u300D/g;
const RE_BRACKET_MARKER = /^<([^<>]+)>$/;
const RE_BHSE_LEX = /<(S1H|S2H|BDB|TWOT|GES)\.?([^<>]+)>/gi;
const RE_STRONG_TAG = /<W([GH])(\d+[a-z]?)>/gi;
const RE_MORPH_TAG = /<WT([^<>]+)>/gi;

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

function extractTagContent(str, tagName) {
  const re = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = re.exec(String(str || ''));
  return m ? cleanText(m[1]) : '';
}

export function isShebanqBhsText(str) {
  const s = String(str || '');
  return RE_SHEBANQ.test(s) || RE_INTERLINEAR_MN.test(s);
}

function parseFreqAndLex(rawField) {
  const txt = cleanText(rawField);
  if (!txt) return { freq: '', consLex: '' };

  const [leftPart, rightPart] = txt.split(/[\uFF5C|]/);
  const freq = cleanText(leftPart || '').replace(/\uFF0F/g, '/');
  const consLex = cleanText(rightPart || '');
  return { freq, consLex };
}

function pushUnique(arr, val) {
  if (val && !arr.includes(val)) arr.push(val);
}

function parseBhseLexicals(rawLexField) {
  const strongs = [];
  const bdbs = [];
  const twots = [];
  const ges = [];
  const str = String(rawLexField || '');

  RE_BHSE_LEX.lastIndex = 0;
  let match;
  while ((match = RE_BHSE_LEX.exec(str)) !== null) {
    const tag = match[1].toUpperCase();
    const val = cleanText(match[2]);
    if (!val) continue;

    if ((tag === 'S1H' || tag === 'S2H') && /^\d+[a-z]?$/i.test(val)) {
      pushUnique(strongs, `H${val}`);
    } else if (tag === 'BDB') {
      pushUnique(bdbs, val);
    } else if (tag === 'TWOT') {
      pushUnique(twots, val);
    } else if (tag === 'GES' && /^\d+[a-z]?$/i.test(val)) {
      pushUnique(ges, `GES${val}`);
    }
  }

  return { strongs, bdbs, twots, ges };
}

function parseInterlinearMnRecord(inner) {
  const surface = extractTagContent(inner, 'Mn');
  const translit = extractTagContent(inner, 'Th');
  const phonetic = extractTagContent(inner, 'Le');
  const gloss = extractTagContent(inner, 'Pt');

  const haRaw = extractTagContent(inner, 'Ha');
  const gaRaw = extractTagContent(inner, 'Ga');
  const hgkList = [];
  if (haRaw) pushUnique(hgkList, /^HGK/i.test(haRaw) ? haRaw.toUpperCase() : `HGK${haRaw}`);
  if (gaRaw) pushUnique(hgkList, /^GGK/i.test(gaRaw) ? gaRaw.toUpperCase() : `GGK${gaRaw}`);

  const strongs = [];
  RE_STRONG_TAG.lastIndex = 0;
  let sm;
  while ((sm = RE_STRONG_TAG.exec(inner)) !== null) {
    const code = `${sm[1].toUpperCase()}${sm[2]}`;
    if (code !== 'H0' && code !== 'G0') pushUnique(strongs, code);
  }

  const morphs = [];
  let lemma = '';
  RE_MORPH_TAG.lastIndex = 0;
  let mm;
  while ((mm = RE_MORPH_TAG.exec(inner)) !== null) {
    const rawMorph = String(mm[1] || '');
    const lemmaMatch = /\bl="([^"]+)"/i.exec(rawMorph);
    if (lemmaMatch && !lemma) {
      lemma = cleanText(lemmaMatch[1]);
    }
    const cleanMorph = cleanText(rawMorph.replace(/\s+l="[^"]*"/gi, ''));
    if (cleanMorph) pushUnique(morphs, cleanMorph);
  }

  if (!surface && !gloss && !translit) return null;

  return {
    mode: 'interlinear_mn',
    wordId: '',
    surfaceDisplay: surface,
    strongs,
    morphs,
    translit,
    phonetic,
    hgkList,
    gloss,
    lemma,
    extra: '',
    freq: '',
    sheCode: '',
    bdbs: [],
    twots: [],
    ges: [],
    endsWord: true
  };
}

function parseShebanqRecord(inner) {
  if (/<Mn>[\s\S]*?<\/Mn>/i.test(inner)) {
    return parseInterlinearMnRecord(inner);
  }

  const parts = inner.split(/<w>/i);

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

    if (!surface && !lemma && !gloss) return null;

    const endsWord = rawTrailer.length > 0;
    const visibleTrailer = cleanText(rawTrailer);
    let surfaceDisplay = surface || lemma;
    if (visibleTrailer) {
      surfaceDisplay = rawTrailer.startsWith(' ')
        ? `${surfaceDisplay} ${visibleTrailer}`.trim()
        : `${surfaceDisplay}${visibleTrailer}`;
    }

    const lex = parseBhseLexicals(lexField);
    const sheCode = /^SHE[1-9]\d*$/i.test(sheRaw) ? sheRaw.toUpperCase() : '';

    return {
      mode: 'bhse_v5',
      wordId,
      translit,
      phonetic: '',
      gloss,
      extra: '',
      lemma: lemma || '',
      freq: '',
      sheCode,
      strongs: lex.strongs,
      morphs: [],
      hgkList: [],
      bdbs: lex.bdbs,
      twots: lex.twots,
      ges: lex.ges,
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
    mode: 'shebanq_v4',
    wordId,
    translit,
    phonetic: '',
    gloss,
    extra,
    lemma,
    freq,
    sheCode: '',
    strongs: [],
    morphs: [],
    hgkList: [],
    bdbs: [],
    twots: [],
    ges: [],
    surfaceDisplay,
    endsWord
  };
}

function renderGloss(rawGloss, extraCls = '') {
  const txt = cleanText(rawGloss);
  const clsSuffix = extraCls ? ` ${extraCls}` : '';
  if (!txt) {
    return `<span class="shb-gloss is-empty${clsSuffix}" dir="ltr">&nbsp;</span>`;
  }

  const markerMatch = RE_BRACKET_MARKER.exec(txt);
  if (markerMatch) {
    return `<span class="shb-gloss is-gram${clsSuffix}" dir="ltr">[${escapeHtml(markerMatch[1])}]</span>`;
  }

  if (/^\[[^\]]+\]$/.test(txt)) {
    return `<span class="shb-gloss is-gram${clsSuffix}" dir="ltr">${escapeHtml(txt)}</span>`;
  }

  return `<span class="shb-gloss${clsSuffix}" dir="ltr">${escapeHtml(txt)}</span>`;
}

function renderLexRow(items, cls, dataAttr) {
  if (!items || !items.length) {
    return '<div class="shb-lex-row is-empty" dir="ltr">&nbsp;</div>';
  }
  const chips = items
    .map((code) => `<span class="shb-tag ${cls}" data-${dataAttr}="${escapeHtml(code)}">${escapeHtml(code)}</span>`)
    .join('');
  return `<div class="shb-lex-row" dir="ltr">${chips}</div>`;
}

function renderMorpheme(item) {
  const origDir = RE_HEBREW.test(item.surfaceDisplay) ? 'rtl' : 'ltr';
  const origHtml = item.surfaceDisplay
    ? `<span class="shb-orig" dir="${origDir}">${escapeHtml(item.surfaceDisplay)}</span>`
    : '<span class="shb-orig is-elided" dir="ltr" title="Morfema elidido">&middot;</span>';

  const attrs = [
    item.wordId ? `data-word-id="${escapeHtml(item.wordId)}"` : '',
    item.lemma ? `data-lemma="${escapeHtml(item.lemma)}"` : '',
    item.sheCode ? `data-she="${escapeHtml(item.sheCode)}"` : ''
  ].filter(Boolean).join(' ');

  // Layout alinhado para Interlinear Br 2023+ (「<Mn>...<WH><WT><Th><Le><Ha><Pt>」)
  if (item.mode === 'interlinear_mn') {
    const thHtml = item.translit
      ? `<span class="shb-translit shb-th" dir="ltr">${escapeHtml(item.translit)}</span>`
      : '<span class="shb-translit shb-th is-empty" dir="ltr">&nbsp;</span>';

    const leHtml = item.phonetic
      ? `<span class="shb-phonetic" dir="ltr">${escapeHtml(item.phonetic)}</span>`
      : '<span class="shb-phonetic is-empty" dir="ltr">&nbsp;</span>';

    const ptHtml = renderGloss(item.gloss, 'shb-pt');

    return (
      `<div class="shb-morph is-mn"${attrs ? ` ${attrs}` : ''}>` +
        origHtml +
        renderLexRow(item.strongs, 'v-strong shb-tag--strong', 'strong') +
        renderLexRow(item.morphs, 'v-morph shb-tag--morph', 'morph') +
        thHtml +
        leHtml +
        renderLexRow(item.hgkList, 'shb-tag--bdb', 'hgk') +
        ptHtml +
      '</div>'
    );
  }

  const translitHtml = item.translit
    ? `<span class="shb-translit" dir="ltr">${escapeHtml(item.translit)}</span>`
    : '<span class="shb-translit is-empty" dir="ltr">&nbsp;</span>';

  const glossHtml = renderGloss(item.gloss);

  const lemmaDir = RE_HEBREW.test(item.lemma) ? 'rtl' : 'ltr';
  const lemmaHtml = item.lemma
    ? `<span class="shb-lemma" dir="${lemmaDir}">${escapeHtml(item.lemma)}</span>`
    : '<span class="shb-lemma is-empty" dir="ltr">&nbsp;</span>';

  // Layout alinhado em camadas fixas para BHSE v5
  if (item.mode === 'bhse_v5') {
    const lexBlock =
      '<div class="shb-lex-block">' +
        renderLexRow(item.strongs, 'v-strong shb-tag--strong', 'strong') +
        renderLexRow(item.bdbs, 'shb-tag--bdb', 'bdb') +
        renderLexRow(item.twots, 'shb-tag--twot', 'twot') +
        renderLexRow(item.ges, 'shb-tag--ges', 'ges') +
      '</div>';

    return (
      `<div class="shb-morph is-bhse"${attrs ? ` ${attrs}` : ''}>` +
        origHtml +
        translitHtml +
        lemmaHtml +
        glossHtml +
        lexBlock +
      '</div>'
    );
  }

  // Layout original para SHEBANQ v4
  const extraHtml = item.extra
    ? `<span class="shb-extra" dir="ltr">${escapeHtml(item.extra)}</span>`
    : '';
  const freqHtml = item.freq
    ? `<span class="shb-freq" dir="ltr">${escapeHtml(item.freq)}</span>`
    : '';
  const metaHtml = (item.lemma || freqHtml)
    ? `<div class="shb-meta">${item.lemma ? lemmaHtml : ''}${freqHtml}</div>`
    : '';

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
