import { randomUUID } from 'node:crypto';
import { fixtureRouteFingerprint } from '../../../support/text-ai-routing-fixture';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { TextAiPreferenceService } from '../../../../src/modules/text-ai/application/text-ai-preference-service';
import { textAiModelCatalog } from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import {
    TextAiModelUnavailableError,
    TextAiPreferenceConflictError,
    TextAiUserUnavailableError,
} from '../../../../src/modules/text-ai/domain/text-ai-preference-store';
import { DrizzleTextAiPreferenceStore } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-preference-store';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { textAiPreferencesTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/schema';
import { textAiCapacityObservationId } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import { readTextAiCatalog } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-catalog-query';
import { publishTextAiWorkerObservations } from '../../../../src/modules/text-ai/infrastructure/ai/text-ai-worker-observations';
import { DrizzleTextAiAdmissionParticipant } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import { TextAiSelectionUnavailableError } from '../../../../src/modules/text-ai/application/text-ai-admission-participant';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'text AI preference persistence and catalog',
    () => {
        let client: PostgresClient;
        let database: PostgresJsDatabase<typeof databaseSchema>;
        let service: TextAiPreferenceService;
        let userId: string;
        const at = new Date('2026-10-04T10:00:00Z');
        beforeAll(async () => {
            client = createTestPostgresClient();
            database = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            service = new TextAiPreferenceService(
                new DrizzleTextAiPreferenceStore(database, {
                    routingEnabled: true,
                    credentialConfigured: () => true,
                    routeFingerprint: fixtureRouteFingerprint,
                }),
            );
        });
        beforeEach(async () => {
            await database.delete(textAiPreferencesTable);
            await database.delete(dictionaryAiConfigurationTable);
            await database.delete(dictionaryAiConfigurationRevisionsTable);
            await database.delete(dictionaryAiWorkerObservationsTable);
            await database.delete(usersTable);
            userId = randomUUID();
            await database
                .insert(usersTable)
                .values({ id: userId, status: 'active' });
            const model = textAiModelCatalog[0]!;
            const revisionId = randomUUID();
            await database
                .insert(dictionaryAiConfigurationRevisionsTable)
                .values({
                    id: revisionId,
                    version: 1,
                    createdByUserId: userId,
                    catalogSnapshot: {
                        ...model,
                        modelId: model.id,
                        enabledModelIds: textAiModelCatalog.map(
                            (candidate) => candidate.id,
                        ),
                        supportedFormats: [...model.supportedFormats],
                    },
                });
            await database.insert(dictionaryAiConfigurationTable).values({
                id: 'global',
                version: 1,
                activeRevisionId: revisionId,
            });
            await database.insert(dictionaryAiWorkerObservationsTable).values(
                textAiModelCatalog.map((candidate) => ({
                    id: textAiCapacityObservationId(
                        'synthetic-worker',
                        candidate.providerId,
                        candidate.id,
                    ),
                    workerId: 'synthetic-worker',
                    providerId: candidate.providerId,
                    modelId: candidate.id,
                    adapterRevision: candidate.adapterRevision,
                    textAiSelectionRevision: 1,
                    textAiCapacityRevision: 1,
                    textAiSupportedFormats: [...candidate.supportedFormats],
                    status: 'available',
                    message: 'synthetic readiness',
                    checkedAt: at,
                    expiresAt: new Date(at.getTime() + 60000),
                })),
            );
        });
        afterAll(async () => {
            await client?.end();
        });
        it('persists exact learner budgets and rejects stale parallel writes', async () => {
            await expect(service.get(userId, at)).resolves.toMatchObject({
                mode: 'auto',
                modelId: null,
                selectedModel: null,
                version: 0,
            });
            const results = await Promise.allSettled(
                ['2.145', '3.125'].map((maxCreditsPerAction) =>
                    service.update(
                        userId,
                        {
                            mode: 'auto',
                            expectedVersion: 0,
                            maxCreditsPerAction,
                        },
                        at,
                    ),
                ),
            );
            expect(
                results.filter((r) => r.status === 'fulfilled'),
            ).toHaveLength(1);
            const rejected = results.find((r) => r.status === 'rejected');
            expect(
                rejected?.status === 'rejected' &&
                    rejected.reason instanceof TextAiPreferenceConflictError,
            ).toBe(true);
            const saved = await service.get(userId, at);
            expect(saved.version).toBe(1);
            expect(['2.145', '3.125']).toContain(saved.maxCreditsPerAction);
        });
        it('redacts old stored identities and preserves their budget without rewriting history', async () => {
            await database.insert(textAiPreferencesTable).values({
                userId,
                mode: 'explicit',
                modelId: 'deepseek-flash',
                version: 3,
                maxCreditsPerAction: '2.145',
            });
            await database.delete(dictionaryAiConfigurationTable);
            await expect(service.get(userId, at)).resolves.toEqual({
                mode: 'auto',
                modelId: null,
                selectedModel: null,
                version: 3,
                maxCreditsPerAction: '2.145',
            });
            await expect(service.models(userId, at)).resolves.toEqual({
                defaultModelId: null,
                models: [],
            });
            const [row] = await database.select().from(textAiPreferencesTable);
            expect(row).toMatchObject({
                mode: 'explicit',
                modelId: 'deepseek-flash',
                version: 3,
            });
            await expect(
                service.update(
                    userId,
                    { mode: 'auto', expectedVersion: 3 },
                    at,
                ),
            ).resolves.toMatchObject({
                version: 4,
                maxCreditsPerAction: '2.145',
            });
        });
        it('rejects a retired default and retired explicit choice without changing history', async () => {
            const model = textAiModelCatalog[0]!;
            await database.update(dictionaryAiConfigurationRevisionsTable).set({
                catalogSnapshot: {
                    ...model,
                    modelId: 'deepseek-chat',
                    enabledModelIds: ['deepseek-chat'],
                    supportedFormats: [...model.supportedFormats],
                },
            });
            await expect(
                service.update(
                    userId,
                    {
                        mode: 'explicit',
                        modelId: 'deepseek-chat',
                        expectedVersion: 0,
                    },
                    at,
                ),
            ).rejects.toBeInstanceOf(TextAiModelUnavailableError);
            await expect(
                database.transaction((transaction) =>
                    new DrizzleTextAiAdmissionParticipant(transaction, {
                        routingEnabled: true,
                        credentialConfigured: () => true,
                        routeFingerprint: fixtureRouteFingerprint,
                    }).resolve({
                        userId,
                        now: at,
                        format: 'single-card:v2',
                        legacyBudget: model.aggregateBudget,
                    }),
                ),
            ).rejects.toBeInstanceOf(TextAiSelectionUnavailableError);
            const [revision] = await database
                .select()
                .from(dictionaryAiConfigurationRevisionsTable);
            expect(revision!.catalogSnapshot.modelId).toBe('deepseek-chat');
        });
        it('fails closed for absent, stale, unavailable and old-worker readiness', async () => {
            const cases = [
                {
                    status: 'available',
                    textAiSelectionRevision: null,
                    expiresAt: new Date(at.getTime() + 60000),
                },
                {
                    status: 'available',
                    textAiSelectionRevision: 1,
                    checkedAt: new Date(at.getTime() - 60000),
                    expiresAt: at,
                },
                {
                    status: 'unavailable',
                    textAiSelectionRevision: 1,
                    expiresAt: new Date(at.getTime() + 60000),
                },
            ];
            for (const fields of cases) {
                await database
                    .update(dictionaryAiWorkerObservationsTable)
                    .set(fields);
                expect(
                    (
                        await readTextAiCatalog(database, at, {
                            routingEnabled: true,
                            credentialConfigured: () => true,
                            routeFingerprint: fixtureRouteFingerprint,
                        })
                    ).models.find((model) => model.id === 'deepseek-flash')
                        ?.availability === 'unavailable',
                ).toBe(true);
                await expect(
                    service.update(
                        userId,
                        {
                            mode: 'explicit',
                            modelId: 'deepseek-flash',
                            expectedVersion: 0,
                        },
                        at,
                    ),
                ).rejects.toBeInstanceOf(TextAiModelUnavailableError);
            }
            await database.delete(dictionaryAiWorkerObservationsTable);
            expect(
                (
                    await readTextAiCatalog(database, at, {
                        routingEnabled: true,
                        credentialConfigured: () => true,
                        routeFingerprint: fixtureRouteFingerprint,
                    })
                ).models[0]!.availability,
            ).toBe('unavailable');
        });
        it('keeps action budgets editable without model readiness or worker selection', async () => {
            await database
                .update(dictionaryAiWorkerObservationsTable)
                .set({ status: 'unavailable', textAiSelectionRevision: null });
            await expect(
                service.update(
                    userId,
                    {
                        mode: 'auto',
                        expectedVersion: 0,
                        maxCreditsPerAction: '0.001',
                    },
                    at,
                ),
            ).resolves.toMatchObject({
                selectedModel: null,
                maxCreditsPerAction: '0.001',
            });
            await expect(
                service.update(
                    userId,
                    {
                        mode: 'explicit',
                        modelId: 'deepseek-flash',
                        expectedVersion: 1,
                    },
                    at,
                ),
            ).rejects.toBeInstanceOf(TextAiModelUnavailableError);
        });
        it('does not let a rolled-back legacy publisher refresh capable readiness', async () => {
            await database.delete(dictionaryAiWorkerObservationsTable);
            const workerId = 'rollback-worker';
            await publishTextAiWorkerObservations({
                supportedFormats: [...textAiModelCatalog[0]!.supportedFormats],
                database,
                workerId,
                now: at,
                ttlMs: 60000,
                readinessTimeoutMs: 1000,
                credentials: {
                    DEEPSEEK_API_KEY: 'synthetic-deepseek',
                    KIE_API_KEY: 'synthetic-kie',
                },
                fetchProvider: async () => new Response('{}', { status: 200 }),
            });
            expect(
                (
                    await readTextAiCatalog(database, at, {
                        routingEnabled: true,
                        credentialConfigured: () => true,
                        routeFingerprint: fixtureRouteFingerprint,
                    })
                ).models.find((model) => model.id === 'deepseek-flash')
                    ?.availability === 'available',
            ).toBe(true);
            await database.insert(textAiPreferencesTable).values({
                userId,
                mode: 'explicit',
                modelId: 'deepseek-flash',
                version: 1,
            });
            const model = textAiModelCatalog[0]!;
            const baseId = `${workerId}/${model.providerId}/${model.id}`;
            // Also prove a pre-fix row carrying a sticky flag is never trusted.
            await database.insert(dictionaryAiWorkerObservationsTable).values({
                id: baseId,
                workerId,
                providerId: model.providerId,
                modelId: model.id,
                adapterRevision: model.adapterRevision,
                status: 'available',
                message: 'pre-fix row',
                textAiSelectionRevision: 1,
                checkedAt: at,
                expiresAt: new Date(at.getTime() + 60000),
            });
            const legacyCheckedAt = new Date(at.getTime() + 120000);
            await database
                .insert(dictionaryAiWorkerObservationsTable)
                .values({
                    id: baseId,
                    workerId,
                    providerId: model.providerId,
                    modelId: model.id,
                    adapterRevision: model.adapterRevision,
                    status: 'available',
                    message: 'legacy refresh',
                    checkedAt: legacyCheckedAt,
                    expiresAt: new Date(legacyCheckedAt.getTime() + 60000),
                })
                .onConflictDoUpdate({
                    target: dictionaryAiWorkerObservationsTable.id,
                    set: {
                        status: 'available',
                        message: 'legacy refresh',
                        checkedAt: legacyCheckedAt,
                        expiresAt: new Date(legacyCheckedAt.getTime() + 60000),
                    },
                });
            const rows = await database
                .select()
                .from(dictionaryAiWorkerObservationsTable);
            expect(
                rows.find((row) => row.id === baseId)?.textAiSelectionRevision,
            ).toBe(1);
            expect(
                rows.find(
                    (row) =>
                        row.id ===
                        textAiCapacityObservationId(
                            workerId,
                            model.providerId,
                            model.id,
                        ),
                )?.expiresAt,
            ).toEqual(new Date(at.getTime() + 60000));
            const catalog = await readTextAiCatalog(database, legacyCheckedAt, {
                routingEnabled: true,
                credentialConfigured: () => true,
                routeFingerprint: fixtureRouteFingerprint,
            });
            expect(
                catalog.models.find((candidate) => candidate.id === model.id)
                    ?.availability,
            ).toBe('unavailable');
            await expect(
                service.get(userId, legacyCheckedAt),
            ).resolves.toMatchObject({
                mode: 'auto',
                selectedModel: null,
            });
            await expect(
                database.transaction((transaction) =>
                    new DrizzleTextAiAdmissionParticipant(transaction, {
                        routingEnabled: true,
                        credentialConfigured: () => true,
                        routeFingerprint: fixtureRouteFingerprint,
                    }).resolve({
                        userId,
                        now: legacyCheckedAt,
                        format: 'single-card:v2',
                        legacyBudget: model.aggregateBudget,
                    }),
                ),
            ).rejects.toBeInstanceOf(TextAiSelectionUnavailableError);
            await service.update(
                userId,
                { mode: 'auto', expectedVersion: 1 },
                legacyCheckedAt,
            );
            await expect(
                service.get(userId, legacyCheckedAt),
            ).resolves.toMatchObject({
                mode: 'auto',
                selectedModel: null,
            });
            await expect(
                database.transaction((transaction) =>
                    new DrizzleTextAiAdmissionParticipant(transaction).resolve({
                        userId,
                        now: legacyCheckedAt,
                        format: 'single-card:v2',
                        legacyBudget: model.aggregateBudget,
                    }),
                ),
            ).rejects.toBeInstanceOf(TextAiSelectionUnavailableError);
        });
        it('does not admit legacy selections without an approved server routing policy', async () => {
            await database.delete(dictionaryAiWorkerObservationsTable);
            await publishTextAiWorkerObservations({
                database,
                workerId: 'v1-only-worker',
                now: at,
                supportedFormats: ['single-card:v1', 'unregistered:v1'],
                readinessTimeoutMs: 1000,
                credentials: {
                    DEEPSEEK_API_KEY: 'synthetic-deepseek',
                    KIE_API_KEY: 'synthetic-kie',
                },
                fetchProvider: async () => new Response('{}', { status: 200 }),
            });
            expect(
                (
                    await database
                        .select()
                        .from(dictionaryAiWorkerObservationsTable)
                ).every(
                    (observation) =>
                        JSON.stringify(observation.textAiSupportedFormats) ===
                        JSON.stringify(['single-card:v1']),
                ),
            ).toBe(true);
            await database.insert(textAiPreferencesTable).values({
                userId,
                mode: 'explicit',
                modelId: 'deepseek-flash',
                version: 1,
            });
            const model = textAiModelCatalog[0]!;
            const resolve = (format: string) =>
                database.transaction((transaction) =>
                    new DrizzleTextAiAdmissionParticipant(transaction, {
                        routingEnabled: true,
                        credentialConfigured: () => true,
                        routeFingerprint: fixtureRouteFingerprint,
                    }).resolve({
                        userId,
                        now: at,
                        format,
                        legacyBudget: model.aggregateBudget,
                    }),
                );
            await expect(resolve('single-card:v1')).rejects.toBeInstanceOf(
                TextAiSelectionUnavailableError,
            );
            await expect(resolve('single-card:v2')).rejects.toBeInstanceOf(
                TextAiSelectionUnavailableError,
            );
            await service.update(
                userId,
                { mode: 'auto', expectedVersion: 1 },
                at,
            );
            await expect(resolve('single-card:v2')).rejects.toBeInstanceOf(
                TextAiSelectionUnavailableError,
            );
            await database
                .update(dictionaryAiWorkerObservationsTable)
                .set({ textAiSupportedFormats: [] });
            expect(
                (
                    await readTextAiCatalog(database, at, {
                        routingEnabled: true,
                        credentialConfigured: () => true,
                        routeFingerprint: fixtureRouteFingerprint,
                    })
                ).models.find((model) => model.id === 'deepseek-flash')
                    ?.availability === 'unavailable',
            ).toBe(true);
        });
        it('retains bounded HEAD readiness semantics without a paid completion probe', async () => {
            await database
                .update(dictionaryAiWorkerObservationsTable)
                .set({ status: 'unverified' });
            expect(
                (
                    await readTextAiCatalog(database, at, {
                        routingEnabled: true,
                        credentialConfigured: () => true,
                        routeFingerprint: fixtureRouteFingerprint,
                    })
                ).models.find((model) => model.id === 'deepseek-flash')
                    ?.availability === 'available',
            ).toBe(true);
        });
        it('disables choices when routing or trusted credentials are unavailable', async () => {
            for (const policy of [
                { routingEnabled: false, credentialConfigured: () => true },
                { routingEnabled: true, credentialConfigured: () => false },
            ]) {
                const unavailableService = new TextAiPreferenceService(
                    new DrizzleTextAiPreferenceStore(database, policy),
                );
                expect(await unavailableService.models(userId, at)).toEqual({
                    defaultModelId: null,
                    models: [],
                });
                await expect(
                    unavailableService.update(
                        userId,
                        {
                            mode: 'explicit',
                            modelId: 'deepseek-flash',
                            expectedVersion: 0,
                        },
                        at,
                    ),
                ).rejects.toBeInstanceOf(TextAiModelUnavailableError);
            }
        });
        it('rejects inactive users even when the preference exists and rolls back failed writes', async () => {
            await service.update(
                userId,
                { mode: 'auto', expectedVersion: 0 },
                at,
            );
            await database
                .update(usersTable)
                .set({ status: 'deletion_pending' })
                .where(eq(usersTable.id, userId));
            await expect(service.get(userId, at)).rejects.toBeInstanceOf(
                TextAiUserUnavailableError,
            );
            await expect(
                service.update(
                    userId,
                    { mode: 'auto', expectedVersion: 1 },
                    at,
                ),
            ).rejects.toBeInstanceOf(TextAiUserUnavailableError);
            await database
                .update(usersTable)
                .set({ status: 'active' })
                .where(eq(usersTable.id, userId));
            const store = new DrizzleTextAiPreferenceStore(database);
            await expect(
                store.run(userId, async (session) => {
                    await session.save(
                        { mode: 'auto', modelId: null, version: 2 },
                        at,
                    );
                    throw new Error('abort');
                }),
            ).rejects.toThrow('abort');
            await expect(service.get(userId, at)).resolves.toMatchObject({
                version: 1,
            });
        });
        it('database constraints reject malformed modes and impossible explicit selections', async () => {
            await expect(
                database
                    .insert(textAiPreferencesTable)
                    .values({ userId, mode: 'explicit', modelId: null }),
            ).rejects.toThrow();
            await expect(
                database.insert(textAiPreferencesTable).values({
                    userId,
                    mode: 'auto',
                    modelId: 'deepseek-flash',
                }),
            ).rejects.toThrow();
            await expect(
                database
                    .insert(textAiPreferencesTable)
                    .values({ userId, mode: 'auto', version: -1 }),
            ).rejects.toThrow();
        });
    },
);
