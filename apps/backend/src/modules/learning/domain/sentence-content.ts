import { z } from 'zod';
import { SENTENCE_LIMITS } from '@languon/contracts';
import { sentenceLanguageMatches } from './sentence-language';
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
                        contextualHint: z
                            .object({
                                normalizedHint: text(400),
                                hintForm: z.enum([
                                    'lemma',
                                    'infinitive',
                                    'phrase',
                                ]),
                            })
                            .strict()
                            .nullable()
                            .optional(),
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
    if (
        input.generationPolicyVersion === 2 &&
        draft.segments.some((segment) => segment.contextualHint === undefined)
    )
        throw new SentenceInvalidModelOutputError(
            'Missing contextual hint disposition',
        );
    if (
        input.generationPolicyVersion === 1 &&
        draft.segments.some((segment) => segment.contextualHint !== undefined)
    )
        throw new SentenceInvalidModelOutputError(
            'Unexpected contextual hint in legacy generation',
        );
    const comparableHint = (value: string) =>
        normalizeSentenceHint(value)
            .normalize('NFC')
            .toLocaleLowerCase(input.targetLanguage)
            .replace(/[\p{P}\p{Z}\s\u02bc]/gu, '');
    if (
        !sentenceLanguageMatches(
            draft.sourceText,
            input.sourceLanguage,
            input.targetLanguage,
        ) ||
        !sentenceLanguageMatches(
            draft.referenceTranslation,
            input.targetLanguage,
            input.sourceLanguage,
        )
    ) {
        throw new SentenceInvalidModelOutputError(
            'Sentence languages do not match the requested direction',
        );
    }
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
    const hints: SentenceGeneratedContent['hints'] = draft.targets.map(
        (target, index) => {
            // Morphology and phrase preservation are semantic provider responsibilities.
            // Surface equality would incorrectly reject irregular inflections and scripts without spaces.
            if (
                input.generationPolicyVersion === 2
                    ? comparableHint(target.normalizedHint).includes(
                          comparableHint(draft.referenceTranslation),
                      )
                    : normalizeSentenceHint(
                          target.normalizedHint,
                      ).toLowerCase() ===
                      normalizeSentenceHint(
                          draft.referenceTranslation,
                      ).toLowerCase()
            )
                throw new SentenceInvalidModelOutputError(
                    'Hint reveals the full reference translation',
                );
            const id = `hint-${index + 1}`;
            hintByEntry.set(target.entryId, id);
            return {
                id,
                text: normalizeSentenceHint(target.normalizedHint),
                ...(input.generationPolicyVersion === 2
                    ? { kind: 'dictionary' as const }
                    : {}),
            };
        },
    );
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
        const helper = segment.contextualHint;
        let contextualHintId: string | undefined;
        if (helper) {
            const hintText = normalizeSentenceHint(helper.normalizedHint);
            if (
                target ||
                !/\p{L}/u.test(segment.text) ||
                !/\p{L}/u.test(hintText) ||
                !sentenceLanguageMatches(
                    hintText,
                    input.targetLanguage,
                    input.sourceLanguage,
                ) ||
                comparableHint(hintText).includes(
                    comparableHint(draft.referenceTranslation),
                )
            )
                throw new SentenceInvalidModelOutputError(
                    'Invalid contextual hint',
                );
            const existing = hints.find(
                (hint) => hint.kind === 'contextual' && hint.text === hintText,
            );
            contextualHintId = existing?.id ?? `hint-${hints.length + 1}`;
            if (!existing) {
                if (
                    hints.filter((hint) => hint.kind === 'contextual').length >=
                    SENTENCE_LIMITS.contextualHints
                )
                    throw new SentenceInvalidModelOutputError(
                        'Too many contextual hints',
                    );
                hints.push({
                    id: contextualHintId,
                    text: hintText,
                    kind: 'contextual',
                });
            }
        }
        return {
            id: `segment-${index + 1}`,
            start,
            end: position,
            text: segment.text,
            target,
            ...(contextualHintId ? { contextualHintId } : {}),
        };
    });
    if (seen.size !== ids.length)
        throw new SentenceInvalidModelOutputError('Missing target occurrence');
    if (
        input.generationPolicyVersion === 2 &&
        !hints.some((hint) => hint.kind === 'contextual')
    )
        throw new SentenceInvalidModelOutputError(
            'Missing contextual vocabulary assistance',
        );
    if (input.generationPolicyVersion === 2) {
        const hintById = new Map(hints.map((hint) => [hint.id, hint.text]));
        const occurrenceHints = segments.flatMap((segment) => {
            const id = segment.target?.hintId ?? segment.contextualHintId;
            return id ? [hintById.get(id)!] : [];
        });
        if (
            comparableHint(occurrenceHints.join(' ')).includes(
                comparableHint(draft.referenceTranslation),
            )
        )
            throw new SentenceInvalidModelOutputError(
                'Combined hints reveal full reference translation',
            );
    }
    return {
        sourceText: draft.sourceText,
        referenceTranslation: draft.referenceTranslation,
        segments,
        hints,
        targets: ids.map((id) => candidates.get(id)!),
    };
}
