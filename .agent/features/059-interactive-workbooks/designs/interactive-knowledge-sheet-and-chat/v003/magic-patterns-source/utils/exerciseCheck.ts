import type { ExerciseAttempt, ExerciseItem } from '../types/blocks';

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[.!?,;:«»"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Prototype stand-in for AI answer feedback. Accepts valid alternatives; identical wording isn't required. */
export function gradeFreeText(item: ExerciseItem, answer: string): Pick<ExerciseAttempt, 'result' | 'feedback'> {
  const a = norm(answer);
  if (a === norm(item.answer)) return { result: 'correct', feedback: 'Natural and accurate.' };
  if ((item.alternatives ?? []).some((alt) => norm(alt) === a)) {
    return { result: 'alternative', feedback: 'Correct — a valid alternative to the prepared answer, with the same meaning.' };
  }
  if (/nourri/.test(a) && !/le chat|au chat/.test(a)) return { result: 'revise', feedback: 'Good verb choice. Add the object: “nourrir le chat”.' };
  if (/nourrir/.test(a)) return { result: 'revise', feedback: 'Conjugate the verb: “je nourris”.' };
  if (/ménage|menage/.test(a) && /la ménage|la menage/.test(a)) return { result: 'revise', feedback: '“Ménage” is masculine: “le ménage”.' };
  if (/ménage|menage/.test(a)) return { result: 'alternative', feedback: 'The meaning comes across. Check the time expression: “le samedi” for every Saturday.' };
  return { result: 'revise', feedback: 'The meaning isn’t there yet. Try the hint, or compare with the prepared answer.' };
}

