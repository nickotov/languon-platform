import { randomUUID } from 'node:crypto';
import { GenerationPlanSchema } from '@languon/contracts';
import { describe, expect, it } from 'vitest';
import { generationPlanCapacity } from './learning-content-plan-capacity';

const prosePlan = (targetWords: number) =>
    GenerationPlanSchema.parse({
        schemaVersion: 1,
        replyLanguage: 'en',
        sources: [],
        tasks: [
            {
                id: 'reading',
                kind: 'prose',
                instruction: 'Write a French reading.',
                language: 'fr',
                targetWords,
                inputs: [],
            },
        ],
        outputOrder: ['reading'],
    });

describe('generation admission capacity', () => {
    it('admits the next individual grammar exercise rather than requiring the full four-exercise batch', () => {
        const plan = GenerationPlanSchema.parse({
            schemaVersion: 1,
            replyLanguage: 'en',
            sources: [
                {
                    id: 'rule',
                    kind: 'grammar',
                    reference: { kind: 'block', blockId: randomUUID() },
                },
            ],
            tasks: [
                {
                    id: 'grammar-exercises',
                    kind: 'exercises',
                    language: 'fr',
                    explanationLanguage: 'fr',
                    instruction: 'Check COD and COI.',
                    inputs: [{ kind: 'source', sourceId: 'rule' }],
                    activities: [
                        { activityId: 'G06', count: 1 },
                        { activityId: 'G02', count: 2 },
                        { activityId: 'G03', count: 1 },
                    ],
                },
            ],
            outputOrder: ['grammar-exercises'],
        });

        expect(generationPlanCapacity(plan)).toEqual({
            status: 'ready',
            minimumOutputTokens: 1312,
        });
    });

    it('rejects a structurally valid 1200-word prose plan that cannot fit one authoring unit', () => {
        expect(generationPlanCapacity(prosePlan(1200))).toEqual({
            status: 'unsupported',
            reason: 'single-unit-output-capacity',
        });
    });

    it('uses the same exact safety boundary as authoring rather than the larger raw provider cap', () => {
        expect(generationPlanCapacity(prosePlan(1111))).toEqual({
            status: 'ready',
            minimumOutputTokens: 4095,
        });

        expect(generationPlanCapacity(prosePlan(1112)).status).toBe(
            'unsupported',
        );
    });

    it('quotes the next required unit and needs no provider output when every task is already complete', () => {
        const plan = prosePlan(350);
        expect(generationPlanCapacity(plan)).toEqual({
            status: 'ready',
            minimumOutputTokens: 1812,
        });

        expect(generationPlanCapacity(plan, ['reading'])).toEqual({
            status: 'ready',
            minimumOutputTokens: 0,
        });
    });

    it('checks an exact captured bilingual source rather than a topic-only estimate', () => {
        const materialId = randomUUID();
        const plan = GenerationPlanSchema.parse({
            schemaVersion: 1,
            replyLanguage: 'en',
            sources: [
                {
                    id: 'passage',
                    kind: 'text',
                    reference: { kind: 'provided-text', materialId },
                },
            ],
            tasks: [
                {
                    id: 'translation',
                    kind: 'bilingual-text',
                    instruction: 'Translate the exact passage.',
                    language: 'fr',
                    translationLanguage: 'en',
                    inputs: [{ kind: 'source', sourceId: 'passage' }],
                },
            ],
            outputOrder: ['translation'],
        });

        expect(
            generationPlanCapacity(
                plan,
                [],
                [],
                [
                    {
                        sourceId: 'passage',
                        blocks: [],
                        providedText: { materialId, text: 'a'.repeat(4000) },
                    },
                ],
            ).status,
        ).toBe('unsupported');
    });

    it('allows splittable work to span several admitted actions', () => {
        const plan = GenerationPlanSchema.parse({
            schemaVersion: 1,
            replyLanguage: 'en',
            sources: [],
            tasks: [
                {
                    id: 'words',
                    kind: 'vocabulary',
                    instruction: 'Create travel vocabulary.',
                    language: 'fr',
                    translationLanguage: 'en',
                    count: 200,
                    inputs: [],
                },
            ],
            outputOrder: ['words'],
        });

        expect(generationPlanCapacity(plan)).toMatchObject({ status: 'ready' });
    });
});
