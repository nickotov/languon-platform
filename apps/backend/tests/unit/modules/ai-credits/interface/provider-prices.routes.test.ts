import { describe, expect, it, vi } from 'vitest';
import { createProviderPriceRoutes } from '../../../../../src/modules/ai-credits/interface/http/provider-prices.routes';
import { AuthHttpPolicy } from '../../../../../src/modules/authentication/interface/http/auth-http-policy';
const request = {
    providerId: 'test',
    modelId: 'fake',
    meter: 'text-tokens',
    inputUsdPerMillionTokens: '0.000001',
    outputUsdPerMillionTokens: '0.000001',
    cacheReadUsdPerMillionTokens: null,
    cacheWriteUsdPerMillionTokens: null,
    usdPer1000Characters: null,
    effectiveAt: '2026-10-22T00:00:00Z',
    sourceReference: 'Synthetic fixture only',
    sourceUrl: null,
    reason: 'Synthetic fixture rate',
    expectedVersion: 0,
};
describe('provider USD rate authorization', () => {
    function setup() {
        const publish = vi.fn().mockResolvedValue({
            ...request,
            id: '11111111-1111-4111-8111-111111111111',
            version: 1,
        });
        const authorizeSensitiveOperation = vi.fn().mockResolvedValue({
            actor: { id: '11111111-1111-4111-8111-111111111111' },
        });
        const app = createProviderPriceRoutes({
            store: { publish, list: vi.fn() },
            administration: {
                authorizeSensitiveOperation,
            } as unknown as Parameters<
                typeof createProviderPriceRoutes
            >[0]['administration'],
            policy: new AuthHttpPolicy({
                allowedOrigins: ['http://localhost:3001'],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
        });
        return { app, publish, authorizeSensitiveOperation };
    }
    it('checks origin before publishing an immutable provider price', async () => {
        const { app, publish, authorizeSensitiveOperation } = setup();
        const response = await app.request(
            '/admin/ai/accounting/provider-prices',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Origin: 'https://untrusted.example',
                    Authorization: 'Bearer fake.local.token',
                },
                body: JSON.stringify(request),
            },
        );
        expect(response.status).toBe(403);
        expect(authorizeSensitiveOperation).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
    });
    it('uses the recently authenticated owner identity for the price audit', async () => {
        const { app, publish, authorizeSensitiveOperation } = setup();
        const response = await app.request(
            '/admin/ai/accounting/provider-prices',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Origin: 'http://localhost:3001',
                    Authorization: 'Bearer fake.local.token',
                },
                body: JSON.stringify(request),
            },
        );
        expect(response.status).toBe(200);
        expect(authorizeSensitiveOperation).toHaveBeenCalledOnce();
        expect(publish).toHaveBeenCalledWith(
            request,
            '11111111-1111-4111-8111-111111111111',
            expect.any(Date),
        );
    });
});
