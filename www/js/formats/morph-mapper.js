// Mapeador completo de morfologia UGNT/BHP (posicional com pontos) -> Robinson/SBLGNT (RMAC)
// e reconhecimento de morfologia BHS (AT) para o Dicionário de Morfologia.

const BHS_PREFIX_RE = /^(?:adjv|advb|art|conj|inrg|intj|nega|nmpr|prde|prep|prin|prps|subs|verb)(?:\.[a-z0-9.]+)?$/i;
const ROBINSON_RE = /^(?:[A-Z]{1,4}-[A-Z0-9-]+|ADV|CONJ|COND|PREP|PRT|INJ|INTJ|HEB|ARAM)$/;

const UGNT_POS_LABELS = {
  N: 'Substantivo',
  A: 'Adjetivo',
  E: 'Determinante',
  R: 'Pronome',
  V: 'Verbo',
  P: 'Preposição',
  C: 'Conjunção',
  D: 'Advérbio',
  T: 'Partícula',
  I: 'Interjeição',
  F: 'Palavra estrangeira',
  X: 'Indefinido'
};

const UGNT_SUB_LABELS = {
  NS: 'Adjetivo substantivado',
  NP: 'Adjetivo predicativo',
  AA: 'Adjetivo atributivo',
  EA: 'Artigo definido',
  ED: 'Determinante demonstrativo',
  EQ: 'Determinante quantificador',
  EN: 'Determinante numeral',
  EF: 'Determinante diferencial',
  EP: 'Determinante possessivo',
  ER: 'Determinante relativo',
  ET: 'Determinante interrogativo',
  EI: 'Determinante indefinido',
  EO: 'Determinante ordinal',
  RP: 'Pronome pessoal',
  RE: 'Pronome reflexivo',
  RR: 'Pronome relativo',
  RD: 'Pronome demonstrativo',
  RI: 'Pronome indefinido',
  RT: 'Pronome interrogativo',
  RC: 'Pronome recíproco',
  RK: 'Pronome correlativo',
  RS: 'Pronome possessivo',
  PI: 'Preposição imprópria',
  CC: 'Conjunção coordenativa',
  CS: 'Conjunção subordinativa',
  CO: 'Conjunção correlativa',
  DO: 'Advérbio / partícula correlativa',
  IE: 'Interjeição exclamativa',
  ID: 'Interjeição diretiva (forma verbal)',
  VT: 'Verbo transitivo',
  VI: 'Verbo intransitivo',
  VL: 'Verbo de ligação',
  VM: 'Verbo modal',
  VP: 'Verbo perifrástico'
};

const UGNT_MOOD_LABELS = {
  I: 'Indicativo',
  S: 'Subjuntivo',
  O: 'Optativo',
  M: 'Imperativo',
  N: 'Infinitivo',
  P: 'Particípio'
};

const UGNT_TENSE_LABELS = {
  P: 'Presente',
  I: 'Imperfeito',
  F: 'Futuro',
  A: 'Aoristo',
  E: 'Perfeito',
  L: 'Mais-que-perfeito'
};

const UGNT_VOICE_LABELS = {
  A: 'Ativa',
  M: 'Média',
  P: 'Passiva'
};

const UGNT_CASE_LABELS = {
  N: 'Nominativo',
  G: 'Genitivo',
  D: 'Dativo',
  A: 'Acusativo',
  V: 'Vocativo'
};

const UGNT_GENDER_LABELS = {
  M: 'Masculino',
  F: 'Feminino',
  N: 'Neutro'
};

const UGNT_NUMBER_LABELS = {
  S: 'Singular',
  P: 'Plural'
};

function sanitizeRawCode(raw) {
  return String(raw || '')
    .trim()
    .replace(/^<WT/i, '')
    .replace(/>$/i, '')
    .replace(/·/g, '.')
    .trim();
}

export function isBhsMorphCode(raw) {
  const s = sanitizeRawCode(raw);
  if (!s || s.includes('..')) return false;
  return BHS_PREFIX_RE.test(s);
}

export function isRobinsonMorphCode(raw) {
  const s = sanitizeRawCode(raw).toUpperCase();
  if (!s) return false;
  return ROBINSON_RE.test(s);
}

/**
 * Faz o parse de um código posicional UGNT / BHP (8 a 10 caracteres com pontos),
 * ex.: N.....NMP, N.....GMSI, V.MPM2..P, VTIAA3..S, RP...1G.S, EA....AFP, CC......, D.......
 */
export function parseUgntMorphCode(raw) {
  const clean = sanitizeRawCode(raw);
  if (!clean || !clean.includes('.')) return null;
  if (isBhsMorphCode(clean)) return null;

  const upper = clean.toUpperCase();
  if (!/^[A-Z1-3.]{7,10}$/.test(upper)) return null;

  let core = upper;
  let extra = '';
  if (core.length === 10) {
    extra = core[9];
    core = core.slice(0, 9);
  } else if (core.length < 9) {
    // Alguns versículos trazem códigos invariáveis com 8 caracteres (ex.: D......., CC......, CS......)
    if (/^[CDTPIF][A-Z.]?\.+$/.test(core)) {
      core = core.padEnd(9, '.');
    } else {
      return null;
    }
  }

  const pos = core[0];
  const sub = core[1];
  const mood = core[2];
  const tense = core[3];
  const voice = core[4];
  const person = core[5];
  const kase = core[6];
  const gender = core[7];
  const number = core[8];

  if (!'NAERVPCDTIFX'.includes(pos)) return null;
  if (!'.ISOMNP'.includes(mood)) return null;
  if (!'.PIFAEL'.includes(tense)) return null;
  if (!'.AMP'.includes(voice)) return null;
  if (!'.123'.includes(person)) return null;
  if (!'.NGDAV'.includes(kase)) return null;
  if (!'.MFN'.includes(gender)) return null;
  if (!'.SP'.includes(number)) return null;
  if (extra && !'ICS'.includes(extra)) return null;

  return {
    raw: upper,
    core,
    pos,
    sub: sub === '.' ? '' : sub,
    mood: mood === '.' ? '' : mood,
    tense: tense === '.' ? '' : tense,
    voice: voice === '.' ? '' : voice,
    person: person === '.' ? '' : person,
    kase: kase === '.' ? '' : kase,
    gender: gender === '.' ? '' : gender,
    number: number === '.' ? '' : number,
    extra
  };
}

export function isUgntMorphCode(raw) {
  return Boolean(parseUgntMorphCode(raw));
}

export function isAnyMorphCode(raw) {
  return isUgntMorphCode(raw) || isRobinsonMorphCode(raw) || isBhsMorphCode(raw);
}

function addUnique(list, code) {
  const clean = String(code || '').trim();
  if (!clean) return;
  if (!list.includes(clean)) {
    list.push(clean);
  }
}

function buildRobinsonCng(p) {
  // Robinson usa Caso + Número + Gênero (ex.: NPM, GSF, DSN), diferente do UGNT (Caso + Gênero + Número)
  if (p.kase && p.number && p.gender) {
    return `${p.kase}${p.number}${p.gender}`;
  }
  return '';
}

function buildRobinsonCn(p) {
  if (p.kase && p.number) {
    return `${p.kase}${p.number}`;
  }
  return '';
}

function mapUgntVerbToRobinson(p) {
  const out = [];
  if (!p.mood || !p.tense) return out;

  const robTense = p.tense === 'E' ? 'R' : p.tense;
  const primaryVoice = p.voice || 'A';
  const cng = buildRobinsonCng(p);

  let tail = '';
  if (p.mood === 'N') {
    tail = '';
  } else if (p.mood === 'P') {
    tail = cng ? `-${cng}` : '';
  } else if (p.person && p.number) {
    tail = `-${p.person}${p.number}`;
  }

  const canHaveSecond = robTense === 'A' || robTense === 'R' || robTense === 'F' || robTense === 'L';
  const voiceFallbacks = primaryVoice === 'M'
    ? ['M', 'N', 'D', 'E', 'P', 'X']
    : primaryVoice === 'P'
      ? ['P', 'O', 'N', 'E', 'M', 'X']
      : ['A', 'X', 'Q'];

  // 1. Tenta voz exata (1º tempo e 2º tempo)
  addUnique(out, `V-${robTense}${primaryVoice}${p.mood}${tail}`);
  if (canHaveSecond) {
    addUnique(out, `V-2${robTense}${primaryVoice}${p.mood}${tail}`);
  }

  // 2. Tenta vozes compatíveis no padrão Robinson (deponente/sem voz/média-passiva)
  for (const v of voiceFallbacks) {
    if (v === primaryVoice) continue;
    addUnique(out, `V-${robTense}${v}${p.mood}${tail}`);
    if (canHaveSecond) {
      addUnique(out, `V-2${robTense}${v}${p.mood}${tail}`);
    }
  }

  // 3. Fallback sem cauda (ex.: V-API)
  if (tail) {
    addUnique(out, `V-${robTense}${primaryVoice}${p.mood}`);
  }

  return out;
}

function mapUgntToRobinson(p) {
  const out = [];
  if (!p) return out;

  const cng = buildRobinsonCng(p);
  const cn = buildRobinsonCn(p);
  const deg = p.extra === 'C' || p.extra === 'S' ? `-${p.extra}` : '';

  if (p.pos === 'V') {
    for (const c of mapUgntVerbToRobinson(p)) addUnique(out, c);
    return out;
  }

  if (p.pos === 'N') {
    if (p.sub === 'S' || p.sub === 'P') {
      // Adjetivo substantivado (NS) ou predicativo (NP)
      if (cng) {
        if (deg) addUnique(out, `A-${cng}${deg}`);
        addUnique(out, `A-${cng}`);
        addUnique(out, `N-${cng}`);
      }
      addUnique(out, 'N-OI');
      return out;
    }
    if (cng) {
      addUnique(out, `N-${cng}`);
    }
    if (p.extra === 'I') {
      addUnique(out, 'N-PRI');
      addUnique(out, 'N-OI');
    } else if (!cng) {
      addUnique(out, 'N-PRI');
      addUnique(out, 'N-OI');
      addUnique(out, 'N-LI');
    }
    return out;
  }

  if (p.pos === 'A') {
    if (cng) {
      if (deg) addUnique(out, `A-${cng}${deg}`);
      addUnique(out, `A-${cng}`);
    }
    if (p.sub === 'N' || p.extra === 'I' || !cng) {
      addUnique(out, 'A-NUI');
    }
    return out;
  }

  if (p.pos === 'E') {
    if (p.sub === 'A') {
      if (cng) addUnique(out, `T-${cng}`);
      return out;
    }
    if (p.sub === 'D') {
      if (cng) addUnique(out, `D-${cng}`);
      return out;
    }
    if (p.sub === 'P') {
      if (cng) {
        if (p.person === '1' || p.person === '2') addUnique(out, `S-${p.person}${cng}`);
        addUnique(out, `S-1${cng}`);
        addUnique(out, `A-${cng}`);
      }
      return out;
    }
    if (p.sub === 'R') {
      if (cng) {
        addUnique(out, `R-${cng}`);
        addUnique(out, `K-${cng}`);
      }
      return out;
    }
    if (p.sub === 'T') {
      if (cng) {
        addUnique(out, `I-${cng}`);
        addUnique(out, `IP-${cng}`);
        addUnique(out, `Q-${cng}`);
      }
      return out;
    }
    if (p.sub === 'I') {
      if (cng) {
        addUnique(out, `X-${cng}`);
        addUnique(out, `IP-${cng}`);
      }
      return out;
    }
    if (p.sub === 'N') {
      if (cng) addUnique(out, `A-${cng}`);
      addUnique(out, 'A-NUI');
      return out;
    }
    // EQ (quantificador), EF (diferencial), EO (ordinal) ou genérico
    if (cng) {
      if (deg) addUnique(out, `A-${cng}${deg}`);
      addUnique(out, `A-${cng}`);
      addUnique(out, `X-${cng}`);
      addUnique(out, `T-${cng}`);
    }
    return out;
  }

  if (p.pos === 'R') {
    if (p.sub === 'P') {
      // Pronome pessoal: 1ª/2ª pessoa usa P-1GS / P-2AP; 3ª pessoa usa P-GSM / P-APM (sem o 3)
      if ((p.person === '1' || p.person === '2') && cn) {
        addUnique(out, `P-${p.person}${cn}`);
      }
      if (cng) addUnique(out, `P-${cng}`);
      if (cn) addUnique(out, `P-${cn}`);
      if (cng) addUnique(out, `T-${cng}`);
      return out;
    }
    if (p.sub === 'E') {
      // Pronome reflexivo (F-1/2/3CNG) — nominativo de autos recai em P-CNG
      if (p.person && cng) addUnique(out, `F-${p.person}${cng}`);
      if (cng) {
        addUnique(out, `F-3${cng}`);
        addUnique(out, `F-${cng}`);
        addUnique(out, `P-${cng}`);
      }
      if ((p.person === '1' || p.person === '2') && cn) {
        addUnique(out, `P-${p.person}${cn}`);
      }
      return out;
    }
    if (p.sub === 'R') {
      if (cng) addUnique(out, `R-${cng}`);
      return out;
    }
    if (p.sub === 'D') {
      if (cng) {
        addUnique(out, `D-${cng}`);
        addUnique(out, `T-${cng}`);
      }
      return out;
    }
    if (p.sub === 'I') {
      if (cng) {
        addUnique(out, `X-${cng}`);
        addUnique(out, `IP-${cng}`);
        addUnique(out, `A-${cng}`);
      }
      return out;
    }
    if (p.sub === 'T') {
      if (cng) {
        addUnique(out, `I-${cng}`);
        addUnique(out, `IP-${cng}`);
        addUnique(out, `Q-${cng}`);
      }
      return out;
    }
    if (p.sub === 'C') {
      if (cng) addUnique(out, `C-${cng}`);
      return out;
    }
    if (p.sub === 'K' || p.sub === 'Q') {
      if (cng) {
        addUnique(out, `K-${cng}`);
        addUnique(out, `Q-${cng}`);
      }
      return out;
    }
    if (p.sub === 'S') {
      if (cng) {
        if (p.person === '1' || p.person === '2') addUnique(out, `S-${p.person}${cng}`);
        addUnique(out, `S-1${cng}`);
        addUnique(out, `S-2${cng}`);
      }
      return out;
    }
    if (cng) {
      addUnique(out, `P-${cng}`);
      addUnique(out, `R-${cng}`);
    }
    return out;
  }

  if (p.pos === 'P') {
    addUnique(out, 'PREP');
    if (p.sub === 'I') {
      addUnique(out, 'CONJ');
      addUnique(out, 'ADV');
    }
    return out;
  }

  if (p.pos === 'C') {
    addUnique(out, 'CONJ');
    if (p.sub === 'S') addUnique(out, 'COND');
    return out;
  }

  if (p.pos === 'D') {
    if (deg) addUnique(out, `ADV${deg}`);
    if (p.sub === 'T') addUnique(out, 'ADV-I');
    addUnique(out, 'ADV');
    if (p.sub === 'O') {
      addUnique(out, 'PRT');
      addUnique(out, 'CONJ');
    }
    return out;
  }

  if (p.pos === 'T') {
    addUnique(out, 'PRT');
    addUnique(out, 'COND');
    addUnique(out, 'ADV');
    return out;
  }

  if (p.pos === 'I') {
    // Ex.: IDMAA2..S (ἰδού) traz modo/tempo/voz verbais em uma interjeição diretiva
    if (p.mood && p.tense) {
      const verbMapped = mapUgntVerbToRobinson(p);
      for (const c of verbMapped) addUnique(out, c);
    }
    addUnique(out, 'INJ');
    return out;
  }

  if (p.pos === 'F' || p.pos === 'X') {
    addUnique(out, 'HEB');
    addUnique(out, 'ARAM');
    addUnique(out, 'N-OI');
    addUnique(out, 'N-PRI');
  }

  return out;
}

/**
 * Retorna a lista ordenada de códigos a consultar nos dicionários:
 * 1) código original;
 * 2) códigos Robinson/SBLGNT equivalentes (para módulos UGNT/BHP);
 * 3) variações sem sufixo raro (para códigos Robinson com -ATT, -IRR, etc.).
 */
export function expandMorphologyLookupCandidates(raw) {
  const clean = sanitizeRawCode(raw);
  if (!clean) return [];

  const out = [];
  addUnique(out, clean);

  const ugnt = parseUgntMorphCode(clean);
  if (ugnt) {
    const mapped = mapUgntToRobinson(ugnt);
    for (const c of mapped) addUnique(out, c);
    return out;
  }

  if (isRobinsonMorphCode(clean)) {
    const upper = clean.toUpperCase();
    addUnique(out, upper);
    // Remove sufixo secundário raro (ex.: -ATT, -IRR, -AP, -ABB, -C, -S, -P, -M, -T, -I, -N)
    const stripped = upper.replace(/-(?:ATT|IRR|ABB|AP|C|S|P|M|T|I|N)$/, '');
    if (stripped && stripped !== upper) {
      addUnique(out, stripped);
    }
    // Alternância entre 1º e 2º tempo (V-2AAI-3S <-> V-AAI-3S)
    if (/^V-2([ARFL])/.test(upper)) {
      addUnique(out, upper.replace(/^V-2/, 'V-'));
    } else if (/^V-([ARFL])/.test(upper)) {
      addUnique(out, upper.replace(/^V-/, 'V-2'));
    }
  }

  return out;
}

/**
 * Fallback em português caso um código UGNT muito raro não exista em nenhum dicionário .dct.
 */
export function buildUgntMorphFallbackHtml(raw, triedCodes = []) {
  const p = parseUgntMorphCode(raw);
  if (!p) return '';

  const rows = [];
  const subKey = p.sub ? `${p.pos}${p.sub}` : '';
  const classLabel = UGNT_SUB_LABELS[subKey] || UGNT_POS_LABELS[p.pos] || p.pos;
  rows.push(`<p><strong>Classe</strong>: ${classLabel} (${subKey || p.pos})</p>`);

  if (p.tense && UGNT_TENSE_LABELS[p.tense]) {
    rows.push(`<p><strong>Tempo</strong>: ${UGNT_TENSE_LABELS[p.tense]} (${p.tense})</p>`);
  }
  if (p.voice && UGNT_VOICE_LABELS[p.voice]) {
    rows.push(`<p><strong>Voz</strong>: ${UGNT_VOICE_LABELS[p.voice]} (${p.voice})</p>`);
  }
  if (p.mood && UGNT_MOOD_LABELS[p.mood]) {
    rows.push(`<p><strong>Modo</strong>: ${UGNT_MOOD_LABELS[p.mood]} (${p.mood})</p>`);
  }
  if (p.person) {
    rows.push(`<p><strong>Pessoa</strong>: ${p.person}ª (${p.person})</p>`);
  }
  if (p.kase && UGNT_CASE_LABELS[p.kase]) {
    rows.push(`<p><strong>Caso</strong>: ${UGNT_CASE_LABELS[p.kase]} (${p.kase})</p>`);
  }
  if (p.number && UGNT_NUMBER_LABELS[p.number]) {
    rows.push(`<p><strong>Número</strong>: ${UGNT_NUMBER_LABELS[p.number]} (${p.number})</p>`);
  }
  if (p.gender && UGNT_GENDER_LABELS[p.gender]) {
    rows.push(`<p><strong>Gênero</strong>: ${UGNT_GENDER_LABELS[p.gender]} (${p.gender})</p>`);
  }
  if (p.extra === 'I') {
    rows.push('<p><strong>Observação</strong>: Forma indeclinável (I)</p>');
  } else if (p.extra === 'C') {
    rows.push('<p><strong>Grau</strong>: Comparativo (C)</p>');
  } else if (p.extra === 'S') {
    rows.push('<p><strong>Grau</strong>: Superlativo (S)</p>');
  }

  const mapped = triedCodes.filter((c) => c && c !== p.raw);
  if (mapped.length) {
    rows.push(`<p style="opacity:0.75;font-size:0.9em;">Equivalente Robinson pesquisado: ${mapped.slice(0, 3).join(', ')}</p>`);
  }

  return rows.join('');
}
