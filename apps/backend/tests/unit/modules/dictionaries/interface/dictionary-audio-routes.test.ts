import { describe, expect, it, vi } from 'vitest';
import type { DictionaryAudioService } from '../../../../../src/modules/dictionaries/application/dictionary-audio-service';
import { createDictionaryAudioRoutes } from '../../../../../src/modules/dictionaries/interface/http/dictionary-audio.routes';
import { AuthHttpPolicy } from '../../../../../src/modules/authentication/interface/http/auth-http-policy';

const dictionaryId = '11111111-1111-4111-8111-111111111111';
const cardId = '22222222-2222-4222-8222-222222222222';
const assetId = '33333333-3333-4333-8333-333333333333';
const base = `/dictionaries/${dictionaryId}/cards/${cardId}/audio`;
const authorization = 'Bearer a.b.c';
function setup() {
    const service = {
        request: vi.fn().mockResolvedValue({
            state: 'queued',
            field: 'source',
            assetId: null,
            fixture: true,
            retryAfterMs: 1500,
            error: null,
        }),
        status: vi.fn().mockResolvedValue({
            state: 'ready',
            field: 'source',
            assetId,
            fixture: true,
            retryAfterMs: null,
            error: null,
        }),
        content: vi.fn().mockResolvedValue({
            bytes: new Uint8Array([82, 73, 70, 70]),
            mimeType: 'audio/wav',
            checksum: 'test',
        }),
    };
    const app = createDictionaryAudioRoutes({
        service: service as unknown as DictionaryAudioService,
        policy: new AuthHttpPolicy({
            appEnvironment: 'test',
            allowedOrigins: ['http://localhost:3333'],
            refreshTokenTtlSeconds: 60,
        }),
    });
    return { app, service };
}
describe('dictionary audio HTTP boundary', () => {
    it('rejects missing credentials and arbitrary input before invoking paid admission', async () => {
        const { app, service } = setup();
        expect((await app.request(`${base}/source`)).status).toBe(401);
        const response = await app.request(base, {
            method: 'POST',
            headers: { authorization, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                field: 'source',
                expectedCardVersion: 1,
                expectedSettingsVersion: 1,
                text: 'client injection',
            }),
        });
        expect(response.status).toBe(400);
        expect(service.request).not.toHaveBeenCalled();
    });
    it('returns pending admission and never creates a job from status reads', async () => {
        const { app, service } = setup();
        const response = await app.request(base, {
            method: 'POST',
            headers: { authorization, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                field: 'source',
                expectedCardVersion: 1,
                expectedSettingsVersion: 1,
            }),
        });
        expect(response.status).toBe(202);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(
            (
                await app.request(`${base}/source`, {
                    headers: { authorization },
                })
            ).status,
        ).toBe(200);
        expect(service.request).toHaveBeenCalledTimes(1);
        expect(service.status).toHaveBeenCalledTimes(1);
    });
    it('serves authorized bytes with private media headers and rejects arbitrary asset keys', async () => {
        const { app, service } = setup();
        expect(
            (
                await app.request(
                    `${base}/source/content?assetId=../../secret`,
                    { headers: { authorization } },
                )
            ).status,
        ).toBe(400);
        expect(service.content).not.toHaveBeenCalled();
        const response = await app.request(
            `${base}/source/content?assetId=${assetId}`,
            { headers: { authorization } },
        );
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('audio/wav');
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(
            new Uint8Array([82, 73, 70, 70]),
        );
    });
});
