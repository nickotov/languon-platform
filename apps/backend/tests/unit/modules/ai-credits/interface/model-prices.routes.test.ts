import { describe, expect, it, vi } from 'vitest';
import { createModelPriceRoutes } from '../../../../../src/modules/ai-credits/interface/http/model-prices.routes';
import { AuthHttpPolicy } from '../../../../../src/modules/authentication/interface/http/auth-http-policy';

describe('model tariff publication rollout gate', () => {
    it('rejects publication before any database mutation when the deployment gate is disabled', async () => {
        const transaction = vi.fn();
        const authorizeSensitiveOperation = vi
            .fn()
            .mockResolvedValue({
                actor: { id: '11111111-1111-4111-8111-111111111111' },
                sessionId: '22222222-2222-4222-8222-222222222222',
            });
        const app = createModelPriceRoutes({
            database: { transaction } as unknown as Parameters<
                typeof createModelPriceRoutes
            >[0]['database'],
            administration: {
                authorizeSensitiveOperation,
            } as unknown as Parameters<
                typeof createModelPriceRoutes
            >[0]['administration'],
            policy: new AuthHttpPolicy({
                allowedOrigins: ['http://localhost:3001'],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
            publishingEnabled: false,
        });
        const response = await app.request('/admin/ai/model-prices', {
            method: 'POST',
            headers: {
                Origin: 'http://localhost:3001',
                Authorization: 'Bearer fake.local.token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                providerId: 'kie',
                modelId: 'elevenlabs/text-to-speech-turbo-2-5',
                meter: 'speech-characters',
                expectedVersion: 1,
                creditsPer1000Characters: 100,
                minimumCredits: 1,
                inputCreditsPerMillionTokens: null,
                outputCreditsPerMillionTokens: null,
                provisional: true,
                reason: 'Verify safe deployment gate',
            }),
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({
            error: { code: 'access_denied' },
        });
        expect(authorizeSensitiveOperation).toHaveBeenCalledOnce();
        expect(transaction).not.toHaveBeenCalled();
    });
});
