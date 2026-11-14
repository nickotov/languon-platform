import { describe, expect, it } from 'vitest';
import {
    LearningBlockSchema,
    type ExerciseLearningBlock,
    type NamedExerciseSemantics,
} from '@languon/contracts';
import { readBlockForm } from '../src/fsd/features/knowledge-notes/lib/learning-block-form';
import {
    copyLearningBlock,
    copyLearningBlocks,
} from '../src/fsd/features/knowledge-notes/lib/learning-block-copy';

const exerciseId = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const entryId = '33333333-3333-4333-8333-333333333333';
const answerId = '44444444-4444-4444-8444-444444444444';
const otherId = '55555555-5555-4555-8555-555555555555';
const vocabulary = LearningBlockSchema.parse({
    id: sourceId,
    type: 'vocabulary',
    language: 'en',
    translationLanguage: 'fr',
    entries: [
        {
            id: entryId,
            term: 'borrow',
            translation: 'emprunter',
            definition: 'Use temporarily.',
        },
    ],
});

function namedExercise(
    format: ExerciseLearningBlock['format'] = 'free-text',
): ExerciseLearningBlock {
    const semantics: NamedExerciseSemantics = {
        activity: { id: 'V01', version: 1 },
        objective: 'Recall the source word.',
        language: 'en',
        explanationLanguage: 'en',
        format,
        sources: [
            {
                kind: 'vocabulary',
                origin: { kind: 'block', blockId: sourceId },
                entries: [
                    { entryId, term: 'borrow', sense: 'Use temporarily.' },
                ],
            },
        ],
        checking: {
            policy: 'hybrid',
            key: { kind: 'text', acceptedAnswers: ['borrow'] },
            rubric: {
                criteria: [
                    {
                        dimension: 'task-completion',
                        requirement: 'Answer the clue.',
                    },
                    { dimension: 'meaning', requirement: 'Use temporarily.' },
                    { dimension: 'target-use', requirement: 'Recall borrow.' },
                ],
            },
        },
    };
    const base = {
        id: exerciseId,
        type: 'exercise',
        question: 'Use temporarily: ____',
        referenceAnswer: 'borrow',
        explanation: 'Temporary use.',
        semantics,
    };

    if (format === 'multiple-choice') {
        semantics.activity.id = 'V02';
        semantics.checking = {
            policy: 'prepared-key',
            key: {
                kind: 'choice',
                correctChoiceId: answerId,
                explanations: [
                    { choiceId: answerId, explanation: 'Temporary use.' },
                    { choiceId: otherId, explanation: 'Keep permanently.' },
                ],
            },
        };

        return LearningBlockSchema.parse({
            ...base,
            format,
            choices: [
                { id: answerId, text: 'borrow' },
                { id: otherId, text: 'keep' },
            ],
            correctChoiceId: answerId,
        }) as ExerciseLearningBlock;
    }

    if (format === 'fill-in-the-blank') {
        semantics.activity.id = 'V03';
        semantics.checking = {
            ...semantics.checking,
            key: {
                kind: 'gaps',
                gaps: [
                    {
                        gapId: answerId,
                        acceptedAnswers: ['borrow'],
                        explanation: 'Temporary use.',
                    },
                ],
            },
        };

        return LearningBlockSchema.parse({
            ...base,
            format,
            parts: [
                { kind: 'text', text: 'Can I ' },
                { kind: 'gap', id: answerId, acceptedAnswers: ['borrow'] },
                { kind: 'text', text: ' it?' },
            ],
        }) as ExerciseLearningBlock;
    }

    return LearningBlockSchema.parse({
        ...base,
        format,
        acceptedAnswers: ['borrow'],
    }) as ExerciseLearningBlock;
}

function formFor(block: ExerciseLearningBlock): FormData {
    const data = new FormData();
    for (const name of [
        'format',
        'question',
        'referenceAnswer',
        'explanation',
    ] as const) {
        data.set(name, block[name]);
    }

    if (block.format === 'free-text') {
        data.set('acceptedAnswers', block.acceptedAnswers?.join('\n') ?? '');
    } else if (block.format === 'multiple-choice') {
        block.choices.forEach((choice, index) =>
            data.set(`choices.${index}.text`, choice.text),
        );

        data.set(
            'correctChoice',
            String(
                block.choices.findIndex(
                    (choice) => choice.id === block.correctChoiceId,
                ) + 1,
            ),
        );
    } else {
        data.set(
            'gapText',
            block.parts
                .map((part) =>
                    part.kind === 'text'
                        ? part.text
                        : `[[${part.acceptedAnswers.join('|')}]]`,
                )
                .join(''),
        );
    }

    return data;
}

describe('named exercise manual authoring', () => {
    it.each(['multiple-choice', 'fill-in-the-blank', 'free-text'] as const)(
        'preserves %s semantics in an unchanged manual form',
        (format) => {
            const block = namedExercise(format);
            const result = readBlockForm(
                'exercise',
                formFor(block),
                { choices: 2 },
                block,
            );

            expect(result).toEqual(block);
        },
    );

    it('preserves named identity while changing presentation and prepared explanations', () => {
        const block = namedExercise();
        const data = formFor(block);
        data.set('title', 'Practice');
        data.set('explanation', 'Updated reason.');
        data.set('hint', 'Think of a library.');
        const result = readBlockForm('exercise', data, {}, block);
        expect(result).toMatchObject({
            title: 'Practice',
            explanation: 'Updated reason.',
            hint: 'Think of a library.',
            semantics: block.semantics,
        });
    });

    it.each([
        'question',
        'referenceAnswer',
        'acceptedAnswers',
        'evaluationCriteria',
    ])('requires explicit Custom conversion before changing %s', (field) => {
        const block = namedExercise();
        const data = formFor(block);
        data.set(field, 'Changed meaning.');
        expect(() => readBlockForm('exercise', data, {}, block)).toThrow(
            'Switch this exercise to Custom',
        );

        data.set('exerciseKind', 'custom');
        const custom = readBlockForm('exercise', data, {}, block);
        expect(custom).not.toHaveProperty('semantics');
        expect(custom).toHaveProperty(
            field,
            field === 'acceptedAnswers'
                ? ['Changed meaning.']
                : 'Changed meaning.',
        );
    });

    it('requires explicit Custom conversion for a changed choice key', () => {
        const block = namedExercise('multiple-choice');
        const data = formFor(block);
        data.set('correctChoice', '2');
        expect(() =>
            readBlockForm('exercise', data, { choices: 2 }, block),
        ).toThrow('Switch this exercise to Custom');

        data.set('exerciseKind', 'custom');
        expect(
            readBlockForm('exercise', data, { choices: 2 }, block),
        ).toMatchObject({ correctChoiceId: otherId });
    });
});

describe('independent named exercise clipboard copies', () => {
    it('retains frozen proposal origins and snapshot IDs even when copied material has the same UUIDs', () => {
        const block = namedExercise();
        const semantics = block.semantics!;
        const source = semantics.sources[0]!;
        if (source.kind === 'text-selection') {
            throw new Error('Unexpected vocabulary source fixture.');
        }

        const historical = {
            ...block,
            semantics: {
                ...semantics,
                sources: [
                    {
                        ...source,
                        origin: {
                            kind: 'proposal',
                            proposalId: sourceId,
                            blockId: sourceId,
                        },
                    },
                ],
            },
        };
        const [copiedVocabulary, copiedExercise] = copyLearningBlocks([
            vocabulary,
            historical,
        ]);

        expect(copiedVocabulary?.id).not.toBe(sourceId);
        expect(copiedExercise).toMatchObject({
            semantics: {
                activity: semantics.activity,
                sources: historical.semantics.sources,
            },
        });
    });

    it.each(['multiple-choice', 'fill-in-the-blank', 'free-text'] as const)(
        'remaps %s keys and copied provenance while retaining activity identity',
        (format) => {
            const block = namedExercise(format);
            const [copiedSource, copiedExercise] = copyLearningBlocks([
                vocabulary,
                block,
            ]);

            expect(copiedSource?.id).not.toBe(sourceId);
            expect(copiedExercise?.id).not.toBe(exerciseId);
            if (
                copiedSource?.type !== 'vocabulary' ||
                copiedExercise?.type !== 'exercise'
            ) {
                throw new Error('Unexpected copy fixture.');
            }

            expect(copiedExercise.semantics?.activity).toEqual(
                block.semantics?.activity,
            );

            expect(copiedExercise.semantics?.sources[0]).toMatchObject({
                kind: 'vocabulary',
                origin: { kind: 'block', blockId: copiedSource.id },
                entries: [
                    {
                        entryId: copiedSource.entries[0]?.id,
                        term: 'borrow',
                        sense: 'Use temporarily.',
                    },
                ],
            });

            expect(copiedSource.entries[0]?.id).not.toBe(entryId);
            expect(LearningBlockSchema.parse(copiedExercise)).toEqual(
                copiedExercise,
            );

            if (
                copiedExercise.format === 'multiple-choice' &&
                copiedExercise.semantics?.checking.policy === 'prepared-key' &&
                copiedExercise.semantics.checking.key.kind === 'choice'
            ) {
                expect(
                    copiedExercise.semantics.checking.key.correctChoiceId,
                ).toBe(copiedExercise.correctChoiceId);

                expect(
                    copiedExercise.semantics.checking.key.explanations.map(
                        (choice) => choice.choiceId,
                    ),
                ).toEqual(copiedExercise.choices.map((choice) => choice.id));
            }

            if (
                copiedExercise.format === 'fill-in-the-blank' &&
                copiedExercise.semantics?.checking.policy === 'hybrid' &&
                copiedExercise.semantics.checking.key.kind === 'gaps'
            ) {
                expect(
                    copiedExercise.semantics.checking.key.gaps[0]?.gapId,
                ).toBe(
                    copiedExercise.parts.find((part) => part.kind === 'gap')
                        ?.id,
                );
            }
        },
    );

    it('refuses a dangling local source while allowing an authorized frozen proposal snapshot to copy independently', () => {
        const block = namedExercise();
        expect(() => copyLearningBlock(block)).toThrow(
            'together with its source material',
        );

        const semantics = block.semantics!;
        const source = semantics.sources[0]!;
        if (source.kind === 'text-selection') {
            throw new Error('Unexpected source fixture.');
        }

        const frozen = {
            ...block,
            semantics: {
                ...semantics,
                sources: [
                    {
                        ...source,
                        origin: {
                            kind: 'proposal',
                            proposalId: otherId,
                            blockId: sourceId,
                        },
                    },
                ],
            },
        };
        const copied = copyLearningBlock(frozen);
        expect(copied).toMatchObject({
            semantics: {
                activity: semantics.activity,
                sources: frozen.semantics.sources,
            },
        });
    });
});
