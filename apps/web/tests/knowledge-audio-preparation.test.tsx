import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { LearningBlock, SpeechResponse } from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { useKnowledgeAudioPreparation } from '@/fsd/widgets/knowledge-speech/hooks/use-knowledge-audio-preparation';
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
const block: Extract<LearningBlock, { type: 'audio' }> = {
    id: blockId,
    type: 'audio',
    title: 'Dialogue',
    transcript: {
        language: 'fr',
        segments: [
            {
                id: assetId,
                text: 'Bonjour.',
                timing: { startSeconds: 0, endSeconds: 1 },
            },
        ],
    },
};
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
    transport.confirm.mockReset();
    transport.status.mockReset();
    transport.bytes
        .mockReset()
        .mockResolvedValue(new Blob(['wave'], { type: 'audio/wav' }));
    URL.createObjectURL = vi.fn(() => 'blob:audio-draft-preview');
    URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());
function assetResponse() {
    return new Response(
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
    );
}
it('generates from local transcript and accepts only into the local block after preview', async () => {
    const onAccept = vi.fn(),
        fetcher = vi.fn().mockResolvedValue(assetResponse());
    vi.stubGlobal('fetch', fetcher);
    const { result } = renderHook(() =>
        useKnowledgeAudioPreparation({
            noteId,
            branchId,
            block,
            language: 'fr',
            requestWithSession: request,
            onAccept,
        }),
    );
    await act(async () => {
        await result.current.generate();
    });
    expect(transport.prepare).toHaveBeenCalledWith(
        {
            kind: 'knowledge-audio-draft',
            noteId,
            branchId,
            blockId,
            sourceText: 'Bonjour.',
            language: 'fr',
        },
        expect.any(AbortSignal),
    );
    expect(onAccept).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.prepared?.url).toBe('blob:audio-draft-preview');
    await act(async () => {
        await result.current.accept();
    });
    expect(onAccept).toHaveBeenCalledWith({
        ...block,
        assetId,
        sourceText: 'Bonjour.',
        transcript: {
            language: 'fr',
            segments: [{ id: assetId, text: 'Bonjour.' }],
        },
    });
    expect(result.current.accepted).toBe(true);
});
it('preserves the old preview when regeneration or asset import fails', async () => {
    const onAccept = vi.fn(),
        fetcher = vi.fn().mockRejectedValue(new Error('network'));
    vi.stubGlobal('fetch', fetcher);
    const { result } = renderHook(() =>
        useKnowledgeAudioPreparation({
            noteId,
            branchId,
            block,
            language: 'fr',
            requestWithSession: request,
            onAccept,
        }),
    );
    await act(async () => {
        await result.current.generate();
    });
    transport.prepare.mockRejectedValueOnce(new Error('provider unavailable'));
    await act(async () => {
        await result.current.generate();
    });
    expect(result.current.failed).toBe(true);
    expect(result.current.prepared?.url).toBe('blob:audio-draft-preview');
    await act(async () => {
        await result.current.accept();
    });
    expect(result.current.failed).toBe(true);
    expect(result.current.prepared?.url).toBe('blob:audio-draft-preview');
    expect(onAccept).not.toHaveBeenCalled();
});
it('rejects stale acceptance after manual local edits', async () => {
    const onAccept = vi.fn(),
        fetcher = vi.fn().mockResolvedValue(assetResponse());
    vi.stubGlobal('fetch', fetcher);
    const { result, rerender } = renderHook(
        ({ value }) =>
            useKnowledgeAudioPreparation({
                noteId,
                branchId,
                block: value,
                language: 'fr',
                requestWithSession: request,
                onAccept,
            }),
        { initialProps: { value: block } },
    );
    await act(async () => {
        await result.current.generate();
    });
    rerender({ value: { ...block, sourceText: 'Au revoir.' } });
    expect(result.current.stale).toBe(true);
    await act(async () => {
        await result.current.accept();
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(onAccept).not.toHaveBeenCalled();
});
it('does not apply a recording when the dialog changes while importing the asset', async () => {
    let finish!: (response: Response) => void;
    const onAccept = vi.fn();
    vi.stubGlobal(
        'fetch',
        vi.fn(
            () =>
                new Promise<Response>((resolve) => {
                    finish = resolve;
                }),
        ),
    );
    const { result, rerender } = renderHook(
        ({ value }) =>
            useKnowledgeAudioPreparation({
                noteId,
                branchId,
                block: value,
                language: 'fr',
                requestWithSession: request,
                onAccept,
            }),
        { initialProps: { value: block } },
    );
    await act(async () => {
        await result.current.generate();
    });
    let accepting!: Promise<void>;
    await act(async () => {
        accepting = result.current.accept();
    });
    rerender({ value: { ...block, title: 'Manual edit preserved' } });
    await act(async () => {
        finish(assetResponse());
        await accepting;
    });
    expect(onAccept).not.toHaveBeenCalled();
    expect(result.current.stale).toBe(true);
});
it('discards late generation after dismiss and clears private previews on session loss', async () => {
    const onAccept = vi.fn();
    const { result } = renderHook(() =>
        useKnowledgeAudioPreparation({
            noteId,
            branchId,
            block,
            language: 'fr',
            requestWithSession: request,
            onAccept,
        }),
    );
    await act(async () => {
        await result.current.generate();
    });
    act(() => useSessionStore.getState().signOut());
    expect(result.current.prepared).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
        'blob:audio-draft-preview',
    );
    let finish!: (response: SpeechResponse) => void;
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
    act(() => result.current.dismiss());
    await act(async () => {
        finish(ready);
        await pending;
    });
    expect(result.current.prepared).toBeNull();
    expect(result.current.response).toBeNull();
    expect(onAccept).not.toHaveBeenCalled();
});
