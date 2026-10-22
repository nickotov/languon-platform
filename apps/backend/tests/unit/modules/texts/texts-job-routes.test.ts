import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AuthHttpPolicy } from '../../../../src/modules/authentication/interface/http/auth-http-policy';
import { TextsJobService } from '../../../../src/modules/texts/application/texts-job-service';
import type { TextsJobStore } from '../../../../src/modules/texts/application/ports/texts-job-store';
import { TextsCreditsExhaustedError } from '../../../../src/modules/texts/application/ports/texts-ai-provider';
import { createTextsJobRoutes } from '../../../../src/modules/texts/interface/http/texts-job.routes';
import { GenerationBurstUnavailableError } from '../../../../src/modules/text-ai/application/generation-burst-limiter';
function fixture() {
    const consume = vi.fn(async () => ({ allowed: true }));
    const store: TextsJobStore = {
        enqueue: vi.fn(),
        get: vi.fn(),
        cancel: vi.fn(),
    };
    const authenticate = vi.fn(async () => ({ userId: randomUUID() }));
    const app = createTextsJobRoutes({
        service: new TextsJobService({
            burstLimiter: { consume },
            store,
            authenticate,
            clock: { now: () => new Date() },
            enabled: true,
        }),
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3000'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
    });
    return { app, store, authenticate, consume };
}
describe('Texts AI HTTP boundary', () => {
    it.each([
        ['denied', 'detection'],
        ['unavailable', 'detection'],
        ['denied', 'translation'],
        ['unavailable', 'translation'],
    ] as const)(
        'fails closed before enqueue when admission is %s for %s',
        async (failure, operation) => {
            const { app, store, authenticate, consume } = fixture();
            if (failure === 'denied')
                consume.mockResolvedValue({ allowed: false });
            else
                consume.mockRejectedValue(
                    new GenerationBurstUnavailableError(),
                );
            const response = await app.request(`/texts/ai/${operation}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer synthetic',
                },
                body: JSON.stringify({
                    folderId: randomUUID(),
                    operationId: randomUUID(),
                    sourceText: 'Hello.',
                    ...(operation === 'translation'
                        ? { sourceLanguage: 'en', targetLanguage: 'es' }
                        : {}),
                }),
            });
            expect(response.status).toBe(failure === 'denied' ? 429 : 503);
            expect(authenticate).toHaveBeenCalledOnce();
            expect(consume).toHaveBeenCalledWith(
                expect.objectContaining({ capability: `text-${operation}` }),
            );
            expect(store.enqueue).not.toHaveBeenCalled();
        },
    );
    it('rejects disallowed origins before authentication or admission', async () => {
        const { app, store, authenticate } = fixture();
        const response = await app.request(`/texts/ai/jobs/${randomUUID()}`, {
            headers: {
                Origin: 'https://untrusted.example',
                Authorization: 'Bearer synthetic',
            },
        });
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe('invalid_request');
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(authenticate).not.toHaveBeenCalled();
        expect(store.get).not.toHaveBeenCalled();
    });
    it('requires authentication before loading private job data', async () => {
        const { app, store } = fixture();
        const response = await app.request(`/texts/ai/jobs/${randomUUID()}`);
        expect(response.status).toBe(401);
        expect((await response.json()).error.code).toBe(
            'authentication_required',
        );
        expect(store.get).not.toHaveBeenCalled();
    });
    it('maps reservation exhaustion to the typed payment response', async () => {
        const { app, store } = fixture();
        vi.mocked(store.enqueue).mockRejectedValue(
            new TextsCreditsExhaustedError(),
        );
        const response = await app.request('/texts/ai/detection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer synthetic',
            },
            body: JSON.stringify({
                folderId: randomUUID(),
                operationId: randomUUID(),
                sourceText: 'Hello.',
            }),
        });
        expect(response.status).toBe(402);
        expect((await response.json()).error.code).toBe('ai_credits_exhausted');
    });
});
