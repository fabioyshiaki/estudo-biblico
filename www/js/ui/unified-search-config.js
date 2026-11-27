import { store } from '../core/store.js';
import { getBookName } from '../core/canon.js';
import {
  BIBLE_SCOPE_GROUPS,
  BIBLE_SEARCH_TYPES,
  BIBLE_INTERVAL_TYPES,
  DEFAULT_BIBLE_SEARCH_OPTIONS,
  normalizeBibleSearchOptions
} from '../formats/bible-search.js';
import {
  CMT_TARGET_FIELDS,
  CMT_BLOCK_FILTERS,
  CMT_SEARCH_TYPES,
  DEFAULT_CMT_SEARCH_OPTIONS,
  normalizeCmtSearchOptions
} from '../formats/commentary-search.js';
import {
  DICT_TARGET_FIELDS,
  DICT_SEARCH_TYPES,
  DEFAULT_UNIFIED_DICT_OPTIONS,
  normalizeUnifiedDictOptions
} from '../formats/dictionary-search.js';

export const ALL_MODULES_VALUE = '__ALL_MODULES__';
export const FAV_MODULES_VALUE = '__FAV_MODULES__';

const OPTS_KEY_PREFIX = 'estudo_biblico_unified_search_opts_v1_';
const HIST_KEY_PREFIX = 'estudo_biblico_unified_search_hist_v1_';
const MAX_HISTORY = 16;

export const BIBLE_TARGET_FIELDS = Object.freeze([
  { id: 'text', label: 'Texto bíblico' },
  { id: 'strong', label: 'Strong (H/G)' },
  { id: 'morph', label: 'Morfologia' },
  { id: 'notes', label: 'Notas e títulos' },
  { id: 'redLetter', label: 'Palavras de Jesus' },
  { id: 'all', label: 'Todos os dados' }
]);

export const SEARCH_KINDS = Object.freeze(['bible', 'commentary', 'dictionary']);

export const SEARCH_KIND_META = Object.freeze({
  bible: {
    id: 'bible',
    tabLabel: 'Bíblia',
    singular: 'Bíblia',
    plural: 'Bíblias',
    allLabel: 'Todas as Bíblias',
    favLabel: 'Só Favoritas ★',
    badgeHtml: '&#10013;',
    badgeCls: 'ms-res-badge--bible',
    placeholder: 'Palavra, frase, Strong (H430, G26), -excluir ou regex...',
    unitLabel: 'versículo(s)',
    maxLimit: 100000,
    supportsScope: true,
    supportsInterval: true,
    supportsBlockFilter: false,
    supportsAltWords: false,
    emptyTitle: 'Nenhuma Bíblia instalada',
    emptyDesc: 'Adicione uma pasta ou arquivo .bbl.mybible em Configurações → Fontes.',
    tip: 'Dica: use -palavra para excluir (amor -mundo), aspas para frase ("no princípio" Deus) ou códigos Strong (H430, G26).'
  },
  commentary: {
    id: 'commentary',
    tabLabel: 'Comentário',
    singular: 'Comentário',
    plural: 'Comentários',
    allLabel: 'Todos os Comentários',
    favLabel: 'Só Favoritos ★',
    badgeHtml: 'C',
    badgeCls: 'ms-res-badge--commentary',
    placeholder: 'Termo nos comentários, Strong (H430, G26), referência ou regex...',
    unitLabel: 'bloco(s)',
    maxLimit: 20000,
    supportsScope: true,
    supportsInterval: false,
    supportsBlockFilter: true,
    supportsAltWords: false,
    emptyTitle: 'Nenhum comentário instalado',
    emptyDesc: 'Adicione uma pasta ou arquivo .cmt.mybible em Configurações → Fontes.',
    tip: 'Dica: filtre por Tipo de bloco (Introduções, Capítulos, Porções ou Versículos) ou busque referências e códigos Strong.'
  },
  dictionary: {
    id: 'dictionary',
    tabLabel: 'Dicionário',
    singular: 'Dicionário',
    plural: 'Dicionários',
    allLabel: 'Todos os Dicionários',
    favLabel: 'Só Favoritos ★',
    badgeHtml: 'D',
    badgeCls: 'ms-res-badge--dict',
    placeholder: 'Verbete, parte da palavra, Strong (H430, G976), -excluir ou regex...',
    unitLabel: 'verbete(s)',
    maxLimit: 10000,
    supportsScope: false,
    supportsInterval: false,
    supportsBlockFilter: false,
    supportsAltWords: true,
    emptyTitle: 'Nenhum dicionário instalado',
    emptyDesc: 'Adicione uma pasta ou arquivo .dct.mybible em Configurações → Fontes.',
    tip: 'Dica: escolha "Títulos e texto" para buscar também nas definições; ative "Acentos" para diferenciar palavras acentuadas.'
  }
});

export function normalizeSearchKind(rawKind) {
  if (rawKind === 'commentary' || rawKind === 'dictionary') return rawKind;
  return 'bible';
}

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getDefaultOptionsForKind(kind) {
  const k = normalizeSearchKind(kind);
  if (k === 'commentary') return { ...DEFAULT_CMT_SEARCH_OPTIONS };
  if (k === 'dictionary') return { ...DEFAULT_UNIFIED_DICT_OPTIONS };
  return { ...DEFAULT_BIBLE_SEARCH_OPTIONS };
}

export function normalizeOptionsForKind(kind, raw = {}) {
  const k = normalizeSearchKind(kind);
  if (k === 'commentary') return normalizeCmtSearchOptions(raw);
  if (k === 'dictionary') return normalizeUnifiedDictOptions(raw);
  return normalizeBibleSearchOptions(raw);
}

export function loadUnifiedSearchOptions(kind) {
  const k = normalizeSearchKind(kind);
  try {
    const raw = window.localStorage.getItem(`${OPTS_KEY_PREFIX}${k}`);
    if (!raw) return getDefaultOptionsForKind(k);
    return normalizeOptionsForKind(k, JSON.parse(raw));
  } catch (err) {
    return getDefaultOptionsForKind(k);
  }
}

export function saveUnifiedSearchOptions(kind, opts) {
  const k = normalizeSearchKind(kind);
  const normalized = normalizeOptionsForKind(k, opts);
  try {
    window.localStorage.setItem(`${OPTS_KEY_PREFIX}${k}`, JSON.stringify(normalized));
  } catch (err) {
    // Ignora caso localStorage esteja indisponível
  }
  return normalized;
}

export function loadUnifiedHistory(kind) {
  const k = normalizeSearchKind(kind);
  try {
    const raw = window.localStorage.getItem(`${HIST_KEY_PREFIX}${k}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((s) => typeof s === 'string' && s.trim()).slice(0, MAX_HISTORY);
      }
    }
    // Reaproveita histórico anterior da Bíblia se existir
    if (k === 'bible') {
      const legacy = window.localStorage.getItem('estudo_biblico_bible_search_hist_v1');
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        if (Array.isArray(parsedLegacy)) {
          return parsedLegacy.filter((s) => typeof s === 'string' && s.trim()).slice(0, MAX_HISTORY);
        }
      }
    }
    return [];
  } catch (err) {
    return [];
  }
}

export function pushUnifiedHistory(kind, term) {
  const k = normalizeSearchKind(kind);
  const clean = String(term || '').trim();
  if (!clean) return loadUnifiedHistory(k);

  const prev = loadUnifiedHistory(k);
  const next = [clean, ...prev.filter((t) => t.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_HISTORY);
  try {
    window.localStorage.setItem(`${HIST_KEY_PREFIX}${k}`, JSON.stringify(next));
  } catch (err) {
    // Ignora erro
  }
  return next;
}

export function clearUnifiedHistory(kind) {
  const k = normalizeSearchKind(kind);
  try {
    window.localStorage.removeItem(`${HIST_KEY_PREFIX}${k}`);
  } catch (err) {
    // Ignora erro
  }
  return [];
}

export function getModulesForKind(kind) {
  const k = normalizeSearchKind(kind);
  if (k === 'commentary') return store.getCommentaries();
  if (k === 'dictionary') return store.getDictionaries();
  return store.getBibles();
}

export function getActiveModuleForKind(kind) {
  const k = normalizeSearchKind(kind);
  if (k === 'commentary') return store.getActiveCommentary();
  if (k === 'dictionary') return store.getActiveDictionary();
  return store.getActiveBible();
}

export function getPreferredLabelForModule(mod, fallback = '') {
  if (!mod) return fallback;
  const sortBy = store.getPrefs().bibleSortBy === 'title' ? 'title' : 'abbr';
  return sortBy === 'title'
    ? (mod.title || mod.abbr || mod.fileName || fallback)
    : (mod.abbr || mod.title || mod.fileName || fallback);
}

export function getModuleSelectOptionLabel(mod, fallback = '') {
  if (!mod) return fallback;
  const sortBy = store.getPrefs().bibleSortBy === 'title' ? 'title' : 'abbr';
  const primary = getPreferredLabelForModule(mod, fallback);
  const secondary = sortBy === 'title' ? (mod.abbr || '') : (mod.title || '');
  return secondary && secondary !== primary ? `${primary} — ${secondary}` : primary;
}

export function syncScopeBooks(opts, currentBook) {
  if (!opts || typeof opts !== 'object') return opts;
  if (!('scope' in opts)) return opts;
  if (opts.scope === 'custom') return opts;
  if (opts.scope === 'currentBook' || opts.scope === 'currentChapter') {
    const b = Number(currentBook) >= 1 && Number(currentBook) <= 66 ? Number(currentBook) : 1;
    return { ...opts, fromBook: b, toBook: b };
  }
  const grp = BIBLE_SCOPE_GROUPS[opts.scope] || BIBLE_SCOPE_GROUPS.all;
  return {
    ...opts,
    fromBook: grp.minBook || 1,
    toBook: grp.maxBook || 66
  };
}

export function buildBookOptionsHtml(selectedId) {
  const parts = [];
  for (let id = 1; id <= 66; id++) {
    parts.push(`<option value="${id}"${id === selectedId ? ' selected' : ''}>${escapeHtml(getBookName(id))}</option>`);
  }
  return parts.join('');
}

export function getHeaderTitleForSearch(kind, targetVal, modules, activeMod) {
  const k = normalizeSearchKind(kind);
  const meta = SEARCH_KIND_META[k];
  if (!Array.isArray(modules) || !modules.length) {
    return `Pesquisar ${meta.singular}`;
  }
  if (targetVal === ALL_MODULES_VALUE) {
    return `Pesquisar ${meta.allLabel}`;
  }
  if (targetVal === FAV_MODULES_VALUE) {
    return `Pesquisar ${meta.plural} (Favoritos)`;
  }
  const chosen = modules.find((m) => m.path === targetVal) || activeMod;
  return chosen
    ? `Pesquisar ${getPreferredLabelForModule(chosen, meta.singular)}`
    : `Pesquisar ${meta.singular}`;
}

export function getActiveFilterSummaryTags(kind, opts) {
  const k = normalizeSearchKind(kind);
  const tags = [];

  if (k === 'bible') {
    const tf = BIBLE_TARGET_FIELDS.find((f) => f.id === opts.targetField);
    if (opts.targetField !== 'text' && tf) tags.push(tf.label);
    if (opts.scope === 'custom') {
      tags.push(`${getBookName(opts.fromBook)}–${getBookName(opts.toBook)}`);
    } else if (opts.scope !== 'all') {
      const grp = BIBLE_SCOPE_GROUPS[opts.scope];
      if (grp) tags.push(grp.label);
    }
    if (opts.searchType !== 'standard') {
      const st = BIBLE_SEARCH_TYPES[opts.searchType];
      if (st) tags.push(st.label);
    }
    if (opts.intervalType !== 'verse') {
      const it = BIBLE_INTERVAL_TYPES[opts.intervalType];
      if (it) tags.push(`Intervalo: ${it.label}`);
    }
  } else if (k === 'commentary') {
    const tf = CMT_TARGET_FIELDS.find((f) => f.id === opts.targetField);
    if (opts.targetField !== 'text' && tf) tags.push(tf.label);
    if (opts.scope === 'custom') {
      tags.push(`${getBookName(opts.fromBook)}–${getBookName(opts.toBook)}`);
    } else if (opts.scope !== 'all') {
      const grp = BIBLE_SCOPE_GROUPS[opts.scope];
      if (grp) tags.push(grp.label);
    }
    if (opts.searchType !== 'standard') {
      const st = CMT_SEARCH_TYPES[opts.searchType];
      if (st) tags.push(st.label);
    }
    if (opts.blockFilter !== 'all') {
      const bf = CMT_BLOCK_FILTERS[opts.blockFilter];
      if (bf) tags.push(bf.label);
    }
  } else {
    const tf = DICT_TARGET_FIELDS.find((f) => f.id === opts.targetField);
    if (opts.targetField !== 'word_alt' && tf) tags.push(tf.label);
    if (opts.searchType !== 'contains') {
      const st = DICT_SEARCH_TYPES[opts.searchType];
      if (st) tags.push(st.label);
    }
    if (opts.searchAltWords === false) tags.push('Sem sinônimos');
  }

  if (opts.useRegex) tags.push('Regexp');
  if (opts.accentSensitive) tags.push('Acentos');
  if (opts.caseSensitive) tags.push('Aa');

  return tags;
}

export function buildKindTabsHtml(activeKind) {
  const counts = {
    bible: store.getBibles().length,
    commentary: store.getCommentaries().length,
    dictionary: store.getDictionaries().length
  };

  return SEARCH_KINDS.map((k) => {
    const meta = SEARCH_KIND_META[k];
    const isActive = k === activeKind;
    const cntHtml = counts[k] > 0
      ? `<span class="ms-kind-tab-count">(${counts[k]})</span>`
      : '';
    return (
      `<button type="button" class="ms-kind-tab ms-kind-tab--${k}${isActive ? ' is-active' : ''}" data-ms-kind="${k}" role="tab" aria-selected="${isActive ? 'true' : 'false'}">` +
        `<span class="ms-res-badge ${meta.badgeCls}">${meta.badgeHtml}</span>` +
        `<span>${escapeHtml(meta.tabLabel)}</span>` +
        cntHtml +
      '</button>'
    );
  }).join('');
}

export function buildUnifiedFiltersHtml({ kind, modules, targetVal, opts }) {
  const k = normalizeSearchKind(kind);
  const meta = SEARCH_KIND_META[k];
  const list = Array.isArray(modules) ? modules : [];
  const favCount = list.filter((m) => m.isFavorite).length;

  const moduleOptionsHtml = [
    ...list.map((m) => {
      const label = getModuleSelectOptionLabel(m, meta.singular);
      return `<option value="${escapeHtml(m.path)}"${targetVal === m.path ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    }),
    `<option value="${ALL_MODULES_VALUE}"${targetVal === ALL_MODULES_VALUE ? ' selected' : ''}>${escapeHtml(meta.allLabel)} (${list.length})</option>`,
    `<option value="${FAV_MODULES_VALUE}"${targetVal === FAV_MODULES_VALUE ? ' selected' : ''}>${escapeHtml(meta.favLabel)} (${favCount})</option>`
  ].join('');

  const targetList = k === 'commentary'
    ? CMT_TARGET_FIELDS
    : (k === 'dictionary' ? DICT_TARGET_FIELDS : BIBLE_TARGET_FIELDS);
  const targetOptionsHtml = targetList.map((t) => (
    `<option value="${t.id}"${opts.targetField === t.id ? ' selected' : ''}>${escapeHtml(t.label)}</option>`
  )).join('');

  const typeMap = k === 'commentary'
    ? CMT_SEARCH_TYPES
    : (k === 'dictionary' ? DICT_SEARCH_TYPES : BIBLE_SEARCH_TYPES);
  const typeOptionsHtml = Object.values(typeMap).map((t) => (
    `<option value="${t.id}"${opts.searchType === t.id ? ' selected' : ''}>${escapeHtml(t.label)}</option>`
  )).join('');

  const limitInputHtml = `
    <div class="ms-field-inline">
      <span class="ms-field-label">Limitar</span>
      <input
        type="number"
        class="ms-limit-input"
        id="ms-input-limit"
        min="1"
        max="${meta.maxLimit}"
        inputmode="numeric"
        value="${escapeHtml(opts.limit)}"
        aria-label="Limite de resultados"
      />
    </div>
  `;

  const moduleSelectHtml = `
    <div class="ms-spinner-wrap">
      <select class="ms-select" id="ms-sel-module" aria-label="Selecionar ${escapeHtml(meta.singular)}">
        ${moduleOptionsHtml}
      </select>
    </div>
  `;

  const rows = [];

  if (meta.supportsScope) {
    const scopeOptionsHtml = Object.values(BIBLE_SCOPE_GROUPS).map((g) => (
      `<option value="${g.id}"${opts.scope === g.id ? ' selected' : ''}>${escapeHtml(g.label)}</option>`
    )).join('');

    // Linha 1: Módulo | De
    rows.push(`
      <div class="ms-grid-2">
        ${moduleSelectHtml}
        <div class="ms-field-inline">
          <span class="ms-field-label">De</span>
          <div class="ms-spinner-wrap">
            <select class="ms-select" id="ms-sel-from" aria-label="Livro inicial">
              ${buildBookOptionsHtml(opts.fromBook)}
            </select>
          </div>
        </div>
      </div>
    `);

    // Linha 2: Escopo | Até
    rows.push(`
      <div class="ms-grid-2">
        <div class="ms-spinner-wrap">
          <select class="ms-select" id="ms-sel-scope" aria-label="Intervalo de livros">
            ${scopeOptionsHtml}
          </select>
        </div>
        <div class="ms-field-inline">
          <span class="ms-field-label">Até</span>
          <div class="ms-spinner-wrap">
            <select class="ms-select" id="ms-sel-to" aria-label="Livro final">
              ${buildBookOptionsHtml(opts.toBook)}
            </select>
          </div>
        </div>
      </div>
    `);

    // Linha 3: Onde | Limitar
    rows.push(`
      <div class="ms-grid-2">
        <div class="ms-field-inline">
          <span class="ms-field-label">Onde</span>
          <div class="ms-spinner-wrap">
            <select class="ms-select" id="ms-sel-target" aria-label="Camada de pesquisa">
              ${targetOptionsHtml}
            </select>
          </div>
        </div>
        ${limitInputHtml}
      </div>
    `);
  } else {
    // Dicionário: sem escopo canônico nem De/Até — aproveita o espaço para Módulo | Limitar e Onde em largura total
    rows.push(`
      <div class="ms-grid-2">
        ${moduleSelectHtml}
        ${limitInputHtml}
      </div>
    `);

    rows.push(`
      <div class="ms-field-inline">
        <span class="ms-field-label">Onde</span>
        <div class="ms-spinner-wrap">
          <select class="ms-select" id="ms-sel-target" aria-label="Camada de pesquisa no dicionário">
            ${targetOptionsHtml}
          </select>
        </div>
      </div>
    `);
  }

  // Linha Tipo (comum a todos os recursos, com opções adaptadas)
  rows.push(`
    <div class="ms-field-inline">
      <span class="ms-field-label">Tipo</span>
      <div class="ms-spinner-wrap">
        <select class="ms-select" id="ms-sel-type" aria-label="Tipo de pesquisa">
          ${typeOptionsHtml}
        </select>
      </div>
    </div>
  `);

  // Linha exclusiva de Bíblia: Tipo de intervalo
  if (meta.supportsInterval) {
    const intervalOptionsHtml = Object.values(BIBLE_INTERVAL_TYPES).map((it) => (
      `<option value="${it.id}"${opts.intervalType === it.id ? ' selected' : ''}>${escapeHtml(it.label)}</option>`
    )).join('');

    rows.push(`
      <div class="ms-field-inline">
        <span class="ms-field-label">Tipo de intervalo</span>
        <div class="ms-spinner-wrap">
          <select class="ms-select" id="ms-sel-interval" aria-label="Tipo de intervalo">
            ${intervalOptionsHtml}
          </select>
        </div>
      </div>
    `);
  }

  // Linha exclusiva de Comentário: Tipo de bloco
  if (meta.supportsBlockFilter) {
    const blockOptionsHtml = Object.values(CMT_BLOCK_FILTERS).map((bf) => (
      `<option value="${bf.id}"${opts.blockFilter === bf.id ? ' selected' : ''}>${escapeHtml(bf.label)}</option>`
    )).join('');

    rows.push(`
      <div class="ms-field-inline">
        <span class="ms-field-label">Tipo de bloco</span>
        <div class="ms-spinner-wrap">
          <select class="ms-select" id="ms-sel-block" aria-label="Tipo de bloco de comentário">
            ${blockOptionsHtml}
          </select>
        </div>
      </div>
    `);
  }

  // Checkboxes adaptativos
  const showAltCheck = meta.supportsAltWords &&
    (opts.targetField === 'word_alt' || opts.targetField === 'word_body' || opts.targetField === 'raw');

  rows.push(`
    <div class="ms-checks-row">
      <label class="ms-check-label">
        <input type="checkbox" id="ms-chk-regex" ${opts.useRegex ? 'checked' : ''} />
        <span>Pesquisa padrão SQLite regexp</span>
      </label>
      <label class="ms-check-label">
        <input type="checkbox" id="ms-chk-accent" ${opts.accentSensitive ? 'checked' : ''} />
        <span>Acentos</span>
      </label>
      <label class="ms-check-label">
        <input type="checkbox" id="ms-chk-case" ${opts.caseSensitive ? 'checked' : ''} />
        <span>Aa</span>
      </label>
      ${showAltCheck ? `
        <label class="ms-check-label">
          <input type="checkbox" id="ms-chk-alt" ${opts.searchAltWords !== false ? 'checked' : ''} />
          <span>Sinônimos</span>
        </label>
      ` : ''}
    </div>
  `);

  rows.push(`<div class="ms-filter-tip">${escapeHtml(meta.tip)}</div>`);

  return rows.join('');
}
