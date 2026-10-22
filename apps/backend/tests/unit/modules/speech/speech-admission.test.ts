import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SpeechService } from '../../../../src/modules/speech/application/speech-service';
import type {
    AudioObjectStorage,
    SpeechStore,
} from '../../../../src/modules/speech/application/ports';
import { GenerationBurstUnavailableError } from '../../../../src/modules/text-ai/application/generation-burst-limiter';
import { createSpeechRoutes } from '../../../../src/modules/speech/interface/http/speech.routes';
import { AuthHttpPolicy } from '../../../../src/modules/authentication/interface/http/auth-http-policy';

function fixture() {
    const consume = vi.fn(async () => ({ allowed: true }));
    const resolve = vi.fn();
    const prepare = vi.fn();
    const confirm = vi.fn();
    const authenticate = vi.fn(async () => 'synthetic-account');
    const app = createSpeechRoutes({
        service: new SpeechService({
            burstLimiter: { consume },
            resolver: { resolve },
            store: { prepare, confirm } as unknown as SpeechStore,
            storage: {} as AudioObjectStorage,
        }),
        authenticate,
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3333'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
    });
    return { app, consume, resolve, prepare, confirm, authenticate };
}
const source = () => ({
    kind: 'dictionary-field',
    access: { kind: 'owner', dictionaryId: randomUUID() },
    cardId: randomUUID(),
    field: 'source',
    expectedDictionaryVersion: 1,
    expectedVersion: 1,
});
describe('speech generation burst admission HTTP boundary', () => {
    it.each(['prepare', 'confirm'] as const)(
        'authenticates %s before consuming or accessing sources',
        async (operation) => {
            const f = fixture();
            f.authenticate.mockRejectedValue(new Error('unauthorized'));
            await f.app.request(`/speech/${operation}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer header.payload.signature',
                },
                body: JSON.stringify(
                    operation === 'prepare'
                        ? { source: source(), operationId: randomUUID() }
                        : { quoteId: randomUUID(), operationId: randomUUID() },
                ),
            });
            expect(f.consume).not.toHaveBeenCalled();
            expect(f.resolve).not.toHaveBeenCalled();
            expect(f.prepare).not.toHaveBeenCalled();
            expect(f.confirm).not.toHaveBeenCalled();
        },
    );
    it.each(['prepare', 'confirm'] as const)(
        'rejects burst and Redis outage before any %s database work',
        async (operation) => {
            for (const unavailable of [false, true]) {
                const f = fixture();
                if (unavailable)
                    f.consume.mockRejectedValue(
                        new GenerationBurstUnavailableError(),
                    );
                else f.consume.mockResolvedValue({ allowed: false });
                const response = await f.app.request(`/speech/${operation}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer header.payload.signature',
                    },
                    body: JSON.stringify(
                        operation === 'prepare'
                            ? { source: source(), operationId: randomUUID() }
                            : {
                                  quoteId: randomUUID(),
                                  operationId: randomUUID(),
                              },
                    ),
                });
                expect(response.status).toBe(unavailable ? 503 : 429);
                expect(f.authenticate).toHaveBeenCalledOnce();
                expect(f.consume).toHaveBeenCalledWith(
                    expect.objectContaining({
                        actorId: 'synthetic-account',
                        capability: `speech-${operation}`,
                    }),
                );
                expect(f.resolve).not.toHaveBeenCalled();
                expect(f.prepare).not.toHaveBeenCalled();
                expect(f.confirm).not.toHaveBeenCalled();
            }
        },
    );
});
