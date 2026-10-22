import { randomUUID } from 'node:crypto';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { learnerPortraitInterviewOperationsTable as portraitOperations } from '../../../../src/modules/learner-portraits/infrastructure/persistence/drizzle/schema';
import {
    reserveConversationActionFixture,
    settleConversationActionFixture,
} from '../../support/accounting-action-fixture';
import { DrizzleActionAccountingParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    textAiProviderBudgetAllows,
    lockTextAiCapacity,
    readTextAiCapacity,
    cleanupTextAiCapacity,
    archiveSentenceProviderUsage,
    hasSentenceCapacityOverlap,
    hasTextsCapacityOverlap,
    hasConversationCapacityOverlap,
} from '../../../../src/infrastructure/text-ai/text-ai-capacity';
import { DrizzleDictionaryGenerationStore } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-generation-store';
import { DrizzleDictionaryStore } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import {
    dictionaryGenerationJobsTable,
    dictionaryGenerationProviderUsageArchiveTable,
} from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { sentenceAiJobsTable } from '../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-schema';
import {
    dictionaryAiConfigurationRevisionsTable,
} from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { accountDeletionRequestsTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import { DrizzleAccountPurgeStore } from '../../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-account-purge-store';
import {
    textAiModelCatalog,
    type TextAiExecutionSnapshot,
} from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { defaultDictionaryGenerationProviderBudgetPolicy as budget } from '../../../../src/modules/dictionaries/application/ports/dictionary-generation-provider-policy';
import { createInterviewAdmission } from '../../../../src/modules/learner-portraits/infrastructure/interview-accounting';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';
import { seedPortraitAdmissionFixture } from '../../support/portrait-admission-fixture';
const instant = (ms = 0) => new Date(Date.now() + ms);
const context = (ms = 0) => ({
    now: instant(ms),
    signal: new AbortController().signal,
});
const fingerprint = (character: string) =>
    `hmac-sha256:v1:${character.repeat(43)}`;
describe.runIf(isDatabaseIntegrationEnabled())(
    'combined text AI capacity and legacy overlap guard',
    () => {
        let client: PostgresClient,
            other: PostgresClient,
            database: PostgresJsDatabase<typeof databaseSchema>,
            otherDatabase: PostgresJsDatabase<typeof databaseSchema>;
        let dictionaryStore: DrizzleDictionaryStore,
            generationStore: DrizzleDictionaryGenerationStore,
            ownerId: string;
        beforeAll(async () => {
            client = createTestPostgresClient();
            other = createTestPostgresClient();
            database = createDrizzleDatabase(client, databaseSchema);
            otherDatabase = createDrizzleDatabase(other, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            dictionaryStore = new DrizzleDictionaryStore(database, {
                generate: randomUUID,
            });
            generationStore = new DrizzleDictionaryGenerationStore(database, {
                generate: randomUUID,
            });
        });
        beforeEach(async () => {
            // Isolate compact counters and immutable financial facts as well as feature rows.
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            ownerId = randomUUID();
            await database
                .insert(usersTable)
                .values({ id: ownerId, status: 'active' });
        });
        afterAll(async () => {
            await Promise.all([client.end(), other.end()]);
        });
        async function seedCard(seedOwnerId = ownerId) {
            const dictionary = await dictionaryStore.createDictionary({
                context: context(),
                fingerprint: fingerprint('A'),
                idempotencyKey: `dictionary-create-${randomUUID()}`,
                ownerId: seedOwnerId,
                request: {
                    description: null,
                    name: 'Worker overlap',
                    sourceLanguage: 'en',
                    targetLanguage: 'fr',
                },
            });
            const created = await dictionaryStore.createCard({
                context: context(1),
                dictionaryId: dictionary.id,
                ownerId: seedOwnerId,
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
            return { dictionary, created, ownerId: seedOwnerId };
        }

        async function enqueue(
            seeded: Awaited<ReturnType<typeof seedCard>>,
            key = `generation-job-${randomUUID()}`,
            requestFingerprint = fingerprint('B'),
            at = 2,
            store = generationStore,
        ) {
            return store.enqueue({
                cardId: seeded.created.card.id,
                context: context(at),
                dictionaryId: seeded.dictionary.id,
                expectedCardVersion: seeded.created.card.version,
                expectedDictionaryVersion: seeded.created.dictionaryVersion,
                expectedSettingsVersion: seeded.dictionary.settings.version,
                fingerprint: requestFingerprint,
                idempotencyKey: key,
                instruction: 'Improve articles',
                ownerId: seeded.ownerId,
            });
        }

        async function purgeOwnerForDeletion(targetOwnerId: string) {
            const now = new Date();
            const workerId = 'text-ai-capacity-purge-fixture';
            await database
                .update(usersTable)
                .set({ status: 'deletion_pending', updatedAt: now })
                .where(eq(usersTable.id, targetOwnerId));
            await database.insert(accountDeletionRequestsTable).values({
                userId: targetOwnerId,
                scheduledAt: new Date(now.getTime() - 120_000),
                purgeAt: new Date(now.getTime() - 60_000),
                nextAttemptAt: new Date(now.getTime() - 60_000),
                updatedAt: now,
            });
            const claim = await new DrizzleAccountPurgeStore(database).claimDue(
                { now, workerId },
            );
            if (!claim || claim.userId !== targetOwnerId)
                throw new Error('Expected an actively leased deletion claim.');
            await database.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).purgeOwner(
                    targetOwnerId,
                    { workerId, fencingToken: claim.fencingToken },
                ),
            );
        }

        async function sentence(
            dictionaryId: string,
            tx: Parameters<Parameters<typeof database.transaction>[0]>[0],
        ) {
            const model = textAiModelCatalog[0]!;
            const snapshot: TextAiExecutionSnapshot = {
                adapterRevision: model.adapterRevision,
                aggregateBudget: budget,
                credentialReference: model.credentialReference,
                enabledModelIds: [model.id],
                modelId: model.id,
                perCallMaxInputTokens: model.perCallMaxInputTokens,
                perCallMaxOutputTokens: model.perCallMaxOutputTokens,
                providerId: model.providerId,
                supportedFormats: ['sentence-generation:v1'],
            };
            const revisionId = randomUUID();
            await tx.insert(dictionaryAiConfigurationRevisionsTable).values({
                id: revisionId,
                createdByUserId: ownerId,
                version: Math.floor(Math.random() * 2_000_000_000) + 1,
                catalogSnapshot: snapshot,
            });
            await tx.execute(
                sql`select set_config('languon.text_ai_selection_revision','1',true),set_config('languon.learning_execution_revision','1',true),set_config('languon.ai_credit_settlement_revision','1',true)`,
            );
            const id = randomUUID();
            await tx.insert(sentenceAiJobsTable).values({
                id,
                learnerId: ownerId,
                dictionaryId,
                jobKind: 'sentence-generation',
                format: 'sentence-generation:v1',
                direction: 'source-to-target',
                authority: { kind: 'owner' },
                operationId: randomUUID(),
                sessionId: randomUUID(),
                requestFingerprint: 'fixture',
                inputPayload: { generationPolicyVersion: 1 } as never,
                selectedExecutionSnapshot: snapshot,
                executionRevisionId: revisionId,
                providerMaxCostMicrosPerAttempt: budget.maxCostMicrosPerAttempt,
                providerMaxInputTokensPerAttempt:
                    budget.maxInputTokensPerAttempt,
                providerMaxOutputTokensPerAttempt:
                    budget.maxOutputTokensPerAttempt,
                providerInputCostMicrosPerMillionTokens:
                    budget.inputCostMicrosPerMillionTokens,
                providerOutputCostMicrosPerMillionTokens:
                    budget.outputCostMicrosPerMillionTokens,
                providerReservationState: 'active',
                providerReservedAttempts: 1,
                providerReservedCostMicros: budget.maxCostMicrosPerAttempt,
                providerReservedInputTokens: budget.maxInputTokensPerAttempt,
                providerReservedOutputTokens: budget.maxOutputTokensPerAttempt,
            });
            return id;
        }
        async function template() {
            const seeded = await seedCard();
            const job = await enqueue(seeded);
            const [row] = await database
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(eq(dictionaryGenerationJobsTable.id, job.id));
            await database
                .delete(dictionaryGenerationJobsTable)
                .where(eq(dictionaryGenerationJobsTable.id, job.id));
            return { seeded, row: row! };
        }
        function oldRow(
            row: typeof dictionaryGenerationJobsTable.$inferSelect,
        ) {
            return {
                ...row,
                id: randomUUID(),
                idempotencyKey: randomUUID(),
                requestFingerprint: fingerprint('D'),
            };
        }
        it('preserves exact rolling-window boundary, adjusts buckets on rollback, and cleans only expired usage', async () => {
            const now = instant();
            const threshold = new Date(now.getTime() - 86_400_000);
            const boundary = new Date(
                Math.floor(threshold.getTime() / 60_000) * 60_000 + 60_000,
            );
            const rows = [
                { id: randomUUID(), at: threshold, cost: 17 },
                {
                    id: randomUUID(),
                    at: new Date(threshold.getTime() + 1),
                    cost: 23,
                },
                { id: randomUUID(), at: boundary, cost: 31 },
            ];
            for (const row of rows) {
                await database
                    .insert(dictionaryGenerationProviderUsageArchiveTable)
                    .values({
                        id: row.id,
                        jobKind: 'text-translation',
                        ownerId,
                        actualCostMicros: row.cost,
                        actualInputTokens: row.cost,
                        actualOutputTokens: row.cost,
                        inputCostMicrosPerMillionTokens:
                            budget.inputCostMicrosPerMillionTokens,
                        outputCostMicrosPerMillionTokens:
                            budget.outputCostMicrosPerMillionTokens,
                        maxCostMicrosPerAttempt: budget.maxCostMicrosPerAttempt,
                        maxInputTokensPerAttempt:
                            budget.maxInputTokensPerAttempt,
                        maxOutputTokensPerAttempt:
                            budget.maxOutputTokensPerAttempt,
                        settledAt: row.at,
                        archivedAt: now,
                    });
            }
            const read = () =>
                database.transaction((tx) =>
                    readTextAiCapacity(tx, { actorId: ownerId, now, budget }),
                );
            expect((await read()).providerUsage).toMatchObject({
                globalSettledCostMicros: 54,
                ownerSettledCostMicros: 54,
            });
            await expect(
                database.transaction(async (tx) => {
                    await tx
                        .update(dictionaryGenerationProviderUsageArchiveTable)
                        .set({ actualCostMicros: 99 })
                        .where(
                            eq(
                                dictionaryGenerationProviderUsageArchiveTable.id,
                                rows[1]!.id,
                            ),
                        );
                    throw new Error('capacity rollback');
                }),
            ).rejects.toThrow('capacity rollback');
            expect((await read()).providerUsage.globalSettledCostMicros).toBe(
                54,
            );
            await database
                .update(dictionaryGenerationProviderUsageArchiveTable)
                .set({ settledAt: threshold })
                .where(
                    eq(
                        dictionaryGenerationProviderUsageArchiveTable.id,
                        rows[1]!.id,
                    ),
                );
            expect((await read()).providerUsage.globalSettledCostMicros).toBe(
                31,
            );
            expect(
                await database.transaction((tx) =>
                    cleanupTextAiCapacity(tx, now),
                ),
            ).toBe(2);
            expect((await read()).providerUsage.globalSettledCostMicros).toBe(
                31,
            );
            const retainedArchive = await database
                .select()
                .from(dictionaryGenerationProviderUsageArchiveTable);
            expect(retainedArchive).toHaveLength(3);
            // Direct edits of retained settled state are rejected.
            await expect(
                database.execute(
                    sql`update text_ai_capacity_provider_usage set cost=1`,
                ),
            ).rejects.toThrow();
        });

        it('removes multiple zero-valued provider records without relying on empty counter rows', async () => {
            const now = instant();
            const ids = [randomUUID(), randomUUID()];
            await database
                .insert(dictionaryGenerationProviderUsageArchiveTable)
                .values(
                    ids.map((id) => ({
                        id,
                        jobKind: 'text-translation' as const,
                        ownerId,
                        actualCostMicros: 0,
                        actualInputTokens: 0,
                        actualOutputTokens: 0,
                        inputCostMicrosPerMillionTokens:
                            budget.inputCostMicrosPerMillionTokens,
                        outputCostMicrosPerMillionTokens:
                            budget.outputCostMicrosPerMillionTokens,
                        maxCostMicrosPerAttempt: budget.maxCostMicrosPerAttempt,
                        maxInputTokensPerAttempt:
                            budget.maxInputTokensPerAttempt,
                        maxOutputTokensPerAttempt:
                            budget.maxOutputTokensPerAttempt,
                        settledAt: now,
                        archivedAt: now,
                    })),
                );
            for (const id of ids) {
                await database
                    .delete(dictionaryGenerationProviderUsageArchiveTable)
                    .where(
                        eq(
                            dictionaryGenerationProviderUsageArchiveTable.id,
                            id,
                        ),
                    );
            }
            const result = await database.transaction((tx) =>
                readTextAiCapacity(tx, { actorId: ownerId, now, budget }),
            );
            expect(result.providerUsage.globalSettledCostMicros).toBe(0);
        });

        it('counts settled portrait action usage for compatibility without an active portrait job', async () => {
            const now = instant();
            let portraitBudget = budget;
            const actionId = randomUUID();
            const callId = randomUUID();
            const interviewId = randomUUID();
            await seedPortraitAdmissionFixture(database, now);
            await database.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                const bootstrap = await reserveConversationActionFixture(tx, {
                    ownerId,
                    maximumMilli: 0n,
                    funding: 'operator',
                });
                await settleConversationActionFixture(tx, {
                    ownerId,
                    actionId: bootstrap.id,
                    outcome: 'failure',
                });
                await tx.insert(portraitOperations).values({
                    id: actionId,
                    ownerId,
                    interviewId,
                    generation: 0,
                    version: 0,
                    state: 'running',
                    input: { kind: 'skip', topic: 'update' },
                    context: {
                        locale: 'en',
                        approvedItems: null,
                        draftItems: null,
                        messages: [],
                        completedTopics: [],
                    },
                    execution: {},
                    idempotencyKey: randomUUID(),
                    fingerprint: 'synthetic-portrait-capacity',
                    createdAt: now,
                    updatedAt: now,
                    leaseToken: actionId,
                    leaseUntil: new Date(now.getTime() + 60_000),
                });
                const execution = await createInterviewAdmission({
                    selectionPolicy: {
                        routingEnabled: true,
                        credentialConfigured: () => true,
                        pricingAdmissionEnabled: true,
                    },
                })(
                    tx,
                    {
                        id: actionId,
                        ownerId,
                        interviewId,
                        generation: 0,
                        version: 0,
                        state: 'running',
                        input: { kind: 'skip', topic: 'update' },
                        context: {
                            locale: 'en',
                            approvedItems: null,
                            draftItems: null,
                            messages: [],
                            completedTopics: [],
                        },
                        execution: {},
                        result: null,
                        errorCode: null,
                    },
                    true,
                    now,
                );
                portraitBudget = execution.budget as typeof budget;
                await tx
                    .update(portraitOperations)
                    .set({ execution })
                    .where(eq(portraitOperations.id, actionId));
                const actions = new DrizzleActionAccountingParticipant(tx);
                await actions.admitAttempt({
                    actionId,
                    ownerId,
                    callId,
                    purpose: 'answer',
                    inputTokens: 2,
                    maxOutputTokens: 3,
                    budget: execution.budget as typeof budget,
                    executionWitness: {
                        jobId: actionId,
                        leaseToken: actionId,
                    },
                    at: now,
                });
                await actions.recordAttempt({
                    actionId,
                    ownerId,
                    callId,
                    successful: true,
                    usage: { inputTokens: 2, outputTokens: 3 },
                    operatorCostMicros: null,
                    at: new Date(now.getTime() + 1),
                });
                // Derive expense from the immutable provider pin and settled meters.
                await tx.execute(
                    sql`select languon_record_text_provider_expense(${callId}::uuid)`,
                );
                await tx
                    .update(portraitOperations)
                    .set({
                        state: 'succeeded',
                        leaseToken: null,
                        leaseUntil: null,
                        updatedAt: new Date(now.getTime() + 2),
                    })
                    .where(eq(portraitOperations.id, actionId));
                await actions.settle({
                    actionId,
                    ownerId,
                    outcome: 'success',
                    at: new Date(now.getTime() + 2),
                });
            });
            await database.transaction(async (tx) => {
                const overlap = await tx.execute(
                    sql`select languon_text_ai_has_capacity_overlap(array['portrait-interview']::text[],${now.toISOString()}::timestamptz) as overlap`,
                );
                expect(overlap[0]?.overlap).toBe(true);
                expect(await hasConversationCapacityOverlap(tx, now)).toBe(
                    false,
                );
                const totals = await readTextAiCapacity(tx, {
                    actorId: ownerId,
                    now,
                    budget: portraitBudget,
                });
                expect(totals.globalQueued).toBe(0);
                expect(totals.providerUsage.globalSettledInputTokens).toBe(2);
                expect(totals.providerUsage.globalSettledOutputTokens).toBe(3);
            });
            await purgeOwnerForDeletion(ownerId);
            await database
                .delete(portraitOperations)
                .where(eq(portraitOperations.id, actionId));
        });

        it('counts both typed queues and reservations once, and preserves usage after erasure', async () => {
            const seeded = await seedCard();
            await enqueue(seeded);
            const id = await database.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                return sentence(seeded.dictionary.id, tx);
            });
            let totals = await database.transaction((tx) =>
                readTextAiCapacity(tx, {
                    actorId: ownerId,
                    now: instant(),
                    budget,
                }),
            );
            expect(totals).toMatchObject({
                globalQueued: 2,
                actorQueued: 2,
                globalRunning: 0,
            });
            expect(totals.providerUsage.globalActiveCostMicros).toBe(
                2 * budget.maxCostMicrosPerAttempt,
            );
            await database
                .update(sentenceAiJobsTable)
                .set({
                    executionState: 'completed',
                    completedAt: instant(),
                    providerReservationState: 'settled',
                    providerReservationSettledAt: instant(),
                    providerActualCostMicros: 7,
                    providerActualInputTokens: 11,
                    providerActualOutputTokens: 13,
                    providerReservedAttempts: 0,
                    providerReservedCostMicros: 0,
                    providerReservedInputTokens: 0,
                    providerReservedOutputTokens: 0,
                })
                .where(eq(sentenceAiJobsTable.id, id));
            await database.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await archiveSentenceProviderUsage(tx, {
                    jobIds: [id],
                    now: instant(),
                });
            });
            totals = await database.transaction((tx) =>
                readTextAiCapacity(tx, {
                    actorId: ownerId,
                    now: instant(),
                    budget,
                }),
            );
            expect(totals.providerUsage.globalSettledCostMicros).toBe(7);
            await database
                .delete(sentenceAiJobsTable)
                .where(eq(sentenceAiJobsTable.id, id));
            totals = await database.transaction((tx) =>
                readTextAiCapacity(tx, {
                    actorId: ownerId,
                    now: instant(),
                    budget,
                }),
            );
            expect(totals.providerUsage).toMatchObject({
                globalSettledCostMicros: 7,
                ownerSettledInputTokens: 11,
                globalSettledOutputTokens: 13,
            });
            expect(
                await database.transaction((tx) =>
                    hasSentenceCapacityOverlap(tx, instant()),
                ),
            ).toBe(true);
        });
        it('applies the existing per-learner reservation limit across both typed queues', async () => {
            const seeded = await seedCard();
            await enqueue(seeded);
            await database.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await sentence(seeded.dictionary.id, tx);
                await sentence(seeded.dictionary.id, tx);
            });
            const totals = await database.transaction((tx) =>
                readTextAiCapacity(tx, {
                    actorId: ownerId,
                    now: instant(),
                    budget,
                }),
            );
            expect(totals.actorQueued).toBe(3);
            expect(totals.providerUsage.ownerActiveCostMicros).toBe(
                3 * budget.maxCostMicrosPerAttempt,
            );
            expect(
                textAiProviderBudgetAllows(totals.providerUsage, true, budget),
            ).toBe(false);
        });
        it('rejects legacy admission for active, settled, and erased recent usage and allows expiry', async () => {
            const { seeded, row } = await template();
            const id = await database.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                return sentence(seeded.dictionary.id, tx);
            });
            const legacy = () =>
                otherDatabase.transaction(async (tx) => {
                    await tx.execute(
                        sql`select pg_advisory_xact_lock(4312189072)`,
                    );
                    await tx
                        .insert(dictionaryGenerationJobsTable)
                        .values(oldRow(row));
                });
            await expect(legacy()).rejects.toMatchObject({
                cause: { code: '55000' },
            });
            await database
                .update(sentenceAiJobsTable)
                .set({
                    executionState: 'completed',
                    completedAt: instant(),
                    providerReservationState: 'settled',
                    providerReservationSettledAt: instant(),
                    providerActualCostMicros: 1,
                    providerActualInputTokens: 1,
                    providerActualOutputTokens: 1,
                    providerReservedAttempts: 0,
                    providerReservedCostMicros: 0,
                    providerReservedInputTokens: 0,
                    providerReservedOutputTokens: 0,
                })
                .where(eq(sentenceAiJobsTable.id, id));
            await expect(legacy()).rejects.toMatchObject({
                cause: { code: '55000' },
            });
            await database.transaction((tx) =>
                archiveSentenceProviderUsage(tx, {
                    jobIds: [id],
                    now: instant(),
                }),
            );
            await database
                .delete(sentenceAiJobsTable)
                .where(eq(sentenceAiJobsTable.id, id));
            await expect(legacy()).rejects.toMatchObject({
                cause: { code: '55000' },
            });
            await client`update dictionary_generation_provider_usage_archive set settled_at=now()-interval '24 hours 1 second'`;
            await expect(legacy()).resolves.toBeUndefined();
        });
        for (const sentenceFirst of [false, true])
            it(`serializes two real connections when ${sentenceFirst ? 'sentence' : 'legacy'} admission owns lock first`, async () => {
                const { seeded, row } = await template();
                let release!: () => void;
                const releaseGate = new Promise<void>((r) => (release = r));
                let acquired!: () => void;
                const acquiredGate = new Promise<void>((r) => (acquired = r));
                const first = database.transaction(async (tx) => {
                    if (sentenceFirst) {
                        await lockTextAiCapacity(tx);
                        await sentence(seeded.dictionary.id, tx);
                    } else {
                        await tx.execute(
                            sql`select pg_advisory_xact_lock(4312189072)`,
                        );
                        await tx
                            .insert(dictionaryGenerationJobsTable)
                            .values(oldRow(row));
                    }
                    acquired();
                    await releaseGate;
                });
                await acquiredGate;
                let secondSettled = false;
                const second = otherDatabase
                    .transaction(async (tx) => {
                        if (sentenceFirst) {
                            await tx.execute(
                                sql`select pg_advisory_xact_lock(4312189072)`,
                            );
                            await tx
                                .insert(dictionaryGenerationJobsTable)
                                .values(oldRow(row));
                        } else {
                            await lockTextAiCapacity(tx);
                            const counts = await readTextAiCapacity(tx, {
                                actorId: ownerId,
                                now: instant(),
                                budget,
                            });
                            expect(counts.globalQueued).toBe(1);
                            await sentence(seeded.dictionary.id, tx);
                        }
                    })
                    .then(
                        () => {
                            secondSettled = true;
                            return null;
                        },
                        (error) => {
                            secondSettled = true;
                            return error;
                        },
                    );
                await new Promise((r) => setTimeout(r, 30));
                expect(secondSettled).toBe(false);
                release();
                await first;
                const result = await second;
                if (sentenceFirst)
                    expect(result).toMatchObject({ cause: { code: '55000' } });
                else expect(result).toBeNull();
            });
        for (const sentenceFirst of [false, true])
            it(`serializes legacy claim and sentence admission when ${sentenceFirst ? 'sentence' : 'claim'} owns lock first`, async () => {
                const { seeded, row } = await template();
                const old = oldRow(row);
                await database
                    .insert(dictionaryGenerationJobsTable)
                    .values(old);
                let release!: () => void;
                const releaseGate = new Promise<void>((r) => (release = r));
                let acquired!: () => void;
                const acquiredGate = new Promise<void>((r) => (acquired = r));
                const claim = async (
                    tx: Parameters<
                        Parameters<typeof database.transaction>[0]
                    >[0],
                ) => {
                    await tx.execute(
                        sql`select pg_advisory_xact_lock(4312189072)`,
                    );
                    await tx
                        .update(dictionaryGenerationJobsTable)
                        .set({
                            executionState: 'running',
                            workerId: 'legacy',
                            heartbeatAt: instant(),
                            leaseDeadline: instant(60_000),
                            fencingToken: 1n,
                        })
                        .where(eq(dictionaryGenerationJobsTable.id, old.id));
                };
                const first = database.transaction(async (tx) => {
                    if (sentenceFirst) {
                        await lockTextAiCapacity(tx);
                        await sentence(seeded.dictionary.id, tx);
                    } else await claim(tx);
                    acquired();
                    await releaseGate;
                });
                await acquiredGate;
                let settled = false;
                const second = otherDatabase
                    .transaction(async (tx) => {
                        if (sentenceFirst) await claim(tx);
                        else {
                            await lockTextAiCapacity(tx);
                            const counts = await readTextAiCapacity(tx, {
                                actorId: ownerId,
                                now: instant(),
                                budget,
                            });
                            expect(counts.globalRunning).toBe(1);
                            await sentence(seeded.dictionary.id, tx);
                        }
                    })
                    .then(
                        () => {
                            settled = true;
                            return null;
                        },
                        (error) => {
                            settled = true;
                            return error;
                        },
                    );
                await new Promise((r) => setTimeout(r, 30));
                expect(settled).toBe(false);
                release();
                await first;
                const result = await second;
                if (sentenceFirst)
                    expect(result).toMatchObject({ cause: { code: '55000' } });
                else expect(result).toBeNull();
            });
        it.each([
            'text-detection',
            'text-translation',
            'text-selection-card',
        ] as const)(
            'retains %s numerical usage and rejects old capacity-aware admissions until expiry',
            async (jobKind) => {
                const { row } = await template();
                const now = instant();
                await database
                    .insert(dictionaryGenerationProviderUsageArchiveTable)
                    .values({
                        id: randomUUID(),
                        ownerId,
                        jobKind,
                        actualCostMicros: 17,
                        actualInputTokens: 23,
                        actualOutputTokens: 11,
                        inputCostMicrosPerMillionTokens:
                            budget.inputCostMicrosPerMillionTokens,
                        outputCostMicrosPerMillionTokens:
                            budget.outputCostMicrosPerMillionTokens,
                        maxCostMicrosPerAttempt: budget.maxCostMicrosPerAttempt,
                        maxInputTokensPerAttempt:
                            budget.maxInputTokensPerAttempt,
                        maxOutputTokensPerAttempt:
                            budget.maxOutputTokensPerAttempt,
                        settledAt: now,
                        archivedAt: now,
                    });
                await database.transaction(async (tx) => {
                    expect(await hasTextsCapacityOverlap(tx, now)).toBe(true);
                    const current = await readTextAiCapacity(tx, {
                        actorId: ownerId,
                        now,
                        budget,
                    });
                    expect(current.providerUsage.globalSettledCostMicros).toBe(
                        17,
                    );
                    expect(current.providerUsage.ownerSettledInputTokens).toBe(
                        23,
                    );
                    expect(
                        current.providerUsage.globalSettledOutputTokens,
                    ).toBe(11);
                });
                await expect(
                    otherDatabase.transaction(async (tx) => {
                        await tx.execute(
                            sql`select set_config('languon.text_ai_capacity_revision','1',true)`,
                        );
                        await tx
                            .insert(dictionaryGenerationJobsTable)
                            .values(oldRow(row));
                    }),
                ).rejects.toMatchObject({ cause: { code: '55000' } });
                await database.transaction(async (tx) => {
                    await lockTextAiCapacity(tx);
                    await tx
                        .insert(dictionaryGenerationJobsTable)
                        .values(oldRow(row));
                });
                const expired = new Date(now.getTime() + 86_400_001);
                await database.transaction(async (tx) => {
                    expect(await hasTextsCapacityOverlap(tx, expired)).toBe(
                        false,
                    );
                    const current = await readTextAiCapacity(tx, {
                        actorId: ownerId,
                        now: expired,
                        budget,
                    });
                    expect(current.providerUsage.globalSettledCostMicros).toBe(
                        0,
                    );
                });
                await database
                    .update(dictionaryGenerationProviderUsageArchiveTable)
                    .set({ settledAt: new Date(now.getTime() - 86_400_001) })
                    .where(
                        eq(
                            dictionaryGenerationProviderUsageArchiveTable.ownerId,
                            ownerId,
                        ),
                    );
                await expect(
                    otherDatabase.transaction(async (tx) => {
                        await tx.execute(
                            sql`select set_config('languon.text_ai_capacity_revision','1',true)`,
                        );
                        await tx
                            .insert(dictionaryGenerationJobsTable)
                            .values(oldRow(row));
                    }),
                ).resolves.toBeUndefined();
            },
        );
        it('blocks legacy claims and takeover while allowing legacy completion and drain', async () => {
            const { seeded, row } = await template();
            const old = oldRow(row);
            await database.insert(dictionaryGenerationJobsTable).values(old);
            await database.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await sentence(seeded.dictionary.id, tx);
            });
            const running = {
                executionState: 'running' as const,
                workerId: 'old',
                heartbeatAt: instant(),
                leaseDeadline: instant(60_000),
                fencingToken: 1n,
            };
            await expect(
                otherDatabase
                    .update(dictionaryGenerationJobsTable)
                    .set(running)
                    .where(eq(dictionaryGenerationJobsTable.id, old.id)),
            ).rejects.toMatchObject({ cause: { code: '55000' } });
            await database.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await tx
                    .update(dictionaryGenerationJobsTable)
                    .set(running)
                    .where(eq(dictionaryGenerationJobsTable.id, old.id));
            });
            await expect(
                otherDatabase
                    .update(dictionaryGenerationJobsTable)
                    .set({ workerId: 'takeover', fencingToken: 2n })
                    .where(eq(dictionaryGenerationJobsTable.id, old.id)),
            ).rejects.toMatchObject({ cause: { code: '55000' } });
            await expect(
                otherDatabase
                    .update(dictionaryGenerationJobsTable)
                    .set({
                        heartbeatAt: instant(1),
                        leaseDeadline: instant(60_001),
                    })
                    .where(eq(dictionaryGenerationJobsTable.id, old.id)),
            ).resolves.toBeDefined();
            await expect(
                otherDatabase
                    .update(dictionaryGenerationJobsTable)
                    .set({
                        executionState: 'cancelled',
                        workerId: null,
                        heartbeatAt: null,
                        leaseDeadline: null,
                        completedAt: instant(2),
                        providerReservationState: 'released',
                        providerReservationSettledAt: instant(2),
                        providerActualCostMicros: 0,
                        providerActualInputTokens: 0,
                        providerActualOutputTokens: 0,
                        providerReservedAttempts: 0,
                        providerReservedCostMicros: 0,
                        providerReservedInputTokens: 0,
                        providerReservedOutputTokens: 0,
                    })
                    .where(eq(dictionaryGenerationJobsTable.id, old.id)),
            ).resolves.toBeDefined();
        });
    },
);
