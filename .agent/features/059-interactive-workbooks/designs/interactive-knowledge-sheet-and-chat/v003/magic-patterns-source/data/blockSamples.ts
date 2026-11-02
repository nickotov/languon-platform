import type { AudioBlock, BilingualBlock, ExercisesBlock, GrammarBlock, VideoBlock, VocabEntry, VocabularyBlock } from '../types/blocks';

export const grammarBlock: GrammarBlock = {
  id: 'b-grammar-faire',
  type: 'grammar',
  title: 'Faire + article + chore',
  rule: 'Most household chores use the verb faire with a definite article: you “do the cleaning”, “do the dishes”. The article follows the noun’s gender and number and is never dropped.',
  pattern: 'faire + le / la / les + nom de la tâche',
  examples: [
    { id: 'g-ex-1', source: 'Je fais la vaisselle après le dîner.', translation: 'Я мою посуду после ужина.' },
    { id: 'g-ex-2', source: 'Il fait le ménage le samedi.', translation: 'Он убирается по субботам.' },
    { id: 'g-ex-3', source: 'Nous faisons les courses ensemble.', translation: 'Мы вместе ходим за покупками.' },
  ],
  mistakes: [
    { id: 'g-m-1', wrong: 'Je fais ménage.', right: 'Je fais le ménage.', reason: 'The article is required after faire.' },
    { id: 'g-m-2', wrong: 'Je fais la ménage.', right: 'Je fais le ménage.', reason: '“Ménage” is masculine.' },
  ],
};

export const bilingualBlock: BilingualBlock = {
  id: 'b-text-samedi',
  type: 'bilingual',
  title: 'Le samedi à la maison',
  prepared: ['ru', 'en'],
  segments: [
    {
      id: 's-1',
      source: 'Le samedi matin, toute la famille fait le ménage.',
      translations: { ru: 'В субботу утром вся семья делает уборку.', en: 'On Saturday morning, the whole family does the cleaning.' },
    },
    {
      id: 's-2',
      source: 'Ma sœur passe l’aspirateur et je lave le carrelage de la cuisine.',
      translations: { ru: 'Сестра пылесосит, а я мою плитку на кухне.', en: 'My sister vacuums and I wash the kitchen tiles.' },
    },
    {
      id: 's-3',
      source: 'Papa fait les courses et achète la nourriture pour animaux.',
      translations: { ru: 'Папа ходит за покупками и покупает корм для животных.', en: 'Dad does the shopping and buys the pet food.' },
    },
    {
      id: 's-4',
      source: 'Le soir, nous mangeons du poisson, et c’est une vraie joie.',
      translations: { ru: 'Вечером мы едим рыбу, и это настоящая радость.', en: 'In the evening we eat fish, and it’s a real joy.' },
    },
  ],
};

export const audioBlock: AudioBlock = {
  id: 'b-audio-marche',
  type: 'audio',
  title: 'Au marché · dialogue',
  media: { kind: 'upload', name: 'dialogue-marche.mp3', duration: 34 },
  transcript: [
    { id: 't-1', start: 0, text: '— Bonjour madame, je voudrais du poisson pour ce soir.' },
    { id: 't-2', start: 6, text: '— Bien sûr. Le cabillaud est très frais aujourd’hui.' },
    { id: 't-3', start: 12, text: '— Parfait. Et vous avez aussi de la nourriture pour chat ?' },
    { id: 't-4', start: 19, text: '— Non, désolée, pour ça il faut aller au supermarché.' },
    { id: 't-5', start: 26, text: '— D’accord. Je prends le cabillaud, alors. Merci !' },
  ],
  questions: [
    {
      id: 'a-q-1',
      kind: 'choice',
      prompt: 'Que veut acheter la cliente pour ce soir ?',
      choices: ['du poisson', 'de la viande', 'du pain'],
      answer: 'du poisson',
      explanation: 'She says “je voudrais du poisson pour ce soir” in the first line.',
      grounding: { passage: '— Bonjour madame, je voudrais du poisson pour ce soir.', start: 0 },
      version: 1,
    },
    {
      id: 'a-q-2',
      kind: 'free',
      prompt: 'Pourquoi la cliente doit-elle aller au supermarché ?',
      answer: 'Parce que le marchand n’a pas de nourriture pour chat.',
      alternatives: ['Pour acheter de la nourriture pour chat.', 'Parce qu’il n’y a pas de nourriture pour chat au marché.'],
      explanation: 'The seller says “pour ça il faut aller au supermarché” — “ça” is the cat food.',
      grounding: { passage: '— Non, désolée, pour ça il faut aller au supermarché.', start: 19 },
      version: 1,
    },
  ],
};

/** A Text item from the learner's Texts library; inserting it creates an independent bilingual block. */
export const libraryText: BilingualBlock = {
  id: 'text-semaine',
  type: 'bilingual',
  title: 'Ma semaine en France',
  prepared: ['ru'],
  segments: [
    { id: 'lt-1', source: 'Lundi, je commence le travail à neuf heures.', translations: { ru: 'В понедельник я начинаю работу в девять часов.' } },
    { id: 'lt-2', source: 'Mercredi, je fais les courses au petit marché du quartier.', translations: { ru: 'В среду я хожу за покупками на маленький рынок в нашем квартале.' } },
    { id: 'lt-3', source: 'Le week-end, je me repose et je lis au café.', translations: { ru: 'На выходных я отдыхаю и читаю в кафе.' } },
  ],
};

/** What a reader's private German translation returns in the prototype (keyed by segment id). */
export const privateGerman: Record<string, string> = {
  's-1': 'Am Samstagmorgen macht die ganze Familie sauber.',
  's-2': 'Meine Schwester saugt Staub und ich wische die Küchenfliesen.',
  's-3': 'Papa geht einkaufen und kauft das Tierfutter.',
  's-4': 'Abends essen wir Fisch, und das ist eine echte Freude.',
};

/** Real, browser-playable CC0 clip (MDN sample). It has no speech, so it has no transcript. */
export const videoBlock: VideoBlock = {
  id: 'b-video-fleur',
  type: 'video',
  title: 'Clip · une fleur s’ouvre',
  url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  description: 'A short time-lapse without speech: a flower opens in the sun. Describe it with s’ouvrir, lentement, au soleil.',
  transcript: '',
};

/** The six household words used in the tutor's vocabulary proposal (French → Russian). */
export const householdEntries: VocabEntry[] = [
  {
    id: 'v-travail',
    term: 'travail',
    translation: 'работа',
    ipa: '[tʁa.vaj]',
    definition: 'Work or a job; also the effort put into a task.',
    example: 'Le travail commence à huit heures.',
    exampleTranslation: 'Работа начинается в восемь часов.',
  },
  {
    id: 'v-joie',
    term: 'joie',
    translation: 'радость',
    ipa: '[ʒwa]',
    definition: 'Joy; a strong feeling of happiness.',
    example: 'Quelle joie de te voir !',
    exampleTranslation: 'Какая радость тебя видеть!',
  },
  {
    id: 'v-menage',
    term: 'ménage',
    translation: 'уборка',
    ipa: '[me.naʒ]',
    definition: 'Housework; cleaning the home. Masculine: le ménage.',
    example: 'Je fais le ménage le samedi matin.',
    exampleTranslation: 'Я делаю уборку по субботам утром.',
  },
  {
    id: 'v-carrelage',
    term: 'carrelage',
    translation: 'плитка',
    ipa: '[kaʁ.laʒ]',
    definition: 'Tiling; a tiled floor or wall.',
    example: 'Le carrelage de la cuisine est froid.',
    exampleTranslation: 'Плитка на кухне холодная.',
  },
  {
    id: 'v-poisson',
    term: 'poisson',
    translation: 'рыба',
    ipa: '[pwa.sɔ̃]',
    definition: 'Fish (the animal or the food).',
    example: 'Le poisson rouge tourne dans son bocal.',
    exampleTranslation: 'Золотая рыбка кружит в своём аквариуме.',
  },
  {
    id: 'v-nourriture',
    term: 'nourriture pour animaux',
    translation: 'корм',
    ipa: '[nu.ʁi.tyʁ puʁ a.ni.mo]',
    definition: 'Pet food; food made for animals.',
    example: 'J’achète la nourriture pour animaux au supermarché.',
    exampleTranslation: 'Я покупаю корм для животных в супермаркете.',
  },
];

/** Reference answers the prototype "AI" uses for field checks and generation. */
export const referenceTranslations: Record<string, { translation: string; exampleTranslation?: string; note?: string }> = {
  travail: { translation: 'работа', exampleTranslation: 'Работа начинается в восемь часов.' },
  joie: { translation: 'радость', exampleTranslation: 'Какая радость тебя видеть!' },
  'ménage': { translation: 'уборка', exampleTranslation: 'Я делаю уборку по субботам утром.', note: '“Домашнее хозяйство” is also possible, but “уборка” fits cleaning.' },
  carrelage: { translation: 'плитка', exampleTranslation: 'Плитка на кухне холодная.', note: '“Плита” means a stove — “плитка” is tiling.' },
  poisson: { translation: 'рыба', exampleTranslation: 'Золотая рыбка кружит в своём аквариуме.' },
  'nourriture pour animaux': { translation: 'корм', exampleTranslation: 'Я покупаю корм для животных в супермаркете.' },
  vaisselle: { translation: 'посуда', exampleTranslation: 'Мой брат моет посуду после ужина.' },
  courses: { translation: 'покупки', exampleTranslation: 'Мы ходим за покупками в субботу.' },
  balai: { translation: 'веник', exampleTranslation: 'Веник стоит за дверью кухни.' },
};

export const vocabularyProposalBlock = (): VocabularyBlock => ({
  id: 'proposal-vocab',
  type: 'vocabulary',
  title: 'Household words · six essentials',
  entries: householdEntries,
});

/** Vocabulary already in the saved sheet. The translation of “balai” deliberately has no example translation. */
export const savedVocabularyBlock: VocabularyBlock = {
  id: 'b-vocab-chores',
  type: 'vocabulary',
  title: 'Chores from class',
  entries: [
    {
      id: 'v-vaisselle',
      term: 'vaisselle',
      translation: 'посуда',
      ipa: '[vɛ.sɛl]',
      example: 'Mon frère fait la vaisselle après le dîner.',
      exampleTranslation: 'Мой брат моет посуду после ужина.',
    },
    {
      id: 'v-courses',
      term: 'courses',
      translation: 'покупки',
      ipa: '[kuʁs]',
      example: 'Nous faisons les courses le samedi.',
      exampleTranslation: 'Мы ходим за покупками в субботу.',
    },
    {
      id: 'v-balai',
      term: 'balai',
      translation: 'веник',
      ipa: '[ba.lɛ]',
      example: 'Le balai est derrière la porte de la cuisine.',
    },
  ],
};

export const savedExercisesBlock: ExercisesBlock = {
  id: 'b-ex-chores',
  type: 'exercises',
  title: 'Practice · chores and articles',
  items: [
    {
      id: 'e-article',
      kind: 'choice',
      prompt: 'Choose the right article: ___ ménage',
      choices: ['le', 'la', 'les'],
      answer: 'le',
      explanation: '“Ménage” is masculine, so it takes “le”: faire le ménage.',
      version: 1,
    },
    {
      id: 'e-blank',
      kind: 'blank',
      prompt: 'Le samedi, mon frère fait ___ vaisselle.',
      answer: 'la',
      explanation: '“Vaisselle” is feminine and used in the singular for “the dishes”.',
      hint: 'The dishes = one feminine, uncountable noun.',
      version: 1,
    },
    {
      id: 'e-free',
      kind: 'free',
      prompt: 'Translate into French: «Я кормлю кошку по утрам.»',
      answer: 'Je nourris le chat le matin.',
      alternatives: ['Le matin, je nourris le chat.', 'Je donne à manger au chat le matin.'],
      explanation: '“Nourrir” takes a direct object; “le matin” (no preposition) means every morning.',
      hint: 'Use the verb “nourrir” (to feed).',
      version: 1,
    },
  ],
};

export const exercisesProposalBlock = (): ExercisesBlock => ({
  id: 'proposal-ex',
  type: 'exercises',
  title: 'Practice · chores table',
  items: [
    {
      id: 'pe-1',
      kind: 'choice',
      prompt: 'Which verb goes with “les courses”?',
      choices: ['faire', 'laver', 'nourrir'],
      answer: 'faire',
      explanation: 'Most chores use faire + noun: faire les courses.',
      version: 1,
    },
    {
      id: 'pe-2',
      kind: 'blank',
      prompt: 'Après le dîner, je fais ___ vaisselle.',
      answer: 'la',
      explanation: '“La vaisselle” is feminine singular.',
      version: 1,
    },
    {
      id: 'pe-3',
      kind: 'free',
      prompt: 'Translate into French: «По субботам мы убираемся.»',
      answer: 'Le samedi, nous faisons le ménage.',
      alternatives: ['Nous faisons le ménage le samedi.', 'Le samedi, on fait le ménage.'],
      explanation: '“Le samedi” means every Saturday; “faire le ménage” is to clean the house.',
      hint: 'Clean the house = faire le ménage.',
      version: 1,
    },
  ],
});

export const libraryDictionaries = [
  {
    id: 'dict-maison',
    name: 'À la maison',
    entries: [householdEntries[2], householdEntries[3], savedVocabularyBlock.entries[0], savedVocabularyBlock.entries[2]],
  },
];

