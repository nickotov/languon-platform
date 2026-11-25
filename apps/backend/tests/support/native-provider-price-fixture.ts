import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from '@languon/database';
import type { databaseSchema } from '../../src/infrastructure/database/schema';
import { aiProviderPriceRevisionsTable as providerPrices } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { textAiModelCatalog } from '../../src/modules/text-ai/application/text-ai-provider-catalog';

export const nativeGeminiFixture = textAiModelCatalog.find(
    (item) =>
        item.providerId === 'openrouter' &&
        item.id === 'google/gemini-3.1-flash-lite',
)!;

/** Synthetic price per million tokens for the deterministic Google endpoint. */
export async function seedNativeGeminiPrice(
    db: PostgresJsDatabase<typeof databaseSchema>,
    rate = '0.1',
) {
    const now = new Date();
    const [previous] = await db
        .select()
        .from(providerPrices)
        .where(
            and(
                eq(providerPrices.providerId, nativeGeminiFixture.providerId),
                eq(providerPrices.modelId, nativeGeminiFixture.id),
            ),
        )
        .orderBy(desc(providerPrices.version))
        .limit(1);

    await db.insert(providerPrices).values({
        ...previous!,
        id: randomUUID(),
        version: previous!.version + 1,
        effectiveAt: now,
        createdAt: now,
        data: {
            ...previous!.data,
            effectiveAt: now.toISOString(),
            inputUsdPerMillionTokens: null,
            outputUsdPerMillionTokens: null,
            cacheReadUsdPerMillionTokens: null,
            cacheWriteUsdPerMillionTokens: null,
            nativeRules: {
                version: 1,
                validFrom: now.toISOString(),
                validUntil: null,
                variants: [
                    {
                        id: 'google',
                        applies: {
                            endpointIds: ['google'],
                            serviceTiers: ['standard'],
                        },
                        components: (
                            ['inputTokens', 'outputTokens'] as const
                        ).map((meter) => ({
                            meter,
                            pricePerUnit: rate,
                            unitQuantity: 1000000,
                            chargeWhen: 'positive-usage' as const,
                        })),
                    },
                ],
            },
        },
    });
}
