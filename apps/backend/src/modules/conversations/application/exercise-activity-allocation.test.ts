import { describe, expect, it } from 'vitest';
import {
    LearningContentBriefSchema,
    learningContentRequirements,
    type LearningContentTask,
} from './learning-content-contract';
import {
    exerciseActivitySequence,
    resolveExerciseActivityAllocations,
} from './exercise-activity-allocation';
import { planLearningContentBatches } from './learning-content-batches';
import { mergeLearningContentBatchResults } from './learning-content-batch-results';
import { LearningBlockSchema } from '@languon/contracts';

const exercise = (
    patch: Partial<LearningContentTask> = {},
): LearningContentTask => ({
    id: 'practice',
    kind: 'exercises',
    language: 'en',
    instruction: 'Practise the exact source.',
    ...patch,
});
const vocabulary: LearningContentTask = {
    id: 'words',
    kind: 'vocabulary',
    language: 'en',
    translationLanguage: 'fr',
    instruction: 'Generate words.',
    count: 2,
};

describe('named exercise activity allocations', () => {
    it('defaults to five source-appropriate vocabulary questions without rotating formats', () => {
        expect(
            resolveExerciseActivityAllocations(exercise(), ['vocabulary']),
        ).toEqual({
            status: 'ready',
            allocations: [
                { activityId: 'V02', count: 2 },
                { activityId: 'V03', count: 2 },
                { activityId: 'V01', count: 1 },
            ],
        });
    });

    it('uses grammar and reading defaults with two completion/detail questions', () => {
        expect(
            resolveExerciseActivityAllocations(exercise(), ['grammar']),
        ).toEqual({
            status: 'ready',
            allocations: [
                { activityId: 'G06', count: 1 },
                { activityId: 'G02', count: 2 },
                { activityId: 'G03', count: 1 },
                { activityId: 'G07', count: 1 },
            ],
        });

        expect(
            resolveExerciseActivityAllocations(exercise(), ['text']),
        ).toEqual({
            status: 'ready',
            allocations: [
                { activityId: 'R01', count: 1 },
                { activityId: 'R02', count: 2 },
                { activityId: 'R04', count: 1 },
                { activityId: 'R09', count: 1 },
            ],
        });
    });

    it('preserves explicit selection order and counts without adding other activities', () => {
        const task = exercise({
            count: 5,
            activities: [
                { activityId: 'V07', count: 2 },
                { activityId: 'V01', count: 3 },
            ],
        });
        const before = structuredClone(task);
        expect(
            resolveExerciseActivityAllocations(task, ['vocabulary']),
        ).toEqual({
            status: 'ready',
            allocations: task.activities,
        });

        expect(
            exerciseActivitySequence(task).map((item) => item.activityId),
        ).toEqual(['V07', 'V07', 'V01', 'V01', 'V01']);

        expect(task).toEqual(before);
    });

    it('uses a single selected activity for the complete requested count', () => {
        expect(
            resolveExerciseActivityAllocations(
                exercise({ count: 3, activities: [{ activityId: 'G03' }] }),
                ['grammar'],
            ),
        ).toEqual({
            status: 'ready',
            allocations: [{ activityId: 'G03', count: 3 }],
        });
    });

    it.each([
        exercise({
            activities: [{ activityId: 'V01' }, { activityId: 'V03' }],
        }),
        exercise({ count: 5, activities: [{ activityId: 'V01', count: 3 }] }),
        exercise({
            activities: [
                { activityId: 'V01', count: 1 },
                { activityId: 'V01', count: 1 },
            ],
        }),
        exercise({
            formats: ['multiple-choice'],
            activities: [{ activityId: 'V01', count: 1 }],
        }),
        exercise({ activities: [{ activityId: 'G03', count: 1 }] }),
    ])(
        'requires clarification for count, format or prerequisite conflicts: %j',
        (task) => {
            expect(
                resolveExerciseActivityAllocations(task, ['vocabulary']).status,
            ).toBe('needs-clarification');
        },
    );

    it('does not silently substitute an activity when the required source is absent', () => {
        expect(
            resolveExerciseActivityAllocations(
                exercise({ activities: [{ activityId: 'R01', count: 1 }] }),
                [],
            ),
        ).toEqual({ status: 'needs-clarification', fields: ['source'] });

        expect(
            resolveExerciseActivityAllocations(
                exercise({ formats: ['fill-in-the-blank'] }),
                ['text'],
            ),
        ).toEqual({
            status: 'ready',
            allocations: [{ activityId: 'R08', count: 5 }],
        });
    });
});

describe('task-output dependencies and bounded exercise batches', () => {
    it('allows only earlier material tasks and forces their validated completion before dependent generation', () => {
        const dependent = exercise({
            count: 2,
            activities: [{ activityId: 'V02', count: 2 }],
            source: { kind: 'task', taskId: 'words' },
        });
        const brief = LearningContentBriefSchema.parse({
            tasks: [vocabulary, dependent],
        });

        expect(learningContentRequirements(brief)).toBeNull();
        expect(
            planLearningContentBatches(brief)?.batches.map((batch) =>
                batch.brief.tasks.map((task) => task.id),
            ),
        ).toEqual([['words'], ['practice']]);
    });

    it.each([
        { tasks: [exercise({ source: { kind: 'task', taskId: 'missing' } })] },
        { tasks: [exercise({ source: { kind: 'task', taskId: 'practice' } })] },
        {
            tasks: [
                exercise({ source: { kind: 'task', taskId: 'words' } }),
                vocabulary,
            ],
        },
        {
            tasks: [
                exercise({ id: 'first', sourceText: 'Text.' }),
                exercise({ source: { kind: 'task', taskId: 'first' } }),
            ],
        },
    ])(
        'rejects unresolved, self, forward or exercise-output dependencies: %j',
        (brief) => {
            expect(learningContentRequirements(brief)).toMatchObject({
                status: 'needs-clarification',
                code: 'task-dependency',
            });

            expect(planLearningContentBatches(brief)).toBeNull();
        },
    );

    it('splits an eight-question allocation without changing activities, order or aggregate limits', () => {
        const task = exercise({
            count: 8,
            activities: [
                { activityId: 'V02', count: 4 },
                { activityId: 'V01', count: 4 },
            ],
        });
        const plan = planLearningContentBatches({ tasks: [task] })!;
        expect(plan.batches).toHaveLength(2);
        const sequence = plan.batches.flatMap((batch) =>
            exerciseActivitySequence(batch.brief.tasks[0]!),
        );

        expect(sequence).toEqual(exerciseActivitySequence(task));
        expect(plan.requiredOutputTokens).toBe(5_024);
        expect(plan.requiredOutputTokens).toBeLessThanOrEqual(10_000);
        expect(
            planLearningContentBatches({
                tasks: [
                    exercise({
                        count: 25,
                        activities: [{ activityId: 'V02', count: 25 }],
                    }),
                ],
            }),
        ).toBeNull();
    });

    it('merges validated exercise fragments and exposes only the exact completed prefix allocations', () => {
        const task = exercise({
            count: 3,
            activities: [
                { activityId: 'V02', count: 2 },
                { activityId: 'V01', count: 1 },
            ],
        });
        const block = (index: number) =>
            LearningBlockSchema.parse({
                id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
                type: 'exercise',
                format: 'free-text',
                question: `Question ${index}`,
                referenceAnswer: 'Answer.',
                explanation: 'Explanation.',
            });
        const first = mergeLearningContentBatchResults(
            { tasks: [task] },
            [],
            [{ taskId: 'practice', blocks: [block(1), block(2)] }],
        );

        expect(first.prefixBrief.tasks[0]?.activities).toEqual([
            { activityId: 'V02', count: 2 },
        ]);

        const complete = mergeLearningContentBatchResults(
            { tasks: [task] },
            first.results,
            [{ taskId: 'practice', blocks: [block(3)] }],
        );

        expect(complete.prefixBrief.tasks[0]?.activities).toEqual(
            task.activities,
        );

        expect(complete.results[0]?.blocks.map((item) => item.id)).toEqual([
            block(1).id,
            block(2).id,
            block(3).id,
        ]);

        expect(() =>
            mergeLearningContentBatchResults(
                { tasks: [task] },
                complete.results,
                [{ taskId: 'practice', blocks: [block(4)] }],
            ),
        ).toThrow('exceed');
    });
});
