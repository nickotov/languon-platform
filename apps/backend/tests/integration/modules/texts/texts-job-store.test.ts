import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { eq, isNotNull, or } from 'drizzle-orm';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    textFoldersTable,
    textsTable,
} from '../../../../src/modules/texts/infrastructure/persistence/drizzle/schema';
import { textsAiJobsTable as jobs } from '../../../../src/modules/texts/infrastructure/persistence/drizzle/texts-job-schema';
import { DrizzleTextsJobStore } from '../../../../src/modules/texts/infrastructure/persistence/drizzle/drizzle-texts-job-store';
import { TextsWorkerService } from '../../../../src/modules/texts/application/texts-worker-service';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { aiCreditReservationsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
import {
    textAiModelCatalog,
    defaultTextAiProviderBudgetPolicy as budget,
} from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { DrizzleTextAiAdmissionParticipant } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { textsExecutionObservationId } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'Texts durable jobs and credits',
    () => {
        let client: PostgresClient;
        let db: ReturnType<typeof createDrizzleDatabase<typeof databaseSchema>>;
        let store: DrizzleTextsJobStore;
        let owner: string, folder: string, now: Date;
        const claimOptions = {
            workerId: 'texts-job-test',
            leaseMs: 10000,
            globalConcurrency: 10,
            userConcurrency: 5,
            supportedFormats: [
                'text-detection:v1',
                'text-translation:v1',
            ] as const,
        };
        const context = () => ({ now, signal: new AbortController().signal });
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
        });
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            now = new Date('2026-10-15T12:00:00Z');
            owner = randomUUID();
            folder = randomUUID();
            await db.insert(usersTable).values({ id: owner, status: 'active' });
            await db.insert(textFoldersTable).values({
                id: folder,
                ownerId: owner,
                name: 'Synthetic',
                createdAt: now,
                updatedAt: now,
            });
            const model = textAiModelCatalog[0]!,
                revisionId = randomUUID();
            await db.insert(dictionaryAiConfigurationRevisionsTable).values({
                id: revisionId,
                version: 1,
                createdByUserId: owner,
                catalogSnapshot: {
                    ...model,
                    modelId: model.id,
                    enabledModelIds: [model.id],
                    supportedFormats: [...model.supportedFormats],
                },
            });
            await db.insert(dictionaryAiConfigurationTable).values({
                id: 'global',
                version: 1,
                activeRevisionId: revisionId,
            });
            await db.insert(dictionaryAiWorkerObservationsTable).values({
                id: textsExecutionObservationId(
                    'texts-job-test',
                    model.providerId,
                    model.id,
                ),
                workerId: 'texts-job-test',
                providerId: model.providerId,
                modelId: model.id,
                adapterRevision: model.adapterRevision,
                textAiSelectionRevision: 1,
                textAiCapacityRevision: 1,
                textsExecutionRevision: 1,
                textsCapacityRevision: 1,
                creditSettlementRevision: 1,
                textAiSupportedFormats: [...model.supportedFormats],
                status: 'available',
                message: 'synthetic',
                checkedAt: now,
                expiresAt: new Date(now.getTime() + 3600000),
            });
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId: owner,
                    amount: 1000000000n,
                    createdAt: now,
                    expiresAt: null,
                    source: 'admin',
                    sourceReference: randomUUID(),
                }),
            );
            store = new DrizzleTextsJobStore(db, {
                fingerprintSecret: 'synthetic-texts-jobs-secret',
                globalQueueLimit: 1000,
                userQueueLimit: 500,
                resolveExecution: (tx, userId, format, at) =>
                    new DrizzleTextAiAdmissionParticipant(tx, {
                        routingEnabled: true,
                        credentialConfigured: () => true,
                    }).resolve({
                        userId,
                        format,
                        now: at,
                        legacyBudget: budget,
                        requiredWorkerFormat: format,
                    }),
            });
        }, 120000);
        afterAll(async () => client?.end());
        const enqueue = () =>
            store.enqueue(
                owner,
                'text-detection',
                {
                    folderId: folder,
                    operationId: randomUUID(),
                    sourceText: 'Hello world.',
                },
                context(),
            );
        it('admits, dispatches and completes with immutable policy and measured credit settlement', async () => {
            const job = await enqueue();
            const worker = new TextsWorkerService({
                ...claimOptions,
                supportedFormats: [...claimOptions.supportedFormats],
                store,
                provider: {
                    run: async () => ({
                        draft: { language: 'en', confidence: 'high' },
                        usage: { inputTokens: 100, outputTokens: 10 },
                    }),
                },
                clock: { now: () => now },
                heartbeatMs: 1000,
                timeoutMs: 5000,
                maxAttempts: 3,
                retryDelayMs: 100,
            });
            expect(await worker.processNext(context().signal)).toBe(true);
            expect((await store.get(owner, job.id, context())).state).toBe(
                'completed',
            );
            const [row] = await db
                .select()
                .from(jobs)
                .where(eq(jobs.id, job.id));
            expect(row?.aiCreditPolicyMode).toBe('limited');
            expect(row?.inputPayload).toBeNull();
            const [reservation] = await db
                .select()
                .from(aiCreditReservationsTable)
                .where(eq(aiCreditReservationsTable.jobId, job.id));
            expect(reservation?.state).toBe('settled');
            expect(reservation?.measurement).toBe('provider_reported');
            expect(reservation?.chargedCredits).toBeGreaterThan(0n);
        });
        it('completes translation after PostgreSQL JSONB normalizes source segment key order', async () => {
            const job = await store.enqueue(
                owner,
                'text-translation',
                {
                    folderId: folder,
                    operationId: randomUUID(),
                    sourceText: 'Hello world.\nNext sentence.',
                    sourceLanguage: 'en',
                    targetLanguage: 'es',
                },
                context(),
            );
            const worker = new TextsWorkerService({
                ...claimOptions,
                supportedFormats: [...claimOptions.supportedFormats],
                store,
                provider: {
                    run: async ({ input }) => {
                        if (input.kind !== 'text-translation')
                            throw new Error('Unexpected fixture kind');
                        return {
                            draft: {
                                translation: input.segments.map((segment) => ({
                                    pairId: segment.pairId,
                                    text: `ES: ${segment.text}`,
                                })),
                            },
                            usage: { inputTokens: 100, outputTokens: 20 },
                        };
                    },
                },
                clock: { now: () => now },
                heartbeatMs: 1000,
                timeoutMs: 5000,
                maxAttempts: 3,
                retryDelayMs: 100,
            });
            await worker.processNext(context().signal);
            const completed = await store.get(owner, job.id, context());
            expect(completed.state).toBe('completed');
            expect(completed.result).toMatchObject({
                sourceText: 'Hello world.\nNext sentence.',
                sourceLanguage: 'en',
                targetLanguage: 'es',
            });
        });
        it('cancels a running attempt and fences its late completion', async () => {
            const job = await enqueue(),
                claim = await store.claimNext(claimOptions, context());
            expect(claim).not.toBeNull();
            expect(await store.markDispatched(claim!.lease, context())).toBe(
                true,
            );
            expect((await store.cancel(owner, job.id, context())).state).toBe(
                'cancelled',
            );
            expect(
                await store.complete(
                    claim!.lease,
                    { language: 'en', confidence: 'high' },
                    undefined,
                    context(),
                ),
            ).toBe(false);
            expect(
                (await store.get(owner, job.id, context())).result,
            ).toBeNull();
        });
        it('quiesces a deletion-pending owner before provider dispatch', async () => {
            const job = await enqueue(),
                claim = await store.claimNext(claimOptions, context());
            await db
                .update(usersTable)
                .set({ status: 'deletion_pending' })
                .where(eq(usersTable.id, owner));
            expect(await store.markDispatched(claim!.lease, context())).toBe(
                false,
            );
            const [row] = await db
                .select()
                .from(jobs)
                .where(eq(jobs.id, job.id));
            expect(row?.failureCategory).toBe('access_revoked');
            expect(row?.inputPayload).toBeNull();
            const [reservation] = await db
                .select()
                .from(aiCreditReservationsTable)
                .where(eq(aiCreditReservationsTable.jobId, job.id));
            expect(reservation?.state).toBe('released');
        });
        it('rejects changed text versions at claim and scrubs stale source', async () => {
            const textId = randomUUID();
            await db.insert(textsTable).values({
                id: textId,
                ownerId: owner,
                folderId: folder,
                title: 'Draft',
                sourceLanguage: 'en',
                targetLanguage: 'es',
                sourceText: 'Hello.',
                createdAt: now,
                updatedAt: now,
            });
            const job = await store.enqueue(
                owner,
                'text-translation',
                {
                    folderId: folder,
                    textId,
                    expectedTextVersion: 1,
                    operationId: randomUUID(),
                    sourceText: 'Hello.',
                    sourceLanguage: 'en',
                    targetLanguage: 'es',
                },
                context(),
            );
            await db
                .update(textsTable)
                .set({ version: 2 })
                .where(eq(textsTable.id, textId));
            expect(await store.claimNext(claimOptions, context())).toBeNull();
            expect(
                (await store.get(owner, job.id, context())).failureCode,
            ).toBe('stale_content');
        });
        it('serializes concurrent claims and recovers an expired dispatch with a fenced retry', async () => {
            const job = await enqueue();
            const claims = await Promise.all([
                store.claimNext(claimOptions, context()),
                store.claimNext(
                    { ...claimOptions, workerId: 'other-worker' },
                    context(),
                ),
            ]);
            expect(claims.filter(Boolean)).toHaveLength(1);
            const first = claims.find((claim) => claim !== null)!;
            expect(await store.markDispatched(first.lease, context())).toBe(
                true,
            );
            now = new Date(now.getTime() + claimOptions.leaseMs + 1);
            const recovered = await store.claimNext(claimOptions, context());
            expect(recovered?.lease.attempt).toBe(2);
            expect(recovered?.lease.fencingToken).not.toBe(
                first.lease.fencingToken,
            );
            expect(recovered?.execution).toEqual(first.execution);
            expect(
                await store.complete(
                    first.lease,
                    { language: 'en', confidence: 'high' },
                    undefined,
                    context(),
                ),
            ).toBe(false);
            expect(
                await store.markDispatched(recovered!.lease, context()),
            ).toBe(true);
            expect(
                await store.complete(
                    recovered!.lease,
                    { language: 'en', confidence: 'high' },
                    { inputTokens: 100, outputTokens: 10 },
                    context(),
                ),
            ).toBe(true);
            const reservations = await db
                .select()
                .from(aiCreditReservationsTable)
                .where(eq(aiCreditReservationsTable.jobId, job.id));
            expect(reservations).toHaveLength(2);
            expect(
                reservations.map((reservation) => reservation.state),
            ).toEqual(['settled', 'settled']);
            expect(
                reservations.find((reservation) => reservation.attempt === 1)
                    ?.measurement,
            ).toBe('estimated');
            expect(
                reservations.find((reservation) => reservation.attempt === 2)
                    ?.measurement,
            ).toBe('provider_reported');
        });
        it('rechecks owner authority before publishing an already dispatched result', async () => {
            const job = await enqueue();
            const claim = await store.claimNext(claimOptions, context());
            await store.markDispatched(claim!.lease, context());
            await db
                .update(usersTable)
                .set({ status: 'deletion_pending' })
                .where(eq(usersTable.id, owner));
            expect(
                await store.complete(
                    claim!.lease,
                    { language: 'en', confidence: 'high' },
                    { inputTokens: 100, outputTokens: 10 },
                    context(),
                ),
            ).toBe(false);
            const [row] = await db
                .select()
                .from(jobs)
                .where(eq(jobs.id, job.id));
            expect(row?.failureCategory).toBe('access_revoked');
            expect(row?.resultPayload).toBeNull();
            const [reservation] = await db
                .select()
                .from(aiCreditReservationsTable)
                .where(eq(aiCreditReservationsTable.jobId, job.id));
            expect(reservation?.state).toBe('settled');
            expect(reservation?.measurement).toBe('provider_reported');
        });
        it('scrubs every expired terminal result across multiple bounded batches', async () => {
            for (let i = 0; i < 105; i++) {
                const job = await enqueue();
                const claim = await store.claimNext(claimOptions, context());
                expect(
                    await store.markDispatched(claim!.lease, context()),
                ).toBe(true);
                await store.complete(
                    claim!.lease,
                    { language: 'en', confidence: 'high' },
                    { inputTokens: 1, outputTokens: 1 },
                    context(),
                );
                expect(job.id).toBe(claim!.lease.jobId);
            }
            now = new Date(now.getTime() + 86400001);
            expect(await store.claimNext(claimOptions, context())).toBeNull();
            expect(
                await db
                    .select()
                    .from(jobs)
                    .where(
                        or(
                            isNotNull(jobs.inputPayload),
                            isNotNull(jobs.resultPayload),
                        ),
                    ),
            ).toHaveLength(5);
            await store.claimNext(claimOptions, context());
            expect(
                await db
                    .select()
                    .from(jobs)
                    .where(
                        or(
                            isNotNull(jobs.inputPayload),
                            isNotNull(jobs.resultPayload),
                        ),
                    ),
            ).toHaveLength(0);
            expect(await db.select().from(jobs)).toHaveLength(105);
        }, 120000);
    },
);
