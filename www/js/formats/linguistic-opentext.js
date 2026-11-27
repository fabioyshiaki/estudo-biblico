const OPENTEXT_STYLE_ID = 'opentext-module-styles';

const OPENTEXT_CSS = `
:root,
:root[data-theme="paper"] {
  --ot-clause-bg: #ffffff;
  --ot-clause-border: #dcd4c6;
  --ot-clause-head-bg: #f6f2e8;
  --ot-group-bg-0: #faf7f0;
  --ot-group-bg-1: #f3eee2;
  --ot-group-bg-2: #faf7f0;
  --ot-group-border: #dfd6c5;
  --ot-word-bg: #ffffff;
  --ot-word-border: #d8cfc0;
  --ot-id-color: #7c7366;
  --ot-func-color: #8c4a32;
  --ot-translit-color: #964532;
  --ot-gloss-color: #4f483f;
  --ot-role-subj: #1d5fa7;
  --ot-role-pred: #a83c32;
  --ot-role-comp: #1d7a46;
  --ot-role-mod: #6c46a8;
  --ot-role-conj: #16766c;
  --ot-fn-bg: rgba(29, 122, 70, 0.12);
  --ot-fn-fg: #186a3b;
}

:root[data-theme="light"] {
  --ot-clause-bg: #ffffff;
  --ot-clause-border: #d7dee8;
  --ot-clause-head-bg: #f4f7fb;
  --ot-group-bg-0: #f8fafc;
  --ot-group-bg-1: #eef3f9;
  --ot-group-bg-2: #f8fafc;
  --ot-group-border: #d5dfec;
  --ot-word-bg: #ffffff;
  --ot-word-border: #cfd9e6;
  --ot-id-color: #64748b;
  --ot-func-color: #9c3b28;
  --ot-translit-color: #9c3b28;
  --ot-gloss-color: #3f4b5b;
  --ot-role-subj: #1b63b8;
  --ot-role-pred: #b4362c;
  --ot-role-comp: #157347;
  --ot-role-mod: #6b42b0;
  --ot-role-conj: #0f766e;
  --ot-fn-bg: rgba(21, 115, 71, 0.11);
  --ot-fn-fg: #146c43;
}

:root[data-theme="sepia"] {
  --ot-clause-bg: #faf4e8;
  --ot-clause-border: #d2c2a8;
  --ot-clause-head-bg: #f1e6d2;
  --ot-group-bg-0: #f5ecdc;
  --ot-group-bg-1: #ede1cc;
  --ot-group-bg-2: #f5ecdc;
  --ot-group-border: #d1c0a3;
  --ot-word-bg: #fcf8ef;
  --ot-word-border: #d1c0a3;
  --ot-id-color: #786752;
  --ot-func-color: #8c3f26;
  --ot-translit-color: #8c3f26;
  --ot-gloss-color: #4f4131;
  --ot-role-subj: #205791;
  --ot-role-pred: #a33b2d;
  --ot-role-comp: #1f6b3e;
  --ot-role-mod: #663d94;
  --ot-role-conj: #186a62;
  --ot-fn-bg: rgba(31, 107, 62, 0.13);
  --ot-fn-fg: #1b5e36;
}

:root[data-theme="dark"] {
  --ot-clause-bg: #151921;
  --ot-clause-border: #2c3442;
  --ot-clause-head-bg: #1b212c;
  --ot-group-bg-0: #1a202a;
  --ot-group-bg-1: #212836;
  --ot-group-bg-2: #1a202a;
  --ot-group-border: #313a4b;
  --ot-word-bg: #141820;
  --ot-word-border: #343e50;
  --ot-id-color: #8c96a8;
  --ot-func-color: #e0826d;
  --ot-translit-color: #d9826c;
  --ot-gloss-color: #c7d0de;
  --ot-role-subj: #7ab8ff;
  --ot-role-pred: #f07b72;
  --ot-role-comp: #5cd48a;
  --ot-role-mod: #c29dff;
  --ot-role-conj: #56cfc1;
  --ot-fn-bg: rgba(92, 212, 138, 0.14);
  --ot-fn-fg: #6ee09a;
}

.verse-text .ot-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 2px;
  direction: ltr;
  text-align: left;
}

.verse-text .ot-clause {
  border: 1px solid var(--ot-clause-border);
  border-radius: var(--radius-md, 10px);
  background: var(--ot-clause-bg);
  overflow: hidden;
}

.verse-text .ot-clause-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 5px;
  padding: 5px 10px;
  background: var(--ot-clause-head-bg);
  border-bottom: 1px solid var(--ot-clause-border);
  font-family: var(--font-ui);
  font-size: 0.72em;
  line-height: 1.3;
  color: var(--ot-id-color);
}

.verse-text .ot-clause-mark {
  font-weight: 700;
  color: var(--ot-role-pred);
}

.verse-text .ot-clause-id {
  font-weight: 600;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.verse-text .ot-clause-rel {
  font-style: italic;
  opacity: 0.85;
}

.verse-text .ot-clause-body {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 7px;
  padding: 8px;
}

.verse-text .ot-group {
  display: inline-flex;
  flex-direction: column;
  max-width: 100%;
  border: 1px solid var(--ot-group-border);
  border-top: 2px solid var(--ot-role-accent, var(--ot-group-border));
  border-radius: var(--radius-sm, 8px);
  background: var(--ot-group-bg-0);
  overflow: hidden;
}

.verse-text .ot-group[data-depth="1"],
.verse-text .ot-group[data-depth="3"] {
  background: var(--ot-group-bg-1);
}

.verse-text .ot-group[data-depth="2"],
.verse-text .ot-group[data-depth="4"] {
  background: var(--ot-group-bg-2);
}

.verse-text .ot-group[data-role="subj"] {
  --ot-role-accent: var(--ot-role-subj);
}

.verse-text .ot-group[data-role="pred"] {
  --ot-role-accent: var(--ot-role-pred);
}

.verse-text .ot-group[data-role="comp"] {
  --ot-role-accent: var(--ot-role-comp);
}

.verse-text .ot-group[data-role="mod"] {
  --ot-role-accent: var(--ot-role-mod);
}

.verse-text .ot-group[data-role="conj"] {
  --ot-role-accent: var(--ot-role-conj);
}

.verse-text .ot-group-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 3px 8px;
  padding: 4px 7px 3px;
  border-bottom: 1px solid var(--ot-group-border);
  font-family: var(--font-ui);
  line-height: 1.25;
}

.verse-text .ot-group-role {
  font-size: 0.72em;
  font-weight: 700;
  color: var(--ot-role-accent, var(--ot-func-color));
}

.verse-text .ot-group-id {
  font-size: 0.64em;
  font-weight: 500;
  color: var(--ot-id-color);
  font-variant-numeric: tabular-nums;
}

.verse-text .ot-group-body {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 6px;
  padding: 6px;
}

.verse-text .ot-word {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 56px;
  padding: 5px 8px 6px;
  border-radius: var(--radius-sm, 6px);
  background: var(--ot-word-bg);
  border: 1px solid var(--ot-word-border);
  text-align: center;
}

.verse-text .ot-word-top {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 3px 5px;
  font-family: var(--font-ui);
  line-height: 1.2;
}

.verse-text .ot-word-top .v-fn-btn,
.verse-text .ot-word-top .v-fn-btn.v-fn-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 5px;
  margin: 0;
  border-radius: 4px;
  background: var(--ot-fn-bg);
  color: var(--ot-fn-fg);
  font-size: 0.65em;
  font-weight: 700;
  line-height: 1.25;
  vertical-align: baseline;
}

.verse-text .ot-word-func {
  font-size: 0.66em;
  font-style: italic;
  color: var(--ot-func-color);
}

.verse-text .ot-greek {
  display: block;
  margin-top: 1px;
  font-size: 1.02em;
  font-weight: 500;
  line-height: 1.32;
  color: var(--text-main);
}

.verse-text .ot-translit {
  display: block;
  font-family: var(--font-ui);
  font-size: 0.71em;
  line-height: 1.22;
  color: var(--ot-translit-color);
}

.verse-text .ot-gloss {
  display: block;
  font-family: var(--font-ui);
  font-size: 0.73em;
  font-weight: 500;
  line-height: 1.24;
  color: var(--ot-gloss-color);
}
`;

const RE_OPENTEXT_CL = /<cl\b[^>]*>\s*<div\b[^>]*class=['"][^'"]*\bc\b[^'"]*['"]/i;
const RE_OPENTEXT_WG = /<wg\b[^>]*>\s*<div\b[^>]*class=['"][^'"]*\bd\b[^'"]*['"][\s\S]*?<w\b[^>]*>\s*<div\b[^>]*class=['"][^'"]*\bw\b[^'"]*['"]/i;
const RE_GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]/;

function ensureOpenTextStyles() {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(OPENTEXT_STYLE_ID);
  if (existing) {
    existing.textContent = OPENTEXT_CSS;
    return;
  }
  const style = document.createElement('style');
  style.id = OPENTEXT_STYLE_ID;
  style.textContent = OPENTEXT_CSS;
  document.head.appendChild(style);
}

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

function normalizeAscii(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isOpenTextLinguisticHtml(rawText) {
  const s = String(rawText || '');
  return RE_OPENTEXT_CL.test(s) || RE_OPENTEXT_WG.test(s);
}

function classifyRole(roleText) {
  const norm = normalizeAscii(roleText);
  if (!norm) return '';
  if (/^(?:subject|sujeit)/.test(norm)) return 'subj';
  if (/^(?:predicat|predicad)/.test(norm)) return 'pred';
  if (/^(?:complement|object|objet)/.test(norm)) return 'comp';
  if (/^(?:adjun|conjun|address|vocat)/.test(norm)) return 'conj';
  if (/^(?:qualif|defin|specif|especif|relat)/.test(norm)) return 'mod';
  return '';
}

function getDirectOtContainer(el, className) {
  for (const child of el.children) {
    if (child.tagName === 'DIV' && child.classList.contains(className)) {
      return child;
    }
  }
  return el;
}

function extractLinesFromNode(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll('br').forEach((br) => {
    br.replaceWith(document.createTextNode('\n'));
  });
  return String(clone.textContent || '')
    .replace(/\u0001\d+\u0001/g, '')
    .split('\n')
    .map(cleanText)
    .filter(Boolean);
}

function parseWordNode(wordEl) {
  const inner = getDirectOtContainer(wordEl, 'w');
  const rawFull = String(inner.textContent || '');
  const fnTokens = rawFull.match(/\u0001\d+\u0001/g) || [];

  const funcEl = inner.querySelector('n');
  const func = funcEl ? cleanText(funcEl.textContent) : '';

  const linkEl = inner.querySelector('a');
  let greek = linkEl ? cleanText(linkEl.textContent) : '';

  const glossEl = inner.querySelector('t');
  let gloss = glossEl ? cleanText(glossEl.textContent) : '';

  // Extrai linhas restantes (ex.: transliteração no módulo TrsTxIMS)
  const clone = inner.cloneNode(true);
  clone.querySelectorAll('n, a, t').forEach((n) => n.remove());
  const extraLines = extractLinesFromNode(clone);

  let translit = '';
  for (const line of extraLines) {
    if (!greek && RE_GREEK.test(line)) {
      greek = line;
    } else if (!translit) {
      translit = line;
    } else if (!gloss) {
      gloss = line;
    } else {
      gloss = `${gloss} ${line}`.trim();
    }
  }

  return {
    kind: 'word',
    fnTokens,
    func,
    greek,
    translit,
    gloss
  };
}

function parseLabelHeader(container) {
  const eEl = container.querySelector('e');
  const nEl = container.querySelector('n');
  const spanId = eEl ? cleanText(eEl.textContent) : '';
  const role = nEl ? cleanText(nEl.textContent) : '';

  if (spanId || role) {
    return { spanId, role };
  }

  const lines = extractLinesFromNode(container);
  return {
    spanId: lines[0] || '',
    role: lines.slice(1).join(' ')
  };
}

function parseGroupNode(wgEl) {
  const container = getDirectOtContainer(wgEl, 'd');
  const otChildren = Array.from(container.children).filter((ch) =>
    ch.hasAttribute('data-ot')
  );

  // Grupo somente-rótulo (cabeçalho do grupo pai)
  if (!otChildren.length) {
    return {
      kind: 'label',
      ...parseLabelHeader(container)
    };
  }

  let spanId = '';
  let role = '';
  const items = [];

  for (const ch of otChildren) {
    const otType = ch.getAttribute('data-ot');
    if (otType === 'w') {
      items.push(parseWordNode(ch));
    } else if (otType === 'wg') {
      const parsed = parseGroupNode(ch);
      if (parsed.kind === 'label' && !spanId && !role) {
        spanId = parsed.spanId;
        role = parsed.role;
      } else if (parsed.kind !== 'label') {
        items.push(parsed);
      }
    } else if (otType === 'cl') {
      items.push(parseClauseNode(ch));
    }
  }

  return {
    kind: 'group',
    spanId,
    role,
    items
  };
}

function parseClauseNode(clEl) {
  const container = getDirectOtContainer(clEl, 'c');
  let mark = '';
  let clauseId = '';
  let relation = '';
  const items = [];

  for (const ch of container.children) {
    const otType = ch.getAttribute('data-ot');
    if (otType === 'wg') {
      const parsed = parseGroupNode(ch);
      if (parsed.kind !== 'label') items.push(parsed);
    } else if (otType === 'w') {
      items.push(parseWordNode(ch));
    } else if (otType === 'cl') {
      items.push(parseClauseNode(ch));
    } else if (ch.tagName === 'SUP' && !clauseId && !mark) {
      const nEl = ch.querySelector('n');
      const eEl = ch.querySelector('e');
      mark = nEl ? cleanText(nEl.textContent) : '';
      clauseId = eEl ? cleanText(eEl.textContent) : '';

      const clone = ch.cloneNode(true);
      clone.querySelectorAll('n, e').forEach((x) => x.remove());
      const rest = cleanText(clone.textContent);
      if (rest) relation = rest;
      if (!clauseId && rest) {
        clauseId = rest;
        relation = '';
      }
    }
  }

  return {
    kind: 'clause',
    mark,
    clauseId,
    relation,
    items
  };
}

function renderWord(node) {
  const topParts = [];
  if (node.fnTokens.length) {
    topParts.push(node.fnTokens.join(''));
  }
  if (node.func) {
    topParts.push(`<span class="ot-word-func">${escapeHtml(node.func)}</span>`);
  }

  const topHtml = topParts.length
    ? `<div class="ot-word-top">${topParts.join('')}</div>`
    : '';
  const greekHtml = node.greek
    ? `<span class="ot-greek">${escapeHtml(node.greek)}</span>`
    : '';
  const translitHtml = node.translit
    ? `<span class="ot-translit">${escapeHtml(node.translit)}</span>`
    : '';
  const glossHtml = node.gloss
    ? `<span class="ot-gloss">${escapeHtml(node.gloss)}</span>`
    : '';

  return `<div class="ot-word">${topHtml}${greekHtml}${translitHtml}${glossHtml}</div>`;
}

function renderGroup(node, depth = 0) {
  const roleType = classifyRole(node.role);
  const roleAttr = roleType ? ` data-role="${roleType}"` : '';
  const depthCapped = Math.min(depth, 4);

  let headHtml = '';
  if (node.role || node.spanId) {
    const roleSpan = node.role
      ? `<span class="ot-group-role">${escapeHtml(node.role)}</span>`
      : '';
    const idSpan = node.spanId
      ? `<span class="ot-group-id">${escapeHtml(node.spanId)}</span>`
      : '';
    headHtml = `<div class="ot-group-head">${roleSpan}${idSpan}</div>`;
  }

  const bodyHtml = node.items
    .map((item) => {
      if (item.kind === 'word') return renderWord(item);
      if (item.kind === 'group') return renderGroup(item, depth + 1);
      if (item.kind === 'clause') return renderClause(item);
      return '';
    })
    .join('');

  return (
    `<div class="ot-group" data-depth="${depthCapped}"${roleAttr}>` +
      headHtml +
      `<div class="ot-group-body">${bodyHtml}</div>` +
    '</div>'
  );
}

function renderClause(node) {
  const headParts = [];
  if (node.mark) {
    headParts.push(`<span class="ot-clause-mark">${escapeHtml(node.mark)}</span>`);
  }
  if (node.clauseId) {
    headParts.push(`<span class="ot-clause-id">${escapeHtml(node.clauseId)}</span>`);
  }
  if (node.relation) {
    headParts.push(`<span class="ot-clause-rel">${escapeHtml(node.relation)}</span>`);
  }

  const headHtml = headParts.length
    ? `<div class="ot-clause-head">${headParts.join('')}</div>`
    : '';

  const bodyHtml = node.items
    .map((item) => {
      if (item.kind === 'group') return renderGroup(item, 0);
      if (item.kind === 'word') return renderWord(item);
      if (item.kind === 'clause') return renderClause(item);
      return '';
    })
    .join('');

  return `<div class="ot-clause">${headHtml}<div class="ot-clause-body">${bodyHtml}</div></div>`;
}

export function formatOpenTextHtml(rawHtml) {
  if (typeof document === 'undefined') return '';
  const source = String(rawHtml || '').trim();
  if (!source) return '';

  ensureOpenTextStyles();

  // Normaliza tags customizadas para divs/spans seguros antes de montar a árvore DOM
  const normalized = source
    .replace(/<(\/?)cl\b([^>]*)>/gi, (_, sl, a) => (sl ? '</div>' : `<div data-ot="cl"${a}>`))
    .replace(/<(\/?)wg\b([^>]*)>/gi, (_, sl, a) => (sl ? '</div>' : `<div data-ot="wg"${a}>`))
    .replace(/<(\/?)w\b([^>]*)>/gi, (_, sl, a) => (sl ? '</div>' : `<div data-ot="w"${a}>`))
    .replace(/<(\/?)tr\b([^>]*)>/gi, (_, sl, a) => (sl ? '</span>' : `<span data-ot="tr"${a}>`));

  const tpl = document.createElement('template');
  tpl.innerHTML = normalized;

  const rendered = [];
  const looseItems = [];

  for (const ch of tpl.content.children) {
    const otType = ch.getAttribute('data-ot');
    if (otType === 'cl') {
      rendered.push(renderClause(parseClauseNode(ch)));
    } else if (otType === 'wg') {
      const parsed = parseGroupNode(ch);
      if (parsed.kind !== 'label') looseItems.push(parsed);
    } else if (otType === 'w') {
      looseItems.push(parseWordNode(ch));
    }
  }

  if (looseItems.length) {
    rendered.push(
      renderClause({
        kind: 'clause',
        mark: '',
        clauseId: '',
        relation: '',
        items: looseItems
      })
    );
  }

  if (!rendered.length) return '';
  return `<div class="il-block ot-block">${rendered.join('')}</div>`;
}
