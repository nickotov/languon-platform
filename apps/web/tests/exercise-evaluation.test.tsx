import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExerciseEvaluation } from '@/fsd/features/workbook-learning/hooks/use-exercise-evaluation';
import { learningApi } from '@/fsd/features/workbook-learning/api/learning-api';
import type {
    KnowledgeExerciseEvaluationJob,
    SubmitWorkbookAttemptRequest,
    WorkbookLearnerAttempt,
} from '@languon/contracts';

vi.mock('@/fsd/features/workbook-learning/api/learning-api', () => ({
    learningApi: {
        attempt: vi.fn(),
        evaluate: vi.fn(),
        evaluation: vi.fn(),
        cancelEvaluation: vi.fn(),
    },
}));
const noteId = '11111111-1111-4111-8111-111111111111';
const exerciseId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const input: SubmitWorkbookAttemptRequest = {
    id: noteId,
    noteVersion: 1,
    exerciseId,
    exerciseRevision: 'a'.repeat(64),
    answer: { format: 'free-text', text: 'My own wording.' },
};
const attempt: WorkbookLearnerAttempt = {
    ...input,
    noteId,
    evaluation: { status: 'unchecked' },
    createdAt: new Date().toISOString(),
};
const pending: KnowledgeExerciseEvaluationJob = {
    id: jobId,
    noteId,
    attemptId: attempt.id,
    exerciseId,
    exerciseRevision: input.exerciseRevision,
    status: 'queued',
    result: null,
    attempt: null,
    failureCode: null,
    createdAt: attempt.createdAt,
    completedAt: null,
};
const requestWithSession = <T,>(operation: (token: string) => Promise<T>) =>
    operation('token');
beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(learningApi.attempt).mockResolvedValue({ attempt });
    vi.mocked(learningApi.cancelEvaluation).mockResolvedValue({
        job: {
            ...pending,
            status: 'cancelled',
            completedAt: attempt.createdAt,
        },
    });
});
describe('inline exercise AI lifecycle', () => {
    it('polls the server job identity, retains private result and never re-submits on poll', async () => {
        vi.mocked(learningApi.evaluate).mockResolvedValue({ job: pending });
        const complete = {
            ...attempt,
            evaluation: {
                status: 'correct' as const,
                method: 'ai' as const,
                feedback: 'This alternative is valid.',
                validAlternative: true,
            },
        };
        vi.mocked(learningApi.evaluation).mockResolvedValue({
            job: {
                ...pending,
                status: 'completed',
                attempt: complete,
                result: {
                    status: 'correct',
                    feedback: 'This alternative is valid.',
                    validAlternative: true,
                },
                completedAt: attempt.createdAt,
            },
        });
        const onCompleted = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() =>
            useExerciseEvaluation({
                noteId,
                locale: 'en',
                requestWithSession,
                access: undefined,
                onCompleted,
            }),
        );
        act(() => {
            void result.current.run(input);
        });
        await waitFor(
            () =>
                expect(
                    result.current.states[exerciseId]?.attempt?.evaluation
                        .status,
                ).toBe('correct'),
            { timeout: 2_000 },
        );
        expect(learningApi.evaluation).toHaveBeenCalledWith(
            'token',
            noteId,
            jobId,
            undefined,
            expect.any(AbortSignal),
        );
        expect(learningApi.evaluate).toHaveBeenCalledOnce();
        expect(onCompleted).toHaveBeenCalledOnce();
    });
    it('cancels a late accepted job after its view has closed', async () => {
        let resolve!: (value: { job: KnowledgeExerciseEvaluationJob }) => void;
        vi.mocked(learningApi.evaluate).mockReturnValue(
            new Promise((done) => {
                resolve = done;
            }),
        );
        const onCompleted = vi.fn().mockResolvedValue(undefined);
        const { result, unmount } = renderHook(() =>
            useExerciseEvaluation({
                noteId,
                locale: 'en',
                requestWithSession,
                access: undefined,
                onCompleted,
            }),
        );
        act(() => {
            void result.current.run(input);
        });
        await waitFor(() =>
            expect(learningApi.evaluate).toHaveBeenCalledOnce(),
        );
        unmount();
        await act(async () => {
            resolve({ job: pending });
        });
        expect(learningApi.cancelEvaluation).toHaveBeenCalledWith(
            'token',
            noteId,
            jobId,
            undefined,
        );
        expect(learningApi.evaluation).not.toHaveBeenCalled();
        expect(onCompleted).not.toHaveBeenCalled();
    });
    it('keeps failure separate from correctness and does not reveal a prepared answer', async () => {
        vi.mocked(learningApi.evaluate).mockRejectedValue(
            new Error('unavailable'),
        );
        const { result } = renderHook(() =>
            useExerciseEvaluation({
                noteId,
                locale: 'en',
                requestWithSession,
                access: undefined,
                onCompleted: vi.fn(),
            }),
        );
        act(() => {
            void result.current.run(input);
        });
        await waitFor(() =>
            expect(result.current.states[exerciseId]).toEqual({
                pending: false,
                failed: true,
            }),
        );
        expect(learningApi.attempt).toHaveBeenCalledOnce();
        expect(result.current.states[exerciseId]?.attempt).toBeUndefined();
    });
});
