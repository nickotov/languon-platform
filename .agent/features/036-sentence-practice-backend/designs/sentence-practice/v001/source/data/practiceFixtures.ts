import type {
  AiAttempt,
  ManualReview,
  PracticeExercise,
  PracticeScenario,
} from '../types/practice'

export const PRACTICE_DICTIONARY_ID = 'dict-de-en'
export const SHARED_OWNER_NAME = 'Mara Keller'

export const DEFAULT_SCENARIO: PracticeScenario = {
  feature: 'enabled',
  preparation: 'ok',
  credits: 'available',
  model: 'available',
  capacity: 'ok',
  network: 'online',
  generationOutcome: 'success',
  checkOutcome: 'success',
  revealOutcome: 'success',
  historyPage: 'ok',
  savedPool: 'partial',
  fullscreenApi: 'available',
}

const go = {
  id: 't-go',
  hint: 'go',
  kind: 'word' as const,
  entryId: 'card-de-gehen',
  acceptedForms: ['go', 'goes', 'going', 'went', 'gone'],
  synonyms: ['walk', 'walks', 'walking', 'head', 'commute'],
}
const onFoot = {
  id: 't-on-foot',
  hint: 'on foot',
  kind: 'phrase' as const,
  entryId: 'card-de-zufuss',
  acceptedForms: ['on foot'],
  synonyms: ['by foot', 'walking'],
}
const work = {
  id: 't-work',
  hint: 'work',
  kind: 'word' as const,
  entryId: 'card-de-arbeit',
  acceptedForms: ['work'],
  synonyms: ['job', 'office'],
}

/** The saved pool for the German dictionary. Includes privacy and status edge cases. */
export const savedExercises: PracticeExercise[] = [
  {
    id: 'ex-de-foot',
    dictionaryId: PRACTICE_DICTIONARY_ID,
    direction: 'forward',
    sourceLanguage: 'de',
    responseLanguage: 'en',
    segments: [
      { text: 'Ich ' },
      { text: 'gehe', targetId: 't-go' },
      { text: ' heute ' },
      { text: 'zu Fuß', targetId: 't-on-foot' },
      { text: ' zur ' },
      { text: 'Arbeit', targetId: 't-work' },
      { text: '.' },
    ],
    targets: [go, onFoot, work],
    reference: 'I go to work on foot today.',
    origin: 'owner',
    status: 'current',
    createdAt: '2026-09-28T08:12:00',
  },
  {
    id: 'ex-de-repeat',
    dictionaryId: PRACTICE_DICTIONARY_ID,
    direction: 'forward',
    sourceLanguage: 'de',
    responseLanguage: 'en',
    segments: [
      { text: 'Wir ' },
      { text: 'gehen', targetId: 't-go' },
      { text: ' ' },
      { text: 'früh', targetId: 't-early' },
      { text: ', und morgen ' },
      { text: 'gehen', targetId: 't-go' },
      { text: ' wir wieder.' },
    ],
    targets: [
      go,
      {
        id: 't-early',
        hint: 'early',
        kind: 'word',
        entryId: 'card-de-frueh',
        acceptedForms: ['early'],
      },
    ],
    reference: 'We go early, and tomorrow we go again.',
    origin: 'owner',
    status: 'current',
    createdAt: '2026-09-29T19:40:00',
  },
  {
    id: 'ex-de-long',
    dictionaryId: PRACTICE_DICTIONARY_ID,
    direction: 'forward',
    sourceLanguage: 'de',
    responseLanguage: 'en',
    segments: [
      {
        text: 'Nach dem langen Wochenende gehe ich am Montagmorgen bei schönem ',
      },
      { text: 'Wetter', targetId: 't-weather' },
      { text: ' wieder zur Arbeit, obwohl der ' },
      { text: 'Weg', targetId: 't-way' },
      { text: ' fast eine Stunde dauert.' },
    ],
    targets: [
      {
        id: 't-weather',
        hint: 'weather',
        kind: 'word',
        entryId: 'card-de-wetter',
        acceptedForms: ['weather'],
      },
      {
        id: 't-way',
        hint: 'way',
        kind: 'word',
        entryId: 'card-de-weg',
        acceptedForms: ['way', 'route'],
      },
    ],
    reference:
      'After the long weekend I go back to work on Monday morning in nice weather, even though the way takes almost an hour.',
    origin: 'me',
    status: 'current',
    createdAt: '2026-10-01T07:05:00',
  },
  {
    id: 'ex-de-old',
    dictionaryId: PRACTICE_DICTIONARY_ID,
    direction: 'forward',
    sourceLanguage: 'de',
    responseLanguage: 'en',
    segments: [
      { text: 'Heute ' },
      { text: 'gehe', targetId: 't-go' },
      { text: ' ich spät nach Hause.' },
    ],
    targets: [go],
    reference: 'Today I go home late.',
    origin: 'owner',
    status: 'outdated',
    createdAt: '2026-08-14T18:20:00',
  },
  {
    id: 'ex-de-private-other',
    dictionaryId: PRACTICE_DICTIONARY_ID,
    direction: 'forward',
    sourceLanguage: 'de',
    responseLanguage: 'en',
    segments: [{ text: 'Generated privately by another reader — never visible to you.' }],
    targets: [],
    reference: '',
    origin: 'other-reader',
    status: 'current',
    createdAt: '2026-09-30T10:00:00',
  },
  {
    id: 'ex-en-foot',
    dictionaryId: PRACTICE_DICTIONARY_ID,
    direction: 'reverse',
    sourceLanguage: 'en',
    responseLanguage: 'de',
    segments: [
      { text: 'I ' },
      { text: 'go', targetId: 't-gehen' },
      { text: ' to ' },
      { text: 'work', targetId: 't-arbeit' },
      { text: ' ' },
      { text: 'on foot', targetId: 't-zufuss' },
      { text: ' today.' },
    ],
    targets: [
      {
        id: 't-gehen',
        hint: 'gehen',
        kind: 'word',
        entryId: 'card-de-gehen',
        acceptedForms: ['gehe', 'gehen', 'geht', 'gehst', 'ging'],
      },
      {
        id: 't-arbeit',
        hint: 'die Arbeit',
        kind: 'word',
        entryId: 'card-de-arbeit',
        acceptedForms: ['arbeit'],
      },
      {
        id: 't-zufuss',
        hint: 'zu Fuß',
        kind: 'phrase',
        entryId: 'card-de-zufuss',
        acceptedForms: ['zu fuß', 'zu fuss'],
      },
    ],
    reference: 'Ich gehe heute zu Fuß zur Arbeit.',
    origin: 'owner',
    status: 'current',
    createdAt: '2026-09-27T12:00:00',
  },
]

/** Templates used when the prototype "generates" a new sentence. */
export const generationTemplates: Omit<
  PracticeExercise,
  'id' | 'createdAt' | 'origin' | 'status'
>[] = [
  {
    dictionaryId: PRACTICE_DICTIONARY_ID,
    direction: 'forward',
    sourceLanguage: 'de',
    responseLanguage: 'en',
    segments: [
      { text: 'Heute ' },
      { text: 'gehe', targetId: 't-go' },
      { text: ' ich ' },
      { text: 'früh', targetId: 't-early' },
      { text: ' zur ' },
      { text: 'Arbeit', targetId: 't-work' },
      { text: '.' },
    ],
    targets: [
      go,
      { id: 't-early', hint: 'early', kind: 'word', entryId: 'card-de-frueh', acceptedForms: ['early'] },
      work,
    ],
    reference: 'Today I go to work early.',
  },
  {
    dictionaryId: PRACTICE_DICTIONARY_ID,
    direction: 'forward',
    sourceLanguage: 'de',
    responseLanguage: 'en',
    segments: [
      { text: 'Der ' },
      { text: 'Weg', targetId: 't-way' },
      { text: ' zur ' },
      { text: 'Arbeit', targetId: 't-work' },
      { text: ' ist heute lang.' },
    ],
    targets: [
      { id: 't-way', hint: 'way', kind: 'word', entryId: 'card-de-weg', acceptedForms: ['way', 'route'] },
      work,
    ],
    reference: 'The way to work is long today.',
  },
  {
    dictionaryId: PRACTICE_DICTIONARY_ID,
    direction: 'reverse',
    sourceLanguage: 'en',
    responseLanguage: 'de',
    segments: [
      { text: 'The ' },
      { text: 'weather', targetId: 't-wetter' },
      { text: ' is nice today.' },
    ],
    targets: [
      {
        id: 't-wetter',
        hint: 'das Wetter',
        kind: 'word',
        entryId: 'card-de-wetter',
        acceptedForms: ['wetter'],
      },
    ],
    reference: 'Das Wetter ist heute schön.',
  },
]

/** Gallery-only fixtures demonstrating non-Latin and right-to-left layouts. */
export const japaneseExercise: PracticeExercise = {
  id: 'ex-ja',
  dictionaryId: 'dict-ja-en',
  direction: 'forward',
  sourceLanguage: 'ja',
  responseLanguage: 'en',
  segments: [
    { text: '毎朝' },
    { text: '歩いて', targetId: 't-ja-foot' },
    { text: '会社', targetId: 't-ja-work' },
    { text: 'に' },
    { text: '行きます', targetId: 't-ja-go' },
    { text: '。' },
  ],
  targets: [
    { id: 't-ja-foot', hint: 'on foot', kind: 'phrase', entryId: 'ja-1', acceptedForms: ['on foot'] },
    { id: 't-ja-work', hint: 'office', kind: 'word', entryId: 'ja-2', acceptedForms: ['office'] },
    { id: 't-ja-go', hint: 'go', kind: 'word', entryId: 'ja-3', acceptedForms: ['go'] },
  ],
  reference: 'I go to the office on foot every morning.',
  origin: 'owner',
  status: 'current',
  createdAt: '2026-09-20T09:00:00',
}

export const arabicExercise: PracticeExercise = {
  id: 'ex-ar',
  dictionaryId: 'dict-ar-en',
  direction: 'forward',
  sourceLanguage: 'ar',
  responseLanguage: 'en',
  segments: [
    { text: 'أذهب', targetId: 't-ar-go' },
    { text: ' إلى ' },
    { text: 'العمل', targetId: 't-ar-work' },
    { text: ' ' },
    { text: 'سيرًا على الأقدام', targetId: 't-ar-foot' },
    { text: '.' },
  ],
  targets: [
    { id: 't-ar-go', hint: 'go', kind: 'word', entryId: 'ar-1', acceptedForms: ['go'] },
    { id: 't-ar-work', hint: 'work', kind: 'word', entryId: 'ar-2', acceptedForms: ['work'] },
    { id: 't-ar-foot', hint: 'on foot', kind: 'phrase', entryId: 'ar-3', acceptedForms: ['on foot'] },
  ],
  reference: 'I go to work on foot.',
  origin: 'owner',
  status: 'current',
  createdAt: '2026-09-21T09:00:00',
}

const t = (day: number, hour: number, minute = 0) =>
  `2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`

/** Personal history seed. Only the signed-in learner's own results. */
export const seedAttempts: AiAttempt[] = [
  {
    id: 'att-1',
    exerciseId: 'ex-de-foot',
    dictionaryId: PRACTICE_DICTIONARY_ID,
    sentence: 'Ich gehe heute zu Fuß zur Arbeit.',
    sourceLanguage: 'de',
    responseLanguage: 'en',
    submittedAnswer: 'Today I walk to work.',
    result: {
      score: 62,
      rating: 'not-bad',
      explanationLanguage: 'de',
      explanation:
        'Die Bedeutung ist verständlich, aber die geforderten Wörter „go“ und „on foot“ fehlen. „walk“ ist ein Synonym und ersetzt das Zielwort nicht.',
      corrections: [
        {
          id: 'c1',
          kind: 'vocabulary',
          original: 'walk',
          suggestion: 'go … on foot',
          note: '„walk“ ersetzt nicht das Zielwort „go“.',
          span: { start: 8, end: 12 },
        },
      ],
      targets: [
        { targetId: 't-go', hint: 'go', status: 'synonym', note: 'walk' },
        { targetId: 't-on-foot', hint: 'on foot', status: 'missing' },
        { targetId: 't-work', hint: 'work', status: 'used' },
      ],
      improved: 'Today I go to work on foot.',
      details: ['Pflichtvokabular fehlt — die Bewertung ist auf höchstens 79 begrenzt.'],
    },
    assisted: false,
    createdAt: t(28, 8, 20),
    exerciseStatus: 'current',
  },
  {
    id: 'att-2',
    exerciseId: 'ex-de-repeat',
    dictionaryId: PRACTICE_DICTIONARY_ID,
    sentence: 'Wir gehen früh, und morgen gehen wir wieder.',
    sourceLanguage: 'de',
    responseLanguage: 'en',
    submittedAnswer: 'We go early, and tomorrow we go again.',
    result: {
      score: 100,
      rating: 'perfect',
      explanationLanguage: 'de',
      explanation: 'Alles korrekt: Bedeutung, Grammatik und alle Zielwörter stimmen.',
      corrections: [],
      targets: [
        { targetId: 't-go', hint: 'go', status: 'used' },
        { targetId: 't-early', hint: 'early', status: 'used' },
      ],
      details: [],
    },
    assisted: true,
    createdAt: t(29, 19, 52),
    exerciseStatus: 'current',
  },
  {
    id: 'att-3',
    exerciseId: 'ex-de-old',
    dictionaryId: PRACTICE_DICTIONARY_ID,
    sentence: 'Heute gehe ich spät nach Hause.',
    sourceLanguage: 'de',
    responseLanguage: 'en',
    submittedAnswer: 'Today I go home late',
    result: {
      score: 90,
      rating: 'good',
      explanationLanguage: 'en',
      explanation: 'Correct meaning and vocabulary. The sentence is missing its final full stop.',
      corrections: [
        {
          id: 'c2',
          kind: 'punctuation',
          original: null,
          suggestion: '.',
          note: 'End the sentence with a full stop.',
          span: null,
        },
      ],
      targets: [{ targetId: 't-go', hint: 'go', status: 'used' }],
      improved: 'Today I go home late.',
      details: [],
    },
    assisted: false,
    createdAt: t(14, 18, 30),
    exerciseStatus: 'outdated',
  },
  ...Array.from({ length: 8 }, (_unused, index): AiAttempt => ({
    id: `att-older-${index}`,
    exerciseId: 'ex-de-foot',
    dictionaryId: PRACTICE_DICTIONARY_ID,
    sentence: 'Ich gehe heute zu Fuß zur Arbeit.',
    sourceLanguage: 'de',
    responseLanguage: 'en',
    submittedAnswer: index % 2 === 0 ? 'I go to work on foot today.' : 'I go to the work on foot today.',
    result:
      index % 2 === 0
        ? {
            score: 100,
            rating: 'perfect',
            explanationLanguage: 'en',
            explanation: 'Everything is correct.',
            corrections: [],
            targets: [
              { targetId: 't-go', hint: 'go', status: 'used' },
              { targetId: 't-on-foot', hint: 'on foot', status: 'used' },
              { targetId: 't-work', hint: 'work', status: 'used' },
            ],
            details: [],
          }
        : {
            score: 86,
            rating: 'good',
            explanationLanguage: 'en',
            explanation: 'All target words are present. “the work” is unidiomatic here.',
            corrections: [
              {
                id: `c-older-${index}`,
                kind: 'grammar',
                original: 'the work',
                suggestion: 'work',
                note: 'No article before “work” in this sense.',
                span: { start: 8, end: 16 },
              },
            ],
            targets: [
              { targetId: 't-go', hint: 'go', status: 'used' },
              { targetId: 't-on-foot', hint: 'on foot', status: 'used' },
              { targetId: 't-work', hint: 'work', status: 'used' },
            ],
            improved: 'I go to work on foot today.',
            details: [],
          },
    assisted: false,
    createdAt: t(10 - index, 9, index * 3),
    exerciseStatus: 'current',
  })),
]

export const seedManualReviews: ManualReview[] = [
  {
    id: 'mr-1',
    exerciseId: 'ex-de-long',
    dictionaryId: PRACTICE_DICTIONARY_ID,
    sentence:
      'Nach dem langen Wochenende gehe ich am Montagmorgen bei schönem Wetter wieder zur Arbeit, obwohl der Weg fast eine Stunde dauert.',
    reference:
      'After the long weekend I go back to work on Monday morning in nice weather, even though the way takes almost an hour.',
    sourceLanguage: 'de',
    responseLanguage: 'en',
    createdAt: t(30, 21, 4),
    exerciseStatus: 'current',
  },
  {
    id: 'mr-2',
    exerciseId: 'ex-de-old',
    dictionaryId: PRACTICE_DICTIONARY_ID,
    sentence: 'Heute gehe ich spät nach Hause.',
    reference: 'Today I go home late.',
    sourceLanguage: 'de',
    responseLanguage: 'en',
    createdAt: t(14, 18, 25),
    exerciseStatus: 'outdated',
  },
]

/** Exercise ids the learner completed in earlier sessions. */
export const seedCompleted = ['ex-de-repeat', 'ex-de-long']
/** Exercise ids already used once (exposure is counted only on first use). */
export const seedExposed = ['ex-de-repeat', 'ex-de-long', 'ex-de-old']
export const seedSeenEntries = ['card-de-gehen', 'card-de-frueh', 'card-de-wetter', 'card-de-weg', 'card-de-arbeit']

