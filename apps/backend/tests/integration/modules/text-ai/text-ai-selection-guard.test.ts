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
import { dictionaryGenerationJobsTable } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
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

const run = describe.runIf(isDatabaseIntegrationEnabled());
const now = new Date('2026-10-04T10:00:00Z');
const context = { now, signal: new AbortController().signal };
const fingerprint = `hmac-sha256:v1:${'A'.repeat(43)}`;
run('selected execution database guards', () => {
    let client: PostgresClient;
    let database: PostgresJsDatabase<typeof databaseSchema>;
    const prior = {
        routing: process.env.DICTIONARY_AI_MANAGED_ROUTING_ENABLED,
        credential: process.env.DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED,
    };
    beforeAll(async () => {
        process.env.DICTIONARY_AI_MANAGED_ROUTING_ENABLED = 'true';
        process.env.DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED = 'true';
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
    it('blocks incapable real SQL claims and every alteration of admission-pinned selection', async () => {
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
        const [admitted] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, jobId));
        expect(admitted?.selectedExecutionVersion).toBe(1);
        expect(admitted?.selectedExecutionSnapshot?.modelId).toBe(selected!.id);
        // Satisfy the older routing guard so the new selected-worker guard alone must reject this SQL claim.
        await expect(
            client.begin(async (sql) => {
                await sql`select set_config('languon.dictionary_ai_routing_revision','1',true), set_config('languon.model_pricing_revision','1',true)`;
                await sql`update dictionary_generation_jobs set execution_state='running', worker_id='incapable-worker', heartbeat_at=${now.toISOString()}::timestamptz, lease_deadline=${new Date(now.getTime() + 1000).toISOString()}::timestamptz where id=${jobId}`;
            }),
        ).rejects.toMatchObject({
            code: '23514',
            message: 'Selected text AI execution requires a capable worker',
        });
        expect(
            (
                await database
                    .select()
                    .from(dictionaryGenerationJobsTable)
                    .where(eq(dictionaryGenerationJobsTable.id, jobId))
            )[0]?.executionState,
        ).toBe('queued');
        await expect(
            client`update dictionary_generation_jobs set selected_execution_snapshot=jsonb_set(selected_execution_snapshot,'{modelId}','"deepseek-flash"'::jsonb) where id=${jobId}`,
        ).rejects.toMatchObject({
            code: '23514',
            message: 'Selected text AI execution is immutable',
        });
        await expect(
            client`update dictionary_generation_jobs set selected_execution_version=null,selected_execution_snapshot=null where id=${jobId}`,
        ).rejects.toMatchObject({
            code: '23514',
            message: 'Selected text AI execution is immutable',
        });
        await expect(
            client`update dictionary_generation_jobs set execution_revision_id=${otherRevisionId} where id=${jobId}`,
        ).rejects.toMatchObject({
            code: '23514',
            message: 'Selected text AI execution is immutable',
        });
        await database
            .delete(textAiPreferencesTable)
            .where(eq(textAiPreferencesTable.userId, ownerId));
        const autoId = randomUUID();
        await new DrizzleDictionaryGenerationStore(database, {
            generate: () => autoId,
        }).enqueue({ ...enqueueInput, idempotencyKey: 'selection-guard-auto' });
        await expect(
            client`update dictionary_generation_jobs set selected_execution_version=1,selected_execution_snapshot=${JSON.stringify(admitted!.selectedExecutionSnapshot)}::jsonb where id=${autoId}`,
        ).rejects.toMatchObject({
            code: '23514',
            message: 'Selected text AI execution is immutable',
        });
        await database
            .delete(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, autoId));
        const claim = await store.claim({
            context,
            globalConcurrency: 2,
            leaseDurationMs: 1000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: 'capable-worker',
            managedRoutingRevision: 1,
            textAiSelectionRevision: 1,
        });
        expect(claim?.id).toBe(jobId);
        expect(claim?.providerExecution).toEqual(
            admitted!.selectedExecutionSnapshot,
        );
        const [after] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, jobId));
        expect(after?.selectedExecutionSnapshot).toEqual(
            admitted!.selectedExecutionSnapshot,
        );
        expect(after?.selectedExecutionVersion).toBe(1);
        expect(after?.executionRevisionId).toBe(revisionId);
    });
});
