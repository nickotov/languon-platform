import { z } from 'zod';
import { AdminReasonSchema } from './admin/primitives';
import { parseCreditMilli } from './ai-credit-amount';
import { ProviderPriceSchema } from './ai-provider-prices';

export const KNOWLEDGE_TRANSCRIPTION_PROCESSING_REVISION =
    'openai-audio-transcriptions:2026-10-29' as const;

const creditRate = z.string().refine((value) => {
    try {
        parseCreditMilli(value);
        return true;
    } catch {
        return false;
    }
}, 'Use exact credits with at most three decimal places.');
export const KnowledgeTranscriptionAdminConfigSchema = z
    .object({
        enabled: z.boolean(),
        /** Pin supplied by a reviewed code release, never an administrator attestation. */
        processingControlsRevision: z
            .string()
            .regex(/^[a-z0-9][a-z0-9:._-]{0,127}$/u)
            .nullable()
            .default(null),
        dataSharingDisabled: z.boolean().default(false),
        dataSharingEvidence: z
            .string()
            .trim()
            .min(5)
            .max(2000)
            .nullable()
            .default(null),
        providerPriceRevisionId: z.uuid().nullable(),
        creditsPerMinute: creditRate.nullable(),
        maximumDurationMs: z.number().int().min(1).max(1_800_000),
        maximumBytes: z.number().int().min(1).max(5_242_880),
        maximumProviderCostMicros: z.number().int().min(1).max(2_147_483_647),
        billingRulesVerified: z.boolean(),
        billingEvidence: z.string().trim().min(5).max(2000).nullable(),
    })
    .strict()
    .superRefine((value, ctx) => {
        if (
            value.enabled &&
            (!value.providerPriceRevisionId ||
                value.creditsPerMinute === null ||
                !value.billingRulesVerified ||
                !value.billingEvidence)
        )
            ctx.addIssue({
                code: 'custom',
                message:
                    'Enabling requires a reviewed provider price, customer tariff and billing evidence.',
            });
    });
export const KnowledgeTranscriptionAdminRevisionSchema =
    KnowledgeTranscriptionAdminConfigSchema.safeExtend({
        id: z.uuid(),
        version: z.number().int().positive(),
        createdBy: z.uuid().nullable(),
        createdAt: z.iso.datetime(),
        dataSharingAttestedAt: z.iso.datetime().nullable(),
        reason: AdminReasonSchema,
    });
export const KnowledgeTranscriptionAdminReadinessSchema = z
    .object({
        ready: z.boolean(),
        credentialsConfigured: z.boolean(),
        reasons: z.array(
            z.enum([
                'disabled',
                'execution_unavailable',
                'credentials_missing',
                'provider_price_missing',
                'provider_price_invalid',
                'billing_unverified',
                'processing_controls_unapproved',
                'data_sharing_unverified',
                'data_sharing_attestation_expired',
                'processing_credentials_changed',
                'tariff_missing',
                'provider_bound_unavailable',
                'provider_budget_exceeded',
            ]),
        ),
        boundedProviderCostMicros: z.string().regex(/^\d+$/u).nullable(),
    })
    .strict();
export const KnowledgeTranscriptionAdminStateSchema = z
    .object({
        version: z.number().int().nonnegative(),
        current: KnowledgeTranscriptionAdminRevisionSchema.nullable(),
        readiness: KnowledgeTranscriptionAdminReadinessSchema,
        prices: z.array(ProviderPriceSchema).max(500),
        providerId: z.literal('openai'),
        modelId: z.literal('gpt-transcribe'),
    })
    .strict();
export const KnowledgeTranscriptionAdminPreviewRequestSchema = z
    .object({
        revisionId: z.uuid(),
        expectedVersion: z.number().int().min(0).max(2_147_483_646),
        config: KnowledgeTranscriptionAdminConfigSchema,
        reason: AdminReasonSchema,
    })
    .strict();
const proof = z
    .object({
        expiresAt: z.iso.datetime(),
        signature: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    })
    .strict();
export const KnowledgeTranscriptionAdminPreviewSchema = z
    .object({
        request: KnowledgeTranscriptionAdminPreviewRequestSchema,
        proof,
        readiness: KnowledgeTranscriptionAdminReadinessSchema,
    })
    .strict();
export const KnowledgeTranscriptionAdminApplyRequestSchema = z
    .object({ request: KnowledgeTranscriptionAdminPreviewRequestSchema, proof })
    .strict();
export type KnowledgeTranscriptionAdminConfig = z.infer<
    typeof KnowledgeTranscriptionAdminConfigSchema
>;
export type KnowledgeTranscriptionAdminRevision = z.infer<
    typeof KnowledgeTranscriptionAdminRevisionSchema
>;
export type KnowledgeTranscriptionAdminReadiness = z.infer<
    typeof KnowledgeTranscriptionAdminReadinessSchema
>;
export type KnowledgeTranscriptionAdminState = z.infer<
    typeof KnowledgeTranscriptionAdminStateSchema
>;
export type KnowledgeTranscriptionAdminPreviewRequest = z.infer<
    typeof KnowledgeTranscriptionAdminPreviewRequestSchema
>;
export type KnowledgeTranscriptionAdminPreview = z.infer<
    typeof KnowledgeTranscriptionAdminPreviewSchema
>;
export type KnowledgeTranscriptionAdminApplyRequest = z.infer<
    typeof KnowledgeTranscriptionAdminApplyRequestSchema
>;
