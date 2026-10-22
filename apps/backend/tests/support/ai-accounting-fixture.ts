import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../src/infrastructure/database/schema';
import { aiAccountingSettingsRevisionsTable } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { aiProviderPriceRevisionsTable } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { modelPriceRevisionsTable } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/model-price-schema';

/** Synthetic calibration only:20credits action budget, rates yielding1/3 milli per token. */
export async function seedInterviewAccountingFixture(
    database: PostgresJsDatabase<typeof databaseSchema>,
) {
    const at = new Date('2026-01-01T00:00:00.000Z');
    const [settings] = await database
        .select()
        .from(aiAccountingSettingsRevisionsTable)
        .orderBy(desc(aiAccountingSettingsRevisionsTable.version))
        .limit(1);
    const [customerPrice] = await database
        .select()
        .from(modelPriceRevisionsTable)
        .where(
            and(
                eq(modelPriceRevisionsTable.providerId, 'deepseek'),
                eq(modelPriceRevisionsTable.modelId, 'deepseek-flash'),
            ),
        )
        .orderBy(desc(modelPriceRevisionsTable.version))
        .limit(1);
    const [providerPrice] = await database
        .select()
        .from(aiProviderPriceRevisionsTable)
        .where(
            and(
                eq(aiProviderPriceRevisionsTable.providerId, 'deepseek'),
                eq(aiProviderPriceRevisionsTable.modelId, 'deepseek-flash'),
                eq(aiProviderPriceRevisionsTable.meter, 'text-tokens'),
            ),
        )
        .orderBy(desc(aiProviderPriceRevisionsTable.version))
        .limit(1);

    if (
        settings?.defaultMaxCreditsPerAction !== '20' ||
        settings.maxProviderCostUsdPerAction !== '1' ||
        settings.maxProviderCostUsdPerAccountDay !== '1000' ||
        settings.maxProviderCostUsdPerDay !== '10000'
    )
        await database
            .insert(aiAccountingSettingsRevisionsTable)
            .values({
                id: randomUUID(),
                version: (settings?.version ?? 0) + 1,
                defaultMaxCreditsPerAction: '20',
                maxProviderCostUsdPerAction: '1',
                maxProviderCostUsdPerAccountDay: '1000',
                maxProviderCostUsdPerDay: '10000',
                createdAt: at,
                reason: 'Synthetic interview accounting budget calibration',
            })
            .onConflictDoNothing();
    if (
        customerPrice?.rates.inputCreditsPerMillionTokens !== 1000 ||
        customerPrice?.rates.outputCreditsPerMillionTokens !== 3000
    )
        await database
            .insert(modelPriceRevisionsTable)
            .values({
                id: randomUUID(),
                providerId: 'deepseek',
                modelId: 'deepseek-flash',
                meter: 'text-tokens',
                version: (customerPrice?.version ?? 0) + 1,
                rates: {
                    inputCreditsPerMillionTokens: 1000,
                    outputCreditsPerMillionTokens: 3000,
                    creditsPer1000Characters: null,
                    minimumCredits: null,
                    provisional: true,
                },
                createdAt: at,
                reason: 'Synthetic interview customer tariff calibration',
            })
            .onConflictDoNothing();
    if (
        providerPrice?.data.inputUsdPerMillionTokens !== '1' ||
        providerPrice?.data.outputUsdPerMillionTokens !== '3' ||
        providerPrice?.data.cacheReadUsdPerMillionTokens !== '1'
    )
        await database
            .insert(aiProviderPriceRevisionsTable)
            .values({
                id: randomUUID(),
                providerId: 'deepseek',
                modelId: 'deepseek-flash',
                meter: 'text-tokens',
                version: (providerPrice?.version ?? 0) + 1,
                effectiveAt: at,
                createdAt: at,
                data: {
                    providerId: 'deepseek',
                    modelId: 'deepseek-flash',
                    meter: 'text-tokens',
                    inputUsdPerMillionTokens: '1',
                    outputUsdPerMillionTokens: '3',
                    cacheReadUsdPerMillionTokens: '1',
                    cacheWriteUsdPerMillionTokens: null,
                    usdPer1000Characters: null,
                    effectiveAt: at.toISOString(),
                    sourceReference: 'synthetic-interview-provider-price',
                    sourceUrl: null,
                    reason: 'Synthetic reviewed provider rate fixture',
                },
            })
            .onConflictDoNothing();
}
