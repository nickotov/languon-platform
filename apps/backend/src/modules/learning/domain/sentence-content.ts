import { z } from 'zod';
import { SENTENCE_LIMITS } from '@languon/contracts';
import { SentenceInvalidModelOutputError } from './sentence-errors';
import type {
    SentenceGeneratedContent,
    SentenceGenerationDraft,
    SentenceGenerationInput,
} from './sentence-types';
const text = (maximum: number) =>
    z
        .string()
        .min(1)
        .refine(
            (v) =>
                [...v].length <= maximum &&
                v.trim().length > 0 &&
                [...v].every((character) => {
                    const code = character.codePointAt(0)!;
                    return !(
                        code <= 8 ||
                        code === 11 ||
                        code === 12 ||
                        (code >= 14 && code <= 31) ||
                        (code >= 127 && code <= 159) ||
                        (code >= 0xd800 && code <= 0xdfff)
                    );
                }),
        );
export const SentenceGenerationDraftSchema = z
    .object({
        sourceText: text(SENTENCE_LIMITS.sourceCodePoints),
        referenceTranslation: text(SENTENCE_LIMITS.feedbackCodePoints),
        segments: z
            .array(
                z
                    .object({
                        text: z
                            .string()
                            .min(1)
                            .max(SENTENCE_LIMITS.sourceCodePoints * 2),
                        entryId: z.uuid().nullable(),
                    })
                    .strict(),
            )
            .min(1)
            .max(SENTENCE_LIMITS.segments),
        targets: z
            .array(
                z
                    .object({
                        entryId: z.uuid(),
                        normalizedHint: text(400),
                        hintForm: z.enum(['lemma', 'infinitive', 'phrase']),
                    })
                    .strict(),
            )
            .min(1)
            .max(SENTENCE_LIMITS.requiredTargets),
    })
    .strict();
export function normalizeSentenceHint(value: string): string {
    return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}
export function sentenceGraphemeBoundaries(value: string): ReadonlySet<number> {
    return new Set([
        0,
        value.length,
        ...Array.from(
            new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
                value,
            ),
            (segment) => segment.index,
        ),
    ]);
}
export function validateSentenceGeneration(
    input: SentenceGenerationInput,
    value: SentenceGenerationDraft,
): SentenceGeneratedContent {
    const parsed = SentenceGenerationDraftSchema.safeParse(value);
    if (!parsed.success) throw new SentenceInvalidModelOutputError();
    const draft = parsed.data;
    const candidates = new Map(
        input.candidates.map((entry) => [entry.entryId, entry]),
    );
    const ids = draft.targets.map((target) => target.entryId);
    if (
        input.candidates.length > SENTENCE_LIMITS.candidateEntries ||
        candidates.size !== input.candidates.length ||
        new Set(ids).size !== ids.length ||
        !ids.includes(input.priorityEntryId) ||
        ids.some((id) => !candidates.has(id)) ||
        draft.segments.map((segment) => segment.text).join('') !==
            draft.sourceText
    )
        throw new SentenceInvalidModelOutputError();
    const hintByEntry = new Map<string, string>();
    const hints = draft.targets.map((target, index) => {
        // Morphology and phrase preservation are semantic provider responsibilities.
        // Surface equality would incorrectly reject irregular inflections and scripts without spaces.
        if (
            normalizeSentenceHint(target.normalizedHint).toLowerCase() ===
            normalizeSentenceHint(draft.referenceTranslation).toLowerCase()
        )
            throw new SentenceInvalidModelOutputError(
                'Hint reveals the full reference translation',
            );
        const id = `hint-${index + 1}`;
        hintByEntry.set(target.entryId, id);
        return { id, text: normalizeSentenceHint(target.normalizedHint) };
    });
    const boundaries = sentenceGraphemeBoundaries(draft.sourceText);
    const seen = new Set<string>();
    let position = 0;
    let occurrence = 0;
    const segments = draft.segments.map((segment, index) => {
        const start = position;
        position += segment.text.length;
        if (
            !boundaries.has(start) ||
            !boundaries.has(position) ||
            (segment.entryId !== null &&
                (!hintByEntry.has(segment.entryId) ||
                    !/[\p{L}\p{N}]/u.test(segment.text)))
        )
            throw new SentenceInvalidModelOutputError('Invalid source segment');
        const target =
            segment.entryId === null
                ? null
                : {
                      entryId: segment.entryId,
                      occurrenceId: `occurrence-${++occurrence}`,
                      hintId: hintByEntry.get(segment.entryId)!,
                  };
        if (segment.entryId !== null) seen.add(segment.entryId);
        return {
            id: `segment-${index + 1}`,
            start,
            end: position,
            text: segment.text,
            target,
        };
    });
    if (seen.size !== ids.length)
        throw new SentenceInvalidModelOutputError('Missing target occurrence');
    return {
        sourceText: draft.sourceText,
        referenceTranslation: draft.referenceTranslation,
        segments,
        hints,
        targets: ids.map((id) => candidates.get(id)!),
    };
}
