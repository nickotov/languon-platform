import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ExerciseLearningBlock, LearningBlock } from '@languon/contracts';
import { KnowledgeBodySchema, LearningBlockSchema } from '@languon/contracts';
import {
    reconcileLearningBlockRevision,
    reconcileLearningBlockRevisions,
} from './learning-block-revision';

const blockId = randomUUID();
const entryId = randomUUID();
const vocabulary: Extract<LearningBlock, { type: 'vocabulary' }> = {
    id: blockId,
    type: 'vocabulary',
    language: 'fr',
    translationLanguage: 'en',
    entries: [{ id: entryId, term: 'bonjour', translation: 'hello' }],
};

function namedExercise(
    format: 'multiple-choice' | 'fill-in-the-blank',
): ExerciseLearningBlock {
    const first = randomUUID();
    const second = randomUUID();
    const common = {
        id: randomUUID(),
        type: 'exercise',
        question: 'Practise bonjour.',
        referenceAnswer: 'bonjour',
        explanation: 'A greeting.',
    };
    const semantics = {
        activity: {
            id: format === 'multiple-choice' ? 'V02' : 'V03',
            version: 1,
        },
        objective: 'Practise the greeting.',
        language: 'fr',
        explanationLanguage: 'en',
        format,
        sources: [
            {
                kind: 'vocabulary',
                origin: { kind: 'block', blockId },
                entries: [{ entryId, term: 'bonjour', sense: 'hello' }],
            },
        ],
    };
    const block =
        format === 'multiple-choice'
            ? {
                  ...common,
                  format,
                  choices: [
                      { id: first, text: 'hello' },
                      { id: second, text: 'goodbye' },
                  ],
                  correctChoiceId: first,
                  semantics: {
                      ...semantics,
                      checking: {
                          policy: 'prepared-key',
                          key: {
                              kind: 'choice',
                              correctChoiceId: first,
                              explanations: [
                                  {
                                      choiceId: first,
                                      explanation: 'A greeting.',
                                  },
                                  {
                                      choiceId: second,
                                      explanation: 'A farewell.',
                                  },
                              ],
                          },
                      },
                  },
              }
            : {
                  ...common,
                  format,
                  parts: [
                      { kind: 'gap', id: first, acceptedAnswers: ['bonjour'] },
                  ],
                  semantics: {
                      ...semantics,
                      checking: {
                          policy: 'hybrid',
                          key: {
                              kind: 'gaps',
                              gaps: [
                                  {
                                      gapId: first,
                                      acceptedAnswers: ['bonjour'],
                                      explanation: 'A greeting.',
                                  },
                              ],
                          },
                          rubric: {
                              criteria: [
                                  {
                                      dimension: 'task-completion',
                                      requirement: 'Complete the greeting.',
                                  },
                                  {
                                      dimension: 'meaning',
                                      requirement: 'Keep the greeting sense.',
                                  },
                                  {
                                      dimension: 'target-use',
                                      requirement: 'Use bonjour.',
                                  },
                              ],
                          },
                      },
                  },
              };

    return LearningBlockSchema.parse(block) as ExerciseLearningBlock;
}

describe('canonical learning-block revision identities', () => {
    it('refuses AI revision that silently drops or replaces named activity identity', () => {
        const source = namedExercise('multiple-choice');
        const { semantics: _semantics, ...unnamed } = source;
        expect(() => reconcileLearningBlockRevision(source, unnamed)).toThrow(
            'Named activity identity must survive',
        );

        const changed = {
            ...source,
            semantics: {
                ...source.semantics!,
                activity: { id: 'G01' as const, version: 1 as const },
            },
        };

        expect(() => reconcileLearningBlockRevision(source, changed)).toThrow(
            'Named activity identity must survive',
        );
    });

    it('restores host-frozen provenance instead of accepting model-authored origin or source text', () => {
        const source = namedExercise('multiple-choice');
        const result = reconcileLearningBlockRevision(source, {
            ...source,
            semantics: {
                ...source.semantics!,
                sources: [
                    {
                        kind: 'vocabulary',
                        origin: { kind: 'block', blockId: randomUUID() },
                        entries: [
                            {
                                entryId: randomUUID(),
                                term: 'invented',
                                sense: 'not authorized',
                            },
                        ],
                    },
                ],
            },
        });

        expect(result.type === 'exercise' && result.semantics?.sources).toEqual(
            source.semantics?.sources,
        );
    });

    it('recovers named choice keys and explanations after incidental provider UUID churn', () => {
        const source = namedExercise('multiple-choice');
        if (
            source.format !== 'multiple-choice' ||
            source.semantics?.checking.policy !== 'prepared-key' ||
            source.semantics.checking.key.kind !== 'choice'
        ) {
            throw new Error('Unexpected named choice fixture.');
        }

        const replacements = source.choices.map(() => randomUUID());
        const candidate = {
            ...source,
            choices: source.choices.map((choice, index) => ({
                ...choice,
                id: replacements[index]!,
            })),
            correctChoiceId: replacements[0]!,
            semantics: {
                ...source.semantics,
                checking: {
                    ...source.semantics.checking,
                    key: {
                        ...source.semantics.checking.key,
                        correctChoiceId: replacements[0]!,
                        explanations:
                            source.semantics.checking.key.explanations.map(
                                (item, index) => ({
                                    ...item,
                                    choiceId: replacements[index]!,
                                }),
                            ),
                    },
                },
            },
        };
        const revised = reconcileLearningBlockRevision(source, candidate);
        expect(revised).toMatchObject({
            choices: source.choices,
            correctChoiceId: source.correctChoiceId,
            semantics: {
                activity: source.semantics.activity,
                checking: source.semantics.checking,
            },
        });
    });

    it('recovers named gap keys after incidental provider UUID churn', () => {
        const source = namedExercise('fill-in-the-blank');
        if (
            source.format !== 'fill-in-the-blank' ||
            source.semantics?.checking.policy !== 'hybrid' ||
            source.semantics.checking.key.kind !== 'gaps'
        ) {
            throw new Error('Unexpected named gap fixture.');
        }

        const invented = randomUUID();
        const candidate = {
            ...source,
            parts: source.parts.map((part) =>
                part.kind === 'gap' ? { ...part, id: invented } : part,
            ),
            semantics: {
                ...source.semantics,
                checking: {
                    ...source.semantics.checking,
                    key: {
                        kind: 'gaps' as const,
                        gaps: source.semantics.checking.key.gaps.map((gap) => ({
                            ...gap,
                            gapId: invented,
                        })),
                    },
                },
            },
        };
        const revised = reconcileLearningBlockRevision(source, candidate);
        expect(revised).toMatchObject({
            parts: source.parts,
            semantics: {
                activity: source.semantics.activity,
                checking: source.semantics.checking,
            },
        });
    });

    it('remaps frozen vocabulary entry references after all selected revision identities recover', () => {
        const exercise = namedExercise('multiple-choice');
        const invented = randomUUID();
        const originalSource = exercise.semantics!.sources[0]!;
        if (originalSource.kind !== 'vocabulary') {
            throw new Error('Unexpected vocabulary source fixture.');
        }

        const revised = reconcileLearningBlockRevisions(
            [exercise, vocabulary],
            [
                {
                    ...exercise,
                    semantics: {
                        ...exercise.semantics!,
                        sources: [
                            {
                                ...originalSource,
                                entries: [
                                    {
                                        ...originalSource.entries[0]!,
                                        entryId: invented,
                                    },
                                ],
                            },
                        ],
                    },
                },
                {
                    ...vocabulary,
                    entries: [{ ...vocabulary.entries[0]!, id: invented }],
                },
            ],
        );

        expect(revised[0]).toMatchObject({
            semantics: { sources: [{ entries: [{ entryId }] }] },
        });

        expect(revised[1]).toMatchObject({ entries: [{ id: entryId }] });
    });

    it('remaps frozen reading passage references after selected segment identities recover', () => {
        const base = namedExercise('fill-in-the-blank');
        const segmentId = randomUUID();
        const invented = randomUUID();
        const reading: LearningBlock = {
            id: blockId,
            type: 'bilingual-text',
            language: 'fr',
            segments: [{ id: segmentId, text: 'Bonjour.' }],
            translations: [],
        };

        if (base.semantics?.checking.policy !== 'hybrid') {
            throw new Error('Unexpected reading fixture.');
        }

        const exercise = LearningBlockSchema.parse({
            ...base,
            semantics: {
                ...base.semantics,
                activity: { id: 'R08', version: 1 },
                checking: {
                    ...base.semantics.checking,
                    rubric: {
                        criteria: [
                            {
                                dimension: 'task-completion',
                                requirement: 'Complete the summary.',
                            },
                            {
                                dimension: 'meaning',
                                requirement: 'Keep the greeting meaning.',
                            },
                            {
                                dimension: 'evidence',
                                requirement: 'Use the passage.',
                            },
                        ],
                    },
                },
                sources: [
                    {
                        kind: 'text',
                        origin: { kind: 'block', blockId },
                        passages: [{ segmentId, text: 'Bonjour.' }],
                    },
                ],
            },
        }) as ExerciseLearningBlock;
        const passage = exercise.semantics!.sources[0]!;
        if (passage.kind !== 'text') {
            throw new Error('Unexpected passage fixture.');
        }

        const revised = reconcileLearningBlockRevisions(
            [exercise, reading],
            [
                {
                    ...exercise,
                    semantics: {
                        ...exercise.semantics!,
                        sources: [
                            {
                                ...passage,
                                passages: [
                                    { segmentId: invented, text: 'Bonjour.' },
                                ],
                            },
                        ],
                    },
                },
                { ...reading, segments: [{ id: invented, text: 'Bonjour.' }] },
            ],
        );

        expect(revised[0]).toMatchObject({
            semantics: { sources: [{ passages: [{ segmentId }] }] },
        });

        expect(revised[1]).toMatchObject({ segments: [{ id: segmentId }] });
    });

    it('recovers unchanged vocabulary terms while preserving edited IDs and allocating host IDs for additions', () => {
        const addition = randomUUID();
        const result = reconcileLearningBlockRevision(vocabulary, {
            ...vocabulary,
            entries: [
                {
                    ...vocabulary.entries[0]!,
                    id: randomUUID(),
                    translation: 'good morning',
                },
                { id: addition, term: 'merci', translation: 'thank you' },
            ],
        });

        if (result.type !== 'vocabulary') {
            throw new Error('Expected vocabulary.');
        }

        expect(result.entries[0]?.id).toBe(entryId);
        expect(result.entries[0]?.translation).toBe('good morning');
        expect(result.entries[1]?.id).not.toBe(addition);
        expect(result.entries[1]?.id).not.toBe(entryId);
        const changed = reconcileLearningBlockRevision(vocabulary, {
            ...vocabulary,
            entries: [{ id: entryId, term: 'salut', translation: 'hi' }],
        });

        expect(changed).toMatchObject({
            entries: [{ id: entryId, term: 'salut' }],
        });
    });

    it('keeps bilingual segment and alignment identities despite provider churn', () => {
        const oldId = randomUUID();
        const invented = randomUUID();
        const source: LearningBlock = {
            id: blockId,
            type: 'bilingual-text',
            language: 'fr',
            segments: [{ id: oldId, text: 'Bonjour.' }],
            translations: [
                {
                    language: 'en',
                    segments: [{ sourceSegmentId: oldId, text: 'Hello.' }],
                },
            ],
        };
        const result = reconcileLearningBlockRevision(source, {
            ...source,
            segments: [{ id: invented, text: 'Bonjour.' }],
            translations: [
                {
                    language: 'en',
                    segments: [
                        { sourceSegmentId: invented, text: 'Good morning.' },
                    ],
                },
            ],
        });

        expect(result).toMatchObject({
            segments: [{ id: oldId }],
            translations: [
                {
                    segments: [
                        { sourceSegmentId: oldId, text: 'Good morning.' },
                    ],
                },
            ],
        });
    });

    it('keeps transcript segments and multiple-choice identities, group and correct answer aligned', () => {
        const segmentId = randomUUID();
        const audio: LearningBlock = {
            id: blockId,
            type: 'audio',
            transcript: {
                language: 'fr',
                segments: [{ id: segmentId, text: 'Bonjour.' }],
            },
        };

        expect(
            reconcileLearningBlockRevision(audio, {
                ...audio,
                transcript: {
                    ...audio.transcript!,
                    segments: [{ id: randomUUID(), text: 'Bonjour.' }],
                },
            }),
        ).toMatchObject({ transcript: { segments: [{ id: segmentId }] } });

        const first = randomUUID();
        const second = randomUUID();
        const groupId = randomUUID();
        const invented = randomUUID();
        const source: LearningBlock = {
            id: blockId,
            type: 'exercise',
            format: 'multiple-choice',
            question: 'Choose.',
            referenceAnswer: 'Hello',
            explanation: 'A greeting.',
            group: { id: groupId },
            choices: [
                { id: first, text: 'Hello' },
                { id: second, text: 'Goodbye' },
            ],
            correctChoiceId: first,
        };

        expect(
            reconcileLearningBlockRevision(source, {
                ...source,
                group: { id: randomUUID() },
                choices: [
                    { id: invented, text: 'Hello' },
                    { id: second, text: 'Bye' },
                ],
                correctChoiceId: invented,
            }),
        ).toMatchObject({
            group: { id: groupId },
            choices: [{ id: first }, { id: second, text: 'Bye' }],
            correctChoiceId: first,
        });
    });

    it('recovers unchanged gaps and preserves an edited gap with its existing ID', () => {
        const first = randomUUID();
        const second = randomUUID();
        const source: LearningBlock = {
            id: blockId,
            type: 'exercise',
            format: 'fill-in-the-blank',
            question: 'Complete.',
            referenceAnswer: 'am here',
            explanation: 'Be present.',
            parts: [
                { kind: 'gap', id: first, acceptedAnswers: ['am'] },
                { kind: 'gap', id: second, acceptedAnswers: ['here'] },
            ],
        };

        expect(
            reconcileLearningBlockRevision(source, {
                ...source,
                parts: [
                    { kind: 'gap', id: randomUUID(), acceptedAnswers: ['am'] },
                    { kind: 'gap', id: second, acceptedAnswers: ['there'] },
                ],
            }),
        ).toMatchObject({
            parts: [{ id: first }, { id: second, acceptedAnswers: ['there'] }],
        });
    });

    it('rejects ambiguous unchanged item identities and deleted correct-answer references', () => {
        const duplicate = {
            ...vocabulary,
            entries: [
                vocabulary.entries[0]!,
                { ...vocabulary.entries[0]!, id: randomUUID() },
            ],
        };

        expect(() =>
            reconcileLearningBlockRevision(duplicate, {
                ...vocabulary,
                entries: [{ ...vocabulary.entries[0]!, id: randomUUID() }],
            }),
        ).toThrow('existing identities');

        const first = randomUUID();
        const second = randomUUID();
        const source: LearningBlock = {
            id: blockId,
            type: 'exercise',
            format: 'multiple-choice',
            question: 'Choose.',
            referenceAnswer: 'Yes',
            explanation: 'Affirmative.',
            choices: [
                { id: first, text: 'Yes' },
                { id: second, text: 'No' },
            ],
            correctChoiceId: first,
        };

        expect(() =>
            reconcileLearningBlockRevision(source, {
                ...source,
                choices: [
                    { id: second, text: 'No' },
                    { id: randomUUID(), text: 'Maybe' },
                ],
            }),
        ).toThrow();
    });

    it('remaps cross-target segment references after every selected target is reconciled', () => {
        const segmentId = randomUUID();
        const invented = randomUUID();
        const source: LearningBlock = {
            id: blockId,
            type: 'bilingual-text',
            language: 'fr',
            segments: [{ id: segmentId, text: 'Bonjour.' }],
            translations: [],
        };
        const exercise: LearningBlock = {
            id: randomUUID(),
            type: 'exercise',
            format: 'free-text',
            question: 'Translate.',
            referenceAnswer: 'Hello',
            explanation: 'Greeting.',
            source: { blockId, segmentIds: [segmentId] },
        };
        const result = reconcileLearningBlockRevisions(
            [exercise, source],
            [
                { ...exercise, source: { blockId, segmentIds: [invented] } },
                { ...source, segments: [{ id: invented, text: 'Bonjour.' }] },
            ],
        );

        expect(result[0]).toMatchObject({
            source: { segmentIds: [segmentId] },
        });

        expect(result[1]).toMatchObject({ segments: [{ id: segmentId }] });
    });

    it('rejects removed segment references in the selected set and the complete document validator', () => {
        const kept = randomUUID();
        const removed = randomUUID();
        const source: LearningBlock = {
            id: blockId,
            type: 'bilingual-text',
            language: 'fr',
            segments: [
                { id: kept, text: 'Bonjour.' },
                { id: removed, text: 'Merci.' },
            ],
            translations: [],
        };
        const exercise: LearningBlock = {
            id: randomUUID(),
            type: 'exercise',
            format: 'free-text',
            question: 'Translate.',
            referenceAnswer: 'Thanks',
            explanation: 'Gratitude.',
            source: { blockId, segmentIds: [removed] },
        };
        const replacement: LearningBlock = {
            ...source,
            segments: [source.segments[0]!],
        };

        expect(() =>
            reconcileLearningBlockRevisions(
                [source, exercise],
                [replacement, exercise],
            ),
        ).toThrow('removed source segment');

        expect(
            KnowledgeBodySchema.safeParse({
                schemaVersion: 2,
                document: {
                    type: 'doc',
                    content: [replacement, exercise].map((block) => ({
                        type: 'learningBlock',
                        attrs: { block },
                    })),
                },
            }).success,
        ).toBe(false);
    });
});
