import { z } from 'zod';
import { AccountingUsdSchema } from './ai-accounting';

const identifier = z.string().trim().min(1).max(200);
const fields = {
    providerId: identifier,
    modelId: identifier,
    meter: z.enum(['text-tokens', 'speech-characters']),
    inputUsdPerMillionTokens: AccountingUsdSchema.nullable(),
    outputUsdPerMillionTokens: AccountingUsdSchema.nullable(),
    cacheReadUsdPerMillionTokens: AccountingUsdSchema.nullable(),
    cacheWriteUsdPerMillionTokens: AccountingUsdSchema.nullable(),
    usdPer1000Characters: AccountingUsdSchema.nullable(),
    effectiveAt: z.string().datetime({ offset: true }),
    sourceReference: identifier,
    sourceUrl: z
        .string()
        .url()
        .max(2000)
        .refine((url) => {
            try {
                const parsed = new URL(url);
                return (
                    parsed.protocol === 'https:' &&
                    !parsed.username &&
                    !parsed.password
                );
            } catch {
                return false;
            }
        }, 'Source URL must use HTTPS without credentials.')
        .nullable(),
    reason: z.string().trim().min(5).max(500),
};
function validMeters(value: {
    meter: string;
    inputUsdPerMillionTokens: string | null;
    outputUsdPerMillionTokens: string | null;
    cacheReadUsdPerMillionTokens: string | null;
    cacheWriteUsdPerMillionTokens: string | null;
    usdPer1000Characters: string | null;
}): boolean {
    return value.meter === 'text-tokens'
        ? value.inputUsdPerMillionTokens !== null &&
              value.outputUsdPerMillionTokens !== null &&
              value.usdPer1000Characters === null
        : value.usdPer1000Characters !== null &&
              value.inputUsdPerMillionTokens === null &&
              value.outputUsdPerMillionTokens === null &&
              value.cacheReadUsdPerMillionTokens === null &&
              value.cacheWriteUsdPerMillionTokens === null;
}
export const ProviderPricePublishRequestSchema = z
    .object({
        ...fields,
        expectedVersion: z.number().int().min(0).max(2147483646),
    })
    .strict()
    .refine(validMeters, { message: 'Rates must match the selected meter.' });
export const ProviderPriceSchema = z
    .object({
        ...fields,
        id: z.string().uuid(),
        version: z.number().int().positive(),
        createdAt: z.string().datetime(),
        createdBy: z.string().uuid().nullable(),
    })
    .strict()
    .refine(validMeters, { message: 'Rates must match the selected meter.' });
export const ProviderPricesResponseSchema = z.object({
    prices: z.array(ProviderPriceSchema),
});
export type ProviderPrice = z.infer<typeof ProviderPriceSchema>;
export type ProviderPricePublishRequest = z.infer<
    typeof ProviderPricePublishRequestSchema
>;
