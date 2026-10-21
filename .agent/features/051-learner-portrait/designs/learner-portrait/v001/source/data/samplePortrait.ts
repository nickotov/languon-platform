import type { ConflictItem, Interview, PortraitItems, SavedPortrait } from '../types/portrait';
import { INTERVIEW_COPY } from './interviewCopy';

export const SAMPLE_ITEMS: PortraitItems = {
  languages: [
    { id: 'lang-en', name: 'English', level: 'native', learning: false, note: '' },
    { id: 'lang-es', name: 'Spanish', level: 'intermediate', learning: true, note: 'I read comfortably but struggle to speak.' },
    { id: 'lang-fr', name: 'French', level: 'starting', learning: true, note: '' },
  ],
  explanationLanguages: ['English'],
  mixing: 'helpful',
  mixingNote: 'Mostly English, with short Spanish examples.',
  goals: ['travel'],
  customGoals: ['Workplace conversation'],
  tone: 'friendly',
  length: 'concise',
  wording: null,
  order: 'examples',
  needs: ['short-steps', 'recaps'],
  customNeeds: [],
  interests: ['Cooking', 'Music'],
  ageRange: '18-34',
  notes: [],
};

export const LARGE_ITEMS: PortraitItems = {
  ...SAMPLE_ITEMS,
  languages: [
    ...SAMPLE_ITEMS.languages,
    { id: 'lang-it', name: 'Italian', level: 'basic', learning: false, note: 'Learned at school, mostly forgotten.' },
    { id: 'lang-pt', name: 'Portuguese', level: 'unsure', learning: false, note: 'I can follow some Brazilian music lyrics.' },
    { id: 'lang-de', name: 'German', level: 'basic', learning: false, note: '' },
  ],
  goals: ['travel', 'exams', 'everyday'],
  customGoals: ['Workplace conversation', 'Reading recipes from Spanish cookbooks'],
  needs: ['short-steps', 'recaps', 'structure', 'one-concept'],
  customNeeds: ['Bullet points instead of long paragraphs', 'A quick check question after each new rule'],
  interests: ['Cooking', 'Music', 'Film', 'Hiking', 'Gardening'],
  notes: [
    { id: 'n1', topic: 'languages', text: 'Spanish listening is easier than speaking for me.' },
    { id: 'n2', topic: 'style', text: 'Light humour is welcome, but keep corrections direct.' },
  ],
};

export const SPARSE_ITEMS: PortraitItems = {
  languages: [{ id: 'lang-es', name: 'Spanish', level: 'intermediate', learning: true, note: '' }],
  explanationLanguages: [],
  mixing: null,
  mixingNote: '',
  goals: ['travel'],
  customGoals: [],
  tone: null,
  length: null,
  wording: null,
  order: null,
  needs: [],
  customNeeds: [],
  interests: [],
  ageRange: null,
  notes: [],
};

export function savedPortrait(useEnabled: boolean, items: PortraitItems = SAMPLE_ITEMS): SavedPortrait {
  return {
    items,
    summaryLanguage: 'en',
    updatedAt: '2026-10-09T18:12:00',
    updatedOn: 'this laptop',
    useEnabled,
  };
}

export function unfinishedInterview(): Interview {
  const copy = INTERVIEW_COPY.en;
  return {
    mode: 'new',
    language: 'en',
    phase: 'questions',
    topic: 'goals',
    topicStatus: { languages: 'answered', explanation: 'answered' },
    messages: [
      { id: 'm1', role: 'interviewer', kind: 'question', text: copy.greeting, time: '8:02 PM' },
      { id: 'm2', role: 'interviewer', kind: 'question', text: copy.questions.languages.title, time: '8:02 PM' },
      { id: 'm3', role: 'user', kind: 'answer', text: 'English (Native) · Spanish (Intermediate, learning) · French (Just starting, learning)', time: '8:03 PM', status: 'sent' },
      { id: 'm4', role: 'interviewer', kind: 'question', text: `${copy.acks[0]} ${copy.questions.explanation.title}`, time: '8:03 PM' },
      { id: 'm5', role: 'user', kind: 'answer', text: 'English · Mixing helps', time: '8:04 PM', status: 'sent' },
      { id: 'm6', role: 'interviewer', kind: 'question', text: `${copy.acks[1]} ${copy.questions.goals.title}`, time: '8:04 PM' },
    ],
    draft: {
      ...SPARSE_ITEMS,
      languages: SAMPLE_ITEMS.languages.map((l) => ({ ...l, note: '' })),
      explanationLanguages: ['English'],
      mixing: 'helpful',
      goals: [],
    },
    proposals: [],
    startedAt: '2026-10-18T20:02:00',
    lastActivityAt: '2026-10-18T20:04:00',
    conflict: null,
    contextUsed: 14,
  };
}

/** Saved portrait as changed on another device after the interview below began. */
export function conflictSaved(useEnabled: boolean): SavedPortrait {
  return {
    items: { ...SAMPLE_ITEMS, tone: 'balanced', needs: ['short-steps', 'recaps', 'one-concept'] },
    summaryLanguage: 'en',
    updatedAt: '2026-10-19T07:41:00',
    updatedOn: 'your phone',
    useEnabled,
  };
}

export function conflictInterview(): Interview {
  const base = unfinishedInterview();
  const copy = INTERVIEW_COPY.en;
  const conflicts: ConflictItem[] = [
    {
      id: 'c-tone',
      field: 'Tone',
      saved: 'Balanced',
      savedOn: 'Changed on your phone · Oct 19, 2026',
      proposed: 'Friendly',
      choice: null,
      apply: (items) => ({ ...items, tone: 'balanced' }),
    },
    {
      id: 'c-needs',
      field: 'Learning needs',
      saved: 'Short steps, Frequent recaps, One concept at a time',
      savedOn: 'Added on your phone · Oct 19, 2026',
      proposed: 'Short steps, Frequent recaps',
      choice: null,
      apply: (items) => ({
        ...items,
        needs: items.needs.includes('one-concept') ? items.needs : [...items.needs, 'one-concept'],
      }),
    },
  ];
  return {
    ...base,
    mode: 'update',
    phase: 'questions',
    topic: 'needs',
    topicStatus: { style: 'answered' },
    messages: [
      { id: 'u1', role: 'interviewer', kind: 'question', text: copy.updateGreeting, time: '6:10 PM' },
      { id: 'u2', role: 'user', kind: 'answer', text: 'Style', time: '6:11 PM', status: 'sent' },
      { id: 'u3', role: 'interviewer', kind: 'question', text: copy.questions.style.title, time: '6:11 PM' },
      { id: 'u4', role: 'user', kind: 'answer', text: 'Friendly · Detailed · Examples first', time: '6:12 PM', status: 'sent' },
      { id: 'u5', role: 'interviewer', kind: 'question', text: `${copy.acks[0]} ${copy.questions.needs.title}`, time: '6:12 PM' },
    ],
    draft: { ...SAMPLE_ITEMS, tone: 'friendly', length: 'detailed' },
    startedAt: '2026-10-12T18:10:00',
    lastActivityAt: '2026-10-12T18:12:00',
    conflict: conflicts,
  };
}

