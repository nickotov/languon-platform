import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { LearningBlock, SpeechResponse } from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { useKnowledgeNarration } from '@/fsd/widgets/knowledge-speech/hooks/use-knowledge-narration';
import { useSessionStore } from '@/fsd/entities/session';

const transport = vi.hoisted(() => ({
    prepare: vi.fn(),
    confirm: vi.fn(),
    status: vi.fn(),
    bytes: vi.fn(),
}));
vi.mock('@/fsd/features/speech-playback', () => ({
    speechApi: () => transport,
}));
const request: RequestWithSession = (callback) => callback('test-token');
const noteId = '00000000-0000-4000-8000-000000000001',
    branchId = '00000000-0000-4000-8000-000000000002',
    blockId = '00000000-0000-4000-8000-000000000003',
    playbackId = '00000000-0000-4000-8000-000000000004',
    assetId = '00000000-0000-4000-8000-000000000005';
const blocks: LearningBlock[] = [
    {
        id: blockId,
        type: 'bilingual-text',
        language: 'fr',
        segments: [{ id: assetId, text: 'Bonjour.' }],
        translations: [],
    },
];
const ready: SpeechResponse = {
    state: 'ready',
    requestId: branchId,
    playbackId,
    quote: null,
    fixture: true,
    retryAfterMs: null,
    error: null,
    billingState: 'free',
};
beforeEach(() => {
    useSessionStore.setState({ status: 'signed-out', user: null });
    transport.prepare.mockReset().mockResolvedValue(ready);
    transport.bytes
        .mockReset()
        .mockResolvedValue(new Blob(['wave'], { type: 'audio/wav' }));
    URL.createObjectURL = vi.fn(() => 'blob:private-preview');
    URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
    vi.unstubAllGlobals();
});
it('flushes the working draft before generating and applies only after explicit action', async () => {
    let finish:
        | ((value: {
              branchId: string;
              branchVersion: number;
              blocks: LearningBlock[];
          }) => void)
        | undefined;
    const flush = vi.fn(
        () =>
            new Promise<{
                branchId: string;
                branchVersion: number;
                blocks: LearningBlock[];
            }>((resolve) => {
                finish = resolve;
            }),
    );
    const onApply = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(
        new Response(
            JSON.stringify({
                asset: {
                    id: assetId,
                    mimeType: 'audio/wav',
                    byteLength: 100,
                    durationMs: 1000,
                },
                sourceText: 'Bonjour.',
                language: 'fr',
            }),
            { status: 201 },
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    const { result } = renderHook(() =>
        useKnowledgeNarration({
            noteId,
            blocks,
            requestWithSession: request,
            flush,
            onApply,
        }),
    );
    let generating: Promise<void>;
    await act(async () => {
        generating = result.current.generate();
    });
    expect(transport.prepare).not.toHaveBeenCalled();
    await act(async () => {
        finish!({ branchId, branchVersion: 7, blocks });
        await generating!;
    });
    expect(transport.prepare).toHaveBeenCalledWith(
        {
            kind: 'knowledge-block',
            noteId,
            branchId,
            blockId,
            expectedBranchVersion: 7,
        },
        expect.any(AbortSignal),
    );
    expect(onApply).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => {
        await result.current.apply();
    });
    expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({
            type: 'audio',
            assetId,
            sourceText: 'Bonjour.',
            transcript: {
                language: 'fr',
                segments: [expect.objectContaining({ text: 'Bonjour.' })],
            },
        }),
    );
    expect(result.current.applied).toBe(true);
});
it('does not reuse a previous note preview after navigation', async () => {
    const onApply = vi.fn(),
        flush = async () => ({ branchId, branchVersion: 1, blocks });
    const { result, rerender } = renderHook(
        ({ id }) =>
            useKnowledgeNarration({
                noteId: id,
                blocks,
                requestWithSession: request,
                flush,
                onApply,
            }),
        { initialProps: { id: noteId } },
    );
    await act(async () => {
        await result.current.generate();
    });
    expect(result.current.url).toBe('blob:private-preview');
    rerender({ id: assetId });
    expect(result.current.url).toBeNull();
    await act(async () => {
        await result.current.apply();
    });
    expect(onApply).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-preview');
});

it('clears a private preview and rejects a pending response after session loss', async () => {
    const onApply = vi.fn(),
        flush = async () => ({ branchId, branchVersion: 1, blocks });
    const { result } = renderHook(() =>
        useKnowledgeNarration({
            noteId,
            blocks,
            requestWithSession: request,
            flush,
            onApply,
        }),
    );
    await act(async () => {
        await result.current.generate();
    });
    expect(result.current.url).toBe('blob:private-preview');
    act(() => {
        useSessionStore.getState().signOut();
    });
    expect(result.current.url).toBeNull();
    expect(result.current.response).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-preview');
    let finish!: (value: SpeechResponse) => void;
    transport.prepare.mockImplementationOnce(
        () =>
            new Promise<SpeechResponse>((resolve) => {
                finish = resolve;
            }),
    );
    let pending!: Promise<void>;
    await act(async () => {
        pending = result.current.generate();
    });
    act(() => {
        useSessionStore.getState().signOut();
    });
    await act(async () => {
        finish(ready);
        await pending;
    });
    expect(result.current.response).toBeNull();
    expect(result.current.url).toBeNull();
    await act(async () => {
        await result.current.apply();
    });
    expect(onApply).not.toHaveBeenCalled();
});
