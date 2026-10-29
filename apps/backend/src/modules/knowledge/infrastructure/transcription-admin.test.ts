import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { KNOWLEDGE_TRANSCRIPTION_PROCESSING_REVISION } from '@languon/contracts';
import type {
    KnowledgeTranscriptionAdminPreviewRequest,
    KnowledgeTranscriptionAdminState,
    ProviderPrice,
} from '@languon/contracts';
import { TranscriptionAdminService } from '../application/transcription-admin-service';
import type { TranscriptionAdminStore } from '../application/transcription-admin-store';
import { TranscriptionAdminProof } from './transcription-admin-proof';
import { transcriptionAdminReadiness } from './transcription-admin-readiness';

const request = (): KnowledgeTranscriptionAdminPreviewRequest => ({
    revisionId: randomUUID(),
    expectedVersion: 0,
    reason: 'Reviewed operator preparation',
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
});
const actor = () => ({
    userId: randomUUID(),
    sessionId: randomUUID(),
    correlationId: randomUUID(),
});
function fixture() {
    const input = request();
    const principal = actor();
    const readiness = transcriptionAdminReadiness(input.config, [], {
        credentialsConfigured: false,
        executionReady: false,
    });
    const state: KnowledgeTranscriptionAdminState = {
        version: 0,
        current: null,
        readiness,
        prices: [],
        providerId: 'openai',
        modelId: 'gpt-transcribe',
    };
    const store = {
        read: vi.fn(async () => state),
        preview: vi.fn(async () => readiness),
        apply: vi.fn(async () => state),
    } satisfies TranscriptionAdminStore;
    return {
        input,
        principal,
        store,
        service: new TranscriptionAdminService(
            store,
            new TranscriptionAdminProof('synthetic-configuration-proof-secret'),
        ),
    };
}
describe('Transcription configuration preview authority', () => {
    it('prepares an explicitly disabled configuration without inventing a tariff or writing', async () => {
        const { input, principal, store, service } = fixture();
        const preview = await service.preview(principal, input);
        expect(preview.request.config.creditsPerMinute).toBeNull();
        expect(preview.request.config.providerPriceRevisionId).toBeNull();
        expect(preview.readiness.ready).toBe(false);
        expect(store.apply).not.toHaveBeenCalled();
    });
    it('binds reviewed values to the exact owner session and rejects tampering', async () => {
        const { input, principal, store, service } = fixture();
        const preview = await service.preview(principal, input);
        await expect(
            service.apply(
                { ...principal, sessionId: randomUUID() },
                { request: input, proof: preview.proof },
            ),
        ).rejects.toThrow('changed');
        await expect(
            service.apply(principal, {
                request: { ...input, reason: 'Unreviewed replacement' },
                proof: preview.proof,
            }),
        ).rejects.toThrow('changed');
        expect(store.apply).not.toHaveBeenCalled();
        await service.apply(principal, {
            request: input,
            proof: preview.proof,
        });
        expect(store.apply).toHaveBeenCalledWith(
            principal,
            input,
            new Date(preview.proof.expiresAt),
        );
    });
    it('invalidates a signed preview after the configured credential rotates without exposing its fingerprint', () => {
        let fingerprint = 'a'.repeat(64);
        const signer = new TranscriptionAdminProof(
            'synthetic-secret',
            () => fingerprint,
        );
        const input = request();
        const principal = actor();
        const expiresAt = new Date(Date.now() + 60_000).toISOString();
        const signature = signer.sign(principal, input, expiresAt);
        expect(signer.verify(principal, input, expiresAt, signature)).toBe(
            true,
        );
        expect(JSON.stringify(input)).not.toContain(fingerprint);
        fingerprint = 'b'.repeat(64);
        expect(signer.verify(principal, input, expiresAt, signature)).toBe(
            false,
        );
    });
    it('requires separate actual-account evidence, renewed credentials and a nonexpired attestation', () => {
        const config = {
            ...request().config,
            processingControlsRevision:
                KNOWLEDGE_TRANSCRIPTION_PROCESSING_REVISION,
            dataSharingDisabled: true,
            dataSharingEvidence: 'Synthetic account review',
        };
        const options = {
            credentialsConfigured: true,
            executionReady: true,
            credentialFingerprint: 'a'.repeat(64),
            attestedCredentialFingerprint: 'a'.repeat(64),
            dataSharingAttestedAt: new Date(),
        };
        expect(
            transcriptionAdminReadiness(
                { ...config, dataSharingDisabled: false },
                [],
                options,
            ).reasons,
        ).toContain('data_sharing_unverified');
        expect(
            transcriptionAdminReadiness(config, [], {
                ...options,
                credentialFingerprint: 'b'.repeat(64),
            }).reasons,
        ).toContain('processing_credentials_changed');
        expect(
            transcriptionAdminReadiness(config, [], {
                ...options,
                dataSharingAttestedAt: new Date(
                    Date.now() - 31 * 24 * 60 * 60_000,
                ),
            }).reasons,
        ).toContain('data_sharing_attestation_expired');
    });
    it('cannot enable without explicit billing evidence and tariff', async () => {
        const { input, principal, service } = fixture();
        await expect(
            service.preview(principal, {
                ...input,
                config: { ...input.config, enabled: true },
            }),
        ).rejects.toThrow();
    });
    it('fails readiness closed when credentials or execution are missing', () => {
        const result = transcriptionAdminReadiness(null, [], {
            credentialsConfigured: false,
            executionReady: false,
        });
        expect(result.ready).toBe(false);
        expect(result.reasons).toEqual(
            expect.arrayContaining([
                'credentials_missing',
                'execution_unavailable',
                'provider_price_missing',
                'tariff_missing',
                'billing_unverified',
            ]),
        );
        expect(result.boundedProviderCostMicros).toBeNull();
    });
    it('uses a pinned native duration rule to enforce the provider expense bound', () => {
        const price: ProviderPrice = {
            id: randomUUID(),
            version: 1,
            providerId: 'openai',
            modelId: 'gpt-transcribe',
            meter: 'audio-duration',
            inputUsdPerMillionTokens: null,
            outputUsdPerMillionTokens: null,
            cacheReadUsdPerMillionTokens: null,
            cacheWriteUsdPerMillionTokens: null,
            usdPer1000Characters: null,
            minimumUsdPerRequest: null,
            effectiveAt: '2026-01-01T00:00:00Z',
            createdAt: '2026-01-01T00:00:00Z',
            createdBy: null,
            sourceReference: 'Synthetic fixture reviewed tariff',
            sourceUrl:
                'https://developers.openai.com/api/docs/models/gpt-transcribe',
            reason: 'Synthetic native duration fixture',
            nativeRules: {
                version: 1,
                validFrom: '2026-01-01T00:00:00Z',
                validUntil: '2027-01-01T00:00:00Z',
                variants: [
                    {
                        id: 'fixture',
                        applies: {},
                        components: [
                            {
                                meter: 'audioInputMilliseconds',
                                pricePerUnit: '0.0045',
                                unitQuantity: 60_000,
                                chargeWhen: 'positive-usage',
                            },
                        ],
                    },
                ],
            },
        };
        const config = {
            ...request().config,
            enabled: true,
            providerPriceRevisionId: price.id,
            creditsPerMinute: '12.345',
            billingRulesVerified: true,
            billingEvidence: 'Synthetic test-only reviewed billing contract',
            processingControlsRevision:
                KNOWLEDGE_TRANSCRIPTION_PROCESSING_REVISION,
            dataSharingDisabled: true,
            dataSharingEvidence: 'Synthetic actual organization opt-in review',
        };
        expect(
            transcriptionAdminReadiness(config, [price], {
                credentialsConfigured: true,
                executionReady: true,
                credentialFingerprint: 'a'.repeat(64),
                attestedCredentialFingerprint: 'a'.repeat(64),
                dataSharingAttestedAt: new Date(),
            }),
        ).toMatchObject({
            ready: true,
            boundedProviderCostMicros: '4500',
            reasons: [],
        });
        expect(
            transcriptionAdminReadiness(
                {
                    ...config,
                    processingControlsRevision: 'admin-attested-approval',
                },
                [price],
                { credentialsConfigured: true, executionReady: true },
            ).reasons,
        ).toContain('processing_controls_unapproved');
        expect(
            transcriptionAdminReadiness(
                { ...config, maximumProviderCostMicros: 4499 },
                [price],
                { credentialsConfigured: true, executionReady: true },
            ).reasons,
        ).toContain('provider_budget_exceeded');
    });
});
