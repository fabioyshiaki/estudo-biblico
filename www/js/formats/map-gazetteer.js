// Catálogo geográfico bíblico com coordenadas reais (lat, lng) para pins no mapa interativo
// e estimativas de bounds (south, west, north, east) para atlas históricos sem tabela `map`.

const PLACE_CATALOG = [
  // Cidades e lugares centrais do AT e NT
  { name: 'Jerusalém', lat: 31.7781, lng: 35.2353, info: 'Cidade de Davi e sede do Templo (Judeia)', aliases: ['Jerusalém', 'Jerusalem', 'Salém', 'Jebus'], queries: ['Jerusalém', 'Jerusalem', 'Palestine'], region: 'jerusalem' },
  { name: 'Belém', lat: 31.7054, lng: 35.2024, info: 'Cidade natal de Davi e de Jesus (Judeia)', aliases: ['Belém', 'Belém-Efrata', 'Efrata'], queries: ['Jerusalém', 'Jerusalem', 'Judean', 'Ministério', 'Life of Christ', 'Palestine'], region: 'judea' },
  { name: 'Nazaré', lat: 32.7021, lng: 35.2978, info: 'Cidade na Baixa Galileia onde Jesus cresceu', aliases: ['Nazaré'], queries: ['Galilean', 'Ministério', 'Life of Christ', 'Nazareth', 'Palestine'], region: 'galilee' },
  { name: 'Cafarnaum', lat: 32.8806, lng: 35.5753, info: 'Base do ministério de Jesus junto ao Mar da Galileia', aliases: ['Cafarnaum'], queries: ['Galilean', 'Ministério', 'Life of Christ', 'Palestine'], region: 'galilee' },
  { name: 'Betsaida', lat: 32.9102, lng: 35.6305, info: 'Vila de pescadores a nordeste do Mar da Galileia', aliases: ['Betsaida'], queries: ['Galilean', 'Ministério', 'Life of Christ', 'Palestine'], region: 'galilee' },
  { name: 'Caná', lat: 32.7466, lng: 35.3389, info: 'Local do primeiro milagre de Jesus na Galileia', aliases: ['Caná'], queries: ['Galilean', 'Ministério', 'Life of Christ', 'Palestine'], region: 'galilee' },
  { name: 'Corazim', lat: 32.9108, lng: 35.5625, info: 'Cidade galileia ao norte de Cafarnaum', aliases: ['Corazim'], queries: ['Galilean', 'Ministério', 'Life of Christ'], region: 'galilee' },
  { name: 'Magdala', lat: 32.8303, lng: 35.5172, info: 'Cidade na margem ocidental do Mar da Galileia', aliases: ['Magdala', 'Dalmanuta'], queries: ['Galilean', 'Ministério', 'Life of Christ'], region: 'galilee' },
  { name: 'Naim', lat: 32.6311, lng: 35.3478, info: 'Vila na Galileia ao sul do Monte Tabor', aliases: ['Naim'], queries: ['Galilean', 'Ministério', 'Life of Christ'], region: 'galilee' },
  { name: 'Tiberíades', lat: 32.7940, lng: 35.5312, info: 'Cidade fundada por Herodes Antipas na Galileia', aliases: ['Tiberíades'], queries: ['Galilean', 'Ministério', 'Life of Christ', 'Palestine'], region: 'galilee' },
  { name: 'Gadara', lat: 32.6558, lng: 35.6783, info: 'Cidade da Decápolis a sudeste do Mar da Galileia', aliases: ['Gadara', 'Gerasa', 'Gerasenos', 'Gadarenos'], queries: ['Galilean', 'Ministério', 'Life of Christ', 'Palestine'], region: 'galilee' },
  { name: 'Betânia', lat: 31.7714, lng: 35.2614, info: 'Aldeia no lado oriental do Monte das Oliveiras', aliases: ['Betânia'], queries: ['Jerusalém', 'Jerusalem', 'Passion', 'Perean', 'Ministério'], region: 'judea' },
  { name: 'Emaús', lat: 31.8394, lng: 34.9894, info: 'Aldeia a oeste de Jerusalém no caminho dos discípulos', aliases: ['Emaús'], queries: ['Jerusalém', 'Jerusalem', 'Passion', 'Ministério'], region: 'judea' },
  { name: 'Getsêmani', lat: 31.7794, lng: 35.2397, info: 'Jardim no sopé do Monte das Oliveiras', aliases: ['Getsêmani'], queries: ['Jerusalém', 'Jerusalem', 'Passion'], region: 'jerusalem' },
  { name: 'Gólgota', lat: 31.7785, lng: 35.2297, info: 'Local da crucificação em Jerusalém', aliases: ['Gólgota', 'Calvário'], queries: ['Jerusalém', 'Jerusalem', 'Passion'], region: 'jerusalem' },
  { name: 'Siloé', lat: 31.7706, lng: 35.2351, info: 'Tanque ao sul da Cidade de Davi em Jerusalém', aliases: ['Siloé'], queries: ['Jerusalém', 'Jerusalem'], region: 'jerusalem' },
  { name: 'Jericó', lat: 31.8711, lng: 35.4444, info: 'Cidade no vale do Jordão, próxima ao Mar Morto', aliases: ['Jericó'], queries: ['Canaã', 'Canaan', 'Tribos', 'Tribes', 'Palestine', 'Judges'], region: 'judea' },
  { name: 'Hebrom', lat: 31.5247, lng: 35.1107, info: 'Antiga cidade na Judeia ligada a Abraão e Davi', aliases: ['Hebrom', 'Quiriate-Arba', 'Manre'], queries: ['Patriarcas', 'Patriarchs', 'Canaan', 'Tribos', 'Davi', 'David'], region: 'judea' },
  { name: 'Betel', lat: 31.9419, lng: 35.2219, info: 'Local do sonho de Jacó nas montanhas centrais', aliases: ['Betel', 'Bet-El'], queries: ['Patriarcas', 'Patriarchs', 'Canaan', 'Tribos', 'Tribes', 'Palestine'], region: 'central' },
  { name: 'Siquém', lat: 32.2136, lng: 35.2817, info: 'Vale entre os montes Gerizim e Ebal (Samaria)', aliases: ['Siquém', 'Sicar'], queries: ['Patriarcas', 'Patriarchs', 'Canaan', 'Tribos', 'Tribes', 'Palestine'], region: 'samaria' },
  { name: 'Berseba', lat: 31.2449, lng: 34.8408, info: 'Fronteira sul de Israel no Neguebe', aliases: ['Berseba', 'Bersebá'], queries: ['Patriarcas', 'Patriarchs', 'Canaan', 'Tribos', 'Palestine'], region: 'negev' },
  { name: 'Siló', lat: 32.0558, lng: 35.2894, info: 'Local do Tabernáculo no período dos Juízes', aliases: ['Siló'], queries: ['Tribos', 'Tribes', 'Judges', 'Saul', 'Palestine'], region: 'central' },
  { name: 'Gilgal', lat: 31.8830, lng: 35.4830, info: 'Primeiro acampamento de Israel após cruzar o Jordão', aliases: ['Gilgal'], queries: ['Tribos', 'Tribes', 'Judges', 'Saul', 'Canaã'], region: 'central' },
  { name: 'Gibeom', lat: 31.8490, lng: 35.1840, info: 'Cidade em Benjamim ao norte de Jerusalém', aliases: ['Gibeom', 'Gibeá'], queries: ['Tribos', 'Tribes', 'Saul', 'Judges'], region: 'central' },
  { name: 'Ramá', lat: 31.8542, lng: 35.2314, info: 'Cidade de Samuel no território de Benjamim', aliases: ['Ramá', 'Arimateia'], queries: ['Saul', 'Tribos', 'Tribes', 'Palestine'], region: 'central' },
  { name: 'Mispá', lat: 31.8856, lng: 35.2170, info: 'Ponto estratégico de assembleias em Benjamim', aliases: ['Mispá', 'Mizpá'], queries: ['Saul', 'Judges', 'Tribos', 'Tribes'], region: 'central' },
  { name: 'Megido', lat: 32.5853, lng: 35.1844, info: 'Fortaleza estratégica no vale de Jezreel', aliases: ['Megido', 'Armagedom'], queries: ['Tribos', 'Tribes', 'Palestine', 'Profetas', 'Solomon'], region: 'north' },
  { name: 'Jezreel', lat: 32.5578, lng: 35.3278, info: 'Planície fértil e residência real no norte de Israel', aliases: ['Jezreel', 'Jizreel'], queries: ['Profetas', 'Tribos', 'Palestine', 'Judges'], region: 'north' },
  { name: 'Dã', lat: 33.2489, lng: 35.6522, info: 'Fronteira norte do antigo Israel', aliases: ['Dã'], caseSensitive: true, queries: ['Tribos', 'Tribes', 'Davi', 'David', 'Palestine'], region: 'north' },
  { name: 'Hazor', lat: 33.0169, lng: 35.5681, info: 'Grande cidade cananeia e fortaleza de Salomão', aliases: ['Hazor'], queries: ['Tribos', 'Tribes', 'Canaan', 'Judges'], region: 'north' },
  { name: 'Laquis', lat: 31.5653, lng: 34.8494, info: 'Cidade fortificada da Sefelá de Judá', aliases: ['Laquis'], queries: ['Assírio', 'Assyrian', 'Profetas', 'Tribos', 'Palestine'], region: 'judea' },
  { name: 'En-Gedi', lat: 31.4628, lng: 35.3886, info: 'Oásis na margem oeste do Mar Morto', aliases: ['En-Gedi', 'Engedi'], queries: ['Saul', 'Davi', 'David', 'Palestine'], region: 'judea' },
  { name: 'Gaza', lat: 31.5017, lng: 34.4668, info: 'Principal cidade filisteia da costa sul', aliases: ['Gaza'], queries: ['Tribos', 'Tribes', 'Judges', 'Apóstolos', 'Apostles', 'Palestine'], region: 'philistia' },
  { name: 'Asdode', lat: 31.7580, lng: 34.6572, info: 'Cidade da pentápole filisteia (Azoto no NT)', aliases: ['Asdode', 'Azoto'], queries: ['Tribos', 'Judges', 'Apóstolos', 'Apostles', 'Palestine'], region: 'philistia' },
  { name: 'Ascalom', lat: 31.6658, lng: 34.5478, info: 'Porto filisteu no Mediterrâneo', aliases: ['Ascalom', 'Asquelom'], queries: ['Tribos', 'Judges', 'Palestine'], region: 'philistia' },
  { name: 'Ecrom', lat: 31.7783, lng: 34.8519, info: 'Cidade filisteia na fronteira com Judá e Dã', aliases: ['Ecrom'], queries: ['Tribos', 'Judges', 'Saul', 'Palestine'], region: 'philistia' },
  { name: 'Gate', lat: 31.7000, lng: 34.8472, info: 'Cidade filisteia de Golias', aliases: ['Gate'], caseSensitive: true, queries: ['Davi', 'David', 'Saul', 'Judges'], region: 'philistia' },
  { name: 'Jope', lat: 32.0543, lng: 34.7516, info: 'Antigo porto mediterrâneo (Jonas e visão de Pedro)', aliases: ['Jope'], queries: ['Apóstolos', 'Apostles', 'Apostolic', 'Palestine', 'Profetas'], region: 'coast' },
  { name: 'Lida', lat: 31.9514, lng: 34.8953, info: 'Cidade na planície de Sarom (ministério de Pedro)', aliases: ['Lida'], caseSensitive: true, queries: ['Apóstolos', 'Apostles', 'Apostolic', 'Palestine'], region: 'coast' },
  { name: 'Cesareia', lat: 32.5000, lng: 34.8917, info: 'Capital romana da Judeia na costa mediterrânea', aliases: ['Cesareia', 'Cesaréia', 'Cesareia de Filipe'], queries: ['Apóstolos', 'Apostles', 'Apostolic', 'Herod', 'Paulo', 'Paul', 'Palestine'], region: 'coast' },
  { name: 'Tiro', lat: 33.2705, lng: 35.1966, info: 'Grande porto fenício no Mediterrâneo', aliases: ['Tiro'], caseSensitive: true, queries: ['Phoenicia', 'Davi', 'Solomon', 'Profetas', 'Paulo', 'Palestine'], region: 'phoenicia' },
  { name: 'Sidom', lat: 33.5606, lng: 35.3758, info: 'Antiga cidade costeira da Fenícia', aliases: ['Sidom', 'Sídon'], queries: ['Phoenicia', 'Davi', 'Solomon', 'Profetas', 'Paulo', 'Palestine'], region: 'phoenicia' },
  { name: 'Damasco', lat: 33.5138, lng: 36.2765, info: 'Capital da Síria e cidade da conversão de Paulo', aliases: ['Damasco'], queries: ['Davi', 'Solomon', 'Profetas', 'Apóstolos', 'Apostles', 'Paulo', 'Paul', 'Palestine'], region: 'syria' },
  { name: 'Samaria', lat: 32.2764, lng: 35.1950, info: 'Capital do Reino do Norte (Israel)', aliases: ['Samaria'], queries: ['Profetas', 'Assyrian', 'Palestine', 'Ministério', 'Apóstolos'], region: 'samaria' },
  { name: 'Sodoma', lat: 31.1167, lng: 35.4000, info: 'Região tradicional das cidades da planície (sul do Mar Morto)', aliases: ['Sodoma', 'Gomorra'], queries: ['Patriarcas', 'Patriarchs', 'Canaan', 'Moses'], region: 'deadsea' },

  // Patriarcas, Êxodo e Deserto
  { name: 'Ur', lat: 30.9628, lng: 46.1031, info: 'Ur dos Caldeus, cidade natal de Abraão na Mesopotâmia', aliases: ['Ur'], caseSensitive: true, queries: ['Patriarcas', 'Patriarchs', 'Empires', 'Babylonian', 'Ancient World'], region: 'mesopotamia' },
  { name: 'Harã', lat: 36.8667, lng: 39.0333, info: 'Cidade na Alta Mesopotâmia onde viveu a família de Abraão', aliases: ['Harã'], queries: ['Patriarcas', 'Patriarchs', 'Canaan', 'Empires'], region: 'mesopotamia' },
  { name: 'Canaã', lat: 31.9500, lng: 35.2000, info: 'Terra prometida entre o Jordão e o Mediterrâneo', aliases: ['Canaã'], queries: ['Canaã', 'Canaan', 'Patriarcas', 'Patriarchs', 'Êxodo', 'Sojourn'], region: 'canaan' },
  { name: 'Egito', lat: 30.0444, lng: 31.2357, info: 'Terra do Nilo (José, Êxodo e refúgio da sagrada família)', aliases: ['Egito'], queries: ['Êxodo', 'Journeyings', 'Sojourn', 'Patriarcas', 'Empires', 'Moses'], region: 'egypt' },
  { name: 'Gósen', lat: 30.7865, lng: 31.8300, info: 'Região oriental do Delta do Nilo habitada pelos hebreus', aliases: ['Gósen', 'Gósem'], queries: ['Êxodo', 'Journeyings', 'Sojourn', 'Moses'], region: 'egypt' },
  { name: 'Mênfis', lat: 29.8447, lng: 31.2508, info: 'Antiga capital do Baixo Egito (Nofe)', aliases: ['Mênfis', 'Nofe'], queries: ['Êxodo', 'Sojourn', 'Empires', 'Assyrian', 'Babylonian'], region: 'egypt' },
  { name: 'Sinai', lat: 28.5392, lng: 33.9750, info: 'Península e monte da entrega da Lei a Moisés', aliases: ['Sinai', 'Horebe'], queries: ['Êxodo', 'Journeyings', 'Sojourn', 'Moses'], region: 'sinai' },
  { name: 'Cades-Barneia', lat: 30.6486, lng: 34.4214, info: 'Oásis no deserto de Parã, base durante o Êxodo', aliases: ['Cades-Barneia', 'Cades'], queries: ['Êxodo', 'Journeyings', 'Sojourn', 'Moses'], region: 'sinai' },
  { name: 'Midiã', lat: 28.5000, lng: 35.0100, info: 'Território a leste do Golfo de Ácaba', aliases: ['Midiã'], queries: ['Êxodo', 'Journeyings', 'Sojourn', 'Moses'], region: 'sinai' },
  { name: 'Edom', lat: 30.3285, lng: 35.4444, info: 'Região montanhosa de Seir ao sul do Mar Morto', aliases: ['Edom', 'Seir', 'Bozra'], queries: ['Êxodo', 'Journeyings', 'Davi', 'Solomon', 'Palestine'], region: 'transjordan' },
  { name: 'Moabe', lat: 31.1833, lng: 35.7000, info: 'Planalto a leste do Mar Morto', aliases: ['Moabe'], queries: ['Êxodo', 'Journeyings', 'Tribos', 'Davi', 'Palestine'], region: 'transjordan' },
  { name: 'Amom', lat: 31.9539, lng: 35.9106, info: 'Reino dos amonitas (Rabá / atual Amã)', aliases: ['Amom', 'Rabá'], queries: ['Tribos', 'Davi', 'Solomon', 'Palestine'], region: 'transjordan' },
  { name: 'Gileade', lat: 32.3333, lng: 35.7500, info: 'Região montanhosa a leste do rio Jordão', aliases: ['Gileade'], queries: ['Tribos', 'Tribes', 'Judges', 'Davi', 'Palestine'], region: 'transjordan' },
  { name: 'Basã', lat: 32.8500, lng: 36.1000, info: 'Planalto fértil a nordeste do Mar da Galileia', aliases: ['Basã'], queries: ['Tribos', 'Tribes', 'Palestine', 'Solomon'], region: 'transjordan' },

  // Impérios e Regiões do Antigo Oriente
  { name: 'Babilônia', lat: 32.5422, lng: 44.4211, info: 'Capital do Império Babilônico junto ao Eufrates (Iraque)', aliases: ['Babilônia', 'Babel', 'Caldeia', 'Sinar'], queries: ['Babilônico', 'Babylonian', 'Assírio', 'Empires', 'Ancient World', 'Roman'], region: 'babylon' },
  { name: 'Nínive', lat: 36.3594, lng: 43.1528, info: 'Capital do Império Assírio junto ao rio Tigre', aliases: ['Nínive'], queries: ['Assírio', 'Assyrian', 'Babylonian', 'Empires', 'Profetas'], region: 'assyria' },
  { name: 'Assíria', lat: 35.4567, lng: 43.2606, info: 'Região central do Império Assírio no norte da Mesopotâmia', aliases: ['Assíria'], queries: ['Assírio', 'Assyrian', 'Empires', 'Profetas'], region: 'assyria' },
  { name: 'Pérsia', lat: 32.1892, lng: 48.2578, info: 'Império Medo-Persa e capital de inverno Susã (Ester/Neemias)', aliases: ['Pérsia', 'Susã', 'Média', 'Elão'], queries: ['Persian', 'Medo-Persian', 'Babylonian', 'Empires'], region: 'persia' },
  { name: 'Carquemis', lat: 36.8294, lng: 38.0156, info: 'Fortaleza estratégica no Alto Eufrates', aliases: ['Carquemis'], queries: ['Assírio', 'Assyrian', 'Babylonian', 'Empires'], region: 'mesopotamia' },
  { name: 'Ararate', lat: 39.7024, lng: 44.2991, info: 'Montes de Ararate no leste da Anatólia', aliases: ['Ararate'], queries: ['Noah', 'Ancient World', 'Patriarcas', 'Empires'], region: 'ancient' },
  { name: 'Mesopotâmia', lat: 35.5000, lng: 41.0000, info: 'Terra entre os rios Tigre e Eufrates (Arã-Naaraim)', aliases: ['Mesopotâmia', 'Padã-Arã'], queries: ['Patriarcas', 'Patriarchs', 'Empires', 'Babylonian'], region: 'mesopotamia' },
  { name: 'Síria', lat: 34.8021, lng: 38.9968, info: 'Região de Arã ao norte de Israel', aliases: ['Síria', 'Arã'], queries: ['Profetas', 'Davi', 'Solomon', 'Palestine', 'Paulo', 'Paul'], region: 'syria' },
  { name: 'Fenícia', lat: 33.8547, lng: 35.5018, info: 'Faixa costeira marítima de Tiro e Sidom', aliases: ['Fenícia'], queries: ['Phoenicia', 'Palestine', 'Apóstolos', 'Paulo'], region: 'phoenicia' },
  { name: 'Arábia', lat: 24.5000, lng: 43.0000, info: 'Península Arábica ao sul e leste de Israel', aliases: ['Arábia', 'Sabá'], queries: ['Ancient World', 'Empires', 'Solomon', 'Paulo'], region: 'arabia' },
  { name: 'Etiópia', lat: 17.5000, lng: 33.5000, info: 'Reino de Cuxe / Núbia ao sul do Egito', aliases: ['Etiópia', 'Cuxe'], queries: ['Ancient World', 'Noah', 'Empires', 'Roman'], region: 'africa' },
  { name: 'Líbia', lat: 32.8250, lng: 21.8578, info: 'Região de Cirene no norte da África', aliases: ['Líbia', 'Cirene'], queries: ['Roman', 'Romano', 'Mediterranean', 'Ancient World'], region: 'africa' },
  { name: 'Társis', lat: 36.5297, lng: -6.2927, info: 'Porto ocidental distante do comércio mediterrâneo', aliases: ['Társis'], queries: ['Ancient World', 'Noah', 'Empires', 'Mediterranean'], region: 'mediterranean' },

  // Regiões da Palestina no NT
  { name: 'Galileia', lat: 32.8000, lng: 35.4000, info: 'Província do norte da Palestina no tempo de Jesus', aliases: ['Galileia', 'Galiléia'], queries: ['Galilean', 'Ministério', 'Life of Christ', 'Palestine', 'Herod'], region: 'galilee' },
  { name: 'Judeia', lat: 31.6500, lng: 35.1500, info: 'Província do sul da Palestina, centrada em Jerusalém', aliases: ['Judeia', 'Judéia'], queries: ['Judean', 'Ministério', 'Life of Christ', 'Palestine', 'Herod'], region: 'judea' },
  { name: 'Pereia', lat: 32.0000, lng: 35.7000, info: 'Região a leste do rio Jordão sob Herodes Antipas', aliases: ['Pereia', 'Peréia'], queries: ['Perean', 'Ministério', 'Life of Christ', 'Palestine', 'Herod'], region: 'transjordan' },
  { name: 'Decápolis', lat: 32.5500, lng: 35.8500, info: 'Liga de dez cidades helenísticas a leste do Jordão', aliases: ['Decápolis'], queries: ['Ministério', 'Life of Christ', 'Herod', 'Palestine'], region: 'galilee' },
  { name: 'Idumeia', lat: 31.3500, lng: 34.9500, info: 'Território ao sul da Judeia', aliases: ['Idumeia', 'Iduméia'], queries: ['Herod', 'Palestine', 'Ministério'], region: 'negev' },

  // Viagens de Paulo, Atos e Apocalipse
  { name: 'Antioquia', lat: 36.2021, lng: 36.1604, info: 'Antioquia da Síria — base das viagens missionárias de Paulo', aliases: ['Antioquia'], queries: ['Paulo', 'Paul', 'Apóstolos', 'Apostles', 'Apostolic', 'Mediterranean'], region: 'paul' },
  { name: 'Tarso', lat: 36.9165, lng: 34.8952, info: 'Capital da Cilícia e cidade natal do apóstolo Paulo', aliases: ['Tarso'], queries: ['Paulo', 'Paul', 'Apóstolos', 'Apostles', 'Apostolic'], region: 'paul' },
  { name: 'Chipre', lat: 35.1264, lng: 33.4299, info: 'Ilha mediterrânea visitada na 1ª viagem de Paulo e Barnabé', aliases: ['Chipre', 'Salamina', 'Pafos'], queries: ['First Missionary', 'Paulo', 'Paul', 'Apóstolos', 'Mediterranean'], region: 'paul' },
  { name: 'Perge', lat: 36.9608, lng: 30.8533, info: 'Cidade da Panfília na 1ª viagem missionária', aliases: ['Perge', 'Panfília', 'Atália'], queries: ['First Missionary', 'Paulo', 'Paul'], region: 'paul' },
  { name: 'Icônio', lat: 37.8716, lng: 32.4846, info: 'Cidade da Ásia Menor evangelizada por Paulo e Barnabé', aliases: ['Icônio'], queries: ['First Missionary', 'Second Missionary', 'Paulo', 'Paul'], region: 'paul' },
  { name: 'Listra', lat: 37.5750, lng: 32.2389, info: 'Cidade da Licaônia (terra de Timóteo)', aliases: ['Listra', 'Derbe', 'Licaônia'], queries: ['First Missionary', 'Second Missionary', 'Paulo', 'Paul'], region: 'paul' },
  { name: 'Galácia', lat: 39.5000, lng: 32.5000, info: 'Região central da Ásia Menor (Epístola aos Gálatas)', aliases: ['Galácia', 'Frígia'], queries: ['Second Missionary', 'Third Missionary', 'Paulo', 'Paul', 'Roman'], region: 'paul' },
  { name: 'Trôade', lat: 39.7506, lng: 26.1567, info: 'Porto no mar Egeu onde Paulo teve a visão da Macedônia', aliases: ['Trôade', 'Mísia'], queries: ['Second Missionary', 'Third Missionary', 'Paulo', 'Paul'], region: 'paul' },
  { name: 'Macedônia', lat: 40.9000, lng: 23.5000, info: 'Província romana do norte da Grécia', aliases: ['Macedônia', 'Neápolis'], queries: ['Second Missionary', 'Third Missionary', 'Paulo', 'Paul', 'Alexander'], region: 'greece' },
  { name: 'Filipos', lat: 41.0131, lng: 24.2869, info: 'Primeira cidade da Europa evangelizada por Paulo', aliases: ['Filipos'], queries: ['Second Missionary', 'Third Missionary', 'Paulo', 'Paul'], region: 'greece' },
  { name: 'Tessalônica', lat: 40.6401, lng: 22.9444, info: 'Capital da Macedônia (Cartas aos Tessalonicenses)', aliases: ['Tessalônica', 'Bereia', 'Beréia'], queries: ['Second Missionary', 'Paulo', 'Paul'], region: 'greece' },
  { name: 'Atenas', lat: 37.9715, lng: 23.7257, info: 'Centro filosófico grego (discurso de Paulo no Areópago)', aliases: ['Atenas', 'Grécia', 'Acaia'], queries: ['Second Missionary', 'Greece', 'Paulo', 'Paul', 'Roman'], region: 'greece' },
  { name: 'Corinto', lat: 37.9056, lng: 22.8803, info: 'Grande porto da Acaia (Cartas aos Coríntios)', aliases: ['Corinto', 'Cencreia'], queries: ['Second Missionary', 'Third Missionary', 'Paulo', 'Paul', 'Greece'], region: 'greece' },
  { name: 'Éfeso', lat: 37.9411, lng: 27.3419, info: 'Capital da província da Ásia e 1ª das Sete Igrejas', aliases: ['Éfeso'], queries: ['Seven Churches', 'Third Missionary', 'Paulo', 'Paul', 'Greece'], region: 'asia' },
  { name: 'Esmirna', lat: 38.4237, lng: 27.1428, info: '2ª das Sete Igrejas da Ásia (Apocalipse)', aliases: ['Esmirna'], queries: ['Seven Churches', 'Greece', 'Paulo', 'Paul', 'Roman'], region: 'asia' },
  { name: 'Pérgamo', lat: 39.1325, lng: 27.1842, info: '3ª das Sete Igrejas da Ásia (Apocalipse)', aliases: ['Pérgamo'], queries: ['Seven Churches', 'Greece', 'Paulo', 'Paul'], region: 'asia' },
  { name: 'Tiatira', lat: 38.9183, lng: 27.8419, info: '4ª das Sete Igrejas da Ásia (Apocalipse)', aliases: ['Tiatira'], queries: ['Seven Churches', 'Greece', 'Paulo', 'Paul'], region: 'asia' },
  { name: 'Sardes', lat: 38.4883, lng: 28.0403, info: '5ª das Sete Igrejas da Ásia (Apocalipse)', aliases: ['Sardes'], queries: ['Seven Churches', 'Greece', 'Paulo', 'Paul'], region: 'asia' },
  { name: 'Filadélfia', lat: 38.3508, lng: 28.5172, info: '6ª das Sete Igrejas da Ásia (Apocalipse)', aliases: ['Filadélfia'], queries: ['Seven Churches', 'Greece', 'Paulo', 'Paul'], region: 'asia' },
  { name: 'Laodiceia', lat: 37.8358, lng: 29.1086, info: '7ª das Sete Igrejas da Ásia (vale do Lico)', aliases: ['Laodiceia', 'Laodicéia'], queries: ['Seven Churches', 'Greece', 'Paulo', 'Paul'], region: 'asia' },
  { name: 'Patmos', lat: 37.3106, lng: 26.5472, info: 'Ilha no mar Egeu onde João recebeu o Apocalipse', aliases: ['Patmos'], queries: ['Seven Churches', 'Greece', 'Roman', 'Romano'], region: 'asia' },
  { name: 'Colossos', lat: 37.7867, lng: 29.2617, info: 'Cidade na Frígia (Epístola aos Colossenses)', aliases: ['Colossos', 'Hierápolis'], queries: ['Third Missionary', 'Seven Churches', 'Paulo', 'Paul'], region: 'asia' },
  { name: 'Mileto', lat: 37.5308, lng: 27.2783, info: 'Porto na Jônia onde Paulo despediu-se dos anciãos de Éfeso', aliases: ['Mileto'], queries: ['Third Missionary', 'Paulo', 'Paul', 'Seven Churches'], region: 'asia' },
  { name: 'Ásia', lat: 38.5000, lng: 28.0000, info: 'Província romana da Ásia Menor (oeste da atual Turquia)', aliases: ['Ásia'], caseSensitive: true, queries: ['Seven Churches', 'Paulo', 'Paul', 'Roman', 'Mediterranean'], region: 'asia' },
  { name: 'Capadócia', lat: 38.6431, lng: 34.8289, info: 'Província do interior da Ásia Menor', aliases: ['Capadócia', 'Bitínia', 'Cilícia', 'Lícia'], queries: ['Paulo', 'Paul', 'Roman', 'Romano', 'Mediterranean'], region: 'asia' },
  { name: 'Creta', lat: 35.2401, lng: 24.8093, info: 'Ilha mediterrânea (viagem de Paulo e ministério de Tito)', aliases: ['Creta'], queries: ['Voyage to Rome', 'Last Journeys', 'Paulo', 'Paul', 'Mediterranean'], region: 'mediterranean' },
  { name: 'Malta', lat: 35.9375, lng: 14.3754, info: 'Ilha do naufrágio de Paulo a caminho de Roma (Melita)', aliases: ['Malta', 'Melita'], queries: ['Voyage to Rome', 'Paulo', 'Paul', 'Roman', 'Romano'], region: 'rome' },
  { name: 'Siracusa', lat: 37.0755, lng: 15.2866, info: 'Porto da Sicília na rota final de Paulo para Roma', aliases: ['Siracusa', 'Régio', 'Putéoli'], queries: ['Voyage to Rome', 'Paulo', 'Paul', 'Roman', 'Romano'], region: 'rome' },
  { name: 'Roma', lat: 41.8902, lng: 12.4922, info: 'Capital do Império Romano (Epístola aos Romanos)', aliases: ['Roma', 'Itália', 'Espanha'], queries: ['Voyage to Rome', 'Romano', 'Roman', 'Paulo', 'Paul'], region: 'rome' },
  { name: 'Alexandria', lat: 31.2001, lng: 29.9187, info: 'Grande metrópole cultural no Egito (Septuaginta e Apolo)', aliases: ['Alexandria'], queries: ['Roman', 'Romano', 'Alexander', 'Mediterranean'], region: 'egypt' },

  // Montes, Rios e Mares
  { name: 'Rio Jordão', lat: 32.1500, lng: 35.5600, info: 'Principal rio de Israel, ligando o Mar da Galileia ao Mar Morto', aliases: ['Jordão'], queries: ['Palestine', 'Physical', 'Tribos', 'Tribes', 'Ministério'], region: 'palestine' },
  { name: 'Rio Eufrates', lat: 34.4000, lng: 41.0000, info: 'Grande rio da Mesopotâmia', aliases: ['Eufrates'], queries: ['Patriarcas', 'Patriarchs', 'Babylonian', 'Assyrian', 'Empires'], region: 'mesopotamia' },
  { name: 'Rio Tigre', lat: 35.5000, lng: 43.3000, info: 'Rio oriental da Mesopotâmia (Hidequel)', aliases: ['Tigre', 'Hidequel'], caseSensitive: true, queries: ['Assyrian', 'Babylonian', 'Empires', 'Patriarcas'], region: 'mesopotamia' },
  { name: 'Rio Nilo', lat: 29.5000, lng: 31.2500, info: 'Principal rio do Egito', aliases: ['Nilo'], queries: ['Êxodo', 'Journeyings', 'Sojourn', 'Empires'], region: 'egypt' },
  { name: 'Mar Vermelho', lat: 27.9000, lng: 34.2000, info: 'Golfo de Suez / Mar dos Juncos na rota do Êxodo', aliases: ['Mar Vermelho', 'mar Vermelho'], queries: ['Êxodo', 'Journeyings', 'Sojourn', 'Moses'], region: 'sinai' },
  { name: 'Mar Morto', lat: 31.5000, lng: 35.5000, info: 'Mar Salgado no ponto mais baixo da superfície terrestre', aliases: ['Mar Morto', 'mar Morto', 'mar Salgado', 'Mar Salgado'], queries: ['Physical', 'Palestine', 'Tribos', 'Canaan'], region: 'deadsea' },
  { name: 'Mar da Galileia', lat: 32.8231, lng: 35.5831, info: 'Lago de Genesaré / Quinerete na Galileia', aliases: ['Mar da Galileia', 'mar da Galileia', 'mar da Galiléia', 'Genesaré', 'Quinerete'], queries: ['Galilean', 'Ministério', 'Life of Christ', 'Physical', 'Palestine'], region: 'galilee' },
  { name: 'Monte das Oliveiras', lat: 31.7780, lng: 35.2450, info: 'Monte imediatamente a leste da Cidade Velha de Jerusalém', aliases: ['Monte das Oliveiras', 'monte das Oliveiras'], queries: ['Jerusalém', 'Jerusalem', 'Passion'], region: 'jerusalem' },
  { name: 'Monte Carmelo', lat: 32.7333, lng: 35.0439, info: 'Cadeia costeira no norte de Israel (desafio de Elias)', aliases: ['Carmelo'], queries: ['Profetas', 'Physical', 'Palestine', 'Tribos'], region: 'north' },
  { name: 'Monte Hermom', lat: 33.4162, lng: 35.8570, info: 'Pico mais alto da região, no extremo norte de Israel', aliases: ['Hermom'], queries: ['Physical', 'Palestine', 'Tribos', 'Davi'], region: 'north' },
  { name: 'Monte Tabor', lat: 32.6872, lng: 35.3908, info: 'Monte isolado no vale de Jezreel (Baixa Galileia)', aliases: ['Tabor'], queries: ['Physical', 'Judges', 'Palestine', 'Tribos'], region: 'north' },
  { name: 'Monte Nebo', lat: 31.7683, lng: 35.7253, info: 'Monte em Moabe de onde Moisés avistou a Terra Prometida', aliases: ['Nebo', 'Pisga'], queries: ['Êxodo', 'Journeyings', 'Sojourn', 'Moses'], region: 'transjordan' },
  { name: 'Monte Sião', lat: 31.7717, lng: 35.2292, info: 'Colina histórica de Jerusalém', aliases: ['Sião', 'Moriá'], queries: ['Jerusalém', 'Jerusalem', 'Davi', 'David'], region: 'jerusalem' },
  { name: 'Líbano', lat: 34.0000, lng: 35.8500, info: 'Cordilheira famosa pelos cedros (ao norte de Israel)', aliases: ['Líbano'], queries: ['Physical', 'Palestine', 'Solomon', 'Davi', 'Phoenicia'], region: 'phoenicia' }
];

// Bounds aproximados de fallback para mapas sem tabela `map` (ex.: atlas.bok.mybible)
const FALLBACK_OVERLAY_BOUNDS = [
  { match: ['jerusalem', 'jerusal'], bounds: { south: 31.755, west: 35.205, north: 31.800, east: 35.260 } },
  { match: ['roman', 'romano', 'imperio romano'], bounds: { south: 24.0, west: -10.0, north: 56.0, east: 49.0 } },
  { match: ['paulo', 'paul', 'apostolos', 'apostles', 'apostolic', 'mediterranean', 'greece', 'seven churches'], bounds: { south: 30.0, west: 11.0, north: 43.5, east: 38.5 } },
  { match: ['alexander', 'persian', 'medo-persian', 'babylonian', 'assyrian', 'babilon', 'assir', 'empires', 'ancient world', 'noah', 'patriarca', 'patriarch'], bounds: { south: 23.0, west: 25.0, north: 43.5, east: 58.0 } },
  { match: ['exodo', 'sojourn', 'journeyings', 'moses', 'sinai'], bounds: { south: 27.2, west: 29.5, north: 33.6, east: 37.2 } },
  { match: ['galilean', 'galileia'], bounds: { south: 32.35, west: 34.85, north: 33.35, east: 35.95 } },
  { match: ['judean', 'passion', 'perean'], bounds: { south: 31.15, west: 34.55, north: 32.30, east: 35.95 } },
  { match: ['palestine', 'canaan', 'canaa', 'tribos', 'tribes', 'judges', 'saul', 'davi', 'david', 'salom', 'solomon', 'profetas', 'herod', 'ministerio', 'life of christ', 'physical'], bounds: { south: 29.4, west: 33.8, north: 33.8, east: 37.0 } }
];

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAscii(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function stripHtmlToPlainText(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const COMPILED_PLACES = PLACE_CATALOG.map((entry) => {
  const sortedAliases = entry.aliases.slice().sort((a, b) => b.length - a.length);
  const patternBody = sortedAliases.map(escapeRegExp).join('|');
  const flags = entry.caseSensitive ? 'u' : 'iu';
  return {
    ...entry,
    regex: new RegExp(`(?<![\\p{L}\\p{N}])(?:${patternBody})(?![\\p{L}\\p{N}])`, flags)
  };
});

export function getAllKnownPlaces() {
  return PLACE_CATALOG.slice();
}

export function findPlaceByName(query) {
  const clean = normalizeAscii(query).trim();
  if (!clean) return null;
  for (const place of PLACE_CATALOG) {
    if (normalizeAscii(place.name) === clean) return place;
    for (const a of place.aliases) {
      if (normalizeAscii(a) === clean) return place;
    }
  }
  return null;
}

export function estimateBoundsForMapTitle(title) {
  const norm = normalizeAscii(title);
  if (!norm) return null;
  for (const entry of FALLBACK_OVERLAY_BOUNDS) {
    for (const kw of entry.match) {
      if (norm.includes(kw)) {
        return { ...entry.bounds, estimated: true };
      }
    }
  }
  return { south: 29.4, west: 33.8, north: 33.8, east: 37.0, estimated: true };
}

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
          lat: place.lat,
          lng: place.lng,
          info: place.info,
          queries: place.queries,
          region: place.region
        });
      }
      if (found.length >= 6) break;
    }
  }

  return found;
}
