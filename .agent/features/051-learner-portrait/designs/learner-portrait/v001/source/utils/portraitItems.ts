import {
  AGE_RANGES,
  GOALS,
  LENGTHS,
  LEVELS,
  MIXING,
  NEEDS,
  ORDERS,
  TONES,
  WORDINGS,
  LIMITS,
  labelOf,
} from '../data/portraitOptions';
import type { LanguageEntry, PortraitItems } from '../types/portrait';
import { validateShortText } from './text';

export function emptyItems(): PortraitItems {
  return {
    languages: [],
    explanationLanguages: [],
    mixing: null,
    mixingNote: '',
    goals: [],
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
}

export function cloneItems(items: PortraitItems): PortraitItems {
  return {
    ...items,
    languages: items.languages.map((l) => ({ ...l })),
    explanationLanguages: [...items.explanationLanguages],
    goals: [...items.goals],
    customGoals: [...items.customGoals],
    needs: [...items.needs],
    customNeeds: [...items.customNeeds],
    interests: [...items.interests],
    notes: items.notes.map((n) => ({ ...n })),
  };
}

export function countItems(items: PortraitItems): number {
  let n = 0;
  n += items.languages.length;
  n += items.explanationLanguages.length > 0 ? 1 : 0;
  n += items.mixing ? 1 : 0;
  n += items.mixingNote.trim() ? 1 : 0;
  n += items.goals.length + items.customGoals.length;
  n += [items.tone, items.length, items.wording, items.order].filter(Boolean).length;
  n += items.needs.length + items.customNeeds.length;
  n += items.interests.length;
  n += items.ageRange && items.ageRange !== 'prefer-not' ? 1 : 0;
  n += items.notes.length;
  return n;
}

export function isMeaningful(items: PortraitItems): boolean {
  return countItems(items) > 0;
}

/** Number of text fields that still need fixing (too long or containing diagnostic labels). */
export function invalidFieldCount(items: PortraitItems): number {
  const max = LIMITS.customAnswer;
  let n = 0;
  if (validateShortText(items.mixingNote, max)) n += 1;
  items.languages.forEach((l) => validateShortText(l.note, max, true) && (n += 1));
  items.customGoals.forEach((g) => validateShortText(g, max) && (n += 1));
  items.customNeeds.forEach((g) => validateShortText(g, max, true) && (n += 1));
  items.notes.forEach((g) => validateShortText(g.text, max, true) && (n += 1));
  return n;
}

function languageLine(l: LanguageEntry): string {
  const parts = [l.name];
  if (l.level) parts.push(labelOf(LEVELS, l.level));
  if (l.learning) parts.push('learning');
  if (l.note.trim()) parts.push(`“${l.note.trim()}”`);
  return parts.join(' · ');
}

export type DiffKind = 'added' | 'changed' | 'removed';
export interface DiffEntry {
  kind: DiffKind;
  group: string;
  text: string;
  before?: string;
}

function diffList(group: string, before: string[], after: string[], out: DiffEntry[]) {
  after.filter((a) => !before.includes(a)).forEach((a) => out.push({ kind: 'added', group, text: a }));
  before.filter((b) => !after.includes(b)).forEach((b) => out.push({ kind: 'removed', group, text: b }));
}

function diffValue(group: string, before: string, after: string, out: DiffEntry[]) {
  if (before === after) return;
  if (!before) out.push({ kind: 'added', group, text: after });
  else if (!after) out.push({ kind: 'removed', group, text: before });
  else out.push({ kind: 'changed', group, text: after, before });
}

export function diffItems(prev: PortraitItems, next: PortraitItems): DiffEntry[] {
  const out: DiffEntry[] = [];
  const prevLangs = new Map(prev.languages.map((l) => [l.name, languageLine(l)]));
  const nextLangs = new Map(next.languages.map((l) => [l.name, languageLine(l)]));
  nextLangs.forEach((line, name) => {
    const before = prevLangs.get(name);
    if (!before) out.push({ kind: 'added', group: 'Languages', text: line });
    else if (before !== line) out.push({ kind: 'changed', group: 'Languages', text: line, before });
  });
  prevLangs.forEach((line, name) => {
    if (!nextLangs.has(name)) out.push({ kind: 'removed', group: 'Languages', text: line });
  });
  diffValue('Explanation languages', prev.explanationLanguages.join(', '), next.explanationLanguages.join(', '), out);
  diffValue('Language mixing', labelOf(MIXING, prev.mixing), labelOf(MIXING, next.mixing), out);
  diffValue('Mixing note', prev.mixingNote, next.mixingNote, out);
  diffList(
    'Goals',
    [...prev.goals.map((g) => labelOf(GOALS, g)), ...prev.customGoals],
    [...next.goals.map((g) => labelOf(GOALS, g)), ...next.customGoals],
    out,
  );
  diffValue('Tone', labelOf(TONES, prev.tone), labelOf(TONES, next.tone), out);
  diffValue('Explanation length', labelOf(LENGTHS, prev.length), labelOf(LENGTHS, next.length), out);
  diffValue('Wording', labelOf(WORDINGS, prev.wording), labelOf(WORDINGS, next.wording), out);
  diffValue('Examples or theory', labelOf(ORDERS, prev.order), labelOf(ORDERS, next.order), out);
  diffList(
    'Learning needs',
    [...prev.needs.map((n) => labelOf(NEEDS, n)), ...prev.customNeeds],
    [...next.needs.map((n) => labelOf(NEEDS, n)), ...next.customNeeds],
    out,
  );
  diffList('Interests', prev.interests, next.interests, out);
  diffValue('Age range', labelOf(AGE_RANGES, prev.ageRange), labelOf(AGE_RANGES, next.ageRange), out);
  diffList('Notes', prev.notes.map((n) => n.text), next.notes.map((n) => n.text), out);
  return out;
}

