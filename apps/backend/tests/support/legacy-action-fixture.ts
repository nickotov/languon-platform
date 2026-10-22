import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../src/infrastructure/database/schema';
import { aiAccountingSettingsRevisionsTable as settings } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { aiProviderPriceRevisionsTable as prices } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { textAiModelCatalog } from '../../src/modules/text-ai/application/text-ai-provider-catalog';
import { seedInterviewAccountingFixture } from './ai-accounting-fixture';
/** Synthetic cost and customer calibration, never a production economic default. */
export async function seedLegacyActionFixture(
    db: PostgresJsDatabase<typeof databaseSchema>,
    actionBudget = '20',
) {
    await seedInterviewAccountingFixture(db);
    const at = new Date('2026-01-01T00:00:00.000Z');
    const [previous] = await db
        .select()
        .from(settings)
        .orderBy(desc(settings.version))
        .limit(1);
    if (
        previous?.defaultMaxCreditsPerAction !== actionBudget ||
        previous.maxProviderCostUsdPerAction !== '1' ||
        previous.maxProviderCostUsdPerAccountDay !== '1000' ||
        previous.maxProviderCostUsdPerDay !== '10000'
    )
        await db.insert(settings).values({
            id: randomUUID(),
            version: (previous?.version ?? 0) + 1,
            defaultMaxCreditsPerAction: actionBudget,
            maxProviderCostUsdPerAction: '1',
            maxProviderCostUsdPerAccountDay: '1000',
            maxProviderCostUsdPerDay: '10000',
            createdAt: at,
            reason: 'Synthetic whole-action execution allowance calibration',
        });
    for (const model of textAiModelCatalog) {
        const [previousPrice] = await db
            .select()
            .from(prices)
            .where(
                and(
                    eq(prices.providerId, model.providerId),
                    eq(prices.modelId, model.id),
                    eq(prices.meter, 'text-tokens'),
                ),
            )
            .orderBy(desc(prices.version))
            .limit(1);
        if (
            previousPrice &&
            (model.providerId === 'deepseek' ||
                (previousPrice.data.cacheReadUsdPerMillionTokens !== null &&
                    previousPrice.data.cacheWriteUsdPerMillionTokens !== null))
        )
            continue;
        await db.insert(prices).values({
            id: randomUUID(),
            providerId: model.providerId,
            modelId: model.id,
            meter: 'text-tokens',
            version: (previousPrice?.version ?? 0) + 1,
            effectiveAt: at,
            createdAt: at,
            data: {
                providerId: model.providerId,
                modelId: model.id,
                meter: 'text-tokens',
                inputUsdPerMillionTokens: '1',
                outputUsdPerMillionTokens: '3',
                cacheReadUsdPerMillionTokens: '1',
                cacheWriteUsdPerMillionTokens: '1',
                usdPer1000Characters: null,
                effectiveAt: at.toISOString(),
                sourceReference: 'synthetic-whole-action-provider-price',
                sourceUrl: null,
                reason: 'Synthetic reviewed provider rate fixture',
            },
        });
    }
}
