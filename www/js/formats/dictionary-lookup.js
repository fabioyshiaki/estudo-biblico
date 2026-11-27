import {
  myswordDictionaryAdapter,
  normalizeLookupTerm,
  buildLookupCandidates
} from './mysword-dictionary.js';

const BOOK_ALIAS_MAP = {
  gn: 1, gen: 1, genesis: 1,
  ex: 2, exo: 2, exod: 2, exodo: 2,
  lv: 3, lev: 3, levitico: 3,
  nm: 4, num: 4, numeros: 4,
  dt: 5, deu: 5, deut: 5, deuteronomio: 5,
  js: 6, jos: 6, josh: 6, josue: 6,
  jz: 7, jdg: 7, judg: 7, juizes: 7,
  rt: 8, rth: 8, rut: 8, ruth: 8, rute: 8,
  '1sm': 9, '1sa': 9, '1sam': 9, '1samuel': 9,
  '2sm': 10, '2sa': 10, '2sam': 10, '2samuel': 10,
  '1rs': 11, '1ki': 11, '1kgs': 11, '1reis': 11,
  '2rs': 12, '2ki': 12, '2kgs': 12, '2reis': 12,
  '1cr': 13, '1ch': 13, '1chr': 13, '1cronicas': 13,
  '2cr': 14, '2ch': 14, '2chr': 14, '2cronicas': 14,
  ed: 15, ezr: 15, ezra: 15, esdras: 15,
  ne: 16, neh: 16, neemias: 16,
  et: 17, est: 17, esth: 17, ester: 17,
  jo_at: 18, job: 18,
  sl: 19, ps: 19, psa: 19, sal: 19, salmo: 19, salmos: 19,
  pv: 20, pr: 20, pro: 20, prov: 20, proverbios: 20,
  ec: 21, ecc: 21, eccl: 21, eclesiastes: 21,
  ct: 22, sng: 22, son: 22, cant: 22, cantares: 22, canticos: 22,
  is: 23, isa: 23, isaias: 23,
  jr: 24, jer: 24, jeremias: 24,
  lm: 25, lam: 25, lamentacoes: 25,
  ez: 26, eze: 26, ezek: 26, ezequiel: 26,
  dn: 27, dan: 27, daniel: 27,
  os: 28, hos: 28, oseias: 28,
  jl: 29, joe: 29, joel: 29,
  am: 30, amo: 30, amos: 30,
  ob: 31, oba: 31, obad: 31, obadias: 31,
  jn: 32, jon: 32, jonas: 32, jonah: 32,
  mq: 33, mic: 33, miqueias: 33,
  na: 34, nah: 34, naum: 34,
  hc: 35, hab: 35, habacuque: 35,
  sf: 36, zep: 36, zeph: 36, sofonias: 36,
  ag: 37, hag: 37, ageu: 37,
  zc: 38, zec: 38, zech: 38, zacarias: 38,
  ml: 39, mal: 39, malaquias: 39,
  mt: 40, mat: 40, matt: 40, mateus: 40,
  mc: 41, mr: 41, mar: 41, mrk: 41, mark: 41, marcos: 41,
  lc: 42, lu: 42, luk: 42, luke: 42, lucas: 42,
  jo: 43, joh: 43, jhn: 43, john: 43, joao: 43,
  at: 44, act: 44, acts: 44, atos: 44,
  rm: 45, ro: 45, rom: 45, romanos: 45,
  '1co': 46, '1cor': 46, '1corintios': 46,
  '2co': 47, '2cor': 47, '2corintios': 47,
  gl: 48, ga: 48, gal: 48, galatas: 48,
  ef: 49, eph: 49, efesios: 49,
  fp: 50, php: 50, phil: 50, fil: 50, filipenses: 50,
  cl: 51, col: 51, colossenses: 51,
  '1ts': 52, '1th': 52, '1thess': 52, '1tessalonicenses': 52,
  '2ts': 53, '2th': 53, '2thess': 53, '2tessalonicenses': 53,
  '1tm': 54, '1ti': 54, '1tim': 54, '1timoteo': 54,
  '2tm': 55, '2ti': 55, '2tim': 55, '2timoteo': 55,
  tt: 56, tit: 56, titus: 56, tito: 56,
  fm: 57, phm: 57, phlm: 57, flm: 57, filemom: 57, filemon: 57,
  hb: 58, heb: 58, hebreus: 58,
  tg: 59, jas: 59, jam: 59, tiago: 59,
  '1pe': 60, '1pt': 60, '1pet': 60, '1pedro': 60,
  '2pe': 61, '2pt': 61, '2pet': 61, '2pedro': 61,
  '1jo': 62, '1jn': 62, '1joh': 62, '1joao': 62,
  '2jo': 63, '2jn': 63, '2joh': 63, '2joao': 63,
  '3jo': 64, '3jn': 64, '3joh': 64, '3joao': 64,
  jd: 65, jud: 65, jude: 65, judas: 65,
  ap: 66, rev: 66, apoc: 66, apocalipse: 66
};

function normalizeAscii(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function detectLookupKind(rawTerm) {
  const clean = normalizeLookupTerm(rawTerm);
  if (!clean) return 'term';
  if (/^[GH]\s*0*\d+[a-z]?$/i.test(clean)) return 'strong';
  if (/^(?:[A-Z]{1,4}-[A-Z0-9-]+|CONJ|PREP|ADV|PRT|INTJ|HEB|ARAM)$/.test(clean)) return 'morph';
  if (/^\d{1,2}\.\d{1,3}$/.test(clean)) return 'louwnida';
  return 'term';
}

export function scoreDictionaryForQuery(mod, rawTerm, options = {}) {
  const hay = normalizeAscii(
    `${mod.abbr || ''} ${mod.title || ''} ${mod.fileName || ''} ${mod.description || ''}`
  );
  const clean = normalizeLookupTerm(rawTerm);
  const kind = detectLookupKind(clean);
  const hint = normalizeAscii(options.moduleHint || '').trim();

  let score = 0;

  if (hint && hay.includes(hint)) {
    score += 120;
  }

  if (options.activePath && mod.path === options.activePath) {
    score += 25;
  }

  if (mod.isFavorite) {
    score += 12;
  }

  if (kind === 'strong') {
    const isHebrew = /^H/i.test(clean);
    const isGreek = /^G/i.test(clean);
    if (/\bstrong\b|strongs/.test(hay)) score += 60;
    if (/\blexic|\bdic|\bbdb\b|\bthayer\b|\bvine\b|\babbott\b|\bgk\b/.test(hay)) score += 28;
    if (isHebrew && /hebr|bdb|gesenius|twot|\bat\b|antigo/.test(hay)) score += 30;
    if (isGreek && /greg|greek|thayer|mounce|bdag|\bnt\b|novo/.test(hay)) score += 30;
  } else if (kind === 'morph') {
    if (/morph|morf|robinson|rmac|pars|gram/.test(hay)) score += 80;
  } else if (kind === 'louwnida') {
    if (/louw|nida|domain|dominio/.test(hay)) score += 85;
  } else {
    // Palavra comum: prioriza dicionários bíblicos gerais/português acima de tabelas de morfologia pura
    if (/morph|morf|robinson|rmac/.test(hay)) score -= 25;
    if (/port|pt|br|biblic|enciclop|teolog|champlin|vine|wycliffe|dicion/.test(hay)) score += 18;
  }

  return score;
}

export function rankDictionariesForQuery(dictionaries, rawTerm, options = {}) {
  const list = Array.isArray(dictionaries) ? dictionaries.slice() : [];
  return list
    .map((mod) => ({
      mod,
      score: scoreDictionaryForQuery(mod, rawTerm, options)
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.mod.abbr || a.mod.title || '').localeCompare(
        String(b.mod.abbr || b.mod.title || ''),
        'pt-BR'
      );
    })
    .map((item) => item.mod);
}

export function parseBibleReference(rawRef) {
  const txt = String(rawRef || '').trim().replace(/^b\s*/i, '');
  if (!txt) return null;

  // Formato numérico MySword: 40.1.1 ou 40.1.1-5 ou 40:1:1
  const numMatch = /^(\d{1,2})\s*[.:]\s*(\d{1,3})(?:\s*[.:]\s*(\d{1,3}))?/.exec(txt);
  if (numMatch) {
    const book = Number(numMatch[1]);
    const chapter = Number(numMatch[2]);
    const verse = Number(numMatch[3]) || 1;
    if (book >= 1 && book <= 66 && chapter >= 1) {
      return { book, chapter, verse };
    }
  }

  // Formato textual: Mt 1:1, 1Sm 17:12, Jó 38:4, 1 Jo 3:16
  const textMatch = /^([123]?\s*[A-Za-zÀ-ÿ]{2,20})\.?\s+(\d{1,3})(?:\s*[:.]\s*(\d{1,3}))?/.exec(txt);
  if (!textMatch) return null;

  const rawBook = textMatch[1].trim();
  const chapter = Number(textMatch[2]);
  const verse = Number(textMatch[3]) || 1;
  if (!Number.isFinite(chapter) || chapter < 1) return null;

  // Distingue "Jó" (18) de "Jo" / "João" (43)
  if (/^J[óÓ]$/.test(rawBook)) {
    return { book: 18, chapter, verse };
  }

  const key = normalizeAscii(rawBook).replace(/\s+/g, '');
  const book = BOOK_ALIAS_MAP[key];
  if (!book) return null;

  return { book, chapter, verse };
}

async function runWithConcurrency(items, concurrency, workerFn, signal) {
  const limit = Math.max(1, Math.min(Number(concurrency) || 4, items.length || 1));
  let cursor = 0;

  async function next() {
    while (cursor < items.length) {
      if (signal && signal.aborted) return;
      const idx = cursor++;
      await workerFn(items[idx], idx);
    }
  }

  const workers = [];
  for (let i = 0; i < limit; i++) {
    workers.push(next());
  }
  await Promise.all(workers);
}

export async function lookupExactAcrossDictionaries(dictionaries, rawTerm, options = {}) {
  const candidates = buildLookupCandidates(rawTerm);
  if (!candidates.length) return null;

  const ranked = rankDictionariesForQuery(dictionaries, rawTerm, options);
  const signal = options.signal || null;

  for (const mod of ranked) {
    if (signal && signal.aborted) return null;
    try {
      const entry = await myswordDictionaryAdapter.getEntry(mod.path, rawTerm);
      if (entry) {
        return { module: mod, entry };
      }
    } catch (err) {
      // Ignora módulos com esquema incompatível e continua a varredura
    }
  }
  return null;
}

export async function searchAcrossDictionaries(dictionaries, rawQuery, options = {}) {
  const clean = normalizeLookupTerm(rawQuery);
  if (!clean) return [];

  const ranked = rankDictionariesForQuery(dictionaries, clean, options);
  const perDictLimit = Math.max(1, Math.min(Number(options.perDictLimit) || 3, 12));
  const maxTotal = Math.max(10, Math.min(Number(options.maxTotal) || 60, 150));
  const searchBody = Boolean(options.searchBody);
  const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 4, 6));
  const signal = options.signal || null;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  const collected = [];
  let scanned = 0;

  await runWithConcurrency(
    ranked,
    concurrency,
    async (mod, rankIdx) => {
      if (signal && signal.aborted) return;
      if (collected.length >= maxTotal && !options.scanAllEvenFull) return;

      try {
        const hits = await myswordDictionaryAdapter.searchEntries(mod.path, clean, {
          limit: perDictLimit,
          searchBody
        });
        for (const hit of hits) {
          collected.push({
            module: mod,
            rankIdx,
            word: hit.word,
            matchType: hit.matchType,
            snippet: hit.snippet
          });
        }
      } catch (err) {
        // Ignora módulo que falhou para não interromper os demais
      } finally {
        scanned++;
        if (onProgress && (!signal || !signal.aborted)) {
          onProgress(scanned, ranked.length, collected.length);
        }
      }
    },
    signal
  );

  if (signal && signal.aborted) return [];

  const matchPriority = { exact: 0, prefix: 1, title: 2, body: 3 };
  collected.sort((a, b) => {
    const pa = matchPriority[a.matchType] ?? 9;
    const pb = matchPriority[b.matchType] ?? 9;
    if (pa !== pb) return pa - pb;
    if (a.rankIdx !== b.rankIdx) return a.rankIdx - b.rankIdx;
    return a.word.localeCompare(b.word, 'pt-BR');
  });

  return collected.slice(0, maxTotal);
}
