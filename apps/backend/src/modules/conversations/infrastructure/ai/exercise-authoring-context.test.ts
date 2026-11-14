import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LearningBlockSchema } from '@languon/contracts';
import { namedExerciseFixture } from '../../../../../tests/support/named-exercise-fixture';
import {
    completeNamedExerciseSources,
    prepareNamedExerciseBrief,
} from './exercise-authoring-context';

const vocabulary = LearningBlockSchema.parse({
    id: randomUUID(),
    type: 'vocabulary',
    language: 'fr',
    translationLanguage: 'en',
    entries: [{ id: randomUUID(), term: 'travail', translation: 'work' }],
});

describe('named exercise authoring context', () => {
    it('accepts only host-frozen source identities and refuses forged wire fields', () => {
        const wire = namedExerciseFixture({
            activityId: 'V07',
            sources: [vocabulary],
        });
        const complete = completeNamedExerciseSources(wire, {
            blocks: [vocabulary],
        });

        expect(complete.type).toBe('exercise');
        if (complete.type === 'exercise') {
            expect(complete.semantics?.sources[0]).toMatchObject({
                kind: 'vocabulary',
                entries: [{ term: 'travail', sense: 'work' }],
            });
        }

        expect(() =>
            completeNamedExerciseSources(
                {
                    ...wire,
                    sourceBindings: [
                        {
                            kind: 'vocabulary',
                            blockId: randomUUID(),
                            entryIds: [randomUUID()],
                        },
                    ],
                },
                { blocks: [vocabulary] },
            ),
        ).toThrow('authorized content');

        expect(() =>
            completeNamedExerciseSources(
                {
                    ...wire,
                    sourceBindings: [
                        { kind: 'grammar', blockId: vocabulary.id },
                    ],
                },
                { blocks: [vocabulary] },
            ),
        ).toThrow('authorized content');

        expect(() =>
            completeNamedExerciseSources(
                { ...wire, semantics: { ...wire.semantics, sources: [] } },
                { blocks: [vocabulary] },
            ),
        ).toThrow();
    });

    it('preserves explicit allocation and derives defaults only from eligible host sources', () => {
        const result = prepareNamedExerciseBrief(
            {
                tasks: [
                    {
                        id: 'exercise',
                        kind: 'exercises',
                        instruction: 'Practise.',
                        language: 'fr',
                        count: 2,
                        activities: [{ activityId: 'V07', count: 2 }],
                        source: { kind: 'editor', blockId: vocabulary.id },
                    },
                ],
            },
            new Map(),
            [vocabulary],
        );

        expect(result).toMatchObject({
            status: 'ready',
            brief: {
                tasks: [{ activities: [{ activityId: 'V07', count: 2 }] }],
            },
        });

        const defaults = prepareNamedExerciseBrief(
            {
                tasks: [
                    {
                        id: 'exercise',
                        kind: 'exercises',
                        instruction: 'Practise.',
                        language: 'fr',
                        count: 2,
                        source: { kind: 'editor', blockId: vocabulary.id },
                    },
                ],
            },
            new Map(),
            [vocabulary],
        );

        expect(defaults).toMatchObject({
            status: 'ready',
            brief: {
                tasks: [
                    {
                        activities: [
                            { activityId: 'V02', count: 1 },
                            { activityId: 'V03', count: 1 },
                        ],
                    },
                ],
            },
        });
    });
});
