import { describe, expect, it, vi } from 'vitest';
import type { AdministrationService } from '../../../../../../src/modules/administration/application/administration-service';
import type { TextAiProbeService } from '../../../../../../src/modules/text-ai/application/text-ai-probe-service';
import { TextAiProbeUnavailableError } from '../../../../../../src/modules/text-ai/application/ports/text-ai-probe-store';
import { createAdministrationRoutes } from '../../../../../../src/modules/administration/interface/http/administration.routes';
import { AdministrationHttpError } from '../../../../../../src/modules/administration/interface/http/administration-http-error';
import { AuthHttpPolicy } from '../../../../../../src/modules/authentication/interface/http/auth-http-policy';
import type { AuthenticationHttpOperations } from '../../../../../../src/modules/authentication/interface/http/authentication-http-operations';
import type { PasskeyHttpOperations } from '../../../../../../src/modules/authentication/interface/http/passkey-http-operations';
const origin = 'http://localhost:3001';
const actor = {
    id: '0198c400-25ee-768b-8832-e06d47b174a9',
    primaryEmail: 'owner@example.test',
    role: 'owner',
};
function setup() {
    const authorizeOperation = vi.fn(async () => ({
        actor,
        sessionId: 'session',
    }));
    const authorizeSensitiveOperation = vi.fn(async () => ({
        actor,
        sessionId: 'session',
    }));
    const run = vi.fn(async () => ({
        id: '0198c400-655c-7b8a-aa46-29a1e2652e62',
    }));
    const recover = vi.fn(async () => ({
        id: '0198c400-655c-7b8a-aa46-29a1e2652e62',
    }));
    const list = vi.fn(async () => ({
        probes: [],
        limits: {
            maximumCostUsd: '0.01',
            dailyMaximumCostUsd: '0.10',
            cooldownSeconds: 10,
            evidenceHours: 24,
        },
    }));
    const app = createAdministrationRoutes({
        administration: {
            authorizeOperation,
            authorizeSensitiveOperation,
        } as unknown as AdministrationService,
        authentication: {} as AuthenticationHttpOperations,
        passkeys: {} as PasskeyHttpOperations,
        policy: new AuthHttpPolicy({
            allowedOrigins: [origin],
            appEnvironment: 'development',
            refreshCookieNamespace: 'admin',
            refreshTokenTtlSeconds: 86400,
        }),
        textAiProbes: { run, list, recover } as unknown as TextAiProbeService,
    });
    const post = (
        body: unknown,
        headers: Record<string, string> = {
            Origin: origin,
            Authorization: 'Bearer header.payload.signature',
        },
    ) =>
        app.request('/admin/ai-settings/probes', {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify(body),
        });
    return {
        app,
        post,
        run,
        list,
        recover,
        authorizeOperation,
        authorizeSensitiveOperation,
    };
}
describe('admin synthetic model checks HTTP boundary', () => {
    it('requires recent owner authentication before operator spending', async () => {
        const fixture = setup();
        fixture.authorizeSensitiveOperation.mockRejectedValueOnce(
            new AdministrationHttpError(
                'recent_authentication_required',
                'Recent sign-in required.',
                403,
            ),
        );
        const response = await fixture.post({
            routeId: 'deepseek/deepseek-flash',
            approvedMaximumCostUsd: '0.01',
            kind: 'quick',
        });
        expect(response.status).toBe(403);
        expect(fixture.run).not.toHaveBeenCalled();
    });
    it('passes verified admin identity and validated input, never caller identity', async () => {
        const fixture = setup();
        expect(
            (
                await fixture.post({
                    routeId: 'deepseek/deepseek-flash',
                    approvedMaximumCostUsd: '0.01',
                    kind: 'flow',
                    flowId: 'sentence-check',
                })
            ).status,
        ).toBe(200);
        expect(fixture.run).toHaveBeenCalledWith(actor.id, {
            routeId: 'deepseek/deepseek-flash',
            approvedMaximumCostUsd: '0.01',
            kind: 'flow',
            flowId: 'sentence-check',
        });
        expect(
            (
                await fixture.post({
                    routeId: 'deepseek/deepseek-flash',
                    approvedMaximumCostUsd: '0.01',
                    kind: 'quick',
                    actorId: 'forged',
                })
            ).status,
        ).toBe(400);
        expect(fixture.run).toHaveBeenCalledTimes(1);
    });
    it('rejects missing authorization and missing origin before dispatch', async () => {
        const fixture = setup();
        expect(
            (
                await fixture.post(
                    {
                        routeId: 'deepseek/deepseek-flash',
                        approvedMaximumCostUsd: '0.01',
                        kind: 'quick',
                    },
                    { Origin: origin },
                )
            ).status,
        ).toBe(401);
        expect(
            (
                await fixture.post(
                    {
                        routeId: 'deepseek/deepseek-flash',
                        approvedMaximumCostUsd: '0.01',
                        kind: 'quick',
                    },
                    { Authorization: 'Bearer header.payload.signature' },
                )
            ).status,
        ).toBe(403);
        expect(fixture.run).not.toHaveBeenCalled();
    });
    it('lists checks without spending and maps caps into actionable safe errors', async () => {
        const fixture = setup();
        expect(
            (
                await fixture.app.request('/admin/ai-settings/probes', {
                    headers: {
                        Authorization: 'Bearer header.payload.signature',
                    },
                })
            ).status,
        ).toBe(200);
        expect(fixture.authorizeOperation).toHaveBeenCalledOnce();
        expect(fixture.run).not.toHaveBeenCalled();
        fixture.run.mockRejectedValueOnce(
            new TextAiProbeUnavailableError('probe_limit_reached'),
        );
        const response = await fixture.post({
            routeId: 'deepseek/deepseek-flash',
            approvedMaximumCostUsd: '0.01',
            kind: 'quick',
        });
        expect(response.status).toBe(429);
        expect(await response.json()).toMatchObject({
            error: {
                code: 'probe_limit_reached',
                message:
                    'The daily model-check spending limit has been reached.',
            },
        });
    });
    it('requires explicit upstream-stop attestation and recent owner auth for recovery', async () => {
        const fixture = setup();
        const request = (body: unknown) =>
            fixture.app.request(
                '/admin/ai-settings/probes/0198c400-655c-7b8a-aa46-29a1e2652e62/recover',
                {
                    method: 'POST',
                    headers: {
                        Origin: origin,
                        Authorization: 'Bearer header.payload.signature',
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify(body),
                },
            );
        expect(
            (
                await request({
                    reason: 'Confirmed provider has stopped.',
                    confirmedUpstreamStopped: false,
                })
            ).status,
        ).toBe(400);
        expect(fixture.recover).not.toHaveBeenCalled();
        fixture.authorizeSensitiveOperation.mockRejectedValueOnce(
            new AdministrationHttpError(
                'recent_authentication_required',
                'Recent sign-in required.',
                403,
            ),
        );
        expect(
            (
                await request({
                    reason: 'Confirmed provider has stopped.',
                    confirmedUpstreamStopped: true,
                })
            ).status,
        ).toBe(403);
        expect(fixture.recover).not.toHaveBeenCalled();
        expect(
            (
                await request({
                    reason: 'Confirmed provider has stopped.',
                    confirmedUpstreamStopped: true,
                })
            ).status,
        ).toBe(200);
        expect(fixture.recover).toHaveBeenCalledWith(
            actor.id,
            '0198c400-655c-7b8a-aa46-29a1e2652e62',
            {
                reason: 'Confirmed provider has stopped.',
                confirmedUpstreamStopped: true,
            },
        );
        expect(fixture.run).not.toHaveBeenCalled();
    });
});
