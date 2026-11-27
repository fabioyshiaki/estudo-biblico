import { nativeBridge } from '../bridge/native-bridge.js';

const COMPANION_STYLE_ID = 'companion-dicts-styles';

const COMPANION_CSS = `
:root,
:root[data-theme="paper"] {
  --cmp-animals-fg: #9c4a2b;
  --cmp-animals-bg: rgba(156, 74, 43, 0.10);
  --cmp-plants-fg: #1f7343;
  --cmp-plants-bg: rgba(31, 115, 67, 0.10);
  --cmp-objects-fg: #2b548f;
  --cmp-objects-bg: rgba(43, 84, 143, 0.10);
  --dct-pic-bg: #f4efe4;
}

:root[data-theme="light"] {
  --cmp-animals-fg: #a14420;
  --cmp-animals-bg: rgba(161, 68, 32, 0.10);
  --cmp-plants-fg: #157347;
  --cmp-plants-bg: rgba(21, 115, 71, 0.10);
  --cmp-objects-fg: #1d5bb8;
  --cmp-objects-bg: rgba(29, 91, 184, 0.10);
  --dct-pic-bg: #f1f5f9;
}

:root[data-theme="sepia"] {
  --cmp-animals-fg: #8c4122;
  --cmp-animals-bg: rgba(140, 65, 34, 0.12);
  --cmp-plants-fg: #1e6b3d;
  --cmp-plants-bg: rgba(30, 107, 61, 0.12);
  --cmp-objects-fg: #23538a;
  --cmp-objects-bg: rgba(35, 83, 138, 0.12);
  --dct-pic-bg: #efe4cf;
}

:root[data-theme="dark"] {
  --cmp-animals-fg: #eba078;
  --cmp-animals-bg: rgba(235, 160, 120, 0.15);
  --cmp-plants-fg: #67d995;
  --cmp-plants-bg: rgba(103, 217, 149, 0.15);
  --cmp-objects-fg: #84baff;
  --cmp-objects-bg: rgba(132, 186, 255, 0.15);
  --dct-pic-bg: #10141b;
}

/* Símbolos dos dicionários ilustrados (_br) no final de cada versículo */
.v-companion-bar {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-inline-start: 6px;
  vertical-align: middle;
}

.verse-item.is-interlinear > .v-companion-bar,
.verse-item.has-block-content > .v-companion-bar {
  display: flex;
  margin-inline-start: 0;
  margin-top: 6px;
}

.verse-item.has-rtl-content > .v-companion-bar {
  justify-content: flex-end;
}

.v-companion-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 24px;
  min-width: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: 999px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.08s ease, opacity 0.12s ease;
}

.v-companion-btn:active {
  transform: scale(0.92);
  opacity: 0.75;
}

.v-companion-btn svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  fill: currentColor;
}

.v-companion-btn--animals {
  color: var(--cmp-animals-fg);
  background: var(--cmp-animals-bg);
}

.v-companion-btn--plants {
  color: var(--cmp-plants-fg);
  background: var(--cmp-plants-bg);
}

.v-companion-btn--objects {
  color: var(--cmp-objects-fg);
  background: var(--cmp-objects-bg);
}

/* Lista modal quando há mais de 1 item no mesmo versículo */
.cmp-modal-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cmp-modal-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-main);
  font-family: var(--font-ui);
  font-size: 15px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.cmp-modal-item:active {
  background: var(--accent-soft);
}

.cmp-modal-arrow {
  color: var(--text-muted);
  font-size: 18px;
  line-height: 1;
}

/* Imagens e legendas dentro do leitor de dicionário */
.dct-pic {
  margin: 12px 0 6px;
  padding: 6px;
  border-radius: var(--radius-md);
  background: var(--dct-pic-bg);
  border: 1px solid var(--border);
  text-align: center;
}

.dct-img {
  display: block;
  max-width: 100%;
  max-height: 360px;
  width: auto;
  height: auto;
  margin: 0 auto;
  border-radius: calc(var(--radius-sm) - 2px);
  object-fit: contain;
  cursor: zoom-in;
}

.dct-img.is-loading {
  min-height: 120px;
  opacity: 0.4;
}

.dct-pic.is-failed {
  display: none;
}

.dct-info {
  margin: 0 0 4px;
  font-family: var(--font-ui);
  font-size: 0.78em;
  line-height: 1.42;
  color: var(--text-muted);
  word-wrap: break-word;
}

.dct-info p {
  margin: 0 0 3px;
}

.dct-definition {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
}

/* Visualizador ampliado ao tocar na imagem */
.dct-lightbox {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(0, 0, 0, 0.88);
  touch-action: manipulation;
}

.dct-lightbox img {
  max-width: 100%;
  max-height: 92vh;
  border-radius: 8px;
  object-fit: contain;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
}
`;

export const COMPANION_CATEGORIES = Object.freeze({
  animals: {
    key: 'animals',
    label: 'Animais da Bíblia',
    shortLabel: 'Animais',
    order: 1,
    // Ícone de pata (Animais)
    iconSvg:
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<circle cx="7.2" cy="8.2" r="2.2"/>' +
        '<circle cx="12" cy="6.2" r="2.2"/>' +
        '<circle cx="16.8" cy="8.2" r="2.2"/>' +
        '<circle cx="19.2" cy="12.6" r="1.9"/>' +
        '<path d="M12 11c-3.1 0-5.7 2.4-5.7 5.2 0 1.7 1.3 2.8 3 2.8 1.1 0 1.9-.4 2.7-.4s1.6.4 2.7.4c1.7 0 3-1.1 3-2.8 0-2.8-2.6-5.2-5.7-5.2z"/>' +
      '</svg>'
  },
  plants: {
    key: 'plants',
    label: 'Plantas da Bíblia',
    shortLabel: 'Plantas',
    order: 2,
    // Ícone de folha botânica (Plantas)
    iconSvg:
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M19.8 4.2C14.2 3.8 8.3 6.2 6.2 11.4c-1 2.5-.8 5.2.3 7.2l-2.1 2.1a.9.9 0 1 0 1.3 1.3l2.1-2.1c2 1.1 4.7 1.3 7.2.3 5.2-2.1 7.6-8 7.2-13.6-.1-1.3-1.1-2.3-2.4-2.4zm-3.6 6.1l-6.4 6.4a.8.8 0 0 1-1.1-1.1l6.4-6.4a.8.8 0 1 1 1.1 1.1z"/>' +
      '</svg>'
  },
  objects: {
    key: 'objects',
    label: 'Objetos da Bíblia',
    shortLabel: 'Objetos',
    order: 3,
    // Ícone de ânfora/vaso bíblico (Objetos)
    iconSvg:
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M9 3h6a1 1 0 0 1 0 2h-.8v2.1c1.2.4 2.6 1.3 3.3 2.8.8 1.6.9 3.6.2 5.4-.6 1.6-1.8 2.8-3.2 3.4V20h1.5a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h1.5v-1.3c-1.4-.6-2.6-1.8-3.2-3.4-.7-1.8-.6-3.8.2-5.4.7-1.5 2.1-2.4 3.3-2.8V5H9a1 1 0 0 1 0-2zm-2.5 7.4c-.9.3-1.5 1.1-1.5 2.1 0 1 .6 1.8 1.4 2.1-.3-1.4-.2-2.9.1-4.2zm11 0c.3 1.3.4 2.8.1 4.2.8-.3 1.4-1.1 1.4-2.1 0-1-.6-1.8-1.5-2.1z"/>' +
      '</svg>'
  }
});

const verseSchemaCache = new Map();
const chapterQueryCache = new Map();

function getRowField(row, targetLower) {
  if (!row || typeof row !== 'object') return undefined;
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === targetLower) return row[key];
  }
  return undefined;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function ensureCompanionStyles() {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(COMPANION_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = COMPANION_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = COMPANION_CSS;
}

export function classifyCompanionDictionary(mod) {
  if (!mod || mod.resourceKind !== 'dictionary') return null;
  const target = String(mod.fileName || mod.path || '').toLowerCase();
  if (!/_br(?=[._\-\s]|$)/.test(target)) return null;

  if (target.includes('bibleanimals')) return 'animals';
  if (target.includes('bibleplants')) return 'plants';
  if (target.includes('bibleobjects')) return 'objects';
  return null;
}

export function getInstalledCompanionDictionaries(dictionaries = []) {
  const found = new Map();
  for (const mod of Array.isArray(dictionaries) ? dictionaries : []) {
    const key = classifyCompanionDictionary(mod);
    if (key && !found.has(key)) {
      found.set(key, {
        ...COMPANION_CATEGORIES[key],
        module: mod
      });
    }
  }
  return Array.from(found.values()).sort((a, b) => a.order - b.order);
}

async function resolveVerseTableInfo(modulePath) {
  if (verseSchemaCache.has(modulePath)) {
    return verseSchemaCache.get(modulePath);
  }

  try {
    const tblRes = await nativeBridge.queryModule(
      modulePath,
      "SELECT name FROM sqlite_master WHERE type='table' AND lower(name) IN ('verse', 'dictionary')"
    );
    const names = (Array.isArray(tblRes && tblRes.rows) ? tblRes.rows : [])
      .map((r) => String(getRowField(r, 'name') || '').toLowerCase());

    if (!names.includes('verse')) {
      const info = { hasVerseTable: false, hasRelativeOrder: false };
      verseSchemaCache.set(modulePath, info);
      return info;
    }

    let hasRelativeOrder = false;
    if (names.includes('dictionary')) {
      const colRes = await nativeBridge.queryModule(modulePath, 'PRAGMA table_info("dictionary")');
      const cols = (Array.isArray(colRes && colRes.rows) ? colRes.rows : [])
        .map((r) => String(getRowField(r, 'name') || '').toLowerCase());
      hasRelativeOrder = cols.includes('relativeorder') && cols.includes('word');
    }

    const info = { hasVerseTable: true, hasRelativeOrder };
    verseSchemaCache.set(modulePath, info);
    return info;
  } catch (err) {
    const info = { hasVerseTable: false, hasRelativeOrder: false };
    verseSchemaCache.set(modulePath, info);
    return info;
  }
}

async function loadDictChapterEntries(modulePath, bookId, chapter) {
  const cacheKey = `${modulePath}::${bookId}::${chapter}`;
  if (chapterQueryCache.has(cacheKey)) {
    return chapterQueryCache.get(cacheKey);
  }

  const info = await resolveVerseTableInfo(modulePath);
  if (!info.hasVerseTable) {
    const empty = new Map();
    chapterQueryCache.set(cacheKey, empty);
    return empty;
  }

  const sql = info.hasRelativeOrder
    ? 'SELECT v.verse AS verse, v.entry AS entry ' +
      'FROM verse v ' +
      'LEFT JOIN dictionary d ON d.word = v.entry COLLATE NOCASE ' +
      'WHERE v.book = ? AND v.chapter = ? ' +
      'ORDER BY v.verse ASC, COALESCE(d.relativeorder, 999999) ASC, v.id ASC'
    : 'SELECT verse, entry FROM verse ' +
      'WHERE book = ? AND chapter = ? ' +
      'ORDER BY verse ASC, id ASC';

  const res = await nativeBridge.queryModule(modulePath, sql, [Number(bookId), Number(chapter)]);
  const rows = Array.isArray(res && res.rows) ? res.rows : [];
  const byVerse = new Map();

  for (const r of rows) {
    const vNum = Number(getRowField(r, 'verse')) || 0;
    const entry = String(getRowField(r, 'entry') || '').trim();
    if (!vNum || !entry) continue;

    if (!byVerse.has(vNum)) {
      byVerse.set(vNum, []);
    }
    const list = byVerse.get(vNum);
    if (!list.some((x) => x.toLowerCase() === entry.toLowerCase())) {
      list.push(entry);
    }
  }

  chapterQueryCache.set(cacheKey, byVerse);
  return byVerse;
}

export async function loadCompanionRefsForChapter(dictionaries, bookId, chapter) {
  const companions = getInstalledCompanionDictionaries(dictionaries);
  const result = new Map(); // verseNum -> [{ category, label, shortLabel, iconSvg, module, entries }]
  if (!companions.length) return result;

  ensureCompanionStyles();

  const perCompanion = await Promise.all(
    companions.map(async (comp) => {
      try {
        const byVerse = await loadDictChapterEntries(comp.module.path, bookId, chapter);
        return { comp, byVerse };
      } catch (err) {
        return { comp, byVerse: new Map() };
      }
    })
  );

  for (const { comp, byVerse } of perCompanion) {
    for (const [vNum, entries] of byVerse.entries()) {
      if (!entries.length) continue;
      if (!result.has(vNum)) {
        result.set(vNum, []);
      }
      result.get(vNum).push({
        category: comp.key,
        label: comp.label,
        shortLabel: comp.shortLabel,
        iconSvg: comp.iconSvg,
        module: comp.module,
        entries
      });
    }
  }

  return result;
}

export function buildCompanionBarHtml(verseNum, groups) {
  if (!Array.isArray(groups) || !groups.length) return '';

  const buttons = groups.map((g) => {
    const countHtml = g.entries.length > 1 ? `<span>${g.entries.length}</span>` : '';
    const title = `${g.label}: ${g.entries.join(', ')}`;
    return (
      `<button type="button" class="v-companion-btn v-companion-btn--${g.category}" ` +
        `data-cmp-verse="${verseNum}" data-cmp-cat="${g.category}" ` +
        `title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">` +
        `${g.iconSvg}${countHtml}` +
      '</button>'
    );
  }).join('');

  return `<span class="v-companion-bar" data-bref-skip="1">${buttons}</span>`;
}

export function clearCompanionCache() {
  verseSchemaCache.clear();
  chapterQueryCache.clear();
}
