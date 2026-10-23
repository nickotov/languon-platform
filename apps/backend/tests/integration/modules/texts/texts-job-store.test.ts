import {
    ActionAllowanceConfirmationRequired,
    withActionAllowanceConsent,
} from '../../../../src/modules/ai-credits/infrastructure/action-allowance-consent';
import { seedLegacyActionFixture } from '../../../support/legacy-action-fixture';
import {
    aiCreditActionsTable as actions,
    aiCreditActionAttemptsTable as actionAttempts,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { EnqueueTextTranslationRequestSchema } from '@languon/contracts';
import { createHmac, randomUUID, randomBytes } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { eq, isNotNull, or, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    textFoldersTable,
    textsTable,
} from '../../../../src/modules/texts/infrastructure/persistence/drizzle/schema';
import { textsAiJobsTable as jobs } from '../../../../src/modules/texts/infrastructure/persistence/drizzle/texts-job-schema';
import { DrizzleTextsJobStore } from '../../../../src/modules/texts/infrastructure/persistence/drizzle/drizzle-texts-job-store';
import { DrizzleTextContentStore } from '../../../../src/modules/texts/infrastructure/persistence/drizzle/drizzle-text-content-store';
import { createTextsCryptography } from '../../../../src/modules/texts/infrastructure/texts-composition';
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
                'text-detection:v2',
                'text-translation:v1',
                'text-translation:v2',
                'text-translation:v3',
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
            now = new Date();
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
            await seedLegacyActionFixture(db);
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
        // Existing scenarios model a learner explicitly accepting any reduced offer.
        // The dedicated quote case below separately proves the pre-consent rollback boundary.
        const enqueueWithConsent = async (
            ...args: Parameters<DrizzleTextsJobStore['enqueue']>
        ) => {
            try {
                return await store.enqueue(...args);
            } catch (error) {
                if (!(error instanceof ActionAllowanceConfirmationRequired))
                    throw error;
                return withActionAllowanceConsent(error.quote.id, () =>
                    store.enqueue(...args),
                );
            }
        };
        const enqueue = () =>
            enqueueWithConsent(
                owner,
                'text-detection',
                {
                    folderId: folder,
                    operationId: randomUUID(),
                    sourceText: 'Hello world.',
                },
                context(),
            );
        it('quotes paid translation before creating work and dispatches exactly the accepted allowance', async () => {
            const request = {
                folderId: folder,
                operationId: randomUUID(),
                sourceText: 'Hello world.',
                sourceLanguage: 'en',
                targetLanguage: 'es',
            };
            let offer: ActionAllowanceConfirmationRequired | undefined;
            try {
                await store.enqueue(
                    owner,
                    'text-translation',
                    request,
                    context(),
                );
            } catch (error) {
                offer = error as ActionAllowanceConfirmationRequired;
            }
            expect(offer).toBeInstanceOf(ActionAllowanceConfirmationRequired);
            expect(offer!.quote.approximateOutputTokens).toBeGreaterThan(0);
            expect(offer!.quote.approximateOutputTokens).toBeLessThan(10000);
            expect(await db.select().from(jobs)).toHaveLength(0);
            expect(await db.select().from(actions)).toHaveLength(0);
            expect(await db.select().from(actionAttempts)).toHaveLength(0);
            const admitted = await withActionAllowanceConsent(
                offer!.quote.id,
                () =>
                    store.enqueue(
                        owner,
                        'text-translation',
                        request,
                        context(),
                    ),
            );
            expect(admitted.billing).toMatchObject({
                state: 'held',
                heldCredits: offer!.quote.maximumCredits,
                chargedCredits: null,
            });
            const lease = await store.claimNext(claimOptions, context());
            expect(lease?.budget.maxOutputTokensPerAttempt).toBe(
                offer!.quote.approximateOutputTokens,
            );
            const [action] = await db
                .select()
                .from(actions)
                .where(eq(actions.id, admitted.id));
            expect(action?.outputLimit).toBe(
                offer!.quote.approximateOutputTokens,
            );
            await store.cancel(owner, admitted.id, context());
            await store.fail(
                lease!.lease,
                { code: 'aborted', retryAt: null },
                context(),
            );
            expect(
                (await store.get(owner, admitted.id, context())).billing,
            ).toMatchObject({ state: 'released', chargedCredits: '0' });
        });

        it('admits independent jobs only to workers advertising nullable-folder formats', async () => {
            const job = await enqueueWithConsent(
                owner,
                'text-detection',
                {
                    folderId: null,
                    operationId: randomUUID(),
                    sourceText: 'Independent.',
                },
                context(),
            );
            const [row] = await db
                .select()
                .from(jobs)
                .where(eq(jobs.id, job.id));
            expect(row?.folderId).toBeNull();
            expect(row?.format).toBe('text-detection:v2');
            expect(
                await store.claimNext(
                    {
                        ...claimOptions,
                        supportedFormats: [
                            'text-detection:v1',
                            'text-translation:v1',
                            'text-translation:v2',
                        ],
                    },
                    context(),
                ),
            ).toBeNull();
            expect(
                await store.claimNext(claimOptions, context()),
            ).not.toBeNull();
        });
        it('rejects independent admission when only legacy workers are ready', async () => {
            await db.update(dictionaryAiWorkerObservationsTable).set({
                textAiSupportedFormats: [
                    'text-detection:v1',
                    'text-translation:v1',
                    'text-translation:v2',
                    'text-selection-card:v1',
                ],
            });
            await expect(
                enqueueWithConsent(
                    owner,
                    'text-detection',
                    {
                        folderId: null,
                        operationId: randomUUID(),
                        sourceText: 'Independent.',
                    },
                    context(),
                ),
            ).rejects.toMatchObject({
                name: 'TextAiSelectionUnavailableError',
            });
        });
        it('blocks moves during AI work and unapplied proposals, and allows explicit discard', async () => {
            const contentStore = new DrizzleTextContentStore(
                db,
                { generate: randomUUID },
                { now: () => now },
                createTextsCryptography(
                    'synthetic-text-content-secret-at-least-32-bytes',
                    { randomBytes },
                ),
            );
            const draft = await contentStore.createText(owner, {
                folderId: folder,
                sourceText: 'Hello.',
                sourceLanguage: 'en',
                targetLanguage: 'es',
            });
            const job = await enqueueWithConsent(
                owner,
                'text-translation',
                {
                    folderId: folder,
                    textId: draft.id,
                    expectedTextVersion: draft.version,
                    operationId: randomUUID(),
                    sourceText: draft.sourceText,
                    sourceLanguage: 'en',
                    targetLanguage: 'es',
                },
                context(),
            );
            expect(
                await contentStore.pendingJob(owner, draft.id),
            ).toMatchObject({ id: job.id, state: 'queued' });
            await expect(
                contentStore.pendingJob(randomUUID(), draft.id),
            ).rejects.toMatchObject({ code: 'text_not_found' });
            await expect(
                contentStore.moveText(owner, draft.id, {
                    folderId: null,
                    expectedVersion: draft.version,
                }),
            ).rejects.toMatchObject({ code: 'text_busy' });
            const worker = new TextsWorkerService({
                ...claimOptions,
                store,
                provider: {
                    run: async (call) => ({
                        draft: {
                            translation:
                                call.input.kind === 'text-translation'
                                    ? call.input.segments.map((segment) => ({
                                          pairId: segment.pairId,
                                          text: 'Hola.',
                                      }))
                                    : [],
                        },
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
            expect(await store.get(owner, job.id, context())).toMatchObject({
                state: 'completed',
                billing: {
                    state: 'charged',
                    heldCredits: '20',
                    chargedCredits: '0.13',
                    measurement: 'measured',
                },
            });
            // A fresh repository (browser reload) recovers only the public proposal shape.
            const reloadedStore = new DrizzleTextContentStore(
                db,
                { generate: randomUUID },
                { now: () => now },
                createTextsCryptography(
                    'synthetic-text-content-secret-at-least-32-bytes',
                    { randomBytes },
                ),
            );
            const recovered = await reloadedStore.pendingJob(owner, draft.id);
            expect(recovered).toMatchObject({ id: job.id, state: 'completed' });
            expect(recovered).not.toHaveProperty('inputPayload');
            expect(recovered).not.toHaveProperty('selectedExecutionSnapshot');
            await expect(
                contentStore.moveText(owner, draft.id, {
                    folderId: null,
                    expectedVersion: draft.version,
                }),
            ).rejects.toMatchObject({ code: 'text_busy' });
            expect(
                (await store.cancel(owner, recovered!.id, context())).state,
            ).toBe('cancelled');
            expect(await reloadedStore.pendingJob(owner, draft.id)).toBeNull();
            expect(
                (
                    await contentStore.moveText(owner, draft.id, {
                        folderId: null,
                        expectedVersion: draft.version,
                    })
                ).folderId,
            ).toBeNull();
        });
        it('recovers stale active jobs for cancellation after another tab saves', async () => {
            const contentStore = new DrizzleTextContentStore(
                db,
                { generate: randomUUID },
                { now: () => now },
                createTextsCryptography(
                    'synthetic-text-content-secret-at-least-32-bytes',
                    { randomBytes },
                ),
            );
            const draft = await contentStore.createText(owner, {
                folderId: folder,
                sourceText: 'Hello.',
                sourceLanguage: 'en',
                targetLanguage: 'es',
            });
            await enqueueWithConsent(
                owner,
                'text-translation',
                {
                    folderId: folder,
                    textId: draft.id,
                    expectedTextVersion: draft.version,
                    operationId: randomUUID(),
                    sourceText: draft.sourceText,
                    sourceLanguage: 'en',
                    targetLanguage: 'es',
                },
                context(),
            );
            const saved = await contentStore.saveText(owner, draft.id, {
                kind: 'metadata',
                expectedVersion: draft.version,
                title: 'Changed in another tab',
            });
            const pending = await contentStore.pendingJob(owner, draft.id);
            expect(pending).toMatchObject({ state: 'queued' });
            await expect(
                contentStore.moveText(owner, draft.id, {
                    folderId: null,
                    expectedVersion: saved.version,
                }),
            ).rejects.toMatchObject({ code: 'text_busy' });
            await store.cancel(owner, pending!.id, context());
            expect(
                (
                    await contentStore.moveText(owner, draft.id, {
                        folderId: null,
                        expectedVersion: saved.version,
                    })
                ).folderId,
            ).toBeNull();
            expect(await store.claimNext(claimOptions, context())).toBeNull();
        });
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
            expect(row?.aiCreditAccounted).toBe(false);
            expect(row?.selectedExecutionSnapshot).toMatchObject({
                actionAccountingVersion: 1,
            });
            expect(row?.inputPayload).toBeNull();
            const [action] = await db
                .select()
                .from(actions)
                .where(eq(actions.id, job.id));
            expect(action).toMatchObject({
                state: 'settled',
                outcome: 'success',
                chargedMilli: 130n,
                heldMilli: 20000n,
            });
            expect(
                await db
                    .select()
                    .from(aiCreditReservationsTable)
                    .where(eq(aiCreditReservationsTable.jobId, job.id)),
            ).toHaveLength(0);
        });
        it('completes translation after PostgreSQL JSONB normalizes source segment key order', async () => {
            const job = await enqueueWithConsent(
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
            const [admittedRow] = await db
                .select()
                .from(jobs)
                .where(eq(jobs.id, job.id));
            expect(admittedRow?.format).toBe('text-translation:v2');
            expect(
                await store.claimNext(
                    {
                        ...claimOptions,
                        supportedFormats: [
                            'text-detection:v1',
                            'text-translation:v1',
                        ],
                    },
                    context(),
                ),
            ).toBeNull();
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
        it('preserves legacy translation replay and claims while rejecting unsupported kind formats', async () => {
            const request = {
                folderId: folder,
                operationId: randomUUID(),
                sourceText: 'Hello world.',
                sourceLanguage: 'en' as const,
                targetLanguage: 'es' as const,
            };
            const admitted = await enqueueWithConsent(
                owner,
                'text-translation',
                request,
                context(),
            );
            const [template] = await db
                .select()
                .from(jobs)
                .where(eq(jobs.id, admitted.id));
            expect(template).toBeDefined();
            await store.cancel(owner, admitted.id, context());
            const legacyRequest = { ...request, operationId: randomUUID() };
            const legacyId = randomUUID();
            const legacy = {
                ...template!,
                selectedExecutionSnapshot: Object.fromEntries(
                    Object.entries(template!.selectedExecutionSnapshot).filter(
                        ([key]) => !key.startsWith('action'),
                    ),
                ) as NonNullable<typeof template>['selectedExecutionSnapshot'],
                aiCreditAccounted: false,
                aiCreditInputCreditsPerMillionTokens: null,
                aiCreditOutputCreditsPerMillionTokens: null,
                aiCreditMaxCreditsPerAttempt: null,
                aiCreditPolicyMode: null,
                aiCreditPricingRevision: null,
                aiCreditProviderDispatchedAt: null,
                aiCreditReservationId: null,
                id: legacyId,
                operationId: legacyRequest.operationId,
                format: 'text-translation:v1',
                requestFingerprint: createHmac(
                    'sha256',
                    'synthetic-texts-jobs-secret',
                )
                    .update('texts-job:v1:')
                    .update(
                        JSON.stringify({
                            kind: 'text-translation',
                            request:
                                EnqueueTextTranslationRequestSchema.parse(
                                    legacyRequest,
                                ),
                        }),
                    )
                    .digest('hex'),
            };
            const insertFixture = (row: typeof jobs.$inferInsert) =>
                db.transaction(async (tx) => {
                    await tx.execute(
                        sql`select set_config('languon.texts_execution_revision','1',true),set_config('languon.texts_capacity_revision','1',true),set_config('languon.text_ai_selection_revision','1',true),set_config('languon.ai_credit_settlement_revision','1',true)`,
                    );
                    await tx.insert(jobs).values(row);
                });
            await insertFixture(legacy);
            const replay = await enqueueWithConsent(
                owner,
                'text-translation',
                legacyRequest,
                context(),
            );
            expect(replay.id).toBe(legacyId);
            const [replayedRow] = await db
                .select()
                .from(jobs)
                .where(eq(jobs.id, replay.id));
            expect(replayedRow?.format).toBe('text-translation:v1');
            const claimed = await store.claimNext(
                { ...claimOptions, supportedFormats: ['text-translation:v1'] },
                context(),
            );
            expect(claimed?.lease.jobId).toBe(legacyId);
            await expect(
                insertFixture({
                    ...legacy,
                    id: randomUUID(),
                    operationId: randomUUID(),
                    jobKind: 'text-detection',
                    format: 'text-detection:v999',
                }),
            ).rejects.toMatchObject({
                cause: {
                    code: '23514',
                    constraint_name: 'texts_ai_jobs_kind_format',
                },
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
            const [action] = await db
                .select()
                .from(actions)
                .where(eq(actions.id, job.id));
            expect(action).toMatchObject({
                state: 'settled',
                outcome: 'failure',
                chargedMilli: 0n,
            });
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
            const job = await enqueueWithConsent(
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
        it('serializes claims and absorbs an expired dispatched attempt without unsafe replay', async () => {
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
            expect(await store.claimNext(claimOptions, context())).toBeNull();
            const [action] = await db
                .select()
                .from(actions)
                .where(eq(actions.id, job.id));
            expect(action).toMatchObject({
                state: 'settled',
                outcome: 'failure',
                chargedMilli: 0n,
                measurement: 'unknown',
            });
            expect(
                await db
                    .select()
                    .from(actionAttempts)
                    .where(eq(actionAttempts.actionId, job.id)),
            ).toHaveLength(1);
            expect(
                await store.complete(
                    first.lease,
                    { language: 'en', confidence: 'high' },
                    { inputTokens: 100, outputTokens: 10 },
                    context(),
                ),
            ).toBe(false);
        });
        it('retains one action hold across one explicit safe rate-limit retry and charges only the valid result', async () => {
            const job = await enqueue();
            const first = await store.claimNext(claimOptions, context());
            expect(first?.budget.maxOutputTokensPerAttempt).toBeLessThanOrEqual(
                10000,
            );
            expect(first?.budget.maxInputTokensPerAttempt).toBeLessThan(
                first!.execution.perCallMaxInputTokens,
            );
            expect(await store.markDispatched(first!.lease, context())).toBe(
                true,
            );
            const retryAt = new Date(now.getTime() + 1000);
            await store.fail(
                first!.lease,
                {
                    code: 'provider_rate_limited',
                    retryAt,
                    usage: { inputTokens: 0, outputTokens: 0 },
                },
                context(),
            );
            const [held] = await db
                .select()
                .from(actions)
                .where(eq(actions.id, job.id));
            expect(held).toMatchObject({ state: 'active', heldMilli: 20000n });
            now = retryAt;
            const second = await store.claimNext(claimOptions, context());
            expect(second?.lease.attempt).toBe(2);
            expect(await store.markDispatched(second!.lease, context())).toBe(
                true,
            );
            expect(
                await store.complete(
                    second!.lease,
                    { language: 'en', confidence: 'high' },
                    { inputTokens: 100, outputTokens: 10 },
                    context(),
                ),
            ).toBe(true);
            const [action] = await db
                .select()
                .from(actions)
                .where(eq(actions.id, job.id));
            expect(action).toMatchObject({
                state: 'settled',
                outcome: 'success',
                chargedMilli: 130n,
            });
            expect(
                await db
                    .select()
                    .from(actionAttempts)
                    .where(eq(actionAttempts.actionId, job.id)),
            ).toHaveLength(2);
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
            const [action] = await db
                .select()
                .from(actions)
                .where(eq(actions.id, job.id));
            expect(action).toMatchObject({
                state: 'settled',
                outcome: 'failure',
                chargedMilli: 0n,
            });
        });
        it('scrubs every expired terminal result across multiple bounded batches', async () => {
            for (let i = 0; i < 105; i++) {
                // Each worker lease must start from the current real clock.
                now = new Date();
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
