import { TextLanguageSchema } from '@languon/contracts';
import { eligiblePrivateTranslationTargets } from '@/fsd/widgets/knowledge-private-translation/lib/eligible-targets';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { usePrivateTranslation } from '@/fsd/widgets/knowledge-private-translation/hooks/use-private-translation';
import type { KnowledgePrivateTranslationProps } from '@/fsd/widgets/knowledge-private-translation';
const transport = vi.hoisted(() => ({
    list: vi.fn(),
    request: vi.fn(),
    job: vi.fn(),
    cancel: vi.fn(),
}));
vi.mock(
    '@/fsd/widgets/knowledge-private-translation/api/private-translation-api',
    () => ({
        privateTranslationApi: () => transport,
        PrivateTranslationApiError: class extends Error {
            constructor(readonly status: number) {
                super('Unavailable');
            }
        },
    }),
);
const props: KnowledgePrivateTranslationProps = {
    actorId: '11111111-1111-4111-8111-111111111111',
    noteId: '22222222-2222-4222-8222-222222222222',
    noteVersion: 1,
    block: {
        id: '33333333-3333-4333-8333-333333333333',
        type: 'bilingual-text',
        language: 'en',
        segments: [
            { id: '44444444-4444-4444-8444-444444444444', text: 'Hello.' },
        ],
        translations: [],
    },
    requestWithSession: (callback) => callback('synthetic-token'),
};
const translation = {
    noteId: props.noteId,
    blockId: props.block.id,
    sourceFingerprint: 'a'.repeat(64),
    targetLanguage: 'fr',
    segments: [
        { sourceSegmentId: props.block.segments[0]!.id, text: 'Bonjour.' },
    ],
    updatedAt: '2026-10-29T00:00:00Z',
};
function wrapper() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
    };
}
beforeEach(() => {
    vi.clearAllMocks();
    transport.list.mockResolvedValue({ translations: [translation] });
    transport.request.mockResolvedValue({
        job: { id: props.actorId, state: 'completed' },
    });
    transport.cancel.mockResolvedValue({
        job: { id: props.actorId, state: 'cancelled' },
    });
});
it('loads only private overlays, invokes AI explicitly and preserves original text', async () => {
    const original = JSON.stringify(props.block);
    const { result } = renderHook(() => usePrivateTranslation(props), {
        wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.translations).toHaveLength(1));
    expect(transport.request).not.toHaveBeenCalled();
    await act(async () => result.current.generate());
    expect(transport.request).toHaveBeenCalledWith(
        expect.objectContaining({
            targetLanguage: 'fr',
            operationId: expect.any(String),
        }),
        expect.any(AbortSignal),
    );
    expect(JSON.stringify(props.block)).toBe(original);
});
it('hides retained private data after source access fails instead of exposing cached translations', async () => {
    const { result } = renderHook(() => usePrivateTranslation(props), {
        wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.translations).toHaveLength(1));
    transport.list.mockRejectedValue(new Error('Revoked'));
    await act(async () => {
        await result.current.retry();
    });
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.translations).toEqual([]);
});
it('retries an uncertain submission with its original operation identity', async () => {
    transport.request.mockRejectedValueOnce(new Error('Network uncertain'));
    const { result } = renderHook(() => usePrivateTranslation(props), {
        wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.generate());
    expect(result.current.failed).toBe(true);
    await act(async () => result.current.generate());
    expect(transport.request.mock.calls[0]![0].operationId).toBe(
        transport.request.mock.calls[1]![0].operationId,
    );
});

it('excludes author-prepared target languages and defaults to an eligible target', async () => {
    const prepared = {
        ...props,
        block: {
            ...props.block,
            translations: [
                {
                    language: 'fr',
                    segments: [
                        {
                            sourceSegmentId: props.block.segments[0]!.id,
                            text: 'Prepared French',
                        },
                    ],
                },
            ],
        },
    };
    const { result } = renderHook(() => usePrivateTranslation(prepared), {
        wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets).not.toContain('fr');
    expect(result.current.language).not.toBe('fr');
    await act(async () => result.current.generate());
    expect(transport.request.mock.calls[0]![0].targetLanguage).not.toBe('fr');
});
it('offers no paid target when the supported languages already have prepared translations', () => {
    const prepared = {
        ...props.block,
        translations: TextLanguageSchema.options
            .filter((language) => language !== 'en')
            .map((language) => ({
                language,
                segments: [
                    {
                        sourceSegmentId: props.block.segments[0]!.id,
                        text: 'Prepared',
                    },
                ],
            })),
    };
    expect(eligiblePrivateTranslationTargets(prepared)).toEqual([]);
});
