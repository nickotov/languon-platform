import type { Block } from '../types/tutor';
import type { DocMeta, Reference, Suggestion } from '../types/document';
import type { BlockProposalData } from '../types/blocks';

export const DOC_TITLE = 'Le ménage du samedi';
export const SECTION = 'Where I still hesitate';
export const CHECK_SECTION = 'Sentences to check';

export const TARGET_SENTENCE = 'I keep writing “je fais le carrelage” when I mean cleaning the tiles, but that sounds like I’m laying them.';
export const GUESS_SENTENCE = 'My guess: “laver le carrelage” is the natural way to say it.';
export const CHECK_SENTENCE = 'Le samedi, je fais la ménage et mon frère fait les vaisselles.';

export const savedDocHtml = `
<h2>In short</h2>
<p>My Saturday routine in French: who does which chore, and the words I keep mixing up. Most chores use <strong>faire</strong> + noun: <em>faire le ménage</em>, <em>faire la vaisselle</em>, <em>faire les courses</em>.</p>
<blockquote><p>« Le samedi, c’est le jour du ménage. » — what my host mother in Lyon said every weekend</p></blockquote>
<h2>Chores and verbs</h2>
<table><tbody><tr><th>Chore</th><th>French</th><th>Russian</th></tr><tr><td>clean the house</td><td>faire le ménage</td><td>убираться</td></tr><tr><td>wash the dishes</td><td>faire la vaisselle</td><td>мыть посуду</td></tr><tr><td>do the shopping</td><td>faire les courses</td><td>ходить за покупками</td></tr><tr><td>feed the cat</td><td>nourrir le chat</td><td>кормить кошку</td></tr></tbody></table>
<h2>${SECTION}</h2>
<p>${TARGET_SENTENCE} ${GUESS_SENTENCE}</p>
`;

export const workingAdditionHtml = `
<h2>${CHECK_SECTION}</h2>
<p>${CHECK_SENTENCE} Ensuite, nous allons au marché pour acheter du poisson.</p>
<h2>Next</h2>
<p>Write five sentences about my weekend and ask the tutor to check only the ones I’m unsure about.</p>
`;

export const workingDocHtml = savedDocHtml + workingAdditionHtml;

export const otherDeviceHtml =
  savedDocHtml.replace(TARGET_SENTENCE, `${TARGET_SENTENCE.slice(0, -1)} — the tutor said to think “laver”.`) +
  `
<h2>${CHECK_SECTION}</h2>
<p>Added on the train: « Le dimanche, mon père fait la cuisine. »</p>
`;

export const filledMeta: DocMeta = {
  summary: 'Household chores in French with faire + noun, the words I mix up, and practice for Saturday routines.',
  categories: ['Vocabulary & meaning', 'Usage & register'],
  studiedLanguage: 'French',
  explanationLanguage: 'English',
};

export const emptyMeta: DocMeta = { summary: '', categories: [], studiedLanguage: '', explanationLanguage: '' };

export const metaCategories = ['Grammar', 'Vocabulary & meaning', 'Usage & register', 'Pronunciation', 'Etymology', 'Culture', 'Learning tips'];

export const metaLanguages = ['French', 'Russian', 'English', 'Spanish', 'German', 'Italian', 'Portuguese', 'Japanese'];

export const copiedReferences: Reference[] = [
  {
    id: 'ref-class',
    title: 'Class notes — 12 May',
    excerpt: 'Faire + noun for chores: faire le ménage, faire la lessive…',
    text: 'Faire + noun for chores: faire le ménage, faire la lessive, faire la vaisselle. Laver + object when you wash something specific: laver le sol, laver le carrelage, laver la voiture. Ranger = to tidy: ranger sa chambre.',
  },
  {
    id: 'ref-dict',
    title: 'Dictionary entry · ménage',
    excerpt: 'ménage (m.) — уборка; домашнее хозяйство…',
    text: 'ménage (m.) [me.naʒ] — уборка; домашнее хозяйство. Faire le ménage — убираться. Une femme de ménage — домработница. Example: Je fais le ménage le samedi. — Я убираюсь по субботам.',
  },
  {
    id: 'ref-grammar',
    title: 'Grammar book, ch. 7 (long passage)',
    excerpt: 'Chapter 7 covers support verbs in French in depth…',
    text: 'Chapter 7 covers support verbs in French in depth. '.repeat(780),
  },
];

export interface TutorScript {
  blocks: Block[];
  suggestion?: Suggestion;
  proposal?: () => BlockProposalData;
}

export type ScriptKey = 'tiles' | 'guess' | 'generic' | 'practice' | 'summary' | 'outline' | 'contrast' | 'check';

export const tutorScripts: Record<ScriptKey, TutorScript> = {
  tiles: {
    blocks: [
      { type: 'p', text: 'You’re right to hesitate. **Faire le carrelage** sounds like *laying* tiles. For cleaning a specific surface, French uses **laver** + object.' },
      { type: 'example', source: 'Je **lave** le carrelage de la cuisine.', translation: 'Я мою плитку на кухне.', lang: 'fr' },
      { type: 'example', source: 'Je **fais** le ménage.', translation: 'Я убираюсь.', lang: 'fr' },
      { type: 'p', text: 'Quick test: general chore → *faire*; a specific thing you wash → *laver*.' },
    ],
    suggestion: {
      label: 'Tip for the sheet',
      inlineText: 'Specific surfaces take laver: laver le carrelage.',
      inlineHtml: 'Specific surfaces take <strong>laver</strong>: <em>laver le carrelage</em>.',
      blockHtml: '<p><strong>Tip:</strong> general chores take <em>faire</em> (faire le ménage); a specific thing you wash takes <em>laver</em> (laver le carrelage).</p>',
    },
  },
  guess: {
    blocks: [
      { type: 'p', text: 'Your guess is right. **Laver le carrelage** is natural. You may also hear *nettoyer le carrelage*, which is a little more general (“to clean”).' },
      { type: 'example', source: 'Il faut **laver** le carrelage de la salle de bain.', translation: 'Нужно помыть плитку в ванной.', lang: 'fr' },
    ],
    suggestion: {
      label: 'Refined explanation',
      inlineText: '“Laver le carrelage” is natural; “nettoyer le carrelage” is a more general “clean”.',
      inlineHtml: '“Laver le carrelage” is natural; “nettoyer le carrelage” is a more general <em>clean</em>.',
      blockHtml: '<p><em>Laver le carrelage</em> is natural; <em>nettoyer le carrelage</em> is a more general “clean”.</p>',
    },
  },
  generic: {
    blocks: [
      { type: 'p', text: 'This passage is clear. It may help to state the rule explicitly: *faire* + chore noun for routines, *laver* + object for washing something specific.' },
    ],
    suggestion: {
      label: 'One-line rule',
      inlineText: 'Rule: routine chore → faire; specific thing you wash → laver.',
      inlineHtml: '<strong>Rule:</strong> routine chore → <em>faire</em>; specific thing you wash → <em>laver</em>.',
      blockHtml: '<p><strong>Rule:</strong> routine chore → <em>faire</em>; specific thing you wash → <em>laver</em>.</p>',
    },
  },
  practice: {
    blocks: [
      { type: 'p', text: 'Three sentences with the same construction:' },
      { type: 'example', source: 'Je **lave** la voiture le dimanche.', translation: 'Я мою машину по воскресеньям.', lang: 'fr' },
      { type: 'example', source: 'Elle **lave** les fenêtres au printemps.', translation: 'Весной она моет окна.', lang: 'fr' },
      { type: 'example', source: 'Nous **lavons** le sol de l’entrée.', translation: 'Мы моем пол в прихожей.', lang: 'fr' },
    ],
  },
  summary: {
    blocks: [{ type: 'p', text: 'The sheet covers the core pattern and your tricky cases well. A short summary at the end would make it quicker to review before class.' }],
    suggestion: {
      label: 'Summary',
      inlineText: 'Summary: faire + chore for routines; laver + object for specific things.',
      inlineHtml: 'Summary: <strong>faire</strong> + chore for routines; <strong>laver</strong> + object for specific things.',
      blockHtml: '<h2>Summary</h2><p><strong>Faire</strong> + chore noun for routines; <strong>laver</strong> + object for washing something specific.</p>',
    },
  },
  outline: {
    blocks: [
      { type: 'p', text: 'Here’s a structure that works well for a vocabulary sheet. Add it and fill it in as you go.' },
      { type: 'ol', items: ['**In short** — the pattern in one sentence', '**Key words** — a vocabulary block', '**Tricky cases**', '**Practice** — an exercises block'] },
    ],
    suggestion: {
      label: 'Sheet outline',
      inlineText: 'In short · Key words · Tricky cases · Practice',
      inlineHtml: 'In short · Key words · Tricky cases · Practice',
      blockHtml: '<h2>In short</h2><p><br></p><h2>Key words</h2><p><br></p><h2>Tricky cases</h2><p><br></p><h2>Practice</h2><p><br></p>',
    },
  },
  contrast: {
    blocks: [
      { type: 'p', text: 'Put simply: **faire** names the *chore*, **laver** names the *action on an object*.' },
      { type: 'example', source: 'Je **fais** la vaisselle.', translation: 'Я мою посуду (делаю эту работу).', lang: 'fr' },
      { type: 'example', source: 'Je **lave** cette assiette.', translation: 'Я мою эту тарелку.', lang: 'fr' },
    ],
  },
  check: {
    blocks: [
      { type: 'p', text: 'There are two mistakes in “Sentences to check”:' },
      {
        type: 'ul',
        items: ['*la ménage* → **le ménage** — “ménage” is masculine.', '*les vaisselles* → **la vaisselle** — it’s an uncountable singular noun.'],
      },
      { type: 'p', text: 'Select the sentence and choose **Correct** to see the edit on the text itself.' },
    ],
  },
};

/** Grammar fixes the prototype tutor recognises in selected French text. */
export const corrections = [
  { find: 'la ménage', replace: 'le ménage', why: '“ménage” is masculine.' },
  { find: 'les vaisselles', replace: 'la vaisselle', why: '“vaisselle” is an uncountable singular noun.' },
];

/** Simplified / rephrased versions of sentences in the demo sheet. */
export const rewrites = [
  {
    sentence: TARGET_SENTENCE,
    simplify: 'I write “faire le carrelage” for cleaning tiles, but it means laying them.',
    rephrase: 'I used to write “faire le carrelage” for cleaning tiles; for washing a surface, French uses “laver le carrelage”.',
  },
  {
    sentence: GUESS_SENTENCE,
    simplify: 'I think “laver le carrelage” is correct.',
    rephrase: 'It seems “laver le carrelage” is the natural phrase.',
  },
];

/** Translations for the French sentences in the demo sheet. */
export const translations = [
  { es: 'Le samedi, c’est le jour du ménage', ru: 'Суббота — день уборки' },
  { es: 'faire le ménage', ru: 'убираться' },
  { es: 'faire la vaisselle', ru: 'мыть посуду' },
  { es: 'faire les courses', ru: 'ходить за покупками' },
  { es: 'Le samedi, je fais la ménage et mon frère fait les vaisselles', ru: 'По субботам я убираюсь, а мой брат моет посуду' },
  { es: 'Ensuite, nous allons au marché pour acheter du poisson', ru: 'Потом мы идём на рынок купить рыбы' },
  { es: 'laver le carrelage', ru: 'мыть плитку' },
];

