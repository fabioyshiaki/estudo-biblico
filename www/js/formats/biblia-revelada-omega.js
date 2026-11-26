const BOOK_NAME_PATTERNS = {
  1: 'G[eê]nesis|Gn\\.?',
  2: '[EÊ]xodo|[EÊ]x\\.?',
  3: 'Lev[ií]tico|Lv\\.?',
  4: 'N[uú]meros|Nm\\.?',
  5: 'Deuteron[oô]mio|Dt\\.?',
  6: 'Josu[eé]|Js\\.?',
  7: 'Ju[ií]zes|Jz\\.?',
  8: 'Rute|Rt\\.?',
  9: '1[ºª°]?\\s*(?:Samuel|Sm\\.?)|I\\s+Samuel',
  10: '2[ºª°]?\\s*(?:Samuel|Sm\\.?)|II\\s+Samuel',
  11: '1[ºª°]?\\s*(?:Reis|Rs\\.?)|I\\s+Reis',
  12: '2[ºª°]?\\s*(?:Reis|Rs\\.?)|II\\s+Reis',
  13: '1[ºª°]?\\s*(?:Cr[oô]nicas|Cr\\.?)|I\\s+Cr[oô]nicas',
  14: '2[ºª°]?\\s*(?:Cr[oô]nicas|Cr\\.?)|II\\s+Cr[oô]nicas',
  15: 'Esdras|Ed\\.?',
  16: 'Neemias|Ne\\.?',
  17: 'Ester|Et\\.?',
  18: 'J[oó]',
  19: 'Salmos?|Sl\\.?',
  20: 'Prov[eé]rbios|Pv\\.?',
  21: 'Eclesiastes|Ec\\.?',
  22: 'C[aâ]nticos?(?:\\s+dos\\s+C[aâ]nticos)?|Cantares(?:\\s+de\\s+Salom[aã]o)?|Ct\\.?',
  23: 'Isa[ií]as|Is\\.?',
  24: 'Jeremias|Jr\\.?',
  25: 'Lamenta[cç][oõ]es(?:\\s+de\\s+Jeremias)?|Lm\\.?',
  26: 'Ezequiel|Ez\\.?',
  27: 'Daniel|Dn\\.?',
  28: 'Os[eé]ias|Os\\.?',
  29: 'Joel|Jl\\.?',
  30: 'Am[oó]s|Am\\.?',
  31: 'Obadias|Ob\\.?',
  32: 'Jonas|Jn\\.?',
  33: 'Miqu[eé]ias|Mq\\.?',
  34: 'Naum|Na\\.?',
  35: 'Habacuque|Hc\\.?',
  36: 'Sofonias|Sf\\.?',
  37: 'Ageu|Ag\\.?',
  38: 'Zacarias|Zc\\.?',
  39: 'Malaquias|Ml\\.?',
  40: '(?:S\\.?\\s*)?Mateus|Mt\\.?',
  41: '(?:S\\.?\\s*)?Marcos|Mc\\.?',
  42: '(?:S\\.?\\s*)?Lucas|Lc\\.?',
  43: '(?:S\\.?\\s*)?Jo[aã]o|Jo\\.?',
  44: 'Atos(?:\\s+dos\\s+Ap[oó]stolos)?|At\\.?',
  45: 'Romanos|Rm\\.?',
  46: '1[ºª°]?\\s*(?:Cor[ií]ntios|Co\\.?)|I\\s+Cor[ií]ntios',
  47: '2[ºª°]?\\s*(?:Cor[ií]ntios|Co\\.?)|II\\s+Cor[ií]ntios',
  48: 'G[aá]latas|Gl\\.?',
  49: 'Ef[eé]sios|Ef\\.?',
  50: 'Filipenses|Fp\\.?',
  51: 'Colossenses|Cl\\.?',
  52: '1[ºª°]?\\s*(?:Tessalonicenses|Ts\\.?)|I\\s+Tessalonicenses',
  53: '2[ºª°]?\\s*(?:Tessalonicenses|Ts\\.?)|II\\s+Tessalonicenses',
  54: '1[ºª°]?\\s*(?:Tim[oó]teo|Tm\\.?)|I\\s+Tim[oó]teo',
  55: '2[ºª°]?\\s*(?:Tim[oó]teo|Tm\\.?)|II\\s+Tim[oó]teo',
  56: 'Tito|Tt\\.?',
  57: 'Filemo[mn]|Fm\\.?',
  58: 'Hebreus|Hb\\.?',
  59: 'Tiago|Tg\\.?',
  60: '1[ºª°]?\\s*(?:Pedro|Pe\\.?)|I\\s+Pedro',
  61: '2[ºª°]?\\s*(?:Pedro|Pe\\.?)|II\\s+Pedro',
  62: '1[ºª°]?\\s*(?:Jo[aã]o|Jo\\.?)|I\\s+Jo[aã]o',
  63: '2[ºª°]?\\s*(?:Jo[aã]o|Jo\\.?)|II\\s+Jo[aã]o',
  64: '3[ºª°]?\\s*(?:Jo[aã]o|Jo\\.?)|III\\s+Jo[aã]o',
  65: 'Judas|Jd\\.?',
  66: 'Apocalipse|Ap\\.?'
};

const REF_BOOK_TOKENS = new Set([
  'gn', 'gen', 'genesis', 'ex', 'exo', 'exodo', 'lv', 'lev', 'levitico',
  'nm', 'num', 'numeros', 'dt', 'deut', 'deuteronomio', 'js', 'jos', 'josue',
  'jz', 'juizes', 'rt', 'rute', 'sm', 'sam', 'samuel', 'rs', 'reis',
  'cr', 'cron', 'cronicas', 'ed', 'esd', 'esdras', 'ne', 'neemias',
  'et', 'ester', 'jo', 'sl', 'sal', 'salmo', 'salmos', 'pv', 'prov', 'proverbios',
  'ec', 'ecl', 'eclesiastes', 'ct', 'cant', 'cantares', 'cantico', 'canticos',
  'is', 'isa', 'isaias', 'jr', 'jer', 'jeremias', 'lm', 'lam', 'lamentacoes',
  'ez', 'ezeq', 'ezequiel', 'dn', 'dan', 'daniel', 'os', 'oseias', 'jl', 'joel',
  'am', 'amos', 'ob', 'obadias', 'jn', 'jon', 'jonas', 'mq', 'miq', 'miqueias',
  'na', 'naum', 'hc', 'hab', 'habacuque', 'sf', 'sof', 'sofonias', 'ag', 'ageu',
  'zc', 'zac', 'zacarias', 'ml', 'mal', 'malaquias',
  'mt', 'mat', 'mateus', 'mc', 'mar', 'marcos', 'lc', 'luc', 'lucas',
  'joao', 'at', 'atos', 'rm', 'rom', 'romanos', 'co', 'cor', 'corintios',
  'gl', 'gal', 'galatas', 'ef', 'efesios', 'fp', 'fil', 'filipenses',
  'cl', 'col', 'colossenses', 'ts', 'tess', 'tessalonicenses',
  'tm', 'tim', 'timoteo', 'tt', 'tito', 'fm', 'flm', 'filemom', 'filemon',
  'hb', 'heb', 'hebreus', 'tg', 'tiago', 'pe', 'ped', 'pedro',
  'jd', 'jud', 'judas', 'ap', 'apoc', 'apocalipse',
  'cf', 'ver', 'comp', 'cap', 'v', 'vv', 'ss', 'seg', 'e', 'a', 'i', 'ii', 'iii'
]);

const REF_BOOK_START_PATTERN =
  '(?:(?:cf\\.?|ver|comp\\.?)\\s+)?' +
  '(?:[123]\\s*[ºª°]?\\s*)?' +
  '(?:Gn|Ex|Êx|Lv|Nm|Dt|Js|Jz|Rt|Sm|Rs|Cr|Ed|Ne|Et|J[oó]|Sl|Pv|Ec|Ct|Is|Jr|Lm|Ez|Dn|Os|Jl|Am|Ob|Jn|Mq|Na|Hc|Sf|Ag|Zc|Ml|Mt|Mc|Lc|At|Rm|Co|Gl|Ef|Fp|Cl|Ts|Tm|Tt|Fm|Hb|Tg|Pe|Jd|Ap|' +
  'G[eê]nesis|[EÊ]xodo|Lev[ií]tico|N[uú]meros|Deuteron[oô]mio|Josu[eé]|Ju[ií]zes|Rute|Samuel|Reis|Cr[oô]nicas|Esdras|Neemias|Ester|Salmos?|Prov[eé]rbios|Eclesiastes|Cantares|C[aâ]nticos?|Isa[ií]as|Jeremias|Lamenta[cç][oõ]es|Ezequiel|Daniel|Os[eé]ias|Joel|Am[oó]s|Obadias|Jonas|Miqu[eé]ias|Naum|Habacuque|Sofonias|Ageu|Zacarias|Malaquias|' +
  'Mateus|Marcos|Lucas|Jo[aã]o|Atos|Romanos|Cor[ií]ntios|G[aá]latas|Ef[eé]sios|Filipenses|Colossenses|Tessalonicenses|Tim[oó]teo|Tito|Filemo[mn]|Hebreus|Tiago|Pedro|Judas|Apocalipse)';

const RE_UNOPENED_TRAILING_REF = new RegExp(
  `([.;:!?—–\\u0001]\\s*|\\s+)(${REF_BOOK_START_PATTERN}\\.?\\s+\\d[^()]*?)\\s*\\)\\s*([.;,]?)\\s*$`,
  'i'
);

const RE_PAREN_QUOTE_NOTE =
  /\s*\(\s*["“”'‘’«]\s*([^()]+?)\s*(?:["“”'‘’»])?\s*\)(?=(.)?)/g;

function normalizeAscii(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isBibliaReveladaOmega(modulePath) {
  const norm = normalizeAscii(modulePath);
  return /revelada[\s_-]*(?:versao[\s_-]*)?omega/.test(norm);
}

function isBibleReferenceList(candidate) {
  const txt = String(candidate || '').trim();
  if (!txt || txt.length > 160) return false;
  if (!/\d+\s*[:.]\s*\d+/.test(txt)) return false;

  // Extrai todas as palavras (ignorando números e pontuação) e valida se são livros bíblicos/abreviações
  const words = normalizeAscii(txt).match(/[a-z]+/g);
  if (!words || !words.length) return false;

  let bookHits = 0;
  for (const w of words) {
    if (!REF_BOOK_TOKENS.has(w)) return false;
    if (w !== 'cf' && w !== 'ver' && w !== 'comp' && w !== 'e' && w !== 'a' && w !== 'v' && w !== 'vv' && w !== 'cap' && w !== 'ss' && w !== 'seg' && w !== 'i' && w !== 'ii' && w !== 'iii') {
      bookHits++;
    }
  }
  return bookHits > 0;
}

function formatRefText(rawRef) {
  return String(rawRef || '')
    .replace(/\s*;\s*/g, '; ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLeadingCommentary(text, bookId, chapter, verseNum, footnotes, footnoteLabels) {
  if (!chapter || !verseNum) return text;

  const bookPat = BOOK_NAME_PATTERNS[Number(bookId)];
  const patternStr = bookPat
    ? `(^|[^A-Za-zÀ-ÿ0-9])((?:${bookPat})\\s+${chapter}\\s*[:.]\\s*${verseNum})(?:\\s*[:\\-–—])?\\s*`
    : `(^|[^A-Za-zÀ-ÿ0-9])((?:[123]\\s*[ºª°]?\\s*)?[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]{1,22}\\s+${chapter}\\s*[:.]\\s*${verseNum})(?:\\s*[:\\-–—])?\\s*`;

  const re = new RegExp(patternStr, 'i');
  const m = re.exec(text);
  if (!m) return text;

  const matchStart = m.index + m[1].length;
  const matchEnd = m.index + m[0].length;
  const refLabel = m[2].replace(/\s+/g, ' ').trim();
  const before = text.slice(0, matchStart).trim();
  const after = text.slice(matchEnd).trim();

  if (!after) return text;

  if (!before) {
    return after;
  }

  const idx = footnotes.length;
  footnotes.push(before);
  footnoteLabels.push(refLabel);
  return `\u0002${idx}\u0002${after}`;
}

function extractParenQuoteNotes(text, footnotes, footnoteLabels) {
  RE_PAREN_QUOTE_NOTE.lastIndex = 0;
  return text.replace(RE_PAREN_QUOTE_NOTE, (full, innerRaw, nextChar) => {
    const clean = String(innerRaw || '')
      .replace(/^["“”'‘’«\s]+|["“”'‘’»\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return full;

    const idx = footnotes.length;
    footnotes.push(clean);
    footnoteLabels.push('*');

    // Se a próxima letra estava colada ao parêntese (ex.: (“pacífico ”)daquela), insere espaço
    const needsSpace = nextChar && /[A-Za-zÀ-ÿ0-9]/.test(nextChar);
    return `\u0001${idx}\u0001${needsSpace ? ' ' : ''}`;
  });
}

function extractTrailingReference(text) {
  // 1. Parêntese completo no final: (Mt 22:42), ( 1 Sm 17:12; 2 Sm 12:24).
  const fullParenMatch = /\s*\(\s*([^()]{3,160}?)\s*\)\s*([.;,]?)\s*$/.exec(text);
  if (fullParenMatch && isBibleReferenceList(fullParenMatch[1])) {
    const before = text.slice(0, fullParenMatch.index).trimEnd();
    const trailingPunct = fullParenMatch[2] || '';
    const keepPunct = trailingPunct && !/[.;:!?]$/.test(before) ? trailingPunct : '';
    return {
      text: `${before}${keepPunct}`.trim(),
      trailingRef: formatRefText(fullParenMatch[1])
    };
  }

  // 2. Sem "(" de abertura, mas fechado com ")" no final: ; 1Rs 15:24;2Rs 8:16).
  const unopenMatch = RE_UNOPENED_TRAILING_REF.exec(text);
  if (unopenMatch && isBibleReferenceList(unopenMatch[2])) {
    const sep = unopenMatch[1] || '';
    const beforeBase = text.slice(0, unopenMatch.index);
    const sepClean = sep.trimEnd();
    const before = `${beforeBase}${sepClean}`.trimEnd();
    const trailingPunct = unopenMatch[3] || '';
    const keepPunct = trailingPunct && !/[.;:!?]$/.test(before) ? trailingPunct : '';
    return {
      text: `${before}${keepPunct}`.trim(),
      trailingRef: formatRefText(unopenMatch[2])
    };
  }

  return { text, trailingRef: '' };
}

export function processBibliaReveladaOmega(rawText, options = {}, footnotes = [], footnoteLabels = []) {
  let text = String(rawText || '').trim();
  if (!text) return { text: '', trailingRef: '' };

  // Passo 1: comentário antes de "Livro Cap:Vers" vira link clicável com "Livro Cap:Vers"
  text = extractLeadingCommentary(
    text,
    options.bookId,
    options.chapter,
    options.verseNum,
    footnotes,
    footnoteLabels
  );

  // Passo 2: conteúdo entre parênteses e aspas vira link clicável "*"
  text = extractParenQuoteNotes(text, footnotes, footnoteLabels);

  // Passo 3: passagem bíblica no final (com ou sem "(") vira referência fora do texto
  return extractTrailingReference(text);
}
