import { describe, expect, it, vi } from 'vitest';
import type { AuthenticationService } from '../../../../src/modules/authentication/application/authentication-service';
import type { AccessTokenSigner } from '../../../../src/modules/authentication/application/ports/access-token';
import { AuthHttpPolicy } from '../../../../src/modules/authentication/interface/http/auth-http-policy';
import type { TextAiPreferenceService } from '../../../../src/modules/text-ai/application/text-ai-preference-service';
import {
    TextAiModelUnavailableError,
    TextAiPreferenceConflictError,
    TextAiUserUnavailableError,
} from '../../../../src/modules/text-ai/domain/text-ai-preference-store';
import { createTextAiRoutes } from '../../../../src/modules/text-ai/interface/http/text-ai.routes';

function harness() {
    const userId = '0198a941-8ace-7115-aec6-d2b594aaee06';
    const requireActiveSession = vi.fn(async () => ({}));
    const preference = {
        mode: 'auto' as const,
        modelId: null,
        version: 0,
        selectedModel: null,
    };
    const get = vi.fn(async () => preference);
    const update = vi.fn(async () => ({ ...preference, version: 1 }));
    const models = vi.fn(async () => ({ defaultModelId: null, models: [] }));
    const app = createTextAiRoutes({
        accessTokens: {
            verify: async () => ({ userId, sessionId: 'session' }),
        } as unknown as AccessTokenSigner,
        authentication: {
            requireActiveSession,
        } as unknown as AuthenticationService,
        policy: new AuthHttpPolicy({
            allowedOrigins: ['https://app.languon.example'],
            appEnvironment: 'production',
            refreshTokenTtlSeconds: 1209600,
        }),
        preferences: {
            get,
            update,
            models,
        } as unknown as TextAiPreferenceService,
    });
    const request = (
        method: string,
        path: string,
        body?: unknown,
        origin = 'https://app.languon.example',
    ) =>
        app.request(path, {
            method,
            headers: {
                Authorization: 'Bearer header.payload.signature',
                'Content-Type': 'application/json',
                Origin: origin,
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    return { app, request, get, update, models, requireActiveSession, userId };
}
describe('text AI authenticated HTTP routes', () => {
    it('authenticates reads and derives preference identity from verified claims', async () => {
        const { request, get, models, requireActiveSession, userId } =
            harness();
        expect(
            (await request('GET', '/users/me/ai-model-preference')).status,
        ).toBe(200);
        expect((await request('GET', '/text-ai/models')).status).toBe(200);
        expect(get).toHaveBeenCalledWith(userId);
        expect(models).toHaveBeenCalledWith(userId);
        expect(requireActiveSession).toHaveBeenCalledWith({
            userId,
            sessionId: 'session',
        });
    });
    it('rejects missing authentication, foreign identity, invalid modes and hostile origins', async () => {
        const { app, request, update } = harness();
        expect((await app.request('/text-ai/models')).status).toBe(401);
        for (const body of [
            { mode: 'auto', expectedVersion: 0, userId: 'foreign' },
            { mode: 'auto', modelId: 'deepseek-chat', expectedVersion: 0 },
            { mode: 'explicit', expectedVersion: 0 },
            { mode: 'auto', expectedVersion: -1 },
        ])
            expect(
                (await request('PUT', '/users/me/ai-model-preference', body))
                    .status,
            ).toBe(400);
        expect(
            (
                await request(
                    'PUT',
                    '/users/me/ai-model-preference',
                    { mode: 'auto', expectedVersion: 0 },
                    'https://hostile.example',
                )
            ).status,
        ).toBe(403);
        expect(update).not.toHaveBeenCalled();
    });
    it('updates only the authenticated learner and provides PUT preflight', async () => {
        const { request, update, userId } = harness();
        const response = await request('PUT', '/users/me/ai-model-preference', {
            mode: 'auto',
            expectedVersion: 0,
        });
        expect(response.status).toBe(200);
        expect(update).toHaveBeenCalledWith(userId, {
            mode: 'auto',
            expectedVersion: 0,
        });
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        const preflight = await request(
            'OPTIONS',
            '/users/me/ai-model-preference',
        );
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain(
            'PUT',
        );
    });
    it.each([
        [new TextAiPreferenceConflictError(), 409, 'conflict'],
        [new TextAiModelUnavailableError(), 409, 'model_unavailable'],
        [new TextAiUserUnavailableError(), 401, 'authentication_required'],
    ])('maps %s to an actionable error', async (error, status, code) => {
        const { request, update } = harness();
        update.mockRejectedValueOnce(error);
        const response = await request('PUT', '/users/me/ai-model-preference', {
            mode: 'auto',
            expectedVersion: 0,
        });
        expect(response.status).toBe(status);
        await expect(response.json()).resolves.toMatchObject({
            error: { code },
        });
    });
});
