export const CANON_BOOKS = Object.freeze([
  { id: 1, name: 'Gênesis', abbr: 'Gn', testament: 'AT', chapters: 50 },
  { id: 2, name: 'Êxodo', abbr: 'Êx', testament: 'AT', chapters: 40 },
  { id: 3, name: 'Levítico', abbr: 'Lv', testament: 'AT', chapters: 27 },
  { id: 4, name: 'Números', abbr: 'Nm', testament: 'AT', chapters: 36 },
  { id: 5, name: 'Deuteronômio', abbr: 'Dt', testament: 'AT', chapters: 34 },
  { id: 6, name: 'Josué', abbr: 'Js', testament: 'AT', chapters: 24 },
  { id: 7, name: 'Juízes', abbr: 'Jz', testament: 'AT', chapters: 21 },
  { id: 8, name: 'Rute', abbr: 'Rt', testament: 'AT', chapters: 4 },
  { id: 9, name: '1 Samuel', abbr: '1Sm', testament: 'AT', chapters: 31 },
  { id: 10, name: '2 Samuel', abbr: '2Sm', testament: 'AT', chapters: 24 },
  { id: 11, name: '1 Reis', abbr: '1Rs', testament: 'AT', chapters: 22 },
  { id: 12, name: '2 Reis', abbr: '2Rs', testament: 'AT', chapters: 25 },
  { id: 13, name: '1 Crônicas', abbr: '1Cr', testament: 'AT', chapters: 29 },
  { id: 14, name: '2 Crônicas', abbr: '2Cr', testament: 'AT', chapters: 36 },
  { id: 15, name: 'Esdras', abbr: 'Ed', testament: 'AT', chapters: 10 },
  { id: 16, name: 'Neemias', abbr: 'Ne', testament: 'AT', chapters: 13 },
  { id: 17, name: 'Ester', abbr: 'Et', testament: 'AT', chapters: 10 },
  { id: 18, name: 'Jó', abbr: 'Jó', testament: 'AT', chapters: 42 },
  { id: 19, name: 'Salmos', abbr: 'Sl', testament: 'AT', chapters: 150 },
  { id: 20, name: 'Provérbios', abbr: 'Pv', testament: 'AT', chapters: 31 },
  { id: 21, name: 'Eclesiastes', abbr: 'Ec', testament: 'AT', chapters: 12 },
  { id: 22, name: 'Cantares', abbr: 'Ct', testament: 'AT', chapters: 8 },
  { id: 23, name: 'Isaías', abbr: 'Is', testament: 'AT', chapters: 66 },
  { id: 24, name: 'Jeremias', abbr: 'Jr', testament: 'AT', chapters: 52 },
  { id: 25, name: 'Lamentações', abbr: 'Lm', testament: 'AT', chapters: 5 },
  { id: 26, name: 'Ezequiel', abbr: 'Ez', testament: 'AT', chapters: 48 },
  { id: 27, name: 'Daniel', abbr: 'Dn', testament: 'AT', chapters: 12 },
  { id: 28, name: 'Oseias', abbr: 'Os', testament: 'AT', chapters: 14 },
  { id: 29, name: 'Joel', abbr: 'Jl', testament: 'AT', chapters: 3 },
  { id: 30, name: 'Amós', abbr: 'Am', testament: 'AT', chapters: 9 },
  { id: 31, name: 'Obadias', abbr: 'Ob', testament: 'AT', chapters: 1 },
  { id: 32, name: 'Jonas', abbr: 'Jn', testament: 'AT', chapters: 4 },
  { id: 33, name: 'Miqueias', abbr: 'Mq', testament: 'AT', chapters: 7 },
  { id: 34, name: 'Naum', abbr: 'Na', testament: 'AT', chapters: 3 },
  { id: 35, name: 'Habacuque', abbr: 'Hc', testament: 'AT', chapters: 3 },
  { id: 36, name: 'Sofonias', abbr: 'Sf', testament: 'AT', chapters: 3 },
  { id: 37, name: 'Ageu', abbr: 'Ag', testament: 'AT', chapters: 2 },
  { id: 38, name: 'Zacarias', abbr: 'Zc', testament: 'AT', chapters: 14 },
  { id: 39, name: 'Malaquias', abbr: 'Ml', testament: 'AT', chapters: 4 },
  { id: 40, name: 'Mateus', abbr: 'Mt', testament: 'NT', chapters: 28 },
  { id: 41, name: 'Marcos', abbr: 'Mc', testament: 'NT', chapters: 16 },
  { id: 42, name: 'Lucas', abbr: 'Lc', testament: 'NT', chapters: 24 },
  { id: 43, name: 'João', abbr: 'Jo', testament: 'NT', chapters: 21 },
  { id: 44, name: 'Atos', abbr: 'At', testament: 'NT', chapters: 28 },
  { id: 45, name: 'Romanos', abbr: 'Rm', testament: 'NT', chapters: 16 },
  { id: 46, name: '1 Coríntios', abbr: '1Co', testament: 'NT', chapters: 16 },
  { id: 47, name: '2 Coríntios', abbr: '2Co', testament: 'NT', chapters: 13 },
  { id: 48, name: 'Gálatas', abbr: 'Gl', testament: 'NT', chapters: 6 },
  { id: 49, name: 'Efésios', abbr: 'Ef', testament: 'NT', chapters: 6 },
  { id: 50, name: 'Filipenses', abbr: 'Fp', testament: 'NT', chapters: 4 },
  { id: 51, name: 'Colossenses', abbr: 'Cl', testament: 'NT', chapters: 4 },
  { id: 52, name: '1 Tessalonicenses', abbr: '1Ts', testament: 'NT', chapters: 5 },
  { id: 53, name: '2 Tessalonicenses', abbr: '2Ts', testament: 'NT', chapters: 3 },
  { id: 54, name: '1 Timóteo', abbr: '1Tm', testament: 'NT', chapters: 6 },
  { id: 55, name: '2 Timóteo', abbr: '2Tm', testament: 'NT', chapters: 4 },
  { id: 56, name: 'Tito', abbr: 'Tt', testament: 'NT', chapters: 3 },
  { id: 57, name: 'Filemom', abbr: 'Fm', testament: 'NT', chapters: 1 },
  { id: 58, name: 'Hebreus', abbr: 'Hb', testament: 'NT', chapters: 13 },
  { id: 59, name: 'Tiago', abbr: 'Tg', testament: 'NT', chapters: 5 },
  { id: 60, name: '1 Pedro', abbr: '1Pe', testament: 'NT', chapters: 5 },
  { id: 61, name: '2 Pedro', abbr: '2Pe', testament: 'NT', chapters: 3 },
  { id: 62, name: '1 João', abbr: '1Jo', testament: 'NT', chapters: 5 },
  { id: 63, name: '2 João', abbr: '2Jo', testament: 'NT', chapters: 1 },
  { id: 64, name: '3 João', abbr: '3Jo', testament: 'NT', chapters: 1 },
  { id: 65, name: 'Judas', abbr: 'Jd', testament: 'NT', chapters: 1 },
  { id: 66, name: 'Apocalipse', abbr: 'Ap', testament: 'NT', chapters: 22 },
  { id: 67, name: 'Tobias', abbr: 'Tb', testament: 'DC', chapters: 14 },
  { id: 68, name: 'Judite', abbr: 'Jt', testament: 'DC', chapters: 16 },
  { id: 69, name: 'Sabedoria', abbr: 'Sb', testament: 'DC', chapters: 19 },
  { id: 70, name: 'Eclesiástico', abbr: 'Eclo', testament: 'DC', chapters: 51 },
  { id: 71, name: 'Baruque', abbr: 'Br', testament: 'DC', chapters: 6 },
  { id: 72, name: '1 Macabeus', abbr: '1Mc', testament: 'DC', chapters: 16 },
  { id: 73, name: '2 Macabeus', abbr: '2Mc', testament: 'DC', chapters: 15 }
]);

const bookMap = new Map(CANON_BOOKS.map((b) => [b.id, b]));

export function getBookMeta(bookId) {
  const num = Number(bookId);
  const found = bookMap.get(num);
  if (found) return found;
  return {
    id: num,
    name: `Livro ${num}`,
    abbr: `L${num}`,
    testament: 'OUTRO',
    chapters: 1
  };
}

export function getBookName(bookId) {
  return getBookMeta(bookId).name;
}

export function getBookAbbr(bookId) {
  return getBookMeta(bookId).abbr;
}

export function formatReference(bookId, chapter, verse = null) {
  const name = getBookName(bookId);
  if (verse !== null && verse !== undefined) {
    return `${name} ${chapter}:${verse}`;
  }
  return `${name} ${chapter}`;
}
