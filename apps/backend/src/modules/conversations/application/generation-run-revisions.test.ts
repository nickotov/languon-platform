import { describe, expect, it } from 'vitest';
import { GenerationPlanSchema } from '@languon/contracts';
import {
    compareGenerationPlans,
    generationFingerprint,
    generationTaskFingerprints,
} from './generation-run-revisions';

const plan = GenerationPlanSchema.parse({
    schemaVersion: 1,
    replyLanguage: 'en',
    sources: [],
    tasks: [
        {
            id: 'reading',
            kind: 'prose',
            instruction: 'Explain democracy in French.',
            language: 'fr',
            inputs: [],
        },
        {
            id: 'reading-check',
            kind: 'exercises',
            instruction: 'Check understanding.',
            language: 'fr',
            explanationLanguage: 'fr',
            inputs: [{ kind: 'task', taskId: 'reading' }],
            activities: [{ activityId: 'R01', count: 3 }],
        },
        {
            id: 'grammar',
            kind: 'grammar',
            instruction: 'Explain COD and COI.',
            language: 'fr',
            explanationLanguage: 'fr',
            inputs: [],
        },
        {
            id: 'grammar-check',
            kind: 'exercises',
            instruction: 'Practice COD and COI.',
            language: 'fr',
            explanationLanguage: 'fr',
            inputs: [{ kind: 'task', taskId: 'grammar' }],
            activities: [{ activityId: 'G01', count: 4 }],
        },
    ],
    outputOrder: ['reading', 'reading-check', 'grammar', 'grammar-check'],
});

describe('generation plan revisions', () => {
    it('keeps hashes stable across PostgreSQL JSONB object ordering without losing array order', () => {
        expect(
            generationFingerprint({
                schemaVersion: 2,
                document: {
                    type: 'doc',
                    content: [{ text: 'French', type: 'text' }],
                },
            }),
        ).toBe(
            generationFingerprint({
                document: {
                    content: [{ type: 'text', text: 'French' }],
                    type: 'doc',
                },
                schemaVersion: 2,
            }),
        );

        expect(generationFingerprint(['reading', 'grammar'])).not.toBe(
            generationFingerprint(['grammar', 'reading']),
        );
    });

    it('retains every completed task when only output order changes', () => {
        const next = {
            ...plan,
            outputOrder: [
                'grammar',
                'grammar-check',
                'reading',
                'reading-check',
            ],
        };

        expect(compareGenerationPlans(plan, next)).toEqual({
            keptTaskIds: plan.tasks.map((task) => task.id),
            changedTaskIds: [],
            addedTaskIds: [],
            removedTaskIds: [],
        });
    });

    it('invalidates changed requirements and transitive dependents, preserving independent work', () => {
        const next = {
            ...plan,
            tasks: plan.tasks.map((task) =>
                task.id === 'grammar'
                    ? {
                          ...task,
                          instruction:
                              'Explain COD and COI including passive voice.',
                      }
                    : task,
            ),
        };

        expect(compareGenerationPlans(plan, next)).toEqual({
            keptTaskIds: ['reading', 'reading-check'],
            changedTaskIds: ['grammar', 'grammar-check'],
            addedTaskIds: [],
            removedTaskIds: [],
        });
    });

    it('binds source fingerprints to exact frozen evidence, independent of output order', () => {
        const first = generationTaskFingerprints(plan, 'reading', [], []);
        const reordered = generationTaskFingerprints(
            { ...plan, outputOrder: [...plan.outputOrder].reverse() },
            'reading',
            [],
            [],
        );

        expect(first).toEqual(reordered);
        const changed = generationTaskFingerprints(
            {
                ...plan,
                tasks: plan.tasks.map((task) =>
                    task.id === 'reading' ? { ...task, language: 'ru' } : task,
                ),
            },
            'reading',
            [],
            [],
        );

        expect(changed.requirementsHash).not.toBe(first.requirementsHash);
    });
});
