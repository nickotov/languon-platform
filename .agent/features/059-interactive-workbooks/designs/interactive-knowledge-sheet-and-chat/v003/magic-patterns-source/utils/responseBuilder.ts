import type {
  Attachment,
  Block,
  DictionaryCard,
  KnowledgeNote,
  Material,
  SourceKind,
  Usage,
} from '../types/tutor';
import { draftTemplates, noteUpdateAddition, responses } from '../data/responses';
import type { DraftTemplate } from '../data/responses';
import { cafeText, nuancesDictionary } from '../data/sources';
import { blocksLength } from './richText';

export interface ResponseSpec {
  key: string;
  blocks: Block[];
  activities: { running: string; done: string }[];
  materials: Material[];
  materialsLabel: string;
  usage: Usage;
}

export function pickResponseKey(
  text: string,
  attachments: Attachment[],
  sourceKind: SourceKind,
): string {
  const t = text.toLowerCase();
  const cards = attachments.filter((a) => a.kind === 'card');
  const quote = attachments.find((a) => a.kind === 'quote' || a.kind === 'passage');
  if (sourceKind === 'note') return 'note';
  if (cards.length >= 2 || /compar|differen|versus| vs/.test(t)) return 'compare';
  if (/tone|ton |mood|style/.test(t)) return 'tone';
  if (/more examples|exemples|examples/.test(t)) return 'examples';
  if (/imparfait|passé|past tense|tenses/.test(t)) return 'long';
  if (/subjunctive|subjonctif|bien que|fasse/.test(t)) return 'subjunctive';
  if (quote && /pourtant/.test(quote.text)) return 'pourtant';
  if (quote) return 'quote';
  if (sourceKind === 'dictionary') return 'compare';
  return 'general';
}

function passageMaterials(ids: string[]): Material[] {
  return ids
    .map((id) => cafeText.passages.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      id: p.id,
      kind: 'passage' as const,
      title: `${cafeText.title} · paragraph ${p.index}`,
      excerpt: p.fr,
    }));
}

function cardMaterial(card: DictionaryCard): Material {
  return {
    id: card.id,
    kind: 'card',
    title: `${card.word} ${card.transcription}`,
    excerpt: `${card.translation} — ${card.definition}`,
  };
}

const POSITION: Record<string, string> = {
  pourtant: 'after the verb or at the start',
  cependant: 'start of the sentence',
  'quand-meme': 'end of the clause',
  neanmoins: 'start, after a semicolon',
  toutefois: 'start or after the verb',
  'malgre-tout': 'start of the sentence',
};

const NUANCE: Record<string, string> = {
  pourtant: 'surprising contrast',
  cependant: 'measured objection',
  'quand-meme': 'despite everything',
  neanmoins: 'concession, then firm conclusion',
  toutefois: 'adds a restriction',
  'malgre-tout': 'resilience',
};

function compareBlocks(cards: DictionaryCard[]): Block[] {
  const words = cards.map((c) => c.word);
  const blocks: Block[] = [
    {
      type: 'p',
      text: `All ${cards.length === 2 ? 'both' : cards.length} express contrast, but they differ in **position**, **register**, and how much *surprise* they carry.`,
    },
    {
      type: 'table',
      head: ['', ...words],
      rows: [
        ['Register', ...cards.map((c) => c.register.toLowerCase())],
        ['Typical position', ...cards.map((c) => POSITION[c.id] ?? '—')],
        ['Nuance', ...cards.map((c) => NUANCE[c.id] ?? c.translation)],
      ],
    },
    { type: 'h', text: 'In context' },
  ];
  cards.forEach((c) => {
    const ex = c.examples[0];
    const re = new RegExp(c.word.charAt(0).toUpperCase() + c.word.slice(1) + '|' + c.word);
    blocks.push({ type: 'example', source: ex.source.replace(re, (m) => `**${m}**`), translation: ex.translation });
  });
  blocks.push(
    { type: 'h', text: 'Rule of thumb' },
    {
      type: 'ol',
      items: [
        'Writing an essay? Reach for the **formal** ones.',
        'Talking with friends? *Quand même* sounds the most natural.',
        '**Pourtant** works almost everywhere and adds a note of surprise.',
      ],
    },
    { type: 'p', text: 'If you also study Arabic, the spoken sense of *quand même* is close to:' },
    { type: 'example', source: 'ومع ذلك ذهبنا', translation: 'And yet we went.', lang: 'ar', dir: 'rtl' },
  );
  return blocks;
}

function estimateUsage(blocks: Block[], credits: number, attachments: number): Usage {
  const out = Math.round(blocksLength(blocks) / 3.6);
  return { credits, inputTokens: 1180 + attachments * 210, outputTokens: out };
}

export function buildResponse(key: string, attachments: Attachment[]): ResponseSpec {
  if (key === 'compare') {
    const attached = attachments.filter((a) => a.card).map((a) => a.card as DictionaryCard);
    const cards = attached.length >= 2 ? attached : nuancesDictionary.cards.slice(0, 3);
    const base = responses.compareFallback;
    const blocks = compareBlocks(cards);
    return {
      key,
      blocks,
      activities: [
        base.activities[0],
        { running: 'Reading the relevant cards…', done: `Read ${cards.length} cards` },
      ],
      materials: cards.map(cardMaterial),
      materialsLabel: `Used ${cards.length} dictionary cards`,
      usage: estimateUsage(blocks, base.credits, attachments.length),
    };
  }
  const content = responses[key] ?? responses.general;
  return {
    key,
    blocks: content.blocks,
    activities: content.activities,
    materials: passageMaterials(content.passageIds),
    materialsLabel: content.materialsLabel,
    usage: estimateUsage(content.blocks, content.credits, attachments.length),
  };
}

export function noteMaterial(note: KnowledgeNote): Material {
  return { id: note.id, kind: 'note', title: note.title, excerpt: note.summary };
}

export function draftFromResponse(
  responseKey: string,
  mode: 'new' | 'update',
  note?: KnowledgeNote,
): DraftTemplate {
  if (mode === 'update' && note) {
    return {
      title: note.title,
      summary: `${note.summary} The conditional never follows it.`,
      body: `${note.body}\n${noteUpdateAddition}`,
      categories: note.categories,
    };
  }
  if (responseKey === 'note' && note) {
    return {
      title: 'Bien que : erreurs fréquentes',
      summary: 'Two common pitfalls after « bien que » and a simpler alternative with « malgré ».',
      body: noteUpdateAddition,
      categories: ['Grammar', 'Learning tips'],
    };
  }
  return draftTemplates[responseKey] ?? draftTemplates.fallback;
}

