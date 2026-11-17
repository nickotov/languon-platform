import { describe, expect, it } from 'vitest';
import { GenerationPlanSchema, type GenerationPlan } from './generation-plans';

const plan: GenerationPlan = {
    schemaVersion: 1,
    replyLanguage: 'en',
    sources: [],
    tasks: [
        {
            id: 'reading',
            kind: 'bilingual-text',
            instruction: 'Read about democracy in France.',
            language: 'fr',
            translationLanguage: 'ru',
            inputs: [],
        },
        {
            id: 'reading-check',
            kind: 'exercises',
            instruction: 'Check reading comprehension.',
            language: 'fr',
            explanationLanguage: 'fr',
            inputs: [{ kind: 'task', taskId: 'reading' }],
            activities: [
                { activityId: 'R01', count: 1 },
                { activityId: 'R02', count: 1 },
                { activityId: 'R03', count: 1 },
            ],
        },
        {
            id: 'grammar',
            kind: 'grammar',
            instruction: 'Explain COD, COI and the passive voice.',
            language: 'fr',
            explanationLanguage: 'fr',
            inputs: [{ kind: 'task', taskId: 'reading' }],
        },
        {
            id: 'grammar-check',
            kind: 'exercises',
            instruction: 'Check the grammar.',
            language: 'fr',
            explanationLanguage: 'fr',
            inputs: [{ kind: 'task', taskId: 'grammar' }],
            activities: [
                { activityId: 'G01', count: 2 },
                { activityId: 'G02', count: 2 },
            ],
        },
    ],
    outputOrder: ['reading', 'reading-check', 'grammar', 'grammar-check'],
};

describe('reusable complete generation plans', () => {
    it('accepts the incident lesson without a transcript and keeps reply and content languages separate', () => {
        expect(GenerationPlanSchema.parse(plan)).toEqual(plan);
        const frenchOnly = structuredClone(plan);
        frenchOnly.tasks[0] = {
            id: 'reading',
            kind: 'prose',
            instruction: 'Write a French reading passage.',
            language: 'fr',
            inputs: [],
        };

        expect(GenerationPlanSchema.parse(frenchOnly).replyLanguage).toBe('en');
    });

    it('allows multiple captured prerequisites and independent presentation order', () => {
        const candidate = structuredClone(plan);
        candidate.sources = [
            {
                id: 'existing-reading',
                kind: 'text',
                reference: { kind: 'selection' },
            },
        ];

        candidate.tasks[1]!.inputs.push({
            kind: 'source',
            sourceId: 'existing-reading',
        });

        candidate.tasks[3]!.inputs.push({ kind: 'task', taskId: 'reading' });

        candidate.outputOrder.reverse();

        expect(GenerationPlanSchema.parse(candidate).outputOrder).toEqual(
            candidate.outputOrder,
        );
    });

    it('rejects missing dependencies, cyclic graphs and incompatible activity prerequisites', () => {
        for (const dependency of [
            'missing',
            'reading-check',
            'grammar-check',
            'grammar',
        ]) {
            const candidate = structuredClone(plan);
            candidate.tasks[1]!.inputs = [{ kind: 'task', taskId: dependency }];

            expect(GenerationPlanSchema.safeParse(candidate).success).toBe(
                false,
            );
        }

        const cycle = structuredClone(plan);
        cycle.tasks[0]!.inputs = [{ kind: 'task', taskId: 'grammar' }];
        expect(GenerationPlanSchema.safeParse(cycle).success).toBe(false);
    });

    it('rejects duplicate identities, incomplete output order and unresolved language or counts', () => {
        const candidates = [
            { ...plan, tasks: [...plan.tasks, plan.tasks[0]] },
            {
                ...plan,
                outputOrder: ['reading', 'reading', 'grammar', 'grammar-check'],
            },
            { ...plan, outputOrder: plan.outputOrder.slice(1) },
            {
                ...plan,
                tasks: [
                    {
                        id: 'reading',
                        kind: 'prose',
                        instruction: 'Write.',
                        inputs: [],
                    },
                ],
                outputOrder: ['reading'],
            },
            {
                ...plan,
                tasks: plan.tasks.map((task) =>
                    task.kind === 'exercises'
                        ? { ...task, activities: [{ activityId: 'R01' }] }
                        : task,
                ),
            },
        ];

        for (const candidate of candidates) {
            expect(GenerationPlanSchema.safeParse(candidate).success).toBe(
                false,
            );
        }
    });

    it('bounds exact aggregate custom blocks and rejects hidden authority', () => {
        const candidate = structuredClone(plan);
        const exercises = candidate.tasks[1]!;
        if (exercises.kind !== 'exercises') {
            throw new Error('Fixture requires exercises.');
        }

        exercises.activities = [{ activityId: 'R01', count: 20 }];
        expect(GenerationPlanSchema.safeParse(candidate).success).toBe(false);
        expect(
            GenerationPlanSchema.safeParse({ ...plan, ownerId: 'someone-else' })
                .success,
        ).toBe(false);

        expect(
            GenerationPlanSchema.safeParse({
                ...plan,
                sources: [
                    {
                        id: 'selection',
                        kind: 'grammar',
                        reference: { kind: 'selection' },
                    },
                ],
            }).success,
        ).toBe(false);
    });
});
