import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { LearningBlockSchema } from '@languon/contracts';
import { namedExerciseFixture } from '../../../../../tests/support/named-exercise-fixture';
import { completeNamedExerciseSources } from './exercise-authoring-context';
import { createLearningBlockRevisionWire } from './learning-block-revision-wire';

const vocabulary = LearningBlockSchema.parse({
    id: randomUUID(),
    type: 'vocabulary',
    language: 'fr',
    translationLanguage: 'en',
    entries: [{ id: randomUUID(), term: 'travail', translation: 'work' }],
});

describe('selected revision wire contract', () => {
    it('keeps irrelevant activity and renderer schemas out of a vocabulary revision', () => {
        const wire = createLearningBlockRevisionWire([vocabulary]);
        const json = JSON.stringify(z.toJSONSchema(wire.schema));
        expect(json).not.toContain('semantics');
        expect(json).not.toContain('correctChoiceId');
        expect(json).not.toContain('V01');
        expect(
            wire.decode({
                proposals: [
                    { targetBlockId: vocabulary.id, blocks: [vocabulary] },
                ],
            }),
        ).toEqual([{ targetBlockId: vocabulary.id, blocks: [vocabulary] }]);
    });

    it('restores frozen named provenance and refuses model-authored origin fields', () => {
        const initial = namedExerciseFixture({
            activityId: 'V07',
            sources: [vocabulary],
        });
        const source = completeNamedExerciseSources(initial, {
            blocks: [vocabulary],
        });
        const { sourceBindings: _bindings, ...block } = initial;
        const wire = createLearningBlockRevisionWire([source]);
        const result = wire.decode({
            proposals: [{ targetBlockId: source.id, blocks: [block] }],
        });

        expect(result[0]?.blocks[0]).toEqual(source);
        expect(() =>
            wire.decode({
                proposals: [
                    {
                        targetBlockId: source.id,
                        blocks: [
                            {
                                ...block,
                                semantics: { ...block.semantics, sources: [] },
                            },
                        ],
                    },
                ],
            }),
        ).toThrow();

        const json = JSON.stringify(z.toJSONSchema(wire.schema));
        expect(json).toContain('V07');
        expect(json).not.toContain('V01');
        expect(json).not.toContain('sourceBindings');
        expect(json).not.toContain('noteVersion');
    });

    it('rejects wrong targets or renderer substitution before reconciliation', () => {
        const wire = createLearningBlockRevisionWire([vocabulary]);
        expect(() =>
            wire.decode({
                proposals: [
                    { targetBlockId: randomUUID(), blocks: [vocabulary] },
                ],
            }),
        ).toThrow();

        expect(() =>
            wire.decode({
                proposals: [
                    {
                        targetBlockId: vocabulary.id,
                        blocks: [
                            {
                                id: vocabulary.id,
                                type: 'grammar',
                                language: 'fr',
                                rule: 'Invented.',
                            },
                        ],
                    },
                ],
            }),
        ).toThrow();
    });

    it('keeps Custom revisions separate from named authoring', () => {
        const source = LearningBlockSchema.parse({
            id: randomUUID(),
            type: 'exercise',
            format: 'free-text',
            question: 'Explain.',
            referenceAnswer: 'Example.',
            explanation: 'Reason.',
        });
        const wire = createLearningBlockRevisionWire([source]);
        expect(
            wire.decode({
                proposals: [{ targetBlockId: source.id, blocks: [source] }],
            })[0]?.blocks[0],
        ).toEqual(source);

        expect(() =>
            wire.decode({
                proposals: [
                    {
                        targetBlockId: source.id,
                        blocks: [{ ...source, semantics: {} }],
                    },
                ],
            }),
        ).toThrow();
    });
});
