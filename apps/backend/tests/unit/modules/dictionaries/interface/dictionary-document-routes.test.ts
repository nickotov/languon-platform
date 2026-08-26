import { describe, expect, it, vi } from 'vitest';

import { AuthHttpPolicy } from '../../../../../src/modules/authentication/interface/http/auth-http-policy';
import { createDictionaryDocumentRoutes } from '../../../../../src/modules/dictionaries/interface/http/dictionary-document.routes';

const dictionaryId = '2db8e37d-48e9-41ae-af84-4f6cbbc56e57';
const uploadId = 'f4460b54-b06d-42df-a2a6-548dc6808d31';
const policy = new AuthHttpPolicy({
    allowedOrigins: ['http://localhost:3333'],
    appEnvironment: 'test',
    refreshTokenTtlSeconds: 3_600,
});

describe('dictionary document HTTP routes', () => {
    it('validates and dispatches document upload authorization', async () => {
        const authorizeUpload = vi.fn(async () => ({ ok: true }));
        const routes = createDictionaryDocumentRoutes({
            policy,
            service: { authorizeUpload } as never,
        });
        const response = await routes.request(
            `/dictionaries/${dictionaryId}/document-uploads`,
            {
                body: JSON.stringify({
                    expectedDictionaryVersion: 1,
                    expectedSettingsVersion: 1,
                    instruction: null,
                    mediaType: 'text/plain',
                    sha256: 'a'.repeat(64),
                    sizeBytes: 12,
                }),
                headers: {
                    Authorization: 'Bearer valid.token.value',
                    'Content-Type': 'application/json',
                    'Idempotency-Key': 'document-idempotency-key',
                },
                method: 'POST',
            },
        );
        expect(response.status).toBe(202);
        expect(authorizeUpload).toHaveBeenCalledWith(
            'valid.token.value',
            'document-idempotency-key',
            dictionaryId,
            expect.objectContaining({ mediaType: 'text/plain', sizeBytes: 12 }),
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
    });

    it('rejects malformed checksum and oversized files before dispatch', async () => {
        const authorizeUpload = vi.fn();
        const routes = createDictionaryDocumentRoutes({
            policy,
            service: { authorizeUpload } as never,
        });
        const send = (sha256: string, sizeBytes: number) =>
            routes.request(`/dictionaries/${dictionaryId}/document-uploads`, {
                body: JSON.stringify({
                    expectedDictionaryVersion: 1,
                    expectedSettingsVersion: 1,
                    instruction: null,
                    mediaType: 'text/plain',
                    sha256,
                    sizeBytes,
                }),
                headers: {
                    Authorization: 'Bearer valid.token.value',
                    'Content-Type': 'application/json',
                    'Idempotency-Key': 'document-idempotency-key',
                },
                method: 'POST',
            });
        expect((await send('not-a-checksum', 12)).status).toBe(400);
        expect(
            (await send('a'.repeat(64), 20 * 1_024 * 1_024 + 1)).status,
        ).toBe(400);
        expect(authorizeUpload).not.toHaveBeenCalled();
    });

    it('dispatches exact-version upload completion', async () => {
        const completeUpload = vi.fn(async () => ({ ok: true }));
        const routes = createDictionaryDocumentRoutes({
            policy,
            service: { completeUpload } as never,
        });
        const response = await routes.request(
            `/dictionary-document-uploads/${uploadId}/complete`,
            {
                body: JSON.stringify({ versionId: 'immutable-version-1' }),
                headers: {
                    Authorization: 'Bearer valid.token.value',
                    'Content-Type': 'application/json',
                },
                method: 'POST',
            },
        );
        expect(response.status).toBe(200);
        expect(completeUpload).toHaveBeenCalledWith(
            'valid.token.value',
            uploadId,
            { versionId: 'immutable-version-1' },
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
    });
});
