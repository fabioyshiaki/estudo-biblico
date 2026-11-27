const BREF_STYLE_ID = 'global-bible-refs-styles';

const BREF_CSS = `
:root,
:root[data-theme="paper"] {
  --bref-fg: #1b6b3e;
  --bref-bg: rgba(27, 107, 62, 0.09);
  --bref-back-bg: #ffffff;
  --bref-back-border: #c9bfa9;
  --bref-pulse-bg: rgba(180, 120, 40, 0.22);
}

:root[data-theme="light"] {
  --bref-fg: #157347;
  --bref-bg: rgba(21, 115, 71, 0.09);
  --bref-back-bg: #ffffff;
  --bref-back-border: #cbd5e1;
  --bref-pulse-bg: rgba(29, 91, 184, 0.16);
}

:root[data-theme="sepia"] {
  --bref-fg: #1f6b3e;
  --bref-bg: rgba(31, 107, 62, 0.11);
  --bref-back-bg: #faf4e8;
  --bref-back-border: #c5b394;
  --bref-pulse-bg: rgba(153, 78, 12, 0.20);
}

:root[data-theme="dark"] {
  --bref-fg: #5cd48a;
  --bref-bg: rgba(92, 212, 138, 0.13);
  --bref-back-bg: #1b212c;
  --bref-back-border: #384357;
  --bref-pulse-bg: rgba(122, 184, 255, 0.22);
}

.bref-link {
  display: inline;
  padding: 0 4px;
  margin: 0 1px;
  border: 0;
  border-radius: 4px;
  background: var(--bref-bg);
  color: var(--bref-fg);
  font-family: inherit;
  font-size: 0.94em;
  font-weight: 600;
  line-height: inherit;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.12s ease;
}

.bref-link:active,
.bref-clickable:active,
.ucrt-ref[data-bible-ref]:active,
.v-ref-tag[data-bible-ref]:active {
  opacity: 0.62;
}

.bref-link--tag {
  font-family: var(--font-ui);
  font-size: 1em;
}

.bref-clickable,
.ucrt-ref[data-bible-ref],
.v-ref-tag[data-bible-ref] {
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.verse-item.is-jump-target {
  animation: brefPulse 1.6s ease-out;
}

@keyframes brefPulse {
  0% {
    background: var(--bref-pulse-bg);
  }
  100% {
    background: var(--accent-soft);
  }
}

.bref-back-fab {
  position: fixed;
  right: 16px;
  bottom: 68px;
  z-index: 55;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: calc(100vw - 32px);
  padding: 4px 6px 4px 4px;
  border-radius: 999px;
  background: var(--bref-back-bg);
  border: 1px solid var(--bref-back-border);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16);
  font-family: var(--font-ui);
}

.bref-back-fab.hidden {
  display: none;
}

.bref-back-main {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--accent);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
  touch-action: manipulation;
}

.bref-back-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
}
`;

// Máximo de capítulos por livro (1..66), com margem para numerações LXX/hebraica
const MAX_CHAPTERS = [
  0,
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24,
  22, 25, 29, 36, 10, 13, 16, 42, 151, 31,
  12, 8, 66, 52, 5, 48, 14, 14, 4, 9,
  1, 4, 7, 3, 3, 3, 2, 14, 4,
  28, 16, 24, 21, 28, 16, 16, 13, 6, 6,
  4, 4, 5, 3, 6, 4, 3, 1, 13, 5,
  5, 3, 5, 1, 1, 1, 22
];

const SINGLE_CHAPTER_BOOKS = new Set([31, 57, 63, 64, 65]);

const BOOK_ALIAS_MAP = {
  gn: 1, ge: 1, gen: 1, genesis: 1,
  ex: 2, exo: 2, exod: 2, exodo: 2, exodus: 2,
  lv: 3, lev: 3, levitico: 3, leviticus: 3,
  nm: 4, num: 4, numeros: 4, numbers: 4,
  dt: 5, deu: 5, deut: 5, deuteronomio: 5, deuteronomy: 5,
  js: 6, jos: 6, josh: 6, josue: 6, joshua: 6,
  jz: 7, jdg: 7, judg: 7, jue: 7, juizes: 7, jueces: 7, judges: 7,
  rt: 8, ru: 8, rth: 8, rut: 8, ruth: 8, rute: 8,
  '1sm': 9, '1sa': 9, '1sam': 9, '1samuel': 9,
  '2sm': 10, '2sa': 10, '2sam': 10, '2samuel': 10,
  '1rs': 11, '1re': 11, '1ki': 11, '1kgs': 11, '1reis': 11, '1reyes': 11, '1kings': 11,
  '2rs': 12, '2re': 12, '2ki': 12, '2kgs': 12, '2reis': 12, '2reyes': 12, '2kings': 12,
  '1cr': 13, '1ch': 13, '1chr': 13, '1cronicas': 13, '1chronicles': 13,
  '2cr': 14, '2ch': 14, '2chr': 14, '2cronicas': 14, '2chronicles': 14,
  ed: 15, esd: 15, ezr: 15, ezra: 15, esdras: 15,
  ne: 16, neh: 16, neemias: 16, nehemiah: 16,
  et: 17, est: 17, esth: 17, ester: 17, esther: 17,
  job: 18,
  sl: 19, sal: 19, ps: 19, psa: 19, salmo: 19, salmos: 19, psalm: 19, psalms: 19,
  pv: 20, pr: 20, pro: 20, prov: 20, proverbios: 20, proverbs: 20,
  ec: 21, ecl: 21, ecc: 21, eccl: 21, eclesiastes: 21, ecclesiastes: 21,
  ct: 22, cnt: 22, cant: 22, sng: 22, son: 22, song: 22, cantico: 22, canticos: 22, cantares: 22,
  canticodoscantares: 22, canticosdoscantares: 22, canticodoscantaresdesalomao: 22,
  canticosdoscantaresdesalomao: 22, cantaresdesalomao: 22, songofsolomon: 22, songofsongs: 22,
  is: 23, isa: 23, isaias: 23, isaiah: 23,
  jr: 24, jer: 24, jeremias: 24, jeremiah: 24,
  lm: 25, lam: 25, lamentacoes: 25, lamentaciones: 25, lamentations: 25,
  ez: 26, eze: 26, ezek: 26, ezequiel: 26, ezekiel: 26,
  dn: 27, dan: 27, daniel: 27,
  os: 28, ose: 28, ho: 28, hos: 28, oseias: 28, oseas: 28, hosea: 28,
  jl: 29, joe: 29, joel: 29,
  am: 30, amo: 30, amos: 30,
  ob: 31, oba: 31, obad: 31, abd: 31, obadias: 31, abdias: 31, obadiah: 31,
  jn: 32, jon: 32, jonas: 32, jonah: 32,
  mq: 33, miq: 33, mi: 33, mic: 33, miqueias: 33, miqueas: 33, micah: 33,
  na: 34, nah: 34, naum: 34, nahum: 34,
  hc: 35, hab: 35, habacuque: 35, habacuc: 35, habakkuk: 35,
  sf: 36, sof: 36, zep: 36, zeph: 36, sofonias: 36, zephaniah: 36,
  ag: 37, hag: 37, ageu: 37, hageo: 37, haggai: 37,
  zc: 38, zac: 38, zec: 38, zech: 38, zacarias: 38, zechariah: 38,
  ml: 39, mal: 39, malaquias: 39, malachi: 39,
  mt: 40, mat: 40, matt: 40, mateus: 40, mateo: 40, matthew: 40,
  mc: 41, mr: 41, mar: 41, mrk: 41, marcos: 41, mark: 41,
  lc: 42, lu: 42, luc: 42, luk: 42, lucas: 42, luke: 42,
  jo: 43, joh: 43, jhn: 43, joao: 43, juan: 43, john: 43,
  at: 44, ac: 44, act: 44, acts: 44, hch: 44, atos: 44, atosdosapostolos: 44, hechos: 44,
  rm: 45, ro: 45, rom: 45, romanos: 45, romans: 45,
  '1co': 46, '1cor': 46, '1corintios': 46, '1corinthians': 46,
  '2co': 47, '2cor': 47, '2corintios': 47, '2corinthians': 47,
  gl: 48, ga: 48, gal: 48, galatas: 48, galatians: 48,
  ef: 49, ep: 49, eph: 49, efesios: 49, ephesians: 49,
  fp: 50, fl: 50, fil: 50, ph: 50, php: 50, phil: 50, filipenses: 50, philippians: 50,
  cl: 51, col: 51, colossenses: 51, colosenses: 51, colossians: 51,
  '1ts': 52, '1tes': 52, '1th': 52, '1thess': 52, '1tessalonicenses': 52, '1tesalonicenses': 52, '1thessalonians': 52,
  '2ts': 53, '2tes': 53, '2th': 53, '2thess': 53, '2tessalonicenses': 53, '2tesalonicenses': 53, '2thessalonians': 53,
  '1tm': 54, '1ti': 54, '1tim': 54, '1timoteo': 54, '1timothy': 54,
  '2tm': 55, '2ti': 55, '2tim': 55, '2timoteo': 55, '2timothy': 55,
  tt: 56, tit: 56, tito: 56, titus: 56,
  fm: 57, flm: 57, phm: 57, phlm: 57, filemom: 57, filemon: 57, philemon: 57,
  hb: 58, heb: 58, hebreus: 58, hebreos: 58, hebrews: 58,
  tg: 59, tgo: 59, ja: 59, jas: 59, jam: 59, stg: 59, tiago: 59, santiago: 59, james: 59,
  '1pe': 60, '1pt': 60, '1pet': 60, '1pedro': 60, '1peter': 60,
  '2pe': 61, '2pt': 61, '2pet': 61, '2pedro': 61, '2peter': 61,
  '1jo': 62, '1jn': 62, '1joh': 62, '1joao': 62, '1juan': 62, '1john': 62,
  '2jo': 63, '2jn': 63, '2joh': 63, '2joao': 63, '2juan': 63, '2john': 63,
  '3jo': 64, '3jn': 64, '3joh': 64, '3joao': 64, '3juan': 64, '3john': 64,
  jd: 65, jud: 65, judas: 65, jude: 65,
  ap: 66, apoc: 66, re: 66, rev: 66, apocalipse: 66, apocalipsis: 66, revelation: 66
};

// Padrão para detecção segura de referências em texto corrido (exige inicial maiúscula para evitar falsos positivos)
const PLAIN_NUMBERED_BOOKS =
  '(?:(?:[123]\\s*[ºª°]?\\s*|III\\s+|II\\s+|I\\s+)' +
  '(?:Tessalonicenses|Tesalonicenses|Thessalonians|Cor[ií]ntios|Corinthians|Cr[oô]nicas|Cr[oó]nicas|Chronicles|' +
  'Tim[oó]teo|Timothy|Samuel|Pedro|Peter|Reis|Reyes|Kings|Jo[aã]o|Juan|John|' +
  'Thess|Tes|Cor|Chr|Sam|Kgs|Tim|Pet|Joh|Sm|Sa|Rs|Re|Ki|Cr|Ch|Co|Ts|Th|Tm|Ti|Pe|Pt|Jo|Jn))';

const PLAIN_SINGLE_BOOKS =
  '(?:C[aâ]nticos?\\s+dos\\s+Cantares(?:\\s+de\\s+Salom[aã]o)?|Cantares\\s+de\\s+Salom[aã]o|Song\\s+of\\s+(?:Solomon|Songs)|Atos\\s+dos\\s+Ap[oó]stolos|' +
  'Deuteron[oô]mio|Deuteronomy|Lamenta[cç][oõ]es|Lamentaciones|Lamentations|Eclesiast[eé]s|Ecclesiastes|' +
  'Apocalipse|Apocalipsis|Revelation|Colossenses|Colosenses|Colossians|Filipenses|Philippians|' +
  'Prov[eé]rbios|Proverbios|Proverbs|Lev[ií]tico|Leviticus|Ezequiel|Ezekiel|Jeremias|Jerem[ií]as|Jeremiah|' +
  'Habacuque|Habakkuk|Habacuc|Sofonias|Sofon[ií]as|Zephaniah|Zacarias|Zacar[ií]as|Zechariah|' +
  'Malaquias|Malaqu[ií]as|Malachi|Miqu[eé]ias|Miqueas|Micah|Cantares|C[aâ]nticos?|G[eê]nesis|Genesis|' +
  'N[uú]meros|Numbers|Neemias|Nehem[ií]as|Nehemiah|Obadias|Abd[ií]as|Obadiah|Ef[eé]sios|Ephesians|' +
  'G[aá]latas|Galatians|Romanos|Romans|Hebreus|Hebreos|Hebrews|Filemo[mn]|Filem[oó]n|Philemon|' +
  'Mateus|Mateo|Matthew|Marcos|Lucas|Salmos?|Psalms?|Isa[ií]as|Isaiah|Daniel|Os[eé]ias|Oseas|Hosea|' +
  'Esdras|Ju[ií]zes|Jueces|Judges|Josu[eé]|Joshua|[EÊ]xodo|Exodus|Ester|Esther|Jonas|Jon[aá]s|Jonah|' +
  'Tiago|Santiago|James|Judas|Hechos|Atos|Acts|Jo[aã]o|Juan|John|Rute|Ruth|Joel|Am[oó]s|Naum|Nah[uú]m|Ageu|Hageo|Haggai|Tito|Titus|Mark|Luke|Jude|Ezra|Job|' +
  'Deut|Exod|Josh|Judg|Esth|Prov|Eccl|Cant|Ezek|Obad|Zeph|Zech|Matt|Phil|Phlm|Apoc|' +
  'G[eê]n|Gen|Exo|Lev|N[uú]m|Num|Deu|Jos|Jdg|Jue|Rth|Rut|Esd|Ezr|Neh|Est|Sal|Psa|Pro|Ecl|Ecc|Cnt|Sng|Son|Isa|Jer|Lam|Eze|Dan|Ose|Hos|Joe|Amo|Oba|Abd|Jon|Miq|Mic|Nah|Hab|Sof|Zep|Hag|Zac|Zec|Mal|Mat|Mar|Mrk|Luc|Luk|Joh|Jhn|Act|Hch|Rom|G[aá]l|Gal|Eph|Fil|Php|Col|Tit|Flm|Phm|Heb|Tgo|Jas|Jam|Stg|Jud|Rev|' +
  'Gn|Ge|[EÊ]x|Lv|Nm|Dt|Js|Jz|Rt|Ru|Ed|Ne|Et|J[oó]|Sl|Ps|Pv|Pr|Ec|Ct|Is|Jr|Lm|Ez|Dn|Os|Ho|Jl|Am|Ob|Jn|Mq|Mi|Na|Hc|Sf|Ag|Zc|Ml|Mt|Mc|Mr|Lc|Lu|Jo|At|Ac|Rm|Ro|Gl|Ga|Ef|Ep|Fp|Fl|Ph|Cl|Tt|Fm|Hb|Tg|Ja|Jd|Ap|Re)';

const RE_PLAIN_BIBLE_REF = new RegExp(
  `(${PLAIN_NUMBERED_BOOKS}|${PLAIN_SINGLE_BOOKS})(?:\\.\\s*|\\s+)(\\d{1,3}(?:\\s*[:.]\\s*|,)\\d{1,3}(?:\\s*[-–—]\\s*\\d{1,3}(?:(?:\\s*[:.]\\s*|,)\\d{1,3})?)?(?:\\s*,\\s*\\d{1,3}(?:\\s*[-–—]\\s*\\d{1,3})?)*)`,
  'g'
);

const RE_CONT_CH_VS = /^\s*;\s*(\d{1,3}(?:\s*[:.]\s*|,)\d{1,3}(?:\s*[-–—]\s*\d{1,3}(?:(?:\s*[:.]\s*|,)\d{1,3})?)?(?:\s*,\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)*)/;

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'SUMMARY', 'SVG'
]);

const SKIP_SELECTOR = [
  '.chapter-header',
  '.section-heading',
  '.ucrt-ref',
  '.ucrt-chrono',
  '.ucrt-strong-wrap',
  '.ucrt-fs',
  '.ucrt-topic',
  '.ucrt-fl',
  '.ucrt-flag',
  '.ucrt-word',
  '.ucrt-box-info',
  '.v-ref-tag',
  '.v-strong',
  '.v-morph',
  '.v-fn-btn',
  '.il-vnum',
  '.il-multi-badge',
  '.bref-link',
  '.module-list',
  '.book-grid',
  '.chapter-grid',
  '.picker-search-wrap',
  '.settings-card',
  '.dct-toolbar',
  '.dct-entry-head',
  '.dct-result-head',
  '.topbar',
  '.bottom-nav',
  '.lookup-fab',
  '.bref-back-fab',
  '[data-bible-ref]',
  '[data-bref-skip]'
].join(',');

let isMutatingDom = false;
let initialized = false;
let backFabEl = null;

function ensureStyles() {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(BREF_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = BREF_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = BREF_CSS;
}

function normalizeAscii(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function resolveBookId(rawBook, chapter = 1, verse = 1) {
  const trimmed = String(rawBook || '').trim().replace(/\.$/, '');
  if (!trimmed) return 0;

  // Distingue "Jó" (18) de "Jo" / "João" (43)
  if (/^J[óÓ]$/.test(trimmed)) {
    return 18;
  }

  let norm = normalizeAscii(trimmed)
    .replace(/^iii\s+/, '3')
    .replace(/^ii\s+/, '2')
    .replace(/^i\s+/, '1')
    .replace(/[ºª°]/g, '')
    .replace(/\s+/g, '');

  // Mapeia siglas sem número usadas raramente em notas da UCRT (ex.: Rs 23, Cr 34)
  if (norm === 'rs') norm = '2rs';
  if (norm === 'cr') norm = '2cr';

  const id = BOOK_ALIAS_MAP[norm] || 0;
  if (!id) return 0;

  // Desambigua "Jn" em textos ingleses (Jonas só tem 4 caps. e máx. 17/10/10/11 versículos)
  if (norm === 'jn') {
    const jonahMaxV = [0, 17, 10, 10, 11];
    if (chapter > 4 || (jonahMaxV[chapter] && verse > jonahMaxV[chapter])) {
      return 43;
    }
  }

  return id;
}

function parseNumericRef(txt) {
  // Aceita 40.1.1, 40:1:1, 40_1_1, 40-1-1, 40.1, 40.1.0 ou "40 1 1"
  const sepMatch = /^(\d{1,2})\s*[.:_,-]\s*(\d{1,3})(?:\s*[.:_,-]\s*(\d{1,3}))?/.exec(txt);
  if (sepMatch) {
    const book = Number(sepMatch[1]);
    const chapter = Number(sepMatch[2]);
    const verse = Number(sepMatch[3]) || 1;
    if (book >= 1 && book <= 66 && chapter >= 1 && chapter <= (MAX_CHAPTERS[book] || 151) && verse <= 200) {
      return { book, chapter, verse };
    }
  }

  const spaceMatch = /^(\d{1,2})\s+(\d{1,3})\s+(\d{1,3})\b/.exec(txt);
  if (spaceMatch) {
    const book = Number(spaceMatch[1]);
    const chapter = Number(spaceMatch[2]);
    const verse = Number(spaceMatch[3]) || 1;
    if (book >= 1 && book <= 66 && chapter >= 1 && chapter <= (MAX_CHAPTERS[book] || 151) && verse <= 200) {
      return { book, chapter, verse };
    }
  }

  return null;
}

function parseTextualRef(txt, allowChapterOnly) {
  const textMatch =
    /^((?:[123]\s*[ºª°]?\s*|III\s+|II\s+|I\s+)?[A-Za-zÀ-ÿ]{2,22}(?:\s+(?:dos|de|of)\s+[A-Za-zÀ-ÿ]{2,15})*)(?:\.\s*|\s+)(\d{1,3})(?:(?:\s*[:.]\s*|,)(\d{1,3}))?/.exec(txt);
  if (!textMatch) return null;

  const rawBook = textMatch[1];
  let chapter = Number(textMatch[2]);
  const hasVerse = textMatch[3] !== undefined;
  let verse = hasVerse ? Number(textMatch[3]) : 1;

  if (!hasVerse && !allowChapterOnly) {
    return null;
  }

  const book = resolveBookId(rawBook, chapter, verse);
  if (!book) return null;

  // Em livros de capítulo único sem ":", o número representa o versículo (ex.: Jd 14 -> Jd 1:14)
  if (!hasVerse && SINGLE_CHAPTER_BOOKS.has(book) && chapter > 1) {
    verse = chapter;
    chapter = 1;
  }

  const maxChap = MAX_CHAPTERS[book] || 151;
  if (chapter < 1 || chapter > maxChap || verse < 1 || verse > 200) {
    return null;
  }

  return { book, chapter, verse };
}

export function parseBibleReference(rawRef, options = {}) {
  const allowChapterOnly = Boolean(options.allowChapterOnly);
  const allowNumeric = options.allowNumeric !== false;

  const base = String(rawRef || '')
    .trim()
    .replace(/^tw:\/\/bible[^?#]*[?#](?:[^#]*\bid=)?/i, '')
    .replace(/^bible:(?:\/\/)?/i, '')
    .replace(/^#/, '')
    .replace(/^(?:cf\.?|ver|veja(?:\s+em)?|comp\.?|v\.?)\s+/i, '')
    .replace(/^[+*%=#$><a-z.]*?(?=(?:[123]\s*[ºª°]?\s*|III\s+|II\s+|I\s+)?[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]|\d+\s*[.:_,-]\s*\d+)/, '')
    .trim();

  if (!base) return null;

  // 1. Tenta diretamente (numérico ou textual)
  if (allowNumeric) {
    const numHit = parseNumericRef(base);
    if (numHit) return numHit;
  }

  const textHit = parseTextualRef(base, allowChapterOnly);
  if (textHit) return textHit;

  // 2. Se começar com prefixo de protocolo MySword (b, v, rx), tenta o conteúdo seguinte
  const stripped = base.replace(/^(?:rx|b|v)[\s.:_-]*/i, '').trim();
  if (stripped && stripped !== base) {
    if (allowNumeric) {
      const numHit2 = parseNumericRef(stripped);
      if (numHit2) return numHit2;
    }
    const textHit2 = parseTextualRef(stripped, allowChapterOnly);
    if (textHit2) return textHit2;
  }

  return null;
}

function createRefButton(label, parsed, extraClass = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = extraClass ? `bref-link ${extraClass}` : 'bref-link';
  btn.setAttribute('data-bible-ref', `${parsed.book}.${parsed.chapter}.${parsed.verse}`);
  btn.setAttribute('data-bref-processed', '1');
  btn.textContent = label;
  return btn;
}

function buildLinkedFragmentFromText(text, extraClass = '') {
  if (!text || text.length < 4 || !/\d(?:\s*[:.]\s*|,)\d/.test(text)) {
    return null;
  }

  RE_PLAIN_BIBLE_REF.lastIndex = 0;
  let match;
  let lastIndex = 0;
  let foundAny = false;
  const frag = document.createDocumentFragment();

  while ((match = RE_PLAIN_BIBLE_REF.exec(text)) !== null) {
    const startIdx = match.index;
    const prevChar = startIdx > 0 ? text[startIdx - 1] : '';
    if (prevChar && /[\p{L}\p{N}]/u.test(prevChar)) {
      continue;
    }

    const fullLabel = match[0];
    const parsed = parseBibleReference(fullLabel, { allowChapterOnly: false, allowNumeric: false });
    if (!parsed) {
      continue;
    }

    foundAny = true;
    if (startIdx > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, startIdx)));
    }
    frag.appendChild(createRefButton(fullLabel, parsed, extraClass));

    let cursor = startIdx + fullLabel.length;

    // Captura continuações do mesmo livro separadas por ";" (ex.: Gn 21:3; 25:26; 29:35)
    while (cursor < text.length) {
      const slice = text.slice(cursor);
      const cont = RE_CONT_CH_VS.exec(slice);
      if (!cont) break;

      const contLabel = cont[1];
      const chVs = /^(\d{1,3})(?:\s*[:.]\s*|,)(\d{1,3})/.exec(contLabel);
      if (!chVs) break;

      const cCh = Number(chVs[1]);
      const cVs = Number(chVs[2]);
      if (cCh < 1 || cCh > (MAX_CHAPTERS[parsed.book] || 151) || cVs < 1 || cVs > 200) {
        break;
      }

      const sepEnd = cont[0].indexOf(contLabel);
      frag.appendChild(document.createTextNode(cont[0].slice(0, sepEnd)));
      frag.appendChild(
        createRefButton(contLabel, { book: parsed.book, chapter: cCh, verse: cVs }, extraClass)
      );
      cursor += cont[0].length;
    }

    lastIndex = cursor;
    RE_PLAIN_BIBLE_REF.lastIndex = cursor;
  }

  if (!foundAny) return null;

  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  return frag;
}

function shouldSkipElement(el) {
  if (!el || el.nodeType !== 1) return true;
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.matches && el.matches(SKIP_SELECTOR)) return true;
  return false;
}

function enhanceTaggedRefs(rootEl) {
  // 1. Cartões de referência da Bíblia UCRT (.ucrt-ref)
  rootEl.querySelectorAll('.ucrt-ref:not([data-bref-processed])').forEach((el) => {
    el.setAttribute('data-bref-processed', '1');
    const raw = el.getAttribute('data-ref') || el.textContent || '';
    const parsed = parseBibleReference(raw, { allowChapterOnly: true });
    if (!parsed) return;
    el.setAttribute('data-bible-ref', `${parsed.book}.${parsed.chapter}.${parsed.verse}`);
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.classList.add('bref-clickable');
  });

  // 2. Tags de referência (.v-ref-tag) — ex.: Bíblia Revelada Ômega, <VT>, <NT>, <OT>
  rootEl.querySelectorAll('.v-ref-tag:not([data-bref-processed])').forEach((el) => {
    el.setAttribute('data-bref-processed', '1');
    const rawText = (el.textContent || '').trim();
    const rawAttr = el.getAttribute('data-ref') || rawText;

    if (rawText.includes(';')) {
      const frag = buildLinkedFragmentFromText(rawText, 'bref-link--tag');
      if (frag) {
        el.removeAttribute('data-ref');
        el.textContent = '';
        el.appendChild(frag);
        return;
      }
    }

    const parsed = parseBibleReference(rawAttr, { allowChapterOnly: true });
    if (!parsed) return;
    el.setAttribute('data-bible-ref', `${parsed.book}.${parsed.chapter}.${parsed.verse}`);
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.classList.add('bref-clickable');
  });
}

function enhancePlainTextRefs(rootEl) {
  const walker = document.createTreeWalker(
    rootEl,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const val = node.nodeValue;
        if (!val || val.length < 4 || !/\d(?:\s*[:.]\s*|,)\d/.test(val)) {
          return NodeFilter.FILTER_REJECT;
        }
        let parent = node.parentElement;
        while (parent && parent !== rootEl) {
          if (shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
          parent = parent.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const nodes = [];
  let cur;
  while ((cur = walker.nextNode())) {
    nodes.push(cur);
  }

  for (const textNode of nodes) {
    const frag = buildLinkedFragmentFromText(textNode.nodeValue || '');
    if (frag && textNode.parentNode) {
      textNode.parentNode.replaceChild(frag, textNode);
    }
  }
}

export function enhanceBibleReferences(rootEl) {
  if (!rootEl || typeof document === 'undefined') return;
  if (isMutatingDom) return;

  isMutatingDom = true;
  try {
    enhanceTaggedRefs(rootEl);
    enhancePlainTextRefs(rootEl);
  } finally {
    isMutatingDom = false;
  }
}

export function updateBibleBackButton({ visible, label, onBack, onDismiss } = {}) {
  if (typeof document === 'undefined') return;
  ensureStyles();

  if (!backFabEl) {
    backFabEl = document.createElement('div');
    backFabEl.id = 'bref-back-fab';
    backFabEl.className = 'bref-back-fab hidden';
    backFabEl.innerHTML =
      '<button type="button" class="bref-back-main" id="bref-back-main"></button>' +
      '<button type="button" class="bref-back-close" id="bref-back-close" aria-label="Ocultar botão voltar">&times;</button>';
    document.body.appendChild(backFabEl);
  }

  const mainBtn = backFabEl.querySelector('#bref-back-main');
  const closeBtn = backFabEl.querySelector('#bref-back-close');

  if (!visible) {
    backFabEl.classList.add('hidden');
    return;
  }

  if (mainBtn) {
    mainBtn.textContent = label ? `← ${label}` : '← Voltar';
    mainBtn.onclick = () => {
      if (typeof onBack === 'function') onBack();
    };
  }
  if (closeBtn) {
    closeBtn.onclick = () => {
      backFabEl.classList.add('hidden');
      if (typeof onDismiss === 'function') onDismiss();
    };
  }

  backFabEl.classList.remove('hidden');
}

export function initGlobalBibleRefs({ onNavigate, onInvalidRef } = {}) {
  if (typeof document === 'undefined' || initialized) return;
  initialized = true;
  ensureStyles();

  // 1. Delegação global de cliques (fase de captura garante prioridade em qualquer módulo)
  document.addEventListener(
    'click',
    (ev) => {
      if (ev.target && ev.target.closest && ev.target.closest('.v-fn-btn, .bref-back-fab, .lookup-fab')) {
        return;
      }

      const sel = window.getSelection ? window.getSelection() : null;
      if (sel && !sel.isCollapsed && sel.toString().trim()) {
        return;
      }

      const refEl = ev.target && ev.target.closest
        ? ev.target.closest('[data-bible-ref], .ucrt-ref[data-ref], .v-ref-tag[data-ref]')
        : null;
      if (!refEl) return;

      const attrRaw = refEl.getAttribute('data-bible-ref')
        || refEl.getAttribute('data-ref')
        || '';
      const textRaw = (refEl.textContent || '').trim();

      const parsed =
        parseBibleReference(attrRaw, { allowChapterOnly: true }) ||
        parseBibleReference(textRaw, { allowChapterOnly: false, allowNumeric: false });

      if (!parsed) {
        if (typeof onInvalidRef === 'function') onInvalidRef(attrRaw || textRaw);
        return;
      }

      ev.preventDefault();
      ev.stopPropagation();

      if (typeof onNavigate === 'function') {
        onNavigate(parsed, {
          rawLabel: textRaw || attrRaw,
          sourceEl: refEl
        });
      }
    },
    true
  );

  // 2. Observa automaticamente o leitor principal e os modais (Bíblias, Dicionários, Notas e futuros módulos)
  const pendingRoots = new Set();
  let rafScheduled = false;

  const scheduleEnhance = (targetRoot) => {
    if (!targetRoot) return;
    pendingRoots.add(targetRoot);
    if (rafScheduled) return;
    rafScheduled = true;
    window.requestAnimationFrame(() => {
      rafScheduled = false;
      const list = Array.from(pendingRoots);
      pendingRoots.clear();
      for (const root of list) {
        enhanceBibleReferences(root);
      }
    });
  };

  const watchRoot = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    enhanceBibleReferences(el);
    const observer = new MutationObserver(() => {
      if (isMutatingDom) return;
      scheduleEnhance(el);
    });
    observer.observe(el, { childList: true, subtree: true });
  };

  watchRoot('reader-content');
  watchRoot('modal-root');
}
