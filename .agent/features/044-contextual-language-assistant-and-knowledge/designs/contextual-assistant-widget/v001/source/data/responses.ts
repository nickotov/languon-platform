import type { Activity, Block, NoteCategory } from '../types/tutor';

export interface ResponseContent {
  activities: Activity[];
  materialsLabel: string;
  passageIds: string[];
  credits: number;
  blocks: Block[];
}

const readPassages = (n: number): Activity => ({
  running: 'Reading relevant passages…',
  done: `Read ${n} passage${n === 1 ? '' : 's'}`,
});

export const responses: Record<string, ResponseContent> = {
  subjunctive: {
    activities: [readPassages(2)],
    materialsLabel: 'Used 2 passages',
    passageIds: ['p1', 'p4'],
    credits: 2,
    blocks: [
      { type: 'h', text: 'Why « fasse » and not « fait »' },
      {
        type: 'p',
        text: '**Bien que** always introduces a clause in the *subjonctif*. It presents a fact as a concession — something true, but not strong enough to stop what follows.',
      },
      {
        type: 'example',
        source: "Bien qu'il **fasse** froid, la terrasse est pleine.",
        translation: 'Although it is cold, the terrace is full.',
      },
      {
        type: 'p',
        text: 'The cold is real, yet the terrace fills up anyway. French marks that tension with the subjunctive, even though nothing is uncertain.',
      },
      { type: 'h', text: 'A quick way to remember' },
      {
        type: 'ul',
        items: [
          '**Bien que, quoique, sans que** → subjunctive',
          '**Même si, alors que** → indicative',
          "Same idea, different mood: *Même s'il fait froid…*",
        ],
      },
      {
        type: 'table',
        head: ['Connector', 'Mood', 'Example'],
        rows: [
          ['bien que', 'subjonctif', "Bien qu'il pleuve, elle sort."],
          ['quoique', 'subjonctif', "Quoiqu'il soit tard, on reste."],
          ['même si', 'indicatif', "Même s'il pleut, elle sort."],
        ],
      },
      {
        type: 'p',
        text: 'Later in the text, the same idea of concession returns with *pourtant* and *quand même* — worth comparing.',
      },
    ],
  },
  examples: {
    activities: [readPassages(1)],
    materialsLabel: 'Used 1 passage',
    passageIds: ['p1'],
    credits: 2,
    blocks: [
      { type: 'p', text: 'Here are five everyday sentences with **bien que**, from simple to more nuanced.' },
      { type: 'example', source: "Bien qu'il **soit** tard, on reste encore un peu.", translation: "Although it's late, we're staying a little longer." },
      { type: 'example', source: 'Bien que le café **soit** cher, il est toujours plein.', translation: "Although the café is expensive, it's always full." },
      { type: 'example', source: "Elle sourit, bien qu'elle **ait** froid.", translation: "She's smiling, although she's cold." },
      { type: 'example', source: 'Bien que nous **ayons** peu de temps, prenons un dessert.', translation: "Although we don't have much time, let's have dessert." },
      { type: 'example', source: "Bien qu'il ne **parle** pas français, il commande sans problème.", translation: "Although he doesn't speak French, he orders without trouble." },
      { type: 'h', text: 'Notice' },
      {
        type: 'ul',
        items: [
          'The subordinate clause can come **first or second**.',
          'Common verbs change form: *être → soit*, *avoir → ait*.',
          'In speech, many people use *même si* + indicative instead.',
        ],
      },
    ],
  },
  pourtant: {
    activities: [readPassages(2)],
    materialsLabel: 'Used 2 passages',
    passageIds: ['p2', 'p4'],
    credits: 2,
    blocks: [
      { type: 'h', text: '« pourtant » as an aside' },
      {
        type: 'p',
        text: 'Here *pourtant* sits between commas, right after the subject. It works like a short aside — an **incise** — that you could lift out without breaking the sentence.',
      },
      {
        type: 'example',
        source: 'Le serveur, **pourtant pressé**, prend le temps de sourire.',
        translation: 'The waiter, busy as he is, takes the time to smile.',
      },
      {
        type: 'p',
        text: 'The aside creates a small surprise: being busy should stop him from chatting, *yet* he does. English often needs a full phrase to get the same effect.',
      },
      { type: 'h', text: 'Two positions, one meaning' },
      {
        type: 'ul',
        items: [
          'Inside the sentence: *Le serveur, pourtant pressé, sourit.* — compact, literary.',
          'At the start of a clause: *Il est pressé. Pourtant, il sourit.* — clearer, more spoken.',
        ],
      },
      { type: 'p', text: 'Paragraph 4 uses the second pattern: *et pourtant ils se retrouvent ici chaque jeudi.*' },
    ],
  },
  tone: {
    activities: [readPassages(3)],
    materialsLabel: 'Used 3 passages',
    passageIds: ['p1', 'p3', 'p6'],
    credits: 2,
    blocks: [
      { type: 'h', text: 'Calm, observant, affectionate' },
      {
        type: 'p',
        text: 'The narrator watches rather than judges. Sentences are short, concrete, and mostly in the present, which makes the scene feel *unhurried*.',
      },
      {
        type: 'ul',
        items: [
          '**Small details** carry the mood: *un vieil homme qui lit son journal*.',
          '**Gentle contrast**: *ni le plus élégant, ni le moins cher, mais on s’y sent chez soi*.',
          '**A soft ending**: *Elle reviendra demain, quand même.*',
        ],
      },
      {
        type: 'example',
        source: "Ici, personne ne regarde l'heure.",
        translation: 'Here, nobody watches the clock.',
      },
      {
        type: 'p',
        text: 'That line sums up the tone: the café is a place outside ordinary time. If you retell the passage, keep your verbs simple and your details specific.',
      },
    ],
  },
  quote: {
    activities: [readPassages(1)],
    materialsLabel: 'Used 1 passage',
    passageIds: ['p3'],
    credits: 1,
    blocks: [
      { type: 'h', text: 'Structure' },
      {
        type: 'p',
        text: 'Read it in two parts: the main clause carries the information, and anything between commas adds the speaker’s attitude or a detail.',
      },
      {
        type: 'ul',
        items: [
          '**Word order** stays subject–verb–object.',
          'Commas mark an *incise* — a short aside you can lift out.',
          'Read it aloud with a slight pause at each comma.',
        ],
      },
      { type: 'h', text: 'Try it yourself' },
      {
        type: 'p',
        text: 'Rewrite the sentence without the aside, then add it back. Notice what changes in **tone**, not in meaning.',
      },
    ],
  },
  long: {
    activities: [readPassages(3)],
    materialsLabel: 'Used 3 passages',
    passageIds: ['p1', 'p2', 'p6'],
    credits: 3,
    blocks: [
      { type: 'h', text: 'Two past tenses, two jobs' },
      {
        type: 'p',
        text: 'In *Un café à Paris* the narrator mostly uses the present, but past tenses appear when you retell the scene. The difference isn’t about **when** something happened — it’s about **how you look at it**.',
      },
      { type: 'h', text: 'Imparfait: the background' },
      {
        type: 'p',
        text: 'Use the *imparfait* for scenery, habits, and actions in progress. It answers the question *what was it like?*',
      },
      {
        type: 'ul',
        items: [
          'Descriptions: *Il faisait froid, la terrasse était pleine.*',
          'Habits: *Chaque jeudi, ils se retrouvaient ici.*',
          'Ongoing actions: *Elle écrivait quand le serveur est arrivé.*',
        ],
      },
      { type: 'example', source: 'Le vieil homme **lisait** son journal.', translation: 'The old man was reading his newspaper.' },
      { type: 'h', text: 'Passé composé: the events' },
      {
        type: 'p',
        text: 'Use the *passé composé* for completed actions that move the story forward. It answers *what happened next?*',
      },
      {
        type: 'ul',
        items: [
          'Single events: *Claire a commandé un café crème.*',
          'A sequence: *Elle a payé, elle est sortie, elle a ouvert son parapluie.*',
          'A change: *Tout à coup, il a commencé à pleuvoir.*',
        ],
      },
      { type: 'example', source: 'Claire **a commandé** un café crème.', translation: 'Claire ordered a café crème.' },
      { type: 'h', text: 'Seeing both together' },
      {
        type: 'p',
        text: 'Most stories mix them: the imparfait paints the scene, the passé composé interrupts it.',
      },
      { type: 'example', source: 'Il **pleuvait** quand elle **a quitté** le café.', translation: 'It was raining when she left the café.' },
      {
        type: 'table',
        head: ['', 'Imparfait', 'Passé composé', 'Signal words', 'Retold from the text'],
        rows: [
          ['Role', 'background, description', 'completed event', 'pendant que, soudain', 'la terrasse était pleine'],
          ['Duration', 'ongoing or repeated', 'bounded, finished', 'toujours, une fois', 'Claire a commandé'],
          ['Habits', 'chaque jeudi, souvent', 'ce jour-là', 'tous les jours', 'ils se retrouvaient'],
          ['Feelings', 'a state of mind', 'a change in feeling', 'tout à coup', 'elle aimait cet endroit'],
        ],
      },
      { type: 'h', text: 'A quick test' },
      {
        type: 'ol',
        items: [
          'Ask: is this the *set* or the *action*?',
          'If you can add *en train de*, it is probably imparfait.',
          'If it answers *and then?*, use the passé composé.',
        ],
      },
      {
        type: 'p',
        text: 'Try retelling the last paragraph in the past — it’s a good exercise for exactly this contrast.',
      },
    ],
  },
  general: {
    activities: [readPassages(2)],
    materialsLabel: 'Used 2 passages',
    passageIds: ['p1', 'p5'],
    credits: 1,
    blocks: [
      { type: 'p', text: 'Here’s what stands out in this part of the text:' },
      {
        type: 'ul',
        items: [
          '**s’éveiller** — to wake up; used figuratively for a place coming to life.',
          '**le café du coin** — the local café, literally “the café on the corner”.',
          '**en observant** — a *gérondif*: two actions at the same time.',
        ],
      },
      { type: 'example', source: 'Elle écrit **en observant** la rue.', translation: 'She writes while watching the street.' },
      { type: 'p', text: 'Want me to turn these into a short practice exercise?' },
    ],
  },
  compareFallback: {
    activities: [
      { running: 'Looking through this dictionary…', done: 'Looked through the dictionary' },
      { running: 'Reading the relevant cards…', done: 'Read 3 cards' },
    ],
    materialsLabel: 'Used 3 dictionary cards',
    passageIds: [],
    credits: 2,
    blocks: [],
  },
  note: {
    activities: [{ running: 'Reading this note…', done: 'Read the saved note' }],
    materialsLabel: 'Used 1 note',
    passageIds: [],
    credits: 1,
    blocks: [
      { type: 'p', text: 'Your note covers the core rule well. Two things you could add:' },
      {
        type: 'ol',
        items: [
          '**Same subject?** Prefer *bien que* + subjunctive or rephrase with *malgré* + noun.',
          '**A common mistake**: the conditional never follows *bien que*.',
        ],
      },
      { type: 'example', source: "Bien qu'il **fasse** beau…", translation: 'Although the weather is nice…' },
      { type: 'example', source: 'Malgré le froid, la terrasse est pleine.', translation: 'Despite the cold, the terrace is full.' },
      { type: 'p', text: 'You can update the note with these points, or keep them as a separate note.' },
    ],
  },
  draft: {
    activities: [{ running: 'Preparing a Knowledge draft…', done: 'Prepared a Knowledge draft' }],
    materialsLabel: '',
    passageIds: [],
    credits: 2,
    blocks: [
      {
        type: 'p',
        text: 'I’ve prepared a draft from this explanation. Review it before saving — nothing is added to Knowledge until you press **Save**.',
      },
    ],
  },
};

export interface DraftTemplate {
  title: string;
  summary: string;
  body: string;
  categories: NoteCategory[];
}

export const draftTemplates: Record<string, DraftTemplate> = {
  subjunctive: {
    title: 'Subjonctif après « bien que »',
    summary: 'Bien que introduces a concession and always takes the subjunctive, even for real facts.',
    body: [
      '## Rule',
      '**Bien que, quoique, sans que** + subjonctif.',
      "> Bien qu'il fasse froid, la terrasse est pleine. — Although it is cold, the terrace is full.",
      '## Contrast',
      "- **même si** + indicatif: *Même s'il fait froid…*",
      '- The fact is true — the mood marks the concession, not doubt.',
    ].join('\n'),
    categories: ['Grammar', 'Usage & register'],
  },
  compare: {
    title: 'pourtant, cependant, quand même',
    summary: 'Three ways to express contrast — they differ mostly in register and position.',
    body: [
      '## At a glance',
      '- **pourtant** — neutral, adds surprise.',
      '- **cependant** — formal, start of sentence.',
      '- **quand même** — spoken, end of clause.',
      '> Il pleut, mais on sort quand même. — It’s raining, but we’re going out anyway.',
    ].join('\n'),
    categories: ['Vocabulary & meaning', 'Usage & register'],
  },
  long: {
    title: 'Imparfait ou passé composé ?',
    summary: 'Imparfait sets the scene; passé composé moves the story forward.',
    body: [
      '## Imparfait',
      '- Descriptions, habits, actions in progress.',
      '> Le vieil homme lisait son journal. — The old man was reading his newspaper.',
      '## Passé composé',
      '- Completed events, sequences, sudden changes.',
      '> Claire a commandé un café crème. — Claire ordered a café crème.',
    ].join('\n'),
    categories: ['Grammar', 'Learning tips'],
  },
  pourtant: {
    title: '« pourtant » en incise',
    summary: 'Placed between commas, pourtant becomes a compact aside that signals surprise.',
    body: [
      '## Pattern',
      'Subject, **pourtant** + adjective, verb…',
      '> Le serveur, pourtant pressé, prend le temps de sourire. — The waiter, busy as he is, takes the time to smile.',
    ].join('\n'),
    categories: ['Grammar', 'Usage & register'],
  },
  fallback: {
    title: 'Notes from “Un café à Paris”',
    summary: 'Useful expressions and patterns from the text.',
    body: '## Key points\n- **s’éveiller** — to wake up, also for places.\n- **en observant** — two actions at once.',
    categories: ['Vocabulary & meaning'],
  },
};

export const noteUpdateAddition = [
  '## Also remember',
  '- The conditional never follows *bien que*.',
  '- With a noun, use **malgré**: *Malgré le froid, la terrasse est pleine.*',
].join('\n');

