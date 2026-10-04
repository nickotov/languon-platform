import { randomUUID } from 'node:crypto';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { DrizzleDictionaryGenerationStore } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-generation-store';
import { DrizzleDictionaryStore } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import { dictionaryGenerationProviderCircuitTable } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { dictionaryGenerationFormat } from '../../../../src/modules/dictionaries/domain/generation';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { textAiModelCatalog } from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { textAiPreferencesTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

import { DictionaryGenerationNotAvailableError } from '../../../../src/modules/dictionaries/application/dictionary-errors';

const run = describe.runIf(isDatabaseIntegrationEnabled());
const now = new Date('2026-10-04T10:00:00Z');
const context = { now, signal: new AbortController().signal };
const fingerprint = `hmac-sha256:v1:${'A'.repeat(43)}`;
run('model-scoped text AI outage circuits', () => {
    let client: PostgresClient;
    let database: PostgresJsDatabase<typeof databaseSchema>;
    const prior = {
        routing: process.env.DICTIONARY_AI_MANAGED_ROUTING_ENABLED,
        credential: process.env.DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED,
        deepseek: process.env.DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED,
    };
    beforeAll(async () => {
        process.env.DICTIONARY_AI_MANAGED_ROUTING_ENABLED = 'true';
        process.env.DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED = 'true';
        process.env.DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED = 'true';
        client = createTestPostgresClient();
        database = createDrizzleDatabase(client, databaseSchema);
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
    });
    afterAll(async () => {
        await client?.end();
        for (const [key, value] of [
            ['DICTIONARY_AI_MANAGED_ROUTING_ENABLED', prior.routing],
            ['DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED', prior.credential],
        ]) {
            if (value === undefined) delete process.env[key!];
            else process.env[key!] = value;
        }
    });
    it('isolates failures and claims by pinned model while Auto and explicit share their actual model circuit', async () => {
        const ownerId = randomUUID();
        const jobId = randomUUID();
        const revisionId = randomUUID();
        const otherRevisionId = randomUUID();
        await database.insert(usersTable).values({
            id: ownerId,
            status: 'active',
            createdAt: now,
            updatedAt: now,
        });
        const [base, selected] = textAiModelCatalog;
        const configuration = {
            adapterRevision: base!.adapterRevision,
            aggregateBudget: base!.aggregateBudget,
            credentialReference: base!.credentialReference,
            creditPricing: base!.creditPricing,
            enabledModelIds: textAiModelCatalog.map((model) => model.id),
            modelId: base!.id,
            perCallMaxInputTokens: base!.perCallMaxInputTokens,
            perCallMaxOutputTokens: base!.perCallMaxOutputTokens,
            providerId: base!.providerId,
            supportedFormats: [...base!.supportedFormats],
        };
        await database.insert(dictionaryAiConfigurationRevisionsTable).values([
            {
                id: revisionId,
                version: 1,
                createdByUserId: ownerId,
                catalogSnapshot: configuration,
            },
            {
                id: otherRevisionId,
                version: 2,
                createdByUserId: ownerId,
                catalogSnapshot: configuration,
            },
        ]);
        await database
            .insert(dictionaryAiConfigurationTable)
            .values({ id: 'global', version: 1, activeRevisionId: revisionId });
        await database.insert(dictionaryAiWorkerObservationsTable).values({
            id: `capable-worker/${selected!.providerId}/${selected!.id}/text-ai-selection:v1`,
            textAiSupportedFormats: [dictionaryGenerationFormat],
            adapterRevision: selected!.adapterRevision,
            checkedAt: now,
            expiresAt: new Date(now.getTime() + 120000),
            message: 'Synthetic ready worker',
            modelId: selected!.id,
            providerId: selected!.providerId,
            status: 'available',
            workerId: 'capable-worker',
            textAiSelectionRevision: 1,
        });
        await database.insert(textAiPreferencesTable).values({
            userId: ownerId,
            mode: 'explicit',
            modelId: selected!.id,
            version: 1,
            createdAt: now,
            updatedAt: now,
        });
        const dictionaryStore = new DrizzleDictionaryStore(database, {
            generate: randomUUID,
        });
        const dictionary = await dictionaryStore.createDictionary({
            context,
            fingerprint,
            idempotencyKey: 'selection-guard-dictionary',
            ownerId,
            request: {
                description: null,
                name: 'Selection guard',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
        });
        const created = await dictionaryStore.createCard({
            context,
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: dictionary.version,
                expectedSettingsVersion: dictionary.settings.version,
                translationContext: null,
                overrides: {
                    definitionEnabled: null,
                    definitionLanguage: null,
                    exampleEnabled: null,
                    exampleLanguage: null,
                    exampleTranslationEnabled: null,
                    transcriptionCustomLabel: null,
                    transcriptionEnabled: null,
                    transcriptionNotation: null,
                },
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    source: 'hello',
                    transcription: null,
                    translation: 'bonjour',
                },
            },
        });
        const store = new DrizzleDictionaryGenerationStore(database, {
            generate: () => jobId,
        });
        const enqueueInput = {
            cardId: created.card.id,
            context,
            dictionaryId: dictionary.id,
            expectedCardVersion: created.card.version,
            expectedDictionaryVersion: created.dictionaryVersion,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint,
            idempotencyKey: 'selection-guard-job',
            instruction: null,
            ownerId,
        };
        await store.enqueue(enqueueInput);
        const kieKey = `${selected!.providerId}/${selected!.id}/${dictionaryGenerationFormat}`;
        const deepseekKey = `${base!.providerId}/${base!.id}/${dictionaryGenerationFormat}`;
        // Two prior failures plus this real failed execution open only Kie's circuit.
        await database.insert(dictionaryGenerationProviderCircuitTable).values({
            id: kieKey,
            consecutiveFailures: 2,
            openUntil: null,
            updatedAt: now,
        });
        const claimOptions = {
            context,
            globalConcurrency: 2,
            leaseDurationMs: 60000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: 'capable-worker',
            managedRoutingRevision: 1 as const,
            textAiSelectionRevision: 1 as const,
        };
        const kieClaim = await store.claim(claimOptions);
        expect(kieClaim?.id).toBe(jobId);
        await store.fail({
            context,
            jobId,
            fencingToken: kieClaim!.fencingToken,
            leaseDeadline: kieClaim!.leaseDeadline,
            workerId: kieClaim!.workerId,
            failureCategory: 'provider_unavailable',
            countProviderFailure: true,
            retryAt: new Date(now.getTime() + 1000),
            providerUsage: { inputTokens: 0, outputTokens: 0 },
        });
        await expect(
            new DrizzleDictionaryGenerationStore(database, {
                generate: randomUUID,
            }).enqueue({ ...enqueueInput, idempotencyKey: 'kie-outage-new' }),
        ).rejects.toBeInstanceOf(DictionaryGenerationNotAvailableError);
        await database
            .delete(textAiPreferencesTable)
            .where(eq(textAiPreferencesTable.userId, ownerId));
        // Auto defaults to DeepSeek. Its new admission and claim must pass even with
        // the older Kie retry at the queue head and a format-only historical outage.
        await database.insert(dictionaryGenerationProviderCircuitTable).values({
            id: dictionaryGenerationFormat,
            consecutiveFailures: 3,
            openUntil: new Date(now.getTime() + 60000),
            updatedAt: now,
        });
        const deepseekId = randomUUID();
        const deepseekStore = new DrizzleDictionaryGenerationStore(database, {
            generate: () => deepseekId,
        });
        await deepseekStore.enqueue({
            ...enqueueInput,
            context: { ...context, now: new Date(now.getTime() + 2000) },
            idempotencyKey: 'deepseek-auto-after-kie-outage',
        });
        const deepseekClaim = await deepseekStore.claim({
            ...claimOptions,
            context: { ...context, now: new Date(now.getTime() + 3000) },
        });
        expect(deepseekClaim?.id).toBe(deepseekId);
        expect(deepseekClaim?.providerExecution?.modelId).toBe(base!.id);
        await deepseekStore.complete({
            context: { ...context, now: new Date(now.getTime() + 4000) },
            jobId: deepseekId,
            fencingToken: deepseekClaim!.fencingToken,
            leaseDeadline: deepseekClaim!.leaseDeadline,
            workerId: deepseekClaim!.workerId,
            proposal: {
                fieldFeedback: [],
                warnings: [],
                candidate: {
                    overrides: created.card.overrides,
                    values: {
                        source: 'hello',
                        translation: 'bonjour',
                        definition: null,
                        example: null,
                        exampleTranslation: null,
                        transcription: null,
                    },
                },
            },
            providerUsage: { inputTokens: 0, outputTokens: 0 },
            reviewExpiresAt: new Date(now.getTime() + 60000),
        });
        const circuits = await database
            .select()
            .from(dictionaryGenerationProviderCircuitTable);
        expect(
            circuits.find((row) => row.id === deepseekKey)?.consecutiveFailures,
        ).toBe(0);
        expect(
            circuits.find((row) => row.id === kieKey)?.consecutiveFailures,
        ).toBe(3);
        expect(
            circuits.find((row) => row.id === kieKey)?.openUntil,
        ).not.toBeNull();
        expect(
            circuits.find((row) => row.id === dictionaryGenerationFormat)
                ?.consecutiveFailures,
        ).toBe(3);
        // Explicit DeepSeek and Auto consult the same immutable actual-model key.
        await database.insert(dictionaryAiWorkerObservationsTable).values({
            id: `capable-worker/${base!.providerId}/${base!.id}/text-ai-selection:v1`,
            adapterRevision: base!.adapterRevision,
            checkedAt: now,
            expiresAt: new Date(now.getTime() + 120000),
            message: 'Synthetic ready worker',
            modelId: base!.id,
            providerId: base!.providerId,
            status: 'available',
            workerId: 'capable-worker',
            textAiSelectionRevision: 1,
            textAiSupportedFormats: [dictionaryGenerationFormat],
        });
        await database
            .update(dictionaryGenerationProviderCircuitTable)
            .set({
                consecutiveFailures: 3,
                openUntil: new Date(now.getTime() + 60000),
            })
            .where(
                eq(dictionaryGenerationProviderCircuitTable.id, deepseekKey),
            );
        await database.insert(textAiPreferencesTable).values({
            userId: ownerId,
            mode: 'explicit',
            modelId: base!.id,
            version: 1,
            createdAt: now,
            updatedAt: now,
        });
        await expect(
            new DrizzleDictionaryGenerationStore(database, {
                generate: randomUUID,
            }).enqueue({
                ...enqueueInput,
                idempotencyKey: 'deepseek-explicit-same-circuit',
            }),
        ).rejects.toBeInstanceOf(DictionaryGenerationNotAvailableError);
        await database
            .delete(textAiPreferencesTable)
            .where(eq(textAiPreferencesTable.userId, ownerId));
        await expect(
            new DrizzleDictionaryGenerationStore(database, {
                generate: randomUUID,
            }).enqueue({
                ...enqueueInput,
                idempotencyKey: 'deepseek-auto-same-circuit',
            }),
        ).rejects.toBeInstanceOf(DictionaryGenerationNotAvailableError);
    });
});
