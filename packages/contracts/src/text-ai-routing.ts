import { z } from 'zod';
import { CreditAmountNumberSchema } from './ai-credit-amount';

export const TextAiFlowIdSchema = z.enum([
    'single-card',
    'card-authoring',
    'pasted-terms',
    'import-pairs',
    'document-terms',
    'sentence-generation',
    'sentence-check',
    'text-detection',
    'text-translation',
    'text-selection-card',
    'conversation',
    'portrait-interview',
]);
export type TextAiFlowId = z.infer<typeof TextAiFlowIdSchema>;
export const TextAiRouteIdSchema = z
    .string()
    .min(3)
    .max(240)
    .regex(/^[a-z][a-z0-9-]*\/[^\s]+$/);
export const TextAiRoutePolicySchema = z
    .object({
        primaryRouteId: TextAiRouteIdSchema,
        fallbackRouteIds: z.array(TextAiRouteIdSchema).max(4),
    })
    .strict()
    .superRefine((value, context) => {
        const ids = [value.primaryRouteId, ...value.fallbackRouteIds];
        if (new Set(ids).size !== ids.length)
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Routes must be unique.',
            });
    });
export const TextAiFlowTariffSchema = z
    .object({
        inputCreditsPerMillionTokens: CreditAmountNumberSchema,
        outputCreditsPerMillionTokens: CreditAmountNumberSchema,
        cachedInputCreditsPerMillionTokens:
            CreditAmountNumberSchema.nullable().optional(),
    })
    .strict();
export const TextAiRoutingConfigurationSchema = z
    .object({
        default: TextAiRoutePolicySchema,
        overrides: z.partialRecord(TextAiFlowIdSchema, TextAiRoutePolicySchema),
        enabledRouteIds: z.array(TextAiRouteIdSchema).max(32),
        flowTariffs: z.partialRecord(
            TextAiFlowIdSchema,
            TextAiFlowTariffSchema,
        ),
    })
    .strict();
export type TextAiRoutingConfiguration = z.infer<
    typeof TextAiRoutingConfigurationSchema
>;
export const TextAiRoutingRevisionSchema = z.object({
    id: z.string().uuid(),
    version: z.number().int().positive(),
    createdAt: z.string().datetime(),
    configuration: TextAiRoutingConfigurationSchema,
});
export const TextAiRoutingCatalogEntrySchema = z.object({
    routeId: TextAiRouteIdSchema,
    label: z.string(),
    providerId: z.string(),
    modelId: z.string(),
    configured: z.boolean(),
    retired: z.boolean(),
    supportedFlows: z.array(TextAiFlowIdSchema),
    processingEligible: z.boolean(),
    runtimeHealth: z
        .object({
            reason: z.enum([
                'model_retired',
                'model_unavailable',
                'authorization_failed',
                'invalid_output',
                'rate_limited',
                'provider_credits_exhausted',
                'provider_unavailable',
                'schema_incompatible',
                'request_rejected',
            ]),
            observedAt: z.string().datetime(),
        })
        .nullable()
        .optional(),
});
export const TextAiRoutingResponseSchema = z.object({
    revision: TextAiRoutingRevisionSchema.nullable(),
    catalog: z.array(TextAiRoutingCatalogEntrySchema),
});
export const TextAiRoutingPublishRequestSchema = z
    .object({
        expectedVersion: z.number().int().nonnegative(),
        configuration: TextAiRoutingConfigurationSchema,
        reason: z.string().trim().min(3).max(500),
    })
    .strict();
export type TextAiRoutingRevision = z.infer<typeof TextAiRoutingRevisionSchema>;
export type TextAiRoutingPublishRequest = z.infer<
    typeof TextAiRoutingPublishRequestSchema
>;

export const TextAiRoutingDisableRequestSchema = z
    .object({
        expectedVersion: z.number().int().positive(),
        routeId: TextAiRouteIdSchema,
        reason: z.string().trim().min(3).max(500),
    })
    .strict();
export type TextAiRoutingDisableRequest = z.infer<
    typeof TextAiRoutingDisableRequestSchema
>;
