const RE_HEBREW = /[\u0590-\u05FF\u0700-\u074F]/;
const RE_ANCIENT = /[\u0590-\u05FF\u0700-\u074F\u0370-\u03FF\u1F00-\u1FFF]/;
const RE_SUP_FONT = /<sup\b[^>]*>\s*<font\b[^>]*>/i;
const RE_TOKEN = /[\u0001\u0003\u0004]\d+[\u0001\u0003\u0004]/;
const RE_PUNCT_ONLY = /^[\u05BE\u05C0\u05C3׃־.,;:!?()[\]{}·•]+$/;
const RE_GRAY_COLOR = /gray|grey|silver|brown|maroon|olive/i;

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

export function isSupFontInterlinear(rawHtml) {
  const s = String(rawHtml || '');
  return RE_SUP_FONT.test(s) && RE_ANCIENT.test(s);
}

function appendSupData(item, supEl) {
  const fonts = Array.from(supEl.querySelectorAll('font'));

  if (fonts.length) {
    for (const fontEl of fonts) {
      const txt = cleanText(fontEl.textContent);
      if (!txt) continue;
      const color = String(fontEl.getAttribute('color') || '').trim();
      if (RE_GRAY_COLOR.test(color)) {
        item.translit.push(txt);
      } else {
        item.gloss.push(txt);
      }
    }
    return;
  }

  const rawTxt = cleanText(supEl.textContent);
  if (!rawTxt) return;

  if (RE_TOKEN.test(rawTxt)) {
    item.strong.push(rawTxt);
  } else if (!item.translit.length) {
    item.translit.push(rawTxt);
  } else {
    item.gloss.push(rawTxt);
  }
}

export function formatSupFontInterlinear(rawHtml, verseNum = null) {
  if (typeof DOMParser === 'undefined') return '';

  const doc = new DOMParser().parseFromString(`<div>${rawHtml}</div>`, 'text/html');
  const root = doc.body && doc.body.firstElementChild;
  if (!root) return '';

  const items = [];
  let current = null;

  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === 3) {
      const txt = cleanText(node.textContent);
      if (!txt) continue;

      if (
        current &&
        !current.strong.length &&
        !current.translit.length &&
        !current.gloss.length &&
        RE_PUNCT_ONLY.test(txt)
      ) {
        current.orig = `${current.orig} ${txt}`.trim();
        continue;
      }

      current = { orig: txt, strong: [], translit: [], gloss: [] };
      items.push(current);
      continue;
    }

    if (node.nodeType !== 1) continue;
    const tag = node.tagName;

    if (tag === 'SUP') {
      if (!current) {
        current = { orig: '', strong: [], translit: [], gloss: [] };
        items.push(current);
      }
      appendSupData(current, node);
      continue;
    }

    if (tag === 'FONT' && current) {
      appendSupData(current, node.parentElement === root ? node : node);
      continue;
    }

    const txt = cleanText(node.textContent);
    if (!txt) continue;
    current = { orig: txt, strong: [], translit: [], gloss: [] };
    items.push(current);
  }

  const validItems = items.filter(
    (it) => it.orig || it.strong.length || it.translit.length || it.gloss.length
  );
  if (!validItems.length) return '';

  const isRtl = validItems.some((it) => RE_HEBREW.test(it.orig));
  const hasAnyStrong = validItems.some((it) => it.strong.length > 0);
  const hasAnyTranslit = validItems.some((it) => it.translit.length > 0);
  const hasAnyGloss = validItems.some((it) => it.gloss.length > 0);

  const stacks = [];
  if (verseNum) {
    stacks.push(`<span class="il-vnum">${verseNum}</span>`);
  }

  for (const it of validItems) {
    const lines = [];
    const origDir = RE_HEBREW.test(it.orig) ? ' dir="rtl"' : '';
    lines.push(
      it.orig
        ? `<span class="il-orig"${origDir}>${escapeHtml(it.orig)}</span>`
        : '<span class="il-orig il-orig-empty">&middot;</span>'
    );

    if (hasAnyTranslit) {
      const tr = it.translit.join(' ');
      lines.push(`<span class="il-translit" dir="ltr">${tr ? escapeHtml(tr) : '&nbsp;'}</span>`);
    }

    if (hasAnyGloss) {
      const gl = it.gloss.join(' ');
      lines.push(`<span class="il-gloss-ctx" dir="ltr">${gl ? escapeHtml(gl) : '&nbsp;'}</span>`);
    }

    if (hasAnyStrong) {
      const st = it.strong.join(' ');
      lines.push(`<span class="il-strong-line" dir="ltr">${st ? escapeHtml(st) : '&nbsp;'}</span>`);
    }

    stacks.push(`<span class="il-stack il-sup-stack">${lines.join('')}</span>`);
  }

  return (
    '<div class="il-block il-q-block">' +
      `<div class="il-flow il-q-flow il-sup-flow" dir="${isRtl ? 'rtl' : 'ltr'}">${stacks.join('')}</div>` +
    '</div>'
  );
}

// FIM interlinear-sup.js
