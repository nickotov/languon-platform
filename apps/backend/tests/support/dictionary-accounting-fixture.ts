/** Synthetic managed admission calibration; callers own disposable test safety. */
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../src/infrastructure/database/schema';
import { usersTable } from '../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { capabilityPolicyRevisionsTable } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import {
    dictionaryAiConfigurationTable,
    dictionaryAiConfigurationRevisionsTable,
} from '../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { textAiModelCatalog } from '../../src/modules/text-ai/application/text-ai-provider-catalog';
import { seedLegacyActionFixture } from './legacy-action-fixture';

export async function seedDictionaryAccountingFixture(
    database: PostgresJsDatabase<typeof databaseSchema>,
    at = new Date(),
) {
    await seedLegacyActionFixture(database, '100');
    const [policy] = await database
        .select()
        .from(capabilityPolicyRevisionsTable)
        .where(
            eq(
                capabilityPolicyRevisionsTable.capability,
                'dictionary-generation',
            ),
        )
        .orderBy(desc(capabilityPolicyRevisionsTable.version))
        .limit(1);
    if (policy?.funding !== 'operator')
        await database.insert(capabilityPolicyRevisionsTable).values({
            id: randomUUID(),
            capability: 'dictionary-generation',
            version: (policy?.version ?? 0) + 1,
            funding: 'operator',
            createdAt: at,
            reason: 'Synthetic deterministic dictionary browser operator funding',
        });
    const [active] = await database
        .select()
        .from(dictionaryAiConfigurationTable)
        .where(eq(dictionaryAiConfigurationTable.id, 'global'))
        .limit(1);
    if (active) return;
    const [last] = await database
        .select({ version: dictionaryAiConfigurationRevisionsTable.version })
        .from(dictionaryAiConfigurationRevisionsTable)
        .orderBy(desc(dictionaryAiConfigurationRevisionsTable.version))
        .limit(1);
    const actorId = randomUUID();
    const revisionId = randomUUID();
    const model = textAiModelCatalog.find(
        (candidate) => candidate.id === 'deepseek-flash',
    )!;
    await database.insert(usersTable).values({
        id: actorId,
        status: 'active',
        createdAt: at,
        updatedAt: at,
    });
    await database.insert(dictionaryAiConfigurationRevisionsTable).values({
        id: revisionId,
        createdByUserId: actorId,
        createdAt: at,
        version: (last?.version ?? 0) + 1,
        catalogSnapshot: {
            adapterRevision: model.adapterRevision,
            aggregateBudget: model.aggregateBudget,
            credentialReference: model.credentialReference,
            creditPricing: model.creditPricing,
            enabledModelIds: [model.id],
            modelId: model.id,
            providerId: model.providerId,
            perCallMaxInputTokens: model.perCallMaxInputTokens,
            perCallMaxOutputTokens: model.perCallMaxOutputTokens,
            supportedFormats: [...model.supportedFormats],
        },
    });
    await database.insert(dictionaryAiConfigurationTable).values({
        id: 'global',
        activeRevisionId: revisionId,
        version: (last?.version ?? 0) + 1,
        updatedAt: at,
    });
}
