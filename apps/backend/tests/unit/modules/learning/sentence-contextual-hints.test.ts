import { describe, expect, it } from 'vitest';
import { validateSentenceGeneration } from '../../../../src/modules/learning/domain/sentence-content';
import type { SentenceGenerationInput } from '../../../../src/modules/learning/domain/sentence-types';

const entryId = '00000000-0000-4000-8000-000000000001';
const input: SentenceGenerationInput = {
    schemaVersion: 1,
    generationPolicyVersion: 2,
    dictionaryId: entryId,
    direction: 'source-to-target',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    priorityEntryId: entryId,
    candidates: [
        {
            entryId,
            learningVersion: 1,
            sourceText: 'stay',
            targetText: 'rester',
        },
    ],
};
const draft = {
    sourceText: 'We stay inside because it is raining cats and dogs.',
    referenceTranslation:
        'Nous restons à l’intérieur parce qu’il pleut des cordes.',
    segments: [
        { text: 'We ', entryId: null, contextualHint: null },
        { text: 'stay', entryId, contextualHint: null },
        { text: ' ', entryId: null, contextualHint: null },
        {
            text: 'inside',
            entryId: null,
            contextualHint: {
                normalizedHint: 'à l’intérieur',
                hintForm: 'phrase' as const,
            },
        },
        { text: ' because it is ', entryId: null, contextualHint: null },
        {
            text: 'raining cats and dogs',
            entryId: null,
            contextualHint: {
                normalizedHint: 'pleuvoir des cordes',
                hintForm: 'phrase' as const,
            },
        },
        { text: '.', entryId: null, contextualHint: null },
    ],
    targets: [
        { entryId, normalizedHint: 'rester', hintForm: 'infinitive' as const },
    ],
};
describe('contextual sentence hints', () => {
    it.each([1, 2])(
        'rejects a private reference split across hints with %i dictionary occurrences',
        (occurrences) => {
            const catInput = {
                ...input,
                candidates: [
                    {
                        ...input.candidates[0]!,
                        sourceText: 'cat',
                        targetText: 'chat',
                    },
                ],
            };
            expect(() =>
                validateSentenceGeneration(catInput, {
                    sourceText: `The ${Array.from({ length: occurrences }, () => 'cat').join(' ')} sleeps.`,
                    referenceTranslation: `Le ${Array.from({ length: occurrences }, () => 'chat').join(' ')} dort.`,
                    targets: [
                        { entryId, normalizedHint: 'chat', hintForm: 'lemma' },
                    ],
                    segments: [
                        {
                            text: 'The',
                            entryId: null,
                            contextualHint: {
                                normalizedHint: 'Le',
                                hintForm: 'lemma',
                            },
                        },
                        ...Array.from({ length: occurrences }, () => [
                            { text: ' ', entryId: null, contextualHint: null },
                            { text: 'cat', entryId, contextualHint: null },
                        ]).flat(),
                        { text: ' ', entryId: null, contextualHint: null },
                        {
                            text: 'sleeps',
                            entryId: null,
                            contextualHint: {
                                normalizedHint: 'dort',
                                hintForm: 'lemma',
                            },
                        },
                        { text: '.', entryId: null, contextualHint: null },
                    ],
                }),
            ).toThrow('Combined hints reveal full reference translation');
        },
    );
    it('rejects a helper in the source script instead of the required target script', () => {
        const russianInput = {
            ...input,
            sourceLanguage: 'ru' as const,
            candidates: [{ ...input.candidates[0]!, sourceText: 'оставаться' }],
        };
        const russianDraft = {
            ...draft,
            sourceText: 'Мы остаёмся внутри.',
            referenceTranslation: 'Nous restons à l’intérieur.',
            segments: [
                { text: 'Мы ', entryId: null, contextualHint: null },
                { text: 'остаёмся', entryId, contextualHint: null },
                { text: ' ', entryId: null, contextualHint: null },
                {
                    text: 'внутри',
                    entryId: null,
                    contextualHint: {
                        normalizedHint: 'à l’intérieur',
                        hintForm: 'phrase' as const,
                    },
                },
                { text: '.', entryId: null, contextualHint: null },
            ],
        };
        expect(
            validateSentenceGeneration(russianInput, russianDraft).hints[1]
                ?.text,
        ).toBe('à l’intérieur');
        expect(() =>
            validateSentenceGeneration(russianInput, {
                ...russianDraft,
                segments: russianDraft.segments.map((segment, index) =>
                    index === 3
                        ? {
                              ...segment,
                              contextualHint: {
                                  normalizedHint: 'внутри',
                                  hintForm: 'lemma' as const,
                              },
                          }
                        : segment,
                ),
            }),
        ).toThrow();
    });
    it('keeps a whole idiom hint independent of dictionary targets and coverage', () => {
        const content = validateSentenceGeneration(input, draft);
        expect(content.targets.map((entry) => entry.entryId)).toEqual([
            entryId,
        ]);
        expect(content.hints).toEqual([
            { id: 'hint-1', text: 'rester', kind: 'dictionary' },
            { id: 'hint-2', text: 'à l’intérieur', kind: 'contextual' },
            { id: 'hint-3', text: 'pleuvoir des cordes', kind: 'contextual' },
        ]);
        expect(content.segments[5]).toMatchObject({
            text: 'raining cats and dogs',
            target: null,
            contextualHintId: 'hint-3',
        });
        expect(content.segments[1]?.target?.entryId).toBe(entryId);
    });
    it('retains legacy generation without inventing extra hints', () => {
        const legacy = {
            ...draft,
            segments: draft.segments.map(
                ({ contextualHint: _hint, ...segment }) => segment,
            ),
        };
        expect(
            validateSentenceGeneration(
                { ...input, generationPolicyVersion: 1 },
                legacy,
            ).hints,
        ).toEqual([{ id: 'hint-1', text: 'rester' }]);
        expect(() => validateSentenceGeneration(input, legacy)).toThrow();
    });
    it('rejects helper hints that reveal the full answer or overlap a dictionary target', () => {
        for (const segments of [
            draft.segments.map((segment, index) =>
                index === 3
                    ? {
                          ...segment,
                          contextualHint: {
                              normalizedHint: draft.referenceTranslation,
                              hintForm: 'phrase' as const,
                          },
                      }
                    : segment,
            ),
            draft.segments.map((segment, index) =>
                index === 1
                    ? {
                          ...segment,
                          contextualHint: {
                              normalizedHint: 'rester',
                              hintForm: 'infinitive' as const,
                          },
                      }
                    : segment,
            ),
            draft.segments.map((segment, index) =>
                index === 3
                    ? {
                          ...segment,
                          contextualHint: {
                              normalizedHint:
                                  'Nous restons à l’intérieur parce qu’il pleut des cordes',
                              hintForm: 'phrase' as const,
                          },
                      }
                    : segment,
            ),
        ])
            expect(() =>
                validateSentenceGeneration(input, { ...draft, segments }),
            ).toThrow();
    });
    it('requires useful assistance, not only null dispositions', () => {
        expect(() =>
            validateSentenceGeneration(input, {
                ...draft,
                segments: draft.segments.map((segment) => ({
                    ...segment,
                    contextualHint: null,
                })),
            }),
        ).toThrow();
    });
    it('reuses a lexical hint across repeated occurrences without merging their spans', () => {
        const repeated = {
            ...draft,
            sourceText: 'We stay inside, inside.',
            segments: [
                ...draft.segments.slice(0, 4),
                { text: ', ', entryId: null, contextualHint: null },
                draft.segments[3]!,
                { text: '.', entryId: null, contextualHint: null },
            ],
        };
        const content = validateSentenceGeneration(input, repeated);
        expect(
            content.hints.filter((hint) => hint.kind === 'contextual'),
        ).toHaveLength(1);
        expect(content.segments[3]?.contextualHintId).toBe(
            content.segments[5]?.contextualHintId,
        );
        expect(content.segments[3]?.id).not.toBe(content.segments[5]?.id);
    });
    it('rejects more than forty helper hints and split grapheme boundaries', () => {
        const helpers = Array.from({ length: 41 }, (_, index) => ({
            text: ' word',
            entryId: null,
            contextualHint: {
                normalizedHint: `mot${index}`,
                hintForm: 'lemma' as const,
            },
        }));
        const segments = [draft.segments[1]!, ...helpers];
        expect(() =>
            validateSentenceGeneration(input, {
                ...draft,
                sourceText: segments.map((segment) => segment.text).join(''),
                segments,
            }),
        ).toThrow();
        expect(() =>
            validateSentenceGeneration(input, {
                ...draft,
                sourceText: 'stay e\u0301.',
                segments: [
                    draft.segments[1]!,
                    { text: ' ', entryId: null, contextualHint: null },
                    {
                        text: 'e',
                        entryId: null,
                        contextualHint: {
                            normalizedHint: 'mot',
                            hintForm: 'lemma',
                        },
                    },
                    { text: '\u0301.', entryId: null, contextualHint: null },
                ],
            }),
        ).toThrow();
    });
});
