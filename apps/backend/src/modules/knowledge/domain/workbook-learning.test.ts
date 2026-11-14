import { describe, expect, it } from 'vitest';
import type {
    ExerciseLearningBlock,
    LearningBlock,
    NamedExerciseSemantics,
} from '@languon/contracts';
import {
    evaluateWorkbookAnswer,
    exerciseSemanticRevision,
    noteUpdatedSinceCompletion,
} from './workbook-learning';
const id = '00000000-0000-4000-8000-000000000001';
const sourceId = '00000000-0000-4000-8000-000000000002';
const segmentId = '00000000-0000-4000-8000-000000000003';
const choiceId = '00000000-0000-4000-8000-000000000004';
const otherId = '00000000-0000-4000-8000-000000000005';
const exercise: ExerciseLearningBlock = {
    id,
    type: 'exercise',
    format: 'multiple-choice',
    question: 'Who sleeps?',
    referenceAnswer: 'A cat',
    explanation: 'A cat is mentioned.',
    choices: [
        { id: choiceId, text: 'A cat' },
        { id: otherId, text: 'A dog' },
    ],
    correctChoiceId: choiceId,
    source: { blockId: sourceId, segmentIds: [segmentId] },
};
const audio: LearningBlock = {
    id: sourceId,
    type: 'audio',
    assetId: otherId,
    transcript: {
        language: 'en',
        segments: [
            {
                id: segmentId,
                text: 'A cat sleeps.',
                timing: { startSeconds: 0, endSeconds: 2 },
            },
        ],
    },
};
const vocabulary: LearningBlock = {
    id: sourceId,
    type: 'vocabulary',
    language: 'fr',
    translationLanguage: 'en',
    entries: [
        {
            id: segmentId,
            term: 'café',
            translation: 'coffee',
            definition: 'A hot drink.',
        },
    ],
};
const namedSemantics: NamedExerciseSemantics = {
    activity: { id: 'V01', version: 1 },
    objective: 'Recall the word for the supplied sense.',
    language: 'fr',
    explanationLanguage: 'en',
    format: 'free-text',
    checking: {
        policy: 'hybrid',
        key: { kind: 'text', acceptedAnswers: ['café'] },
        rubric: {
            criteria: [
                {
                    dimension: 'task-completion',
                    requirement: 'Recall the word.',
                },
                { dimension: 'meaning', requirement: 'Preserve the sense.' },
                {
                    dimension: 'target-use',
                    requirement: 'Use the selected word.',
                },
            ],
        },
    },
    sources: [
        {
            kind: 'vocabulary',
            origin: { kind: 'block', blockId: sourceId },
            entries: [
                { entryId: segmentId, term: 'café', sense: 'A hot drink.' },
            ],
        },
    ],
};
const namedRecall: ExerciseLearningBlock = {
    id,
    type: 'exercise',
    format: 'free-text',
    question: 'Which French word means coffee?',
    referenceAnswer: 'café',
    explanation: 'The accent is part of the word.',
    acceptedAnswers: ['café'],
    semantics: namedSemantics,
};

describe('workbook semantic revisions', () => {
    it('ignores explanation/title and surrounding block order', () => {
        const revision = exerciseSemanticRevision(exercise, [audio]);
        expect(
            exerciseSemanticRevision(
                {
                    ...exercise,
                    title: 'Changed',
                    explanation: 'A clearer explanation.',
                    hint: 'An updated prepared hint.',
                    group: { id: otherId, title: 'New group' },
                },
                [audio],
            ),
        ).toBe(revision);

        expect(revision).toMatch(/^[a-f0-9]{64}$/u);
    });

    it('changes for question, answer, criteria or choices', () => {
        const revision = exerciseSemanticRevision(exercise, [audio]);
        for (const change of [
            { question: 'What sleeps?' },
            { referenceAnswer: 'The cat' },
            { evaluationCriteria: 'Use a noun' },
            { correctChoiceId: otherId },
            {
                choices: [
                    { id: choiceId, text: 'A kitten' },
                    { id: otherId, text: 'A dog' },
                ],
            },
        ]) {
            expect(
                exerciseSemanticRevision({ ...exercise, ...change }, [audio]),
            ).not.toBe(revision);
        }
    });

    it('resolves source wording, media identity and timing instead of only opaque ids', () => {
        const revision = exerciseSemanticRevision(exercise, [audio]);
        if (audio.type !== 'audio') {
            throw new Error('fixture');
        }

        expect(
            exerciseSemanticRevision(exercise, [
                {
                    ...audio,
                    transcript: {
                        language: 'en',
                        segments: [{ id: segmentId, text: 'A dog sleeps.' }],
                    },
                },
            ]),
        ).not.toBe(revision);

        expect(
            exerciseSemanticRevision(exercise, [{ ...audio, assetId: id }]),
        ).not.toBe(revision);

        expect(
            exerciseSemanticRevision(exercise, [
                {
                    ...audio,
                    transcript: {
                        language: 'en',
                        segments: [
                            {
                                id: segmentId,
                                text: 'A cat sleeps.',
                                timing: { startSeconds: 1, endSeconds: 3 },
                            },
                        ],
                    },
                },
            ]),
        ).not.toBe(revision);
    });

    it('versions an exercise again when its prepared transcript gains audio', () => {
        if (audio.type !== 'audio') {
            throw new Error('fixture');
        }

        const { assetId: _assetId, ...unprepared } = audio;
        const revision = exerciseSemanticRevision(exercise, [unprepared]);
        expect(exerciseSemanticRevision(exercise, [audio])).not.toBe(revision);
    });

    it('preserves legacy progress for a title edit and redundant explicit audio language', () => {
        if (audio.type !== 'audio') {
            throw new Error('fixture');
        }

        const revision = exerciseSemanticRevision(exercise, [audio]);
        for (const language of ['en', 'EN']) {
            expect(
                exerciseSemanticRevision(exercise, [
                    { ...audio, title: 'Listening', language },
                ]),
            ).toBe(revision);
        }

        expect(
            exerciseSemanticRevision(exercise, [{ ...audio, language: 'fr' }]),
        ).not.toBe(revision);
    });

    it('versions video-based exercises when the author-supplied source description changes', () => {
        if (audio.type !== 'audio' || !audio.transcript) {
            throw new Error('fixture');
        }

        const video: LearningBlock = {
            id: sourceId,
            type: 'video',
            source: { kind: 'youtube', videoId: 'abcdefghijk' },
            transcript: audio.transcript,
        };
        const revision = exerciseSemanticRevision(exercise, [video]);
        expect(
            exerciseSemanticRevision(exercise, [
                { ...video, description: 'A cat sleeps on the mat.' },
            ]),
        ).not.toBe(revision);

        expect(
            exerciseSemanticRevision(exercise, [
                { ...video, title: 'A clearer title' },
            ]),
        ).toBe(revision);
    });

    it('refuses missing source passages', () => {
        expect(() => exerciseSemanticRevision(exercise)).toThrow('source');
        expect(() =>
            exerciseSemanticRevision(
                {
                    ...exercise,
                    source: { blockId: sourceId, segmentIds: [id] },
                },
                [audio],
            ),
        ).toThrow('passage');
    });

    it('does not reset when source segment identities change without content changes', () => {
        if (audio.type !== 'audio' || !audio.transcript) {
            throw new Error('fixture');
        }

        const original = exerciseSemanticRevision(exercise, [audio]);
        const renamed: LearningBlock = {
            ...audio,
            id: choiceId,
            transcript: {
                ...audio.transcript,
                segments: audio.transcript.segments.map((segment) => ({
                    ...segment,
                    id: otherId,
                })),
            },
        };
        const changed: ExerciseLearningBlock = {
            ...exercise,
            source: { blockId: choiceId, segmentIds: [otherId] },
        };

        expect(exerciseSemanticRevision(changed, [renamed])).toBe(original);
    });
});

describe('named activity semantic revisions', () => {
    it('versions objective, rubric, frozen meaning and live source edits', () => {
        const revision = exerciseSemanticRevision(namedRecall, [vocabulary]);
        const semanticChanges = [
            {
                ...namedSemantics,
                objective: 'Use the word in its plural form.',
            },
            {
                ...namedSemantics,
                checking: {
                    ...namedSemantics.checking,
                    rubric: {
                        criteria: [
                            {
                                dimension: 'task-completion' as const,
                                requirement: 'Recall exactly one word.',
                            },
                            {
                                dimension: 'meaning' as const,
                                requirement: 'Preserve the sense.',
                            },
                            {
                                dimension: 'target-use' as const,
                                requirement: 'Use the selected word.',
                            },
                        ],
                    },
                },
            },
            {
                ...namedSemantics,
                sources: [
                    {
                        kind: 'vocabulary' as const,
                        origin: { kind: 'block' as const, blockId: sourceId },
                        entries: [
                            {
                                entryId: segmentId,
                                term: 'café',
                                sense: 'A place serving drinks.',
                            },
                        ],
                    },
                ],
            },
        ];

        for (const semantics of semanticChanges) {
            expect(
                exerciseSemanticRevision({ ...namedRecall, semantics }, [
                    vocabulary,
                ]),
            ).not.toBe(revision);
        }

        if (vocabulary.type !== 'vocabulary') {
            throw new Error('fixture');
        }

        expect(
            exerciseSemanticRevision(namedRecall, [
                {
                    ...vocabulary,
                    entries: [
                        { ...vocabulary.entries[0]!, translation: 'cafe' },
                    ],
                },
            ]),
        ).not.toBe(revision);

        expect(() => exerciseSemanticRevision(namedRecall, [])).toThrow(
            'source',
        );
    });

    it('ignores copied source identities and presentation explanations', () => {
        const revision = exerciseSemanticRevision(namedRecall, [vocabulary]);
        expect(
            exerciseSemanticRevision(
                {
                    ...namedRecall,
                    semantics: { ...namedSemantics, explanationLanguage: 'ru' },
                },
                [vocabulary],
            ),
        ).toBe(revision);

        if (vocabulary.type !== 'vocabulary') {
            throw new Error('fixture');
        }

        const copied = {
            ...namedRecall,
            id: otherId,
            semantics: {
                ...namedSemantics,
                sources: [
                    {
                        kind: 'vocabulary' as const,
                        origin: { kind: 'block' as const, blockId: choiceId },
                        entries: [
                            {
                                entryId: otherId,
                                term: 'café',
                                sense: 'A hot drink.',
                            },
                        ],
                    },
                ],
            },
        };

        expect(
            exerciseSemanticRevision(copied, [
                {
                    ...vocabulary,
                    id: choiceId,
                    entries: [{ ...vocabulary.entries[0]!, id: otherId }],
                },
            ]),
        ).toBe(revision);

        expect(
            exerciseSemanticRevision(
                {
                    ...namedRecall,
                    explanation: 'Clearer explanation.',
                    title: 'New title',
                },
                [vocabulary],
            ),
        ).toBe(revision);
    });
});

describe('named activity prepared checking', () => {
    it('returns the selected choice explanation and does not version cosmetic key explanation edits', () => {
        const { source: _source, ...choice } = exercise;
        const key = {
            kind: 'choice' as const,
            correctChoiceId: choiceId,
            explanations: [
                {
                    choiceId,
                    explanation: 'The text explicitly says a cat sleeps.',
                },
                {
                    choiceId: otherId,
                    explanation: 'The text does not mention a dog.',
                },
            ],
        };
        const named: ExerciseLearningBlock = {
            ...choice,
            semantics: {
                activity: { id: 'R01', version: 1 },
                format: 'multiple-choice',
                objective: 'Identify what the passage says.',
                language: 'en',
                explanationLanguage: 'en',
                checking: { policy: 'prepared-key', key },
                sources: [
                    {
                        kind: 'text-selection',
                        origin: { noteId: id, noteVersion: 1 },
                        text: 'A cat sleeps.',
                    },
                ],
            },
        };

        expect(
            evaluateWorkbookAnswer(named, {
                format: 'multiple-choice',
                choiceId: otherId,
            }),
        ).toEqual({
            status: 'incorrect',
            method: 'deterministic',
            feedback: 'The text does not mention a dog.',
        });

        const revised: ExerciseLearningBlock = {
            ...named,
            semantics: {
                ...named.semantics!,
                checking: {
                    policy: 'prepared-key',
                    key: {
                        ...key,
                        explanations: key.explanations.map((item) => ({
                            ...item,
                            explanation: 'A clearer prepared explanation.',
                        })),
                    },
                },
            },
        };

        expect(exerciseSemanticRevision(revised)).toBe(
            exerciseSemanticRevision(named),
        );
    });

    it('accepts only prepared hybrid alternatives and leaves other text unchecked without fuzzy matching', () => {
        expect(
            evaluateWorkbookAnswer(namedRecall, {
                format: 'free-text',
                text: ' cafe\u0301 ',
            }),
        ).toEqual({
            status: 'correct',
            method: 'deterministic',
            feedback: namedRecall.explanation,
        });

        for (const text of ['coffee', 'cafe', 'Café', 'café!', '猫']) {
            expect(
                evaluateWorkbookAnswer(namedRecall, {
                    format: 'free-text',
                    text,
                }),
            ).toEqual({ status: 'unchecked' });
        }
    });

    it('leaves rubric-only responses unchecked even when they match the reference', () => {
        const free: ExerciseLearningBlock = {
            ...namedRecall,
            acceptedAnswers: [],
            semantics: {
                ...namedSemantics,
                activity: { id: 'V07', version: 1 },
                checking: {
                    policy: 'ai-rubric',
                    rubric:
                        'rubric' in namedSemantics.checking
                            ? namedSemantics.checking.rubric
                            : { criteria: [] },
                },
            },
        };

        expect(
            evaluateWorkbookAnswer(free, { format: 'free-text', text: 'café' }),
        ).toEqual({ status: 'unchecked' });
    });

    it('distinguishes constrained misses from open hybrid gaps and uses the prepared explanation', () => {
        const gaps: ExerciseLearningBlock = {
            id,
            type: 'exercise',
            format: 'fill-in-the-blank',
            question: 'Complete the target form.',
            referenceAnswer: 'café',
            explanation: 'The target is café.',
            parts: [{ kind: 'gap', id: choiceId, acceptedAnswers: ['café'] }],
            semantics: {
                ...namedSemantics,
                activity: { id: 'V06', version: 1 },
                format: 'fill-in-the-blank',
                checking: {
                    policy: 'prepared-key',
                    key: {
                        kind: 'gaps',
                        gaps: [
                            {
                                gapId: choiceId,
                                acceptedAnswers: ['café'],
                                explanation: 'Keep the accented ending.',
                            },
                        ],
                    },
                },
            },
        };

        expect(
            evaluateWorkbookAnswer(gaps, {
                format: 'fill-in-the-blank',
                gaps: [{ id: choiceId, answer: 'cafe' }],
            }),
        ).toEqual({
            status: 'incorrect',
            method: 'deterministic',
            feedback: 'Keep the accented ending.',
        });

        const hybrid: ExerciseLearningBlock = {
            ...gaps,
            semantics: {
                ...gaps.semantics!,
                activity: { id: 'V03', version: 1 },
                checking: {
                    policy: 'hybrid',
                    key: {
                        kind: 'gaps',
                        gaps: [
                            {
                                gapId: choiceId,
                                acceptedAnswers: ['café'],
                                explanation: 'Keep the meaning.',
                            },
                        ],
                    },
                    rubric:
                        'rubric' in namedSemantics.checking
                            ? namedSemantics.checking.rubric
                            : { criteria: [] },
                },
            },
        };

        expect(
            evaluateWorkbookAnswer(hybrid, {
                format: 'fill-in-the-blank',
                gaps: [{ id: choiceId, answer: 'espresso' }],
            }),
        ).toEqual({ status: 'unchecked' });
    });
});

describe('server-owned answer evaluation', () => {
    it('checks a known multiple-choice answer and rejects foreign choices', () => {
        expect(
            evaluateWorkbookAnswer(exercise, {
                format: 'multiple-choice',
                choiceId,
            }),
        ).toEqual({ status: 'correct', method: 'deterministic' });

        expect(
            evaluateWorkbookAnswer(exercise, {
                format: 'multiple-choice',
                choiceId: otherId,
            }),
        ).toEqual({ status: 'incorrect', method: 'deterministic' });

        expect(() =>
            evaluateWorkbookAnswer(exercise, {
                format: 'multiple-choice',
                choiceId: id,
            }),
        ).toThrow('choice');
    });

    it('normalizes Unicode/whitespace but preserves meaningful case and punctuation', () => {
        const gap: ExerciseLearningBlock = {
            id,
            type: 'exercise',
            format: 'fill-in-the-blank',
            question: 'Fill',
            referenceAnswer: 'café noir',
            explanation: 'An example',
            parts: [
                { kind: 'gap', id: choiceId, acceptedAnswers: ['café noir'] },
            ],
        };

        expect(
            evaluateWorkbookAnswer(gap, {
                format: 'fill-in-the-blank',
                gaps: [{ id: choiceId, answer: ' cafe\u0301   noir ' }],
            }).status,
        ).toBe('correct');

        expect(
            evaluateWorkbookAnswer(gap, {
                format: 'fill-in-the-blank',
                gaps: [{ id: choiceId, answer: 'Café noir' }],
            }).status,
        ).toBe('incorrect');

        expect(() =>
            evaluateWorkbookAnswer(gap, {
                format: 'fill-in-the-blank',
                gaps: [{ id: otherId, answer: 'café noir' }],
            }),
        ).toThrow('gap');
    });

    it('makes no correctness claim for free text even when matching a reference', () => {
        const free: ExerciseLearningBlock = {
            id,
            type: 'exercise',
            format: 'free-text',
            question: 'Explain',
            referenceAnswer: 'A cat',
            explanation: 'Example',
        };

        expect(
            evaluateWorkbookAnswer(free, {
                format: 'free-text',
                text: 'A cat',
            }),
        ).toEqual({ status: 'unchecked' });

        expect(() =>
            evaluateWorkbookAnswer(free, {
                format: 'multiple-choice',
                choiceId,
            }),
        ).toThrow('format');
    });

    it('retains completion while indicating a newer saved note', () => {
        expect(noteUpdatedSinceCompletion(2, 2)).toBe(false);
        expect(noteUpdatedSinceCompletion(2, 3)).toBe(true);
    });
});
