import { describe, expect, it, vi } from 'vitest';

import type { SpeechResponse } from '@languon/contracts';
import { AuthHttpPolicy } from '../../../../src/modules/authentication/interface/http/auth-http-policy';
import type { SpeechService } from '../../../../src/modules/speech/application/speech-service';
import { SpeechError } from '../../../../src/modules/speech/domain/speech-policy';
import { createSpeechRoutes } from '../../../../src/modules/speech/interface/http/speech.routes';

const actorId = '11111111-1111-4111-8111-111111111111';
const dictionaryId = '22222222-2222-4222-8222-222222222222';
const cardId = '33333333-3333-4333-8333-333333333333';
const operationId = '44444444-4444-4444-8444-444444444444';
const authorization = 'Bearer header.payload.signature';
const response: SpeechResponse = {
    state: 'queued',
    requestId: null,
    playbackId: null,
    quote: null,
    fixture: true,
    retryAfterMs: 2500,
    error: null,
    billingState: 'free',
};

function setup() {
    const service = {
        availability: vi.fn().mockResolvedValue({ availability: [] }),
        prepare: vi.fn().mockResolvedValue(response),
        confirm: vi.fn(),
        status: vi.fn(),
        content: vi.fn(),
    } as unknown as SpeechService;
    const authenticate = vi.fn().mockResolvedValue(actorId);
    const app = createSpeechRoutes({
        service,
        authenticate,
        policy: new AuthHttpPolicy({
            appEnvironment: 'test',
            allowedOrigins: ['http://localhost:3333'],
            refreshTokenTtlSeconds: 60,
        }),
    });
    return {
        app,
        authenticate,
        service: service as unknown as { prepare: ReturnType<typeof vi.fn> },
    };
}

describe('speech HTTP boundary', () => {
    const source = {
        kind: 'dictionary-field',
        access: { kind: 'owner', dictionaryId },
        cardId,
        field: 'source',
        expectedVersion: 1,
    };

    it('answers approved cross-origin preflight without authentication or speech admission', async () => {
        const { app, authenticate, service } = setup();
        const result = await app.request('/speech/availability', {
            method: 'OPTIONS',
            headers: {
                Origin: 'http://localhost:3333',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'authorization,content-type',
            },
        });
        expect(result.status).toBe(204);
        expect(result.headers.get('Access-Control-Allow-Origin')).toBe(
            'http://localhost:3333',
        );
        expect(result.headers.get('Access-Control-Allow-Methods')).toBe(
            'GET, POST, OPTIONS',
        );
        expect(result.headers.get('Access-Control-Allow-Headers')).toBe(
            'Authorization, Content-Type, X-Correlation-ID',
        );
        expect(result.headers.get('Vary')).toBe('Origin');
        expect(authenticate).not.toHaveBeenCalled();
        expect(service.prepare).not.toHaveBeenCalled();
    });

    it('rejects missing or unapproved preflight origins and unapproved request origins', async () => {
        const { app, authenticate, service } = setup();
        for (const origin of [null, 'https://unapproved.example']) {
            const result = await app.request('/speech/availability', {
                method: 'OPTIONS',
                headers: origin ? { Origin: origin } : {},
            });
            expect(result.status).toBe(400);
            expect(
                result.headers.get('Access-Control-Allow-Origin'),
            ).toBeNull();
        }
        const result = await app.request('/speech/prepare', {
            method: 'POST',
            headers: {
                Origin: 'https://unapproved.example',
                Authorization: authorization,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ source, operationId }),
        });
        expect(result.status).toBe(400);
        expect(authenticate).not.toHaveBeenCalled();
        expect(service.prepare).not.toHaveBeenCalled();
    });

    it('requires bearer authentication before any speech admission', async () => {
        const { app, service } = setup();
        const result = await app.request('/speech/prepare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source, operationId }),
        });
        expect(result.status).toBe(401);
        expect(service.prepare).not.toHaveBeenCalled();
    });

    it('accepts only typed saved-content references and forwards the authenticated actor', async () => {
        const { app, authenticate, service } = setup();
        const rejected = await app.request('/speech/prepare', {
            method: 'POST',
            headers: {
                Authorization: authorization,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                source,
                operationId,
                text: 'client supplied text',
            }),
        });
        expect(rejected.status).toBe(400);
        expect(service.prepare).not.toHaveBeenCalled();
        const accepted = await app.request('/speech/prepare', {
            method: 'POST',
            headers: {
                Authorization: authorization,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ source, operationId }),
        });
        expect(accepted.status).toBe(202);
        expect(authenticate).toHaveBeenCalledWith('header.payload.signature');
        expect(service.prepare).toHaveBeenCalledWith(
            actorId,
            { source, operationId },
            expect.any(AbortSignal),
        );
        expect(accepted.headers.get('Cache-Control')).toBe('private, no-store');
        expect(accepted.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('does not let a caller inject an actor or malformed shared capability', async () => {
        const { app, service } = setup();
        for (const body of [
            {
                source,
                operationId,
                actorId: '55555555-5555-4555-8555-555555555555',
            },
            {
                source: {
                    ...source,
                    access: {
                        kind: 'shared',
                        shareId: 'short',
                        shareKey: 'key',
                    },
                },
                operationId,
            },
        ]) {
            const result = await app.request('/speech/prepare', {
                method: 'POST',
                headers: {
                    Authorization: authorization,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            expect(result.status).toBe(400);
        }
        expect(service.prepare).not.toHaveBeenCalled();
    });

    it('returns a stable sanitized source error without leaking saved content', async () => {
        const { app, service } = setup();
        service.prepare.mockRejectedValueOnce(
            new SpeechError('speech_source_unavailable', 404),
        );
        const result = await app.request('/speech/prepare', {
            method: 'POST',
            headers: {
                Authorization: authorization,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ source, operationId }),
        });
        expect(result.status).toBe(404);
        const body = await result.json();
        expect(body).toMatchObject({
            error: {
                code: 'speech_source_unavailable',
                message: 'Pronunciation is unavailable for this request.',
            },
        });
        expect(JSON.stringify(body)).not.toContain(cardId);
    });
});
