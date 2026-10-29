import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeechResponse, SpeechSource } from '@languon/contracts';
import { SpeechPlayer } from '@/fsd/features/speech-playback/model/speech-player';
import type { SpeechTransport } from '@/fsd/features/speech-playback/api/speech-api';

const source: SpeechSource = {
    kind: 'dictionary-field',
    access: {
        kind: 'owner',
        dictionaryId: '00000000-0000-4000-8000-000000000001',
    },
    cardId: '00000000-0000-4000-8000-000000000002',
    field: 'source',
};
const ready: SpeechResponse = {
    state: 'ready',
    requestId: null,
    playbackId: '00000000-0000-4000-8000-000000000003',
    quote: null,
    fixture: false,
    retryAfterMs: null,
    error: null,
    billingState: 'free',
};
const paid: SpeechResponse = {
    ...ready,
    state: 'confirmation_required',
    playbackId: null,
    quote: {
        id: '00000000-0000-4000-8000-000000000004',
        credits: '11',
        availableCredits: '100',
        unlimited: false,
        wordCount: 11,
        characterCount: 110,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        provisional: true,
    },
};
class FakeAudio {
    static instances: FakeAudio[] = [];
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();
    removeAttribute = vi.fn();
    load = vi.fn();
    constructor(public src: string) {
        FakeAudio.instances.push(this);
    }
}
function transport(): SpeechTransport {
    return {
        availability: vi.fn(),
        prepare: vi.fn().mockResolvedValue(ready),
        confirm: vi.fn().mockResolvedValue(ready),
        status: vi.fn(),
        bytes: vi
            .fn()
            .mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' })),
    };
}
beforeEach(() => {
    FakeAudio.instances = [];
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal(
        'URL',
        Object.assign(URL, {
            createObjectURL: vi.fn(() => 'blob:speech'),
            revokeObjectURL: vi.fn(),
        }),
    );
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('shared speech playback', () => {
    it('retains a provider failure from polling and clears it for a new selection', async () => {
        vi.useFakeTimers();
        const api = transport();
        vi.mocked(api.prepare).mockResolvedValueOnce({
            ...ready,
            state: 'queued',
            playbackId: null,
            requestId: ready.playbackId,
            retryAfterMs: 500,
        });
        vi.mocked(api.status).mockResolvedValue({
            ...ready,
            state: 'failed',
            playbackId: null,
            requestId: ready.playbackId,
            error: 'speech_provider_unavailable',
            billingState: 'released_no_charge',
        });
        const player = new SpeechPlayer();
        const observed: ReturnType<SpeechPlayer['snapshot']>[] = [];
        player.subscribe(() => observed.push(player.snapshot()));
        const operation = player.play(source, api);
        await vi.advanceTimersByTimeAsync(500);
        await operation;
        expect(player.snapshot()).toMatchObject({
            phase: 'failed',
            error: 'speech_provider_unavailable',
            billingState: 'released_no_charge',
        });
        expect(observed.at(-1)?.phase).toBe('failed');
        expect(api.prepare).toHaveBeenCalledOnce();
        expect(api.bytes).not.toHaveBeenCalled();
        await player.play({ ...source, field: 'translation' }, api);
        expect(player.snapshot()).toMatchObject({
            phase: 'playing',
            error: null,
        });
        player.reset();
        expect(player.snapshot().error).toBeNull();
    });
    it('does not confirm or download paid generation before an explicit action; cancellation submits nothing', async () => {
        const api = transport();
        vi.mocked(api.prepare).mockResolvedValue(paid);
        const player = new SpeechPlayer();
        await player.play(source, api);
        expect(player.snapshot().phase).toBe('confirmation');
        expect(api.confirm).not.toHaveBeenCalled();
        expect(api.bytes).not.toHaveBeenCalled();
        player.reset();
        await player.confirm();
        expect(api.confirm).not.toHaveBeenCalled();
    });
    it('confirms once even with repeated clicks while generation is being admitted', async () => {
        const api = transport();
        vi.mocked(api.prepare).mockResolvedValue(paid);
        let finish!: (value: SpeechResponse) => void;
        vi.mocked(api.confirm).mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        const player = new SpeechPlayer();
        await player.play(source, api);
        const first = player.confirm();
        await player.confirm();
        expect(api.confirm).toHaveBeenCalledOnce();
        finish(ready);
        await first;
        expect(player.snapshot().phase).toBe('playing');
        player.reset();
    });
    it('fences a late generation after selection change and revokes the previous clip', async () => {
        const api = transport();
        let finish!: (value: SpeechResponse) => void;
        vi.mocked(api.prepare).mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        const player = new SpeechPlayer();
        const old = player.play(source, api);
        player.reset();
        await player.play({ ...source, field: 'translation' }, api);
        finish(ready);
        await old;
        expect(FakeAudio.instances).toHaveLength(1);
        expect(api.bytes).toHaveBeenCalledOnce();
        player.reset();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:speech');
    });
    it('retries autoplay in a fresh gesture without another API request', async () => {
        class BlockedAudio extends FakeAudio {
            constructor(src: string) {
                super(src);
                this.play.mockRejectedValueOnce(
                    new DOMException('blocked', 'NotAllowedError'),
                );
            }
        }
        vi.stubGlobal('Audio', BlockedAudio);
        const api = transport();
        const player = new SpeechPlayer();
        await player.play(source, api);
        expect(player.snapshot().phase).toBe('ready');
        await player.play(source, api);
        expect(player.snapshot().phase).toBe('playing');
        expect(api.prepare).toHaveBeenCalledOnce();
        expect(api.bytes).toHaveBeenCalledOnce();
        player.reset();
    });
    it('expires a quote locally without submitting it', async () => {
        const api = transport();
        vi.mocked(api.prepare).mockResolvedValue({
            ...paid,
            quote: { ...paid.quote!, expiresAt: new Date(0).toISOString() },
        });
        const player = new SpeechPlayer();
        await player.play(source, api);
        await player.confirm();
        expect(api.confirm).not.toHaveBeenCalled();
        expect(player.snapshot().phase).toBe('failed');
        player.reset();
    });
    it('polls the known request and never resubmits an unknown outcome', async () => {
        vi.useFakeTimers();
        const api = transport();
        vi.mocked(api.prepare).mockResolvedValue({
            ...ready,
            state: 'queued',
            playbackId: null,
            requestId: ready.playbackId,
            retryAfterMs: 500,
        });
        vi.mocked(api.status).mockResolvedValue({
            ...ready,
            state: 'submission_unknown',
            playbackId: null,
        });
        const player = new SpeechPlayer();
        const operation = player.play(source, api);
        await vi.advanceTimersByTimeAsync(500);
        await operation;
        expect(api.prepare).toHaveBeenCalledOnce();
        expect(api.status).toHaveBeenCalledOnce();
        expect(api.bytes).not.toHaveBeenCalled();
        expect(player.snapshot().phase).toBe('unavailable');
        player.reset();
    });
    it('stops native recording playback before speech and stops speech before another recording', async () => {
        const player = new SpeechPlayer();
        const pauseRecording = vi.fn();
        player.registerExternalMedia(pauseRecording);
        await player.play(source, transport());
        expect(pauseRecording).toHaveBeenCalledOnce();
        const audio = FakeAudio.instances.at(-1)!;
        const pauseSecond = vi.fn();
        player.registerExternalMedia(pauseSecond);
        expect(audio.pause).toHaveBeenCalled();
        expect(player.snapshot().phase).toBe('idle');
        player.reset();
        expect(pauseSecond).toHaveBeenCalledOnce();
    });

    it('does not pause a native player registering the same target twice and refreshes its stop callback', () => {
        const player = new SpeechPlayer();
        const stale = vi.fn();
        const current = vi.fn();
        player.registerExternalMedia(stale, 'same-video');
        player.registerExternalMedia(current, 'same-video');
        expect(stale).not.toHaveBeenCalled();
        expect(current).not.toHaveBeenCalled();
        player.reset();
        expect(stale).not.toHaveBeenCalled();
        expect(current).toHaveBeenCalledOnce();
    });
});
