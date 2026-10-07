import type { LibraryHint, SavedSentence } from '../types/sentenceLibrary'

/** [russian span, french lemma, french span, russian lemma] */
type Mapping = readonly [string, string, string, string]

interface Clause {
  ru: string
  fr: string
  dict: Mapping[]
  ctx?: Mapping
}

interface TimePhrase {
  ru: string
  fr: string
  ctx: Mapping
}

const CLAUSES: Clause[] = [
  { ru: 'Мы встречаемся у вокзала', fr: 'Nous nous retrouvons près de la gare', dict: [['вокзала', 'gare', 'gare', 'вокзал']], ctx: ['встречаемся', 'se retrouver', 'Nous nous retrouvons', 'встречаться'] },
  { ru: 'Я покупаю хлеб в магазине', fr: 'J’achète du pain au magasin', dict: [['хлеб', 'pain', 'pain', 'хлеб'], ['магазине', 'magasin', 'magasin', 'магазин']], ctx: ['покупаю', 'acheter', 'J’achète', 'покупать'] },
  { ru: 'Она читает книгу в парке', fr: 'Elle lit un livre au parc', dict: [['книгу', 'livre', 'livre', 'книга'], ['парке', 'parc', 'parc', 'парк']], ctx: ['читает', 'lire', 'lit', 'читать'] },
  { ru: 'Мой брат работает в больнице', fr: 'Mon frère travaille à l’hôpital', dict: [['брат', 'frère', 'frère', 'брат'], ['больнице', 'hôpital', 'hôpital', 'больница']], ctx: ['работает', 'travailler', 'travaille', 'работать'] },
  { ru: 'Дети играют в саду', fr: 'Les enfants jouent dans le jardin', dict: [['Дети', 'enfant', 'enfants', 'ребёнок'], ['саду', 'jardin', 'jardin', 'сад']], ctx: ['играют', 'jouer', 'jouent', 'играть'] },
  { ru: 'Мы пьём чай на кухне', fr: 'Nous buvons du thé dans la cuisine', dict: [['чай', 'thé', 'thé', 'чай'], ['кухне', 'cuisine', 'cuisine', 'кухня']], ctx: ['пьём', 'boire', 'buvons', 'пить'] },
  { ru: 'Я жду автобус на остановке', fr: 'J’attends le bus à l’arrêt de bus', dict: [['жду', 'attendre', 'J’attends', 'ждать'], ['остановке', 'arrêt de bus', 'arrêt de bus', 'автобусная остановка']] },
  { ru: 'Сестра пишет письмо подруге', fr: 'Ma sœur écrit une lettre à son amie', dict: [['Сестра', 'sœur', 'sœur', 'сестра'], ['письмо', 'lettre', 'lettre', 'письмо']], ctx: ['пишет', 'écrire', 'écrit', 'писать'] },
  { ru: 'Отец готовит суп', fr: 'Mon père prépare la soupe', dict: [['Отец', 'père', 'père', 'отец'], ['суп', 'soupe', 'soupe', 'суп']], ctx: ['готовит', 'préparer', 'prépare', 'готовить'] },
  { ru: 'Я забываю ключи дома', fr: 'J’oublie mes clés à la maison', dict: [['забываю', 'oublier', 'J’oublie', 'забывать'], ['ключи', 'clé', 'clés', 'ключ']], ctx: ['дома', 'à la maison', 'à la maison', 'дома'] },
  { ru: 'Мы гуляем по лесу', fr: 'Nous nous promenons dans la forêt', dict: [['лесу', 'forêt', 'forêt', 'лес']], ctx: ['гуляем', 'se promener', 'Nous nous promenons', 'гулять'] },
  { ru: 'Она покупает билет на поезд', fr: 'Elle achète un billet de train', dict: [['билет', 'billet', 'billet', 'билет'], ['поезд', 'train', 'train', 'поезд']], ctx: ['покупает', 'acheter', 'achète', 'покупать'] },
  { ru: 'Мама открывает окно', fr: 'Maman ouvre la fenêtre', dict: [['открывает', 'ouvrir', 'ouvre', 'открывать'], ['окно', 'fenêtre', 'fenêtre', 'окно']], ctx: ['Мама', 'maman', 'Maman', 'мама'] },
  { ru: 'Я слушаю музыку в машине', fr: 'J’écoute de la musique dans la voiture', dict: [['музыку', 'musique', 'musique', 'музыка'], ['машине', 'voiture', 'voiture', 'машина']], ctx: ['слушаю', 'écouter', 'J’écoute', 'слушать'] },
  { ru: 'Друзья ждут нас у музея', fr: 'Nos amis nous attendent devant le musée', dict: [['Друзья', 'ami', 'amis', 'друг'], ['музея', 'musée', 'musée', 'музей']], ctx: ['ждут', 'attendre', 'attendent', 'ждать'] },
  { ru: 'Я плаваю в озере', fr: 'Je nage dans le lac', dict: [['плаваю', 'nager', 'nage', 'плавать'], ['озере', 'lac', 'lac', 'озеро']] },
  { ru: 'Врач отвечает на вопрос', fr: 'Le médecin répond à la question', dict: [['Врач', 'médecin', 'médecin', 'врач'], ['вопрос', 'question', 'question', 'вопрос']], ctx: ['отвечает на', 'répondre à', 'répond à', 'отвечать на'] },
  { ru: 'Мы занимаемся вместе', fr: 'Nous étudions ensemble', dict: [['вместе', 'ensemble', 'ensemble', 'вместе']], ctx: ['занимаемся', 'étudier', 'étudions', 'заниматься'] },
  { ru: 'Он ищет свой телефон', fr: 'Il cherche son téléphone', dict: [['ищет', 'chercher', 'cherche', 'искать'], ['телефон', 'téléphone', 'téléphone', 'телефон']] },
  { ru: 'Я учу новые слова', fr: 'J’apprends de nouveaux mots', dict: [['учу', 'apprendre', 'J’apprends', 'учить'], ['слова', 'mot', 'mots', 'слово']], ctx: ['новые', 'nouveau', 'nouveaux', 'новый'] },
]

const TIMES: TimePhrase[] = [
  { ru: 'сегодня вечером', fr: 'ce soir', ctx: ['сегодня вечером', 'ce soir', 'ce soir', 'сегодня вечером'] },
  { ru: 'завтра утром', fr: 'demain matin', ctx: ['завтра утром', 'demain matin', 'demain matin', 'завтра утром'] },
  { ru: 'в субботу', fr: 'samedi', ctx: ['в субботу', 'samedi', 'samedi', 'в субботу'] },
  { ru: 'в пятницу', fr: 'vendredi', ctx: ['в пятницу', 'vendredi', 'vendredi', 'в пятницу'] },
  { ru: 'каждое утро', fr: 'chaque matin', ctx: ['каждое утро', 'chaque matin', 'chaque matin', 'каждое утро'] },
  { ru: 'на этой неделе', fr: 'cette semaine', ctx: ['на этой неделе', 'cette semaine', 'cette semaine', 'на этой неделе'] },
  { ru: 'в восемь часов', fr: 'à huit heures', ctx: ['в восемь часов', 'à huit heures', 'à huit heures', 'в восемь часов'] },
  { ru: 'летом', fr: 'en été', ctx: ['летом', 'en été', 'en été', 'летом'] },
  { ru: 'по выходным', fr: 'le week-end', ctx: ['по выходным', 'le week-end', 'le week-end', 'по выходным'] },
  { ru: 'иногда', fr: 'parfois', ctx: ['иногда', 'parfois', 'parfois', 'иногда'] },
  { ru: 'рано утром', fr: 'tôt le matin', ctx: ['рано утром', 'tôt le matin', 'tôt le matin', 'рано утром'] },
  { ru: 'в понедельник', fr: 'lundi', ctx: ['в понедельник', 'lundi', 'lundi', 'в понедельник'] },
]

const isPhrase = (text: string) => /\s/.test(text.trim())

function hint(id: string, map: Mapping, reverse: boolean, note?: string): LibraryHint {
  const [ruSpan, frLemma, frSpan, ruLemma] = map
  const source = reverse ? ruSpan : frSpan
  const target = reverse ? frLemma : ruLemma
  return { id, source, target, kind: isPhrase(source) || isPhrase(target) ? 'phrase' : 'word', note }
}

const BASE_DATE = Date.UTC(2026, 9, 5)
const dayIso = (daysAgo: number) => new Date(BASE_DATE - daysAgo * 86400000).toISOString()

function generated(): SavedSentence[] {
  const list: SavedSentence[] = []
  let reverseCounter = 0
  for (let i = 0; i < CLAUSES.length * TIMES.length; i += 1) {
    const clause = CLAUSES[i % CLAUSES.length]
    const time = TIMES[Math.floor(i / CLAUSES.length)]
    const reverse = i % 6 !== 5
    const legacy = i % 7 === 0
    const r = reverse ? reverseCounter++ : -1
    const ru = `${clause.ru} ${time.ru}.`
    const fr = `${clause.fr} ${time.fr}.`
    const contextMaps = legacy ? [] : [clause.ctx, time.ctx].filter((m): m is Mapping => Boolean(m))
    list.push({
      id: `ss-${i + 1}`,
      dictionaryId: 'dict-fr-ru',
      direction: reverse ? 'reverse' : 'forward',
      sentenceLanguage: reverse ? 'ru' : 'fr',
      answerLanguage: reverse ? 'fr' : 'ru',
      sentence: reverse ? ru : fr,
      reference: reverse ? fr : ru,
      dictionaryHints: clause.dict.map((m, k) => hint(`ss-${i + 1}-d${k}`, m, reverse)),
      contextHints: contextMaps.map((m, k) => hint(`ss-${i + 1}-c${k}`, m, reverse)),
      enrichment: legacy ? 'legacy' : 'rich',
      createdAt: dayIso(8 + Math.floor(i / 2)),
      ownership: i % 4 === 0 ? 'mine' : 'shared',
      outdated: reverse ? r % 17 === 7 : i % 23 === 11,
      archivedByMe: reverse ? r % 10 === 3 && r < 140 : i % 29 === 5,
      globallyArchived: reverse ? r % 10 === 7 && r < 60 : false,
    })
  }
  return list
}

const handWritten: SavedSentence[] = [
  {
    id: 'ss-help',
    dictionaryId: 'dict-fr-ru',
    direction: 'reverse',
    sentenceLanguage: 'ru',
    answerLanguage: 'fr',
    sentence: 'Мне нужна помощь после работы.',
    reference: 'J’ai besoin d’aide après le travail.',
    dictionaryHints: [{ id: 'ss-help-d0', source: 'после работы', target: 'après le travail', kind: 'phrase' }],
    contextHints: [
      { id: 'ss-help-c0', source: 'нужна', target: 'avoir besoin de', kind: 'phrase', note: 'нуждаться в' },
      { id: 'ss-help-c1', source: 'помощь', target: 'aide', kind: 'word' },
    ],
    enrichment: 'rich',
    createdAt: dayIso(0),
    ownership: 'shared',
    outdated: false,
    archivedByMe: false,
    globallyArchived: false,
  },
  {
    id: 'ss-legacy',
    dictionaryId: 'dict-fr-ru',
    direction: 'reverse',
    sentenceLanguage: 'ru',
    answerLanguage: 'fr',
    sentence: 'Я еду на вокзал завтра утром.',
    reference: 'Je vais à la gare demain matin.',
    dictionaryHints: [
      { id: 'ss-legacy-d0', source: 'вокзал', target: 'gare', kind: 'word' },
      { id: 'ss-legacy-d1', source: 'завтра', target: 'demain', kind: 'word' },
    ],
    contextHints: [],
    enrichment: 'legacy',
    createdAt: dayIso(1),
    ownership: 'mine',
    outdated: false,
    archivedByMe: false,
    globallyArchived: false,
  },
  {
    id: 'ss-long',
    dictionaryId: 'dict-fr-ru',
    direction: 'reverse',
    sentenceLanguage: 'ru',
    answerLanguage: 'fr',
    sentence:
      'Когда на улице идёт сильный дождь, мы с соседкой обычно остаёмся дома, пьём горячий чай на кухне и долго разговариваем о путешествиях, которые хотим совершить следующим летом.',
    reference:
      'Quand il pleut fort dehors, ma voisine et moi restons généralement à la maison, nous buvons du thé chaud dans la cuisine et nous parlons longtemps des voyages que nous voulons faire l’été prochain.',
    dictionaryHints: [
      { id: 'ss-long-d0', source: 'дождь', target: 'pluie', kind: 'word' },
      { id: 'ss-long-d1', source: 'чай', target: 'thé', kind: 'word' },
      { id: 'ss-long-d2', source: 'кухне', target: 'cuisine', kind: 'word' },
      { id: 'ss-long-d3', source: 'путешествиях', target: 'voyage', kind: 'word' },
    ],
    contextHints: [
      { id: 'ss-long-c0', source: 'идёт сильный дождь', target: 'il pleut fort', kind: 'phrase', note: 'про погоду: «идёт дождь» — «il pleut»' },
      { id: 'ss-long-c1', source: 'остаёмся дома', target: 'rester à la maison', kind: 'phrase' },
      { id: 'ss-long-c2', source: 'следующим летом', target: 'l’été prochain', kind: 'phrase' },
    ],
    enrichment: 'rich',
    createdAt: dayIso(2),
    ownership: 'shared',
    outdated: false,
    archivedByMe: false,
    globallyArchived: false,
  },
  {
    id: 'ss-longword',
    dictionaryId: 'dict-fr-ru',
    direction: 'reverse',
    sentenceLanguage: 'ru',
    answerLanguage: 'fr',
    sentence: 'Достопримечательности старого города производят неизгладимое впечатление.',
    reference: 'Les curiosités de la vieille ville font une impression inoubliable.',
    dictionaryHints: [{ id: 'ss-longword-d0', source: 'города', target: 'ville', kind: 'word' }],
    contextHints: [
      { id: 'ss-longword-c0', source: 'Достопримечательности', target: 'curiosités', kind: 'word' },
      { id: 'ss-longword-c1', source: 'производят впечатление', target: 'faire impression', kind: 'phrase', note: 'выражение целиком' },
    ],
    enrichment: 'rich',
    createdAt: dayIso(3),
    ownership: 'mine',
    outdated: false,
    archivedByMe: false,
    globallyArchived: false,
  },
  {
    id: 'ss-mixed',
    dictionaryId: 'dict-fr-ru',
    direction: 'reverse',
    sentenceLanguage: 'ru',
    answerLanguage: 'fr',
    sentence: 'Мой друг написал «مرحبا» на открытке.',
    reference: 'Mon ami a écrit « مرحبا » sur la carte.',
    dictionaryHints: [{ id: 'ss-mixed-d0', source: 'друг', target: 'ami', kind: 'word' }],
    contextHints: [
      { id: 'ss-mixed-c0', source: 'مرحبا', target: 'مرحبا', kind: 'word', note: 'арабское приветствие, не переводится' },
      { id: 'ss-mixed-c1', source: 'открытке', target: 'carte', kind: 'word' },
    ],
    enrichment: 'rich',
    createdAt: dayIso(3),
    ownership: 'shared',
    outdated: false,
    archivedByMe: false,
    globallyArchived: false,
  },
  {
    id: 'ss-outdated',
    dictionaryId: 'dict-fr-ru',
    direction: 'reverse',
    sentenceLanguage: 'ru',
    answerLanguage: 'fr',
    sentence: 'Мой друг приезжает завтра.',
    reference: 'Mon ami arrive demain.',
    dictionaryHints: [
      { id: 'ss-outdated-d0', source: 'друг', target: 'ami', kind: 'word' },
      { id: 'ss-outdated-d1', source: 'приезжает', target: 'arriver', kind: 'word' },
      { id: 'ss-outdated-d2', source: 'завтра', target: 'demain', kind: 'word' },
    ],
    contextHints: [],
    enrichment: 'legacy',
    createdAt: dayIso(4),
    ownership: 'shared',
    outdated: true,
    archivedByMe: false,
    globallyArchived: false,
  },
  {
    id: 'ss-mine-archived',
    dictionaryId: 'dict-fr-ru',
    direction: 'reverse',
    sentenceLanguage: 'ru',
    answerLanguage: 'fr',
    sentence: 'Я пью кофе по дороге на работу.',
    reference: 'Je bois un café en chemin vers le travail.',
    dictionaryHints: [
      { id: 'ss-mine-archived-d0', source: 'кофе', target: 'café', kind: 'word' },
      { id: 'ss-mine-archived-d1', source: 'по дороге', target: 'en chemin', kind: 'phrase' },
    ],
    contextHints: [{ id: 'ss-mine-archived-c0', source: 'пью', target: 'boire', kind: 'word' }],
    enrichment: 'rich',
    createdAt: dayIso(5),
    ownership: 'mine',
    outdated: false,
    archivedByMe: true,
    globallyArchived: false,
  },
  {
    id: 'ss-global',
    dictionaryId: 'dict-fr-ru',
    direction: 'reverse',
    sentenceLanguage: 'ru',
    answerLanguage: 'fr',
    sentence: 'На вокзале всегда много людей.',
    reference: 'Il y a toujours beaucoup de monde à la gare.',
    dictionaryHints: [{ id: 'ss-global-d0', source: 'вокзале', target: 'gare', kind: 'word' }],
    contextHints: [{ id: 'ss-global-c0', source: 'много людей', target: 'beaucoup de monde', kind: 'phrase' }],
    enrichment: 'rich',
    createdAt: dayIso(6),
    ownership: 'shared',
    outdated: false,
    archivedByMe: false,
    globallyArchived: true,
  },
  {
    id: 'ss-combo',
    dictionaryId: 'dict-fr-ru',
    direction: 'reverse',
    sentenceLanguage: 'ru',
    answerLanguage: 'fr',
    sentence: 'Дождь начинается после обеда.',
    reference: 'La pluie commence après le déjeuner.',
    dictionaryHints: [{ id: 'ss-combo-d0', source: 'Дождь', target: 'pluie', kind: 'word' }],
    contextHints: [{ id: 'ss-combo-c0', source: 'после обеда', target: 'après le déjeuner', kind: 'phrase' }],
    enrichment: 'rich',
    createdAt: dayIso(7),
    ownership: 'shared',
    outdated: true,
    archivedByMe: true,
    globallyArchived: true,
  },
  {
    id: 'ss-fr',
    dictionaryId: 'dict-fr-ru',
    direction: 'forward',
    sentenceLanguage: 'fr',
    answerLanguage: 'ru',
    sentence: 'Je prends un café avec mon voisin avant le travail.',
    reference: 'Я пью кофе с соседом перед работой.',
    dictionaryHints: [
      { id: 'ss-fr-d0', source: 'café', target: 'кофе', kind: 'word' },
      { id: 'ss-fr-d1', source: 'travail', target: 'работа', kind: 'word' },
    ],
    contextHints: [{ id: 'ss-fr-c0', source: 'prends un café', target: 'выпить кофе', kind: 'phrase', note: 'prendre un café — выпить кофе' }],
    enrichment: 'rich',
    createdAt: dayIso(1),
    ownership: 'mine',
    outdated: false,
    archivedByMe: false,
    globallyArchived: false,
  },
]

/** About 250 saved examples for “Français · quotidien”, newest first. */
export const savedSentences: SavedSentence[] = [...handWritten, ...generated()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

