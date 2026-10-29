import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    readKnowledgeAudio,
    uploadKnowledgeAudio,
} from '@/fsd/entities/knowledge';

const noteId = '11111111-1111-4111-8111-111111111111';
const assetId = '22222222-2222-4222-8222-222222222222';
afterEach(() => vi.unstubAllGlobals());

describe('knowledge media transport', () => {
    it('rejects unsafe or oversized files before HTTP', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        await expect(
            uploadKnowledgeAudio(
                'token',
                noteId,
                new File(['<script>'], 'clip.mp3', { type: 'text/html' }),
            ),
        ).rejects.toThrow();
        await expect(
            uploadKnowledgeAudio(
                'token',
                noteId,
                new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.wav', {
                    type: 'audio/wav',
                }),
            ),
        ).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('uses raw audio bytes and authenticated ownership for uploads', async () => {
        const fetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    asset: {
                        id: assetId,
                        mimeType: 'audio/wav',
                        byteLength: 3,
                        durationMs: 10,
                    },
                }),
                {
                    status: 201,
                    headers: { 'Content-Type': 'application/json' },
                },
            ),
        );
        vi.stubGlobal('fetch', fetch);
        const file = new File(['wav'], 'clip.wav', { type: 'audio/wav' });
        await expect(
            uploadKnowledgeAudio('token', noteId, file),
        ).resolves.toEqual({ assetId });
        expect(fetch.mock.calls[0]?.[0]).toContain(
            `/knowledge/notes/${noteId}/media`,
        );
        expect(fetch.mock.calls[0]?.[1]).toMatchObject({
            body: file,
            headers: {
                Authorization: 'Bearer token',
                'Content-Type': 'audio/wav',
            },
        });
    });

    it('keeps shared secrets in headers and returns only verified audio blobs', async () => {
        const fetch = vi.fn().mockResolvedValue(
            new Response(new Uint8Array([1]), {
                headers: { 'Content-Type': 'audio/mpeg' },
            }),
        );
        vi.stubGlobal('fetch', fetch);
        const access = {
            kind: 'workbook' as const,
            locator: 'locator',
            key: 'secret-share-key',
        };
        const result = await readKnowledgeAudio(noteId, assetId, {
            access,
            signal: new AbortController().signal,
        });
        expect(result.type).toBe('audio/mpeg');
        expect(fetch.mock.calls[0]?.[0]).not.toContain(access.key);
        expect(fetch.mock.calls[0]?.[1]).toMatchObject({
            headers: { 'X-Languon-Share-Key': access.key },
            cache: 'no-store',
        });
    });

    it('rejects nonaudio playback responses', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response('<script>', {
                    headers: { 'Content-Type': 'text/html' },
                }),
            ),
        );
        await expect(
            readKnowledgeAudio(noteId, assetId, {
                signal: new AbortController().signal,
            }),
        ).rejects.toThrow();
    });
});
