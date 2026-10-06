import type { ReferenceComparison, ReferenceDifference } from '../types';

const differences: ReferenceDifference[] = [
    'unicode',
    'apostrophes',
    'case',
    'punctuation',
    'spaces',
];
const meaningfulPunctuation = new Set(['%', '#', '@', '/', '\\', '&', '_']);

/** A textual comparison, not a semantic assessment. Accents and meaningful symbols stay significant. */
export function normalizeReferenceAnswer(
    value: string,
    locale?: string,
    omit?: ReferenceDifference,
): string {
    let text = omit === 'unicode' ? value : value.normalize('NFC');
    if (omit !== 'apostrophes') text = text.replace(/[’‘ʼ]/gu, "'");
    if (omit !== 'case') {
        try {
            text = text.toLocaleLowerCase(locale);
        } catch {
            text = text.toLowerCase();
        }
    }
    if (omit !== 'punctuation') {
        text = text.replace(/(?<![\p{L}\p{M}])'|'(?![\p{L}\p{M}])/gu, ' ');
        text = text.replace(/\p{P}/gu, (character, offset: number) => {
            if (character === "'" || meaningfulPunctuation.has(character))
                return character;
            if (
                '-.,:'.includes(character) &&
                /\p{N}/u.test(text[offset - 1] ?? '') &&
                /\p{N}/u.test(text[offset + 1] ?? '')
            )
                return character;
            if (character === '-' && /\p{N}/u.test(text[offset + 1] ?? ''))
                return character;
            return ' ';
        });
    }
    if (omit !== 'spaces') text = text.replace(/\s+/gu, ' ').trim();
    return text;
}

export function compareReferenceAnswer(
    answer: string,
    reference: string,
    locale?: string,
): ReferenceComparison {
    const normalizedAnswer = normalizeReferenceAnswer(answer, locale);
    const normalizedReference = normalizeReferenceAnswer(reference, locale);
    let kind: ReferenceComparison['kind'] = 'different';
    if (!answer.trim()) kind = 'reference-only';
    else if (normalizedAnswer === normalizedReference) kind = 'match';
    const ignored =
        kind === 'match'
            ? differences.filter(
                  (difference) =>
                      normalizeReferenceAnswer(answer, locale, difference) !==
                      normalizeReferenceAnswer(reference, locale, difference),
              )
            : [];
    return {
        kind,
        answer,
        reference,
        normalizedAnswer,
        normalizedReference,
        ignored,
    };
}
