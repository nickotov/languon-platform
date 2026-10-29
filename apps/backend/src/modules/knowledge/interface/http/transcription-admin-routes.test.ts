import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AdminAccessDeniedError } from '../../../administration/application/administration-errors';
import { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { TranscriptionAdminService } from '../../application/transcription-admin-service';
import type { TranscriptionAdminStore } from '../../application/transcription-admin-store';
import { TranscriptionAdminProof } from '../../infrastructure/transcription-admin-proof';
import { transcriptionAdminReadiness } from '../../infrastructure/transcription-admin-readiness';
import { createTranscriptionAdminRoutes } from './transcription-admin-routes';

function fixture() {
    const principal = {
        actor: {
            id: randomUUID(),
            primaryEmail: 'owner@example.test',
            role: 'owner' as const,
        },
        sessionId: randomUUID(),
    };
    const authorizeOperation = vi.fn(async () => principal);
    const authorizeSensitiveOperation = vi.fn(async () => principal);
    const readiness = {
        ready: false,
        credentialsConfigured: false,
        reasons: ['disabled' as const],
        boundedProviderCostMicros: null,
    };
    const store = {
        read: vi.fn(async () => ({
            version: 0,
            current: null,
            readiness,
            prices: [],
            providerId: 'openai' as const,
            modelId: 'gpt-transcribe' as const,
        })),
        preview: vi.fn<TranscriptionAdminStore['preview']>(
            async () => readiness,
        ),
        apply: vi.fn<TranscriptionAdminStore['apply']>(),
    } satisfies TranscriptionAdminStore;
    const app = createTranscriptionAdminRoutes({
        administration: { authorizeOperation, authorizeSensitiveOperation },
        policy: new AuthHttpPolicy({
            appEnvironment: 'test',
            allowedOrigins: ['http://localhost:4444'],
            refreshTokenTtlSeconds: 3600,
        }),
        service: new TranscriptionAdminService(
            store,
            new TranscriptionAdminProof('synthetic-secret'),
        ),
    });
    return { app, store, authorizeOperation, authorizeSensitiveOperation };
}
const headers = {
    Authorization: 'Bearer synthetic.payload.signature',
    Origin: 'http://localhost:4444',
    'Content-Type': 'application/json',
};
function input() {
    return {
        revisionId: randomUUID(),
        expectedVersion: 0,
        reason: 'Review a disabled configuration',
        config: {
            enabled: false,
            providerPriceRevisionId: null,
            creditsPerMinute: null,
            maximumDurationMs: 60_000,
            maximumBytes: 5_242_880,
            maximumProviderCostMicros: 10_000,
            processingControlsRevision: null,
            dataSharingDisabled: false,
            dataSharingEvidence: null,
            billingRulesVerified: false,
            billingEvidence: null,
        },
    };
}
describe('Transcription owner administration boundary', () => {
    it('requires authentication and active owner authorization before reading configuration', async () => {
        const { app, store, authorizeOperation } = fixture();
        expect((await app.request('/admin/ai/transcription')).status).toBe(401);
        authorizeOperation.mockRejectedValueOnce(new AdminAccessDeniedError());
        expect(
            (await app.request('/admin/ai/transcription', { headers })).status,
        ).toBe(403);
        expect(store.read).not.toHaveBeenCalled();
    });
    it('requires an allowed explicit origin and recent authentication for preview', async () => {
        const { app, store, authorizeSensitiveOperation } = fixture();
        const missingOrigin = {
            Authorization: headers.Authorization,
            'Content-Type': 'application/json',
        };
        expect(
            (
                await app.request('/admin/ai/transcription/preview', {
                    method: 'POST',
                    headers: missingOrigin,
                    body: JSON.stringify(input()),
                })
            ).status,
        ).toBe(403);
        expect(store.preview).not.toHaveBeenCalled();
        const response = await app.request('/admin/ai/transcription/preview', {
            method: 'POST',
            headers,
            body: JSON.stringify(input()),
        });
        expect(response.status).toBe(200);
        expect(authorizeSensitiveOperation).toHaveBeenCalledTimes(1);
        expect(store.apply).not.toHaveBeenCalled();
        expect(response.headers.get('cache-control')).toBe('private, no-store');
    });
    it('reports a code-owned processing approval gap despite a supplied billing attestation', async () => {
        const { app, store } = fixture();
        store.preview.mockImplementationOnce(async (candidate) =>
            transcriptionAdminReadiness(candidate.config, [], {
                credentialsConfigured: true,
                executionReady: true,
            }),
        );
        const request = input();
        const response = await app.request('/admin/ai/transcription/preview', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                ...request,
                config: {
                    ...request.config,
                    enabled: true,
                    providerPriceRevisionId: randomUUID(),
                    creditsPerMinute: '1',
                    billingRulesVerified: true,
                    billingEvidence: 'An administrator reviewed billing',
                    processingControlsRevision: 'admin-attested-approval',
                },
            }),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            readiness: {
                ready: false,
                reasons: expect.arrayContaining([
                    'processing_controls_unapproved',
                ]),
            },
        });
        expect(store.apply).not.toHaveBeenCalled();
    });
    it('rejects a caller-supplied credential fingerprint rather than treating it as account evidence', async () => {
        const { app, store } = fixture();
        const request = input();
        const response = await app.request('/admin/ai/transcription/preview', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                ...request,
                config: {
                    ...request.config,
                    processingCredentialFingerprint: 'a'.repeat(64),
                },
            }),
        });
        expect(response.status).toBe(400);
        expect(store.preview).not.toHaveBeenCalled();
    });
    it('rejects credentials and provider overrides in untrusted configuration input', async () => {
        const { app, store } = fixture();
        const request = input();
        const response = await app.request('/admin/ai/transcription/preview', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                ...request,
                config: {
                    ...request.config,
                    apiKey: 'not-accepted',
                    modelId: 'unapproved-model',
                },
            }),
        });
        expect(response.status).toBe(400);
        expect(store.preview).not.toHaveBeenCalled();
    });
});
