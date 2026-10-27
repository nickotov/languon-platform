import { z } from 'zod';

/** Frozen authorities: adding a new tool never expands these grants. */
export const adminMcpPermissionSchema = z.enum([
    'users.read',
    'financial-reports.read',
    'providers.read',
    'model-checks.run',
    'routing.write',
    'customer-tariffs.write',
    'provider-prices.write',
    'spending-limits.write',
    'credits.grant',
    'credits.revoke',
]);
export type AdminMcpPermission = z.infer<typeof adminMcpPermissionSchema>;
export const adminMcpReasonSchema = z
    .string()
    .trim()
    .min(5)
    .max(500)
    .refine(
        (value) =>
            !/lmcp_[A-Za-z0-9_-]{43}|\bbearer[ \t]+[A-Za-z0-9._~+/-]+=*/i.test(
                value,
            ),
        'Do not include credentials in audit context.',
    );
const positiveAmount = z
    .string()
    .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/)
    .refine((value) => Number(value) > 0, 'Must be positive');
const creditCeiling = z
    .object({ perOperation: positiveAmount, perDay: positiveAmount })
    .strict();
export const adminMcpLimitsSchema = z
    .object({
        modelChecks: z
            .object({
                perCheckUsd: positiveAmount.default('0.05'),
                perDayUsd: positiveAmount.default('0.5'),
                concurrency: z.number().int().min(1).max(10).default(1),
            })
            .strict()
            .optional(),
        creditGrants: creditCeiling.optional(),
        creditRevocations: creditCeiling.optional(),
        spendingLimits: z
            .object({
                maximumCreditsPerAction: positiveAmount,
                maximumProviderUsdPerAction: positiveAmount,
                maximumProviderUsdPerAccountDay: positiveAmount,
                maximumProviderUsdGloballyDay: positiveAmount,
            })
            .strict()
            .optional(),
    })
    .strict();
export type AdminMcpLimits = z.infer<typeof adminMcpLimitsSchema>;
export const adminMcpIssueTokenSchema = z
    .object({
        name: z.string().trim().min(1).max(80),
        expiresInDays: z.number().int().min(1).max(90).default(30),
        permissions: z
            .array(adminMcpPermissionSchema)
            .max(10)
            .default([
                'users.read',
                'financial-reports.read',
                'providers.read',
            ]),
        limits: adminMcpLimitsSchema.default({}),
        reason: adminMcpReasonSchema,
    })
    .strict()
    .superRefine((value, context) => {
        const required = [
            ['model-checks.run', 'modelChecks'],
            ['credits.grant', 'creditGrants'],
            ['credits.revoke', 'creditRevocations'],
            ['spending-limits.write', 'spendingLimits'],
        ] as const;
        for (const [permission, key] of required) {
            if (value.permissions.includes(permission) && !value.limits[key])
                context.addIssue({
                    code: 'custom',
                    path: ['limits', key],
                    message: 'Explicit finite limits required',
                });
        }
        if (new Set(value.permissions).size !== value.permissions.length)
            context.addIssue({
                code: 'custom',
                path: ['permissions'],
                message: 'Duplicate permission',
            });
    });
export type AdminMcpIssueToken = z.infer<typeof adminMcpIssueTokenSchema>;
export const adminMcpTokenMetadataSchema = z
    .object({
        id: z.uuid(),
        ownerUserId: z.uuid(),
        name: z.string(),
        permissions: z.array(adminMcpPermissionSchema),
        allowedActions: z
            .array(z.string().regex(/^[a-z][a-z0-9.-]{1,99}$/))
            .max(64),
        limits: adminMcpLimitsSchema,
        createdAt: z.iso.datetime(),
        expiresAt: z.iso.datetime(),
        lastUsedAt: z.iso.datetime().nullable(),
        revokedAt: z.iso.datetime().nullable(),
    })
    .strict();
export type AdminMcpTokenMetadata = z.infer<typeof adminMcpTokenMetadataSchema>;
export const adminMcpIssueTokenResponseSchema = z
    .object({ token: adminMcpTokenMetadataSchema, secret: z.string() })
    .strict();
export const adminMcpTokenListResponseSchema = z
    .object({ tokens: z.array(adminMcpTokenMetadataSchema) })
    .strict();
export const adminMcpRevokeTokenSchema = z
    .object({ reason: adminMcpReasonSchema })
    .strict();
export const adminMcpPreviewResponseSchema = z
    .object({
        id: z.uuid(),
        expiresAt: z.iso.datetime(),
        operation: adminMcpPermissionSchema,
        target: z.string(),
        current: z.unknown(),
        proposed: z.unknown(),
        reason: z.string(),
        limits: adminMcpLimitsSchema,
    })
    .strict();
export type AdminMcpPreviewResponse = z.infer<
    typeof adminMcpPreviewResponseSchema
>;

export const adminMcpRevokeTokenResponseSchema = z
    .object({ success: z.literal(true) })
    .strict();

export const adminMcpAuditQuerySchema = z
    .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
    })
    .strict();
export type AdminMcpAuditQuery = z.infer<typeof adminMcpAuditQuerySchema>;
export const adminMcpAuditEventSchema = z
    .object({
        id: z.uuid(),
        tokenId: z.uuid().nullable(),
        actorUserId: z.uuid(),
        action: z.string(),
        target: z.string(),
        outcome: z.enum(['success', 'rejected']),
        reason: z.string(),
        correlationId: z.uuid(),
        metadata: z.record(z.string(), z.unknown()),
        occurredAt: z.iso.datetime(),
    })
    .strict();
export type AdminMcpAuditEvent = z.infer<typeof adminMcpAuditEventSchema>;
export const adminMcpAuditResponseSchema = z
    .object({
        events: z.array(adminMcpAuditEventSchema),
        total: z.number().int().min(0),
        page: z.number().int().min(1),
        pageSize: z.number().int().min(1),
    })
    .strict();
export type AdminMcpAuditResponse = z.infer<typeof adminMcpAuditResponseSchema>;
