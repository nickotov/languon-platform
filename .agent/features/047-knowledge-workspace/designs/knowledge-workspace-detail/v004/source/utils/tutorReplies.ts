import type { Block } from '../types/tutor';
import type { SelectionAction, Suggestion } from '../types/document';
import { corrections, rewrites, translations, tutorScripts } from '../data/documentContent';
import type { ScriptKey } from '../data/documentContent';

/**
 * Prototype reply generator. Production would send the action as a prompt template to the
 * chat endpoint and receive a structured replacement for edit actions.
 */
export interface ReplyContent {
  blocks: Block[];
  suggestion?: Suggestion;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function replaceSuggestion(label: string, original: string, next: string): Suggestion {
  return { label, kind: 'replace', original, inlineText: next, inlineHtml: esc(next), blockHtml: `<p>${esc(next)}</p>` };
}

export function pickScript(question: string, passage?: string): ScriptKey {
  const t = `${question} ${passage ?? ''}`.toLowerCase();
  if (/muert|смерт/.test(t)) return 'death';
  if (/провер|граммат|ошиб/.test(t)) return 'check';
  if (/событ|fiesta|evento|está для/.test(t)) return 'events';
  if (/упражн|практик|тренир|пример/.test(t)) return 'practice';
  if (/план|структур|начать|начни|темы/.test(t)) return 'outline';
  if (/проще|разниц|прост/.test(t)) return 'contrast';
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
          { type: 'p', text: 'Грамматических ошибок в этом фрагменте я не нашёл.' },
          { type: 'p', text: 'Если хотите, предложу более естественную формулировку — выберите «Перефразировать».' },
        ],
      };
    }
    const corrected = fixes.reduce((acc, f) => acc.replace(f.find, f.replace), text);
    return {
      blocks: [
        { type: 'p', text: fixes.length === 1 ? 'Нашёл одну ошибку. Правка показана прямо в тексте.' : `Нашёл ${fixes.length} ошибки. Правка показана прямо в тексте.` },
        { type: 'ul', items: fixes.map((f) => `*${f.find}* → **${f.replace}** — ${f.why}`) },
      ],
      suggestion: replaceSuggestion('Исправление грамматики', text, corrected),
    };
  }

  if ((action === 'simplify' || action === 'rephrase') && passage) {
    const match = rewrites.find((r) => text.includes(r.sentence));
    if (!match) {
      return {
        blocks: [
          {
            type: 'p',
            text:
              action === 'simplify'
                ? 'Этот фрагмент уже достаточно простой — короче его не сделать без потери смысла.'
                : 'Формулировка уже точная. Я бы оставил её как есть.',
          },
        ],
      };
    }
    const next = text.replace(match.sentence, action === 'simplify' ? match.simplify : match.rephrase);
    return {
      blocks: [
        {
          type: 'p',
          text:
            action === 'simplify'
              ? 'Вот более простой вариант — смысл тот же, но читается быстрее.'
              : 'Вот вариант, который сразу объясняет правило, а не только описывает ошибку.',
        },
      ],
      suggestion: replaceSuggestion(action === 'simplify' ? 'Упрощённый вариант' : 'Новая формулировка', text, next),
    };
  }

  if (action === 'translate' && passage) {
    const lower = text.toLowerCase();
    const found = translations.filter((tr) => lower.includes(tr.es.toLowerCase()));
    if (found.length) {
      return {
        blocks: [
          { type: 'p', text: found.length === 1 ? 'Перевод:' : 'Перевод по предложениям:' },
          ...found.map<Block>((tr) => ({ type: 'example', source: tr.es, translation: tr.ru, lang: 'es' })),
        ],
      };
    }
    return {
      blocks: [
        {
          type: 'p',
          text: /[а-яё]/i.test(text)
            ? 'В этом фрагменте нет текста на испанском. Выделите испанский пример — и я его переведу.'
            : 'Выделите предложение целиком — так перевод учтёт контекст.',
        },
      ],
    };
  }

  if (action === 'examples') return tutorScripts.practice;

  return tutorScripts[pickScript(question, passage)];
}

