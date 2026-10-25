import { describe, expect, it, vi } from 'vitest';
import type { AuthenticationService } from '../../../../../src/modules/authentication/application/authentication-service';
import type { AccessTokenSigner } from '../../../../../src/modules/authentication/application/ports/access-token';
import { AuthenticationRequiredError } from '../../../../../src/modules/authentication/application/authentication-errors';
import { AuthHttpPolicy } from '../../../../../src/modules/authentication/interface/http/auth-http-policy';
import { LearnerAiCreditBalanceService } from '../../../../../src/modules/ai-credits/application/learner-ai-credit-balance';
import { createLearnerAiCreditBalanceRoutes } from '../../../../../src/modules/ai-credits/interface/http/learner-ai-credit-balance.routes';

function harness() {
    const accountSummary = vi.fn(async () => ({
        availableCredits: 20125n,
        consumedCredits: 999n,
        managementVersion: 3,
        nextExpirationAt: null,
        reservedCredits: 5000n,
        policy: {
            configuredMode: 'limited' as 'limited' | 'unlimited',
            effectiveMode: 'limited' as 'limited' | 'unlimited',
            unlimitedUntil: null,
        },
    }));
    const requireActiveSession = vi.fn(async () => ({}));
    const app = createLearnerAiCreditBalanceRoutes({
        balances: new LearnerAiCreditBalanceService({ accountSummary }),
        accessTokens: {
            verify: async () => ({
                userId: 'learner-a',
                sessionId: 'session-a',
            }),
        } as unknown as AccessTokenSigner,
        authentication: {
            requireActiveSession,
        } as unknown as AuthenticationService,
        policy: new AuthHttpPolicy({
            allowedOrigins: ['https://app.example'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 100,
        }),
    });
    const request = (
        path = '/users/me/ai-credits',
        origin = 'https://app.example',
    ) =>
        app.request(path, {
            headers: {
                Authorization: 'Bearer header.payload.signature',
                Origin: origin,
            },
        });
    return { app, request, accountSummary, requireActiveSession };
}

describe('learner credit balance HTTP boundary', () => {
    it('returns only the exact available balance for the verified active learner', async () => {
        const h = harness();
        const response = await h.request();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            mode: 'limited',
            availableCredits: '20.125',
        });
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(h.accountSummary).toHaveBeenCalledWith(
            'learner-a',
            expect.any(Date),
        );
        expect(h.requireActiveSession).toHaveBeenCalledWith({
            userId: 'learner-a',
            sessionId: 'session-a',
        });
    });
    it.each([
        [0n, '0'],
        [1n, '0.001'],
        [9007199254740991n, '9007199254740.991'],
    ] as const)(
        'preserves %s milli-credits exactly',
        async (amount, expected) => {
            const h = harness();
            const summary = await h.accountSummary();
            h.accountSummary.mockResolvedValueOnce({
                ...summary,
                availableCredits: amount,
            });
            expect(await (await h.request()).json()).toEqual({
                mode: 'limited',
                availableCredits: expected,
            });
        },
    );
    it('uses effective unlimited policy and hides finite wallet amounts', async () => {
        const h = harness();
        const summary = await h.accountSummary();
        h.accountSummary.mockResolvedValueOnce({
            ...summary,
            policy: { ...summary.policy, effectiveMode: 'unlimited' },
        });
        expect(await (await h.request()).json()).toEqual({
            mode: 'unlimited',
            availableCredits: null,
        });
    });
    it('rejects missing and inactive authentication before reading the wallet', async () => {
        const h = harness();
        expect((await h.app.request('/users/me/ai-credits')).status).toBe(401);
        h.requireActiveSession.mockRejectedValueOnce(
            new AuthenticationRequiredError(),
        );
        expect((await h.request()).status).toBe(401);
        expect(h.accountSummary).not.toHaveBeenCalled();
    });
    it('rejects supplied account selectors and hostile origins without reading any balance', async () => {
        const h = harness();
        expect(
            (await h.request('/users/me/ai-credits?ownerId=learner-b')).status,
        ).toBe(400);
        expect(
            (await h.request('/users/me/ai-credits', 'https://hostile.example'))
                .status,
        ).toBe(403);
        expect(h.accountSummary).not.toHaveBeenCalled();
    });
    it('returns sanitized errors instead of a fabricated zero', async () => {
        const h = harness();
        h.accountSummary.mockRejectedValueOnce(
            new Error('private database detail'),
        );
        const response = await h.request();
        expect(response.status).toBe(500);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        const body = await response.json();
        expect(body.error.code).toBe('internal_error');
        expect(JSON.stringify(body)).not.toContain('private database detail');
        expect(body).not.toHaveProperty('availableCredits');
    });
    it('supports permitted browser preflight', async () => {
        const h = harness();
        const response = await h.app.request('/users/me/ai-credits', {
            method: 'OPTIONS',
            headers: { Origin: 'https://app.example' },
        });
        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
            'GET, OPTIONS',
        );
    });
});
