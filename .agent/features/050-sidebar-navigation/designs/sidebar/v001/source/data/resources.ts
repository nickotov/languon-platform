import type { Resource } from '../types/navigation'

export const initialResources: Resource[] = [
  { id: 'business-english', kind: 'dictionary', title: 'Business English', languagePair: 'EN → RU', count: 248, dueCount: 18, minutesAgo: 35, pinned: true },
  { id: 'phrasal-verbs', kind: 'dictionary', title: 'Phrasal verbs', languagePair: 'EN → RU', count: 132, dueCount: 7, minutesAgo: 190 },
  { id: 'francais-b1', kind: 'dictionary', title: 'Français — vocabulaire B1', languagePair: 'FR → RU', count: 96, dueCount: 12, minutesAgo: 1440 },
  { id: 'ielts-awl-3', kind: 'dictionary', title: 'IELTS Academic Word List — Sublist 3', languagePair: 'EN → RU', count: 60, minutesAgo: 2900 },
  { id: 'travel-airports', kind: 'dictionary', title: 'Travel & airports', languagePair: 'EN → RU', count: 54, minutesAgo: 7200 },
  { id: 'cuisine', kind: 'dictionary', title: 'La cuisine', languagePair: 'FR → EN', count: 38, minutesAgo: 12000 },

  { id: 'cities-cars', kind: 'text', title: 'The Guardian: Why cities are banning cars', folder: 'News', minutesAgo: 90, pinned: true },
  { id: 'petit-prince-2', kind: 'text', title: 'Le Petit Prince — Chapitre II', folder: 'Fiction', minutesAgo: 600 },
  { id: 'quarterly-email', kind: 'text', title: 'Quarterly report email draft', folder: 'Work', minutesAgo: 1700 },
  { id: 'scandal-bohemia', kind: 'text', title: 'Sherlock Holmes: A Scandal in Bohemia, Part I', folder: 'Fiction', minutesAgo: 4300 },
  { id: 'four-day-week', kind: 'text', title: 'BBC: The four-day work week trial results', folder: 'News', minutesAgo: 9800 },

  { id: 'present-perfect', kind: 'knowledge', title: 'Present Perfect vs Past Simple', minutesAgo: 12, pinned: true },
  { id: 'subjonctif', kind: 'knowledge', title: 'Le subjonctif : quand l’utiliser', minutesAgo: 400 },
  { id: 'get-phrasal', kind: 'knowledge', title: 'Phrasal verbs with “get” — cheat sheet', minutesAgo: 2100 },
  { id: 'conditionals', kind: 'knowledge', title: 'Conditionals 0–3 overview', minutesAgo: 5000 },
  { id: 'small-talk', kind: 'knowledge', title: 'Small talk phrases for meetings', minutesAgo: 8800 }
]

export const vocabularySample = [
  { term: 'leverage', translation: 'использовать (преимущество)', example: 'We can leverage our existing clients.' },
  { term: 'stakeholder', translation: 'заинтересованная сторона', example: 'Keep all stakeholders informed.' },
  { term: 'to follow up', translation: 'напомнить, уточнить', example: 'I’ll follow up after the meeting.' },
  { term: 'bottleneck', translation: 'узкое место', example: 'Approval is the main bottleneck.' },
  { term: 'deadline', translation: 'крайний срок', example: 'The deadline is Friday noon.' },
  { term: 'to touch base', translation: 'связаться, сверить планы', example: 'Let’s touch base on Monday.' }
]

export const textSample = [
  'Across Europe, a growing number of cities are rethinking the role of the private car. From Oslo to Paris, local governments have begun to close central streets to traffic, replacing parking spaces with bike lanes, trees and public squares.',
  'Supporters argue that the changes reduce pollution and make streets safer. Critics, however, worry that small businesses will lose customers who used to arrive by car.',
  'Early data suggests the fears may be overstated. In several pilot districts, footfall actually increased once pedestrians no longer had to compete with traffic.'
]

export const knowledgeSample = {
  intro: 'Both tenses describe the past, but they answer different questions. The Present Perfect connects a past action to the present moment; the Past Simple places it at a finished time.',
  sections: [
    { heading: 'Present Perfect', body: 'Use it for experiences, recent changes and unfinished time periods: “I have visited Paris twice.” “She has just finished the report.”' },
    { heading: 'Past Simple', body: 'Use it when the time is finished or stated: “I visited Paris in 2019.” “She finished the report yesterday.”' },
    { heading: 'Signal words', body: 'Present Perfect: already, yet, ever, never, since, for. Past Simple: yesterday, ago, last week, in 2019.' }
  ]
}

export const aiConversation = [
  { role: 'user' as const, text: 'Can you add three practice sentences to the “Signal words” section?' },
  { role: 'ai' as const, text: 'Sure — here are three gap-fill sentences. I’ve inserted them as a suggestion below “Signal words”; accept or edit them in the document.' },
  { role: 'user' as const, text: 'Why is “I have seen him yesterday” wrong?' },
  { role: 'ai' as const, text: '“Yesterday” marks a finished time, so English requires the Past Simple: “I saw him yesterday.” Use the Present Perfect only without a finished time marker.' }
]

