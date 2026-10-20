import type {
  Attachment,
  DictionaryCard,
  KnowledgeNote,
  Passage,
  SourceInfo,
} from '../types/tutor';

export const TEXT_SOURCE_ID = 'text-cafe';
export const DICT_SOURCE_ID = 'dict-nuances';
export const SEED_NOTE_ID = 'note-bienque';
export const noteSourceId = (noteId: string) => `note:${noteId}`;

export const cafeText = {
  title: 'Un café à Paris',
  level: 'B1',
  minutes: 4,
  collection: 'Everyday Paris',
  passages: [
    {
      id: 'p1',
      index: 1,
      fr: "Il est huit heures du matin, et le café du coin s'éveille lentement. Bien qu'il fasse froid, la terrasse est déjà pleine : des étudiants, des voisins, un vieil homme qui lit son journal comme chaque jour depuis vingt ans.",
      en: 'It is eight in the morning, and the corner café is slowly waking up. Although it is cold, the terrace is already full: students, neighbours, an old man reading his newspaper as he has every day for twenty years.',
    },
    {
      id: 'p2',
      index: 2,
      fr: 'Claire commande un café crème et un croissant. Le serveur, pourtant pressé, prend le temps de sourire et de lui demander des nouvelles de sa grand-mère.',
      en: 'Claire orders a café crème and a croissant. The waiter, busy as he is, takes the time to smile and ask after her grandmother.',
    },
    {
      id: 'p3',
      index: 3,
      fr: "Elle aime cet endroit. Ce n'est pas le café le plus élégant du quartier, ni le moins cher, mais on s'y sent chez soi. Ici, personne ne regarde l'heure.",
      en: "She loves this place. It isn't the most elegant café in the neighbourhood, nor the cheapest, but you feel at home here. Here, nobody watches the clock.",
    },
    {
      id: 'p4',
      index: 4,
      fr: "À la table voisine, deux amis discutent de politique. Ils ne sont jamais d'accord, et pourtant ils se retrouvent ici chaque jeudi. « Il faut que tu lises cet article », insiste l'un d'eux.",
      en: "At the next table, two friends are arguing about politics. They never agree, and yet they meet here every Thursday. 'You have to read this article,' one of them insists.",
    },
    {
      id: 'p5',
      index: 5,
      fr: 'Claire sort son carnet. Elle essaie d’écrire quelques phrases en observant la rue : un livreur à vélo, une femme pressée, un chien qui attend patiemment devant la boulangerie.',
      en: 'Claire takes out her notebook. She tries to write a few sentences while watching the street: a delivery rider on a bike, a woman in a hurry, a dog waiting patiently outside the bakery.',
    },
    {
      id: 'p6',
      index: 6,
      fr: 'Quand elle quitte le café, il pleut un peu. Elle aurait pu rester plus longtemps, mais elle a un cours à dix heures. Elle reviendra demain, quand même.',
      en: "When she leaves the café, it's raining a little. She could have stayed longer, but she has a class at ten. She'll come back tomorrow, all the same.",
    },
  ] as Passage[],
};

export const nuancesDictionary = {
  title: 'Nuances : mots de contraste',
  description:
    'Connectors that express contrast and concession, from everyday speech to formal writing.',
  cards: [
    {
      id: 'pourtant',
      word: 'pourtant',
      transcription: '/puʁ.tɑ̃/',
      partOfSpeech: 'adverb',
      translation: 'yet, however',
      definition:
        'Introduces a fact that contrasts with what came before, often with a note of surprise.',
      register: 'Neutral',
      examples: [
        { source: 'Il est fatigué, pourtant il continue.', translation: "He's tired, yet he keeps going." },
        { source: "C'est pourtant simple !", translation: "But it's simple!" },
      ],
    },
    {
      id: 'cependant',
      word: 'cependant',
      transcription: '/sə.pɑ̃.dɑ̃/',
      partOfSpeech: 'adverb',
      translation: 'however, nevertheless',
      definition:
        'Marks a measured objection or restriction. Common in writing and formal speech.',
      register: 'Formal',
      examples: [
        {
          source: 'Le projet est ambitieux. Cependant, le budget reste limité.',
          translation: 'The project is ambitious. However, the budget remains limited.',
        },
      ],
    },
    {
      id: 'quand-meme',
      word: 'quand même',
      transcription: '/kɑ̃ mɛm/',
      partOfSpeech: 'adverbial phrase',
      translation: 'anyway, all the same, still',
      definition:
        'Keeps an action or opinion in place despite an obstacle. Very frequent in speech.',
      register: 'Informal',
      examples: [
        { source: 'Il pleut, mais on sort quand même.', translation: "It's raining, but we're going out anyway." },
        { source: 'Tu aurais quand même pu prévenir !', translation: 'You could at least have warned me!' },
      ],
    },
    {
      id: 'neanmoins',
      word: 'néanmoins',
      transcription: '/ne.ɑ̃.mwɛ̃/',
      partOfSpeech: 'adverb',
      translation: 'nevertheless',
      definition: 'Concedes a point while maintaining the opposite conclusion.',
      register: 'Formal',
      examples: [
        { source: "L'idée est bonne ; néanmoins, elle demande du temps.", translation: 'The idea is good; nevertheless, it takes time.' },
      ],
    },
    {
      id: 'toutefois',
      word: 'toutefois',
      transcription: '/tut.fwa/',
      partOfSpeech: 'adverb',
      translation: 'however, yet',
      definition: 'Adds a restriction to what was just said.',
      register: 'Formal',
      examples: [
        { source: 'Vous pouvez entrer ; toutefois, ne touchez à rien.', translation: 'You may come in; however, do not touch anything.' },
      ],
    },
    {
      id: 'malgre-tout',
      word: 'malgré tout',
      transcription: '/mal.ɡʁe tu/',
      partOfSpeech: 'adverbial phrase',
      translation: 'despite everything',
      definition: 'Holds on to something positive in spite of difficulties.',
      register: 'Neutral',
      examples: [
        { source: 'Malgré tout, elle garde le sourire.', translation: 'Despite everything, she keeps smiling.' },
      ],
    },
  ] as DictionaryCard[],
};

export function createSeedNote(now: number): KnowledgeNote {
  return {
    id: SEED_NOTE_ID,
    title: 'Le subjonctif après « bien que »',
    summary:
      '« Bien que » introduces a concession and is always followed by the subjunctive, even when the fact is true.',
    body: [
      '## Rule',
      '**Bien que** + subjonctif, even for facts that are real.',
      "> Bien qu'il fasse froid, la terrasse est pleine. — Although it's cold, the terrace is full.",
      '## Compare',
      "- **même si** + indicatif: *Même s'il fait froid…*",
      '- **quoique** behaves like *bien que*.',
    ].join('\n'),
    studiedLanguage: 'French',
    explanationLanguage: 'English',
    categories: ['Grammar', 'Usage & register'],
    updatedAt: now - 3 * 24 * 3600 * 1000,
  };
}

export function getSourceInfo(
  sourceId: string,
  notes: Record<string, KnowledgeNote>,
): SourceInfo {
  if (sourceId === TEXT_SOURCE_ID) {
    return {
      id: sourceId,
      kind: 'text',
      title: cafeText.title,
      kindLabel: 'Text',
      access: 'Saved text and its English translation. Relevant passages are retrieved as needed.',
    };
  }
  if (sourceId === DICT_SOURCE_ID) {
    return {
      id: sourceId,
      kind: 'dictionary',
      title: nuancesDictionary.title,
      kindLabel: 'Dictionary',
      access: 'Dictionary name and description. Relevant cards are retrieved as needed.',
    };
  }
  const noteId = sourceId.replace('note:', '');
  const note = notes[noteId];
  return {
    id: sourceId,
    kind: 'note',
    title: note ? note.title : 'Knowledge note',
    kindLabel: 'Knowledge note',
    access: 'This saved Knowledge note, opened through “Ask about this”.',
  };
}

export function cardAttachment(card: DictionaryCard): Attachment {
  return {
    id: `card:${card.id}`,
    kind: 'card',
    label: card.word,
    text: `${card.word} — ${card.translation}`,
    origin: nuancesDictionary.title,
    external: false,
    card,
  };
}

export function passageAttachment(passage: Passage): Attachment {
  return {
    id: `passage:${passage.id}`,
    kind: 'passage',
    label: `¶${passage.index} · ${passage.fr.slice(0, 28)}…`,
    text: passage.fr,
    translation: passage.en,
    origin: `${cafeText.title} · paragraph ${passage.index}`,
    external: false,
  };
}

export interface PickerItem {
  id: string;
  title: string;
  subtitle: string;
  attachment: Attachment;
}

export function getPickerItems(
  sourceId: string,
  notes: Record<string, KnowledgeNote>,
): PickerItem[] {
  if (sourceId === TEXT_SOURCE_ID) {
    return cafeText.passages.map((p) => ({
      id: `passage:${p.id}`,
      title: `Paragraph ${p.index}`,
      subtitle: p.fr,
      attachment: passageAttachment(p),
    }));
  }
  if (sourceId === DICT_SOURCE_ID) {
    return nuancesDictionary.cards.map((c) => ({
      id: `card:${c.id}`,
      title: c.word,
      subtitle: `${c.translation} · ${c.register}`,
      attachment: cardAttachment(c),
    }));
  }
  const note = notes[sourceId.replace('note:', '')];
  if (!note) return [];
  return [
    {
      id: `note-summary:${note.id}`,
      title: 'Note summary',
      subtitle: note.summary,
      attachment: {
        id: `note-summary:${note.id}`,
        kind: 'passage',
        label: 'Note summary',
        text: note.summary,
        origin: note.title,
        external: false,
      },
    },
    {
      id: `note-body:${note.id}`,
      title: 'Note explanation',
      subtitle: note.body.replace(/[#*>]/g, '').slice(0, 120),
      attachment: {
        id: `note-body:${note.id}`,
        kind: 'passage',
        label: 'Note explanation',
        text: note.body,
        origin: note.title,
        external: false,
      },
    },
  ];
}

export function findPassageForText(text: string): Passage | undefined {
  return cafeText.passages.find((p) => p.fr.includes(text.trim().slice(0, 40)));
}

