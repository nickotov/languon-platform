import { describe, expect, it } from 'vitest';
import type {
    LearningContentBrief,
    LearningContentTask,
} from './learning-content-contract';
import {
    isLearningContentBatchCompleted,
    planLearningContentBatches,
} from './learning-content-batches';
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
    it('never skips an entire grouped batch merely because part of its prefix is complete', () => {
        const batch = {
            brief: {
                tasks: [
                    {
                        id: 'practice',
                        kind: 'exercises' as const,
                        instruction: 'Practice the rule.',
                        count: 3,
                    },
                ],
            },
            exercisePart: { taskId: 'practice', offset: 0, total: 4 },
        };

        expect(
            isLearningContentBatchCompleted(
                batch,
                'new-key',
                new Set(['old-key']),
                new Map([['practice', 2]]),
            ),
        ).toBe(false);

        expect(
            isLearningContentBatchCompleted(
                batch,
                'new-key',
                new Set(['old-key']),
                new Map([['practice', 3]]),
            ),
        ).toBe(true);
    });

    it('gives durable mixed grammar activities stable one-exercise units in requested order', () => {
        const tasks: LearningContentTask[] = [
            {
                id: 'grammar-exercises',
                kind: 'exercises',
                language: 'fr',
                explanationLanguage: 'fr',
                instruction: 'Check COD and COI.',
                source: { kind: 'editor' },
                count: 4,
                activities: [
                    { activityId: 'G06', count: 1 },
                    { activityId: 'G02', count: 2 },
                    { activityId: 'G03', count: 1 },
                ],
            },
        ];
        const plan = planLearningContentBatches(
            { tasks },
            { exerciseUnitSize: 1 },
        )!;

        expect(plan.batches.map((batch) => batch.exercisePart)).toEqual(
            [0, 1, 2, 3].map((offset) => ({
                taskId: 'grammar-exercises',
                offset,
                total: 4,
            })),
        );

        expect(
            plan.batches.map((batch) => batch.brief.tasks[0]!.activities),
        ).toEqual(
            ['G06', 'G02', 'G02', 'G03'].map((activityId) => [
                { activityId, count: 1 },
            ]),
        );

        expect(
            plan.batches.every((batch) => batch.brief.tasks[0]!.count === 1),
        ).toBe(true);
    });

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

        expect(
            plan.batches.every(
                (batch) =>
                    estimateLearningContentOutput(batch.brief) <=
                    learningContentOutputEstimateLimit,
            ),
        ).toBe(true);
    });

    it('packs whole tasks that exceed one aggregate response without splitting them', () => {
        const plan = planLearningContentBatches({
            tasks: Array.from({ length: 8 }, (_, index) =>
                grammar(`rule-${index}`),
            ),
        })!;

        expect(plan.batches.map((batch) => batch.brief.tasks.length)).toEqual([
            2, 2, 2, 2,
        ]);

        expect(plan.batches.every((batch) => !batch.vocabularyPart)).toBe(true);
    });

    it('permits a bounded run to span several admitted actions', () => {
        expect(
            planLearningContentBatches({ tasks: [vocabulary({ count: 80 })] }),
        ).not.toBeNull();

        expect(
            planLearningContentBatches({ tasks: [vocabulary({ count: 125 })] }),
        ).not.toBeNull();

        expect(
            planLearningContentBatches({
                tasks: [
                    grammar('first'),
                    vocabulary(),
                    grammar('middle'),
                    vocabulary({ id: 'other' }),
                ],
            }),
        ).not.toBeNull();

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
    ])('does not split unsupported oversized $kind tasks', (task) => {
        expect(planLearningContentBatches({ tasks: [task] })).toBeNull();
    });
});
