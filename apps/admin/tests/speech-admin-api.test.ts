import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../src/shared/api/admin-api';
import { accessTokenStore } from '../src/shared/auth/access-token-store';

const id = '00000000-0000-4000-8000-000000000042';
const error = (status: number, code: string) =>
    new Response(
        JSON.stringify({
            error: {
                code,
                message: 'Review authentication and retry explicitly.',
                correlationId: id,
            },
        }),
        { status, headers: { 'Content-Type': 'application/json' } },
    );
beforeEach(() => {
    vi.restoreAllMocks();
    accessTokenStore.set('admin-token');
});
afterEach(() => {
    accessTokenStore.clear();
    vi.unstubAllGlobals();
});

describe('speech administration transport', () => {
    it('encodes inventory filters and validates results', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
            new Response(JSON.stringify({ recordings: [], total: 0 }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetcher);
        await adminApi.speechRecordings({
            search: 'café & tea',
            linked: 'false',
            createdFrom: '2026-01-01T00:00:00.000Z',
            page: 1,
            pageSize: 25,
        });
        const url = new URL(
            String(fetcher.mock.calls[0]?.[0]),
            'http://localhost',
        );
        expect(url.pathname).toBe('/api/admin/speech/recordings');
        expect(url.searchParams.get('search')).toBe('café & tea');
        expect(url.searchParams.get('linked')).toBe('false');
        expect(url.searchParams.get('createdFrom')).toBe(
            '2026-01-01T00:00:00.000Z',
        );
    });

    it('does not refresh and replay a destructive request after an auth failure', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(error(401, 'recent_authentication_required'));
        vi.stubGlobal('fetch', fetcher);
        await expect(
            adminApi.deleteSpeechRecordings({
                operationId: id,
                reason: 'Remove faulty pronunciation',
                recordings: [
                    { id, expectedVersion: 2, expectedBindingCount: 3 },
                ],
            }),
        ).rejects.toThrow();
        expect(fetcher).toHaveBeenCalledTimes(1);
        const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
        expect(body.recordings[0]).toEqual({
            id,
            expectedVersion: 2,
            expectedBindingCount: 3,
        });
    });

    it('rejects oversized selections before sending the mutation', async () => {
        const fetcher = vi.fn<typeof fetch>();
        vi.stubGlobal('fetch', fetcher);
        expect(() =>
            adminApi.deleteSpeechRecordings({
                operationId: id,
                reason: 'Remove bad audio',
                recordings: Array.from({ length: 101 }, () => ({
                    id,
                    expectedVersion: 1,
                    expectedBindingCount: 0,
                })),
            }),
        ).toThrow();
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('publishes exact model revision and never retries a failed publish', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(error(401, 'recent_authentication_required'));
        vi.stubGlobal('fetch', fetcher);
        await expect(
            adminApi.publishModelPrice({
                providerId: 'kie',
                modelId: 'voice',
                meter: 'speech-characters',
                expectedVersion: 4,
                creditsPer1000Characters: 100,
                minimumCredits: 1,
                inputCreditsPerMillionTokens: null,
                outputCreditsPerMillionTokens: null,
                provisional: true,
                reason: 'Set provisional tariff',
            }),
        ).rejects.toThrow();
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(
            JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)),
        ).toMatchObject({ expectedVersion: 4, meter: 'speech-characters' });
    });

    it('fetches preview through protected backend bytes', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
            new Response(new Uint8Array([1, 2]), {
                headers: { 'Content-Type': 'audio/mpeg' },
            }),
        );
        vi.stubGlobal('fetch', fetcher);
        const blob = await adminApi.speechRecordingContent(id);
        expect(blob.type).toBe('audio/mpeg');
        expect(String(fetcher.mock.calls[0]?.[0])).toContain(
            `/api/admin/speech/recordings/${id}/content`,
        );
        expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
            headers: { Authorization: 'Bearer admin-token' },
            redirect: 'error',
            cache: 'no-store',
        });
    });

    it('rejects nonaudio preview responses', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn<typeof fetch>().mockResolvedValue(
                new Response('<html>unsafe</html>', {
                    headers: { 'Content-Type': 'text/html' },
                }),
            ),
        );
        await expect(adminApi.speechRecordingContent(id)).rejects.toThrow(
            'invalid',
        );
    });
});
