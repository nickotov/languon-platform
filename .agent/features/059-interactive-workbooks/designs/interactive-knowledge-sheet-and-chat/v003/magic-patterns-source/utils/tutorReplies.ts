import type { Block } from '../types/tutor';
import type { SelectionAction, Suggestion } from '../types/document';
import type { BlockProposalData } from '../types/blocks';
import { corrections, rewrites, translations, tutorScripts } from '../data/documentContent';
import type { ScriptKey } from '../data/documentContent';
import { exercisesProposalBlock, vocabularyProposalBlock } from '../data/blockSamples';

/**
 * Prototype reply generator. Production sends the request to the chat endpoint, which returns
 * prose, a structured replacement for edit actions, or typed learning blocks.
 */
export interface ReplyContent {
  blocks: Block[];
  suggestion?: Suggestion;
  proposal?: BlockProposalData;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function replaceSuggestion(label: string, original: string, next: string): Suggestion {
  return { label, kind: 'replace', original, inlineText: next, inlineHtml: esc(next), blockHtml: `<p>${esc(next)}</p>` };
}

/** Explanation that accompanies a block proposal. Deliberately no prose suggestion: the proposal is the deliverable. */
function vocabularyReply(): ReplyContent {
  return {
    blocks: [{ type: 'p', text: 'Here are six everyday words for chores and home life, French → Russian, each with a short example. Review them below and apply the ones you want.' }],
    proposal: { label: 'Vocabulary', blocks: [vocabularyProposalBlock()] },
  };
}

function exercisesReply(): ReplyContent {
  return {
    blocks: [{ type: 'p', text: 'Three questions based on your chores table: one multiple choice, one blank and one translation. Each has a prepared answer and a short explanation.' }],
    proposal: { label: 'Exercises', blocks: [exercisesProposalBlock()] },
  };
}

export function pickScript(question: string, passage?: string): ScriptKey | 'vocabulary' | 'exercises' {
  const t = `${question} ${passage ?? ''}`.toLowerCase();
  if (/\bwords?\b|vocab|слов/.test(t)) return 'vocabulary';
  if (/exercis|quiz|упражн/.test(t)) return 'exercises';
  if (/guess|laver/.test(t)) return 'guess';
  if (/check|grammar|mistake/.test(t)) return 'check';
  if (/tile|carrelage/.test(t)) return 'tiles';
  if (/outline|structure|start|cover/.test(t)) return 'outline';
  if (/simpl|differen|faire/.test(t)) return 'contrast';
  if (passage) return 'generic';
  return 'summary';
}

export function buildReply(question: string, passage: string | undefined, action: SelectionAction | undefined): ReplyContent {
  const text = passage ?? '';

  if (action === 'correct' && passage) {
    const fixes = corrections.filter((c) => text.includes(c.find));
    if (!fixes.length) {
      return {
        blocks: [
          { type: 'p', text: 'I didn’t find grammar mistakes in this passage.' },
          { type: 'p', text: 'If you like, choose **Rephrase** for a more natural wording.' },
        ],
      };
    }
    const corrected = fixes.reduce((acc, f) => acc.replace(f.find, f.replace), text);
    return {
      blocks: [
        { type: 'p', text: fixes.length === 1 ? 'I found one mistake. The edit is shown on the text.' : `I found ${fixes.length} mistakes. The edit is shown on the text.` },
        { type: 'ul', items: fixes.map((f) => `*${f.find}* → **${f.replace}** — ${f.why}`) },
      ],
      suggestion: replaceSuggestion('Grammar correction', text, corrected),
    };
  }

  if ((action === 'simplify' || action === 'rephrase') && passage) {
    const match = rewrites.find((r) => text.includes(r.sentence));
    if (!match) {
      return {
        blocks: [{ type: 'p', text: action === 'simplify' ? 'This passage is already simple — shortening it would lose meaning.' : 'The wording is already precise. I’d keep it.' }],
      };
    }
    const next = text.replace(match.sentence, action === 'simplify' ? match.simplify : match.rephrase);
    return {
      blocks: [{ type: 'p', text: action === 'simplify' ? 'Here’s a simpler version with the same meaning.' : 'Here’s a version that states the rule, not just the mistake.' }],
      suggestion: replaceSuggestion(action === 'simplify' ? 'Simpler version' : 'New wording', text, next),
    };
  }

  if (action === 'translate' && passage) {
    const lower = text.toLowerCase();
    const found = translations.filter((tr) => lower.includes(tr.es.toLowerCase()));
    if (found.length) {
      return {
        blocks: [
          { type: 'p', text: found.length === 1 ? 'Translation:' : 'Translation by sentence:' },
          ...found.map<Block>((tr) => ({ type: 'example', source: tr.es, translation: tr.ru, lang: 'fr' })),
        ],
      };
    }
    return { blocks: [{ type: 'p', text: 'Select a French sentence and I’ll translate it in context.' }] };
  }

  if (action === 'examples') return tutorScripts.practice;

  const key = pickScript(question, passage);
  if (key === 'vocabulary') return vocabularyReply();
  if (key === 'exercises') return exercisesReply();
  const script = tutorScripts[key];
  return { blocks: script.blocks, suggestion: script.suggestion };
}

