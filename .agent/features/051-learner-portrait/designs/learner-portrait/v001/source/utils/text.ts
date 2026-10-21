const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/** Counts user-perceived characters (grapheme clusters), including spaces and punctuation. */
export function countChars(value: string): number {
  if (!value) return 0;
  if (segmenter) {
    let n = 0;
    for (const _ of segmenter.segment(value)) n += 1;
    return n;
  }
  return Array.from(value).length;
}

const DIAGNOSTIC_PATTERN =
  /\b(adhd|add|dyslexi\w*|dyscalculi\w*|dyspraxi\w*|autis\w*|asperger\w*|ocd|ptsd|bipolar|diagnos\w*|disorder|anxiety disorder|depression)\b/i;

export function containsDiagnosticLabel(value: string): boolean {
  return DIAGNOSTIC_PATTERN.test(value);
}

export const DIAGNOSTIC_ERROR =
  'Describe what helps you learn or a concrete learning preference. Remove diagnostic labels and diagnosis statements.';

export function validateShortText(value: string, max: number, checkDiagnostic = false): string | undefined {
  const n = countChars(value);
  if (n > max) {
    return `This is ${n.toLocaleString()} characters. Shorten it to ${max.toLocaleString()} or fewer — nothing has been cut.`;
  }
  if (checkDiagnostic && containsDiagnosticLabel(value)) return DIAGNOSTIC_ERROR;
  return undefined;
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Produces the interviewer's compact (≤ max) restatement. Shortening is always flagged, never silent. */
export function compactAnswer(raw: string, max = 200): { text: string; shortened: boolean } {
  let text = raw
    .replace(/\s+/g, ' ')
    .replace(/^(um+|uh+|well|so|i think|honestly|basically)[,\s]+/i, '')
    .trim();
  text = capitalize(text);
  if (!/[.!?…]$/.test(text)) text += '.';
  if (countChars(text) <= max) return { text, shortened: false };
  const firstSentence = text.split(/(?<=[.!?])\s/)[0];
  if (countChars(firstSentence) <= max) return { text: firstSentence, shortened: true };
  const words = text.split(' ');
  let out = '';
  for (const w of words) {
    if (countChars(`${out} ${w}…`) > max) break;
    out = out ? `${out} ${w}` : w;
  }
  return { text: `${out}…`, shortened: true };
}

