import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
    LearningBlockSchema,
    type ExerciseLearningBlock,
    type WorkbookLearnerAttempt,
} from '@languon/contracts';
import { LearningBlockView } from '@/fsd/entities/learning-blocks';
import { checkPreparedAnswer } from '@/fsd/entities/learning-blocks/lib/check-prepared-answer';
import { privateExerciseView } from '@/fsd/features/workbook-learning/lib/private-exercise-view';
import { learningLabels } from '@/fsd/features/workbook-learning/lib/labels';
import { defaultBlockLabels } from '@/fsd/features/knowledge-notes/ui/learning-block-authoring/block-labels';

const id = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const entryId = '33333333-3333-4333-8333-333333333333';

function recall(): ExerciseLearningBlock {
    return LearningBlockSchema.parse({
        id,
        type: 'exercise',
        format: 'free-text',
        question: 'What word means use temporarily?',
        referenceAnswer: 'borrow',
        explanation: 'Borrow means use temporarily.',
        acceptedAnswers: ['borrow'],
        semantics: {
            activity: { id: 'V01', version: 1 },
            objective: 'Recall the selected word.',
            language: 'en',
            explanationLanguage: 'en',
            format: 'free-text',
            checking: {
                policy: 'hybrid',
                key: { kind: 'text', acceptedAnswers: ['borrow'] },
                rubric: {
                    criteria: [
                        {
                            dimension: 'task-completion',
                            requirement: 'Supply a word.',
                        },
                        {
                            dimension: 'meaning',
                            requirement: 'Preserve the selected sense.',
                        },
                        {
                            dimension: 'target-use',
                            requirement: 'Recall the target word.',
                        },
                    ],
                },
            },
            sources: [
                {
                    kind: 'vocabulary',
                    origin: { kind: 'block', blockId: sourceId },
                    entries: [
                        { entryId, term: 'borrow', sense: 'Use temporarily.' },
                    ],
                },
            ],
        },
    }) as ExerciseLearningBlock;
}

describe('named exercise learner UI', () => {
    it('checks known anonymous hybrid variants without AI and leaves other answers unchecked', () => {
        const evaluate = vi.fn();
        render(
            <LearningBlockView
                block={recall()}
                labels={defaultBlockLabels}
                onEvaluate={evaluate}
            />,
        );

        expect(
            screen.getByRole('button', { name: /Recall the word/ }),
        ).toBeVisible();

        expect(
            screen.getByText('Instant check; AI review for other answers'),
        ).toBeVisible();

        const field = screen.getByRole('textbox');
        fireEvent.change(field, { target: { value: 'borrow' } });
        fireEvent.click(screen.getByRole('button', { name: 'Check' }));

        expect(screen.getAllByText('Correct').length).toBeGreaterThan(0);
        expect(evaluate).not.toHaveBeenCalled();

        fireEvent.change(field, { target: { value: 'take on loan' } });
        fireEvent.click(screen.getByRole('button', { name: 'Check' }));

        expect(
            screen.getByText(
                'This answer is not in the prepared key. You can check it with AI.',
            ),
        ).toBeVisible();

        expect(screen.queryByText('Incorrect')).not.toBeInTheDocument();
        expect(evaluate).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Check with AI' }));
        expect(evaluate).toHaveBeenCalledWith(id, 'take on loan');
    });

    it('preserves meaningful case and punctuation while applying NFC and whitespace only', () => {
        const block = recall();
        expect(checkPreparedAnswer(block, '  borrow\n')).toBe(true);
        expect(checkPreparedAnswer(block, 'Borrow')).toBeUndefined();
        expect(checkPreparedAnswer(block, 'borrow!')).toBeUndefined();
    });

    it('renders structured partial feedback without marking the attempt correct or incorrect', () => {
        const evaluation = {
            status: 'partially-correct' as const,
            method: 'ai' as const,
            feedback: 'Meaning is close, but use the requested word.',
            criteria: [
                {
                    dimension: 'task-completion' as const,
                    status: 'partially-met' as const,
                    feedback: 'Supply one word.',
                },
                {
                    dimension: 'meaning' as const,
                    status: 'met' as const,
                    feedback: 'The intended sense is present.',
                },
            ],
            corrections: ['Try the target word.'],
        };

        render(
            <LearningBlockView
                block={recall()}
                labels={defaultBlockLabels}
                evaluation={evaluation}
                feedback='Partially correct'
                feedbackKind='ai'
                learnerState={{
                    attempted: true,
                    revealed: false,
                    hintUsed: false,
                    answer: 'take',
                }}
            />,
        );

        expect(
            screen.getByRole('status', { name: 'Partially correct' }),
        ).toBeVisible();

        expect(screen.getByText('Task completion · Partly met')).toBeVisible();
        expect(screen.getByText('Try the target word.')).toBeVisible();
        expect(screen.queryByText('Incorrect')).not.toBeInTheDocument();
        expect(screen.queryByText('Correct')).not.toBeInTheDocument();
    });

    it('keeps unassessed and partial persisted outcomes out of the boolean correctness projection', () => {
        for (const status of [
            'partially-correct',
            'unable-to-assess',
        ] as const) {
            const attempt: WorkbookLearnerAttempt = {
                id: entryId,
                noteId: sourceId,
                noteVersion: 1,
                exerciseId: id,
                exerciseRevision: 'a'.repeat(64),
                answer: { format: 'free-text', text: 'A response.' },
                evaluation: { status, method: 'ai', feedback: 'Try again.' },
                createdAt: '2026-11-13T00:00:00Z',
            };
            const view = privateExerciseView({
                blockId: id,
                revision: 'a'.repeat(64),
                state: undefined,
                evaluated: attempt,
                labels: learningLabels('en'),
            });

            expect(view.learnerState?.correct).toBeUndefined();
            expect(view.evaluation?.status).toBe(status);
        }
    });
});
