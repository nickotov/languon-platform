import type { DictionaryCard, OwnedDictionary } from '@languon/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AudioPlayback,
    AudioUnavailableError,
} from '@/fsd/features/dictionary-audio/lib/audio-playback';
import type {
    AudioPlaybackState,
    AudioSelection,
} from '@/fsd/features/dictionary-audio/types';
import { dictionaryAudioApi } from '@/fsd/entities/dictionary';
import { prepareAudio } from '@/fsd/features/dictionary-audio/api/prepare-audio';
import { DictionaryAudioControl } from '@/fsd/features/dictionary-audio';
import { DictionaryCardList } from '@/fsd/features/dictionary-card-list';
import { screen } from '@testing-library/react';
import { render } from './render';

const selection: AudioSelection = {
    card: { id: 'card', version: 1, settingsVersion: 1 } as DictionaryCard,
    field: 'source',
};
const clip = {
    blob: new Blob(['audio'], { type: 'audio/mpeg' }),
    fixture: true,
};
class FakeAudio {
    static instances: FakeAudio[] = [];
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    playbackRate = 1;
    preservesPitch = false;
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();
    removeAttribute = vi.fn();
    load = vi.fn();
    constructor(public src: string) {
        FakeAudio.instances.push(this);
    }
}
beforeEach(() => {
    FakeAudio.instances = [];
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal(
        'URL',
        Object.assign(URL, {
            createObjectURL: vi.fn(() => 'blob:test'),
            revokeObjectURL: vi.fn(),
        }),
    );
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('dictionary audio playback', () => {
    it('never starts a late preparation after Stop or a newer selection', async () => {
        let resolve!: (value: typeof clip) => void;
        const prepare = vi
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise((r) => {
                        resolve = r;
                    }),
            )
            .mockResolvedValue(clip);
        const changed = vi.fn();
        const player = new AudioPlayback({ prepare }, changed);
        const old = player.play(selection);
        player.stop();
        await player.play({ ...selection, field: 'translation' });
        resolve(clip);
        await old;
        expect(FakeAudio.instances).toHaveLength(1);
        expect(changed.mock.lastCall?.[0].selection.field).toBe('translation');
        expect(prepare.mock.calls[0]?.[1].aborted).toBe(true);
        player.dispose();
    });
    it('keeps one player, preserves pitch, and revokes bytes on replacement and disposal', async () => {
        const player = new AudioPlayback(
            { prepare: vi.fn().mockResolvedValue(clip) },
            vi.fn(),
        );
        player.setSpeed(0.8);
        await player.play(selection);
        const first = FakeAudio.instances[0]!;
        expect(first.playbackRate).toBe(0.8);
        expect(first.preservesPitch).toBe(true);
        await player.play({ ...selection, field: 'translation' });
        expect(first.pause).toHaveBeenCalledOnce();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
        player.dispose();
        expect(FakeAudio.instances[1]!.pause).toHaveBeenCalledOnce();
    });
    it('offers a fresh gesture after autoplay rejection without fetching or synthesizing again', async () => {
        const prepare = vi.fn().mockResolvedValue(clip);
        const changed = vi.fn();
        class BlockedAudio extends FakeAudio {
            constructor(src: string) {
                super(src);
                this.play.mockRejectedValueOnce(
                    new DOMException('blocked', 'NotAllowedError'),
                );
            }
        }
        vi.stubGlobal('Audio', BlockedAudio);
        const retryPlayer = new AudioPlayback({ prepare }, changed);
        await retryPlayer.play(selection);
        expect(changed.mock.lastCall?.[0].phase).toBe('ready');
        const requests = prepare.mock.calls.length;
        await retryPlayer.play(selection);
        expect(changed.mock.lastCall?.[0].phase).toBe('playing');
        expect(prepare).toHaveBeenCalledTimes(requests);
        retryPlayer.dispose();
    });
    it('does not update state or play after disposal; exposes unavailable and decoder errors', async () => {
        const changed = vi.fn<(state: AudioPlaybackState) => void>();
        const player = new AudioPlayback(
            { prepare: vi.fn().mockRejectedValue(new AudioUnavailableError()) },
            changed,
        );
        await player.play(selection);
        expect(changed.mock.lastCall?.[0].phase).toBe('unavailable');
        const ready = new AudioPlayback(
            { prepare: vi.fn().mockResolvedValue(clip) },
            changed,
        );
        await ready.play(selection);
        FakeAudio.instances[0]!.onerror?.();
        expect(changed.mock.lastCall?.[0].phase).toBe('failed');
        let resolve!: (value: typeof clip) => void;
        const late = new AudioPlayback(
            {
                prepare: () =>
                    new Promise((r) => {
                        resolve = r;
                    }),
            },
            changed,
        );
        const pending = late.play(selection);
        late.dispose();
        const count = changed.mock.calls.length;
        resolve(clip);
        await pending;
        expect(changed).toHaveBeenCalledTimes(count);
        expect(FakeAudio.instances).toHaveLength(1);
    });
});

describe('authorized bounded audio transport', () => {
    it('polls pending work without another generation request and uses saved versions', async () => {
        vi.useFakeTimers();
        const request = vi
            .spyOn(dictionaryAudioApi, 'request')
            .mockResolvedValue({
                state: 'queued',
                field: 'source',
                fixture: true,
                assetId: null,
                retryAfterMs: 500,
                error: null,
            });
        const status = vi
            .spyOn(dictionaryAudioApi, 'status')
            .mockResolvedValue({
                state: 'ready',
                field: 'source',
                fixture: true,
                assetId: 'asset',
                retryAfterMs: null,
                error: null,
            });
        vi.spyOn(dictionaryAudioApi, 'bytes').mockResolvedValue(clip.blob);
        const preparing = prepareAudio(
            (action) => action('token'),
            'dictionary',
            selection,
            new AbortController().signal,
        );
        await vi.advanceTimersByTimeAsync(500);
        expect(await preparing).toEqual(clip);
        expect(request).toHaveBeenCalledOnce();
        expect(request.mock.calls[0]?.[3]).toEqual({
            field: 'source',
            expectedCardVersion: 1,
            expectedSettingsVersion: 1,
        });
        expect(status).toHaveBeenCalledOnce();
    });
    it('fetches bytes with bearer auth and no-store', async () => {
        const fetch = vi.fn().mockResolvedValue(
            new Response(new Uint8Array([1, 2]), {
                headers: { 'content-type': 'audio/mpeg' },
            }),
        );
        vi.stubGlobal('fetch', fetch);
        const blob = await dictionaryAudioApi.bytes(
            'token',
            'dictionary',
            'card',
            'source',
            'asset',
            new AbortController().signal,
        );
        expect(blob.size).toBe(2);
        expect(fetch.mock.calls[0]?.[1]).toMatchObject({
            cache: 'no-store',
            headers: { Authorization: 'Bearer token' },
        });
    });
    it('rejects oversized streamed bytes even when content-length is absent', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(new Uint8Array(5 * 1024 * 1024 + 1), {
                    headers: { 'content-type': 'audio/mpeg' },
                }),
            ),
        );
        await expect(
            dictionaryAudioApi.bytes(
                'token',
                'dictionary',
                'card',
                'source',
                'asset',
                new AbortController().signal,
            ),
        ).rejects.toThrow('too large');
    });
});

it('labels the field, honest fixture status, and speed control accessibly', () => {
    render(
        <DictionaryAudioControl
            card={selection.card}
            field='source'
            playback={{
                state: { selection, phase: 'ready', fixture: true },
                speed: 1,
                play: vi.fn(),
                stop: vi.fn(),
                setSpeed: vi.fn(),
            }}
        />,
    );
    expect(
        screen.getByRole('button', { name: 'Play Source phrase' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Ready — press Play');
    expect(screen.getByRole('status')).toHaveTextContent(
        'Development sound — not a pronunciation recording.',
    );
    expect(
        screen.getByRole('combobox', { name: 'Playback speed' }),
    ).toHaveValue('1');
});

it('preserves exact saved field text when pronunciation controls are present', () => {
    const card = {
        ...selection.card,
        authorship: 'human',
        values: {
            source: 'casa',
            translation: 'house',
            example: 'La casa.',
            exampleTranslation: 'The house.',
        },
        effectiveSettings: {
            exampleEnabled: true,
            exampleLanguage: 'source',
            exampleTranslationEnabled: true,
            exampleTranslationLanguage: 'target',
        },
    } as DictionaryCard;
    render(
        <DictionaryCardList
            cards={[card]}
            dictionary={
                {
                    sourceLanguage: 'es',
                    targetLanguage: 'en',
                } as OwnedDictionary
            }
            languages={[]}
            lifecycle='active'
            pending={false}
            onEdit={vi.fn()}
            onLifecycle={vi.fn()}
            onMove={vi.fn()}
            renderAudio={(current, field) => (
                <DictionaryAudioControl
                    card={current}
                    field={field}
                    playback={{
                        state: {
                            selection: null,
                            phase: 'idle',
                            fixture: false,
                        },
                        speed: 1,
                        play: vi.fn(),
                        stop: vi.fn(),
                        setSpeed: vi.fn(),
                    }}
                />
            )}
        />,
    );
    for (const value of Object.values(card.values)) {
        expect(screen.getByText(value!, { exact: true })).toBeInTheDocument();
    }
    expect(
        screen.getByRole('button', { name: 'Play Source phrase' }),
    ).toBeInTheDocument();
    expect(
        screen.getByText('casa', { exact: true }).closest('[lang]'),
    ).toHaveAttribute('lang', 'es');
});
