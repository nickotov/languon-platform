import type { Block } from '../types/tutor';
import type { DocMeta, Reference, Suggestion } from '../types/document';

export const DOC_TITLE = 'Why ‘ser’ and ‘estar’ change meaning';

export const savedDocHtml = `
<h2>The short version</h2>
<p>Both verbs translate as <em>to be</em>, but they answer different questions. <strong>Ser</strong> describes what something <em>is</em> — identity, origin, characteristics. <strong>Estar</strong> describes how something <em>is right now</em> — states, locations, and the results of a change.</p>
<blockquote><p>“Ser es lo que eres; estar es cómo estás.” — the line my teacher repeats every Thursday</p></blockquote>
<h2>Adjectives that change meaning</h2>
<p>Some adjectives change meaning completely depending on the verb. This is where most of my mistakes happen.</p>
<table><tbody><tr><th><p>Adjective</p></th><th><p>With ser</p></th><th><p>With estar</p></th></tr><tr><td><p>listo</p></td><td><p>clever</p></td><td><p>ready</p></td></tr><tr><td><p>aburrido</p></td><td><p>boring</p></td><td><p>bored</p></td></tr><tr><td><p>rico</p></td><td><p>rich</p></td><td><p>delicious</p></td></tr><tr><td><p>malo</p></td><td><p>bad (character)</p></td><td><p>ill</p></td></tr></tbody></table>
<h2>Examples from class</h2>
<ul><li><p><strong>Mi hermano es listo.</strong> — My brother is clever.</p></li><li><p><strong>¿Estás listo?</strong> — Are you ready?</p></li><li><p><strong>La película es aburrida.</strong> — The film is boring.</p></li><li><p><strong>Estoy aburrida.</strong> — I’m bored.</p></li></ul>
<h2>Where I still hesitate</h2>
<p>Location of events uses ser, even though location of things uses estar. La fiesta es en mi casa, but las llaves están en la mesa. I keep writing está for events because it feels like a place.</p>
<p>Another tricky case is death: we say <em>está muerto</em>, although death is permanent. My guess is that estar marks the result of a change rather than a temporary state.</p>
`;

export const workingAdditionHtml = `
<h2>Practice sentences</h2>
<ol><li><p>El concierto ___ en el teatro municipal.</p></li><li><p>Esta sopa ___ muy rica.</p></li><li><p>Mi abuela ___ de Sevilla, pero ahora ___ en Madrid.</p></li></ol>
<h2>Next steps</h2>
<p>Write ten sentences about my week using both verbs, then ask the tutor to check only the ones where I hesitated. Review the adjective table again before Thursday.</p>
`;

export const workingDocHtml = savedDocHtml + workingAdditionHtml;

export const otherDeviceHtml =
  savedDocHtml.replace(
    'I keep writing está for events because it feels like a place.',
    'I keep writing está for events because it feels like a place — the tutor suggested thinking “takes place” instead.',
  ) +
  `
<h2>Practice sentences</h2>
<ol><li><p>El concierto ___ en el teatro municipal.</p></li><li><p>La reunión ___ a las cinco.</p></li></ol>
<p>Added on the train: listen for <em>estar</em> + gerund in the podcast this week.</p>
`;

export const TARGET_SENTENCE = 'I keep writing está for events because it feels like a place.';

export const filledMeta: DocMeta = {
  summary: 'When to use ser vs estar, adjectives that change meaning, and the cases I still get wrong.',
  categories: ['Grammar', 'Usage & register'],
  studiedLanguage: 'Spanish',
  explanationLanguage: 'English',
};

export const emptyMeta: DocMeta = {
  summary: '',
  categories: [],
  studiedLanguage: '',
  explanationLanguage: '',
};

export const metaCategories = [
  'Grammar',
  'Vocabulary & meaning',
  'Usage & register',
  'Pronunciation',
  'Etymology',
  'Culture',
  'Learning tips',
];

export const metaLanguages = ['Spanish', 'English', 'French', 'German', 'Italian', 'Portuguese', 'Japanese'];

export const copiedReferences: Reference[] = [
  {
    id: 'ref-class',
    title: 'Class notes — 12 May',
    excerpt: 'Estar + participio describes a resulting state: la puerta está cerrada…',
    text: 'Estar + participio describes a resulting state: la puerta está cerrada, la tienda está abierta, el trabajo está terminado. Ser + participio forms the passive voice: la puerta fue cerrada por el portero. In speech the passive with ser is rare; Spanish prefers se + verb.',
  },
  {
    id: 'ref-podcast',
    title: 'Podcast transcript, ep. 41',
    excerpt: '—¿Cómo es tu nueva jefa? —Es muy simpática, pero hoy está de mal humor…',
    text: '—¿Cómo es tu nueva jefa? —Es muy simpática, pero hoy está de mal humor porque el proyecto está retrasado. —¿Y dónde es la reunión? —Es en la sala grande, la que está al lado de la cafetería.',
  },
  {
    id: 'ref-grammar',
    title: 'Grammar book, chapter 7 (long excerpt)',
    excerpt: 'Chapter 7 covers copular verbs across Romance languages in depth…',
    text: 'Chapter 7 covers copular verbs across Romance languages in depth. '.repeat(380),
  },
];

export interface TutorScript {
  blocks: Block[];
  suggestion: Suggestion;
}

export const tutorScripts: Record<'events' | 'death' | 'generic' | 'practice' | 'summary', TutorScript> = {
  events: {
    blocks: [
      { type: 'p', text: 'Good instinct to question it. Events take **ser** because they *take place* — they happen, rather than sit somewhere.' },
      { type: 'example', source: 'La fiesta **es** en mi casa.', translation: 'The party is (takes place) at my house.', lang: 'es' },
      { type: 'example', source: 'Las llaves **están** en la mesa.', translation: 'The keys are on the table.', lang: 'es' },
      { type: 'p', text: 'A quick test: if you can say *takes place*, use **ser**.' },
    ],
    suggestion: {
      label: 'Rewrite of the selected sentence',
      inlineText: 'I used to write está for events, but events “take place”, so they use ser.',
      inlineHtml: 'I used to write está for events, but events “take place”, so they use <strong>ser</strong>.',
      blockHtml:
        '<p><strong>Tip:</strong> events <em>take place</em>, so they use ser (<em>La reunión es a las cinco en la oficina</em>), while things and people are located with estar.</p>',
    },
  },
  death: {
    blocks: [
      { type: 'p', text: 'Your guess is right. **Estar muerto** describes the *result* of dying, not how long it lasts.' },
      { type: 'example', source: 'Mi abuelo **está** muerto.', translation: 'My grandfather is dead.', lang: 'es' },
      { type: 'p', text: 'The same logic covers *estar casado* or *estar roto*: states that follow a change.' },
    ],
    suggestion: {
      label: 'Clarified explanation',
      inlineText: 'Estar marks the result of a change — muerto, casado, roto — not how long the state lasts.',
      inlineHtml: 'Estar marks the <em>result of a change</em> — muerto, casado, roto — not how long the state lasts.',
      blockHtml: '<p>Estar marks the <em>result of a change</em> — <em>muerto, casado, roto</em> — not how long the state lasts.</p>',
    },
  },
  generic: {
    blocks: [
      { type: 'p', text: 'This passage is clear. One thing to tighten: say *what something is* (ser) versus *how it is now* (estar) explicitly, so your future self can apply it quickly.' },
      { type: 'p', text: 'You could add a one-line check to the passage.' },
    ],
    suggestion: {
      label: 'One-line check',
      inlineText: 'Check: describing what something is → ser; how it is right now → estar.',
      inlineHtml: '<strong>Check:</strong> describing what something <em>is</em> → ser; how it is <em>right now</em> → estar.',
      blockHtml: '<p><strong>Check:</strong> describing what something <em>is</em> → ser; how it is <em>right now</em> → estar.</p>',
    },
  },
  practice: {
    blocks: [
      { type: 'p', text: 'Here are three more gaps that target the cases you hesitate on — events, results of change, and adjectives that switch meaning.' },
      { type: 'ol', items: ['La boda ___ en la playa.', 'La ventana ___ rota desde ayer.', 'Ese chico ___ muy listo, pero hoy no ___ listo para el examen.'] },
    ],
    suggestion: {
      label: 'Three practice sentences',
      inlineText: 'La boda ___ en la playa. La ventana ___ rota desde ayer.',
      inlineHtml: 'La boda ___ en la playa. La ventana ___ rota desde ayer.',
      blockHtml: '<ol><li><p>La boda ___ en la playa.</p></li><li><p>La ventana ___ rota desde ayer.</p></li><li><p>Ese chico ___ muy listo, pero hoy no ___ listo para el examen.</p></li></ol>',
    },
  },
  summary: {
    blocks: [
      { type: 'p', text: 'Your note covers the core contrast and the tricky cases well. A two-sentence summary at the end would make it easier to review before class.' },
    ],
    suggestion: {
      label: 'Closing summary',
      inlineText: 'In short: ser for identity and events, estar for states and results.',
      inlineHtml: 'In short: <strong>ser</strong> for identity and events, <strong>estar</strong> for states and results.',
      blockHtml: '<h2>In short</h2><p><strong>Ser</strong> for identity, origin and events; <strong>estar</strong> for states, locations of things and the results of a change.</p>',
    },
  },
};

