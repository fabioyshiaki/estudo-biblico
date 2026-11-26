const RE_HEBREW = /[\u0590-\u05FF\u0700-\u074F]/;
const RE_ANCIENT = /[\u0590-\u05FF\u0700-\u074F\u0370-\u03FF\u1F00-\u1FFF]/;
const RE_LATIN = /[A-Za-z\u00C0-\u024F]/;
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

export function hasAncientScript(str) {
  return RE_ANCIENT.test(String(str || ''));
}

export function hasHebrewScript(str) {
  return RE_HEBREW.test(String(str || ''));
}

export function isBilingualAncientText(str) {
  const plain = String(str || '').replace(/<[^>]*>/g, ' ');
  return RE_ANCIENT.test(plain) && RE_LATIN.test(plain);
}

function wordCount(str) {
  const clean = cleanText(str).replace(/[\u0001\u0003\u0004]\d+[\u0001\u0003\u0004]/g, '');
  return clean ? clean.split(/\s+/).filter(Boolean).length : 0;
}

function renderWordCard(orig, gloss) {
  const origClean = cleanText(orig);
  const glossClean = cleanText(gloss);
  const dirAttr = hasHebrewScript(origClean) ? ' dir="rtl"' : '';
  return (
    '<span class="il-word">' +
      `<span class="il-orig"${dirAttr}>${escapeHtml(origClean)}</span>` +
      (glossClean ? `<span class="il-gloss">${escapeHtml(glossClean)}</span>` : '') +
    '</span>'
  );
}

function renderHeaderOrig(text) {
  const clean = cleanText(text);
  if (!clean) return '';
  const dirAttr = hasHebrewScript(clean) ? ' dir="rtl"' : '';
  return `<div class="il-header-orig"${dirAttr}>${escapeHtml(clean)}</div>`;
}

function renderClause(text) {
  const clean = cleanText(text);
  if (!clean) return '';
  return `<div class="il-clause">${escapeHtml(clean)}</div>`;
}

function splitAncientSegment(seg) {
  const clean = cleanText(seg);
  if (!clean) return [];
  const colonMatch = clean.match(/^(.+?[:׃])\s+([\u0590-\u05FF\u0700-\u074F].+)$/);
  if (colonMatch && wordCount(colonMatch[1]) >= 3) {
    return [colonMatch[1].trim(), colonMatch[2].trim()];
  }
  return [clean];
}

function tokenizeInline(rawHtml) {
  const normalized = String(rawHtml || '')
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
      for (const piece of splitAncientSegment(seg)) {
        tokens.push({ kind: 'ancient', text: piece });
      }
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

    // Segmento misto: divide nas transições entre escrita antiga e latina
    let lastIdx = 0;
    RE_ANCIENT_RUN.lastIndex = 0;
    let m;
    while ((m = RE_ANCIENT_RUN.exec(seg)) !== null) {
      if (m.index > lastIdx) {
        const before = cleanText(seg.slice(lastIdx, m.index));
        if (before) {
          tokens.push({ kind: RE_LATIN.test(before) ? 'latin' : 'other', text: before });
        }
      }
      for (const piece of splitAncientSegment(m[0])) {
        tokens.push({ kind: 'ancient', text: piece });
      }
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < seg.length) {
      const tail = cleanText(seg.slice(lastIdx));
      if (tail) {
        tokens.push({ kind: RE_LATIN.test(tail) ? 'latin' : 'other', text: tail });
      }
    }
  }

  return tokens;
}

function buildFromTokens(tokens) {
  const blocks = [];
  let flowCards = [];

  function flushFlow() {
    if (flowCards.length) {
      blocks.push(`<div class="il-flow">${flowCards.join('')}</div>`);
      flowCards = [];
    }
  }

  const isLongAncient = (txt) => wordCount(txt) >= 4 || (/[:׃]$/.test(txt) && wordCount(txt) >= 3);
  const isLongLatin = (txt) => wordCount(txt) >= 6 || (/[.!?¶"“”]/.test(txt) && wordCount(txt) >= 4);

  // Detecta se o módulo coloca tradução antes da língua original
  let origFirstScore = 0;
  let glossFirstScore = 0;
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (a.kind === 'ancient' && !isLongAncient(a.text) && b.kind === 'latin' && !isLongLatin(b.text)) {
      origFirstScore++;
    } else if (a.kind === 'latin' && !isLongLatin(a.text) && b.kind === 'ancient' && !isLongAncient(b.text)) {
      glossFirstScore++;
    }
  }
  const glossFirst = glossFirstScore > origFirstScore;

  for (let i = 0; i < tokens.length; i++) {
    const cur = tokens[i];
    const next = tokens[i + 1];

    if (cur.kind === 'other') {
      if (flowCards.length && blocks.length >= 0) {
        flowCards[flowCards.length - 1] = flowCards[flowCards.length - 1].replace(
          '</span></span>',
          ` ${escapeHtml(cur.text)}</span></span>`
        );
      }
      continue;
    }

    if (cur.kind === 'ancient' && isLongAncient(cur.text)) {
      flushFlow();
      blocks.push(renderHeaderOrig(cur.text));
      continue;
    }

    if (!glossFirst && cur.kind === 'ancient' && next && next.kind === 'latin' && !isLongLatin(next.text)) {
      flowCards.push(renderWordCard(cur.text, next.text));
      i++;
      continue;
    }

    if (glossFirst && cur.kind === 'latin' && !isLongLatin(cur.text) && next && next.kind === 'ancient' && !isLongAncient(next.text)) {
      flowCards.push(renderWordCard(next.text, cur.text));
      i++;
      continue;
    }

    if (cur.kind === 'ancient') {
      flowCards.push(renderWordCard(cur.text, ''));
      continue;
    }

    flushFlow();
    blocks.push(renderClause(cur.text));
  }

  flushFlow();
  return `<div class="il-block">${blocks.join('')}</div>`;
}

function getDirectRows(tableEl) {
  const rows = [];
  for (const child of Array.from(tableEl.children)) {
    const tag = child.tagName;
    if (tag === 'TR') {
      rows.push(child);
    } else if (tag === 'TBODY' || tag === 'THEAD' || tag === 'TFOOT') {
      for (const tr of Array.from(child.children)) {
        if (tr.tagName === 'TR') rows.push(tr);
      }
    }
  }
  return rows;
}

function getDirectCells(trEl) {
  return Array.from(trEl.children).filter((el) => el.tagName === 'TD' || el.tagName === 'TH');
}

function classifyRowTexts(texts) {
  let anc = 0;
  let lat = 0;
  for (const t of texts) {
    if (RE_ANCIENT.test(t) && !RE_LATIN.test(t)) anc++;
    else if (RE_LATIN.test(t) && !RE_ANCIENT.test(t)) lat++;
  }
  if (anc > 0 && anc >= lat) return 'ancient';
  if (lat > 0 && lat > anc) return 'latin';
  return 'mixed';
}

function parseTableElement(tableEl, blocks, flowCards, flushFlow) {
  const rows = getDirectRows(tableEl);
  if (!rows.length) return;

  // Caso 1: mini-tabela de 1 coluna empilhando palavra original + tradução
  const allSingleCol = rows.every((r) => getDirectCells(r).length === 1 && !r.querySelector('table'));
  if (allSingleCol && rows.length >= 2 && rows.length <= 4) {
    const cellTexts = rows.map((r) => cleanText(getDirectCells(r)[0].textContent)).filter(Boolean);
    const ancLines = cellTexts.filter((t) => RE_ANCIENT.test(t) && !RE_LATIN.test(t));
    const latLines = cellTexts.filter((t) => RE_LATIN.test(t) && !RE_ANCIENT.test(t));
    if (ancLines.length === 1 && latLines.length >= 1 && wordCount(ancLines[0]) <= 3) {
      flowCards.push(renderWordCard(ancLines[0], latLines.join(' ')));
      return;
    }
  }

  // Caso 2: tabela com múltiplas linhas/colunas
  for (let i = 0; i < rows.length; i++) {
    const cells = getDirectCells(rows[i]);
    if (!cells.length) continue;

    if (cells.some((c) => c.querySelector('table'))) {
      for (const cell of cells) {
        parseNodeList(cell.childNodes, blocks, flowCards, flushFlow);
      }
      continue;
    }

    const texts = cells.map((c) => cleanText(c.textContent));

    if (cells.length === 1) {
      const txt = texts[0];
      if (!txt) continue;
      if (RE_ANCIENT.test(txt) && RE_LATIN.test(txt)) {
        flushFlow();
        blocks.push(buildFromTokens(tokenizeInline(cells[0].innerHTML)));
      } else if (RE_ANCIENT.test(txt)) {
        flushFlow();
        blocks.push(renderHeaderOrig(txt));
      } else {
        flushFlow();
        blocks.push(renderClause(txt));
      }
      continue;
    }

    // Verifica se a próxima linha tem a mesma quantidade de colunas com a língua complementar
    const nextRow = rows[i + 1];
    if (nextRow && !nextRow.querySelector('table')) {
      const nextCells = getDirectCells(nextRow);
      if (nextCells.length === cells.length) {
        const nextTexts = nextCells.map((c) => cleanText(c.textContent));
        const curKind = classifyRowTexts(texts);
        const nextKind = classifyRowTexts(nextTexts);

        if ((curKind === 'ancient' && nextKind === 'latin') || (curKind === 'latin' && nextKind === 'ancient')) {
          const origArr = curKind === 'ancient' ? texts : nextTexts;
          const glossArr = curKind === 'ancient' ? nextTexts : texts;
          for (let c = 0; c < origArr.length; c++) {
            if (origArr[c] || glossArr[c]) {
              flowCards.push(renderWordCard(origArr[c], glossArr[c]));
            }
          }
          i++;
          continue;
        }
      }
    }

    // Linha de 2 colunas: [original, tradução] ou [tradução, original]
    if (cells.length === 2) {
      const [a, b] = texts;
      const aAnc = RE_ANCIENT.test(a) && !RE_LATIN.test(a);
      const bLat = RE_LATIN.test(b) && !RE_ANCIENT.test(b);
      const bAnc = RE_ANCIENT.test(b) && !RE_LATIN.test(b);
      const aLat = RE_LATIN.test(a) && !RE_ANCIENT.test(a);

      if (aAnc && bLat) {
        flowCards.push(renderWordCard(a, b));
        continue;
      }
      if (bAnc && aLat) {
        flowCards.push(renderWordCard(b, a));
        continue;
      }
    }

    for (const cell of cells) {
      const txt = cleanText(cell.textContent);
      if (!txt) continue;
      if (RE_ANCIENT.test(txt) && RE_LATIN.test(txt)) {
        flushFlow();
        blocks.push(buildFromTokens(tokenizeInline(cell.innerHTML)));
      } else if (RE_ANCIENT.test(txt)) {
        flushFlow();
        blocks.push(renderHeaderOrig(txt));
      } else {
        flushFlow();
        blocks.push(renderClause(txt));
      }
    }
  }
}

function parseNodeList(nodes, blocks, flowCards, flushFlow) {
  for (const node of Array.from(nodes)) {
    if (node.nodeType === 3) {
      const txt = cleanText(node.textContent);
      if (!txt) continue;
      if (RE_ANCIENT.test(txt) && RE_LATIN.test(txt)) {
        flushFlow();
        blocks.push(buildFromTokens(tokenizeInline(txt)));
      } else if (RE_ANCIENT.test(txt)) {
        flushFlow();
        blocks.push(renderHeaderOrig(txt));
      } else if (RE_LATIN.test(txt)) {
        flushFlow();
        blocks.push(renderClause(txt));
      }
      continue;
    }

    if (node.nodeType !== 1) continue;
    const tag = node.tagName;

    if (tag === 'TABLE') {
      parseTableElement(node, blocks, flowCards, flushFlow);
      continue;
    }

    if (tag === 'RUBY') {
      const rt = cleanText(Array.from(node.querySelectorAll('rt')).map((el) => el.textContent).join(' '));
      const clone = node.cloneNode(true);
      clone.querySelectorAll('rt, rp').forEach((el) => el.remove());
      const base = cleanText(clone.textContent);
      const orig = RE_ANCIENT.test(rt) && !RE_ANCIENT.test(base) ? rt : base;
      const gloss = orig === rt ? base : rt;
      if (orig || gloss) flowCards.push(renderWordCard(orig, gloss));
      continue;
    }

    if (node.querySelector('table, ruby')) {
      parseNodeList(node.childNodes, blocks, flowCards, flushFlow);
      continue;
    }

    const txt = cleanText(node.textContent);
    if (!txt) continue;
    if (RE_ANCIENT.test(txt) && RE_LATIN.test(txt)) {
      flushFlow();
      blocks.push(buildFromTokens(tokenizeInline(node.innerHTML)));
    } else if (RE_ANCIENT.test(txt)) {
      flushFlow();
      blocks.push(renderHeaderOrig(txt));
    } else if (RE_LATIN.test(txt)) {
      flushFlow();
      blocks.push(renderClause(txt));
    }
  }
}

export function formatInterlinearHtml(rawHtml) {
  if (typeof DOMParser !== 'undefined' && /<(?:table|tr|td|th|ruby)\b/i.test(rawHtml)) {
    const doc = new DOMParser().parseFromString(`<div>${rawHtml}</div>`, 'text/html');
    const root = doc.body && doc.body.firstElementChild;
    if (root) {
      const blocks = [];
      let flowCards = [];
      const flushFlow = () => {
        if (flowCards.length) {
          blocks.push(`<div class="il-flow">${flowCards.join('')}</div>`);
          flowCards = [];
        }
      };
      parseNodeList(root.childNodes, blocks, flowCards, flushFlow);
      flushFlow();
      if (blocks.length) {
        return `<div class="il-block">${blocks.join('')}</div>`;
      }
    }
  }

  return buildFromTokens(tokenizeInline(rawHtml));
}

// FIM interlinear.js
