import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpeechSource } from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { speechApi } from '@/fsd/features/speech-playback/api/speech-api';
import { speechAvailability } from '@/fsd/features/speech-playback/api/speech-availability';

const request: RequestWithSession = (callback) => callback('private-token');
const source: SpeechSource = {
    kind: 'dictionary-field',
    access: {
        kind: 'owner',
        dictionaryId: '00000000-0000-4000-8000-000000000001',
    },
    cardId: '00000000-0000-4000-8000-000000000002',
    field: 'source',
};
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('speech API boundary', () => {
    it('batches controls with the same authenticated transport, never exceeding 50 sources', async () => {
        const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
            const body = JSON.parse(String(init.body));
            return new Response(
                JSON.stringify({
                    availability: body.sources.map((item: SpeechSource) => ({
                        source: item,
                        playable: true,
                        generationAvailable: true,
                    })),
                }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        });
        vi.stubGlobal('fetch', fetcher);
        const results = await Promise.all(
            Array.from({ length: 51 }, () =>
                speechAvailability(source, request),
            ),
        );
        expect(results.every(Boolean)).toBe(true);
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(
            JSON.parse(String(fetcher.mock.calls[0]?.[1].body)).sources,
        ).toHaveLength(50);
        expect(
            JSON.parse(String(fetcher.mock.calls[1]?.[1].body)).sources,
        ).toHaveLength(1);
        expect(fetcher.mock.calls[0]?.[1].headers).toMatchObject({
            Authorization: 'Bearer private-token',
        });
    });
    it('matches capabilities despite object property order differing from contract parsing', async () => {
        const reordered: SpeechSource = {
            kind: 'dictionary-field',
            access: source.access,
            cardId: source.cardId,
            expectedVersion: 1,
            field: 'source',
        };
        const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
            const body = JSON.parse(String(init.body));
            return new Response(
                JSON.stringify({
                    availability: body.sources.map((item: SpeechSource) => ({
                        source: item,
                        playable: true,
                        generationAvailable: true,
                    })),
                }),
            );
        });
        vi.stubGlobal('fetch', fetcher);
        await expect(speechAvailability(reordered, request)).resolves.toBe(
            true,
        );
    });

    it('isolates batches from different session transports', async () => {
        const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
            const body = JSON.parse(String(init.body));
            return new Response(
                JSON.stringify({
                    availability: body.sources.map((item: SpeechSource) => ({
                        source: item,
                        playable: true,
                        generationAvailable: false,
                    })),
                }),
            );
        });
        vi.stubGlobal('fetch', fetcher);
        await Promise.all([
            speechAvailability(source, request),
            speechAvailability(source, (callback) => callback('other-token')),
        ]);
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('rejects unvalidated provider JSON instead of manufacturing ready state', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        state: 'ready',
                        playbackId: 'untrusted',
                    }),
                ),
            ),
        );
        await expect(
            speechApi(request).prepare(source, new AbortController().signal),
        ).rejects.toThrow();
    });
    it('rejects non-audio and oversized bytes and fetches private content with bearer and no-store', async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(
                new Response('html', {
                    headers: { 'Content-Type': 'text/html' },
                }),
            )
            .mockResolvedValueOnce(
                new Response(new Uint8Array(5 * 1024 * 1024 + 1), {
                    headers: { 'Content-Type': 'audio/mpeg' },
                }),
            );
        vi.stubGlobal('fetch', fetcher);
        const api = speechApi(request);
        await expect(
            api.bytes('recording', new AbortController().signal),
        ).rejects.toThrow('Invalid pronunciation audio');
        await expect(
            api.bytes('recording', new AbortController().signal),
        ).rejects.toThrow('Invalid pronunciation audio');
        expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
            cache: 'no-store',
            headers: { Authorization: 'Bearer private-token' },
        });
    });
});
