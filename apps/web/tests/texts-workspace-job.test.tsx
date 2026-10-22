import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TextAiJob } from '@languon/contracts';
import { textsApi } from '@/fsd/entities/texts';
import { useTextWorkspaceJob } from '@/fsd/pages/texts/hooks/use-text-workspace-job';
const id = '123e4567-e89b-42d3-a456-426614174000';
const job: TextAiJob = {
    id,
    kind: 'text-translation',
    state: 'queued',
    failureCode: null,
    result: null,
    createdAt: '2026-10-15T00:00:00.000Z',
    completedAt: null,
};
const body = {
    folderId: id,
    sourceText: 'Hello.',
    sourceLanguage: 'en' as const,
    targetLanguage: 'ru' as const,
    operationId: id,
};
const request = <T,>(operation: (token: string) => Promise<T>) =>
    operation('test-token');
function wrapper({ children }: PropsWithChildren) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
}
afterEach(() => vi.restoreAllMocks());
describe('workspace durable job fencing', () => {
    it('restores a completed proposal after reload and explicitly discards it on the server', async () => {
        const completed = {
            ...job,
            state: 'completed' as const,
            completedAt: job.createdAt,
        };
        const cancel = vi.spyOn(textsApi, 'cancelAiJob').mockResolvedValue({
            job: { ...job, state: 'cancelled', completedAt: job.createdAt },
        });
        const { result } = renderHook(() => useTextWorkspaceJob(request), {
            wrapper,
        });
        act(() => result.current.restore(completed));
        expect(result.current.job).toEqual(completed);
        await act(() => result.current.cancel());
        expect(cancel).toHaveBeenCalledWith('test-token', id);
        expect(result.current.job?.state).toBe('cancelled');
    });
    it('reuses enqueue operation identity after a transport failure and never saves a draft', async () => {
        const create = vi.spyOn(textsApi, 'createText');
        const enqueue = vi
            .spyOn(textsApi, 'translateText')
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce({ job });
        vi.spyOn(textsApi, 'getAiJob').mockResolvedValue({ job });
        const { result, unmount } = renderHook(
            () => useTextWorkspaceJob(request),
            { wrapper },
        );
        await act(() => result.current.start(body));
        await act(() =>
            result.current.start({
                ...body,
                operationId: '123e4567-e89b-42d3-a456-426614174001',
            }),
        );
        expect(enqueue.mock.calls[1]?.[1].operationId).toBe(id);
        expect(create).not.toHaveBeenCalled();
        unmount();
    });
    it('cancels a late enqueue response after close/cancel and does not resurrect its UI', async () => {
        let resolve!: (value: { job: TextAiJob }) => void;
        vi.spyOn(textsApi, 'translateText').mockReturnValue(
            new Promise((done) => {
                resolve = done;
            }),
        );
        const cancel = vi.spyOn(textsApi, 'cancelAiJob').mockResolvedValue({
            job: { ...job, state: 'cancelled', completedAt: job.createdAt },
        });
        const { result, unmount } = renderHook(
            () => useTextWorkspaceJob(request),
            { wrapper },
        );
        let start!: Promise<void>;
        act(() => {
            start = result.current.start(body);
        });
        await act(() => result.current.cancel());
        await act(async () => {
            resolve({ job });
            await start;
        });
        await waitFor(() =>
            expect(cancel).toHaveBeenCalledWith('test-token', id),
        );
        expect(result.current.job).toBeNull();
        unmount();
    });
});

it('keeps the exact text operation and source while awaiting explicit allowance consent', async () => {
    const { TextsApiError } = await import('@/fsd/entities/texts');
    const quote = {
        id: '00000000-0000-4000-8000-000000000001',
        maximumCredits: '0.125',
        approximateOutputTokens: 20,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };
    const enqueue = vi
        .spyOn(textsApi, 'translateText')
        .mockRejectedValueOnce(
            new TextsApiError(409, {
                code: 'action_confirmation_required',
                correlationId: 'synthetic-quote',
                message: 'Review allowance.',
                details: { quote },
            }),
        )
        .mockResolvedValueOnce({
            job: { ...job, state: 'completed', completedAt: job.createdAt },
        });
    const { result, unmount } = renderHook(() => useTextWorkspaceJob(request), {
        wrapper,
    });
    let pending!: Promise<void>;
    act(() => {
        pending = result.current.start(body);
    });
    await waitFor(() =>
        expect(result.current.actionConsent.quote?.id).toBe(quote.id),
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(result.current.job).toBeNull();
    act(() => result.current.actionConsent.confirm());
    await act(async () => pending);
    expect(enqueue.mock.calls[0]?.[1]).toEqual(body);
    expect(enqueue.mock.calls[1]?.[1]).toEqual({
        ...body,
        confirmedQuoteId: quote.id,
    });
    expect(result.current.job?.state).toBe('completed');
    unmount();
});
