// Catálogo geográfico bíblico para detectar localizações em versículos
// e correlacionar com atlas em português e inglês (com ou sem tabela mapverse)

const PLACE_CATALOG = [
  // Cidades e lugares centrais do AT e NT
  { name: 'Jerusalém', aliases: ['Jerusalém', 'Jerusalem', 'Salém', 'Jebus'], queries: ['Jerusalém', 'Jerusalem', 'Palestine'], region: 'jerusalem' },
  { name: 'Belém', aliases: ['Belém', 'Belém-Efrata', 'Efrata'], queries: ['Jerusalém', 'Jerusalem', 'Judean', 'Ministério', 'Life of Christ', 'Palestine'], region: 'judea' },
  { name: 'Nazaré', aliases: ['Nazaré'], queries: ['Galilean', 'Ministério', 'Life of Christ', 'Nazareth', 'Palestine'], region: 'galilee' },
  { name: 'Cafarnaum', aliases: ['Cafarnaum'], queries: ['Galilean', 'Ministério', 'Life of Christ', 'Palestine'], region: 'galilee' },
  { name: 'Betsaida', aliases: ['Betsaida'], queries: ['Galilean', 'Ministério', 'Life of Christ', 'Palestine'], region: 'galilee' },
  { name: 'Caná', aliases: ['Caná'], queries: ['Galilean', 'Ministério', 'Life of Christ', 'Palestine'], region: 'galilee' },
  { name: 'Corazim', aliases: ['Corazim'], queries: ['Galilean', 'Ministério', 'Life of Christ'], region: 'galilee' },
  { name: 'Magdala', aliases: ['Magdala', 'Dalmanuta'], queries: ['Galilean', 'Ministério', 'Life of Christ'], region: 'galilee' },
  { name: 'Naim', aliases: ['Naim'], queries: ['Galilean', 'Ministério', 'Life of Christ'], region: 'galilee' },
  { name: 'Tiberíades', aliases: ['Tiberíades'], queries: ['Galilean', 'Ministério', 'Life of Christ', 'Palestine'], region: 'galilee' },
  { name: 'Gadara', aliases: ['Gadara', 'Gerasa', 'Gerasenos', 'Gadarenos'], queries: ['Galilean', 'Ministério', 'Life of Christ', 'Palestine'], region: 'galilee' },
  { name: 'Betânia', aliases: ['Betânia'], queries: ['Jerusalém', 'Jerusalem', 'Passion', 'Perean', 'Ministério'], region: 'judea' },
  { name: 'Emaús', aliases: ['Emaús'], queries: ['Jerusalém', 'Jerusalem', 'Passion', 'Ministério'], region: 'judea' },
  { name: 'Getsêmani', aliases: ['Getsêmani'], queries: ['Jerusalém', 'Jerusalem', 'Passion'], region: 'jerusalem' },
  { name: 'Gólgota', aliases: ['Gólgota', 'Calvário'], queries: ['Jerusalém', 'Jerusalem', 'Passion'], region: 'jerusalem' },
  { name: 'Siloé', aliases: ['Siloé'], queries: ['Jerusalém', 'Jerusalem'], region: 'jerusalem' },
  { name: 'Jericó', aliases: ['Jericó'], queries: ['Canaã', 'Canaan', 'Tribos', 'Tribes', 'Palestine', 'Judges'], region: 'judea' },
  { name: 'Hebrom', aliases: ['Hebrom', 'Quiriate-Arba', 'Manre'], queries: ['Patriarcas', 'Patriarchs', 'Canaan', 'Tribos', 'Davi', 'David'], region: 'judea' },
  { name: 'Betel', aliases: ['Betel', 'Bet-El'], queries: ['Patriarcas', 'Patriarchs', 'Canaan', 'Tribos', 'Tribes', 'Palestine'], region: 'central' },
  { name: 'Siquém', aliases: ['Siquém', 'Sicar'], queries: ['Patriarcas', 'Patriarchs', 'Canaan', 'Tribos', 'Tribes', 'Palestine'], region: 'samaria' },
  { name: 'Berseba', aliases: ['Berseba', 'Bersebá'], queries: ['Patriarcas', 'Patriarchs', 'Canaan', 'Tribos', 'Palestine'], region: 'negev' },
  { name: 'Siló', aliases: ['Siló'], queries: ['Tribos', 'Tribes', 'Judges', 'Saul', 'Palestine'], region: 'central' },
  { name: 'Gilgal', aliases: ['Gilgal'], queries: ['Tribos', 'Tribes', 'Judges', 'Saul', 'Canaã'], region: 'central' },
  { name: 'Gibeom', aliases: ['Gibeom', 'Gibeá'], queries: ['Tribos', 'Tribes', 'Saul', 'Judges'], region: 'central' },
  { name: 'Ramá', aliases: ['Ramá', 'Arimateia'], queries: ['Saul', 'Tribos', 'Tribes', 'Palestine'], region: 'central' },
  { name: 'Mispá', aliases: ['Mispá', 'Mizpá'], queries: ['Saul', 'Judges', 'Tribos', 'Tribes'], region: 'central' },
  { name: 'Megido', aliases: ['Megido', 'Armagedom'], queries: ['Tribos', 'Tribes', 'Palestine', 'Profetas', 'Solomon'], region: 'north' },
  { name: 'Jezreel', aliases: ['Jezreel', 'Jizreel'], queries: ['Profetas', 'Tribos', 'Palestine', 'Judges'], region: 'north' },
  { name: 'Dã', aliases: ['Dã'], caseSensitive: true, queries: ['Tribos', 'Tribes', 'Davi', 'David', 'Palestine'], region: 'north' },
  { name: 'Hazor', aliases: ['Hazor'], queries: ['Tribos', 'Tribes', 'Canaan', 'Judges'], region: 'north' },
  { name: 'Laquis', aliases: ['Laquis'], queries: ['Assírio', 'Assyrian', 'Profetas', 'Tribos', 'Palestine'], region: 'judea' },
  { name: 'En-Gedi', aliases: ['En-Gedi', 'Engedi'], queries: ['Saul', 'Davi', 'David', 'Palestine'], region: 'judea' },
  { name: 'Gaza', aliases: ['Gaza'], queries: ['Tribos', 'Tribes', 'Judges', 'Apóstolos', 'Apostles', 'Palestine'], region: 'philistia' },
  { name: 'Asdode', aliases: ['Asdode', 'Azoto'], queries: ['Tribos', 'Judges', 'Apóstolos', 'Apostles', 'Palestine'], region: 'philistia' },
  { name: 'Ascalom', aliases: ['Ascalom', 'Asquelom'], queries: ['Tribos', 'Judges', 'Palestine'], region: 'philistia' },
  { name: 'Ecrom', aliases: ['Ecrom'], queries: ['Tribos', 'Judges', 'Saul', 'Palestine'], region: 'philistia' },
  { name: 'Gate', aliases: ['Gate'], caseSensitive: true, queries: ['Davi', 'David', 'Saul', 'Judges'], region: 'philistia' },
  { name: 'Jope', aliases: ['Jope'], queries: ['Apóstolos', 'Apostles', 'Apostolic', 'Palestine', 'Profetas'], region: 'coast' },
  { name: 'Lida', aliases: ['Lida'], caseSensitive: true, queries: ['Apóstolos', 'Apostles', 'Apostolic', 'Palestine'], region: 'coast' },
  { name: 'Cesareia', aliases: ['Cesareia', 'Cesaréia', 'Cesareia de Filipe'], queries: ['Apóstolos', 'Apostles', 'Apostolic', 'Herod', 'Paulo', 'Paul', 'Palestine'], region: 'coast' },
  { name: 'Tiro', aliases: ['Tiro'], caseSensitive: true, queries: ['Phoenicia', 'Davi', 'Solomon', 'Profetas', 'Paulo', 'Palestine'], region: 'phoenicia' },
  { name: 'Sidom', aliases: ['Sidom', 'Sídon'], queries: ['Phoenicia', 'Davi', 'Solomon', 'Profetas', 'Paulo', 'Palestine'], region: 'phoenicia' },
  { name: 'Damasco', aliases: ['Damasco'], queries: ['Davi', 'Solomon', 'Profetas', 'Apóstolos', 'Apostles', 'Paulo', 'Paul', 'Palestine'], region: 'syria' },
  { name: 'Samaria', aliases: ['Samaria'], queries: ['Profetas', 'Assyrian', 'Palestine', 'Ministério', 'Apóstolos'], region: 'samaria' },
  { name: 'Sodoma', aliases: ['Sodoma', 'Gomorra'], queries: ['Patriarcas', 'Patriarchs', 'Canaan', 'Moses'], region: 'deadsea' },

  // Patriarcas, Êxodo e Deserto
  { name: 'Ur', aliases: ['Ur'], caseSensitive: true, queries: ['Patriarcas', 'Patriarchs', 'Empires', 'Babylonian', 'Ancient World'], region: 'mesopotamia' },
  { name: 'Harã', aliases: ['Harã'], queries: ['Patriarcas', 'Patriarchs', 'Canaan', 'Empires'], region: 'mesopotamia' },
  { name: 'Canaã', aliases: ['Canaã'], queries: ['Canaã', 'Canaan', 'Patriarcas', 'Patriarchs', 'Êxodo', 'Sojourn'], region: 'canaan' },
  { name: 'Egito', aliases: ['Egito'], queries: ['Êxodo', 'Journeyings', 'Sojourn', 'Patriarcas', 'Empires', 'Moses'], region: 'egypt' },
  { name: 'Gósen', aliases: ['Gósen', 'Gósem'], queries: ['Êxodo', 'Journeyings', 'Sojourn', 'Moses'], region: 'egypt' },
  { name: 'Mênfis', aliases: ['Mênfis', 'Nofe'], queries: ['Êxodo', 'Sojourn', 'Empires', 'Assyrian', 'Babylonian'], region: 'egypt' },
  { name: 'Sinai', aliases: ['Sinai', 'Horebe'], queries: ['Êxodo', 'Journeyings', 'Sojourn', 'Moses'], region: 'sinai' },
  { name: 'Cades-Barneia', aliases: ['Cades-Barneia', 'Cades'], queries: ['Êxodo', 'Journeyings', 'Sojourn', 'Moses'], region: 'sinai' },
  { name: 'Midiã', aliases: ['Midiã'], queries: ['Êxodo', 'Journeyings', 'Sojourn', 'Moses'], region: 'sinai' },
  { name: 'Edom', aliases: ['Edom', 'Seir', 'Bozra'], queries: ['Êxodo', 'Journeyings', 'Davi', 'Solomon', 'Palestine'], region: 'transjordan' },
  { name: 'Moabe', aliases: ['Moabe'], queries: ['Êxodo', 'Journeyings', 'Tribos', 'Davi', 'Palestine'], region: 'transjordan' },
  { name: 'Amom', aliases: ['Amom', 'Rabá'], queries: ['Tribos', 'Davi', 'Solomon', 'Palestine'], region: 'transjordan' },
  { name: 'Gileade', aliases: ['Gileade'], queries: ['Tribos', 'Tribes', 'Judges', 'Davi', 'Palestine'], region: 'transjordan' },
  { name: 'Basã', aliases: ['Basã'], queries: ['Tribos', 'Tribes', 'Palestine', 'Solomon'], region: 'transjordan' },

  // Impérios e Regiões do Antigo Oriente
  { name: 'Babilônia', aliases: ['Babilônia', 'Babel', 'Caldeia', 'Sinar'], queries: ['Babilônico', 'Babylonian', 'Assírio', 'Empires', 'Ancient World'], region: 'babylon' },
  { name: 'Nínive', aliases: ['Nínive'], queries: ['Assírio', 'Assyrian', 'Babylonian', 'Empires', 'Profetas'], region: 'assyria' },
  { name: 'Assíria', aliases: ['Assíria'], queries: ['Assírio', 'Assyrian', 'Empires', 'Profetas'], region: 'assyria' },
  { name: 'Pérsia', aliases: ['Pérsia', 'Susã', 'Média', 'Elão'], queries: ['Persian', 'Medo-Persian', 'Babylonian', 'Empires'], region: 'persia' },
  { name: 'Carquemis', aliases: ['Carquemis'], queries: ['Assírio', 'Assyrian', 'Babylonian', 'Empires'], region: 'mesopotamia' },
  { name: 'Ararate', aliases: ['Ararate'], queries: ['Noah', 'Ancient World', 'Patriarcas', 'Empires'], region: 'ancient' },
  { name: 'Mesopotâmia', aliases: ['Mesopotâmia', 'Padã-Arã'], queries: ['Patriarcas', 'Patriarchs', 'Empires', 'Babylonian'], region: 'mesopotamia' },
  { name: 'Síria', aliases: ['Síria', 'Arã'], queries: ['Profetas', 'Davi', 'Solomon', 'Palestine', 'Paulo', 'Paul'], region: 'syria' },
  { name: 'Fenícia', aliases: ['Fenícia'], queries: ['Phoenicia', 'Palestine', 'Apóstolos', 'Paulo'], region: 'phoenicia' },
  { name: 'Arábia', aliases: ['Arábia', 'Sabá'], queries: ['Ancient World', 'Empires', 'Solomon', 'Paulo'], region: 'arabia' },
  { name: 'Etiópia', aliases: ['Etiópia', 'Cuxe'], queries: ['Ancient World', 'Noah', 'Empires', 'Roman'], region: 'africa' },
  { name: 'Líbia', aliases: ['Líbia', 'Cirene'], queries: ['Roman', 'Romano', 'Mediterranean', 'Ancient World'], region: 'africa' },
  { name: 'Társis', aliases: ['Társis'], queries: ['Ancient World', 'Noah', 'Empires', 'Mediterranean'], region: 'mediterranean' },

  // Regiões da Palestina no NT
  { name: 'Galileia', aliases: ['Galileia', 'Galiléia'], queries: ['Galilean', 'Ministério', 'Life of Christ', 'Palestine', 'Herod'], region: 'galilee' },
  { name: 'Judeia', aliases: ['Judeia', 'Judéia'], queries: ['Judean', 'Ministério', 'Life of Christ', 'Palestine', 'Herod'], region: 'judea' },
  { name: 'Pereia', aliases: ['Pereia', 'Peréia'], queries: ['Perean', 'Ministério', 'Life of Christ', 'Palestine', 'Herod'], region: 'transjordan' },
  { name: 'Decápolis', aliases: ['Decápolis'], queries: ['Ministério', 'Life of Christ', 'Herod', 'Palestine'], region: 'galilee' },
  { name: 'Idumeia', aliases: ['Idumeia', 'Iduméia'], queries: ['Herod', 'Palestine', 'Ministério'], region: 'negev' },

  // Viagens de Paulo, Atos e Apocalipse
  { name: 'Antioquia', aliases: ['Antioquia'], queries: ['Paulo', 'Paul', 'Apóstolos', 'Apostles', 'Apostolic', 'Mediterranean'], region: 'paul' },
  { name: 'Tarso', aliases: ['Tarso'], queries: ['Paulo', 'Paul', 'Apóstolos', 'Apostles', 'Apostolic'], region: 'paul' },
  { name: 'Chipre', aliases: ['Chipre', 'Salamina', 'Pafos'], queries: ['First Missionary', 'Paulo', 'Paul', 'Apóstolos', 'Mediterranean'], region: 'paul' },
  { name: 'Perge', aliases: ['Perge', 'Panfília', 'Atália'], queries: ['First Missionary', 'Paulo', 'Paul'], region: 'paul' },
  { name: 'Icônio', aliases: ['Icônio'], queries: ['First Missionary', 'Second Missionary', 'Paulo', 'Paul'], region: 'paul' },
  { name: 'Listra', aliases: ['Listra', 'Derbe', 'Licaônia'], queries: ['First Missionary', 'Second Missionary', 'Paulo', 'Paul'], region: 'paul' },
  { name: 'Galácia', aliases: ['Galácia', 'Frígia'], queries: ['Second Missionary', 'Third Missionary', 'Paulo', 'Paul', 'Roman'], region: 'paul' },
  { name: 'Trôade', aliases: ['Trôade', 'Mísia'], queries: ['Second Missionary', 'Third Missionary', 'Paulo', 'Paul'], region: 'paul' },
  { name: 'Macedônia', aliases: ['Macedônia', 'Neápolis'], queries: ['Second Missionary', 'Third Missionary', 'Paulo', 'Paul', 'Alexander'], region: 'greece' },
  { name: 'Filipos', aliases: ['Filipos'], queries: ['Second Missionary', 'Third Missionary', 'Paulo', 'Paul'], region: 'greece' },
  { name: 'Tessalônica', aliases: ['Tessalônica', 'Bereia', 'Beréia'], queries: ['Second Missionary', 'Paulo', 'Paul'], region: 'greece' },
  { name: 'Atenas', aliases: ['Atenas', 'Grécia', 'Acaia'], queries: ['Second Missionary', 'Greece', 'Paulo', 'Paul', 'Roman'], region: 'greece' },
  { name: 'Corinto', aliases: ['Corinto', 'Cencreia'], queries: ['Second Missionary', 'Third Missionary', 'Paulo', 'Paul', 'Greece'], region: 'greece' },
  { name: 'Éfeso', aliases: ['Éfeso'], queries: ['Seven Churches', 'Third Missionary', 'Paulo', 'Paul', 'Greece'], region: 'asia' },
  { name: 'Esmirna', aliases: ['Esmirna'], queries: ['Seven Churches', 'Greece', 'Paulo', 'Paul', 'Roman'], region: 'asia' },
  { name: 'Pérgamo', aliases: ['Pérgamo'], queries: ['Seven Churches', 'Greece', 'Paulo', 'Paul'], region: 'asia' },
  { name: 'Tiatira', aliases: ['Tiatira'], queries: ['Seven Churches', 'Greece', 'Paulo', 'Paul'], region: 'asia' },
  { name: 'Sardes', aliases: ['Sardes'], queries: ['Seven Churches', 'Greece', 'Paulo', 'Paul'], region: 'asia' },
  { name: 'Filadélfia', aliases: ['Filadélfia'], queries: ['Seven Churches', 'Greece', 'Paulo', 'Paul'], region: 'asia' },
  { name: 'Laodiceia', aliases: ['Laodiceia', 'Laodicéia'], queries: ['Seven Churches', 'Greece', 'Paulo', 'Paul'], region: 'asia' },
  { name: 'Patmos', aliases: ['Patmos'], queries: ['Seven Churches', 'Greece', 'Roman', 'Romano'], region: 'asia' },
  { name: 'Colossos', aliases: ['Colossos', 'Hierápolis'], queries: ['Third Missionary', 'Seven Churches', 'Paulo', 'Paul'], region: 'asia' },
  { name: 'Mileto', aliases: ['Mileto'], queries: ['Third Missionary', 'Paulo', 'Paul', 'Seven Churches'], region: 'asia' },
  { name: 'Ásia', aliases: ['Ásia'], caseSensitive: true, queries: ['Seven Churches', 'Paulo', 'Paul', 'Roman', 'Mediterranean'], region: 'asia' },
  { name: 'Capadócia', aliases: ['Capadócia', 'Bitínia', 'Cilícia', 'Lícia'], queries: ['Paulo', 'Paul', 'Roman', 'Romano', 'Mediterranean'], region: 'asia' },
  { name: 'Creta', aliases: ['Creta'], queries: ['Voyage to Rome', 'Last Journeys', 'Paulo', 'Paul', 'Mediterranean'], region: 'mediterranean' },
  { name: 'Malta', aliases: ['Malta', 'Melita'], queries: ['Voyage to Rome', 'Paulo', 'Paul', 'Roman', 'Romano'], region: 'rome' },
  { name: 'Siracusa', aliases: ['Siracusa', 'Régio', 'Putéoli'], queries: ['Voyage to Rome', 'Paulo', 'Paul', 'Roman', 'Romano'], region: 'rome' },
  { name: 'Roma', aliases: ['Roma', 'Itália', 'Espanha'], queries: ['Voyage to Rome', 'Romano', 'Roman', 'Paulo', 'Paul'], region: 'rome' },
  { name: 'Alexandria', aliases: ['Alexandria'], queries: ['Roman', 'Romano', 'Alexander', 'Mediterranean'], region: 'egypt' },

  // Montes, Rios e Mares
  { name: 'Rio Jordão', aliases: ['Jordão'], queries: ['Palestine', 'Physical', 'Tribos', 'Tribes', 'Ministério'], region: 'palestine' },
  { name: 'Rio Eufrates', aliases: ['Eufrates'], queries: ['Patriarcas', 'Patriarchs', 'Babylonian', 'Assyrian', 'Empires'], region: 'mesopotamia' },
  { name: 'Rio Tigre', aliases: ['Tigre', 'Hidequel'], caseSensitive: true, queries: ['Assyrian', 'Babylonian', 'Empires', 'Patriarcas'], region: 'mesopotamia' },
  { name: 'Rio Nilo', aliases: ['Nilo'], queries: ['Êxodo', 'Journeyings', 'Sojourn', 'Empires'], region: 'egypt' },
  { name: 'Mar Vermelho', aliases: ['Mar Vermelho', 'mar Vermelho'], queries: ['Êxodo', 'Journeyings', 'Sojourn', 'Moses'], region: 'sinai' },
  { name: 'Mar Morto', aliases: ['Mar Morto', 'mar Morto', 'mar Salgado', 'Mar Salgado'], queries: ['Physical', 'Palestine', 'Tribos', 'Canaan'], region: 'deadsea' },
  { name: 'Mar da Galileia', aliases: ['Mar da Galileia', 'mar da Galileia', 'mar da Galiléia', 'Genesaré', 'Quinerete'], queries: ['Galilean', 'Ministério', 'Life of Christ', 'Physical', 'Palestine'], region: 'galilee' },
  { name: 'Monte das Oliveiras', aliases: ['Monte das Oliveiras', 'monte das Oliveiras'], queries: ['Jerusalém', 'Jerusalem', 'Passion'], region: 'jerusalem' },
  { name: 'Monte Carmelo', aliases: ['Carmelo'], queries: ['Profetas', 'Physical', 'Palestine', 'Tribos'], region: 'north' },
  { name: 'Monte Hermom', aliases: ['Hermom'], queries: ['Physical', 'Palestine', 'Tribos', 'Davi'], region: 'north' },
  { name: 'Monte Tabor', aliases: ['Tabor'], queries: ['Physical', 'Judges', 'Palestine', 'Tribos'], region: 'north' },
  { name: 'Monte Nebo', aliases: ['Nebo', 'Pisga'], queries: ['Êxodo', 'Journeyings', 'Sojourn', 'Moses'], region: 'transjordan' },
  { name: 'Monte Sião', aliases: ['Sião', 'Moriá'], queries: ['Jerusalém', 'Jerusalem', 'Davi', 'David'], region: 'jerusalem' },
  { name: 'Líbano', aliases: ['Líbano'], queries: ['Physical', 'Palestine', 'Solomon', 'Davi', 'Phoenicia'], region: 'phoenicia' }
];

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripHtmlToPlainText(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pré-compila expressões regulares uma única vez para detecção ultrarrápida por capítulo
const COMPILED_PLACES = PLACE_CATALOG.map((entry) => {
  const sortedAliases = entry.aliases.slice().sort((a, b) => b.length - a.length);
  const patternBody = sortedAliases.map(escapeRegExp).join('|');
  const flags = entry.caseSensitive ? 'u' : 'iu';
  return {
    ...entry,
    regex: new RegExp(`(?<![\\p{L}\\p{N}])(?:${patternBody})(?![\\p{L}\\p{N}])`, flags)
  };
});

/**
 * Retorna os termos de período histórico esperados para um livro/capítulo bíblico.
 * Usado como reforço de ranqueamento ao escolher o melhor mapa em atlas temáticos.
 */
export function getPeriodQueriesForBook(book, chapter = 1) {
  const b = Number(book) || 1;
  const c = Number(chapter) || 1;

  if (b === 1) {
    return c <= 11
      ? ['Ancient World', 'Noah', 'Patriarcas', 'Patriarchs']
      : ['Patriarcas', 'Patriarchs', 'Canaan', 'Canaã', 'Moses'];
  }
  if (b >= 2 && b <= 5) {
    return ['Êxodo', 'Journeyings', 'Sojourn', 'Moses', 'Canaã'];
  }
  if (b === 6) {
    return ['Tribos', 'Tribes', 'Canaã', 'Canaan', 'Palestine'];
  }
  if (b === 7 || b === 8) {
    return ['Judges', 'Tribos', 'Tribes', 'Palestine'];
  }
  if (b === 9) {
    return ['Saul', 'Davi', 'David', 'Tribos', 'Palestine'];
  }
  if (b === 10 || b === 11 || b === 13 || b === 14) {
    return ['Davi', 'Salomão', 'David', 'Solomon', 'Profetas', 'Palestine'];
  }
  if (b === 12 || (b >= 23 && b <= 39)) {
    return ['Profetas', 'Assírio', 'Babilônico', 'Assyrian', 'Babylonian', 'Persian', 'Palestine'];
  }
  if (b >= 15 && b <= 17) {
    return ['Persian', 'Medo-Persian', 'Babilônico', 'Babylonian'];
  }
  if (b >= 40 && b <= 43) {
    return ['Ministério', 'Life of Christ', 'Jerusalém', 'Jerusalem', 'Herod', 'Palestine'];
  }
  if (b === 44) {
    return c <= 12
      ? ['Apóstolos', 'Apostles', 'Apostolic', 'Palestine', 'Jerusalem']
      : ['Paulo', 'Paul', 'Missionary', 'Voyage to Rome', 'Roman'];
  }
  if (b >= 45 && b <= 65) {
    return ['Paulo', 'Paul', 'Romano', 'Roman', 'Mediterranean', 'Greece'];
  }
  if (b === 66) {
    return ['Seven Churches', 'Greece', 'Romano', 'Roman', 'Mediterranean'];
  }
  return ['Palestine', 'Canaã', 'Patriarcas'];
}

/**
 * Detecta localizações bíblicas mencionadas no texto ou HTML de um versículo.
 */
export function detectLocationsInVerse(verseTextOrHtml) {
  const plain = stripHtmlToPlainText(verseTextOrHtml);
  if (!plain || plain.length < 3) return [];

  const found = [];
  const seen = new Set();

  for (const place of COMPILED_PLACES) {
    if (place.regex.test(plain)) {
      if (!seen.has(place.name)) {
        seen.add(place.name);
        found.push({
          name: place.name,
          queries: place.queries,
          region: place.region
        });
      }
      if (found.length >= 6) break;
    }
  }

  return found;
}
