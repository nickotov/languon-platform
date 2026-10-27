import { z } from 'zod';
import {
    AiAccountingSettingsPublishSchema,
    ModelPricePublishRequestSchema,
    ProviderPricePublishRequestSchema,
    TextAiRoutingPublishRequestSchema,
    TextAiFlowIdSchema,
    TextAiFlowTariffSchema,
} from '@languon/contracts';

const credits = z
    .string()
    .regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/)
    .refine((value) => Number(value) > 0, 'Positive credits required.');
const adjustment = z
    .object({
        targetUserId: z.uuid(),
        expectedVersion: z.number().int().nonnegative(),
        amountCredits: credits,
        expiresAt: z.iso.datetime().nullable().default(null),
        reason: z.string().trim().min(5).max(500),
    })
    .strict();

export const adminMcpWriteSchemas = {
    'routing.write': TextAiRoutingPublishRequestSchema,
    'customer-tariffs.write': ModelPricePublishRequestSchema.or(
        z
            .object({
                flowId: TextAiFlowIdSchema,
                expectedVersion: z.number().int().nonnegative(),
                tariff: TextAiFlowTariffSchema,
                reason: z.string().trim().min(5).max(500),
            })
            .strict(),
    ),
    'provider-prices.write': ProviderPricePublishRequestSchema,
    'spending-limits.write': AiAccountingSettingsPublishSchema.or(
        z
            .object({
                targetUserId: z.uuid(),
                expectedVersion: z.number().int().nonnegative(),
                maxCreditsPerAction: credits,
                reason: z.string().trim().min(5).max(500),
            })
            .strict(),
    ),
    'credits.grant': adjustment,
    'credits.revoke': adjustment.refine(
        (input) => input.expiresAt === null,
        'Revocation cannot have an expiry.',
    ),
} as const;
export type AdminMcpWriteOperation = keyof typeof adminMcpWriteSchemas;

export const adminMcpReportRangeSchema = z
    .object({
        from: z.iso.datetime().optional(),
        to: z.iso.datetime().optional(),
    })
    .strict();
export function reportRange(
    input: z.infer<typeof adminMcpReportRangeSchema>,
    now = new Date(),
) {
    const to = input.to
        ? new Date(input.to)
        : new Date(
              Date.UTC(
                  now.getUTCFullYear(),
                  now.getUTCMonth(),
                  now.getUTCDate() + 1,
              ),
          );
    const from = input.from
        ? new Date(input.from)
        : new Date(to.getTime() - 30 * 86_400_000);
    if (to <= from || to.getTime() - from.getTime() > 366 * 86_400_000)
        throw new Error('Report range must be positive and at most 366 days.');
    return { from, to };
}
export const adminMcpReadSchemas = {
    'users.lookup': z.object({ email: z.email().max(320) }).strict(),
    'users.credits': z
        .object({
            userId: z.uuid(),
            page: z.number().int().min(1).max(1000).default(1),
            pageSize: z.number().int().min(1).max(100).default(25),
        })
        .strict(),
    'financial-reports.global': adminMcpReportRangeSchema,
    'financial-reports.user': adminMcpReportRangeSchema.extend({
        userId: z.uuid(),
        page: z.number().int().min(1).max(1000).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
    }),
    'providers.inspect': z.object({}).strict(),
} as const;
export type AdminMcpReadOperation = keyof typeof adminMcpReadSchemas;
