import { z } from 'zod';

export const TextAiModelIdSchema = z.string().min(1).max(160);
export const TextAiModelSummarySchema = z
    .object({
        id: TextAiModelIdSchema,
        label: z.string().min(1).max(200),
        enabled: z.boolean(),
        capabilities: z.array(z.string().min(1).max(100)),
        availability: z.enum([
            'available',
            'disabled',
            'unavailable',
            'incompatible',
        ]),
        unavailableReason: z.string().max(300).nullable(),
        creditRates: z
            .object({
                inputCreditsPerMillionTokens: z.number().int().nonnegative(),
                outputCreditsPerMillionTokens: z.number().int().nonnegative(),
            })
            .strict(),
    })
    .strict();
export const TextAiModelsResponseSchema = z
    .object({
        defaultModelId: TextAiModelIdSchema.nullable(),
        models: z.array(TextAiModelSummarySchema),
    })
    .strict();
export const TextAiPreferenceResponseSchema = z
    .object({
        mode: z.enum(['auto', 'explicit']),
        modelId: TextAiModelIdSchema.nullable(),
        version: z.number().int().nonnegative(),
        selectedModel: TextAiModelSummarySchema.nullable(),
    })
    .strict();
export const UpdateTextAiPreferenceRequestSchema = z.discriminatedUnion(
    'mode',
    [
        z
            .object({
                mode: z.literal('auto'),
                expectedVersion: z.number().int().min(0).max(2_147_483_646),
            })
            .strict(),
        z
            .object({
                mode: z.literal('explicit'),
                modelId: TextAiModelIdSchema,
                expectedVersion: z.number().int().min(0).max(2_147_483_646),
            })
            .strict(),
    ],
);
export const TextAiErrorResponseSchema = z
    .object({
        error: z
            .object({
                code: z.enum([
                    'invalid_request',
                    'authentication_required',
                    'forbidden',
                    'conflict',
                    'model_unavailable',
                    'service_unavailable',
                    'internal_error',
                ]),
                message: z.string(),
                correlationId: z.string(),
            })
            .strict(),
    })
    .strict();
export type TextAiModelSummary = z.infer<typeof TextAiModelSummarySchema>;
export type TextAiModelsResponse = z.infer<typeof TextAiModelsResponseSchema>;
export type TextAiPreferenceResponse = z.infer<
    typeof TextAiPreferenceResponseSchema
>;
export type UpdateTextAiPreferenceRequest = z.infer<
    typeof UpdateTextAiPreferenceRequestSchema
>;
