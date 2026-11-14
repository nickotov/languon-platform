import { describe, expect, it } from 'vitest';
import { ExerciseLearningBlockSchema } from '@languon/contracts';
import { validateExercises } from './learning-content-task-validation';
import { validateLearningContent } from './learning-content-validation';
import type { LearningContentTask } from './learning-content-contract';

const task: LearningContentTask = {
    id: 'practice',
    kind: 'exercises',
    language: 'en',
    explanationLanguage: 'en',
    instruction: 'Ask about the selected reading.',
    count: 3,
    activities: [
        { activityId: 'R04', count: 2 },
        { activityId: 'R09', count: 1 },
    ],
};

function block(index: number, activityId: 'R04' | 'R09' = 'R04') {
    return ExerciseLearningBlockSchema.parse({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        type: 'exercise',
        format: 'free-text',
        question: `Reading task ${index}`,
        referenceAnswer: 'Mira borrowed a book.',
        explanation: 'The passage states what Mira borrowed.',
        semantics: {
            activity: { id: activityId, version: 1 },
            objective: 'Understand the stated event.',
            language: 'en',
            explanationLanguage: 'en',
            format: 'free-text',
            checking: {
                policy: 'ai-rubric',
                rubric: {
                    criteria: [
                        {
                            dimension: 'task-completion',
                            requirement: 'Respond to the task.',
                        },
                        {
                            dimension: 'meaning',
                            requirement: 'Retain the stated event.',
                        },
                        {
                            dimension: 'evidence',
                            requirement: 'Use the reading as evidence.',
                        },
                    ],
                },
            },
            sources: [
                {
                    kind: 'text-selection',
                    origin: {
                        noteId: '11111111-1111-4111-8111-111111111111',
                        noteVersion: 1,
                    },
                    text: 'Mira borrowed a book.',
                },
            ],
        },
    });
}

describe('exact named activity output validation', () => {
    it('accepts exact allocations while treating catalog IDs and repeated provenance as references', () => {
        const blocks = [block(1), block(2), block(3, 'R09')];
        expect(() => validateExercises(task, blocks)).not.toThrow();
        expect(
            validateLearningContent({ tasks: [task] }, [
                { taskId: task.id, blocks },
            ]).blocks,
        ).toEqual(blocks);
    });

    it('rejects the wrong activity even when its answer interaction matches', () => {
        expect(() =>
            validateExercises(task, [block(1), block(2, 'R09'), block(3)]),
        ).toThrow('exact named activity allocation');
    });

    it('rejects a partial output and duplicate questions', () => {
        expect(() => validateExercises(task, [block(1)])).toThrow(
            'Every requested exercise',
        );

        expect(() =>
            validateExercises(task, [
                block(1),
                { ...block(2), question: block(1).question },
                block(3, 'R09'),
            ]),
        ).toThrow('questions must not repeat');
    });

    it('does not silently accept Custom content as a requested named activity', () => {
        const { semantics: _semantics, ...custom } = block(1);
        expect(ExerciseLearningBlockSchema.safeParse(custom).success).toBe(
            true,
        );

        expect(() =>
            validateExercises(task, [custom, block(2), block(3, 'R09')]),
        ).toThrow('exact named activity allocation');
    });

    it('rejects target or explanation language drift', () => {
        const first = block(1);
        for (const languageFields of [
            { language: 'fr' },
            { explanationLanguage: 'fr' },
        ]) {
            const changed = ExerciseLearningBlockSchema.parse({
                ...first,
                semantics: { ...first.semantics, ...languageFields },
            });

            expect(() =>
                validateExercises(task, [changed, block(2), block(3, 'R09')]),
            ).toThrow('languages');
        }
    });

    it('refuses unresolved allocations before validating a provider result', () => {
        expect(() =>
            validateExercises({ ...task, activities: undefined }, [
                block(1),
                block(2),
                block(3, 'R09'),
            ]),
        ).toThrow('resolved activity allocations');
    });
});
