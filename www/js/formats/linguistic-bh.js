const RE_HEBREW = /[\u0590-\u05FF\u0700-\u074F]/;
const RE_BHC = /<div\s+class=['"]bhc['"]\s*>/i;

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

export function isLinguisticClauseHtml(str) {
  return RE_BHC.test(String(str || ''));
}

function renderClauseHeader(cdEl) {
  if (!cdEl) return '';

  const clids = Array.from(cdEl.querySelectorAll('.clid'))
    .map((el) => cleanText(el.textContent))
    .filter(Boolean);
  const coText = cleanText(cdEl.querySelector('co')?.textContent || '');
  const cliText = cleanText(cdEl.querySelector('.cli')?.textContent || '');
  const ckind = cleanText(cdEl.querySelector('ckind')?.textContent || '');
  const ctyp = cleanText(cdEl.querySelector('ctyp')?.textContent || '');
  const crela = cleanText(cdEl.querySelector('crela')?.textContent || '');

  let dots = '';
  let clauseId = '';
  if (clids.length >= 2) {
    dots = clids[0];
    clauseId = clids[1];
  } else if (clids.length === 1) {
    clauseId = clids[0];
  }

  const refBadge = cliText
    ? `${clauseId}${coText || '@'}${cliText}`
    : clauseId;
  const descParts = [ckind, ctyp, crela].filter(Boolean);

  if (!dots && !refBadge && !descParts.length) {
    const fallback = cleanText(cdEl.textContent);
    return fallback ? `<div class="bh-cd" dir="ltr">${escapeHtml(fallback)}</div>` : '';
  }

  const chunks = [];
  if (descParts.length) {
    chunks.push(`<span class="bh-cd-desc">${escapeHtml(descParts.join(', '))}</span>`);
  }
  if (refBadge) {
    chunks.push(`<span class="bh-cd-id">${escapeHtml(refBadge)}</span>`);
  }
  if (dots) {
    chunks.push(`<span class="bh-cd-dots">${escapeHtml(dots)}</span>`);
  }

  return `<div class="bh-cd" dir="ltr">${chunks.join('<span class="bh-cd-sep">|</span>')}</div>`;
}

function renderWordBox(bhwEl) {
  const clone = bhwEl.cloneNode(true);
  const glossNodes = clone.querySelectorAll('hbint, grint, gkint, arint');
  const glossParts = [];
  glossNodes.forEach((node) => {
    const txt = cleanText(node.textContent);
    if (txt) glossParts.push(txt);
    node.remove();
  });

  clone.querySelectorAll('br').forEach((br) => br.remove());
  const orig = cleanText(clone.textContent);
  const gloss = glossParts.join(' ');
  const origDir = RE_HEBREW.test(orig) ? ' dir="rtl"' : '';

  const origHtml = orig
    ? `<span class="bh-orig"${origDir}>${escapeHtml(orig)}</span>`
    : '<span class="bh-orig bh-orig-empty">&middot;</span>';
  const glossHtml = gloss
    ? `<span class="bh-gloss" dir="ltr">${escapeHtml(gloss)}</span>`
    : '';

  return `<div class="bh-word">${origHtml}${glossHtml}</div>`;
}

function renderPhraseBox(bhpEl) {
  const pdEl = bhpEl.querySelector(':scope > .pd');
  let headerHtml = '';

  if (pdEl) {
    const ptypEl = pdEl.querySelector('ptyp');
    const prelaText = cleanText(pdEl.querySelector('prela')?.textContent || '');
    const pfuncText = cleanText(pdEl.querySelector('pfunction')?.textContent || '');

    let ptypClass = 'bh-ptyp';
    let ptypText = '';
    if (ptypEl) {
      if (ptypEl.querySelector('det')) ptypClass += ' is-det';
      else if (ptypEl.querySelector('undet')) ptypClass += ' is-undet';
      ptypText = cleanText(ptypEl.textContent);
    }

    const titleLine = [ptypText, prelaText].filter(Boolean).join(', ');
    headerHtml =
      '<div class="bh-pd" dir="ltr">' +
        (titleLine ? `<div class="${ptypClass}">${escapeHtml(titleLine)}</div>` : '') +
        (pfuncText ? `<div class="bh-pfunc">${escapeHtml(pfuncText)}</div>` : '') +
      '</div>';
  }

  const wordEls = Array.from(bhpEl.querySelectorAll(':scope > .bhw'));
  const wordsHtml = wordEls.map(renderWordBox).join('');
  const isRtl = RE_HEBREW.test(bhpEl.textContent || '');

  return (
    '<div class="bh-phrase">' +
      headerHtml +
      `<div class="bh-words" dir="${isRtl ? 'rtl' : 'ltr'}">${wordsHtml}</div>` +
    '</div>'
  );
}

export function formatLinguisticClauseHtml(rawHtml) {
  if (typeof DOMParser === 'undefined') return '';

  const doc = new DOMParser().parseFromString(`<div>${rawHtml}</div>`, 'text/html');
  const root = doc.body && doc.body.firstElementChild;
  if (!root) return '';

  const clauseEls = Array.from(root.querySelectorAll('.bhc'));
  if (!clauseEls.length) return '';

  const clausesHtml = clauseEls.map((bhcEl) => {
    const cdEl = bhcEl.querySelector(':scope > .cd');
    const phraseEls = Array.from(bhcEl.querySelectorAll(':scope > .bhp'));
    const isRtl = RE_HEBREW.test(bhcEl.textContent || '');

    const headerHtml = renderClauseHeader(cdEl);
    const phrasesHtml = phraseEls.map(renderPhraseBox).join('');

    return (
      '<div class="bh-clause">' +
        headerHtml +
        `<div class="bh-phrases" dir="${isRtl ? 'rtl' : 'ltr'}">${phrasesHtml}</div>` +
      '</div>'
    );
  }).join('');

  return `<div class="il-block bh-block">${clausesHtml}</div>`;
}

// FIM linguistic-bh.js
