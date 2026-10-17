import { useState, type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TextAiJob } from '@languon/contracts';
import { textsApi } from '@/fsd/entities/texts';
import { useTextWorkspaceJob } from '@/fsd/pages/texts/hooks/use-text-workspace-job';
import { useTextWorkspaceAuto } from '@/fsd/pages/texts/hooks/use-text-workspace-auto';
import { emptyWorkspaceInput } from '@/fsd/pages/texts/lib/workspace-content';
const id = '123e4567-e89b-42d3-a456-426614174000';
const request = <T,>(operation: (token: string) => Promise<T>) =>
    operation('test');
function wrapper({ children }: PropsWithChildren) {
    const [client] = useState(
        () =>
            new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    );
    return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
}
const input = {
    ...emptyWorkspaceInput,
    sourceText: 'Hello.',
    targetLanguage: 'ru',
};
const base = {
    id,
    kind: 'text-language-detection',
    state: 'succeeded',
    failureCode: null,
    createdAt: '2026-10-15T00:00:00.000Z',
    completedAt: '2026-10-15T00:00:00.000Z',
};
function detected(language: string | null) {
    return { ...base, result: { language, confidence: 'high' } } as TextAiJob;
}
function useFlow(value = input, isCurrent = () => true) {
    const detection = useTextWorkspaceJob(request);
    const translation = useTextWorkspaceJob(request);
    return useTextWorkspaceAuto({
        input: value,
        folderId: id,
        document: null,
        detection,
        translation,
        isCurrent,
    });
}
afterEach(() => vi.restoreAllMocks());
describe('automatic workspace language orchestration', () => {
    it('detects only on Translate and submits a real language without saving a draft', async () => {
        const detect = vi
            .spyOn(textsApi, 'detectLanguage')
            .mockResolvedValue({ job: detected('en') });
        const translate = vi
            .spyOn(textsApi, 'translateText')
            .mockResolvedValue({ job: { ...detected('en'), result: null } });
        const create = vi.spyOn(textsApi, 'createText');
        const { result } = renderHook(() => useFlow(), { wrapper });
        expect(detect).not.toHaveBeenCalled();
        await act(() => result.current.start());
        await waitFor(() => expect(translate).toHaveBeenCalled());
        expect(translate.mock.calls[0]?.[1]).toMatchObject({
            sourceLanguage: 'en',
            targetLanguage: 'ru',
            sourceText: 'Hello.',
        });
        expect(create).not.toHaveBeenCalled();
    });
    it('retries translation admission without repeating successful detection or operation identity', async () => {
        const detect = vi
            .spyOn(textsApi, 'detectLanguage')
            .mockResolvedValue({ job: detected('en') });
        const translate = vi
            .spyOn(textsApi, 'translateText')
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce({
                job: { ...detected('en'), result: null },
            });
        const { result } = renderHook(() => useFlow(), { wrapper });
        await act(() => result.current.start());
        await waitFor(() => expect(translate).toHaveBeenCalledTimes(1));
        await act(() => result.current.start());
        expect(detect).toHaveBeenCalledTimes(1);
        expect(translate).toHaveBeenCalledTimes(2);
        expect(translate.mock.calls[1]?.[1].operationId).toBe(
            translate.mock.calls[0]?.[1].operationId,
        );
    });
    it.each([null, 'unsupported', 'ru'])(
        'stops safely for detected %s',
        async (language) => {
            vi.spyOn(textsApi, 'detectLanguage').mockResolvedValue({
                job: detected(language),
            });
            const translate = vi.spyOn(textsApi, 'translateText');
            const { result } = renderHook(() => useFlow(), { wrapper });
            await act(() => result.current.start());
            await waitFor(() =>
                expect(result.current.error).toBe(
                    language === 'ru' ? 'same' : 'unknown',
                ),
            );
            expect(translate).not.toHaveBeenCalled();
        },
    );
    it('fences a cancelled admission and cancels its late job', async () => {
        let resolve!: (value: { job: TextAiJob }) => void;
        vi.spyOn(textsApi, 'detectLanguage').mockReturnValue(
            new Promise((done) => {
                resolve = done;
            }),
        );
        const cancel = vi
            .spyOn(textsApi, 'cancelAiJob')
            .mockResolvedValue({ job: detected('en') });
        const translate = vi.spyOn(textsApi, 'translateText');
        const { result } = renderHook(() => useFlow(), { wrapper });
        let pending!: Promise<void>;
        act(() => {
            pending = result.current.start();
        });
        act(() => result.current.invalidate());
        await act(async () => {
            resolve({
                job: { ...detected('en'), state: 'queued', result: null },
            });
            await pending;
        });
        expect(cancel).toHaveBeenCalled();
        expect(translate).not.toHaveBeenCalled();
    });
    it.each(['input', 'actor'])(
        'fences a late result after %s changes',
        async (change) => {
            let resolve!: (value: { job: TextAiJob }) => void;
            vi.spyOn(textsApi, 'detectLanguage').mockReturnValue(
                new Promise((done) => {
                    resolve = done;
                }),
            );
            vi.spyOn(textsApi, 'cancelAiJob').mockResolvedValue({
                job: detected('en'),
            });
            const translate = vi.spyOn(textsApi, 'translateText');
            let current = true;
            const { result, rerender } = renderHook(
                ({ value }) => useFlow(value, () => current),
                { wrapper, initialProps: { value: input } },
            );
            let pending!: Promise<void>;
            act(() => {
                pending = result.current.start();
            });
            if (change === 'actor') current = false;
            else rerender({ value: { ...input, sourceText: 'A new input.' } });
            await act(async () => {
                resolve({ job: detected('en') });
                await pending;
            });
            expect(translate).not.toHaveBeenCalled();
        },
    );
    it('bypasses detection with a manual language', async () => {
        const detect = vi.spyOn(textsApi, 'detectLanguage');
        const translate = vi
            .spyOn(textsApi, 'translateText')
            .mockResolvedValue({ job: { ...detected('en'), result: null } });
        const { result } = renderHook(
            () => useFlow({ ...input, sourceLanguage: 'en' }),
            { wrapper },
        );
        await act(() => result.current.start());
        expect(translate).toHaveBeenCalled();
        expect(detect).not.toHaveBeenCalled();
    });
});
