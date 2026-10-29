import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    ExerciseLearningBlock,
    WorkbookLearningState,
} from '@languon/contracts';
import { useWorkbookLearning } from '@/fsd/features/workbook-learning';
import { learningApi } from '@/fsd/features/workbook-learning/api/learning-api';
import { attemptAnswer } from '@/fsd/features/workbook-learning/lib/attempt-answer';
vi.mock('@/fsd/features/workbook-learning/api/learning-api', () => ({
    learningApi: {
        state: vi.fn(),
        attempt: vi.fn(),
        event: vi.fn(),
        completion: vi.fn(),
        evaluate: vi.fn(),
        evaluation: vi.fn(),
        cancelEvaluation: vi.fn(),
    },
}));
const noteId = '11111111-1111-4111-8111-111111111111';
const exerciseId = '22222222-2222-4222-8222-222222222222';
const choiceId = '33333333-3333-4333-8333-333333333333';
const revision = 'a'.repeat(64);
const block: ExerciseLearningBlock = {
    id: exerciseId,
    type: 'exercise',
    format: 'multiple-choice',
    question: 'Choose',
    choices: [
        { id: choiceId, text: 'one' },
        { id: noteId, text: 'two' },
    ],
    correctChoiceId: choiceId,
    referenceAnswer: 'one',
    explanation: 'Reason',
};
const state: WorkbookLearningState = {
    noteId,
    noteVersion: 3,
    attempts: [],
    events: [],
    completion: null,
    updatedSinceCompletion: false,
    exerciseRevisions: [{ exerciseId, revision }],
    truncated: false,
};
function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
}
const requestWithSession = <T,>(operation: (token: string) => Promise<T>) =>
    operation('token');
const options = {
    noteId,
    noteVersion: 3,
    actorId: 'actor',
    locale: 'en',
    requestWithSession,
};
beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(learningApi.state).mockResolvedValue(state);
    vi.mocked(learningApi.event).mockResolvedValue({} as never);
});
describe('private workbook learning', () => {
    it('waits for private state before enabling tracked hints and saves both exercise identities', async () => {
        let resolveInitial!: (value: WorkbookLearningState) => void;
        const nextState = {
            ...state,
            exerciseRevisions: [
                ...state.exerciseRevisions,
                { exerciseId: noteId, revision },
            ],
        };
        const initial = new Promise<WorkbookLearningState>((resolve) => {
            resolveInitial = resolve;
        });
        vi.mocked(learningApi.state)
            .mockResolvedValue(nextState)
            .mockImplementationOnce(() => initial);
        const { result } = renderHook(() => useWorkbookLearning(options), {
            wrapper,
        });
        expect(result.current.options(block).interactionsDisabled).toBe(true);
        expect(result.current.options(block).onInteraction).toBeUndefined();
        await act(async () => resolveInitial(nextState));
        await waitFor(() => expect(result.current.ready).toBe(true));
        expect(result.current.options(block).interactionsDisabled).toBe(false);
        act(() => {
            result.current
                .options(block)
                .onInteraction?.(exerciseId, { kind: 'hint-used' });
            result.current
                .options({ ...block, id: noteId })
                .onInteraction?.(noteId, { kind: 'hint-used' });
        });
        await waitFor(() => expect(learningApi.event).toHaveBeenCalledTimes(2));
        expect(
            vi
                .mocked(learningApi.event)
                .mock.calls.map((call) => call[2].blockId)
                .sort(),
        ).toEqual([exerciseId, noteId].sort());
        expect(learningApi.attempt).not.toHaveBeenCalled();
    });

    it('saves server-versioned attempts without client correctness and retries the exact identity', async () => {
        vi.mocked(learningApi.attempt)
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce({} as never);
        const { result } = renderHook(() => useWorkbookLearning(options), {
            wrapper,
        });
        await waitFor(() => expect(result.current.ready).toBe(true));
        act(() =>
            result.current
                .options(block)
                .onSubmitAttempt?.(exerciseId, choiceId),
        );
        await waitFor(() => expect(result.current.canRetry).toBe(true));
        const first = vi.mocked(learningApi.attempt).mock.calls[0]![2];
        expect(first).toMatchObject({
            noteVersion: 3,
            exerciseRevision: revision,
            answer: { format: 'multiple-choice', choiceId },
        });
        expect(first).not.toHaveProperty('correct');
        act(() => result.current.retry());
        await waitFor(() =>
            expect(learningApi.attempt).toHaveBeenCalledTimes(2),
        );
        expect(vi.mocked(learningApi.attempt).mock.calls[1]![2]).toEqual(first);
        await waitFor(() => expect(result.current.canRetry).toBe(false));
    });
    it('does not load or save private state for anonymous readers', async () => {
        const { result } = renderHook(
            () => useWorkbookLearning({ ...options, actorId: undefined }),
            { wrapper },
        );
        expect(result.current.options(block).onSubmitAttempt).toBeUndefined();
        expect(result.current.options(block).interactionsDisabled).toBe(false);
        act(() => result.current.complete());
        expect(learningApi.state).not.toHaveBeenCalled();
        expect(learningApi.completion).not.toHaveBeenCalled();
    });
    it('blocks saves when rendered content and server note versions differ', async () => {
        const { result } = renderHook(
            () => useWorkbookLearning({ ...options, noteVersion: 2 }),
            { wrapper },
        );
        await waitFor(() => expect(result.current.stale).toBe(true));
        expect(result.current.options(block).onSubmitAttempt).toBeUndefined();
        act(() => result.current.complete());
        expect(learningApi.completion).not.toHaveBeenCalled();
    });
    it('records reveal as an observation without creating a correct attempt', async () => {
        const { result } = renderHook(() => useWorkbookLearning(options), {
            wrapper,
        });
        await waitFor(() => expect(result.current.ready).toBe(true));
        act(() =>
            result.current
                .options(block)
                .onInteraction?.(exerciseId, { kind: 'answer-revealed' }),
        );
        await waitFor(() => expect(learningApi.event).toHaveBeenCalledTimes(1));
        expect(vi.mocked(learningApi.event).mock.calls[0]![2]).toMatchObject({
            kind: 'answer-revealed',
            exerciseRevision: revision,
        });
        expect(learningApi.attempt).not.toHaveBeenCalled();
    });
    it('saves and evaluates an exact private attempt, then exposes inline feedback without opening chat', async () => {
        const onAiRequest = vi.fn();
        const attempt = {
            id: noteId,
            noteId,
            noteVersion: 3,
            exerciseId,
            exerciseRevision: revision,
            answer: { format: 'multiple-choice' as const, choiceId },
            createdAt: new Date().toISOString(),
            evaluation: {
                status: 'correct' as const,
                method: 'ai' as const,
                feedback: 'Valid alternative.',
                validAlternative: true,
            },
        };
        vi.mocked(learningApi.attempt).mockResolvedValue({
            attempt: { ...attempt, evaluation: { status: 'unchecked' } },
        });
        vi.mocked(learningApi.evaluate).mockResolvedValue({
            job: {
                id: choiceId,
                noteId,
                attemptId: attempt.id,
                exerciseId,
                exerciseRevision: revision,
                status: 'completed',
                result: {
                    status: 'correct',
                    feedback: 'Valid alternative.',
                    validAlternative: true,
                },
                attempt,
                failureCode: null,
                createdAt: attempt.createdAt,
                completedAt: attempt.createdAt,
            },
        });
        vi.mocked(learningApi.state).mockResolvedValue({
            ...state,
            attempts: [attempt],
        });
        const { result } = renderHook(
            () => useWorkbookLearning({ ...options, onAiRequest }),
            { wrapper },
        );
        await waitFor(() => expect(result.current.ready).toBe(true));
        act(() =>
            result.current.options(block).onEvaluate?.(exerciseId, choiceId),
        );
        await waitFor(() =>
            expect(learningApi.evaluate).toHaveBeenCalledOnce(),
        );
        expect(learningApi.attempt).toHaveBeenCalledWith(
            'token',
            noteId,
            expect.objectContaining({
                exerciseId,
                exerciseRevision: revision,
                answer: { format: 'multiple-choice', choiceId },
            }),
            undefined,
        );
        expect(learningApi.evaluate).toHaveBeenCalledWith(
            'token',
            noteId,
            expect.objectContaining({ attemptId: noteId, replyLanguage: 'en' }),
            undefined,
            undefined,
        );
        await waitFor(() =>
            expect(result.current.options(block).evaluationPending).toBe(false),
        );
        expect(result.current.options(block).feedback).toContain(
            'Valid alternative.',
        );
        expect(result.current.options(block).learnerState).toMatchObject({
            answer: choiceId,
            correct: true,
            validAlternative: true,
        });
        expect(onAiRequest).not.toHaveBeenCalled();
        expect(learningApi.event).not.toHaveBeenCalled();
    });
    it('maps gap values to authored identities without accepting injected extra gaps', () => {
        const gapBlock = {
            ...block,
            format: 'fill-in-the-blank',
            parts: [{ kind: 'gap', id: choiceId, acceptedAnswers: ['a'] }],
        } as ExerciseLearningBlock;
        expect(
            attemptAnswer(gapBlock, { [choiceId]: 'a', unexpected: 'b' }),
        ).toEqual({
            format: 'fill-in-the-blank',
            gaps: [{ id: choiceId, answer: 'a' }],
        });
    });
});
