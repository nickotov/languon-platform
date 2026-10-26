import { z } from 'zod';

export const TextAiProbeKindSchema = z.enum(['quick', 'flow']);
export const TextAiProbeFailureSchema = z.enum([
    'model_retired',
    'authorization_failed',
    'provider_credits_exhausted',
    'rate_limited',
    'timeout',
    'invalid_output',
    'provider_unavailable',
    'execution_unknown',
    'budget_insufficient',
]);
export const TextAiProbeRequestSchema = z
    .object({
        routeId: z.string().min(1).max(240),
        approvedMaximumCostUsd: z
            .string()
            .regex(/^(0|[1-9][0-9]{0,5})(\.[0-9]{1,6})?$/),
        kind: TextAiProbeKindSchema,
        flowId: z.string().min(1).max(80).optional(),
    })
    .strict()
    .refine((value) => value.kind !== 'flow' || !!value.flowId, {
        message: 'Choose a flow to test.',
        path: ['flowId'],
    });
export const TextAiProbeSchema = z.object({
    id: z.uuid(),
    routeId: z.string(),
    kind: TextAiProbeKindSchema,
    flowId: z.string().nullable(),
    state: z.enum(['running', 'passed', 'failed']),
    failure: TextAiProbeFailureSchema.nullable(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    elapsedMs: z.number().int().nonnegative().nullable(),
    firstOutputMs: z.number().int().nonnegative().nullable(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    measurement: z.enum(['measured', 'estimated', 'unknown']),
    providerCostUsd: z.string().nullable(),
    maximumCostUsd: z.string(),
    evidenceExpiresAt: z.iso.datetime().nullable(),
    recoveredAt: z.iso.datetime().nullable().optional(),
});
export const TextAiProbesResponseSchema = z.object({
    probes: z.array(TextAiProbeSchema),
    limits: z.object({
        maximumCostUsd: z.string(),
        dailyMaximumCostUsd: z.string(),
        cooldownSeconds: z.number().int(),
        evidenceHours: z.number().int(),
    }),
});
export type TextAiProbeRequest = z.infer<typeof TextAiProbeRequestSchema>;
export type TextAiProbe = z.infer<typeof TextAiProbeSchema>;
export type TextAiProbeFailure = z.infer<typeof TextAiProbeFailureSchema>;

export const TextAiProbeRecoveryRequestSchema = z
    .object({
        reason: z.string().trim().min(10).max(500),
        confirmedUpstreamStopped: z.literal(true),
    })
    .strict();
export type TextAiProbeRecoveryRequest = z.infer<
    typeof TextAiProbeRecoveryRequestSchema
>;
