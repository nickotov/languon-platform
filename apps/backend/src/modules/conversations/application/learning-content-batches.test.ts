import { describe, expect, it } from 'vitest';
import type {
    LearningContentBrief,
    LearningContentTask,
} from './learning-content-contract';
import { planLearningContentBatches } from './learning-content-batches';
import {
    estimateLearningContentOutput,
    learningContentOutputEstimateLimit,
} from './learning-content-output-capacity';

const vocabulary = (
    overrides: Partial<LearningContentTask> = {},
): LearningContentTask => ({
    id: 'vocabulary',
    kind: 'vocabulary',
    instruction: 'Top shopping words.',
    language: 'en',
    translationLanguage: 'fr',
    count: 50,
    ...overrides,
});
const grammar = (id: string): LearningContentTask => ({
    id,
    kind: 'grammar',
    instruction: 'Explain shopping grammar.',
    language: 'en',
});

describe('learning content batch planning', () => {
    it('plans all 50 topic words in two bounded standalone calls', () => {
        const brief: LearningContentBrief = { tasks: [vocabulary()] };
        const before = structuredClone(brief);
        const plan = planLearningContentBatches(brief)!;

        expect(
            plan.batches.map((batch) => batch.brief.tasks[0]!.count),
        ).toEqual([31, 19]);

        expect(plan.batches.map((batch) => batch.vocabularyPart)).toEqual([
            { taskId: 'vocabulary', offset: 0, total: 50 },
            { taskId: 'vocabulary', offset: 31, total: 50 },
        ]);

        expect(plan.requiredOutputTokens).toBe(6_824);
        expect(brief).toEqual(before);
    });

    it('uses encoded word size while preserving exact supplied order', () => {
        const words = Array.from({ length: 50 }, (_, index) =>
            `${index}-你好-"\\`.padEnd(24, 'x'),
        );
        const plan = planLearningContentBatches({
            tasks: [vocabulary({ words })],
        })!;

        expect(plan.batches.length).toBeGreaterThan(1);
        expect(
            plan.batches.flatMap((batch) => batch.brief.tasks[0]!.words!),
        ).toEqual(words);

        for (let index = 0; index < plan.batches.length; index += 1) {
            const batch = plan.batches[index]!;
            expect(
                estimateLearningContentOutput(batch.brief),
            ).toBeLessThanOrEqual(learningContentOutputEstimateLimit);

            const nextWord =
                words[
                    batch.vocabularyPart!.offset +
                        batch.brief.tasks[0]!.words!.length
                ];

            if (nextWord) {
                expect(
                    estimateLearningContentOutput({
                        tasks: [
                            {
                                ...batch.brief.tasks[0]!,
                                words: [
                                    ...batch.brief.tasks[0]!.words!,
                                    nextWord,
                                ],
                            },
                        ],
                    }),
                ).toBeGreaterThan(learningContentOutputEstimateLimit);
            }
        }
    });

    it('packs ordinary tasks in order and isolates vocabulary fragments', () => {
        const tasks = [
            grammar('before'),
            vocabulary(),
            grammar('after'),
            grammar('last'),
        ];
        const plan = planLearningContentBatches({ tasks })!;

        expect(
            plan.batches.map((batch) =>
                batch.brief.tasks.map((task) => task.id),
            ),
        ).toEqual([
            ['before'],
            ['vocabulary'],
            ['vocabulary'],
            ['after', 'last'],
        ]);

        expect(plan.requiredOutputTokens).toBeLessThanOrEqual(10_000);
    });

    it('packs whole tasks that exceed one aggregate response without splitting them', () => {
        const plan = planLearningContentBatches({
            tasks: Array.from({ length: 8 }, (_, index) =>
                grammar(`rule-${index}`),
            ),
        })!;

        expect(plan.batches.map((batch) => batch.brief.tasks.length)).toEqual([
            5, 3,
        ]);

        expect(plan.batches.every((batch) => !batch.vocabularyPart)).toBe(true);
    });

    it('keeps both the total token budget and four-call limit bounded', () => {
        expect(
            planLearningContentBatches({ tasks: [vocabulary({ count: 80 })] }),
        ).toBeNull();

        expect(
            planLearningContentBatches({ tasks: [vocabulary({ count: 125 })] }),
        ).toBeNull();

        expect(
            planLearningContentBatches({
                tasks: [
                    grammar('first'),
                    vocabulary(),
                    grammar('middle'),
                    vocabulary({ id: 'other' }),
                ],
            }),
        ).toBeNull();

        expect(
            planLearningContentBatches({ tasks: [vocabulary({ count: 70 })] }),
        ).not.toBeNull();
    });

    it.each<LearningContentTask>([
        {
            id: 'text',
            kind: 'bilingual-text',
            instruction: 'Translate.',
            sourceText: 'x'.repeat(1_716),
        },
        {
            id: 'practice',
            kind: 'exercises',
            instruction: 'Practice.',
            count: 18,
        },
    ])('does not split unsupported oversized $kind tasks', (task) => {
        expect(planLearningContentBatches({ tasks: [task] })).toBeNull();
    });
});
